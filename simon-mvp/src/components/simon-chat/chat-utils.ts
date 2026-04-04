import type { UnidadAlquiler } from '@/lib/supabase'

// ── Listing summary for system prompt ────────────────────────────────────────
// Compress ~185 listings into a pipe-delimited table (~3-4K tokens)

export function buildListingSummary(listings: UnidadAlquiler[]): string {
  const header = 'ID|Edificio|Zona|Dorm|m2|Bs/mes|USD/mes|Amob|Mascotas|Parqueo|Amenidades'
  const rows = listings.map(p => {
    const name = p.nombre_edificio || p.nombre_proyecto || '-'
    const amob = p.amoblado === 'si' ? 'si' : p.amoblado === 'semi' ? 'semi' : 'no'
    const mascotas = p.acepta_mascotas ? 'si' : 'no'
    const parqueo = (p.estacionamientos || 0) > 0 ? 'si' : 'no'
    const amenities = (p.amenities_lista || []).join(',') || '-'
    const usd = p.precio_mensual_usd ? Math.round(p.precio_mensual_usd) : Math.round(p.precio_mensual_bob / 6.96)
    return `${p.id}|${name}|${p.zona}|${p.dormitorios}|${p.area_m2}|${Math.round(p.precio_mensual_bob)}|${usd}|${amob}|${mascotas}|${parqueo}|${amenities}`
  })
  return [header, ...rows].join('\n')
}

// ── Market stats for system prompt ───────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function buildMarketStats(listings: UnidadAlquiler[]): string {
  if (listings.length === 0) return 'Sin datos disponibles.'

  const prices = listings.map(l => l.precio_mensual_bob)
  const medianPrice = median(prices)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  // By zone
  const byZone = new Map<string, number[]>()
  for (const l of listings) {
    const arr = byZone.get(l.zona) || []
    arr.push(l.precio_mensual_bob)
    byZone.set(l.zona, arr)
  }
  const zoneLines = Array.from(byZone.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([zona, precios]) => `  ${zona}: ${precios.length} props, mediana Bs ${median(precios).toLocaleString()}`)
    .join('\n')

  // By bedrooms
  const byBeds = new Map<number, number[]>()
  for (const l of listings) {
    const arr = byBeds.get(l.dormitorios) || []
    arr.push(l.precio_mensual_bob)
    byBeds.set(l.dormitorios, arr)
  }
  const bedLabel = (beds: number) => beds === 0 ? 'Estudio' : `${beds}D`
  const bedLines = Array.from(byBeds.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([beds, precios]) => `  ${bedLabel(beds)}: mediana Bs ${median(precios).toLocaleString()} (${precios.length} props)`)
    .join('\n')

  return `Total: ${listings.length} propiedades activas
Mediana general: Bs ${medianPrice.toLocaleString()}/mes
Rango: Bs ${minPrice.toLocaleString()} – Bs ${maxPrice.toLocaleString()}

Por zona:
${zoneLines}

Por dormitorios:
${bedLines}`
}

// ── Session ID ───────────────────────────────────────────────────────────────

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'
  const key = 'simon_chat_session'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

// ── Unique message ID ────────────────────────────────────────────────────────

export function generateMsgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
