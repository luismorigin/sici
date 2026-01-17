'use client'

import { motion } from 'framer-motion'

export type Perfil = 'vendedor' | 'broker' | 'avaluador'

interface ProfileSelectorProps {
  onSelect: (perfil: Perfil) => void
}

const perfiles = [
  {
    id: 'vendedor' as Perfil,
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    titulo: '¿Cuanto vale tu propiedad?',
    descripcion: 'Obtene una referencia de mercado sin sesgo. Vos decidis que hacer con esa informacion.',
    color: 'blue'
  },
  {
    id: 'broker' as Perfil,
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    titulo: 'CMA Profesional',
    descripcion: 'Genera analisis comparativo de mercado para tus clientes. Lucite mas profesional.',
    color: 'emerald'
  },
  {
    id: 'avaluador' as Perfil,
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    titulo: 'Referencias de Mercado',
    descripcion: 'Datos de oferta activa para complementar tu avaluo formal. Referencias verificadas.',
    color: 'amber'
  }
]

export default function ProfileSelector({ onSelect }: ProfileSelectorProps) {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="font-display text-2xl md:text-3xl font-extrabold text-brand-dark mb-3">
            ¿Que necesitas?
          </h2>
          <p className="text-slate-500">
            Selecciona tu perfil para ver herramientas adaptadas a tu caso
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {perfiles.map((perfil, i) => (
            <motion.button
              key={perfil.id}
              onClick={() => onSelect(perfil.id)}
              className={`
                p-8 rounded-2xl border-2 text-left transition-all
                hover:shadow-lg hover:-translate-y-1
                ${perfil.color === 'blue' ? 'border-blue-200 hover:border-blue-400 hover:bg-blue-50' : ''}
                ${perfil.color === 'emerald' ? 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50' : ''}
                ${perfil.color === 'amber' ? 'border-amber-200 hover:border-amber-400 hover:bg-amber-50' : ''}
              `}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className={`
                w-14 h-14 rounded-xl flex items-center justify-center mb-4
                ${perfil.color === 'blue' ? 'bg-blue-100 text-blue-600' : ''}
                ${perfil.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : ''}
                ${perfil.color === 'amber' ? 'bg-amber-100 text-amber-600' : ''}
              `}>
                {perfil.icon}
              </div>

              <h3 className="font-display text-xl font-bold text-brand-dark mb-2">
                {perfil.titulo}
              </h3>

              <p className="text-slate-500 text-sm leading-relaxed">
                {perfil.descripcion}
              </p>

              <div className={`
                mt-4 text-sm font-semibold flex items-center gap-1
                ${perfil.color === 'blue' ? 'text-blue-600' : ''}
                ${perfil.color === 'emerald' ? 'text-emerald-600' : ''}
                ${perfil.color === 'amber' ? 'text-amber-600' : ''}
              `}>
                Comenzar
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  )
}
