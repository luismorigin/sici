// Constructor unificado de mensajes WhatsApp para leads de alquiler/venta.
// Objetivo: que el broker sepa inmediatamente que el lead vino de Simón
// y tenga un link verificable + ref ID para reclamar ante disputas.

import { dormLabel, formatPriceBob } from './format-utils'

// -----------------------------------------------------------------------------
// "Pedir más alternativas" — línea machine-readable para el bot simon-asistente
// -----------------------------------------------------------------------------
// El botón "Pedir más opciones" del header de /b/[hash] (solo simon-asistente)
// puede adjuntar al final del mensaje una línea parseable por el bot:
//
//   ref:v1 <hash> | fav:<id1,id2,...|none>
//
// donde <hash> es broker_shortlists.hash y los IDs son propiedades_v2.id de los
// favoritos del cliente (estado en vivo de /b/[hash]). El bot lee ESTA línea
// (no la prosa, que es editable) y consulta la BD por ID, validando que los IDs
// pertenezcan al shortlist del hash. Ver contrato en project_plan_contacto_directo_b2c.
//
// FLAG DE LANZAMIENTO: arranca en false → el mensaje NO incluye la línea (los
// clientes reales ven el mensaje actual sin ref). Activar a true (+ deploy)
// recién cuando el bot esté listo para parsearla.
export const REF_ALTERNATIVAS_ENABLED: boolean = true

export function buildAlternativasRefLine(hash: string, favIds: number[]): string {
  const fav = favIds.length > 0
    ? favIds.slice().sort((a, b) => a - b).join(',')
    : 'none'
  return `ref:v1 ${hash} | fav:${fav}`
}

interface MessageProperty {
  id: number
  nombre_edificio: string | null
  nombre_proyecto: string | null
  zona: string
  dormitorios: number
  precio_mensual_bob: number
  // Anuncio original del portal (Century21/Remax/BI). En el formato de
  // atribución se manda este link (no la ficha de Simón) para que el captador
  // identifique su propia publicación al instante.
  url?: string | null
}

interface Options {
  preguntas?: string[]
  intro?: string // opcional: sobreescribe "Hola, vi este alquiler en Simon"
  // atribucion: usa el formato unificado público (feed + B2C) — anuncio del
  // portal + firma "Este contacto llegó por Simón" + Ref. Cuando es false/undefined
  // se mantiene el formato estructurado histórico (usado en modo broker logueado).
  atribucion?: boolean
  // comparando: matiz del Comparativo Express ("estoy comparando algunas opciones").
  comparando?: boolean
}

/**
 * Formato UNIFICADO de mensaje al captador en modo público (feed /ventas y
 * /alquileres + canal B2C del bot). Objetivo doble:
 *  - claridad para el captador: se manda el anuncio de SU portal (no la ficha de
 *    Simón, que en frío confunde a quien nunca oyó de Simón);
 *  - atribución para el founder: firma explícita "Este contacto llegó por Simón"
 *    + Ref único, para poder reclamar el lead ("ese cliente te lo mandé yo").
 * NO se usa en modo broker logueado (ahí va el copy "Tengo un cliente interesado…").
 */
export function buildAtribucionWaMessage(i: {
  nombre: string
  url?: string | null
  preguntas?: string[]
  ref: string          // 'SIM-V123' (venta) | 'SIM-P123' (alquiler)
  comparando?: boolean
}): string {
  const tienePreguntas = !!(i.preguntas && i.preguntas.length > 0)
  let saludo = `Hola, vi ${i.nombre} en Simon (simonbo.com)`
  saludo += i.comparando ? ', estoy comparando algunas opciones y me interesa' : ' y me interesa'
  saludo += tienePreguntas ? '.' : ', ¿sigue disponible?'

  const parts: string[] = [saludo]
  if (tienePreguntas) {
    parts.push('', 'Me gustaría saber:')
    i.preguntas!.forEach(q => parts.push(`— ${q}`))
  }
  if (i.url) parts.push('', `Anuncio: ${i.url}`)
  parts.push('', `Este contacto llegó por Simón. Ref: ${i.ref}`)
  return parts.join('\n')
}

export function buildAlquilerWaMessage(p: MessageProperty, opts: Options = {}): string {
  // Modo público (feed + B2C): formato unificado con atribución.
  if (opts.atribucion) {
    return buildAtribucionWaMessage({
      nombre: p.nombre_edificio || p.nombre_proyecto || 'este departamento',
      url: p.url ?? null,
      preguntas: opts.preguntas,
      ref: `SIM-P${p.id}`,
      comparando: opts.comparando,
    })
  }

  // Modo broker logueado: formato estructurado histórico (sin cambios).
  const name = p.nombre_edificio || p.nombre_proyecto || 'este departamento'
  const specs = [dormLabel(p.dormitorios), formatPriceBob(p.precio_mensual_bob) + '/mes', p.zona].filter(Boolean).join(' · ')
  const intro = opts.intro || 'Hola, vi este alquiler en Simon (simonbo.com):'

  const parts: string[] = [intro, '', `${name} · ${specs}`]

  if (opts.preguntas && opts.preguntas.length > 0) {
    parts.push('')
    parts.push('Me gustaría saber:')
    opts.preguntas.forEach(q => parts.push(`— ${q}`))
  }

  parts.push('')
  parts.push(`Ver ficha en Simon: https://simonbo.com/alquileres?id=${p.id}`)
  parts.push(`Ref: SIM-P${p.id}`)

  return parts.join('\n')
}
