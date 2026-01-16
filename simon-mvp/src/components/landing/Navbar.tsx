import Link from 'next/link'

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <svg className="w-7 h-7 text-brand-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3L4 9v12h16V9l-8-6zm0 2.5l6 4.5v9H6v-9l6-4.5z"/>
              <path d="M10 14h4v6h-4z"/>
            </svg>
            <span className="font-display font-bold text-xl text-brand-dark">Simón</span>
          </Link>

          {/* Nav Links - Hidden on mobile */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#como-funciona" className="text-slate-500 hover:text-brand-primary font-medium text-sm transition-colors">
              Cómo Funciona
            </Link>
            <Link href="#informe" className="text-slate-500 hover:text-brand-primary font-medium text-sm transition-colors">
              Ver Informe
            </Link>
            <Link href="#cta-form" className="btn btn-primary text-sm py-2 px-5">
              Iniciar Búsqueda
            </Link>
          </nav>

          {/* Mobile CTA */}
          <Link href="#cta-form" className="md:hidden btn btn-primary text-sm py-2 px-4">
            Empezar
          </Link>
        </div>
      </div>
    </header>
  )
}
