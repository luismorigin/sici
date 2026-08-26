// ============================================================================
// /api/cron/seguimiento-shortlists — el que efectivamente manda el seguimiento
// ----------------------------------------------------------------------------
// Lo llama `disparar_seguimiento_shortlists()` desde pg_cron, cada hora (mig 338).
// Por cada persona que califica: busca su ejecución en Kapso e inyecta la marca
// `seguimiento:v1`. El TEXTO no se escribe acá — lo redacta el bot, que tiene el
// bloque en su prompt. El cliente nunca ve esa marca (mismo mecanismo que `ref:v1`).
//
// 🔴 EL BODY NO SE LEE, Y ESO ES EL DISEÑO, NO UN OLVIDO.
// La primera versión del pedido mandaba la lista de destinatarios en el POST y este
// endpoint la recorría. Con eso, quien consiguiera el token podía inyectar
// `conversation_id` arbitrarios y **hacer que el bot le escriba a cualquiera con
// nuestro número**. Acá la lista se consulta a la base: aunque alguien dispare el
// endpoint, lo peor que logra es adelantar un seguimiento que ya correspondía.
//
// 🔴 NO PRUEBA ENTREGA. Un `resume` aceptado por Kapso no garantiza que el mensaje
// salga: es el bug D39 de lab-kapso (Kapso acepta, el bot redacta, Meta no entrega y
// la conversación muere). Marcamos por resume-OK porque es lo que controlamos, pero
// no es acuse de recibo.
//
// Ver: sql/migrations/338_seguimiento_shortlists.sql
// ============================================================================
import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSupabase } from '@/lib/supabase-server'

const KAPSO_BASE = 'https://api.kapso.ai/platform/v1'
const WORKFLOW_ID = '7e219983-4fdc-47d7-920e-0a3a33bf780a'
const MARCA = 'seguimiento:v1'

/** Una persona que califica. Sin datos personales: la función SQL no los devuelve. */
interface Candidata {
  hash: string
  conversation_id: string
  horas_desde: number
}

type Resultado = { hash: string; ok: boolean; motivo?: string }

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

/** Busca la ejecución viva del workflow para esa conversación. */
async function buscarEjecucion(conversationId: string, apiKey: string): Promise<string | null> {
  const url = `${KAPSO_BASE}/workflows/${WORKFLOW_ID}/executions?whatsapp_conversation_id=${encodeURIComponent(conversationId)}`
  const r = await fetch(url, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } })
  if (!r.ok) throw new Error(`executions HTTP ${r.status}`)
  const j = await r.json()
  const lista = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []
  if (!lista.length) return null
  // La más reciente: si hubo varias, la que sigue viva es la última.
  const orden = [...lista].sort((a, b) =>
    String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? '')))
  return orden[0]?.id ?? null
}

/** Error del `resume`, con el cuerpo crudo de Kapso adentro. */
class ResumeError extends Error {
  constructor(readonly status: number, readonly cuerpo: string) {
    super(`resume HTTP ${status}: ${cuerpo.slice(0, 300)}`)
  }
  /** 409 = "otro request está procesando esta ejecución". Transitorio: se reintenta. */
  get esTransitorio(): boolean { return this.status === 409 }
}

/**
 * Inyecta la marca en la conversación. El bot la lee y redacta él el mensaje.
 *
 * 🔑 Se guarda el CUERPO del error, no sólo el status. La doc de Kapso sólo documenta el
 * 409 y **no dice qué pasa con una ejecución `ended`, `failed` o en handoff** — lab-kapso
 * lo confirmó el 26-ago: no lo saben, porque su código nunca intentó ese camino. La
 * primera vez que aparezca una respuesta rara queremos el texto, no un booleano.
 */
async function inyectarMarca(executionId: string, apiKey: string): Promise<void> {
  const r = await fetch(`${KAPSO_BASE}/workflow_executions/${executionId}/resume`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { data: { text: MARCA } } }),
  })
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '(sin cuerpo)')
    throw new ResumeError(r.status, cuerpo)
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
      const ejecucion = await buscarEjecucion(c.conversation_id, apiKey)
      if (!ejecucion) {
        // Sin ejecución viva no hay dónde inyectar. Se marca el INTENTO (no el
        // envío) para no reintentar en la próxima corrida: el guard de 22 h la
        // sacará sola.
        await sb.rpc('marcar_seguimiento_shortlist', { p_hash: c.hash, p_enviado: false })
        resultados.push({ hash: c.hash, ok: false, motivo: 'sin ejecución viva' })
        continue
      }
      await inyectarMarca(ejecucion, apiKey)

      // 🔑 Marca TODAS las shortlists de esa persona, no sólo ésta: el seguimiento
      // es por PERSONA. La función resuelve el teléfono adentro de la base — por eso
      // no viaja hasta acá.
      const { error: eMarca } = await sb.rpc('marcar_seguimiento_shortlist', {
        p_hash: c.hash, p_enviado: true,
      })
      if (eMarca) {
        // El mensaje SALIÓ y no pudimos marcar: es el caso que hace remandar. Se
        // grita en el log — el tope de 1 h de la función SQL contiene el daño.
        console.error(`[seguimiento] ⚠️ ENVIADO pero NO MARCADO ${c.hash}: ${eMarca.message}`)
      }
      resultados.push({ hash: c.hash, ok: true })
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)

      // 🔑 409 = otro request está procesando esa ejecución. Es TRANSITORIO —
      // típicamente el cliente escribiendo en el mismo momento, que Kapso encola con
      // un debounce de 5 s. No se marca NADA: la corrida siguiente lo reintenta sin
      // esperar el tope de 1 h. Tratarlo como error genérico dejaría a esa persona
      // sin seguimiento por una condición que dura segundos.
      if (e instanceof ResumeError && e.esTransitorio) {
        console.log(`[seguimiento] 409 en ${c.hash} (ejecución ocupada) — se reintenta la próxima corrida`)
        resultados.push({ hash: c.hash, ok: false, motivo: '409 transitorio' })
        continue
      }

      // Cualquier otro fallo: se registra el INTENTO, no el envío → reintenta en 1 h
      // y el guard de 22 h lo corta solo.
      await sb.rpc('marcar_seguimiento_shortlist', { p_hash: c.hash, p_enviado: false })
        .then(({ error: x }) => { if (x) console.error('[seguimiento] tampoco se pudo marcar el intento:', x.message) })
      // El cuerpo crudo va al log a propósito: la doc de Kapso no cubre los estados
      // `ended`/`failed`, así que el primer caso raro hay que poder leerlo entero.
      console.warn(`[seguimiento] no salió ${c.hash}: ${motivo}`)
      resultados.push({ hash: c.hash, ok: false, motivo })
    }
  }

  const enviadas = resultados.filter(r => r.ok).length
  console.log(`[seguimiento] ${enviadas}/${candidatas.length} enviada(s)` +
    (enviadas < candidatas.length
      ? ` · fallaron: ${resultados.filter(r => !r.ok).map(r => `${r.hash}(${r.motivo})`).join(', ')}`
      : ''))

  return res.status(200).json({ ok: true, procesadas: candidatas.length, enviadas, resultados })
}
