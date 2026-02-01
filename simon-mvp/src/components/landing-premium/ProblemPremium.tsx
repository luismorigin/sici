export default function ProblemPremium() {
  return (
    <section className="bg-[#f8f6f3] py-32">
      <div className="max-w-6xl mx-auto px-8">
        {/* Label */}
        <div className="flex items-center gap-4 mb-8">
          <span className="w-8 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">El problema</span>
        </div>

        <div className="grid md:grid-cols-2 gap-12 md:gap-24">
          <div>
            <h2 className="font-display text-[#0a0a0a] text-4xl md:text-5xl font-light leading-tight mb-8">
              Buscar departamento<br />
              <span className="italic">no deberia ser</span><br />
              un trabajo de tiempo completo
            </h2>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[#666666] text-lg font-light leading-relaxed mb-8">
              Decenas de portales, cientos de publicaciones, informacion desactualizada,
              precios inflados, fotos repetidas de diferentes inmobiliarias.
            </p>
            <p className="text-[#666666] text-lg font-light leading-relaxed">
              El mercado inmobiliario de Santa Cruz es opaco y fragmentado.
              Nosotros lo hacemos transparente.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
