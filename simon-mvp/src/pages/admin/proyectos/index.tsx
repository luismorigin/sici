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

// Para autocompletado
interface ProyectoSuggestion {
  id: number
  nombre: string
  desarrollador: string | null
  tipo: 'proyecto' | 'desarrollador'
  count?: number
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

const ORDEN_OPCIONES = [
  { id: 'propiedades_desc', label: 'Más propiedades' },
  { id: 'propiedades_asc', label: 'Menos propiedades' },
  { id: 'nombre_asc', label: 'Nombre A-Z' },
  { id: 'nombre_desc', label: 'Nombre Z-A' }
]

// Mapear zona de BD a label consistente
const getZonaLabel = (zona: string | null): string => {
  if (!zona) return 'Sin zona'
  // Buscar coincidencia exacta o parcial
  const found = ZONAS.find(z =>
    z.id && (
      z.id.toLowerCase() === zona.toLowerCase() ||
      zona.toLowerCase().includes(z.id.toLowerCase()) ||
      z.label.toLowerCase() === zona.toLowerCase()
    )
  )
  return found?.label || zona
}

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
  const [ordenarPor, setOrdenarPor] = useState('propiedades_desc')

  // Autocompletado
  const [allProyectos, setAllProyectos] = useState<Proyecto[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [seleccionado, setSeleccionado] = useState<{ tipo: 'proyecto' | 'desarrollador'; valor: string; id?: number } | null>(null)

  useEffect(() => {
    fetchProyectos()
    fetchStats()
  }, [zona, estado, soloSinDesarrollador, ordenarPor, seleccionado])

  // Cargar todos los proyectos para autocompletado
  useEffect(() => {
    const fetchAll = async () => {
      if (!supabase) return
      const { data } = await supabase
        .from('proyectos_master')
        .select('id_proyecto_master, nombre_oficial, desarrollador')
        .eq('activo', true)
        .order('nombre_oficial')

      if (data) {
        setAllProyectos(data.map(p => ({
          ...p,
          id_proyecto_master: p.id_proyecto_master,
          nombre_oficial: p.nombre_oficial,
          desarrollador: p.desarrollador
        } as Proyecto)))
      }
    }
    fetchAll()
  }, [])

  // Cerrar sugerencias al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.search-container')) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchStats = async () => {
    if (!supabase) return

    try {
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

      if (zona) {
        query = query.ilike('zona', `%${zona}%`)
      }

      if (estado) {
        query = query.eq('estado_construccion', estado)
      }

      if (soloSinDesarrollador) {
        query = query.is('desarrollador', null)
      }

      // Filtrar por selección de autocompletado
      if (seleccionado) {
        if (seleccionado.tipo === 'proyecto' && seleccionado.id) {
          query = query.eq('id_proyecto_master', seleccionado.id)
        } else if (seleccionado.tipo === 'desarrollador') {
          query = query.eq('desarrollador', seleccionado.valor)
        }
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

      // Ordenar según criterio seleccionado
      let resultado = [...proyectosConConteo]
      switch (ordenarPor) {
        case 'propiedades_desc':
          resultado.sort((a, b) => (b.propiedades_count || 0) - (a.propiedades_count || 0))
          break
        case 'propiedades_asc':
          resultado.sort((a, b) => (a.propiedades_count || 0) - (b.propiedades_count || 0))
          break
        case 'nombre_asc':
          resultado.sort((a, b) => a.nombre_oficial.localeCompare(b.nombre_oficial))
          break
        case 'nombre_desc':
          resultado.sort((a, b) => b.nombre_oficial.localeCompare(a.nombre_oficial))
          break
      }

      setProyectos(resultado)
    } catch (err: any) {
      setError(err.message || 'Error cargando proyectos')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Generar sugerencias de autocompletado
  const getSuggestions = (): ProyectoSuggestion[] => {
    if (!busqueda.trim() || busqueda.length < 2) return []

    const termino = busqueda.toLowerCase()
    const suggestions: ProyectoSuggestion[] = []

    // Buscar proyectos por nombre
    const proyectoMatches = allProyectos
      .filter(p => p.nombre_oficial.toLowerCase().includes(termino))
      .slice(0, 5)
      .map(p => ({
        id: p.id_proyecto_master,
        nombre: p.nombre_oficial,
        desarrollador: p.desarrollador,
        tipo: 'proyecto' as const
      }))

    suggestions.push(...proyectoMatches)

    // Buscar desarrolladores únicos
    const desarrolladores = new Map<string, number>()
    allProyectos.forEach(p => {
      if (p.desarrollador && p.desarrollador.toLowerCase().includes(termino)) {
        desarrolladores.set(p.desarrollador, (desarrolladores.get(p.desarrollador) || 0) + 1)
      }
    })

    const desarrolladorMatches = Array.from(desarrolladores.entries())
      .slice(0, 3)
      .map(([nombre, count]) => ({
        id: 0,
        nombre: nombre,
        desarrollador: null,
        tipo: 'desarrollador' as const,
        count
      }))

    suggestions.push(...desarrolladorMatches)

    return suggestions
  }

  const handleSelectSuggestion = (suggestion: ProyectoSuggestion) => {
    if (suggestion.tipo === 'proyecto') {
      setSeleccionado({ tipo: 'proyecto', valor: suggestion.nombre, id: suggestion.id })
      setBusqueda(suggestion.nombre)
    } else {
      setSeleccionado({ tipo: 'desarrollador', valor: suggestion.nombre })
      setBusqueda(suggestion.nombre)
    }
    setShowSuggestions(false)
  }

  const clearSelection = () => {
    setSeleccionado(null)
    setBusqueda('')
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

  const suggestions = getSuggestions()

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
              {/* Búsqueda con autocompletado */}
              <div className="flex-1 min-w-[250px] relative search-container">
                {seleccionado ? (
                  <div className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      seleccionado.tipo === 'proyecto' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {seleccionado.tipo === 'proyecto' ? 'Proyecto' : 'Desarrollador'}
                    </span>
                    <span className="font-medium text-slate-900">{seleccionado.valor}</span>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="ml-auto text-slate-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Buscar proyecto o desarrollador..."
                      value={busqueda}
                      onChange={(e) => {
                        setBusqueda(e.target.value)
                        setShowSuggestions(true)
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />

                    {/* Sugerencias */}
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                        {suggestions.map((s, idx) => (
                          <button
                            key={`${s.tipo}-${s.id || s.nombre}-${idx}`}
                            type="button"
                            onClick={() => handleSelectSuggestion(s)}
                            className="w-full px-4 py-2 text-left hover:bg-amber-50 border-b border-slate-100 last:border-0"
                          >
                            {s.tipo === 'proyecto' ? (
                              <>
                                <span className="font-medium text-slate-900">{s.nombre}</span>
                                {s.desarrollador && (
                                  <span className="block text-xs text-slate-500">{s.desarrollador}</span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-blue-700">{s.nombre}</span>
                                <span className="block text-xs text-slate-500">
                                  Desarrollador • {s.count} {s.count === 1 ? 'proyecto' : 'proyectos'}
                                </span>
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
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

              <select
                value={ordenarPor}
                onChange={(e) => setOrdenarPor(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                {ORDEN_OPCIONES.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
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
                          {/* Badge de propiedades destacado */}
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            (proyecto.propiedades_count || 0) > 5
                              ? 'bg-green-100 text-green-700'
                              : (proyecto.propiedades_count || 0) > 0
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {proyecto.propiedades_count} props
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                          {proyecto.desarrollador ? (
                            <span>{proyecto.desarrollador}</span>
                          ) : (
                            <span className="text-orange-500 italic">Sin desarrollador</span>
                          )}
                          <span>•</span>
                          <span>{getZonaLabel(proyecto.zona)}</span>
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
