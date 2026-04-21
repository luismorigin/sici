/**
 * Isotipo Simón — Inteligencia Inmobiliaria.
 * Source of truth: simon-brand/brandbook/simon-logo-kit.html
 *
 * Variantes:
 * - 'trans' — fondo transparente (default para todos los contextos claros sobre arena)
 * - 'arena' — círculo exterior negro sobre fondo arena (tiene cuadrado de fondo)
 * - 'negro' — invertido para fondos oscuros (cuadrado negro de fondo)
 */

type LogoVariant = 'trans' | 'arena' | 'negro'

interface LogoOpts {
  variant?: LogoVariant
  size?: number
  className?: string
  ariaLabel?: string
}

export function renderSimonLogo(opts: LogoOpts = {}): string {
  const variant = opts.variant ?? 'trans'
  const size = opts.size ?? 32
  const cls = opts.className ? ` class="${opts.className}"` : ''
  const aria = opts.ariaLabel ?? 'Simón — Inteligencia Inmobiliaria'

  const base = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"${cls} role="img" aria-label="${aria}">`

  if (variant === 'arena') {
    return `${base}
      <rect width="64" height="64" fill="#EDE8DC"/>
      <circle cx="32" cy="34" r="28" fill="#141414"/>
      <circle cx="32" cy="15" r="6" fill="#3A6A48"/>
      <circle cx="32" cy="15" r="3" fill="#EDE8DC"/>
    </svg>`
  }

  if (variant === 'negro') {
    return `${base}
      <rect width="64" height="64" fill="#141414"/>
      <circle cx="32" cy="34" r="28" fill="#EDE8DC"/>
      <circle cx="32" cy="15" r="6" fill="#3A6A48"/>
      <circle cx="32" cy="15" r="3" fill="#141414"/>
    </svg>`
  }

  // trans — círculo exterior negro, centro interior arena (sobre fondo claro)
  return `${base}
    <circle cx="32" cy="34" r="28" fill="#141414"/>
    <circle cx="32" cy="15" r="6" fill="#3A6A48"/>
    <circle cx="32" cy="15" r="3" fill="#EDE8DC"/>
  </svg>`
}
