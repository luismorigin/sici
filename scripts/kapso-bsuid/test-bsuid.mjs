#!/usr/bin/env node
// =============================================================================
// test-bsuid.mjs — el escenario que rompe integraciones, reproducido
// =============================================================================
// "Agarrá un payload real que ya recibiste, borrale wa_id y from, y reinyectalo."
//   — lab-kapso/BRIEFING_SICI_BSUID.md §7
//
// Ese es exactamente el caso: cuando alguien adopta un username de WhatsApp, Meta
// deja de mandar el teléfono — no vacío, no en null: NO ESTÁ. Antes del fix el
// handler devolvía null y el mensaje no entraba nunca al CRM, sin log ni error.
//
// DOS MODOS:
//   node scripts/kapso-bsuid/test-bsuid.mjs           → unitario, $0, sin red ni BD
//   node scripts/kapso-bsuid/test-bsuid.mjs --e2e     → además POSTea al webhook
//                                                       real (necesita `npm run dev`)
//
// El modo unitario compila el módulo con el tsc que ya está en el proyecto: no hay
// runner de tests en simon-mvp y no se agrega uno solo para esto.
// =============================================================================

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
const MVP = path.join(RAIZ, 'simon-mvp')
const E2E = process.argv.includes('--e2e')
const URL_BASE = process.env.WEBHOOK_URL || 'http://localhost:3000'

let ok = 0
let fallos = 0
function verificar(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✅ ${nombre}`) }
  else { fallos++; console.log(`  ❌ ${nombre}${detalle ? `\n       ${detalle}` : ''}`) }
}

// -----------------------------------------------------------------------------
// Compilar el módulo puro a CommonJS en un temporal e importarlo.
// A CJS y no a ESM a propósito: TypeScript emite los imports sin extensión y el
// ESM de Node exige la extensión completa, así que el módulo no resolvería.
// -----------------------------------------------------------------------------
function cargarModulo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bsuid-'))
  const tsc = path.join(MVP, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!fs.existsSync(tsc)) {
    console.error('❌ Falta TypeScript. Correr `npm install` en simon-mvp/.')
    process.exit(1)
  }
  execFileSync(process.execPath, [
    tsc,
    path.join(MVP, 'src', 'lib', 'kapso-identidad.ts'),
    path.join(MVP, 'src', 'lib', 'phone.ts'),
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck',
    // Sin tsconfig, tsc busca los @types desde el directorio actual y no los
    // encuentra: el módulo lee `process.env` y sin esto falla por el tipo.
    '--typeRoots', path.join(MVP, 'node_modules', '@types'), '--types', 'node',
  ], { stdio: 'inherit' })
  return createRequire(import.meta.url)(path.join(tmp, 'kapso-identidad.js'))
}

// -----------------------------------------------------------------------------
// Un payload REAL de Kapso (whatsapp.message.received, formato v2) con los
// identificadores nuevos que hoy llegan junto al teléfono.
// -----------------------------------------------------------------------------
const BSUID = 'BO.2453994595121663'

function payloadReal() {
  return {
    message: {
      id: 'wamid.PRUEBA_BSUID_' + '0'.repeat(8),
      timestamp: '1786000000',
      type: 'text',
      text: { body: 'Hola Simón, busco depto en Equipetrol' },
      from_user_id: BSUID,
      username: null,
      kapso: { direction: 'inbound', content: 'Hola Simón, busco depto en Equipetrol' },
    },
    conversation: {
      id: 'conv_prueba_bsuid',
      phone_number: '59176308808',
      phone_number_id: '998245303375051',
      business_scoped_user_id: BSUID,
      parent_business_scoped_user_id: null,
      username: null,
      kapso: { contact_name: 'Prueba BSUID' },
    },
    phone_number_id: '998245303375051',
  }
}

/** Lo que manda Meta cuando la persona adoptó un username: el teléfono NO ESTÁ. */
function payloadSinTelefono() {
  const p = payloadReal()
  delete p.conversation.phone_number     // ← wa_id
  p.conversation.username = 'lucho'
  p.message.username = 'lucho'
  p.message.id = 'wamid.PRUEBA_BSUID_SIN_TELEFONO'
  return p
}

// -----------------------------------------------------------------------------
function pruebasUnitarias(M) {
  console.log('\n🧪 Unitario — el payload sin teléfono ya no se descarta\n')

  // 1. El caso de hoy: llegan los dos identificadores.
  const conTel = M.normalizarEvento(payloadReal())
  verificar('con teléfono + BSUID: entra', conTel.ok)
  verificar('…y guarda el BSUID (la ventana de mapeo)', conTel.ok && conTel.mensaje.bsuid === BSUID,
    `bsuid = ${conTel.ok ? conTel.mensaje.bsuid : '(descartado)'}`)
  verificar('…y el teléfono normalizado', conTel.ok && conTel.mensaje.telefono === '+59176308808')

  // 2. 🎯 EL ESCENARIO DEL BRIEFING: sin wa_id ni from.
  const sinTel = M.normalizarEvento(payloadSinTelefono())
  verificar('SIN teléfono: entra igual (antes devolvía null)', sinTel.ok,
    sinTel.ok ? '' : `motivo = ${sinTel.motivo}`)
  verificar('…identificado por BSUID', sinTel.ok && sinTel.mensaje.bsuid === BSUID)
  verificar('…con el teléfono en null, no inventado', sinTel.ok && sinTel.mensaje.telefono === null)
  verificar('…y el username guardado', sinTel.ok && sinTel.mensaje.username === 'lucho')

  // 3. La identidad es el PAR, y se agrupa por BSUID cuando lo hay.
  verificar('la clave de identidad usa el BSUID, no el teléfono',
    conTel.ok && M.claveIdentidad(conTel.mensaje).startsWith('b:'))
  verificar('el portfolio viaja con el BSUID',
    conTel.ok && conTel.mensaje.portfolioId === M.META_PORTFOLIO_ID)

  // 4. Lo que NO tiene que entrar — y por qué motivo (el motivo se guarda).
  const sinNada = M.normalizarEvento({ message: { id: 'wamid.X' }, conversation: {} })
  verificar('sin teléfono ni BSUID: se descarta con motivo',
    !sinNada.ok && sinNada.motivo === 'sin_identidad')

  const extranjero = M.normalizarEvento({
    message: { id: 'wamid.Y' },
    conversation: { phone_number: '+5491112345678', business_scoped_user_id: 'AR.123456' },
  })
  verificar('teléfono de otro país: se sigue descartando', !extranjero.ok && extranjero.motivo === 'fuera_de_bolivia')

  const soloBsuidExtranjero = M.normalizarEvento({
    message: { id: 'wamid.Z' },
    conversation: { business_scoped_user_id: 'GB.1205769689292003' },
  })
  verificar('sin teléfono y BSUID de otro país: se descarta por el ISO del BSUID',
    !soloBsuidExtranjero.ok && soloBsuidExtranjero.motivo === 'fuera_de_bolivia')

  const sinWamid = M.normalizarEvento({ conversation: { business_scoped_user_id: BSUID } })
  verificar('sin wamid: se descarta (no hay idempotencia posible)',
    !sinWamid.ok && sinWamid.motivo === 'sin_wamid')

  // 5. Un BSUID mal formado es peor que ninguno: no se guarda.
  const basura = M.normalizarEvento({
    message: { id: 'wamid.W' },
    conversation: { phone_number: '59176308808', business_scoped_user_id: 'esto no es un bsuid' },
  })
  verificar('BSUID mal formado: entra por teléfono pero no se guarda basura',
    basura.ok && basura.mensaje.bsuid === null)

  // 6. En un mensaje SALIENTE el BSUID de la persona es el DESTINATARIO.
  const saliente = M.normalizarEvento({
    message: {
      id: 'wamid.OUT', to_user_id: BSUID,
      kapso: { direction: 'outbound', content: 'Te paso las opciones' },
    },
    conversation: { phone_number: '59176308808' },
  })
  verificar('saliente: toma el BSUID del destinatario, no del negocio',
    saliente.ok && saliente.mensaje.bsuid === BSUID && saliente.mensaje.direccion === 'out')

  // 7. Cambio de BSUID (ya pasó de verdad: 3 veces con el mismo número).
  const cambio = M.detectarCambioDeBsuid({
    previous_business_scoped_user_id: 'BO.2453994595121663',
    new_business_scoped_user_id: 'BO.1490485676452856',
  })
  verificar('detecta el aviso de cambio de BSUID',
    cambio && cambio.anterior === 'BO.2453994595121663' && cambio.nuevo === 'BO.1490485676452856')
  verificar('un mensaje normal NO se confunde con un cambio de BSUID',
    M.detectarCambioDeBsuid(payloadReal()) === null)
}

// -----------------------------------------------------------------------------
async function pruebaE2E() {
  console.log('\n🌐 End-to-end — reinyectando el payload contra el webhook real\n')

  const secreto = leerSecreto()
  if (!secreto) {
    console.log('  ⏭️  Sin KAPSO_WEBHOOK_SECRET: no se puede firmar. Salteado.')
    return
  }

  const cuerpo = JSON.stringify(payloadSinTelefono())
  const firma = crypto.createHmac('sha256', secreto).update(Buffer.from(cuerpo, 'utf8')).digest('hex')

  let r
  try {
    r = await fetch(`${URL_BASE}/api/kapso/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': firma,
        'X-Webhook-Event': 'whatsapp.message.received',
      },
      body: cuerpo,
    })
  } catch (e) {
    console.log(`  ⏭️  No hay servidor en ${URL_BASE} (${e.message}). Correr \`npm run dev\`.`)
    return
  }

  const texto = await r.text()
  verificar(`el webhook responde 200 (dio ${r.status})`, r.status === 200, texto.slice(0, 200))
  let json = {}
  try { json = JSON.parse(texto) } catch {}
  verificar('guardó el mensaje sin teléfono', json.guardados >= 1,
    `respuesta: ${texto.slice(0, 200)}`)

  console.log('\n  Verificar en la base (y limpiar después):')
  console.log(`    SELECT id, telefono, username, business_scoped_user_id`)
  console.log(`      FROM public.simon_contactos WHERE business_scoped_user_id = '${BSUID}';`)
  console.log(`    DELETE FROM public.simon_mensajes WHERE kapso_message_id LIKE 'wamid.PRUEBA_BSUID%';`)
}

function leerSecreto() {
  if (process.env.KAPSO_WEBHOOK_SECRET) return process.env.KAPSO_WEBHOOK_SECRET
  try {
    const env = fs.readFileSync(path.join(MVP, '.env.local'), 'utf8')
    const m = /^KAPSO_WEBHOOK_SECRET\s*=\s*(.+)$/m.exec(env)
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
  } catch { return null }
}

// -----------------------------------------------------------------------------
console.log('═══ BSUID · el CRM tiene que reconocer a quien no manda teléfono ═══')
pruebasUnitarias(cargarModulo())
if (E2E) await pruebaE2E()

console.log(`\n── ${ok} ok · ${fallos} fallo(s) ──`)
if (!E2E) console.log('   (agregar --e2e para reinyectar el payload contra el webhook real)')
process.exit(fallos ? 1 : 0)
