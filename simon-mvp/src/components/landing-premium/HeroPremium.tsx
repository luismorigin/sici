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
    <section className="min-h-screen bg-s-arena flex items-center justify-center relative overflow-hidden">
      {/* Linea decorativa superior */}
      <div className="absolute top-0 left-1/2 w-px h-32 bg-gradient-to-b from-transparent to-s-salvia/30" />

      <div className="max-w-5xl mx-auto px-4 md:px-8 text-center pt-20">
        {/* Pre-headline */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className="w-12 h-px bg-s-salvia" />
          <span className="text-s-piedra text-[0.7rem] tracking-[4px] uppercase font-s-body">
            Inteligencia Inmobiliaria
          </span>
          <span className="w-12 h-px bg-s-salvia" />
        </div>

        {/* Headline */}
        <h1 className="font-s-display text-s-negro text-5xl md:text-7xl font-medium leading-[1.1] tracking-tight mb-8">
          {propertyCount} departamentos en<br />
          <span className="italic text-s-tinta">Equipetrol,</span> analizados<br />
          para vos
        </h1>

        {/* Subheadline */}
        <p className="text-s-piedra text-lg font-s-body font-light max-w-2xl mx-auto mb-12 leading-relaxed">
          Precio justo, opciones reales, cero vendedores.
        </p>

        {/* CTA */}
        <Link href="/ventas" prefetch={false} className="group inline-block">
          <button className="bg-s-negro text-s-arena px-12 py-5 text-xs tracking-[3px] uppercase hover:bg-s-salvia transition-all duration-300 flex items-center gap-4 mx-auto font-s-body">
            Ver departamentos
            <IconArrowRight />
          </button>
        </Link>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="text-s-piedra text-sm font-s-body">Sin registro</span>
          <span className="text-s-arena-mid">·</span>
          <span className="text-s-piedra text-sm font-s-body">100% gratis</span>
        </div>

        {/* Metricas */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 mt-20 pt-16 border-t border-s-arena-mid">
          <div className="text-center">
            <div className="font-s-mono text-3xl md:text-4xl text-s-negro">
              ${new Intl.NumberFormat('en-US').format(avgPriceM2)}
            </div>
            <div className="text-s-piedra text-xs tracking-[2px] uppercase mt-2 font-s-body">Precio promedio /m²</div>
          </div>
          <div className="hidden md:block w-px h-12 bg-s-arena-mid" />
          <div className="text-center">
            <div className="font-s-mono text-3xl md:text-4xl text-s-negro">
              {projectCount}+
            </div>
            <div className="text-s-piedra text-xs tracking-[2px] uppercase mt-2 font-s-body">Proyectos monitoreados</div>
          </div>
          <div className="hidden md:block w-px h-12 bg-s-arena-mid" />
          <div className="text-center">
            <div className="font-s-mono text-3xl md:text-4xl text-s-negro">24h</div>
            <div className="text-s-piedra text-xs tracking-[2px] uppercase mt-2 font-s-body">Actualización</div>
          </div>
        </div>
      </div>

      {/* Linea decorativa inferior */}
      <div className="absolute bottom-0 left-1/2 w-px h-24 bg-gradient-to-t from-transparent to-s-arena-mid" />
    </section>
  )
}
