import { useState, useMemo } from 'react'
import { dormLabel, formatPriceUSD } from '@/lib/format-utils'
import type { UnidadVenta } from '@/lib/supabase'
import { displayZona } from '@/lib/zonas'

interface CompareSheetProps {
  open: boolean
  properties: UnidadVenta[]
  onClose: () => void
  // Cuando viene, el comparativo está embebido en una shortlist pública (/b/[hash])
  // → ocultar preguntas al broker, "durante la visita" y CTAs WA por propiedad.
  // Reemplaza por un único CTA "Consultar por WhatsApp" al broker que comparte.
  publicShareBroker?: { nombre: string; telefono: string } | null
}

function fmt(n: number) { return n.toLocaleString('en-US') }

// Normaliza a 3 categorias: Preventa | Entrega inmediata | No especificado
// nuevo_a_estrenar, nuevo, a_estrenar, usado -> Entrega inmediata
function estadoLabel(estado: string | null | undefined): string {
  if (!estado) return 'No especificado'
  const e = estado.toLowerCase()
  if (e === 'preventa') return 'Preventa'
  if (e === 'no_especificado') return 'No especificado'
  return 'Entrega inmediata'
}

export default function CompareSheet({ open, properties, onClose, publicShareBroker = null }: CompareSheetProps) {
  const [selectedQs, setSelectedQs] = useState<Set<number>>(new Set())
  const MAX_QS = 3
  const publicShareMode = publicShareBroker !== null

  const props = useMemo(() => properties.slice(0, 3), [properties])

  // Derived values
  const precioM2 = useMemo(() => props.map(p => p.precio_m2 || 0), [props])
  const minPrecioM2 = useMemo(() => { const valid = precioM2.filter(v => v > 0); return valid.length ? Math.min(...valid) : 0 }, [precioM2])
  const precios = useMemo(() => props.map(p => p.precio_usd || 0), [props])
  const minPrecio = useMemo(() => { const valid = precios.filter(v => v > 0); return valid.length ? Math.min(...valid) : 0 }, [precios])

  // Insights — reglas respaldadas por data con rigor de real estate strategist.
  // Validaciones clave:
  //  - Omitir comparaciones de precio/m² y valor-por-espacio si el cohort no es comparable
  //    (distintas tipologias o estados: preventa vs entrega tienen precios/m² no comparables).
  //  - Omitir si alguna prop tiene tc_sospechoso (su precio no es confiable).
  //  - Usar letra A/B/C cuando los nombres de proyecto se repiten (ej. dos Sky Level).
  const insights = useMemo(() => {
    const result: string[] = []
    if (props.length < 2) return result

    // Helper: nombre de la prop — agrega letra si el proyecto aparece mas de una vez
    const nameAt = (i: number): string => {
      const p = props[i]
      const base = p.proyecto || `Depto ${i + 1}`
      const dup = props.filter(x => (x.proyecto || '') === (p.proyecto || '')).length > 1
      return dup ? `${base} (${String.fromCharCode(65 + i)})` : base
    }

    // Cohort comparable = misma tipologia (dorms) + mismo estado normalizado.
    // Si no, comparar precio/m² es enganioso: 1 dorm vs 3 dorm difieren por eficiencia
    // de planta; preventa vs entrega difieren por factor tiempo, no por ser mejor deal.
    const firstDorms = props[0].dormitorios
    const firstEstado = estadoLabel(props[0].estado_construccion)
    const cohortComparable = props.every(p =>
      p.dormitorios === firstDorms &&
      estadoLabel(p.estado_construccion) === firstEstado
    )
    const anySospechosa = props.some(p => p.tc_sospechoso === true)

    // 1. Mejor precio/m² — solo si cohort comparable y sin sospechosas.
    //    Umbral 5% para descartar ruido estadistico.
    if (cohortComparable && !anySospechosa) {
      const bestM2Idx = precioM2.indexOf(minPrecioM2)
      if (bestM2Idx >= 0 && minPrecioM2 > 0 && precioM2.filter(v => v === minPrecioM2).length === 1) {
        const validM2 = precioM2.filter(v => v > 0)
        const worstM2 = Math.max(...validM2)
        const diffPct = ((worstM2 - minPrecioM2) / minPrecioM2) * 100
        if (diffPct >= 5) {
          result.push(`${nameAt(bestM2Idx)} tiene el mejor valor por m² ($${fmt(minPrecioM2)}/m²), ${Math.round(diffPct)}% menos que el mas caro.`)
        }
      }
    }

    // 2. Mejor valor por espacio — solo si cohort comparable y sin sospechosas.
    //    Una prop con ≥15% mas area y diferencia de precio menor a la diferencia de area.
    if (cohortComparable && !anySospechosa) {
      const areas = props.map(p => p.area_m2 || 0)
      const maxAreaIdx = areas.indexOf(Math.max(...areas))
      const minAreaIdx = areas.indexOf(Math.min(...areas.filter(a => a > 0)))
      if (maxAreaIdx !== minAreaIdx && areas[maxAreaIdx] > 0 && areas[minAreaIdx] > 0) {
        const areaDiffPct = ((areas[maxAreaIdx] - areas[minAreaIdx]) / areas[minAreaIdx]) * 100
        const priceMax = props[maxAreaIdx].precio_usd
        const priceMin = props[minAreaIdx].precio_usd
        const priceDiffPct = priceMin > 0 ? ((priceMax - priceMin) / priceMin) * 100 : 0
        if (areaDiffPct >= 15 && priceDiffPct < areaDiffPct) {
          const diffM2 = Math.round(areas[maxAreaIdx] - areas[minAreaIdx])
          const areaPctRounded = Math.round(areaDiffPct)
          if (priceDiffPct <= 0) {
            const ahorroPct = Math.round(Math.abs(priceDiffPct))
            result.push(`${nameAt(maxAreaIdx)} tiene ${diffM2}m² mas (${areaPctRounded}%) y ademas cuesta ${ahorroPct}% menos — mejor valor por espacio.`)
          } else {
            result.push(`${nameAt(maxAreaIdx)} tiene ${diffM2}m² mas (${areaPctRounded}%) por solo ${Math.round(priceDiffPct)}% mas plata — mejor valor por espacio.`)
          }
        }
      }
    }

    // 2b. Misma area, distinto precio — cohort comparable + ≥2 props con area casi igual (±2%)
    //     y diff de precio ≥2% (>=$500 absoluto para no reportar ruido).
    //     Caso tipico: 2 unidades del mismo proyecto con misma planta.
    if (cohortComparable && !anySospechosa && props.length >= 2) {
      // Buscar pares con area muy similar y diff de precio relevante
      let bestPair: { cheaperIdx: number; expensiveIdx: number; diffUsd: number } | null = null
      for (let i = 0; i < props.length; i++) {
        for (let j = i + 1; j < props.length; j++) {
          const a1 = props[i].area_m2 || 0
          const a2 = props[j].area_m2 || 0
          if (a1 <= 0 || a2 <= 0) continue
          const areaDiffPct = (Math.abs(a1 - a2) / Math.min(a1, a2)) * 100
          if (areaDiffPct > 2) continue // areas distintas, no aplica
          const p1 = props[i].precio_usd
          const p2 = props[j].precio_usd
          if (p1 <= 0 || p2 <= 0) continue
          const cheaperIdx = p1 <= p2 ? i : j
          const expensiveIdx = p1 <= p2 ? j : i
          const diffUsd = Math.abs(p1 - p2)
          const priceDiffPct = (diffUsd / Math.min(p1, p2)) * 100
          if (priceDiffPct < 2 || diffUsd < 500) continue // ruido
          // Preferir el par con mayor diff
          if (!bestPair || diffUsd > bestPair.diffUsd) {
            bestPair = { cheaperIdx, expensiveIdx, diffUsd }
          }
        }
      }
      if (bestPair) {
        const cheaper = props[bestPair.cheaperIdx]
        const expensive = props[bestPair.expensiveIdx]
        const areaShared = Math.round((cheaper.area_m2 + expensive.area_m2) / 2)
        const diffPct = Math.round((bestPair.diffUsd / Math.min(cheaper.precio_usd, expensive.precio_usd)) * 100)
        result.push(`${nameAt(bestPair.cheaperIdx)} y ${nameAt(bestPair.expensiveIdx)} tienen ${areaShared}m² pero ${nameAt(bestPair.cheaperIdx)} cuesta $${fmt(Math.round(bestPair.diffUsd))} (${diffPct}%) menos.`)
      }
    }

    // 3. Parqueo incluido diferenciador — una explicito true + otra explicito false.
    //    Aplica siempre, no requiere cohort comparable.
    const conParqueoIdx: number[] = []
    const sinParqueoIdx: number[] = []
    props.forEach((p, i) => {
      if (p.parqueo_incluido === true) conParqueoIdx.push(i)
      else if (p.parqueo_incluido === false) sinParqueoIdx.push(i)
    })
    if (conParqueoIdx.length > 0 && sinParqueoIdx.length > 0) {
      const namesCon = conParqueoIdx.map(i => nameAt(i)).join(' y ')
      result.push(`${namesCon} incluye${conParqueoIdx.length > 1 ? 'n' : ''} parqueo — los demas lo cobran aparte o no reportan.`)
    }

    // 4. TC sospechoso — alerta critica, va a tope de prioridad cuando aparece.
    const sospechosasIdx: number[] = []
    props.forEach((p, i) => { if (p.tc_sospechoso === true) sospechosasIdx.push(i) })
    if (sospechosasIdx.length > 0) {
      const names = sospechosasIdx.map(i => nameAt(i)).join(' y ')
      result.unshift(`${names} tiene${sospechosasIdx.length > 1 ? 'n' : ''} precio sospechoso — confirmar tipo de cambio con el broker antes de comparar.`)
    }

    return result.slice(0, 4)
  }, [props, precioM2, minPrecioM2])

  // Ocultar filas donde ninguna prop aporta data util (todo null/vacio).
  const showBanos = props.some(p => p.banos !== null && p.banos !== undefined)
  const showParqueo = props.some(p => p.estacionamientos !== null && p.estacionamientos !== undefined && p.estacionamientos > 0)
  const showBaulera = props.some(p => p.baulera === true || p.baulera === false)
  const showPiso = props.some(p => p.piso !== null && p.piso !== undefined && p.piso !== '')

  // Questions for broker
  const questions = useMemo(() => {
    const qs: Array<{ text: string; category: 'preguntar' | 'verificar' }> = []
    if (props.length === 0) return qs

    const anyPreventa = props.some(p => p.estado_construccion === 'preventa')
    const anyPlanPagos = props.some(p => p.plan_pagos_desarrollador)
    const anyParaleloSolo = props.some(p => p.solo_tc_paralelo === true)

    // Preguntas clave
    qs.push({ text: 'Comision del broker: cuanto es y quien la paga?', category: 'preguntar' })
    qs.push({ text: 'Gastos de cierre: impuestos municipales, notaria, FUNDEMPRESA', category: 'preguntar' })
    qs.push({ text: 'Que incluye exactamente el precio? (parqueo, baulera, amenidades comunes)', category: 'preguntar' })
    qs.push({ text: 'El precio admite negociacion con pago contado?', category: 'preguntar' })
    qs.push({ text: 'Acepta permuta?', category: 'preguntar' })

    if (anyPreventa) {
      qs.push({ text: 'Fecha real de entrega y penalidades por retraso', category: 'preguntar' })
      qs.push({ text: 'Plan de pagos durante obra: cuotas, porcentajes, fechas', category: 'preguntar' })
      qs.push({ text: 'Que materiales y terminaciones incluye la entrega?', category: 'preguntar' })
    }
    if (anyPlanPagos) {
      qs.push({ text: 'Tasa de interes implicita en el plan de pagos', category: 'preguntar' })
    }
    if (anyParaleloSolo) {
      qs.push({ text: 'Tipo de cambio paralelo: se fija al firmar o al pagar cada cuota?', category: 'preguntar' })
    }

    qs.push({ text: 'Disponibilidad para visita y fecha posible de firma', category: 'preguntar' })

    // Verificar en visita
    qs.push({ text: 'Orientacion del departamento (sol, vista, ruido de calle)', category: 'verificar' })
    qs.push({ text: 'Calidad de terminaciones (pisos, baños, cocina)', category: 'verificar' })
    qs.push({ text: 'Estado del edificio: fachada, ascensores, areas comunes', category: 'verificar' })
    qs.push({ text: 'Presion de agua y temperatura (abrir canillas y ducha)', category: 'verificar' })
    qs.push({ text: 'Humedad en techos, paredes y cocheras', category: 'verificar' })
    if (anyPreventa) {
      qs.push({ text: 'Avance real de obra vs cronograma prometido', category: 'verificar' })
    }

    return qs
  }, [props])

  const askQuestions = useMemo(() => questions.filter(q => q.category === 'preguntar'), [questions])
  const checkQuestions = useMemo(() => questions.filter(q => q.category === 'verificar'), [questions])

  if (!open || properties.length === 0) return null

  function toggleQuestion(idx: number) {
    setSelectedQs(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) }
      else if (next.size < MAX_QS) { next.add(idx) }
      return next
    })
  }

  function buildWaMessage(p: UnidadVenta, selectedTexts: string[]): string {
    const name = p.proyecto || 'este departamento'
    const specs = [dormLabel(p.dormitorios), formatPriceUSD(p.precio_usd), displayZona(p.zona)].filter(Boolean).join(' · ')
    const parts: string[] = [
      'Hola, vi este departamento en Simon (simonbo.com) — estoy comparando varias opciones:',
      '',
      `${name} · ${specs}`,
    ]
    if (selectedTexts.length > 0) {
      parts.push('')
      parts.push('Me gustaria saber:')
      selectedTexts.forEach(q => parts.push(`— ${q}`))
    }
    parts.push('')
    parts.push(`Ver ficha en Simon: https://simonbo.com/ventas?id=${p.id}`)
    parts.push(`Ref: SIM-V${p.id}`)
    return parts.join('\n')
  }

  return (
    <>
    <div className={`csv-overlay ${open ? 'open' : ''}`}>
      {/* Header */}
      <div className="csv-header">
        <div className="csv-header-left">
          <div className="csv-title">Comparativo Express</div>
          <div className="csv-subtitle">{props.length} favoritos seleccionados</div>
        </div>
        <button className="csv-close" aria-label="Cerrar comparativo" onClick={onClose}>&times;</button>
      </div>

      <div className="csv-scroll">
        {/* Comparison Table */}
        <div className="csv-section">
          <div className="csv-label"><span className="csv-label-dot" />COMPARACION</div>
          <div className="csv-table-wrap">
            <table className="csv-table">
              <thead>
                <tr>
                  <th className="csv-th-label"></th>
                  {props.map((p, i) => (
                    <th key={p.id} className="csv-th-name">
                      {p.fotos_urls[0] && (
                        <div className="csv-thumb" style={{ backgroundImage: `url(${p.fotos_urls[0]})` }} />
                      )}
                      <span className="csv-th-letter">{String.fromCharCode(65 + i)}</span>
                      <span className="csv-th-text">{p.proyecto || `Depto ${i + 1}`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="csv-tr-highlight">
                  <td className="csv-td-label">Precio USD</td>
                  {props.map((p, i) => (
                    <td key={p.id} className={`csv-td csv-td-total ${precios[i] === minPrecio && minPrecio > 0 ? 'csv-best' : ''}`}>
                      ${fmt(Math.round(p.precio_usd))}{precios[i] === minPrecio && minPrecio > 0 && precios.filter(v => v === minPrecio).length === 1 ? ' ★' : ''}
                    </td>
                  ))}
                </tr>
                <tr className="csv-tr-highlight">
                  <td className="csv-td-label">Precio/m²</td>
                  {props.map((p, i) => (
                    <td key={p.id} className={`csv-td ${precioM2[i] === minPrecioM2 && minPrecioM2 > 0 ? 'csv-best' : ''}`}>
                      ${fmt(precioM2[i])}{precioM2[i] === minPrecioM2 && minPrecioM2 > 0 && precioM2.filter(v => v === minPrecioM2).length === 1 ? ' ★' : ''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="csv-td-label">Area</td>
                  {props.map(p => <td key={p.id} className="csv-td">{p.area_m2}m²</td>)}
                </tr>
                <tr>
                  <td className="csv-td-label">Dorms</td>
                  {props.map(p => <td key={p.id} className="csv-td">{dormLabel(p.dormitorios)}</td>)}
                </tr>
                {showBanos && (
                  <tr>
                    <td className="csv-td-label">Baños</td>
                    {props.map(p => <td key={p.id} className="csv-td">{p.banos ?? '—'}</td>)}
                  </tr>
                )}
                <tr>
                  <td className="csv-td-label">Zona</td>
                  {props.map(p => <td key={p.id} className="csv-td">{displayZona(p.zona)}</td>)}
                </tr>
                <tr>
                  <td className="csv-td-label">Estado</td>
                  {props.map(p => (
                    <td key={p.id} className={`csv-td ${p.estado_construccion === 'entrega_inmediata' ? 'csv-good' : ''}`}>
                      {estadoLabel(p.estado_construccion)}
                    </td>
                  ))}
                </tr>
                {showParqueo && (
                  <tr>
                    <td className="csv-td-label">Parqueo</td>
                    {props.map(p => <td key={p.id} className="csv-td">{p.estacionamientos ? `${p.estacionamientos} incl.` : '—'}</td>)}
                  </tr>
                )}
                {showBaulera && (
                  <tr>
                    <td className="csv-td-label">Baulera</td>
                    {props.map(p => <td key={p.id} className="csv-td">{p.baulera === true ? 'Si' : p.baulera === false ? 'No' : '—'}</td>)}
                  </tr>
                )}
                {showPiso && (
                  <tr>
                    <td className="csv-td-label">Piso</td>
                    {props.map(p => <td key={p.id} className="csv-td">{p.piso || '—'}</td>)}
                  </tr>
                )}
                <tr>
                  <td className="csv-td-label">Dias publicado</td>
                  {props.map(p => (
                    <td key={p.id} className={`csv-td ${p.dias_en_mercado && p.dias_en_mercado > 90 ? 'csv-warn' : ''}`}>
                      {p.dias_en_mercado ?? '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="csv-section">
            <div className="csv-label"><span className="csv-label-dot" />INSIGHTS</div>
            <div className="csv-insights">
              {insights.map((insight, i) => (
                <div key={i} className="csv-insight">
                  <span className="csv-insight-dot" />
                  <span className="csv-insight-text">{insight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions for broker — oculto en publicShareMode */}
        {!publicShareMode && (
        <div className="csv-section">
          <div className="csv-label-row">
            <span className="csv-label"><span className="csv-label-dot" />PREGUNTAS PARA EL BROKER</span>
            <span className="csv-label-hint">{selectedQs.size > 0 ? `${selectedQs.size}/${MAX_QS} — se incluyen en WhatsApp` : `Selecciona hasta ${MAX_QS}`}</span>
          </div>
          <div className="csv-questions">
            {askQuestions.map((q, i) => {
              const isSelected = selectedQs.has(i)
              const isDisabled = !isSelected && selectedQs.size >= MAX_QS
              return (
                <button key={i} className={`csv-question csv-q-selectable ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => toggleQuestion(i)} aria-pressed={isSelected}>
                  <span className={`csv-q-check ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="#EDE8DC" strokeWidth="3" style={{width:10,height:10}}><path d="M5 12l5 5L20 7"/></svg>}
                  </span>
                  <span className="csv-q-text">{q.text}</span>
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* Durante la visita — oculto en publicShareMode */}
        {!publicShareMode && (
        <div className="csv-section">
          <div className="csv-label"><span className="csv-label-dot" />DURANTE LA VISITA, FIJATE EN</div>
          <div className="csv-questions">
            {checkQuestions.map((q, i) => (
              <div key={i} className="csv-question">
                <span className="csv-q-dot" />
                <span className="csv-q-text">{q.text}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* CTA único al broker que comparte (solo publicShareMode) — lista las propiedades comparadas */}
        {publicShareMode && publicShareBroker && (() => {
          const clienteLines = props.map(p => {
            const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
            return `• ${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`
          }).join('\n')
          const msg = `Hola ${publicShareBroker.nombre}, estoy interesado en estas alternativas:\n\n${clienteLines}\n\n¿Podemos coordinar?`
          return (
          <div className="csv-section">
            <a
              href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, background:'#25D366', color:'#fff', padding:'14px 20px', borderRadius:10, textDecoration:'none', fontWeight:600, fontSize:15, fontFamily:"'DM Sans',sans-serif" }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
              Consultar por WhatsApp
            </a>
          </div>
          )
        })()}

        {/* WhatsApp CTAs por propiedad — oculto en publicShareMode */}
        {!publicShareMode && (
        <div className="csv-section">
          <div className="csv-label"><span className="csv-label-dot" />CONTACTAR</div>
          <div className="csv-ctas">
            {props.map((p, i) => {
              const name = p.proyecto || `Depto ${i + 1}`
              const selectedTexts = Array.from(selectedQs).sort().map(idx => askQuestions[idx]?.text).filter(Boolean) as string[]
              const msgText = buildWaMessage(p, selectedTexts)
              const phone = p.agente_telefono ? p.agente_telefono.replace(/[^0-9]/g, '') : null
              return (
                <div key={p.id} className="csv-cta-row">
                  <span className="csv-cta-letter">{String.fromCharCode(65 + i)}</span>
                  <span className="csv-cta-name">{name}</span>
                  {phone ? (
                    <a
                      href={`https://wa.me/${phone}?text=${encodeURIComponent(msgText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="csv-cta-btn"
                    >
                      <svg viewBox="0 0 24 24" fill="#1EA952" style={{ width: 16, height: 16 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                      WhatsApp
                    </a>
                  ) : (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="csv-cta-btn csv-cta-link">Ver anuncio</a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )}

        <div className="csv-footer">
          <div className="csv-footer-text">Generado por Simon — Inteligencia Inmobiliaria</div>
        </div>
      </div>

      <style jsx>{`
        .csv-overlay {
          position: fixed; inset: 0; z-index: 300; background: #EDE8DC;
          transform: translateY(100%); transition: transform 0.35s cubic-bezier(0.32,0.72,0,1);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .csv-overlay.open { transform: translateY(0); }
        .csv-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; padding-top: max(16px, env(safe-area-inset-top));
          background: #141414; flex-shrink: 0;
          border-radius: 0 0 14px 14px;
        }
        .csv-header-left { display: flex; flex-direction: column; gap: 2px; }
        .csv-title { font-family: 'Figtree', sans-serif; font-size: 24px; font-weight: 500; color: #EDE8DC; line-height: 1.2; }
        .csv-subtitle { font-size: 12px; color: #9A8E7A; font-family: 'DM Sans', sans-serif; letter-spacing: 0.5px; }
        .csv-close {
          width: 44px; height: 44px; border-radius: 50%; border: none;
          background: transparent; color: #9A8E7A; font-size: 20px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .csv-scroll {
          flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
          scrollbar-width: none; padding-bottom: max(24px, env(safe-area-inset-bottom));
        }
        .csv-scroll::-webkit-scrollbar { display: none; }
        .csv-section { padding: 20px 20px 8px; }
        .csv-label {
          font-size: 12px; font-weight: 600; color: #7A7060; letter-spacing: 0.5px;
          margin-bottom: 14px; font-family: 'DM Sans', sans-serif; text-transform: uppercase;
          display: flex; align-items: center; gap: 8px;
        }
        .csv-label-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #3A6A48;
          flex-shrink: 0;
        }
        .csv-table-wrap { overflow-x: auto; margin: 0 -4px; }
        .csv-table {
          width: 100%; border-collapse: collapse; font-family: 'DM Sans', sans-serif;
          font-size: 13px; table-layout: fixed;
        }
        .csv-th-label { width: 30%; }
        .csv-th-name {
          text-align: center; padding: 8px 6px 12px; vertical-align: bottom;
          font-weight: 400; color: #141414; font-size: 12px;
        }
        .csv-thumb {
          width: 48px; height: 48px; border-radius: 10px; margin: 0 auto 6px;
          background-size: cover; background-position: center;
          border: 1px solid #D8D0BC;
        }
        .csv-th-letter {
          display: inline-flex; width: 20px; height: 20px; border-radius: 50%;
          background: #141414; color: #EDE8DC; font-size: 12px; font-weight: 700;
          align-items: center; justify-content: center; margin-right: 4px;
        }
        .csv-th-text {
          display: block; margin-top: 4px; font-size: 12px; line-height: 1.2;
          color: #3A3530; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .csv-td-label {
          padding: 8px 8px 8px 0; color: #7A7060; font-size: 12px;
          border-bottom: 1px solid #D8D0BC; white-space: nowrap;
        }
        .csv-td {
          text-align: center; padding: 8px 4px; color: #141414;
          border-bottom: 1px solid #D8D0BC; font-variant-numeric: tabular-nums;
        }
        .csv-td-sub { font-size: 12px; color: #7A7060; }
        .csv-td-total { font-weight: 600; }
        .csv-tr-highlight td { background: rgba(58,106,72,0.04); }
        .csv-best { color: #3A6A48 !important; font-weight: 600; }
        .csv-good { color: #3A6A48; }
        .csv-warn { color: #7A7060; font-style: italic; }

        /* Insights */
        .csv-insights { display: flex; flex-direction: column; gap: 10px; }
        .csv-insight {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 12px 14px; border-radius: 14px;
          background: #FAFAF8; border: 1px solid #D8D0BC;
          box-shadow: 0 2px 8px rgba(58,53,48,0.06);
        }
        .csv-insight-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #3A6A48;
          flex-shrink: 0; margin-top: 6px;
        }
        .csv-insight-text {
          font-family: 'DM Sans', sans-serif; font-size: 15px; line-height: 1.5;
          color: #3A3530;
        }

        /* Questions */
        .csv-label-row {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 14px; gap: 8px;
        }
        .csv-label-row .csv-label { margin-bottom: 0; }
        .csv-label-hint {
          font-size: 12px; color: #7A7060; font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.3px; white-space: nowrap;
        }
        .csv-questions { display: flex; flex-direction: column; gap: 6px; }
        .csv-question {
          display: flex; gap: 10px; align-items: center; padding: 10px 12px;
          border-radius: 14px; background: #FAFAF8;
          border: 1px solid #D8D0BC;
        }
        .csv-q-selectable {
          cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .csv-q-selectable:hover { border-color: #7A7060; }
        .csv-q-selectable.selected {
          border-color: #3A6A48; border-width: 2px; background: #FAFAF8;
        }
        .csv-q-selectable.disabled { opacity: 0.35; cursor: default; }
        .csv-q-check {
          width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0;
          border: 1.5px solid #D8D0BC;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, border-color 0.15s;
        }
        .csv-q-check.checked {
          background: #141414; border-color: #141414;
        }
        .csv-q-dot {
          width: 5px; height: 5px; border-radius: 50%; background: #D8D0BC;
          flex-shrink: 0;
        }
        .csv-q-text {
          font-family: 'DM Sans', sans-serif; font-size: 15px; line-height: 1.4;
          color: #3A3530;
        }

        /* CTAs */
        .csv-ctas { display: flex; flex-direction: column; gap: 8px; }
        .csv-cta-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px;
          border-radius: 14px; background: #FAFAF8;
          border: 1px solid #D8D0BC;
        }
        .csv-cta-letter {
          width: 24px; height: 24px; border-radius: 50%; background: #141414;
          color: #EDE8DC; font-size: 12px; font-weight: 700; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Sans', sans-serif;
        }
        .csv-cta-name {
          flex: 1; font-family: 'DM Sans', sans-serif; font-size: 15px;
          color: #141414; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .csv-cta-btn {
          display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px;
          border-radius: 10px; background: rgba(30,169,82,0.1); border: 1px solid rgba(30,169,82,0.3);
          color: #1EA952; font-size: 12px; font-weight: 600; text-decoration: none;
          font-family: 'DM Sans', sans-serif; white-space: nowrap; min-height: 44px;
        }
        .csv-cta-link { background: rgba(58,53,48,0.04); border-color: #D8D0BC; color: #3A3530; }

        /* Footer */
        .csv-footer { padding: 24px 20px 12px; text-align: center; }
        .csv-footer-text {
          font-size: 12px; color: #7A7060; letter-spacing: 0.5px;
          font-family: 'DM Sans', sans-serif;
        }

        @media (min-width: 768px) {
          .csv-overlay {
            left: auto; right: 0; width: 560px; border-radius: 20px 0 0 20px;
            transform: translateX(100%);
          }
          .csv-overlay.open { transform: translateX(0); }
          .csv-table { font-size: 13px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .csv-overlay { transition: none; }
        }
      `}</style>
    </div>
    </>
  )
}
