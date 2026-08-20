// API admin: la BANDEJA DEL AUDIT — leer los hallazgos pendientes y resolverlos.
//
// GET  /api/admin/hallazgos               → { hallazgos: [...], pendientes: n }
// POST /api/admin/hallazgos               → aplicar o descartar uno
//      body: { id, accion: 'aplicar' | 'descartar' | 'deshacer', motivo? }
//
// Es el paso 3 del plan del admin: la "segunda puerta" — entrar por PROBLEMA en vez
// de por propiedad. Hoy el audit deja sus casos en un log de markdown y el founder
// aplica el SQL a mano en Supabase; lo que no se aplicó esa mañana no queda en
// ningún lado y vuelve a juzgarse la noche siguiente.
//
// 🔴 POR QUÉ VA POR API Y NO CONSULTA DIRECTA DESDE EL BROWSER.
// `audit_hallazgos` está cerrada a `anon` y `authenticated` (mig 335). Si la pantalla
// la pidiera desde el navegador recibiría un 42501 que Supabase devuelve DENTRO del
// objeto: la promesa no rechaza, `.data` llega vacío, y la bandeja diría "no hay
// hallazgos" — que se lee como "está todo limpio". Es exactamente lo que pasó hoy con
// los gráficos de absorción de /admin/market. Por eso el endpoint desde el arranque.
//
// Protegido por requireAdmin: decide sobre datos del feed.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin-api-auth'

function serverClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Aplica un hallazgo de matching: mueve la propiedad al edificio propuesto.
 *
 * 🔴 CON CANDADO Y REVERSIBLE, las dos cosas:
 *  · **Candado**: no toca una propiedad cuyo `id_proyecto_master` haya cambiado
 *    desde que se detectó el hallazgo. Entre la noche del audit y el clic de la
 *    mañana pueden haber pasado cosas — el cargador nocturno escribe en esa misma
 *    columna. Si cambió, se rechaza y se declara, en vez de pisar.
 *  · **Reversible**: guarda en `valor_anterior` lo que había. Sin eso, "se puede
 *    deshacer" es una promesa; con eso, deshacer es leer una fila.
 *
 * ⚠️ NO toca `campos_bloqueados`: si el humano ya trabó ese campo a mano, la regla #1
 * del proyecto dice que gana lo manual. Se rechaza y se dice por qué.
 */
async function aplicarMatching(sb: SupabaseClient, h: any, quien: string) {
  const { data: prop, error: eProp } = await sb
    .from('propiedades_v2')
    .select('id, id_proyecto_master, nombre_edificio, campos_bloqueados')
    .eq('id', h.propiedad_id)
    .maybeSingle()

  if (eProp) throw new Error(`no se pudo leer la propiedad: ${eProp.message}`)
  if (!prop) throw new Error(`la propiedad ${h.propiedad_id} ya no existe`)

  // Regla #1 del proyecto: manual > automático. Un campo trabado a mano no se pisa.
  const bloqueado = (prop as any).campos_bloqueados?.id_proyecto_master
  if (bloqueado && (bloqueado === true || bloqueado?.bloqueado === true)) {
    throw new Error('el edificio de esta propiedad está bloqueado a mano — no se pisa (regla #1)')
  }

  // El candado: el mundo pudo haberse movido entre la noche y el clic.
  if ((prop as any).id_proyecto_master !== h.pm_actual) {
    throw new Error(
      `cambió desde que se detectó: el hallazgo esperaba edificio ${h.pm_actual ?? 'ninguno'} ` +
      `y ahora tiene ${(prop as any).id_proyecto_master ?? 'ninguno'}. Se descarta para que el audit lo vuelva a mirar.`)
  }

  const valorAnterior = {
    id_proyecto_master: (prop as any).id_proyecto_master,
    nombre_edificio: (prop as any).nombre_edificio,
  }

  // 🔑 `pm_propuesto` NULL es un valor, no un olvido: es el veredicto RECHAZAR, que
  // desconecta un match equivocado y deja la propiedad sin edificio.
  const { error: eUpd } = await sb
    .from('propiedades_v2')
    .update({
      id_proyecto_master: h.pm_propuesto ?? null,
      fecha_actualizacion: new Date().toISOString(),
    })
    .eq('id', h.propiedad_id)
    .eq('id_proyecto_master', h.pm_actual)   // candado también en la escritura

  if (eUpd) throw new Error(`no se pudo aplicar: ${eUpd.message}`)
  return valorAnterior
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res, ['super_admin'])
  if (!admin) return

  const sb = serverClient()
  if (!sb) return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor' })

  // ── LEER la bandeja ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const estado = String(req.query.estado || 'pendiente')
    const { data, error } = await sb
      .from('audit_hallazgos')
      .select('*')
      .eq('estado', estado)
      .order('primera_vez_at', { ascending: true })
      .limit(200)

    // El error se MIRA y se devuelve. Un catch mudo acá volvería a producir el
    // "no hay nada" que esta bandeja viene a reemplazar.
    if (error) {
      console.error('[api/admin/hallazgos] GET', error)
      return res.status(500).json({ error: error.message })
    }

    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).json({ hallazgos: data ?? [], pendientes: (data ?? []).length })
  }

  // ── RESOLVER uno ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { id, accion, motivo } = req.body || {}
    if (!id || !['aplicar', 'descartar', 'deshacer'].includes(accion)) {
      return res.status(400).json({ error: 'Se espera { id, accion: aplicar|descartar|deshacer }' })
    }

    const { data: h, error: eGet } = await sb.from('audit_hallazgos').select('*').eq('id', id).maybeSingle()
    if (eGet) return res.status(500).json({ error: eGet.message })
    if (!h) return res.status(404).json({ error: `no existe el hallazgo ${id}` })

    try {
      if (accion === 'aplicar') {
        if ((h as any).estado !== 'pendiente') {
          return res.status(409).json({ error: `ya estaba ${(h as any).estado}` })
        }
        const valorAnterior = await aplicarMatching(sb, h, admin.email)
        await sb.from('audit_hallazgos').update({
          estado: 'aplicado',
          resuelto_at: new Date().toISOString(),
          resuelto_por: admin.email,
          valor_anterior: valorAnterior,
        }).eq('id', id)
        return res.status(200).json({ ok: true, aplicado: true, valorAnterior })
      }

      if (accion === 'descartar') {
        await sb.from('audit_hallazgos').update({
          estado: 'descartado',
          resuelto_at: new Date().toISOString(),
          resuelto_por: admin.email,
          // 🔑 El motivo importa: un "no" sin razón se vuelve a proponer la noche
          // siguiente y nadie recuerda por qué se había dicho que no.
          motivo_descarte: motivo || null,
        }).eq('id', id)
        return res.status(200).json({ ok: true, descartado: true })
      }

      // deshacer: devuelve la propiedad a como estaba y reabre el hallazgo
      if ((h as any).estado !== 'aplicado' || !(h as any).valor_anterior) {
        return res.status(409).json({ error: 'solo se puede deshacer algo aplicado que guardó su valor anterior' })
      }
      const prev = (h as any).valor_anterior
      const { error: eRb } = await sb.from('propiedades_v2')
        .update({ id_proyecto_master: prev.id_proyecto_master ?? null })
        .eq('id', (h as any).propiedad_id)
      if (eRb) throw new Error(eRb.message)

      await sb.from('audit_hallazgos').update({
        estado: 'pendiente', resuelto_at: null, resuelto_por: null, valor_anterior: null,
      }).eq('id', id)
      return res.status(200).json({ ok: true, deshecho: true })

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      console.error('[api/admin/hallazgos] POST', msg)
      // 400, no 500: casi siempre es el candado haciendo su trabajo (el mundo se
      // movió, o el campo está bloqueado a mano), y eso es información para el
      // humano, no una falla del servidor.
      return res.status(400).json({ error: msg })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
