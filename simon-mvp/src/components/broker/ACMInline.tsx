// ACM inline para el BottomSheet modo broker.
// Fetch /api/acm?id=N + renderiza bloque compacto con:
//  - Precio/m² vs cohort (mediana + percentil + tamano del cohort)
//  - Tiempo en mercado vs mediana cohort
//  - Ranking torre (si aplica)
//  - Rango de valor estimado (p25*area - p75*area)
//  - Yield estimado (solo si yield_cohort_size >= 5, con disclaimer)
//  - Histórico precio: sparkline simple si hay >=2 puntos
//
// Ver docs/broker/PRD.md F1.1

import { useEffect, useState } from 'react'
import type { ACMData } from '@/pages/api/acm'

interface ACMInlineProps {
  propiedadId: number
}

function fmtUSD(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function fmtM2(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US') + '/m²'
}

export default function ACMInline({ propiedadId }: ACMInlineProps) {
  const [data, setData] = useState<ACMData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`/api/acm?id=${propiedadId}`)
      .then(r => r.json())
      .then(res => {
        if (cancelled) return
        if (res.error) {
          setError(res.error)
        } else {
          setData(res.data)
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Error cargando ACM')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [propiedadId])

  if (loading) {
    return (
      <div className="bs-section">
        <div className="bs-acm-label"><span className="bs-sl-dot" />Análisis de mercado</div>
        <div className="bs-acm-skeleton">Cargando...</div>
        <style jsx>{`
          .bs-acm-label { font-size:13px; font-weight:600; color:#7A7060; letter-spacing:0.5px; margin-bottom:14px; font-family:'DM Sans',sans-serif; text-transform:uppercase; display:flex; align-items:center; gap:8px }
          .bs-acm-skeleton { height:120px; background:rgba(237,232,220,0.04); border-radius:10px; display:flex; align-items:center; justify-content:center; color:#7A7060; font-size:13px; font-family:'DM Sans',sans-serif }
        `}</style>
      </div>
    )
  }

  if (error || !data) {
    // Error silencioso — no bloquea el sheet, se oculta el bloque
    return null
  }

  const m2Delta = data.cohort_precio_m2_mediana > 0
    ? Math.round(((data.precio_m2 - data.cohort_precio_m2_mediana) / data.cohort_precio_m2_mediana) * 100)
    : 0
  const diasDelta = data.dias_en_mercado - data.cohort_mediana_dias
  const tipologia = `${data.dormitorios === 0 ? 'monoambiente' : `${data.dormitorios} dormitorio${data.dormitorios === 1 ? '' : 's'}`}, ${data.estado_construccion === 'preventa' ? 'preventa' : 'entrega inmediata'}`
  const uniqueM2Precios = new Set(data.historico_precios?.map(h => h.precio_usd) || [])
  const cambiosPrecio = Math.max(0, uniqueM2Precios.size - 1)

  return (
    <div className="bs-section">
      <div className="bs-acm-label"><span className="bs-sl-dot" />Análisis de mercado</div>

      {/* Precio/m² vs cohort */}
      <div className="bs-acm-row">
        <div className="bs-acm-k">Precio por m²</div>
        <div className="bs-acm-v">{fmtM2(data.precio_m2)}</div>
        <div className={`bs-acm-sub ${m2Delta > 0 ? 'neg' : m2Delta < 0 ? 'pos' : ''}`}>
          {m2Delta === 0 ? 'Alineado con el promedio de la zona'
            : m2Delta > 0 ? `${m2Delta}% sobre el promedio de la zona`
            : `${Math.abs(m2Delta)}% debajo del promedio de la zona`}
        </div>
      </div>

      {/* Posición en el mercado */}
      <div className="bs-acm-row">
        <div className="bs-acm-k">Posición</div>
        <div className="bs-acm-v">Más barata que el {100 - data.percentil_en_cohort}%</div>
        <div className="bs-acm-sub">de {data.cohort_size} unidades similares ({tipologia}) en la zona</div>
      </div>

      {/* Tiempo en mercado */}
      <div className="bs-acm-row">
        <div className="bs-acm-k">Tiempo publicado</div>
        <div className="bs-acm-v">{data.dias_en_mercado} días</div>
        <div className="bs-acm-sub">
          Promedio de la zona: {data.cohort_mediana_dias} días
          {diasDelta > 30 ? ' · está estancada' : diasDelta < -30 ? ' · recién publicada' : ''}
        </div>
      </div>

      {/* Ranking torre */}
      {data.ranking_torre_pos && data.ranking_torre_total && data.ranking_torre_total >= 2 && (
        <div className="bs-acm-row">
          <div className="bs-acm-k">En el mismo edificio</div>
          <div className="bs-acm-v">#{data.ranking_torre_pos} de {data.ranking_torre_total}</div>
          <div className="bs-acm-sub">más barata (considerando precio por m²)</div>
        </div>
      )}

      {/* Rango de valor estimado */}
      {data.rango_valor_low && data.rango_valor_high && (
        <div className="bs-acm-row">
          <div className="bs-acm-k">Rango esperado</div>
          <div className="bs-acm-v">{fmtUSD(data.rango_valor_low)} – {fmtUSD(data.rango_valor_high)}</div>
          <div className="bs-acm-sub">Según precios actuales del mercado para esta tipología</div>
        </div>
      )}

      {/* Yield estimado (solo si cohort alquiler >=5) */}
      {data.yield_low !== null && data.yield_high !== null && data.yield_cohort_size >= 5 && (
        <div className="bs-acm-row bs-acm-yield">
          <div className="bs-acm-k">Renta estimada</div>
          <div className="bs-acm-v">{data.yield_low}% – {data.yield_high}% al año</div>
          <div className="bs-acm-sub">Basado en {data.yield_cohort_size} alquileres similares</div>
          <div className="bs-acm-disclaimer">
            Asume ocupación plena. No descuenta expensas ni gestión. La renta real suele ser 1-2 puntos porcentuales menor.
          </div>
        </div>
      )}

      {/* Histórico de precio */}
      {data.historico_precios && data.historico_precios.length >= 2 && cambiosPrecio > 0 && (
        <div className="bs-acm-row">
          <div className="bs-acm-k">Historial de precio</div>
          <div className="bs-acm-v">{cambiosPrecio} cambio{cambiosPrecio === 1 ? '' : 's'} de precio</div>
          <div className="bs-acm-sub">
            Desde {new Date(data.historico_precios[0].fecha).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })}
            {data.historico_precios[data.historico_precios.length - 1].precio_usd !== data.historico_precios[0].precio_usd && (
              <> · {data.historico_precios[data.historico_precios.length - 1].precio_usd > data.historico_precios[0].precio_usd ? '↑ subió' : '↓ bajó'} {Math.round(Math.abs(((data.historico_precios[data.historico_precios.length - 1].precio_usd - data.historico_precios[0].precio_usd) / data.historico_precios[0].precio_usd) * 100))}% desde que lo trackeamos</>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .bs-acm-label { font-size:13px; font-weight:600; color:#7A7060; letter-spacing:0.5px; margin-bottom:14px; font-family:'DM Sans',sans-serif; text-transform:uppercase; display:flex; align-items:center; gap:8px }
        .bs-acm-row { display:grid; grid-template-columns:1fr auto; grid-template-rows:auto auto; gap:2px 12px; padding:10px 0; border-bottom:1px solid rgba(237,232,220,0.08); font-family:'DM Sans',sans-serif }
        .bs-acm-row:last-child { border-bottom:none }
        .bs-acm-k { grid-column:1; grid-row:1; color:#9A8E7A; font-size:13px }
        .bs-acm-v { grid-column:2; grid-row:1; color:#EDE8DC; font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; text-align:right }
        .bs-acm-sub { grid-column:1 / 3; grid-row:2; color:#7A7060; font-size:12px; letter-spacing:0.2px }
        .bs-acm-sub.pos { color:#3A6A48 }
        .bs-acm-sub.neg { color:#C97979 }
        .bs-acm-yield { background:rgba(200,180,120,0.04); margin:4px -16px; padding:10px 16px; border-radius:8px; border:1px solid rgba(200,180,120,0.15); border-bottom:1px solid rgba(200,180,120,0.15) !important }
        .bs-acm-disclaimer { grid-column:1 / 3; font-size:11px; color:#7A7060; margin-top:6px; font-style:italic; line-height:1.4 }
      `}</style>
    </div>
  )
}
