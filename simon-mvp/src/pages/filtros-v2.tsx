import Head from 'next/head'
import Link from 'next/link'
import { FilterBarPremium } from '@/components/filters-premium'
import { premiumFonts } from '@/styles/premium-theme'

export default function FiltrosV2() {
  return (
    <>
      <Head>
        <title>Filtros | Simon - Inteligencia Inmobiliaria</title>
        <meta
          name="description"
          content="Filtra entre cientos de propiedades en Equipetrol. Encuentra tu departamento ideal."
        />
      </Head>

      {/* Premium Fonts */}
      <style jsx global>{premiumFonts}</style>

      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Header minimalista */}
        <header className="fixed top-0 w-full z-50 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            <Link href="/landing-v2" className="font-display text-2xl text-white tracking-tight">
              Simon
            </Link>
            <Link
              href="/landing-v2"
              className="text-white/50 hover:text-white text-sm transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Volver
            </Link>
          </div>
        </header>

        {/* Main content */}
        <main className="pt-32 pb-20 px-8">
          <div className="max-w-4xl mx-auto">
            <FilterBarPremium />
          </div>
        </main>

        {/* Footer minimalista */}
        <footer className="border-t border-white/10 py-8">
          <div className="max-w-6xl mx-auto px-8 text-center">
            <p className="text-white/30 text-sm">
              {new Date().getFullYear()} Simon. Inteligencia Inmobiliaria.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}
