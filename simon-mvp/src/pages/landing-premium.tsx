import Head from 'next/head'
import Link from 'next/link'

// Iconos SVG minimalistas (línea fina, sin emojis)
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

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export default function LandingPremium() {
  return (
    <>
      <Head>
        <title>Simón Premium — Inteligencia Inmobiliaria</title>
        {/* Fonts loaded via CSS */}
      </Head>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Manrope:wght@300;400;500;600&display=swap');

        :root {
          --color-black: #0a0a0a;
          --color-white: #ffffff;
          --color-cream: #f8f6f3;
          --color-gold: #c9a959;
          --color-gold-light: #d4b978;
          --color-gray: #666666;
          --color-muted: #999999;
        }

        .font-display {
          font-family: 'Cormorant Garamond', Georgia, serif;
        }

        .font-body {
          font-family: 'Manrope', -apple-system, sans-serif;
        }
      `}</style>

      <div className="font-body antialiased">
        {/* Navbar Premium */}
        <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            <Link href="/landing-premium" className="font-display text-2xl text-white tracking-tight">
              Simón
            </Link>
            <div className="flex items-center gap-8">
              <a href="#mercado" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors">
                Mercado
              </a>
              <a href="#proceso" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors">
                Proceso
              </a>
              <a href="#contacto" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors">
                Contacto
              </a>
              <button className="bg-white text-[#0a0a0a] px-6 py-3 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300">
                Comenzar
              </button>
            </div>
          </div>
        </nav>

        {/* Hero Premium */}
        <section className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
          {/* Línea decorativa */}
          <div className="absolute top-0 left-1/2 w-px h-32 bg-gradient-to-b from-transparent to-[#c9a959]/30" />

          <div className="max-w-5xl mx-auto px-8 text-center pt-20">
            {/* Label */}
            <div className="flex items-center justify-center gap-4 mb-12">
              <span className="w-12 h-px bg-[#c9a959]" />
              <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
                Inteligencia Inmobiliaria
              </span>
              <span className="w-12 h-px bg-[#c9a959]" />
            </div>

            {/* Título principal */}
            <h1 className="font-display text-white text-6xl md:text-8xl font-light leading-[0.95] tracking-tight mb-8">
              Tu próximo<br />
              <span className="italic text-[#c9a959]">departamento</span><br />
              en Equipetrol
            </h1>

            {/* Subtítulo */}
            <p className="text-white/60 text-lg font-light max-w-2xl mx-auto mb-16 leading-relaxed">
              Dejá que la inteligencia artificial analice el mercado por vos.
              Recibí solo las 3 mejores opciones, con datos verificados.
            </p>

            {/* CTA */}
            <button className="group bg-white text-[#0a0a0a] px-12 py-5 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300 flex items-center gap-4 mx-auto">
              Comenzar búsqueda
              <IconArrowRight />
            </button>

            {/* Stats minimalistas */}
            <div className="flex items-center justify-center gap-16 mt-24 pt-16 border-t border-white/10">
              <div className="text-center">
                <div className="font-display text-4xl text-white font-light">347</div>
                <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Propiedades</div>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div className="text-center">
                <div className="font-display text-4xl text-white font-light">193</div>
                <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Proyectos</div>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div className="text-center">
                <div className="font-display text-4xl text-[#c9a959] font-light">100%</div>
                <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Verificados</div>
              </div>
            </div>
          </div>

          {/* Línea decorativa inferior */}
          <div className="absolute bottom-0 left-1/2 w-px h-24 bg-gradient-to-t from-transparent to-white/10" />
        </section>

        {/* Sección Problema - Fondo Crema */}
        <section className="bg-[#f8f6f3] py-32">
          <div className="max-w-6xl mx-auto px-8">
            {/* Label */}
            <div className="flex items-center gap-4 mb-8">
              <span className="w-8 h-px bg-[#c9a959]" />
              <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">El problema</span>
            </div>

            <div className="grid grid-cols-2 gap-24">
              <div>
                <h2 className="font-display text-[#0a0a0a] text-5xl font-light leading-tight mb-8">
                  Buscar departamento<br />
                  <span className="italic">no debería ser</span><br />
                  un trabajo de tiempo completo
                </h2>
              </div>
              <div className="flex flex-col justify-center">
                <p className="text-[#666666] text-lg font-light leading-relaxed mb-8">
                  Decenas de portales, cientos de publicaciones, información desactualizada,
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

        {/* Sección Proceso - Fondo Negro */}
        <section id="proceso" className="bg-[#0a0a0a] py-32">
          <div className="max-w-6xl mx-auto px-8">
            {/* Label */}
            <div className="flex items-center gap-4 mb-8">
              <span className="w-8 h-px bg-[#c9a959]" />
              <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Cómo funciona</span>
            </div>

            <h2 className="font-display text-white text-5xl font-light mb-20">
              Tres pasos hacia<br />
              <span className="italic text-[#c9a959]">tu nuevo hogar</span>
            </h2>

            <div className="grid grid-cols-3 gap-12">
              {/* Paso 1 */}
              <div className="group">
                <div className="text-[#c9a959] mb-8 opacity-60 group-hover:opacity-100 transition-opacity">
                  <IconSearch />
                </div>
                <div className="text-white/30 font-display text-6xl font-light mb-4">01</div>
                <h3 className="text-white text-xl font-light mb-4">Contanos qué buscás</h3>
                <p className="text-white/50 font-light leading-relaxed">
                  Respondé algunas preguntas sobre tus necesidades, presupuesto y preferencias.
                </p>
              </div>

              {/* Paso 2 */}
              <div className="group">
                <div className="text-[#c9a959] mb-8 opacity-60 group-hover:opacity-100 transition-opacity">
                  <IconChart />
                </div>
                <div className="text-white/30 font-display text-6xl font-light mb-4">02</div>
                <h3 className="text-white text-xl font-light mb-4">Analizamos el mercado</h3>
                <p className="text-white/50 font-light leading-relaxed">
                  Nuestra IA revisa +300 propiedades y cruza datos de múltiples fuentes.
                </p>
              </div>

              {/* Paso 3 */}
              <div className="group">
                <div className="text-[#c9a959] mb-8 opacity-60 group-hover:opacity-100 transition-opacity">
                  <IconShield />
                </div>
                <div className="text-white/30 font-display text-6xl font-light mb-4">03</div>
                <h3 className="text-white text-xl font-light mb-4">Recibí tu informe</h3>
                <p className="text-white/50 font-light leading-relaxed">
                  Te enviamos las 3 mejores opciones con análisis de precio justo y comparativa.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sección Mercado - Fondo Crema */}
        <section id="mercado" className="bg-[#f8f6f3] py-32">
          <div className="max-w-6xl mx-auto px-8">
            <div className="grid grid-cols-2 gap-24 items-center">
              <div>
                {/* Label */}
                <div className="flex items-center gap-4 mb-8">
                  <span className="w-8 h-px bg-[#c9a959]" />
                  <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Market Lens</span>
                </div>

                <h2 className="font-display text-[#0a0a0a] text-5xl font-light leading-tight mb-8">
                  Datos del mercado<br />
                  <span className="italic">en tiempo real</span>
                </h2>

                <p className="text-[#666666] text-lg font-light leading-relaxed mb-12">
                  Monitoreamos el mercado inmobiliario de Equipetrol 24/7.
                  Sabemos cuándo baja un precio, cuándo aparece una nueva propiedad,
                  y cuál es el valor justo de cada metro cuadrado.
                </p>

                <button className="bg-[#0a0a0a] text-white px-10 py-4 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] transition-all duration-300 flex items-center gap-4">
                  Ver datos del mercado
                  <IconArrowRight />
                </button>
              </div>

              {/* Stats Box */}
              <div className="bg-[#0a0a0a] p-12">
                <div className="space-y-8">
                  <div className="flex justify-between items-end pb-6 border-b border-white/10">
                    <span className="text-white/50 text-sm tracking-wide">Precio promedio /m²</span>
                    <span className="font-display text-3xl text-white">$1,847</span>
                  </div>
                  <div className="flex justify-between items-end pb-6 border-b border-white/10">
                    <span className="text-white/50 text-sm tracking-wide">Ticket promedio</span>
                    <span className="font-display text-3xl text-white">$142k</span>
                  </div>
                  <div className="flex justify-between items-end pb-6 border-b border-white/10">
                    <span className="text-white/50 text-sm tracking-wide">TC Paralelo</span>
                    <span className="font-display text-3xl text-[#c9a959]">9.25</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-white/50 text-sm tracking-wide">Actualizado</span>
                    <span className="text-white/70 text-sm">Hace 2 horas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Final - Fondo Negro */}
        <section id="contacto" className="bg-[#0a0a0a] py-32">
          <div className="max-w-4xl mx-auto px-8 text-center">
            {/* Label */}
            <div className="flex items-center justify-center gap-4 mb-12">
              <span className="w-12 h-px bg-[#c9a959]" />
              <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
                Comenzá ahora
              </span>
              <span className="w-12 h-px bg-[#c9a959]" />
            </div>

            <h2 className="font-display text-white text-5xl md:text-6xl font-light leading-tight mb-8">
              ¿Listo para encontrar<br />
              <span className="italic text-[#c9a959]">tu lugar</span> en Equipetrol?
            </h2>

            <p className="text-white/50 text-lg font-light max-w-2xl mx-auto mb-12">
              Analizá el mercado en segundos con datos verificados en tiempo real.
            </p>

            <button className="bg-white text-[#0a0a0a] px-16 py-6 text-sm tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300">
              Descubrí las mejores opciones
            </button>

            {/* Trust indicators */}
            <div className="flex flex-wrap justify-center gap-8 mt-16 pt-12 border-t border-white/10">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Sin cuenta</span>
              </div>
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Datos verificados</span>
              </div>
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>100% gratis</span>
              </div>
            </div>
          </div>
        </section>

        {/* Footer Premium */}
        <footer className="bg-[#0a0a0a] border-t border-white/10 py-12">
          <div className="max-w-6xl mx-auto px-8 flex items-center justify-between">
            <div className="font-display text-2xl text-white tracking-tight">
              Simón
            </div>
            <div className="text-white/40 text-sm">
              © 2026 Simón. Inteligencia Inmobiliaria.
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
                Términos
              </a>
              <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
                Privacidad
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
