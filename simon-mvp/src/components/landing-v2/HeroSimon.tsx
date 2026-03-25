import Link from 'next/link'

export default function HeroSimon() {
  return (
    <section className="bg-s-arena px-6 md:px-12 pt-[120px] pb-24">
      <div className="max-w-[1100px] mx-auto">
        {/* Pre-headline */}
        <p className="font-s-mono font-normal text-xs text-s-piedra tracking-[1px] uppercase mb-8 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-s-salvia flex-shrink-0" />
          Inteligencia inmobiliaria · Santa Cruz de la Sierra
        </p>

        {/* Headline — copy aprobado */}
        <h1
          className="font-s-display font-medium text-s-negro leading-none mb-8 max-w-[820px]"
          style={{ fontSize: 'clamp(44px, 6.5vw, 84px)', letterSpacing: '-2px' }}
        >
          ¿Sabés realmente<br />
          cuánto vale<br />
          <span className="text-s-tinta">lo que estás mirando?</span>
        </h1>

        {/* Body */}
        <p
          className="font-s-body font-light text-s-tinta leading-relaxed max-w-[540px] mb-12"
          style={{ fontSize: 'clamp(17px, 2vw, 20px)' }}
        >
          Simon analiza el mercado de Equipetrol con datos reales y actualizados todos los días.
          Sin portales desactualizados. Sin consejos de alguien que tiene algo que venderte.
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            href="/alquileres"
            prefetch={false}
            className="font-s-body font-medium text-[15px] text-s-arena bg-s-negro px-8 py-3.5 min-h-[52px] no-underline inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            Ver alquileres →
          </Link>
          <Link
            href="/mercado/equipetrol"
            prefetch={false}
            className="font-s-body font-normal text-[15px] text-s-tinta bg-transparent border border-s-arena-mid px-7 py-3.5 min-h-[52px] no-underline inline-flex items-center hover:border-s-piedra transition-colors"
          >
            Datos del mercado
          </Link>
        </div>
      </div>
    </section>
  )
}
