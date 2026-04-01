import Link from 'next/link'
import SymbolNorte from './SymbolNorte'

export default function NavSimon() {
  return (
    <>
      <style jsx global>{`
        @keyframes sn-circulo { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes sn-punto { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes sn-nombre { from { transform: translateX(12px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .sn-entrada-circulo { animation: sn-circulo 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .sn-entrada-punto { animation: sn-punto 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s both; }
        .sn-entrada-nombre { animation: sn-nombre 0.5s ease-out 0.7s both; }
      `}</style>

      <nav className="bg-s-arena border-b border-s-arena-mid px-6 md:px-12 h-16 flex items-center justify-between sticky top-0 z-50">
        {/* Wordmark — entrada animation + hover scale */}
        <Link
          href="/"
          prefetch={false}
          className="group flex items-center gap-2.5 no-underline"
        >
          <span className="transition-transform duration-300 group-hover:scale-[1.08]" style={{ transformOrigin: 'center' }}>
            <svg width={26} height={26} viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="34" r="28" fill="#141414" className="sn-entrada-circulo" style={{ transformOrigin: '32px 34px' }} />
              <circle cx="32" cy="15" r="6" fill="#3A6A48" className="sn-entrada-punto" style={{ transformOrigin: '32px 15px' }} />
              <circle cx="32" cy="15" r="3" fill="#EDE8DC" className="sn-entrada-punto" style={{ transformOrigin: '32px 15px', animationDelay: '0.55s' }} />
            </svg>
          </span>
          <span className="font-s-display font-medium text-[17px] text-s-negro tracking-tight sn-entrada-nombre">
            Simon
          </span>
        </Link>

        {/* Links — hidden mobile */}
        <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
          <li>
            <Link href="/alquileres" prefetch={false} className="font-s-body font-normal text-sm text-s-tinta no-underline hover:text-s-negro transition-colors">
              Alquileres
            </Link>
          </li>
          <li>
            <Link href="/ventas" prefetch={false} className="font-s-body font-normal text-sm text-s-tinta no-underline hover:text-s-negro transition-colors">
              Ventas
            </Link>
          </li>
          <li>
            <Link href="/mercado/equipetrol" prefetch={false} className="font-s-body font-normal text-sm text-s-tinta no-underline hover:text-s-negro transition-colors">
              Mercado
            </Link>
          </li>
        </ul>

        {/* CTA */}
        <Link
          href="/alquileres"
          prefetch={false}
          className="font-s-body font-medium text-sm text-s-arena bg-s-negro px-5 py-2.5 min-h-[40px] no-underline inline-flex items-center hover:opacity-90 transition-opacity rounded-s-nav-btn"
        >
          Buscar en Equipetrol
        </Link>
      </nav>
    </>
  )
}
