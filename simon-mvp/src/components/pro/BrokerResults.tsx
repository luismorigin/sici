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

interface Ajuste {
  concepto: string
  valor: number
  explicacion: string
}

interface EstadisticasMercado {
  total: number
  precioMediano: number
  precioM2Mediano: number
  areaMediana: number
  precioMin: number
  precioMax: number
  precioM2Min: number
  precioM2Max: number
}

interface Percentiles {
  p25: number
  p50: number
  p75: number
  p25M2: number
  p50M2: number
  p75M2: number
}

interface Comparable {
  posicion: number
  proyecto: string
  zona: string
  area: number
  precio: number
  precioM2: number
  dias: number
  estado: string
  tipoEdificio: string
  ajustes: Ajuste[]
  precioAjustado: number
  relevancia: 'alta' | 'media' | 'baja'
}

interface ZonaStats {
  zona: string
  unidades: number
  precioM2Min: number
  precioM2Mediano: number
  precioM2Max: number
}

interface RecomendacionPrecio {
  tipo: 'mantener' | 'bajar_leve' | 'bajar_fuerte' | 'subir'
  precioSugerido: number
  razon: string
}

interface AnalisisCMA {
  id: string
  fecha: string
  propiedadCliente: {
    direccion: string
    dormitorios: number
    area: number
    zona: string
    estado: string
    tipo: string
    parqueos: number
    precio: number
    precioM2: number
  }
  mercado: EstadisticasMercado
  percentiles: Percentiles
  clientePercentil: number
  diferenciaPct: number
  posicionMercado: 'muy_bajo' | 'bajo' | 'competitivo' | 'alto' | 'muy_alto'
  comparables: Comparable[]
  zonaStats: ZonaStats[]
  recomendacion: RecomendacionPrecio
  diasEstimados: { min: number; max: number }
  probabilidadVenta30Dias: number
  probabilidadVenta60Dias: number
  advertencias: string[]
}

// ============ CONSTANTES ============

const AJUSTE_PARQUEO = 8000
const AJUSTE_PREMIUM = 0.12
const AJUSTE_BASICO = -0.10
const AMENITIES_PREMIUM = ['piscina', 'pileta', 'gym', 'gimnasio', 'sauna', 'salon_eventos', 'bbq', 'parrilla', 'seguridad_24h', 'lobby']

// ============ FUNCIONES DE CALCULO ============

function calcularMediana(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function calcularPercentil(arr: number[], percentil: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const index = Math.ceil((percentil / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

function calcularPosicionPercentil(valor: number, arr: number[]): number {
  if (arr.length === 0) return 50
  const sorted = [...arr].sort((a, b) => a - b)
  const menores = sorted.filter(v => v < valor).length
  return Math.round((menores / sorted.length) * 100)
}

function generarIdCMA(dorms: number, area: number): string {
  const fecha = new Date()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `CMA-${fecha.getFullYear()}-${mes}${dia}-${random}`
}

function formatearEstado(estado: string | null): string {
  if (!estado) return 'No especificado'
  const map: Record<string, string> = {
    'entregado': 'Entrega inmediata',
    'entrega_inmediata': 'Entrega inmediata',
    'preventa': 'Preventa',
    'construccion': 'En construccion',
    'planos': 'En planos',
    'nuevo': 'Nuevo a estrenar',
    'usado': 'Usado'
  }
  return map[estado.toLowerCase()] || estado
}

function formatearZona(zona: string): string {
  const map: Record<string, string> = {
    'equipetrol': 'Equipetrol',
    'sirari': 'Sirari',
    'equipetrol_norte': 'Equipetrol Norte',
    'villa_brigida': 'Villa Brigida',
    'faremafu': 'Faremafu',
    'todas': 'Equipetrol'
  }
  return map[zona.toLowerCase()] || zona
}

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

function calcularAjustes(
  prop: UnidadReal,
  datosCliente: DatosPropiedad,
  precioM2Mercado: number
): { ajustes: Ajuste[]; precioAjustado: number } {
  const ajustes: Ajuste[] = []
  let precioBase = prop.precio_usd

  // 1. Ajuste por diferencia de area
  const diffArea = prop.area_m2 - datosCliente.area_m2
  if (Math.abs(diffArea) >= 5) {
    const ajusteArea = Math.round(diffArea * precioM2Mercado)
    ajustes.push({
      concepto: 'Area',
      valor: -ajusteArea,
      explicacion: diffArea > 0
        ? `+${Math.round(diffArea)}m² que el sujeto`
        : `${Math.round(diffArea)}m² que el sujeto`
    })
    precioBase -= ajusteArea
  }

  // 2. Ajuste por parqueos
  const parqueosComp = 1
  const diffParqueos = parqueosComp - datosCliente.parqueos
  if (diffParqueos !== 0) {
    const ajusteParqueo = diffParqueos * AJUSTE_PARQUEO
    ajustes.push({
      concepto: 'Parqueo',
      valor: -ajusteParqueo,
      explicacion: diffParqueos > 0
        ? `+${diffParqueos} parqueo(s)`
        : `${diffParqueos} parqueo(s)`
    })
    precioBase -= ajusteParqueo
  }

  // 3. Ajuste por tipo de edificio
  const tipoComp = inferirTipoEdificio(prop.amenities_confirmados)
  if (tipoComp !== datosCliente.tipo_edificio) {
    let ajusteTipo = 0
    let explicacion = ''

    if (tipoComp === 'premium' && datosCliente.tipo_edificio !== 'premium') {
      ajusteTipo = Math.round(prop.precio_usd * AJUSTE_PREMIUM)
      explicacion = 'Comparable es premium'
    } else if (tipoComp === 'basico' && datosCliente.tipo_edificio !== 'basico') {
      ajusteTipo = Math.round(prop.precio_usd * AJUSTE_BASICO)
      explicacion = 'Comparable es basico'
    } else if (tipoComp === 'standard' && datosCliente.tipo_edificio === 'premium') {
      ajusteTipo = Math.round(prop.precio_usd * -0.08)
      explicacion = 'Comparable es standard'
    } else if (tipoComp === 'standard' && datosCliente.tipo_edificio === 'basico') {
      ajusteTipo = Math.round(prop.precio_usd * 0.06)
      explicacion = 'Comparable es standard'
    }

    if (ajusteTipo !== 0) {
      ajustes.push({
        concepto: 'Tipo edificio',
        valor: -ajusteTipo,
        explicacion
      })
      precioBase -= ajusteTipo
    }
  }

  return { ajustes, precioAjustado: Math.round(precioBase) }
}

function calcularPosicionMercado(precioM2Cliente: number, precioM2Mercado: number): 'muy_bajo' | 'bajo' | 'competitivo' | 'alto' | 'muy_alto' {
  const diferencia = ((precioM2Cliente - precioM2Mercado) / precioM2Mercado) * 100
  if (diferencia < -15) return 'muy_bajo'
  if (diferencia < -5) return 'bajo'
  if (diferencia <= 5) return 'competitivo'
  if (diferencia <= 15) return 'alto'
  return 'muy_alto'
}

// ============ ANALISIS PRINCIPAL ============

function realizarAnalisisCMA(
  resultados: UnidadReal[],
  datosPropiedad: DatosPropiedad
): AnalisisCMA | null {
  if (!datosPropiedad.precio_referencia || resultados.length === 0) return null

  const precioCliente = datosPropiedad.precio_referencia
  const precioM2Cliente = precioCliente / datosPropiedad.area_m2

  // Estadisticas del mercado total
  const precios = resultados.map(r => r.precio_usd)
  const preciosM2 = resultados.map(r => r.precio_m2)
  const areas = resultados.map(r => r.area_m2)

  const mercado: EstadisticasMercado = {
    total: resultados.length,
    precioMediano: Math.round(calcularMediana(precios)),
    precioM2Mediano: Math.round(calcularMediana(preciosM2)),
    areaMediana: Math.round(calcularMediana(areas)),
    precioMin: Math.round(Math.min(...precios)),
    precioMax: Math.round(Math.max(...precios)),
    precioM2Min: Math.round(Math.min(...preciosM2)),
    precioM2Max: Math.round(Math.max(...preciosM2))
  }

  // Filtrar comparables directos (area similar ±30%)
  const areaMin = datosPropiedad.area_m2 * 0.7
  const areaMax = datosPropiedad.area_m2 * 1.3
  let comparablesRaw = resultados.filter(r => r.area_m2 >= areaMin && r.area_m2 <= areaMax)

  const advertencias: string[] = []

  if (comparablesRaw.length < 3) {
    advertencias.push(`Pocos comparables directos. Rango de area ampliado.`)
    comparablesRaw = resultados.filter(r => r.area_m2 >= areaMin * 0.7 && r.area_m2 <= areaMax * 1.3)
  }

  // Filtrar por tipo edificio si es posible
  const tipoUsuario = datosPropiedad.tipo_edificio
  const filtradosPorTipo = comparablesRaw.filter(r => {
    const tipoInferido = inferirTipoEdificio(r.amenities_confirmados)
    return tipoInferido === tipoUsuario
  })

  if (filtradosPorTipo.length >= 3) {
    comparablesRaw = filtradosPorTipo
  } else {
    advertencias.push(`Incluye edificios de diferente categoria por falta de comparables ${tipoUsuario}.`)
  }

  const preciosComp = comparablesRaw.map(r => r.precio_usd)
  const preciosM2Comp = comparablesRaw.map(r => r.precio_m2)

  // Percentiles
  const percentiles: Percentiles = {
    p25: Math.round(calcularPercentil(preciosComp, 25)),
    p50: Math.round(calcularPercentil(preciosComp, 50)),
    p75: Math.round(calcularPercentil(preciosComp, 75)),
    p25M2: Math.round(calcularPercentil(preciosM2Comp, 25)),
    p50M2: Math.round(calcularPercentil(preciosM2Comp, 50)),
    p75M2: Math.round(calcularPercentil(preciosM2Comp, 75))
  }

  const clientePercentil = calcularPosicionPercentil(precioM2Cliente, preciosM2Comp)
  const diferenciaPct = percentiles.p50 > 0
    ? Math.round(((precioCliente - percentiles.p50) / percentiles.p50) * 100)
    : 0
  const posicionMercado = calcularPosicionMercado(precioM2Cliente, mercado.precioM2Mediano)

  // Lista de comparables con ajustes
  const comparables: Comparable[] = comparablesRaw
    .slice(0, 10)
    .sort((a, b) => a.precio_usd - b.precio_usd)
    .map((r, i) => {
      const tipoEdificio = inferirTipoEdificio(r.amenities_confirmados)
      const { ajustes, precioAjustado } = calcularAjustes(r, datosPropiedad, mercado.precioM2Mediano)

      const diffArea = Math.abs(r.area_m2 - datosPropiedad.area_m2)
      const mismoTipo = tipoEdificio === datosPropiedad.tipo_edificio
      let relevancia: 'alta' | 'media' | 'baja' = 'media'
      if (diffArea <= datosPropiedad.area_m2 * 0.15 && mismoTipo) relevancia = 'alta'
      else if (diffArea > datosPropiedad.area_m2 * 0.25 && !mismoTipo) relevancia = 'baja'

      return {
        posicion: i + 1,
        proyecto: r.proyecto || 'Sin nombre',
        zona: formatearZona(r.zona),
        area: Math.round(r.area_m2),
        precio: Math.round(r.precio_usd),
        precioM2: Math.round(r.precio_m2),
        dias: r.dias_en_mercado || 0,
        estado: formatearEstado(r.estado_construccion),
        tipoEdificio,
        ajustes,
        precioAjustado,
        relevancia
      }
    })

  // Stats por zona
  const zonas = [...new Set(resultados.map(r => r.zona))]
  const zonaStats: ZonaStats[] = zonas.map(zona => {
    const props = resultados.filter(r => r.zona === zona)
    const pm2 = props.map(p => p.precio_m2)
    return {
      zona: formatearZona(zona),
      unidades: props.length,
      precioM2Min: Math.round(Math.min(...pm2)),
      precioM2Mediano: Math.round(calcularMediana(pm2)),
      precioM2Max: Math.round(Math.max(...pm2))
    }
  }).sort((a, b) => b.unidades - a.unidades)

  // Recomendacion
  let recomendacion: RecomendacionPrecio
  if (diferenciaPct > 20) {
    recomendacion = {
      tipo: 'bajar_fuerte',
      precioSugerido: Math.round(percentiles.p50 * 1.05),
      razon: `El precio del cliente esta ${diferenciaPct}% sobre el mercado. Recomendar ajuste a $${Math.round(percentiles.p50 * 1.05).toLocaleString()}.`
    }
  } else if (diferenciaPct > 10) {
    recomendacion = {
      tipo: 'bajar_leve',
      precioSugerido: Math.round(percentiles.p50 * 1.02),
      razon: `Precio ${diferenciaPct}% sobre mercado. Ajuste moderado mejoraria tiempo de venta.`
    }
  } else if (diferenciaPct < -10) {
    recomendacion = {
      tipo: 'subir',
      precioSugerido: Math.round(percentiles.p50 * 0.98),
      razon: `Precio ${Math.abs(diferenciaPct)}% bajo mercado. Podria subir sin perder competitividad.`
    }
  } else {
    recomendacion = {
      tipo: 'mantener',
      precioSugerido: precioCliente,
      razon: `Precio competitivo. Bien posicionado para el mercado actual.`
    }
  }

  // Estimaciones de tiempo
  let diasEstimados = { min: 30, max: 60 }
  let prob30 = 50
  let prob60 = 75

  if (posicionMercado === 'muy_bajo') {
    diasEstimados = { min: 10, max: 25 }; prob30 = 85; prob60 = 95
  } else if (posicionMercado === 'bajo') {
    diasEstimados = { min: 20, max: 40 }; prob30 = 70; prob60 = 90
  } else if (posicionMercado === 'alto') {
    diasEstimados = { min: 60, max: 120 }; prob30 = 25; prob60 = 50
  } else if (posicionMercado === 'muy_alto') {
    diasEstimados = { min: 120, max: 200 }; prob30 = 10; prob60 = 25
  }

  return {
    id: generarIdCMA(datosPropiedad.dormitorios, datosPropiedad.area_m2),
    fecha: new Date().toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }),
    propiedadCliente: {
      direccion: datosPropiedad.propiedad_direccion || `${formatearZona(datosPropiedad.zona)}, ${datosPropiedad.dormitorios}D`,
      dormitorios: datosPropiedad.dormitorios,
      area: datosPropiedad.area_m2,
      zona: formatearZona(datosPropiedad.zona === 'todas' ? 'equipetrol' : datosPropiedad.zona),
      estado: datosPropiedad.estado_entrega === 'entrega_inmediata' ? 'Entrega inmediata' : 'Preventa',
      tipo: datosPropiedad.tipo_edificio,
      parqueos: datosPropiedad.parqueos,
      precio: precioCliente,
      precioM2: Math.round(precioM2Cliente)
    },
    mercado,
    percentiles,
    clientePercentil,
    diferenciaPct,
    posicionMercado,
    comparables,
    zonaStats,
    recomendacion,
    diasEstimados,
    probabilidadVenta30Dias: prob30,
    probabilidadVenta60Dias: prob60,
    advertencias
  }
}

// ============ COMPONENTE PRINCIPAL ============

export default function BrokerResults({ datosPropiedad, onBack, onShowLeadForm }: BrokerResultsProps) {
  const [analisis, setAnalisis] = useState<AnalisisCMA | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedComp, setExpandedComp] = useState<number | null>(null)

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
          limite: 100
        })

        if (data && data.length > 0) {
          setAnalisis(realizarAnalisisCMA(data, datosPropiedad))
        }
      } catch (err) {
        console.error('Error:', err)
        setError('Error al generar CMA.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [datosPropiedad])

  if (loading) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500">Generando CMA profesional...</p>
        </div>
      </section>
    )
  }

  if (error || !analisis) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-red-500 mb-4">{error || 'No se pudo generar el CMA.'}</p>
          <button onClick={onBack} className="btn btn-secondary">Volver</button>
        </div>
      </section>
    )
  }

  const { propiedadCliente, mercado, percentiles, clientePercentil, diferenciaPct, posicionMercado, comparables, zonaStats, recomendacion, diasEstimados, probabilidadVenta30Dias, probabilidadVenta60Dias, advertencias } = analisis

  // Branding
  const brokerNombre = datosPropiedad.broker_nombre || 'Asesor Inmobiliario'
  const brokerTelefono = datosPropiedad.broker_telefono
  const brokerEmpresa = datosPropiedad.broker_empresa
  const brokerLogo = datosPropiedad.broker_logo
  const brokerFoto = datosPropiedad.broker_foto
  const propiedadFotos = datosPropiedad.propiedad_fotos || []

  // Estilos posicion
  const posicionStyles = {
    muy_bajo: { label: 'Muy bajo', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    bajo: { label: 'Competitivo-bajo', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
    competitivo: { label: 'Competitivo', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
    alto: { label: 'Alto', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    muy_alto: { label: 'Muy alto', color: 'text-red-700', bg: 'bg-red-50 border-red-200' }
  }
  const posicionStyle = posicionStyles[posicionMercado]

  // Calcular valor estimado basado en comparables ajustados
  const preciosAjustados = comparables.map(c => c.precioAjustado)
  const valorEstimadoMin = Math.round(calcularPercentil(preciosAjustados, 25))
  const valorEstimadoMid = Math.round(calcularMediana(preciosAjustados))
  const valorEstimadoMax = Math.round(calcularPercentil(preciosAjustados, 75))

  return (
    <section className="py-8 bg-slate-50 min-h-screen print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Header con navegacion (no imprimir) */}
          <div className="flex justify-between items-center mb-6 print:hidden">
            <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Editar datos
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-primary-hover"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Imprimir CMA
            </button>
          </div>

          {/* ============ PORTADA / HEADER ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0">
            {/* Branding header */}
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-4">
                {brokerLogo ? (
                  <img src={brokerLogo} alt="Logo" className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 bg-brand-primary/10 rounded-lg flex items-center justify-center">
                    <span className="text-2xl font-bold text-brand-primary">CMA</span>
                  </div>
                )}
                <div>
                  {brokerEmpresa && <div className="font-semibold text-slate-800">{brokerEmpresa}</div>}
                  <div className="text-sm text-slate-600">{brokerNombre}</div>
                  {brokerTelefono && <div className="text-sm text-slate-500">{brokerTelefono}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {brokerFoto && (
                  <img src={brokerFoto} alt={brokerNombre} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
                )}
                <div className="text-right text-sm text-slate-500">
                  <div>Generado: {analisis.fecha}</div>
                  <div className="font-mono text-xs">ID: {analisis.id}</div>
                </div>
              </div>
            </div>

            {/* Titulo */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                ANALISIS COMPARATIVO DE MERCADO
              </h1>
              <p className="text-slate-600">{propiedadCliente.direccion}</p>
            </div>

            {/* Fotos de la propiedad */}
            {propiedadFotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-6">
                {propiedadFotos.slice(0, 3).map((foto, i) => (
                  <div key={i} className={`aspect-video rounded-lg overflow-hidden ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
                    <img src={foto} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Datos del sujeto */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-xs font-semibold text-slate-500 mb-3">DATOS DEL SUJETO</div>
              <div className="grid md:grid-cols-6 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-400">Zona</div>
                  <div className="font-medium text-slate-700">{propiedadCliente.zona}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Dorms</div>
                  <div className="font-medium text-slate-700">{propiedadCliente.dormitorios}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Area</div>
                  <div className="font-medium text-slate-700">{propiedadCliente.area}m²</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Tipo</div>
                  <div className="font-medium text-slate-700 capitalize">{propiedadCliente.tipo}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Parqueos</div>
                  <div className="font-medium text-slate-700">{propiedadCliente.parqueos}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Estado</div>
                  <div className="font-medium text-slate-700">{propiedadCliente.estado}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ============ 1. RESUMEN EJECUTIVO ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">1</span>
              Resumen Ejecutivo
            </h3>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {/* Precio cliente */}
              <div className={`rounded-lg p-4 border ${posicionStyle.bg}`}>
                <div className="text-xs font-semibold text-slate-600 mb-2">Precio del Cliente</div>
                <div className="text-2xl font-bold text-slate-800">${propiedadCliente.precio.toLocaleString()}</div>
                <div className="text-sm text-slate-600">${propiedadCliente.precioM2.toLocaleString()}/m²</div>
                <div className={`mt-2 inline-block px-2 py-1 rounded text-xs font-medium ${posicionStyle.color}`}>
                  {posicionStyle.label} en mercado
                </div>
              </div>

              {/* Valor estimado */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="text-xs font-semibold text-green-700 mb-2">Valor Estimado (Ajustado)</div>
                <div className="text-2xl font-bold text-slate-800">${valorEstimadoMid.toLocaleString()}</div>
                <div className="text-sm text-slate-600">
                  Rango: ${valorEstimadoMin.toLocaleString()} - ${valorEstimadoMax.toLocaleString()}
                </div>
                <div className="mt-2 text-xs text-green-600">
                  Basado en {comparables.length} comparables ajustados
                </div>
              </div>

              {/* Diferencia */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="text-xs font-semibold text-slate-600 mb-2">Diferencia vs Mercado</div>
                <div className={`text-2xl font-bold ${diferenciaPct > 5 ? 'text-amber-600' : diferenciaPct < -5 ? 'text-green-600' : 'text-slate-800'}`}>
                  {diferenciaPct > 0 ? '+' : ''}{diferenciaPct}%
                </div>
                <div className="text-sm text-slate-600">Percentil {clientePercentil}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {diferenciaPct > 10 ? 'Por encima del mercado' : diferenciaPct < -10 ? 'Por debajo del mercado' : 'Alineado con mercado'}
                </div>
              </div>
            </div>

            {/* Escala de precios */}
            <div className="grid md:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">P25 (Competitivo)</div>
                <div className="font-bold text-slate-800">${percentiles.p25.toLocaleString()}</div>
                <div className="text-xs text-slate-400">${percentiles.p25M2.toLocaleString()}/m²</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">P50 (Mercado)</div>
                <div className="font-bold text-slate-800">${percentiles.p50.toLocaleString()}</div>
                <div className="text-xs text-slate-400">${percentiles.p50M2.toLocaleString()}/m²</div>
              </div>
              <div className={`rounded-lg p-3 text-center border-2 ${diferenciaPct > 10 ? 'border-amber-300 bg-amber-50' : diferenciaPct < -5 ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'}`}>
                <div className="text-xs text-slate-500 mb-1">Precio Cliente</div>
                <div className="font-bold text-slate-800">${propiedadCliente.precio.toLocaleString()}</div>
                <div className="text-xs text-slate-400">${propiedadCliente.precioM2.toLocaleString()}/m²</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">P75 (Premium)</div>
                <div className="font-bold text-slate-800">${percentiles.p75.toLocaleString()}</div>
                <div className="text-xs text-slate-400">${percentiles.p75M2.toLocaleString()}/m²</div>
              </div>
            </div>

            {advertencias.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <strong>Nota:</strong> {advertencias.join(' ')}
              </div>
            )}
          </div>

          {/* ============ 2. RECOMENDACION ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">2</span>
              Recomendacion de Precio
            </h3>

            <div className={`rounded-lg p-5 mb-4 ${
              recomendacion.tipo === 'mantener' ? 'bg-green-50 border border-green-200' :
              recomendacion.tipo === 'bajar_fuerte' ? 'bg-red-50 border border-red-200' :
              'bg-amber-50 border border-amber-200'
            }`}>
              <div className="flex items-start gap-4">
                <span className="text-2xl">
                  {recomendacion.tipo === 'mantener' ? '✓' :
                   recomendacion.tipo === 'bajar_fuerte' ? '⚠️' :
                   recomendacion.tipo === 'bajar_leve' ? '↓' : '↑'}
                </span>
                <div>
                  <h4 className={`font-bold text-lg mb-1 ${
                    recomendacion.tipo === 'mantener' ? 'text-green-700' :
                    recomendacion.tipo === 'bajar_fuerte' ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    {recomendacion.tipo === 'mantener' ? 'Precio Bien Posicionado' :
                     recomendacion.tipo === 'bajar_fuerte' ? 'Recomendar Ajuste Significativo' :
                     recomendacion.tipo === 'bajar_leve' ? 'Sugerir Ajuste Moderado' :
                     'Considerar Ajuste al Alza'}
                  </h4>
                  <p className="text-slate-700">{recomendacion.razon}</p>
                  {recomendacion.tipo !== 'mantener' && (
                    <div className="mt-3 p-3 bg-white rounded-lg">
                      <span className="text-sm text-slate-600">Precio sugerido: </span>
                      <span className="text-lg font-bold text-slate-800">${recomendacion.precioSugerido.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Proyecciones */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Tiempo estimado</div>
                <div className="font-bold text-slate-800 text-lg">{diasEstimados.min}-{diasEstimados.max} dias</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Prob. venta 30d</div>
                <div className={`font-bold text-lg ${probabilidadVenta30Dias >= 60 ? 'text-green-600' : probabilidadVenta30Dias >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                  {probabilidadVenta30Dias}%
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <div className="text-sm text-slate-500 mb-1">Prob. venta 60d</div>
                <div className={`font-bold text-lg ${probabilidadVenta60Dias >= 70 ? 'text-green-600' : probabilidadVenta60Dias >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {probabilidadVenta60Dias}%
                </div>
              </div>
            </div>
          </div>

          {/* ============ 3. COMPARABLES ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">3</span>
              Comparables de Mercado
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {comparables.length} propiedades similares analizadas. Click para ver ajustes.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 px-2 font-medium text-slate-600">#</th>
                    <th className="py-2 px-2 font-medium text-slate-600">Edificio</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">m²</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Precio Lista</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Precio Ajustado</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m²</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-center">Relevancia</th>
                  </tr>
                </thead>
                <tbody>
                  {comparables.map((comp) => (
                    <>
                      <tr
                        key={comp.posicion}
                        className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                          comp.relevancia === 'alta' ? 'bg-green-50/50' : ''
                        }`}
                        onClick={() => setExpandedComp(expandedComp === comp.posicion ? null : comp.posicion)}
                      >
                        <td className="py-2 px-2 text-slate-500">{comp.posicion}</td>
                        <td className="py-2 px-2 text-slate-800">
                          {comp.proyecto}
                          <div className="text-xs text-slate-400">{comp.zona} · {comp.tipoEdificio}</div>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600">{comp.area}</td>
                        <td className="py-2 px-2 text-right text-slate-600">${comp.precio.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-medium text-slate-800">${comp.precioAjustado.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-slate-600">${comp.precioM2.toLocaleString()}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            comp.relevancia === 'alta' ? 'bg-green-100 text-green-700' :
                            comp.relevancia === 'media' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {comp.relevancia}
                          </span>
                        </td>
                      </tr>
                      {expandedComp === comp.posicion && comp.ajustes.length > 0 && (
                        <tr className="bg-slate-50">
                          <td colSpan={7} className="p-4">
                            <div className="text-xs font-medium text-slate-500 mb-2">AJUSTES APLICADOS</div>
                            <div className="space-y-1">
                              {comp.ajustes.map((aj, i) => (
                                <div key={i} className="flex justify-between text-sm">
                                  <span className="text-slate-600">{aj.concepto}: {aj.explicacion}</span>
                                  <span className={aj.valor < 0 ? 'text-red-600' : 'text-green-600'}>
                                    {aj.valor < 0 ? '' : '+'}${aj.valor.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                              <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between font-medium">
                                <span>Precio ajustado:</span>
                                <span>${comp.precioAjustado.toLocaleString()}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============ 4. PRECIO POR ZONA ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">4</span>
              Referencia de Precio por Zona
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 px-2 font-medium text-slate-600">Zona</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Unidades</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m² Min</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m² Mediano</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m² Max</th>
                  </tr>
                </thead>
                <tbody>
                  {zonaStats.map((z) => (
                    <tr
                      key={z.zona}
                      className={`border-b border-slate-100 ${z.zona === propiedadCliente.zona ? 'bg-blue-50' : ''}`}
                    >
                      <td className="py-2 px-2 text-slate-800">
                        {z.zona}
                        {z.zona === propiedadCliente.zona && <span className="text-xs text-blue-600 ml-1">(sujeto)</span>}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-600">{z.unidades}</td>
                      <td className="py-2 px-2 text-right text-slate-600">${z.precioM2Min.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-800 font-medium">${z.precioM2Mediano.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-600">${z.precioM2Max.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============ DISCLAIMER ============ */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Nota Profesional
            </h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>• Este CMA utiliza precios de lista, no precios de cierre reales.</li>
              <li>• Los ajustes son estimaciones basadas en promedios del mercado de Equipetrol.</li>
              <li>• Factores como estado interior, piso, vista y acabados pueden afectar el valor final.</li>
              <li>• Se recomienda inspeccion presencial antes de confirmar el precio de lista.</li>
            </ul>
          </div>

          {/* ============ FOOTER ============ */}
          <div className="text-center py-6 border-t border-slate-200">
            <div className="flex items-center justify-center gap-4 mb-3">
              {brokerLogo && <img src={brokerLogo} alt="Logo" className="h-8 object-contain" />}
              <div>
                <div className="font-semibold text-slate-700">{brokerNombre}</div>
                {brokerTelefono && <div className="text-sm text-slate-500">{brokerTelefono}</div>}
              </div>
            </div>
            <div className="text-xs text-slate-400">
              CMA generado con datos de {mercado.total} propiedades activas en el mercado.
              <br />Informe ID: {analisis.id} | {analisis.fecha}
            </div>
          </div>

          {/* CTA (no imprimir) */}
          <div className="bg-gradient-to-br from-brand-dark to-brand-dark-card rounded-xl p-6 text-center text-white mt-6 print:hidden">
            <h3 className="font-bold text-lg mb-2">¿Necesitas mas herramientas?</h3>
            <p className="text-slate-400 text-sm mb-4">
              Registrate para guardar CMAs, seguimiento de clientes y datos exclusivos.
            </p>
            <button onClick={onShowLeadForm} className="btn btn-primary">
              Registrarme como Broker
            </button>
          </div>
        </motion.div>
      </div>

      {/* Estilos de impresion */}
      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
          .print\\:border-0 { border: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </section>
  )
}
