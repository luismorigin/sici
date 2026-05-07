// Modal de envío de shortlist al cliente.
// Renderiza via createPortal a document.body para escapar del stacking context
// del feed (sidebar, banners, etc.). Estilos inline para evitar conflictos con
// CSS scoped del padre y garantizar que se vea siempre encima.
//
// Flujo de 2 pasos (opción B, migración 239):
//  - Paso 1 (opcional): Personalizar — comentario + ⭐ destacada por propiedad
//  - Paso 2: Datos del cliente (nombre, teléfono, mensaje WA)
// Si el caller NO pasa `propiedades`, arranca directo en paso 2 (back-compat).

import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Broker } from '@/lib/simon-brokers'
import type { BrokerShortlist } from '@/types/broker-shortlist'
import { defaultShortlistMessageBody } from '@/lib/whatsapp'

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

// Nota: la URL ya NO va dentro del textarea editable. Se muestra en un bloque
// inmutable debajo del textarea (ver renderLinkBlock). El helper
// buildShortlistWAMessage anexa la URL real al mensaje al enviar.

/**
 * Datos mínimos por propiedad para mostrar en el paso "Personalizar".
 * El caller (ventas.tsx / alquileres.tsx) los arma desde sus props seleccionadas.
 */
export interface PropiedadPreview {
  id: number
  nombre: string
  foto: string | null
  zona: string | null
  precio_label: string  // ej "$us 98.060" o "Bs 5.500/mes" — ya formateado por el caller
}

export interface ItemMetadata {
  propiedad_id: number
  comentario_broker?: string | null
  is_destacada?: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  broker: Broker
  cantidadPropiedades: number
  /**
   * Propiedades seleccionadas para mostrar en paso 1 (personalizar comentario
   * y destacada). Si no se pasa o viene vacío, el modal arranca directamente
   * en paso 2 (datos cliente) — back-compat con el flujo previo.
   */
  propiedades?: PropiedadPreview[]
  existingShortlists?: BrokerShortlist[]
  /**
   * Callback al confirmar. Recibe los datos del cliente Y opcionalmente
   * los metadata por item (comentario + destacada). El caller los pasa a
   * `createAndSend({...data, items_metadata})`.
   */
  onConfirm: (data: {
    cliente_nombre: string
    cliente_telefono: string
    mensaje_whatsapp?: string
    items_metadata?: ItemMetadata[]
  }) => Promise<{ whatsappUrl: string }>
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
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    position: 'relative',
    zIndex: 2147483001,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '20px 24px 12px',
    borderBottom: '1px solid rgba(20,20,20,0.08)',
    flexShrink: 0,
  },
  modalBody: {
    padding: '16px 24px',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  },
  modalFooter: {
    padding: '14px 24px 18px',
    borderTop: '1px solid rgba(20,20,20,0.08)',
    background: '#EDE8DC',
    flexShrink: 0,
    display: 'flex',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 600, margin: 0, fontFamily: "'Figtree', sans-serif" },
  closeBtn: { background: 'transparent', border: 'none', fontSize: 28, lineHeight: 1, cursor: 'pointer', color: '#141414', padding: '0 4px' },
  summary: { fontSize: 13, color: '#5a5a5a', marginTop: 4 },
  stepper: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: '#7a7a7a', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 },
  stepperDot: { width: 6, height: 6, borderRadius: '50%', background: 'rgba(20,20,20,0.2)' },
  stepperDotActive: { background: '#3A6A48' },
  stepperLine: { flex: '0 0 16px', height: 1, background: 'rgba(20,20,20,0.15)' },
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
    borderRadius: '8px 8px 0 0', fontSize: 14, fontFamily: 'inherit', color: '#141414',
    resize: 'vertical', minHeight: 100, lineHeight: 1.4, boxSizing: 'border-box',
    borderBottom: 'none',
  },
  // Bloque inmutable que se "pega" debajo del textarea para representar
  // visualmente el link de la shortlist. NO es editable. La URL real se
  // anexa al mensaje server-side via buildShortlistWAMessage.
  linkBlock: {
    width: '100%', padding: '10px 12px',
    background: '#e5dec8',
    border: '1px solid rgba(20,20,20,0.15)',
    borderRadius: '0 0 8px 8px',
    fontSize: 12, color: '#5a5a5a',
    boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', gap: 8,
    cursor: 'not-allowed',
    userSelect: 'none',
  },
  linkBlockIcon: { fontSize: 14, opacity: 0.7, flexShrink: 0 },
  linkBlockText: { lineHeight: 1.4 },
  help: { fontSize: 11, color: '#7a7a7a' },
  error: {
    background: 'rgba(220, 38, 38, 0.1)', color: '#b91c1c',
    padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 4,
  },
  btnBase: { padding: '10px 18px', borderRadius: 8, border: '1px solid transparent', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: '#141414', borderColor: 'rgba(20,20,20,0.2)' },
  btnPrimary: { background: '#3A6A48', color: '#EDE8DC' },
  btnLink: { background: 'transparent', border: 'none', color: '#3A6A48', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, padding: '6px 0' },

  // Paso 1: lista de propiedades
  itemList: { display: 'flex', flexDirection: 'column', gap: 12 },
  itemCard: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: 12, borderRadius: 10,
    background: '#fff', border: '1px solid rgba(20,20,20,0.08)',
  },
  itemCardDestacada: {
    background: '#fff8e1', border: '1px solid #d4a82e', boxShadow: '0 2px 8px rgba(212,168,46,0.15)',
  },
  itemTop: { display: 'flex', gap: 10, alignItems: 'center' },
  itemThumb: { width: 56, height: 56, borderRadius: 8, objectFit: 'cover' as const, flexShrink: 0, background: '#d8d0bc' },
  itemThumbPh: { width: 56, height: 56, borderRadius: 8, flexShrink: 0, background: '#d8d0bc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#6a6a6a', fontWeight: 600 },
  itemMeta: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  itemName: { fontSize: 14, fontWeight: 600, fontFamily: "'Figtree', sans-serif", color: '#141414', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemSub: { fontSize: 12, color: '#5a5a5a' },
  itemPrice: { fontSize: 12, color: '#3A6A48', fontWeight: 600 },
  destacadaToggle: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#5a5a5a', cursor: 'pointer', userSelect: 'none' },
  destacadaToggleActive: { color: '#8a6d1a', fontWeight: 600 },
  itemTextarea: {
    width: '100%', padding: '8px 10px',
    background: '#fff', border: '1px solid rgba(20,20,20,0.12)',
    borderRadius: 6, fontSize: 13, fontFamily: 'inherit', color: '#141414',
    resize: 'vertical', minHeight: 56, lineHeight: 1.4, boxSizing: 'border-box',
  },
}

export default function ShortlistSendModal({ isOpen, onClose, broker, cantidadPropiedades, propiedades = [], existingShortlists = [], onConfirm, onDemoBlock }: Props) {
  // Step 1 = personalizar (solo si propiedades.length > 0). Step 2 = datos cliente.
  const hasStep1 = propiedades.length > 0
  const [step, setStep] = useState<1 | 2>(hasStep1 ? 1 : 2)

  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [mensajeEditedManually, setMensajeEditedManually] = useState(false)

  // Metadata por item: comentario + destacada. Indexado por propiedad_id.
  // Default: '' / false. Solo se incluyen entries con datos no-default
  // al confirmar (para no inflar el payload).
  const [itemsState, setItemsState] = useState<Record<number, { comentario: string; destacada: boolean }>>({})

  const previewMessage = useMemo(() => {
    if (!clienteNombre.trim()) return ''
    return defaultShortlistMessageBody({
      clienteNombre: clienteNombre.trim(),
      brokerNombre: broker.nombre,
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
      setItemsState({})
      setStep(hasStep1 ? 1 : 2)
      // Bloquear scroll del body mientras está abierto
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [isOpen, onDemoBlock, hasStep1])

  useEffect(() => {
    if (!mensajeEditedManually) {
      setMensaje(previewMessage)
    }
  }, [previewMessage, mensajeEditedManually])

  if (!isOpen || typeof document === 'undefined') return null

  function setComentario(propiedadId: number, value: string) {
    setItemsState(prev => ({
      ...prev,
      [propiedadId]: {
        comentario: value,
        destacada: prev[propiedadId]?.destacada ?? false,
      },
    }))
  }

  function toggleDestacada(propiedadId: number) {
    setItemsState(prev => {
      const wasDestacada = prev[propiedadId]?.destacada === true
      const next: Record<number, { comentario: string; destacada: boolean }> = {}
      // Si ya estaba destacada → desmarcar. Si no → marcar y desmarcar todas las demás.
      for (const [idStr, st] of Object.entries(prev)) {
        const pid = Number(idStr)
        next[pid] = {
          comentario: st.comentario,
          destacada: pid === propiedadId ? !wasDestacada : false,
        }
      }
      // Si el item target no estaba en el state aún, agregarlo
      if (!(propiedadId in next)) {
        next[propiedadId] = { comentario: '', destacada: !wasDestacada }
      }
      return next
    })
  }

  function buildItemsMetadata(): ItemMetadata[] | undefined {
    const entries = Object.entries(itemsState)
      .map(([idStr, st]) => ({
        propiedad_id: Number(idStr),
        comentario_broker: st.comentario.trim() || null,
        is_destacada: st.destacada,
      }))
      .filter(it => it.comentario_broker !== null || it.is_destacada === true)
    return entries.length > 0 ? entries : undefined
  }

  async function handleSubmit() {
    setErrorMsg(null)
    if (!clienteNombre.trim()) { setStep(2); return setErrorMsg('Falta el nombre del cliente') }

    const phoneResult = normalizeClientPhone(clienteTelefono)
    if (!phoneResult.ok) { setStep(2); return setErrorMsg(phoneResult.error) }

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
      // Si el broker editó el textarea, mandamos su versión (sin URL — el
      // link vive en el bloque inmutable y se anexa server-side via
      // buildShortlistWAMessage). Si no tocó nada, mandamos undefined para
      // que el helper genere el default completo.
      const finalMessage = mensajeEditedManually ? mensaje.trim() : undefined

      const { whatsappUrl } = await onConfirm({
        cliente_nombre: clienteNombre.trim(),
        cliente_telefono: phoneResult.e164,
        mensaje_whatsapp: finalMessage,
        items_metadata: buildItemsMetadata(),
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

  // === Render: header con stepper + body por step + footer ===

  const renderStepper = hasStep1 ? (
    <div style={S.stepper} aria-hidden>
      <span style={{ ...S.stepperDot, ...(step === 1 ? S.stepperDotActive : {}) }} />
      <span style={{ color: step === 1 ? '#3A6A48' : '#7a7a7a' }}>1 — Personalizar (opcional)</span>
      <span style={S.stepperLine} />
      <span style={{ ...S.stepperDot, ...(step === 2 ? S.stepperDotActive : {}) }} />
      <span style={{ color: step === 2 ? '#3A6A48' : '#7a7a7a' }}>2 — Cliente</span>
    </div>
  ) : null

  return createPortal(
    <div style={S.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <header style={S.modalHeader}>
          <div style={S.header}>
            <h2 style={S.title}>Enviar shortlist al cliente</h2>
            <button style={S.closeBtn} onClick={onClose} aria-label="Cerrar">×</button>
          </div>
          <div style={S.summary}>
            <strong>{cantidadPropiedades}</strong> {cantidadPropiedades === 1 ? 'propiedad' : 'propiedades'} seleccionada{cantidadPropiedades === 1 ? '' : 's'}
          </div>
          {renderStepper}
        </header>

        <div style={S.modalBody}>
          {onDemoBlock && step === 2 && (
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

          {step === 1 && hasStep1 && (
            <>
              <p style={{ fontSize: 13, color: '#5a5a5a', margin: '0 0 14px', lineHeight: 1.5 }}>
                Agregale un comentario o marcá la <strong>recomendada</strong> (máx 1) para guiar a tu cliente. Es opcional — si saltás, podés editar después.
              </p>
              <div style={S.itemList}>
                {propiedades.map(p => {
                  const st = itemsState[p.id] || { comentario: '', destacada: false }
                  return (
                    <div key={p.id} style={st.destacada ? { ...S.itemCard, ...S.itemCardDestacada } : S.itemCard}>
                      <div style={S.itemTop}>
                        {p.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.foto} alt={p.nombre} style={S.itemThumb} />
                        ) : (
                          <div style={S.itemThumbPh}>#{p.id}</div>
                        )}
                        <div style={S.itemMeta}>
                          <div style={S.itemName} title={p.nombre}>{p.nombre}</div>
                          {p.zona && <div style={S.itemSub}>{p.zona}</div>}
                          <div style={S.itemPrice}>{p.precio_label}</div>
                        </div>
                        <label style={st.destacada ? { ...S.destacadaToggle, ...S.destacadaToggleActive } : S.destacadaToggle}>
                          <input
                            type="checkbox"
                            checked={st.destacada}
                            onChange={() => toggleDestacada(p.id)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>⭐ Recomendada</span>
                        </label>
                      </div>
                      <textarea
                        placeholder="Comentario para el cliente (opcional)"
                        value={st.comentario}
                        onChange={e => setComentario(p.id, e.target.value)}
                        rows={2}
                        style={S.itemTextarea}
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={S.field}>
                <label style={S.label}>Nombre del cliente</label>
                <input
                  style={S.input}
                  value={clienteNombre}
                  onChange={e => { setClienteNombre(e.target.value); if (errorMsg) setErrorMsg(null) }}
                  placeholder="Juan Pérez"
                  autoFocus
                />
              </div>

              <div style={S.field}>
                <label style={S.label}>WhatsApp del cliente</label>
                <input
                  style={S.input}
                  value={clienteTelefono}
                  onChange={e => { setClienteTelefono(e.target.value); if (errorMsg) setErrorMsg(null) }}
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
                <div style={S.linkBlock} aria-label="Link de la shortlist (no editable)">
                  <span style={S.linkBlockIcon} aria-hidden="true">🔗</span>
                  <span style={S.linkBlockText}>
                    El link a tu shortlist se agrega automáticamente al final del mensaje. No se puede editar desde acá.
                  </span>
                </div>
              </div>

              {errorMsg && <div style={S.error}>{errorMsg}</div>}
            </>
          )}
        </div>

        <footer style={S.modalFooter}>
          {step === 1 ? (
            <>
              <button style={{ ...S.btnBase, ...S.btnGhost }} onClick={onClose}>
                Cancelar
              </button>
              <button style={{ ...S.btnBase, ...S.btnPrimary }} onClick={() => setStep(2)}>
                Continuar →
              </button>
            </>
          ) : (
            <>
              {hasStep1 ? (
                <button style={{ ...S.btnBase, ...S.btnGhost }} onClick={() => setStep(1)} disabled={submitting}>
                  ← Atrás
                </button>
              ) : (
                <button style={{ ...S.btnBase, ...S.btnGhost }} onClick={onClose} disabled={submitting}>
                  Cancelar
                </button>
              )}
              <button style={{ ...S.btnBase, ...S.btnPrimary, opacity: submitting ? 0.6 : 1 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Enviando…' : (onDemoBlock ? 'Ver el ejemplo →' : 'Enviar por WhatsApp')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body
  )
}
