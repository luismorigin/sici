import { motion } from 'framer-motion'
import Link from 'next/link'
import MatchCard from './MatchCard'

export default function Hero() {
  return (
    <section className="pt-32 pb-20 bg-white" id="top">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left column - Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Badge */}
            <span className="badge badge-primary mb-6">
              Solo Equipetrol
            </span>

            {/* Title */}
            <h1 className="font-display text-4xl md:text-5xl font-extrabold text-brand-dark leading-tight mb-6">
              Tu departamento en Equipetrol, con datos que nadie más te muestra.
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-slate-500 mb-8 max-w-lg leading-relaxed">
              Simón cruza 3 portales, compara precio/m² por zona, y te muestra solo lo que vale la pena. Sin publicidad pagada, sin agentes, solo datos.
            </p>

            {/* Checks */}
            <div className="flex flex-wrap gap-6 mb-8">
              <CheckItem text="Equipetrol: $2.098/m² promedio" />
              <CheckItem text="187 proyectos activos" />
              <CheckItem text="Verificado diariamente" />
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link href="#cta-form" className="btn btn-primary px-8 py-4 text-base">
                Ver Resultados Gratis
              </Link>
              <Link href="#como-funciona" className="btn btn-secondary px-6 py-4">
                Saber Más
              </Link>
            </div>
          </motion.div>

          {/* Right column - Card */}
          <div className="relative">
            <MatchCard />
          </div>
        </div>
      </div>
    </section>
  )
}

function CheckItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg className="w-5 h-5 text-brand-primary" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      <span className="text-brand-dark font-medium text-sm">{text}</span>
    </div>
  )
}
