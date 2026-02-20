import { useState, useMemo } from 'react'

interface UnidadAlquiler {
  id: number
  nombre_edificio: string | null
  nombre_proyecto: string | null
  zona: string
  dormitorios: number
  banos: number | null
  area_m2: number
  precio_mensual_bob: number
  precio_mensual_usd: number | null
  amoblado: string | null
  acepta_mascotas: boolean | null
  deposito_meses: number | null
  servicios_incluidos: string[] | null
  contrato_minimo_meses: number | null
  monto_expensas_bob: number | null
  piso: number | null
  estacionamientos: number | null
  baulera: boolean | null
  fotos_urls: string[]
  agente_whatsapp: string | null
  dias_en_mercado: number | null
  url: string
}

interface CompareSheetProps {
  open: boolean
  properties: UnidadAlquiler[]
  onClose: () => void
}

function dormLabel(d: number) { return d === 0 ? 'Estudio' : `${d} dorm` }
function fmt(n: number) { return n.toLocaleString('es-BO') }

function buildLeadUrl(p: UnidadAlquiler, msg: string, fuente: string, preguntas?: string[]) {
  const phone = p.agente_whatsapp?.replace(/\D/g, '') || ''
  const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
  const params = new URLSearchParams({
    phone, msg, prop_id: String(p.id), nombre: name,
    zona: p.zona || '', precio: String(p.precio_mensual_bob),
    dorms: String(p.dormitorios), broker_nombre: '', fuente,
  })
  if (preguntas && preguntas.length > 0) {
    params.set('preguntas', JSON.stringify(preguntas))
  }
  return `/api/lead-alquiler?${params.toString()}`
}

export default function CompareSheet({ open, properties, onClose }: CompareSheetProps) {
  const [selectedQs, setSelectedQs] = useState<Set<number>>(new Set())
  const MAX_QS = 3

  const props = useMemo(() => properties.slice(0, 3), [properties])

  // Calculate derived values
  const precioM2 = useMemo(() => props.map(p => p.area_m2 > 0 ? Math.round(p.precio_mensual_bob / p.area_m2) : 0), [props])
  const minPrecioM2 = useMemo(() => { const valid = precioM2.filter(v => v > 0); return valid.length ? Math.min(...valid) : 0 }, [precioM2])
  const costoTotal = useMemo(() => props.map(p => p.precio_mensual_bob + (p.monto_expensas_bob || 0)), [props])
  const minCostoTotal = useMemo(() => costoTotal.length ? Math.min(...costoTotal) : 0, [costoTotal])
  const depositos = useMemo(() => props.map(p => p.precio_mensual_bob * (p.deposito_meses || 1)), [props])

  // Insights
  const insights = useMemo(() => {
    const result: string[] = []
    if (props.length < 2) return result

    // Best price per m²
    const bestM2Idx = precioM2.indexOf(minPrecioM2)
    if (bestM2Idx >= 0 && minPrecioM2 > 0 && precioM2.filter(v => v === minPrecioM2).length === 1) {
      const name = props[bestM2Idx].nombre_edificio || props[bestM2Idx].nombre_proyecto || `Depto ${bestM2Idx + 1}`
      const worstM2 = Math.max(...precioM2.filter(v => v > 0))
      if (worstM2 > minPrecioM2) {
        const diff = Math.round(((worstM2 - minPrecioM2) / minPrecioM2) * 100)
        result.push(`${name} tiene el mejor valor por m² (Bs ${minPrecioM2}/m²), ${diff}% menos que el mas caro.`)
      }
    }

    // Negotiation opportunity based on days on market
    props.forEach(p => {
      const name = p.nombre_edificio || p.nombre_proyecto || 'Un depto'
      if (p.dias_en_mercado && p.dias_en_mercado > 30) {
        result.push(`${name} lleva ${p.dias_en_mercado} dias publicado — podrias negociar un 5-10% de descuento.`)
      }
    })

    // Furnished comparison
    const furnished = props.filter(p => p.amoblado === 'si' || p.amoblado === 'semi')
    const notFurnished = props.filter(p => p.amoblado === 'no' || !p.amoblado)
    if (furnished.length > 0 && notFurnished.length > 0) {
      const fNames = furnished.map(p => p.nombre_edificio || p.nombre_proyecto || 'un depto').join(' y ')
      result.push(`Solo ${fNames} ${furnished.length === 1 ? 'viene' : 'vienen'} amoblado${furnished.length > 1 ? 's' : ''} — ahorrás el costo de amueblar.`)
    }

    // Pets comparison
    const withPets = props.filter(p => p.acepta_mascotas)
    const noPets = props.filter(p => p.acepta_mascotas === false)
    if (withPets.length > 0 && noPets.length > 0) {
      const pNames = withPets.map(p => p.nombre_edificio || p.nombre_proyecto || 'un depto').join(' y ')
      result.push(`Solo ${pNames} acepta${withPets.length === 1 ? '' : 'n'} mascotas.`)
    }

    // Deposit difference
    const depValues = props.map(p => ({ name: p.nombre_edificio || p.nombre_proyecto || 'un depto', dep: p.deposito_meses || 1, total: p.precio_mensual_bob * (p.deposito_meses || 1) }))
    const maxDep = Math.max(...depValues.map(d => d.total))
    const minDep = Math.min(...depValues.map(d => d.total))
    if (maxDep > minDep && maxDep - minDep > 1000) {
      const cheapest = depValues.find(d => d.total === minDep)!
      result.push(`El deposito de ${cheapest.name} es Bs ${fmt(cheapest.total)} vs Bs ${fmt(maxDep)} — ahorrás Bs ${fmt(maxDep - minDep)} de entrada.`)
    }

    // Expensas comparison
    const withExpensas = props.filter(p => p.monto_expensas_bob && p.monto_expensas_bob > 0)
    if (withExpensas.length > 0 && withExpensas.length < props.length) {
      const names = withExpensas.map(p => p.nombre_edificio || p.nombre_proyecto || 'un depto').join(' y ')
      const totalExp = withExpensas.reduce((s, p) => s + (p.monto_expensas_bob || 0), 0)
      result.push(`${names} tiene${withExpensas.length > 1 ? 'n' : ''} expensas (Bs ${fmt(totalExp)}/mes extra) — los demas no reportan.`)
    }

    return result.slice(0, 4) // Max 4 insights
  }, [props, precioM2, minPrecioM2])

  // Questions for broker based on missing data
  const questions = useMemo(() => {
    const qs: Array<{ text: string; category: 'preguntar' | 'verificar' }> = []
    if (props.length === 0) return qs

    const anyMissingContract = props.some(p => !p.contrato_minimo_meses)
    const anyMissingDeposit = props.some(p => !p.deposito_meses)
    const anyMissingExpensas = props.some(p => !p.monto_expensas_bob)
    const anyMissingServices = props.some(p => !p.servicios_incluidos || p.servicios_incluidos.length === 0)
    const anyMissingPets = props.some(p => p.acepta_mascotas === null)

    // Always relevant questions
    qs.push({ text: 'Condiciones de ingreso: adelanto, garantia y comision del broker', category: 'preguntar' })
    qs.push({ text: 'La comision del broker la paga el inquilino, el propietario, o es compartida?', category: 'preguntar' })
    qs.push({ text: 'La garantia se devuelve al finalizar el contrato? En que condiciones?', category: 'preguntar' })
    qs.push({ text: 'Se puede negociar el precio con contrato de 12+ meses?', category: 'preguntar' })

    if (anyMissingContract) qs.push({ text: 'Cual es el contrato minimo?', category: 'preguntar' })
    if (anyMissingExpensas) qs.push({ text: 'Expensas incluidas o aparte? Cuanto son?', category: 'preguntar' })
    if (anyMissingServices) qs.push({ text: 'Que servicios incluye? (agua, luz, wifi, gas)', category: 'preguntar' })
    if (anyMissingDeposit) qs.push({ text: 'Cuantos meses de deposito requiere?', category: 'preguntar' })
    if (anyMissingPets) qs.push({ text: 'Se aceptan mascotas?', category: 'preguntar' })
    qs.push({ text: 'Fecha de disponibilidad para mudarse?', category: 'preguntar' })

    // Verification during visit
    qs.push({ text: 'Presion de agua — abrir canillas y ducha', category: 'verificar' })
    qs.push({ text: 'Estado de aires acondicionados (prenderlos)', category: 'verificar' })
    qs.push({ text: 'Ruido de la calle (especialmente en Equipetrol Centro)', category: 'verificar' })
    qs.push({ text: 'Manchas de humedad en techos y paredes', category: 'verificar' })
    if (props.some(p => p.amoblado === 'si' || p.amoblado === 'semi')) {
      qs.push({ text: 'Estado real del amoblado (las fotos pueden enganar)', category: 'verificar' })
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

  return (
    <div className={`cs-overlay ${open ? 'open' : ''}`}>
      {/* Header */}
      <div className="cs-header">
        <div className="cs-header-left">
          <div className="cs-title">Comparativo Express</div>
          <div className="cs-subtitle">{props.length} favoritos seleccionados</div>
        </div>
        <button className="cs-close" aria-label="Cerrar comparativo" onClick={onClose}>&times;</button>
      </div>

      <div className="cs-scroll">
        {/* Comparison Table */}
        <div className="cs-section">
          <div className="cs-label">COMPARACION</div>
          <div className="cs-table-wrap">
            <table className="cs-table">
              <thead>
                <tr>
                  <th className="cs-th-label"></th>
                  {props.map((p, i) => (
                    <th key={p.id} className="cs-th-name">
                      {p.fotos_urls[0] && (
                        <div className="cs-thumb" style={{ backgroundImage: `url(${p.fotos_urls[0]})` }} />
                      )}
                      <span className="cs-th-letter">{String.fromCharCode(65 + i)}</span>
                      <span className="cs-th-text">{p.nombre_edificio || p.nombre_proyecto || `Depto ${i + 1}`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cs-td-label">Precio/mes</td>
                  {props.map(p => (
                    <td key={p.id} className="cs-td">Bs {fmt(p.precio_mensual_bob)}</td>
                  ))}
                </tr>
                <tr className="cs-tr-highlight">
                  <td className="cs-td-label">Precio/m²/mes</td>
                  {props.map((p, i) => (
                    <td key={p.id} className={`cs-td ${precioM2[i] === minPrecioM2 && minPrecioM2 > 0 ? 'cs-best' : ''}`}>
                      Bs {precioM2[i]}{precioM2[i] === minPrecioM2 && minPrecioM2 > 0 ? ' ★' : ''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="cs-td-label">Area</td>
                  {props.map(p => <td key={p.id} className="cs-td">{p.area_m2}m²</td>)}
                </tr>
                <tr>
                  <td className="cs-td-label">Dorms</td>
                  {props.map(p => <td key={p.id} className="cs-td">{dormLabel(p.dormitorios)}</td>)}
                </tr>
                <tr>
                  <td className="cs-td-label">Zona</td>
                  {props.map(p => <td key={p.id} className="cs-td">{p.zona}</td>)}
                </tr>
                <tr>
                  <td className="cs-td-label">Amoblado</td>
                  {props.map(p => (
                    <td key={p.id} className={`cs-td ${p.amoblado === 'si' || p.amoblado === 'semi' ? 'cs-good' : ''}`}>
                      {p.amoblado === 'si' ? 'Si' : p.amoblado === 'semi' ? 'Semi' : p.amoblado === 'no' ? 'No' : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="cs-td-label">Mascotas</td>
                  {props.map(p => (
                    <td key={p.id} className={`cs-td ${p.acepta_mascotas ? 'cs-good' : ''}`}>
                      {p.acepta_mascotas === true ? 'Si' : p.acepta_mascotas === false ? 'No' : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="cs-td-label">Parqueo</td>
                  {props.map(p => <td key={p.id} className="cs-td">{p.estacionamientos ? `${p.estacionamientos} incl.` : '—'}</td>)}
                </tr>
                <tr>
                  <td className="cs-td-label">Piso</td>
                  {props.map(p => <td key={p.id} className="cs-td">{p.piso !== null ? (p.piso === 0 ? 'PB' : `${p.piso}`) : '—'}</td>)}
                </tr>
                <tr>
                  <td className="cs-td-label">Dias publicado</td>
                  {props.map(p => (
                    <td key={p.id} className={`cs-td ${p.dias_en_mercado && p.dias_en_mercado > 30 ? 'cs-warn' : ''}`}>
                      {p.dias_en_mercado ?? '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Costo Real */}
        <div className="cs-section">
          <div className="cs-label">COSTO REAL MENSUAL</div>
          <div className="cs-table-wrap">
            <table className="cs-table">
              <thead>
                <tr>
                  <th className="cs-th-label"></th>
                  {props.map((_, i) => <th key={i} className="cs-th-name"><span className="cs-th-letter">{String.fromCharCode(65 + i)}</span></th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cs-td-label">Alquiler</td>
                  {props.map(p => <td key={p.id} className="cs-td">Bs {fmt(p.precio_mensual_bob)}</td>)}
                </tr>
                <tr>
                  <td className="cs-td-label">Expensas</td>
                  {props.map(p => <td key={p.id} className="cs-td">{p.monto_expensas_bob ? `Bs ${fmt(p.monto_expensas_bob)}` : '—'}</td>)}
                </tr>
                <tr className="cs-tr-highlight">
                  <td className="cs-td-label">Total est.</td>
                  {props.map((p, i) => (
                    <td key={p.id} className={`cs-td cs-td-total ${costoTotal[i] === minCostoTotal ? 'cs-best' : ''}`}>
                      Bs {fmt(costoTotal[i])}{costoTotal[i] === minCostoTotal ? ' ★' : ''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="cs-td-label">Deposito entrada</td>
                  {props.map((p, i) => (
                    <td key={p.id} className="cs-td">
                      Bs {fmt(depositos[i])} <span className="cs-td-sub">({p.deposito_meses || 1} mes{(p.deposito_meses || 1) > 1 ? 'es' : ''})</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="cs-section">
            <div className="cs-label">INSIGHTS</div>
            <div className="cs-insights">
              {insights.map((insight, i) => (
                <div key={i} className="cs-insight">
                  <span className="cs-insight-dot" />
                  <span className="cs-insight-text">{insight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions for broker — selectable, max 3, included in WhatsApp */}
        <div className="cs-section">
          <div className="cs-label-row">
            <span className="cs-label">PREGUNTAS PARA EL BROKER</span>
            <span className="cs-label-hint">{selectedQs.size > 0 ? `${selectedQs.size}/${MAX_QS} — se incluyen en WhatsApp` : `Selecciona hasta ${MAX_QS}`}</span>
          </div>
          <div className="cs-questions">
            {askQuestions.map((q, i) => {
              const isSelected = selectedQs.has(i)
              const isDisabled = !isSelected && selectedQs.size >= MAX_QS
              return (
                <button key={i} className={`cs-question cs-q-selectable ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => toggleQuestion(i)} aria-pressed={isSelected}>
                  <span className={`cs-q-check ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3" style={{width:10,height:10}}><path d="M5 12l5 5L20 7"/></svg>}
                  </span>
                  <span className="cs-q-text">{q.text}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="cs-section">
          <div className="cs-label">DURANTE LA VISITA, FIJATE EN</div>
          <div className="cs-questions">
            {checkQuestions.map((q, i) => (
              <div key={i} className="cs-question">
                <span className="cs-q-dot" />
                <span className="cs-q-text">{q.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* WhatsApp CTAs */}
        <div className="cs-section">
          <div className="cs-label">CONTACTAR</div>
          <div className="cs-ctas">
            {props.map((p, i) => {
              const name = p.nombre_edificio || p.nombre_proyecto || `Depto ${i + 1}`
              const selectedTexts = Array.from(selectedQs).sort().map(idx => askQuestions[idx]?.text).filter(Boolean)
              let msgText = `Hola, vi el departamento de ${dormLabel(p.dormitorios)} en ${name} por Bs ${fmt(p.precio_mensual_bob)}/mes en Simon (simonbo.com). Quisiera coordinar una visita.`
              if (selectedTexts.length > 0) {
                msgText += `\n\nAntes, me gustaria saber:\n${selectedTexts.map(t => `— ${t}`).join('\n')}`
              }
              msgText += '\n\nGracias!'
              return (
                <div key={p.id} className="cs-cta-row">
                  <span className="cs-cta-letter">{String.fromCharCode(65 + i)}</span>
                  <span className="cs-cta-name">{name}</span>
                  {p.agente_whatsapp ? (
                    <a href={buildLeadUrl(p, msgText, 'comparativo', selectedTexts.length > 0 ? selectedTexts : undefined)} target="_blank" rel="noopener noreferrer" className="cs-cta-btn">
                      <svg viewBox="0 0 24 24" fill="#25d366" style={{ width: 16, height: 16 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                      WhatsApp
                    </a>
                  ) : (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="cs-cta-btn cs-cta-link">Ver anuncio</a>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="cs-footer">
          <div className="cs-footer-text">Generado por Simon — Inteligencia Inmobiliaria</div>
        </div>
      </div>

      <style jsx>{`
        .cs-overlay {
          position: fixed; inset: 0; z-index: 300; background: #0f0f0f;
          transform: translateY(100%); transition: transform 0.35s cubic-bezier(0.32,0.72,0,1);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .cs-overlay.open { transform: translateY(0); }
        .cs-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; padding-top: max(16px, env(safe-area-inset-top));
          border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
        }
        .cs-header-left { display: flex; flex-direction: column; gap: 2px; }
        .cs-title { font-family: 'Cormorant Garamond', serif; font-size: 24px; color: #fff; line-height: 1.2; }
        .cs-subtitle { font-size: 11px; color: rgba(255,255,255,0.5); font-family: 'Manrope', sans-serif; letter-spacing: 0.5px; }
        .cs-close {
          width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15);
          background: transparent; color: rgba(255,255,255,0.7); font-size: 20px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .cs-scroll {
          flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
          scrollbar-width: none; padding-bottom: max(24px, env(safe-area-inset-bottom));
        }
        .cs-scroll::-webkit-scrollbar { display: none; }
        .cs-section { padding: 20px 20px 8px; }
        .cs-label {
          font-size: 10px; font-weight: 600; color: #c9a959; letter-spacing: 2px;
          margin-bottom: 14px; font-family: 'Manrope', sans-serif;
        }
        .cs-table-wrap { overflow-x: auto; margin: 0 -4px; }
        .cs-table {
          width: 100%; border-collapse: collapse; font-family: 'Manrope', sans-serif;
          font-size: 12px; table-layout: fixed;
        }
        .cs-th-label { width: 30%; }
        .cs-th-name {
          text-align: center; padding: 8px 6px 12px; vertical-align: bottom;
          font-weight: 400; color: rgba(255,255,255,0.9); font-size: 11px;
        }
        .cs-thumb {
          width: 48px; height: 48px; border-radius: 8px; margin: 0 auto 6px;
          background-size: cover; background-position: center;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .cs-th-letter {
          display: inline-flex; width: 20px; height: 20px; border-radius: 50%;
          background: #c9a959; color: #0a0a0a; font-size: 10px; font-weight: 700;
          align-items: center; justify-content: center; margin-right: 4px;
        }
        .cs-th-text {
          display: block; margin-top: 4px; font-size: 11px; line-height: 1.2;
          color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cs-td-label {
          padding: 8px 8px 8px 0; color: rgba(255,255,255,0.5); font-size: 11px;
          border-bottom: 1px solid rgba(255,255,255,0.04); white-space: nowrap;
        }
        .cs-td {
          text-align: center; padding: 8px 4px; color: rgba(255,255,255,0.85);
          border-bottom: 1px solid rgba(255,255,255,0.04); font-variant-numeric: tabular-nums;
        }
        .cs-td-sub { font-size: 9px; color: rgba(255,255,255,0.4); }
        .cs-td-total { font-weight: 600; }
        .cs-tr-highlight td { background: rgba(201,169,89,0.04); }
        .cs-best { color: #c9a959 !important; font-weight: 600; }
        .cs-good { color: #4ade80; }
        .cs-warn { color: #fbbf24; }

        /* Insights */
        .cs-insights { display: flex; flex-direction: column; gap: 10px; }
        .cs-insight {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 12px 14px; border-radius: 10px;
          background: rgba(201,169,89,0.04); border: 1px solid rgba(201,169,89,0.12);
        }
        .cs-insight-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #c9a959;
          flex-shrink: 0; margin-top: 6px;
        }
        .cs-insight-text {
          font-family: 'Manrope', sans-serif; font-size: 13px; line-height: 1.5;
          color: rgba(255,255,255,0.85);
        }

        /* Questions */
        .cs-label-row {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 14px; gap: 8px;
        }
        .cs-label-row .cs-label { margin-bottom: 0; }
        .cs-label-hint {
          font-size: 10px; color: rgba(201,169,89,0.6); font-family: 'Manrope', sans-serif;
          letter-spacing: 0.3px; white-space: nowrap;
        }
        .cs-questions { display: flex; flex-direction: column; gap: 6px; }
        .cs-question {
          display: flex; gap: 10px; align-items: center; padding: 10px 12px;
          border-radius: 8px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .cs-q-selectable {
          cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .cs-q-selectable:hover { border-color: rgba(255,255,255,0.12); }
        .cs-q-selectable.selected {
          border-color: rgba(201,169,89,0.35); background: rgba(201,169,89,0.05);
        }
        .cs-q-selectable.disabled { opacity: 0.35; cursor: default; }
        .cs-q-check {
          width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, border-color 0.15s;
        }
        .cs-q-check.checked {
          background: #c9a959; border-color: #c9a959;
        }
        .cs-q-dot {
          width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,0.25);
          flex-shrink: 0;
        }
        .cs-q-text {
          font-family: 'Manrope', sans-serif; font-size: 12px; line-height: 1.4;
          color: rgba(255,255,255,0.75);
        }

        /* CTAs */
        .cs-ctas { display: flex; flex-direction: column; gap: 8px; }
        .cs-cta-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px;
          border-radius: 10px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .cs-cta-letter {
          width: 24px; height: 24px; border-radius: 50%; background: #c9a959;
          color: #0a0a0a; font-size: 11px; font-weight: 700; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Manrope', sans-serif;
        }
        .cs-cta-name {
          flex: 1; font-family: 'Manrope', sans-serif; font-size: 13px;
          color: rgba(255,255,255,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cs-cta-btn {
          display: flex; align-items: center; gap: 6px; padding: 8px 14px;
          border-radius: 8px; background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.3);
          color: #25d366; font-size: 12px; font-weight: 600; text-decoration: none;
          font-family: 'Manrope', sans-serif; white-space: nowrap;
        }
        .cs-cta-link { background: rgba(201,169,89,0.1); border-color: rgba(201,169,89,0.3); color: #c9a959; }

        /* Footer */
        .cs-footer { padding: 24px 20px 12px; text-align: center; }
        .cs-footer-text {
          font-size: 10px; color: rgba(255,255,255,0.25); letter-spacing: 1px;
          font-family: 'Manrope', sans-serif;
        }

        @media (min-width: 768px) {
          .cs-overlay {
            left: auto; right: 0; width: 560px; border-radius: 20px 0 0 20px;
            transform: translateX(100%);
          }
          .cs-overlay.open { transform: translateX(0); }
          .cs-table { font-size: 13px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cs-overlay { transition: none; }
        }
      `}</style>
    </div>
  )
}
