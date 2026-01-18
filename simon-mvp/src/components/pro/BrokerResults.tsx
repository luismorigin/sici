'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { DatosPropiedad } from './PropertyForm'
import { buscarUnidadesReales, type UnidadReal } from '@/lib/supabase'

interface BrokerResultsProps {
  datosPropiedad: DatosPropiedad
  onBack: () => void
  onShowLeadForm: () => void
}

// ============ TIPOS ============

interface Comparable {
  propiedad: UnidadReal
  diferenciaPct: number
  diasEnMercado: number
  tipoEdificio: 'premium' | 'standard' | 'basico'
  estadoEntrega: string
  relevancia: 'alta' | 'media' | 'baja'
  notaRelevancia: string
}

interface RecomendacionPrecio {
  tipo: 'mantener' | 'bajar_leve' | 'bajar_fuerte' | 'subir_leve' | 'subir_considerar'
  precioSugerido: number
  precioMinimo: number
  precioMaximo: number
  razon: string
  confianza: 'alta' | 'media' | 'baja'
}

interface ArgumentoCliente {
  situacion: string
  argumento: string
  dato: string
}

interface AnalisisBroker {
  // Posicion del cliente
  precioCliente: number
  precioM2Cliente: number
  precioM2Mercado: number
  posicionMercado: 'muy_bajo' | 'bajo' | 'competitivo' | 'alto' | 'muy_alto'
  percentil: number

  // Recomendacion
  recomendacion: RecomendacionPrecio

  // Comparables
  comparables: Comparable[]
  totalMercado: number

  // Argumentos para cliente
  argumentosCliente: ArgumentoCliente[]

  // Proyeccion
  diasEstimados: { min: number; max: number }
  probabilidadVenta30Dias: number
  probabilidadVenta60Dias: number

  // Metadata
  advertencias: string[]
  filtrosAplicados: string
}

// ============ AMENITIES PARA TIPO EDIFICIO ============

const AMENITIES_PREMIUM = ['piscina', 'pileta', 'gym', 'gimnasio', 'sauna', 'salon_eventos', 'bbq', 'parrilla', 'seguridad_24h', 'lobby']

function inferirTipoEdificio(amenities: string[] | null): 'premium' | 'standard' | 'basico' {
  if (!amenities || amenities.length === 0) return 'basico'
  const amenitiesLower = amenities.map(a => a.toLowerCase().replace(/\s+/g, '_'))
  const countPremium = AMENITIES_PREMIUM.filter(a =>
    amenitiesLower.some(am => am.includes(a))
  ).length
  if (countPremium >= 3) return 'premium'
  if (countPremium >= 1 || amenitiesLower.length >= 2) return 'standard'
  return 'basico'
}

function filtrarComparables(
  resultados: UnidadReal[],
  datosPropiedad: DatosPropiedad
): { filtrados: UnidadReal[]; advertencias: string[] } {
  const advertencias: string[] = []
  const areaMin = datosPropiedad.area_m2 * 0.7
  const areaMax = datosPropiedad.area_m2 * 1.3

  let filtrados = resultados.filter(r => r.area_m2 >= areaMin && r.area_m2 <= areaMax)

  if (filtrados.length < 3) {
    advertencias.push(`Pocos comparables con area similar. Rango ampliado.`)
    filtrados = resultados.filter(r => r.area_m2 >= areaMin * 0.7 && r.area_m2 <= areaMax * 1.3)
  }

  const tipoUsuario = datosPropiedad.tipo_edificio
  const filtradosPorTipo = filtrados.filter(r => {
    const tipoInferido = inferirTipoEdificio(r.amenities_confirmados)
    return tipoInferido === tipoUsuario
  })

  if (filtradosPorTipo.length >= 3) {
    filtrados = filtradosPorTipo
  } else if (tipoUsuario === 'premium') {
    const premiumYStandard = filtrados.filter(r => {
      const tipo = inferirTipoEdificio(r.amenities_confirmados)
      return tipo === 'premium' || tipo === 'standard'
    })
    if (premiumYStandard.length >= 3) {
      filtrados = premiumYStandard
      advertencias.push('Incluye edificios standard por falta de premium.')
    }
  } else if (tipoUsuario === 'basico') {
    const basicoYStandard = filtrados.filter(r => {
      const tipo = inferirTipoEdificio(r.amenities_confirmados)
      return tipo === 'basico' || tipo === 'standard'
    })
    if (basicoYStandard.length >= 3) {
      filtrados = basicoYStandard
      advertencias.push('Incluye edificios standard por falta de basicos.')
    }
  }

  if (datosPropiedad.estado_entrega === 'entrega_inmediata') {
    const sinPreventa = filtrados.filter(r =>
      r.estado_construccion !== 'preventa' && r.estado_construccion !== 'construccion' && r.estado_construccion !== 'planos'
    )
    if (sinPreventa.length >= 3) {
      filtrados = sinPreventa
    } else {
      advertencias.push('Incluye preventas por falta de unidades disponibles.')
    }
  }

  return { filtrados, advertencias }
}

// ============ FUNCIONES DE ANALISIS ============

function calcularPosicionMercado(precioM2Cliente: number, precioM2Mercado: number): 'muy_bajo' | 'bajo' | 'competitivo' | 'alto' | 'muy_alto' {
  const diferencia = ((precioM2Cliente - precioM2Mercado) / precioM2Mercado) * 100
  if (diferencia < -15) return 'muy_bajo'
  if (diferencia < -5) return 'bajo'
  if (diferencia <= 5) return 'competitivo'
  if (diferencia <= 15) return 'alto'
  return 'muy_alto'
}

function generarRecomendacion(
  precioCliente: number,
  precioM2Cliente: number,
  precioM2Mercado: number,
  area: number,
  comparables: UnidadReal[]
): RecomendacionPrecio {
  const diferenciaPct = ((precioM2Cliente - precioM2Mercado) / precioM2Mercado) * 100
  const precioMercado = precioM2Mercado * area

  // Calcular rango basado en comparables
  const preciosM2 = comparables.map(c => c.precio_m2)
  const precioM2Min = Math.min(...preciosM2)
  const precioM2Max = Math.max(...preciosM2)

  const precioMinimo = Math.round(precioM2Min * area)
  const precioMaximo = Math.round(precioM2Max * area)

  if (diferenciaPct > 20) {
    return {
      tipo: 'bajar_fuerte',
      precioSugerido: Math.round(precioMercado * 1.05),
      precioMinimo,
      precioMaximo,
      razon: `El precio del cliente esta ${diferenciaPct.toFixed(0)}% sobre el mercado. Dificil vender sin ajuste significativo.`,
      confianza: 'alta'
    }
  }

  if (diferenciaPct > 10) {
    return {
      tipo: 'bajar_leve',
      precioSugerido: Math.round(precioMercado * 1.02),
      precioMinimo,
      precioMaximo,
      razon: `Precio ${diferenciaPct.toFixed(0)}% sobre mercado. Ajuste moderado aceleraria la venta.`,
      confianza: 'alta'
    }
  }

  if (diferenciaPct >= -5 && diferenciaPct <= 10) {
    return {
      tipo: 'mantener',
      precioSugerido: precioCliente,
      precioMinimo,
      precioMaximo,
      razon: `Precio competitivo. Bien posicionado para el mercado actual.`,
      confianza: 'alta'
    }
  }

  if (diferenciaPct >= -15) {
    return {
      tipo: 'subir_considerar',
      precioSugerido: Math.round(precioMercado * 0.98),
      precioMinimo,
      precioMaximo,
      razon: `Precio ${Math.abs(diferenciaPct).toFixed(0)}% bajo mercado. Podria estar dejando dinero en la mesa.`,
      confianza: 'media'
    }
  }

  return {
    tipo: 'subir_leve',
    precioSugerido: Math.round(precioMercado * 0.95),
    precioMinimo,
    precioMaximo,
    razon: `Precio muy bajo. Revisar si hay razon especifica o subir.`,
    confianza: 'media'
  }
}

function analizarComparable(
  prop: UnidadReal,
  precioM2Cliente: number,
  areaCliente: number,
  tipoCliente: string
): Comparable {
  const diferenciaPct = ((prop.precio_m2 - precioM2Cliente) / precioM2Cliente) * 100
  const diasEnMercado = prop.dias_en_mercado || 0
  const tipoEdificio = inferirTipoEdificio(prop.amenities_confirmados)

  // Determinar relevancia
  let relevancia: 'alta' | 'media' | 'baja' = 'media'
  let notaRelevancia = ''

  const diferenciaArea = Math.abs(prop.area_m2 - areaCliente)
  const mismoTipo = tipoEdificio === tipoCliente

  if (diferenciaArea <= areaCliente * 0.15 && mismoTipo) {
    relevancia = 'alta'
    notaRelevancia = 'Area y tipo similares - comparable directo'
  } else if (diferenciaArea <= areaCliente * 0.25 || mismoTipo) {
    relevancia = 'media'
    notaRelevancia = mismoTipo ? 'Mismo tipo edificio' : 'Area similar'
  } else {
    relevancia = 'baja'
    notaRelevancia = 'Referencia general'
  }

  return {
    propiedad: prop,
    diferenciaPct,
    diasEnMercado,
    tipoEdificio,
    estadoEntrega: prop.estado_construccion || 'disponible',
    relevancia,
    notaRelevancia
  }
}

function generarArgumentosCliente(
  posicion: string,
  recomendacion: RecomendacionPrecio,
  comparables: Comparable[],
  diasPromedio: number
): ArgumentoCliente[] {
  const args: ArgumentoCliente[] = []

  if (recomendacion.tipo === 'bajar_fuerte' || recomendacion.tipo === 'bajar_leve') {
    // Cliente necesita bajar precio
    const masBaratos = comparables.filter(c => c.diferenciaPct < -5)
    if (masBaratos.length > 0) {
      args.push({
        situacion: 'El cliente cree que su precio es justo',
        argumento: `Hay ${masBaratos.length} propiedades similares mas baratas que la suya. Los compradores las veran primero.`,
        dato: `Ej: ${masBaratos[0].propiedad.proyecto} a $${masBaratos[0].propiedad.precio_usd.toLocaleString()} (${Math.abs(masBaratos[0].diferenciaPct).toFixed(0)}% menos)`
      })
    }

    const viejos = comparables.filter(c => c.diasEnMercado > 60 && c.diferenciaPct > 5)
    if (viejos.length > 0) {
      args.push({
        situacion: 'El cliente quiere esperar',
        argumento: `Las propiedades caras llevan mucho tiempo sin venderse. El mercado ya dio su veredicto.`,
        dato: `${viejos.length} propiedades con precio similar llevan +60 dias publicadas`
      })
    }

    args.push({
      situacion: 'El cliente pregunta cuanto bajar',
      argumento: `Mi recomendacion es $${recomendacion.precioSugerido.toLocaleString()}. Eso lo posiciona competitivo sin regalar.`,
      dato: `Rango de mercado: $${recomendacion.precioMinimo.toLocaleString()} - $${recomendacion.precioMaximo.toLocaleString()}`
    })
  }

  if (recomendacion.tipo === 'mantener') {
    args.push({
      situacion: 'Confirmar que el precio esta bien',
      argumento: `Su precio esta dentro del rango competitivo. No hay necesidad de ajustar.`,
      dato: `Percentil de mercado apropiado. Tiempo estimado de venta razonable.`
    })

    args.push({
      situacion: 'El cliente quiere subir el precio',
      argumento: `Subir ahora podria sacarlo del rango competitivo y alargar el tiempo de venta.`,
      dato: `Promedio de dias en mercado: ${Math.round(diasPromedio)} dias`
    })
  }

  if (recomendacion.tipo === 'subir_considerar' || recomendacion.tipo === 'subir_leve') {
    args.push({
      situacion: 'Oportunidad de subir precio',
      argumento: `El precio actual esta por debajo del mercado. Podria ajustar sin perder competitividad.`,
      dato: `Precio sugerido: $${recomendacion.precioSugerido.toLocaleString()}`
    })
  }

  // Argumento universal
  args.push({
    situacion: 'El cliente pregunta por el tiempo',
    argumento: `Con el precio actual, estimo entre X y Y dias. Ajustando a mi recomendacion, podriamos acortar ese tiempo.`,
    dato: `Promedio de mercado: ${Math.round(diasPromedio)} dias`
  })

  return args
}

function realizarAnalisis(
  resultados: UnidadReal[],
  datosPropiedad: DatosPropiedad
): AnalisisBroker | null {
  if (!datosPropiedad.precio_referencia || resultados.length === 0) return null

  const { filtrados, advertencias } = filtrarComparables(resultados, datosPropiedad)
  const comparables = filtrados.length > 0 ? filtrados : resultados

  // Filtros aplicados
  const tipoLabel = datosPropiedad.tipo_edificio
  const estadoLabel = datosPropiedad.estado_entrega === 'entrega_inmediata' ? 'disponibles' :
                      datosPropiedad.estado_entrega === 'solo_preventa' ? 'preventa' : 'todos'
  const filtrosAplicados = `${comparables.length} comparables ${tipoLabel}, ${estadoLabel}`

  // Calculos base
  const precioCliente = datosPropiedad.precio_referencia
  const precioM2Cliente = precioCliente / datosPropiedad.area_m2
  const preciosM2 = comparables.map(r => r.precio_m2)
  const precioM2Mercado = preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length

  // Posicion
  const posicionMercado = calcularPosicionMercado(precioM2Cliente, precioM2Mercado)
  const masBaratos = preciosM2.filter(p => p < precioM2Cliente).length
  const percentil = Math.round((masBaratos / preciosM2.length) * 100)

  // Recomendacion
  const recomendacion = generarRecomendacion(
    precioCliente,
    precioM2Cliente,
    precioM2Mercado,
    datosPropiedad.area_m2,
    comparables
  )

  // Analizar comparables
  const comparablesAnalizados = comparables
    .slice(0, 15)
    .map(prop => analizarComparable(prop, precioM2Cliente, datosPropiedad.area_m2, datosPropiedad.tipo_edificio))
    .sort((a, b) => {
      // Ordenar por relevancia, luego por diferencia
      const relOrder = { alta: 0, media: 1, baja: 2 }
      if (relOrder[a.relevancia] !== relOrder[b.relevancia]) {
        return relOrder[a.relevancia] - relOrder[b.relevancia]
      }
      return Math.abs(a.diferenciaPct) - Math.abs(b.diferenciaPct)
    })

  // Dias promedio
  const diasList = comparables.map(r => r.dias_en_mercado || 0).filter(d => d > 0)
  const diasPromedio = diasList.length > 0 ? diasList.reduce((a, b) => a + b, 0) / diasList.length : 45

  // Proyeccion segun posicion
  let diasEstimados = { min: 30, max: 60 }
  let prob30 = 50
  let prob60 = 75

  if (posicionMercado === 'muy_bajo') {
    diasEstimados = { min: 10, max: 25 }
    prob30 = 85
    prob60 = 95
  } else if (posicionMercado === 'bajo') {
    diasEstimados = { min: 20, max: 40 }
    prob30 = 70
    prob60 = 90
  } else if (posicionMercado === 'alto') {
    diasEstimados = { min: 60, max: 120 }
    prob30 = 25
    prob60 = 50
  } else if (posicionMercado === 'muy_alto') {
    diasEstimados = { min: 120, max: 200 }
    prob30 = 10
    prob60 = 25
  }

  // Argumentos
  const argumentosCliente = generarArgumentosCliente(
    posicionMercado,
    recomendacion,
    comparablesAnalizados,
    diasPromedio
  )

  return {
    precioCliente,
    precioM2Cliente,
    precioM2Mercado,
    posicionMercado,
    percentil,
    recomendacion,
    comparables: comparablesAnalizados,
    totalMercado: resultados.length,
    argumentosCliente,
    diasEstimados,
    probabilidadVenta30Dias: prob30,
    probabilidadVenta60Dias: prob60,
    advertencias,
    filtrosAplicados
  }
}

// ============ COMPONENTE PRINCIPAL ============

export default function BrokerResults({ datosPropiedad, onBack, onShowLeadForm }: BrokerResultsProps) {
  const [resultados, setResultados] = useState<UnidadReal[]>([])
  const [analisis, setAnalisis] = useState<AnalisisBroker | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mostrarTodos, setMostrarTodos] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const TODAS_LAS_ZONAS = ['equipetrol', 'sirari', 'equipetrol_norte', 'villa_brigida', 'faremafu']
        const zonasABuscar = datosPropiedad.zona === 'todas'
          ? TODAS_LAS_ZONAS
          : [datosPropiedad.zona]

        const data = await buscarUnidadesReales({
          zonas_permitidas: zonasABuscar,
          dormitorios: datosPropiedad.dormitorios === 3 ? undefined : datosPropiedad.dormitorios,
          estado_entrega: datosPropiedad.estado_entrega,
          limite: 50
        })

        setResultados(data || [])

        if (data && data.length > 0) {
          const analisisCalculado = realizarAnalisis(data, datosPropiedad)
          setAnalisis(analisisCalculado)
        }
      } catch (err) {
        console.error('Error buscando propiedades:', err)
        setError('Error al generar CMA. Intenta de nuevo.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [datosPropiedad])

  if (loading) {
    return (
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500">Generando CMA profesional...</p>
        </div>
      </section>
    )
  }

  if (error || !analisis) {
    return (
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-red-500 mb-4">{error || 'No pudimos generar el CMA.'}</p>
          <button onClick={onBack} className="btn btn-secondary">
            Volver a intentar
          </button>
        </div>
      </section>
    )
  }

  const posicionLabels = {
    muy_bajo: { label: 'Muy bajo', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    bajo: { label: 'Competitivo-bajo', color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
    competitivo: { label: 'Competitivo', color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
    alto: { label: 'Alto', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    muy_alto: { label: 'Muy alto', color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
  }

  const posicionStyle = posicionLabels[analisis.posicionMercado]

  const comparablesVisibles = mostrarTodos
    ? analisis.comparables
    : analisis.comparables.slice(0, 6)

  return (
    <section className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-6 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Editar datos
          </button>

          {/* ============ HEADER CMA ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-medium text-brand-primary uppercase tracking-wide mb-1">
                  Analisis Comparativo de Mercado
                </div>
                <h2 className="font-display text-2xl font-bold text-brand-dark">
                  CMA Profesional
                </h2>
              </div>
              <div className="text-right text-sm text-slate-500">
                <div>{new Date().toLocaleDateString('es-BO')}</div>
                <div>{analisis.filtrosAplicados}</div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <div className="grid md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Propiedad</div>
                  <div className="font-semibold text-slate-700">
                    {datosPropiedad.dormitorios} dorms, {datosPropiedad.area_m2}m²
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Zona</div>
                  <div className="font-semibold text-slate-700">
                    {datosPropiedad.zona === 'todas' ? 'Todo Equipetrol' : datosPropiedad.zona}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Tipo edificio</div>
                  <div className="font-semibold text-slate-700 capitalize">
                    {datosPropiedad.tipo_edificio}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Comparables</div>
                  <div className="font-semibold text-slate-700">
                    {analisis.comparables.length} de {analisis.totalMercado}
                  </div>
                </div>
              </div>
            </div>

            {/* Advertencias */}
            {analisis.advertencias.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
                <div className="flex items-start gap-2 text-sm text-blue-700">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>{analisis.advertencias.join(' ')}</div>
                </div>
              </div>
            )}
          </div>

          {/* ============ POSICION DEL CLIENTE ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <h3 className="font-display text-lg font-bold text-brand-dark mb-4">
              Posicion del Precio del Cliente
            </h3>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Precio cliente vs mercado */}
              <div className={`rounded-xl border p-5 ${posicionStyle.bg}`}>
                <div className="text-center">
                  <div className="text-sm text-slate-600 mb-2">Precio del cliente</div>
                  <div className="text-3xl font-bold text-brand-dark mb-1">
                    ${analisis.precioCliente.toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 mb-4">
                    ${Math.round(analisis.precioM2Cliente).toLocaleString()}/m²
                  </div>
                  <div className={`inline-block px-4 py-2 rounded-full font-semibold ${posicionStyle.color} bg-white`}>
                    {posicionStyle.label}
                  </div>
                </div>
              </div>

              {/* Promedio mercado */}
              <div className="bg-slate-50 rounded-xl p-5">
                <div className="text-center">
                  <div className="text-sm text-slate-600 mb-2">Promedio de mercado</div>
                  <div className="text-3xl font-bold text-slate-700 mb-1">
                    ${Math.round(analisis.precioM2Mercado * datosPropiedad.area_m2).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 mb-4">
                    ${Math.round(analisis.precioM2Mercado).toLocaleString()}/m²
                  </div>
                  <div className="text-sm text-slate-600">
                    Rango: ${analisis.recomendacion.precioMinimo.toLocaleString()} - ${analisis.recomendacion.precioMaximo.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Barra de percentil */}
            <div className="mt-6 bg-slate-50 rounded-xl p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Posicion en el mercado</span>
                <span className="font-semibold text-brand-dark">Percentil {analisis.percentil}</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-brand-primary rounded-full transition-all"
                  style={{ width: `${analisis.percentil}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Mas barato</span>
                <span>Mas caro</span>
              </div>
            </div>
          </div>

          {/* ============ RECOMENDACION ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <h3 className="font-display text-lg font-bold text-brand-dark mb-4">
              Tu Recomendacion al Cliente
            </h3>

            <div className={`rounded-xl p-6 mb-6 ${
              analisis.recomendacion.tipo === 'mantener'
                ? 'bg-green-50 border border-green-200'
                : analisis.recomendacion.tipo === 'bajar_fuerte'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-amber-50 border border-amber-200'
            }`}>
              <div className="flex items-start gap-4">
                <div className="text-3xl">
                  {analisis.recomendacion.tipo === 'mantener' ? '✓' :
                   analisis.recomendacion.tipo === 'bajar_fuerte' ? '⚠️' :
                   analisis.recomendacion.tipo === 'bajar_leve' ? '↓' :
                   '↑'}
                </div>
                <div className="flex-1">
                  <h4 className={`font-bold text-lg mb-2 ${
                    analisis.recomendacion.tipo === 'mantener' ? 'text-green-700' :
                    analisis.recomendacion.tipo === 'bajar_fuerte' ? 'text-red-700' :
                    'text-amber-700'
                  }`}>
                    {analisis.recomendacion.tipo === 'mantener' ? 'Mantener precio actual' :
                     analisis.recomendacion.tipo === 'bajar_fuerte' ? 'Recomendar ajuste significativo' :
                     analisis.recomendacion.tipo === 'bajar_leve' ? 'Sugerir ajuste moderado' :
                     'Considerar ajuste al alza'}
                  </h4>
                  <p className="text-slate-700 mb-4">{analisis.recomendacion.razon}</p>

                  {analisis.recomendacion.tipo !== 'mantener' && (
                    <div className="bg-white rounded-lg p-4">
                      <div className="text-sm text-slate-600 mb-1">Precio sugerido</div>
                      <div className="text-2xl font-bold text-brand-dark">
                        ${analisis.recomendacion.precioSugerido.toLocaleString()}
                      </div>
                      <div className="text-sm text-slate-500">
                        {analisis.recomendacion.precioSugerido > analisis.precioCliente
                          ? `+$${(analisis.recomendacion.precioSugerido - analisis.precioCliente).toLocaleString()}`
                          : `-$${(analisis.precioCliente - analisis.recomendacion.precioSugerido).toLocaleString()}`
                        } vs precio cliente
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Proyeccion */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Tiempo estimado</div>
                <div className="font-bold text-brand-dark text-lg">
                  {analisis.diasEstimados.min}-{analisis.diasEstimados.max} dias
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Prob. venta 30 dias</div>
                <div className={`font-bold text-lg ${
                  analisis.probabilidadVenta30Dias >= 60 ? 'text-green-600' :
                  analisis.probabilidadVenta30Dias >= 40 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {analisis.probabilidadVenta30Dias}%
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Prob. venta 60 dias</div>
                <div className={`font-bold text-lg ${
                  analisis.probabilidadVenta60Dias >= 70 ? 'text-green-600' :
                  analisis.probabilidadVenta60Dias >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {analisis.probabilidadVenta60Dias}%
                </div>
              </div>
            </div>
          </div>

          {/* ============ COMPARABLES ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <h3 className="font-display text-lg font-bold text-brand-dark mb-2">
              Comparables de Mercado
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Propiedades similares ordenadas por relevancia
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Proyecto</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">m²</th>
                    <th className="text-right py-3 px-2 font-semibold text-slate-600">Precio</th>
                    <th className="text-right py-3 px-2 font-semibold text-slate-600">$/m²</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">vs Cliente</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Dias</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {comparablesVisibles.map((comp, i) => (
                    <tr
                      key={comp.propiedad.id}
                      className={`border-b border-slate-100 ${
                        comp.relevancia === 'alta' ? 'bg-green-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-2">
                        <div className="font-medium text-slate-700">{comp.propiedad.proyecto}</div>
                        <div className="text-xs text-slate-400">{comp.propiedad.zona}</div>
                        {comp.relevancia === 'alta' && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            Comparable directo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600">
                        {Math.round(comp.propiedad.area_m2)}
                      </td>
                      <td className="py-3 px-2 text-right font-medium text-slate-700">
                        ${comp.propiedad.precio_usd.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-right text-slate-600">
                        ${Math.round(comp.propiedad.precio_m2).toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          comp.diferenciaPct < -3
                            ? 'bg-red-100 text-red-700'
                            : comp.diferenciaPct > 3
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {comp.diferenciaPct > 0 ? '+' : ''}{comp.diferenciaPct.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center text-slate-500">
                        {comp.diasEnMercado > 0 ? comp.diasEnMercado : '-'}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          comp.tipoEdificio === 'premium'
                            ? 'bg-purple-100 text-purple-700'
                            : comp.tipoEdificio === 'standard'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {comp.tipoEdificio === 'premium' ? '★' : comp.tipoEdificio === 'standard' ? 'S' : 'B'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analisis.comparables.length > 6 && (
              <button
                onClick={() => setMostrarTodos(!mostrarTodos)}
                className="w-full mt-4 py-2 text-sm text-brand-primary hover:text-brand-primary-hover font-medium"
              >
                {mostrarTodos ? 'Ver menos' : `Ver ${analisis.comparables.length - 6} comparables mas`}
              </button>
            )}
          </div>

          {/* ============ ARGUMENTOS PARA CLIENTE ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <h3 className="font-display text-lg font-bold text-brand-dark mb-2">
              Argumentos para tu Cliente
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Guia para la conversacion con el cliente
            </p>

            <div className="space-y-4">
              {analisis.argumentosCliente.map((arg, i) => (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                    <div className="font-medium text-slate-700">{arg.situacion}</div>
                  </div>
                  <div className="p-4">
                    <p className="text-slate-600 mb-2">{arg.argumento}</p>
                    <div className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                      <strong>Dato:</strong> {arg.dato}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ============ DISCLAIMER ============ */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
            <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Nota Profesional
            </h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>• Este CMA usa precios de lista, no precios de cierre reales</li>
              <li>• Los tiempos estimados son aproximaciones basadas en datos historicos</li>
              <li>• Factores como estado, piso, vista, etc. pueden afectar el valor final</li>
              <li>• Recomendamos inspeccion presencial antes de confirmar precio</li>
            </ul>
          </div>

          {/* ============ CTA ============ */}
          <div className="bg-gradient-to-br from-brand-dark to-brand-dark-card rounded-2xl p-8 text-center text-white">
            <h3 className="font-display text-2xl font-bold mb-3">
              ¿Queres exportar este CMA?
            </h3>
            <p className="text-slate-400 mb-6">
              Genera un PDF profesional para enviar a tu cliente o registrate
              para guardar y dar seguimiento a tus CMAs.
            </p>
            <button
              onClick={onShowLeadForm}
              className="btn btn-primary px-8 py-4 text-base"
            >
              Descargar CMA Profesional
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
