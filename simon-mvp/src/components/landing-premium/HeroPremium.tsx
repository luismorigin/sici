import Link from 'next/link'
import type { HeroMetrics } from '@/lib/landing-data'

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

interface HeroPremiumProps {
  metrics: HeroMetrics
}

export default function HeroPremium({ metrics }: HeroPremiumProps) {
  const { propertyCount, projectCount, avgPriceM2 } = metrics

  return (
    <section className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
      {/* Linea decorativa superior */}
      <div className="absolute top-0 left-1/2 w-px h-32 bg-gradient-to-b from-transparent to-[#c9a959]/30" />

      <div className="max-w-5xl mx-auto px-4 md:px-8 text-center pt-20">
        {/* Pre-headline */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className="w-12 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
            Inteligencia Inmobiliaria
          </span>
          <span className="w-12 h-px bg-[#c9a959]" />
        </div>

        {/* Headline */}
        <h1 className="font-display text-white text-5xl md:text-7xl font-light leading-[1.1] tracking-tight mb-8">
          {propertyCount} departamentos en<br />
          <span className="italic text-[#c9a959]">Equipetrol,</span> analizados<br />
          para vos
        </h1>

        {/* Subheadline */}
        <p className="text-white/60 text-lg font-light max-w-2xl mx-auto mb-12 leading-relaxed">
          Precio justo, opciones reales, cero vendedores.
        </p>

        {/* CTA */}
        <Link href="/filtros-v2" prefetch={false} className="group inline-block">
          <button className="bg-white text-[#0a0a0a] px-12 py-5 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300 flex items-center gap-4 mx-auto">
            Ver departamentos
            <IconArrowRight />
          </button>
        </Link>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="text-white/40 text-sm">Sin registro</span>
          <span className="text-white/20">·</span>
          <span className="text-white/40 text-sm">100% gratis</span>
        </div>

        {/* Metricas */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 mt-20 pt-16 border-t border-white/10">
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl text-[#c9a959] font-light">
              ${new Intl.NumberFormat('en-US').format(avgPriceM2)}
            </div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Precio promedio /m²</div>
          </div>
          <div className="hidden md:block w-px h-12 bg-white/10" />
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl text-white font-light">
              {projectCount}+
            </div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Proyectos monitoreados</div>
          </div>
          <div className="hidden md:block w-px h-12 bg-white/10" />
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl text-white font-light">24h</div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Actualización</div>
          </div>
        </div>
      </div>

      {/* Linea decorativa inferior */}
      <div className="absolute bottom-0 left-1/2 w-px h-24 bg-gradient-to-t from-transparent to-white/10" />
    </section>
  )
}
