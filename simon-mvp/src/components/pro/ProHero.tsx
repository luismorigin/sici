'use client'

import { motion } from 'framer-motion'

export default function ProHero() {
  return (
    <section className="pt-32 pb-16 bg-gradient-to-b from-brand-dark to-brand-dark-card">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="badge badge-premium mb-6">
            Herramientas Profesionales
          </span>

          <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Inteligencia Inmobiliaria para Profesionales
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Referencias de mercado sin sesgo, basadas en datos reales de Equipetrol.
            Para vendedores, brokers y avaluadores.
          </p>

          <div className="flex flex-wrap justify-center gap-6 mt-8">
            <StatItem value="187" label="Proyectos activos" />
            <StatItem value="$2.098" label="Precio/m2 promedio" />
            <StatItem value="24h" label="Datos actualizados" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  )
}
