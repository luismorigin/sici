#!/usr/bin/env node
/**
 * PageSpeed Insights (Lighthouse en la nube de Google) para la landing Condado VI.
 *
 * Lee la API key desde simon-mvp/.env.local (gitignored) → la clave NUNCA se
 * pega en el chat ni se commitea. Poné en .env.local una línea:
 *     PSI_API_KEY=AIza...
 *
 * Uso:
 *   node scripts/psi-condado.mjs               # mobile
 *   node scripts/psi-condado.mjs --desktop     # desktop
 *   node scripts/psi-condado.mjs <url>         # otra URL
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV = join(HERE, '..', '.env.local')

function readKey() {
  if (process.env.PSI_API_KEY) return process.env.PSI_API_KEY.trim()
  if (!existsSync(ENV)) return null
  for (const line of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*PSI_API_KEY\s*=\s*(.+?)\s*$/)
    if (m) return m[1].replace(/^["']|["']$/g, '').trim()
  }
  return null
}

const args = process.argv.slice(2)
const url = args.find((a) => a.startsWith('http')) || 'https://simonbo.com/condado-vi-v2'
const strategy = args.includes('--desktop') ? 'desktop' : 'mobile'
const key = readKey()

if (!key) {
  console.error('FALTA PSI_API_KEY. Agregá en simon-mvp/.env.local:  PSI_API_KEY=AIza...')
  process.exit(1)
}

const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${key}`

const res = await fetch(api)
if (!res.ok) {
  console.error(`PSI HTTP ${res.status}: ${res.statusText}`)
  process.exit(1)
}
const data = await res.json()
const lh = data.lighthouseResult
const dv = (id) => lh.audits[id]?.displayValue ?? 'n/a'
console.log(JSON.stringify({
  url,
  strategy,
  performance: Math.round(lh.categories.performance.score * 100),
  LCP: dv('largest-contentful-paint'),
  TBT: dv('total-blocking-time'),
  CLS: dv('cumulative-layout-shift'),
  FCP: dv('first-contentful-paint'),
  SI: dv('speed-index'),
}, null, 2))
