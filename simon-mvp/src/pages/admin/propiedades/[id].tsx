import { useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { usePropertyEditor } from '@/hooks/usePropertyEditor'
import {
  MICROZONAS, TIPO_OPERACION, ESTADO_CONSTRUCCION, DORMITORIOS_OPCIONES,
} from '@/config/propiedad-constants'
import PropertyGallery from '@/components/admin/PropertyGallery'
import LockPanel from '@/components/admin/LockPanel'
import LockIcon from '@/components/admin/LockIcon'
import AmenitiesEditor from '@/components/admin/AmenitiesEditor'
import PaymentPlanEditor from '@/components/admin/PaymentPlanEditor'

export default function EditarPropiedad() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin'])
  const router = useRouter()
  const { id } = router.query

  const e = usePropertyEditor(id as string | undefined, !authLoading && !!admin)

  // Refresh on navigation back to this page
  useEffect(() => {
    if (authLoading || !admin) return
    const handleRouteChange = (url: string) => {
      if (url.startsWith('/admin/propiedades/') && id) e.refetch()
    }
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => router.events.off('routeChangeComplete', handleRouteChange)
  }, [authLoading, router.events, id])

  // Close proyecto suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (!(ev.target as HTMLElement).closest('.proyecto-selector')) {
        e.setShowProyectoSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  // Shorthand to reduce prop-drilling verbosity
  const Lock = ({ campo }: { campo: string }) => (
    <LockIcon campo={campo} estaCampoBloqueado={e.estaCampoBloqueado} toggleBloqueo={e.toggleBloqueo} />
  )
  const getFuenteBadge = (fuente: string | null | undefined) => {
    if (fuente === 'century21') return <span className="bg-yellow-100 text-yellow-700 text-sm px-3 py-1 rounded-full">Century 21</span>
    if (fuente === 'remax') return <span className="bg-red-100 text-red-700 text-sm px-3 py-1 rounded-full">RE/MAX</span>
    return <span className="bg-slate-100 text-slate-700 text-sm px-3 py-1 rounded-full">{fuente || 'Desconocido'}</span>
  }

  if (e.loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  if (!e.originalData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{e.error || 'Propiedad no encontrada'}</p>
          <Link href="/admin/propiedades" className="text-amber-600 hover:text-amber-700">Volver a la lista</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Editar {e.formData.proyecto_nombre || `Propiedad #${id}`} | Admin SICI</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Admin / Propiedades</p>
              <h1 className="text-xl font-bold">{e.formData.proyecto_nombre || `Propiedad #${id}`}</h1>
              {e.proyectoMaster?.desarrollador && <p className="text-slate-400 text-sm">por {e.proyectoMaster.desarrollador}</p>}
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => e.setShowPreview(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">
                Ver como resultado
              </button>
              <Link href="/admin/proyectos" className="text-slate-300 hover:text-white text-sm">Proyectos</Link>
              <Link href="/admin/propiedades" className="text-amber-400 hover:text-amber-300 text-sm">Volver a lista</Link>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto py-8 px-6">
          {/* Orphan banner */}
          {!e.selectedProyectoId && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-6 rounded-r-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-orange-800">Propiedad sin proyecto asignado</p>
                  <p className="text-sm text-orange-700 mt-1">Esta propiedad no está vinculada a ningún proyecto. Usa el selector de &quot;Proyecto&quot; para vincularla.</p>
                </div>
              </div>
            </div>
          )}

          {/* Info Header with Gallery */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex items-start gap-6">
              <PropertyGallery
                fotos={e.fotos} fotoActual={e.fotoActual} setFotoActual={e.setFotoActual}
                lightboxIndex={e.lightboxIndex} setLightboxIndex={e.setLightboxIndex}
              />

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {getFuenteBadge(e.originalData.fuente)}
                  <span className="text-sm text-slate-500">ID: {e.originalData.id}</span>
                  <select
                    value={e.formData.tipo_operacion}
                    onChange={(ev) => e.updateField('tipo_operacion', ev.target.value)}
                    className={`text-sm px-2 py-1 rounded-full border font-medium ${
                      e.formData.tipo_operacion === 'venta' ? 'bg-green-50 text-green-700 border-green-300' :
                      e.formData.tipo_operacion === 'alquiler' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                      'bg-purple-50 text-purple-700 border-purple-300'
                    }`}
                  >
                    {TIPO_OPERACION.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  {e.originalData.score_calidad_dato && <span className="text-sm text-slate-500">Score: {e.originalData.score_calidad_dato}</span>}
                </div>

                <h2 className="text-xl font-bold text-slate-900">{e.nombreEdificio}</h2>
                {e.proyectoMaster?.desarrollador && <p className="text-slate-600">por <strong>{e.proyectoMaster.desarrollador}</strong></p>}

                {e.originalData.url && (
                  <a href={e.originalData.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm break-all block mt-2">
                    Ver publicación original →
                  </a>
                )}

                {/* Publication date */}
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  {e.originalData.fecha_publicacion && (
                    <span title="Fecha de publicación">📅 {new Date(e.originalData.fecha_publicacion).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  )}
                  {e.originalData.fecha_publicacion && (() => {
                    const dias = Math.floor((Date.now() - new Date(e.originalData.fecha_publicacion).getTime()) / (1000 * 60 * 60 * 24))
                    return <span className={`${dias > 180 ? 'text-red-500' : dias > 90 ? 'text-amber-500' : 'text-slate-500'}`}>⏱️ {dias} días en mercado</span>
                  })()}
                </div>

                {/* Price display */}
                <div className={`mt-3 p-3 rounded-lg ${e.formData.tipo_precio === 'usd_paralelo' ? 'bg-green-50' : e.formData.tipo_precio === 'bob' ? 'bg-amber-50' : 'bg-blue-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{e.formatPrecio(e.precioInfo.precio)}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-slate-500">{e.precioM2 > 0 && `${e.formData.tipo_operacion === 'alquiler' ? 'Bs' : '$'}${e.precioM2}/m²`}</p>
                        {e.getPrecioAlerta().tipo && <span className={`text-xs px-2 py-0.5 rounded ${e.getPrecioAlerta().color}`}>{e.getPrecioAlerta().tipo === 'error' ? '⚠️ Revisar' : '⚠️'}</span>}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      e.formData.tipo_precio === 'usd_paralelo' ? 'bg-green-100 text-green-700' :
                      e.formData.tipo_precio === 'bob' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {e.formData.tipo_precio === 'usd_paralelo' ? 'TC Paralelo' : e.formData.tipo_precio === 'bob' ? 'Bolivianos' : 'USD Oficial'}
                    </div>
                  </div>

                  {/* Normalization info */}
                  {e.formData.tipo_precio !== 'usd_oficial' && parseFloat(e.formData.precio_publicado) > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/50 text-xs">
                      <div className={e.formData.tipo_precio === 'usd_paralelo' ? 'text-green-700' : 'text-amber-700'}>
                        <span className="font-medium">{e.formData.tipo_precio === 'usd_paralelo' ? '✓ Normalizado desde USD paralelo' : '✓ Convertido desde Bolivianos'}</span>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <div className={`rounded p-2 ${e.formData.tipo_precio === 'usd_paralelo' ? 'bg-green-100' : 'bg-amber-100'}`}>
                            <p className="text-[10px] opacity-75">{e.formData.tipo_precio === 'usd_paralelo' ? 'Billete' : 'Precio publicado'}</p>
                            <p className="font-bold">{e.formData.tipo_precio === 'bob' ? 'Bs. ' : '$'}{Number(e.formData.precio_publicado).toLocaleString()}</p>
                          </div>
                          <div className={`rounded p-2 ${e.formData.tipo_precio === 'usd_paralelo' ? 'bg-green-100' : 'bg-amber-100'}`}>
                            <p className="text-[10px] opacity-75">Fórmula</p>
                            <p className="font-bold">{e.formData.tipo_precio === 'usd_paralelo' ? `× (${e.tcParaleloActual?.toFixed(2) || '10.5'} / 6.96)` : '÷ 6.96'}</p>
                          </div>
                          <div className={`rounded p-2 ${e.formData.tipo_precio === 'usd_paralelo' ? 'bg-green-200' : 'bg-amber-200'}`}>
                            <p className="text-[10px] opacity-75">{e.formData.tipo_precio === 'usd_paralelo' ? 'En consultas' : 'Normalizado'}</p>
                            <p className="font-bold">{e.formData.tipo_precio === 'usd_paralelo' ? e.formatPrecio(Math.round((parseFloat(e.formData.precio_publicado) || 0) * (e.tcParaleloActual || 10.5) / 6.96)) : e.formatPrecio(e.calcularPrecioNormalizado())}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {e.formData.tipo_precio === 'usd_oficial' && (
                    <div className="mt-2 pt-2 border-t border-slate-200/50 text-xs text-blue-600">
                      <span className="font-medium">Publicado en USD oficial</span> (sin conversión)
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action bar: Locks + Sync */}
          {(e.camposBloqueados.length > 0 || e.selectedProyectoId) && (
            <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-4">
              {e.camposBloqueados.length > 0 && (
                <button type="button" onClick={() => e.setShowCandadosPanel(!e.showCandadosPanel)}
                  className="flex items-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg transition-colors font-medium">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                  🔒 {e.camposBloqueados.length} campos bloqueados
                </button>
              )}

              {e.selectedProyectoId && (
                <button type="button" onClick={() => e.setShowSincronizar(!e.showSincronizar)}
                  className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg transition-colors font-medium">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  🔄 Sincronizar desde Proyecto
                </button>
              )}

              {e.showCandadosPanel && e.camposBloqueados.length > 0 && (
                <LockPanel
                  camposBloqueados={e.camposBloqueados} originalData={e.originalData!}
                  formatFecha={e.formatFecha} desbloquearCampo={e.desbloquearCampo} desbloquearTodos={e.desbloquearTodos}
                />
              )}

              {/* Sync panel */}
              {e.showSincronizar && e.selectedProyectoId && e.proyectoMaster && (
                <div className="w-full mt-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-800 mb-2">🔄 Sincronizar desde Proyecto Master</h4>
                  <p className="text-sm text-blue-600 mb-4">Comparación: <strong>Propiedad actual</strong> vs <strong>{e.proyectoMaster.nombre_oficial}</strong></p>
                  <div className="bg-white rounded-lg border border-blue-200 overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-100">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-blue-800">Sincronizar</th>
                          <th className="text-left px-3 py-2 font-medium text-blue-800">Actual</th>
                          <th className="text-left px-3 py-2 font-medium text-blue-800">→</th>
                          <th className="text-left px-3 py-2 font-medium text-blue-800">Proyecto</th>
                          <th className="text-center px-3 py-2 font-medium text-blue-800">Candado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100">
                        <tr className={e.sincEstado ? 'bg-blue-50' : ''}>
                          <td className="px-3 py-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={e.sincEstado} onChange={(ev) => e.setSincEstado(ev.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" /><span className="font-medium">Estado construcción</span></label></td>
                          <td className="px-3 py-2 text-slate-600">{ESTADO_CONSTRUCCION.find(x => x.id === e.formData.estado_construccion)?.label || e.formData.estado_construccion || '-'}</td>
                          <td className="px-3 py-2 text-blue-500">→</td>
                          <td className="px-3 py-2 font-medium text-blue-700">{e.proyectoMaster.estado_construccion ? (ESTADO_CONSTRUCCION.find(x => x.id === e.proyectoMaster!.estado_construccion)?.label || e.proyectoMaster.estado_construccion) : <span className="text-slate-400 italic">No definido</span>}</td>
                          <td className="px-3 py-2 text-center">{e.estaCampoBloqueado('estado_construccion') && <span title="Será desbloqueado">🔒</span>}</td>
                        </tr>
                        <tr className={e.sincFecha ? 'bg-blue-50' : ''}>
                          <td className="px-3 py-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={e.sincFecha} onChange={(ev) => e.setSincFecha(ev.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" /><span className="font-medium">Fecha entrega</span></label></td>
                          <td className="px-3 py-2 text-slate-600">{e.formData.fecha_entrega || '-'}</td>
                          <td className="px-3 py-2 text-blue-500">→</td>
                          <td className="px-3 py-2 font-medium text-blue-700">{e.proyectoMaster.fecha_entrega ? e.proyectoMaster.fecha_entrega.substring(0, 7) : <span className="text-slate-400 italic">No definido</span>}</td>
                          <td className="px-3 py-2 text-center">{e.estaCampoBloqueado('fecha_entrega') && <span title="Será desbloqueado">🔒</span>}</td>
                        </tr>
                        <tr className={e.sincAmenidades ? 'bg-blue-50' : ''}>
                          <td className="px-3 py-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={e.sincAmenidades} onChange={(ev) => e.setSincAmenidades(ev.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" /><span className="font-medium">Amenidades edificio</span></label></td>
                          <td className="px-3 py-2 text-slate-600">{e.formData.amenidades.length + e.formData.amenidades_custom.length} items</td>
                          <td className="px-3 py-2 text-blue-500">→</td>
                          <td className="px-3 py-2 font-medium text-blue-700">{e.proyectoMaster.amenidades_edificio?.length ? `${e.proyectoMaster.amenidades_edificio.length} items` : <span className="text-slate-400 italic">No definido</span>}</td>
                          <td className="px-3 py-2 text-center">{e.estaCampoBloqueado('amenities') && <span title="Será desbloqueado">🔒</span>}</td>
                        </tr>
                        <tr className={e.sincEquipamiento ? 'bg-blue-50' : ''}>
                          <td className="px-3 py-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={e.sincEquipamiento} onChange={(ev) => e.setSincEquipamiento(ev.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" /><span className="font-medium">Equipamiento base</span></label></td>
                          <td className="px-3 py-2 text-slate-600">{e.formData.equipamiento.length + e.formData.equipamiento_custom.length} items</td>
                          <td className="px-3 py-2 text-blue-500">→</td>
                          <td className="px-3 py-2 font-medium text-blue-700">{e.proyectoMaster.equipamiento_base?.length ? `${e.proyectoMaster.equipamiento_base.length} items` : <span className="text-slate-400 italic">No definido</span>}</td>
                          <td className="px-3 py-2 text-center">{e.estaCampoBloqueado('equipamiento') && <span title="Será desbloqueado">🔒</span>}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {e.sincAmenidades && e.proyectoMaster.amenidades_edificio && e.proyectoMaster.amenidades_edificio.length > 0 && (
                    <div className="bg-white rounded-lg p-3 mb-4 border border-blue-200">
                      <p className="text-xs text-blue-700 font-medium mb-2">Amenidades que se sincronizarán:</p>
                      <div className="flex flex-wrap gap-1">{e.proyectoMaster.amenidades_edificio.map(a => <span key={a} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{a}</span>)}</div>
                    </div>
                  )}
                  {e.sincEquipamiento && e.proyectoMaster.equipamiento_base && e.proyectoMaster.equipamiento_base.length > 0 && (
                    <div className="bg-white rounded-lg p-3 mb-4 border border-green-200">
                      <p className="text-xs text-green-700 font-medium mb-2">Equipamiento que se sincronizará:</p>
                      <div className="flex flex-wrap gap-1">{e.proyectoMaster.equipamiento_base.map(eq => <span key={eq} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">{eq}</span>)}</div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button type="button" onClick={e.sincronizarDesdeProyecto}
                      disabled={e.sincronizando || (!e.sincEstado && !e.sincFecha && !e.sincAmenidades && !e.sincEquipamiento)}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                      {e.sincronizando ? '⏳ Sincronizando...' : '✓ Sincronizar seleccionados'}
                    </button>
                    <button type="button" onClick={() => e.setShowSincronizar(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800">Cancelar</button>
                    {(e.estaCampoBloqueado('estado_construccion') || e.estaCampoBloqueado('fecha_entrega') || e.estaCampoBloqueado('amenities') || e.estaCampoBloqueado('equipamiento')) && (
                      <span className="text-xs text-amber-600">⚠️ Los campos bloqueados se desbloquearán automáticamente</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 space-y-8">
            {/* Información Básica */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Información Básica</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative proyecto-selector">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Proyecto *</label>
                    <div className="relative">
                      <input type="text" value={e.formData.proyecto_nombre}
                        onChange={(ev) => {
                          const v = ev.target.value; e.updateField('proyecto_nombre', v); e.setShowProyectoSuggestions(true)
                          const p = e.proyectosList.find(p => p.id === e.selectedProyectoId)
                          if (p && v !== p.nombre) { e.setSelectedProyectoId(null); e.setProyectoMaster(null) }
                        }}
                        onFocus={() => e.setShowProyectoSuggestions(true)}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.selectedProyectoId ? 'border-green-300 bg-green-50' : 'border-slate-300'}`}
                        placeholder="Buscar proyecto..."
                      />
                      {e.selectedProyectoId && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-sm">✓ Vinculado</span>}
                    </div>
                    {e.showProyectoSuggestions && e.formData.proyecto_nombre.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {e.proyectosList.filter(p => p.nombre.toLowerCase().includes(e.formData.proyecto_nombre.toLowerCase())).slice(0, 10).map(p => (
                          <button key={p.id} type="button"
                            onClick={() => { e.updateField('proyecto_nombre', p.nombre); e.setSelectedProyectoId(p.id); e.setProyectoMaster({ nombre_oficial: p.nombre, desarrollador: p.desarrollador, zona: null }); e.setShowProyectoSuggestions(false); e.autoDetectZonaFromProject(p) }}
                            className={`w-full px-4 py-2 text-left hover:bg-amber-50 border-b border-slate-100 last:border-0 ${p.id === e.selectedProyectoId ? 'bg-green-50' : ''}`}>
                            <span className="font-medium text-slate-900">{p.nombre}</span>
                            {p.desarrollador && <span className="block text-xs text-slate-500">{p.desarrollador}</span>}
                          </button>
                        ))}
                        {e.proyectosList.filter(p => p.nombre.toLowerCase().includes(e.formData.proyecto_nombre.toLowerCase())).length === 0 && (
                          <div className="px-4 py-3 text-sm text-slate-500">No se encontró &quot;{e.formData.proyecto_nombre}&quot;</div>
                        )}
                      </div>
                    )}
                    {e.selectedProyectoId && <button type="button" onClick={() => { e.setSelectedProyectoId(null); e.setProyectoMaster(null) }} className="text-xs text-red-500 hover:text-red-700 mt-1">Desvincular proyecto</button>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Desarrollador</label>
                    <input type="text" value={e.proyectoMaster?.desarrollador || 'Sin asignar'} disabled className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-500" />
                    <p className="text-xs text-slate-400 mt-1">{e.selectedProyectoId ? 'Viene del proyecto master' : 'Selecciona un proyecto para vincular'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Microzona *</label>
                    <select value={e.formData.microzona} onChange={(ev) => e.updateField('microzona', ev.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none">
                      {MICROZONAS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" id="showMicrozonaCustom" checked={e.showMicrozonaCustom} onChange={(ev) => e.setShowMicrozonaCustom(ev.target.checked)} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500" />
                      <label htmlFor="showMicrozonaCustom" className="text-xs text-slate-500">Especificar ubicación exacta</label>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center text-sm font-medium text-slate-700 mb-1">Estado<Lock campo="estado_construccion" /></label>
                    <select value={e.formData.estado_construccion} onChange={(ev) => e.updateField('estado_construccion', ev.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('estado_construccion') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}>
                      {ESTADO_CONSTRUCCION.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </div>
                </div>

                {e.showMicrozonaCustom && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ubicación exacta / Referencia</label>
                    <input type="text" value={e.originalData.microzona || ''} disabled className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-500" placeholder="Ej: Frente al Ventura Mall" />
                  </div>
                )}

                {e.esPreventa && (
                  <div>
                    <label className="flex items-center text-sm font-medium text-slate-700 mb-1">Fecha estimada de entrega<Lock campo="fecha_entrega" /></label>
                    <input type="month" value={e.formData.fecha_entrega} onChange={(ev) => e.updateField('fecha_entrega', ev.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('fecha_entrega') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`} />
                  </div>
                )}
              </div>
            </section>

            {/* Precio y Área */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Precio y Área</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de precio publicado</label>
                  <div className="flex gap-2">
                    {([['usd_oficial', 'blue', 'USD Oficial', 'Sin conversión'], ['usd_paralelo', 'green', 'USD Paralelo', `TC ${e.tcParaleloActual?.toFixed(2) || '~10.5'}`], ['bob', 'amber', 'Bolivianos', 'TC 6.96']] as const).map(([val, color, label, sub]) => (
                      <button key={val} type="button" onClick={() => e.updateField('tipo_precio', val)}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${e.formData.tipo_precio === val ? `border-${color}-500 bg-${color}-50 text-${color}-700` : 'border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                        <div className="text-center"><span className="block text-lg mb-1">{label}</span><span className="block text-xs opacity-75">{sub}</span></div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center text-sm font-medium text-slate-700 mb-1">Precio publicado * {e.formData.tipo_precio === 'bob' ? '(Bs.)' : '(USD)'}<Lock campo="precio_usd" /></label>
                    <input type="number" value={e.formData.precio_publicado} onChange={(ev) => e.updateField('precio_publicado', ev.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('precio_usd') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}
                      placeholder={e.formData.tipo_precio === 'bob' ? 'Ej: 750000' : 'Ej: 99536'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{e.formData.tipo_precio === 'usd_paralelo' ? 'Se guarda billete directo — normalización en SQL al consultar' : 'Precio normalizado (USD oficial)'}</label>
                    <div className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-bold text-lg">{e.formData.tipo_precio === 'usd_paralelo' ? e.formatPrecio(Math.round((parseFloat(e.formData.precio_publicado) || 0) * (e.tcParaleloActual || 10.5) / 6.96)) : e.formatPrecio(e.calcularPrecioNormalizado())}</div>
                  </div>
                </div>

                {e.formData.tipo_precio !== 'usd_oficial' && parseFloat(e.formData.precio_publicado) > 0 && (
                  <div className={`p-3 rounded-lg text-sm ${e.formData.tipo_precio === 'usd_paralelo' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    <div className="flex items-center gap-2 font-medium mb-2">{e.formData.tipo_precio === 'usd_paralelo' ? 'Precio en consultas de mercado (precio_normalizado SQL)' : 'Conversión Bs. → USD oficial'}</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white/50 rounded p-2"><p className="text-xs opacity-75">{e.formData.tipo_precio === 'usd_paralelo' ? 'Billete' : 'Publicado'}</p><p className="font-bold">{e.formData.tipo_precio === 'bob' ? 'Bs. ' : '$'}{Number(e.formData.precio_publicado).toLocaleString()}</p></div>
                      <div className="bg-white/50 rounded p-2"><p className="text-xs opacity-75">Fórmula</p><p className="font-bold text-xs">{e.formData.tipo_precio === 'usd_paralelo' ? `× (${e.tcParaleloActual?.toFixed(2) || '10.5'} / 6.96)` : '÷ 6.96'}</p></div>
                      <div className="bg-white/80 rounded p-2"><p className="text-xs opacity-75">{e.formData.tipo_precio === 'usd_paralelo' ? 'En consultas' : 'Normalizado'}</p><p className="font-bold">{e.formData.tipo_precio === 'usd_paralelo' ? e.formatPrecio(Math.round((parseFloat(e.formData.precio_publicado) || 0) * (e.tcParaleloActual || 10.5) / 6.96)) : e.formatPrecio(e.calcularPrecioNormalizado())}</p></div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center text-sm font-medium text-slate-700 mb-1">Área m² *<Lock campo="area_total_m2" /></label>
                    <input type="number" value={e.formData.area_m2} onChange={(ev) => e.updateField('area_m2', ev.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('area_total_m2') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Expensas (USD/mes)</label>
                    <input type="number" value={e.formData.expensas_usd} onChange={(ev) => e.updateField('expensas_usd', ev.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" placeholder="Ej: 150" />
                  </div>
                </div>

                {e.precioM2 > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-500">Precio/m²: <strong className="text-slate-900">${e.precioM2}</strong></p>
                    {e.getPrecioAlerta().tipo && <span className={`text-xs px-2 py-1 rounded border ${e.getPrecioAlerta().color}`}>{e.getPrecioAlerta().mensaje}</span>}
                  </div>
                )}
              </div>
            </section>

            {/* Características */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Características</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="flex items-center text-sm font-medium text-slate-700 mb-1">Dormitorios<Lock campo="dormitorios" /></label>
                  <select value={e.formData.dormitorios} onChange={(ev) => e.updateField('dormitorios', ev.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('dormitorios') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}>
                    {DORMITORIOS_OPCIONES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center text-sm font-medium text-slate-700 mb-1">Baños<Lock campo="banos" /></label>
                  <select value={e.formData.banos} onChange={(ev) => e.updateField('banos', ev.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('banos') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}>
                    {['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center text-sm font-medium text-slate-700 mb-1">Piso<Lock campo="piso" /></label>
                  <input type="number" value={e.formData.piso} onChange={(ev) => e.updateField('piso', ev.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('piso') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}
                    min="1" max="50" placeholder="Ej: 5" />
                </div>
              </div>

              {/* Parqueo y Baulera */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Parqueo */}
                <div className={`p-4 border rounded-lg ${e.estaCampoBloqueado('parqueo_incluido') || e.estaCampoBloqueado('estacionamientos') ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
                  <p className="flex items-center text-sm font-medium text-slate-700 mb-3">🚗 Parqueo<Lock campo="parqueo_incluido" /></p>
                  <div className="space-y-2">
                    {(['incluido', 'no_incluido', 'sin_confirmar'] as const).map(opt => (
                      <label key={opt} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${e.formData.parqueo_opcion === opt ? (opt === 'incluido' ? 'bg-green-100' : opt === 'no_incluido' ? 'bg-red-100' : 'bg-slate-100') : 'hover:bg-slate-50'}`}>
                        <input type="radio" name="parqueo_estado" checked={e.formData.parqueo_opcion === opt}
                          onChange={() => { e.updateField('parqueo_opcion', opt); e.updateField('parqueo_precio_adicional', '') }}
                          className={`${opt === 'incluido' ? 'text-green-500 focus:ring-green-500' : opt === 'no_incluido' ? 'text-red-500 focus:ring-red-500' : 'text-slate-400 focus:ring-slate-400'}`} />
                        <span className={opt === 'sin_confirmar' ? 'text-slate-500' : ''}>{opt === 'incluido' ? 'Incluido en el precio' : opt === 'no_incluido' ? 'No incluido' : 'Sin confirmar'}</span>
                      </label>
                    ))}
                    <div className={`flex items-center gap-2 p-2 rounded ${e.formData.parqueo_opcion === 'precio_adicional' ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                      <input type="radio" name="parqueo_estado" checked={e.formData.parqueo_opcion === 'precio_adicional'} onChange={() => e.updateField('parqueo_opcion', 'precio_adicional')} className="text-amber-500 focus:ring-amber-500" />
                      <span className="text-sm">Precio adicional:</span>
                      <input type="number" value={e.formData.parqueo_precio_adicional}
                        onChange={(ev) => { e.updateField('parqueo_opcion', 'precio_adicional'); e.updateField('parqueo_precio_adicional', ev.target.value) }}
                        className="w-24 px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-amber-500 outline-none" placeholder="USD" min="0" />
                    </div>
                  </div>
                </div>

                {/* Baulera */}
                <div className={`p-4 border rounded-lg ${e.estaCampoBloqueado('baulera') ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
                  <p className="flex items-center text-sm font-medium text-slate-700 mb-3">📦 Baulera<Lock campo="baulera" /></p>
                  <div className="space-y-2">
                    {(['incluido', 'no_incluido', 'sin_confirmar'] as const).map(opt => (
                      <label key={opt} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${e.formData.baulera_opcion === opt ? (opt === 'incluido' ? 'bg-green-100' : opt === 'no_incluido' ? 'bg-red-100' : 'bg-slate-100') : 'hover:bg-slate-50'}`}>
                        <input type="radio" name="baulera_estado" checked={e.formData.baulera_opcion === opt}
                          onChange={() => { e.updateField('baulera', opt === 'incluido'); e.updateField('baulera_opcion', opt); e.updateField('baulera_precio_adicional', '') }}
                          className={`${opt === 'incluido' ? 'text-green-500 focus:ring-green-500' : opt === 'no_incluido' ? 'text-red-500 focus:ring-red-500' : 'text-slate-400 focus:ring-slate-400'}`} />
                        <span className={opt === 'sin_confirmar' ? 'text-slate-500' : ''}>{opt === 'incluido' ? 'Incluida en el precio' : opt === 'no_incluido' ? 'No incluida' : 'Sin confirmar'}</span>
                      </label>
                    ))}
                    <div className={`flex items-center gap-2 p-2 rounded ${e.formData.baulera_opcion === 'precio_adicional' ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                      <input type="radio" name="baulera_estado" checked={e.formData.baulera_opcion === 'precio_adicional'}
                        onChange={() => { e.updateField('baulera', true); e.updateField('baulera_opcion', 'precio_adicional') }}
                        className="text-amber-500 focus:ring-amber-500" />
                      <span className="text-sm">Precio adicional:</span>
                      <input type="number" value={e.formData.baulera_precio_adicional}
                        onChange={(ev) => { e.updateField('baulera', true); e.updateField('baulera_opcion', 'precio_adicional'); e.updateField('baulera_precio_adicional', ev.target.value) }}
                        className="w-24 px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-amber-500 outline-none" placeholder="USD" min="0" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* GPS */}
            <section>
              <h2 className="flex items-center text-lg font-semibold text-slate-900 mb-4">Ubicación GPS<Lock campo="gps" /></h2>
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">Pegar GPS</label>
                <input type="text" placeholder="Pegar desde Google Maps: -17.768, -63.195"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                  onChange={(ev) => {
                    const parts = ev.target.value.split(',').map(s => s.trim())
                    if (parts.length === 2 && parts[0] && parts[1]) {
                      const lat = parts[0], lng = parts[1]
                      if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                        e.updateField('latitud', lat)
                        e.updateField('longitud', lng)
                        ev.target.value = ''
                      }
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Latitud</label>
                  <input type="text" value={e.formData.latitud} onChange={(ev) => e.updateField('latitud', ev.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('gps') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`} placeholder="-17.xxxxx" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Longitud</label>
                  <input type="text" value={e.formData.longitud} onChange={(ev) => e.updateField('longitud', ev.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${e.estaCampoBloqueado('gps') ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`} placeholder="-63.xxxxx" />
                </div>
              </div>
              {e.formData.latitud && e.formData.longitud && (
                <a href={`https://www.google.com/maps?q=${e.formData.latitud},${e.formData.longitud}`} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-blue-600 hover:text-blue-800 text-sm">Ver en Google Maps →</a>
              )}
            </section>

            {/* Broker */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Información del Broker</h2>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label><input type="text" value={e.formData.asesor_nombre} onChange={(ev) => e.updateField('asesor_nombre', ev.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label><input type="text" value={e.formData.asesor_telefono} onChange={(ev) => e.updateField('asesor_telefono', ev.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Inmobiliaria</label><input type="text" value={e.formData.asesor_inmobiliaria} onChange={(ev) => e.updateField('asesor_inmobiliaria', ev.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" /></div>
              </div>
            </section>

            {/* Payment Plan */}
            <PaymentPlanEditor
              formData={e.formData} updateField={e.updateField}
              estaCampoBloqueado={e.estaCampoBloqueado} toggleBloqueo={e.toggleBloqueo}
              agregarCuota={e.agregarCuota} eliminarCuota={e.eliminarCuota} actualizarCuota={e.actualizarCuota}
            />

            {/* Amenities + Equipment */}
            <AmenitiesEditor
              formData={e.formData} estaCampoBloqueado={e.estaCampoBloqueado} toggleBloqueo={e.toggleBloqueo}
              toggleAmenidad={e.toggleAmenidad} nuevoAmenidad={e.nuevoAmenidad} setNuevoAmenidad={e.setNuevoAmenidad}
              agregarAmenidadCustom={e.agregarAmenidadCustom} eliminarAmenidadCustom={e.eliminarAmenidadCustom}
              toggleEquipamiento={e.toggleEquipamiento} nuevoEquipamiento={e.nuevoEquipamiento} setNuevoEquipamiento={e.setNuevoEquipamiento}
              agregarEquipamientoCustom={e.agregarEquipamientoCustom} eliminarEquipamientoCustom={e.eliminarEquipamientoCustom}
            />

            {/* Descripción */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Descripción</h2>
              <textarea value={e.formData.descripcion} onChange={(ev) => e.updateField('descripcion', ev.target.value)}
                rows={6} className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none" />
            </section>

            {/* Validation errors */}
            {e.validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
                <p className="text-red-700 font-medium text-sm mb-2">⛔ Errores que impiden guardar:</p>
                <ul className="list-disc list-inside text-red-600 text-sm space-y-1">{e.validationErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
              </div>
            )}
            {e.validationWarnings.length > 0 && !e.showWarningConfirm && (
              <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg">
                <p className="text-amber-700 font-medium text-sm mb-2">⚠️ Advertencias:</p>
                <ul className="list-disc list-inside text-amber-600 text-sm space-y-1">{e.validationWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            {e.showWarningConfirm && (
              <div className="bg-amber-50 border-2 border-amber-300 px-4 py-4 rounded-lg">
                <p className="text-amber-800 font-medium text-sm mb-3">⚠️ Hay {e.validationWarnings.length} advertencia(s). ¿Guardar de todos modos?</p>
                <ul className="list-disc list-inside text-amber-700 text-sm space-y-1 mb-4">{e.validationWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                <div className="flex gap-3">
                  <button onClick={e.handleSaveConfirmed} className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium">Sí, guardar de todos modos</button>
                  <button onClick={() => e.setShowWarningConfirm(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-sm font-medium">Cancelar y revisar</button>
                </div>
              </div>
            )}

            {e.error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{e.error}</div>}
            {e.success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm">Cambios guardados correctamente. Los campos modificados ahora tienen candado.</div>}

            {/* Actions */}
            <div className="pt-4 flex justify-between items-center border-t border-slate-200">
              <Link href="/admin/propiedades" className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3">Cancelar</Link>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer" title="Si marcas esta opción, los campos que cambies se bloquearán automáticamente">
                  <input type="checkbox" checked={e.autoBloquearAlGuardar} onChange={(ev) => e.setAutoBloquearAlGuardar(ev.target.checked)} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500" />
                  <span className="text-sm text-slate-600">🔒 Bloquear campos editados</span>
                </label>
                <button type="button" onClick={() => e.setShowHistorial(!e.showHistorial)} className="px-4 py-2 border border-slate-300 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm">
                  {e.showHistorial ? 'Ocultar' : 'Ver'} Historial ({e.historial.length})
                </button>
                <button onClick={e.handleSave} disabled={e.saving} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {e.saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>

          {/* Historial */}
          {e.showHistorial && e.historial.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Historial de Cambios</h2>
              <div className="space-y-3">
                {e.historial.map((entry) => (
                  <div key={entry.id} className="border-l-4 border-purple-500 pl-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">Campo: <code className="bg-slate-100 px-2 py-0.5 rounded">{entry.campo}</code></span>
                      <span className="text-sm text-slate-500">{e.formatFecha(entry.fecha)}</span>
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="text-red-600">{JSON.stringify(entry.valor_anterior)}</span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="text-green-600">{JSON.stringify(entry.valor_nuevo)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Por: {entry.usuario_nombre} ({entry.usuario_tipo})</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Preview Modal */}
      {e.showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Vista previa como resultado</h3>
                <button onClick={() => e.setShowPreview(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="bg-white rounded-xl overflow-hidden shadow-lg">
                <div className="w-full h-56 bg-gray-200 relative">
                  {e.fotos.length > 0 ? (
                    <>
                      <img src={e.fotos[e.fotoActual]} alt={e.nombreEdificio} className="w-full h-full object-cover" />
                      <span className="absolute top-3 right-3 text-sm font-bold bg-blue-600 text-white px-3 py-1 rounded-full shadow">#1 Match</span>
                      {e.fotos.length > 1 && (
                        <>
                          <button onClick={() => e.setFotoActual(e.fotoActual === 0 ? e.fotos.length - 1 : e.fotoActual - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-lg">‹</button>
                          <button onClick={() => e.setFotoActual(e.fotoActual === e.fotos.length - 1 ? 0 : e.fotoActual + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-lg">›</button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">{e.fotoActual + 1} / {e.fotos.length}</div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">📷 Sin foto</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{e.nombreEdificio}</h3>
                      {e.proyectoMaster?.desarrollador && <p className="text-sm text-gray-500">{e.proyectoMaster.desarrollador}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">{e.formatPrecio(e.precioInfo.precio)}</p>
                      <p className="text-sm text-gray-500">${e.precioM2}/m²</p>
                    </div>
                  </div>
                  <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-3 text-sm text-gray-600">
                    <span className="font-semibold text-gray-700">Departamento</span>
                    <span>·</span><span>🛏️ {e.getDormitoriosLabel(e.formData.dormitorios)}</span>
                    {e.formData.banos && (<><span>·</span><span>🚿 {Math.floor(Number(e.formData.banos))}b</span></>)}
                    <span>·</span><span>📐 {e.formData.area_m2}m²</span>
                    <span>·</span>
                    {e.formData.estacionamientos && parseInt(e.formData.estacionamientos) > 0 ? <span>🚗 {e.formData.estacionamientos}p</span> : <span className="text-amber-600">🚗 ?</span>}
                    <span>·</span>
                    {e.formData.baulera ? <span>📦 ✓</span> : <span className="text-amber-600">📦 ?</span>}
                    {e.formData.estado_construccion && e.formData.estado_construccion !== 'no_especificado' && (
                      <><span>·</span><span className="text-blue-600 capitalize">{e.formData.estado_construccion.replace(/_/g, ' ')}</span></>
                    )}
                  </div>
                  {e.formData.amenidades.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {e.formData.amenidades.slice(0, 5).map(a => <span key={a} className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded">{a}</span>)}
                      {e.formData.amenidades.length > 5 && <span className="text-xs text-gray-500">+{e.formData.amenidades.length - 5} más</span>}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 text-center">Vista previa - Así se verá en los resultados de búsqueda de Simón</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
