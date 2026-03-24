import Link from 'next/link'

export default function NavbarPremium() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-s-negro border-b border-s-dark-3/20">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 flex items-center justify-between">
        <Link href="/landing-v2" prefetch={false} className="font-s-display text-2xl text-s-dark-1 tracking-tight font-medium">
          Simon
        </Link>
        <div className="flex items-center gap-8">
          {/* Mercado dropdown */}
          <div className="relative group hidden md:block">
            <span className="text-s-dark-2 hover:text-s-dark-1 text-sm tracking-wide transition-colors cursor-default font-s-body">
              Mercado
            </span>
            <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
              <div className="bg-s-negro border border-s-dark-3/20 rounded-lg py-2 min-w-[200px] shadow-xl">
                <Link
                  href="/mercado/equipetrol"
                  prefetch={false}
                  className="block px-4 py-2.5 text-s-dark-2 hover:text-s-dark-1 hover:bg-s-dark-3/10 text-sm tracking-wide transition-colors font-s-body"
                >
                  Equipetrol — Venta
                </Link>
                <Link
                  href="/mercado/equipetrol/alquileres"
                  prefetch={false}
                  className="block px-4 py-2.5 text-s-dark-2 hover:text-s-dark-1 hover:bg-s-dark-3/10 text-sm tracking-wide transition-colors font-s-body"
                >
                  Equipetrol — Alquiler
                </Link>
              </div>
            </div>
          </div>
          <a href="#proceso" className="text-s-dark-2 hover:text-s-dark-1 text-sm tracking-wide transition-colors hidden md:block font-s-body">
            Proceso
          </a>
          <a href="#contacto" className="text-s-dark-2 hover:text-s-dark-1 text-sm tracking-wide transition-colors hidden md:block font-s-body">
            Contacto
          </a>
          <Link
            href="/ventas"
            prefetch={false}
            className="text-s-dark-1 hover:text-s-arena text-sm tracking-wide transition-colors hidden md:block font-s-body"
          >
            Ventas
          </Link>
          <Link
            href="/alquileres"
            prefetch={false}
            className="text-s-dark-1 hover:text-s-arena text-sm tracking-wide transition-colors hidden md:block font-s-body"
          >
            Alquileres
          </Link>
          <Link
            href="/ventas"
            prefetch={false}
            className="bg-s-arena text-s-negro px-6 py-3 text-xs tracking-[3px] uppercase hover:bg-s-salvia hover:text-s-arena transition-all duration-300 font-s-body"
          >
            Comenzar
          </Link>
        </div>
      </div>
    </nav>
  )
}
