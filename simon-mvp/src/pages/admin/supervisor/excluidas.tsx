import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

interface PropiedadExcluida {
  propiedad_id: number
  url: string
  fuente: string
  precio_usd: number | null
  precio_m2: number | null
  dormitorios: number | null
  area_m2: number | null
  zona: string | null
  nombre_edificio: string | null
  score_calidad: number | null
  razon_exclusion: string
}

interface Resumen {
  sin_dormitorios: number
  sin_precio: number
  score_bajo: number
  dorms_anomalos: number
  total_excluidas: number
  en_revision: number
  procesadas: number
  sin_exportar: number
}

type FiltroRazon = 'todas' | 'sin_precio' | 'sin_dormitorios' | 'dorms_anomalos' | 'score_bajo' | 'precio_m2'

export default function SupervisorExcluidas() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin', 'supervisor'])
  const [propiedades, setPropiedades] = useState<PropiedadExcluida[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)

  // Filtro por razón
  const [filtroRazon, setFiltroRazon] = useState<FiltroRazon>('todas')

  // Para corregir
  const [modoCorregir, setModoCorregir] = useState<number | null>(null)
  const [dormsCorregido, setDormsCorregido] = useState<string>('')
  const [precioCorregido, setPrecioCorregido] = useState<string>('')

  // Estadísticas de sesión
  const [stats, setStats] = useState({
    corregidos: 0,
    activados: 0,
    excluidos: 0,
    eliminados: 0
  })

  useEffect(() => {
    if (authLoading || !admin) return
    fetchPropiedades()
    fetchResumen()
  }, [authLoading])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  async function fetchPropiedades() {
    if (!supabase) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('exportar_propiedades_excluidas')

      if (rpcError) throw rpcError

      setPropiedades(data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar propiedades')
    } finally {
      setLoading(false)
    }
  }

  async function fetchResumen() {
    if (!supabase) return

    try {
      const { data, error } = await supabase
        .from('v_resumen_excluidas')
        .select('*')
        .single()

      if (!error && data) {
        setResumen(data)
      }
    } catch (err) {
      console.error('Error fetching resumen:', err)
    }
  }

  const handleCorregir = async (propiedadId: number) => {
    if (!supabase) return
    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_accion_excluida', {
        p_propiedad_id: propiedadId,
        p_accion: 'CORREGIR',
        p_dorms_correcto: dormsCorregido ? parseInt(dormsCorregido) : null,
        p_precio_correcto: precioCorregido ? parseFloat(precioCorregido) : null
      })

      if (error) throw error

      if (!data?.success) {
        throw new Error(data?.error || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, corregidos: prev.corregidos + 1 }))
      setModoCorregir(null)
      setDormsCorregido('')
      setPrecioCorregido('')
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error al corregir: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleActivar = async (propiedadId: number) => {
    if (!supabase) return
    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_accion_excluida', {
        p_propiedad_id: propiedadId,
        p_accion: 'ACTIVAR'
      })

      if (error) throw error

      if (!data?.success) {
        throw new Error(data?.error || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, activados: prev.activados + 1 }))
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error al activar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleExcluir = async (propiedadId: number) => {
    if (!supabase) return

    if (!confirm('Excluir permanentemente impedirá que esta propiedad entre al matching en el futuro.')) {
      return
    }

    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_accion_excluida', {
        p_propiedad_id: propiedadId,
        p_accion: 'EXCLUIR'
      })

      if (error) throw error

      if (!data?.success) {
        throw new Error(data?.error || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, excluidos: prev.excluidos + 1 }))
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error al excluir: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleEliminar = async (propiedadId: number) => {
    if (!supabase) return

    if (!confirm('ELIMINAR borrará la propiedad PERMANENTEMENTE del sistema.')) {
      return
    }

    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_accion_excluida', {
        p_propiedad_id: propiedadId,
        p_accion: 'ELIMINAR'
      })

      if (error) throw error

      if (!data?.success) {
        throw new Error(data?.error || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, eliminados: prev.eliminados + 1 }))
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  // Filtrar propiedades por razón
  const propiedadesFiltradas = propiedades.filter(p => {
    if (filtroRazon === 'todas') return true
    if (filtroRazon === 'sin_precio') return p.razon_exclusion.includes('Sin precio')
    if (filtroRazon === 'sin_dormitorios') return p.razon_exclusion.includes('Sin dormitorios')
    if (filtroRazon === 'dorms_anomalos') return p.razon_exclusion.includes('Dormitorios anómalos')
    if (filtroRazon === 'score_bajo') return p.razon_exclusion.includes('Score bajo')
    if (filtroRazon === 'precio_m2') return p.razon_exclusion.includes('Precio/m²')
    return true
  })

  const getRazonBadges = (razon: string) => {
    const partes = razon.split(' | ')
    return partes.map((parte, idx) => {
      let color = 'bg-gray-100 text-gray-700'
      if (parte.includes('Sin precio')) color = 'bg-red-100 text-red-700'
      if (parte.includes('Sin dormitorios')) color = 'bg-orange-100 text-orange-700'
      if (parte.includes('Dormitorios anómalos')) color = 'bg-purple-100 text-purple-700'
      if (parte.includes('Score bajo')) color = 'bg-yellow-100 text-yellow-700'
      if (parte.includes('Precio/m²')) color = 'bg-blue-100 text-blue-700'

      return (
        <span key={idx} className={`text-xs px-2 py-0.5 rounded ${color}`}>
          {parte}
        </span>
      )
    })
  }

  const getFuenteBadge = (fuente: string) => {
    if (fuente === 'century21') return 'bg-yellow-100 text-yellow-800'
    if (fuente === 'remax') return 'bg-red-100 text-red-800'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <>
      <Head>
        <title>Supervisor Excluidas | SICI Admin</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/admin/propiedades" className="text-gray-500 hover:text-gray-700">
                  &larr; Admin
                </Link>
                <h1 className="text-xl font-semibold text-gray-900">
                  Propiedades Excluidas
                </h1>
                <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                  {propiedadesFiltradas.length} para revisar
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-blue-600">
                  {stats.corregidos} corregidos
                </span>
                <span className="text-green-600">
                  {stats.activados} activados
                </span>
                <span className="text-gray-600">
                  {stats.excluidos} excluidos
                </span>
                <span className="text-red-600">
                  {stats.eliminados} eliminados
                </span>
                <button
                  onClick={() => { fetchPropiedades(); fetchResumen(); }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Refrescar
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* Resumen */}
          {resumen && (
            <div className="mb-4 bg-white rounded-lg shadow p-4">
              <h3 className="font-medium text-gray-700 mb-3">Resumen de excluidas</h3>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{resumen.sin_precio}</div>
                  <div className="text-gray-500">Sin precio</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{resumen.sin_dormitorios}</div>
                  <div className="text-gray-500">Sin dormitorios</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{resumen.dorms_anomalos}</div>
                  <div className="text-gray-500">Dorms anómalos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{resumen.score_bajo}</div>
                  <div className="text-gray-500">Score bajo</div>
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="mb-4 flex gap-2 flex-wrap">
            <span className="text-sm text-gray-500 self-center">Filtrar por razón:</span>
            {[
              { value: 'todas', label: 'Todas' },
              { value: 'sin_precio', label: 'Sin precio' },
              { value: 'sin_dormitorios', label: 'Sin dormitorios' },
              { value: 'dorms_anomalos', label: 'Dorms anómalos' },
              { value: 'score_bajo', label: 'Score bajo' },
              { value: 'precio_m2', label: 'Precio/m² raro' }
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltroRazon(f.value as FiltroRazon)}
                className={`px-3 py-1 rounded-full text-sm ${
                  filtroRazon === f.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Leyenda */}
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <strong>Acciones disponibles:</strong>
            <ul className="mt-1 ml-4 list-disc">
              <li><strong>Corregir:</strong> Arreglar datos (dormitorios/precio) y re-procesar</li>
              <li><strong>Activar:</strong> Forzar entrada al matching (datos OK)</li>
              <li><strong>Excluir:</strong> Bloquear permanentemente del matching</li>
              <li><strong>Eliminar:</strong> Borrar del sistema (irreversible)</li>
            </ul>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Cargando propiedades...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {/* Sin propiedades */}
          {!loading && !error && propiedadesFiltradas.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <div className="text-5xl mb-4">&#127881;</div>
              <h2 className="text-xl font-medium text-gray-900">Sin propiedades excluidas</h2>
              <p className="text-gray-500 mt-2">
                {filtroRazon !== 'todas'
                  ? 'No hay propiedades con este filtro'
                  : 'Todas las propiedades están en el pipeline de matching'}
              </p>
            </div>
          )}

          {/* Lista */}
          {!loading && propiedadesFiltradas.length > 0 && (
            <div className="space-y-4">
              {propiedadesFiltradas.map((prop) => (
                <div key={prop.propiedad_id} className="bg-white rounded-lg shadow border">
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">
                            Propiedad #{prop.propiedad_id}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${getFuenteBadge(prop.fuente)}`}>
                            {prop.fuente.toUpperCase()}
                          </span>
                          {prop.score_calidad && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              prop.score_calidad >= 70 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              Score: {prop.score_calidad}
                            </span>
                          )}
                        </div>
                        {prop.nombre_edificio && (
                          <p className="text-sm text-gray-600">{prop.nombre_edificio}</p>
                        )}
                      </div>
                      <div className="flex gap-2 text-sm">
                        <a
                          href={prop.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Ver listing
                        </a>
                        <Link
                          href={`/admin/propiedades/${prop.propiedad_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Editar
                        </Link>
                      </div>
                    </div>

                    {/* Datos actuales */}
                    <div className="grid grid-cols-5 gap-4 mb-3 text-sm bg-gray-50 rounded-lg p-3">
                      <div>
                        <span className="text-gray-500">Precio:</span>
                        <span className={`ml-1 font-medium ${!prop.precio_usd ? 'text-red-600' : ''}`}>
                          {prop.precio_usd ? `$${prop.precio_usd.toLocaleString()}` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Precio/m²:</span>
                        <span className={`ml-1 font-medium ${
                          prop.precio_m2 && (prop.precio_m2 < 500 || prop.precio_m2 > 5000) ? 'text-red-600' : ''
                        }`}>
                          {prop.precio_m2 ? `$${prop.precio_m2.toLocaleString()}` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Dormitorios:</span>
                        <span className={`ml-1 font-medium ${
                          !prop.dormitorios || prop.dormitorios > 10 ? 'text-red-600' : ''
                        }`}>
                          {prop.dormitorios ?? 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Área:</span>
                        <span className="ml-1 font-medium">
                          {prop.area_m2 ? `${prop.area_m2}m²` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Zona:</span>
                        <span className="ml-1 font-medium">
                          {prop.zona || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Razón de exclusión */}
                    <div className="mb-3">
                      <span className="text-sm text-gray-500 mr-2">Razón:</span>
                      <div className="inline-flex flex-wrap gap-1">
                        {getRazonBadges(prop.razon_exclusion)}
                      </div>
                    </div>

                    {/* Acciones */}
                    {modoCorregir !== prop.propiedad_id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setModoCorregir(prop.propiedad_id)
                            setDormsCorregido(prop.dormitorios?.toString() || '')
                            setPrecioCorregido(prop.precio_usd?.toString() || '')
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                        >
                          Corregir
                        </button>
                        <button
                          onClick={() => handleActivar(prop.propiedad_id)}
                          disabled={procesando}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                        >
                          Activar
                        </button>
                        <button
                          onClick={() => handleExcluir(prop.propiedad_id)}
                          disabled={procesando}
                          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 text-sm"
                        >
                          Excluir
                        </button>
                        <button
                          onClick={() => handleEliminar(prop.propiedad_id)}
                          disabled={procesando}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
                        >
                          Eliminar
                        </button>
                      </div>
                    ) : (
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Corregir datos:</p>
                        <div className="flex gap-3 items-end">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Dormitorios</label>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={dormsCorregido}
                              onChange={(e) => setDormsCorregido(e.target.value)}
                              className="border rounded-lg px-3 py-2 text-sm w-24"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Precio USD</label>
                            <input
                              type="number"
                              min="0"
                              value={precioCorregido}
                              onChange={(e) => setPrecioCorregido(e.target.value)}
                              className="border rounded-lg px-3 py-2 text-sm w-32"
                            />
                          </div>
                          <button
                            onClick={() => handleCorregir(prop.propiedad_id)}
                            disabled={procesando || (!dormsCorregido && !precioCorregido)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            Aplicar
                          </button>
                          <button
                            onClick={() => {
                              setModoCorregir(null)
                              setDormsCorregido('')
                              setPrecioCorregido('')
                            }}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
