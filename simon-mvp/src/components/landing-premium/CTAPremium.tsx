import Link from 'next/link'

export default function CTAPremium() {
  return (
    <section id="contacto" className="bg-[#0a0a0a] py-32">
      <div className="max-w-4xl mx-auto px-8 text-center">
        {/* Label */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className="w-12 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
            Comenza ahora
          </span>
          <span className="w-12 h-px bg-[#c9a959]" />
        </div>

        <h2 className="font-display text-white text-4xl md:text-5xl lg:text-6xl font-light leading-tight mb-8">
          Listo para encontrar<br />
          <span className="italic text-[#c9a959]">tu lugar</span> en Equipetrol?
        </h2>

        <p className="text-white/50 text-lg font-light max-w-2xl mx-auto mb-12">
          Completa el formulario y en menos de 24 horas recibi
          tu informe personalizado con las mejores opciones del mercado.
        </p>

        <Link href="/filtros-v2">
          <button className="bg-white text-[#0a0a0a] px-16 py-6 text-sm tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300">
            Solicitar informe gratuito
          </button>
        </Link>

        {/* Trust indicators */}
        <div className="flex flex-wrap justify-center gap-8 mt-16 pt-12 border-t border-white/10">
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Sin costo</span>
          </div>
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Sin compromiso</span>
          </div>
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Respuesta en 24h</span>
          </div>
        </div>
      </div>
    </section>
  )
}
