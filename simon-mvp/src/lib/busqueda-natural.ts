// Búsqueda en lenguaje natural para los feeds — SIN IA, $0, determinística.
// "quiero un depto en equipetrol en alquiler por 4200 bs" → señales de filtro.
//
// Filosofía (vs. buscadores "con IA" tipo mobiliario.app): acá el parser NO es
// una caja negra — pre-llena los controles del overlay de filtros existente,
// así el usuario VE exactamente qué se entendió y corrige tocando. Lo que no
// se entiende se ignora sin romper nada. Determinístico = mismo texto, mismo
// resultado, siempre; sin latencia, sin costo por búsqueda, sin alucinaciones.
//
// Cada feed aplica las señales a SU formato de filtros (ventas usa nombres BD
// de zona y USD; alquiler usa slugs y Bs/mes) — ver ZONAS_CANONICAS en zonas.ts.

export interface SenalesBusqueda {
  operacion: 'venta' | 'alquiler' | null
  dormitorios: number[]            // [] = no detectado. 0 = mono, 3 = "3+"
  precioMin: number | null
  precioMax: number | null
  moneda: 'bob' | 'usd' | null     // null = no explícita (el feed decide por contexto)
  zonas: string[]                  // slugs: 'equipetrol_centro', 'sirari', 'equipetrol_3er_anillo'...
  amoblado: boolean | null
  mascotas: boolean | null
  parqueo: boolean | null
  entrega: 'entrega_inmediata' | 'solo_preventa' | null
  chips: string[]                  // lo entendido, legible ("hasta Bs 4.200", "2 dorm", ...)
}

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// "4.200" / "4,200" → 4200 (separador de miles) · "150 mil" / "150k" → 150000
function parseNumero(raw: string, milSuffix?: string): number | null {
  let s = raw.trim()
  // Separador de miles: punto o coma seguidos de exactamente 3 dígitos
  s = s.replace(/[.,](?=\d{3}(\D|$))/g, '')
  // Decimal restante (coma → punto)
  s = s.replace(',', '.')
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return milSuffix ? Math.round(n * 1000) : Math.round(n)
}

const NUM = String.raw`(\d+(?:[.,]\d+)*)\s*(mil|k)?`

// Aliases de zona → slug. Los compuestos van ANTES que "equipetrol" genérico.
const ZONA_ALIASES: Array<{ re: RegExp; slug: string; label: string }> = [
  { re: /equipetrol\s+centro|eq\.?\s+centro/, slug: 'equipetrol_centro', label: 'Eq. Centro' },
  { re: /equipetrol\s+norte|eq\.?\s+norte/, slug: 'equipetrol_norte', label: 'Eq. Norte' },
  { re: /equipetrol\s+oeste|eq\.?\s+oeste|faremafu/, slug: 'equipetrol_oeste', label: 'Eq. Oeste' },
  { re: /sirari/, slug: 'sirari', label: 'Sirari' },
  { re: /villa\s+brigida|v\.?\s+brigida|\bbrigida\b/, slug: 'villa_brigida', label: 'V. Brigida' },
  { re: /(3er|tercer)\s+anillo/, slug: 'equipetrol_3er_anillo', label: 'Eq. 3er Anillo' },
]

export function parsearBusqueda(texto: string): SenalesBusqueda {
  const s: SenalesBusqueda = {
    operacion: null, dormitorios: [], precioMin: null, precioMax: null,
    moneda: null, zonas: [], amoblado: null, mascotas: null, parqueo: null,
    entrega: null, chips: [],
  }
  const t = normalizar(texto)
  if (t.length < 3) return s

  // --- Operación ---
  if (/alquiler|alquilar|alquilo|rentar|arrendar|arriendo/.test(t)) s.operacion = 'alquiler'
  else if (/\bventa\b|\bcomprar\b|\bcompra\b|en venta/.test(t)) s.operacion = 'venta'

  // --- Moneda explícita ---
  if (/\bbs\b|bolivianos?/.test(t)) s.moneda = 'bob'
  else if (/\$|\busd\b|dolares?|\bus\b/.test(t)) s.moneda = 'usd'

  // --- Zonas (compuestas primero; "equipetrol" genérico NO filtra) ---
  for (const z of ZONA_ALIASES) {
    if (z.re.test(t)) { s.zonas.push(z.slug); s.chips.push(z.label) }
  }

  // --- Dormitorios ---
  if (/monoambiente|\bmono\b|\bestudio\b/.test(t)) { s.dormitorios.push(0); s.chips.push('Monoambiente') }
  const PALABRA_NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 }
  const dormRe = /(\d+|un|una|uno|dos|tres|cuatro|cinco)\s*(?:\+|o mas)?\s*(dormitorios?|dorms?|habitaciones?|hab\b|cuartos?|recamaras?)/g
  let m: RegExpExecArray | null
  while ((m = dormRe.exec(t)) !== null) {
    const n = PALABRA_NUM[m[1]] ?? parseInt(m[1], 10)
    if (!isNaN(n) && n >= 1) {
      const d = Math.min(n, 3) // el filtro agrupa 3+ en "3"
      if (!s.dormitorios.includes(d)) {
        s.dormitorios.push(d)
        s.chips.push(d === 3 && n >= 3 ? '3+ dorm' : `${d} dorm`)
      }
    }
  }

  // --- Precio ---
  const fmtMonto = (n: number) => n.toLocaleString('es-BO')
  const entre = new RegExp(String.raw`entre\s+${NUM}\s+y\s+${NUM}`).exec(t)
  if (entre) {
    s.precioMin = parseNumero(entre[1], entre[2])
    s.precioMax = parseNumero(entre[3], entre[4])
  } else {
    const max = new RegExp(String.raw`(?:hasta|maximo|max|tope|no mas de|menos de|por debajo de)\s+(?:de\s+)?(?:bs\.?\s*|\$us\s*|\$\s*)?${NUM}`).exec(t)
    if (max) s.precioMax = parseNumero(max[1], max[2])
    const min = new RegExp(String.raw`(?:desde|minimo|a partir de|mas de)\s+(?:bs\.?\s*|\$us\s*|\$\s*)?${NUM}`).exec(t)
    if (min) s.precioMin = parseNumero(min[1], min[2])
    // "por 4200" / "a 4200" / "de 4200 bs" — débil: solo si parece precio (≥300)
    if (s.precioMax === null && s.precioMin === null) {
      const suelto = new RegExp(String.raw`(?:por|a|de|en)\s+(?:bs\.?\s*|\$us\s*|\$\s*)?${NUM}(?:\s*(?:bs|bolivianos?|\$us|usd|dolares?))?(?:\s|$|[.,])`).exec(t)
      if (suelto) {
        const n = parseNumero(suelto[1], suelto[2])
        if (n !== null && n >= 300) s.precioMax = n
      }
    }
  }
  if (s.precioMin !== null && s.precioMax !== null && s.precioMin > s.precioMax) {
    const tmp = s.precioMin; s.precioMin = s.precioMax; s.precioMax = tmp
  }
  const monedaLabel = s.moneda === 'usd' ? '$us' : s.moneda === 'bob' ? 'Bs' : ''
  if (s.precioMin !== null && s.precioMax !== null) s.chips.push(`${monedaLabel} ${fmtMonto(s.precioMin)} — ${fmtMonto(s.precioMax)}`.trim())
  else if (s.precioMax !== null) s.chips.push(`hasta ${monedaLabel} ${fmtMonto(s.precioMax)}`.replace('  ', ' '))
  else if (s.precioMin !== null) s.chips.push(`desde ${monedaLabel} ${fmtMonto(s.precioMin)}`.replace('  ', ' '))

  // --- Flags ---
  if (/amoblad|amueblad|equipad/.test(t)) { s.amoblado = true; s.chips.push('Amoblado') }
  if (/sin amoblar|sin muebles|no amoblad/.test(t)) { s.amoblado = false; s.chips.push('Sin amoblar') }
  if (/mascotas?|perros?|gatos?|pet\s*friendly|\bpet\b/.test(t)) { s.mascotas = true; s.chips.push('Mascotas') }
  if (/parqueo|garaje|garage|cochera|estacionamiento/.test(t)) { s.parqueo = true; s.chips.push('Parqueo') }

  // --- Entrega (venta) ---
  if (/preventa|en pozo|en construccion|en planos/.test(t)) { s.entrega = 'solo_preventa'; s.chips.push('Preventa') }
  else if (/entrega inmediata|inmediata|para entrar|listo para vivir/.test(t)) { s.entrega = 'entrega_inmediata'; s.chips.push('Entrega inmediata') }

  // Chip de operación al inicio (si se detectó)
  if (s.operacion) s.chips.unshift(s.operacion === 'alquiler' ? 'Alquiler' : 'Venta')

  return s
}
