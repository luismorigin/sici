// API: Interceptar clicks WhatsApp de alquileres para tracking de leads
// GET /api/lead-alquiler?phone=XXX&msg=YYY&prop_id=ZZZ&fuente=comparativo&...
// Registra el lead en BD y redirige a WhatsApp

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed')
  }

  try {
    const {
      phone,
      msg,
      prop_id,
      nombre,
      zona,
      precio,
      dorms,
      broker_nombre,
      fuente,
      preguntas,
    } = req.query

    if (!phone || typeof phone !== 'string') {
      return res.status(400).send('Falta número de teléfono')
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '')
    const finalPhone = cleanPhone.startsWith('591') ? cleanPhone : `591${cleanPhone}`

    // Build WhatsApp URL
    const msgText = typeof msg === 'string' ? msg : ''
    const whatsappUrl = `https://wa.me/${finalPhone}${msgText ? `?text=${encodeURIComponent(msgText)}` : ''}`

    // Parse preguntas
    let preguntasArr: string[] = []
    try {
      if (preguntas && typeof preguntas === 'string') {
        preguntasArr = JSON.parse(preguntas)
      }
    } catch { /* ignore */ }

    // Validate numeric params (NaN/out-of-bounds → null)
    const propIdNum = prop_id ? parseInt(prop_id as string, 10) : NaN
    const precioNum = precio ? parseFloat(precio as string) : NaN
    const dormsNum = dorms ? parseInt(dorms as string, 10) : NaN

    // Insert lead (fire and forget — don't block the redirect)
    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      supabase.from('leads_alquiler').insert({
        propiedad_id: !isNaN(propIdNum) && propIdNum > 0 ? propIdNum : null,
        nombre_propiedad: typeof nombre === 'string' ? nombre.slice(0, 200) : null,
        zona: typeof zona === 'string' ? zona.slice(0, 100) : null,
        precio_bob: !isNaN(precioNum) && precioNum > 0 && precioNum < 1_000_000 ? precioNum : null,
        dormitorios: !isNaN(dormsNum) && dormsNum >= 0 && dormsNum <= 10 ? dormsNum : null,
        broker_telefono: finalPhone,
        broker_nombre: typeof broker_nombre === 'string' ? broker_nombre.slice(0, 200) : null,
        fuente: typeof fuente === 'string' ? fuente.slice(0, 50) : 'card',
        preguntas_enviadas: preguntasArr.length > 0 ? preguntasArr : null,
      }).then(({ error }) => {
        if (error) console.error('Error registrando lead alquiler:', error)
      })
    }

    // Redirect to WhatsApp
    res.redirect(302, whatsappUrl)

  } catch (error) {
    console.error('Error en lead-alquiler:', error)
    res.status(500).send('Error al generar enlace')
  }
}
