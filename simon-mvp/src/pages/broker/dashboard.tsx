import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase } from '@/lib/supabase'

interface PropiedadBroker {
  id: number
  codigo: string
  proyecto_nombre: string
  precio_usd: number
  area_m2: number
  dormitorios: number
  banos: number
  zona: string
  estado: 'borrador' | 'publicada' | 'pausada' | 'vendida'
  cantidad_fotos: number
  score_calidad: number
  created_at: string
  vistas: number
  foto_principal?: string
}

interface DashboardStats {
  total_propiedades: number
  propiedades_publicadas: number
  total_vistas: number
  total_leads: number
}

interface PDFModalState {
  isOpen: boolean
  isLoading: boolean
  pdfUrl: string | null
  shortLink: string | null
  error: string | null
  propiedadCodigo: string
}

export default function BrokerDashboard() {
  const { broker, isVerified, isImpersonating, exitImpersonation } = useBrokerAuth(true)
  const [propiedades, setPropiedades] = useState<PropiedadBroker[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    total_propiedades: 0,
    propiedades_publicadas: 0,
    total_vistas: 0,
    total_leads: 0
  })
  const [loading, setLoading] = useState(true)
  const [pdfModal, setPdfModal] = useState<PDFModalState>({
    isOpen: false,
    isLoading: false,
    pdfUrl: null,
    shortLink: null,
    error: null,
    propiedadCodigo: ''
  })

  useEffect(() => {
    if (broker) {
      fetchPropiedades()
    }
  }, [broker])

  const fetchPropiedades = async () => {
    if (!supabase || !broker) return

    try {
      // Obtener propiedades del broker
      const { data, error } = await supabase
        .from('propiedades_broker')
        .select(`
          id,
          codigo,
          proyecto_nombre,
          precio_usd,
          area_m2,
          dormitorios,
          banos,
          zona,
          estado,
          cantidad_fotos,
          score_calidad,
          created_at,
          vistas
        `)
        .eq('broker_id', broker.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching propiedades:', error)
        return
      }

      const props: PropiedadBroker[] = (data || []).map(d => ({
        ...d,
        foto_principal: undefined
      }))

      // Obtener fotos principales para cada propiedad
      const propIds = props.map(p => p.id)
      if (propIds.length > 0) {
        const { data: fotosData } = await supabase
          .from('propiedad_fotos')
          .select('propiedad_id, url')
          .in('propiedad_id', propIds)
          .eq('es_principal', true)

        // Mapear fotos a propiedades
        const fotosMap = new Map(fotosData?.map(f => [f.propiedad_id, f.url]) || [])
        props.forEach(p => {
          p.foto_principal = fotosMap.get(p.id) || undefined
        })
      }

      setPropiedades(props)

      // Calcular stats
      setStats({
        total_propiedades: props.length,
        propiedades_publicadas: props.filter(p => p.estado === 'publicada').length,
        total_vistas: props.reduce((sum, p) => sum + (p.vistas || 0), 0),
        total_leads: 0 // TODO: contar desde broker_leads
      })
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getEstadoBadge = (estado: string) => {
    const badges: Record<string, { bg: string, text: string, label: string }> = {
      publicada: { bg: 'bg-green-100', text: 'text-green-700', label: 'Publicada' },
      borrador: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Borrador' },
      pausada: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pausada' },
      vendida: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Vendida' }
    }
    const badge = badges[estado] || badges.borrador
    return (
      <span className={`${badge.bg} ${badge.text} text-xs px-2 py-1 rounded-full font-medium`}>
        {badge.label}
      </span>
    )
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price)
  }

  const handleDelete = async (propId: number, codigo: string) => {
    if (!confirm(`¿Estás seguro de eliminar la propiedad ${codigo}? Esta acción no se puede deshacer.`)) {
      return
    }

    if (!supabase || !broker) return

    try {
      // Primero borrar fotos asociadas
      await supabase
        .from('propiedad_fotos')
        .delete()
        .eq('propiedad_id', propId)

      // Luego borrar la propiedad
      const { error } = await supabase
        .from('propiedades_broker')
        .delete()
        .eq('id', propId)
        .eq('broker_id', broker.id)

      if (error) {
        alert('Error al eliminar: ' + error.message)
        return
      }

      // Actualizar lista
      setPropiedades(prev => prev.filter(p => p.id !== propId))
      setStats(prev => ({
        ...prev,
        total_propiedades: prev.total_propiedades - 1
      }))
    } catch (err) {
      console.error('Error eliminando:', err)
      alert('Error al eliminar la propiedad')
    }
  }

  const handleGeneratePDF = async (propId: number, codigo: string) => {
    if (!broker) return

    setPdfModal({
      isOpen: true,
      isLoading: true,
      pdfUrl: null,
      shortLink: null,
      error: null,
      propiedadCodigo: codigo
    })

    try {
      const response = await fetch('/api/broker/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-broker-id': broker.id // Para autenticación
        },
        body: JSON.stringify({ propiedad_id: propId })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error generando PDF')
      }

      setPdfModal(prev => ({
        ...prev,
        isLoading: false,
        pdfUrl: data.pdf_url,
        shortLink: data.short_link
      }))
    } catch (err) {
      console.error('Error generando PDF:', err)
      setPdfModal(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Error desconocido'
      }))
    }
  }

  const closePdfModal = () => {
    setPdfModal({
      isOpen: false,
      isLoading: false,
      pdfUrl: null,
      shortLink: null,
      error: null,
      propiedadCodigo: ''
    })
  }

  const shareViaWhatsApp = (pdfUrl: string, codigo: string) => {
    const message = `Mira esta propiedad: ${codigo}\n${pdfUrl}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Link copiado al portapapeles')
    } catch (err) {
      console.error('Error copiando:', err)
    }
  }

  return (
    <>
      <Head>
        <title>Dashboard | Simón Broker</title>
      </Head>

      <BrokerLayout title="Dashboard">
        {/* Admin Impersonation Banner */}
        {isImpersonating && broker && (
          <div className="mb-6 p-4 rounded-xl bg-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👁️</span>
                <div>
                  <h3 className="font-semibold">Modo Administrador</h3>
                  <p className="text-sm text-purple-200">
                    Viendo como: <strong>{broker.nombre}</strong>
                    {broker.inmobiliaria && ` • ${broker.inmobiliaria}`}
                    {' • '}{broker.estado_verificacion.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <button
                onClick={exitImpersonation}
                className="px-4 py-2 bg-white text-purple-600 font-semibold rounded-lg hover:bg-purple-50 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        )}

        {/* Verification Status Banner */}
        {broker && !isVerified && (
          <div className={`mb-6 p-4 rounded-xl ${
            broker.estado_verificacion === 'pendiente'
              ? 'bg-amber-50 border border-amber-200'
              : broker.estado_verificacion === 'pre_registrado'
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">
                {broker.estado_verificacion === 'pendiente' ? '⏳' :
                 broker.estado_verificacion === 'pre_registrado' ? '👤' : '❌'}
              </span>
              <div>
                <h3 className={`font-semibold ${
                  broker.estado_verificacion === 'pendiente' ? 'text-amber-800' :
                  broker.estado_verificacion === 'pre_registrado' ? 'text-blue-800' :
                  'text-red-800'
                }`}>
                  {broker.estado_verificacion === 'pendiente' && 'Verificación pendiente'}
                  {broker.estado_verificacion === 'pre_registrado' && 'Completa tu registro'}
                  {broker.estado_verificacion === 'rechazado' && 'Verificación rechazada'}
                </h3>
                <p className={`text-sm ${
                  broker.estado_verificacion === 'pendiente' ? 'text-amber-700' :
                  broker.estado_verificacion === 'pre_registrado' ? 'text-blue-700' :
                  'text-red-700'
                }`}>
                  {broker.estado_verificacion === 'pendiente' &&
                    'Tu cuenta está siendo revisada. Mientras tanto puedes ver tus propiedades pero no publicar nuevas.'}
                  {broker.estado_verificacion === 'pre_registrado' &&
                    `Encontramos ${broker.total_propiedades || 0} propiedades vinculadas a tu teléfono. Verifica tu email para activar tu cuenta.`}
                  {broker.estado_verificacion === 'rechazado' &&
                    'Tu cuenta no pudo ser verificada. Contacta a soporte@simon.bo para más información.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Verified Badge */}
        {broker && isVerified && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <h3 className="font-semibold text-green-800">Cuenta verificada</h3>
                <p className="text-sm text-green-700">
                  {broker.tipo_cuenta === 'desarrolladora' ? 'Desarrolladora' : 'Broker'} verificado
                  {broker.inmobiliaria && ` • ${broker.inmobiliaria}`}
                  {broker.empresa && ` • ${broker.empresa}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-sm">Propiedades</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total_propiedades}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-sm">Publicadas</p>
            <p className="text-2xl font-bold text-green-600">{stats.propiedades_publicadas}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-sm">Vistas Totales</p>
            <p className="text-2xl font-bold text-blue-600">{stats.total_vistas}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-sm">Leads</p>
            <p className="text-2xl font-bold text-amber-600">{stats.total_leads}</p>
          </div>
        </div>

        {/* Action Button */}
        <div className="mb-6">
          {(isVerified || isImpersonating) ? (
            <Link
              href="/broker/nueva-propiedad"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              <span>➕</span>
              Nueva Propiedad
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex items-center gap-2 bg-slate-300 text-slate-500 font-semibold px-6 py-3 rounded-lg cursor-not-allowed"
              title="Debes estar verificado para agregar propiedades"
            >
              <span>🔒</span>
              Nueva Propiedad
            </button>
          )}
        </div>

        {/* Properties List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Mis Propiedades</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
            </div>
          ) : propiedades.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-500 mb-4">No tienes propiedades todavía</p>
              <Link
                href="/broker/nueva-propiedad"
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                Agregar tu primera propiedad →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {propiedades.map((prop) => (
                <div key={prop.id} className="p-4 md:p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Foto Principal */}
                    <div className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
                      {prop.foto_principal ? (
                        <img
                          src={prop.foto_principal}
                          alt={prop.proyecto_nombre}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <span className="text-3xl">🏢</span>
                        </div>
                      )}
                    </div>

                    {/* Main Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-slate-400">{prop.codigo}</span>
                        {getEstadoBadge(prop.estado)}
                      </div>
                      <h3 className="font-semibold text-slate-900">{prop.proyecto_nombre}</h3>
                      <p className="text-sm text-slate-500">{prop.zona}</p>
                    </div>

                    {/* Details */}
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <p className="text-slate-500">Precio</p>
                        <p className="font-semibold text-slate-900">{formatPrice(prop.precio_usd)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Área</p>
                        <p className="font-semibold text-slate-900">{prop.area_m2}m²</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Dorms</p>
                        <p className="font-semibold text-slate-900">{prop.dormitorios}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Fotos</p>
                        <p className="font-semibold text-slate-900">{prop.cantidad_fotos}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {(isVerified || isImpersonating) ? (
                        <>
                          <Link
                            href={`/broker/editar/${prop.id}`}
                            className="px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            Editar
                          </Link>
                          <Link
                            href={`/broker/fotos/${prop.id}`}
                            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            Fotos
                          </Link>
                          <button
                            onClick={() => handleGeneratePDF(prop.id, prop.codigo)}
                            className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Generar PDF profesional"
                          >
                            📄 PDF
                          </button>
                          <button
                            onClick={() => handleDelete(prop.id, prop.codigo)}
                            className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Eliminar
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed" title="Verificación pendiente">
                            🔒 Editar
                          </span>
                          <span className="px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed" title="Verificación pendiente">
                            🔒 Fotos
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quality Score Bar */}
                  {prop.score_calidad && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              prop.score_calidad >= 90 ? 'bg-green-500' :
                              prop.score_calidad >= 70 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${prop.score_calidad}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{prop.score_calidad}% calidad</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PDF Modal */}
        {pdfModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  PDF Profesional
                </h3>
                <button
                  onClick={closePdfModal}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              {pdfModal.isLoading && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-slate-600">Generando PDF para {pdfModal.propiedadCodigo}...</p>
                  <p className="text-sm text-slate-400 mt-2">Esto puede tomar unos segundos</p>
                </div>
              )}

              {pdfModal.error && (
                <div className="text-center py-6">
                  <div className="text-4xl mb-4">❌</div>
                  <p className="text-red-600 font-medium mb-2">Error al generar PDF</p>
                  <p className="text-sm text-slate-500">{pdfModal.error}</p>
                  <button
                    onClick={closePdfModal}
                    className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                  >
                    Cerrar
                  </button>
                </div>
              )}

              {pdfModal.pdfUrl && (
                <div className="text-center py-4">
                  <div className="text-4xl mb-4">✅</div>
                  <p className="text-green-600 font-medium mb-4">PDF generado exitosamente</p>

                  <div className="bg-slate-50 rounded-lg p-4 mb-4">
                    <p className="text-xs text-slate-500 mb-1">Código</p>
                    <p className="font-mono text-sm text-slate-700">{pdfModal.propiedadCodigo}</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <a
                      href={pdfModal.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      📥 Descargar PDF
                    </a>

                    <button
                      onClick={() => shareViaWhatsApp(pdfModal.pdfUrl!, pdfModal.propiedadCodigo)}
                      className="flex items-center justify-center gap-2 bg-green-600 text-white font-semibold px-4 py-3 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      📱 Compartir por WhatsApp
                    </button>

                    <button
                      onClick={() => copyToClipboard(pdfModal.pdfUrl!)}
                      className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-semibold px-4 py-3 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      📋 Copiar Link
                    </button>
                  </div>

                  <button
                    onClick={closePdfModal}
                    className="mt-4 text-sm text-slate-500 hover:text-slate-700"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </BrokerLayout>
    </>
  )
}
