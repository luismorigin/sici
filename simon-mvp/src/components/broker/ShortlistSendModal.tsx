// Modal de envío de shortlist al cliente.
// Renderiza via createPortal a document.body para escapar del stacking context
// del feed (sidebar, banners, etc.). Estilos inline para evitar conflictos con
// CSS scoped del padre y garantizar que se vea siempre encima.

import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Broker } from '@/lib/simon-brokers'
import { defaultShortlistMessage } from '@/lib/whatsapp'

const TEMPLATE_PLACEHOLDER_URL = '__SHORTLIST_URL__'

interface Props {
  isOpen: boolean
  onClose: () => void
  broker: Broker
  cantidadPropiedades: number
  onConfirm: (data: { cliente_nombre: string; cliente_telefono: string; mensaje_whatsapp?: string }) => Promise<{ whatsappUrl: string }>
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

export default function ShortlistSendModal({ isOpen, onClose, broker, cantidadPropiedades, onConfirm }: Props) {
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

  useEffect(() => {
    if (isOpen) {
      setClienteNombre('')
      setClienteTelefono('')
      setMensaje('')
      setMensajeEditedManually(false)
      setErrorMsg(null)
      // Bloquear scroll del body mientras está abierto
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [isOpen])

  useEffect(() => {
    if (!mensajeEditedManually) {
      setMensaje(previewMessage)
    }
  }, [previewMessage, mensajeEditedManually])

  if (!isOpen || typeof document === 'undefined') return null

  async function handleSubmit() {
    setErrorMsg(null)
    if (!clienteNombre.trim()) return setErrorMsg('Falta el nombre del cliente')
    if (!clienteTelefono.trim()) return setErrorMsg('Falta el teléfono')
    if (clienteTelefono.replace(/\D/g, '').length < 8) return setErrorMsg('Teléfono inválido (min 8 dígitos con código de país)')

    setSubmitting(true)
    try {
      const finalMessage = mensajeEditedManually
        ? mensaje.replaceAll(TEMPLATE_PLACEHOLDER_URL, '').trim()
        : undefined

      const { whatsappUrl } = await onConfirm({
        cliente_nombre: clienteNombre.trim(),
        cliente_telefono: clienteTelefono.trim(),
        mensaje_whatsapp: finalMessage,
      })

      window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
      onClose()
    } catch (err) {
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
            placeholder="+591 70123456"
            inputMode="tel"
          />
          <span style={S.help}>Incluí el código de país (Bolivia: +591)</span>
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
            {submitting ? 'Enviando…' : 'Enviar por WhatsApp'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
