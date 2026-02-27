// Modal Beta Feedback: Captura datos + feedback ANTES de entregar informe premium
// Flujo: Ver valor → Datos personales → Feedback → Desbloquear informe
// Estilo Premium: Negro #0a0a0a, Crema #f8f6f3, Oro #c9a959

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const TOTAL_BETA_SPOTS = 50

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
  // DEV: Pre-llenar campos para testing (detecta localhost)
  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'

  const [paso, setPaso] = useState<Paso>(isDev ? 'datos' : 'valor')

  // Datos del usuario (pre-llenados en dev)
  const [nombre, setNombre] = useState(isDev ? 'Test User' : '')
  const [whatsapp, setWhatsapp] = useState(isDev ? '76543210' : '')
  const [email, setEmail] = useState('')

  // Feedback (pre-seleccionados en dev)
  const [feedbackRecomendaria, setFeedbackRecomendaria] = useState(isDev ? 'definitivamente' : '')
  const [feedbackMasUtil, setFeedbackMasUtil] = useState(isDev ? 'todo' : '')
  const [feedbackMejoras, setFeedbackMejoras] = useState('')

  const [error, setError] = useState('')

  // Contador de beta testers (lugares restantes)
  const [betaCount, setBetaCount] = useState<number | null>(null)
  const lugaresRestantes = betaCount !== null ? Math.max(0, TOTAL_BETA_SPOTS - betaCount) : null

  useEffect(() => {
    const fetchBetaCount = async () => {
      if (!supabase) return

      const { count } = await supabase
        .from('leads_mvp')
        .select('*', { count: 'exact', head: true })
        .eq('es_beta_tester', true)

      if (count !== null) {
        setBetaCount(count)
      }
    }

    if (isOpen) {
      fetchBetaCount()
    }
  }, [isOpen])

  const handleSubmit = async () => {
    // Validar feedback
    if (!feedbackRecomendaria || !feedbackMasUtil) {
      setError('Por favor respondé las 2 preguntas')
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#0a0a0a] border border-[#c9a959]/30 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header - Premium Style */}
        <div className="bg-gradient-to-r from-[#0a0a0a] to-[#1a1a1a] p-5 rounded-t-2xl border-b border-[#c9a959]/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#f8f6f3] flex items-center gap-2">
                Tu Informe Premium
              </h2>
              <p className="text-[#c9a959] text-sm mt-1">
                Valorado en Bs. 299
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 border border-[#c9a959]/30 text-[#f8f6f3]/70 hover:text-[#c9a959] hover:border-[#c9a959] flex items-center justify-center transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* PASO 1: Mostrar valor */}
          {paso === 'valor' && (
            <div className="space-y-5">
              {/* Badge GRATIS con contador dinámico */}
              <div className="bg-[#c9a959]/10 border-2 border-[#c9a959] rounded-xl p-4 text-center">
                {lugaresRestantes === null ? (
                  <span className="text-2xl font-bold text-[#c9a959]">
                    GRATIS por tiempo limitado
                  </span>
                ) : lugaresRestantes === 0 ? (
                  <span className="text-2xl font-bold text-[#c9a959]">
                    Lista de espera
                  </span>
                ) : lugaresRestantes <= 5 ? (
                  <span className="text-2xl font-bold text-[#c9a959]">
                    GRATIS — ¡Últimos {lugaresRestantes} lugares!
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-[#c9a959]">
                    GRATIS — Quedan {lugaresRestantes} lugares
                  </span>
                )}
                <p className="text-[#f8f6f3]/70 text-sm mt-1">
                  Ayudanos con tu feedback y recibilo sin costo
                </p>
              </div>

              {/* Lo que incluye */}
              <div>
                <p className="font-semibold text-[#f8f6f3] mb-3">Tu informe incluye:</p>
                <div className="space-y-2">
                  {[
                    'Ranking de tus 3 mejores opciones',
                    'Comparación de precios por m²',
                    'Posición de cada propiedad vs el mercado',
                    'Razones personalizadas según tu perfil',
                    'Contacto directo con el broker'
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[#c9a959] mt-0.5">✓</span>
                      <span className="text-[#f8f6f3]/80 text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setPaso('datos')}
                className="w-full py-3 bg-[#c9a959] hover:bg-[#b5935a] text-[#0a0a0a] font-semibold rounded-xl transition-colors"
              >
                Quiero mi informe gratis
              </button>
            </div>
          )}

          {/* PASO 2: Capturar datos */}
          {paso === 'datos' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <p className="text-[#f8f6f3]/70">
                  Para enviarte tu informe personalizado
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-[#f8f6f3] mb-1 block">
                  Tu nombre *
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Maria Garcia"
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#c9a959]/30 rounded-xl text-[#f8f6f3] placeholder-[#f8f6f3]/40 focus:outline-none focus:ring-2 focus:ring-[#c9a959] focus:border-transparent"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#f8f6f3] mb-1 block">
                  Tu WhatsApp *
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Ej: 76543210"
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#c9a959]/30 rounded-xl text-[#f8f6f3] placeholder-[#f8f6f3]/40 focus:outline-none focus:ring-2 focus:ring-[#c9a959] focus:border-transparent"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#f8f6f3] mb-1 block">
                  Tu correo <span className="text-[#f8f6f3]/40">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ej: maria@email.com"
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#c9a959]/30 rounded-xl text-[#f8f6f3] placeholder-[#f8f6f3]/40 focus:outline-none focus:ring-2 focus:ring-[#c9a959] focus:border-transparent"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPaso('valor')}
                  className="flex-1 py-3 bg-[#333333] hover:bg-[#444444] text-[#f8f6f3] font-medium rounded-xl transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={() => {
                    if (validarDatos()) setPaso('feedback')
                  }}
                  className="flex-1 py-3 bg-[#c9a959] hover:bg-[#b5935a] text-[#0a0a0a] font-semibold rounded-xl transition-colors"
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
                <p className="text-[#f8f6f3]/70 text-sm">
                  Tu opinión nos ayuda a mejorar (30 segundos)
                </p>
              </div>

              {/* Q1: Recomendaria */}
              <div>
                <p className="font-medium text-[#f8f6f3] mb-2">
                  1. ¿Le recomendarías Simón a un amigo?
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
                          ? 'bg-[#c9a959]/20 border-[#c9a959] text-[#c9a959]'
                          : 'bg-[#1a1a1a] border-[#c9a959]/30 text-[#f8f6f3]/70 hover:border-[#c9a959]/60'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q2: Mas util */}
              <div>
                <p className="font-medium text-[#f8f6f3] mb-2">
                  2. ¿Qué te pareció más útil?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'comparacion_precios', label: 'Comparar precios' },
                    { value: 'posicion_mercado', label: 'Posición vs mercado' },
                    { value: 'info_proyectos', label: 'Info de proyectos' },
                    { value: 'todo', label: 'Todo me pareció útil' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFeedbackMasUtil(opt.value)}
                      className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                        feedbackMasUtil === opt.value
                          ? 'bg-[#c9a959]/20 border-[#c9a959] text-[#c9a959]'
                          : 'bg-[#1a1a1a] border-[#c9a959]/30 text-[#f8f6f3]/70 hover:border-[#c9a959]/60'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Q3: Mejoras (opcional) */}
              <div>
                <p className="font-medium text-[#f8f6f3] mb-2">
                  3. ¿Qué mejorarías de Simón? <span className="text-[#f8f6f3]/40 font-normal">(opcional)</span>
                </p>
                <textarea
                  value={feedbackMejoras}
                  onChange={(e) => setFeedbackMejoras(e.target.value)}
                  placeholder="Ej: Me gustaría ver más fotos, filtrar por amenidades..."
                  rows={2}
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#c9a959]/30 rounded-xl text-[#f8f6f3] placeholder-[#f8f6f3]/40 focus:outline-none focus:ring-2 focus:ring-[#c9a959] focus:border-transparent text-sm resize-none"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPaso('datos')}
                  className="flex-1 py-3 bg-[#333333] hover:bg-[#444444] text-[#f8f6f3] font-medium rounded-xl transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 py-3 bg-[#c9a959] hover:bg-[#b5935a] text-[#0a0a0a] font-semibold rounded-xl transition-colors"
                >
                  Desbloquear informe
                </button>
              </div>
            </div>
          )}

          {/* Estado: Enviando */}
          {paso === 'enviando' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-4 border-[#c9a959] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#f8f6f3]/70">Preparando tu informe...</p>
            </div>
          )}

          {/* Estado: Error */}
          {paso === 'error' && (
            <div className="text-center py-6">
              <div className="text-red-400 text-4xl mb-4">:(</div>
              <p className="text-red-400 mb-4 text-sm">{error}</p>
              <button
                onClick={() => setPaso('feedback')}
                className="px-6 py-2 bg-[#333333] hover:bg-[#444444] text-[#f8f6f3] rounded-lg transition-colors"
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
