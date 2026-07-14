import { useState, useMemo } from 'react'
import { dormLabel, firstName } from '@/lib/format-utils'
import { triggerWhatsAppCapture } from '@/hooks/useWhatsAppCapture'
import { buildAlquilerWaMessage } from '@/lib/wa-message'
import { openWhatsApp } from '@/lib/whatsapp'
import { trackEvent } from '@/lib/analytics'

// WhatsApp oficial de Simon (negocio) — mismo número que los feeds.
const SIMON_WHATSAPP = '59177066308'

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
  // publicShareMode: cliente en /b/[hash]. CTAs WA van al broker (no al agente
  // original) y las "preguntas para el broker" se ocultan (el cliente habla
  // directo con el broker, no curamos preguntas).
  publicShareBroker?: { nombre: string; telefono: string; foto_url: string | null; slug: string } | null
  // contacto_directo (B2C, migración 256): cuando true (solo simon-asistente),
  // el comparativo vuelve al "modo feed" — muestra preguntas, durante-la-visita,
  // días publicado y el insight de negociación, y los CTA por propiedad usan
  // triggerWhatsAppCapture (el hook intercepta vía _contactoDirecto → captador
  // directo, sin modal, fuente public_share_directo). Default false = B2B intacto.
  contactoDirecto?: boolean
  // Barra de acciones desktop: "Abrir favoritos" abre el panel de favoritos
  // de la página (drawer de perfil). Solo se muestra si viene el handler.
  onOpenFavorites?: () => void
}

function fmt(n: number) { return n.toLocaleString('es-BO') }

function buildClientToBrokerCompareMessage(props: UnidadAlquiler[], brokerName: string): string {
  const lines = props.map((p, i) => {
    const letter = String.fromCharCode(65 + i)
    const name = p.nombre_edificio || p.nombre_proyecto || `Depto ${letter}`
    const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
    return `${letter}) ${name} — ${dorms}, ${Math.round(p.area_m2)}m², Bs ${fmt(p.precio_mensual_bob)}/mes`
  }).join('\n')
  return `Hola ${firstName(brokerName)}, estoy comparando estas opciones y me gustaría conversar:\n\n${lines}`
}

export default function CompareSheet({ open, properties, onClose, publicShareBroker = null, contactoDirecto = false, onOpenFavorites }: CompareSheetProps) {
  const publicShareMode = publicShareBroker !== null
  const [selectedQs, setSelectedQs] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)
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

    // Negotiation opportunity based on days on market.
    // Oculto en publicShareMode B2B: el broker no quiere que su cliente vea cuánto
    // lleva una propiedad en mercado (señal que invita a negociar y arruina
    // la posición del broker en la conversación). En contactoDirecto (B2C, sin
    // broker dueño) se muestra, como el feed — empodera al cliente.
    if (!publicShareMode || contactoDirecto) {
      props.forEach(p => {
        const name = p.nombre_edificio || p.nombre_proyecto || 'Un depto'
        if (p.dias_en_mercado && p.dias_en_mercado > 30) {
          result.push(`${name} lleva ${p.dias_en_mercado} dias publicado — podrias negociar un 5-10% de descuento.`)
        }
      })
    }

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
  }, [props, precioM2, minPrecioM2, publicShareMode, contactoDirecto])

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
    <>
    <div className={`cs-overlay ${open ? 'open' : ''}`}>
      {/* Header */}
      <div className="cs-header">
        <div className="cs-header-left">
          <div className="cs-title">Comparar favoritos</div>
          <div className="cs-subtitle">{props.length} favoritos seleccionados</div>
        </div>
        <button className="cs-close" aria-label="Cerrar comparativo" onClick={onClose}>&times;</button>
      </div>

      <div className="cs-scroll">
        {/* Comparison Table */}
        <div className="cs-section">
          <div className="cs-label"><span className="cs-label-dot" />COMPARACION</div>
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
                {/* Días publicado — oculto en publicShareMode B2B. El broker no
                    quiere que su cliente vea cuánto lleva una propiedad en
                    mercado (señal de negociación que arruinaría la conversación).
                    En contactoDirecto (B2C) se muestra, como el feed. */}
                {(!publicShareMode || contactoDirecto) && (
                  <tr>
                    <td className="cs-td-label">Dias publicado</td>
                    {props.map(p => (
                      <td key={p.id} className={`cs-td ${p.dias_en_mercado && p.dias_en_mercado > 30 ? 'cs-warn' : ''}`}>
                        {p.dias_en_mercado ?? '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Costo Real */}
        <div className="cs-section">
          <div className="cs-label"><span className="cs-label-dot" />COSTO REAL MENSUAL</div>
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
            <div className="cs-label"><span className="cs-label-dot" />INSIGHTS</div>
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

        {/* Questions for broker — selectable, max 3, included in WhatsApp.
            Ocultas en publicShareMode B2B (el cliente habla directo con su broker,
            sin preguntas curadas). En contactoDirecto (B2C) se muestran (van al captador). */}
        {(!publicShareMode || contactoDirecto) && (
          <div className="cs-section">
            <div className="cs-label-row">
              <span className="cs-label"><span className="cs-label-dot" />PREGUNTAS PARA EL BROKER</span>
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
                      {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="#EDE8DC" strokeWidth="3" style={{width:10,height:10}}><path d="M5 12l5 5L20 7"/></svg>}
                    </span>
                    <span className="cs-q-text">{q.text}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* "Durante la visita, fíjate en" — oculto en publicShareMode B2B
            (el cliente ya coordinó con su broker, la guía es redundante).
            En contactoDirecto (B2C) se muestra, como el feed. */}
        {(!publicShareMode || contactoDirecto) && (
          <div className="cs-section">
            <div className="cs-label"><span className="cs-label-dot" />DURANTE LA VISITA, FIJATE EN</div>
            <div className="cs-questions">
              {checkQuestions.map((q, i) => (
                <div key={i} className="cs-question">
                  <span className="cs-q-dot" />
                  <span className="cs-q-text">{q.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WhatsApp CTAs */}
        <div className="cs-section">
          <div className="cs-label"><span className="cs-label-dot" />CONTACTAR</div>
          {publicShareMode && !contactoDirecto && publicShareBroker ? (
            // En publicShareMode B2B: un solo CTA al broker mencionando las 3 opciones comparadas
            // (en contactoDirecto cae a la rama por-propiedad → captador vía el hook)
            <div className="cs-ctas">
              <div className="cs-cta-row cs-cta-row-broker">
                <span className="cs-cta-name" style={{ flex: 1 }}>
                  Escribir a {publicShareBroker.nombre}
                </span>
                <a
                  href={`https://wa.me/${publicShareBroker.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(buildClientToBrokerCompareMessage(props, publicShareBroker.nombre))}`}
                  target="_blank" rel="noopener noreferrer" className="cs-cta-btn"
                  onClick={(e) => { e.preventDefault(); openWhatsApp(publicShareBroker.telefono, buildClientToBrokerCompareMessage(props, publicShareBroker.nombre)) }}
                >
                  <svg viewBox="0 0 24 24" fill="#1EA952" style={{ width: 16, height: 16 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                  WhatsApp
                </a>
              </div>
            </div>
          ) : (
            <div className="cs-ctas">
              {props.map((p, i) => {
                const name = p.nombre_edificio || p.nombre_proyecto || `Depto ${i + 1}`
                const selectedTexts = Array.from(selectedQs).sort().map(idx => askQuestions[idx]?.text).filter(Boolean) as string[]
                const msgText = buildAlquilerWaMessage(p, {
                  preguntas: selectedTexts,
                  atribucion: true,
                  comparando: true,
                })
                return (
                  <div key={p.id} className="cs-cta-row">
                    <span className="cs-cta-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="cs-cta-name">{name}</span>
                    {p.agente_whatsapp ? (
                      <a href="#" onClick={(e) => triggerWhatsAppCapture(e, p, msgText, 'comparativo', selectedTexts.length > 0 ? selectedTexts : undefined)} className="cs-cta-btn">
                        <svg viewBox="0 0 24 24" fill="#1EA952" style={{ width: 16, height: 16 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                        WhatsApp
                      </a>
                    ) : (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="cs-cta-btn cs-cta-link">Ver anuncio</a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Nota fiduciaria — mismo tono que el resto del producto */}
        <div className="cs-nota">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Los datos faltantes se muestran como no especificados. Simon no elige por vos; muestra contexto comparable.</span>
        </div>

        {/* Acciones — barra desktop (compartir · abrir favoritos · WhatsApp) */}
        {!publicShareMode && (
          <div className="cs-actions">
            <button type="button" className="cs-action-btn" onClick={() => {
              const lines = props.map((p, i) => `${String.fromCharCode(65 + i)}) ${p.nombre_edificio || p.nombre_proyecto || `Depto ${i + 1}`} — ${p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`}, ${Math.round(p.area_m2)}m², Bs ${fmt(p.precio_mensual_bob)}/mes`).join('\n')
              const text = `Comparativo Simon (alquiler):\n${lines}\n\nhttps://simonbo.com/alquileres`
              trackEvent('share_compare_alquiler', { count: props.length })
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
              <button type="button" className="cs-action-btn" onClick={() => { onClose(); onOpenFavorites() }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 15, height: 15 }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                Abrir favoritos
              </button>
            )}
            <a className="cs-action-btn cs-action-wa"
              href={`https://wa.me/${SIMON_WHATSAPP}?text=${encodeURIComponent(`Hola Simon, estoy comparando estos alquileres y quiero orientación:\n${props.map((p, i) => `${String.fromCharCode(65 + i)}) ${p.nombre_edificio || p.nombre_proyecto || `Depto ${i + 1}`} (Bs ${fmt(p.precio_mensual_bob)}/mes)`).join('\n')}`)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent('click_whatsapp', { source: 'compare_actions_alquiler', count: props.length })}>
              <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 15, height: 15 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
              Consultar por WhatsApp
            </a>
          </div>
        )}

        <div className="cs-footer">
          <div className="cs-footer-text">Generado por Simon — Inteligencia Inmobiliaria</div>
        </div>
      </div>

      <style jsx>{`
        .cs-overlay {
          position: fixed; inset: 0; z-index: 300; background: #EDE8DC;
          transform: translateY(100%); transition: transform 0.35s cubic-bezier(0.32,0.72,0,1);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .cs-overlay.open { transform: translateY(0); }
        .cs-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; padding-top: max(16px, env(safe-area-inset-top));
          background: #141414; flex-shrink: 0;
          border-radius: 0 0 14px 14px;
        }
        .cs-header-left { display: flex; flex-direction: column; gap: 2px; }
        .cs-title { font-family: 'Figtree', sans-serif; font-size: 24px; font-weight: 500; color: #EDE8DC; line-height: 1.2; }
        .cs-subtitle { font-size: 12px; color: #9A8E7A; font-family: 'DM Sans', sans-serif; letter-spacing: 0.5px; }
        .cs-close {
          width: 44px; height: 44px; border-radius: 50%; border: none;
          background: transparent; color: #9A8E7A; font-size: 20px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .cs-scroll {
          flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
          scrollbar-width: none; padding-bottom: max(24px, env(safe-area-inset-bottom));
        }
        .cs-scroll::-webkit-scrollbar { display: none; }
        .cs-section { padding: 20px 20px 8px; }
        .cs-label {
          font-size: 12px; font-weight: 600; color: #7A7060; letter-spacing: 0.5px;
          margin-bottom: 14px; font-family: 'DM Sans', sans-serif; text-transform: uppercase;
          display: flex; align-items: center; gap: 8px;
        }
        .cs-label-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #3A6A48;
          flex-shrink: 0;
        }
        .cs-table-wrap { overflow-x: auto; margin: 0 -4px; }
        .cs-table {
          width: 100%; border-collapse: collapse; font-family: 'DM Sans', sans-serif;
          font-size: 13px; table-layout: fixed;
        }
        .cs-th-label { width: 30%; }
        .cs-th-name {
          text-align: center; padding: 8px 6px 12px; vertical-align: bottom;
          font-weight: 400; color: #141414; font-size: 12px;
        }
        .cs-thumb {
          width: 48px; height: 48px; border-radius: 10px; margin: 0 auto 6px;
          background-size: cover; background-position: center;
          border: 1px solid #D8D0BC;
        }
        .cs-th-letter {
          display: inline-flex; width: 20px; height: 20px; border-radius: 50%;
          background: #141414; color: #EDE8DC; font-size: 12px; font-weight: 700;
          align-items: center; justify-content: center; margin-right: 4px;
        }
        .cs-th-text {
          display: block; margin-top: 4px; font-size: 12px; line-height: 1.2;
          color: #3A3530; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cs-td-label {
          padding: 8px 8px 8px 0; color: #7A7060; font-size: 12px;
          border-bottom: 1px solid #D8D0BC; white-space: nowrap;
        }
        .cs-td {
          text-align: center; padding: 8px 4px; color: #141414;
          border-bottom: 1px solid #D8D0BC; font-variant-numeric: tabular-nums;
        }
        .cs-td-sub { font-size: 12px; color: #7A7060; }
        .cs-td-total { font-weight: 600; }
        .cs-tr-highlight td { background: rgba(58,106,72,0.04); }
        .cs-best { color: #3A6A48 !important; font-weight: 600; }
        .cs-good { color: #3A6A48; }
        .cs-warn { color: #7A7060; font-style: italic; }

        /* Insights */
        .cs-insights { display: flex; flex-direction: column; gap: 10px; }
        .cs-insight {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 12px 14px; border-radius: 14px;
          background: #FAFAF8; border: 1px solid #D8D0BC;
          box-shadow: 0 2px 8px rgba(58,53,48,0.06);
        }
        .cs-insight-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #3A6A48;
          flex-shrink: 0; margin-top: 6px;
        }
        .cs-insight-text {
          font-family: 'DM Sans', sans-serif; font-size: 15px; line-height: 1.5;
          color: #3A3530;
        }

        /* Questions */
        .cs-label-row {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 14px; gap: 8px;
        }
        .cs-label-row .cs-label { margin-bottom: 0; }
        .cs-label-hint {
          font-size: 12px; color: #7A7060; font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.3px; white-space: nowrap;
        }
        .cs-questions { display: flex; flex-direction: column; gap: 6px; }
        .cs-question {
          display: flex; gap: 10px; align-items: center; padding: 10px 12px;
          border-radius: 14px; background: #FAFAF8;
          border: 1px solid #D8D0BC;
        }
        .cs-q-selectable {
          cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .cs-q-selectable:hover { border-color: #7A7060; }
        .cs-q-selectable.selected {
          border-color: #3A6A48; border-width: 2px; background: #FAFAF8;
        }
        .cs-q-selectable.disabled { opacity: 0.35; cursor: default; }
        .cs-q-check {
          width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0;
          border: 1.5px solid #D8D0BC;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, border-color 0.15s;
        }
        .cs-q-check.checked {
          background: #141414; border-color: #141414;
        }
        .cs-q-dot {
          width: 5px; height: 5px; border-radius: 50%; background: #D8D0BC;
          flex-shrink: 0;
        }
        .cs-q-text {
          font-family: 'DM Sans', sans-serif; font-size: 15px; line-height: 1.4;
          color: #3A3530;
        }

        /* CTAs */
        .cs-ctas { display: flex; flex-direction: column; gap: 8px; }
        .cs-cta-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px;
          border-radius: 14px; background: #FAFAF8;
          border: 1px solid #D8D0BC;
        }
        .cs-cta-letter {
          width: 24px; height: 24px; border-radius: 50%; background: #141414;
          color: #EDE8DC; font-size: 12px; font-weight: 700; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Sans', sans-serif;
        }
        .cs-cta-name {
          flex: 1; font-family: 'DM Sans', sans-serif; font-size: 15px;
          color: #141414; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cs-cta-btn {
          display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px;
          border-radius: 10px; background: rgba(30,169,82,0.1); border: 1px solid rgba(30,169,82,0.3);
          color: #1EA952; font-size: 12px; font-weight: 600; text-decoration: none;
          font-family: 'DM Sans', sans-serif; white-space: nowrap; min-height: 44px;
        }
        .cs-cta-link { background: rgba(58,53,48,0.04); border-color: #D8D0BC; color: #3A3530; }

        /* Nota fiduciaria + acciones */
        .cs-nota {
          display: flex; gap: 8px; align-items: flex-start;
          margin: 20px 20px 0; padding: 12px 14px; border-radius: 12px;
          background: #FAFAF8; border: 1px solid #D8D0BC; color: #7A7060;
          font-size: 12.5px; line-height: 1.5; font-family: 'DM Sans', sans-serif;
        }
        .cs-actions { display: flex; flex-wrap: wrap; gap: 10px; padding: 14px 20px 4px; }
        .cs-action-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          padding: 11px 16px; border-radius: 10px; background: transparent;
          border: 1px solid #C9C0AA; color: #3A3530; font-size: 13px; font-weight: 600;
          font-family: 'DM Sans', sans-serif; cursor: pointer; text-decoration: none;
        }
        .cs-action-btn:hover { border-color: #7A7060; }
        .cs-action-wa { background: #1EA952; border-color: #1EA952; color: #fff; margin-left: auto; }
        .cs-action-wa:hover { border-color: #1EA952; opacity: 0.92; }

        /* Footer */
        .cs-footer { padding: 24px 20px 12px; text-align: center; }
        .cs-footer-text {
          font-size: 12px; color: #7A7060; letter-spacing: 0.5px;
          font-family: 'DM Sans', sans-serif;
        }

        @media (min-width: 768px) {
          .cs-overlay {
            left: auto; right: 0; width: 560px; border-radius: 20px 0 0 20px;
            transform: translateX(100%);
          }
          .cs-overlay.open { transform: translateX(0); }
          .cs-table { font-size: 13px; }
        }

        /* Desktop ancho: la tabla A/B/C aprovecha el espacio de la mesa de decisión */
        @media (min-width: 1100px) {
          .cs-overlay { width: min(1040px, 92vw); }
          .cs-scroll { padding-left: 8px; padding-right: 8px; }
          .cs-thumb { width: 76px; height: 76px; border-radius: 12px; }
          .cs-th-text { font-size: 13px; white-space: normal; }
          .cs-table { font-size: 14px; }
          .cs-td { padding: 10px 6px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cs-overlay { transition: none; }
        }
      `}</style>
    </div>
    </>
  )
}
