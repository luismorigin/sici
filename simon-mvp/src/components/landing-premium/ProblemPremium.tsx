import Link from 'next/link'

export default function ProblemPremium() {
  return (
    <section className="bg-s-blanco py-32">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        {/* Label */}
        <div className="flex items-center gap-4 mb-8">
          <span className="w-8 h-px bg-s-salvia" />
          <span className="text-s-piedra text-[0.7rem] tracking-[3px] uppercase font-s-body">El problema</span>
        </div>

        <div className="grid md:grid-cols-2 gap-12 md:gap-24">
          <div>
            <h2 className="font-s-display text-s-negro text-4xl md:text-5xl font-medium leading-tight mb-8">
              Buscar departamento<br />
              <span className="italic text-s-tinta">no deberia ser</span><br />
              un trabajo de tiempo completo
            </h2>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-s-piedra text-lg font-s-body font-light leading-relaxed mb-8">
              Decenas de portales, cientos de publicaciones, informacion desactualizada,
              precios inflados, fotos repetidas de diferentes inmobiliarias.
            </p>
            <p className="text-s-piedra text-lg font-s-body font-light leading-relaxed mb-8">
              El mercado inmobiliario de Santa Cruz es opaco y fragmentado.
              Nosotros lo hacemos transparente.
            </p>
            <Link href="/ventas" prefetch={false} className="inline-flex items-center gap-2 text-s-negro hover:text-s-tinta transition-colors font-s-body font-light tracking-wide">
              Ver departamentos
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
