import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="py-8 border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <svg className="w-5 h-5 text-brand-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3L4 9v12h16V9l-8-6zm0 2.5l6 4.5v9H6v-9l6-4.5z"/>
              <path d="M10 14h4v6h-4z"/>
            </svg>
            <span className="font-display font-bold text-brand-dark">Simón</span>
          </Link>
        </div>

        <div className="text-center mt-4 text-sm text-slate-400">
          © {new Date().getFullYear()} Simón Inteligencia Inmobiliaria. Todos los Derechos Reservados.
        </div>
      </div>
    </footer>
  )
}
