import { queryPropiedadesProyecto } from '../db.js'
import type { ClientConfig, VisibilidadPortalesResult, ListingVisible } from '../types.js'

const TC_OFICIAL = 6.96

export async function visibilidadPortales(
  config: ClientConfig,
  tc: { paralelo: number; oficial: number }
): Promise<VisibilidadPortalesResult> {
  const raw = await queryPropiedadesProyecto(config.id_proyecto_master)

  // Only active listings
  const activos = raw.filter((r: any) => r.status === 'completado')

  const detalle: ListingVisible[] = activos.map((r: any) => {
    const area = parseFloat(r.area_total_m2) || 0
    const precioUsd = parseFloat(r.precio_usd) || 0
    const tcDet = r.tipo_cambio_detectado ?? 'no_especificado'
    const precioNorm = tcDet === 'paralelo' && tc.paralelo > 0
      ? Math.round(precioUsd * tc.paralelo / TC_OFICIAL)
      : precioUsd
    const precioM2 = area > 0 ? Math.round(precioNorm / area) : 0
    return {
      id: r.id,
      fuente: r.fuente,
      dorms: r.dormitorios,
      areaM2: area,
      precioNorm,
      precioM2,
      diasEnMercado: (() => {
        const fecha = r.fecha_publicacion ?? r.fecha_discovery
        if (!fecha) return 0
        return Math.round((Date.now() - new Date(fecha).getTime()) / 86400000)
      })(),
      url: r.url ?? null,
      esMultiproyecto: r.es_multiproyecto === true,
      broker: r.datos_json_enrichment?.agente_nombre ?? null,
    }
  })

  // Inventory counts
  const inventarioPorDorms: Record<number, number> = {}
  for (const u of config.inventory) {
    inventarioPorDorms[u.dorms] = (inventarioPorDorms[u.dorms] ?? 0) + 1
  }

  const visiblesPorDorms: Record<number, number> = {}
  for (const d of detalle) {
    visiblesPorDorms[d.dorms] = (visiblesPorDorms[d.dorms] ?? 0) + 1
  }

  const totalInventario = config.inventory.length
  const visiblesEnPortal = detalle.length
  const invisibles = totalInventario - visiblesEnPortal

  return {
    totalInventario,
    visiblesEnPortal,
    invisibles,
    gapPct: totalInventario > 0 ? Math.round((invisibles / totalInventario) * 100) : 0,
    detalle,
    inventarioPorDorms,
    visiblesPorDorms,
  }
}
