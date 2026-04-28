// Modal de envío de shortlist al cliente.
// Renderiza via createPortal a document.body para escapar del stacking context
// del feed (sidebar, banners, etc.). Estilos inline para evitar conflictos con
// CSS scoped del padre y garantizar que se vea siempre encima.

import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Broker } from '@/lib/simon-brokers'
import type { BrokerShortlist } from '@/types/broker-shortlist'
import { defaultShortlistMessage } from '@/lib/whatsapp'

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '')
}

/**
 * Normaliza un teléfono al formato E.164 que WhatsApp acepta.
 * Acepta varios formatos de entrada que el broker puede tipear sin pensar:
 *   "70123456"        → "+59170123456"   (celu BO de 8 dígitos arrancando con 6/7)
 *   "59170123456"     → "+59170123456"   (con 591 pero sin +)
 *   "+591 70123456"   → "+59170123456"   (ya internacional, limpia espacios)
 *   "+54 9 11 12345678" → "+5491112345678" (otro país, respeta código)
 * Rechaza:
 *   "12345"           (muy corto)
 *   "40123456"        (no es formato BO válido)
 */
export function normalizeClientPhone(raw: string): { ok: true; e164: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'Falta el teléfono' }

  // Ya viene internacional (+XX...)
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length < 10) return { ok: false, error: 'Teléfono internacional muy corto (mínimo 10 dígitos)' }
    if (digits.length > 15) return { ok: false, error: 'Teléfono demasiado largo' }
    return { ok: true, e164: `+${digits}` }
  }

  // Sin + → inferir. Solo dígitos.
  const digits = trimmed.replace(/\D/g, '')

  // 591 + 8 dígitos sin + (ej "59170123456")
  if (digits.length === 11 && digits.startsWith('591')) {
    return { ok: true, e164: `+${digits}` }
  }

  // 8 dígitos arrancando con 6 o 7 → celu boliviano, auto-prefijar +591
  if (digits.length === 8 && /^[67]/.test(digits)) {
    return { ok: true, e164: `+591${digits}` }
  }

  return { ok: false, error: 'Formato inválido. Usá "+591 70123456" o "70123456"' }
}

const TEMPLATE_PLACEHOLDER_URL = '__SHORTLIST_URL__'

interface Props {
  isOpen: boolean
  onClose: () => void
  broker: Broker
  cantidadPropiedades: number
  existingShortlists?: BrokerShortlist[]
  onConfirm: (data: { cliente_nombre: string; cliente_telefono: string; mensaje_whatsapp?: string }) => Promise<{ whatsappUrl: string }>
  /**
   * Modo demo: si está provista, se invoca al apretar "Enviar" en lugar de
   * ejecutar el flujo normal (no abre window de WA, no llama onConfirm). El
   * caller (ventas/alquileres en /broker/demo) usa esto para mostrar modal
   * educativo en vez de persistir una shortlist.
   */
  onDemoBlock?: () => void
}

const S: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 2147483000,
    background: 'rgba(8, 8, 8, 0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    fontFamily: "'DM Sans', sans-serif",
  },
  modal: {
    background: '#EDE8DC',
    color: '#141414',
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    maxHeight: '92vh',
    overflowY: 'auto',
    padding: '20px 24px 24px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    position: 'relative',
    zIndex: 2147483001,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 600, margin: 0, fontFamily: "'Figtree', sans-serif" },
  closeBtn: { background: 'transparent', border: 'none', fontSize: 28, lineHeight: 1, cursor: 'pointer', color: '#141414', padding: '0 4px' },
  summary: { fontSize: 13, color: '#5a5a5a', marginBottom: 18 },
  field: { marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#3A6A48' },
  input: {
    width: '100%', padding: '10px 12px',
    background: '#fff', border: '1px solid rgba(20,20,20,0.15)',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#141414',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', padding: '10px 12px',
    background: '#fff', border: '1px solid rgba(20,20,20,0.15)',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#141414',
    resize: 'vertical', minHeight: 100, lineHeight: 1.4, boxSizing: 'border-box',
  },
  help: { fontSize: 11, color: '#7a7a7a' },
  error: {
    background: 'rgba(220, 38, 38, 0.1)', color: '#b91c1c',
    padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 4,
  },
  footer: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 },
  btnBase: { padding: '10px 18px', borderRadius: 8, border: '1px solid transparent', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: '#141414', borderColor: 'rgba(20,20,20,0.2)' },
  btnPrimary: { background: '#3A6A48', color: '#EDE8DC' },
}

export default function ShortlistSendModal({ isOpen, onClose, broker, cantidadPropiedades, existingShortlists = [], onConfirm, onDemoBlock }: Props) {
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [mensajeEditedManually, setMensajeEditedManually] = useState(false)

  const previewMessage = useMemo(() => {
    if (!clienteNombre.trim()) return ''
    return defaultShortlistMessage({
      clienteNombre: clienteNombre.trim(),
      brokerNombre: broker.nombre,
      shortlistUrl: TEMPLATE_PLACEHOLDER_URL,
      cantidadPropiedades,
    })
  }, [clienteNombre, broker.nombre, cantidadPropiedades])

  // Detectar si el teléfono ingresado ya tiene shortlists previas con este broker.
  const existingClientMatches = useMemo(() => {
    const normalized = normalizePhone(clienteTelefono)
    if (normalized.length < 6) return []
    return existingShortlists.filter(s => normalizePhone(s.cliente_telefono) === normalized)
  }, [clienteTelefono, existingShortlists])

  useEffect(() => {
    if (isOpen) {
      // En modo demo (onDemoBlock provisto) pre-llenamos con datos ficticios
      // para que el broker prospect no tenga que inventarlos. Los campos
      // siguen editables — el banner arriba aclara que es solo para ver
      // el ejemplo, no se envía nada.
      if (onDemoBlock) {
        setClienteNombre('Cliente Demo')
        setClienteTelefono('+591 70000000')
      } else {
        setClienteNombre('')
        setClienteTelefono('')
      }
      setMensaje('')
      setMensajeEditedManually(false)
      setErrorMsg(null)
      // Bloquear scroll del body mientras está abierto
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [isOpen, onDemoBlock])

  useEffect(() => {
    if (!mensajeEditedManually) {
      setMensaje(previewMessage)
    }
  }, [previewMessage, mensajeEditedManually])

  if (!isOpen || typeof document === 'undefined') return null

  async function handleSubmit() {
    setErrorMsg(null)
    if (!clienteNombre.trim()) return setErrorMsg('Falta el nombre del cliente')

    const phoneResult = normalizeClientPhone(clienteTelefono)
    if (!phoneResult.ok) return setErrorMsg(phoneResult.error)

    // Modo demo: corto antes de abrir waWindow para evitar pestaña en blanco.
    // El caller maneja el modal educativo y cierra este modal.
    if (onDemoBlock) {
      onDemoBlock()
      onClose()
      return
    }

    // Abrir el window ANTES del await preserva el user gesture en mobile
    // (Safari/Chrome iOS bloquean window.open post-await aunque el origen sea el click).
    // Después del fetch le asignamos la URL real; si el fetch falla, cerramos el blank.
    const waWindow = window.open('', '_blank')

    setSubmitting(true)
    try {
      const finalMessage = mensajeEditedManually
        ? mensaje.replaceAll(TEMPLATE_PLACEHOLDER_URL, '').trim()
        : undefined

      const { whatsappUrl } = await onConfirm({
        cliente_nombre: clienteNombre.trim(),
        cliente_telefono: phoneResult.e164,
        mensaje_whatsapp: finalMessage,
      })

      if (waWindow && !waWindow.closed) {
        waWindow.location.href = whatsappUrl
      } else {
        // Browser bloqueó incluso el about:blank → fallback navegando la misma pestaña
        window.location.href = whatsappUrl
      }
      onClose()
    } catch (err) {
      if (waWindow && !waWindow.closed) waWindow.close()
      setErrorMsg(err instanceof Error ? err.message : 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div style={S.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <header style={S.header}>
          <h2 style={S.title}>Enviar shortlist al cliente</h2>
          <button style={S.closeBtn} onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        <div style={S.summary}>
          <strong>{cantidadPropiedades}</strong> {cantidadPropiedades === 1 ? 'propiedad' : 'propiedades'} seleccionada{cantidadPropiedades === 1 ? '' : 's'}
        </div>

        {onDemoBlock && (
          <div style={{
            background: 'rgba(58,106,72,0.10)',
            border: '1px solid rgba(58,106,72,0.32)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.5,
            color: '#2e5439',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>🎯</span>
            <span>
              <strong>Modo Demo</strong> · Los campos vienen con datos de ejemplo (editables). No se envía ningún WhatsApp — al darle <em>Ver el ejemplo</em> te abrimos cómo recibiría tu cliente la shortlist.
            </span>
          </div>
        )}

        <div style={S.field}>
          <label style={S.label}>Nombre del cliente</label>
          <input
            style={S.input}
            value={clienteNombre}
            onChange={e => setClienteNombre(e.target.value)}
            placeholder="Juan Pérez"
            autoFocus
          />
        </div>

        <div style={S.field}>
          <label style={S.label}>WhatsApp del cliente</label>
          <input
            style={S.input}
            value={clienteTelefono}
            onChange={e => setClienteTelefono(e.target.value)}
            placeholder="+591 70123456  (o solo 70123456)"
            inputMode="tel"
          />
          {(() => {
            if (!clienteTelefono.trim()) {
              return <span style={S.help}>Podés tipear solo 70123456 — agregamos +591 automáticamente. O internacional con +código.</span>
            }
            const result = normalizeClientPhone(clienteTelefono)
            if (result.ok) {
              return <span style={{ ...S.help, color: '#3A6A48', fontWeight: 600 }}>✓ WhatsApp abrirá a: {result.e164}</span>
            }
            return <span style={{ ...S.help, color: '#b91c1c' }}>{result.error}</span>
          })()}
          {existingClientMatches.length > 0 && (
            <div style={{
              marginTop: 8, padding: '10px 12px',
              background: '#fff8e6', border: '1px solid rgba(217,119,6,0.35)',
              borderRadius: 8, fontSize: 12, color: '#6a4b00', lineHeight: 1.4,
            }}>
              <strong>Cliente existente</strong> — ya armaste {existingClientMatches.length} shortlist{existingClientMatches.length === 1 ? '' : 's'} a este teléfono
              {existingClientMatches[0].cliente_nombre && ` (${existingClientMatches[0].cliente_nombre})`}.
              Esta va a crear otra separada — si querés actualizar la anterior, cerrá esto y editala desde &quot;Mis shortlists&quot;.
            </div>
          )}
        </div>

        <div style={S.field}>
          <label style={S.label}>Mensaje (editable)</label>
          <textarea
            style={S.textarea}
            value={mensaje}
            onChange={e => { setMensaje(e.target.value); setMensajeEditedManually(true) }}
            rows={6}
            placeholder="El mensaje aparecerá acá cuando completes el nombre…"
          />
          <span style={S.help}>El link a la shortlist se agrega automáticamente al enviar.</span>
        </div>

        {errorMsg && <div style={S.error}>{errorMsg}</div>}

        <footer style={S.footer}>
          <button style={{ ...S.btnBase, ...S.btnGhost }} onClick={onClose} disabled={submitting}>Cancelar</button>
          <button style={{ ...S.btnBase, ...S.btnPrimary, opacity: submitting ? 0.6 : 1 }} onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Enviando…' : (onDemoBlock ? 'Ver el ejemplo →' : 'Enviar por WhatsApp')}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
