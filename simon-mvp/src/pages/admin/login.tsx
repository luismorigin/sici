import { useState, useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

type Mode = 'password' | 'magic_link'

export default function AdminLogin() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    if (!supabase) return

    let cancelled = false

    const handleSession = async (userEmail: string) => {
      if (cancelled) return
      try {
        const { data } = await supabase!
          .from('admin_users')
          .select('id')
          .eq('email', userEmail)
          .eq('activo', true)
          .single()

        if (cancelled) return

        if (data) {
          setRedirecting(true)
          document.cookie = 'sici_admin=1; path=/admin; max-age=86400; SameSite=Strict'
          const params = new URLSearchParams(window.location.search)
          const returnTo = params.get('return_to')
          window.location.href = returnTo && returnTo.startsWith('/admin/') ? returnTo : '/admin/salud'
        } else {
          setError('Tu email no tiene acceso al panel de administración')
          supabase!.auth.signOut()
        }
      } catch {
        if (!cancelled) setError('Error al verificar acceso')
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.email && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        handleSession(session.user.email)
      }
    })

    return () => {
      cancelled = true
      listener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'no_autorizado') {
      setError('Tu email no tiene acceso al panel de administración')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !email.trim()) return
    if (mode === 'password' && !password) return

    setLoading(true)
    setError(null)

    try {
      if (mode === 'password') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (authError) {
          setError(
            authError.message === 'Invalid login credentials'
              ? 'Email o contraseña incorrectos'
              : authError.message,
          )
          return
        }
        // El onAuthStateChange de arriba dispara handleSession → redirige
      } else {
        // Magic link: preservar return_to en emailRedirectTo
        const params = new URLSearchParams(window.location.search)
        const returnTo = params.get('return_to') || ''
        const redirectUrl = returnTo
          ? `${window.location.origin}/admin/login?return_to=${encodeURIComponent(returnTo)}`
          : `${window.location.origin}/admin/login`

        const { error: authError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: redirectUrl },
        })
        if (authError) {
          setError(authError.message)
          return
        }
        setSuccess(true)
      }
    } catch {
      setError('Error al enviar el acceso')
    } finally {
      setLoading(false)
    }
  }

  if (redirecting) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white/40 text-sm">Acceso verificado, redirigiendo...</div>
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

          {success && mode === 'magic_link' ? (
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
                onClick={() => { setSuccess(false); setEmail(''); setPassword('') }}
                className="mt-8 text-[#c9a959] text-xs tracking-[2px] uppercase hover:text-white transition-colors"
              >
                Usar otro email
              </button>
            </div>
          ) : (
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
                  autoComplete="email"
                  className="w-full bg-transparent border border-white/20 text-white px-4 py-3.5 text-sm
                             placeholder:text-white/20 focus:border-[#c9a959] focus:outline-none transition-colors"
                />
              </div>

              {mode === 'password' && (
                <div className="mb-6">
                  <label className="block text-white/40 text-xs tracking-[2px] uppercase mb-3">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full bg-transparent border border-white/20 text-white px-4 py-3.5 text-sm
                               placeholder:text-white/20 focus:border-[#c9a959] focus:outline-none transition-colors"
                  />
                </div>
              )}

              {error && (
                <div className="mb-6 px-4 py-3 border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || (mode === 'password' && !password)}
                className="w-full bg-white text-[#0a0a0a] py-4 text-xs tracking-[3px] uppercase
                           hover:bg-[#c9a959] hover:text-white transition-all duration-300
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading
                  ? (mode === 'password' ? 'Ingresando...' : 'Enviando...')
                  : (mode === 'password' ? 'Ingresar' : 'Enviar link de acceso')}
              </button>

              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'password' ? 'magic_link' : 'password'); setError(null) }}
                  className="text-white/40 text-xs tracking-[2px] uppercase hover:text-[#c9a959] transition-colors"
                >
                  {mode === 'password' ? '¿Olvidaste tu contraseña? Usar magic link' : 'Usar email + contraseña'}
                </button>
              </div>

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
