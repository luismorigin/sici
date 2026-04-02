// API: Registrar lead WhatsApp de alquileres
// POST /api/lead-alquiler — body JSON, responde { ok, whatsapp_url }
// Bots/prefetch no ejecutan POST, eliminando leads fantasma.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function parseBody(req: NextApiRequest) {
  // POST JSON body
  const b = req.body || {}
  return {
    phone: typeof b.phone === 'string' ? b.phone : '',
    msg: typeof b.msg === 'string' ? b.msg : '',
    prop_id: b.prop_id,
    nombre: typeof b.nombre === 'string' ? b.nombre : '',
    zona: typeof b.zona === 'string' ? b.zona : '',
    precio: b.precio,
    dorms: b.dorms,
    broker_nombre: typeof b.broker_nombre === 'string' ? b.broker_nombre : '',
    fuente: typeof b.fuente === 'string' ? b.fuente : 'card',
    preguntas: b.preguntas,
    debug: b.debug,
    sid: typeof b.sid === 'string' ? b.sid : '',
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  try {
    const { phone, msg, prop_id, nombre, zona, precio, dorms, broker_nombre, fuente, preguntas, debug, sid } = parseBody(req)

    if (!phone) {
      return res.status(400).json({ error: 'Falta número de teléfono' })
    }

    const cleanPhone = phone.replace(/\D/g, '')
    const finalPhone = cleanPhone.startsWith('591') ? cleanPhone : `591${cleanPhone}`

    const msgText = msg || ''
    const whatsappUrl = `https://wa.me/${finalPhone}${msgText ? `?text=${encodeURIComponent(msgText)}` : ''}`

    // Parse preguntas
    let preguntasArr: string[] = []
    try {
      if (Array.isArray(preguntas)) preguntasArr = preguntas
      else if (typeof preguntas === 'string') preguntasArr = JSON.parse(preguntas)
    } catch { /* ignore */ }

    const propIdNum = prop_id ? parseInt(String(prop_id), 10) : NaN
    const precioNum = precio ? parseFloat(String(precio)) : NaN
    const dormsNum = dorms != null ? parseInt(String(dorms), 10) : NaN

    // Insert lead with server-side dedup (skip if same prop+phone in last 30s)
    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const safePropId = !isNaN(propIdNum) && propIdNum > 0 ? propIdNum : null

      try {
        if (safePropId) {
          const { data: recent } = await supabase
            .from('leads_alquiler')
            .select('id')
            .eq('propiedad_id', safePropId)
            .eq('broker_telefono', finalPhone)
            .gte('created_at', new Date(Date.now() - 30_000).toISOString())
            .limit(1)
          if (recent && recent.length > 0) {
            return res.status(200).json({ ok: true, whatsapp_url: whatsappUrl, dedup: true })
          }
        }
        const { error } = await supabase.from('leads_alquiler').insert({
          propiedad_id: safePropId,
          nombre_propiedad: nombre.slice(0, 200) || null,
          zona: zona.slice(0, 100) || null,
          precio_bob: !isNaN(precioNum) && precioNum > 0 && precioNum < 1_000_000 ? precioNum : null,
          dormitorios: !isNaN(dormsNum) && dormsNum >= 0 && dormsNum <= 10 ? dormsNum : null,
          broker_telefono: finalPhone,
          broker_nombre: broker_nombre.slice(0, 200) || null,
          fuente: fuente.slice(0, 50) || 'card',
          preguntas_enviadas: preguntasArr.length > 0 ? preguntasArr : null,
          es_test: debug === '1' || debug === true,
          session_id: sid && sid.length <= 50 ? sid : null,
        })
        if (error) console.error('Error registrando lead alquiler:', error)
      } catch (err) {
        console.error('Error en insert lead:', err)
      }
    }

    res.status(200).json({ ok: true, whatsapp_url: whatsappUrl })

  } catch (error) {
    console.error('Error en lead-alquiler:', error)
    res.status(500).json({ error: 'Error interno' })
  }
}
