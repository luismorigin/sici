import { queryVenta, queryAlquiler, median } from '../db.js'
import type { YieldInversorResult, YieldTipologia } from '../types.js'

export async function yieldInversor(zona: string): Promise<YieldInversorResult> {
  const [ventas, alquileres] = await Promise.all([
    queryVenta(zona),
    queryAlquiler(zona),
  ])

  // Dorm types present in zona (from ventas)
  const dormTypes = [...new Set(ventas.map(r => r.dormitorios))].sort()

  const byDorms: YieldTipologia[] = dormTypes.map(dorms => {
    const ventasDorm = ventas.filter(r => r.dormitorios === dorms)
    const alqDorm = alquileres.filter(r => r.dormitorios === dorms)
    const alqAmob = alqDorm.filter(r => r.amoblado === 'si')
    const alqNoAmob = alqDorm.filter(r => r.amoblado === 'no')

    const medianaVenta = median(ventasDorm.map(r => r.precio_norm))
    const MIN_MUESTRA = 5
    const rentaAmob = alqAmob.length >= MIN_MUESTRA ? Math.round(median(alqAmob.map(r => r.precio_mensual))) : null
    const rentaNoAmob = alqNoAmob.length >= MIN_MUESTRA ? Math.round(median(alqNoAmob.map(r => r.precio_mensual))) : null

    // Renta por m² (no requiere MIN_MUESTRA — se usa para estimaciones por tamaño)
    const rentaM2Amob = alqAmob.length >= 3
      ? Math.round(median(alqAmob.map(r => r.area_total_m2 > 0 ? r.precio_mensual / r.area_total_m2 : 0).filter(v => v > 0)) * 100) / 100
      : null
    const rentaM2NoAmob = alqNoAmob.length >= 3
      ? Math.round(median(alqNoAmob.map(r => r.area_total_m2 > 0 ? r.precio_mensual / r.area_total_m2 : 0).filter(v => v > 0)) * 100) / 100
      : null
    const medianaAreaAlq = alqDorm.length > 0 ? Math.round(median(alqDorm.map(r => r.area_total_m2))) : null

    const premiumPct = rentaAmob && rentaNoAmob && rentaNoAmob > 0
      ? Math.round(((rentaAmob - rentaNoAmob) / rentaNoAmob) * 1000) / 10
      : null

    const yieldAmob = rentaAmob && medianaVenta > 0
      ? Math.round((rentaAmob * 12 / medianaVenta) * 1000) / 10
      : null
    const yieldNoAmob = rentaNoAmob && medianaVenta > 0
      ? Math.round((rentaNoAmob * 12 / medianaVenta) * 1000) / 10
      : null

    const anosAmob = rentaAmob && rentaAmob > 0
      ? Math.round((medianaVenta / (rentaAmob * 12)) * 10) / 10
      : null
    const anosNoAmob = rentaNoAmob && rentaNoAmob > 0
      ? Math.round((medianaVenta / (rentaNoAmob * 12)) * 10) / 10
      : null

    return {
      dorms,
      rentaAmobladoUsd: rentaAmob,
      rentaM2AmobladoUsd: rentaM2Amob,
      rentaM2NoAmobladoUsd: rentaM2NoAmob,
      medianaAreaAlquiler: medianaAreaAlq,
      rentaNoAmobladoUsd: rentaNoAmob,
      premiumAmobladoPct: premiumPct,
      nAmoblado: alqAmob.length,
      nNoAmoblado: alqNoAmob.length,
      yieldBrutoAmob: yieldAmob,
      yieldBrutoNoAmob: yieldNoAmob,
      anosRetornoAmob: anosAmob,
      anosRetornoNoAmob: anosNoAmob,
      medianaVentaTicket: Math.round(medianaVenta),
    }
  })

  return { zona, byDorms }
}
