// Modal para contactar broker desde Informe Premium
// Captura datos del usuario + genera mensaje WhatsApp dinámico

import { useState } from 'react'

interface ContactarBrokerModalProps {
  isOpen: boolean
  onClose: () => void
  // Datos de la propiedad clickeada (puede ser #1, #2 o #3)
  propiedadId: number
  posicionTop3: number
  proyectoNombre: string
  precioUsd: number
  estadoConstruccion: string
  diasEnMercado: number | null
  // Datos del broker de ESA propiedad
  brokerNombre: string
  brokerWhatsapp: string
  brokerInmobiliaria?: string
  // Datos del perfil usuario (mismos para todas)
  necesitaParqueo: boolean
  necesitaBaulera: boolean
  tieneMascotas: boolean
  innegociables: string[]
  // Datos específicos de ESA propiedad
  tieneParqueo: boolean
  tieneBaulera: boolean
  petFriendlyConfirmado: boolean
}

export default function ContactarBrokerModal(props: ContactarBrokerModalProps) {
  // Estados del flujo
  const [estado, setEstado] = useState<'captura' | 'cargando' | 'listo' | 'error'>('captura')

  // Datos del usuario (capturados en el modal)
  const [nombre, setNombre] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  // Resultado
  const [codigoRef, setCodigoRef] = useState('')
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState('')
  const [whatsappUrl, setWhatsappUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState('')

  const posicionLabel = props.posicionTop3 === 1 ? 'Tu favorita'
    : props.posicionTop3 === 2 ? 'Tu segunda opción'
    : 'Tu tercera opción'

  const handleContactar = async () => {
    // Validar campos requeridos
    if (!nombre.trim()) {
      setError('Por favor ingresá tu nombre')
      return
    }
    if (!whatsapp.trim() || whatsapp.length < 8) {
      setError('Por favor ingresá un WhatsApp válido')
      return
    }

    setEstado('cargando')
    setError('')

    try {
      const response = await fetch('/api/contactar-broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Datos del usuario (capturados aquí)
          usuarioNombre: nombre.trim(),
          usuarioWhatsapp: whatsapp.trim(),
          // Datos de la propiedad
          propiedadId: props.propiedadId,
          posicionTop3: props.posicionTop3,
          proyectoNombre: props.proyectoNombre,
          precioUsd: props.precioUsd,
          estadoConstruccion: props.estadoConstruccion,
          diasEnMercado: props.diasEnMercado,
          // Datos del broker
          brokerNombre: props.brokerNombre,
          brokerWhatsapp: props.brokerWhatsapp,
          brokerInmobiliaria: props.brokerInmobiliaria,
          // Perfil del usuario para preguntas dinámicas
          necesitaParqueo: props.necesitaParqueo,
          necesitaBaulera: props.necesitaBaulera,
          tieneMascotas: props.tieneMascotas,
          innegociables: props.innegociables,
          // Datos de la propiedad para preguntas
          tieneParqueo: props.tieneParqueo,
          tieneBaulera: props.tieneBaulera,
          petFriendlyConfirmado: props.petFriendlyConfirmado
        })
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Error desconocido')

      setCodigoRef(data.codigoRef)
      setMensajeWhatsapp(data.mensajeWhatsapp)
      setWhatsappUrl(data.whatsappUrl)
      setEstado('listo')
    } catch (err) {
      setError((err as Error).message)
      setEstado('error')
    }
  }

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensajeWhatsapp)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Fallback para navegadores sin clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = mensajeWhatsapp
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  const handleAbrirWhatsapp = () => {
    window.open(whatsappUrl, '_blank')
  }

  if (!props.isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                📱 Contactar Broker
              </h2>
              <p className="text-sm text-gray-500">
                {props.proyectoNombre} · {posicionLabel}
              </p>
            </div>
            <button
              onClick={props.onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Estado captura - Formulario de datos */}
          {estado === 'captura' && (
            <div className="space-y-4">
              {/* Info del broker */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-2">
                  <span className="font-medium">Broker:</span> {props.brokerNombre}
                  {props.brokerInmobiliaria && (
                    <span className="text-gray-400"> · {props.brokerInmobiliaria}</span>
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Precio:</span> ${props.precioUsd?.toLocaleString() || '?'}
                </p>
              </div>

              <p className="text-gray-600 text-sm text-center">
                Ingresá tus datos para generar un mensaje personalizado con las preguntas importantes
              </p>

              {/* Formulario */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Tu nombre *
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: María García"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Tu WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Ej: 76543210"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Solo nosotros tendremos tu número para seguimiento
                  </p>
                </div>

                {error && (
                  <p className="text-red-500 text-sm text-center">{error}</p>
                )}

                <button
                  onClick={handleContactar}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors"
                >
                  Preparar mensaje
                </button>
              </div>
            </div>
          )}

          {/* Cargando */}
          {estado === 'cargando' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Preparando tu mensaje...</p>
            </div>
          )}

          {/* Error */}
          {estado === 'error' && (
            <div className="text-center py-6">
              <div className="text-red-500 text-4xl mb-4">⚠️</div>
              <p className="text-red-600 mb-4 text-sm">{error}</p>
              <button
                onClick={() => setEstado('captura')}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Volver a intentar
              </button>
            </div>
          )}

          {/* Listo */}
          {estado === 'listo' && (
            <div className="space-y-4">
              {/* Código REF */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <p className="text-xs text-blue-600 mb-1">Tu código de referencia</p>
                <p className="text-2xl font-bold text-blue-700">#{codigoRef}</p>
              </div>

              {/* Mensaje */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Mensaje preparado:
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                  {mensajeWhatsapp}
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={handleCopiar}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
                    copiado
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {copiado ? '✓ Copiado' : '📋 Copiar'}
                </button>
                <button
                  onClick={handleAbrirWhatsapp}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  💬 WhatsApp
                </button>
              </div>

              {/* Tip */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm text-amber-800">
                  💡 El código te identifica como comprador informado y te da atención prioritaria
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
