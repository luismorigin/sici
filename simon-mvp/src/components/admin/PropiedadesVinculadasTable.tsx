/**
 * Propiedades Vinculadas Table with stats dashboard + filters
 * Extracted from admin/proyectos/[id].tsx lines 1590-1827
 */
import Link from 'next/link'
import type { PropiedadVinculada, ProyectoStats } from '@/types/proyecto-editor'

interface PropiedadesVinculadasTableProps {
  propiedades: PropiedadVinculada[]
  propiedadesFiltradas: PropiedadVinculada[]
  propiedadesVisibles: PropiedadVinculada[]
  stats: ProyectoStats | null
  filtroDorms: number | null
  setFiltroDorms: (d: number | null) => void
  ordenarPor: 'precio' | 'precio_m2' | 'area' | 'dias'
  setOrdenarPor: (o: 'precio' | 'precio_m2' | 'area' | 'dias') => void
  ocultarViejas: boolean
  setOcultarViejas: (v: boolean) => void
  mostrarTodas: boolean
  setMostrarTodas: (v: boolean) => void
  formatPrecio: (precio: number) => string
  formatPrecioM2: (precio: number, area: number) => string
  formatFecha: (fecha: string | null) => string
  calcularDiasEnMercado: (prop: PropiedadVinculada) => number
}

export default function PropiedadesVinculadasTable({
  propiedades, propiedadesFiltradas, propiedadesVisibles, stats,
  filtroDorms, setFiltroDorms, ordenarPor, setOrdenarPor,
  ocultarViejas, setOcultarViejas, mostrarTodas, setMostrarTodas,
  formatPrecio, formatPrecioM2, formatFecha, calcularDiasEnMercado
}: PropiedadesVinculadasTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        Propiedades del Proyecto ({propiedades.length})
      </h2>

      {propiedades.length === 0 ? (
        <p className="text-sm text-slate-500">No hay propiedades vinculadas</p>
      ) : (
        <>
          {/* Dashboard de Estadísticas */}
          {stats && (
            <div className="mb-6 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg p-4">
              <div className="grid grid-cols-5 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                  <p className="text-xs text-slate-500">
                    Unidades
                    {stats.totalVenta > 0 && stats.totalAlquiler > 0 && (
                      <span className="block text-slate-400">{stats.totalVenta}V / {stats.totalAlquiler}A</span>
                    )}
                  </p>
                </div>
                {stats.totalVenta > 0 && (
                  <>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-slate-800">
                        ${Math.round(stats.precioMin / 1000)}k - ${Math.round(stats.precioMax / 1000)}k
                      </p>
                      <p className="text-xs text-slate-500">Rango venta</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-emerald-600">${stats.precioM2Prom.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">$/m² prom</p>
                    </div>
                  </>
                )}
                {stats.totalAlquiler > 0 && (
                  <div className="text-center">
                    <p className="text-lg font-semibold text-violet-600">
                      ${stats.alquilerMin === stats.alquilerMax
                        ? stats.alquilerProm.toLocaleString()
                        : `${stats.alquilerMin.toLocaleString()} - ${stats.alquilerMax.toLocaleString()}`
                      }
                    </p>
                    <p className="text-xs text-slate-500">$/mes alquiler</p>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-800">{stats.areaProm}m²</p>
                  <p className="text-xs text-slate-500">Área prom</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-amber-600">{stats.diasProm}</p>
                  <p className="text-xs text-slate-500">Días prom</p>
                </div>
              </div>

              {/* Distribución por dormitorios */}
              <div className="flex items-center gap-4 mb-3">
                <span className="text-xs text-slate-500 w-16">Tipología:</span>
                <div className="flex-1 flex items-center gap-3">
                  {Object.entries(stats.porDorms)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([dorms, count]) => {
                      const pct = Math.round((count / stats.total) * 100)
                      return (
                        <div key={dorms} className="flex items-center gap-1">
                          <span className="text-xs font-medium">{dorms}🛏️</span>
                          <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{pct}%</span>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Top Brokers */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-16">Brokers:</span>
                <div className="flex flex-wrap gap-2">
                  {stats.topBrokers.map(([broker, count]) => (
                    <span key={broker} className="text-xs bg-white px-2 py-1 rounded border border-slate-200">
                      {broker} <span className="font-semibold">({count})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Filtrar:</span>
              <div className="flex gap-1">
                {[null, 1, 2, 3].map(d => (
                  <button
                    key={d ?? 'all'}
                    type="button"
                    onClick={() => setFiltroDorms(d)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      filtroDorms === d
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {d === null ? 'Todos' : d === 3 ? '3+🛏️' : `${d}🛏️`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Ordenar:</span>
              <select
                value={ordenarPor}
                onChange={(e) => setOrdenarPor(e.target.value as 'precio' | 'precio_m2' | 'area' | 'dias')}
                className="text-sm border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="precio">Precio</option>
                <option value="precio_m2">$/m²</option>
                <option value="area">Área</option>
                <option value="dias">Días en mercado</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ocultarViejas}
                onChange={(e) => setOcultarViejas(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-600">Ocultar viejas</span>
            </label>

            {propiedadesFiltradas.length !== propiedades.length && (
              <span className="text-xs text-slate-500">
                Mostrando {propiedadesFiltradas.length} de {propiedades.length}
              </span>
            )}
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-3 font-medium">ID</th>
                  {stats && stats.totalVenta > 0 && stats.totalAlquiler > 0 && (
                    <th className="pb-2 pr-3 font-medium">Tipo</th>
                  )}
                  <th className="pb-2 pr-3 font-medium">Precio</th>
                  <th className="pb-2 pr-3 font-medium">$/m²</th>
                  <th className="pb-2 pr-3 font-medium">Dorms</th>
                  <th className="pb-2 pr-3 font-medium">Área</th>
                  <th className="pb-2 pr-3 font-medium">Publicado</th>
                  <th className="pb-2 pr-3 font-medium">Días</th>
                  <th className="pb-2 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {propiedadesVisibles.map(prop => {
                  const esAlquiler = prop.tipo_operacion === 'alquiler'
                  return (
                    <tr key={prop.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 text-slate-500 text-xs">#{prop.id}</td>
                      {stats && stats.totalVenta > 0 && stats.totalAlquiler > 0 && (
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            esAlquiler
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {esAlquiler ? 'Alq' : 'Vta'}
                          </span>
                        </td>
                      )}
                      <td className="py-2 pr-3 font-medium text-slate-900">
                        {esAlquiler
                          ? <span className="text-violet-700">${Number(prop.precio_mensual_usd || 0).toLocaleString()}/mes</span>
                          : formatPrecio(prop.precio_usd)
                        }
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {esAlquiler ? '-' : formatPrecioM2(prop.precio_usd, prop.area_total_m2)}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{prop.dormitorios}</td>
                      <td className="py-2 pr-3 text-slate-600">{prop.area_total_m2}m²</td>
                      <td className="py-2 pr-3 text-slate-500 text-xs">
                        {formatFecha(prop.fecha_publicacion || prop.fecha_discovery)}
                      </td>
                      <td className="py-2 pr-3 text-slate-500 text-xs">
                        {calcularDiasEnMercado(prop)}d
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/admin/propiedades/${prop.id}`}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Toggle ver más/menos */}
          {propiedadesFiltradas.length > 15 && (
            <div className="text-center pt-3 border-t border-slate-100 mt-2">
              <button
                type="button"
                onClick={() => setMostrarTodas(!mostrarTodas)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {mostrarTodas
                  ? '▲ Mostrar menos'
                  : `▼ Ver todas (${propiedadesFiltradas.length - 15} más)`
                }
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
