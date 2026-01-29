import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Proyecto {
  id_proyecto_master: number
  nombre_oficial: string
  desarrollador: string | null
  zona: string | null
  latitud: number | null
  longitud: number | null
  activo: boolean
  estado_construccion: string | null
  fecha_entrega: string | null
  amenidades_edificio: string[] | null
  cantidad_pisos: number | null
  total_unidades: number | null
  updated_at: string | null
  // Agregado por la query
  propiedades_count?: number
}

interface ProyectoStats {
  total_activos: number
  en_preventa: number
  en_construccion: number
  entrega_inmediata: number
  sin_desarrollador: number
  con_gps: number
  con_amenidades: number
}

const ZONAS = [
  { id: '', label: 'Todas las zonas' },
  { id: 'Equipetrol', label: 'Equipetrol Centro' },
  { id: 'Sirari', label: 'Sirari' },
  { id: 'Equipetrol Norte', label: 'Equipetrol Norte' },
  { id: 'Villa Brigida', label: 'Villa Brígida' },
  { id: 'Faremafu', label: 'Equipetrol Oeste (Busch)' }
]

const ESTADOS_CONSTRUCCION = [
  { id: '', label: 'Todos los estados' },
  { id: 'entrega_inmediata', label: 'Entrega Inmediata' },
  { id: 'en_construccion', label: 'En Construcción' },
  { id: 'preventa', label: 'Preventa' },
  { id: 'en_planos', label: 'En Planos' },
  { id: 'usado', label: 'Usado' },
  { id: 'no_especificado', label: 'No Especificado' }
]

export default function AdminProyectos() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [stats, setStats] = useState<ProyectoStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [zona, setZona] = useState('')
  const [estado, setEstado] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloSinDesarrollador, setSoloSinDesarrollador] = useState(false)

  useEffect(() => {
    fetchProyectos()
    fetchStats()
  }, [zona, estado, soloSinDesarrollador])

  const fetchStats = async () => {
    if (!supabase) return

    try {
      // Obtener stats desde la vista o calcular manualmente
      const { data, error } = await supabase
        .from('proyectos_master')
        .select('estado_construccion, desarrollador, latitud, longitud, amenidades_edificio, activo')

      if (error) throw error

      const activos = data?.filter(p => p.activo) || []
      setStats({
        total_activos: activos.length,
        en_preventa: activos.filter(p => p.estado_construccion === 'preventa').length,
        en_construccion: activos.filter(p => p.estado_construccion === 'en_construccion').length,
        entrega_inmediata: activos.filter(p => p.estado_construccion === 'entrega_inmediata').length,
        sin_desarrollador: activos.filter(p => !p.desarrollador).length,
        con_gps: activos.filter(p => p.latitud && p.longitud).length,
        con_amenidades: activos.filter(p => p.amenidades_edificio && p.amenidades_edificio.length > 0).length
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  const fetchProyectos = async () => {
    if (!supabase) return

    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('proyectos_master')
        .select('*')
        .eq('activo', true)
        .order('nombre_oficial')

      if (zona) {
        query = query.ilike('zona', `%${zona}%`)
      }

      if (estado) {
        query = query.eq('estado_construccion', estado)
      }

      if (soloSinDesarrollador) {
        query = query.is('desarrollador', null)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      // Obtener conteo de propiedades por proyecto
      const proyectosConConteo = await Promise.all(
        (data || []).map(async (proyecto) => {
          const { count } = await supabase
            .from('propiedades_v2')
            .select('id', { count: 'exact', head: true })
            .eq('id_proyecto_master', proyecto.id_proyecto_master)
            .eq('status', 'completado')

          return {
            ...proyecto,
            propiedades_count: count || 0
          }
        })
      )

      // Filtrar por búsqueda en frontend
      let resultado = proyectosConConteo
      if (busqueda.trim()) {
        const termino = busqueda.toLowerCase()
        resultado = resultado.filter(p =>
          p.nombre_oficial.toLowerCase().includes(termino) ||
          p.desarrollador?.toLowerCase().includes(termino)
        )
      }

      setProyectos(resultado)
    } catch (err: any) {
      setError(err.message || 'Error cargando proyectos')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatFecha = (fecha: string | null): string => {
    if (!fecha) return '-'
    const date = new Date(fecha)
    return date.toLocaleDateString('es-BO', { month: 'short', year: 'numeric' })
  }

  const getEstadoBadge = (estado: string | null) => {
    switch (estado) {
      case 'entrega_inmediata':
        return <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">Entrega Inmediata</span>
      case 'en_construccion':
        return <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded">En Construcción</span>
      case 'preventa':
        return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">Preventa</span>
      case 'en_planos':
        return <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded">En Planos</span>
      case 'usado':
        return <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded">Usado</span>
      default:
        return <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded">Sin especificar</span>
    }
  }

  return (
    <>
      <Head>
        <title>Admin - Proyectos | SICI</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Panel Admin</h1>
              <p className="text-slate-400 text-sm">Proyectos Master</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm">
                Propiedades
              </Link>
              <Link href="/admin/brokers" className="text-slate-300 hover:text-white text-sm">
                Brokers
              </Link>
              <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm">
                Ir a Buscar
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-8 px-6">
          {/* Stats Dashboard */}
          {stats && (
            <div className="grid grid-cols-7 gap-4 mb-8">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-sm">Total Activos</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total_activos}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-200">
                <p className="text-blue-600 text-sm">Preventa</p>
                <p className="text-2xl font-bold text-blue-700">{stats.en_preventa}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-200">
                <p className="text-amber-600 text-sm">En Construcción</p>
                <p className="text-2xl font-bold text-amber-700">{stats.en_construccion}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-200">
                <p className="text-green-600 text-sm">Entrega Inmediata</p>
                <p className="text-2xl font-bold text-green-700">{stats.entrega_inmediata}</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-4 shadow-sm border border-orange-200">
                <p className="text-orange-600 text-sm">Sin Desarrollador</p>
                <p className="text-2xl font-bold text-orange-700">{stats.sin_desarrollador}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-sm">Con GPS</p>
                <p className="text-2xl font-bold text-green-600">{stats.con_gps}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-sm">Con Amenidades</p>
                <p className="text-2xl font-bold text-purple-600">{stats.con_amenidades}</p>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Buscar proyecto o desarrollador..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchProyectos()}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>

              <select
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                {ZONAS.map(z => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>

              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                {ESTADOS_CONSTRUCCION.map(e => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloSinDesarrollador}
                  onChange={(e) => setSoloSinDesarrollador(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-orange-600">Sin desarrollador</span>
              </label>

              <button
                onClick={fetchProyectos}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
              >
                Buscar
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Lista de proyectos */}
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-4 text-slate-500">Cargando proyectos...</p>
              </div>
            ) : proyectos.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <p className="text-slate-500">No se encontraron proyectos</p>
              </div>
            ) : (
              proyectos.map((proyecto) => (
                <div
                  key={proyecto.id_proyecto_master}
                  className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg text-slate-900">{proyecto.nombre_oficial}</h3>
                          <span className="text-xs text-slate-400">ID: {proyecto.id_proyecto_master}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                          {proyecto.desarrollador ? (
                            <span>{proyecto.desarrollador}</span>
                          ) : (
                            <span className="text-orange-500 italic">Sin desarrollador</span>
                          )}
                          {proyecto.zona && <span>• {proyecto.zona}</span>}
                        </div>
                      </div>
                      <Link
                        href={`/admin/proyectos/${proyecto.id_proyecto_master}`}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        Editar
                      </Link>
                    </div>

                    {/* Info */}
                    <div className="border-t border-slate-100 pt-3 mt-3">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        {/* Estado */}
                        <div className="flex items-center gap-2">
                          {getEstadoBadge(proyecto.estado_construccion)}
                          {proyecto.fecha_entrega && (
                            <span className="text-slate-500">
                              Entrega: {formatFecha(proyecto.fecha_entrega)}
                            </span>
                          )}
                        </div>

                        {/* GPS */}
                        {proyecto.latitud && proyecto.longitud ? (
                          <span className="text-green-600 text-xs">
                            GPS verificado
                          </span>
                        ) : (
                          <span className="text-orange-500 text-xs">
                            Sin GPS
                          </span>
                        )}

                        {/* Pisos y unidades */}
                        {proyecto.cantidad_pisos && (
                          <span className="text-slate-600">
                            {proyecto.cantidad_pisos} pisos
                          </span>
                        )}
                        {proyecto.total_unidades && (
                          <span className="text-slate-600">
                            {proyecto.total_unidades} unidades
                          </span>
                        )}

                        {/* Propiedades vinculadas */}
                        <span className="text-slate-600">
                          {proyecto.propiedades_count} propiedades vinculadas
                        </span>
                      </div>

                      {/* Amenidades */}
                      {proyecto.amenidades_edificio && proyecto.amenidades_edificio.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {proyecto.amenidades_edificio.slice(0, 5).map((amenidad, idx) => (
                            <span
                              key={idx}
                              className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded"
                            >
                              {amenidad}
                            </span>
                          ))}
                          {proyecto.amenidades_edificio.length > 5 && (
                            <span className="text-xs text-slate-500">
                              +{proyecto.amenidades_edificio.length - 5} más
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Contador */}
          {!loading && proyectos.length > 0 && (
            <div className="mt-6 text-center text-sm text-slate-500">
              Mostrando {proyectos.length} proyectos
            </div>
          )}
        </main>
      </div>
    </>
  )
}
