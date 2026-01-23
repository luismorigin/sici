// Modal Beta Feedback: Captura datos + feedback ANTES de entregar informe premium
// Flujo: Ver valor → Datos personales → Feedback → Desbloquear informe

import { useState } from 'react'

interface FeedbackPremiumModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (leadId: number, codigoRef: string, nombre: string, whatsapp: string) => void
  // Contexto de la búsqueda (para guardar en el lead)
  formularioRaw: Record<string, unknown>
}

type Paso = 'valor' | 'datos' | 'feedback' | 'enviando' | 'error'

export default function FeedbackPremiumModal({
  isOpen,
  onClose,
  onSuccess,
  formularioRaw
}: FeedbackPremiumModalProps) {
  const [paso, setPaso] = useState<Paso>('valor')

  // Datos del usuario
  const [nombre, setNombre] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')

  // Feedback
  const [feedbackRecomendaria, setFeedbackRecomendaria] = useState('')
  const [feedbackAlineadas, setFeedbackAlineadas] = useState('')
  const [feedbackHonestidad, setFeedbackHonestidad] = useState('')
  const [feedbackMasUtil, setFeedbackMasUtil] = useState('')
  const [feedbackMejoras, setFeedbackMejoras] = useState('')

  const [error, setError] = useState('')

  const handleSubmit = async () => {
    // Validar feedback
    if (!feedbackRecomendaria || !feedbackAlineadas || !feedbackHonestidad || !feedbackMasUtil) {
      setError('Por favor respondé las 4 preguntas')
      return
    }

    setPaso('enviando')
    setError('')

    try {
      const response = await fetch('/api/crear-lead-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          whatsapp: whatsapp.trim(),
          email: email.trim() || undefined,
          feedbackRecomendaria,
          feedbackAlineadas,
          feedbackHonestidad,
          feedbackMasUtil,
          feedbackMejoras: feedbackMejoras.trim() || undefined,
          formularioRaw
        })
      })

      if (!response.ok) {
        const text = await response.text()
        console.error('API error:', response.status, text.substring(0, 200))
        throw new Error(`Error del servidor (${response.status})`)
      }

      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Error desconocido')

      onSuccess(data.leadId, data.codigoRef, nombre.trim(), whatsapp.trim())
    } catch (err) {
      setError((err as Error).message)
      setPaso('error')
    }
  }

  const validarDatos = () => {
    if (!nombre.trim()) {
      setError('Ingresá tu nombre')
      return false
    }
    if (!whatsapp.trim() || whatsapp.length < 8) {
      setError('Ingresá un WhatsApp válido')
      return false
    }
    setError('')
    return true
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-5 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Tu Informe Premium
              </h2>
              <p className="text-emerald-100 text-sm mt-1">
                Valorado en $49.99
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-2xl leading-none p-1"
            >
              x
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* PASO 1: Mostrar valor */}
          {paso === 'valor' && (
            <div className="space-y-5">
              {/* Badge GRATIS */}
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
                <span className="text-2xl font-bold text-amber-600">
                  GRATIS para los primeros 50
                </span>
                <p className="text-amber-700 text-sm mt-1">
                  Ayudanos con tu feedback y recibilo sin costo
                </p>
              </div>

              {/* Lo que incluye */}
              <div>
                <p className="font-semibold text-gray-800 mb-3">Tu informe incluye:</p>
                <div className="space-y-2">
                  {[
                    'Ranking de tus 3 mejores opciones',
                    'Comparación de precios por m²',
                    'Posición de cada propiedad vs el mercado',
                    'Información del desarrollador',
                    'Razones personalizadas según tu perfil',
                    'Contacto directo con el broker'
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5">&#10003;</span>
                      <span className="text-gray-700 text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setPaso('datos')}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors"
              >
                Quiero mi informe gratis
              </button>
            </div>
          )}

          {/* PASO 2: Capturar datos */}
          {paso === 'datos' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <p className="text-gray-600">
                  Para enviarte tu informe personalizado
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Tu nombre *
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Maria Garcia"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Tu correo <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ej: maria@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPaso('valor')}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                >
                  Atras
                </button>
                <button
                  onClick={() => {
                    if (validarDatos()) setPaso('feedback')
                  }}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: Feedback */}
          {paso === 'feedback' && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <p className="text-gray-600 text-sm">
                  Tu opinion nos ayuda a mejorar (30 segundos)
                </p>
              </div>

              {/* Q1: Recomendaria */}
              <div>
                <p className="font-medium text-gray-800 mb-2">
                  1. Le recomendarias Simon a un amigo?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'definitivamente', label: 'Definitivamente' },
                    { value: 'probablemente', label: 'Probablemente' },
                    { value: 'no_seguro', label: 'No estoy seguro' },
                    { value: 'no', label: 'No' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFeedbackRecomendaria(opt.value)}
                      className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                        feedbackRecomendaria === opt.value
                          ? 'bg-emerald-100 border-emerald-500 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q2: Alineadas */}
              <div>
                <p className="font-medium text-gray-800 mb-2">
                  2. Las propiedades que viste estaban alineadas con lo que buscas?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'perfectamente', label: 'Perfectamente' },
                    { value: 'bastante', label: 'Bastante bien' },
                    { value: 'poco', label: 'Poco alineadas' },
                    { value: 'nada', label: 'Para nada' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFeedbackAlineadas(opt.value)}
                      className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                        feedbackAlineadas === opt.value
                          ? 'bg-emerald-100 border-emerald-500 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q3: Honestidad */}
              <div>
                <p className="font-medium text-gray-800 mb-2">
                  3. Sentiste que Simon te mostro informacion honesta, sin tratar de venderte?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'totalmente', label: 'Totalmente' },
                    { value: 'mayormente', label: 'Mayormente si' },
                    { value: 'algo', label: 'Algo' },
                    { value: 'no', label: 'No' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFeedbackHonestidad(opt.value)}
                      className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                        feedbackHonestidad === opt.value
                          ? 'bg-emerald-100 border-emerald-500 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q4: Mas util */}
              <div>
                <p className="font-medium text-gray-800 mb-2">
                  4. Que te parecio mas util?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'comparacion_precios', label: 'Comparar precios' },
                    { value: 'posicion_mercado', label: 'Posicion vs mercado' },
                    { value: 'info_proyectos', label: 'Info de proyectos' },
                    { value: 'todo', label: 'Todo me parecio util' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFeedbackMasUtil(opt.value)}
                      className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                        feedbackMasUtil === opt.value
                          ? 'bg-emerald-100 border-emerald-500 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q5: Mejoras (opcional) */}
              <div>
                <p className="font-medium text-gray-800 mb-2">
                  5. Que mejorarias de Simon? <span className="text-gray-400 font-normal">(opcional)</span>
                </p>
                <textarea
                  value={feedbackMejoras}
                  onChange={(e) => setFeedbackMejoras(e.target.value)}
                  placeholder="Ej: Me gustaria ver mas fotos, filtrar por amenidades..."
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm resize-none"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPaso('datos')}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                >
                  Atras
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors"
                >
                  Desbloquear informe
                </button>
              </div>
            </div>
          )}

          {/* Estado: Enviando */}
          {paso === 'enviando' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Preparando tu informe...</p>
            </div>
          )}

          {/* Estado: Error */}
          {paso === 'error' && (
            <div className="text-center py-6">
              <div className="text-red-500 text-4xl mb-4">:(</div>
              <p className="text-red-600 mb-4 text-sm">{error}</p>
              <button
                onClick={() => setPaso('feedback')}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Volver a intentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
