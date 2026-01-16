import { motion } from 'framer-motion'

interface MatchCardProps {
  compatibilidad?: number
  dormitorios?: number
  amenities?: string[]
  precioMax?: number
}

export default function MatchCard({
  compatibilidad = 87,
  dormitorios = 2,
  amenities = ['Piscina', 'Seguridad 24/7'],
  precioMax = 150000
}: MatchCardProps) {
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-radial from-brand-primary/20 to-transparent blur-3xl -z-10 scale-90" />

      {/* Card */}
      <motion.div
        className="bg-white rounded-3xl p-6 shadow-card border border-slate-100 max-w-md mx-auto"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-slate-500 font-medium text-sm">Tu Coincidencia Ideal</span>
          <span className="bg-state-success-bg text-emerald-700 font-bold text-xs px-3 py-1.5 rounded-full">
            {compatibilidad}% Compatibilidad
          </span>
        </div>

        {/* Match items */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="font-semibold text-brand-dark">{dormitorios} Dormitorios</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <span className="font-semibold text-brand-dark">{amenities.join(' y ')}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-semibold text-brand-dark">&lt; ${(precioMax / 1000).toFixed(0)}k USD</span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400 text-center leading-relaxed">
            Basado en tus preferencias de ubicación, precio y comodidades.
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}
