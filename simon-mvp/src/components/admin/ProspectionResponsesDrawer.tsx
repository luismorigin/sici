// Drawer lateral de respuestas pre-armadas para prospección.
//
// 12 respuestas + 4 reglas. Si el caller pasa un broker, el drawer
// muestra "Respondiendo a {nombre}" y habilita el botón "Abrir WA" en
// cada respuesta (reemplaza [nombre] en el texto y abre wa.me con el
// teléfono del broker). Sin broker, solo se puede copiar al clipboard.
//
// Las respuestas viven hardcoded acá. Si después se necesita editar
// sin deployar, mover a tabla BD + endpoint admin.

import { useState } from 'react'
import { buildWhatsAppURL } from '@/lib/whatsapp'

interface Respuesta {
  trigger: string
  texto: string
  /** Si tiene placeholder [nombre], se reemplaza al copiar/enviar. */
  hasNombre?: boolean
}

const REGLAS = [
  'Nunca copies textual sin leer. Cada respuesta es base — adaptala a lo que dijo el broker.',
  'Una respuesta, una pregunta. Cada mensaje termina con UNA pregunta concreta. Nunca dos.',
  'Si dice "no" claro — agradecés y cerrás. No insistís. El mercado es chico y la reputación importa.',
  'Objetivo: llegar a 20 minutos en persona o en su oficina. No cerrar por WhatsApp.',
]

const RESPUESTAS: Respuesta[] = [
  {
    trigger: '¿Cuánto cuesta?',
    texto: `Son 350 bolivianos al mes.

Más allá del precio, ¿te animás a juntarte conmigo 20 minutos? Te visito a tu oficina. Estoy en fase de lanzamiento y me serviría mucho tu feedback como broker. Te muestro cómo funciona en vivo y me decís qué le ves, qué le falta, qué cambiarías.

¿Mañana o pasado te viene bien?`,
  },
  {
    trigger: '¿Qué es Simón? / ¿De qué se trata?',
    texto: `Simón es una plataforma de inteligencia inmobiliaria de Equipetrol. Tenés todo el inventario de la zona en una sola pantalla — Remax, Century 21 y Bien Inmuebles — con herramienta para mandarle a tu cliente presentaciones profesionales con tu nombre y WhatsApp.

Miralo vos mismo en 2 minutos:
👉 simonbo.com/broker/demo`,
  },
  {
    trigger: 'Interesante, lo veo / Lo miro',
    texto: `Dale, cualquier duda avisame.

¿Te parece si coordinamos 20 minutos esta semana? Te visito a tu oficina y lo vemos en vivo para vos.`,
  },
  {
    trigger: 'No tengo propiedades en Equipetrol',
    texto: `Justamente por eso puede servirte.

Simón no es solo para quien tiene captaciones en la zona — es para posicionarte como el especialista de Equipetrol ante clientes que están buscando ahí.

Tenés 300+ deptos en venta y 120+ en alquiler en una pantalla. Cuando un cliente te escribe buscando algo en Equipetrol, vos tenés todo el inventario para atenderlo aunque no tengas nada captado propio.

¿Lo vemos 20 minutos?`,
  },
  {
    trigger: 'Ya tengo herramientas / Ya uso algo',
    texto: `¿Cuál usás?

Te pregunto porque Simón tiene algo que ninguna herramienta tiene en Bolivia — el inventario completo de Equipetrol agregado en una sola pantalla con contacto directo a los captadores originales.

En 20 minutos te muestro la diferencia y me decís si suma o no. ¿Te parece?`,
  },
  {
    trigger: 'Está caro / Es mucho',
    texto: `Entiendo. Te lo pongo en contexto:

Si Simón te ayuda a cerrar una operación extra en el año, la comisión te paga la herramienta 40 veces.

Y para los primeros 20 brokers fundadores ese precio queda congelado por 12 meses — cuando suba para los nuevos, vos mantenés el tuyo.

¿Lo vemos en persona 20 minutos?`,
  },
  {
    trigger: 'Ahora no puedo / Estoy ocupado',
    texto: `Sin problema, no hay apuro.

¿Cuándo sería buen momento? La semana que viene también me viene bien.`,
  },
  {
    trigger: '¿Funciona para alquileres también?',
    texto: `Sí, tenés 120+ departamentos en alquiler en Equipetrol también — mismos filtros, mismo sistema, misma presentación profesional para tu cliente.`,
  },
  {
    trigger: 'Mandame más información',
    texto: `Te paso el demo directo para que lo veas vos mismo — es más claro que cualquier texto:

👉 simonbo.com/broker/demo

Y si querés que lo veamos juntos, te visito a tu oficina 20 minutos. ¿Esta semana?`,
  },
  {
    trigger: 'No responde en 48 horas',
    texto: `[nombre], ¿pudiste ver la demo?`,
    hasNombre: true,
  },
  {
    trigger: 'Abre el demo pero no responde',
    texto: `[nombre], ¿qué te pareció?`,
    hasNombre: true,
  },
  {
    trigger: 'Lo hablo con mi socio / jefe / agencia',
    texto: `Dale, sin problema.

Si necesitás que me junte con ellos también para mostrarlo, con gusto. A veces es más fácil verlo en vivo que explicarlo.

¿Me avisás cómo les fue?`,
  },
]

export interface ProspectionResponsesDrawerProps {
  isOpen: boolean
  onClose: () => void
  /** Si está provisto, habilita "Abrir WA" y reemplaza [nombre]. */
  broker: { telefono: string; nombre: string } | null
}

export default function ProspectionResponsesDrawer({
  isOpen,
  onClose,
  broker,
}: ProspectionResponsesDrawerProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  if (!isOpen) return null

  const buildText = (r: Respuesta): string => {
    if (r.hasNombre && broker?.nombre) {
      return r.texto.replaceAll('[nombre]', broker.nombre)
    }
    return r.texto
  }

  const handleCopy = async (r: Respuesta, idx: number) => {
    try {
      await navigator.clipboard.writeText(buildText(r))
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(prev => prev === idx ? null : prev), 1800)
    } catch (err) {
      console.error('[Responses] copy failed:', err)
    }
  }

  const handleSendWa = (r: Respuesta) => {
    if (!broker) return
    const url = buildWhatsAppURL(broker.telefono, buildText(r))
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[400]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer lateral derecho */}
      <aside
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white shadow-2xl z-[401] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="responses-drawer-title"
      >
        <header className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="responses-drawer-title" className="text-lg font-semibold text-gray-900">
              Respuestas pre-armadas
            </h2>
            {broker ? (
              <p className="text-xs text-gray-600 mt-0.5">
                Respondiendo a <strong>{broker.nombre}</strong>
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">
                Sin broker seleccionado · solo copiar al clipboard
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-2 -mr-2"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        {/* Reglas */}
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
          <div className="font-semibold uppercase tracking-wider text-[10px] text-amber-700 mb-1.5">
            Reglas
          </div>
          <ol className="list-decimal list-inside space-y-1 leading-relaxed">
            {REGLAS.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>

        {/* Lista de respuestas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {RESPUESTAS.map((r, idx) => {
            const text = buildText(r)
            return (
              <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-white border-b border-gray-100 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-gray-700 flex-1 min-w-0">
                    <span className="text-gray-400 mr-1">{idx + 1}.</span> {r.trigger}
                  </div>
                  {r.hasNombre && !broker && (
                    <span className="text-[10px] text-amber-600 font-medium">
                      Necesita broker
                    </span>
                  )}
                </div>
                <div className="px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {text}
                </div>
                <div className="px-4 py-2.5 bg-white border-t border-gray-100 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(r, idx)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                      copiedIdx === idx
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {copiedIdx === idx ? '✓ Copiado' : '📋 Copiar'}
                  </button>
                  {broker && (
                    <button
                      type="button"
                      onClick={() => handleSendWa(r)}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      💬 Abrir WA
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
