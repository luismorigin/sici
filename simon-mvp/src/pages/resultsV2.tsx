import { motion } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { buscarUnidadesReales, UnidadReal, CuotaPago } from '@/lib/supabase'

interface FormData {
  nivel_completado: 1 | 2
  mbf_filtros: {
    precio_max: number
    dormitorios: number
    area_min: number
    zona: string | null
    zonas_permitidas: string[]
  }
  contexto_fiduciario?: {
    composicion: string
    mascota: string
    meses_buscando: number
    estado_emocional: string
    horizonte: string
    prioriza: string
    sensible_expensas: boolean
    decision_compartida: boolean
    presion_externa: string
    innegociables: string[]
    deseables: string[]
  }
  respuestas: Record<string, any>
}

// Respuesta del endpoint de razón fiduciaria
interface RazonPersonalizada {
  id: number
  razon_fiduciaria: string
  score: number
  encaja: boolean
  alerta?: string | null
}

export default function ResultsV2Page() {
  const router = useRouter()
  const { level: queryLevel } = router.query
  const [level, setLevel] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(true)
  const [loadingRazones, setLoadingRazones] = useState(false)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [properties, setProperties] = useState<UnidadReal[]>([])
  const [razonesPersonalizadas, setRazonesPersonalizadas] = useState<Record<number, RazonPersonalizada>>({})
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null)
  const [contactoEnviado, setContactoEnviado] = useState(false)
  const [enviandoContacto, setEnviandoContacto] = useState(false)

  // Cargar datos
  useEffect(() => {
    const lvl = queryLevel === '2' ? 2 : 1
    setLevel(lvl)

    const saved = localStorage.getItem('simon_form_data')
    if (!saved) {
      router.push('/formV2')
      return
    }

    const parsed = JSON.parse(saved) as FormData
    setFormData(parsed)

    // Buscar propiedades
    fetchProperties(parsed.mbf_filtros, lvl, parsed)
  }, [queryLevel, router])

  const fetchProperties = async (
    filtros: FormData['mbf_filtros'],
    currentLevel: 1 | 2,
    currentFormData: FormData
  ) => {
    setLoading(true)
    try {
      const results = await buscarUnidadesReales({
        precio_max: filtros.precio_max,
        dormitorios: filtros.dormitorios,
        area_min: filtros.area_min || undefined,
        zonas_permitidas: filtros.zonas_permitidas,
        limite: 50,
      })
      setProperties(results)

      // Si es nivel 2, obtener razones personalizadas de Claude
      if (currentLevel === 2 && currentFormData.contexto_fiduciario && results.length > 0) {
        fetchRazonesPersonalizadas(results, currentFormData)
      }
    } catch (error) {
      console.error('Error buscando propiedades:', error)
      setProperties([])
    }
    setLoading(false)
  }

  // Llamar al endpoint de razones fiduciarias personalizadas
  const fetchRazonesPersonalizadas = async (props: UnidadReal[], data: FormData) => {
    if (!data.contexto_fiduciario) return

    setLoadingRazones(true)
    try {
      // Preparar perfil del usuario
      const perfil = {
        nombre: data.respuestas?.L1_nombre || '',
        ...data.contexto_fiduciario,
        presupuesto_max: data.mbf_filtros.precio_max,
        zonas_elegidas: data.mbf_filtros.zonas_permitidas,
      }

      // Preparar propiedades con datos de mercado
      const propiedadesInput = props.map(p => ({
        id: p.id,
        proyecto: p.proyecto,
        zona: p.zona,
        microzona: p.microzona,
        dormitorios: p.dormitorios,
        precio_usd: p.precio_usd,
        precio_m2: p.precio_m2,
        area_m2: p.area_m2,
        amenities: p.amenities_lista,
        razon_sql: p.razon_fiduciaria, // Razón genérica del SQL
      }))

      const response = await fetch('/api/razon-fiduciaria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil,
          propiedades: propiedadesInput,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        // Convertir array a objeto indexado por id
        const razonesMap: Record<number, RazonPersonalizada> = {}
        result.propiedades?.forEach((r: RazonPersonalizada) => {
          razonesMap[r.id] = r
        })
        setRazonesPersonalizadas(razonesMap)
      }
    } catch (error) {
      console.error('Error obteniendo razones personalizadas:', error)
    }
    setLoadingRazones(false)
  }

  const handlePersonalizar = () => {
    // Ir a nivel 2 del formulario
    router.push('/formV2?level=2')
  }

  // Enviar solicitud de contacto a Slack
  const handleSolicitarContacto = async () => {
    if (!formData) return

    setEnviandoContacto(true)
    try {
      const nombre = formData.respuestas?.L1_nombre || 'Sin nombre'
      const whatsapp = formData.respuestas?.L1_whatsapp || 'Sin WhatsApp'

      await fetch('/api/notify-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'contact_request',
          data: {
            nombre,
            whatsapp,
            nivel: level,
            presupuesto: formData.mbf_filtros.precio_max,
            dormitorios: formData.mbf_filtros.dormitorios,
            zonas: formData.mbf_filtros.zonas_permitidas,
            propiedades_vistas: properties.length,
            propiedades_ids: properties.map(p => p.id),
          }
        })
      })

      setContactoEnviado(true)
    } catch (error) {
      console.error('Error enviando contacto:', error)
      // Aún así marcar como enviado para no bloquear al usuario
      setContactoEnviado(true)
    }
    setEnviandoContacto(false)
  }

  const getNombre = () => {
    return formData?.respuestas?.L1_nombre || ''
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-neutral-200 border-t-neutral-900
                         rounded-full animate-spin mx-auto mb-6" />
          <p className="text-xl text-neutral-600">Buscando opciones...</p>
        </motion.div>
      </main>
    )
  }

  return (
    <>
      <Head>
        <title>Resultados | Simon</title>
      </Head>

      <main className="min-h-screen px-6 py-12">
        <div className="max-w-4xl mx-auto">

          {/* Header con resultados */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold mb-2">
              {getNombre() ? `${getNombre()}, encontramos` : 'Encontramos'} {properties.length} opciones
            </h1>
            <p className="text-neutral-600">
              {level === 1
                ? 'Propiedades que cumplen tus filtros basicos'
                : 'Propiedades coherentes con tu situacion'
              }
            </p>
          </motion.section>

          {/* Banner para personalizar (solo nivel 1) */}
          {level === 1 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200
                        rounded-2xl p-6 mb-8"
            >
              <h2 className="text-lg font-semibold text-purple-900 mb-2">
                ¿Queres que Simon te explique POR QUE cada opcion encaja con vos?
              </h2>
              <p className="text-purple-700 mb-4">
                Completa 10 preguntas mas (~3 min) y recibis:
              </p>
              <ul className="text-purple-800 space-y-1 mb-6">
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">✓</span>
                  Razon personalizada por cada propiedad
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">✓</span>
                  Alertas si algo no encaja con tu situacion
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">✓</span>
                  Guia de que preguntar al visitar
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handlePersonalizar}
                  className="btn-primary bg-purple-600 hover:bg-purple-700"
                >
                  Si, personalizar →
                </button>
                <button
                  onClick={() => setLevel(1)} // Quedarse en nivel 1
                  className="btn-secondary"
                >
                  Solo ver estas opciones
                </button>
              </div>
            </motion.section>
          )}

          {/* Lista de propiedades */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: level === 1 ? 0.4 : 0.2 }}
          >
            <h2 className="text-xl font-bold mb-4">
              {level === 1 ? 'Opciones disponibles' : 'Opciones coherentes con tu vida'}
            </h2>

            {/* Leyenda de símbolos - colapsable */}
            <details className="mb-4 bg-slate-50 rounded-lg border border-slate-200">
              <summary className="px-4 py-2 cursor-pointer text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                💡 Guía de símbolos
              </summary>
              <div className="px-4 pb-3 pt-1 text-xs text-slate-500 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <span>🛏️ = Dormitorios</span>
                <span>🚿 = Baños</span>
                <span>📐 = Área m²</span>
                <span>🏢 = Piso</span>
                <span>🚗 = Parqueos</span>
                <span>📦 = Baulera</span>
                <span className="text-green-600">✓ = Incluido</span>
                <span className="text-neutral-400">? = Sin confirmar</span>
                <span>📅 = Plan pagos</span>
                <span>💱 = TC Paralelo</span>
                <span>📉 = Descuento</span>
                <span>🤝 = Negociable</span>
              </div>
            </details>

            <div className="space-y-6">
              {properties.map((property, index) => (
                <motion.div
                  key={property.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className={`bg-white rounded-2xl border-2 overflow-hidden cursor-pointer transition-all
                             ${selectedProperty === property.id
                               ? 'border-neutral-900 shadow-lg'
                               : 'border-neutral-200 hover:border-neutral-400'}`}
                  onClick={() => setSelectedProperty(property.id)}
                >
                  {/* Foto */}
                  {property.fotos_urls && property.fotos_urls.length > 0 && (
                    <div className="relative h-48 bg-neutral-100">
                      <img
                        src={property.fotos_urls[0]}
                        alt={property.proyecto}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      {property.fotos_urls.length > 1 && (
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                          +{property.fotos_urls.length - 1} fotos
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-semibold">{property.proyecto}</h3>
                        <p className="text-neutral-500">{property.zona}</p>
                        {property.desarrollador && (
                          <p className="text-sm text-neutral-400">{property.desarrollador}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${property.precio_usd.toLocaleString()}</p>
                        <p className="text-sm text-neutral-500">
                          {property.area_m2} m² · ${property.precio_m2.toLocaleString()}/m²
                        </p>
                      </div>
                    </div>

                    {/* Features - Línea principal */}
                    <div className="flex flex-wrap gap-3 mb-2 text-neutral-600 text-sm">
                      <span title="Dormitorios">🛏️ {property.dormitorios}d</span>
                      {property.banos !== null && (
                        <span title="Baños">🚿 {property.banos}b</span>
                      )}
                      <span title="Área">📐 {property.area_m2}m²</span>
                      {property.piso !== null && (
                        <span title="Piso">🏢 P{property.piso}</span>
                      )}
                      {/* Parqueo */}
                      {property.estacionamientos !== null ? (
                        <span title={property.parqueo_incluido === true ? 'Parqueo incluido' : property.parqueo_incluido === false ? 'Parqueo no incluido' : 'Parqueo sin confirmar'}>
                          🚗 {property.estacionamientos}
                          {property.parqueo_incluido === true && <span className="text-green-500 ml-0.5">✓</span>}
                          {property.parqueo_incluido === false && property.parqueo_precio_adicional && (
                            <span className="text-amber-500 ml-0.5">+${property.parqueo_precio_adicional.toLocaleString()}</span>
                          )}
                        </span>
                      ) : (
                        <span title="Parqueo sin confirmar" className="text-neutral-400">🚗 ?</span>
                      )}
                      {/* Baulera */}
                      {property.baulera === true ? (
                        <span title={property.baulera_incluido === true ? 'Baulera incluida' : property.baulera_incluido === false ? 'Baulera no incluida' : 'Baulera sin confirmar inclusión'}>
                          📦 {property.baulera_incluido === true ? <span className="text-green-500">✓</span> : property.baulera_incluido === false && property.baulera_precio_adicional ? (
                            <span className="text-amber-500">+${property.baulera_precio_adicional.toLocaleString()}</span>
                          ) : '?'}
                        </span>
                      ) : property.baulera === false ? (
                        <span title="Sin baulera" className="text-neutral-400">📦 ✗</span>
                      ) : (
                        <span title="Baulera sin confirmar" className="text-neutral-400">📦 ?</span>
                      )}
                    </div>

                    {/* Features - Línea de forma de pago (solo si hay info) */}
                    {(property.plan_pagos_desarrollador || property.solo_tc_paralelo || property.descuento_contado_pct) && (
                      <div className="flex flex-wrap gap-2 mb-3 text-xs">
                        {property.plan_pagos_desarrollador && (
                          <div className="relative group">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded cursor-help" title="Acepta plan de pagos con desarrollador">
                              📅 Plan pagos
                            </span>
                            {/* Tooltip con detalle de cuotas v2.27 */}
                            {property.plan_pagos_cuotas && property.plan_pagos_cuotas.length > 0 && (
                              <div className="absolute hidden group-hover:block z-20 bg-white border border-blue-200 shadow-lg rounded-lg p-3 w-64 -left-2 top-6 text-left">
                                <p className="text-xs font-semibold text-blue-800 mb-2">📋 Detalle del plan:</p>
                                {property.plan_pagos_cuotas.map((cuota, i) => (
                                  <p key={i} className="text-xs text-slate-600 mb-1">
                                    • {cuota.porcentaje}% {
                                      cuota.momento === 'reserva' ? '🔖 Al reservar' :
                                      cuota.momento === 'firma_contrato' ? '✍️ Firma contrato' :
                                      cuota.momento === 'durante_obra' ? '🏗️ Durante obra' :
                                      cuota.momento === 'cuotas_mensuales' ? '📅 Cuotas' :
                                      cuota.momento === 'entrega' ? '🔑 Entrega' :
                                      '📝 Otro'
                                    }
                                    {cuota.descripcion && <span className="text-slate-400"> ({cuota.descripcion})</span>}
                                  </p>
                                ))}
                                {property.plan_pagos_texto && (
                                  <p className="text-xs text-blue-600 mt-2 pt-2 border-t border-blue-100 italic">
                                    {property.plan_pagos_texto}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {property.solo_tc_paralelo && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded" title="Solo acepta USD a tipo de cambio paralelo">
                            💱 TC Paralelo
                          </span>
                        )}
                        {property.descuento_contado_pct && property.descuento_contado_pct > 0 && (
                          <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded" title="Descuento por pago al contado">
                            📉 {property.descuento_contado_pct}% desc. contado
                          </span>
                        )}
                        {property.precio_negociable && (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded" title="Precio negociable">
                            🤝 Negociable
                          </span>
                        )}
                      </div>
                    )}

                    {/* Amenities */}
                    {property.amenities_lista && property.amenities_lista.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {property.amenities_lista.slice(0, 4).map((amenity, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full text-sm"
                          >
                            {amenity}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Razon fiduciaria PERSONALIZADA (nivel 2 con Claude) */}
                    {level === 2 && razonesPersonalizadas[property.id] && (
                      <div className={`rounded-xl p-4 mt-4 ${
                        razonesPersonalizadas[property.id].encaja
                          ? 'bg-purple-50'
                          : 'bg-amber-50'
                      }`}>
                        <p className={razonesPersonalizadas[property.id].encaja
                          ? 'text-purple-800'
                          : 'text-amber-800'
                        }>
                          <span className={`font-semibold ${
                            razonesPersonalizadas[property.id].encaja
                              ? 'text-purple-600'
                              : 'text-amber-600'
                          }`}>
                            {razonesPersonalizadas[property.id].encaja ? 'Por que encaja: ' : 'Atencion: '}
                          </span>
                          {razonesPersonalizadas[property.id].razon_fiduciaria}
                        </p>
                        {razonesPersonalizadas[property.id].alerta && (
                          <p className="mt-2 text-sm text-red-600 font-medium">
                            ⚠️ {razonesPersonalizadas[property.id].alerta}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-neutral-500">Score de coherencia:</span>
                          <span className={`text-sm font-bold ${
                            razonesPersonalizadas[property.id].score >= 8 ? 'text-green-600' :
                            razonesPersonalizadas[property.id].score >= 5 ? 'text-amber-600' :
                            'text-red-600'
                          }`}>
                            {razonesPersonalizadas[property.id].score}/10
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Loading razones personalizadas */}
                    {level === 2 && loadingRazones && !razonesPersonalizadas[property.id] && (
                      <div className="bg-purple-50 rounded-xl p-4 mt-4 animate-pulse">
                        <div className="h-4 bg-purple-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-purple-200 rounded w-1/2"></div>
                      </div>
                    )}

                    {/* Mensaje nivel 1 - invitar a personalizar */}
                    {level === 1 && (
                      <div className="bg-neutral-50 rounded-xl p-4 mt-4 text-center">
                        <p className="text-neutral-500 text-sm">
                          Completa el formulario para ver por que esta opcion encaja con vos
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Sin resultados */}
            {properties.length === 0 && (
              <div className="text-center py-12">
                <p className="text-xl text-neutral-600 mb-4">
                  No encontramos propiedades con esos filtros
                </p>
                <button
                  onClick={() => router.push('/formV2')}
                  className="btn-primary"
                >
                  Ajustar busqueda
                </button>
              </div>
            )}
          </motion.section>

          {/* CTA contacto */}
          {properties.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-12 bg-neutral-900 text-white rounded-3xl p-8 text-center"
            >
              {contactoEnviado ? (
                <>
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">
                    Listo, {getNombre()}!
                  </h2>
                  <p className="text-neutral-400">
                    Te contactaremos por WhatsApp en menos de 24 horas.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold mb-2">
                    ¿Te interesa alguna?
                  </h2>
                  <p className="text-neutral-400 mb-6">
                    Te contactamos por WhatsApp en menos de 24h
                  </p>
                  <button
                    onClick={handleSolicitarContacto}
                    disabled={enviandoContacto}
                    className="btn-primary bg-white text-neutral-900 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    {enviandoContacto ? 'Enviando...' : 'Quiero que me contacten'}
                  </button>
                </>
              )}
            </motion.section>
          )}
        </div>
      </main>
    </>
  )
}
