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

interface EstadisticasTipoEdificio {
  tipo: 'premium' | 'standard' | 'basico'
  promedioPrecioM2: number
  minPrecioM2: number
  maxPrecioM2: number
  cantidad: number
}

interface ComparableDirecto {
  posicion: number
  proyecto: string
  zona: string
  area: number
  dormitorios: number
  precio: number
  precioM2: number
  diasEnMercado: number
  // Amenities reales del comparable
  amenities: string[]
  // Diferencias cualitativas vs sujeto
  diferencias: string[]
  diferenciaPrecio: number
  diferenciaArea: number
}

interface AnalisisMercado {
  totalPropiedades: number
  rangoPrecioMin: number
  rangoPrecioMax: number
  rangoPrecioM2Min: number
  rangoPrecioM2Max: number
  // Percentiles
  p25: number
  p50: number
  p75: number
  p25M2: number
  p50M2: number
  p75M2: number
  // Por tipo edificio
  statsPorTipo: EstadisticasTipoEdificio[]
  // Dias en mercado
  diasPromedioMercado: number
  diasBajoMediana: number
  diasSobreMediana: number
}

interface AnalisisCMA {
  id: string
  fecha: string
  // Propiedad del cliente
  cliente: {
    direccion: string
    zona: string
    dormitorios: number
    area: number
    tipoEdificio: string
    parqueos: number
    precio: number
    precioM2: number
  }
  // Mercado
  mercado: AnalisisMercado
  // Posicion del cliente
  percentilCliente: number
  diferenciaPctVsMediana: number
  posicionTexto: string
  // Comparables
  comparables: ComparableDirecto[]
  resumenComparables: {
    precioMin: number
    precioMax: number
    precioPromedio: number
    precioM2Min: number
    precioM2Max: number
    precioM2Promedio: number
    diasMin: number
    diasMax: number
    diasPromedio: number
  }
  // Estimaciones
  rangoEstimado: { min: number; max: number }
  tiempoEstimado: { min: number; max: number }
  // Recomendacion
  recomendacion: {
    rangoMin: number
    rangoMax: number
    texto: string
    estrategia: string[]
  }
}

// ============ FUNCIONES DE CALCULO ============

function calcularPercentil(arr: number[], percentil: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const index = Math.ceil((percentil / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

function calcularPromedio(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function calcularPosicionPercentil(valor: number, arr: number[]): number {
  if (arr.length === 0) return 50
  const sorted = [...arr].sort((a, b) => a - b)
  const menores = sorted.filter(v => v < valor).length
  return Math.round((menores / sorted.length) * 100)
}

function generarIdCMA(): string {
  const fecha = new Date()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `CMA-${fecha.getFullYear()}-${mes}${dia}-${random}`
}

function formatearZona(zona: string): string {
  const map: Record<string, string> = {
    'equipetrol': 'Equipetrol Centro',
    'sirari': 'Sirari',
    'equipetrol_norte': 'Equipetrol Norte',
    'villa_brigida': 'Villa Brigida',
    'faremafu': 'Equipetrol Oeste',
    'todas': 'Equipetrol'
  }
  return map[zona.toLowerCase()] || zona
}

function inferirTipoEdificio(
  amenitiesConfirmados: string[] | null,
  amenitiesLista?: string[] | null
): 'premium' | 'standard' | 'basico' {
  // Usar confirmados primero, lista como fallback
  const amenities = (amenitiesConfirmados && amenitiesConfirmados.length > 0)
    ? amenitiesConfirmados
    : (amenitiesLista || [])

  if (!amenities || amenities.length === 0) return 'standard' // Sin datos = asumir standard, no basico

  const amenitiesPremium = ['piscina', 'pileta', 'gym', 'gimnasio', 'sauna', 'jacuzzi', 'lobby', 'seguridad', 'churrasquera', 'area_social', 'salon']
  const amenitiesLower = amenities.map(a => a.toLowerCase())
  const countPremium = amenitiesPremium.filter(a =>
    amenitiesLower.some(am => am.includes(a))
  ).length
  if (countPremium >= 3) return 'premium'
  if (countPremium >= 1 || amenities.length >= 2) return 'standard'
  return 'standard' // Default a standard, no basico
}

function calcularStatsPorTipo(resultados: UnidadReal[]): EstadisticasTipoEdificio[] {
  const grupos: Record<string, UnidadReal[]> = { premium: [], standard: [], basico: [] }

  resultados.forEach(r => {
    const tipo = inferirTipoEdificio(r.amenities_confirmados, r.amenities_lista)
    grupos[tipo].push(r)
  })

  return (['premium', 'standard', 'basico'] as const).map(tipo => {
    const props = grupos[tipo]
    if (props.length === 0) {
      return { tipo, promedioPrecioM2: 0, minPrecioM2: 0, maxPrecioM2: 0, cantidad: 0 }
    }
    const preciosM2 = props.map(p => p.precio_m2)
    return {
      tipo,
      promedioPrecioM2: Math.round(calcularPromedio(preciosM2)),
      minPrecioM2: Math.round(Math.min(...preciosM2)),
      maxPrecioM2: Math.round(Math.max(...preciosM2)),
      cantidad: props.length
    }
  }).filter(s => s.cantidad > 0)
}

function generarDiferencias(comp: UnidadReal, datos: DatosPropiedad): string[] {
  const diffs: string[] = []

  // Zona
  const zonaComp = formatearZona(comp.zona)
  const zonaSujeto = formatearZona(datos.zona === 'todas' ? 'equipetrol' : datos.zona)
  if (zonaComp !== zonaSujeto) {
    diffs.push(`Zona: ${zonaComp}`)
  } else {
    diffs.push('Misma zona')
  }

  // Área
  const diffArea = comp.area_m2 - datos.area_m2
  if (Math.abs(diffArea) >= 3) {
    diffs.push(`${diffArea > 0 ? '+' : ''}${Math.round(diffArea)}m² que el sujeto`)
  } else {
    diffs.push('Área similar')
  }

  // Amenities del comparable (mostrar lo que tiene)
  const amenitiesComp = [
    ...(comp.amenities_confirmados || []),
    ...(comp.amenities_lista || [])
  ]
  if (amenitiesComp.length > 0) {
    const amenitiesClave = ['piscina', 'pileta', 'gym', 'gimnasio', 'sauna', 'seguridad', 'ascensor', 'churrasquera']
    const tieneClaves = amenitiesClave.filter(clave =>
      amenitiesComp.some(a => a.toLowerCase().includes(clave))
    )
    if (tieneClaves.length > 0) {
      diffs.push(`Tiene: ${tieneClaves.slice(0, 3).join(', ')}${tieneClaves.length > 3 ? '...' : ''}`)
    }
  }

  return diffs
}

// ============ ANALISIS PRINCIPAL ============

function realizarAnalisis(
  resultados: UnidadReal[],
  datosPropiedad: DatosPropiedad
): AnalisisCMA | null {
  if (!datosPropiedad.precio_referencia || resultados.length === 0) return null

  const precioCliente = datosPropiedad.precio_referencia
  const precioM2Cliente = precioCliente / datosPropiedad.area_m2

  // ============ FILTROS ESTRICTOS CMA ============
  // ±10% área + mismos dormitorios = comparables reales
  const areaMin = datosPropiedad.area_m2 * 0.9
  const areaMax = datosPropiedad.area_m2 * 1.1

  const resultadosFiltrados = resultados.filter(r =>
    r.area_m2 >= areaMin &&
    r.area_m2 <= areaMax &&
    r.dormitorios === datosPropiedad.dormitorios
  )

  // Si no hay suficientes comparables con ±10%, no generar CMA
  if (resultadosFiltrados.length === 0) return null

  // Estadisticas generales (sobre comparables reales)
  const precios = resultadosFiltrados.map(r => r.precio_usd)
  const preciosM2 = resultadosFiltrados.map(r => r.precio_m2)
  const dias = resultadosFiltrados.map(r => r.dias_en_mercado || 30).filter(d => d > 0)

  const p50 = calcularPercentil(precios, 50)
  const p50M2 = calcularPercentil(preciosM2, 50)

  // Stats por tipo edificio (DATA REAL - solo comparables)
  const statsPorTipo = calcularStatsPorTipo(resultadosFiltrados)

  // Dias en mercado
  const diasPromedio = Math.round(calcularPromedio(dias))
  const propsBajoMediana = resultadosFiltrados.filter(r => r.precio_m2 < p50M2)
  const propsSobreMediana = resultadosFiltrados.filter(r => r.precio_m2 >= p50M2)
  const diasBajo = Math.round(calcularPromedio(propsBajoMediana.map(r => r.dias_en_mercado || 30)))
  const diasSobre = Math.round(calcularPromedio(propsSobreMediana.map(r => r.dias_en_mercado || 30)))

  const mercado: AnalisisMercado = {
    totalPropiedades: resultadosFiltrados.length,
    rangoPrecioMin: Math.round(Math.min(...precios)),
    rangoPrecioMax: Math.round(Math.max(...precios)),
    rangoPrecioM2Min: Math.round(Math.min(...preciosM2)),
    rangoPrecioM2Max: Math.round(Math.max(...preciosM2)),
    p25: Math.round(calcularPercentil(precios, 25)),
    p50: Math.round(p50),
    p75: Math.round(calcularPercentil(precios, 75)),
    p25M2: Math.round(calcularPercentil(preciosM2, 25)),
    p50M2: Math.round(p50M2),
    p75M2: Math.round(calcularPercentil(preciosM2, 75)),
    statsPorTipo,
    diasPromedioMercado: diasPromedio,
    diasBajoMediana: diasBajo || 28,
    diasSobreMediana: diasSobre || 58
  }

  // Posicion del cliente
  const percentilCliente = calcularPosicionPercentil(precioM2Cliente, preciosM2)
  const diferenciaPct = Math.round(((precioCliente - p50) / p50) * 100)

  let posicionTexto = ''
  if (diferenciaPct < -10) posicionTexto = 'Por debajo del mercado - precio muy competitivo'
  else if (diferenciaPct < -5) posicionTexto = 'Ligeramente bajo la mediana - buen posicionamiento'
  else if (diferenciaPct <= 5) posicionTexto = 'Alineado con el mercado'
  else if (diferenciaPct <= 15) posicionTexto = 'Ligeramente sobre la mediana'
  else posicionTexto = 'Significativamente sobre el mercado'

  // Seleccionar comparables directos (los 5 más similares)
  // NOTA: Ya filtramos por dormitorios, área ±10%, y estado_construcción
  // Aquí solo ordenamos por similitud:
  // 1. Misma zona (importante)
  // 2. Amenities similares
  // 3. Precio similar

  const zonaSujeto = formatearZona(datosPropiedad.zona === 'todas' ? 'equipetrol' : datosPropiedad.zona)

  // Amenities del sujeto (del formulario)
  const amenitiesSujeto = datosPropiedad.amenities_edificio || []

  const calcularScoreComparable = (r: UnidadReal): number => {
    let score = 0

    // 1. ZONA - priorizar misma zona (40 pts si diferente)
    const zonaComp = formatearZona(r.zona)
    if (zonaComp !== zonaSujeto && datosPropiedad.zona !== 'todas') {
      score += 40
    }

    // 2. AMENITIES - comparar amenities clave (hasta 30 pts)
    if (amenitiesSujeto.length > 0) {
      const amenitiesComp = [
        ...(r.amenities_confirmados || []),
        ...(r.amenities_lista || [])
      ].map(a => a.toLowerCase())

      const amenitiesClave = ['piscina', 'pileta', 'gym', 'gimnasio', 'sauna', 'seguridad', 'ascensor']

      const sujetoTiene = amenitiesSujeto.filter(a =>
        amenitiesClave.some(clave => a.toLowerCase().includes(clave))
      ).length

      const compTiene = amenitiesClave.filter(clave =>
        amenitiesComp.some(a => a.includes(clave))
      ).length

      const diffAmenities = Math.abs(sujetoTiene - compTiene)
      score += diffAmenities * 10
    }

    // 3. PRECIO - diferencia normalizada (hasta 30 pts)
    const diffPrecioPct = Math.abs(r.precio_usd - precioCliente) / precioCliente
    score += diffPrecioPct * 30

    return score
  }

  // Ya filtrados por ±10% área y mismos dormitorios, solo ordenar por score
  const comparablesRaw = resultadosFiltrados
    .map(r => ({ ...r, _score: calcularScoreComparable(r) }))
    .sort((a, b) => a._score - b._score)
    .slice(0, 5)

  const comparables: ComparableDirecto[] = comparablesRaw.map((r, i) => {
    // Usar amenities confirmados, o lista como fallback
    const amenitiesReales = (r.amenities_confirmados && r.amenities_confirmados.length > 0)
      ? r.amenities_confirmados
      : (r.amenities_lista || [])

    return {
      posicion: i + 1,
      proyecto: r.proyecto || 'Sin nombre',
      zona: formatearZona(r.zona),
      area: Math.round(r.area_m2),
      dormitorios: r.dormitorios,
      precio: Math.round(r.precio_usd),
      precioM2: Math.round(r.precio_m2),
      diasEnMercado: r.dias_en_mercado || 0,
      amenities: amenitiesReales,
      diferencias: generarDiferencias(r, datosPropiedad),
      diferenciaPrecio: Math.round(r.precio_usd - precioCliente),
      diferenciaArea: Math.round(r.area_m2 - datosPropiedad.area_m2)
    }
  })

  // Resumen de comparables
  const preciosComp = comparables.map(c => c.precio)
  const preciosM2Comp = comparables.map(c => c.precioM2)
  const diasComp = comparables.map(c => c.diasEnMercado).filter(d => d > 0)

  const resumenComparables = {
    precioMin: Math.min(...preciosComp),
    precioMax: Math.max(...preciosComp),
    precioPromedio: Math.round(calcularPromedio(preciosComp)),
    precioM2Min: Math.min(...preciosM2Comp),
    precioM2Max: Math.max(...preciosM2Comp),
    precioM2Promedio: Math.round(calcularPromedio(preciosM2Comp)),
    diasMin: diasComp.length > 0 ? Math.min(...diasComp) : 0,
    diasMax: diasComp.length > 0 ? Math.max(...diasComp) : 0,
    diasPromedio: Math.round(calcularPromedio(diasComp)) || 30
  }

  // Rango estimado basado en comparables
  const rangoEstimado = {
    min: resumenComparables.precioMin,
    max: resumenComparables.precioMax
  }

  // Tiempo estimado basado en posicion
  let tiempoEstimado = { min: 30, max: 50 }
  if (diferenciaPct < -5) tiempoEstimado = { min: 20, max: 35 }
  else if (diferenciaPct > 10) tiempoEstimado = { min: 50, max: 90 }
  else if (diferenciaPct > 20) tiempoEstimado = { min: 75, max: 120 }

  // Recomendacion
  let recomendacion = {
    rangoMin: Math.round(mercado.p25 * 0.98),
    rangoMax: Math.round(mercado.p75 * 1.02),
    texto: '',
    estrategia: [] as string[]
  }

  if (diferenciaPct <= 5 && diferenciaPct >= -5) {
    recomendacion.texto = `Tu precio de $${precioCliente.toLocaleString()} esta bien posicionado dentro del mercado.`
    recomendacion.estrategia = [
      'Mantener precio inicial por 30 dias',
      'Monitorear respuesta del mercado',
      'Evaluar ajuste solo si no hay consultas'
    ]
  } else if (diferenciaPct > 5 && diferenciaPct <= 15) {
    recomendacion.texto = `Tu precio esta ${diferenciaPct}% sobre la mediana. Puede funcionar pero tomara mas tiempo.`
    recomendacion.estrategia = [
      'Prepararse para negociacion (5-8% de margen)',
      `Si no hay ofertas en 45 dias, considerar ajuste a ~$${mercado.p50.toLocaleString()}`,
      'Destacar caracteristicas unicas que justifiquen el precio'
    ]
  } else if (diferenciaPct > 15) {
    recomendacion.texto = `Tu precio esta ${diferenciaPct}% sobre el mercado. Alto riesgo de estancamiento.`
    recomendacion.estrategia = [
      `Recomiendo ajustar a $${Math.round(mercado.p50 * 1.05).toLocaleString()} para competir`,
      'El precio actual atraera pocas consultas',
      'Cada mes en mercado reduce el valor percibido'
    ]
  } else {
    recomendacion.texto = `Tu precio esta ${Math.abs(diferenciaPct)}% bajo la mediana. Muy competitivo, venta rapida esperada.`
    recomendacion.estrategia = [
      'Excelente posicionamiento para venta rapida',
      `Podrias subir hasta $${mercado.p50.toLocaleString()} sin perder competitividad`,
      'Espera multiples ofertas'
    ]
  }

  return {
    id: generarIdCMA(),
    fecha: new Date().toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }),
    cliente: {
      direccion: datosPropiedad.propiedad_direccion || `${formatearZona(datosPropiedad.zona)}, Equipetrol`,
      zona: formatearZona(datosPropiedad.zona === 'todas' ? 'equipetrol' : datosPropiedad.zona),
      dormitorios: datosPropiedad.dormitorios,
      area: datosPropiedad.area_m2,
      tipoEdificio: datosPropiedad.tipo_edificio,
      parqueos: datosPropiedad.parqueos,
      precio: precioCliente,
      precioM2: Math.round(precioM2Cliente)
    },
    mercado,
    percentilCliente,
    diferenciaPctVsMediana: diferenciaPct,
    posicionTexto,
    comparables,
    resumenComparables,
    rangoEstimado,
    tiempoEstimado,
    recomendacion
  }
}

// ============ COMPONENTE PRINCIPAL ============

export default function BrokerResults({ datosPropiedad, onBack, onShowLeadForm }: BrokerResultsProps) {
  const [analisis, setAnalisis] = useState<AnalisisCMA | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // CMA: Buscar comparables REALES (mismo producto)
        // - Mismos dormitorios (obligatorio)
        // - Mismo estado construcción (obligatorio)
        // - Zonas similares (flexible)
        const TODAS_LAS_ZONAS = ['equipetrol', 'sirari', 'equipetrol_norte', 'villa_brigida', 'faremafu']
        const zonasABuscar = datosPropiedad.zona === 'todas'
          ? TODAS_LAS_ZONAS
          : [datosPropiedad.zona]

        const data = await buscarUnidadesReales({
          zonas_permitidas: zonasABuscar,
          dormitorios: datosPropiedad.dormitorios, // Siempre filtrar por dormitorios exactos
          estado_entrega: datosPropiedad.estado_entrega || 'entrega_inmediata', // Mismo estado
          limite: 100
        })

        if (data && data.length > 0) {
          setAnalisis(realizarAnalisis(data, datosPropiedad))
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

  // Loading
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

  // Error
  if (error || !analisis) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-red-500 mb-4">{error || 'No se pudo generar el analisis.'}</p>
          <button onClick={onBack} className="btn btn-secondary">Volver</button>
        </div>
      </section>
    )
  }

  // Branding
  const brokerNombre = datosPropiedad.broker_nombre || 'Asesor Inmobiliario'
  const brokerTelefono = datosPropiedad.broker_telefono
  const brokerEmpresa = datosPropiedad.broker_empresa
  const brokerLogo = datosPropiedad.broker_logo
  const brokerFoto = datosPropiedad.broker_foto
  const propiedadFotos = datosPropiedad.propiedad_fotos || []

  // CMA Avanzado info
  const amenitiesSeleccionados = datosPropiedad.amenities_edificio || []
  const equipamientoSeleccionado = datosPropiedad.equipamiento_unidad || []
  const tieneInfoAvanzada = amenitiesSeleccionados.length > 0 || equipamientoSeleccionado.length > 0

  const AMENITY_LABELS: Record<string, string> = {
    piscina: 'Piscina', seguridad_24h: 'Seguridad 24/7', churrasquera: 'BBQ',
    terraza: 'Terraza', sauna_jacuzzi: 'Sauna/Jacuzzi', area_social: 'Area Social',
    ascensor: 'Ascensor', gimnasio: 'Gimnasio', estacionamiento_visitas: 'Estac. Visitas',
    pet_friendly: 'Pet Friendly', recepcion: 'Lobby', salon_eventos: 'Salon Eventos'
  }
  const EQUIP_LABELS: Record<string, string> = {
    aire_acondicionado: 'A/C', cocina_equipada: 'Cocina Equipada',
    roperos_empotrados: 'Roperos', lavadora: 'Lavadora',
    amoblado: 'Amoblado', calefon: 'Calefon'
  }

  const { cliente, mercado, percentilCliente, diferenciaPctVsMediana, posicionTexto, comparables, resumenComparables, rangoEstimado, tiempoEstimado, recomendacion } = analisis

  // Color segun posicion
  const getPosicionColor = () => {
    if (diferenciaPctVsMediana < -5) return 'text-green-600'
    if (diferenciaPctVsMediana <= 10) return 'text-blue-600'
    if (diferenciaPctVsMediana <= 20) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <section className="py-6 bg-slate-100 min-h-screen print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

          {/* Header con navegacion (no imprimir) */}
          <div className="flex justify-between items-center mb-4 print:hidden">
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

          {/* ============ DOCUMENTO CMA ============ */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-0">

            {/* HEADER */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  {brokerLogo ? (
                    <img src={brokerLogo} alt="Logo" className="w-14 h-14 object-contain bg-white rounded-lg p-1" />
                  ) : (
                    <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center">
                      <span className="text-xl font-bold">CMA</span>
                    </div>
                  )}
                  <div>
                    <h1 className="text-lg font-bold">ANALISIS COMPARATIVO DE MERCADO</h1>
                    <p className="text-slate-300 text-sm">{cliente.direccion}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  {brokerFoto && (
                    <img src={brokerFoto} alt={brokerNombre} className="w-10 h-10 rounded-full object-cover border-2 border-white/30" />
                  )}
                  <div>
                    <div className="font-medium">{brokerNombre}</div>
                    {brokerEmpresa && <div className="text-slate-300 text-xs">{brokerEmpresa}</div>}
                    {brokerTelefono && <div className="text-slate-300 text-xs">{brokerTelefono}</div>}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/20 flex justify-between text-xs text-slate-400">
                <span>ID: {analisis.id}</span>
                <span>Generado: {analisis.fecha}</span>
              </div>
            </div>

            {/* Fotos de la propiedad */}
            {propiedadFotos.length > 0 && (
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100">
                {propiedadFotos.slice(0, 4).map((foto, i) => (
                  <div key={i} className={`aspect-video overflow-hidden ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
                    <img src={foto} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* ============ 1. RESUMEN EJECUTIVO ============ */}
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 bg-slate-800 text-white rounded flex items-center justify-center text-xs">1</span>
                RESUMEN EJECUTIVO
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Propiedad del cliente */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-3">TU PROPIEDAD</div>
                  <div className="grid grid-cols-3 gap-3 text-center mb-4">
                    <div>
                      <div className="text-lg font-bold text-slate-800">{cliente.dormitorios}</div>
                      <div className="text-xs text-slate-500">Dorms</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-800">{cliente.area}m²</div>
                      <div className="text-xs text-slate-500">Area</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-800 capitalize">{cliente.tipoEdificio}</div>
                      <div className="text-xs text-slate-500">Tipo</div>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Precio propuesto</span>
                      <span className="text-xl font-bold text-slate-800">${cliente.precio.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-slate-500 text-sm">Precio por m²</span>
                      <span className="text-slate-600">${cliente.precioM2.toLocaleString()}/m²</span>
                    </div>
                  </div>
                  {tieneInfoAvanzada && (
                    <div className="border-t border-slate-200 pt-3 mt-3">
                      <div className="flex flex-wrap gap-1">
                        {amenitiesSeleccionados.slice(0, 4).map(id => (
                          <span key={id} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            {AMENITY_LABELS[id] || id}
                          </span>
                        ))}
                        {equipamientoSeleccionado.slice(0, 3).map(id => (
                          <span key={id} className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                            {EQUIP_LABELS[id] || id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Posicion en mercado */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-3">POSICION EN MERCADO</div>
                  <div className="text-center mb-4">
                    <div className={`text-3xl font-bold ${getPosicionColor()}`}>
                      Percentil {percentilCliente}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      sobre {mercado.totalPropiedades} propiedades similares
                    </div>
                  </div>
                  {/* Barra visual */}
                  <div className="relative h-8 bg-gradient-to-r from-green-200 via-blue-200 to-red-200 rounded-full mb-2">
                    <div
                      className="absolute top-0 h-8 w-1 bg-slate-800 rounded"
                      style={{ left: `${Math.min(Math.max(percentilCliente, 5), 95)}%` }}
                    />
                    <div
                      className="absolute -top-6 text-xs font-bold text-slate-800"
                      style={{ left: `${Math.min(Math.max(percentilCliente, 5), 95)}%`, transform: 'translateX(-50%)' }}
                    >
                      Tu precio
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Bajo</span>
                    <span>Mediana</span>
                    <span>Alto</span>
                  </div>
                  <div className={`mt-3 text-sm ${getPosicionColor()} font-medium text-center`}>
                    {posicionTexto}
                  </div>
                </div>
              </div>
            </div>

            {/* ============ 2. CONTEXTO DE MERCADO ============ */}
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 bg-slate-800 text-white rounded flex items-center justify-center text-xs">2</span>
                CONTEXTO DE MERCADO
              </h2>

              {/* Estadisticas generales */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-800">{mercado.totalPropiedades}</div>
                  <div className="text-xs text-slate-500">Propiedades analizadas</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-lg font-bold text-slate-800">${mercado.rangoPrecioMin.toLocaleString()}</div>
                  <div className="text-lg font-bold text-slate-800">- ${mercado.rangoPrecioMax.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Rango de precios</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-800">${mercado.p50.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Precio mediano</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-800">{mercado.diasPromedioMercado}d</div>
                  <div className="text-xs text-slate-500">Dias promedio</div>
                </div>
              </div>

              {/* Distribucion de precios */}
              <div className="mb-6">
                <div className="text-xs font-semibold text-slate-500 mb-2">DISTRIBUCION DE PRECIOS</div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex-1 bg-slate-100 rounded p-2 text-center">
                    <div className="font-bold">${mercado.p25.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">P25 (Competitivo)</div>
                  </div>
                  <div className="flex-1 bg-blue-100 rounded p-2 text-center">
                    <div className="font-bold">${mercado.p50.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">P50 (Mediana)</div>
                  </div>
                  <div className={`flex-1 rounded p-2 text-center border-2 ${diferenciaPctVsMediana > 10 ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50'}`}>
                    <div className="font-bold">${cliente.precio.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Tu precio</div>
                  </div>
                  <div className="flex-1 bg-slate-100 rounded p-2 text-center">
                    <div className="font-bold">${mercado.p75.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">P75 (Premium)</div>
                  </div>
                </div>
              </div>

              {/* Precio por tipo de edificio - DATA REAL */}
              {mercado.statsPorTipo.length > 1 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-2">PRECIO/M² SEGUN TIPO DE EDIFICIO (data real)</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 font-medium text-slate-600">Tipo</th>
                        <th className="text-right py-2 font-medium text-slate-600">Promedio</th>
                        <th className="text-right py-2 font-medium text-slate-600">Rango</th>
                        <th className="text-right py-2 font-medium text-slate-600">Muestra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mercado.statsPorTipo.map(stat => (
                        <tr key={stat.tipo} className={`border-b border-slate-100 ${stat.tipo === cliente.tipoEdificio ? 'bg-blue-50' : ''}`}>
                          <td className="py-2 capitalize">
                            {stat.tipo}
                            {stat.tipo === cliente.tipoEdificio && <span className="text-xs text-blue-600 ml-1">(tu propiedad)</span>}
                          </td>
                          <td className="py-2 text-right font-medium">${stat.promedioPrecioM2.toLocaleString()}/m²</td>
                          <td className="py-2 text-right text-slate-600">${stat.minPrecioM2.toLocaleString()} - ${stat.maxPrecioM2.toLocaleString()}</td>
                          <td className="py-2 text-right text-slate-500">{stat.cantidad} unidades</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {mercado.statsPorTipo.find(s => s.tipo === cliente.tipoEdificio) && (
                    <p className="text-xs text-slate-500 mt-2">
                      Tu precio/m² (${cliente.precioM2.toLocaleString()}) vs promedio {cliente.tipoEdificio}: {' '}
                      {(() => {
                        const stat = mercado.statsPorTipo.find(s => s.tipo === cliente.tipoEdificio)!
                        const diff = Math.round(((cliente.precioM2 - stat.promedioPrecioM2) / stat.promedioPrecioM2) * 100)
                        return diff >= 0 ? `+${diff}%` : `${diff}%`
                      })()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ============ 3. COMPARABLES DIRECTOS ============ */}
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 bg-slate-800 text-white rounded flex items-center justify-center text-xs">3</span>
                COMPARABLES DIRECTOS
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Las {comparables.length} propiedades mas similares por ubicacion, tamano y caracteristicas.
              </p>

              <div className="space-y-3">
                {comparables.map(comp => (
                  <div key={comp.posicion} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-bold text-slate-800">#{comp.posicion} {comp.proyecto}</div>
                        <div className="text-sm text-slate-500">{comp.zona}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">${comp.precio.toLocaleString()}</div>
                        <div className="text-sm text-slate-500">${comp.precioM2.toLocaleString()}/m²</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 mb-2">
                      <span>{comp.dormitorios} dorms</span>
                      <span>{comp.area}m²</span>
                      {comp.diasEnMercado > 0 && <span>{comp.diasEnMercado} días en mercado</span>}
                    </div>
                    {comp.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {comp.amenities.slice(0, 5).map((am, i) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                            {am.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {comp.amenities.length > 5 && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded">
                            +{comp.amenities.length - 5} más
                          </span>
                        )}
                      </div>
                    )}
                    {comp.amenities.length === 0 && (
                      <div className="text-xs text-slate-400 mb-3 italic">Sin amenities confirmados</div>
                    )}
                    <div className="bg-slate-50 rounded p-3">
                      <div className="text-xs font-medium text-slate-500 mb-1">Comparado con tu propiedad:</div>
                      <ul className="text-sm text-slate-600 space-y-0.5">
                        {comp.diferencias.map((dif, i) => (
                          <li key={i}>• {dif}</li>
                        ))}
                        <li className={`font-medium ${comp.diferenciaPrecio < 0 ? 'text-green-600' : comp.diferenciaPrecio > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                          • Pide ${Math.abs(comp.diferenciaPrecio).toLocaleString()} {comp.diferenciaPrecio < 0 ? 'menos' : comp.diferenciaPrecio > 0 ? 'mas' : 'igual'} que tu precio
                        </li>
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* Resumen comparables */}
              <div className="mt-4 bg-slate-50 rounded-lg p-4">
                <div className="text-xs font-semibold text-slate-500 mb-2">RESUMEN DE COMPARABLES</div>
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <div className="text-slate-500">Precio</div>
                    <div className="font-bold">${resumenComparables.precioMin.toLocaleString()} - ${resumenComparables.precioMax.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">Prom: ${resumenComparables.precioPromedio.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Precio/m²</div>
                    <div className="font-bold">${resumenComparables.precioM2Min.toLocaleString()} - ${resumenComparables.precioM2Max.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">Prom: ${resumenComparables.precioM2Promedio.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Dias en mercado</div>
                    <div className="font-bold">{resumenComparables.diasMin} - {resumenComparables.diasMax} dias</div>
                    <div className="text-xs text-slate-400">Prom: {resumenComparables.diasPromedio} dias</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ============ 4. ANALISIS DE PRECIO ============ */}
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 bg-slate-800 text-white rounded flex items-center justify-center text-xs">4</span>
                ANALISIS DE PRECIO
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Estimacion de valor */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-xs font-semibold text-green-700 mb-2">RANGO DE VALOR ESTIMADO</div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-800">
                      ${rangoEstimado.min.toLocaleString()} - ${rangoEstimado.max.toLocaleString()}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      Basado en {comparables.length} comparables directos
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-green-200 text-sm text-green-700">
                    Tu precio (${cliente.precio.toLocaleString()}) esta {' '}
                    {cliente.precio >= rangoEstimado.min && cliente.precio <= rangoEstimado.max
                      ? 'dentro del rango'
                      : cliente.precio < rangoEstimado.min
                        ? 'por debajo del rango'
                        : 'por encima del rango'}
                  </div>
                </div>

                {/* Tiempo estimado */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-xs font-semibold text-blue-700 mb-2">TIEMPO ESTIMADO DE VENTA</div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-800">
                      {tiempoEstimado.min} - {tiempoEstimado.max} dias
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      Segun tu posicion en el mercado
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Si bajas a ${mercado.p50.toLocaleString()} (mediana):</span>
                      <span className="font-medium">{mercado.diasBajoMediana}-{mercado.diasBajoMediana + 15} dias</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Si subes a ${mercado.p75.toLocaleString()} (P75):</span>
                      <span className="font-medium">{mercado.diasSobreMediana}-{mercado.diasSobreMediana + 30} dias</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ============ 5. RECOMENDACION ============ */}
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 bg-slate-800 text-white rounded flex items-center justify-center text-xs">5</span>
                RECOMENDACION PROFESIONAL
              </h2>

              <div className={`rounded-lg p-5 ${
                diferenciaPctVsMediana <= 5 ? 'bg-green-50 border border-green-200' :
                diferenciaPctVsMediana <= 15 ? 'bg-amber-50 border border-amber-200' :
                'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="text-2xl">
                    {diferenciaPctVsMediana <= 5 ? '✓' : diferenciaPctVsMediana <= 15 ? '!' : '⚠'}
                  </div>
                  <div className="flex-1">
                    <div className={`font-bold text-lg mb-2 ${
                      diferenciaPctVsMediana <= 5 ? 'text-green-700' :
                      diferenciaPctVsMediana <= 15 ? 'text-amber-700' : 'text-red-700'
                    }`}>
                      Rango recomendado: ${recomendacion.rangoMin.toLocaleString()} - ${recomendacion.rangoMax.toLocaleString()}
                    </div>
                    <p className="text-slate-700 mb-3">{recomendacion.texto}</p>
                    <div className="space-y-1">
                      {recomendacion.estrategia.map((est, i) => (
                        <div key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          <span>•</span>
                          <span>{est}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ============ METODOLOGIA ============ */}
            <div className="p-6 bg-slate-50">
              <h2 className="text-xs font-bold text-slate-500 mb-3">METODOLOGIA Y FUENTES</h2>
              <ul className="text-xs text-slate-500 space-y-1">
                <li>• Datos de {mercado.totalPropiedades} propiedades activas en oferta</li>
                <li>• Fuentes: Remax, Century21, InfoCasas (scraping automatizado)</li>
                <li>• Precios de LISTA (no precios de cierre)</li>
                <li>• Propiedades activas al momento del análisis</li>
                <li>• Amenities: cuando están reportados en el anuncio original</li>
              </ul>
              <p className="text-xs text-slate-400 mt-3 italic">
                Este análisis utiliza precios de oferta pública. El precio final de venta típicamente
                varía entre -5% y -10% del precio de lista según negociación. Factores como estado
                interior, piso, vista y acabados pueden afectar el valor final.
              </p>
              <p className="text-xs text-slate-400 mt-2 italic">
                Limitaciones: No todos los anuncios reportan amenities completos. Las propiedades en
                preventa no son directamente comparables con entrega inmediata.
              </p>
            </div>

            {/* FOOTER */}
            <div className="p-6 border-t border-slate-200 text-center">
              <div className="flex items-center justify-center gap-4 mb-3">
                {brokerLogo && <img src={brokerLogo} alt="Logo" className="h-8 object-contain" />}
                <div>
                  <div className="font-semibold text-slate-700">{brokerNombre}</div>
                  {brokerTelefono && <div className="text-sm text-slate-500">{brokerTelefono}</div>}
                </div>
              </div>
              <div className="text-xs text-slate-400">
                ID: {analisis.id} | {analisis.fecha}
              </div>
            </div>
          </div>

          {/* CTA (no imprimir) */}
          <div className="mt-6 bg-gradient-to-br from-brand-dark to-brand-dark-card rounded-xl p-6 text-center text-white print:hidden">
            <h3 className="font-bold text-lg mb-2">Potencia tu trabajo</h3>
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
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-0 { border: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </section>
  )
}
