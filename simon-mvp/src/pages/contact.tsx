import { useState } from 'react'
import { motion } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function Contact() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{nombre?: string; whatsapp?: string}>({})

  // Validar WhatsApp Bolivia: +591 + 8 dígitos (empieza con 6, 7 u 8)
  const validateWhatsApp = (phone: string): boolean => {
    const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '')
    const patterns = [
      /^\+591[678]\d{7}$/,
      /^591[678]\d{7}$/,
      /^[678]\d{7}$/
    ]
    return patterns.some(p => p.test(cleaned))
  }

  const formatWhatsApp = (phone: string): string => {
    const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '')
    if (/^[678]\d{7}$/.test(cleaned)) return `+591${cleaned}`
    if (/^591[678]\d{7}$/.test(cleaned)) return `+${cleaned}`
    return cleaned
  }

  const getDeviceType = (): string => {
    if (typeof window === 'undefined') return 'unknown'
    const ua = navigator.userAgent
    if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile'
    if (/iPad|Tablet/i.test(ua)) return 'tablet'
    return 'desktop'
  }

  const handleSubmit = async () => {
    // Validar
    const newErrors: {nombre?: string; whatsapp?: string} = {}

    if (!nombre.trim()) {
      newErrors.nombre = 'Ingresa tu nombre'
    } else if (nombre.trim().length < 2) {
      newErrors.nombre = 'Nombre muy corto'
    }

    if (!whatsapp.trim()) {
      newErrors.whatsapp = 'Ingresa tu WhatsApp'
    } else if (!validateWhatsApp(whatsapp)) {
      newErrors.whatsapp = 'Formato: 7XXXXXXX o +591 7XXXXXXX'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setLoading(true)

    try {
      // Verificar conexión a Supabase
      if (!supabase) {
        throw new Error('Supabase no configurado')
      }

      // Crear lead inicial en Supabase
      const { data, error } = await supabase.rpc('crear_lead_inicial', {
        p_nombre: nombre.trim(),
        p_whatsapp: formatWhatsApp(whatsapp),
        p_dispositivo: getDeviceType()
      })

      if (error) throw error

      // Guardar lead_id en localStorage
      localStorage.setItem('simon_lead_id', String(data))
      localStorage.setItem('simon_lead_nombre', nombre.trim())

      // Notificar a Slack (async, no bloqueante)
      fetch('/api/notify-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'lead_created',
          leadId: data,
          data: { nombre: nombre.trim(), whatsapp: formatWhatsApp(whatsapp) }
        })
      }).catch(() => {}) // Ignorar errores de Slack

      // Ir al formulario
      router.push('/form')

    } catch (error: any) {
      console.error('Error creando lead:', error)
      setErrors({ nombre: 'Error guardando datos. Intenta de nuevo.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Simon - Tu contacto</title>
        <meta name="description" content="Dejanos tu contacto para empezar" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="w-14 h-14 bg-neutral-900 rounded-2xl flex items-center justify-center">
            <span className="text-2xl text-white">S</span>
          </div>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center max-w-md mb-10"
        >
          <h1 className="text-3xl font-bold text-neutral-900 mb-3">
            Antes de empezar
          </h1>
          <p className="text-neutral-600">
            Dejanos tu contacto para guardar tu progreso y poder ayudarte mejor.
          </p>
        </motion.div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-md space-y-5"
        >
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Tu nombre
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value)
                if (errors.nombre) setErrors(prev => ({ ...prev, nombre: undefined }))
              }}
              placeholder="Ej: Juan Perez"
              className={`w-full px-4 py-3 rounded-xl border-2 bg-white text-neutral-900
                         focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all
                         ${errors.nombre ? 'border-red-500' : 'border-neutral-200'}`}
            />
            {errors.nombre && (
              <p className="text-red-500 text-sm mt-1">{errors.nombre}</p>
            )}
          </div>

          {/* WhatsApp */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Tu WhatsApp
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => {
                setWhatsapp(e.target.value)
                if (errors.whatsapp) setErrors(prev => ({ ...prev, whatsapp: undefined }))
              }}
              placeholder="Ej: 70000000"
              className={`w-full px-4 py-3 rounded-xl border-2 bg-white text-neutral-900
                         focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all
                         ${errors.whatsapp ? 'border-red-500' : 'border-neutral-200'}`}
            />
            {errors.whatsapp && (
              <p className="text-red-500 text-sm mt-1">{errors.whatsapp}</p>
            )}
            <p className="text-neutral-400 text-sm mt-1">
              Solo usamos WhatsApp para contactarte si lo solicitas.
            </p>
          </div>

          {/* Submit Button */}
          <motion.button
            onClick={handleSubmit}
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all
                       flex items-center justify-center gap-3
                       ${loading
                         ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                         : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Guardando...
              </>
            ) : (
              <>
                Empezar el cuestionario
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </>
            )}
          </motion.button>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-6 mt-10 text-neutral-400 text-sm"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>Datos seguros</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Sin spam</span>
          </div>
        </motion.div>
      </main>
    </>
  )
}
