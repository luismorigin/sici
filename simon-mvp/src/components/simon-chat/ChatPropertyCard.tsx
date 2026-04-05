import type { UnidadAlquiler } from '@/lib/supabase'
import { colors, spacing } from '@/lib/simon-design-tokens'

interface Props {
  property: UnidadAlquiler
  onOpenDetail?: (id: number) => void
}

export default function ChatPropertyCard({ property: p, onOpenDetail }: Props) {
  const name = p.nombre_edificio || p.nombre_proyecto || 'Sin nombre'
  const photoUrl = p.fotos_urls?.[0] || null

  return (
    <div
      onClick={() => onOpenDetail?.(p.id)}
      style={{
        background: colors.blanco,
        border: `1px solid ${colors.arenaMid}`,
        borderRadius: spacing.borderRadius.card,
        padding: 12,
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
          width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
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
          fontSize: 14, fontWeight: 500,
          color: colors.negro,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {name}
        </div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12, color: colors.piedra, marginTop: 2,
        }}>
          {p.zona} · {p.dormitorios}D · {p.area_m2}m²
          {p.amoblado === 'si' ? ' · Amoblado' : ''}
        </div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 15, fontWeight: 500, color: colors.negro,
          fontVariantNumeric: 'tabular-nums', marginTop: 4,
        }}>
          Bs {Math.round(p.precio_mensual_bob).toLocaleString()}<span style={{ fontSize: 12, color: colors.piedra, fontWeight: 400 }}>/mes</span>
        </div>
      </div>
    </div>
  )
}
