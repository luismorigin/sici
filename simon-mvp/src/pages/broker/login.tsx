import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

// Normalizar teléfono igual que en PostgreSQL
const normalizarTelefono = (tel: string): string => {
  if (!tel) return ''
  return tel.replace(/^\+591/, '').replace(/[^0-9]/g, '')
}

interface BrokerPreRegistrado {
  id: string
  nombre: string
  telefono: string
  inmobiliaria: string | null
  estado_verificacion: string
  propiedades_count: number
}

export default function BrokerLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [tipoCuenta, setTipoCuenta] = useState<'broker' | 'desarrolladora'>('broker')
  const [inmobiliaria, setInmobiliaria] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [brokerEncontrado, setBrokerEncontrado] = useState<BrokerPreRegistrado | null>(null)

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

  // Buscar broker pre-registrado por teléfono
  const buscarPorTelefono = async () => {
    if (!supabase || !telefono) return

    const telNorm = normalizarTelefono(telefono)
    if (telNorm.length < 7) {
      setBrokerEncontrado(null)
      return
    }

    try {
      // Buscar broker por teléfono normalizado
      const { data } = await supabase
        .from('brokers')
        .select('id, nombre, telefono, inmobiliaria, estado_verificacion, total_propiedades')
        .eq('telefono_normalizado', telNorm)
        .single()

      if (data) {
        setBrokerEncontrado({
          id: data.id,
          nombre: data.nombre,
          telefono: data.telefono,
          inmobiliaria: data.inmobiliaria,
          estado_verificacion: data.estado_verificacion,
          propiedades_count: data.total_propiedades || 0
        })
        // Auto-rellenar nombre si existe
        if (data.nombre && !nombre) {
          setNombre(data.nombre)
        }
      } else {
        setBrokerEncontrado(null)
      }
    } catch {
      setBrokerEncontrado(null)
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
    setSuccess(null)

    try {
      const telNorm = normalizarTelefono(telefono)

      // 1. Crear cuenta en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
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

      if (!authData.user) {
        setError('Error al crear cuenta')
        return
      }

      // 2. Verificar si existe broker pre-registrado con este teléfono
      if (brokerEncontrado) {
        // Vincular cuenta existente
        const { error: updateError } = await supabase
          .from('brokers')
          .update({
            auth_user_id: authData.user.id,
            email: email,
            email_verificado: false,
            estado_verificacion: 'verificado', // Auto-verificar porque coincide teléfono
            fecha_verificacion: new Date().toISOString(),
            verificado_por: 'auto_telefono',
            notas_verificacion: 'Verificado automáticamente por coincidencia de teléfono'
          })
          .eq('id', brokerEncontrado.id)

        if (updateError) {
          setError('Error al vincular cuenta: ' + updateError.message)
          return
        }

        setSuccess(`¡Bienvenido ${brokerEncontrado.nombre}! Encontramos ${brokerEncontrado.propiedades_count} propiedades tuyas. Revisa tu email para confirmar tu cuenta.`)
      } else {
        // 3. Crear nuevo broker (pendiente de verificación manual)
        const { error: insertError } = await supabase
          .from('brokers')
          .insert({
            auth_user_id: authData.user.id,
            nombre: nombre,
            email: email,
            telefono: telefono,
            telefono_normalizado: telNorm,
            tipo_cuenta: tipoCuenta,
            inmobiliaria: tipoCuenta === 'broker' ? inmobiliaria : null,
            empresa: tipoCuenta === 'desarrolladora' ? inmobiliaria : null,
            estado_verificacion: 'pendiente',
            fuente_registro: 'manual',
            email_verificado: false,
            activo: true
          })

        if (insertError) {
          // Si falla por email duplicado, intentar vincular
          if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
            setError('Este email o teléfono ya está registrado.')
          } else {
            setError('Error al crear broker: ' + insertError.message)
          }
          return
        }

        setSuccess('Cuenta creada. Tu cuenta será revisada y verificada pronto. Revisa tu email para confirmar.')
      }

      // Cambiar a modo login después de éxito
      setTimeout(() => {
        setMode('login')
        setSuccess(null)
      }, 5000)

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
                {/* Campos solo para registro */}
                {mode === 'register' && (
                  <>
                    {/* Teléfono - campo principal para verificación */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Teléfono <span className="text-amber-600">*</span>
                      </label>
                      <input
                        type="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        onBlur={buscarPorTelefono}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                        placeholder="+591 70000000"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Usamos tu teléfono para verificar tu identidad
                      </p>
                    </div>

                    {/* Mensaje si encontramos broker pre-registrado */}
                    {brokerEncontrado && (
                      <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                        <p className="font-medium">¡Te encontramos!</p>
                        <p>{brokerEncontrado.nombre}</p>
                        {brokerEncontrado.inmobiliaria && (
                          <p className="text-green-600">{brokerEncontrado.inmobiliaria}</p>
                        )}
                        <p className="text-green-600 mt-1">
                          {brokerEncontrado.propiedades_count} propiedades vinculadas
                        </p>
                      </div>
                    )}

                    {/* Nombre - solo si no se encontró broker */}
                    {!brokerEncontrado && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Nombre completo
                        </label>
                        <input
                          type="text"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                          placeholder="Tu nombre"
                          required={!brokerEncontrado}
                        />
                      </div>
                    )}

                    {/* Tipo de cuenta - solo si no se encontró broker */}
                    {!brokerEncontrado && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Tipo de cuenta
                        </label>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setTipoCuenta('broker')}
                            className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                              tipoCuenta === 'broker'
                                ? 'border-amber-500 bg-amber-50 text-amber-700'
                                : 'border-slate-300 text-slate-600 hover:border-slate-400'
                            }`}
                          >
                            Broker / Agente
                          </button>
                          <button
                            type="button"
                            onClick={() => setTipoCuenta('desarrolladora')}
                            className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                              tipoCuenta === 'desarrolladora'
                                ? 'border-amber-500 bg-amber-50 text-amber-700'
                                : 'border-slate-300 text-slate-600 hover:border-slate-400'
                            }`}
                          >
                            Desarrolladora
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inmobiliaria - solo para brokers nuevos */}
                    {!brokerEncontrado && tipoCuenta === 'broker' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Inmobiliaria
                        </label>
                        <select
                          value={inmobiliaria}
                          onChange={(e) => setInmobiliaria(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors bg-white"
                          required
                        >
                          <option value="">Selecciona tu inmobiliaria</option>
                          <option value="Century21">Century 21</option>
                          <option value="RE/MAX">RE/MAX</option>
                          <option value="Bien Inmuebles">Bien Inmuebles</option>
                        </select>
                      </div>
                    )}

                    {/* Nombre empresa - solo para desarrolladoras nuevas */}
                    {!brokerEncontrado && tipoCuenta === 'desarrolladora' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Nombre de la empresa
                        </label>
                        <input
                          type="text"
                          value={inmobiliaria}
                          onChange={(e) => setInmobiliaria(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                          placeholder="Ej: Grupo Constructor XYZ"
                          required
                        />
                      </div>
                    )}
                  </>
                )}

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

                {success && (
                  <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm">
                    {success}
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
                      : brokerEncontrado
                        ? 'Vincular mi cuenta'
                        : 'Crear Cuenta'
                  }
                </button>
              </div>
            </form>

            {mode === 'register' && (
              <p className="mt-4 text-xs text-slate-500 text-center">
                {brokerEncontrado ? (
                  <>
                    Tu teléfono coincide con un broker en nuestra base.
                    <br />
                    Al registrarte se vincularán tus propiedades automáticamente.
                  </>
                ) : (
                  <>
                    Si tu teléfono coincide con propiedades en el mercado,
                    <br />
                    tu cuenta será verificada automáticamente.
                  </>
                )}
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
