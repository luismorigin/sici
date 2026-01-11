'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import ProfileBox from './ProfileBox'
import PropertyCard from './PropertyCard'
import { BarChartCard, CompatibilidadCard, PrecioComparativoCard } from './ChartCard'
import {
  obtenerAnalisisFiduciario,
  generarDistribucionPrecios,
  generarComparacionesProyecto,
  obtenerScoresConfianza,
  type AnalisisMercadoFiduciario,
  type OpcionValida
} from '@/lib/supabase'

// Sample data for when Supabase isn't configured
const sampleData = {
  perfil: 'Hogar Estrategico de Valor',
  presupuesto: 90000,
  prioridades: ['Seguridad', 'Piso Medio/Alto', 'Piscina'],
  sensibilidad: 'alta' as const,
  compatibilidad: 78,
  totalProps: 144,
  distribucion: [
    { label: '60k-70k', value: 14 },
    { label: '70k-80k', value: 22 },
    { label: '80k-90k', value: 36, highlight: true },
    { label: '90k+', value: 18 }
  ],
  comparaciones: [
    { proyecto: 'Vienna', precio: 1091, diferencia: -9 },
    { proyecto: 'Belvedere', precio: 1153, diferencia: -4 },
    { proyecto: 'Nova Tower', precio: 1160, diferencia: 3 }
  ],
  topPropiedades: [
    { nombre: 'Torre Vienna', precio: 89500, dormitorios: 2, area: 82, matchScore: 86, confianza: 91 },
    { nombre: 'Belvedere', precio: 90000, dormitorios: 2, area: 78, matchScore: 82, confianza: 89 },
    { nombre: 'Nova Tower', precio: 87000, dormitorios: 2, area: 75, matchScore: 79, confianza: 88 }
  ]
}

// Convert API data to display format
function convertirOpcionADisplay(
  opcion: OpcionValida,
  index: number,
  scoresMap: Map<number, number>
) {
  // Calculate match score based on position and market position
  const baseScore = 90 - (index * 4)
  const matchScore = Math.max(70, Math.min(98, baseScore))

  // Use real score from BD if available, otherwise estimate
  const scoreReal = scoresMap.get(opcion.id)
  const confianza = scoreReal ?? Math.min(95, 75 + (opcion.fotos > 5 ? 10 : 0) + (opcion.desarrollador ? 10 : 0))

  return {
    id: opcion.id,
    nombre: opcion.proyecto,
    precio: Math.round(opcion.precio_usd),
    dormitorios: opcion.dormitorios,
    area: Math.round(opcion.area_m2),
    matchScore,
    confianza
  }
}

export default function ReportExample() {
  const [analisis, setAnalisis] = useState<AnalisisMercadoFiduciario | null>(null)
  const [scores, setScores] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [usingRealData, setUsingRealData] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const fetchData = async () => {
      const data = await obtenerAnalisisFiduciario({
        dormitorios: 2,
        precio_max: 150000,
        solo_con_fotos: true,
        limite: 10
      })

      if (data && data.bloque_1_opciones_validas.total > 0) {
        setAnalisis(data)
        setUsingRealData(true)

        // Fetch real confidence scores for top 3 properties
        const top3Ids = data.bloque_1_opciones_validas.opciones
          .slice(0, 3)
          .map(op => op.id)
        const scoresData = await obtenerScoresConfianza(top3Ids)
        setScores(scoresData)
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  // Derive display data from API or use sample
  const displayData = analisis ? {
    perfil: 'Hogar Estrategico de Valor',
    presupuesto: analisis.filtros_aplicados.precio_max || 150000,
    prioridades: ['Seguridad', 'Ubicacion', 'Amenities'],
    sensibilidad: 'alta' as const,
    compatibilidad: Math.min(100, Math.round(analisis.bloque_3_contexto_mercado.porcentaje_mercado)) || 78,
    totalProps: analisis.bloque_3_contexto_mercado.stock_total,
    distribucion: generarDistribucionPrecios(
      analisis.bloque_1_opciones_validas.opciones,
      analisis.bloque_3_contexto_mercado
    ),
    comparaciones: generarComparacionesProyecto(
      analisis.bloque_1_opciones_validas.opciones,
      analisis.bloque_3_contexto_mercado.metricas_zona?.precio_m2_promedio || 1200
    ),
    topPropiedades: analisis.bloque_1_opciones_validas.opciones
      .slice(0, 3)
      .map((op, i) => convertirOpcionADisplay(op, i, scores))
  } : sampleData

  const mediaPrecioM2 = analisis?.bloque_3_contexto_mercado.metricas_zona?.precio_m2_promedio || 1200

  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200" id="informe">
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-brand-dark mb-3">
            Tu Informe Preliminar Gratuito
          </h2>
          <p className="text-slate-500">
            {usingRealData
              ? 'Datos reales del mercado de Equipetrol, actualizados hoy.'
              : 'Esto es exactamente lo que recibes al completar el formulario, pero adaptado a ti.'
            }
          </p>
          {usingRealData && (
            <span className="inline-flex items-center gap-1 mt-2 text-xs bg-state-success/10 text-state-success px-2 py-1 rounded-full">
              <span className="w-2 h-2 bg-state-success rounded-full animate-pulse"></span>
              Datos en vivo
            </span>
          )}
        </motion.div>

        {/* Report container */}
        <motion.div
          className="bg-white rounded-3xl shadow-card overflow-hidden border border-slate-200"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          {/* Report header */}
          <div className="bg-brand-dark text-white px-6 py-4 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-bold">Informe de Mercado #{mounted ? 247 : '---'}</span>
            </div>
            <div className="flex gap-6 text-sm opacity-90">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                Equipetrol
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {mounted ? new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '...'}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {mounted ? displayData.totalProps : sampleData.totalProps} Props. Validadas
              </span>
            </div>
          </div>

          {/* Report body */}
          <div className="p-6">
            {/* Profile box */}
            <ProfileBox
              perfil={mounted ? displayData.perfil : sampleData.perfil}
              presupuesto={mounted ? displayData.presupuesto : sampleData.presupuesto}
              prioridades={mounted ? displayData.prioridades : sampleData.prioridades}
              sensibilidad={mounted ? displayData.sensibilidad : sampleData.sensibilidad}
            />

            {/* Charts grid */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <BarChartCard
                title="Distribucion de Precios"
                data={mounted ? displayData.distribucion : sampleData.distribucion}
              />
              <CompatibilidadCard
                porcentaje={mounted ? displayData.compatibilidad : sampleData.compatibilidad}
                mensaje={mounted && analisis
                  ? analisis.bloque_3_contexto_mercado.diagnostico
                  : `Hay ${sampleData.distribucion.find(d => d.highlight)?.value || 0} propiedades en tu "Zona Dorada".`
                }
              />
              <PrecioComparativoCard
                title={`Precio m2 vs Media ($${(mounted ? mediaPrecioM2 : 1200).toLocaleString('en-US')})`}
                comparaciones={mounted ? displayData.comparaciones : sampleData.comparaciones}
                media={mounted ? mediaPrecioM2 : 1200}
              />
            </div>

            {/* Top 3 properties */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-brand-dark">Top 3 Propiedades Detectadas</h4>
              {mounted && analisis && analisis.bloque_4_alertas.total > 0 && (
                <span className="text-xs bg-state-warning/10 text-state-warning px-2 py-1 rounded">
                  {analisis.bloque_4_alertas.total} alertas detectadas
                </span>
              )}
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {(mounted ? displayData.topPropiedades : sampleData.topPropiedades).map((prop, i) => (
                <PropertyCard key={i} {...prop} />
              ))}
            </div>

            {/* Context message if using real data */}
            {mounted && analisis && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm text-blue-800">
                  <strong>Contexto de Mercado:</strong> {analisis.bloque_3_contexto_mercado.diagnostico}
                  {analisis.bloque_2_opciones_excluidas.total > 0 && (
                    <span className="block mt-1 text-blue-600">
                      Hay {analisis.bloque_2_opciones_excluidas.total} propiedades mas baratas que no cumplen todos los filtros.
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
