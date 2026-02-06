import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const validateAndRedirect = async (userEmail: string) => {
    if (!supabase) return
    const { data } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', userEmail)
      .eq('activo', true)
      .single()

    if (data) {
      // Setear cookie para que middleware permita acceso
      document.cookie = 'sici_admin=1; path=/admin; max-age=86400; SameSite=Strict'
      router.push('/admin/salud')
    } else {
      setCheckingSession(false)
      setError('Tu email no tiene acceso al panel de administración')
      await supabase.auth.signOut()
    }
  }

  // Si ya tiene sesión válida, redirigir al admin
  useEffect(() => {
    const checkExistingSession = async () => {
      if (!supabase) {
        setCheckingSession(false)
        return
      }

      // Escuchar cambios de auth (para cuando llega el Magic Link)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_IN' && session) {
            await validateAndRedirect(session.user.email!)
          }
        }
      )

      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await validateAndRedirect(session.user.email!)
      } else {
        setCheckingSession(false)
      }

      return () => { subscription.unsubscribe() }
    }

    checkExistingSession()
  }, [])

  // Mostrar error de URL params
  useEffect(() => {
    if (router.query.error === 'no_autorizado') {
      setError('Tu email no tiene acceso al panel de administración')
    }
  }, [router.query])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !email.trim()) return

    setLoading(true)
    setError(null)

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/admin/login`,
        }
      })

      if (authError) {
        setError(authError.message)
        return
      }

      setSuccess(true)
    } catch {
      setError('Error al enviar el link de acceso')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white/40 text-sm">Verificando sesión...</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Admin — Simon</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-12">
            <h1 className="text-white text-3xl font-light tracking-tight">Simon</h1>
            <div className="flex items-center justify-center gap-3 mt-3">
              <span className="w-8 h-px bg-[#c9a959]" />
              <span className="text-[#c9a959] text-[0.65rem] tracking-[3px] uppercase">
                Administración
              </span>
              <span className="w-8 h-px bg-[#c9a959]" />
            </div>
          </div>

          {success ? (
            /* Mensaje de éxito */
            <div className="text-center">
              <div className="w-16 h-16 rounded-full border border-[#c9a959]/30 flex items-center justify-center mx-auto mb-6">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a959" strokeWidth="1.5">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white text-lg font-light mb-2">Revisá tu email</p>
              <p className="text-white/40 text-sm font-light">
                Enviamos un link de acceso a <span className="text-white/70">{email}</span>
              </p>
              <button
                onClick={() => { setSuccess(false); setEmail('') }}
                className="mt-8 text-[#c9a959] text-xs tracking-[2px] uppercase hover:text-white transition-colors"
              >
                Usar otro email
              </button>
            </div>
          ) : (
            /* Formulario */
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label className="block text-white/40 text-xs tracking-[2px] uppercase mb-3">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoFocus
                  className="w-full bg-transparent border border-white/20 text-white px-4 py-3.5 text-sm
                             placeholder:text-white/20 focus:border-[#c9a959] focus:outline-none transition-colors"
                />
              </div>

              {error && (
                <div className="mb-6 px-4 py-3 border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-white text-[#0a0a0a] py-4 text-xs tracking-[3px] uppercase
                           hover:bg-[#c9a959] hover:text-white transition-all duration-300
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? 'Enviando...' : 'Enviar link de acceso'}
              </button>

              <p className="text-white/20 text-xs text-center mt-6 font-light">
                Solo emails autorizados pueden acceder
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
