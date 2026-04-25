// Admin: detalle de un broker — listado de sus shortlists con acciones de
// suspender/reactivar individualmente.
//
// Ruta: /admin/simon-brokers/<slug>
// Protegida por useAdminAuth(['super_admin']).
//
// Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.

import { useEffect, useState, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import type { BrokerShortlistProtected } from '@/types/broker-shortlist'

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Activa' },
  expired: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Expirada' },
  view_limit_reached: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Límite vistas' },
  suspended: { bg: 'bg-red-100', text: 'text-red-800', label: 'Suspendida' },
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-BO', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-BO', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

export default function AdminBrokerDetail() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdminAuth(['super_admin'])
  const slug = String(router.query.slug || '')

  const [shortlists, setShortlists] = useState<BrokerShortlistProtected[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const fetchShortlists = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(
        `/api/admin/shortlists?broker_slug=${encodeURIComponent(slug)}`,
        { headers }
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setShortlists((await res.json()) as BrokerShortlistProtected[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    if (authLoading || !admin || !slug) return
    fetchShortlists()
  }, [authLoading, admin, slug, fetchShortlists])

  const handleAction = async (id: string, action: 'suspend' | 'unsuspend') => {
    const verb = action === 'suspend' ? 'suspender' : 'reactivar'
    if (!confirm(`¿Confirmás ${verb} esta shortlist?`)) return
    setActing(id)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/shortlists/${id}/suspend`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      await fetchShortlists()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Error al ${verb}`)
    } finally {
      setActing(null)
    }
  }

  if (authLoading) return <div className="p-8 text-slate-500">Verificando sesión...</div>
  if (!admin) return null

  return (
    <>
      <Head>
        <title>Shortlists de {slug} · Admin</title>
      </Head>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="bg-slate-900 text-white px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">
                Shortlists de <span className="font-mono">{slug}</span>
              </h1>
              <p className="text-slate-400 text-sm">
                Gestión individual de shortlists del broker — suspender abuso, reactivar grandfathered
              </p>
            </div>
            <Link href="/admin/simon-brokers" className="text-slate-300 hover:text-white text-sm">
              ← Brokers
            </Link>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Shortlists ({shortlists.length})
              </h2>
              <button
                onClick={fetchShortlists}
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                ↻ Refrescar
              </button>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500">Cargando...</div>
            ) : shortlists.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Este broker no tiene shortlists todavía.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Vistas</th>
                    <th className="px-4 py-2 text-left">Creada</th>
                    <th className="px-4 py-2 text-left">Expira</th>
                    <th className="px-4 py-2 text-left">Última visita</th>
                    <th className="px-4 py-2 text-left">Link</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shortlists.map((s) => {
                    const status = s.status ?? 'active'
                    const badge = STATUS_BADGE[status] || STATUS_BADGE.active
                    const max = s.max_views ?? 20
                    const cur = s.current_views ?? 0
                    const capWarn = cur >= max * 0.8
                    return (
                      <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.cliente_nombre}</div>
                          <div className="text-xs text-slate-500 font-mono">{s.cliente_telefono}</div>
                          {s.archived_at && (
                            <div className="text-[10px] text-slate-400 mt-0.5">archivada</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <span className={capWarn ? 'text-orange-700 font-semibold' : ''}>
                            {cur}
                          </span>
                          <span className="text-slate-400"> / {max}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {fmtDate(s.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {s.expires_at ? fmtDate(s.expires_at) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {fmtDateTime(s.last_viewed_at)}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={`/b/${s.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 hover:underline text-xs font-mono"
                          >
                            /b/{s.hash}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {status === 'suspended' ? (
                            <button
                              onClick={() => handleAction(s.id, 'unsuspend')}
                              disabled={acting === s.id}
                              className="text-xs px-3 py-1 rounded border border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-50"
                            >
                              {acting === s.id ? '...' : 'Reactivar'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAction(s.id, 'suspend')}
                              disabled={acting === s.id}
                              className="text-xs px-3 py-1 rounded border border-red-600 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {acting === s.id ? '...' : 'Suspender'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </>
  )
}
