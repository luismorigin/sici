/**
 * simon-design-tokens.ts
 * Sistema de Design Tokens de Simon | Inteligencia Inmobiliaria
 *
 * Source of truth: simon-brandbook-v1.html + simon-decisions.md
 * Versión del brandbook: v1.3
 *
 * USO:
 *   import { colors, typography, spacing } from '@/lib/simon-design-tokens'
 *
 * IMPORTANTE: Este archivo convive con el sistema anterior (premium-theme.ts)
 * durante la migración. Los tokens nuevos usan prefijo "simon-" en Tailwind
 * para no colisionar con los existentes.
 * Ver tailwind.config.js para la integración.
 */

// ─── COLORES ──────────────────────────────────────────────────────────────────

export const colors = {
  // Paleta base
  arena:    '#EDE8DC',  // Fondo principal. 70% del sistema. Nunca reemplazar con blanco puro.
  negro:    '#141414',  // Marca, logo, botones primarios. 25% del sistema.
  salvia:   '#3A6A48',  // Acento de identidad. SOLO 5% del sistema.
  tinta:    '#3A3530',  // Texto secundario sobre arena. 9.92:1 contraste.
  piedra:   '#7A7060',  // Labels y texto terciario sobre arena. 3.98:1 — solo texto grande.
  arenaMid: '#D8D0BC',  // Separadores, bordes, divisores.
  blanco:   '#FAFAF8',  // Fondos de cards sobre arena.

  // Textos sobre fondo negro — valores auditados WCAG
  darkPrimario:   '#EDE8DC',  // 15.07:1 AAA — texto principal sobre negro
  darkSecundario: '#C0B89E',  // 9.29:1  AAA — texto secundario sobre negro
  darkLabel:      '#9A8E7A',  // 5.72:1  AA  — labels sobre negro

  // Reglas críticas (documentadas para Claude Code):
  // ✅ salvia como texto en títulos 18px+ sobre blanco/arena (4.2:1 = WCAG AA large)
  // ✅ salvia como elemento gráfico: punto, borde, fondo de badge, tag, dot pulsante
  // ✅ datos numéricos (↑ +4.2%) siempre en negro o darkPrimario — nunca en salvia
  // ❌ salvia NUNCA como texto chico (<18px) sobre arena o blanco
  // ❌ salvia NUNCA como texto sobre negro (2.9:1 — falla WCAG)
} as const

// ─── TIPOGRAFÍA ───────────────────────────────────────────────────────────────

export const typography = {
  // Familias — solo 2 (DM Mono descartada v1.4: robótica, ceros con barra Ø)
  display: ['Figtree', 'sans-serif'],   // Títulos, nombre Simon, datos grandes. Peso 500.
  body:    ['DM Sans', 'sans-serif'],   // Todo lo demás: cuerpo, UI, navegación, precios, labels. Peso 300/400/500.

  // Tamaños — fluid type con clamp()
  // Estos valores van directo en CSS. En Tailwind usar las clases personalizadas de tailwind.config.
  scale: {
    display:  'clamp(40px, 6vw, 80px)',
    h1:       'clamp(28px, 4vw, 52px)',
    h2:       'clamp(22px, 3vw, 36px)',
    h3:       'clamp(18px, 2.2vw, 26px)',
    bodyLg:   'clamp(16px, 1.8vw, 20px)',
    body:     'clamp(15px, 1.6vw, 18px)',
    bodySm:   'clamp(14px, 1.4vw, 16px)',
    data:     'clamp(14px, 1.4vw, 16px)',    // DM Sans 500 + tabular-nums
    label:    'max(12px, clamp(12px, 1.1vw, 14px))',  // DM Sans 400, sentence case
    tag:      'max(11px, clamp(11px, 1vw, 13px))',
    btn:      'clamp(15px, 1.5vw, 17px)',
  },

  // Letter spacing
  tracking: {
    display: '-1.5px',  // Solo en display grande — Figtree 500
    label:    '0.3px',  // Labels DM Sans — sutil, no robótico
    body:     '0',      // Body NUNCA tiene tracking
  },

  // Pesos
  weights: {
    display: 500,   // Figtree — nunca 600+ en display
    body:    300,   // DM Sans light — cuerpo
    bodyUI:  400,   // DM Sans regular — labels, badges, nav
    data:    500,   // DM Sans medium — precios, datos numéricos
  },

  // Números
  numeric: {
    fontVariantNumeric: 'tabular-nums',  // Alinea columnas de números sin mono
    // Usar siempre en precios, m², porcentajes, contadores
  },

  // Labels
  labels: {
    textTransform: 'uppercase',  // Uppercase OK, pero en DM Sans con 0.5px tracking
    letterSpacing: '0.5px',      // No 1-2px como era con DM Mono — eso era robótico
  },

  // Reglas críticas:
  // ❌ Ningún texto por debajo de 12px — 95% usuarios en móvil
  // ❌ Letter-spacing > 0.5px en labels — más se siente robótico
  // ✅ Labels uppercase OK pero en DM Sans con 0.5px tracking (no DM Mono con 1-2px)
  // ❌ DM Mono en cualquier lugar — descartada v1.4
  // ✅ Botones: min-height 44px (Apple HIG mínimo táctil)
  // ✅ Precios: DM Sans 500 + tabular-nums
} as const

// ─── ESPACIADO ────────────────────────────────────────────────────────────────

export const spacing = {
  // Posts Instagram — canvas 1080px
  posts: {
    paddingFeed:    '80px',   // Feed 1:1 y 4:5 — todos los lados
    paddingStories: '80px',   // Stories/Reels — lados (safe zones top/bot son distintas)
    paddingWsp:     '60px',   // WhatsApp — todos los lados
  },

  // Safe zones para video/imagen vertical
  safeZones: {
    storiesTop:    250,  // px — UI Instagram (perfil, tiempo)
    storiesBottom: 360,  // px — botones de reacción + CTA
    storiesSides:   80,  // px
    tiktokTop:      80,  // px — barra de estado
    tiktokBottom:  300,  // px — descripción + música
    tiktokRight:   180,  // px — botones like/share/follow — CRÍTICO
    wspAll:         60,  // px
  },

  // App/Web
  app: {
    cardPadding:   '24px',
    sectionGap:    '48px',
    btnMinHeight:  '44px',  // Apple HIG
    btnPadding:    '12px 28px',
  },

  // Border radius — Simon es cálido, redondeo en todo
  borderRadius: {
    card:      '14px',   // Cards de propiedad, cards de datos
    button:    '10px',   // Botones primarios y secundarios
    pill:      '100px',  // Badges, tags, pills, filtros activos
    container: '12px',   // Modals, sheets, containers
    navBtn:    '8px',    // Botones en nav
    // ❌ NUNCA 0px o 4px — bordes rectos = editorial frío, no Simon
  },
} as const

// ─── SÍMBOLO NORTE ────────────────────────────────────────────────────────────

export const symbol = {
  // SVG canónico — viewBox 0 0 64 64
  // El cy=34 (no 32) es intencional — centrado óptico con el texto
  circulo: {
    cx: 32, cy: 34, r: 28,
    // fill según contexto:
    sobreArena:  '#141414',  // negro sobre arena
    sobreNegro:  '#EDE8DC',  // arena sobre negro
    sobreSalvia: '#EDE8DC',  // arena sobre salvia
  },
  puntoOuter: {
    cx: 32, cy: 15, r: 6,
    fill: '#3A6A48',  // siempre salvia — es el elemento de identidad
  },
  puntoInner: {
    cx: 32, cy: 15, r: 3,
    // fill = fill del fondo (arena/negro/salvia) para crear el anillo
    sobreArena:  '#EDE8DC',
    sobreNegro:  '#141414',
    sobreSalvia: '#EDE8DC',
  },
  // Zona de exclusión mínima: 1× radio en todos los lados
  // Si el símbolo mide 40px → 20px libres en cada dirección
  exclusionFactor: 1,
} as const

// ─── ANIMACIONES ─────────────────────────────────────────────────────────────

export const motion = {
  // Easings
  spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',  // Entrada con rebote suave
  smooth:  'cubic-bezier(0.16, 1, 0.3, 1)',       // Entrada suave sin rebote
  easeOut: 'ease-out',                             // Para movimientos secundarios

  // Duraciones
  fast:   '200ms',
  normal: '400ms',
  slow:   '600ms',

  // Dot pulsante salvia — para estados "Activo" / "Actualizado"
  dotPulse: {
    dot:  { keyframes: 'scale(1) → scale(1.8) → scale(1)', duration: '2.5s', easing: 'ease-in-out', iterations: 'infinite' },
    ring: { keyframes: 'scale(1) opacity(0.6) → scale(2.5) opacity(0)', duration: '2.5s', easing: 'ease-out', iterations: 'infinite' },
    // Ring es un ::after con border salvia que se expande y desaparece
  },

  // Card hover lift
  cardHover: {
    transform: 'translateY(-4px)',
    boxShadow: '0 12px 32px rgba(58,53,48,0.08)',
    duration:  '250ms',
    easing:    'ease-out',
  },

  // Símbolo Norte — 4 estados (ver simon-animaciones.html)
  symbol: {
    entrada: {
      circulo:  { duration: '500ms', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', delay: '0ms' },
      norte:    { duration: '350ms', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', delay: '400ms' },
      nombre:   { duration: '450ms', easing: 'ease-out',                           delay: '750ms' },
    },
    pulso: {
      duration:   '2s',
      easing:     'ease-in-out',
      iterations: 'infinite',
    },
    orbita: {
      duration:   '3s',
      easing:     'linear',
      iterations: 'infinite',
    },
  },

  // Motion Graphics Tipo 1 — timeline de 8 segundos
  motionTipo1: {
    wordmark:  0,     // ms
    hook:      1200,
    divider:   2800,
    precioHero:3400,
    unit:      4200,
    variacion: 4500,
    cta:       6000,
    total:     8000,
  },

  // Timing system para video (ver brandbook sección 11)
  video: {
    wordmarkWindow:  [0, 2000],      // ms — siempre en los primeros 2s
    hookMax:         3000,           // ms — hook nunca más tarde de 3s
    datoHeroMin:     1000,           // ms — dato hero nunca antes de 1s
    ctaFromEnd:      3000,           // ms — CTA siempre en los últimos 3s
  },
} as const

// ─── VOZ Y TONO ───────────────────────────────────────────────────────────────

export const voice = {
  tagline:   'Decidí bien.',   // Con punto final. Nunca cambiar.
  subtitulo: 'Inteligencia inmobiliaria en [ciudad]',  // Mutable por mercado

  // Ejemplos de copy correcto (para AI prompts y contenido)
  ejemplosCorrecto: [
    'En Equipetrol Norte el m² está a $1,847. Subió 4.2% este trimestre.',
    'No tengo suficientes datos de esa zona todavía.',
    'El precio está 12% sobre el mercado. Negociá antes de cerrar.',
  ],

  ejemplosIncorrecto: [
    'Estimado usuario, en base a un exhaustivo análisis...',
    'Excelente oportunidad de inversión.',
    'A nivel de precio, el inmueble presenta características...',
  ],
} as const

// ─── TAILWIND CONFIG EXTENSION ────────────────────────────────────────────────
// Copiar en tailwind.config.js → theme.extend
// Los nombres usan prefijo "s-" para no colisionar con colores existentes

export const tailwindExtension = {
  colors: {
    // Nuevos tokens Simon (prefijo s- para coexistir con sistema anterior)
    's-arena':     colors.arena,
    's-negro':     colors.negro,
    's-salvia':    colors.salvia,
    's-tinta':     colors.tinta,
    's-piedra':    colors.piedra,
    's-arena-mid': colors.arenaMid,
    's-blanco':    colors.blanco,
    // Textos sobre oscuro
    's-dark-1':    colors.darkPrimario,
    's-dark-2':    colors.darkSecundario,
    's-dark-3':    colors.darkLabel,
  },
  fontFamily: {
    's-display': typography.display,
    's-body':    typography.body,
    // s-mono removed v1.4 — DM Mono descartada
  },
  borderRadius: {
    's-card':      spacing.borderRadius.card,
    's-btn':       spacing.borderRadius.button,
    's-pill':      spacing.borderRadius.pill,
    's-container': spacing.borderRadius.container,
    's-nav-btn':   spacing.borderRadius.navBtn,
  },
  minHeight: {
    's-btn': spacing.app.btnMinHeight,
  },
} as const

/*
 * INSTRUCCIONES DE INTEGRACIÓN
 * ════════════════════════════
 *
 * 1. Copiar este archivo a: simon-mvp/src/lib/simon-design-tokens.ts
 *
 * 2. En tailwind.config.js, agregar en theme.extend:
 *
 *    const { tailwindExtension } = require('./src/lib/simon-design-tokens')
 *    module.exports = {
 *      theme: {
 *        extend: {
 *          ...tailwindExtension,
 *          // ... resto de la config existente
 *        }
 *      }
 *    }
 *
 * 3. En _app.tsx o layout.tsx, agregar las fuentes (solo 2 — DM Mono eliminada v1.4):
 *
 *    import { Figtree, DM_Sans } from 'next/font/google'
 *    const figtree = Figtree({ subsets: ['latin'], weight: ['300','400','500','600'] })
 *    const dmSans  = DM_Sans({ subsets: ['latin'], weight: ['300','400','500'] })
 *
 * 4. Uso en componentes:
 *
 *    // Clases Tailwind nuevas:
 *    <div className="bg-s-arena text-s-negro font-s-display">
 *    <span className="text-s-negro font-s-body font-medium tabular-nums">$1,847 USD/m²</span>
 *    <button className="bg-s-negro text-s-arena min-h-s-btn rounded-s-btn">
 *
 *    // O importar valores directos:
 *    import { colors, symbol } from '@/lib/simon-design-tokens'
 *    <circle cx={symbol.circulo.cx} cy={symbol.circulo.cy} fill={colors.negro} />
 *
 * 5. ESTRATEGIA DE MIGRACIÓN (no hacer todo de una):
 *    - Nuevos componentes: usar tokens nuevos (s-arena, s-negro, etc.)
 *    - Componentes existentes: migrar cuando los tocás por otra razón
 *    - No migrar todo de una — demasiado riesgo
 *
 * PENDIENTE cuando Simon escale:
 *    - Extraer a paquete @simon/tokens compartido entre repos
 *    - Eliminar premium-theme.ts una vez migrados todos los componentes
 */
