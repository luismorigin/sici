import { useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAdminAuthContext } from '@/contexts/AdminAuthContext'

// Re-export types so existing imports keep working
export type { AdminRole, AdminUser } from '@/contexts/AdminAuthContext'
import type { AdminRole } from '@/contexts/AdminAuthContext'

export interface UseAdminAuthReturn {
  admin: import('@/contexts/AdminAuthContext').AdminUser | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
  hasRole: (roles: AdminRole[]) => boolean
}

/**
 * useAdminAuth — thin wrapper around AdminAuthContext.
 *
 * Auth is verified ONCE in AdminAuthProvider (_app.tsx).
 * This hook just reads the shared state and adds per-page role checks.
 * No more independent onAuthStateChange per page = no more flash-to-login.
 */
export function useAdminAuth(requiredRoles?: AdminRole[]): UseAdminAuthReturn {
  const router = useRouter()
  const { admin, loading, error, logout } = useAdminAuthContext()

  // Per-page role gate: if the user is loaded but doesn't have the required role,
  // redirect to /admin/salud (same behavior as before)
  const roleBlocked = !loading && admin && requiredRoles && !requiredRoles.includes(admin.rol)

  if (roleBlocked) {
    // Can't call router.push during render, but we return error state
    // and the page will show the error. For redirect, use an effect in the page
    // or we handle it here with a safe pattern:
    if (typeof window !== 'undefined' && router.asPath !== '/admin/salud') {
      // Use replace to avoid adding to history
      router.replace('/admin/salud?error=sin_permisos')
    }
    return {
      admin: null,
      loading: false,
      error: 'No tenés permisos para esta sección',
      logout,
      hasRole: () => false
    }
  }

  const hasRole = useCallback((roles: AdminRole[]): boolean => {
    if (!admin) return false
    return roles.includes(admin.rol)
  }, [admin])

  return { admin, loading, error, logout, hasRole }
}
