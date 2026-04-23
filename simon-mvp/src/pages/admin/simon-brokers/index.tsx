// Admin: gestión de simon_brokers (MVP Simon Broker).
//
// NO confundir con /admin/brokers (tabla legacy `brokers` de captación B2B).
//
// Permite: listar, crear, togglear status, editar inline. Todo en una sola página
// para que la activación en el momento del café sea lo más rápida posible.
//
// Protegido por useAdminAuth(['super_admin']) — mismo patrón que /admin/brokers.

import { useEffect, useState, useCallback } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

interface BrokerAdmin {
  id: string
  slug: string
  nombre: string
  telefono: string
  foto_url: string | null
  inmobiliaria: string | null
  status: 'activo' | 'pausado' | 'inactivo'
  fecha_alta: string
  fecha_proximo_cobro: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function publicBrokerURL(slug: string): string {
  if (typeof window === 'undefined') return `/broker/${slug}`
  return `${window.location.origin}/broker/${slug}`
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AdminSimonBrokers() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin'])
  const [brokers, setBrokers] = useState<BrokerAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form crear
  const [formNombre, setFormNombre] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formTelefono, setFormTelefono] = useState('+591')
  const [formInmobiliaria, setFormInmobiliaria] = useState('')
  const [formFotoUrl, setFormFotoUrl] = useState('')
  const [formNotas, setFormNotas] = useState('')
  const [slugManual, setSlugManual] = useState(false)

  const fetchBrokers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/simon-brokers', { headers })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setBrokers((await res.json()) as BrokerAdmin[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading || !admin) return
    fetchBrokers()
  }, [authLoading, admin, fetchBrokers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/simon-brokers', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: formSlug.trim().toLowerCase(),
          nombre: formNombre.trim(),
          telefono: formTelefono.trim(),
          inmobiliaria: formInmobiliaria.trim() || null,
          foto_url: formFotoUrl.trim() || null,
          notas: formNotas.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setFormNombre('')
      setFormSlug('')
      setFormTelefono('+591')
      setFormInmobiliaria('')
      setFormFotoUrl('')
      setFormNotas('')
      setSlugManual(false)
      await fetchBrokers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleStatus = async (b: BrokerAdmin, newStatus: BrokerAdmin['status']) => {
    setSaving(b.id)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/simon-brokers/${b.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      await fetchBrokers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setSaving(null)
    }
  }

  const handleCopyURL = (slug: string) => {
    const url = publicBrokerURL(slug)
    navigator.clipboard?.writeText(url)
  }

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-slate-500">Verificando acceso...</p></div>
  }
  if (!admin) return null

  return (
    <>
      <Head><title>Admin — Simon Brokers (MVP)</title></Head>

      <div className="min-h-screen bg-slate-100">
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Simon Brokers (MVP)</h1>
              <p className="text-slate-400 text-sm">Tabla `simon_brokers` — NO confundir con /admin/brokers (legacy)</p>
            </div>
            <a href="/admin/salud" className="text-slate-300 hover:text-white text-sm">← Admin</a>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Form crear */}
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <h2 className="text-base font-semibold mb-4">Nuevo broker</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
                <input
                  required
                  type="text"
                  value={formNombre}
                  onChange={(e) => {
                    setFormNombre(e.target.value)
                    if (!slugManual) setFormSlug(slugify(e.target.value))
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  placeholder="Abel Antonio Flores Nava"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Slug (URL) <span className="text-slate-400 font-normal">— /broker/<strong>{formSlug || 'slug'}</strong></span>
                </label>
                <input
                  required
                  type="text"
                  value={formSlug}
                  onChange={(e) => { setSlugManual(true); setFormSlug(e.target.value.toLowerCase()) }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
                  placeholder="abel-flores"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp (con +591)</label>
                <input
                  required
                  type="text"
                  value={formTelefono}
                  onChange={(e) => setFormTelefono(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
                  placeholder="+59178519485"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Inmobiliaria (opcional)</label>
                <input
                  type="text"
                  value={formInmobiliaria}
                  onChange={(e) => setFormInmobiliaria(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  placeholder="RE/MAX Legacy"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Foto URL (opcional)</label>
                <input
                  type="url"
                  value={formFotoUrl}
                  onChange={(e) => setFormFotoUrl(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Notas admin (opcional)</label>
                <textarea
                  value={formNotas}
                  onChange={(e) => setFormNotas(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Contexto, acordado por WA, fecha cobro, etc."
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                >
                  {creating ? 'Creando...' : 'Crear broker'}
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Se activa automáticamente con <code>status=activo</code>. URL pública disponible en ~60s (SSG revalidate). Para pausar, usar botón en la tabla.
            </p>
          </section>

          {/* Tabla brokers */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold">Brokers registrados ({brokers.length})</h2>
              <button onClick={fetchBrokers} className="text-xs text-slate-600 hover:text-slate-900">↻ Refrescar</button>
            </div>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Cargando...</div>
            ) : brokers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">Sin brokers. Creá el primero arriba.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Broker</th>
                    <th className="px-4 py-2 text-left">WhatsApp</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Alta</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {brokers.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {b.foto_url
                            ? <img src={b.foto_url} alt={b.nombre} className="w-8 h-8 rounded-full object-cover" />
                            : <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">{b.nombre.charAt(0)}</div>}
                          <div>
                            <div className="font-medium">{b.nombre}</div>
                            <div className="text-xs text-slate-500 font-mono">
                              /{b.slug}{b.inmobiliaria && ` · ${b.inmobiliaria}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{b.telefono}</td>
                      <td className="px-4 py-3">
                        <span className={
                          b.status === 'activo' ? 'bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium' :
                          b.status === 'pausado' ? 'bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium' :
                          'bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs font-medium'
                        }>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{b.fecha_alta}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <a
                            href={`/broker/${b.slug}`}
                            target="_blank"
                            rel="noopener"
                            className="text-xs border border-slate-300 rounded px-2 py-1 hover:bg-slate-50"
                            title="Abrir página pública del broker"
                          >
                            Abrir ↗
                          </a>
                          <button
                            onClick={() => handleCopyURL(b.slug)}
                            className="text-xs border border-slate-300 rounded px-2 py-1 hover:bg-slate-50"
                            title="Copiar URL al portapapeles"
                          >
                            Copiar URL
                          </button>
                          {b.status === 'activo' ? (
                            <button
                              onClick={() => handleToggleStatus(b, 'pausado')}
                              disabled={saving === b.id}
                              className="text-xs border border-amber-300 text-amber-700 rounded px-2 py-1 hover:bg-amber-50 disabled:opacity-50"
                            >
                              Pausar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleStatus(b, 'activo')}
                              disabled={saving === b.id}
                              className="text-xs border border-green-300 text-green-700 rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50"
                            >
                              Activar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="text-xs text-slate-400">
            Cambios de status se reflejan en la página pública en ≤60s (SSG revalidate). Facturación fuera del producto (Google Sheet + QR manual).
          </p>
        </main>
      </div>
    </>
  )
}
