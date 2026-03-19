import Link from 'next/link'

export default function NavbarPremium() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a] border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 flex items-center justify-between">
        <Link href="/landing-v2" prefetch={false} className="font-display text-2xl text-white tracking-tight">
          Simon
        </Link>
        <div className="flex items-center gap-8">
          {/* Mercado dropdown */}
          <div className="relative group hidden md:block">
            <span className="text-white/70 hover:text-white text-sm tracking-wide transition-colors cursor-default">
              Mercado
            </span>
            <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
              <div className="bg-[#0a0a0a] border border-white/10 rounded-lg py-2 min-w-[200px] shadow-xl">
                <Link
                  href="/mercado/equipetrol"
                  prefetch={false}
                  className="block px-4 py-2.5 text-white/70 hover:text-white hover:bg-white/5 text-sm tracking-wide transition-colors"
                >
                  Equipetrol — Venta
                </Link>
                <Link
                  href="/mercado/equipetrol/alquileres"
                  prefetch={false}
                  className="block px-4 py-2.5 text-white/70 hover:text-white hover:bg-white/5 text-sm tracking-wide transition-colors"
                >
                  Equipetrol — Alquiler
                </Link>
              </div>
            </div>
          </div>
          <a href="#proceso" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors hidden md:block">
            Proceso
          </a>
          <a href="#contacto" className="text-white/70 hover:text-white text-sm tracking-wide transition-colors hidden md:block">
            Contacto
          </a>
          <Link
            href="/ventas"
            prefetch={false}
            className="text-[#c9a959] hover:text-white text-sm tracking-wide transition-colors hidden md:block"
          >
            Ventas
          </Link>
          <Link
            href="/alquileres"
            prefetch={false}
            className="text-[#c9a959] hover:text-white text-sm tracking-wide transition-colors hidden md:block"
          >
            Alquileres
          </Link>
          <Link
            href="/ventas"
            prefetch={false}
            className="bg-white text-[#0a0a0a] px-6 py-3 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300"
          >
            Comenzar
          </Link>
        </div>
      </div>
    </nav>
  )
}
