import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

export default function BrokerLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setError('Error de configuración')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : authError.message)
        return
      }

      if (data.user) {
        // Verificar si es un broker registrado
        const { data: broker, error: brokerError } = await supabase
          .from('brokers')
          .select('id, nombre, activo, email_verificado')
          .eq('email', email)
          .single()

        if (brokerError || !broker) {
          setError('Tu cuenta no está registrada como broker. Contacta a soporte.')
          await supabase.auth.signOut()
          return
        }

        if (!broker.activo) {
          setError('Tu cuenta de broker está desactivada. Contacta a soporte.')
          await supabase.auth.signOut()
          return
        }

        // Login exitoso - redirigir al dashboard
        router.push('/broker/dashboard')
      }
    } catch (err) {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setError('Error de configuración')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Verificar si el email ya existe como broker
      const { data: existingBroker } = await supabase
        .from('brokers')
        .select('id')
        .eq('email', email)
        .single()

      if (!existingBroker) {
        setError('Este email no está pre-registrado. Contacta a Simón para obtener acceso.')
        setLoading(false)
        return
      }

      // Crear cuenta en Supabase Auth
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/broker/dashboard`
        }
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Este email ya tiene una cuenta. Intenta iniciar sesión.')
        } else {
          setError(authError.message)
        }
        return
      }

      if (data.user) {
        // Actualizar broker con el auth_user_id
        await supabase
          .from('brokers')
          .update({
            auth_user_id: data.user.id,
            email_verificado: false
          })
          .eq('email', email)

        setError(null)
        alert('Cuenta creada. Revisa tu email para verificar tu cuenta.')
        setMode('login')
      }
    } catch (err) {
      setError('Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Portal Broker | Simón</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Simón <span className="text-amber-400">Broker</span>
            </h1>
            <p className="text-slate-400">Portal exclusivo para brokers</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            {/* Tabs */}
            <div className="flex mb-6 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => setMode('register')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Registrarse
              </button>
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                    placeholder="tu@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? 'Cargando...'
                    : mode === 'login'
                      ? 'Iniciar Sesión'
                      : 'Crear Cuenta'
                  }
                </button>
              </div>
            </form>

            {mode === 'register' && (
              <p className="mt-4 text-xs text-slate-500 text-center">
                Solo brokers pre-registrados pueden crear cuenta.
                <br />
                Contacta a <span className="text-amber-600">soporte@simon.bo</span> para obtener acceso.
              </p>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-slate-500 text-sm mt-6">
            ¿Problemas para acceder?{' '}
            <a href="mailto:soporte@simon.bo" className="text-amber-400 hover:text-amber-300">
              Contactar soporte
            </a>
          </p>
        </div>
      </div>
    </>
  )
}
