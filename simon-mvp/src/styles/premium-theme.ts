// Premium Design System - Simón Inteligencia Inmobiliaria
// Fonts: Cormorant Garamond (display) + Manrope (body)
// Palette: Negro, Crema, Oro

export const premiumColors = {
  // Core colors
  black: '#0a0a0a',
  white: '#ffffff',
  cream: '#f8f6f3',

  // Gold palette
  gold: '#c9a959',
  goldLight: '#d4b978',
  goldDark: '#b8944a',

  // Neutrals
  gray: '#666666',
  muted: '#999999',

  // Semantic
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
}

// Tailwind-compatible class strings
export const premium = {
  // Backgrounds
  bgDark: 'bg-[#0a0a0a]',
  bgCream: 'bg-[#f8f6f3]',
  bgWhite: 'bg-white',
  bgGold: 'bg-[#c9a959]',

  // Text
  textWhite: 'text-white',
  textWhite70: 'text-white/70',
  textWhite60: 'text-white/60',
  textWhite50: 'text-white/50',
  textWhite40: 'text-white/40',
  textGold: 'text-[#c9a959]',
  textBlack: 'text-[#0a0a0a]',
  textGray: 'text-[#666666]',
  textMuted: 'text-[#999999]',

  // Borders
  borderSubtle: 'border-white/10',
  borderGold: 'border-[#c9a959]',
  borderGold50: 'border-[#c9a959]/50',
  borderBlack10: 'border-[#0a0a0a]/10',

  // Typography
  fontDisplay: 'font-display', // Cormorant Garamond
  fontBody: 'font-body',       // Manrope
  trackingWide: 'tracking-[3px]',
  trackingLabel: 'tracking-[4px]',
  uppercase: 'uppercase',

  // Buttons
  btnPrimary: 'bg-white text-[#0a0a0a] hover:bg-[#c9a959] hover:text-white transition-all duration-300',
  btnSecondary: 'bg-[#0a0a0a] text-white hover:bg-[#c9a959] transition-all duration-300',
  btnGold: 'bg-[#c9a959] text-[#0a0a0a] hover:bg-[#d4b978] transition-all duration-300',

  // Cards
  cardDark: 'bg-[#0a0a0a] border border-white/10',
  cardCream: 'bg-white border border-[#0a0a0a]/10',
  cardHover: 'hover:border-[#c9a959]/50 transition-colors',

  // Labels
  labelGold: 'text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase',

  // Decorative
  lineGold: 'w-8 h-px bg-[#c9a959]',
  lineWhite10: 'w-px bg-white/10',
}

// CSS for font imports (use in page Head or global styles)
export const premiumFonts = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Manrope:wght@300;400;500;600&display=swap');

.font-display {
  font-family: 'Cormorant Garamond', Georgia, serif;
}

.font-body {
  font-family: 'Manrope', -apple-system, sans-serif;
}
`

// Common component patterns
export const patterns = {
  // Section label with decorative lines
  sectionLabel: (text: string) => `
    <div class="flex items-center gap-4 mb-8">
      <span class="w-8 h-px bg-[#c9a959]"></span>
      <span class="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">${text}</span>
    </div>
  `,

  // Centered label with lines on both sides
  centeredLabel: (text: string) => `
    <div class="flex items-center justify-center gap-4">
      <span class="w-12 h-px bg-[#c9a959]"></span>
      <span class="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">${text}</span>
      <span class="w-12 h-px bg-[#c9a959]"></span>
    </div>
  `,
}

// Icon components (SVG line style)
export const icons = {
  arrowRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>`,
  check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12" /></svg>`,
  search: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>`,
}
