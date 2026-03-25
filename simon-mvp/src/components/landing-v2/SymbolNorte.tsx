/**
 * SymbolNorte — SVG del símbolo de Simon
 * Variantes: sobre arena (círculo negro) y sobre negro (círculo arena)
 * cy=34 es intencional — centrado óptico con el texto
 */

interface SymbolNorteProps {
  size?: number
  variant?: 'arena' | 'negro'
  className?: string
}

export default function SymbolNorte({ size = 26, variant = 'arena', className }: SymbolNorteProps) {
  const isOnDark = variant === 'negro'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
    >
      <circle cx="32" cy="34" r="28" fill={isOnDark ? '#EDE8DC' : '#141414'} />
      <circle cx="32" cy="15" r="6" fill="#3A6A48" />
      <circle cx="32" cy="15" r="3" fill={isOnDark ? '#141414' : '#EDE8DC'} />
    </svg>
  )
}
