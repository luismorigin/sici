// Constructor unificado de mensajes WhatsApp para leads de alquiler/venta.
// Objetivo: que el broker sepa inmediatamente que el lead vino de Simón
// y tenga un link verificable + ref ID para reclamar ante disputas.

import { dormLabel, formatPriceBob } from './format-utils'

interface MessageProperty {
  id: number
  nombre_edificio: string | null
  nombre_proyecto: string | null
  zona: string
  dormitorios: number
  precio_mensual_bob: number
}

interface Options {
  preguntas?: string[]
  intro?: string // opcional: sobreescribe "Hola, vi este alquiler en Simon"
}

export function buildAlquilerWaMessage(p: MessageProperty, opts: Options = {}): string {
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
