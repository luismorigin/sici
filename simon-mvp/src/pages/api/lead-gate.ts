// API: Registrar leads del gate "Ver anuncio original" (ventas + alquileres)
// POST /api/lead-gate { nombre, telefono, correo, origen, propiedad_id?, propiedad_nombre?, zona? }

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { nombre, telefono, correo, origen, propiedad_id, propiedad_nombre, zona } = req.body || {}

    if (!nombre || !telefono || !correo || !origen) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    if (origen !== 'ventas' && origen !== 'alquileres') {
      return res.status(400).json({ error: 'Origen inválido' })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase no configurado' })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { error } = await supabase.from('leads_gate').insert({
      nombre: String(nombre).slice(0, 200),
      telefono: String(telefono).slice(0, 50),
      correo: String(correo).slice(0, 200),
      origen,
      propiedad_id: propiedad_id && !isNaN(Number(propiedad_id)) ? Number(propiedad_id) : null,
      propiedad_nombre: propiedad_nombre ? String(propiedad_nombre).slice(0, 200) : null,
      zona: zona ? String(zona).slice(0, 100) : null,
    })

    if (error) {
      console.error('Error registrando lead gate:', error)
      return res.status(500).json({ error: 'Error guardando lead' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Error en lead-gate:', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
