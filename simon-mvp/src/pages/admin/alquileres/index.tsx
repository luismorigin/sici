import { useState, useEffect, useCallback, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

// ===== TYPES =====

interface AlquilerProp {
  id: number
  nombre_edificio: string | null
  zona: string | null
  dormitorios: number | null
  banos: number | null
  area_total_m2: number | null
  precio_mensual_bob: number | null
  precio_mensual_usd: number | null
  amoblado: string | null
  acepta_mascotas: boolean | null
  deposito_meses: number | null
  contrato_minimo_meses: number | null
  monto_expensas_bob: number | null
  servicios_incluidos: string[] | null
  status: string
  es_activa: boolean
  fuente: string | null
  estacionamientos: number | null
  baulera: boolean | null
  datos_json: any
  datos_json_enrichment: any
  datos_json_discovery: any
  fecha_publicacion: string | null
  fecha_discovery: string | null
  campos_bloqueados: any
  url: string | null
}

type StatusFilter = 'activos' | 'expirados_150' | 'expirado_stale' | 'inactivo_pending' | 'inactivo_confirmed' | 'todos'
type EnviadoFilter = 'todos' | 'enviados' | 'no_enviados'

// ===== HELPERS =====

function displayZona(zona: string | null | undefined): string {
  if (!zona) return 'Otras'
  switch (zona) {
    case 'Equipetrol': case 'Equipetrol Centro': return 'Eq. Centro'
    case 'Equipetrol Norte': case 'Equipetrol Norte/Norte': case 'Equipetrol Norte/Sur': return 'Eq. Norte'
    case 'Faremafu': return 'Eq. Oeste'
    case 'Equipetrol Franja': return 'Eq. 3er Anillo'
    case 'Villa Brigida': return 'V. Brigida'
    case 'Sirari': return 'Sirari'
    case 'Sin zona': case 'sin zona': return 'Otras'
    default: return zona
  }
}

function dormLabel(d: number | null) {
  if (d === null || d === undefined) return '—'
  return d === 0 ? 'Estudio' : d + ' dorm'
}

function formatPrice(p: number | null) {
  if (!p) return '—'
  return 'Bs ' + p.toLocaleString('es-BO')
}

function diasEnMercado(fechaPub: string | null, fechaDisc: string | null): number | null {
  const fecha = fechaPub || fechaDisc
  if (!fecha) return null
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

function getPhoto(p: AlquilerProp): string | null {
  // C21: fotos from discovery thumbnails
  if (p.fuente === 'century21') {
    const fotos = p.datos_json_discovery?.fotos?.propiedadThumbnail
    if (Array.isArray(fotos) && fotos.length > 0) return fotos[0]
  }
  // Remax & BI: fotos from enrichment llm_output
  const enrichFotos = p.datos_json_enrichment?.llm_output?.fotos_urls
  if (Array.isArray(enrichFotos) && enrichFotos.length > 0) return enrichFotos[0]
  // Fallback: enrichment top-level fotos_urls
  const enrichTop = p.datos_json_enrichment?.fotos_urls
  if (Array.isArray(enrichTop) && enrichTop.length > 0) return enrichTop[0]
  // Fallback: datos_json
  const djFotos = p.datos_json?.fotos_urls
  if (Array.isArray(djFotos) && djFotos.length > 0) return djFotos[0]
  return null
}

function getAgenteName(p: AlquilerProp): string | null {
  if (p.fuente === 'century21') return p.datos_json_discovery?.asesorNombre || null
  if (p.fuente === 'remax') return p.datos_json_discovery?.agent?.user?.name_to_show || null
  if (p.fuente === 'bien_inmuebles') return p.datos_json_discovery?.amigo_clie || null
  return null
}

function getAgentePhone(p: AlquilerProp): string | null {
  if (p.fuente === 'century21') return p.datos_json_discovery?.whatsapp || null
  if (p.fuente === 'remax') return p.datos_json_discovery?.agent?.user?.phone || null
  if (p.fuente === 'bien_inmuebles') {
    return p.datos_json_enrichment?.agente_telefono || p.datos_json_discovery?.agente_telefono || null
  }
  return null
}

function fuenteLabel(f: string | null): string {
  if (f === 'century21') return 'C21'
  if (f === 'remax') return 'Remax'
  if (f === 'bien_inmuebles') return 'BI'
  return f || '—'
}

function buildWAMessage(p: AlquilerProp): string {
  const name = p.nombre_edificio || 'Departamento'
  const zone = displayZona(p.zona)
  const specs = `${dormLabel(p.dormitorios)} · ${p.area_total_m2 || '?'}m² · ${formatPrice(p.precio_mensual_bob)}/mes`
  const url = `https://simonbo.com/alquileres?id=${p.id}`
  return `Mira este depto en alquiler:\n\n${name} — ${zone}\n${specs}\n\n${url}`
}

function buildWAUrl(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '')
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

// LocalStorage sent tracking
const SENT_KEY = 'admin_alquileres_sent_v1'
const MIGRATION_KEY = 'admin_alquileres_migrated_v1'

// Pre-seeded IDs from broker-share.html (already sent before admin page existed)
const BROKER_SHARE_SENT_IDS = [88, 89, 880, 883, 12, 33, 108, 881, 600, 4, 523, 566, 443, 831, 599, 879, 146, 13, 573, 882, 28, 633, 884, 37, 40, 512, 847, 848]

function migrateBrokerShareData() {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(MIGRATION_KEY)) return // already migrated
  const map = getSentMap()
  // Import pre-seeded sent IDs with a past date
  for (const id of BROKER_SHARE_SENT_IDS) {
    if (!map[String(id)]) {
      map[String(id)] = '2026-02-24T00:00:00.000Z' // date before admin page existed
    }
  }
  // Also import any IDs from broker_share_sent_v1 (the old localStorage key)
  try {
    const oldSent = JSON.parse(localStorage.getItem('broker_share_sent_v1') || '[]')
    if (Array.isArray(oldSent)) {
      for (const id of oldSent) {
        if (!map[String(id)]) {
          map[String(id)] = '2026-02-24T00:00:00.000Z'
        }
      }
    }
  } catch { /* ignore */ }
  localStorage.setItem(SENT_KEY, JSON.stringify(map))
  localStorage.setItem(MIGRATION_KEY, 'true')
}

function getSentMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}')
  } catch { return {} }
}

function markSent(id: number) {
  const map = getSentMap()
  map[String(id)] = new Date().toISOString()
  localStorage.setItem(SENT_KEY, JSON.stringify(map))
}

function unmarkSent(id: number) {
  const map = getSentMap()
  delete map[String(id)]
  localStorage.setItem(SENT_KEY, JSON.stringify(map))
}

function getSentDate(id: number): string | null {
  const map = getSentMap()
  return map[String(id)] || null
}

// ===== ZONES FOR FILTER =====

const ZONAS_FILTER = [
  { id: '', label: 'Todas las zonas' },
  { id: 'Equipetrol', label: 'Eq. Centro' },
  { id: 'Equipetrol Norte', label: 'Eq. Norte' },
  { id: 'Sirari', label: 'Sirari' },
  { id: 'Villa Brigida', label: 'V. Brigida' },
  { id: 'Faremafu', label: 'Eq. Oeste' },
  { id: 'Equipetrol Franja', label: 'Eq. 3er Anillo' },
]

// ===== MAIN COMPONENT =====

export default function AdminAlquileres() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin', 'supervisor'])

  // Data
  const [propiedades, setPropiedades] = useState<AlquilerProp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [zonaFilter, setZonaFilter] = useState('')
  const [dormsFilter, setDormsFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('activos')
  const [fuenteFilter, setFuenteFilter] = useState('')
  const [enviadoFilter, setEnviadoFilter] = useState<EnviadoFilter>('todos')
  const [diasMax, setDiasMax] = useState<string>('')
  const [orden, setOrden] = useState<'recientes' | 'precio_asc' | 'precio_desc' | 'dias_desc'>('recientes')

  // Edit state
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  // Sent tracking (force re-render)
  const [sentVersion, setSentVersion] = useState(0)

  // ===== FETCH =====

  const fetchData = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('propiedades_v2')
        .select('id, nombre_edificio, zona, dormitorios, banos, area_total_m2, precio_mensual_bob, precio_mensual_usd, amoblado, acepta_mascotas, deposito_meses, contrato_minimo_meses, monto_expensas_bob, servicios_incluidos, status, es_activa, fuente, estacionamientos, baulera, datos_json, datos_json_enrichment, datos_json_discovery, fecha_publicacion, fecha_discovery, campos_bloqueados, url')
        .eq('tipo_operacion', 'alquiler')
        .order('fecha_discovery', { ascending: false })

      if (fetchErr) throw fetchErr
      setPropiedades(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading || !admin) return
    migrateBrokerShareData()
    setSentVersion(v => v + 1) // force re-render with migrated data
    fetchData()
  }, [authLoading, admin, fetchData])

  // ===== FILTERED LIST =====

  const filtered = useMemo(() => {
    let list = propiedades

    // Detect if searching by ID(s) — if so, skip status/zone/dorms filters
    let searchingById = false
    if (search.trim()) {
      const q = search.trim()
      const tokens = q.split(/[\s,]+/).map(s => s.replace(/^#/, '')).filter(s => /^\d+$/.test(s))
      if (tokens.length >= 1) {
        searchingById = true
        const idSet = new Set(tokens.map(Number))
        list = list.filter(p => idSet.has(p.id))
      } else {
        const lower = q.toLowerCase()
        list = list.filter(p =>
          (p.nombre_edificio || '').toLowerCase().includes(lower) ||
          (p.zona || '').toLowerCase().includes(lower) ||
          displayZona(p.zona).toLowerCase().includes(lower)
        )
      }
    }

    if (!searchingById) {
      // Status filter
      if (statusFilter === 'activos') {
        list = list.filter(p => !p.status.startsWith('inactivo') && p.status !== 'expirado_stale' && p.es_activa)
      } else if (statusFilter === 'expirados_150') {
        list = list.filter(p => {
          const dias = diasEnMercado(p.fecha_publicacion, p.fecha_discovery) || 0
          return dias > 150 && !p.status.startsWith('inactivo') && p.status !== 'expirado_stale' && p.es_activa
        })
      } else if (statusFilter === 'expirado_stale') {
        list = list.filter(p => p.status === 'expirado_stale')
      } else if (statusFilter === 'inactivo_pending') {
        list = list.filter(p => p.status === 'inactivo_pending')
      } else if (statusFilter === 'inactivo_confirmed') {
        list = list.filter(p => p.status === 'inactivo_confirmed')
      }

      // Zone filter
      if (zonaFilter) {
        list = list.filter(p => p.zona && p.zona.toLowerCase().includes(zonaFilter.toLowerCase()))
      }

      // Dorms filter
      if (dormsFilter !== '') {
        const d = parseInt(dormsFilter)
        list = list.filter(p => p.dormitorios === d)
      }
    }

    // Fuente filter
    if (fuenteFilter) {
      list = list.filter(p => p.fuente === fuenteFilter)
    }

    // Enviado filter
    if (enviadoFilter === 'enviados') {
      list = list.filter(p => getSentDate(p.id) !== null)
    } else if (enviadoFilter === 'no_enviados') {
      list = list.filter(p => getSentDate(p.id) === null)
    }

    // Dias max filter
    if (diasMax !== '') {
      const max = parseInt(diasMax)
      if (!isNaN(max)) {
        list = list.filter(p => {
          const dias = diasEnMercado(p.fecha_publicacion, p.fecha_discovery)
          return dias !== null && dias <= max
        })
      }
    }

    // Sort: activos first, then by selected order
    return list.sort((a, b) => {
      // Inactive/expirado always at the bottom
      const aInactive = a.status.startsWith('inactivo') || a.status === 'expirado_stale' || !a.es_activa ? 1 : 0
      const bInactive = b.status.startsWith('inactivo') || b.status === 'expirado_stale' || !b.es_activa ? 1 : 0
      if (aInactive !== bInactive) return aInactive - bInactive

      if (orden === 'precio_asc') return (a.precio_mensual_bob || 0) - (b.precio_mensual_bob || 0)
      if (orden === 'precio_desc') return (b.precio_mensual_bob || 0) - (a.precio_mensual_bob || 0)
      if (orden === 'dias_desc') {
        const aDias = diasEnMercado(a.fecha_publicacion, a.fecha_discovery) || 0
        const bDias = diasEnMercado(b.fecha_publicacion, b.fecha_discovery) || 0
        return bDias - aDias
      }
      // Default: recientes (fecha_discovery desc)
      return (b.fecha_discovery || '').localeCompare(a.fecha_discovery || '')
    })
  }, [propiedades, statusFilter, zonaFilter, dormsFilter, search, fuenteFilter, enviadoFilter, diasMax, orden, sentVersion])

  // ===== STATS =====

  const stats = useMemo(() => {
    const activos = propiedades.filter(p => !p.status.startsWith('inactivo') && p.status !== 'expirado_stale' && p.es_activa).length
    const expirados150 = propiedades.filter(p => {
      const dias = diasEnMercado(p.fecha_publicacion, p.fecha_discovery) || 0
      return dias > 150 && !p.status.startsWith('inactivo') && p.status !== 'expirado_stale' && p.es_activa
    }).length
    const expiradoStale = propiedades.filter(p => p.status === 'expirado_stale').length
    const inactivoPending = propiedades.filter(p => p.status === 'inactivo_pending').length
    const inactivoConfirmed = propiedades.filter(p => p.status === 'inactivo_confirmed').length
    return { activos, expirados150, expiradoStale, inactivoPending, inactivoConfirmed, total: propiedades.length }
  }, [propiedades])

  // ===== EDIT HANDLERS =====

  function startEdit(p: AlquilerProp) {
    setExpandedId(p.id)
    setEditValues({
      precio_mensual_bob: p.precio_mensual_bob || '',
      amoblado: p.amoblado || 'no',
      acepta_mascotas: p.acepta_mascotas ? 'si' : 'no',
      deposito_meses: p.deposito_meses ?? '',
      contrato_minimo_meses: p.contrato_minimo_meses ?? '',
      monto_expensas_bob: p.monto_expensas_bob ?? '',
      servicios_agua: (p.servicios_incluidos || []).includes('agua'),
      servicios_luz: (p.servicios_incluidos || []).includes('luz'),
      servicios_gas: (p.servicios_incluidos || []).includes('gas'),
      servicios_internet: (p.servicios_incluidos || []).includes('internet'),
    })
  }

  function closeEdit() {
    setExpandedId(null)
    setEditValues({})
  }

  async function saveEdit(p: AlquilerProp) {
    if (!supabase || saving) return
    setSaving(true)

    try {
      const servicios: string[] = []
      if (editValues.servicios_agua) servicios.push('agua')
      if (editValues.servicios_luz) servicios.push('luz')
      if (editValues.servicios_gas) servicios.push('gas')
      if (editValues.servicios_internet) servicios.push('internet')

      const precioBob = editValues.precio_mensual_bob ? parseFloat(editValues.precio_mensual_bob) : null

      // Get TC for USD conversion
      let precioUsd: number | null = null
      if (precioBob) {
        const { data: tcData } = await supabase
          .from('tc_binance_historial')
          .select('tasa')
          .order('fecha', { ascending: false })
          .limit(1)
          .single()
        if (tcData?.tasa) {
          precioUsd = Math.round(precioBob / tcData.tasa)
        }
      }

      const updates: Record<string, any> = {
        precio_mensual_bob: precioBob,
        precio_mensual_usd: precioUsd,
        amoblado: editValues.amoblado || null,
        acepta_mascotas: editValues.acepta_mascotas === 'si',
        deposito_meses: editValues.deposito_meses ? parseFloat(editValues.deposito_meses) : null,
        contrato_minimo_meses: editValues.contrato_minimo_meses ? parseInt(editValues.contrato_minimo_meses) : null,
        monto_expensas_bob: editValues.monto_expensas_bob ? parseFloat(editValues.monto_expensas_bob) : null,
        servicios_incluidos: servicios.length > 0 ? servicios : null,
      }

      // Build campos_bloqueados — lock edited fields
      const existingLocks = p.campos_bloqueados || {}
      const now = new Date().toISOString()
      const changedFields: string[] = []

      if (updates.precio_mensual_bob !== p.precio_mensual_bob) changedFields.push('precio_mensual_bob')
      if (updates.amoblado !== p.amoblado) changedFields.push('amoblado')
      if (updates.acepta_mascotas !== p.acepta_mascotas) changedFields.push('acepta_mascotas')
      if (updates.deposito_meses !== p.deposito_meses) changedFields.push('deposito_meses')
      if (updates.contrato_minimo_meses !== p.contrato_minimo_meses) changedFields.push('contrato_minimo_meses')
      if (updates.monto_expensas_bob !== p.monto_expensas_bob) changedFields.push('monto_expensas_bob')
      if (JSON.stringify(updates.servicios_incluidos) !== JSON.stringify(p.servicios_incluidos)) changedFields.push('servicios_incluidos')

      if (changedFields.length === 0) {
        closeEdit()
        setSaving(false)
        return
      }

      const newLocks = { ...existingLocks }
      for (const field of changedFields) {
        newLocks[field] = {
          bloqueado: true,
          por: 'broker_directo',
          usuario_nombre: 'Admin HITL',
          fecha: now,
        }
      }
      updates.campos_bloqueados = newLocks

      // Update property
      const { error: updateErr } = await supabase
        .from('propiedades_v2')
        .update(updates)
        .eq('id', p.id)

      if (updateErr) throw updateErr

      // Insert historial for each changed field
      for (const field of changedFields) {
        await supabase.from('propiedades_v2_historial').insert({
          propiedad_id: p.id,
          usuario_tipo: 'admin',
          usuario_id: 'admin-hitl',
          usuario_nombre: 'Admin HITL',
          campo: field,
          valor_anterior: (p as any)[field],
          valor_nuevo: updates[field],
          motivo: 'Edición inline alquileres HITL',
        })
      }

      closeEdit()
      await fetchData()
    } catch (err: any) {
      alert('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ===== STATUS CHANGE =====

  async function inactivar(p: AlquilerProp) {
    if (!supabase || !confirm(`Inactivar #${p.id} ${p.nombre_edificio || ''}?`)) return
    try {
      const { error } = await supabase
        .from('propiedades_v2')
        .update({ status: 'inactivo_confirmed', es_activa: false })
        .eq('id', p.id)
      if (error) throw error

      await supabase.from('propiedades_v2_historial').insert({
        propiedad_id: p.id,
        usuario_tipo: 'admin',
        usuario_id: 'admin-hitl',
        usuario_nombre: 'Admin HITL',
        campo: 'status',
        valor_anterior: p.status,
        valor_nuevo: 'inactivo_confirmed',
        motivo: 'Inactivado desde Alquileres HITL',
      })

      await fetchData()
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  async function reactivar(p: AlquilerProp) {
    if (!supabase || !confirm(`Reactivar #${p.id} ${p.nombre_edificio || ''}?`)) return
    try {
      const { error } = await supabase
        .from('propiedades_v2')
        .update({ status: 'completado', es_activa: true })
        .eq('id', p.id)
      if (error) throw error

      await supabase.from('propiedades_v2_historial').insert({
        propiedad_id: p.id,
        usuario_tipo: 'admin',
        usuario_id: 'admin-hitl',
        usuario_nombre: 'Admin HITL',
        campo: 'status',
        valor_anterior: p.status,
        valor_nuevo: 'completado',
        motivo: 'Reactivado desde Alquileres HITL',
      })

      await fetchData()
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  async function expirar(p: AlquilerProp) {
    if (!supabase || !confirm(`Marcar #${p.id} ${p.nombre_edificio || ''} como expirado stale?\n(No cuenta como absorción)`)) return
    try {
      const { error } = await supabase
        .from('propiedades_v2')
        .update({ status: 'expirado_stale', es_activa: false })
        .eq('id', p.id)
      if (error) throw error

      await supabase.from('propiedades_v2_historial').insert({
        propiedad_id: p.id,
        usuario_tipo: 'admin',
        usuario_id: 'admin-hitl',
        usuario_nombre: 'Admin HITL',
        campo: 'status',
        valor_anterior: p.status,
        valor_nuevo: 'expirado_stale',
        motivo: 'Expirado sin confirmación broker (>150d, no cuenta absorción)',
      })

      await fetchData()
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  // ===== WA SEND =====

  function handleWASend(p: AlquilerProp) {
    const phone = getAgentePhone(p)
    if (!phone) {
      alert('Sin telefono de agente para esta propiedad')
      return
    }
    const msg = buildWAMessage(p)
    window.open(buildWAUrl(phone, msg), '_blank')
    markSent(p.id)
    setSentVersion(v => v + 1)
  }

  function toggleSent(id: number) {
    if (getSentDate(id)) {
      unmarkSent(id)
    } else {
      markSent(id)
    }
    setSentVersion(v => v + 1)
  }

  // ===== RENDER =====

  if (authLoading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#666' }}>Verificando acceso...</div>
  if (!admin) return null

  const isInactive = (p: AlquilerProp) => p.status === 'inactivo_confirmed' || p.status === 'expirado_stale' || !p.es_activa
  const isExpired150 = (p: AlquilerProp) => {
    const dias = diasEnMercado(p.fecha_publicacion, p.fecha_discovery) || 0
    return dias > 150 && !isInactive(p)
  }

  return (
    <>
      <Head>
        <title>Alquileres HITL | Admin SICI</title>
      </Head>

      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: "'Manrope', system-ui, sans-serif" }}>
        {/* Header */}
        <header style={{ background: '#111', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link href="/admin/propiedades" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 14 }}>
                ← Propiedades
              </Link>
              <h1 style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Cormorant Garamond', serif", letterSpacing: 0.5 }}>
                Alquileres HITL
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
              <Link href="/admin/salud" style={{ color: '#2dd4bf', textDecoration: 'none' }}>Salud</Link>
              <Link href="/admin/market" style={{ color: '#a78bfa', textDecoration: 'none' }}>Market</Link>
              <Link href="/alquileres" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Ver publico</Link>
            </div>
          </div>
        </header>

        {/* Stats bar */}
        <div style={{ background: '#111', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 24px' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: 24, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            <span style={{ color: '#4ade80' }}>{stats.activos} activos</span>
            <span>|</span>
            {stats.expirados150 > 0 && (<><span style={{ color: '#ff6b35' }}>{stats.expirados150} &gt;150d</span><span>|</span></>)}
            {stats.expiradoStale > 0 && (<><span style={{ color: '#888' }}>{stats.expiradoStale} expirados</span><span>|</span></>)}
            <span style={{ color: '#fbbf24' }}>{stats.inactivoPending} pending</span>
            <span>|</span>
            <span style={{ color: '#f87171' }}>{stats.inactivoConfirmed} inactivos</span>
            <span>|</span>
            <span>{stats.total} total</span>
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)' }}>
              Mostrando {filtered.length}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ background: '#0f0f0f', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 24px' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Buscar por nombre, zona o #ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: '1 1 250px', minWidth: 200, padding: '8px 12px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none' }}
            />
            <select value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={selectStyle}>
              {ZONAS_FILTER.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
            <select value={dormsFilter} onChange={e => setDormsFilter(e.target.value)} style={selectStyle}>
              <option value="">Dorms: todos</option>
              <option value="0">Estudio</option>
              <option value="1">1 dorm</option>
              <option value="2">2 dorm</option>
              <option value="3">3 dorm</option>
            </select>
            <select value={fuenteFilter} onChange={e => setFuenteFilter(e.target.value)} style={selectStyle}>
              <option value="">Portal: todos</option>
              <option value="century21">C21</option>
              <option value="remax">Remax</option>
              <option value="bien_inmuebles">Bien Inmuebles</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={selectStyle}>
              <option value="activos">Activos</option>
              <option value="expirados_150">&gt;150d (verificar)</option>
              <option value="expirado_stale">Expirados stale</option>
              <option value="inactivo_pending">Inactivo pending</option>
              <option value="inactivo_confirmed">Inactivo confirmed</option>
              <option value="todos">Todos</option>
            </select>
            <select value={orden} onChange={e => setOrden(e.target.value as any)} style={selectStyle}>
              <option value="recientes">Recientes</option>
              <option value="precio_asc">Precio ↑</option>
              <option value="precio_desc">Precio ↓</option>
              <option value="dias_desc">Mas dias</option>
            </select>
            <select value={diasMax} onChange={e => setDiasMax(e.target.value)} style={selectStyle}>
              <option value="">Dias: todos</option>
              <option value="7">≤ 7 dias</option>
              <option value="15">≤ 15 dias</option>
              <option value="30">≤ 30 dias</option>
              <option value="60">≤ 60 dias</option>
              <option value="90">≤ 90 dias</option>
              <option value="120">≤ 120 dias</option>
            </select>
            <select value={enviadoFilter} onChange={e => setEnviadoFilter(e.target.value as EnviadoFilter)} style={selectStyle}>
              <option value="todos">Enviados: todos</option>
              <option value="enviados">Enviados</option>
              <option value="no_enviados">No enviados</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 80px' }}>
          {loading && <p style={{ textAlign: 'center', color: '#666', padding: 40 }}>Cargando alquileres...</p>}
          {error && <p style={{ textAlign: 'center', color: '#f87171', padding: 40 }}>Error: {error}</p>}

          {!loading && !error && filtered.length === 0 && (
            <p style={{ textAlign: 'center', color: '#666', padding: 40 }}>No se encontraron propiedades con esos filtros.</p>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {filtered.map(p => (
                <PropertyCard
                  key={p.id}
                  p={p}
                  inactive={isInactive(p)}
                  expired150={isExpired150(p)}
                  expanded={expandedId === p.id}
                  editValues={expandedId === p.id ? editValues : {}}
                  saving={saving}
                  sentDate={getSentDate(p.id)}
                  onToggleEdit={() => expandedId === p.id ? closeEdit() : startEdit(p)}
                  onEditChange={(field, value) => setEditValues(v => ({ ...v, [field]: value }))}
                  onSave={() => saveEdit(p)}
                  onInactivar={() => inactivar(p)}
                  onReactivar={() => reactivar(p)}
                  onExpirar={() => expirar(p)}
                  onWASend={() => handleWASend(p)}
                  onToggleSent={() => toggleSent(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&family=Manrope:wght@400;500;600&display=swap');
      `}</style>
    </>
  )
}

// ===== SHARED STYLES =====

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
}

// ===== CARD COMPONENT =====

function PropertyCard({ p, inactive, expired150, expanded, editValues, saving, sentDate, onToggleEdit, onEditChange, onSave, onInactivar, onReactivar, onExpirar, onWASend, onToggleSent }: {
  p: AlquilerProp
  inactive: boolean
  expired150: boolean
  expanded: boolean
  editValues: Record<string, any>
  saving: boolean
  sentDate: string | null
  onToggleEdit: () => void
  onEditChange: (field: string, value: any) => void
  onSave: () => void
  onInactivar: () => void
  onReactivar: () => void
  onExpirar: () => void
  onWASend: () => void
  onToggleSent: () => void
}) {
  const photo = getPhoto(p)
  const agente = getAgenteName(p)
  const phone = getAgentePhone(p)
  const dias = diasEnMercado(p.fecha_publicacion, p.fecha_discovery)
  const displayName = p.nombre_edificio || 'Departamento'

  // Badges
  const badges: Array<{ text: string; color: string }> = []
  if (p.amoblado === 'si') badges.push({ text: 'Amoblado', color: 'gold' })
  if (p.amoblado === 'semi') badges.push({ text: 'Semi', color: 'gold' })
  if (p.acepta_mascotas) badges.push({ text: 'Mascotas', color: 'purple' })
  if (p.monto_expensas_bob && p.monto_expensas_bob > 0) badges.push({ text: `Exp Bs${p.monto_expensas_bob}`, color: 'gold' })
  if (p.estacionamientos && p.estacionamientos > 0) badges.push({ text: `${p.estacionamientos} parqueo`, color: '' })
  if (p.baulera) badges.push({ text: 'Baulera', color: '' })

  const sentLabel = sentDate ? `Enviado ${new Date(sentDate).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' })}` : null

  return (
    <div style={{
      background: '#111',
      border: `1px solid ${inactive ? 'rgba(248,113,113,0.3)' : expired150 ? 'rgba(255,107,53,0.4)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      opacity: inactive ? 0.5 : 1,
      transition: 'all 0.2s',
    }}>
      {/* Photo */}
      <div style={{
        height: 180,
        background: photo ? `url('${photo}') center/cover` : '#1a1a1a',
        position: 'relative',
      }}>
        {/* ID badge */}
        <span style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(10,10,10,0.7)', padding: '2px 8px',
          borderRadius: 100, fontSize: 11, color: 'rgba(255,255,255,0.6)',
          fontFamily: "'Manrope', sans-serif",
        }}>
          #{p.id}
        </span>
        {/* Fuente badge */}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(10,10,10,0.7)', padding: '2px 8px',
          borderRadius: 100, fontSize: 10, fontWeight: 600,
          color: p.fuente === 'century21' ? '#fbbf24' : p.fuente === 'remax' ? '#60a5fa' : '#4ade80',
          fontFamily: "'Manrope', sans-serif",
        }}>
          {fuenteLabel(p.fuente)}
        </span>
        {/* Inactive overlay */}
        {inactive && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: p.status === 'expirado_stale' ? '#888' : '#f87171', fontSize: 14, fontWeight: 600,
          }}>
            {p.status === 'expirado_stale' ? 'EXPIRADO' : 'INACTIVO'}
          </div>
        )}
        {/* Expired >150d badge */}
        {expired150 && !inactive && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(255,107,53,0.9)', padding: '3px 10px',
            borderRadius: 100, fontSize: 10, fontWeight: 700,
            color: '#fff', fontFamily: "'Manrope', sans-serif",
            letterSpacing: 0.5,
          }}>
            &gt;150d — VERIFICAR
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: 2 }}>
          {displayName}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 8 }}>
          {displayZona(p.zona)}
        </div>

        {/* Price */}
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#c9a959', lineHeight: 1, marginBottom: 4 }}>
          {formatPrice(p.precio_mensual_bob)}<span style={{ fontSize: 14, color: 'rgba(201,169,89,0.6)' }}>/mes</span>
        </div>

        {/* Specs */}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8, fontFamily: "'Manrope', sans-serif" }}>
          {dormLabel(p.dormitorios)} · {p.banos ? `${p.banos} bano${p.banos > 1 ? 's' : ''}` : '—'} · {p.area_total_m2 || '?'}m²
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {badges.map((b, i) => (
              <span key={i} style={{
                fontSize: 10, fontWeight: 500, padding: '2px 7px',
                borderRadius: 100,
                border: `1px solid ${b.color === 'gold' ? 'rgba(201,169,89,0.25)' : b.color === 'purple' ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.15)'}`,
                color: b.color === 'gold' ? '#c9a959' : b.color === 'purple' ? '#a855f7' : 'rgba(255,255,255,0.75)',
                fontFamily: "'Manrope', sans-serif",
              }}>
                {b.text}
              </span>
            ))}
          </div>
        )}

        {/* Agent + days */}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, fontFamily: "'Manrope', sans-serif", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{fuenteLabel(p.fuente)}{agente ? ` · ${agente}` : ''}</span>
          {dias !== null && (
            <span style={{ color: dias > 120 ? '#f87171' : dias > 60 ? '#fbbf24' : 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
              {dias}d
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, flexWrap: 'wrap' }}>
          {/* WA button */}
          {phone && (
            <button onClick={onWASend} style={{
              padding: '6px 10px', background: '#25d366', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Manrope', sans-serif",
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ fontSize: 14 }}>📱</span> WA
            </button>
          )}

          {/* Inactivar / Reactivar / Expirar */}
          {inactive ? (
            <button onClick={onReactivar} style={{
              padding: '6px 10px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: 6, color: '#4ade80', fontSize: 11, cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
            }}>
              REACTIVAR
            </button>
          ) : (
            <>
              <button onClick={onInactivar} style={{
                padding: '6px 10px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 6, color: '#f87171', fontSize: 11, cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
              }}>
                INACTIVAR
              </button>
              {expired150 && (
                <button onClick={onExpirar} style={{
                  padding: '6px 10px', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)',
                  borderRadius: 6, color: '#ff6b35', fontSize: 11, cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
                }}>
                  EXPIRAR
                </button>
              )}
            </>
          )}

          {/* Edit toggle */}
          <button onClick={onToggleEdit} style={{
            padding: '6px 10px', background: expanded ? 'rgba(201,169,89,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${expanded ? 'rgba(201,169,89,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 6, color: expanded ? '#c9a959' : 'rgba(255,255,255,0.6)',
            fontSize: 11, cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
          }}>
            EDITAR {expanded ? '▲' : '▼'}
          </button>

          {/* Sent checkbox */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 4,
            marginLeft: 'auto', cursor: 'pointer', fontSize: 11,
            color: sentDate ? '#4ade80' : 'rgba(255,255,255,0.3)',
            fontFamily: "'Manrope', sans-serif",
          }}>
            <input type="checkbox" checked={!!sentDate} onChange={onToggleSent} style={{ accentColor: '#4ade80' }} />
            {sentLabel || 'Envio'}
          </label>
        </div>

        {/* Link to original + editor completo */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 11 }}>
          {p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
              Ver original ↗
            </a>
          )}
          <Link href={`/admin/propiedades/${p.id}`} style={{ color: 'rgba(201,169,89,0.5)', textDecoration: 'none', marginLeft: 'auto' }}>
            Editor completo →
          </Link>
        </div>

        {/* EXPANDED EDIT PANEL */}
        {expanded && (
          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px solid rgba(201,169,89,0.15)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Precio */}
              <div>
                <label style={labelStyle}>Precio Bs/mes</label>
                <input
                  type="number"
                  value={editValues.precio_mensual_bob || ''}
                  onChange={e => onEditChange('precio_mensual_bob', e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Amoblado */}
              <div>
                <label style={labelStyle}>Amoblado</label>
                <select
                  value={editValues.amoblado || 'no'}
                  onChange={e => onEditChange('amoblado', e.target.value)}
                  style={inputStyle}
                >
                  <option value="no">No</option>
                  <option value="si">Si</option>
                  <option value="semi">Semi</option>
                </select>
              </div>

              {/* Mascotas */}
              <div>
                <label style={labelStyle}>Mascotas</label>
                <select
                  value={editValues.acepta_mascotas || 'no'}
                  onChange={e => onEditChange('acepta_mascotas', e.target.value)}
                  style={inputStyle}
                >
                  <option value="no">No</option>
                  <option value="si">Si</option>
                </select>
              </div>

              {/* Deposito */}
              <div>
                <label style={labelStyle}>Deposito (meses)</label>
                <input
                  type="number"
                  value={editValues.deposito_meses ?? ''}
                  onChange={e => onEditChange('deposito_meses', e.target.value)}
                  style={inputStyle}
                  min={0}
                  step={1}
                />
              </div>

              {/* Contrato minimo */}
              <div>
                <label style={labelStyle}>Contrato min (meses)</label>
                <input
                  type="number"
                  value={editValues.contrato_minimo_meses ?? ''}
                  onChange={e => onEditChange('contrato_minimo_meses', e.target.value)}
                  style={inputStyle}
                  min={0}
                  step={1}
                />
              </div>

              {/* Expensas */}
              <div>
                <label style={labelStyle}>Expensas Bs</label>
                <input
                  type="number"
                  value={editValues.monto_expensas_bob ?? ''}
                  onChange={e => onEditChange('monto_expensas_bob', e.target.value)}
                  style={inputStyle}
                  min={0}
                />
              </div>
            </div>

            {/* Servicios checkboxes */}
            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>Servicios incluidos</label>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {['agua', 'luz', 'gas', 'internet'].map(s => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editValues[`servicios_${s}`] || false}
                      onChange={e => onEditChange(`servicios_${s}`, e.target.checked)}
                      style={{ accentColor: '#c9a959' }}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            {/* Save button */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={onToggleEdit} style={{
                padding: '8px 16px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer',
                fontFamily: "'Manrope', sans-serif",
              }}>
                Cancelar
              </button>
              <button onClick={onSave} disabled={saving} style={{
                padding: '8px 20px', background: saving ? '#555' : '#c9a959',
                border: 'none', borderRadius: 6,
                color: '#0a0a0a', fontSize: 12, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                fontFamily: "'Manrope', sans-serif",
              }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 500,
  color: 'rgba(255,255,255,0.4)', marginBottom: 3,
  textTransform: 'uppercase', letterSpacing: 0.5,
  fontFamily: "'Manrope', sans-serif",
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, color: '#fff', fontSize: 13,
  fontFamily: "'Manrope', sans-serif", outline: 'none',
}
