// "Contexto de mercado" del bottom sheet en /b/[hash].
// Compara la propiedad contra el MERCADO activo (no contra la lista). Fetch a
// /api/shortlist-market (cohort real por zona+dorms de v_mercado_*).
// Hereda `bs-section`/`bs-sl` del sheet; los colores del texto propio se
// tematizan por `variant` (sheet de ventas = oscuro, sheet de alquileres = arena).
import React, { useEffect, useState } from 'react'
import type { ShortlistMarketData } from '@/pages/api/shortlist-market'
import { shortlistTheme, type ShortlistVariant } from './theme'

interface Props {
  variant: ShortlistVariant
  op: 'venta' | 'alquiler'
  dormitorios: number
  zonaDb: string
  zonaDisplay: string
  // precio_m2 (venta) | precio_mensual_bob (alquiler) de la propiedad
  precioComparable: number
}

const fmtVenta = (n: number) => '$us ' + Math.round(n).toLocaleString('en-US') + '/m²'
const fmtAlquiler = (n: number) => 'Bs ' + Math.round(n).toLocaleString('es-BO') + '/mes'
const rangoVenta = (a: number, b: number) => '$us ' + Math.round(a).toLocaleString('en-US') + '–' + Math.round(b).toLocaleString('en-US')
const rangoAlquiler = (a: number, b: number) => 'Bs ' + Math.round(a).toLocaleString('es-BO') + '–' + Math.round(b).toLocaleString('es-BO')

export default function ShortlistMarketContext({ variant, op, dormitorios, zonaDb, zonaDisplay, precioComparable }: Props) {
  const t = shortlistTheme(variant)
  const [data, setData] = useState<ShortlistMarketData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setData(null)
    const qs = `op=${op}&dorms=${dormitorios}&zona=${encodeURIComponent(zonaDb || '')}`
    fetch(`/api/shortlist-market?${qs}`)
      .then((r) => r.json())
      .then((res) => { if (!cancel) setData(res?.data ?? null) })
      .catch(() => { if (!cancel) setData(null) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [op, dormitorios, zonaDb])

  if (loading) return null
  if (!data) return null

  const tipologia = dormitorios === 0 ? 'monoambientes' : `${dormitorios} dorm`
  const zonaLabel = data.ampliado ? 'Equipetrol' : zonaDisplay
  const fmt = op === 'alquiler' ? fmtAlquiler : fmtVenta
  const rango = op === 'alquiler' ? rangoAlquiler : rangoVenta
  const markerBorder = variant === 'venta' ? '#141414' : '#EDE8DC'

  // Sin cohort suficiente → declararlo (transparencia fiduciaria)
  if (!data.enough) {
    return (
      <div className="bs-section">
        <div className="bs-sl"><span className="bs-sl-dot" />Contexto de mercado</div>
        <div className="slmk-empty">No hay suficientes comparables confiables para esta tipología/zona.</div>
        <style jsx>{`
          .slmk-empty { font-size: 13px; color: ${t.textFaint}; line-height: 1.5; font-family: 'DM Sans', sans-serif; }
        `}</style>
      </div>
    )
  }

  const posicion =
    precioComparable < data.mediana * 0.97 ? 'por debajo de'
      : precioComparable > data.mediana * 1.03 ? 'por encima de'
      : 'en línea con'

  // Banda p25–p75 con marcador de la propiedad
  const lo = Math.min(data.p25, precioComparable) * 0.94
  const hi = Math.max(data.p75, precioComparable) * 1.06
  const pos = (v: number) => Math.min(98, Math.max(2, ((v - lo) / (hi - lo)) * 100))

  return (
    <div className="bs-section">
      <div className="bs-sl"><span className="bs-sl-dot" />Contexto de mercado · {zonaLabel}</div>
      <p className="slmk-lead">
        Este {op === 'alquiler' ? 'alquiler' : 'depto'} está <b>{posicion}</b> la mediana comparable
        de {tipologia} en {zonaLabel}.
      </p>
      <div className="slmk-bar">
        <div className="slmk-band" style={{ left: `${pos(data.p25)}%`, width: `${pos(data.p75) - pos(data.p25)}%` }} />
        <div className="slmk-marker" style={{ left: `${pos(precioComparable)}%` }} />
      </div>
      <div className="slmk-scale">
        <span>Mediana {fmt(data.mediana)}</span>
        <span>Rango típico {rango(data.p25, data.p75)}</span>
      </div>
      <p className="slmk-caveat">
        Basado en {data.count} propiedades activas{data.ampliado ? ' en Equipetrol' : ''}. El precio puede variar por
        edificio, amenities, acabados y condiciones.
      </p>
      <style jsx>{`
        .slmk-lead { font-size: 14px; color: ${t.text}; line-height: 1.5; margin: 0 0 12px; font-family: 'DM Sans', sans-serif; }
        .slmk-lead b { color: ${t.text}; font-weight: 700; }
        .slmk-bar { position: relative; height: 6px; border-radius: 4px; background: ${variant === 'venta' ? 'rgba(237,232,220,0.10)' : 'rgba(20,20,20,0.08)'}; margin: 6px 0 8px; }
        .slmk-band { position: absolute; top: 0; bottom: 0; background: rgba(58,106,72,0.55); border-radius: 4px; }
        .slmk-marker { position: absolute; top: -3px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: ${t.accent}; border: 2px solid ${markerBorder}; }
        .slmk-scale { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; color: ${t.textMuted}; font-family: 'DM Sans', sans-serif; font-variant-numeric: tabular-nums; }
        .slmk-caveat { font-size: 12px; color: ${t.textFaint}; line-height: 1.5; margin: 10px 0 0; font-family: 'DM Sans', sans-serif; }
      `}</style>
    </div>
  )
}
