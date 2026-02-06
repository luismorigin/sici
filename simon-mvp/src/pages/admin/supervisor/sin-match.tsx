import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

interface PropiedadSinMatch {
  id: number
  url: string
  latitud: number | null
  longitud: number | null
  zona: string | null
  nombre_edificio: string | null
  proyectos_cercanos: string
}

interface ProyectoCercano {
  id: number
  nombre: string
  distancia: number
}

interface ProyectoOption {
  id: number
  nombre: string
}

export default function SupervisorSinMatch() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin', 'supervisor'])
  const [propiedades, setPropiedades] = useState<PropiedadSinMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)

  // Para acciones
  const [modoAccion, setModoAccion] = useState<{ id: number; tipo: 'asignar' | 'crear' | 'corregir' } | null>(null)
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<number | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoGPS, setNuevoGPS] = useState('')

  // Lista completa de proyectos para búsqueda
  const [proyectosList, setProyectosList] = useState<ProyectoOption[]>([])
  const [busquedaProyecto, setBusquedaProyecto] = useState('')

  // Estadísticas
  const [stats, setStats] = useState({
    total: 0,
    asignados: 0,
    creados: 0,
    sinProyecto: 0
  })

  useEffect(() => {
    fetchPropiedades()
    fetchProyectos()
  }, [])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  const fetchPropiedades = async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('obtener_sin_match_para_exportar', {
        p_limit: 100
      })

      if (rpcError) throw rpcError

      setPropiedades(data || [])
      setStats(prev => ({ ...prev, total: data?.length || 0 }))
    } catch (err: any) {
      setError(err.message || 'Error al cargar propiedades')
    } finally {
      setLoading(false)
    }
  }

  const fetchProyectos = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial')
      .eq('activo', true)
      .order('nombre_oficial')

    if (data) {
      setProyectosList(data.map(p => ({
        id: p.id_proyecto_master,
        nombre: p.nombre_oficial
      })))
    }
  }

  // Parsear string de proyectos cercanos: "Torre Sol [ID:45] (32m) | Torre Luna [ID:67] (85m)"
  const parseProyectosCercanos = (texto: string): ProyectoCercano[] => {
    if (!texto || texto === 'Ninguno < 200m') return []

    const proyectos: ProyectoCercano[] = []
    const partes = texto.split(' | ')

    for (const parte of partes) {
      const match = parte.match(/^(.+) \[ID:(\d+)\] \((\d+)m\)$/)
      if (match) {
        proyectos.push({
          nombre: match[1].trim(),
          id: parseInt(match[2]),
          distancia: parseInt(match[3])
        })
      }
    }

    return proyectos
  }

  const handleAsignar = async (propiedadId: number, proyectoId: number) => {
    if (!supabase) return
    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_decision_sin_match', {
        p_propiedad_id: propiedadId,
        p_accion: 'asignar',
        p_proyecto_id: proyectoId
      })

      if (error) throw error

      const result = data?.[0]
      if (!result?.success) {
        throw new Error(result?.mensaje || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, asignados: prev.asignados + 1 }))
      resetModo()
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error al asignar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleCrear = async (propiedadId: number) => {
    if (!supabase || !nuevoNombre.trim()) return
    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_decision_sin_match', {
        p_propiedad_id: propiedadId,
        p_accion: 'crear',
        p_nombre_proyecto: nuevoNombre.trim(),
        p_gps_nuevo: nuevoGPS.trim() || null
      })

      if (error) throw error

      const result = data?.[0]
      if (!result?.success) {
        throw new Error(result?.mensaje || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, creados: prev.creados + 1 }))
      resetModo()
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error al crear: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleCorregir = async (propiedadId: number, proyectoId: number) => {
    if (!supabase) return
    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_decision_sin_match', {
        p_propiedad_id: propiedadId,
        p_accion: 'corregir',
        p_proyecto_id: proyectoId,
        p_nombre_proyecto: nuevoNombre.trim() || null,
        p_gps_nuevo: nuevoGPS.trim() || null
      })

      if (error) throw error

      const result = data?.[0]
      if (!result?.success) {
        throw new Error(result?.mensaje || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, asignados: prev.asignados + 1 }))
      resetModo()
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error al corregir: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleSinProyecto = async (propiedadId: number) => {
    if (!supabase) return

    if (!confirm('Marcar como "Sin Proyecto" excluirá esta propiedad del matching futuro.')) {
      return
    }

    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('procesar_decision_sin_match', {
        p_propiedad_id: propiedadId,
        p_accion: 'sin_proyecto'
      })

      if (error) throw error

      const result = data?.[0]
      if (!result?.success) {
        throw new Error(result?.mensaje || 'Error desconocido')
      }

      setStats(prev => ({ ...prev, sinProyecto: prev.sinProyecto + 1 }))
      await fetchPropiedades()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const resetModo = () => {
    setModoAccion(null)
    setProyectoSeleccionado(null)
    setNuevoNombre('')
    setNuevoGPS('')
    setBusquedaProyecto('')
  }

  const proyectosFiltrados = proyectosList.filter(p =>
    p.nombre.toLowerCase().includes(busquedaProyecto.toLowerCase())
  ).slice(0, 10)

  return (
    <>
      <Head>
        <title>Supervisor Sin Match | SICI Admin</title>
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
                  Propiedades Sin Proyecto
                </h1>
                <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                  {propiedades.length} huerfanas
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600">
                  {stats.asignados} asignados
                </span>
                <span className="text-blue-600">
                  {stats.creados} creados
                </span>
                <span className="text-gray-600">
                  {stats.sinProyecto} sin proyecto
                </span>
                <button
                  onClick={fetchPropiedades}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Refrescar
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* Leyenda */}
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <strong>Acciones disponibles:</strong>
            <ul className="mt-1 ml-4 list-disc">
              <li><strong>Asignar:</strong> Vincular a un proyecto existente cercano</li>
              <li><strong>Crear:</strong> Crear un nuevo proyecto y vincular</li>
              <li><strong>Corregir:</strong> Actualizar nombre/GPS de proyecto existente y vincular</li>
              <li><strong>Sin Proyecto:</strong> Excluir del matching (ej: casa particular)</li>
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

          {/* Sin pendientes */}
          {!loading && !error && propiedades.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <div className="text-5xl mb-4">&#127881;</div>
              <h2 className="text-xl font-medium text-gray-900">Sin propiedades huerfanas</h2>
              <p className="text-gray-500 mt-2">
                Todas las propiedades tienen un proyecto asignado
              </p>
            </div>
          )}

          {/* Lista de propiedades */}
          {!loading && propiedades.length > 0 && (
            <div className="space-y-4">
              {propiedades.map((prop) => {
                const proyectosCercanos = parseProyectosCercanos(prop.proyectos_cercanos)
                const enModoAccion = modoAccion?.id === prop.id

                return (
                  <div
                    key={prop.id}
                    className="bg-white rounded-lg shadow border"
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              Propiedad #{prop.id}
                            </span>
                            {prop.zona && (
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                {prop.zona}
                              </span>
                            )}
                          </div>
                          {prop.nombre_edificio && (
                            <p className="text-sm text-gray-600 mt-1">
                              Nombre detectado: <strong>{prop.nombre_edificio}</strong>
                            </p>
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
                          {prop.latitud && prop.longitud && (
                            <a
                              href={`https://www.google.com/maps?q=${prop.latitud},${prop.longitud}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Ver Maps
                            </a>
                          )}
                          <Link
                            href={`/admin/propiedades/${prop.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            Editar
                          </Link>
                        </div>
                      </div>

                      {/* Proyectos cercanos */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-gray-500 mb-2">Proyectos cercanos (&lt;200m):</p>
                        {proyectosCercanos.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {proyectosCercanos.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  if (!enModoAccion) {
                                    handleAsignar(prop.id, p.id)
                                  }
                                }}
                                disabled={procesando || enModoAccion}
                                className="px-3 py-1.5 bg-white border rounded-lg text-sm hover:bg-green-50 hover:border-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <span className="font-medium">{p.nombre}</span>
                                <span className="text-gray-500 ml-1">({p.distancia}m)</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Ninguno encontrado</p>
                        )}
                      </div>

                      {/* Acciones */}
                      {!enModoAccion ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setModoAccion({ id: prop.id, tipo: 'asignar' })}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                          >
                            Buscar proyecto
                          </button>
                          <button
                            onClick={() => {
                              setModoAccion({ id: prop.id, tipo: 'crear' })
                              setNuevoNombre(prop.nombre_edificio || '')
                              if (prop.latitud && prop.longitud) {
                                setNuevoGPS(`${prop.latitud}, ${prop.longitud}`)
                              }
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                          >
                            + Crear proyecto
                          </button>
                          {proyectosCercanos.length > 0 && (
                            <button
                              onClick={() => setModoAccion({ id: prop.id, tipo: 'corregir' })}
                              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
                            >
                              Corregir existente
                            </button>
                          )}
                          <button
                            onClick={() => handleSinProyecto(prop.id)}
                            disabled={procesando}
                            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 text-sm"
                          >
                            Sin proyecto
                          </button>
                        </div>
                      ) : (
                        <div className="bg-blue-50 rounded-lg p-4">
                          {/* Modo Asignar - Buscar proyecto */}
                          {modoAccion.tipo === 'asignar' && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2">Buscar proyecto:</p>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    value={busquedaProyecto}
                                    onChange={(e) => setBusquedaProyecto(e.target.value)}
                                    placeholder="Nombre del proyecto..."
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                  />
                                  {busquedaProyecto && proyectosFiltrados.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                      {proyectosFiltrados.map(p => (
                                        <button
                                          key={p.id}
                                          onClick={() => {
                                            setProyectoSeleccionado(p.id)
                                            setBusquedaProyecto(p.nombre)
                                          }}
                                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                                        >
                                          {p.nombre}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => proyectoSeleccionado && handleAsignar(prop.id, proyectoSeleccionado)}
                                  disabled={!proyectoSeleccionado || procesando}
                                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                                >
                                  Asignar
                                </button>
                                <button
                                  onClick={resetModo}
                                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Modo Crear */}
                          {modoAccion.tipo === 'crear' && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2">Crear nuevo proyecto:</p>
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={nuevoNombre}
                                  onChange={(e) => setNuevoNombre(e.target.value)}
                                  placeholder="Nombre del proyecto *"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                                <input
                                  type="text"
                                  value={nuevoGPS}
                                  onChange={(e) => setNuevoGPS(e.target.value)}
                                  placeholder="GPS (lat, lng) - opcional"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleCrear(prop.id)}
                                    disabled={!nuevoNombre.trim() || procesando}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                                  >
                                    Crear y asignar
                                  </button>
                                  <button
                                    onClick={resetModo}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Modo Corregir */}
                          {modoAccion.tipo === 'corregir' && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2">Corregir proyecto existente:</p>
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {proyectosCercanos.map((p) => (
                                    <button
                                      key={p.id}
                                      onClick={() => {
                                        setProyectoSeleccionado(p.id)
                                        setNuevoNombre(p.nombre)
                                      }}
                                      className={`px-3 py-1.5 border rounded-lg text-sm ${
                                        proyectoSeleccionado === p.id
                                          ? 'bg-blue-100 border-blue-400'
                                          : 'bg-white hover:bg-gray-50'
                                      }`}
                                    >
                                      {p.nombre} ({p.distancia}m)
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="text"
                                  value={nuevoNombre}
                                  onChange={(e) => setNuevoNombre(e.target.value)}
                                  placeholder="Nuevo nombre (opcional)"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                                <input
                                  type="text"
                                  value={nuevoGPS}
                                  onChange={(e) => setNuevoGPS(e.target.value)}
                                  placeholder="Nuevo GPS (lat, lng) - opcional"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => proyectoSeleccionado && handleCorregir(prop.id, proyectoSeleccionado)}
                                    disabled={!proyectoSeleccionado || procesando}
                                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                                  >
                                    Corregir y asignar
                                  </button>
                                  <button
                                    onClick={resetModo}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
