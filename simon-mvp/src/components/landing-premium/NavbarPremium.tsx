import Link from 'next/link'

export default function NavbarPremium() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
        <Link href="/landing-v2" className="font-display text-2xl text-white tracking-tight">
          Simon
        </Link>
        <div className="flex items-center gap-8">
          <a href="#mercado" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors hidden md:block">
            Mercado
          </a>
          <a href="#proceso" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors hidden md:block">
            Proceso
          </a>
          <a href="#contacto" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors hidden md:block">
            Contacto
          </a>
          <Link
            href="/filtros-v2"
            className="bg-white text-[#0a0a0a] px-6 py-3 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300"
          >
            Comenzar
          </Link>
        </div>
      </div>
    </nav>
  )
}
