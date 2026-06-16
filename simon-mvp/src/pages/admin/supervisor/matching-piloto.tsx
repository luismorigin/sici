import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

// Contrato de obtener_pendientes_piloto (migración 259) — igual que el HITL de Eq.
interface MatchPiloto {
  id_sugerencia: number
  propiedad_id: number
  url_propiedad: string
  nombre_edificio: string
  proyecto_sugerido: string
  proyecto_id: number
  metodo: string
  confianza: number
  distancia_metros: number | null
  latitud: number | null
  longitud: number | null
  fuente: string
}

interface MacrozonaOption {
  macrozona: string
  pendientes: number
  score_alto: number
}

// 'zona_norte' -> 'Zona Norte'
function displayMacrozona(m: string): string {
  return m.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function MatchingPiloto() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin', 'supervisor'])
  const [macrozonas, setMacrozonas] = useState<MacrozonaOption[]>([])
  const [macrozonaSel, setMacrozonaSel] = useState<string | null>(null)
  const [pendientes, setPendientes] = useState<MatchPiloto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState<number | null>(null)
  const [stats, setStats] = useState({ aprobados: 0, rechazados: 0 })

  const fetchMacrozonas = useCallback(async () => {
    if (!supabase) return
    const { data, error: e } = await supabase.rpc('obtener_macrozonas_piloto')
    if (e) { setError(e.message); return }
    const list = (data || []) as MacrozonaOption[]
    setMacrozonas(list)
    setMacrozonaSel(prev => prev ?? (list[0]?.macrozona ?? null))
  }, [])

  const fetchPendientes = useCallback(async (macrozona: string) => {
    if (!supabase) return
    setLoading(true); setError(null)
    const { data, error: e } = await supabase.rpc('obtener_pendientes_piloto', { p_macrozona: macrozona })
    if (e) { setError(e.message); setLoading(false); return }
    setPendientes((data || []) as MatchPiloto[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (authLoading || !admin) return
    fetchMacrozonas()
  }, [authLoading, admin, fetchMacrozonas])

  useEffect(() => {
    if (macrozonaSel) fetchPendientes(macrozonaSel)
  }, [macrozonaSel, fetchPendientes])

  async function decidir(id: number, aprobar: boolean) {
    if (!supabase) return
    setProcesando(id)
    const { data, error: e } = await supabase.rpc('aplicar_match_piloto', {
      p_id_sugerencia: id, p_aprobar: aprobar,
    })
    setProcesando(null)
    const row = Array.isArray(data) ? data[0] : data
    if (e || !row?.ok) { alert('Error: ' + (e?.message || row?.mensaje || 'desconocido')); return }
    setStats(s => aprobar ? { ...s, aprobados: s.aprobados + 1 } : { ...s, rechazados: s.rechazados + 1 })
    setPendientes(prev => prev.filter(p => p.id_sugerencia !== id))
    // refrescar conteo del selector
    fetchMacrozonas()
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  return (
    <>
      <Head><title>Matching piloto (macrozonas) — Admin</title></Head>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <Link href="/admin/supervisor" className="text-sm text-blue-600 hover:underline">← Supervisor</Link>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">Matching piloto — macrozonas</h1>
              <p className="text-sm text-gray-500">Sugerencias <code>pendiente_&lt;macrozona&gt;</code> (fuera del HITL de Equipetrol). Aprobar/rechazar aplica un match directo, sin tocar Equipetrol.</p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <div>✅ {stats.aprobados} aprobados</div>
              <div>🚫 {stats.rechazados} rechazados</div>
            </div>
          </div>

          {/* Selector de macrozona (dinámico) */}
          <div className="flex flex-wrap gap-2 mb-4">
            {macrozonas.length === 0 && <span className="text-gray-400 text-sm">No hay macrozonas en piloto con sugerencias pendientes.</span>}
            {macrozonas.map(m => (
              <button
                key={m.macrozona}
                onClick={() => setMacrozonaSel(m.macrozona)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                  macrozonaSel === m.macrozona ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {displayMacrozona(m.macrozona)}
                <span className="ml-2 opacity-70">{m.pendientes} · ⭐{m.score_alto}</span>
              </button>
            ))}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}
          {loading ? (
            <p className="text-gray-500">Cargando sugerencias...</p>
          ) : pendientes.length === 0 ? (
            <p className="text-gray-500">Sin sugerencias pendientes en esta macrozona. 🎉</p>
          ) : (
            <div className="space-y-2">
              {pendientes.map(p => (
                <div key={p.id_sugerencia} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{p.nombre_edificio}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-700">{p.proyecto_sugerido}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.confianza >= 85 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        score {p.confianza}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                      <span>método: {p.metodo}</span>
                      {p.distancia_metros != null && <span>dist: {p.distancia_metros}m</span>}
                      <span>fuente: {p.fuente}</span>
                      <a href={p.url_propiedad} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">ver anuncio</a>
                      {p.latitud != null && p.longitud != null && (
                        <a href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">GPS</a>
                      )}
                      <span className="text-gray-400">prop #{p.propiedad_id} · pm {p.proyecto_id}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => decidir(p.id_sugerencia, true)}
                      disabled={procesando === p.id_sugerencia}
                      className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >Aprobar</button>
                    <button
                      onClick={() => decidir(p.id_sugerencia, false)}
                      disabled={procesando === p.id_sugerencia}
                      className="px-3 py-1.5 rounded-md bg-white text-red-600 border border-red-300 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                    >Rechazar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
