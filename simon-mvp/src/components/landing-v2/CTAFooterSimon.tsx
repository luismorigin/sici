import Link from 'next/link'
import SymbolNorte from './SymbolNorte'

export default function CTAFooterSimon() {
  return (
    <>
      {/* CTA Final */}
      <section className="bg-s-negro px-6 md:px-12 py-24 text-center">
        <h2
          className="font-s-display font-medium text-s-dark-1 leading-none mb-4"
          style={{ fontSize: 'clamp(40px, 5vw, 68px)', letterSpacing: '-1.5px' }}
        >
          Decidí bien.
        </h2>
        <p className="font-s-body font-light text-[17px] text-s-dark-2 mb-10">
          Sin registro. Sin tarjeta. Con datos reales de hoy.
        </p>
        <Link
          href="/alquileres"
          prefetch={false}
          className="inline-flex items-center gap-2 bg-s-arena text-s-negro font-s-body font-medium text-sm px-7 py-3 min-h-[48px] no-underline rounded-s-btn transition-transform duration-200 hover:-translate-y-px"
        >
          Buscar alquileres en Equipetrol →
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-s-negro border-t border-[#1E1E1E] px-6 md:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link href="/" prefetch={false} className="flex items-center gap-2.5 no-underline">
          <SymbolNorte size={22} variant="negro" />
          <span className="font-s-display font-medium text-sm text-s-dark-1 tracking-tight">
            Decidí bien.
          </span>
        </Link>
        <span className="font-s-body font-light text-[11px] text-s-dark-3 tracking-[0.3px]">
          © {new Date().getFullYear()} Simon · Santa Cruz de la Sierra
        </span>
      </footer>
    </>
  )
}
