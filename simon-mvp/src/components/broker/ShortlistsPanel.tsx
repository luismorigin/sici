// Panel "Mis shortlists enviadas" — overlay que se abre desde el header del broker
// en /broker/[slug]. Renderiza via createPortal con styles inline para evitar
// conflictos de stacking con el feed.

import { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { Broker } from '@/lib/simon-brokers'
import type { BrokerShortlist } from '@/types/broker-shortlist'
import { publicShortlistURL } from '@/lib/broker-shortlists'
import { buildWhatsAppURL, defaultShortlistMessage } from '@/lib/whatsapp'

interface Props {
  isOpen: boolean
  onClose: () => void
  broker: Broker
  shortlists: BrokerShortlist[]
  loading: boolean
  onArchive: (id: string) => Promise<void>
  onRefresh: () => Promise<void>
}

const S: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 2147482999,
    background: 'rgba(8,8,8,0.85)',
    display: 'flex', justifyContent: 'flex-end',
    fontFamily: "'DM Sans', sans-serif",
  },
  panel: {
    background: '#EDE8DC', color: '#141414',
    width: '100%', maxWidth: 520,
    height: '100%', overflowY: 'auto',
    padding: '20px 24px',
    boxShadow: '-10px 0 40px rgba(0,0,0,0.4)',
    position: 'relative',
    zIndex: 2147483000,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 600, margin: 0, fontFamily: "'Figtree', sans-serif" },
  closeBtn: { background: 'transparent', border: 'none', fontSize: 28, cursor: 'pointer', color: '#141414' },
  empty: { padding: '40px 20px', textAlign: 'center', color: '#5a5a5a', fontSize: 14, lineHeight: 1.6 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    background: '#fff', padding: 14,
    borderRadius: 10, border: '1px solid rgba(20,20,20,0.08)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  itemMain: { display: 'flex', flexDirection: 'column', gap: 2 },
  itemName: { fontWeight: 600, fontSize: 14 },
  itemMeta: { fontSize: 12, color: '#6a6a6a' },
  itemViews: { color: '#3A6A48', fontWeight: 500 },
  itemActions: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  btnBase: {
    padding: '6px 10px', borderRadius: 6, fontSize: 12,
    fontWeight: 600, cursor: 'pointer', border: '1px solid transparent',
    fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block',
    lineHeight: 1.2,
  },
  btnGhost: { background: 'transparent', color: '#141414', borderColor: 'rgba(20,20,20,0.18)' },
  btnPrimary: { background: '#3A6A48', color: '#EDE8DC' },
  btnTrash: { background: 'transparent', color: '#b91c1c', borderColor: 'rgba(185,28,28,0.3)' },
}

export default function ShortlistsPanel({ isOpen, onClose, broker, shortlists, loading, onArchive }: Props) {
  if (!isOpen || typeof document === 'undefined') return null

  async function handleCopyLink(hash: string) {
    const url = publicShortlistURL(hash)
    try {
      await navigator.clipboard.writeText(url)
      const t = document.createElement('div')
      t.textContent = 'Link copiado'
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#141414;color:#EDE8DC;padding:10px 16px;border-radius:8px;z-index:2147483647;font-family:DM Sans;font-size:13px'
      document.body.appendChild(t)
      setTimeout(() => t.remove(), 2000)
    } catch {
      window.prompt('Copiá el link manualmente:', url)
    }
  }

  function handleResend(s: BrokerShortlist) {
    const url = publicShortlistURL(s.hash)
    const message = s.mensaje_whatsapp || defaultShortlistMessage({
      clienteNombre: s.cliente_nombre,
      brokerNombre: broker.nombre,
      shortlistUrl: url,
      cantidadPropiedades: 0,
    })
    const wa = buildWhatsAppURL(s.cliente_telefono, message)
    window.open(wa, '_blank', 'noopener,noreferrer')
  }

  async function handleArchive(s: BrokerShortlist) {
    if (!confirm(`¿Archivar la shortlist de ${s.cliente_nombre}?\n\nEl link compartido va a dejar de servir.`)) return
    await onArchive(s.id)
  }

  return createPortal(
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={e => e.stopPropagation()}>
        <header style={S.header}>
          <h2 style={S.title}>Mis shortlists enviadas</h2>
          <button style={S.closeBtn} onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        {loading && shortlists.length === 0 && <div style={S.empty}>Cargando…</div>}

        {!loading && shortlists.length === 0 && (
          <div style={S.empty}>
            Todavía no enviaste ninguna shortlist.<br />
            Marcá propiedades con la estrella verde y tocá <strong>Enviar shortlist</strong>.
          </div>
        )}

        <ul style={S.list}>
          {shortlists.map(s => (
            <li key={s.id} style={S.item}>
              <div style={S.itemMain}>
                <div style={S.itemName}>{s.cliente_nombre}</div>
                <div style={S.itemMeta}>
                  {s.cliente_telefono} · {new Date(s.created_at).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                  {s.view_count > 0 && (
                    <span style={S.itemViews}> · 👁 {s.view_count} vista{s.view_count === 1 ? '' : 's'}</span>
                  )}
                </div>
              </div>
              <div style={S.itemActions}>
                <button style={{ ...S.btnBase, ...S.btnGhost }} onClick={() => handleCopyLink(s.hash)}>Copiar link</button>
                <button style={{ ...S.btnBase, ...S.btnPrimary }} onClick={() => handleResend(s)}>WhatsApp</button>
                <Link href={`/broker/${broker.slug}/shortlists/${s.id}`} style={{ ...S.btnBase, ...S.btnGhost }}>Editar</Link>
                <button style={{ ...S.btnBase, ...S.btnTrash }} onClick={() => handleArchive(s)} title="Archivar">✕</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  )
}
