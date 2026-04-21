import { readFileSync } from 'fs'

/**
 * Parsea un markdown de narrativa con secciones delimitadas por `## key`.
 * Retorna un map { key → contenido (sin el header) }.
 *
 * Los bloques `---` separadores se ignoran. Las líneas vacías entre bloques
 * se conservan dentro del contenido de cada sección.
 */
export function loadNarrativa(path: string): Map<string, string> {
  const raw = readFileSync(path, 'utf-8')
  const map = new Map<string, string>()

  let currentKey: string | null = null
  let currentLines: string[] = []

  for (const line of raw.split(/\r?\n/)) {
    const headerMatch = line.match(/^##\s+(.+?)\s*$/)
    if (headerMatch) {
      if (currentKey) {
        map.set(currentKey, currentLines.join('\n').trim())
      }
      currentKey = headerMatch[1].trim()
      currentLines = []
    } else if (currentKey !== null) {
      // Ignorar líneas de separación horizontal y comentarios blockquote superiores
      if (line.trim() === '---') continue
      currentLines.push(line)
    }
  }
  if (currentKey) {
    map.set(currentKey, currentLines.join('\n').trim())
  }

  return map
}

/**
 * Reemplaza placeholders {{var}} en el template con los valores del objeto.
 * Los valores pueden ser string, number o boolean. Undefined/null se reemplazan
 * por string vacío (se loguea warning en stderr).
 */
export function renderTemplate(template: string, vars: Record<string, string | number | boolean | null | undefined>): string {
  return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => {
    const val = vars[key]
    if (val === undefined || val === null) {
      process.stderr.write(`[narrativa] placeholder no resuelto: ${match}\n`)
      return ''
    }
    return String(val)
  })
}

/**
 * Shortcut: lee la narrativa y retorna un render function que toma vars.
 */
export function createNarrativaRenderer(path: string) {
  const map = loadNarrativa(path)
  return {
    get(key: string): string {
      const v = map.get(key)
      if (v === undefined) throw new Error(`Narrativa: key "${key}" no encontrada en ${path}`)
      return v
    },
    render(key: string, vars: Record<string, string | number | boolean | null | undefined> = {}): string {
      const tmpl = this.get(key)
      return renderTemplate(tmpl, vars)
    },
    has(key: string): boolean {
      return map.has(key)
    },
  }
}

export type NarrativaRenderer = ReturnType<typeof createNarrativaRenderer>
