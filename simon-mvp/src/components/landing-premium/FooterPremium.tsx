import Link from 'next/link'

export default function FooterPremium() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-white/10 py-12">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/landing-v2" prefetch={false} className="font-display text-2xl text-white tracking-tight">
            Simon
          </Link>
          <div className="text-white/40 text-sm">
            {new Date().getFullYear()} Simon. Inteligencia Inmobiliaria.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
              Terminos
            </a>
            <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
              Privacidad
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
