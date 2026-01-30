import { motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Hero() {
  const [propertyCount, setPropertyCount] = useState<number | null>(null)

  // Fetch real property count from database
  useEffect(() => {
    const fetchCount = async () => {
      if (!supabase) return

      const { count, error } = await supabase
        .from('propiedades_v2')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completado')
        .eq('tipo_operacion', 'venta')
        .gte('area_total_m2', 20)

      if (!error && count !== null) {
        setPropertyCount(count)
      }
    }

    fetchCount()
  }, [])

  return (
    <section className="pt-28 pb-16 md:pt-32 md:pb-20 bg-gradient-to-b from-white to-slate-50" id="top">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Badge */}
          <span className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 text-sm font-medium px-4 py-2 rounded-full mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
            </span>
            Datos actualizados hoy
          </span>

          {/* Title */}
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold text-brand-dark leading-tight mb-6">
            Tu departamento en Equipetrol,
            <span className="text-brand-primary"> sin perder tiempo.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Precio real por m², comparativas por zona, y solo opciones que valen la pena.
            <strong className="text-slate-700"> Sin publicidad pagada. Sin agentes.</strong>
          </p>

          {/* MAIN CTA - Big Button */}
          <Link href="/formV2" className="group inline-block">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative bg-gradient-to-r from-brand-primary to-amber-500 text-white rounded-2xl px-8 py-6 md:px-12 md:py-8 shadow-xl hover:shadow-2xl transition-all duration-300"
            >
              {/* Shine effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative flex flex-col items-center gap-3">
                <div className="flex items-center gap-3 text-xl md:text-2xl font-bold">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  EXPLORAR PROPIEDADES EN EQUIPETROL
                </div>

                <div className="flex items-center gap-2 text-white/90 text-base md:text-lg">
                  {propertyCount !== null ? (
                    <>
                      <span className="font-bold text-white">{propertyCount}</span>
                      <span>opciones disponibles</span>
                    </>
                  ) : (
                    <span>Cargando opciones...</span>
                  )}
                </div>
              </div>
            </motion.div>
          </Link>

          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Sin registro</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Datos reales</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>100% gratis</span>
            </div>
          </div>

          {/* Secondary stats */}
          <div className="flex flex-wrap justify-center gap-8 mt-12 pt-8 border-t border-slate-200">
            <StatItem value="$2,098" label="Precio promedio /m²" />
            <StatItem value="110+" label="Proyectos activos" />
            <StatItem value="24h" label="Actualización diaria" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl md:text-3xl font-bold text-brand-dark">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}
