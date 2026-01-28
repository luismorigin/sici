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
                    <div className="flex items-center gap-2">
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
      </BrokerLayout>
    </>
  )
}
