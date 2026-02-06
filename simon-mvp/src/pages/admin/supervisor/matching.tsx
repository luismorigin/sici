import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

interface MatchPendiente {
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

interface ProyectoOption {
  id: number
  nombre: string
}

export default function SupervisorMatching() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin', 'supervisor'])
  const [pendientes, setPendientes] = useState<MatchPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)

  // Selección para acciones en lote
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  // Para corregir (asignar a otro proyecto)
  const [modoCorregir, setModoCorregir] = useState<number | null>(null)
  const [proyectoCorregido, setProyectoCorregido] = useState<number | null>(null)
  const [proyectosList, setProyectosList] = useState<ProyectoOption[]>([])
  const [busquedaProyecto, setBusquedaProyecto] = useState('')

  // Estadísticas
  const [stats, setStats] = useState({
    total: 0,
    aprobados: 0,
    rechazados: 0
  })

  useEffect(() => {
    if (authLoading || !admin) return
    fetchPendientes()
    fetchProyectos()
  }, [authLoading])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  async function fetchPendientes() {
    if (!supabase) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('obtener_pendientes_para_sheets')

      if (rpcError) throw rpcError

      setPendientes(data || [])
      setStats(prev => ({ ...prev, total: data?.length || 0 }))
    } catch (err: any) {
      setError(err.message || 'Error al cargar pendientes')
    } finally {
      setLoading(false)
    }
  }

  async function fetchProyectos() {
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

  const handleAprobar = async (ids: number[]) => {
    if (!supabase || ids.length === 0) return
    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('aplicar_matches_revisados', {
        p_ids_aprobados: ids,
        p_ids_rechazados: []
      })

      if (error) throw error

      setStats(prev => ({ ...prev, aprobados: prev.aprobados + ids.length }))
      setSeleccionados(new Set())
      await fetchPendientes()
    } catch (err: any) {
      alert('Error al aprobar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleRechazar = async (ids: number[]) => {
    if (!supabase || ids.length === 0) return
    setProcesando(true)

    try {
      const { data, error } = await supabase.rpc('aplicar_matches_revisados', {
        p_ids_aprobados: [],
        p_ids_rechazados: ids
      })

      if (error) throw error

      setStats(prev => ({ ...prev, rechazados: prev.rechazados + ids.length }))
      setSeleccionados(new Set())
      await fetchPendientes()
    } catch (err: any) {
      alert('Error al rechazar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleCorregir = async (sugerenciaId: number, propiedadId: number, nuevoProyectoId: number) => {
    if (!supabase) return
    setProcesando(true)

    try {
      // Primero rechazar la sugerencia actual
      await supabase.rpc('aplicar_matches_revisados', {
        p_ids_aprobados: [],
        p_ids_rechazados: [sugerenciaId]
      })

      // Luego asignar directamente el proyecto a la propiedad
      const { error } = await supabase
        .from('propiedades_v2')
        .update({
          id_proyecto_master: nuevoProyectoId,
          metodo_match: 'correccion_humana',
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', propiedadId)

      if (error) throw error

      setModoCorregir(null)
      setProyectoCorregido(null)
      setBusquedaProyecto('')
      await fetchPendientes()
    } catch (err: any) {
      alert('Error al corregir: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const toggleSeleccion = (id: number) => {
    const nuevo = new Set(seleccionados)
    if (nuevo.has(id)) {
      nuevo.delete(id)
    } else {
      nuevo.add(id)
    }
    setSeleccionados(nuevo)
  }

  const seleccionarTodos = () => {
    if (seleccionados.size === pendientes.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(pendientes.map(p => p.id_sugerencia)))
    }
  }

  const getMetodoBadge = (metodo: string) => {
    const colores: Record<string, string> = {
      'fuzzy_nombre': 'bg-purple-100 text-purple-800',
      'gps_cercano': 'bg-blue-100 text-blue-800',
      'url_match': 'bg-green-100 text-green-800',
      'nombre_exacto': 'bg-emerald-100 text-emerald-800',
      'trigram': 'bg-orange-100 text-orange-800'
    }
    return colores[metodo] || 'bg-gray-100 text-gray-800'
  }

  const getFuenteBadge = (fuente: string) => {
    if (fuente === 'century21') return 'bg-yellow-100 text-yellow-800'
    if (fuente === 'remax') return 'bg-red-100 text-red-800'
    return 'bg-gray-100 text-gray-800'
  }

  const proyectosFiltrados = proyectosList.filter(p =>
    p.nombre.toLowerCase().includes(busquedaProyecto.toLowerCase())
  ).slice(0, 10)

  return (
    <>
      <Head>
        <title>Supervisor Matching | SICI Admin</title>
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
                  Supervisor Matching
                </h1>
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                  {pendientes.length} pendientes
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600">
                  {stats.aprobados} aprobados
                </span>
                <span className="text-red-600">
                  {stats.rechazados} rechazados
                </span>
                <button
                  onClick={fetchPendientes}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Refrescar
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* Acciones en lote */}
          {seleccionados.size > 0 && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <span className="text-blue-800">
                {seleccionados.size} seleccionados
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAprobar(Array.from(seleccionados))}
                  disabled={procesando}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Aprobar todos
                </button>
                <button
                  onClick={() => handleRechazar(Array.from(seleccionados))}
                  disabled={procesando}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Rechazar todos
                </button>
                <button
                  onClick={() => setSeleccionados(new Set())}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Cargando pendientes...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {/* Sin pendientes */}
          {!loading && !error && pendientes.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <div className="text-5xl mb-4">&#127881;</div>
              <h2 className="text-xl font-medium text-gray-900">Sin pendientes</h2>
              <p className="text-gray-500 mt-2">
                No hay matches pendientes de revisión (70-84% confianza)
              </p>
            </div>
          )}

          {/* Lista de pendientes */}
          {!loading && pendientes.length > 0 && (
            <div className="space-y-4">
              {/* Header de selección */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={seleccionados.size === pendientes.length}
                  onChange={seleccionarTodos}
                  className="rounded"
                />
                <span>Seleccionar todos</span>
              </div>

              {pendientes.map((match) => (
                <div
                  key={match.id_sugerencia}
                  className={`bg-white rounded-lg shadow border-2 transition-colors ${
                    seleccionados.has(match.id_sugerencia)
                      ? 'border-blue-400'
                      : 'border-transparent'
                  }`}
                >
                  <div className="p-4">
                    {/* Header de la tarjeta */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={seleccionados.has(match.id_sugerencia)}
                          onChange={() => toggleSeleccion(match.id_sugerencia)}
                          className="rounded mt-1"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              Propiedad #{match.propiedad_id}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${getFuenteBadge(match.fuente)}`}>
                              {match.fuente.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{match.nombre_edificio}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          match.confianza >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {match.confianza}% confianza
                        </div>
                      </div>
                    </div>

                    {/* Proyecto sugerido */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Proyecto sugerido</p>
                          <p className="font-medium text-gray-900">{match.proyecto_sugerido}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded ${getMetodoBadge(match.metodo)}`}>
                            {match.metodo.replace('_', ' ')}
                          </span>
                          {match.distancia_metros && (
                            <p className="text-sm text-gray-500 mt-1">
                              {Math.round(match.distancia_metros)}m de distancia
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Links y acciones */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3 text-sm">
                        <a
                          href={match.url_propiedad}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Ver propiedad
                        </a>
                        {match.latitud && match.longitud && (
                          <a
                            href={`https://www.google.com/maps?q=${match.latitud},${match.longitud}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            Ver en Maps
                          </a>
                        )}
                        <Link
                          href={`/admin/propiedades/${match.propiedad_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Editar propiedad
                        </Link>
                      </div>

                      {/* Botones de acción */}
                      {modoCorregir !== match.id_sugerencia ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAprobar([match.id_sugerencia])}
                            disabled={procesando}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleRechazar([match.id_sugerencia])}
                            disabled={procesando}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
                          >
                            Rechazar
                          </button>
                          <button
                            onClick={() => setModoCorregir(match.id_sugerencia)}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
                          >
                            Corregir
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={busquedaProyecto}
                              onChange={(e) => setBusquedaProyecto(e.target.value)}
                              placeholder="Buscar proyecto..."
                              className="border rounded-lg px-3 py-2 text-sm w-64"
                            />
                            {busquedaProyecto && proyectosFiltrados.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {proyectosFiltrados.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      setProyectoCorregido(p.id)
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
                            onClick={() => {
                              if (proyectoCorregido) {
                                handleCorregir(match.id_sugerencia, match.propiedad_id, proyectoCorregido)
                              }
                            }}
                            disabled={!proyectoCorregido || procesando}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            Aplicar
                          </button>
                          <button
                            onClick={() => {
                              setModoCorregir(null)
                              setProyectoCorregido(null)
                              setBusquedaProyecto('')
                            }}
                            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
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
