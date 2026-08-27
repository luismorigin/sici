// ============================================================================
// /api/cron/seguimiento-shortlists — le reescribe a quien recibió una selección
// y no volvió
// ----------------------------------------------------------------------------
// Lo llama `disparar_seguimiento_shortlists()` desde pg_cron, cada hora, dentro de
// la franja 9–21 Bolivia (migs 338-341). Por cada persona que califica manda UN
// mensaje de WhatsApp y registra el intento.
//
// 🔴 EL BODY NO SE LEE, Y ESO ES EL DISEÑO, NO UN OLVIDO.
// La primera versión del pedido mandaba la lista de destinatarios en el POST y este
// endpoint la recorría. Con eso, quien consiguiera el token podía inyectar números
// arbitrarios y **hacer que Simón le escriba a cualquiera con nuestro número**. Acá
// la lista se consulta a la base: aunque alguien dispare el endpoint, lo peor que
// logra es adelantar un seguimiento que ya correspondía.
//
// ----------------------------------------------------------------------------
// 🔴 POR QUÉ EL TEXTO SE ESCRIBE ACÁ Y NO LO REDACTA EL BOT
//
// Hasta el 26-ago-2026 esto inyectaba una marca (`seguimiento:v1`) en la ejecución
// del workflow y el agente redactaba. **No funciona**, y no por un parámetro mal
// puesto: lab-kapso midió que pasado cierto punto el agente se despierta, mira y se
// vuelve a dormir sin escribir. La variable es la EDAD DE LA EJECUCIÓN, no la
// inactividad de la conversación:
//
//        1,1 h de vida de la ejecución    → salió
//        5,2 h  (¡con 30 min de quietud!)  → nada
//       15,9 h · 18,1 h                    → nada
//
// Este seguimiento sale a las 9 h por diseño. Su caso normal es siempre el caso que
// falla — el destinatario es, literalmente, quien se fue y no volvió. El primer día
// que corrió solo, dos personas quedaron marcadas como contactadas sin haber
// recibido nada, y como el marcado impide el reenvío, se perdieron los dos.
//
// 🔑 Y NO HACE FALTA UNA PLANTILLA DE META. Las plantillas son para escribir FUERA
// de la ventana de 24 h; esto sale a las 9 h. Medido sobre 47 personas con
// historial: **0 tienen la ventana cerrada a las 9 h**, y el máximo entre el último
// mensaje de la persona y su shortlist es de 2,2 minutos — la selección se arma
// mientras la persona está hablando. Se manda texto libre por el proxy de Kapso, que
// no toca ninguna ejecución: no hay sesión que despertar.
//
// 🔴 UN 2xx NO PRUEBA QUE EL MENSAJE LLEGÓ. Acá sólo se registran INTENTOS. Quien
// declara el envío es `confirmar_seguimientos_enviados()` (mig 340), que exige que
// aparezca el mensaje SALIENTE. La advertencia "no prueba entrega" ya estaba escrita
// en este archivo el día que falló: un comentario no cambia lo que el programa hace,
// por eso ahora la garantía es estructural.
//
// Ver: sql/migrations/341_seguimiento_mensaje_directo.sql
// ============================================================================
import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSupabase } from '@/lib/supabase-server'

// 🔴 `api.kapso.ai`, NO `app.kapso.ai`. Son dos hosts distintos: el segundo sirve
// `/platform/v1/…` y para estas rutas devuelve un 404 en HTML, que se lee como "la
// ruta no existe" cuando en realidad es "el host es otro". A lab-kapso le costó un
// rato, y su propio script oficial arma la URL con el host equivocado.
const KAPSO_MENSAJES = 'https://api.kapso.ai/meta/whatsapp/v24.0'
const PHONE_NUMBER_ID = '998245303375051'   // el número de Simón

/**
 * 🔑 Vercel debe poder TERMINAR aunque pg_net ya haya dejado de escuchar (30 s,
 * mig 339). Va por encima a propósito: si una corrida se pasa, lo que se pierde es
 * el registro de la respuesta, no el trabajo. Al revés — Vercel cortando primero —
 * dejaría gente con el mensaje mandado y sin registrar.
 */
export const config = { maxDuration: 60 }

/** Una persona que califica. El teléfono llega desde la base, nunca desde el body. */
interface Candidata {
  hash: string
  conversation_id: string | null
  telefono: string
  primer_nombre: string | null
  horas_desde: number
}

type Resultado = { hash: string; ok: boolean; motivo?: string }

/**
 * El texto del seguimiento.
 *
 * 🔑 Las decisiones, porque cada una responde a algo:
 * · **El link va incluido.** El 8 % que nunca lo abrió lo tiene a mano, y el 92 %
 *   que sí puede volver sin escarbar el historial.
 * · **"Te dejo de nuevo" y no "¿viste la selección?"** — no sabemos si la vio, y dar
 *   eso por sentado es lo que el prompt del bot tiene prohibido.
 * · **"Decime qué cambiarías" es el corazón.** No alcanza con preguntar si sirvió:
 *   hay que enseñar el mecanismo. La medición lo respalda — 0 de 47 personas pidió
 *   una segunda selección al día siguiente. No es falta de interés: nadie les dijo
 *   que se podía.
 * · **Sin nada que empuje.** Un mensaje. Si no contesta, no se insiste nunca más.
 * · **Sólo el primer nombre** (lo resuelve la función SQL). `cliente_nombre` guarda
 *   lo que la persona escribió, y ahí hay "Israel Torres" y "Carlos Alvarez
 *   71655553". "Hola Israel Torres" suena a carta del banco.
 */
function componerMensaje(primerNombre: string | null, hash: string): string {
  const saludo = primerNombre ? `Hola ${primerNombre}, te` : 'Hola, te'
  return `${saludo} dejo de nuevo la selección que te armé:\n` +
    `simonbo.com/b/${hash}\n\n` +
    `¿Alguna te sirvió? Si ninguna te cierra, decime qué cambiarías ` +
    `—más grande, otra zona, otro precio— y te armo una selección nueva.`
}

/**
 * Comparación en tiempo constante: un `===` sobre strings corta en el primer byte
 * distinto, y esa diferencia de tiempo es medible. Con un token de 64 hex no es un
 * ataque práctico, pero cuesta cuatro líneas hacerlo bien.
 */
function tokenValido(recibido: string | undefined, esperado: string): boolean {
  if (!recibido || recibido.length !== esperado.length) return false
  let dif = 0
  for (let i = 0; i < recibido.length; i++) dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i)
  return dif === 0
}

/** Error del envío, con el cuerpo crudo de Kapso adentro para poder leerlo después. */
class EnvioError extends Error {
  constructor(readonly status: number, readonly cuerpo: string) {
    super(`envío HTTP ${status}: ${cuerpo.slice(0, 300)}`)
  }
  /** 429 y 5xx son transitorios: se reintentan sin quemar el turno. */
  get esTransitorio(): boolean { return this.status === 429 || this.status >= 500 }
}

/**
 * Manda el mensaje por el proxy de Kapso sobre la Cloud API de Meta.
 *
 * El payload tiene la forma de Meta, pero la autenticación es la `X-API-Key` de
 * Kapso: no hay token de Meta que conseguir ni custodiar. El mensaje queda
 * registrado en la conversación como saliente —verificado por lab-kapso contra su
 * API de mensajes—, así que el webhook nos lo trae, `confirmar_seguimientos_enviados()`
 * lo ve, y el bot lo lee como historial cuando la persona conteste.
 */
async function enviarMensaje(telefono: string, texto: string, apiKey: string): Promise<void> {
  const destino = telefono.replace(/\D/g, '')   // Meta lo quiere sin `+`
  const r = await fetch(`${KAPSO_MENSAJES}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: destino,
      type: 'text',
      text: { body: texto },
    }),
  })
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '(sin cuerpo)')
    throw new EnvioError(r.status, cuerpo)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Autenticación ──────────────────────────────────────────────────────
  const esperado = process.env.SEGUIMIENTO_CRON_TOKEN
  if (!esperado) {
    // Sin token configurado el endpoint queda ABIERTO: se apaga, no se degrada.
    console.error('[seguimiento] falta SEGUIMIENTO_CRON_TOKEN — endpoint deshabilitado')
    return res.status(503).json({ error: 'no configurado' })
  }
  const recibido = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!tokenValido(recibido, esperado)) {
    console.warn('[seguimiento] token inválido')
    return res.status(401).json({ error: 'no autorizado' })
  }

  const apiKey = process.env.KAPSO_API_KEY
  if (!apiKey) {
    console.error('[seguimiento] falta KAPSO_API_KEY')
    return res.status(503).json({ error: 'no configurado' })
  }

  const sb = getServerSupabase()
  if (!sb) return res.status(503).json({ error: 'sin conexión a la base' })

  // ── 2. A quién le toca — SE CONSULTA, no se lee del body ──────────────────
  const { data, error } = await sb.rpc('shortlists_para_seguimiento')
  if (error) {
    console.error('[seguimiento] no se pudo consultar:', error.message)
    return res.status(500).json({ error: 'consulta fallida' })
  }
  const candidatas = (data ?? []) as Candidata[]
  if (!candidatas.length) {
    console.log('[seguimiento] sin candidatas')
    return res.status(200).json({ ok: true, procesadas: 0 })
  }

  // ── 3. Una por una, secuencial ────────────────────────────────────────────
  // Secuencial y no en paralelo a propósito: son pocas (3,9 shortlists/día) y un
  // lote paralelo contra Kapso no compra nada y complica el rate limit.
  const resultados: Resultado[] = []
  for (const c of candidatas) {
    try {
      if (!c.telefono) {
        // No debería pasar: la función filtra por teléfono. Si pasa, no se marca
        // nada — sin número no hay nada que reintentar tampoco.
        resultados.push({ hash: c.hash, ok: false, motivo: 'sin teléfono' })
        continue
      }

      await enviarMensaje(c.telefono, componerMensaje(c.primer_nombre, c.hash), apiKey)

      // 🔴 ACÁ NO SE DECLARA NINGÚN ENVÍO — sólo el intento (mig 340). Un 2xx dice
      // que Kapso aceptó, no que la persona lo recibió. Quien declara el envío es
      // `confirmar_seguimientos_enviados()`, en el disparo siguiente, exigiendo que
      // aparezca el saliente. Si no apareció, la persona vuelve a la cola sola.
      //
      // 🔑 Marca todas las shortlists de esa persona: el seguimiento es por PERSONA.
      // El teléfono se resuelve dentro de la base, por eso no viaja como parámetro.
      const { error: eMarca } = await sb.rpc('marcar_intento_seguimiento', { p_hash: c.hash })
      if (eMarca) {
        // Sin intento registrado se reintenta antes de tiempo, pero nadie queda
        // declarado como contactado de más. Es el lado sano para equivocarse.
        console.error(`[seguimiento] no se pudo registrar el intento ${c.hash}: ${eMarca.message}`)
      }
      resultados.push({ hash: c.hash, ok: true })
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)

      // 🔑 429 y 5xx son transitorios. No se marca NADA: la corrida siguiente lo
      // reintenta sin esperar el tope de 1 h. Tratarlos como error definitivo
      // dejaría a esa persona sin seguimiento por una condición que dura segundos.
      if (e instanceof EnvioError && e.esTransitorio) {
        console.log(`[seguimiento] ${e.status} en ${c.hash} — se reintenta la próxima corrida`)
        resultados.push({ hash: c.hash, ok: false, motivo: `${e.status} transitorio` })
        continue
      }

      // Cualquier otro fallo: queda el intento → reintenta en 1 h y el guard de
      // 22 h lo corta solo. El cuerpo crudo va al log a propósito: si Meta rechaza
      // (ventana cerrada, número inválido) queremos leer el motivo entero.
      await sb.rpc('marcar_intento_seguimiento', { p_hash: c.hash })
        .then(({ error: x }) => { if (x) console.error('[seguimiento] tampoco se pudo marcar el intento:', x.message) })
      console.warn(`[seguimiento] no salió ${c.hash}: ${motivo}`)
      resultados.push({ hash: c.hash, ok: false, motivo })
    }
  }

  const mandados = resultados.filter(r => r.ok).length
  console.log(`[seguimiento] ${mandados}/${candidatas.length} mandado(s)` +
    (mandados < candidatas.length
      ? ` · fallaron: ${resultados.filter(r => !r.ok).map(r => `${r.hash}(${r.motivo})`).join(', ')}`
      : ''))

  // "mandadas", no "enviadas": lo que se confirma es el saliente, en la corrida
  // siguiente. Este número dice cuántas aceptó Kapso.
  return res.status(200).json({ ok: true, procesadas: candidatas.length, mandadas: mandados, resultados })
}
