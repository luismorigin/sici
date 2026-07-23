// Isotipo oficial de Simon (símbolo). Fuente de verdad: simon-brand/brandbook/simon-logo-kit.html
// (sección "Símbolo"). Reemplaza el placeholder CSS (círculo arena con punto verde adentro).
// - variant 'onDark'  → para fondos oscuros (feed ventas): círculo grande arena.
// - variant 'onLight' → para fondos claros (feed alquileres): círculo grande negro.
// El punto verde (#3A6A48) con su centro de contraste es idéntico en ambas.

export default function IsotipoSimon({
  size = 22,
  variant = 'onDark',
  style,
}: {
  size?: number
  variant?: 'onDark' | 'onLight'
  style?: React.CSSProperties
}) {
  const grande = variant === 'onDark' ? '#EDE8DC' : '#141414'
  const centro = variant === 'onDark' ? '#141414' : '#EDE8DC'
  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64" fill="none"
      aria-hidden="true" style={{ flex: '0 0 auto', display: 'block', ...style }}
    >
      <circle cx="32" cy="34" r="28" fill={grande} />
      <circle cx="32" cy="15" r="6" fill="#3A6A48" />
      <circle cx="32" cy="15" r="3" fill={centro} />
    </svg>
  )
}
