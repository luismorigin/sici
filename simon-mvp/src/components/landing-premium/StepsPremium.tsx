import Link from 'next/link'

// Iconos SVG minimalistas (linea fina)
const IconSearch = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
)

const IconChart = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 3v18h18" />
    <path d="M18 9l-5 5-4-4-3 3" />
  </svg>
)

const IconShield = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

export default function StepsPremium() {
  const steps = [
    {
      icon: <IconSearch />,
      number: '01',
      title: 'Contanos que buscas',
      description: 'Responde algunas preguntas sobre tus necesidades, presupuesto y preferencias.'
    },
    {
      icon: <IconChart />,
      number: '02',
      title: 'Analizamos el mercado',
      description: 'Nuestra IA revisa +300 propiedades y cruza datos de multiples fuentes.'
    },
    {
      icon: <IconShield />,
      number: '03',
      title: 'Recibi tu informe',
      description: 'Te enviamos las 3 mejores opciones con analisis de precio justo y comparativa.'
    }
  ]

  return (
    <section id="proceso" className="bg-[#0a0a0a] py-32">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        {/* Label */}
        <div className="flex items-center gap-4 mb-8">
          <span className="w-8 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Como funciona</span>
        </div>

        <h2 className="font-display text-white text-4xl md:text-5xl font-light mb-20">
          Tres pasos hacia<br />
          <span className="italic text-[#c9a959]">tu nuevo hogar</span>
        </h2>

        <div className="grid md:grid-cols-3 gap-12">
          {steps.map((step) => (
            <div key={step.number} className="group">
              <div className="text-[#c9a959] mb-8 opacity-60 group-hover:opacity-100 transition-opacity">
                {step.icon}
              </div>
              <div className="text-white/30 font-display text-6xl font-light mb-4">{step.number}</div>
              <h3 className="text-white text-xl font-light mb-4">{step.title}</h3>
              <p className="text-white/50 font-light leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA inline */}
        <div className="mt-20 text-center">
          <p className="text-white/40 text-sm mb-6">Solo toma 30 segundos</p>
          <Link href="/filtros-v2" prefetch={false} className="inline-flex items-center gap-3 bg-white text-[#0a0a0a] px-10 py-4 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300">
            Empezar ahora
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
