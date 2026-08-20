// ============================================================================
// ¿El admin muestra el MISMO precio que el feed?
// ----------------------------------------------------------------------------
// `lib/precio-utils.ts → precioDelFeed()` es una RÉPLICA EN JS de la función SQL
// `precio_normalizado_shadow()`. Existe porque el admin consulta la tabla directo
// (necesita ver también lo que el feed esconde) y tiene que mostrar el mismo número.
//
// 🔴 POR QUÉ EXISTE ESTE EVAL. Una réplica no tiene nada que la ate al original:
// cuando una migración cambia la función SQL, la copia de JS **sigue compilando y
// sigue devolviendo un número creíble**. Pasó, y costó caro:
//
//   · La **mig 311** (28-jul-2026) decidió que `oficial_viejo` YA NO se descuenta.
//   · `precioDelFeed` se escribió el 11-ago y nació con la regla vieja
//     (`crudo × 6,96 ÷ TC`).
//   · Resultado: **129 propiedades** que el cliente veía a $100.581 de promedio, el
//     admin las mostraba a **$60.526** — 40% más baratas. Justo en las pantallas que
//     el paso 1 arregló PARA que mostraran el mismo número que el feed.
//   · Se descubrió el 20-ago-2026 de casualidad, mirando otra cosa.
//
// CÓMO COMPARA: NO reimplementa la regla de la BD — eso sería una tercera copia con
// el mismo problema. Toma `precio_norm` de `v_mercado_venta_shadow`, que es el número
// que la base **realmente produce** y que el cliente ve, y lo cruza por id contra lo
// que calcula el JS del admin.
//
// Uso:  cd simon-mvp && node scripts/eval-precio-del-feed.mjs
// Sale con 1 si hay desfase — sirve antes de un deploy del admin.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const AQUI = dirname(fileURLToPath(import.meta.url))

// El .env.local se lee a mano (no hay dotenv en este paquete) — mismo patrón que eval-acm.mjs
const env = {}
for (const linea of readFileSync(resolve(AQUI, '../.env.local'), 'utf8').split('\n')) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('🔴 Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

// ── La réplica en JS, extraída del archivo REAL ──────────────────────────────
// Se lee `precio-utils.ts` y se evalúa la función tal cual está escrita: así el eval
// mide lo que el admin USA, no lo que este script cree que hace.
const src = readFileSync(resolve(AQUI, '../src/lib/precio-utils.ts'), 'utf8')
const desde = src.indexOf('export function precioDelFeed')
if (desde === -1) { console.error('🔴 No se encontró precioDelFeed en precio-utils.ts'); process.exit(1) }
const jsFn = src.slice(desde, src.indexOf('\n}', desde) + 2)
  .replace('export function', 'function')
  .replace(/:\s*number \| null \| undefined/g, '')
  .replace(/:\s*string \| null \| undefined/g, '')
  .replace(/\)\s*:\s*number \| null\s*\{/, ') {')
const TC_OFICIAL = 6.96
// eslint-disable-next-line no-new-func
const precioDelFeed = new Function('TC_OFICIAL', `${jsFn}\nreturn precioDelFeed`)(TC_OFICIAL)

// ── Datos reales ─────────────────────────────────────────────────────────────
const { data: cfg } = await sb.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single()
const tc = parseFloat(cfg?.valor)
if (!tc) { console.error('🔴 Sin TC del día en config_global'); process.exit(1) }

// `precio_norm` = lo que la BD calcula y el cliente ve. Es la fuente de verdad.
const { data: feed, error: e1 } = await sb
  .from('v_mercado_venta_shadow')
  .select('id, precio_norm')
  .limit(2000)
if (e1) { console.error('🔴', e1.message); process.exit(1) }

const { data: crudos, error: e2 } = await sb
  .from('propiedades_v2')
  .select('id, precio_usd, tipo_cambio_detectado')
  .eq('tipo_operacion', 'venta')
  .gt('precio_usd', 0)
  .limit(2000)
if (e2) { console.error('🔴', e2.message); process.exit(1) }

const crudoPorId = new Map(crudos.map(p => [p.id, p]))

const porTag = new Map()
let comparadas = 0
for (const f of feed) {
  const p = crudoPorId.get(f.id)
  if (!p) continue
  comparadas++
  const tag = p.tipo_cambio_detectado || '(sin tag)'
  const delFeed = Math.round(Number(f.precio_norm))
  const delAdmin = precioDelFeed(Number(p.precio_usd), p.tipo_cambio_detectado, tc)
  // tolerancia 0,5%: la BD redondea a 2 decimales y el JS a entero
  const difiere = delAdmin === null || Math.abs(delAdmin - delFeed) > Math.max(2, delFeed * 0.005)
  const e = porTag.get(tag) || { n: 0, difieren: 0, sumaAdmin: 0, sumaFeed: 0, ejemplo: null }
  e.n++; e.sumaAdmin += delAdmin ?? 0; e.sumaFeed += delFeed
  if (difiere) { e.difieren++; e.ejemplo = e.ejemplo || { id: f.id, crudo: p.precio_usd, delAdmin, delFeed } }
  porTag.set(tag, e)
}

if (!comparadas) {
  console.error('\n🔴 EL EVAL ESTÁ CIEGO: no se cruzó ni una propiedad.')
  console.error('   Sin filas que comparar, el verde no significaría nada.\n')
  process.exit(1)
}

console.log(`\n💱 TC del día ${tc} · ${comparadas} propiedades cruzadas (feed ↔ tabla)\n`)
let fallas = 0
for (const [tag, e] of [...porTag.entries()].sort((a, b) => b[1].n - a[1].n)) {
  const ok = e.difieren === 0
  if (!ok) fallas++
  console.log(`${ok ? '✅' : '🔴'} ${tag.padEnd(18)} ${String(e.n).padStart(4)} props` +
    (ok ? '   el admin dice lo mismo que el feed'
        : `   ${e.difieren} DIFIEREN — admin $${Math.round(e.sumaAdmin / e.n).toLocaleString('en-US')} vs feed $${Math.round(e.sumaFeed / e.n).toLocaleString('en-US')}`))
  if (!ok) console.log(`     ej. #${e.ejemplo.id}: crudo ${e.ejemplo.crudo} → admin ${e.ejemplo.delAdmin} · feed ${e.ejemplo.delFeed}`)
}

if (fallas) {
  console.log('\n🔴 `precioDelFeed` NO coincide con lo que la BD publica.')
  console.log('   El admin le muestra al founder un precio distinto del que ve el cliente.')
  console.log('   Comparar contra la función REAL (pg_get_functiondef), no contra el archivo de migración.\n')
  process.exit(1)
}
console.log('\n✅ El admin y el feed dicen el mismo número en todos los tags.\n')
