import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Propiedad {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  microzona: string | null
  dormitorios: number
  banos: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  score_calidad: number
  asesor_nombre: string | null
  asesor_wsp: string | null
  asesor_inmobiliaria: string | null
  fotos_urls: string[]
  cantidad_fotos: number
  url: string
  amenities_confirmados: string[] | null
  amenities_por_verificar: string[] | null
  equipamiento_detectado: string[] | null
  estado_construccion: string
  latitud: number | null
  longitud: number | null
  estacionamientos: number | null
  baulera: boolean | null
}

interface CamposBloqueados {
  [key: string]: {
    bloqueado: boolean
    por: string
    usuario_nombre: string
    fecha: string
  } | boolean
}

interface PropiedadConCandados extends Propiedad {
  campos_bloqueados?: CamposBloqueados
  fuente?: string
  // Campos de normalización
  precio_usd_original?: number | null
  moneda_original?: string | null
  tipo_cambio_detectado?: string | null
  tipo_cambio_usado?: number | null
}

const ZONAS = [
  { id: '', label: 'Todas las zonas' },
  { id: 'Equipetrol', label: 'Equipetrol Centro' },
  { id: 'Sirari', label: 'Sirari' },
  { id: 'Equipetrol Norte', label: 'Equipetrol Norte' },
  { id: 'Villa Brígida', label: 'Villa Brígida' },
  { id: 'Equipetrol Oeste', label: 'Equipetrol Oeste (Busch)' }
]

export default function AdminPropiedades() {
  const [propiedades, setPropiedades] = useState<PropiedadConCandados[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [zona, setZona] = useState('')
  const [dormitorios, setDormitorios] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [limite, setLimite] = useState(50)
  const [soloConCandados, setSoloConCandados] = useState(false)
  const [soloPreciosSospechosos, setSoloPreciosSospechosos] = useState(false)

  useEffect(() => {
    fetchPropiedades()
  }, [zona, dormitorios, limite, soloConCandados, soloPreciosSospechosos])

  const fetchPropiedades = async () => {
    if (!supabase) return

    setLoading(true)
    setError(null)

    try {
      // Construir filtros para buscar_unidades_reales
      const filtros: Record<string, any> = {
        limite: limite,
        incluir_outliers: true,
        incluir_multiproyecto: true,
        incluir_datos_viejos: true
      }

      if (zona) {
        filtros.zona = zona
      }
      if (dormitorios && dormitorios !== 'todos') {
        filtros.dormitorios = parseInt(dormitorios)
      }

      // Llamar a buscar_unidades_reales via RPC
      const { data: unidades, error: rpcError } = await supabase
        .rpc('buscar_unidades_reales', { p_filtros: filtros })

      if (rpcError) {
        throw new Error(rpcError.message)
      }

      // Si necesitamos info de candados, hacemos otra consulta
      const ids = (unidades || []).map((u: any) => u.id)

      if (ids.length > 0) {
        const { data: propiedadesData, error: propsError } = await supabase
          .from('propiedades_v2')
          .select('id, campos_bloqueados, fuente, precio_usd_original, moneda_original, tipo_cambio_detectado, tipo_cambio_usado')
          .in('id', ids)

        if (propsError) {
          console.error('Error obteniendo candados:', propsError)
        }

        // Combinar datos
        const candadosMap = new Map(
          (propiedadesData || []).map((p: any) => [p.id, p])
        )

        let resultado = (unidades || []).map((u: any) => {
          const extra = candadosMap.get(u.id)
          return {
            ...u,
            campos_bloqueados: extra?.campos_bloqueados || {},
            fuente: extra?.fuente || '',
            precio_usd_original: extra?.precio_usd_original,
            moneda_original: extra?.moneda_original,
            tipo_cambio_detectado: extra?.tipo_cambio_detectado,
            tipo_cambio_usado: extra?.tipo_cambio_usado
          }
        })

        // Filtrar por candados si está activo
        if (soloConCandados) {
          resultado = resultado.filter((p: PropiedadConCandados) => {
            const candados = p.campos_bloqueados || {}
            return Object.keys(candados).length > 0 &&
              JSON.stringify(candados) !== '{}' &&
              JSON.stringify(candados) !== 'null'
          })
        }

        // Filtrar por precios sospechosos si está activo
        if (soloPreciosSospechosos) {
          resultado = resultado.filter((p: PropiedadConCandados) => {
            const precioM2 = p.precio_m2 || 0
            return precioM2 < 1200 || precioM2 > 3200
          })
        }

        // Filtrar por búsqueda
        if (busqueda.trim()) {
          const termino = busqueda.toLowerCase()
          resultado = resultado.filter((p: PropiedadConCandados) =>
            p.proyecto?.toLowerCase().includes(termino) ||
            p.asesor_nombre?.toLowerCase().includes(termino) ||
            p.asesor_inmobiliaria?.toLowerCase().includes(termino)
          )
        }

        setPropiedades(resultado)
      } else {
        setPropiedades([])
      }

    } catch (err: any) {
      setError(err.message || 'Error cargando propiedades')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const contarCandados = (campos: CamposBloqueados | undefined): number => {
    if (!campos || typeof campos !== 'object') return 0
    return Object.keys(campos).filter(k => {
      const v = campos[k]
      return v === true || (typeof v === 'object' && v?.bloqueado === true)
    }).length
  }

  const formatPrecio = (precio: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(precio)
  }

  // Detectar precio sospechoso basado en precio/m²
  const getPrecioAlerta = (precioM2: number): { tipo: 'error' | 'warning' | null; mensaje: string } => {
    if (precioM2 < 800) {
      return { tipo: 'error', mensaje: `$${precioM2}/m² muy bajo` }
    }
    if (precioM2 < 1200) {
      return { tipo: 'warning', mensaje: `$${precioM2}/m² bajo` }
    }
    if (precioM2 > 4000) {
      return { tipo: 'error', mensaje: `$${precioM2}/m² muy alto` }
    }
    if (precioM2 > 3200) {
      return { tipo: 'warning', mensaje: `$${precioM2}/m² alto` }
    }
    return { tipo: null, mensaje: '' }
  }

  const contarSospechosos = (): number => {
    return propiedades.filter(p => getPrecioAlerta(p.precio_m2).tipo !== null).length
  }

  const getFuenteBadge = (fuente: string | undefined) => {
    if (fuente === 'century21') {
      return <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">C21</span>
    }
    if (fuente === 'remax') {
      return <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">RE/MAX</span>
    }
    return null
  }

  return (
    <>
      <Head>
        <title>Admin - Propiedades | SICI</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Panel Admin</h1>
              <p className="text-slate-400 text-sm">Editor de Propiedades v2</p>
            </div>
            <div className="flex items-center gap-4">
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
          {/* Stats rápidos */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Mostrando</p>
              <p className="text-2xl font-bold text-slate-900">{propiedades.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Con Candados</p>
              <p className="text-2xl font-bold text-blue-600">
                {propiedades.filter(p => contarCandados(p.campos_bloqueados) > 0).length}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Precio Promedio</p>
              <p className="text-2xl font-bold text-green-600">
                {formatPrecio(propiedades.reduce((acc, p) => acc + (p.precio_usd || 0), 0) / (propiedades.length || 1))}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Con Fotos</p>
              <p className="text-2xl font-bold text-purple-600">
                {propiedades.filter(p => p.cantidad_fotos > 0).length}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">⚠️ Precio Sospechoso</p>
              <p className="text-2xl font-bold text-red-600">
                {contarSospechosos()}
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Buscar proyecto o broker..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchPropiedades()}
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
                value={dormitorios}
                onChange={(e) => setDormitorios(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                <option value="">Dormitorios</option>
                <option value="todos">Todos</option>
                <option value="1">1 dorm</option>
                <option value="2">2 dorms</option>
                <option value="3">3 dorms</option>
                <option value="4">4+ dorms</option>
              </select>

              <select
                value={limite.toString()}
                onChange={(e) => setLimite(parseInt(e.target.value))}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                <option value="25">25 resultados</option>
                <option value="50">50 resultados</option>
                <option value="100">100 resultados</option>
                <option value="200">200 resultados</option>
              </select>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloConCandados}
                  onChange={(e) => setSoloConCandados(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-slate-700">Solo editadas</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloPreciosSospechosos}
                  onChange={(e) => setSoloPreciosSospechosos(e.target.checked)}
                  className="w-4 h-4 rounded text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-red-600">⚠️ Precios sospechosos</span>
              </label>

              <button
                onClick={fetchPropiedades}
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

          {/* Lista de propiedades */}
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-4 text-slate-500">Cargando propiedades...</p>
              </div>
            ) : propiedades.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <p className="text-slate-500">No se encontraron propiedades</p>
              </div>
            ) : (
              propiedades.map((prop) => (
                <div
                  key={prop.id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="flex">
                    {/* Foto */}
                    <div className="w-48 h-36 bg-slate-200 flex-shrink-0 relative">
                      {prop.fotos_urls && prop.fotos_urls.length > 0 ? (
                        <img
                          src={prop.fotos_urls[0]}
                          alt={prop.proyecto}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {prop.cantidad_fotos > 1 && (
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                          {prop.cantidad_fotos} fotos
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900">{prop.proyecto}</h3>
                            {getFuenteBadge(prop.fuente)}
                            <span className="text-xs text-slate-400">ID: {prop.id}</span>
                          </div>
                          <p className="text-sm text-slate-500">
                            {prop.zona}
                            {prop.desarrollador && ` - ${prop.desarrollador}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-slate-900">{formatPrecio(prop.precio_usd)}</p>
                          <div className="flex items-center justify-end gap-2">
                            <p className="text-sm text-slate-500">${prop.precio_m2}/m²</p>
                            {getPrecioAlerta(prop.precio_m2).tipo === 'error' && (
                              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded" title={getPrecioAlerta(prop.precio_m2).mensaje}>
                                ⚠️ {getPrecioAlerta(prop.precio_m2).mensaje}
                              </span>
                            )}
                            {getPrecioAlerta(prop.precio_m2).tipo === 'warning' && (
                              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded" title={getPrecioAlerta(prop.precio_m2).mensaje}>
                                ⚠️ {getPrecioAlerta(prop.precio_m2).mensaje}
                              </span>
                            )}
                          </div>
                          {/* Solo mostrar normalización si hay certeza (paralelo/oficial detectado) */}
                          {prop.moneda_original === 'BOB' &&
                           prop.tipo_cambio_usado &&
                           prop.tipo_cambio_detectado &&
                           prop.tipo_cambio_detectado !== 'no_especificado' && (
                            <p className="text-xs text-green-600 mt-0.5">
                              {prop.tipo_cambio_detectado === 'paralelo' ? (
                                <>✓ USD paralelo → oficial</>
                              ) : (
                                <>✓ Bs.{Number(prop.precio_usd_original).toLocaleString()} ÷ TC {prop.tipo_cambio_usado}</>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Características */}
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <span className="text-slate-700">
                          <strong>{prop.area_m2}</strong>m²
                        </span>
                        <span className="text-slate-700">
                          {prop.dormitorios === 0 ? (
                            <strong>Monoambiente</strong>
                          ) : (
                            <><strong>{prop.dormitorios}</strong> dorm</>
                          )}
                        </span>
                        <span className="text-slate-700">
                          <strong>{prop.banos}</strong> baños
                        </span>
                        {prop.estacionamientos && prop.estacionamientos > 0 && (
                          <span className="text-slate-700">
                            <strong>{prop.estacionamientos}</strong> parqueo
                          </span>
                        )}
                        {prop.baulera && (
                          <span className="text-green-600">+ Baulera</span>
                        )}
                      </div>

                      {/* Broker */}
                      {prop.asesor_nombre && (
                        <p className="text-sm text-slate-500 mt-2">
                          Broker: <span className="text-slate-700">{prop.asesor_nombre}</span>
                          {prop.asesor_wsp && ` - ${prop.asesor_wsp}`}
                          {prop.asesor_inmobiliaria && ` - ${prop.asesor_inmobiliaria}`}
                        </p>
                      )}

                      {/* Amenities */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {prop.amenities_confirmados?.slice(0, 4).map(a => (
                          <span key={a} className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded">
                            {a}
                          </span>
                        ))}
                        {prop.amenities_por_verificar && prop.amenities_por_verificar.length > 0 && (
                          <span className="bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded">
                            +{prop.amenities_por_verificar.length} por verificar
                          </span>
                        )}
                        {prop.equipamiento_detectado && prop.equipamiento_detectado.length > 0 && (
                          <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                            {prop.equipamiento_detectado.length} equipamientos
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-3">
                          {contarCandados(prop.campos_bloqueados) > 0 && (
                            <span className="bg-purple-50 text-purple-700 text-xs px-2 py-1 rounded flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              {contarCandados(prop.campos_bloqueados)} bloqueados
                            </span>
                          )}
                          {prop.url && (
                            <a
                              href={prop.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Ver fuente original
                            </a>
                          )}
                        </div>
                        <Link
                          href={`/admin/propiedades/${prop.id}`}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                          Editar
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </>
  )
}
