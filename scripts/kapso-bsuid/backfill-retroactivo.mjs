#!/usr/bin/env node
// =============================================================================
// backfill-retroactivo.mjs — mapear teléfono ↔ BSUID de los contactos QUE YA EXISTEN
// =============================================================================
// EL PROBLEMA: Meta está sacando el teléfono del payload de WhatsApp. Quien adopta
// un username (@nombre) deja de mandarlo — y ahí el mapeo con lo que ya teníamos
// guardado ya no se puede construir. Ver lab-kapso/BRIEFING_SICI_BSUID.md (D31).
//
// POR QUÉ ESTE SCRIPT: el webhook (mig 318) guarda el BSUID de cada evento NUEVO,
// pero eso obliga a esperar a que cada persona vuelva a escribir. La API de Kapso
// ya tiene el par teléfono↔BSUID de TODAS las conversaciones existentes → se puede
// mapear todo de una, hoy, mientras la ventana sigue abierta.
//
// 🔴 READ-ONLY. No escribe en ninguna base: lee la API de Kapso, cruza contra
// `simon_contactos` y ESCRIBE UN ARCHIVO .sql para que lo aplique el humano en
// Supabase (patrón canónico de SICI — el MCP es readonly).
//
// USO:
//   node scripts/kapso-bsuid/backfill-retroactivo.mjs
//   node scripts/kapso-bsuid/backfill-retroactivo.mjs --limit 200
//
// Necesita, en el entorno o en un .env de los que busca abajo:
//   KAPSO_API_KEY            (lab-kapso/.env)
//   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (simon-mvp/.env.local)
// =============================================================================

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')          // …/sici
const KAPSO_BASE = 'https://app.kapso.ai'
const PORTFOLIO_ID = process.env.META_PORTFOLIO_ID || '2073772363472695'  // "Simón", lab-kapso D30

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const LIMITE = Number(arg('limit', '500'))

// -----------------------------------------------------------------------------
// Credenciales: del entorno, o de los .env conocidos (sin imprimirlas nunca)
// -----------------------------------------------------------------------------
function leerEnv(archivo) {
  try {
    return Object.fromEntries(
      fs.readFileSync(archivo, 'utf8').split(/\r?\n/)
        .filter(l => l && !l.trimStart().startsWith('#') && l.includes('='))
        .map(l => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
        })
    )
  } catch { return {} }
}

// La key de Kapso vive en el repo hermano `lab-kapso`. Se lo busca subiendo por los
// ancestros en vez de asumir `../lab-kapso`: corriendo desde un worktree de git el
// repo está varios niveles adentro (.claude/worktrees/<rama>/) y el hermano no
// estaría donde parece.
function buscarLabKapso() {
  let dir = RAIZ
  for (let i = 0; i < 6; i++) {
    const cand = path.join(dir, 'lab-kapso', '.env')
    if (fs.existsSync(cand)) return cand
    const padre = path.dirname(dir)
    if (padre === dir) break
    dir = padre
  }
  return path.resolve(RAIZ, '..', 'lab-kapso', '.env')
}

const ENVS = [
  buscarLabKapso(),
  path.resolve(RAIZ, 'simon-mvp', '.env.local'),
  path.resolve(RAIZ, '.env'),
]
const env = Object.assign({}, ...ENVS.map(leerEnv), process.env)

const KAPSO_KEY = env.KAPSO_API_KEY
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY

function faltan() {
  const f = []
  if (!KAPSO_KEY) f.push('KAPSO_API_KEY')
  if (!SB_URL) f.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!SB_KEY) f.push('SUPABASE_SERVICE_ROLE_KEY')
  return f
}

// -----------------------------------------------------------------------------
// Espejo de simon-mvp/src/lib/phone.ts — el TS manda; esto solo cruza.
// -----------------------------------------------------------------------------
function normalizarTelefono(input) {
  if (!input || typeof input !== 'string') return null
  const limpio = input.replace(/[\s\-()]/g, '')
  let n = limpio
  if (!limpio.startsWith('+')) {
    if (limpio.startsWith('591')) n = '+' + limpio
    else if (/^[67]/.test(limpio)) n = '+591' + limpio
    else return null
  }
  return /^\+591[67]\d{7}$/.test(n) ? n : null
}

const RE_BSUID = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9_-]{1,160}$/
const esBsuid = v => typeof v === 'string' && RE_BSUID.test(v.trim())

// SQL literal: comilla simple escapada, o NULL. Los valores vienen de una API
// externa — nunca se interpolan crudos.
const lit = v => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

// -----------------------------------------------------------------------------
async function kapso(ruta) {
  const r = await fetch(KAPSO_BASE + ruta, {
    headers: { 'X-API-Key': KAPSO_KEY, 'Content-Type': 'application/json' },
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Kapso ${ruta} → ${r.status}: ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : {}
}

async function supabase(ruta) {
  const r = await fetch(`${SB_URL}/rest/v1/${ruta}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${ruta} → ${r.status}: ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : []
}

// -----------------------------------------------------------------------------
async function main() {
  const f = faltan()
  if (f.length) {
    console.error(`❌ Faltan credenciales: ${f.join(', ')}`)
    console.error(`   Buscadas en el entorno y en:\n   - ${ENVS.join('\n   - ')}`)
    process.exit(1)
  }

  console.log('📞 Leyendo conversaciones de Kapso…')
  // La API tope 100 por página (limit=500 devuelve 400) y pagina por cursor:
  // `paging.next` es null cuando no hay más. Sin este bucle, un día con más de 100
  // conversaciones dejaría gente afuera del mapeo sin decir nada.
  const conversaciones = []
  let cursor = null
  while (conversaciones.length < LIMITE) {
    const pagina = Math.min(100, LIMITE - conversaciones.length)
    const q = `?limit=${pagina}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`
    const res = await kapso(`/platform/v1/whatsapp/conversations${q}`)
    conversaciones.push(...(res?.data ?? []))
    if (!res?.paging?.next) break
    cursor = res?.paging?.cursors?.after
    if (!cursor) break
  }
  console.log(`   ${conversaciones.length} conversación(es)`)

  console.log('🗂️  Leyendo contactos de SICI…')
  // La primera vez que se corre esto, la mig 318 puede no estar aplicada todavía:
  // en ese caso no hay columnas nuevas que leer y TODO está por mapear. Se sigue
  // adelante generando el SQL (que es justo lo que hay que aplicar después), en vez
  // de morir con un error de Postgres que no le dice nada a nadie.
  let preMigracion = false
  let contactos
  try {
    contactos = await supabase(
      'simon_contactos?select=id,telefono,business_scoped_user_id,username,nombre'
    )
  } catch (e) {
    if (!/42703|does not exist/.test(e.message)) throw e
    preMigracion = true
    contactos = await supabase('simon_contactos?select=id,telefono,nombre')
    console.log('   ⚠️  La migración 318 todavía no está aplicada (faltan las columnas).')
    console.log('      Se genera el SQL igual: aplicá primero la 318 y después este archivo.')
  }
  console.log(`   ${contactos.length} contacto(s)`)

  const contactoPorTel = new Map()
  for (const c of contactos) if (c.telefono) contactoPorTel.set(c.telefono, c)

  // ---------------------------------------------------------------------------
  // Agrupar por PERSONA, no por conversación.
  //
  // 🔴 Kapso abre una conversación nueva por sesión, y el BSUID CAMBIA con el
  // tiempo: el número del founder tiene 22 conversaciones con 3 BSUID distintos
  // (el tercero arranca el 28-jul-2026, el día de la reconexión de coexistencia).
  // Quedarse con "el BSUID de la conversación" guardaría uno al azar; hay que
  // guardar TODOS y saber cuál es el vigente por fecha.
  // ---------------------------------------------------------------------------
  const personas = new Map()   // telefono → { alias: Map<bsuid, {desde, hasta, pnId}>, username, parent }
  const sinBsuid = []
  const sinTelefono = []

  for (const conv of conversaciones) {
    const tel = normalizarTelefono(conv.phone_number)
    const bsuid = esBsuid(conv.business_scoped_user_id) ? conv.business_scoped_user_id.trim() : null
    if (!bsuid) { sinBsuid.push(conv.id); continue }
    if (!tel) { sinTelefono.push({ crudo: conv.phone_number, bsuid }); continue }

    if (!personas.has(tel)) personas.set(tel, { alias: new Map(), username: null, parent: null })
    const p = personas.get(tel)

    const desde = conv.created_at ?? conv.last_active_at ?? null
    const hasta = conv.last_active_at ?? conv.created_at ?? null
    const previo = p.alias.get(bsuid)
    if (!previo) {
      p.alias.set(bsuid, { desde, hasta, pnId: conv.phone_number_id ?? null })
    } else {
      if (desde && (!previo.desde || desde < previo.desde)) previo.desde = desde
      if (hasta && (!previo.hasta || hasta > previo.hasta)) previo.hasta = hasta
      previo.pnId ??= conv.phone_number_id ?? null
    }
    p.username ??= conv.username?.trim() || null
    p.parent ??= esBsuid(conv.parent_business_scoped_user_id)
      ? conv.parent_business_scoped_user_id.trim() : null
  }

  const actualizar = []   // contacto que existe en SICI y hay que mapear
  const sinContacto = []  // hay conversación en Kapso pero no hay contacto en SICI
  let yaOk = 0

  for (const [tel, p] of personas) {
    const contacto = contactoPorTel.get(tel)
    const alias = [...p.alias.entries()]
      .map(([bsuid, d]) => ({ bsuid, ...d }))
      .sort((a, b) => String(a.hasta).localeCompare(String(b.hasta)))
    const vigente = alias[alias.length - 1]

    if (!contacto) {
      sinContacto.push({ tel, bsuid: vigente.bsuid, ultima: String(vigente.hasta).slice(0, 10) })
      continue
    }
    if (contacto.business_scoped_user_id === vigente.bsuid && contacto.username === p.username) {
      // El vigente ya está, pero los alias viejos pueden faltar igual → no se saltea.
      yaOk++
    }

    actualizar.push({
      id: contacto.id,
      telefono: tel,
      vigente,
      alias,
      username: p.username,
      parent: p.parent,
      pisa: contacto.business_scoped_user_id && contacto.business_scoped_user_id !== vigente.bsuid
        ? contacto.business_scoped_user_id : null,
    })
  }

  // ---------------------------------------------------------------------------
  const totalAlias = actualizar.reduce((a, x) => a + x.alias.length, 0)
  const conHistoria = actualizar.filter(a => a.alias.length > 1)

  console.log('\n── Resumen ──────────────────────────────────────────────')
  console.log(`  personas a mapear ......... ${actualizar.length}`)
  console.log(`  identificadores en total .. ${totalAlias}  (el vigente + los viejos)`)
  console.log(`  con el vigente ya puesto .. ${yaOk}`)
  console.log(`  sin contacto en SICI ...... ${sinContacto.length}`)
  console.log(`  conversación sin BSUID .... ${sinBsuid.length}`)
  console.log(`  teléfono no boliviano ..... ${sinTelefono.length}`)

  if (conHistoria.length) {
    console.log(`\n  🔴 ${conHistoria.length} persona(s) con MÁS DE UN BSUID a lo largo del tiempo:`)
    for (const c of conHistoria) {
      console.log(`     ${c.telefono}`)
      for (const a of c.alias) {
        const marca = a === c.vigente ? '← vigente' : ''
        console.log(`       ${String(a.desde).slice(0, 10)} → ${String(a.hasta).slice(0, 10)}  ${a.bsuid} ${marca}`)
      }
    }
    console.log('     Se guardan TODOS: si mañana llega un evento con uno viejo, la')
    console.log('     persona se reconoce en vez de duplicarse.')
  }
  if (sinContacto.length) {
    // El ingest del CRM arrancó el 24-jul-2026 (mig 292 + webhook). Lo anterior no
    // está y es esperable. Lo POSTERIOR no: sería gente que escribió y el CRM no
    // registró — el agujero que estamos tapando, ya sangrando.
    const INGEST_DESDE = '2026-07-24'
    const posteriores = sinContacto.filter(s => s.ultima >= INGEST_DESDE)
    console.log(`\n  ℹ️  ${sinContacto.length} persona(s) con conversación en Kapso y sin contacto en SICI.`)
    console.log(`     ${sinContacto.length - posteriores.length} son anteriores al ingest (${INGEST_DESDE}): esperable.`)
    if (posteriores.length) {
      console.log(`\n     🔴 ${posteriores.length} son POSTERIORES — escribieron y el CRM no las registró:`)
      for (const s of posteriores) console.log(`        ${s.tel}   última actividad ${s.ultima}`)
    }
    console.log('\n     NO se crean acá: este script solo mapea lo que ya existe.')
  }

  if (!actualizar.length) {
    console.log('\n✅ Nada que aplicar.')
    return
  }

  // ---------------------------------------------------------------------------
  const salida = path.join(AQUI, 'output')
  fs.mkdirSync(salida, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const archivo = path.join(salida, `backfill-bsuid-${stamp}.sql`)

  const sql = [
    '-- =============================================================================',
    `-- Backfill retroactivo teléfono ↔ BSUID — generado el ${new Date().toISOString()}`,
    '-- =============================================================================',
    '-- Origen: API de Kapso (/platform/v1/whatsapp/conversations), cruzado por',
    '-- teléfono normalizado contra simon_contactos. Requiere la mig 318 aplicada.',
    preMigracion
      ? '-- ⚠️ GENERADO ANTES DE APLICAR LA MIG 318: aplicá la 318 PRIMERO, o esto falla.'
      : '-- La mig 318 ya estaba aplicada cuando se generó este archivo.',
    '--',
    '-- 🔴 IDEMPOTENTE Y SIN PISAR LO MÁS NUEVO. El UPDATE del BSUID vigente solo se',
    '-- aplica si lo guardado es más viejo que lo que dice Kapso (`bsuid_visto_at <`):',
    '-- si entre que se generó este archivo y que se aplica el webhook ya vio uno más',
    '-- reciente, gana el webhook. Correrlo dos veces no cambia nada la segunda.',
    '--',
    '-- Los alias van con ON CONFLICT que NO mueve `contacto_id`: si un identificador',
    '-- ya está asignado a otra persona, se deja como está y se revisa a mano — mover',
    '-- historiales en silencio es peor que no mover nada.',
    '--',
    `-- Personas a mapear: ${actualizar.length} · identificadores en total: ${totalAlias}`,
    conHistoria.length
      ? `-- 🔴 ${conHistoria.length} persona(s) con más de un BSUID (ver la salida del script).`
      : '-- Ninguna persona cambió de BSUID.',
    '-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).',
    '-- =============================================================================',
    '',
    'BEGIN;',
    '',
    ...actualizar.flatMap(a => [
      `-- ${a.telefono}${a.pisa ? `   ⚠️ tenía ${a.pisa}` : ''}${a.alias.length > 1 ? `   (${a.alias.length} identificadores)` : ''}`,
      'UPDATE public.simon_contactos SET',
      `  business_scoped_user_id        = ${lit(a.vigente.bsuid)},`,
      `  parent_business_scoped_user_id = COALESCE(${lit(a.parent)}, parent_business_scoped_user_id),`,
      `  username                       = COALESCE(${lit(a.username)}, username),`,
      `  meta_portfolio_id              = ${lit(PORTFOLIO_ID)},`,
      `  phone_number_id                = COALESCE(${lit(a.vigente.pnId)}, phone_number_id),`,
      `  bsuid_visto_at                 = ${lit(a.vigente.hasta)},`,
      '  updated_at                     = NOW()',
      `WHERE id = ${lit(a.id)}`,
      `  AND (bsuid_visto_at IS NULL OR bsuid_visto_at < ${lit(a.vigente.hasta)});`,
      '',
      'INSERT INTO public.simon_contacto_bsuids',
      '  (contacto_id, meta_portfolio_id, business_scoped_user_id, phone_number_id,',
      '   origen, primero_visto_at, ultimo_visto_at) VALUES',
      a.alias.map(x =>
        `  (${lit(a.id)}, ${lit(PORTFOLIO_ID)}, ${lit(x.bsuid)}, ${lit(x.pnId)}, ` +
        `'backfill_api', ${lit(x.desde)}, ${lit(x.hasta)})`
      ).join(',\n'),
      'ON CONFLICT (meta_portfolio_id, business_scoped_user_id) DO UPDATE SET',
      '  primero_visto_at = LEAST(simon_contacto_bsuids.primero_visto_at, EXCLUDED.primero_visto_at),',
      '  ultimo_visto_at  = GREATEST(simon_contacto_bsuids.ultimo_visto_at, EXCLUDED.ultimo_visto_at),',
      '  phone_number_id  = COALESCE(simon_contacto_bsuids.phone_number_id, EXCLUDED.phone_number_id);',
      '',
    ]),
    'COMMIT;',
    '',
    '-- Verificación:',
    '--   SELECT * FROM public.v_bsuid_cobertura;',
    '--   -- Nadie debería haber quedado con un identificador de otra persona:',
    '--   SELECT b.business_scoped_user_id, COUNT(DISTINCT b.contacto_id)',
    '--   FROM public.simon_contacto_bsuids b GROUP BY 1 HAVING COUNT(DISTINCT b.contacto_id) > 1;',
    '',
  ].join('\n')

  fs.writeFileSync(archivo, sql, 'utf8')
  console.log(`\n📄 SQL generado: ${path.relative(RAIZ, archivo)}`)
  console.log('   Revisalo y aplicalo desde Supabase UI o psql.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
