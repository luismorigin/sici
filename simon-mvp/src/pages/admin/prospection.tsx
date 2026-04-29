// Admin: panel de prospección de brokers.
//
// Lista brokers captadores de Equipetrol agregados desde v_mercado_venta,
// agrupados por teléfono normalizado, con tier asignado por volumen
// (T1: 1-5, T2: 6-10, T3: 11+) y tracking de los 3 mensajes WhatsApp
// del flow de outreach.
//
// Sin paginación (177 brokers caben en una tabla scrollable). Si crece,
// se agrega.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { buildWhatsAppURL } from '@/lib/whatsapp'
import ProspectionMsg1Modal from '@/components/admin/ProspectionMsg1Modal'
import ProspectionResponsesDrawer from '@/components/admin/ProspectionResponsesDrawer'

type ProspectionStatus = 'pending' | 'msg1_sent' | 'msg2_sent' | 'msg3_sent'

interface ProspectionBroker {
  telefono: string
  nombre: string
  agencia: string | null
  tier: 1 | 2 | 3
  props_activas: number
  props_recientes_90d: number
  dias_pub_min: number | null
  dias_pub_max: number | null
  status: ProspectionStatus
  fecha_msg1: string | null
  fecha_msg2: string | null
  fecha_msg3: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

interface Stats {
  total: number
  pending: number
  msg1_sent: number
  msg2_sent: number
  msg3_sent: number
  by_tier: { tier: 1 | 2 | 3; count: number }[]
}

// ============================================================
// Templates de mensajes
// ============================================================
const MSG2_TEMPLATE = (nombre: string) => `Hola ${nombre}, soy Luis Medina, founder de Simón —
plataforma de inteligencia inmobiliaria de Equipetrol.

Simón te posiciona como el especialista de la zona:

🏙️ 300+ deptos en venta y 120+ en alquiler —
   Remax, Century 21 y Bien Inmuebles en una
   sola pantalla

🤝 Contacto directo al captador original de
   cada propiedad con un click por WhatsApp

📱 Mini-sitio profesional para tu cliente con
   tu nombre, foto y WhatsApp — listo para mandar

¿Querés ver cómo funciona?

👉 simonbo.com/broker/demo`

const MSG3 = `Estoy abriendo acceso a 20 brokers fundadores
de Equipetrol. Los primeros 20 entran con precio
congelado por 12 meses — cuando suba para los
nuevos, vos mantenés el tuyo.

¿Coordinamos un café o me paso por tu oficina?
Son 20 minutos.`

// ============================================================
// Helpers
// ============================================================
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const STATUS_LABELS: Record<ProspectionStatus, string> = {
  pending: 'Pendiente',
  msg1_sent: 'Msg 1 ✓',
  msg2_sent: 'Msg 2 ✓',
  msg3_sent: 'Msg 3 ✓',
}

const STATUS_BADGE: Record<ProspectionStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 border-gray-200',
  msg1_sent: 'bg-blue-50 text-blue-800 border-blue-200',
  msg2_sent: 'bg-purple-50 text-purple-800 border-purple-200',
  msg3_sent: 'bg-emerald-50 text-emerald-800 border-emerald-200',
}

const AGENCIA_LABELS: Record<string, string> = {
  century21: 'Century 21',
  remax: 'RE/MAX',
  bien_inmuebles: 'Bien Inmuebles',
  bieninmuebles: 'Bien Inmuebles',
}

function fmtAgencia(a: string | null): string {
  if (!a) return '—'
  return AGENCIA_LABELS[a.toLowerCase()] || a
}

function fmtTelefono(t: string): string {
  // "59170123456" → "+591 70 123 456"
  if (t.length >= 11 && t.startsWith('591')) {
    const rest = t.slice(3)
    return `+591 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`
  }
  return `+${t}`
}

// ============================================================
// Componente principal
// ============================================================
export default function AdminProspection() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin'])

  const [brokers, setBrokers] = useState<ProspectionBroker[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Filtros
  const [filterTier, setFilterTier] = useState<'' | '1' | '2' | '3'>('')
  const [filterStatus, setFilterStatus] = useState<'' | ProspectionStatus>('')
  const [filterAgencia, setFilterAgencia] = useState('')
  const [search, setSearch] = useState('')
  const [sortProps, setSortProps] = useState<'asc' | 'desc'>('asc')
  const [sortDias, setSortDias] = useState<'asc' | 'desc'>('asc')

  // Modal Msg 1
  const [msg1Modal, setMsg1Modal] = useState<{ open: boolean; broker: ProspectionBroker | null }>({
    open: false,
    broker: null,
  })

  // Drawer respuestas pre-armadas
  const [responsesDrawer, setResponsesDrawer] = useState<{ open: boolean; broker: ProspectionBroker | null }>({
    open: false,
    broker: null,
  })

  // Notas inline
  const [editingNotasFor, setEditingNotasFor] = useState<string | null>(null)
  const [notasDraft, setNotasDraft] = useState('')

  const fetchBrokers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const params = new URLSearchParams()
      if (filterTier) params.set('tier', filterTier)
      if (filterStatus) params.set('status', filterStatus)
      if (filterAgencia) params.set('agencia', filterAgencia)
      if (search.trim()) params.set('search', search.trim())
      params.set('sort_props', sortProps)
      params.set('sort_dias', sortDias)
      const res = await fetch(`/api/admin/prospection?${params.toString()}`, { headers })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { brokers: ProspectionBroker[]; stats: Stats }
      setBrokers(data.brokers)
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [filterTier, filterStatus, filterAgencia, search, sortProps, sortDias])

  useEffect(() => {
    if (authLoading || !admin) return
    fetchBrokers()
  }, [authLoading, admin, fetchBrokers])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/prospection/refresh', {
        method: 'POST',
        headers,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const j = await res.json() as { inserted: number; updated: number; total: number }
      showToast(`Refrescado · ${j.total} brokers (${j.inserted} nuevos, ${j.updated} actualizados)`)
      await fetchBrokers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al refrescar')
    } finally {
      setRefreshing(false)
    }
  }

  const updateBroker = async (telefono: string, payload: { status?: ProspectionStatus; notas?: string | null; stamp_dates?: boolean }) => {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/prospection/${encodeURIComponent(telefono)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const updated = await res.json() as ProspectionBroker
      setBrokers(prev => prev.map(b => b.telefono === telefono ? updated : b))
      // Actualizar stats locales
      if (stats && payload.status) {
        const original = brokers.find(b => b.telefono === telefono)
        if (original && original.status !== payload.status) {
          setStats(s => s ? {
            ...s,
            [original.status]: Math.max(0, (s as unknown as Record<string, number>)[original.status] - 1),
            [payload.status as string]: ((s as unknown as Record<string, number>)[payload.status as string] || 0) + 1,
          } as Stats : s)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  const handleSendMsg = (broker: ProspectionBroker, msg: 1 | 2 | 3) => {
    if (msg === 1) {
      setMsg1Modal({ open: true, broker })
      return
    }
    const text = msg === 2 ? MSG2_TEMPLATE(broker.nombre) : MSG3
    const url = buildWhatsAppURL(broker.telefono, text)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleMarkSent = (broker: ProspectionBroker, msg: 1 | 2 | 3) => {
    const status: ProspectionStatus = msg === 1 ? 'msg1_sent' : msg === 2 ? 'msg2_sent' : 'msg3_sent'
    updateBroker(broker.telefono, { status, stamp_dates: true })
    showToast(`Marcado Msg ${msg} enviado`)
  }

  const handleMarkAll3 = (broker: ProspectionBroker) => {
    updateBroker(broker.telefono, { status: 'msg3_sent', stamp_dates: true })
    showToast('Marcados los 3 mensajes enviados')
  }

  const handleSaveNotas = async (telefono: string) => {
    await updateBroker(telefono, { notas: notasDraft.trim() || null })
    setEditingNotasFor(null)
    setNotasDraft('')
    showToast('Notas guardadas')
  }

  const agenciasUnicas = useMemo(() => {
    const set = new Set<string>()
    brokers.forEach(b => { if (b.agencia) set.add(b.agencia) })
    return Array.from(set).sort()
  }, [brokers])

  if (authLoading) {
    return <div className="p-8 text-gray-500">Verificando acceso...</div>
  }
  if (!admin) {
    return <div className="p-8 text-red-600">No tenés permisos.</div>
  }

  return (
    <>
      <Head>
        <title>Prospección Brokers · Simón Admin</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <header className="mb-6 flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Prospección Brokers</h1>
              <p className="text-sm text-gray-500 mt-1">
                Outreach a captadores de Equipetrol · 3 mensajes secuenciales por WhatsApp
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setResponsesDrawer({ open: true, broker: null })}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-lg hover:border-gray-500"
                title="Respuestas pre-armadas para responder rápido por WhatsApp"
              >
                💬 Respuestas
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {refreshing ? 'Refrescando...' : 'Refrescar lista'}
              </button>
            </div>
          </header>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <StatCard label="Total" value={stats.total} />
              <StatCard label="Pendientes" value={stats.pending} accent="gray" />
              <StatCard label="Msg 1 ✓" value={stats.msg1_sent} accent="blue" />
              <StatCard label="Msg 2 ✓" value={stats.msg2_sent} accent="purple" />
              <StatCard label="Msg 3 ✓" value={stats.msg3_sent} accent="emerald" />
            </div>
          )}

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value as '' | '1' | '2' | '3')}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
            >
              <option value="">Tier · todos</option>
              <option value="1">Tier 1 (1-5)</option>
              <option value="2">Tier 2 (6-10)</option>
              <option value="3">Tier 3 (11+)</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as '' | ProspectionStatus)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
            >
              <option value="">Status · todos</option>
              <option value="pending">Pendiente</option>
              <option value="msg1_sent">Msg 1 ✓</option>
              <option value="msg2_sent">Msg 2 ✓</option>
              <option value="msg3_sent">Msg 3 ✓</option>
            </select>

            <select
              value={filterAgencia}
              onChange={(e) => setFilterAgencia(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
            >
              <option value="">Agencia · todas</option>
              {agenciasUnicas.map(a => (
                <option key={a} value={a}>{fmtAgencia(a)}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Buscar nombre o tel..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm flex-1 min-w-[180px]"
            />

            {(filterTier || filterStatus || filterAgencia || search) && (
              <button
                onClick={() => { setFilterTier(''); setFilterStatus(''); setFilterAgencia(''); setSearch('') }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Limpiar
              </button>
            )}

            <span className="text-sm text-gray-500 ml-auto">
              {brokers.length} {brokers.length === 1 ? 'broker' : 'brokers'}
            </span>
          </div>

          {/* Orden: tier siempre primero, después configurable */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap gap-2 items-center text-sm">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold mr-1">Orden:</span>
            <span className="text-xs text-gray-500">Tier 1→3 · luego</span>
            <button
              type="button"
              onClick={() => setSortProps(p => p === 'asc' ? 'desc' : 'asc')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                sortProps === 'asc'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
              }`}
              title="Click para alternar"
            >
              Propiedades {sortProps === 'asc' ? '↑ menos→más' : '↓ más→menos'}
            </button>
            <span className="text-xs text-gray-400">·</span>
            <button
              type="button"
              onClick={() => setSortDias(d => d === 'asc' ? 'desc' : 'asc')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                sortDias === 'asc'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
              }`}
              title="Click para alternar"
            >
              Antigüedad {sortDias === 'asc' ? '↑ recientes' : '↓ viejas'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Tier</th>
                    <th className="px-3 py-2.5 text-left">Broker</th>
                    <th className="px-3 py-2.5 text-left">Agencia</th>
                    <th className="px-3 py-2.5 text-center">Props</th>
                    <th className="px-3 py-2.5 text-center">Antigüedad</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-left">Acciones</th>
                    <th className="px-3 py-2.5 text-left">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
                  )}
                  {!loading && brokers.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      Sin resultados. ¿Refrescaste la lista?
                    </td></tr>
                  )}
                  {!loading && brokers.map(b => (
                    <tr key={b.telefono} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          b.tier === 1 ? 'bg-emerald-100 text-emerald-800' :
                          b.tier === 2 ? 'bg-amber-100 text-amber-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          T{b.tier}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900">{b.nombre}</div>
                        <div className="text-xs text-gray-500 font-mono">{fmtTelefono(b.telefono)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{fmtAgencia(b.agencia)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="font-semibold">{b.props_activas}</div>
                        <div className="text-xs text-gray-500">{b.props_recientes_90d} recientes</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {b.dias_pub_min == null ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <>
                            <div className="font-semibold text-sm" title="Días en mercado de la publicación más reciente">{b.dias_pub_min}d</div>
                            {b.dias_pub_max != null && b.dias_pub_max !== b.dias_pub_min && (
                              <div className="text-xs text-gray-500" title="Días en mercado de la publicación más antigua">
                                hasta {b.dias_pub_max}d
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={b.status}
                          onChange={(e) => updateBroker(b.telefono, { status: e.target.value as ProspectionStatus, stamp_dates: e.target.value !== 'pending' })}
                          className={`px-2 py-1 text-xs font-medium rounded border ${STATUS_BADGE[b.status]}`}
                        >
                          {(['pending', 'msg1_sent', 'msg2_sent', 'msg3_sent'] as ProspectionStatus[]).map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {[1, 2, 3].map(n => (
                            <button
                              key={n}
                              onClick={() => handleSendMsg(b, n as 1 | 2 | 3)}
                              className="px-2 py-1 text-xs font-medium rounded border border-gray-200 hover:border-gray-400 bg-white"
                              title={`Abrir WhatsApp con Msg ${n}`}
                            >
                              Msg {n}
                            </button>
                          ))}
                          <button
                            onClick={() => handleMarkAll3(b)}
                            className="px-2 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            title="Marcar los 3 mensajes como enviados"
                          >
                            ✓ Marcar 3
                          </button>
                          <button
                            onClick={() => setResponsesDrawer({ open: true, broker: b })}
                            className="px-2 py-1 text-xs font-medium rounded border border-gray-200 hover:border-gray-400 bg-white"
                            title="Abrir respuestas pre-armadas para este broker"
                          >
                            💬
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 max-w-xs">
                        {editingNotasFor === b.telefono ? (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={notasDraft}
                              onChange={(e) => setNotasDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveNotas(b.telefono)
                                if (e.key === 'Escape') { setEditingNotasFor(null); setNotasDraft('') }
                              }}
                              autoFocus
                              className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                              placeholder="Notas..."
                            />
                            <button
                              onClick={() => handleSaveNotas(b.telefono)}
                              className="px-2 text-xs text-emerald-700"
                            >
                              ✓
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingNotasFor(b.telefono); setNotasDraft(b.notas || '') }}
                            className="text-left text-xs text-gray-600 hover:text-gray-900 w-full"
                            title="Click para editar"
                          >
                            {b.notas || <span className="text-gray-400 italic">Agregar nota...</span>}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full shadow-lg text-sm z-50">
            {toast}
          </div>
        )}

        {/* Modal Msg 1 */}
        <ProspectionMsg1Modal
          isOpen={msg1Modal.open}
          onClose={() => setMsg1Modal({ open: false, broker: null })}
          broker={msg1Modal.broker ? { telefono: msg1Modal.broker.telefono, nombre: msg1Modal.broker.nombre } : null}
        />

        {/* Drawer Respuestas pre-armadas */}
        <ProspectionResponsesDrawer
          isOpen={responsesDrawer.open}
          onClose={() => setResponsesDrawer({ open: false, broker: null })}
          broker={responsesDrawer.broker ? { telefono: responsesDrawer.broker.telefono, nombre: responsesDrawer.broker.nombre } : null}
        />
      </div>
    </>
  )
}

// ============================================================
// Sub-componente: tarjeta de stat
// ============================================================
function StatCard({ label, value, accent = 'default' }: { label: string; value: number; accent?: 'default' | 'gray' | 'blue' | 'purple' | 'emerald' }) {
  const accentClass = {
    default: 'border-gray-300',
    gray: 'border-gray-200',
    blue: 'border-blue-200',
    purple: 'border-purple-200',
    emerald: 'border-emerald-200',
  }[accent]

  return (
    <div className={`bg-white rounded-xl border ${accentClass} p-4`}>
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 font-variant-numeric">{value}</div>
    </div>
  )
}
