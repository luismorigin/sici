'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { obtenerSnapshot24h, obtenerMicrozonas, type Snapshot24h, type MicrozonaData } from '@/lib/supabase'
import Link from 'next/link'

// Demo data for when Supabase isn't configured
const demoSnapshot: Snapshot24h = {
  nuevos: 7,
  tc_actual: 10.95,
  tc_variacion: -0.6,
  precio_real_m2: 1186
}

const demoMicrozonas: MicrozonaData[] = [
  { zona: 'Equipetrol', total: 76, precio_promedio: 143579, precio_m2: 2129, proyectos: 38, categoria: 'premium' },
  { zona: 'Sirari', total: 25, precio_promedio: 215828, precio_m2: 2552, proyectos: 13, categoria: 'premium' },
  { zona: 'Villa Brigida', total: 47, precio_promedio: 102595, precio_m2: 1642, proyectos: 17, categoria: 'value' }
]

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

  const widgets = [
    { label: 'Nuevos', value: snapshot.nuevos, change: '+', changeType: 'pos' },
    { label: 'Bajadas Precio', value: 4, change: '-3%', changeType: 'neg' },
    { label: 'Retirados', value: 3, change: null, changeType: null },
    { label: 'Var. TC Paralelo', value: `${snapshot.tc_variacion}%`, change: null, changeType: snapshot.tc_variacion < 0 ? 'neg' : 'pos', isText: true },
    { label: 'Impacto Real', value: '-1.2%', change: null, changeType: 'neg', isText: true }
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
            Decisiones oportunas en tiempos volatiles. Datos vivos, normalizados al tipo de cambio real.
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
                  className="flex-1 min-w-[140px] bg-white/5 border border-white/5 rounded-lg p-4"
                >
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                    {widget.label}
                  </div>
                  <div className="text-2xl font-bold text-white flex items-center gap-2">
                    {widget.isText ? widget.value : widget.value}
                    {widget.change && (
                      <span className={`text-sm px-2 py-0.5 rounded ${
                        widget.changeType === 'pos' ? 'bg-emerald-500/20 text-emerald-400' :
                        widget.changeType === 'neg' ? 'bg-red-500/20 text-red-400' :
                        'text-slate-400'
                      }`}>
                        {widget.change}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Real Price Chart */}
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
                  Precio Real m2 (TC Ajustado)
                </div>
                <div className="text-4xl font-extrabold text-white">
                  ${snapshot.precio_real_m2.toLocaleString('en-US')}
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block text-sm px-2 py-0.5 rounded bg-red-500/20 text-red-400 mb-1">
                  -1.4% vs Ayer
                </span>
                <div className="text-sm text-slate-400">
                  TC Oficial: 6.96 | Paralelo: {snapshot.tc_actual.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Chart Mock */}
            <div className="h-32 bg-gradient-to-b from-brand-primary/10 to-transparent border-b-2 border-brand-primary relative">
              <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-white/20" />
              <div className="absolute bottom-2 left-2 text-xs text-slate-500">00:00</div>
              <div className="absolute bottom-2 right-2 text-xs text-slate-500">23:59</div>
            </div>
          </motion.div>

          {/* Daily Insight */}
          <motion.div
            className="col-span-12 lg:col-span-4 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            <div className="text-premium-gold text-3xl mb-4">💡</div>
            <div className="text-slate-400 text-sm uppercase tracking-wider mb-2">
              Insight del Dia
            </div>
            <p className="text-white font-semibold leading-relaxed">
              "Las bajadas de precio se concentraron hoy en la microzona {microzonas[2]?.zona || 'Villa Brigida'}, especialmente en unidades de 2 dormitorios."
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
                        {z.zona}: ${z.precio_m2}/m2
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
                    <span className="font-bold text-white">${z.precio_m2.toLocaleString('en-US')}/m2</span>
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
              <p className="text-white font-bold mb-3">Quieres estos datos cada manana?</p>
              <Link href="#cta-form" className="btn btn-lens">
                Suscribete
              </Link>
            </div>
          </motion.div>

          {/* Risks */}
          <motion.div
            className="col-span-12 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-slate-400 text-sm uppercase tracking-wider mb-4">
              Riesgos Detectados Hoy
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm">
                <svg className="w-5 h-5 text-state-danger flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                3 publicaciones con inconsistencias area vs precio.
              </div>
              <div className="flex gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm">
                <svg className="w-5 h-5 text-state-danger flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                2 ofertas con documentacion en tramite no declarada.
              </div>
              <div className="flex gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-sm">
                <svg className="w-5 h-5 text-state-warning flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                TC paralelo con tendencia bajista - considerar al negociar.
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
