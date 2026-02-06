import { useEffect, useState } from 'react'
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

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    if (!supabase) {
      setError('Error de configuración')
      setLoading(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        document.cookie = 'sici_admin=; path=/admin; max-age=0'
        router.push('/admin/login')
        return
      }

      // Verificar que el email esté en admin_users
      const { data, error: queryError } = await supabase
        .from('admin_users')
        .select('id, email, nombre, rol, activo')
        .eq('email', session.user.email!)
        .eq('activo', true)
        .single()

      if (queryError || !data) {
        setError('No autorizado')
        document.cookie = 'sici_admin=; path=/admin; max-age=0'
        await supabase.auth.signOut()
        router.push('/admin/login?error=no_autorizado')
        return
      }

      const adminUser = data as AdminUser

      // Verificar rol si se requiere
      if (requiredRoles && !requiredRoles.includes(adminUser.rol)) {
        setError('No tenés permisos para esta sección')
        router.push('/admin/salud?error=sin_permisos')
        return
      }

      setAdmin(adminUser)

      // Setear cookie para que el middleware permita acceso
      document.cookie = 'sici_admin=1; path=/admin; max-age=86400; SameSite=Strict'

      // Actualizar last_login (fire-and-forget)
      supabase
        .from('admin_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', adminUser.id)
        .then()

    } catch (err) {
      setError('Error al verificar sesión')
      router.push('/admin/login')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    if (!supabase) return
    // Borrar cookie del middleware
    document.cookie = 'sici_admin=; path=/admin; max-age=0'
    await supabase.auth.signOut()
    setAdmin(null)
    router.push('/admin/login')
  }

  const hasRole = (roles: AdminRole[]): boolean => {
    if (!admin) return false
    return roles.includes(admin.rol)
  }

  return { admin, loading, error, logout, hasRole }
}
