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
  groupLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
    color: '#6a6a6a', padding: '4px 2px', marginTop: 4,
  },
  groupBadge: {
    background: '#141414', color: '#EDE8DC', padding: '2px 8px',
    borderRadius: 100, fontSize: 10, fontWeight: 600, marginLeft: 6,
  },
  chipVenta: {
    background: 'rgba(58,106,72,0.12)', color: '#3A6A48',
    border: '1px solid rgba(58,106,72,0.3)',
    padding: '1px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600,
    letterSpacing: 0.4, textTransform: 'uppercase', marginLeft: 8,
    display: 'inline-block', verticalAlign: 'middle',
  },
  chipAlquiler: {
    background: 'rgba(201,138,54,0.14)', color: '#8A5A1E',
    border: '1px solid rgba(201,138,54,0.35)',
    padding: '1px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600,
    letterSpacing: 0.4, textTransform: 'uppercase', marginLeft: 8,
    display: 'inline-block', verticalAlign: 'middle',
  },
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

/**
 * Normaliza un teléfono para agrupar (solo dígitos).
 * "+591 78519485" y "+59178519485" caen en el mismo grupo.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

interface ClientGroup {
  telefono: string
  nombre: string
  shortlists: BrokerShortlist[]
}

/**
 * Agrupa shortlists por cliente (teléfono normalizado). Retorna grupos
 * ordenados por actividad más reciente descendente.
 */
function groupByClient(shortlists: BrokerShortlist[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>()
  for (const s of shortlists) {
    const key = normalizePhone(s.cliente_telefono)
    const existing = map.get(key)
    if (existing) {
      existing.shortlists.push(s)
      // Usa el nombre más reciente (primera shortlist por orden descendente)
    } else {
      map.set(key, { telefono: s.cliente_telefono, nombre: s.cliente_nombre, shortlists: [s] })
    }
  }
  // Ordenar shortlists dentro de cada grupo por created_at desc
  for (const g of map.values()) {
    g.shortlists.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    // El nombre del grupo es el de la shortlist más reciente
    g.nombre = g.shortlists[0].cliente_nombre
  }
  // Ordenar grupos por shortlist más reciente
  return Array.from(map.values()).sort((a, b) => {
    const aLatest = new Date(a.shortlists[0].created_at).getTime()
    const bLatest = new Date(b.shortlists[0].created_at).getTime()
    return bLatest - aLatest
  })
}

function renderGrouped(
  shortlists: BrokerShortlist[],
  broker: Broker,
  handleCopyLink: (hash: string) => void,
  handleResend: (s: BrokerShortlist) => void,
  handleArchive: (s: BrokerShortlist) => void,
) {
  const groups = groupByClient(shortlists)
  return (
    <ul style={S.list}>
      {groups.map(g => (
        <li key={g.telefono} style={{ listStyle: 'none', marginBottom: 8 }}>
          <div style={S.groupLabel}>
            {g.nombre} · {g.telefono}
            {g.shortlists.length > 1 && (
              <span style={S.groupBadge}>{g.shortlists.length} envíos</span>
            )}
          </div>
          <ul style={{ ...S.list, marginLeft: 0 }}>
            {g.shortlists.map(s => (
              <li key={s.id} style={S.item}>
                <div style={S.itemMain}>
                  <div style={S.itemName}>
                    {new Date(s.created_at).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                    {s.tipo_operacion === 'alquiler' && <span style={S.chipAlquiler}>Alquiler</span>}
                    {s.tipo_operacion === 'venta' && <span style={S.chipVenta}>Venta</span>}
                    {' · '}
                    <span style={{ fontWeight: 400, color: '#6a6a6a' }}>
                      {s.mensaje_whatsapp ? 'con mensaje personalizado' : 'mensaje default'}
                    </span>
                  </div>
                  {s.view_count > 0 && (
                    <div style={{ ...S.itemMeta, ...S.itemViews }}>👁 {s.view_count} vista{s.view_count === 1 ? '' : 's'}</div>
                  )}
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
        </li>
      ))}
    </ul>
  )
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

        {renderGrouped(shortlists, broker, handleCopyLink, handleResend, handleArchive)}
      </div>
    </div>,
    document.body
  )
}
