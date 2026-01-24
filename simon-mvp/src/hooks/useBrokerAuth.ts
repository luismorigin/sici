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
  isImpersonating: boolean
  exitImpersonation: () => void
}

// Constante para sessionStorage
const IMPERSONATE_KEY = 'admin_impersonate_broker_id'

// Función para iniciar impersonación (usada desde admin)
export function startImpersonation(brokerId: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(IMPERSONATE_KEY, brokerId)
  }
}

// Función para salir de impersonación
export function exitImpersonation() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(IMPERSONATE_KEY)
  }
}

// Obtener ID de broker impersonado
export function getImpersonatedBrokerId(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(IMPERSONATE_KEY)
  }
  return null
}

export function useBrokerAuth(requireAuth: boolean = true): UseBrokerAuthReturn {
  const router = useRouter()
  const [broker, setBroker] = useState<Broker | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isImpersonating, setIsImpersonating] = useState(false)

  useEffect(() => {
    checkAuth()

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session && requireAuth && !getImpersonatedBrokerId()) {
        router.push('/broker/login')
      } else if (session) {
        // Verificar si hay impersonación activa
        const impersonatedId = getImpersonatedBrokerId()
        if (impersonatedId) {
          fetchBrokerById(impersonatedId)
        } else {
          fetchBrokerData(session.user.email!)
        }
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
      // Primero verificar si hay impersonación activa
      const impersonatedId = getImpersonatedBrokerId()

      if (impersonatedId) {
        // Admin está impersonando a un broker
        await fetchBrokerById(impersonatedId)
        return
      }

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

  // Cargar broker por ID (para impersonación)
  const fetchBrokerById = async (brokerId: string) => {
    if (!supabase) return

    try {
      const { data, error: brokerError } = await supabase
        .from('brokers')
        .select('*')
        .eq('id', brokerId)
        .single()

      if (brokerError) {
        setError('No se encontró el broker')
        exitImpersonation()
        router.push('/admin/brokers')
        return
      }

      setBroker(data as Broker)
      setIsImpersonating(true)
    } catch (err) {
      setError('Error al cargar datos del broker')
      exitImpersonation()
    } finally {
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
      setIsImpersonating(false)
    } catch (err) {
      setError('Error al cargar datos del broker')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    if (!supabase) return

    // Si está impersonando, solo salir de impersonación
    if (isImpersonating) {
      exitImpersonation()
      router.push('/admin/brokers')
      return
    }

    await supabase.auth.signOut()
    setBroker(null)
    router.push('/broker/login')
  }

  const handleExitImpersonation = () => {
    exitImpersonation()
    router.push('/admin/brokers')
  }

  const isVerified = broker?.estado_verificacion === 'verificado'

  return { broker, loading, error, logout, isVerified, isImpersonating, exitImpersonation: handleExitImpersonation }
}
