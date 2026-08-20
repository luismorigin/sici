// API admin: la serie de absorción de mercado, desde el entorno SHADOW.
//
// GET /api/admin/market-absorcion?macrozona=Equipetrol
//   → { hoy: [...], serie: [...], desde: '2026-08-03', corte: '...' }
//
// 🔴 POR QUÉ EXISTE ESTA RUTA en vez de consultar desde el navegador.
// `market_absorption_snapshots_shadow` NO es legible por `anon` ni por
// `authenticated` — es tabla interna, y así debe seguir. El admin corre con el rol
// `authenticated`, así que si la pide desde el browser recibe un `42501` que Supabase
// devuelve DENTRO del objeto: la promesa no rechaza, la pantalla no mira el error y
// pinta "No hay datos" — que se lee como *"el mercado no tuvo movimiento"* en vez de
// *"no tengo permiso para verlo"*. Medido en local el 20-ago-2026: los dos gráficos
// de absorción vacíos, cero errores en consola.
//
// 🔑 El arreglo NO es darle el GRANT a `authenticated` — eso abre la tabla a cualquier
// sesión del browser y deja la trampa armada para la próxima migración. Es leerla del
// lado del servidor, con la llave que ya tiene permiso. Mismo principio que
// `lib/supabase-server.ts` y que la lección de las migs 306/315/317 (regla 13).
//
// Protegido por requireAdmin: son datos internos de mercado.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-api-auth'

/** 🔴 La serie shadow tiene un CORTE el 3-ago-2026 (mig 314) y no se puede reconstruir.
 *  Hasta ese día las vistas contaban avisos YA DADOS DE BAJA (filtraban `status` pero no
 *  `es_activa`), así que las filas del 21-jul al 2-ago están infladas —8,2% en venta— y
 *  la distorsión CRECE hacia atrás, porque las bajas se acumulan. Dibujar la serie entera
 *  mostraría una caída que es del método, no del mercado. */
const SERIE_DESDE = '2026-08-03'

const MACROZONAS_VALIDAS = ['Equipetrol', 'Zona Norte'] as const

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 🔴 La macrozona es OBLIGATORIA en esta tabla: desde la mig 313 `zona='global'` es el
  // agregado DE SU MACROZONA, no el total. Sin filtrar se mezclan Equipetrol y Zona Norte,
  // que difieren $283 en el m². Lista blanca para no confiar en el query string.
  const macrozona = String(req.query.macrozona || 'Equipetrol')
  if (!MACROZONAS_VALIDAS.includes(macrozona as typeof MACROZONAS_VALIDAS[number])) {
    return res.status(400).json({ error: `macrozona inválida: ${macrozona}` })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor' })
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  try {
    const dosDiasAtras = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]

    const [hoyRes, serieRes] = await Promise.all([
      // el corte más reciente, por zona y tipología
      sb.from('market_absorption_snapshots_shadow')
        .select('fecha, zona, dormitorios, venta_activas, venta_absorbidas_30d, venta_pending_30d, venta_tasa_absorcion, venta_meses_inventario')
        .eq('macrozona', macrozona)
        .gte('fecha', dosDiasAtras)
        .order('fecha', { ascending: false }),
      // la serie del agregado de la macrozona
      sb.from('market_absorption_snapshots_shadow')
        .select('fecha, dormitorios, venta_activas, venta_tasa_absorcion, venta_absorbidas_30d')
        .eq('zona', 'global')
        .eq('macrozona', macrozona)
        .gte('fecha', SERIE_DESDE)
        .order('fecha', { ascending: true }),
    ])

    // 🔑 Los errores se MIRAN y se devuelven. Que este endpoint exista no sirve de nada
    // si repite el modo de falla que vino a arreglar: fallar y decir "no hay datos".
    if (hoyRes.error) throw new Error(`snapshot del día: ${hoyRes.error.message}`)
    if (serieRes.error) throw new Error(`serie: ${serieRes.error.message}`)

    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json({
      macrozona,
      hoy: hoyRes.data ?? [],
      serie: serieRes.data ?? [],
      desde: SERIE_DESDE,
      nota: `La serie arranca el ${SERIE_DESDE}: antes de esa fecha el nivel está inflado (mig 314) y no se puede reconstruir.`,
    })
  } catch (err) {
    console.error('[api/admin/market-absorcion]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    return res.status(500).json({ error: msg })
  }
}
