// Chip fiduciario para la card de la shortlist (/b/[hash]).
// IMPORTANTE: compara contra el MERCADO activo real (cohort por zona+dorms de
// /api/shortlist-market), NO contra las otras propiedades de la lista curada
// (eso sería engañoso: la lista ya está filtrada). Misma lengua que el chip del
// feed: "Más barato / En línea / Más caro que similares", sin veredicto.
//
// Caché a nivel de módulo por (op:dorms:zona): una shortlist de 17 deptos de la
// misma tipología dispara UNA sola request, no 17.
import React, { useEffect, useState } from 'react'
import type { ShortlistMarketData } from '@/pages/api/shortlist-market'
import { shortlistTheme, type ShortlistVariant } from './theme'

const cohortCache = new Map<string, Promise<ShortlistMarketData | null>>()

function fetchCohort(op: 'venta' | 'alquiler', dorms: number, zona: string): Promise<ShortlistMarketData | null> {
  const key = `${op}:${dorms}:${zona}`
  if (!cohortCache.has(key)) {
    const qs = `op=${op}&dorms=${dorms}&zona=${encodeURIComponent(zona || '')}`
    cohortCache.set(
      key,
      fetch(`/api/shortlist-market?${qs}`)
        .then((r) => r.json())
        .then((r) => (r?.data ?? null) as ShortlistMarketData | null)
        .catch(() => null)
    )
  }
  return cohortCache.get(key)!
}

interface Props {
  variant: ShortlistVariant
  op: 'venta' | 'alquiler'
  dormitorios: number
  zonaDb: string
  // precio_m2 (venta) | precio_mensual_bob (alquiler)
  precioComparable: number
}

export default function ShortlistCardChip({ variant, op, dormitorios, zonaDb, precioComparable }: Props) {
  const t = shortlistTheme(variant)
  const [data, setData] = useState<ShortlistMarketData | null>(null)

  useEffect(() => {
    let cancel = false
    fetchCohort(op, dormitorios, zonaDb).then((d) => { if (!cancel) setData(d) })
    return () => { cancel = true }
  }, [op, dormitorios, zonaDb])

  if (!data || !data.enough || !(precioComparable > 0)) return null

  const pos = precioComparable < data.p25 ? 'bajo' : precioComparable > data.p75 ? 'sobre' : 'dentro'
  const txt = pos === 'bajo' ? 'Más barato que similares' : pos === 'sobre' ? 'Más caro que similares' : 'En línea con similares'
  const isSobre = pos === 'sobre'

  // Tonos: salvia para bajo/dentro, ámbar suave para sobre. En el header oscuro
  // (venta) usamos los mismos tonos que el chip del feed; en arena (alquiler)
  // bajamos la luminancia del texto para contraste.
  const salviaText = variant === 'venta' ? '#7BB389' : '#2F5B3C'
  const salviaBg = variant === 'venta' ? 'rgba(58,106,72,0.18)' : 'rgba(58,106,72,0.12)'
  const amberText = variant === 'venta' ? '#E79A6A' : '#9A6B3F'
  const amberBg = variant === 'venta' ? 'rgba(216,138,90,0.16)' : 'rgba(216,138,90,0.14)'

  return (
    <div className="slcc-row">
      <span className={`slcc ${isSobre ? 'slcc-sobre' : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 21h18" /><rect x="5" y="12" width="3" height="6" /><rect x="10.5" y="8" width="3" height="10" /><rect x="16" y="4" width="3" height="14" />
        </svg>
        {txt}
      </span>
      <style jsx>{`
        .slcc-row { margin-top: 9px; }
        .slcc {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 11px; border-radius: 9px;
          background: ${salviaBg}; color: ${salviaText};
          font-size: 12.5px; font-weight: 600; font-family: 'DM Sans', sans-serif;
        }
        .slcc svg { width: 15px; height: 15px; flex-shrink: 0; }
        .slcc.slcc-sobre { background: ${amberBg}; color: ${amberText}; }
      `}</style>
    </div>
  )
}
