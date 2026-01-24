import { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useBrokerAuth, Broker } from '@/hooks/useBrokerAuth'

interface BrokerLayoutProps {
  children: ReactNode
  title?: string
}

export default function BrokerLayout({ children, title }: BrokerLayoutProps) {
  const router = useRouter()
  const { broker, loading, error, logout } = useBrokerAuth(true)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (error || !broker) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Error de autenticación'}</p>
          <Link href="/broker/login" className="text-amber-600 hover:underline">
            Volver al login
          </Link>
        </div>
      </div>
    )
  }

  const navigation = [
    { name: 'Dashboard', href: '/broker/dashboard', icon: '📊' },
    { name: 'Nueva Propiedad', href: '/broker/nueva-propiedad', icon: '➕' },
    { name: 'Mis Leads', href: '/broker/leads', icon: '👥' },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/broker/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold text-slate-900">
                Simón <span className="text-amber-500">Broker</span>
              </span>
              {broker.es_founding_broker && (
                <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-medium">
                  Founding
                </span>
              )}
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`text-sm font-medium transition-colors ${
                    router.pathname === item.href
                      ? 'text-amber-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-900">{broker.nombre}</p>
                <p className="text-xs text-slate-500">{broker.empresa || broker.email}</p>
              </div>
              <button
                onClick={logout}
                className="text-sm text-slate-600 hover:text-red-600 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-slate-200">
          <div className="flex justify-around py-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                  router.pathname === item.href
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="block text-center text-lg mb-1">{item.icon}</span>
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {title && (
          <h1 className="text-2xl font-bold text-slate-900 mb-6">{title}</h1>
        )}
        {children}
      </main>

      {/* CMA Credits Badge */}
      <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg px-4 py-2 border border-slate-200">
        <p className="text-xs text-slate-500">Créditos CMA</p>
        <p className="text-lg font-bold text-amber-600">{broker.cma_creditos}</p>
      </div>
    </div>
  )
}
