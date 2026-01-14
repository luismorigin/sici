'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { obtenerSnapshot24h, obtenerMicrozonas, type Snapshot24h, type MicrozonaData } from '@/lib/supabase'
import Link from 'next/link'

// Fallback con datos REALES de Enero 2026
const demoSnapshot: Snapshot24h = {
  nuevos: 8,
  retirados: 1,
  bajadas_precio: 0,
  tc_actual: 9.72,
  tc_variacion: 0.52,
  precio_m2_promedio: 2022,
  score_bajo: 18,
  props_tc_paralelo: 46,
  dias_mediana_equipetrol: 51,
  unidades_equipetrol_2d: 31,
  total_activas: 302,
  proyectos_monitoreados: 189
}

const demoMicrozonas: MicrozonaData[] = [
  { zona: 'Equipetrol', total: 93, precio_promedio: 160608, precio_m2: 2125, proyectos: 41, categoria: 'standard' },
  { zona: 'Sirari', total: 47, precio_promedio: 198457, precio_m2: 1991, proyectos: 13, categoria: 'standard' },
  { zona: 'Villa Brigida', total: 36, precio_promedio: 94649, precio_m2: 1685, proyectos: 16, categoria: 'value' },
  { zona: 'Equipetrol Norte', total: 19, precio_promedio: 152984, precio_m2: 2331, proyectos: 11, categoria: 'premium' }
]

// Formato boliviano: $150,000 → $150.000
function formatBoliviano(n: number): string {
  return '$' + n.toLocaleString('es-BO', { maximumFractionDigits: 0 })
}

export default function MarketLens() {
  const [snapshot, setSnapshot] = useState<Snapshot24h>(demoSnapshot)
  const [microzonas, setMicrozonas] = useState<MicrozonaData[]>(demoMicrozonas)
  const [loading, setLoading] = useState(true)
  const [usingRealData, setUsingRealData] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const [snapshotData, microzonasData] = await Promise.all([
        obtenerSnapshot24h(),
        obtenerMicrozonas()
      ])

      if (snapshotData) {
        setSnapshot(snapshotData)
        setUsingRealData(true)
      }
      if (microzonasData.length > 0) {
        setMicrozonas(microzonasData)
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  // Calcular diferencia TC oficial vs paralelo
  const tcOficial = 6.96
  const difTcPct = Math.round(((snapshot.tc_actual - tcOficial) / tcOficial) * 100)

  const widgets = [
    {
      label: 'Nuevos',
      value: snapshot.nuevos,
      badge: '+',
      badgeType: 'pos',
      tooltip: 'Propiedades agregadas en últimas 24h'
    },
    {
      label: 'Bajadas Precio',
      value: snapshot.bajadas_precio,
      badge: null,
      badgeType: null,
      tooltip: 'Monitoreamos cambios diarios'
    },
    {
      label: 'Retirados',
      value: snapshot.retirados,
      badge: null,
      badgeType: null,
      tooltip: 'Propiedades que salieron del mercado'
    },
    {
      label: 'TC Paralelo',
      value: `Bs ${snapshot.tc_actual.toFixed(2)}`,
      badge: snapshot.tc_variacion > 0 ? `+${snapshot.tc_variacion}%` : `${snapshot.tc_variacion}%`,
      badgeType: snapshot.tc_variacion > 0 ? 'pos' : 'neg',
      isText: true,
      tooltip: 'Tipo de cambio Binance P2P'
    }
  ]

  return (
    <section className="py-24 bg-lens-bg text-white border-t border-lens-border" id="lens">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white mb-2">
            Equipetrol Hoy: Inteligencia en Tiempo Real
          </h2>
          <p className="text-slate-400 text-lg">
            {snapshot.total_activas} propiedades activas en {snapshot.proyectos_monitoreados} proyectos monitoreados
          </p>
          {usingRealData && (
            <span className="inline-flex items-center gap-1 mt-2 text-xs bg-state-success/20 text-state-success px-2 py-1 rounded-full">
              <span className="w-2 h-2 bg-state-success rounded-full animate-pulse"></span>
              Datos en vivo
            </span>
          )}
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-12 gap-4">
          {/* 24H Snapshot - Full Width */}
          <motion.div
            className="col-span-12 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="text-slate-400 text-sm uppercase tracking-wider mb-4">
              Snapshot Ultimas 24 Horas
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {widgets.map((widget, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-[140px] bg-white/5 border border-white/5 rounded-lg p-4 group relative"
                >
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                    {widget.label}
                  </div>
                  <div className="text-2xl font-bold text-white flex items-center gap-2">
                    {widget.isText ? widget.value : widget.value}
                    {widget.badge && (
                      <span className={`text-sm px-2 py-0.5 rounded ${
                        widget.badgeType === 'pos' ? 'bg-emerald-500/20 text-emerald-400' :
                        widget.badgeType === 'neg' ? 'bg-red-500/20 text-red-400' :
                        'text-slate-400'
                      }`}>
                        {widget.badge}
                      </span>
                    )}
                  </div>
                  {/* Tooltip MOAT */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 text-white text-xs px-3 py-2 rounded whitespace-nowrap z-10">
                    {widget.tooltip}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Precio m² promedio */}
          <motion.div
            className="col-span-12 lg:col-span-8 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-slate-400 text-sm uppercase tracking-wider mb-1">
                  Precio Promedio m² Equipetrol
                </div>
                <div className="text-4xl font-extrabold text-white">
                  ${snapshot.precio_m2_promedio.toLocaleString('es-BO')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400 mb-1">
                  TC Oficial: Bs 6.96 | Paralelo: Bs {snapshot.tc_actual.toFixed(2)}
                </div>
                <span className="inline-block text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300">
                  Diferencia: +{difTcPct}%
                </span>
              </div>
            </div>

            {/* Stats rápidos */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{snapshot.total_activas}</div>
                <div className="text-xs text-slate-400">Propiedades activas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{snapshot.proyectos_monitoreados}</div>
                <div className="text-xs text-slate-400">Proyectos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">5</div>
                <div className="text-xs text-slate-400">Microzonas</div>
              </div>
            </div>
          </motion.div>

          {/* Insight MOAT */}
          <motion.div
            className="col-span-12 lg:col-span-4 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            <div className="text-premium-gold text-3xl mb-4">💡</div>
            <div className="text-slate-400 text-sm uppercase tracking-wider mb-2">
              Insight MOAT
            </div>
            <p className="text-white font-semibold leading-relaxed mb-3">
              Equipetrol 2D: mediana {snapshot.dias_mediana_equipetrol} días en mercado
            </p>
            <p className="text-xs text-slate-400">
              Basado en {snapshot.unidades_equipetrol_2d} unidades activas.
              Hay margen de negociación en propiedades con más tiempo publicadas.
            </p>
          </motion.div>

          {/* Microzonas Map */}
          <motion.div
            className="col-span-12 lg:col-span-6 bg-lens-card border border-lens-border rounded-xl overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="p-4 border-b border-lens-border flex justify-between items-center">
              <div className="text-slate-400 text-sm uppercase tracking-wider">
                Mapa de Microzonas
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-premium-gold"></span>
                  Premium
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-brand-primary"></span>
                  Standard
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-state-success"></span>
                  Valor
                </span>
              </div>
            </div>
            <div className="h-64 bg-lens-card relative p-4">
              {/* Simple map representation */}
              <div className="absolute inset-4 border border-lens-border rounded-lg">
                {/* Microzona dots with labels */}
                {microzonas.slice(0, 5).map((z, i) => {
                  const positions = [
                    { top: '30%', left: '50%' },
                    { top: '45%', left: '70%' },
                    { top: '60%', left: '35%' },
                    { top: '25%', left: '25%' },
                    { top: '70%', left: '60%' }
                  ]
                  return (
                    <div
                      key={i}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                      style={positions[i]}
                    >
                      <div className={`w-4 h-4 rounded-full ${
                        z.categoria === 'premium' ? 'bg-premium-gold' :
                        z.categoria === 'standard' ? 'bg-brand-primary' :
                        'bg-state-success'
                      } shadow-lg cursor-pointer transition-transform hover:scale-150`} />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        {z.zona}: ${z.precio_m2.toLocaleString('es-BO')}/m²
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded text-xs text-white">
                Equipetrol y Alrededores
              </div>
            </div>
          </motion.div>

          {/* Microzonas Stats & CTA */}
          <motion.div
            className="col-span-12 lg:col-span-6 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25 }}
          >
            <div className="text-slate-400 text-sm uppercase tracking-wider mb-4">
              Precio por Microzona
            </div>

            <div className="space-y-3 mb-6">
              {microzonas.slice(0, 4).map((z, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      z.categoria === 'premium' ? 'bg-premium-gold' :
                      z.categoria === 'standard' ? 'bg-brand-primary' :
                      'bg-state-success'
                    }`} />
                    <div>
                      <span className="font-medium text-white">{z.zona}</span>
                      <span className="text-xs text-slate-500 ml-2">{z.total} unidades</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-white">${z.precio_m2.toLocaleString('es-BO')}/m²</span>
                    <span className={`text-xs block ${
                      z.categoria === 'premium' ? 'text-premium-gold' :
                      z.categoria === 'value' ? 'text-state-success' :
                      'text-slate-400'
                    }`}>
                      {z.categoria === 'premium' ? 'Premium' :
                       z.categoria === 'value' ? 'Valor' : 'Standard'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
              <p className="text-white font-bold mb-3">¿Querés estos datos cada mañana?</p>
              <Link href="#cta-form" className="btn btn-lens">
                Suscribite
              </Link>
            </div>
          </motion.div>

          {/* Alertas MOAT */}
          <motion.div
            className="col-span-12 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-slate-400 text-sm uppercase tracking-wider mb-4">
              Alertas MOAT del Día
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Alerta 1: Score bajo */}
              <div className="flex gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-sm">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <span className="font-semibold">{snapshot.score_bajo} publicaciones</span> con datos incompletos - verificar antes de decidir
                </div>
              </div>

              {/* Alerta 2: TC paralelo */}
              <div className="flex gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-200 text-sm">
                <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <span className="font-semibold">{snapshot.props_tc_paralelo} propiedades</span> cotizan al TC paralelo (Bs {snapshot.tc_actual.toFixed(2)}) - verificar precio al ofertar
                </div>
              </div>

              {/* Alerta 3: TC variación */}
              <div className={`flex gap-3 p-3 rounded-lg text-sm ${
                snapshot.tc_variacion > 0
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
                  : 'bg-red-500/10 border border-red-500/20 text-red-200'
              }`}>
                <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  snapshot.tc_variacion > 0 ? 'text-emerald-400' : 'text-red-400'
                }`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                </svg>
                <div>
                  TC paralelo {snapshot.tc_variacion > 0 ? 'subió' : 'bajó'} <span className="font-semibold">{Math.abs(snapshot.tc_variacion)}%</span> vs última cotización - considerar al negociar
                </div>
              </div>
            </div>

            {/* Disclaimer MOAT */}
            <p className="text-xs text-slate-500 mt-4 text-center">
              Datos actualizados automáticamente. Alertas basadas en análisis de {snapshot.total_activas} propiedades activas.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
