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

interface EstadisticasComparables {
  total: number
  areaPromedio: number
  precioMediano: number
  precioM2Mediano: number
  precioMin: number
  precioMax: number
}

interface Percentiles {
  p25: number
  p50: number
  p75: number
  p25M2: number
  p50M2: number
  p75M2: number
}

interface ZonaStats {
  zona: string
  unidades: number
  precioM2Min: number
  precioM2Mediano: number
  precioM2Max: number
  areaPromedio: number
}

interface EstadoStats {
  estado: string
  unidades: number
  porcentaje: number
  precioPromedio: number
  precioM2Promedio: number
}

interface Competidor {
  posicion: number
  proyecto: string
  zona: string
  area: number
  precio: number
  precioM2: number
  dias: number
  estado: string
  esTuPropiedad?: boolean
}

interface AnalisisVendedor {
  id: string
  fecha: string
  tuPropiedad: {
    dormitorios: number
    area: number
    zona: string
    estado: string
    precio: number
    precioM2: number
  }
  mercado: EstadisticasMercado
  comparables: EstadisticasComparables
  percentiles: Percentiles
  tuPercentil: number
  diferenciaPct: number
  competidores: Competidor[]
  zonaStats: ZonaStats[]
  estadoStats: EstadoStats[]
  diasPromedio: number
  ventajaCompetitiva: string[]
}

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

function generarIdInforme(dorms: number, area: number): string {
  const fecha = new Date()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `SV-${fecha.getFullYear()}-${mes}${dia}-${dorms}D${area}`
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
    'faremafu': 'Faremafu'
  }
  return map[zona.toLowerCase()] || zona
}

// ============ ANALISIS PRINCIPAL ============

function realizarAnalisis(
  resultados: UnidadReal[],
  datosPropiedad: DatosPropiedad
): AnalisisVendedor | null {
  if (!datosPropiedad.precio_referencia || resultados.length === 0) return null

  const tuPrecio = datosPropiedad.precio_referencia
  const tuPrecioM2 = tuPrecio / datosPropiedad.area_m2

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
  const comparablesRaw = resultados.filter(r => r.area_m2 >= areaMin && r.area_m2 <= areaMax)

  const preciosComp = comparablesRaw.map(r => r.precio_usd)
  const preciosM2Comp = comparablesRaw.map(r => r.precio_m2)
  const areasComp = comparablesRaw.map(r => r.area_m2)

  const comparables: EstadisticasComparables = {
    total: comparablesRaw.length,
    areaPromedio: comparablesRaw.length > 0 ? Math.round(areasComp.reduce((a, b) => a + b, 0) / areasComp.length) : 0,
    precioMediano: Math.round(calcularMediana(preciosComp)),
    precioM2Mediano: Math.round(calcularMediana(preciosM2Comp)),
    precioMin: comparablesRaw.length > 0 ? Math.round(Math.min(...preciosComp)) : 0,
    precioMax: comparablesRaw.length > 0 ? Math.round(Math.max(...preciosComp)) : 0
  }

  // Percentiles del mercado de comparables
  const percentiles: Percentiles = {
    p25: Math.round(calcularPercentil(preciosComp, 25)),
    p50: Math.round(calcularPercentil(preciosComp, 50)),
    p75: Math.round(calcularPercentil(preciosComp, 75)),
    p25M2: Math.round(calcularPercentil(preciosM2Comp, 25)),
    p50M2: Math.round(calcularPercentil(preciosM2Comp, 50)),
    p75M2: Math.round(calcularPercentil(preciosM2Comp, 75))
  }

  // Tu posicion en percentil
  const tuPercentil = calcularPosicionPercentil(tuPrecioM2, preciosM2Comp)
  const diferenciaPct = comparables.precioMediano > 0
    ? Math.round(((tuPrecio - comparables.precioMediano) / comparables.precioMediano) * 100)
    : 0

  // Lista de competidores ordenada por precio
  const competidoresOrdenados = [...comparablesRaw]
    .sort((a, b) => a.precio_usd - b.precio_usd)
    .map((r, i) => ({
      posicion: i + 1,
      proyecto: r.proyecto || 'Sin nombre',
      zona: formatearZona(r.zona),
      area: Math.round(r.area_m2),
      precio: Math.round(r.precio_usd),
      precioM2: Math.round(r.precio_m2),
      dias: r.dias_en_mercado || 0,
      estado: formatearEstado(r.estado_construccion)
    }))

  // Insertar "tu propiedad" en la posicion correcta
  const competidores: Competidor[] = []
  let tuPosicionInsertada = false
  competidoresOrdenados.forEach((comp, i) => {
    if (!tuPosicionInsertada && tuPrecio <= comp.precio) {
      competidores.push({
        posicion: competidores.length + 1,
        proyecto: 'TU PROPIEDAD',
        zona: formatearZona(datosPropiedad.zona),
        area: datosPropiedad.area_m2,
        precio: tuPrecio,
        precioM2: Math.round(tuPrecioM2),
        dias: 0,
        estado: datosPropiedad.estado_entrega === 'entrega_inmediata' ? 'Entrega inmediata' : 'Preventa',
        esTuPropiedad: true
      })
      tuPosicionInsertada = true
    }
    competidores.push({ ...comp, posicion: competidores.length + 1 })
  })
  if (!tuPosicionInsertada) {
    competidores.push({
      posicion: competidores.length + 1,
      proyecto: 'TU PROPIEDAD',
      zona: formatearZona(datosPropiedad.zona),
      area: datosPropiedad.area_m2,
      precio: tuPrecio,
      precioM2: Math.round(tuPrecioM2),
      dias: 0,
      estado: datosPropiedad.estado_entrega === 'entrega_inmediata' ? 'Entrega inmediata' : 'Preventa',
      esTuPropiedad: true
    })
  }

  // Stats por zona
  const zonas = [...new Set(resultados.map(r => r.zona))]
  const zonaStats: ZonaStats[] = zonas.map(zona => {
    const props = resultados.filter(r => r.zona === zona)
    const pm2 = props.map(p => p.precio_m2)
    const areas = props.map(p => p.area_m2)
    return {
      zona: formatearZona(zona),
      unidades: props.length,
      precioM2Min: Math.round(Math.min(...pm2)),
      precioM2Mediano: Math.round(calcularMediana(pm2)),
      precioM2Max: Math.round(Math.max(...pm2)),
      areaPromedio: Math.round(areas.reduce((a, b) => a + b, 0) / areas.length)
    }
  }).sort((a, b) => b.unidades - a.unidades)

  // Stats por estado de construccion
  const estados = [...new Set(resultados.map(r => r.estado_construccion || 'no_especificado'))]
  const estadoStats: EstadoStats[] = estados.map(estado => {
    const props = resultados.filter(r => (r.estado_construccion || 'no_especificado') === estado)
    const precios = props.map(p => p.precio_usd)
    const pm2 = props.map(p => p.precio_m2)
    return {
      estado: formatearEstado(estado),
      unidades: props.length,
      porcentaje: Math.round((props.length / resultados.length) * 100),
      precioPromedio: Math.round(precios.reduce((a, b) => a + b, 0) / precios.length),
      precioM2Promedio: Math.round(pm2.reduce((a, b) => a + b, 0) / pm2.length)
    }
  }).sort((a, b) => b.unidades - a.unidades)

  // Dias promedio en mercado
  const diasList = comparablesRaw.map(r => r.dias_en_mercado || 0).filter(d => d > 0)
  const diasPromedio = diasList.length > 0 ? Math.round(diasList.reduce((a, b) => a + b, 0) / diasList.length) : 0

  // Ventaja competitiva
  const ventajaCompetitiva: string[] = []
  const entregaInmediataCount = resultados.filter(r =>
    r.estado_construccion === 'entregado' || r.estado_construccion === 'entrega_inmediata'
  ).length
  const pctEntregaInmediata = Math.round((entregaInmediataCount / resultados.length) * 100)

  if (datosPropiedad.estado_entrega === 'entrega_inmediata') {
    ventajaCompetitiva.push(`Entrega inmediata: Solo el ${pctEntregaInmediata}% del mercado ofrece esto.`)

    const precioM2EntregaInm = resultados
      .filter(r => r.estado_construccion === 'entregado' || r.estado_construccion === 'entrega_inmediata')
      .map(r => r.precio_m2)
    if (precioM2EntregaInm.length > 0) {
      const promedioEntrega = Math.round(precioM2EntregaInm.reduce((a, b) => a + b, 0) / precioM2EntregaInm.length)
      const diffVsEntrega = Math.round(((tuPrecioM2 - promedioEntrega) / promedioEntrega) * 100)
      if (diffVsEntrega < 0) {
        ventajaCompetitiva.push(`Tu $/m² esta ${Math.abs(diffVsEntrega)}% por debajo del promedio de entrega inmediata ($${promedioEntrega.toLocaleString()}/m²).`)
      }
    }
  }

  if (tuPrecioM2 < mercado.precioM2Mediano) {
    const diff = Math.round(((mercado.precioM2Mediano - tuPrecioM2) / mercado.precioM2Mediano) * 100)
    ventajaCompetitiva.push(`Tu $/m² esta ${diff}% por debajo de la mediana del mercado.`)
  }

  return {
    id: generarIdInforme(datosPropiedad.dormitorios, datosPropiedad.area_m2),
    fecha: new Date().toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }),
    tuPropiedad: {
      dormitorios: datosPropiedad.dormitorios,
      area: datosPropiedad.area_m2,
      zona: formatearZona(datosPropiedad.zona === 'todas' ? 'equipetrol' : datosPropiedad.zona),
      estado: datosPropiedad.estado_entrega === 'entrega_inmediata' ? 'Entrega inmediata' : 'Preventa',
      precio: tuPrecio,
      precioM2: Math.round(tuPrecioM2)
    },
    mercado,
    comparables,
    percentiles,
    tuPercentil,
    diferenciaPct,
    competidores: competidores.slice(0, 15), // Max 15
    zonaStats,
    estadoStats,
    diasPromedio,
    ventajaCompetitiva
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
          limite: 100
        })

        setResultados(data || [])

        if (data && data.length > 0) {
          setAnalisis(realizarAnalisis(data, datosPropiedad))
        }
      } catch (err) {
        console.error('Error:', err)
        setError('Error al generar informe.')
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
          <p className="text-slate-500">Analizando mercado...</p>
        </div>
      </section>
    )
  }

  if (error || !analisis) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-red-500 mb-4">{error || 'No se pudo generar el informe.'}</p>
          <button onClick={onBack} className="btn btn-secondary">Volver</button>
        </div>
      </section>
    )
  }

  const { tuPropiedad, mercado, comparables, percentiles, tuPercentil, diferenciaPct, competidores, zonaStats, estadoStats, diasPromedio, ventajaCompetitiva } = analisis

  // Calcular estrategias de precio
  const estrategiaRapida = { min: percentiles.p25, max: Math.round(percentiles.p25 * 1.08) }
  const estrategiaMercado = { min: Math.round(percentiles.p50 * 0.97), max: Math.round(percentiles.p50 * 1.05) }
  const estrategiaPremium = { min: percentiles.p75, max: Math.round(percentiles.p75 * 1.08) }

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
              Imprimir
            </button>
          </div>

          {/* ============ ENCABEZADO DEL INFORME ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0 print:shadow-none">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-sm font-medium text-brand-primary">Simon.</div>
                <h1 className="text-xl font-bold text-slate-800">INFORME VENDEDOR</h1>
              </div>
              <div className="text-right text-sm text-slate-500">
                <div>Generado: {analisis.fecha}</div>
                <div className="font-mono text-xs">ID: {analisis.id}</div>
              </div>
            </div>

            <h2 className="text-lg font-semibold text-slate-700 mb-1">
              Analisis de Precio para Tu Propiedad
            </h2>
            <p className="text-slate-500">
              {tuPropiedad.dormitorios} Dormitorios · {tuPropiedad.area}m² · {tuPropiedad.zona}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Datos verificados de {mercado.total} propiedades activas en el mercado
            </p>
          </div>

          {/* ============ 1. RESUMEN EJECUTIVO ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0 print:shadow-none">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">1</span>
              Resumen Ejecutivo
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Tu propiedad analizada vs. el mercado actual de departamentos {tuPropiedad.dormitorios}D
            </p>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Tu propiedad */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="text-xs font-semibold text-blue-700 mb-3">Tu Propiedad</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tipologia</span>
                    <span className="font-medium text-slate-800">{tuPropiedad.dormitorios} Dormitorios</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Superficie</span>
                    <span className="font-medium text-slate-800">{tuPropiedad.area} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Zona</span>
                    <span className="font-medium text-slate-800">{tuPropiedad.zona}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Estado</span>
                    <span className="font-medium text-slate-800">{tuPropiedad.estado}</span>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tu precio</span>
                      <span className="font-bold text-blue-700">${tuPropiedad.precio.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tu $/m²</span>
                      <span className="font-medium text-slate-800">${tuPropiedad.precioM2.toLocaleString()}/m²</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mercado */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="text-xs font-semibold text-slate-700 mb-3">Mercado {tuPropiedad.dormitorios}D Actual</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total activas</span>
                    <span className="font-medium text-slate-800">{mercado.total} propiedades</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Precio mediano</span>
                    <span className="font-medium text-slate-800">${mercado.precioMediano.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">$/m² mediano</span>
                    <span className="font-medium text-slate-800">${mercado.precioM2Mediano.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Area mediana</span>
                    <span className="font-medium text-slate-800">{mercado.areaMediana} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Rango precios</span>
                    <span className="font-medium text-slate-800">${Math.round(mercado.precioMin/1000)}K - ${Math.round(mercado.precioMax/1000)}K</span>
                  </div>
                </div>
              </div>

              {/* Comparables */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="text-xs font-semibold text-green-700 mb-3">Comparables Directos</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Prop. similares</span>
                    <span className="font-medium text-slate-800">{comparables.total} unidades</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Area promedio</span>
                    <span className="font-medium text-slate-800">{comparables.areaPromedio} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Precio mediano</span>
                    <span className="font-medium text-slate-800">${comparables.precioMediano.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">$/m² mediano</span>
                    <span className="font-medium text-slate-800">${comparables.precioM2Mediano.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Rango precios</span>
                    <span className="font-medium text-slate-800">${Math.round(comparables.precioMin/1000)}K - ${Math.round(comparables.precioMax/1000)}K</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Escala de precios */}
            <div className="mt-6 grid md:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">Precio Competitivo (P25)</div>
                <div className="font-bold text-slate-800">${percentiles.p25.toLocaleString()}</div>
                <div className="text-xs text-slate-500">${percentiles.p25M2.toLocaleString()}/m² · Venta rapida</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">Precio Mercado (P50)</div>
                <div className="font-bold text-slate-800">${percentiles.p50.toLocaleString()}</div>
                <div className="text-xs text-slate-500">${percentiles.p50M2.toLocaleString()}/m² · Recomendado</div>
              </div>
              <div className={`rounded-lg p-3 text-center ${diferenciaPct > 10 ? 'bg-amber-50 border border-amber-200' : diferenciaPct < -5 ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
                <div className="text-xs text-slate-500 mb-1">Tu Precio</div>
                <div className="font-bold text-slate-800">${tuPropiedad.precio.toLocaleString()}</div>
                <div className="text-xs text-slate-500">${tuPropiedad.precioM2.toLocaleString()}/m² · {diferenciaPct > 0 ? '+' : ''}{diferenciaPct}% vs mercado</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">Precio Premium (P75)</div>
                <div className="font-bold text-slate-800">${percentiles.p75.toLocaleString()}</div>
                <div className="text-xs text-slate-500">${percentiles.p75M2.toLocaleString()}/m² · Alta gama</div>
              </div>
            </div>
          </div>

          {/* ============ 2. POSICION EN EL MERCADO ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0 print:shadow-none">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">2</span>
              Tu Posicion en el Mercado
            </h3>

            <p className="text-sm text-slate-600 mb-4">
              Tu precio de ${tuPropiedad.precio.toLocaleString()} (${tuPropiedad.precioM2.toLocaleString()}/m²) te posiciona en el <strong>percentil {tuPercentil}</strong> de la competencia directa.
              Esto significa que estas por encima del {tuPercentil}% de propiedades similares.
            </p>

            {/* Barra visual */}
            <div className="relative h-8 bg-gradient-to-r from-green-100 via-blue-100 to-amber-100 rounded-lg mb-2">
              <div className="absolute top-0 h-full flex items-center" style={{ left: `${Math.min(95, Math.max(5, tuPercentil))}%` }}>
                <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[12px] border-t-red-500 -mt-6" />
              </div>
              <div className="absolute top-0 h-full flex items-center text-xs text-slate-500" style={{ left: '5%' }}>
                ${Math.round(comparables.precioMin/1000)}K
              </div>
              <div className="absolute top-0 h-full flex items-center text-xs text-slate-500" style={{ left: '25%' }}>
                ${Math.round(percentiles.p25/1000)}K
              </div>
              <div className="absolute top-0 h-full flex items-center text-xs font-medium text-slate-700" style={{ left: '50%' }}>
                ${Math.round(percentiles.p50/1000)}K
              </div>
              <div className="absolute top-0 h-full flex items-center text-xs text-slate-500" style={{ left: '75%' }}>
                ${Math.round(percentiles.p75/1000)}K
              </div>
            </div>

            {/* Analisis del precio */}
            <div className={`rounded-lg p-4 mt-4 ${diferenciaPct > 15 ? 'bg-red-50 border border-red-200' : diferenciaPct > 5 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex items-start gap-2">
                <span className={`text-lg ${diferenciaPct > 15 ? 'text-red-500' : diferenciaPct > 5 ? 'text-amber-500' : 'text-green-500'}`}>
                  {diferenciaPct > 15 ? '⚠️' : diferenciaPct > 5 ? '⚠️' : '✓'}
                </span>
                <div className="text-sm">
                  <strong className="text-slate-800">Analisis de tu precio</strong>
                  <p className="text-slate-600 mt-1">
                    {diferenciaPct > 15 ? (
                      `Tu precio de $${tuPropiedad.precio.toLocaleString()} esta ${diferenciaPct}% por encima del mercado. Considera ajustar a $${Math.round(percentiles.p50 * 1.05).toLocaleString()}-$${percentiles.p75.toLocaleString()} para mejorar tus posibilidades de venta.`
                    ) : diferenciaPct > 5 ? (
                      `Tu precio de $${tuPropiedad.precio.toLocaleString()} esta ${diferenciaPct}% por encima del precio mediano ($${comparables.precioMediano.toLocaleString()}). Es viable si tu propiedad tiene acabados superiores. Si no, considera ajustar a $${Math.round(percentiles.p50 * 0.97).toLocaleString()}-$${Math.round(percentiles.p50 * 1.05).toLocaleString()}.`
                    ) : diferenciaPct < -10 ? (
                      `Tu precio de $${tuPropiedad.precio.toLocaleString()} esta ${Math.abs(diferenciaPct)}% por debajo del mercado. Podrias estar dejando dinero en la mesa. Considera subir a $${Math.round(percentiles.p50 * 0.95).toLocaleString()}-$${percentiles.p50.toLocaleString()}.`
                    ) : (
                      `Tu precio de $${tuPropiedad.precio.toLocaleString()} esta bien posicionado dentro del rango competitivo. Buen equilibrio entre valor y tiempo de venta esperado.`
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Metricas */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800">{mercado.total}</div>
                <div className="text-xs text-slate-500">Propiedades {tuPropiedad.dormitorios}D activas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800">{comparables.total}</div>
                <div className="text-xs text-slate-500">Competidores directos</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${diferenciaPct > 5 ? 'text-amber-600' : diferenciaPct < -5 ? 'text-green-600' : 'text-slate-800'}`}>
                  {diferenciaPct > 0 ? '+' : ''}{diferenciaPct}%
                </div>
                <div className="text-xs text-slate-500">vs precio mercado</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800">P{tuPercentil}</div>
                <div className="text-xs text-slate-500">Tu percentil</div>
              </div>
            </div>
          </div>

          {/* ============ 3. COMPETENCIA DIRECTA ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0 print:shadow-none">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">3</span>
              Tu Competencia Directa
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {comparables.total} propiedades similares ({tuPropiedad.dormitorios}D, {Math.round(tuPropiedad.area * 0.7)}-{Math.round(tuPropiedad.area * 1.3)}m²) compitiendo por los mismos compradores.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 px-2 font-medium text-slate-600">#</th>
                    <th className="py-2 px-2 font-medium text-slate-600">Edificio</th>
                    <th className="py-2 px-2 font-medium text-slate-600">Zona</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">m²</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Precio</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m²</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Dias</th>
                    <th className="py-2 px-2 font-medium text-slate-600">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {competidores.map((comp) => (
                    <tr
                      key={comp.posicion}
                      className={`border-b border-slate-100 ${comp.esTuPropiedad ? 'bg-blue-50 font-semibold' : ''}`}
                    >
                      <td className="py-2 px-2 text-slate-500">{comp.esTuPropiedad ? '-' : comp.posicion}</td>
                      <td className={`py-2 px-2 ${comp.esTuPropiedad ? 'text-blue-700' : 'text-slate-800'}`}>
                        {comp.proyecto}
                      </td>
                      <td className="py-2 px-2 text-slate-600">{comp.zona}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{comp.area}</td>
                      <td className="py-2 px-2 text-right text-slate-800">${comp.precio.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-600">${comp.precioM2.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-500">{comp.dias || '-'}</td>
                      <td className="py-2 px-2 text-slate-600 text-xs">{comp.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Insights */}
            {diasPromedio > 0 && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                <h4 className="text-sm font-medium text-slate-700 mb-2">Insights de la Competencia</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li><strong>Tiempo en mercado:</strong> El promedio es {diasPromedio} dias.</li>
                  <li><strong>Tu posicion:</strong> Estas en el rango ${Math.round(tuPropiedad.precio * 0.95 / 1000)}K-${Math.round(tuPropiedad.precio * 1.05 / 1000)}K donde hay {competidores.filter(c => !c.esTuPropiedad && Math.abs(c.precio - tuPropiedad.precio) < tuPropiedad.precio * 0.05).length} competidores directos.</li>
                </ul>
              </div>
            )}
          </div>

          {/* ============ 4. PRECIO POR ZONA ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0 print:shadow-none">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">4</span>
              Precio/m² por Zona
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Comparacion de tu $/m² contra las principales zonas.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 px-2 font-medium text-slate-600">Zona</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Unidades</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m² Min</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m² Mediano</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m² Max</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Area Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {zonaStats.map((z) => (
                    <tr
                      key={z.zona}
                      className={`border-b border-slate-100 ${z.zona === tuPropiedad.zona ? 'bg-blue-50' : ''}`}
                    >
                      <td className="py-2 px-2 text-slate-800">
                        {z.zona}
                        {z.zona === tuPropiedad.zona && <span className="text-xs text-blue-600 ml-1">(tu zona)</span>}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-600">{z.unidades}</td>
                      <td className="py-2 px-2 text-right text-slate-600">${z.precioM2Min.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-800 font-medium">${z.precioM2Mediano.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-600">${z.precioM2Max.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{z.areaPromedio} m²</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {zonaStats.find(z => z.zona === tuPropiedad.zona) && (
              <div className={`mt-4 p-3 rounded-lg ${tuPropiedad.precioM2 < (zonaStats.find(z => z.zona === tuPropiedad.zona)?.precioM2Mediano || 0) ? 'bg-green-50 border border-green-200' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-500">✓</span>
                  <span className="text-slate-700">
                    Tu $/m² de ${tuPropiedad.precioM2.toLocaleString()} esta {tuPropiedad.precioM2 < (zonaStats.find(z => z.zona === tuPropiedad.zona)?.precioM2Mediano || 0) ? 'por debajo' : 'por encima'} de la mediana de {tuPropiedad.zona} (${zonaStats.find(z => z.zona === tuPropiedad.zona)?.precioM2Mediano.toLocaleString()}/m²).
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ============ 5. ESTRATEGIA DE PRECIO ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0 print:shadow-none">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">5</span>
              Estrategia de Precio Recomendada
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Basado en tu propiedad ({tuPropiedad.dormitorios}D, {tuPropiedad.area}m², {tuPropiedad.zona}, {tuPropiedad.estado.toLowerCase()}), estas son las opciones:
            </p>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Venta rapida */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 mb-1">Venta Rapida</h4>
                <div className="text-lg font-bold text-slate-700 mb-2">
                  ${estrategiaRapida.min.toLocaleString()} - ${estrategiaRapida.max.toLocaleString()}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Precio competitivo para vender en menos de 60 dias.
                </p>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>• Atraeras multiples interesados</li>
                  <li>• Tiempo estimado: 30-60 dias</li>
                </ul>
                <div className="text-xs text-slate-400 mt-3">
                  $/m²: ${Math.round(estrategiaRapida.min / tuPropiedad.area).toLocaleString()} - ${Math.round(estrategiaRapida.max / tuPropiedad.area).toLocaleString()}
                </div>
              </div>

              {/* Mercado */}
              <div className="border-2 border-brand-primary rounded-lg p-4 relative">
                <div className="absolute -top-3 left-4 bg-brand-primary text-white text-xs px-2 py-0.5 rounded">
                  RECOMENDADO
                </div>
                <h4 className="font-semibold text-slate-800 mb-1">Precio de Mercado</h4>
                <div className="text-lg font-bold text-brand-primary mb-2">
                  ${estrategiaMercado.min.toLocaleString()} - ${estrategiaMercado.max.toLocaleString()}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Precio equilibrado con buen retorno.
                </p>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>• Alineado con comparables</li>
                  <li>• Tiempo estimado: 60-90 dias</li>
                </ul>
                <div className="text-xs text-slate-400 mt-3">
                  $/m²: ${Math.round(estrategiaMercado.min / tuPropiedad.area).toLocaleString()} - ${Math.round(estrategiaMercado.max / tuPropiedad.area).toLocaleString()}
                </div>
              </div>

              {/* Premium */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 mb-1">Precio Premium</h4>
                <div className="text-lg font-bold text-slate-700 mb-2">
                  ${estrategiaPremium.min.toLocaleString()} - ${estrategiaPremium.max.toLocaleString()}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Para propiedades con acabados superiores.
                </p>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>• Requiere diferenciadores claros</li>
                  <li>• Tiempo estimado: 90-150 dias</li>
                </ul>
                <div className="text-xs text-slate-400 mt-3">
                  $/m²: ${Math.round(estrategiaPremium.min / tuPropiedad.area).toLocaleString()} - ${Math.round(estrategiaPremium.max / tuPropiedad.area).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Sobre tu precio actual */}
            {(tuPropiedad.precio < estrategiaMercado.min || tuPropiedad.precio > estrategiaPremium.max) && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-amber-500">💡</span>
                  <div className="text-sm text-slate-700">
                    <strong>Sobre tu precio actual de ${tuPropiedad.precio.toLocaleString()}</strong>
                    <p className="mt-1 text-slate-600">
                      {tuPropiedad.precio > estrategiaPremium.max ? (
                        `Tu precio esta en rango premium alto. Para justificarlo, asegurate de destacar acabados de calidad, amenidades del edificio, vista privilegiada o entrega inmediata.`
                      ) : (
                        `Tu precio esta por debajo del mercado. Podrias estar dejando dinero en la mesa.`
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ============ 6. CONTEXTO DEL MERCADO ============ */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 print:border-0 print:shadow-none">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center text-xs">6</span>
              Contexto del Mercado
            </h3>

            <h4 className="text-xs font-medium text-slate-600 mb-3">Distribucion por Estado de Construccion ({tuPropiedad.dormitorios}D)</h4>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 px-2 font-medium text-slate-600">Estado</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Unidades</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">% Mercado</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">Precio Prom.</th>
                    <th className="py-2 px-2 font-medium text-slate-600 text-right">$/m² Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {estadoStats.map((e) => (
                    <tr key={e.estado} className="border-b border-slate-100">
                      <td className="py-2 px-2 text-slate-800">{e.estado}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{e.unidades}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{e.porcentaje}%</td>
                      <td className="py-2 px-2 text-right text-slate-600">${e.precioPromedio.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-600">${e.precioM2Promedio.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ventaja competitiva */}
            {ventajaCompetitiva.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-sm font-medium text-green-800 mb-2">Tu Ventaja Competitiva</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  {ventajaCompetitiva.map((v, i) => (
                    <li key={i}><strong>{v.split(':')[0]}:</strong>{v.split(':').slice(1).join(':')}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ============ FOOTER ============ */}
          <div className="text-center py-6 border-t border-slate-200">
            <div className="text-sm font-medium text-brand-primary mb-1">Simon.</div>
            <div className="text-xs text-slate-400">Inteligencia Inmobiliaria para Santa Cruz</div>
            <p className="text-xs text-slate-400 mt-4 max-w-2xl mx-auto">
              Este informe fue generado con datos reales del mercado inmobiliario de Santa Cruz, Bolivia.
              Los datos provienen de {mercado.total} propiedades activas verificadas al {analisis.fecha}.
              Las valoraciones son orientativas y no constituyen una tasacion profesional.
            </p>
          </div>

          {/* CTA (no imprimir) */}
          <div className="bg-gradient-to-br from-brand-dark to-brand-dark-card rounded-xl p-6 text-center text-white mt-6 print:hidden">
            <h3 className="font-bold text-lg mb-2">¿Necesitas una tasacion profesional?</h3>
            <p className="text-slate-400 text-sm mb-4">
              Un asesor puede verificar detalles especificos de tu propiedad.
            </p>
            <button onClick={onShowLeadForm} className="btn btn-primary">
              Solicitar Tasacion
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
          .print\\:shadow-none { box-shadow: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </section>
  )
}
