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
  { zona: 'Eq. Centro', total: 98, precio_promedio: 156709, precio_m2: 2098, proyectos: 41, categoria: 'standard' },
  { zona: 'Villa Brigida', total: 67, precio_promedio: 71838, precio_m2: 1495, proyectos: 16, categoria: 'value' },
  { zona: 'Sirari', total: 47, precio_promedio: 199536, precio_m2: 2258, proyectos: 13, categoria: 'premium' },
  { zona: 'Eq. Norte/Norte', total: 19, precio_promedio: 153354, precio_m2: 2340, proyectos: 11, categoria: 'premium' },
  { zona: 'Eq. Oeste (Busch)', total: 16, precio_promedio: 277350, precio_m2: 2122, proyectos: 9, categoria: 'premium' },
  { zona: 'Eq. Norte/Sur', total: 3, precio_promedio: 128006, precio_m2: 2145, proyectos: 3, categoria: 'standard' }
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

  // Waitlist modal state
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

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

  // Handler para lista de espera
  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!waitlistEmail.trim()) return

    setWaitlistStatus('loading')

    // Por ahora solo guardamos en localStorage (MVP)
    // TODO: Conectar con Supabase tabla waitlist
    try {
      const waitlist = JSON.parse(localStorage.getItem('sici_waitlist') || '[]')
      if (!waitlist.includes(waitlistEmail)) {
        waitlist.push(waitlistEmail)
        localStorage.setItem('sici_waitlist', JSON.stringify(waitlist))
      }
      setWaitlistStatus('success')
    } catch {
      setWaitlistStatus('error')
    }
  }

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
                <div className="text-3xl md:text-4xl font-extrabold text-white">
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
            <div className="h-72 relative">
              {/* Mapa visual con posiciones geográficas reales */}
              {microzonas.map((z) => {
                // Posiciones geográficas reales
                const posiciones: Record<string, { top: string; left: string }> = {
                  'Sirari': { top: '12%', left: '12%' },
                  'Eq. Norte/Norte': { top: '12%', left: '58%' },
                  'Villa Brigida': { top: '32%', left: '82%' },
                  'Eq. Norte/Sur': { top: '42%', left: '58%' },
                  'Eq. Centro': { top: '62%', left: '38%' },
                  'Eq. Oeste (Busch)': { top: '78%', left: '18%' },
                }
                const pos = posiciones[z.zona]
                if (!pos) return null

                return (
                  <div
                    key={z.zona}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                    style={{ top: pos.top, left: pos.left }}
                  >
                    {/* Punto con tamaño proporcional al stock */}
                    <div
                      className={`rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                        z.categoria === 'premium' ? 'bg-premium-gold' :
                        z.categoria === 'standard' ? 'bg-brand-primary' :
                        'bg-state-success'
                      }`}
                      style={{
                        width: `${Math.max(32, Math.min(56, z.total * 0.5))}px`,
                        height: `${Math.max(32, Math.min(56, z.total * 0.5))}px`,
                      }}
                    >
                      <span className="text-white text-xs font-bold">{z.total}</span>
                    </div>

                    {/* Label */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-center whitespace-nowrap">
                      <div className="text-white text-xs font-semibold">{z.zona}</div>
                      <div className="text-slate-400 text-[10px]">${z.precio_m2.toLocaleString('es-BO')}/m²</div>
                    </div>

                    {/* Tooltip hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-10 pointer-events-none">
                      <div className="font-bold">{z.zona}</div>
                      <div>{z.total} unidades · {z.proyectos} proyectos</div>
                      <div className="text-slate-300">Prom: ${z.precio_promedio.toLocaleString('es-BO')}</div>
                    </div>
                  </div>
                )
              })}

              {/* Footer */}
              <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                  </svg>
                  Santa Cruz, Bolivia
                </span>
                <span>{microzonas.reduce((sum, z) => sum + z.total, 0)} propiedades</span>
              </div>
            </div>
          </motion.div>

          {/* Insights MOAT */}
          <motion.div
            className="col-span-12 lg:col-span-6 bg-lens-card border border-lens-border rounded-xl p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25 }}
          >
            <div className="text-slate-400 text-sm uppercase tracking-wider mb-4">
              Insights de Mercado
            </div>

            <div className="space-y-3 mb-4">
              {/* Insight 1: Mejor valor */}
              <div className="p-3 bg-state-success/10 border border-state-success/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-state-success text-lg">💰</span>
                  <div>
                    <div className="text-white font-semibold text-sm">Villa Brigida: Mejor valor</div>
                    <div className="text-slate-400 text-xs mt-1">
                      29% más barato que Eq. Centro. Ideal para primer departamento.
                    </div>
                  </div>
                </div>
              </div>

              {/* Insight 2: Stock limitado */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 text-lg">⚡</span>
                  <div>
                    <div className="text-white font-semibold text-sm">Eq. Norte: Stock limitado</div>
                    <div className="text-slate-400 text-xs mt-1">
                      Solo 22 unidades en zona premium. Alta demanda, pocas opciones.
                    </div>
                  </div>
                </div>
              </div>

              {/* Insight 3: Mayor oferta */}
              <div className="p-3 bg-brand-primary/10 border border-brand-primary/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-brand-primary text-lg">📊</span>
                  <div>
                    <div className="text-white font-semibold text-sm">Eq. Centro: Mayor oferta</div>
                    <div className="text-slate-400 text-xs mt-1">
                      98 unidades disponibles. Más opciones para comparar y negociar.
                    </div>
                  </div>
                </div>
              </div>

              {/* Insight 4: Premium */}
              <div className="p-3 bg-premium-gold/10 border border-premium-gold/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-premium-gold text-lg">✨</span>
                  <div>
                    <div className="text-white font-semibold text-sm">Sirari: Zona premium</div>
                    <div className="text-slate-400 text-xs mt-1">
                      $2,258/m² promedio. Proyectos de alto standing y plusvalía.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-white font-bold text-sm mb-2">¿Querés estos insights cada mañana?</p>
              <button
                onClick={() => setShowWaitlist(true)}
                className="btn btn-lens text-sm"
              >
                Suscribite Gratis
              </button>
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

      {/* Modal Lista de Espera */}
      {showWaitlist && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            className="bg-lens-card border border-lens-border rounded-2xl p-6 max-w-md w-full relative"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {/* Close button */}
            <button
              onClick={() => {
                setShowWaitlist(false)
                setWaitlistStatus('idle')
                setWaitlistEmail('')
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {waitlistStatus === 'success' ? (
              // Success state
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-state-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-state-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-white text-xl font-bold mb-2">Te anotamos en la lista</h3>
                <p className="text-slate-400 text-sm">
                  Te avisaremos apenas los insights diarios estén disponibles.
                </p>
              </div>
            ) : (
              // Form state
              <>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-premium-gold/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-premium-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <h3 className="text-white text-xl font-bold mb-2">Insights Diarios</h3>
                  <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full text-xs font-medium mb-3">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                    En desarrollo
                  </div>
                  <p className="text-slate-400 text-sm">
                    Estamos trabajando en enviarte cada mañana un resumen personalizado del mercado.
                    Dejá tu email para avisarte cuando esté listo.
                  </p>
                </div>

                <form onSubmit={handleWaitlistSubmit}>
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-brand-primary mb-3"
                  />
                  <button
                    type="submit"
                    disabled={waitlistStatus === 'loading'}
                    className="w-full btn btn-primary py-3 disabled:opacity-50"
                  >
                    {waitlistStatus === 'loading' ? 'Guardando...' : 'Unirme a la Lista de Espera'}
                  </button>
                </form>

                <p className="text-xs text-slate-500 text-center mt-4">
                  Sin spam. Solo te avisamos cuando esté listo.
                </p>
              </>
            )}
          </motion.div>
        </div>
      )}
    </section>
  )
}
