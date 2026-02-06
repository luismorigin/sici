import { useEffect, useState, useRef, useCallback } from 'react'
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

export interface UseAdminAuthReturn {
  admin: AdminUser | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
  hasRole: (roles: AdminRole[]) => boolean
}

export function useAdminAuth(requiredRoles?: AdminRole[]): UseAdminAuthReturn {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requiredRolesRef = useRef(requiredRoles)

  useEffect(() => {
    if (!supabase) {
      setError('Error de configuración')
      setLoading(false)
      return
    }

    let cancelled = false
    let verified = false

    async function verifyAdmin(email: string) {
      if (verified || cancelled) return
      verified = true

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
          router.push('/admin/login?error=no_autorizado')
          return
        }

        const adminUser = data as AdminUser

        // Verificar rol si se requiere
        const roles = requiredRolesRef.current
        if (roles && !roles.includes(adminUser.rol)) {
          setError('No tenés permisos para esta sección')
          router.push('/admin/salud?error=sin_permisos')
          return
        }

        setAdmin(adminUser)

        // Setear cookie para que el middleware permita acceso
        document.cookie = 'sici_admin=1; path=/admin; max-age=86400; SameSite=Strict'

        // Actualizar last_login (fire-and-forget)
        supabase!
          .from('admin_users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', adminUser.id)
          .then()

      } catch (err) {
        if (!cancelled) {
          setError('Error al verificar sesión')
          router.push('/admin/login')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    function redirectToLogin() {
      if (verified || cancelled) return
      verified = true
      document.cookie = 'sici_admin=; path=/admin; max-age=0'
      const returnTo = router.asPath !== '/admin/login' ? router.asPath : ''
      router.push(returnTo ? `/admin/login?return_to=${encodeURIComponent(returnTo)}` : '/admin/login')
      setLoading(false)
    }

    // onAuthStateChange con INITIAL_SESSION (Supabase v2.39+)
    // Esto es más confiable que getSession() porque espera a que el
    // auth state se cargue completamente de localStorage antes de emitir.
    // Resuelve el bug de navegación client-side donde getSession() retorna
    // null momentáneamente porque GoTrueClient no terminó de inicializar.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || verified) return

      if (event === 'INITIAL_SESSION') {
        // Auth state cargado de localStorage — decisión definitiva
        if (session?.user?.email) {
          verifyAdmin(session.user.email)
        } else {
          redirectToLogin()
        }
      } else if (event === 'SIGNED_IN' && session?.user?.email) {
        // Fallback: si INITIAL_SESSION no tenía sesión pero luego llega SIGNED_IN
        verifyAdmin(session.user.email)
      }
    })

    // Safety timeout: si en 5 segundos no hay evento de auth, redirigir a login
    const timeout = setTimeout(() => {
      if (!verified && !cancelled) {
        redirectToLogin()
      }
    }, 5000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  const logout = useCallback(async () => {
    if (!supabase) return
    document.cookie = 'sici_admin=; path=/admin; max-age=0'
    await supabase.auth.signOut()
    setAdmin(null)
    router.push('/admin/login')
  }, [router])

  const hasRole = useCallback((roles: AdminRole[]): boolean => {
    if (!admin) return false
    return roles.includes(admin.rol)
  }, [admin])

  return { admin, loading, error, logout, hasRole }
}
