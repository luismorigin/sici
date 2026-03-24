import Link from 'next/link'

export default function FooterPremium() {
  return (
    <footer className="bg-s-negro border-t border-s-dark-3/20 py-12">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/landing-v2" prefetch={false} className="font-s-display text-2xl text-s-dark-1 tracking-tight font-medium">
            Simon
          </Link>
          <div className="text-s-dark-3 text-sm font-s-body">
            {new Date().getFullYear()} Simon. Inteligencia Inmobiliaria.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-s-dark-3 hover:text-s-dark-1 text-sm transition-colors font-s-body">
              Terminos
            </a>
            <a href="#" className="text-s-dark-3 hover:text-s-dark-1 text-sm transition-colors font-s-body">
              Privacidad
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
