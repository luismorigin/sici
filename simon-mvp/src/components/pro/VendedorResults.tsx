'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { DatosPropiedad } from './PropertyForm'
import { buscarUnidadesReales, type UnidadReal } from '@/lib/supabase'

interface VendedorResultsProps {
  datosPropiedad: DatosPropiedad
  onBack: () => void
  onShowLeadForm: () => void
}

// ============ TIPOS ============

interface AnalisisCompetidor {
  propiedad: UnidadReal
  diferenciaPct: number
  diasEnMercado: number
  impacto: 'te_afecta' | 'te_beneficia' | 'neutral'
  razon: string
}

interface Veredicto {
  tipo: 'competitivo' | 'alto' | 'bajo' | 'muy_alto' | 'muy_bajo'
  label: string
  color: string
  emoji: string
}

interface EscenarioPrecio {
  nombre: string
  precio: number
  tiempoMin: number
  tiempoMax: number
  probabilidad: string
  esTuPrecio: boolean
}

interface AnalisisVendedor {
  veredicto: Veredicto
  tuPrecioM2: number
  precioM2Mercado: number
  rangoMin: number
  rangoMax: number
  percentil: number
  competidoresMasBaratos: number
  competidoresMasCaros: number
  diasPromedioMercado: number
  tiempoEstimadoVenta: { min: number; max: number }
  ofertasProbables: { min: number; max: number }
  cierreTipico: number
  competidoresAnalizados: AnalisisCompetidor[]
  argumentosContra: { argumento: string; respuesta: string }[]
  escenarios: EscenarioPrecio[]
}

// ============ FUNCIONES DE ANALISIS ============

function calcularVeredicto(tuPrecioM2: number, precioM2Mercado: number): Veredicto {
  const diferencia = ((tuPrecioM2 - precioM2Mercado) / precioM2Mercado) * 100

  if (diferencia < -15) {
    return { tipo: 'muy_bajo', label: 'Precio muy bajo', color: 'text-amber-600', emoji: '⚠️' }
  }
  if (diferencia < -5) {
    return { tipo: 'bajo', label: 'Precio competitivo-bajo', color: 'text-green-600', emoji: '✓' }
  }
  if (diferencia <= 5) {
    return { tipo: 'competitivo', label: 'Precio competitivo', color: 'text-green-600', emoji: '✓' }
  }
  if (diferencia <= 15) {
    return { tipo: 'alto', label: 'Precio alto', color: 'text-amber-600', emoji: '⚠️' }
  }
  return { tipo: 'muy_alto', label: 'Precio muy alto', color: 'text-red-600', emoji: '⚠️' }
}

function analizarCompetidor(
  prop: UnidadReal,
  tuPrecioM2: number,
  tuArea: number
): AnalisisCompetidor {
  const diferenciaPct = ((prop.precio_m2 - tuPrecioM2) / tuPrecioM2) * 100
  const diasEnMercado = prop.dias_en_mercado || 0

  let impacto: 'te_afecta' | 'te_beneficia' | 'neutral' = 'neutral'
  let razon = ''

  if (diferenciaPct < -5) {
    // Mas barato que vos
    impacto = 'te_afecta'
    if (diasEnMercado < 30) {
      razon = `${Math.abs(diferenciaPct).toFixed(0)}% mas barato y recien publicado. Los compradores lo veran primero.`
    } else if (diasEnMercado < 60) {
      razon = `${Math.abs(diferenciaPct).toFixed(0)}% mas barato. Competencia directa por precio.`
    } else {
      razon = `${Math.abs(diferenciaPct).toFixed(0)}% mas barato pero lleva ${diasEnMercado} dias. Algo lo frena (verificar estado).`
    }
  } else if (diferenciaPct > 5) {
    // Mas caro que vos
    impacto = 'te_beneficia'
    if (diasEnMercado > 60) {
      razon = `${diferenciaPct.toFixed(0)}% mas caro y ${diasEnMercado} dias sin vender. Los compradores lo descartaran y veran el tuyo.`
    } else if (diasEnMercado > 30) {
      razon = `${diferenciaPct.toFixed(0)}% mas caro. Te posiciona como mejor relacion precio-valor.`
    } else {
      razon = `${diferenciaPct.toFixed(0)}% mas caro. Si tiene mejores specs, puede justificarlo. Verifica amenities.`
    }
  } else {
    // Similar
    impacto = 'neutral'
    razon = `Precio similar. Competencia directa - la decision sera por detalles (fotos, ubicacion exacta, etc).`
  }

  return {
    propiedad: prop,
    diferenciaPct,
    diasEnMercado,
    impacto,
    razon
  }
}

function generarArgumentosContra(
  competidores: AnalisisCompetidor[],
  diasPromedio: number
): { argumento: string; respuesta: string }[] {
  const args: { argumento: string; respuesta: string }[] = []

  // Argumento 1: Competidor mas barato
  const masBarato = competidores.find(c => c.diferenciaPct < -5)
  if (masBarato) {
    args.push({
      argumento: `"En ${masBarato.propiedad.proyecto} hay uno similar por $${masBarato.propiedad.precio_usd.toLocaleString()}"`,
      respuesta: masBarato.diasEnMercado > 45
        ? `Ese lleva ${masBarato.diasEnMercado} dias publicado. Si fuera tan bueno ya se hubiera vendido. El mio tiene [tu diferenciador].`
        : `Ese tiene [diferencia negativa: peor piso/vista/estado]. Por eso el precio.`
    })
  }

  // Argumento 2: Cantidad de opciones
  if (competidores.length > 5) {
    args.push({
      argumento: `"Hay ${competidores.length} opciones similares, ¿por que la tuya?"`,
      respuesta: `De esas ${competidores.length}, solo [X] estan listas para entregar y [Y] tienen el mismo nivel de acabados. La mia es de las pocas que [diferenciador].`
    })
  }

  // Argumento 3: Tiempo en mercado (si aplica)
  args.push({
    argumento: `"El promedio de dias publicado es ${Math.round(diasPromedio)}. ¿Cuanto llevas vos?"`,
    respuesta: `Recien publique / Llevo poco porque [razon: recien decidi vender, estuve de viaje, etc]. El precio es firme basado en [comparables].`
  })

  // Argumento 4: Negociacion
  args.push({
    argumento: `"Todo el mundo negocia, ¿cual es tu mejor precio?"`,
    respuesta: `Mi precio ya esta ajustado al mercado. Estoy en el percentil [X]. Puedo considerar una oferta seria con [condiciones: pago contado, cierre rapido].`
  })

  return args
}

function generarEscenarios(
  tuPrecio: number,
  precioM2Mercado: number,
  tuArea: number,
  diasPromedio: number
): EscenarioPrecio[] {
  const precioMercado = precioM2Mercado * tuArea

  return [
    {
      nombre: 'Agresivo',
      precio: Math.round(precioMercado * 0.92),
      tiempoMin: 15,
      tiempoMax: 30,
      probabilidad: 'Venta rapida',
      esTuPrecio: false
    },
    {
      nombre: 'Competitivo',
      precio: Math.round(precioMercado * 0.98),
      tiempoMin: 30,
      tiempoMax: 60,
      probabilidad: 'Alta probabilidad',
      esTuPrecio: Math.abs(tuPrecio - precioMercado * 0.98) < precioMercado * 0.03
    },
    {
      nombre: 'Optimista',
      precio: Math.round(precioMercado * 1.05),
      tiempoMin: 60,
      tiempoMax: 120,
      probabilidad: 'Requiere paciencia',
      esTuPrecio: Math.abs(tuPrecio - precioMercado * 1.05) < precioMercado * 0.03
    },
    {
      nombre: 'Ambicioso',
      precio: Math.round(precioMercado * 1.15),
      tiempoMin: 120,
      tiempoMax: 180,
      probabilidad: 'Dificil sin diferenciador',
      esTuPrecio: tuPrecio >= precioMercado * 1.12
    }
  ]
}

function realizarAnalisis(
  resultados: UnidadReal[],
  datosPropiedad: DatosPropiedad
): AnalisisVendedor | null {
  if (!datosPropiedad.precio_referencia || resultados.length === 0) return null

  const tuPrecioM2 = datosPropiedad.precio_referencia / datosPropiedad.area_m2

  // Estadisticas de mercado
  const preciosM2 = resultados.map(r => r.precio_m2)
  const precioM2Mercado = preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length
  const precioM2Min = Math.min(...preciosM2)
  const precioM2Max = Math.max(...preciosM2)

  // Rango de mercado (para el area del usuario)
  const rangoMin = Math.round(precioM2Min * datosPropiedad.area_m2)
  const rangoMax = Math.round(precioM2Max * datosPropiedad.area_m2)

  // Percentil
  const masBaratos = preciosM2.filter(p => p < tuPrecioM2).length
  const percentil = Math.round((masBaratos / preciosM2.length) * 100)

  // Dias en mercado
  const diasList = resultados.map(r => r.dias_en_mercado || 0).filter(d => d > 0)
  const diasPromedioMercado = diasList.length > 0
    ? diasList.reduce((a, b) => a + b, 0) / diasList.length
    : 45

  // Veredicto
  const veredicto = calcularVeredicto(tuPrecioM2, precioM2Mercado)

  // Tiempo estimado basado en veredicto y dias promedio
  let tiempoEstimadoVenta = { min: 30, max: 60 }
  if (veredicto.tipo === 'muy_bajo') tiempoEstimadoVenta = { min: 10, max: 25 }
  else if (veredicto.tipo === 'bajo') tiempoEstimadoVenta = { min: 20, max: 40 }
  else if (veredicto.tipo === 'alto') tiempoEstimadoVenta = { min: 60, max: 120 }
  else if (veredicto.tipo === 'muy_alto') tiempoEstimadoVenta = { min: 120, max: 180 }

  // Ofertas probables (tipicamente 5-10% menos que lista)
  const ofertasProbables = {
    min: Math.round(datosPropiedad.precio_referencia * 0.90),
    max: Math.round(datosPropiedad.precio_referencia * 0.97)
  }

  // Cierre tipico
  const descuentoTipico = veredicto.tipo === 'competitivo' ? 0.04 :
                          veredicto.tipo === 'alto' ? 0.08 :
                          veredicto.tipo === 'muy_alto' ? 0.12 : 0.02
  const cierreTipico = Math.round(datosPropiedad.precio_referencia * (1 - descuentoTipico))

  // Analizar competidores
  const competidoresAnalizados = resultados
    .slice(0, 10)
    .map(prop => analizarCompetidor(prop, tuPrecioM2, datosPropiedad.area_m2))
    .sort((a, b) => a.diferenciaPct - b.diferenciaPct)

  // Argumentos contra
  const argumentosContra = generarArgumentosContra(competidoresAnalizados, diasPromedioMercado)

  // Escenarios
  const escenarios = generarEscenarios(
    datosPropiedad.precio_referencia,
    precioM2Mercado,
    datosPropiedad.area_m2,
    diasPromedioMercado
  )

  return {
    veredicto,
    tuPrecioM2,
    precioM2Mercado,
    rangoMin,
    rangoMax,
    percentil,
    competidoresMasBaratos: masBaratos,
    competidoresMasCaros: resultados.length - masBaratos,
    diasPromedioMercado,
    tiempoEstimadoVenta,
    ofertasProbables,
    cierreTipico,
    competidoresAnalizados,
    argumentosContra,
    escenarios
  }
}

// ============ COMPONENTE PRINCIPAL ============

export default function VendedorResults({ datosPropiedad, onBack, onShowLeadForm }: VendedorResultsProps) {
  const [resultados, setResultados] = useState<UnidadReal[]>([])
  const [analisis, setAnalisis] = useState<AnalisisVendedor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setError('Error al analizar mercado. Intenta de nuevo.')
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
          <p className="text-slate-500">Analizando tu competencia...</p>
        </div>
      </section>
    )
  }

  if (error || !analisis) {
    return (
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-red-500 mb-4">{error || 'No pudimos generar el analisis. Verifica los datos.'}</p>
          <button onClick={onBack} className="btn btn-secondary">
            Volver a intentar
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-6">
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

          {/* ============ 1. RESUMEN EJECUTIVO ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <div className="text-center mb-6">
              <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-dark mb-2">
                Analisis de tu Propiedad
              </h2>
              <p className="text-slate-500">
                {datosPropiedad.area_m2}m², {datosPropiedad.dormitorios} dorms, {datosPropiedad.zona === 'todas' ? 'Todo Equipetrol' : datosPropiedad.zona}
              </p>
            </div>

            {/* Veredicto */}
            <div className={`text-center p-6 rounded-xl mb-6 ${
              analisis.veredicto.tipo === 'competitivo' || analisis.veredicto.tipo === 'bajo'
                ? 'bg-green-50 border border-green-200'
                : analisis.veredicto.tipo === 'muy_alto'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-amber-50 border border-amber-200'
            }`}>
              <div className="text-4xl mb-2">{analisis.veredicto.emoji}</div>
              <h3 className={`text-xl font-bold mb-1 ${analisis.veredicto.color}`}>
                {analisis.veredicto.label}
              </h3>
              <p className="text-slate-600">
                Tu precio: <strong>${datosPropiedad.precio_referencia?.toLocaleString()}</strong> (${Math.round(analisis.tuPrecioM2).toLocaleString()}/m²)
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Rango de mercado: ${analisis.rangoMin.toLocaleString()} - ${analisis.rangoMax.toLocaleString()}
              </p>
            </div>

            {/* Posicion */}
            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Tu posicion en el mercado</span>
                <span className="font-semibold text-brand-dark">Percentil {analisis.percentil}</span>
              </div>
              <div className="h-4 bg-slate-200 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-brand-primary rounded-full transition-all"
                  style={{ width: `${analisis.percentil}%` }}
                />
                <div
                  className="absolute top-0 h-full w-1 bg-brand-dark"
                  style={{ left: `${analisis.percentil}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>{analisis.competidoresMasBaratos} mas baratos que vos</span>
                <span>{analisis.competidoresMasCaros} mas caros que vos</span>
              </div>
            </div>

            {/* Expectativas */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Ofertas probables</div>
                <div className="font-bold text-brand-dark">
                  ${analisis.ofertasProbables.min.toLocaleString()} - ${analisis.ofertasProbables.max.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Cierre tipico</div>
                <div className="font-bold text-brand-dark">
                  ~${analisis.cierreTipico.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400">
                  ({Math.round((1 - analisis.cierreTipico / datosPropiedad.precio_referencia!) * 100)}% menos)
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Tiempo estimado</div>
                <div className="font-bold text-brand-dark">
                  {analisis.tiempoEstimadoVenta.min}-{analisis.tiempoEstimadoVenta.max} dias
                </div>
              </div>
            </div>
          </div>

          {/* ============ 2. TU COMPETENCIA DIRECTA ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <h3 className="font-display text-xl font-bold text-brand-dark mb-2">
              Tu Competencia Directa
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Propiedades que un comprador vera junto a la tuya
            </p>

            <div className="space-y-4">
              {analisis.competidoresAnalizados.map((comp, i) => (
                <motion.div
                  key={comp.propiedad.id}
                  className={`rounded-xl border p-4 ${
                    comp.impacto === 'te_afecta'
                      ? 'border-red-200 bg-red-50/50'
                      : comp.impacto === 'te_beneficia'
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-slate-200'
                  }`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold text-brand-dark">{comp.propiedad.proyecto}</h4>
                      <p className="text-sm text-slate-500">
                        {comp.propiedad.dormitorios} dorms • {Math.round(comp.propiedad.area_m2)}m² • {comp.propiedad.zona}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      comp.diferenciaPct < -3
                        ? 'bg-red-100 text-red-700'
                        : comp.diferenciaPct > 3
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}>
                      {comp.diferenciaPct > 0 ? '+' : ''}{comp.diferenciaPct.toFixed(0)}% vs tu precio
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm mb-3">
                    <span className="font-semibold text-slate-700">
                      ${comp.propiedad.precio_usd.toLocaleString()}
                    </span>
                    <span className="text-slate-500">
                      ${Math.round(comp.propiedad.precio_m2).toLocaleString()}/m²
                    </span>
                    {comp.diasEnMercado > 0 && (
                      <span className={`${comp.diasEnMercado > 60 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {comp.diasEnMercado} dias publicado
                      </span>
                    )}
                  </div>

                  <div className={`text-sm p-3 rounded-lg ${
                    comp.impacto === 'te_afecta'
                      ? 'bg-red-100 text-red-800'
                      : comp.impacto === 'te_beneficia'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}>
                    <strong>
                      {comp.impacto === 'te_afecta' ? '⚠️ Te afecta: ' :
                       comp.impacto === 'te_beneficia' ? '✓ Te beneficia: ' :
                       '→ '}
                    </strong>
                    {comp.razon}
                  </div>
                </motion.div>
              ))}
            </div>

            {resultados.length > 10 && (
              <p className="text-center text-sm text-slate-500 mt-4">
                +{resultados.length - 10} propiedades mas en el mercado
              </p>
            )}
          </div>

          {/* ============ 3. ARGUMENTOS QUE USARAN CONTRA VOS ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <h3 className="font-display text-xl font-bold text-brand-dark mb-2">
              Que Argumentos Usaran Contra Vos
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Preparate para estas objeciones de compradores informados
            </p>

            <div className="space-y-4">
              {analisis.argumentosContra.map((arg, i) => (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 p-4 border-b border-slate-200">
                    <div className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">💬</span>
                      <p className="text-slate-700 italic">{arg.argumento}</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">💡</span>
                      <p className="text-slate-600">{arg.respuesta}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ============ 4. ESCENARIOS DE PRECIO ============ */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8 mb-6">
            <h3 className="font-display text-xl font-bold text-brand-dark mb-2">
              Escenarios de Precio
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Trade-off entre precio y tiempo de venta
            </p>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Estrategia</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Precio</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-600">Tiempo</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Probabilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.escenarios.map((esc, i) => (
                    <tr
                      key={i}
                      className={`border-b border-slate-100 ${esc.esTuPrecio ? 'bg-blue-50' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700">{esc.nombre}</span>
                        {esc.esTuPrecio && (
                          <span className="ml-2 text-xs bg-brand-primary text-white px-2 py-0.5 rounded">
                            TU PRECIO
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-700">
                        ${esc.precio.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {esc.tiempoMin}-{esc.tiempoMax} dias
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-sm">
                        {esc.probabilidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============ 5. LO QUE NO SABEMOS ============ */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
            <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Lo que NO sabemos (Honestidad Fiduciaria)
            </h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>• A cuanto se cerraron las ventas reales (solo vemos precios de lista)</li>
              <li>• Estado especifico de cada competidor (fotos vs realidad)</li>
              <li>• Si los precios de otros son negociables o firmes</li>
              <li>• Condiciones de financiamiento que ofrecen otros</li>
              <li>• Motivacion de venta de tus competidores (urgencia, etc)</li>
            </ul>
          </div>

          {/* ============ CTA ============ */}
          <div className="bg-gradient-to-br from-brand-dark to-brand-dark-card rounded-2xl p-8 text-center text-white">
            <h3 className="font-display text-2xl font-bold mb-3">
              ¿Queres un avaluo comercial completo?
            </h3>
            <p className="text-slate-400 mb-6">
              Un asesor profesional puede verificar detalles que no vemos en los datos:
              estado real, diferenciadores, estrategia de venta personalizada.
            </p>
            <button
              onClick={onShowLeadForm}
              className="btn btn-primary px-8 py-4 text-base"
            >
              Solicitar Avaluo Profesional
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
