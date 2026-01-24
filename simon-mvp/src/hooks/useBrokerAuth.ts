import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export interface Broker {
  id: string
  email: string
  nombre: string
  telefono: string | null
  whatsapp: string | null
  empresa: string | null
  inmobiliaria: string | null
  cma_creditos: number
  es_founding_broker: boolean
  tier: 'beta' | 'founding' | 'premium' | 'standard'
  activo: boolean
  badge: string | null
  // Campos de verificación
  estado_verificacion: 'pendiente' | 'verificado' | 'rechazado' | 'pre_registrado'
  tipo_cuenta: 'broker' | 'desarrolladora'
  fuente_registro: 'manual' | 'scraping' | 'invitacion'
  total_propiedades: number
}

export interface UseBrokerAuthReturn {
  broker: Broker | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
  isVerified: boolean
}

export function useBrokerAuth(requireAuth: boolean = true): UseBrokerAuthReturn {
  const router = useRouter()
  const [broker, setBroker] = useState<Broker | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session && requireAuth) {
        router.push('/broker/login')
      } else if (session) {
        fetchBrokerData(session.user.email!)
      }
    }) || { data: { subscription: null } }

    return () => {
      subscription?.unsubscribe()
    }
  }, [requireAuth])

  const checkAuth = async () => {
    if (!supabase) {
      setError('Error de configuración')
      setLoading(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        if (requireAuth) {
          router.push('/broker/login')
        }
        setLoading(false)
        return
      }

      await fetchBrokerData(session.user.email!)
    } catch (err) {
      setError('Error al verificar sesión')
      setLoading(false)
    }
  }

  const fetchBrokerData = async (email: string) => {
    if (!supabase) return

    try {
      const { data, error: brokerError } = await supabase
        .from('brokers')
        .select('*')
        .eq('email', email)
        .single()

      if (brokerError) {
        setError('No se encontró cuenta de broker')
        if (requireAuth) {
          await supabase.auth.signOut()
          router.push('/broker/login')
        }
        return
      }

      if (!data.activo) {
        setError('Tu cuenta está desactivada')
        if (requireAuth) {
          await supabase.auth.signOut()
          router.push('/broker/login')
        }
        return
      }

      setBroker(data as Broker)
    } catch (err) {
      setError('Error al cargar datos del broker')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setBroker(null)
    router.push('/broker/login')
  }

  const isVerified = broker?.estado_verificacion === 'verificado'

  return { broker, loading, error, logout, isVerified }
}
