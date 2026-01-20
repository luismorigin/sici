'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { BarChartCard, CompatibilidadCard, PrecioComparativoCard } from './ChartCard'
import {
  obtenerAnalisisFiduciario,
  construirAnalisisDesdeBusqueda,
  obtenerMicrozonas,
  calcularEscenarioFinanciero,
  obtenerFotosPorIds,
  type AnalisisMercadoFiduciario,
  type MicrozonaData,
  type EscenarioFinanciero
} from '@/lib/supabase'

// Filtros opcionales para hacer el modal dinámico
interface FiltrosUsuario {
  presupuesto?: number
  dormitorios?: number
  zonas?: string[]
  estado_entrega?: string
  // Filtros MOAT para ordenamiento
  innegociables?: string[]
  deseables?: string[]
  ubicacion_vs_metros?: number
  calidad_vs_precio?: number
}

// Síntesis fiduciaria generada en resultados
interface SintesisFiduciaria {
  headline: string
  detalles: string
  accion: string
  tipo: 'oportunidad' | 'premium' | 'justo' | 'sospechoso'
}

// Propiedad seleccionada desde resultados (UnidadReal simplificado)
interface PropiedadSeleccionada {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  dormitorios: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  fotos_urls: string[]
  amenities_lista: string[]
  razon_fiduciaria: string | null
  posicion_mercado: {
    diferencia_pct: number
    categoria: string
  } | null
  sintesisFiduciaria?: SintesisFiduciaria  // Síntesis completa generada en resultados
}

interface PremiumModalProps {
  onClose: () => void
  filtros?: FiltrosUsuario  // Si se pasan, usa datos del usuario
  propiedadesSeleccionadas?: PropiedadSeleccionada[]  // Las 3 elegidas por el usuario
}

export default function PremiumModal({ onClose, filtros, propiedadesSeleccionadas }: PremiumModalProps) {
  const [analisis, setAnalisis] = useState<AnalisisMercadoFiduciario | null>(null)
  const [microzonas, setMicrozonas] = useState<MicrozonaData[]>([])
  const [escenarios, setEscenarios] = useState<EscenarioFinanciero[]>([])
  const [loading, setLoading] = useState(true)

  // Si tiene filtros, es dinámico (desde resultados)
  const isDinamico = !!filtros
  // Si tiene propiedades seleccionadas, mostrar esas en vez de query
  const tieneSeleccion = propiedadesSeleccionadas && propiedadesSeleccionadas.length > 0

  useEffect(() => {
    const fetchData = async () => {
      let analisisData: AnalisisMercadoFiduciario | null = null

      if (filtros) {
        // Dinámico: usar mismos filtros que buscarUnidadesReales + ordenamiento MOAT
        analisisData = await construirAnalisisDesdeBusqueda({
          dormitorios: filtros.dormitorios,
          precio_max: filtros.presupuesto || 300000,
          zonas_permitidas: filtros.zonas,  // Soporta múltiples zonas
          estado_entrega: filtros.estado_entrega as any,
          limite: 10,
          // Filtros MOAT para ordenamiento consistente con /resultados
          innegociables: filtros.innegociables,
          deseables: filtros.deseables,
          ubicacion_vs_metros: filtros.ubicacion_vs_metros,
          calidad_vs_precio: filtros.calidad_vs_precio
        })
      } else {
        // Landing: usar ejemplo hardcodeado
        analisisData = await obtenerAnalisisFiduciario({
          dormitorios: 2,
          precio_max: 150000,
          solo_con_fotos: true,
          limite: 10
        })
      }

      const microzonasData = await obtenerMicrozonas()

      if (analisisData) {
        // Obtener fotos para TOP 4 opciones (si no vienen ya)
        const opcionesSinFotos = analisisData.bloque_1_opciones_validas.opciones.filter(
          op => !op.fotos_urls || op.fotos_urls.length === 0
        )
        if (opcionesSinFotos.length > 0) {
          const topIds = analisisData.bloque_1_opciones_validas.opciones
            .slice(0, 4)
            .map(op => op.id)
          const fotosMap = await obtenerFotosPorIds(topIds)

          // Enriquecer opciones con fotos
          const opcionesConFotos = analisisData.bloque_1_opciones_validas.opciones.map(op => ({
            ...op,
            fotos_urls: op.fotos_urls?.length ? op.fotos_urls : (fotosMap[op.id] || [])
          }))
          analisisData.bloque_1_opciones_validas.opciones = opcionesConFotos
        }

        setAnalisis(analisisData)
        // Calcular escenarios financieros para top 3
        const escenariosCalc = analisisData.bloque_1_opciones_validas.opciones
          .slice(0, 3)
          .map(op => calcularEscenarioFinanciero(op))
        setEscenarios(escenariosCalc)
      }

      setMicrozonas(microzonasData)
      setLoading(false)
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)])

  // Mapear propiedades seleccionadas a formato compatible con OpcionValida
  const propiedadesComoOpciones = tieneSeleccion
    ? propiedadesSeleccionadas!.map((p, i) => ({
        id: p.id,
        proyecto: p.proyecto,
        desarrollador: p.desarrollador,
        zona: p.zona,
        dormitorios: p.dormitorios,
        precio_usd: p.precio_usd,
        precio_m2: p.precio_m2,
        area_m2: p.area_m2,
        ranking: i + 1,
        total_opciones: propiedadesSeleccionadas!.length,
        fotos: p.fotos_urls?.length || 0,
        fotos_urls: p.fotos_urls || [],
        amenities: p.amenities_lista || [],
        asesor_wsp: null,
        posicion_mercado: p.posicion_mercado ? {
          success: true,
          diferencia_pct: p.posicion_mercado.diferencia_pct,
          categoria: p.posicion_mercado.categoria,
          posicion_texto: '',
          contexto: { promedio_zona: 0, stock_disponible: 0, precio_consultado: 0 }
        } : { success: false, diferencia_pct: 0, categoria: 'precio_justo', posicion_texto: '', contexto: { promedio_zona: 0, stock_disponible: 0, precio_consultado: 0 } },
        explicacion_precio: { explicaciones: [], alerta_general: null },
        resumen_fiduciario: p.razon_fiduciaria || 'Análisis fiduciario disponible en informe completo.',
        sintesisFiduciaria: p.sintesisFiduciaria || null
      }))
    : []

  // Usar propiedades seleccionadas si existen, sino las del análisis
  const topOpciones = tieneSeleccion
    ? propiedadesComoOpciones
    : (analisis?.bloque_1_opciones_validas.opciones.slice(0, 4) || [])

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-y-auto relative"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors z-10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-4 md:p-8">
            {/* Header */}
            <div className="border-b-2 border-slate-200 pb-4 md:pb-6 mb-6 md:mb-8 flex flex-col md:flex-row md:justify-between md:items-start gap-2">
              <div>
                <h2 className="font-display text-xl md:text-2xl font-extrabold text-brand-dark mb-1">
                  INFORME PREMIUM - SIMON
                </h2>
                <p className="text-slate-500 text-sm">Estudio Fiduciario - Equipetrol</p>
              </div>
              <div className="text-left md:text-right text-xs md:text-sm text-slate-500">
                <div><strong>Generado:</strong> {new Date().toLocaleDateString('es-ES')}</div>
                <div><strong>Propiedades:</strong> {analisis?.bloque_3_contexto_mercado.stock_total || 987} Analizadas</div>
              </div>
            </div>

            {/* Section 1: Profile */}
            <section className="bg-slate-50 rounded-xl p-4 md:p-6 mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-3 md:mb-4 text-sm md:text-base">1. PERFIL FIDUCIARIO PROFUNDO</h3>
              {isDinamico && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                  <strong>Ejemplo:</strong> Esta sección se personalizará con un formulario más extenso en una versión futura. Los datos mostrados son ilustrativos.
                </div>
              )}
              <p className="mb-3"><strong>Tipo:</strong> Hogar Estrategico con Vision de Liquidez.</p>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Un comprador que busca equilibrio entre seguridad financiera, comodidad de vida y liquidez futura. Tu ventana de decision es de <strong>2 a 8 semanas</strong>, perfecta para negociar sin perder oportunidades.
              </p>
              <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <h4 className="text-sm font-bold mb-2">Prioridades Criticas</h4>
                  <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                    <li>2 Dormitorios (optimo reventa)</li>
                    <li>Piso medio/alto (menos ruido)</li>
                    <li>Seguridad alta (prioridad emocional)</li>
                    <li>Bajo mantenimiento</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-bold mb-2">Psicologia Detectada</h4>
                  <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                    <li>Rechazo a visitas inutiles</li>
                    <li>Sensibilidad al sobreprecio</li>
                    <li>Necesidad de control con guia experta</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 2: Executive Summary */}
            <section className="mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-4">2. RESUMEN EJECUTIVO</h3>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
                {[
                  { value: analisis?.bloque_1_opciones_validas.total || 36, label: 'En tu Rango' },
                  { value: Math.min(8, analisis?.bloque_1_opciones_validas.total || 8), label: 'Alta Compat.', color: 'text-state-success' },
                  { value: escenarios.filter(e => e.liquidez_categoria === 'alta').length || 2, label: 'Gangas', color: 'text-premium-gold' },
                  { value: analisis?.bloque_4_alertas.total || 4, label: 'Riesgos', color: 'text-state-danger' }
                ].map((kpi, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-2 md:p-4 text-center bg-white">
                    <div className={`text-xl md:text-2xl font-extrabold ${kpi.color || 'text-brand-dark'}`}>{kpi.value}</div>
                    <div className="text-[10px] md:text-xs text-slate-500 font-semibold">{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
                <BarChartCard
                  title="Distribucion de Precios"
                  data={[
                    { label: '60k-70k', value: 14 },
                    { label: '70k-80k', value: 22 },
                    { label: '80k-90k', value: 36, highlight: true },
                    { label: '90k+', value: 18 }
                  ]}
                />
                <CompatibilidadCard
                  porcentaje={78}
                  mensaje="Tu perfil tiene alta resonancia con el inventario disponible."
                />
                <PrecioComparativoCard
                  title="Precio Real vs Media"
                  comparaciones={topOpciones.slice(0, 3).map(op => ({
                    proyecto: op.proyecto,
                    precio: op.precio_m2,
                    // Usar diferencia_pct de posicion_mercado (consistente con resultados)
                    diferencia: Math.round(op.posicion_mercado?.diferencia_pct ?? 0)
                  }))}
                  media={analisis?.bloque_3_contexto_mercado.metricas_zona?.precio_m2_promedio || 2100}
                />
              </div>

              <div className="bg-blue-50 border-l-4 border-brand-primary rounded-r-lg p-4">
                <p className="text-brand-dark">
                  <strong>Conclusion Estrategica:</strong> {analisis?.bloque_3_contexto_mercado.diagnostico || 'Tu presupuesto cae en la franja mas competitiva y segura del mercado para 2 dormitorios. Tienes poder de negociacion.'}
                </p>
              </div>
            </section>

            {/* Section 3: Top 3 */}
            <section className="mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-4">
                3. {tieneSeleccion ? 'TUS PROPIEDADES ELEGIDAS' : 'TOP 3 OPORTUNIDADES DETECTADAS'}
              </h3>
              {tieneSeleccion && (
                <p className="text-sm text-slate-500 mb-4">
                  Análisis detallado de las {topOpciones.length} propiedades que seleccionaste para comparar.
                </p>
              )}

              {topOpciones.slice(0, 1).map((op, i) => {
                // Usar diferencia_pct de posicion_mercado (consistente con resultados)
                const diffReal = op.posicion_mercado?.diferencia_pct ?? 0
                const esBajo = diffReal < 0
                const fotos = op.fotos_urls || []
                return (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <div className="bg-brand-dark text-white p-4 flex justify-between items-center">
                    <span className="font-bold">1. {op.proyecto.toUpperCase()}</span>
                    <span className={`text-white text-xs px-2 py-1 rounded ${esBajo ? 'bg-state-success' : 'bg-state-warning'}`}>
                      {Math.abs(Math.round(diffReal))}% {esBajo ? 'Bajo' : 'Sobre'} Mercado
                    </span>
                  </div>

                  {/* Galería de fotos */}
                  {fotos.length > 0 && (
                    <div className="flex gap-1 overflow-x-auto bg-slate-100 p-2">
                      {fotos.slice(0, 4).map((foto, idx) => (
                        <img
                          key={idx}
                          src={foto}
                          alt={`${op.proyecto} foto ${idx + 1}`}
                          className="h-24 w-32 object-cover rounded flex-shrink-0"
                        />
                      ))}
                      {fotos.length > 4 && (
                        <div className="h-24 w-32 bg-slate-200 rounded flex-shrink-0 flex items-center justify-center text-slate-500 text-sm">
                          +{fotos.length - 4} fotos
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-4 grid md:grid-cols-2 gap-4 md:gap-6">
                    <div>
                      <div className="text-2xl font-extrabold text-brand-dark mb-1">
                        ${op.precio_usd.toLocaleString('en-US')}
                      </div>
                      <div className={`font-semibold text-sm mb-3 ${esBajo ? 'text-state-success' : 'text-state-warning'}`}>
                        {esBajo ? `${Math.abs(Math.round(diffReal))}% bajo promedio de zona` : `${Math.round(diffReal)}% sobre promedio de zona`}
                      </div>
                      <ul className="text-sm text-slate-600 space-y-1">
                        <li>- {op.area_m2}m2 - {op.dormitorios} Dorms</li>
                        <li>- {op.zona}</li>
                        <li>- {(op.amenities || []).slice(0, 3).join(', ') || 'Sin amenities confirmados'}</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-sm font-bold mb-2">SÍNTESIS FIDUCIARIA</h5>
                      {(() => {
                        const sintesis = (op as any).sintesisFiduciaria as SintesisFiduciaria | null
                        if (sintesis) {
                          return (
                            <div className={`rounded-lg p-3 ${
                              sintesis.tipo === 'oportunidad' ? 'bg-green-50 border border-green-200' :
                              sintesis.tipo === 'sospechoso' ? 'bg-amber-50 border border-amber-200' :
                              sintesis.tipo === 'premium' ? 'bg-red-50 border border-red-200' :
                              'bg-slate-50 border border-slate-200'
                            }`}>
                              <p className={`font-semibold text-sm mb-2 ${
                                sintesis.tipo === 'oportunidad' ? 'text-green-800' :
                                sintesis.tipo === 'sospechoso' ? 'text-amber-800' :
                                sintesis.tipo === 'premium' ? 'text-red-800' :
                                'text-slate-800'
                              }`}>
                                {sintesis.headline}
                              </p>
                              <p className="text-xs text-slate-600 whitespace-pre-line mb-2">
                                {sintesis.detalles}
                              </p>
                              <p className={`text-xs font-medium ${
                                sintesis.tipo === 'oportunidad' ? 'text-green-700' :
                                sintesis.tipo === 'sospechoso' ? 'text-amber-700' :
                                sintesis.tipo === 'premium' ? 'text-red-700' :
                                'text-slate-700'
                              }`}>
                                → {sintesis.accion}
                              </p>
                            </div>
                          )
                        }
                        return <p className="text-sm text-slate-600 mb-2">{op.resumen_fiduciario}</p>
                      })()}
                    </div>
                  </div>
                </div>
              )})}


              {/* Property 2 & 3 simplified */}
              <div className="grid md:grid-cols-2 gap-4">
                {topOpciones.slice(1, 3).map((op, i) => {
                  // Usar diferencia_pct de posicion_mercado (consistente con resultados)
                  const diffReal = op.posicion_mercado?.diferencia_pct ?? 0
                  const esBajo = diffReal < 0
                  const fotos = op.fotos_urls || []
                  return (
                  <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                    {/* Thumbnail foto */}
                    {fotos.length > 0 && (
                      <img
                        src={fotos[0]}
                        alt={op.proyecto}
                        className="w-full h-32 object-cover"
                      />
                    )}
                    <div className="p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-brand-dark">{i + 2}. {op.proyecto}</span>
                        <span className={`text-xs px-2 py-1 rounded ${esBajo ? 'bg-state-success/10 text-state-success' : 'bg-state-warning/10 text-state-warning'}`}>
                          {Math.abs(Math.round(diffReal))}% {esBajo ? 'Bajo' : 'Sobre'}
                        </span>
                      </div>
                      <div className="text-xl font-bold text-brand-dark">${op.precio_usd.toLocaleString('en-US')}</div>
                      <p className="text-sm text-slate-500">{op.area_m2}m2 - {op.dormitorios} Dorms - {op.zona}</p>
                    </div>
                  </div>
                )})}
              </div>
            </section>

            {/* Section 4: Top 10 Table */}
            <section className="mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-4">4. TOP 10 RESUMIDO</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="text-left p-3">Propiedad</th>
                      <th className="p-3">Precio</th>
                      <th className="p-3">m2</th>
                      <th className="p-3">Dorms</th>
                      <th className="p-3">USD/m2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topOpciones.map((op, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="p-3 text-brand-primary font-medium">{op.proyecto}</td>
                        <td className="p-3 text-center">${Math.round(op.precio_usd / 1000)}k</td>
                        <td className="p-3 text-center">{Math.round(op.area_m2)}</td>
                        <td className="p-3 text-center">{op.dormitorios}</td>
                        <td className="p-3 text-center">{op.precio_m2}</td>
                      </tr>
                    ))}
                    {topOpciones.length < 10 && (
                      <tr className="text-slate-400">
                        <td className="p-3">...y {10 - topOpciones.length} mas</td>
                        <td colSpan={4} className="p-3 text-center">(Ver reporte completo)</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 5: Insights - Datos reales calculados */}
            <section className="mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-4">5. INSIGHTS OCULTOS</h3>
              {(() => {
                // Calcular insights desde datos reales
                const oportunidades = topOpciones.filter(op => {
                  const dif = op.posicion_mercado?.diferencia_pct ?? 0
                  return dif < -10
                }).length
                const porVerificar = topOpciones.filter(op =>
                  (op.amenities as string[])?.some(a => a.includes('verificar')) || false
                ).length
                // Alternativa: contar propiedades con amenities limitados
                const pocasAmenidades = topOpciones.filter(op =>
                  (op.amenities?.length || 0) < 3
                ).length

                return (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <h5 className="font-bold text-emerald-800 mb-2">🎯 Oportunidades de Precio</h5>
                      <p className="text-sm text-emerald-900">
                        {oportunidades > 0 ? (
                          <>Detectamos <strong>{oportunidades}</strong> {oportunidades === 1 ? 'propiedad' : 'propiedades'} con precio 10% o más bajo que el mercado. Margen de negociación favorable.</>
                        ) : (
                          <>Los precios están alineados con el mercado. No hay gangas evidentes, pero tampoco sobreprecios.</>
                        )}
                      </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h5 className="font-bold text-amber-800 mb-2">⚠️ Verificar Antes de Decidir</h5>
                      <p className="text-sm text-amber-900">
                        {pocasAmenidades > 0 ? (
                          <><strong>{pocasAmenidades}</strong> {pocasAmenidades === 1 ? 'propiedad tiene' : 'propiedades tienen'} información limitada de amenidades. Recomendamos confirmar con el asesor antes de visitar.</>
                        ) : (
                          <>Todas las propiedades tienen información completa de amenidades. Datos confiables para comparar.</>
                        )}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </section>

            {/* Section 6: Financial Scenario - BETA */}
            <section className="mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-4">6. ESCENARIO FINANCIERO</h3>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                <strong>🚧 En desarrollo:</strong> Esta sección estará disponible en una versión futura del informe premium. Los datos mostrados son estimaciones preliminares.
              </div>
              {escenarios.length > 0 ? (
                <div className="space-y-4">
                  {escenarios.map((esc, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h5 className="font-bold text-brand-dark">{esc.proyecto}</h5>
                          <p className="text-sm text-slate-500">${esc.precio_usd.toLocaleString('en-US')} - ${esc.precio_m2}/m2</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          esc.liquidez_categoria === 'alta' ? 'bg-state-success/10 text-state-success' :
                          esc.liquidez_categoria === 'media' ? 'bg-state-warning/10 text-state-warning' :
                          'bg-state-danger/10 text-state-danger'
                        }`}>
                          Liquidez {esc.liquidez_categoria}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500 block">Renta Estimada</span>
                          <span className="font-bold text-brand-dark">${esc.renta_estimada_mes}/mes</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Yield Anual</span>
                          <span className="font-bold text-state-success">{esc.yield_anual}%</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Tiempo Venta</span>
                          <span className="font-bold text-brand-dark">{esc.tiempo_venta_estimado}</span>
                        </div>
                      </div>
                      {esc.factores_riesgo.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <span className="text-xs text-state-danger">
                            Riesgos: {(esc.factores_riesgo || []).join(' | ')}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 md:p-6 text-center text-slate-500">
                  Cargando escenarios financieros...
                </div>
              )}
            </section>

            {/* Section 7: Microzonas Map - NOW FUNCTIONAL */}
            <section className="mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-4">7. MAPA DE MICROZONAS</h3>
              {microzonas.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Map placeholder */}
                  <div className="bg-lens-bg rounded-xl p-4 h-64 relative">
                    <div className="absolute inset-4 border-2 border-dashed border-lens-border rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <svg className="w-12 h-12 mx-auto text-lens-accent mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        <p className="text-lens-accent text-sm">Equipetrol y Alrededores</p>
                        <p className="text-slate-500 text-xs mt-1">{microzonas.length} microzonas activas</p>
                      </div>
                    </div>
                    {/* Dots representing microzonas */}
                    {microzonas.slice(0, 5).map((z, i) => (
                      <div
                        key={i}
                        className={`absolute w-3 h-3 rounded-full ${
                          z.categoria === 'premium' ? 'bg-premium-gold' :
                          z.categoria === 'standard' ? 'bg-brand-primary' :
                          'bg-state-success'
                        } shadow-lg`}
                        style={{
                          top: `${25 + (i * 12)}%`,
                          left: `${20 + (i * 15)}%`
                        }}
                        title={z.zona}
                      />
                    ))}
                  </div>

                  {/* Microzona stats */}
                  <div className="space-y-3">
                    {microzonas.slice(0, 5).map((z, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            z.categoria === 'premium' ? 'bg-premium-gold' :
                            z.categoria === 'standard' ? 'bg-brand-primary' :
                            'bg-state-success'
                          }`} />
                          <div>
                            <span className="font-medium text-brand-dark">{z.zona}</span>
                            <span className="text-xs text-slate-500 ml-2">{z.total} props</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-brand-dark">${z.precio_m2}/m2</span>
                          <span className={`text-xs block ${
                            z.categoria === 'premium' ? 'text-premium-gold' :
                            z.categoria === 'value' ? 'text-state-success' :
                            'text-slate-500'
                          }`}>
                            {z.categoria === 'premium' ? 'Premium' :
                             z.categoria === 'value' ? 'Valor' : 'Standard'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 md:p-6 text-center text-slate-500">
                  Cargando datos de microzonas...
                </div>
              )}
            </section>

            {/* Section 8: Motivators */}
            <section className="mb-6 md:mb-8 bg-blue-50 rounded-xl p-4 md:p-6">
              <h3 className="text-brand-primary font-bold mb-4">8. MOTIVADORES Y RIESGOS</h3>
              {isDinamico && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                  <strong>Ejemplo:</strong> Esta sección se personalizará con un formulario más extenso en una versión futura. Los datos mostrados son ilustrativos.
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <h4 className="text-sm font-bold mb-2">Tus Motivadores</h4>
                  <p className="text-sm text-slate-600">Claridad antes que velocidad, control financiero y sensacion de seguridad estructural.</p>
                </div>
                <div>
                  <h4 className="text-sm font-bold mb-2">Riesgos Psicologicos</h4>
                  <p className="text-sm text-slate-600">Saturacion por exceso de opciones y ansiedad por decidir sin respaldo tecnico.</p>
                </div>
              </div>
            </section>

            {/* Section 9: Human Advice */}
            <section className="mb-6 md:mb-8">
              <h3 className="text-brand-primary font-bold mb-4">9. CAPA 3: ASESORAMIENTO HUMANO</h3>
              <div className="border border-slate-200 rounded-xl p-4 md:p-6">
                <p className="text-slate-600 mb-4">
                  Incluye <strong>Verificacion Fiduciaria</strong> por un estratega real: visita tecnica, evaluacion de mantenimiento, revision legal y chequeo de ruidos.
                </p>
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                  <strong>Nota:</strong> Este servicio tiene un costo de <strong>$100 USD</strong> por propiedad verificada.
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mb-4">
                  <span>- Visita tecnica presencial</span>
                  <span>- Analisis juridico</span>
                  <span>- Check de administracion</span>
                  <span>- Fotos y video real</span>
                </div>
                <button className="bg-[#25D366] text-white px-4 py-2 rounded-lg font-semibold text-sm">
                  Contratar Verificacion ($100)
                </button>
              </div>
            </section>

            {/* Section 10: Conclusion */}
            <section className="bg-brand-dark text-white rounded-xl p-8 text-center">
              <h3 className="font-display text-2xl font-bold mb-4">CONCLUSION FINAL</h3>
              <p className="mb-4 max-w-2xl mx-auto">
                Estas en una posicion privilegiada. El analisis profundo esta hecho. Ahora viene la parte humana: validar fisicamente, negociar con inteligencia y comprar con seguridad.
              </p>
              <p className="text-slate-300 text-sm mb-6 max-w-xl mx-auto">
                <strong>Recomendacion:</strong> Solicitar verificacion de {topOpciones[0]?.proyecto || 'Vienna'} y {topOpciones[1]?.proyecto || 'Belvedere'}. Comparar liquidez y negociar dentro de tu ventana de 2-8 semanas.
              </p>
              <div className="inline-block bg-white/10 border border-white/20 rounded-lg px-8 py-4 font-bold text-lg">
                Simon Recomienda: {topOpciones[0]?.proyecto?.toUpperCase() || 'TORRE VIENNA'}
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
