// Admin: CRM B2C — contactos del bot de WhatsApp (simon-asistente).
//
// Lista de personas que le escribieron al bot, con sus contadores derivados
// (mensajes in/out, shortlists, última actividad). Click en una fila abre el
// detalle con la CONVERSACIÓN completa — para revisar cómo se comporta el bot.
//
// Los datos entran solos por /api/kapso/webhook (mig 292). Acá solo se leen y
// se edita lo único manual: `estado` y `notas`.

import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { buildWhatsAppURL } from '@/lib/whatsapp'

const ESTADOS = ['nuevo', 'activo', 'contacto', 'cerrado', 'descartado'] as const

interface ContactoResumen {
  id: string
  telefono: string
  nombre: string | null
  estado: string
  notas: string | null
  created_at: string
  total_mensajes: number
  mensajes_in: number
  mensajes_out: number
  primer_mensaje_at: string | null
  ultimo_mensaje_at: string | null
  ultimo_texto_in: string | null
  total_shortlists: number
  ultima_shortlist_at: string | null
  total_favoritos: number
  ultimo_favorito_at: string | null
  total_wa_clicks: number
  ultimo_wa_click_at: string | null
  dias_sin_actividad: number | null
}

interface MensajeCRM {
  id: string
  direccion: 'in' | 'out'
  texto: string | null
  tipo: string | null
  enviado_at: string
}

interface PropShortlist {
  propiedad_id: number
  tipo_operacion: string | null
  favorita: boolean
  is_destacada: boolean | null
  precio_norm_snapshot: number | null
  precio_mensual_bob_snapshot: number | null
  nombre_edificio: string | null
  zona: string | null
  dormitorios: number | null
  area_total_m2: number | null
}

interface ShortlistCRM {
  id: string
  hash: string
  cliente_nombre: string | null
  created_at: string
  view_count: number | null
  status: string | null
  aperturas: number
  primera_apertura_at: string | null
  ultima_apertura_at: string | null
  props: PropShortlist[]
  total_favoritas: number
}

interface Stats { total: number; con_shortlist: number; activos_7d: number; mensajes: number; favoritos: number; contactos_wa_7d: number }

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const fechaCorta = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) + ' ' +
         d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
}

export default function AdminContactos() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin'])

  const [contactos, setContactos] = useState<ContactoResumen[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Detalle (drawer)
  const [detalle, setDetalle] = useState<{
    contacto: ContactoResumen; mensajes: MensajeCRM[]; shortlists: ShortlistCRM[]
  } | null>(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [notasDraft, setNotasDraft] = useState('')
  const [guardando, setGuardando] = useState(false)

  const fetchContactos = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const headers = await getAuthHeaders()
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/contactos?${params}`, { headers })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { contactos: ContactoResumen[]; stats: Stats }
      setContactos(data.contactos); setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => {
    if (authLoading || !admin) return
    fetchContactos()
  }, [authLoading, admin, fetchContactos])

  const abrirDetalle = async (id: string) => {
    setDetalleLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/contactos/${id}`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setDetalle(d); setNotasDraft(d.contacto.notas || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir el detalle')
    } finally { setDetalleLoading(false) }
  }

  const guardar = async (patch: { estado?: string; notas?: string }) => {
    if (!detalle) return
    setGuardando(true)
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/admin/contactos/${detalle.contacto.id}`, {
        method: 'PATCH', headers, body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDetalle(d => d ? { ...d, contacto: { ...d.contacto, ...patch } } : d)
      fetchContactos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setGuardando(false) }
  }

  if (authLoading) return <div className="cc-wrap"><p className="cc-muted">Cargando…</p></div>
  if (!admin) return null

  return (
    <>
      <Head><title>Contactos del bot · Admin Simon</title></Head>
      <div className="cc-wrap">
        <header className="cc-head">
          <div>
            <h1>Contactos del bot</h1>
            <p className="cc-muted">
              Quien le escribe a Simón por WhatsApp queda acá automáticamente, con su conversación.
            </p>
          </div>
          <button className="cc-btn" onClick={fetchContactos} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </header>

        {stats && (
          <div className="cc-stats">
            <div className="cc-stat"><b>{stats.total}</b><span>contactos</span></div>
            <div className="cc-stat"><b>{stats.activos_7d}</b><span>activos (7d)</span></div>
            <div className="cc-stat"><b>{stats.con_shortlist}</b><span>con selección</span></div>
            <div className="cc-stat cc-stat-hero"><b>{stats.contactos_wa_7d}</b><span>contactos WA (7d)</span></div>
            <div className="cc-stat"><b>{stats.favoritos}</b><span>favoritos ♥</span></div>
            <div className="cc-stat"><b>{stats.mensajes}</b><span>mensajes</span></div>
          </div>
        )}

        <input
          className="cc-search"
          placeholder="Buscar por teléfono o nombre…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {error && <p className="cc-error">{error}</p>}

        {!loading && contactos.length === 0 && (
          <div className="cc-empty">
            <p><b>Todavía no hay contactos.</b></p>
            <p className="cc-muted">
              Aparecen solos cuando alguien le escribe al WhatsApp del bot. No hay que hacer nada.
            </p>
          </div>
        )}

        {contactos.length > 0 && (
          <div className="cc-tablewrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Contacto</th><th>Último mensaje</th><th>Msgs</th>
                  <th>Selec.</th><th>♥</th><th>Contactó</th>
                  <th>Actividad</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {contactos.map(c => (
                  <tr key={c.id} onClick={() => abrirDetalle(c.id)}>
                    <td>
                      <div className="cc-name">{c.nombre || 'Sin nombre'}</div>
                      <div className="cc-muted cc-sm">{c.telefono}</div>
                    </td>
                    <td className="cc-prev">{c.ultimo_texto_in || '—'}</td>
                    <td>{c.total_mensajes} <span className="cc-muted cc-sm">({c.mensajes_in}/{c.mensajes_out})</span></td>
                    <td>{c.total_shortlists || '—'}</td>
                    {/* Interés REVELADO: lo que hizo, no lo que dijo. */}
                    <td className={c.total_favoritos > 0 ? 'cc-fav' : ''}>
                      {c.total_favoritos > 0 ? `♥ ${c.total_favoritos}` : '—'}
                    </td>
                    <td className={c.total_wa_clicks > 0 ? 'cc-hot' : ''}>
                      {c.total_wa_clicks > 0 ? `${c.total_wa_clicks}×` : '—'}
                    </td>
                    <td className="cc-sm">
                      {fechaCorta(c.ultimo_mensaje_at)}
                      {c.dias_sin_actividad != null && c.dias_sin_actividad > 0 && (
                        <span className="cc-muted"> · {c.dias_sin_actividad}d</span>
                      )}
                    </td>
                    <td><span className={`cc-chip cc-chip-${c.estado}`}>{c.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(detalle || detalleLoading) && (
          <div className="cc-drawer-bg" onClick={() => setDetalle(null)}>
            <aside className="cc-drawer" onClick={e => e.stopPropagation()}>
              {detalleLoading && <p className="cc-muted">Cargando…</p>}
              {detalle && (
                <>
                  <header className="cc-dhead">
                    <div>
                      <h2>{detalle.contacto.nombre || 'Sin nombre'}</h2>
                      <p className="cc-muted cc-sm">{detalle.contacto.telefono}</p>
                    </div>
                    <button className="cc-x" onClick={() => setDetalle(null)} aria-label="Cerrar">×</button>
                  </header>

                  <div className="cc-drow">
                    <a className="cc-btn cc-btn-wa"
                       href={buildWhatsAppURL(detalle.contacto.telefono, '')}
                       target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
                    <select
                      className="cc-select"
                      value={detalle.contacto.estado}
                      disabled={guardando}
                      onChange={e => guardar({ estado: e.target.value })}
                    >
                      {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>

                  {detalle.shortlists.length > 0 && (
                    <section className="cc-dsec">
                      <h3>Selecciones ({detalle.shortlists.length})</h3>
                      {detalle.shortlists.map(s => (
                        <div key={s.id} className="cc-slcard">
                          <div className="cc-slhead">
                            <a href={`/b/${s.hash}`} target="_blank" rel="noopener noreferrer">/b/{s.hash}</a>
                            <span className="cc-muted cc-sm">{fechaCorta(s.created_at)}</span>
                          </div>
                          <div className="cc-slmeta">
                            <span className={s.aperturas > 0 ? 'cc-hot' : 'cc-muted'}>
                              {s.aperturas > 0 ? `Abrió ${s.aperturas}×` : 'Sin abrir'}
                            </span>
                            {s.ultima_apertura_at && (
                              <span className="cc-muted"> · última {fechaCorta(s.ultima_apertura_at)}</span>
                            )}
                            {s.total_favoritas > 0 && (
                              <span className="cc-fav"> · ♥ {s.total_favoritas} favorita{s.total_favoritas > 1 ? 's' : ''}</span>
                            )}
                          </div>
                          {s.props.length > 0 && (
                            <ul className="cc-props">
                              {s.props.map(p => (
                                <li key={p.propiedad_id} className={p.favorita ? 'cc-prop cc-prop-fav' : 'cc-prop'}>
                                  <span className="cc-prop-h">{p.favorita ? '♥' : '·'}</span>
                                  <span className="cc-prop-n">
                                    {p.nombre_edificio || `Propiedad ${p.propiedad_id}`}
                                    {p.zona && <span className="cc-muted"> · {p.zona}</span>}
                                  </span>
                                  <span className="cc-muted cc-sm cc-prop-d">
                                    {p.dormitorios != null && `${p.dormitorios === 0 ? 'Mono' : `${p.dormitorios}d`}`}
                                    {p.area_total_m2 != null && ` · ${Math.round(p.area_total_m2)}m²`}
                                    {p.precio_norm_snapshot != null && ` · $${Math.round(p.precio_norm_snapshot).toLocaleString('en-US')}`}
                                    {p.precio_mensual_bob_snapshot != null && ` · Bs ${Math.round(p.precio_mensual_bob_snapshot).toLocaleString('es-BO')}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </section>
                  )}

                  <section className="cc-dsec">
                    <h3>Conversación ({detalle.mensajes.length})</h3>
                    <div className="cc-chat">
                      {detalle.mensajes.map(m => (
                        <div key={m.id} className={`cc-msg cc-msg-${m.direccion}`}>
                          <div className="cc-msg-txt">{m.texto || <i className="cc-muted">({m.tipo})</i>}</div>
                          <div className="cc-msg-t">{fechaCorta(m.enviado_at)}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="cc-dsec">
                    <h3>Notas</h3>
                    <textarea
                      className="cc-notas" rows={3} value={notasDraft}
                      placeholder="Notas internas sobre este contacto…"
                      onChange={e => setNotasDraft(e.target.value)}
                    />
                    <button className="cc-btn" disabled={guardando}
                            onClick={() => guardar({ notas: notasDraft })}>
                      {guardando ? 'Guardando…' : 'Guardar notas'}
                    </button>
                  </section>
                </>
              )}
            </aside>
          </div>
        )}
      </div>

      <style jsx>{`
        .cc-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 80px; font-family: 'DM Sans', sans-serif; color: #141414; }
        .cc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
        h1 { font-family: 'Figtree', sans-serif; font-size: 26px; font-weight: 500; margin: 0 0 4px; }
        h2 { font-family: 'Figtree', sans-serif; font-size: 20px; font-weight: 500; margin: 0; }
        h3 { font-family: 'Figtree', sans-serif; font-size: 14px; font-weight: 500; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .5px; color: #7A7060; }
        .cc-muted { color: #7A7060; }
        .cc-sm { font-size: 12px; }
        .cc-btn { padding: 9px 14px; border-radius: 10px; border: 1px solid #D8D0BC; background: #fff; font-size: 13px; cursor: pointer; font-family: inherit; }
        .cc-btn:hover { border-color: #3A6A48; }
        .cc-btn-wa { background: #3A6A48; color: #fff; border-color: #3A6A48; text-decoration: none; display: inline-block; }
        .cc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .cc-stat { background: #FBF9F3; border: 1px solid #EDE8DC; border-radius: 12px; padding: 12px 14px; }
        .cc-stat-hero { background: rgba(58,106,72,.10); border-color: rgba(58,106,72,.30); }
        .cc-stat b { display: block; font-size: 22px; font-family: 'Figtree', sans-serif; font-weight: 500; }
        .cc-stat span { font-size: 12px; color: #7A7060; }
        .cc-search { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #D8D0BC; font-size: 14px; font-family: inherit; margin-bottom: 14px; box-sizing: border-box; }
        .cc-error { color: #A33; background: #FDEAEA; padding: 10px 14px; border-radius: 10px; font-size: 13px; }
        .cc-empty { background: #FBF9F3; border: 1px dashed #D8D0BC; border-radius: 12px; padding: 28px; text-align: center; }
        .cc-tablewrap { overflow-x: auto; border: 1px solid #EDE8DC; border-radius: 12px; }
        .cc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .cc-table th { text-align: left; padding: 10px 12px; background: #FBF9F3; color: #7A7060; font-weight: 500; font-size: 12px; white-space: nowrap; }
        .cc-table td { padding: 11px 12px; border-top: 1px solid #F0ECE2; vertical-align: top; }
        .cc-table tbody tr { cursor: pointer; }
        .cc-table tbody tr:hover { background: #FBF9F3; }
        .cc-name { font-weight: 500; }
        .cc-prev { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3A3530; }
        .cc-chip { display: inline-block; padding: 3px 9px; border-radius: 100px; font-size: 11px; background: #EDE8DC; }
        .cc-chip-nuevo { background: rgba(58,106,72,.14); color: #2a5238; }
        .cc-chip-cerrado, .cc-chip-descartado { background: #EFEFEF; color: #7A7060; }
        .cc-drawer-bg { position: fixed; inset: 0; background: rgba(20,20,20,.42); z-index: 200; display: flex; justify-content: flex-end; }
        .cc-drawer { width: min(520px, 100%); background: #fff; height: 100%; overflow-y: auto; padding: 20px; box-sizing: border-box; }
        .cc-dhead { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .cc-x { border: none; background: none; font-size: 26px; line-height: 1; cursor: pointer; color: #7A7060; }
        .cc-drow { display: flex; gap: 8px; margin-bottom: 18px; }
        .cc-select { padding: 9px 12px; border-radius: 10px; border: 1px solid #D8D0BC; font-family: inherit; font-size: 13px; }
        .cc-dsec { margin-bottom: 22px; }
        .cc-slcard { border: 1px solid #EDE8DC; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
        .cc-slhead { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
        .cc-slhead a { color: #3A6A48; text-decoration: none; font-weight: 500; }
        .cc-slmeta { font-size: 12px; margin-top: 3px; }
        .cc-hot { color: #3A6A48; font-weight: 500; }
        .cc-fav { color: #B4472F; font-weight: 500; }
        .cc-props { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid #F0ECE2; }
        .cc-prop { display: grid; grid-template-columns: 14px 1fr; gap: 2px 6px; padding: 6px 0 5px; border-bottom: 1px solid #F7F4EC; font-size: 12px; }
        .cc-prop:last-child { border-bottom: none; }
        .cc-prop-h { color: #D8D0BC; }
        .cc-prop-fav .cc-prop-h { color: #B4472F; }
        .cc-prop-fav .cc-prop-n { font-weight: 500; }
        .cc-prop-d { grid-column: 2; }
        .cc-chat { display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto; padding: 4px; }
        .cc-msg { max-width: 82%; padding: 8px 11px; border-radius: 12px; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
        .cc-msg-in { align-self: flex-start; background: #F2EFE6; }
        .cc-msg-out { align-self: flex-end; background: rgba(58,106,72,.12); }
        .cc-msg-t { font-size: 10px; color: #9a9384; margin-top: 3px; }
        .cc-notas { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #D8D0BC; font-family: inherit; font-size: 13px; box-sizing: border-box; margin-bottom: 8px; resize: vertical; }
        @media (max-width: 640px) { .cc-prev { display: none; } }
      `}</style>
    </>
  )
}
