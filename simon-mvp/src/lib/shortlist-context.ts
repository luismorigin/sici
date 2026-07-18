// Estadísticas de una shortlist (contexto de la SELECCIÓN, no del mercado).
// Alimenta el resumen superior de /b/[hash] en mobile: rango, mediana y
// tipología DE ESTA LISTA. Fiduciariamente distinto del "Contexto de mercado"
// del bottom sheet (que compara contra el mercado activo).
//
// Regla de precios (CLAUDE.md):
//  - Venta:  precio_usd ya viene normalizado desde buscar_unidades_simple
//            (la RPC retorna precio_normalizado() AS precio_usd). NO re-normalizar.
//  - Alquiler: precio_mensual_bob es la fuente de verdad (display en Bs).

import type { UnidadVenta, UnidadAlquiler } from './supabase'
import { displayZona } from './zonas'

export interface ShortlistListStats {
  count: number
  operacion: 'venta' | 'alquiler'
  operacionLabel: string
  tipologiaLabel: string
  zonasLabel: string
  // "1 dormitorio · venta · Equipetrol"
  contextLine: string
  // Rango de precio DE LA LISTA
  rangoLabel: string | null
  // Mediana de precio DE LA LISTA
  medianaLabel: string | null
  // Métrica secundaria (precio/m²) si hay datos
  medianaSecondaryLabel: string | null
  // Línea compacta al colapsar en scroll
  collapsedLabel: string
}

function median(nums: number[]): number | null {
  const s = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (s.length === 0) return null
  const i = (s.length - 1) / 2
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? s[lo] : Math.round((s[lo] + s[hi]) / 2)
}

const usd = (n: number): string => '$us ' + Math.round(n).toLocaleString('en-US')
const bs = (n: number): string => 'Bs ' + Math.round(n).toLocaleString('es-BO')

function tipologiaFromDorms(dorms: number[]): string {
  const uniq = Array.from(new Set(dorms.filter((d) => d !== null && d !== undefined))).sort((a, b) => a - b)
  if (uniq.length === 0) return 'departamentos'
  const label1 = (d: number) => (d === 0 ? 'monoambiente' : `${d} dormitorio${d === 1 ? '' : 's'}`)
  if (uniq.length === 1) return label1(uniq[0])
  const lo = uniq[0]
  const hi = uniq[uniq.length - 1]
  const loLbl = lo === 0 ? 'mono' : `${lo}`
  return `${loLbl}–${hi} dorm`
}

function zonasLabelFrom(zonasDisplay: string[]): string {
  const uniq = Array.from(new Set(zonasDisplay.filter(Boolean)))
  if (uniq.length === 0) return 'Equipetrol'
  if (uniq.length <= 3) return uniq.join(' · ')
  return 'Equipetrol'
}

export function computeVentaShortlistStats(items: UnidadVenta[]): ShortlistListStats {
  const precios = items.map((p) => p.precio_usd).filter((n) => Number.isFinite(n) && n > 0)
  const preciosM2 = items.map((p) => p.precio_m2).filter((n) => Number.isFinite(n) && n > 0)
  const tipologiaLabel = tipologiaFromDorms(items.map((p) => p.dormitorios ?? 0))
  const zonasLabel = zonasLabelFrom(items.map((p) => displayZona(p.zona)))
  const med = median(precios)
  const medM2 = median(preciosM2)
  const lo = precios.length ? Math.min(...precios) : null
  const hi = precios.length ? Math.max(...precios) : null

  return {
    count: items.length,
    operacion: 'venta',
    operacionLabel: 'venta',
    tipologiaLabel,
    zonasLabel,
    contextLine: `${tipologiaLabel} · venta · ${zonasLabel}`,
    rangoLabel: lo !== null && hi !== null ? `${usd(lo)} – ${usd(hi)}` : null,
    medianaLabel: med !== null ? usd(med) : null,
    medianaSecondaryLabel: medM2 !== null ? `${usd(medM2)}/m²` : null,
    collapsedLabel:
      `Tu selección · ${items.length} propiedad${items.length === 1 ? '' : 'es'}` +
      (med !== null ? ` · Mediana ${usd(med)}` : ''),
  }
}

export function computeAlquilerShortlistStats(items: UnidadAlquiler[]): ShortlistListStats {
  const precios = items.map((p) => p.precio_mensual_bob).filter((n) => Number.isFinite(n) && n > 0)
  const bsM2 = items
    .map((p) => (p.precio_mensual_bob && p.area_m2 ? p.precio_mensual_bob / p.area_m2 : 0))
    .filter((n) => Number.isFinite(n) && n > 0)
  const tipologiaLabel = tipologiaFromDorms(items.map((p) => p.dormitorios ?? 0))
  const zonasLabel = zonasLabelFrom(items.map((p) => displayZona(p.zona)))
  const med = median(precios)
  const medM2 = median(bsM2)
  const lo = precios.length ? Math.min(...precios) : null
  const hi = precios.length ? Math.max(...precios) : null

  return {
    count: items.length,
    operacion: 'alquiler',
    operacionLabel: 'alquiler',
    tipologiaLabel,
    zonasLabel,
    contextLine: `${tipologiaLabel} · alquiler · ${zonasLabel}`,
    rangoLabel: lo !== null && hi !== null ? `${bs(lo)} – ${bs(hi)}/mes` : null,
    medianaLabel: med !== null ? `${bs(med)}/mes` : null,
    medianaSecondaryLabel: medM2 !== null ? `Bs ${Math.round(medM2).toLocaleString('es-BO')}/m²` : null,
    collapsedLabel:
      `Tu selección · ${items.length} propiedad${items.length === 1 ? '' : 'es'}` +
      (med !== null ? ` · Mediana ${bs(med)}` : ''),
  }
}
