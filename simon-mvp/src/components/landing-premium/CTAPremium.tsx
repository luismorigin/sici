import Link from 'next/link'

export default function CTAPremium() {
  return (
    <section id="contacto" className="bg-s-negro py-32">
      <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
        {/* Label */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className="w-12 h-px bg-s-salvia" />
          <span className="text-s-dark-3 text-[0.7rem] tracking-[4px] uppercase font-s-body">
            Comenza ahora
          </span>
          <span className="w-12 h-px bg-s-salvia" />
        </div>

        <h2 className="font-s-display text-s-dark-1 text-4xl md:text-5xl lg:text-6xl font-medium leading-tight mb-8">
          Listo para encontrar<br />
          <span className="italic text-s-arena">tu lugar</span> en Equipetrol?
        </h2>

        <p className="text-s-dark-2 text-lg font-s-body font-light max-w-2xl mx-auto mb-12">
          Analizá el mercado en segundos con datos verificados en tiempo real.
        </p>

        <Link href="/ventas" prefetch={false}>
          <button className="bg-s-arena text-s-negro px-8 md:px-16 py-5 md:py-6 text-xs md:text-sm tracking-[2px] md:tracking-[3px] uppercase hover:bg-s-salvia hover:text-s-arena transition-all duration-300 font-s-body">
            Descubrí las mejores opciones
          </button>
        </Link>

        {/* Trust indicators */}
        <div className="flex flex-wrap justify-center gap-8 mt-16 pt-12 border-t border-s-dark-3/20">
          <div className="flex items-center gap-2 text-s-dark-3 text-sm font-s-body">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Sin cuenta</span>
          </div>
          <div className="flex items-center gap-2 text-s-dark-3 text-sm font-s-body">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Datos verificados</span>
          </div>
          <div className="flex items-center gap-2 text-s-dark-3 text-sm font-s-body">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>100% gratis</span>
          </div>
        </div>
      </div>
    </section>
  )
}
