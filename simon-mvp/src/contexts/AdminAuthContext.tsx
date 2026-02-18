import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export type AdminRole = 'super_admin' | 'supervisor' | 'viewer'

export interface AdminUser {
  id: string
  email: string
  nombre: string
  rol: AdminRole
  activo: boolean
}

interface AdminAuthContextValue {
  admin: AdminUser | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function useAdminAuthContext(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuthContext must be used inside <AdminAuthProvider>')
  }
  return ctx
}

/**
 * AdminAuthProvider — verifies Supabase session + admin_users ONCE,
 * then shares the result to all admin pages via context.
 *
 * This eliminates the per-page auth flash that caused the navigation bug
 * where each page independently ran onAuthStateChange + admin_users query.
 */
export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const verifiedRef = useRef(false)

  useEffect(() => {
    if (!supabase) {
      setError('Error de configuración')
      setLoading(false)
      return
    }

    // If already verified from a previous render (e.g. StrictMode),
    // skip re-verification
    if (verifiedRef.current && admin) {
      setLoading(false)
      return
    }

    let cancelled = false

    // TODO: REMOVER - bypass temporal para preview localhost
    if (process.env.NODE_ENV === 'development') {
      setAdmin({ id: 'dev', email: 'dev@localhost', nombre: 'Dev Preview', rol: 'super_admin', activo: true })
      setLoading(false)
      verifiedRef.current = true
      return
    }

    async function verifyAdmin(email: string) {
      if (cancelled) return

      try {
        const { data, error: queryError } = await supabase!
          .from('admin_users')
          .select('id, email, nombre, rol, activo')
          .eq('email', email)
          .eq('activo', true)
          .single()

        if (cancelled) return

        if (queryError || !data) {
          setError('No autorizado')
          document.cookie = 'sici_admin=; path=/admin; max-age=0'
          await supabase!.auth.signOut()
          router.replace('/admin/login?error=no_autorizado')
          setLoading(false)
          return
        }

        const adminUser = data as AdminUser
        verifiedRef.current = true
        setAdmin(adminUser)
        setLoading(false)

        // Refresh the middleware cookie (kept for potential future use)
        document.cookie = 'sici_admin=1; path=/; max-age=86400; SameSite=Lax'

        // Update last_login (fire-and-forget)
        supabase!
          .from('admin_users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', adminUser.id)
          .then()

      } catch {
        if (!cancelled) {
          setError('Error al verificar sesión')
          router.replace('/admin/login')
          setLoading(false)
        }
      }
    }

    function redirectToLogin() {
      if (cancelled) return
      document.cookie = 'sici_admin=; path=/admin; max-age=0'
      const returnTo = router.asPath !== '/admin/login' ? router.asPath : ''
      const url = returnTo
        ? `/admin/login?return_to=${encodeURIComponent(returnTo)}`
        : '/admin/login'
      router.replace(url)
      setLoading(false)
    }

    let resolved = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || resolved) return

      if (event === 'INITIAL_SESSION') {
        resolved = true
        if (session?.user?.email) {
          verifyAdmin(session.user.email)
        } else {
          redirectToLogin()
        }
      } else if (event === 'SIGNED_IN' && session?.user?.email) {
        resolved = true
        verifyAdmin(session.user.email)
      } else if (event === 'SIGNED_OUT') {
        // User signed out in another tab — clear state
        verifiedRef.current = false
        setAdmin(null)
        redirectToLogin()
      }
    })

    // Safety timeout: if no auth event in 5s, redirect to login
    const timeout = setTimeout(() => {
      if (!resolved && !cancelled) {
        redirectToLogin()
      }
    }, 5000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run ONCE on mount — this is the key fix

  const logout = useCallback(async () => {
    if (!supabase) return
    verifiedRef.current = false
    document.cookie = 'sici_admin=; path=/; max-age=0'
    await supabase.auth.signOut()
    setAdmin(null)
    router.push('/admin/login')
  }, [router])

  return (
    <AdminAuthContext.Provider value={{ admin, loading, error, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}
