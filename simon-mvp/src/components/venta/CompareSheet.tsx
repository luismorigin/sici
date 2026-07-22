import { useState, useMemo } from 'react'
import { dormLabel, firstName } from '@/lib/format-utils'
import type { UnidadVenta } from '@/lib/supabase'
import { displayZona } from '@/lib/zonas'
import { openWhatsApp } from '@/lib/whatsapp'
import { trackEvent } from '@/lib/analytics'
import { buildAtribucionWaMessage } from '@/lib/wa-message'

interface CompareSheetProps {
  open: boolean
  properties: UnidadVenta[]
  // Posición fiduciaria vs. deptos similares (por id) — se computa en la página
  // con TODO el mercado (no solo los 2-3 favoritos). null = sin base suficiente.
  chips?: Map<number, { pos: 'bajo' | 'dentro' | 'sobre'; count: number }> | null
  onClose: () => void
  // Cuando viene, el comparativo está embebido en una shortlist pública (/b/[hash])
  // → ocultar preguntas al broker, "durante la visita" y CTAs WA por propiedad.
  // Reemplaza por un único CTA "Consultar por WhatsApp" al broker que comparte.
  publicShareBroker?: { nombre: string; telefono: string } | null
  // contacto_directo (B2C, migración 256): cuando true (solo simon-asistente),
  // el comparativo vuelve al "modo feed" — muestra preguntas, durante-la-visita,
  // días publicado, tc_sospechoso y CTAs WA al captador por propiedad, y suprime
  // el CTA único al broker dueño. Default false = B2B intacto.
  contactoDirecto?: boolean
  // Barra de acciones desktop: "Abrir favoritos" abre el panel de favoritos
  // de la página (drawer de perfil). Solo se muestra si viene el handler.
  onOpenFavorites?: () => void
}

// WhatsApp oficial de Simon (negocio) — mismo número que los feeds.
const SIMON_WHATSAPP = '59177066308'

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

export default function CompareSheet({ open, properties, chips = null, onClose, publicShareBroker = null, contactoDirecto = false, onOpenFavorites }: CompareSheetProps) {
  const [selectedQs, setSelectedQs] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)
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

    // Insight fiduciario (diferenciador): quién está más barato que sus similares.
    if (chips) {
      const bajos = props.map((p, i) => ({ i, c: chips.get(p.id) })).filter(x => x.c?.pos === 'bajo')
      if (bajos.length === 1) result.push(`${nameAt(bajos[0].i)} es el mejor precio por m² frente a deptos similares (más barato que su mercado).`)
      else if (bajos.length > 1) result.push(`${bajos.map(x => nameAt(x.i)).join(' y ')} están más baratos que deptos similares.`)
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
    //    Visible al feed público / broker armando shortlist. En publicShareMode
    //    B2B (cliente final viendo /b/[hash]) este aviso es señal interna y no
    //    debe filtrarse — el broker ya recibió un toast al seleccionar la prop.
    //    EXCEPCIÓN: en contactoDirecto (B2C, bot) SÍ se muestra al cliente, como
    //    en el feed (decisión founder 2026-06-03: "mostrarlo como el feed").
    const sospechosasIdx: number[] = []
    props.forEach((p, i) => { if (p.tc_sospechoso === true) sospechosasIdx.push(i) })
    if (sospechosasIdx.length > 0 && (!publicShareMode || contactoDirecto)) {
      const names = sospechosasIdx.map(i => nameAt(i)).join(' y ')
      result.unshift(`${names} tiene${sospechosasIdx.length > 1 ? 'n' : ''} precio sospechoso — confirmar tipo de cambio con el broker antes de comparar.`)
    }

    return result.slice(0, 4)
  }, [props, precioM2, minPrecioM2, publicShareMode, contactoDirecto, chips])

  // Ocultar filas donde ninguna prop aporta data util (todo null/vacio).
  const showBanos = props.some(p => p.banos !== null && p.banos !== undefined)
  const showPiso = props.some(p => p.piso !== null && p.piso !== undefined)

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
    // Formato unificado con atribución (el Comparativo es siempre modo público).
    return buildAtribucionWaMessage({
      nombre: p.proyecto || 'este departamento',
      url: p.url,
      preguntas: selectedTexts,
      ref: `SIM-V${p.id}`,
      comparando: true,
    })
  }

  return (
    <>
    <div className={`csv-overlay ${open ? 'open' : ''}`}>
      {/* Header */}
      <div className="csv-header">
        <div className="csv-header-left">
          <div className="csv-title">Comparar favoritos</div>
          <div className="csv-subtitle">{props.length} deptos seleccionados</div>
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
                {chips && props.some(p => chips.get(p.id)) && (
                  <tr>
                    <td className="csv-td-label">vs. similares</td>
                    {props.map(p => {
                      const c = chips.get(p.id)
                      if (!c) return <td key={p.id} className="csv-td csv-td-muted">—</td>
                      const txt = c.pos === 'bajo' ? 'Más barato' : c.pos === 'sobre' ? 'Más caro' : 'En línea'
                      return <td key={p.id} className={`csv-td ${c.pos === 'bajo' ? 'csv-good' : ''}`}>{txt} · {c.count}</td>
                    })}
                  </tr>
                )}
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
                <tr>
                  <td className="csv-td-label">Incluye</td>
                  {props.map(p => {
                    const eq = p.equipamiento_detectado || []
                    const amob = eq.some(e => /amoblad/i.test(e))
                    const items: string[] = []
                    if (amob || eq.length > 0) items.push(amob ? 'Amoblado' : 'Equipado')
                    if (p.parqueo_incluido === true || (p.estacionamientos != null && p.estacionamientos > 0)) items.push('Parqueo')
                    if (p.baulera === true) items.push('Baulera')
                    return <td key={p.id} className={`csv-td ${items.length ? '' : 'csv-td-muted'}`}>{items.length ? items.join(' · ') : '—'}</td>
                  })}
                </tr>
                {props.some(p => (p.amenities_confirmados || []).length > 0) && (
                  <tr>
                    <td className="csv-td-label">Amenidades</td>
                    {props.map(p => {
                      const am = (p.amenities_confirmados || []).slice(0, 3)
                      return <td key={p.id} className={`csv-td ${am.length ? '' : 'csv-td-muted'}`}>{am.length ? am.join(' · ') : '—'}</td>
                    })}
                  </tr>
                )}
                {showPiso && (
                  <tr>
                    <td className="csv-td-label">Piso</td>
                    {props.map(p => <td key={p.id} className="csv-td">{p.piso || '—'}</td>)}
                  </tr>
                )}
                {/* Días publicado — oculto en publicShareMode B2B. El broker no
                    quiere que su cliente vea cuánto lleva una propiedad en
                    mercado (señal de negociación que arruinaría la conversación).
                    En contactoDirecto (B2C) se muestra, como el feed (§6 dec.3). */}
                {(!publicShareMode || contactoDirecto) && (
                  <tr>
                    <td className="csv-td-label">Publicado</td>
                    {props.map(p => (
                      <td key={p.id} className={`csv-td ${p.dias_en_mercado && p.dias_en_mercado > 90 ? 'csv-warn' : ''}`}>
                        {p.dias_en_mercado ?? '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="csv-section">
            <div className="csv-label"><span className="csv-label-dot" />LO QUE DICEN LOS DATOS</div>
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

        {/* Questions for broker — oculto en publicShareMode B2B; en contactoDirecto (B2C) se muestran */}
        {(!publicShareMode || contactoDirecto) && (
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

        {/* Durante la visita — oculto en publicShareMode B2B; en contactoDirecto (B2C) se muestra */}
        {(!publicShareMode || contactoDirecto) && (
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

        {/* CTA único al broker que comparte (solo publicShareMode B2B; en contactoDirecto va al captador) */}
        {publicShareMode && !contactoDirecto && publicShareBroker && (() => {
          const clienteLines = props.map(p => {
            const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
            return `• ${p.proyecto} (${dorms} · ${Math.round(p.area_m2)}m² · $us ${Math.round(p.precio_usd).toLocaleString('en-US')})`
          }).join('\n')
          const msg = `Hola ${firstName(publicShareBroker.nombre)}, estoy interesado en estas alternativas:\n\n${clienteLines}\n\n¿Podemos coordinar?`
          return (
          <div className="csv-section">
            <a
              href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, background:'#25D366', color:'#fff', padding:'14px 20px', borderRadius:10, textDecoration:'none', fontWeight:600, fontSize:15, fontFamily:"'DM Sans',sans-serif" }}
              onClick={(e) => { e.preventDefault(); openWhatsApp(publicShareBroker.telefono, msg) }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
              Consultar por WhatsApp
            </a>
          </div>
          )
        })()}

        {/* WhatsApp CTAs por propiedad — oculto en publicShareMode B2B; en contactoDirecto (B2C) van al captador */}
        {(!publicShareMode || contactoDirecto) && (
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
                      onClick={(e) => {
                        e.preventDefault()
                        // trackEvent mínimo (§9): cierra el gap histórico — esta CTA por
                        // captador nunca trackeaba. source segmentado para no contaminar el feed.
                        trackEvent('click_whatsapp_venta', { property_id: p.id, property_name: name, zona: displayZona(p.zona), precio_usd: Math.round(p.precio_usd), origen: contactoDirecto ? 'public_share_directo' : 'compare_sheet' })
                        openWhatsApp(phone, msgText)
                      }}
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

        {/* Nota fiduciaria — mismo tono que el resto del producto */}
        <div className="csv-nota">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Los datos faltantes se muestran como no especificados. Simon no elige por vos; muestra contexto comparable.</span>
        </div>

        {/* Acciones — barra desktop (compartir · abrir favoritos · WhatsApp) */}
        {!publicShareMode && (
          <div className="csv-actions">
            <button type="button" className="csv-action-btn" onClick={() => {
              const lines = props.map((p, i) => `${String.fromCharCode(65 + i)}) ${p.proyecto} — ${p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`}, ${Math.round(p.area_m2)}m², $us ${fmt(Math.round(p.precio_usd))}`).join('\n')
              const text = `Comparativo Simon (venta):\n${lines}\n\nhttps://simonbo.com/ventas`
              trackEvent('share_compare_venta', { count: props.length })
              if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                navigator.share({ title: 'Comparativo Simon', text }).catch(() => {})
              } else if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
              }
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 15, height: 15 }}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              {copied ? 'Copiado ✓' : 'Compartir comparativo'}
            </button>
            {onOpenFavorites && (
              <button type="button" className="csv-action-btn" onClick={() => { onClose(); onOpenFavorites() }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 15, height: 15 }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                Abrir favoritos
              </button>
            )}
            <a className="csv-action-btn csv-action-wa"
              href={`https://wa.me/${SIMON_WHATSAPP}?text=${encodeURIComponent(`Hola Simon, estoy comparando estas opciones de venta y quiero orientación:\n${props.map((p, i) => `${String.fromCharCode(65 + i)}) ${p.proyecto} ($us ${fmt(Math.round(p.precio_usd))})`).join('\n')}`)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent('click_whatsapp_venta', { origen: 'compare_actions', count: props.length })}>
              <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 15, height: 15 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
              Consultar por WhatsApp
            </a>
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
        .csv-td-muted { color: rgba(20,20,20,0.32); }

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

        /* Nota fiduciaria + acciones */
        .csv-nota {
          display: flex; gap: 8px; align-items: flex-start;
          margin: 20px 20px 0; padding: 12px 14px; border-radius: 12px;
          background: #FAFAF8; border: 1px solid #D8D0BC; color: #7A7060;
          font-size: 12.5px; line-height: 1.5; font-family: 'DM Sans', sans-serif;
        }
        .csv-actions { display: flex; flex-wrap: wrap; gap: 10px; padding: 14px 20px 4px; }
        .csv-action-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          padding: 11px 16px; border-radius: 10px; background: transparent;
          border: 1px solid #C9C0AA; color: #3A3530; font-size: 13px; font-weight: 600;
          font-family: 'DM Sans', sans-serif; cursor: pointer; text-decoration: none;
        }
        .csv-action-btn:hover { border-color: #7A7060; }
        .csv-action-wa { background: #1EA952; border-color: #1EA952; color: #fff; margin-left: auto; }
        .csv-action-wa:hover { border-color: #1EA952; opacity: 0.92; }

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

        /* Desktop ancho: la tabla A/B/C aprovecha el espacio de la mesa de decisión */
        @media (min-width: 1100px) {
          .csv-overlay { width: min(1040px, 92vw); }
          .csv-scroll { padding-left: 8px; padding-right: 8px; }
          .csv-thumb { width: 76px; height: 76px; border-radius: 12px; }
          .csv-th-text { font-size: 13px; white-space: normal; }
          .csv-table { font-size: 14px; }
          .csv-td { padding: 10px 6px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .csv-overlay { transition: none; }
        }
      `}</style>
    </div>
    </>
  )
}
