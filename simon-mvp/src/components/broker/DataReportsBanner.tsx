// Banner persistente: muestra al broker cuántos de sus reportes están
// pendientes o en revisión por SICI. Loop emocional "SICI está trabajando
// en lo que reporté" sin requerir notification center ni email.
//
// Render: solo si hay ≥1 reporte propio en pending+in_review. Oculto si 0.
// Migración 240. Brief: docs/broker/REPORTES_DATOS_BRIEF.md.

import { useEffect, useState } from 'react'
import type { PropertyReport } from '@/types/broker-property-report'

interface Props {
  brokerSlug: string
  /** Si se pasa, solo cuenta reportes sobre props en este array.
   *  Si no se pasa (default), cuenta todos los reportes pendientes del broker. */
  propiedadIds?: number[]
}

export default function DataReportsBanner({ brokerSlug, propiedadIds }: Props) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!brokerSlug) return
    let cancelled = false
    const params = new URLSearchParams()
    params.set('slug', brokerSlug)
    params.set('status', 'pending,in_review')
    if (propiedadIds && propiedadIds.length > 0) {
      params.set('propiedad_ids', propiedadIds.join(','))
    }
    fetch(`/api/broker/property-reports?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        const reports = (json.reports || []) as PropertyReport[]
        setCount(reports.length)
      })
      .catch(() => {
        // best-effort: si falla, no mostrar banner
      })
    return () => {
      cancelled = true
    }
  }, [brokerSlug, propiedadIds])

  if (count === null || count === 0) return null

  const text =
    count === 1
      ? '1 propiedad reportada — SICI la está revisando.'
      : `${count} propiedades reportadas — SICI las está revisando.`

  return (
    <div
      role="status"
      style={{
        background: '#EDE8DC',
        borderLeft: '3px solid #3A6A48',
        color: '#141414',
        padding: '12px 16px',
        margin: '12px 16px',
        borderRadius: '0 12px 12px 0',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3A6A48"
        strokeWidth="2"
        style={{ width: 18, height: 18, flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{text}</span>
    </div>
  )
}
