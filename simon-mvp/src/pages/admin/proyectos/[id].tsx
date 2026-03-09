import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { useProjectEditor } from '@/hooks/useProjectEditor'
import PropiedadesVinculadasTable from '@/components/admin/PropiedadesVinculadasTable'
import { ZONAS_PROYECTO_EDITOR } from '@/lib/zonas'
import {
  ESTADO_CONSTRUCCION,
  AMENIDADES_OPCIONES_PROYECTO as AMENIDADES_OPCIONES,
  EQUIPAMIENTO_OPCIONES_PROYECTO as EQUIPAMIENTO_OPCIONES
} from '@/types/proyecto-editor'

const ZONAS = ZONAS_PROYECTO_EDITOR

export default function EditarProyecto() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin'])
  const router = useRouter()
  const { id } = router.query

  const {
    // State
    loading, saving, propagando, error, success, propagateSuccess,
    originalData, propiedades, formData,
    // Propagation
    propagarEstado, setPropagarEstado,
    propagarFecha, setPropagarFecha,
    propagarAmenidades, setPropagarAmenidades,
    propagarEquipamiento, setPropagarEquipamiento,
    showModalCandados, setShowModalCandados,
    propiedadesConCandados, setPropiedadesConCandados,
    showModalConfirmacion, setShowModalConfirmacion,
    totalPropiedadesAPropagar,
    // Inferencia
    infiriendo, datosInferidos, lightboxFoto, setLightboxFoto,
    amenidadesOpcionalesSeleccionadas, equipamientoOpcionalSeleccionado,
    // Filtros
    filtroDorms, setFiltroDorms,
    ordenarPor, setOrdenarPor,
    mostrarTodas, setMostrarTodas,
    ocultarViejas, setOcultarViejas,
    // Input state
    nuevoAmenidad, setNuevoAmenidad,
    nuevoEquipamientoBase, setNuevoEquipamientoBase,
    nuevaFotoUrl, setNuevaFotoUrl,
    // Desarrollador
    desarrolladoresList, busquedaDesarrollador, setBusquedaDesarrollador,
    desarrolladorSeleccionado, setDesarrolladorSeleccionado,
    showDesarrolladorDropdown, setShowDesarrolladorDropdown,
    // GPS
    zonaDetectada,
    // Computed
    stats, propiedadesFiltradas, propiedadesVisibles, mostrarFechaEntrega,
    // Actions
    updateField, toggleAmenidad, agregarAmenidadCustom, eliminarAmenidadCustom,
    toggleEquipamientoBase, agregarEquipamientoBaseCustom, eliminarEquipamientoBaseCustom,
    agregarFoto, eliminarFoto, adoptarFotoInferida,
    detectarZonaPorGPS, crearNuevoDesarrollador,
    handleSubmit, handlePropagar, ejecutarPropagacion, confirmarPropagacion,
    handleInferir, aplicarAmenidadesFrecuentes, aplicarAmenidadesOpcionales,
    aplicarEquipamientoFrecuente, toggleEquipamientoOpcional, aplicarEquipamientoOpcional,
    toggleAmenidadOpcional, aplicarEstadoInferido, aplicarPisosInferidos,
    getEstadoLabel,
    // Formatters
    formatPrecio, formatPrecioM2, formatFecha, calcularDiasEnMercado
  } = useProjectEditor(id, !!admin, authLoading)

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-slate-500">Cargando proyecto...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Editar {originalData?.nombre_oficial || 'Proyecto'} | Admin SICI</title>
      </Head>

      {/* Modal de candados en propagación */}
      {showModalCandados && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="bg-amber-500 px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🔒</span> Propiedades con Candados
              </h3>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-4">
                <strong>{propiedadesConCandados.length} propiedad(es)</strong> tienen candados en los campos que quieres propagar:
              </p>
              <div className="bg-slate-50 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                {propiedadesConCandados.slice(0, 5).map(p => (
                  <div key={p.id} className="text-sm text-slate-600 py-1 border-b border-slate-200 last:border-0">
                    <span className="font-mono">{p.codigo}</span>
                    <span className="text-slate-400 ml-2">({p.campos.join(', ')})</span>
                  </div>
                ))}
                {propiedadesConCandados.length > 5 && (
                  <div className="text-sm text-slate-500 pt-2">
                    ... y {propiedadesConCandados.length - 5} más
                  </div>
                )}
              </div>

              {/* Mensaje de precaución para equipamiento especial */}
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg mb-4">
                <p className="font-medium text-yellow-800 flex items-center gap-2">
                  <span>⚠️</span> Precaución - Unidades Especiales
                </p>
                <p className="text-yellow-700 text-xs mt-1">
                  Algunas unidades pueden tener <strong>condiciones especiales</strong> (equipamiento
                  diferente al estándar del edificio, ej: sin A/C, con jacuzzi propio, etc.).
                  Las propiedades con candado mantienen sus datos originales.
                </p>
                <p className="text-yellow-600 text-xs mt-2 italic">
                  Si una unidad es especial y no tiene candado, considera cancelar y agregarle
                  candado primero desde la página de la propiedad.
                </p>
              </div>

              <p className="text-sm text-slate-500 mb-4">
                ¿Qué deseas hacer con estas propiedades?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => ejecutarPropagacion('mantener')}
                  disabled={propagando}
                  className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-left transition-colors disabled:opacity-50"
                >
                  <span className="font-medium">🔒 Mantener candados</span>
                  <p className="text-sm text-slate-500">No propagar a estas propiedades (respeta candados)</p>
                </button>
                <button
                  onClick={() => ejecutarPropagacion('abrir_temporal')}
                  disabled={propagando}
                  className="w-full px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-left transition-colors disabled:opacity-50"
                >
                  <span className="font-medium">🔓 Abrir temporal</span>
                  <p className="text-sm text-amber-600">Propagar y volver a cerrar candados después</p>
                </button>
                <button
                  onClick={() => ejecutarPropagacion('abrir_permanente')}
                  disabled={propagando}
                  className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-800 rounded-lg text-left transition-colors disabled:opacity-50"
                >
                  <span className="font-medium">🔓 Abrir permanente</span>
                  <p className="text-sm text-red-600">Propagar y quitar candados definitivamente</p>
                </button>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-3 flex justify-end">
              <button
                onClick={() => {
                  setShowModalCandados(false)
                  setPropiedadesConCandados([])
                }}
                disabled={propagando}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación (cuando no hay candados) */}
      {showModalConfirmacion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-blue-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-2xl">📋</span> Confirmar Propagación
              </h3>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-4">
                Se propagará a <strong>{totalPropiedadesAPropagar} propiedad(es)</strong> activas
                de este proyecto.
              </p>

              {/* Mensaje de precaución */}
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
                <p className="font-medium text-yellow-800 flex items-center gap-2">
                  <span>⚠️</span> Precaución - Unidades Especiales
                </p>
                <p className="text-yellow-700 text-sm mt-2">
                  Algunas unidades pueden tener <strong>condiciones especiales</strong> diferentes
                  al estándar del edificio (ej: departamento sin A/C, con jacuzzi propio,
                  equipamiento premium, etc.).
                </p>
                <p className="text-yellow-600 text-sm mt-2">
                  Si una unidad es especial, considera <strong>agregarle candado primero</strong>
                  desde la página de la propiedad antes de propagar.
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModalConfirmacion(false)}
                  disabled={propagando}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarPropagacion}
                  disabled={propagando}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {propagando ? 'Propagando...' : `Propagar (${totalPropiedadesAPropagar})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <Link href="/admin/proyectos" className="text-slate-400 hover:text-white text-sm mb-1 inline-block">
                ← Volver a Proyectos
              </Link>
              <h1 className="text-xl font-bold">{originalData?.nombre_oficial || 'Editar Proyecto'}</h1>
              <p className="text-slate-400 text-sm">ID: {id}</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm">
                Propiedades
              </Link>
              <Link href="/admin/supervisor" className="text-amber-400 hover:text-amber-300 text-sm font-medium">
                Supervisor HITL
              </Link>
              <Link href="/admin/salud" className="text-teal-400 hover:text-teal-300 text-sm font-medium">
                Salud
              </Link>
              <Link href="/admin/market" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
                Market
              </Link>
              <Link href="/" className="text-slate-300 hover:text-white text-sm">
                Ir a Buscar
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto py-8 px-6">
          {/* Mensajes */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Cambios guardados correctamente
            </div>
          )}

          {propagateSuccess && (
            <div className="bg-blue-50 text-blue-600 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {propagateSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Columna principal */}
              <div className="lg:col-span-2 space-y-6">
                {/* Información Básica */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Información Básica</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Nombre Oficial
                      </label>
                      <input
                        type="text"
                        value={formData.nombre_oficial}
                        onChange={(e) => updateField('nombre_oficial', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                        required
                      />
                    </div>

                    {/* Desarrollador (Autocomplete) */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Desarrollador
                      </label>
                      {desarrolladorSeleccionado ? (
                        <div className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                          <span className="text-slate-900 flex-1">{desarrolladorSeleccionado.nombre}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setDesarrolladorSeleccionado(null)
                              setBusquedaDesarrollador('')
                              updateField('desarrollador', '')
                            }}
                            className="text-slate-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={busquedaDesarrollador}
                            onChange={(e) => {
                              setBusquedaDesarrollador(e.target.value)
                              setShowDesarrolladorDropdown(true)
                            }}
                            onFocus={() => setShowDesarrolladorDropdown(true)}
                            placeholder="Buscar o crear desarrollador..."
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          />
                          {showDesarrolladorDropdown && (
                            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {desarrolladoresList
                                .filter(d => !busquedaDesarrollador || d.nombre.toLowerCase().includes(busquedaDesarrollador.toLowerCase()))
                                .slice(0, 8)
                                .map(d => (
                                  <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => {
                                      setDesarrolladorSeleccionado({ id: d.id, nombre: d.nombre })
                                      setBusquedaDesarrollador(d.nombre)
                                      setShowDesarrolladorDropdown(false)
                                      updateField('desarrollador', d.nombre)
                                    }}
                                    className="w-full px-4 py-2 text-left hover:bg-amber-50 border-b border-slate-100 last:border-0"
                                  >
                                    <span className="font-medium text-slate-900">{d.nombre}</span>
                                    <span className="text-xs text-slate-500 ml-2">({d.proyectos_count} proyectos)</span>
                                  </button>
                                ))}
                              {busquedaDesarrollador && !desarrolladoresList.some(d => d.nombre.toLowerCase() === busquedaDesarrollador.toLowerCase()) && (
                                <button
                                  type="button"
                                  onClick={() => crearNuevoDesarrollador(busquedaDesarrollador)}
                                  className="w-full px-4 py-2 text-left hover:bg-green-50 text-green-700 font-medium"
                                >
                                  + Crear "{busquedaDesarrollador}"
                                </button>
                              )}
                              {!busquedaDesarrollador && (
                                <div className="px-4 py-2 text-xs text-slate-400">
                                  Escribe para buscar o crear nuevo
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Zona
                      </label>
                      <select
                        value={formData.zona}
                        onChange={(e) => updateField('zona', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      >
                        {ZONAS.map(z => (
                          <option key={z.id} value={z.id}>{z.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Estado del Proyecto */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Estado del Proyecto</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Estado de Construcción
                      </label>
                      <select
                        value={formData.estado_construccion}
                        onChange={(e) => updateField('estado_construccion', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      >
                        {ESTADO_CONSTRUCCION.map(e => (
                          <option key={e.id} value={e.id}>{e.label}</option>
                        ))}
                      </select>
                    </div>

                    {mostrarFechaEntrega && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Fecha de Entrega Estimada
                        </label>
                        <input
                          type="month"
                          value={formData.fecha_entrega}
                          onChange={(e) => updateField('fecha_entrega', e.target.value)}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Mes y año estimado de entrega del proyecto
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Características del Edificio */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Características del Edificio</h2>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Cantidad de Pisos
                      </label>
                      <input
                        type="number"
                        value={formData.cantidad_pisos}
                        onChange={(e) => updateField('cantidad_pisos', e.target.value)}
                        min="1"
                        max="100"
                        placeholder="Ej: 15"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Total de Unidades
                      </label>
                      <input
                        type="number"
                        value={formData.total_unidades}
                        onChange={(e) => updateField('total_unidades', e.target.value)}
                        min="1"
                        max="500"
                        placeholder="Ej: 120"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Latitud
                      </label>
                      <input
                        type="text"
                        value={formData.latitud}
                        onChange={(e) => {
                          updateField('latitud', e.target.value)
                          detectarZonaPorGPS(e.target.value, formData.longitud)
                        }}
                        placeholder="-17.7654321"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Longitud
                      </label>
                      <input
                        type="text"
                        value={formData.longitud}
                        onChange={(e) => {
                          updateField('longitud', e.target.value)
                          detectarZonaPorGPS(formData.latitud, e.target.value)
                        }}
                        placeholder="-63.1234567"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Zona detectada por GPS */}
                  {zonaDetectada && zonaDetectada === 'Fuera de cobertura' && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <span className="text-amber-700 text-sm">GPS fuera de cobertura — zona asignada como &quot;Sin zona&quot;</span>
                    </div>
                  )}
                  {zonaDetectada && zonaDetectada !== 'Fuera de cobertura' && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                      <span className="text-green-700 text-sm">Zona detectada por GPS: </span>
                      <strong className="text-green-800">{zonaDetectada}</strong>
                    </div>
                  )}

                  {formData.latitud && formData.longitud && (
                    <div className="mt-3">
                      <a
                        href={`https://www.google.com/maps?q=${formData.latitud},${formData.longitud}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Ver en Google Maps
                      </a>
                    </div>
                  )}
                </div>

                {/* Amenidades del Edificio */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Amenidades del Edificio</h2>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {AMENIDADES_OPCIONES.map(amenidad => (
                      <label
                        key={amenidad}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          formData.amenidades.includes(amenidad)
                            ? 'bg-green-50 border-green-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.amenidades.includes(amenidad)}
                          onChange={() => toggleAmenidad(amenidad)}
                          className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm text-slate-700">{amenidad}</span>
                      </label>
                    ))}
                  </div>

                  {/* Amenidades custom */}
                  {formData.amenidades_custom.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {formData.amenidades_custom.map(amenidad => (
                        <span
                          key={amenidad}
                          className="bg-purple-100 text-purple-700 text-sm px-3 py-1 rounded-full flex items-center gap-2"
                        >
                          {amenidad}
                          <button
                            type="button"
                            onClick={() => eliminarAmenidadCustom(amenidad)}
                            className="text-purple-500 hover:text-purple-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Agregar custom */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoAmenidad}
                      onChange={(e) => setNuevoAmenidad(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAmenidadCustom())}
                      placeholder="Agregar amenidad personalizada..."
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={agregarAmenidadCustom}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>

                {/* Equipamiento Base del Edificio */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">🔧 Equipamiento Base del Edificio</h2>
                  <p className="text-sm text-slate-500 mb-4">Equipamiento incluido de fábrica en todas las unidades</p>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {EQUIPAMIENTO_OPCIONES.map(equip => (
                      <label
                        key={equip}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          formData.equipamiento_base.includes(equip)
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.equipamiento_base.includes(equip)}
                          onChange={() => toggleEquipamientoBase(equip)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{equip}</span>
                      </label>
                    ))}
                  </div>

                  {/* Equipamiento custom */}
                  {formData.equipamiento_base_custom.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {formData.equipamiento_base_custom.map(equip => (
                        <span
                          key={equip}
                          className="bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full flex items-center gap-2"
                        >
                          {equip}
                          <button
                            type="button"
                            onClick={() => eliminarEquipamientoBaseCustom(equip)}
                            className="text-blue-500 hover:text-blue-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Agregar custom */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoEquipamientoBase}
                      onChange={(e) => setNuevoEquipamientoBase(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEquipamientoBaseCustom())}
                      placeholder="Agregar equipamiento personalizado..."
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={agregarEquipamientoBaseCustom}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>

                {/* Fotos del Proyecto */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Fotos del Proyecto</h2>

                  {/* Galería de fotos actuales */}
                  {formData.fotos_proyecto.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-4">
                      {formData.fotos_proyecto.map((foto, idx) => (
                        <div key={foto.url} className="relative group">
                          <button
                            type="button"
                            onClick={() => setLightboxFoto(foto.url)}
                            className="w-24 h-24 rounded-lg overflow-hidden bg-slate-200 hover:ring-2 hover:ring-amber-500 transition-all"
                          >
                            <img
                              src={foto.url}
                              alt={`Foto ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarFoto(foto.url)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                          <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1 rounded">
                            {foto.orden}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agregar foto por URL */}
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={nuevaFotoUrl}
                      onChange={(e) => setNuevaFotoUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarFoto())}
                      placeholder="URL de imagen (https://...)..."
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={agregarFoto}
                      disabled={!nuevaFotoUrl.trim()}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 rounded-lg transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mt-2">
                    También puedes adoptar fotos desde "Inferir desde Propiedades"
                  </p>
                </div>

                {/* Propiedades Vinculadas */}
                <PropiedadesVinculadasTable
                  propiedades={propiedades}
                  propiedadesFiltradas={propiedadesFiltradas}
                  propiedadesVisibles={propiedadesVisibles}
                  stats={stats}
                  filtroDorms={filtroDorms}
                  setFiltroDorms={setFiltroDorms}
                  ordenarPor={ordenarPor}
                  setOrdenarPor={setOrdenarPor}
                  ocultarViejas={ocultarViejas}
                  setOcultarViejas={setOcultarViejas}
                  mostrarTodas={mostrarTodas}
                  setMostrarTodas={setMostrarTodas}
                  formatPrecio={formatPrecio}
                  formatPrecioM2={formatPrecioM2}
                  formatFecha={formatFecha}
                  calcularDiasEnMercado={calcularDiasEnMercado}
                />
              </div>

              {/* Columna lateral */}
              <div className="space-y-6">
                {/* Botón Guardar */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Guardando...
                      </>
                    ) : (
                      'Guardar Cambios'
                    )}
                  </button>
                </div>

                {/* Inferir desde Propiedades */}
                {propiedades.length > 0 && (
                  <div className="bg-emerald-50 rounded-xl shadow-sm p-6 border border-emerald-200">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-emerald-900">
                        Inferir desde Propiedades
                      </h2>
                      <button
                        type="button"
                        onClick={handleInferir}
                        disabled={infiriendo}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        {infiriendo ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Analizando...
                          </>
                        ) : (
                          <>Analizar</>
                        )}
                      </button>
                    </div>

                    {datosInferidos?.success && (
                      <div className="space-y-4">
                        {/* Amenidades Frecuentes (>=50%) */}
                        {datosInferidos.amenidades_frecuentes?.length > 0 && (
                          <div className="bg-green-50 rounded-lg p-3">
                            <p className="text-sm font-medium text-green-800 mb-2">
                              ✅ Frecuentes (≥50%):
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {datosInferidos.amenidades_frecuentes.map(({ amenidad, porcentaje }) => (
                                <span
                                  key={amenidad}
                                  className="text-xs px-2 py-1 rounded bg-green-100 text-green-700"
                                >
                                  {amenidad} ({porcentaje}%)
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={aplicarAmenidadesFrecuentes}
                              className="text-xs text-green-700 hover:text-green-900 underline font-medium"
                            >
                              + Aplicar {datosInferidos.amenidades_frecuentes.length} amenidades
                            </button>
                          </div>
                        )}

                        {/* Amenidades Opcionales (<50%) */}
                        {datosInferidos.amenidades_opcionales?.length > 0 && (
                          <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-sm font-medium text-slate-700 mb-2">
                              ⚡ Opcionales (&lt;50%):
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {datosInferidos.amenidades_opcionales.map(({ amenidad, porcentaje }) => (
                                <label
                                  key={amenidad}
                                  className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                                    amenidadesOpcionalesSeleccionadas.includes(amenidad)
                                      ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-400'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={amenidadesOpcionalesSeleccionadas.includes(amenidad)}
                                    onChange={() => toggleAmenidadOpcional(amenidad)}
                                    className="sr-only"
                                  />
                                  {amenidad} ({porcentaje}%)
                                </label>
                              ))}
                            </div>
                            {amenidadesOpcionalesSeleccionadas.length > 0 && (
                              <button
                                type="button"
                                onClick={aplicarAmenidadesOpcionales}
                                className="text-xs text-amber-700 hover:text-amber-900 underline font-medium"
                              >
                                + Aplicar {amenidadesOpcionalesSeleccionadas.length} seleccionadas
                              </button>
                            )}
                          </div>
                        )}

                        {/* Equipamiento Inferido */}
                        {(datosInferidos.equipamiento_frecuente?.length > 0 || datosInferidos.equipamiento_opcional?.length > 0) && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-sm font-medium text-slate-700 mb-2">🔧 Equipamiento Detectado</p>

                            {/* Equipamiento frecuente (>=50%) */}
                            {datosInferidos.equipamiento_frecuente?.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs text-blue-600 mb-1">✅ Frecuente (≥50%):</p>
                                <div className="bg-blue-50 rounded p-2 mb-2">
                                  {datosInferidos.equipamiento_frecuente.map(e => (
                                    <div key={e.equipamiento} className="text-xs text-blue-700">
                                      {e.equipamiento} ({e.porcentaje}%)
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={aplicarEquipamientoFrecuente}
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  Aplicar {datosInferidos.equipamiento_frecuente.length} equipamientos
                                </button>
                              </div>
                            )}

                            {/* Equipamiento opcional (<50%) */}
                            {datosInferidos.equipamiento_opcional?.length > 0 && (
                              <div>
                                <p className="text-xs text-slate-500 mb-1">⚡ Opcional (&lt;50%):</p>
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {datosInferidos.equipamiento_opcional.map(e => (
                                    <label
                                      key={e.equipamiento}
                                      className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                                        equipamientoOpcionalSeleccionado.includes(e.equipamiento)
                                          ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-400'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={equipamientoOpcionalSeleccionado.includes(e.equipamiento)}
                                        onChange={() => toggleEquipamientoOpcional(e.equipamiento)}
                                        className="sr-only"
                                      />
                                      {e.equipamiento} ({e.porcentaje}%)
                                    </label>
                                  ))}
                                </div>
                                {equipamientoOpcionalSeleccionado.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={aplicarEquipamientoOpcional}
                                    className="text-xs text-blue-700 hover:text-blue-900 underline font-medium"
                                  >
                                    + Aplicar {equipamientoOpcionalSeleccionado.length} seleccionados
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Estado sugerido */}
                        {datosInferidos.estado_sugerido?.estado && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700">
                              Estado más común: <strong>{getEstadoLabel(datosInferidos.estado_sugerido.estado)}</strong> ({datosInferidos.estado_sugerido.porcentaje}%)
                            </span>
                            <button
                              type="button"
                              onClick={aplicarEstadoInferido}
                              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                            >
                              Aplicar
                            </button>
                          </div>
                        )}

                        {/* Pisos máximo */}
                        {datosInferidos.pisos_max && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700">
                              Piso máximo detectado: <strong>{datosInferidos.pisos_max}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={aplicarPisosInferidos}
                              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                            >
                              Aplicar como cant. pisos
                            </button>
                          </div>
                        )}

                        {/* Galería de fotos inferidas */}
                        {datosInferidos.fotos_proyecto.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-slate-700 mb-2">
                              Fotos de propiedades ({datosInferidos.fotos_proyecto.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {datosInferidos.fotos_proyecto.slice(0, 8).map((foto, idx) => {
                                const yaAdoptada = formData.fotos_proyecto.some(f => f.url === foto.url)
                                return (
                                  <div key={idx} className="relative group">
                                    <button
                                      type="button"
                                      onClick={() => setLightboxFoto(foto.url)}
                                      className={`w-16 h-16 rounded-lg overflow-hidden bg-slate-200 transition-all ${
                                        yaAdoptada ? 'ring-2 ring-green-500' : 'hover:ring-2 hover:ring-emerald-500'
                                      }`}
                                    >
                                      <img
                                        src={foto.url}
                                        alt={`Foto ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                    {!yaAdoptada && (
                                      <button
                                        type="button"
                                        onClick={() => adoptarFotoInferida(foto.url)}
                                        className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 text-white rounded-full text-xs hover:bg-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                        title="Adoptar foto"
                                      >
                                        +
                                      </button>
                                    )}
                                    {yaAdoptada && (
                                      <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center">
                                        ✓
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                              {datosInferidos.fotos_proyecto.length > 8 && (
                                <span className="text-xs text-slate-500 self-center">
                                  +{datosInferidos.fotos_proyecto.length - 8} más
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Click en + para adoptar foto al proyecto
                            </p>
                          </div>
                        )}

                        <p className="text-xs text-emerald-600 mt-2">
                          Datos inferidos de {datosInferidos.total_propiedades} propiedades
                        </p>
                      </div>
                    )}

                    {!datosInferidos && !infiriendo && (
                      <p className="text-sm text-slate-500">
                        Click en "Analizar" para extraer amenidades, estado y fotos desde las propiedades vinculadas.
                      </p>
                    )}
                  </div>
                )}

                {/* Propagación */}
                {propiedades.length > 0 && (
                  <div className="bg-blue-50 rounded-xl shadow-sm p-6 border border-blue-200">
                    <h2 className="text-lg font-semibold text-blue-900 mb-4">
                      Propagar a Propiedades
                    </h2>

                    <div className="space-y-3 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarEstado}
                          onChange={(e) => setPropagarEstado(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar estado de construcción</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarFecha}
                          onChange={(e) => setPropagarFecha(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar fecha de entrega</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarAmenidades}
                          onChange={(e) => setPropagarAmenidades(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar amenidades del edificio</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarEquipamiento}
                          onChange={(e) => setPropagarEquipamiento(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar equipamiento base</span>
                      </label>
                    </div>

                    <p className="text-xs text-blue-700 mb-4">
                      Solo afecta propiedades SIN candado en esos campos
                    </p>

                    <button
                      type="button"
                      onClick={handlePropagar}
                      disabled={propagando || (!propagarEstado && !propagarFecha && !propagarAmenidades && !propagarEquipamiento)}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {propagando ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Propagando...
                        </>
                      ) : (
                        'Propagar Seleccionados'
                      )}
                    </button>
                  </div>
                )}

                {/* Info adicional */}
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-700 mb-2">Notas:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Las amenidades del edificio aplican a todas las propiedades del proyecto</li>
                    <li>La fecha de entrega se muestra solo para preventa/construcción</li>
                    <li>La propagación respeta los campos bloqueados en cada propiedad</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>
        </main>

        {/* Lightbox para fotos */}
        {lightboxFoto && (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setLightboxFoto(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxFoto(null)}
              className="absolute top-4 right-4 text-white text-4xl hover:text-slate-300"
            >
              &times;
            </button>
            <img
              src={lightboxFoto}
              alt="Foto del proyecto"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </>
  )
}
