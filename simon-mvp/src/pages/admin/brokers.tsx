import { useEffect, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

interface BrokerPendiente {
  id: string
  nombre: string
  email: string
  telefono: string
  inmobiliaria: string | null
  empresa: string | null
  estado_verificacion: string
  fuente_registro: string
  tipo_cuenta: string
  total_propiedades: number
  fecha_registro: string
}

export default function AdminBrokers() {
  const [brokers, setBrokers] = useState<BrokerPendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'verificados'>('pendientes')
  const [orden, setOrden] = useState<'fecha' | 'propiedades'>('fecha')
  const [procesando, setProcesando] = useState<string | null>(null)

  useEffect(() => {
    fetchBrokers()
  }, [filtro, orden])

  const fetchBrokers = async () => {
    if (!supabase) return

    setLoading(true)
    try {
      let query = supabase
        .from('brokers')
        .select('id, nombre, email, telefono, inmobiliaria, empresa, estado_verificacion, fuente_registro, tipo_cuenta, total_propiedades, fecha_registro')

      if (filtro === 'pendientes') {
        query = query.in('estado_verificacion', ['pendiente', 'pre_registrado'])
      } else if (filtro === 'verificados') {
        query = query.eq('estado_verificacion', 'verificado')
      }

      // Aplicar orden
      if (orden === 'propiedades') {
        query = query.order('total_propiedades', { ascending: false })
      } else {
        query = query.order('fecha_registro', { ascending: false })
      }

      const { data, error } = await query.limit(100)

      if (error) {
        console.error('Error:', error)
        return
      }

      setBrokers(data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const verificarBroker = async (brokerId: string, accion: 'aprobar' | 'rechazar') => {
    if (!supabase) return

    setProcesando(brokerId)
    try {
      const nuevoEstado = accion === 'aprobar' ? 'verificado' : 'rechazado'

      const { error } = await supabase
        .from('brokers')
        .update({
          estado_verificacion: nuevoEstado,
          fecha_verificacion: new Date().toISOString(),
          verificado_por: 'admin_panel',
          notas_verificacion: accion === 'aprobar'
            ? 'Aprobado desde panel admin'
            : 'Rechazado desde panel admin'
        })
        .eq('id', brokerId)

      if (error) {
        alert('Error: ' + error.message)
        return
      }

      // Refrescar lista
      fetchBrokers()
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setProcesando(null)
    }
  }

  const getEstadoBadge = (estado: string) => {
    const badges: Record<string, { bg: string, text: string }> = {
      verificado: { bg: 'bg-green-100', text: 'text-green-700' },
      pendiente: { bg: 'bg-amber-100', text: 'text-amber-700' },
      pre_registrado: { bg: 'bg-blue-100', text: 'text-blue-700' },
      rechazado: { bg: 'bg-red-100', text: 'text-red-700' }
    }
    const badge = badges[estado] || badges.pendiente
    return (
      <span className={`${badge.bg} ${badge.text} text-xs px-2 py-1 rounded-full font-medium`}>
        {estado.replace('_', ' ')}
      </span>
    )
  }

  const getFuenteBadge = (fuente: string) => {
    if (fuente === 'scraping') {
      return <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">Scraping</span>
    }
    return <span className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-full">Manual</span>
  }

  return (
    <>
      <Head>
        <title>Admin - Brokers | Simón</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Panel Admin</h1>
              <p className="text-slate-400 text-sm">Gestión de Brokers</p>
            </div>
            <a href="/broker/login" className="text-amber-400 hover:text-amber-300 text-sm">
              Ir a Portal Broker →
            </a>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-8 px-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Total Brokers</p>
              <p className="text-2xl font-bold text-slate-900">{brokers.length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Pre-registrados</p>
              <p className="text-2xl font-bold text-blue-600">
                {brokers.filter(b => b.fuente_registro === 'scraping').length}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Pendientes</p>
              <p className="text-2xl font-bold text-amber-600">
                {brokers.filter(b => ['pendiente', 'pre_registrado'].includes(b.estado_verificacion)).length}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-sm">Verificados</p>
              <p className="text-2xl font-bold text-green-600">
                {brokers.filter(b => b.estado_verificacion === 'verificado').length}
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setFiltro('pendientes')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filtro === 'pendientes'
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Pendientes
              </button>
              <button
                onClick={() => setFiltro('verificados')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filtro === 'verificados'
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Verificados
              </button>
              <button
                onClick={() => setFiltro('todos')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filtro === 'todos'
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Todos
              </button>
            </div>

            {/* Ordenar por */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Ordenar:</span>
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as 'fecha' | 'propiedades')}
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                <option value="fecha">Más recientes</option>
                <option value="propiedades">Más propiedades</option>
              </select>
            </div>
          </div>

          {/* Lista de Brokers */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Broker</th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Contacto</th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Inmobiliaria</th>
                  <th className="text-center px-6 py-3 text-sm font-semibold text-slate-700">Props</th>
                  <th className="text-center px-6 py-3 text-sm font-semibold text-slate-700">Estado</th>
                  <th className="text-center px-6 py-3 text-sm font-semibold text-slate-700">Fuente</th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      Cargando...
                    </td>
                  </tr>
                ) : brokers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No hay brokers en esta categoría
                    </td>
                  </tr>
                ) : (
                  brokers.map((broker) => (
                    <tr key={broker.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{broker.nombre}</p>
                          <p className="text-xs text-slate-500">
                            {broker.tipo_cuenta === 'desarrolladora' ? '🏗️ Desarrolladora' : '👤 Broker'}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-900">{broker.telefono}</p>
                        <p className="text-xs text-slate-500">{broker.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-900">{broker.inmobiliaria || broker.empresa || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-semibold text-slate-900">{broker.total_propiedades || 0}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getEstadoBadge(broker.estado_verificacion)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getFuenteBadge(broker.fuente_registro)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {broker.estado_verificacion !== 'verificado' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => verificarBroker(broker.id, 'aprobar')}
                              disabled={procesando === broker.id}
                              className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg disabled:opacity-50"
                            >
                              {procesando === broker.id ? '...' : 'Aprobar'}
                            </button>
                            <button
                              onClick={() => verificarBroker(broker.id, 'rechazar')}
                              disabled={procesando === broker.id}
                              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                        {broker.estado_verificacion === 'verificado' && (
                          <span className="text-green-600 text-sm">✓ Verificado</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </>
  )
}
