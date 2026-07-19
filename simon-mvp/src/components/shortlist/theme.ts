// Tokens de tema para el chrome mobile de la shortlist (/b/[hash]).
// Mantiene las DOS identidades del rediseño de feeds: ventas = oscuro,
// alquileres = arena. Todos los componentes de `components/shortlist/` los
// consumen por `variant` para que la shortlist se sienta parte del feed que la
// originó (no una tercera skin).

export type ShortlistVariant = 'venta' | 'alquiler'

export interface ShortlistTheme {
  bg: string
  surface: string
  surfaceRaised: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentInk: string // texto sobre accent
  border: string
  overlay: string
  shadow: string
}

const VENTA: ShortlistTheme = {
  bg: '#141414',
  surface: '#1C1C1C',
  surfaceRaised: '#242424',
  text: '#EDE8DC',
  textMuted: '#9A8E7A',
  textFaint: '#7A7060',
  accent: '#3A6A48',
  accentInk: '#FFFFFF',
  border: 'rgba(237,232,220,0.12)',
  overlay: 'rgba(0,0,0,0.62)',
  shadow: '0 -6px 24px rgba(0,0,0,0.45)',
}

const ALQUILER: ShortlistTheme = {
  bg: '#EDE8DC',
  surface: '#FFFFFF',
  surfaceRaised: '#FBFAF6',
  text: '#141414',
  textMuted: '#6B6456',
  textFaint: '#938B7B',
  accent: '#3A6A48',
  accentInk: '#FFFFFF',
  border: 'rgba(20,20,20,0.10)',
  overlay: 'rgba(20,18,14,0.42)',
  shadow: '0 -6px 24px rgba(20,18,14,0.16)',
}

export function shortlistTheme(variant: ShortlistVariant): ShortlistTheme {
  return variant === 'alquiler' ? ALQUILER : VENTA
}
