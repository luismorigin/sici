import type { UnidadAlquiler } from '@/lib/supabase'
import { colors, spacing } from '@/lib/simon-design-tokens'
import { trackChatEvent, getSessionId } from './chat-utils'

interface Props {
  property: UnidadAlquiler
  onOpenDetail?: (id: number) => void
}

export default function ChatPropertyCard({ property: p, onOpenDetail }: Props) {
  const name = p.nombre_edificio || p.nombre_proyecto || 'Sin nombre'
  const photoUrl = p.fotos_urls?.[0] || null
  const brokerPhone = p.agente_whatsapp || p.agente_telefono || null

  function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation() // don't trigger card click (openDetail)
    if (!brokerPhone) return
    const phone = brokerPhone.replace(/[^0-9]/g, '')
    const precio = `Bs ${Math.round(p.precio_mensual_bob).toLocaleString()}/mes`
    const msg = `Hola, vi este alquiler en Simon y me interesa: ${name} - ${precio}${p.url ? '\n' + p.url : ''}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')

    // Fire-and-forget lead
    fetch('/api/lead-alquiler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        phone: brokerPhone,
        msg,
        prop_id: p.id,
        nombre: name,
        zona: p.zona,
        precio: p.precio_mensual_bob,
        dorms: p.dormitorios,
        broker_nombre: p.agente_nombre || '',
        fuente: 'chat-bot-card',
        sid: getSessionId(),
      }),
    }).catch(() => {})
    trackChatEvent('chat_lead', { property_id: p.id, zona: p.zona, fuente: 'chat-bot-card' })
  }

  return (
    <div
      onClick={() => onOpenDetail?.(p.id)}
      style={{
        background: colors.blanco,
        border: `1px solid ${colors.arenaMid}`,
        borderRadius: spacing.borderRadius.card,
        padding: 10,
        cursor: onOpenDetail ? 'pointer' : 'default',
        display: 'flex',
        gap: 10,
        transition: 'border-color 0.2s',
        marginTop: 6,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = colors.salvia)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = colors.arenaMid)}
    >
      {/* Photo thumbnail */}
      {photoUrl && (
        <div style={{
          width: 56, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
          background: colors.arenaMid,
        }}>
          <img
            src={photoUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Figtree', sans-serif",
          fontSize: 13, fontWeight: 500,
          color: colors.negro,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {name}
        </div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11, color: colors.piedra, marginTop: 1,
        }}>
          {p.zona} · {p.dormitorios === 0 ? 'Estudio' : `${p.dormitorios}D`} · {p.area_m2}m²
          {p.amoblado === 'si' ? ' · Amob.' : ''}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 4,
        }}>
          <div style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14, fontWeight: 500, color: colors.negro,
            fontVariantNumeric: 'tabular-nums',
          }}>
            Bs {Math.round(p.precio_mensual_bob).toLocaleString()}<span style={{ fontSize: 11, color: colors.piedra, fontWeight: 400 }}>/mes</span>
          </div>
          {brokerPhone && (
            <button
              onClick={handleWhatsApp}
              style={{
                background: '#25D366',
                border: 'none',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 500, color: '#fff',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              aria-label="Contactar por WhatsApp"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.634-1.215A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-2.115 0-4.142-.655-5.854-1.893l-.42-.294-2.749.721.734-2.682-.323-.462A9.713 9.713 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/>
              </svg>
              WA
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
