// CTA fijo al pie: el siguiente paso natural desde la página de mercado es
// VER los departamentos — deep-link al feed. Siempre visible sin estorbar
// (degradado hacia el fondo del tema).
import Link from 'next/link'
import { trackEvent } from '@/lib/analytics'

export default function CtaSticky({ href, label, operacion }: { href: string; label: string; operacion: 'venta' | 'alquiler' }) {
  return (
    <div className="cw">
      <Link
        href={href}
        className="cta"
        onClick={() => trackEvent('mercado_cta_feed', { operacion, ubicacion: 'sticky' })}
      >
        {label}
      </Link>
      <style jsx>{`
        .cw { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: center; padding: 12px 16px calc(14px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, var(--mx-bg-fade, rgba(20, 20, 20, 0.88)) 34%); pointer-events: none; z-index: 20; }
        .cw :global(.cta) { pointer-events: auto; display: block; width: 100%; max-width: 380px; text-align: center; background: #3a6a48; color: #f2efe6; font-family: var(--font-figtree), 'Figtree', sans-serif; font-weight: 600; font-size: 15px; padding: 15px 20px; border-radius: 14px; text-decoration: none; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35); }
        .cw :global(.cta:active) { transform: translateY(1px); }
        .cw :global(.cta:focus-visible) { outline: 2px solid var(--mx-accent, #9DBF9E); outline-offset: 2px; }
      `}</style>
    </div>
  )
}
