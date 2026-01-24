import { useEffect, useState } from 'react'
import Head from 'next/head'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase } from '@/lib/supabase'

interface Lead {
  id: number
  created_at: string
  propiedad_codigo: string
  propiedad_nombre: string
  lead_nombre: string
  lead_telefono: string
  lead_email: string
  mensaje: string
  estado: 'nuevo' | 'contactado' | 'interesado' | 'no_interesado'
}

export default function BrokerLeads() {
  const { broker } = useBrokerAuth(true)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('todos')

  useEffect(() => {
    if (broker) {
      fetchLeads()
    }
  }, [broker])

  const fetchLeads = async () => {
    if (!supabase || !broker) return

    try {
      const { data, error } = await supabase
        .from('broker_leads')
        .select(`
          id,
          created_at,
          mensaje,
          estado,
          propiedades_broker!inner (
            codigo,
            proyecto_nombre
          )
        `)
        .eq('propiedades_broker.broker_id', broker.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching leads:', error)
        // Si la tabla no existe, mostrar mensaje amigable
        setLeads([])
        return
      }

      const leadsFormateados = (data || []).map((l: any) => ({
        id: l.id,
        created_at: l.created_at,
        propiedad_codigo: l.propiedades_broker.codigo,
        propiedad_nombre: l.propiedades_broker.proyecto_nombre,
        lead_nombre: l.lead_nombre || 'Sin nombre',
        lead_telefono: l.lead_telefono || '',
        lead_email: l.lead_email || '',
        mensaje: l.mensaje || '',
        estado: l.estado || 'nuevo'
      }))

      setLeads(leadsFormateados)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateEstado = async (leadId: number, nuevoEstado: string) => {
    if (!supabase) return

    await supabase
      .from('broker_leads')
      .update({ estado: nuevoEstado })
      .eq('id', leadId)

    setLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, estado: nuevoEstado as Lead['estado'] } : l
    ))
  }

  const getEstadoBadge = (estado: string) => {
    const badges: Record<string, { bg: string, text: string, label: string }> = {
      nuevo: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Nuevo' },
      contactado: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Contactado' },
      interesado: { bg: 'bg-green-100', text: 'text-green-700', label: 'Interesado' },
      no_interesado: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'No interesado' }
    }
    const badge = badges[estado] || badges.nuevo
    return (
      <span className={`${badge.bg} ${badge.text} text-xs px-2 py-1 rounded-full font-medium`}>
        {badge.label}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-BO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const leadsFiltrados = leads.filter(l =>
    filtro === 'todos' ? true : l.estado === filtro
  )

  return (
    <>
      <Head>
        <title>Mis Leads | Simón Broker</title>
      </Head>

      <BrokerLayout title="Mis Leads">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <button
            onClick={() => setFiltro('todos')}
            className={`p-4 rounded-xl text-left transition-colors ${
              filtro === 'todos' ? 'bg-amber-500 text-white' : 'bg-white shadow-sm hover:bg-slate-50'
            }`}
          >
            <p className={filtro === 'todos' ? 'text-amber-100' : 'text-slate-500'}>Total</p>
            <p className="text-2xl font-bold">{leads.length}</p>
          </button>
          <button
            onClick={() => setFiltro('nuevo')}
            className={`p-4 rounded-xl text-left transition-colors ${
              filtro === 'nuevo' ? 'bg-blue-500 text-white' : 'bg-white shadow-sm hover:bg-slate-50'
            }`}
          >
            <p className={filtro === 'nuevo' ? 'text-blue-100' : 'text-slate-500'}>Nuevos</p>
            <p className="text-2xl font-bold">{leads.filter(l => l.estado === 'nuevo').length}</p>
          </button>
          <button
            onClick={() => setFiltro('contactado')}
            className={`p-4 rounded-xl text-left transition-colors ${
              filtro === 'contactado' ? 'bg-yellow-500 text-white' : 'bg-white shadow-sm hover:bg-slate-50'
            }`}
          >
            <p className={filtro === 'contactado' ? 'text-yellow-100' : 'text-slate-500'}>Contactados</p>
            <p className="text-2xl font-bold">{leads.filter(l => l.estado === 'contactado').length}</p>
          </button>
          <button
            onClick={() => setFiltro('interesado')}
            className={`p-4 rounded-xl text-left transition-colors ${
              filtro === 'interesado' ? 'bg-green-500 text-white' : 'bg-white shadow-sm hover:bg-slate-50'
            }`}
          >
            <p className={filtro === 'interesado' ? 'text-green-100' : 'text-slate-500'}>Interesados</p>
            <p className="text-2xl font-bold">{leads.filter(l => l.estado === 'interesado').length}</p>
          </button>
        </div>

        {/* Leads List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
            </div>
          ) : leadsFiltrados.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">👥</div>
              <p className="text-slate-500">
                {filtro === 'todos'
                  ? 'No tienes leads todavía'
                  : `No tienes leads en estado "${filtro}"`
                }
              </p>
              <p className="text-sm text-slate-400 mt-2">
                Los leads aparecerán cuando usuarios interesados contacten tus propiedades
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {leadsFiltrados.map((lead) => (
                <div key={lead.id} className="p-4 md:p-6 hover:bg-slate-50">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Lead Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getEstadoBadge(lead.estado)}
                        <span className="text-xs text-slate-400">{formatDate(lead.created_at)}</span>
                      </div>
                      <h3 className="font-semibold text-slate-900">{lead.lead_nombre}</h3>
                      <p className="text-sm text-slate-500">
                        Interesado en: <span className="font-medium">{lead.propiedad_nombre}</span>
                        <span className="text-slate-400 ml-1">({lead.propiedad_codigo})</span>
                      </p>
                      {lead.mensaje && (
                        <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-3 rounded-lg">
                          "{lead.mensaje}"
                        </p>
                      )}
                    </div>

                    {/* Contact & Actions */}
                    <div className="flex flex-col gap-2">
                      {lead.lead_telefono && (
                        <a
                          href={`https://wa.me/${lead.lead_telefono.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium"
                        >
                          <span>💬</span> WhatsApp
                        </a>
                      )}
                      {lead.lead_email && (
                        <a
                          href={`mailto:${lead.lead_email}`}
                          className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
                        >
                          <span>✉️</span> Email
                        </a>
                      )}

                      {/* Estado Dropdown */}
                      <select
                        value={lead.estado}
                        onChange={(e) => updateEstado(lead.id, e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="nuevo">Nuevo</option>
                        <option value="contactado">Contactado</option>
                        <option value="interesado">Interesado</option>
                        <option value="no_interesado">No interesado</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BrokerLayout>
    </>
  )
}
