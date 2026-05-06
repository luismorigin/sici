// Panel admin: cola de reportes de datos broker → SICI.
//
// /admin/property-reports
// Migración 240, brief docs/broker/REPORTES_DATOS_BRIEF.md.
//
// Patrón visual: clonado de /admin/supervisor/sin-match (cola HITL).
// Auth: useAdminAuth(['super_admin', 'supervisor']) + Bearer token en API calls.

import { useState, useEffect, useCallback, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import {
  ALL_TIPOS,
  TIPO_LABELS,
  TIPO_LABELS_LARGOS,
  tiposActivosDe,
  type AdminListResponse,
  type PropertyReportTipo,
  type PropertyReportStatus,
  type PropertyReportWithJoins,
} from '@/types/broker-property-report'

const STATUS_TABS: Array<{ value: PropertyReportStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_review', label: 'En revisión' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'false_positive', label: 'Falsos positivos' },
  { value: 'all', label: 'Todos' },
]

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.floor((now - then) / (1000 * 60))
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `hace ${diffD}d`
  return new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-BO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ResolveModalState {
  reportId: string
  newStatus: PropertyReportStatus
}

export default function AdminPropertyReports() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin', 'supervisor'])

  const [statusTab, setStatusTab] = useState<PropertyReportStatus | 'all'>('pending')
  const [filterTipo, setFilterTipo] = useState<PropertyReportTipo | ''>('')
  const [filterPropId, setFilterPropId] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 50

  const [data, setData] = useState<AdminListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [resolveModal, setResolveModal] = useState<ResolveModalState | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [submittingResolve, setSubmittingResolve] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const params = new URLSearchParams()
      params.set('status', statusTab)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (filterTipo) params.set('tipo_error', filterTipo)
      if (filterPropId.trim()) params.set('propiedad_id', filterPropId.trim())
      const res = await fetch(`/api/admin/property-reports?${params.toString()}`, { headers })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as AdminListResponse
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [statusTab, filterTipo, filterPropId, page])

  useEffect(() => {
    if (authLoading || !admin) return
    fetchData()
  }, [authLoading, admin, fetchData])

  // Reset a page=0 cuando cambian filtros
  useEffect(() => {
    setPage(0)
  }, [statusTab, filterTipo, filterPropId])

  async function handleResolve() {
    if (!resolveModal) return
    setSubmittingResolve(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/property-reports/${resolveModal.reportId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: resolveModal.newStatus,
          resolution_notes: resolutionNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      setResolveModal(null)
      setResolutionNotes('')
      fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setSubmittingResolve(false)
    }
  }

  const recurrentSet = useMemo(
    () => new Set(data?.recurrent_prop_ids || []),
    [data?.recurrent_prop_ids],
  )

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Verificando acceso...</p>
      </div>
    )
  }
  if (!admin) return null

  const reports = data?.reports || []
  const metrics = data?.metrics
  const total = data?.total ?? 0

  const weeklyDelta = metrics
    ? metrics.reports_this_week - metrics.reports_last_week
    : 0

  return (
    <>
      <Head>
        <title>Reportes de datos broker · Admin SICI</title>
      </Head>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Reportes de datos broker</h1>
              <p className="text-sm text-gray-500 mt-1">
                Cola HITL de errores reportados por brokers en propiedades del feed
              </p>
            </div>
            <Link
              href="/admin"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Volver a admin
            </Link>
          </div>

          {/* Métricas */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-3xl font-semibold text-gray-900">{metrics.pending_count}</div>
                <div className="text-xs text-gray-500 mt-1">Pendientes</div>
                {metrics.in_review_count > 0 && (
                  <div className="text-xs text-amber-600 mt-1">+ {metrics.in_review_count} en revisión</div>
                )}
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-3xl font-semibold text-gray-900">
                  {metrics.avg_resolution_hours_30d != null
                    ? `${metrics.avg_resolution_hours_30d.toFixed(1)}h`
                    : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Tiempo medio resolución (30d)</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-3xl font-semibold text-gray-900">{metrics.reports_this_week}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Esta semana
                  {weeklyDelta !== 0 && (
                    <span className={`ml-2 ${weeklyDelta > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {weeklyDelta > 0 ? '↑' : '↓'} {Math.abs(weeklyDelta)} vs ant.
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500 mb-1">Top reportadas (pendientes)</div>
                {metrics.top_reported_props.length > 0 ? (
                  <div className="space-y-0.5">
                    {metrics.top_reported_props.map((p) => (
                      <div key={p.propiedad_id} className="text-sm">
                        <Link
                          href={`/admin/propiedades/${p.propiedad_id}`}
                          target="_blank"
                          className="text-gray-700 hover:text-gray-900 underline"
                        >
                          #{p.propiedad_id}
                        </Link>
                        <span className="text-gray-500 ml-1">({p.count})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            {STATUS_TABS.map((tab) => {
              const active = statusTab === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatusTab(tab.value)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  {active && data ? <span className="ml-1.5 text-xs text-gray-400">({total})</span> : null}
                </button>
              )
            })}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value as PropertyReportTipo | '')}
              className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white"
            >
              <option value="">Todos los tipos</option>
              {ALL_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABELS[t]}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Filtrar por #ID prop"
              value={filterPropId}
              onChange={(e) => setFilterPropId(e.target.value.replace(/\D/g, ''))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white w-40"
            />
            {(filterTipo || filterPropId) && (
              <button
                onClick={() => {
                  setFilterTipo('')
                  setFilterPropId('')
                }}
                className="text-sm text-gray-500 hover:text-gray-700 px-2"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Tabla */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-md mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
              Cargando reportes...
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
              No hay reportes en esta categoría.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Broker</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Propiedad</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Tipos</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Nota</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <ReportRow
                      key={r.id}
                      report={r}
                      isRecurrent={r.propiedad?.id != null && recurrentSet.has(r.propiedad.id)}
                      onResolve={(newStatus) => {
                        setResolveModal({ reportId: r.id, newStatus })
                        setResolutionNotes(r.resolution_notes || '')
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {data && total > pageSize && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-gray-500">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} de {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * pageSize >= total}
                  className="px-3 py-1.5 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal de resolución */}
        {resolveModal && (
          <ResolveModal
            newStatus={resolveModal.newStatus}
            resolutionNotes={resolutionNotes}
            onChangeNotes={setResolutionNotes}
            submitting={submittingResolve}
            onCancel={() => {
              setResolveModal(null)
              setResolutionNotes('')
            }}
            onConfirm={handleResolve}
          />
        )}
      </div>
    </>
  )
}

// ============================================================
// Sub-componentes
// ============================================================

function ReportRow({
  report,
  isRecurrent,
  onResolve,
}: {
  report: PropertyReportWithJoins
  isRecurrent: boolean
  onResolve: (newStatus: PropertyReportStatus) => void
}) {
  const tipos = tiposActivosDe(report)

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap" title={formatDateTime(report.created_at)}>
        {formatRelative(report.created_at)}
      </td>
      <td className="px-4 py-3">
        {report.broker ? (
          <div className="flex items-center gap-2">
            {report.broker.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.broker.foto_url}
                alt=""
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                {report.broker.nombre.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-medium text-gray-900">{report.broker.nombre}</div>
              <div className="text-xs text-gray-500">{report.broker.slug}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-500" title={report.simon_broker_id}>
            <div className="font-medium text-gray-700">Broker desconocido</div>
            <div className="font-mono">{report.simon_broker_id.slice(0, 8)}…</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {/* prop_id siempre visible: la columna no depende del JOIN para
            renderizar el link al editor (clave para resolver desde admin). */}
        <div>
          <Link
            href={`/admin/propiedades/${report.propiedad_id}`}
            target="_blank"
            className="text-blue-600 hover:underline font-medium"
            title="Abrir editor de propiedad en nueva pestaña"
          >
            #{report.propiedad_id}
            {report.propiedad?.nombre_edificio || report.propiedad?.titulo
              ? ` — ${report.propiedad.nombre_edificio || report.propiedad.titulo}`
              : ''}
          </Link>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {report.propiedad?.zona && <span>{report.propiedad.zona}</span>}
            {report.propiedad?.tipo_operacion && (
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] uppercase tracking-wide">
                {report.propiedad.tipo_operacion}
              </span>
            )}
            {isRecurrent && (
              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-medium">
                ⚠ Múltiples reportes
              </span>
            )}
            {!report.propiedad && (
              <span className="text-amber-700 text-[10px]">⚠ datos no disponibles</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {tipos.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs"
              title={TIPO_LABELS_LARGOS[t]}
            >
              {TIPO_LABELS[t]}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-700 max-w-xs">
        {report.nota ? (
          <div title={report.nota} className="line-clamp-2">
            {report.nota}
          </div>
        ) : (
          <span className="text-gray-400 text-xs italic">sin nota</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {report.status === 'pending' || report.status === 'in_review' ? (
          <div className="inline-flex gap-1.5">
            {report.status === 'pending' && (
              <button
                onClick={() => onResolve('in_review')}
                className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
              >
                Marcar revisión
              </button>
            )}
            <button
              onClick={() => onResolve('resolved')}
              className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              ✓ Resolver
            </button>
            <button
              onClick={() => onResolve('false_positive')}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
            >
              Falso pos.
            </button>
          </div>
        ) : (
          <div className="text-xs">
            <div className="text-gray-500">
              {report.status === 'resolved' ? '✓ Resuelto' : 'Falso positivo'}
              {report.resolved_at && ` · ${formatRelative(report.resolved_at)}`}
            </div>
            {report.resolved_by && (
              <div className="text-gray-400">por {report.resolved_by}</div>
            )}
            <button
              onClick={() => onResolve('pending')}
              className="text-blue-600 hover:underline mt-1"
            >
              Reabrir
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

function ResolveModal({
  newStatus,
  resolutionNotes,
  onChangeNotes,
  submitting,
  onCancel,
  onConfirm,
}: {
  newStatus: PropertyReportStatus
  resolutionNotes: string
  onChangeNotes: (v: string) => void
  submitting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleByStatus: Record<PropertyReportStatus, string> = {
    pending: 'Reabrir reporte (volver a pendiente)',
    in_review: 'Marcar como en revisión',
    resolved: 'Marcar como resuelto',
    false_positive: 'Marcar como falso positivo',
  }
  const isResolving = newStatus === 'resolved' || newStatus === 'false_positive'

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{titleByStatus[newStatus]}</h3>

        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isResolving ? 'Notas de resolución (opcional)' : 'Notas (opcional)'}
        </label>
        <textarea
          value={resolutionNotes}
          onChange={(e) => onChangeNotes(e.target.value)}
          placeholder="Ej: Corregido precio en /admin/propiedades/1234..."
          className="w-full border border-gray-300 rounded-md p-2 text-sm min-h-[80px]"
          rows={3}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className={`px-4 py-2 text-sm text-white rounded-md ${
              newStatus === 'resolved'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-gray-700 hover:bg-gray-800'
            } disabled:opacity-60`}
          >
            {submitting ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
