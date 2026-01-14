'use client'

import { useState } from 'react'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import { guardarLead, type LeadResult } from '@/lib/supabase'

export default function LeadForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    whatsapp: ''
  })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [leadId, setLeadId] = useState<number | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result: LeadResult = await guardarLead(form)

      if (result.success) {
        setSubmitted(true)
        if (result.leadId) {
          setLeadId(result.leadId)
          console.log('Lead guardado con ID:', result.leadId)
        }
        // Redirect a búsqueda después de 2 segundos
        setTimeout(() => {
          router.push('/filtros')
        }, 2000)
      } else {
        // Si falla Supabase, igual mostrar éxito para UX (pero logear)
        console.warn('Lead no guardado en BD:', result.error)
        setSubmitted(true)
        setTimeout(() => {
          router.push('/filtros')
        }, 2000)
      }
    } catch (err) {
      console.error('Error en formulario:', err)
      setError('Hubo un error. Por favor intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <motion.div
        className="bg-white border-t border-slate-200 p-8 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-state-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-state-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-display text-2xl font-bold text-brand-dark mb-2">
            ¡Gracias, {form.nombre.split(' ')[0]}!
          </h3>
          <p className="text-slate-500">
            Redirigiendo a tu búsqueda personalizada...
          </p>
          <p className="text-xs text-slate-400 mt-2">
            También te enviaremos resultados a <strong>{form.email}</strong>
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="bg-white border-t border-slate-200 p-8" id="cta-form">
      <div className="max-w-md mx-auto text-center">
        <h3 className="font-display text-2xl font-bold text-brand-dark mb-2">
          Obtén este análisis para ti.
        </h3>
        <p className="text-slate-500 mb-6">
          Genera tu propio informe personalizado en menos de 2 minutos. Gratis y sin compromiso.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-semibold text-brand-dark mb-1">
              Tu Nombre Completo
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. Juan Pérez"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-brand-dark mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              className="form-input"
              placeholder="juan@ejemplo.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-brand-dark mb-1">
              Número de WhatsApp
            </label>
            <input
              type="tel"
              className="form-input"
              placeholder="+591 70000000"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-state-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-4 text-base mt-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Procesando...
              </span>
            ) : (
              <>
                Generar Mi Informe Gratis
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-slate-400 mt-4">
          Tus datos están seguros. No hacemos spam.
        </p>
      </div>
    </div>
  )
}
