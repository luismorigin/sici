// Editor de una shortlist específica del broker.
// Permite: editar nombre/teléfono/mensaje, reordenar propiedades (mover ↑↓),
// agregar comentario por propiedad, despublicar, copiar/reenviar link.
//
// El feed completo de propiedades NO se muestra acá — para agregar propiedades
// nuevas el broker vuelve a /broker/[slug] y arma una shortlist nueva.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { getBrokerBySlug, type Broker } from '@/lib/simon-brokers'
import { getShortlistById, updateShortlist, archiveShortlist, publicShortlistURL } from '@/lib/broker-shortlists'
import { buildWhatsAppURL, defaultShortlistMessage } from '@/lib/whatsapp'
import type { BrokerShortlistItem, BrokerShortlistWithItems } from '@/types/broker-shortlist'

interface PageProps {
  broker: Broker
}

export default function ShortlistEditorPage({ broker }: PageProps) {
  const router = useRouter()
  const id = typeof router.query.id === 'string' ? router.query.id : null
  const [data, setData] = useState<BrokerShortlistWithItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<BrokerShortlistItem[]>([])
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [isPublished, setIsPublished] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getShortlistById(id)
      .then(d => {
        setData(d)
        setItems(d.items.sort((a, b) => a.orden - b.orden))
        setClienteNombre(d.cliente_nombre)
        setClienteTelefono(d.cliente_telefono)
        // Si mensaje_whatsapp está vacío (shortlist vieja o guardada sin override),
        // cargamos el template por defecto para que el broker pueda editarlo en vez
        // de ver un textarea vacío.
        const mensajeGuardado = (d.mensaje_whatsapp || '').trim()
        if (mensajeGuardado) {
          setMensaje(mensajeGuardado)
        } else {
          setMensaje(defaultShortlistMessage({
            clienteNombre: d.cliente_nombre,
            brokerNombre: broker.nombre,
            shortlistUrl: publicShortlistURL(d.hash),
            cantidadPropiedades: d.items.length,
          }))
        }
        setIsPublished(d.is_published)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error cargando'))
      .finally(() => setLoading(false))
  }, [id, broker.nombre])

  const shareUrl = useMemo(() => data ? publicShortlistURL(data.hash) : '', [data])

  function moveItem(idx: number, dir: -1 | 1) {
    setItems(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((it, i) => ({ ...it, orden: i }))
    })
  }

  function removeItem(propiedadId: number) {
    setItems(prev => prev.filter(it => it.propiedad_id !== propiedadId).map((it, i) => ({ ...it, orden: i })))
  }

  function setComentario(propiedadId: number, value: string) {
    setItems(prev => prev.map(it => it.propiedad_id === propiedadId ? { ...it, comentario_broker: value } : it))
  }

  async function handleSave() {
    if (!id) return
    setSaving(true); setError(null)
    try {
      await updateShortlist(id, {
        cliente_nombre: clienteNombre,
        cliente_telefono: clienteTelefono,
        mensaje_whatsapp: mensaje || null,
        is_published: isPublished,
        items: items.map(it => ({
          propiedad_id: it.propiedad_id,
          orden: it.orden,
          comentario_broker: it.comentario_broker,
          tipo_operacion: it.tipo_operacion,
        })),
      })
      // Refrescar
      const fresh = await getShortlistById(id)
      setData(fresh)
      setItems(fresh.items.sort((a, b) => a.orden - b.orden))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      alert('Link copiado al portapapeles')
    } catch {
      window.prompt('Copiá el link manualmente:', shareUrl)
    }
  }

  function handleResend() {
    if (!data) return
    const message = mensaje || defaultShortlistMessage({
      clienteNombre: clienteNombre,
      brokerNombre: broker.nombre,
      shortlistUrl: shareUrl,
      cantidadPropiedades: items.length,
    })
    const wa = buildWhatsAppURL(clienteTelefono, message)
    window.open(wa, '_blank', 'noopener,noreferrer')
  }

  async function handleArchive() {
    if (!id) return
    if (!confirm('¿Archivar esta shortlist? El link compartido va a dejar de servir.')) return
    await archiveShortlist(id)
    router.push(`/broker/${broker.slug}`)
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'DM Sans' }}>Cargando…</div>
  if (error) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'DM Sans' }}>Error: {error}</div>
  if (!data) return null

  return (
    <>
      <Head><title>Editar shortlist — {data.cliente_nombre}</title><meta name="robots" content="noindex" /></Head>
      <div className="se-page">
        <header className="se-header">
          <Link href={`/broker/${broker.slug}`} className="se-back">← Volver al feed</Link>
          <h1 className="se-title">Shortlist de {data.cliente_nombre}</h1>
          <div className="se-meta">
            Creada {new Date(data.created_at).toLocaleDateString('es-BO')} ·
            {data.view_count > 0 ? ` 👁 ${data.view_count} vistas` : ' Sin vistas todavía'}
          </div>
        </header>

        <section className="se-section">
          <h2 className="se-section-title">Datos del cliente</h2>
          <div className="se-field"><label>Nombre</label><input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} /></div>
          <div className="se-field"><label>WhatsApp</label><input value={clienteTelefono} onChange={e => setClienteTelefono(e.target.value)} placeholder="+591 70123456" /></div>
          <div className="se-field"><label>Mensaje WhatsApp</label><textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={4} placeholder="(default si vacío)" /></div>
          <div className="se-field se-field-row">
            <label className="se-checkbox">
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
              Publicado (link activo)
            </label>
          </div>
        </section>

        <section className="se-section">
          <h2 className="se-section-title">Link compartido</h2>
          <div className="se-link-row">
            <code className="se-url">{shareUrl}</code>
            <button className="se-btn se-btn-ghost" onClick={handleCopyLink}>Copiar</button>
            <button className="se-btn se-btn-primary" onClick={handleResend}>Enviar por WhatsApp</button>
          </div>
        </section>

        <section className="se-section">
          <h2 className="se-section-title">Propiedades ({items.length})</h2>
          <ul className="se-items">
            {items.map((it, idx) => {
              const pv = it.preview
              return (
                <li key={it.id} className="se-item">
                  <div className="se-item-handle">
                    <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} aria-label="Subir">↑</button>
                    <span className="se-item-pos">{idx + 1}</span>
                    <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} aria-label="Bajar">↓</button>
                  </div>
                  {pv?.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pv.foto} alt={pv.proyecto} className="se-item-thumb" />
                  ) : (
                    <div className="se-item-thumb se-item-thumb-ph">#{it.propiedad_id}</div>
                  )}
                  <div className="se-item-body">
                    <div className="se-item-name">{pv?.proyecto || `Propiedad #${it.propiedad_id}`}</div>
                    <div className="se-item-meta">
                      {pv?.zona && <span>{pv.zona}</span>}
                      {typeof pv?.dormitorios === 'number' && <span>{pv.dormitorios === 0 ? 'Mono' : `${pv.dormitorios} dorm`}</span>}
                      {pv?.area_m2 && <span>{Math.round(pv.area_m2)}m²</span>}
                      {it.tipo_operacion === 'alquiler' && pv?.precio_mensual_bob
                        ? <span className="se-item-price">Bs {Math.round(pv.precio_mensual_bob).toLocaleString('es-BO')}/mes</span>
                        : pv?.precio_usd
                        ? <span className="se-item-price">$us {Math.round(pv.precio_usd).toLocaleString('en-US')}</span>
                        : null}
                    </div>
                    <textarea
                      placeholder="Comentario para el cliente (opcional)"
                      value={it.comentario_broker || ''}
                      onChange={e => setComentario(it.propiedad_id, e.target.value)}
                      rows={2}
                    />
                  </div>
                  <button className="se-item-remove" onClick={() => removeItem(it.propiedad_id)} aria-label="Quitar">✕</button>
                </li>
              )
            })}
          </ul>
          {items.length === 0 && <div className="se-empty">No quedan propiedades. Esta shortlist va a verse vacía.</div>}
        </section>

        <footer className="se-footer">
          <button className="se-btn se-btn-trash" onClick={handleArchive}>Archivar shortlist</button>
          <div className="se-footer-right">
            <Link href={`/broker/${broker.slug}`} className="se-btn se-btn-ghost">Cancelar</Link>
            <button className="se-btn se-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </footer>
      </div>

      <style jsx>{`
        .se-page { max-width: 720px; margin: 0 auto; padding: 24px 20px 80px; font-family: 'DM Sans', sans-serif; color: #141414; background: #EDE8DC; min-height: 100vh; }
        .se-header { margin-bottom: 24px; }
        .se-back { font-size: 13px; color: #3A6A48; text-decoration: none; }
        .se-title { font-family: 'Figtree'; font-size: 24px; margin: 8px 0 4px; }
        .se-meta { font-size: 12px; color: #6a6a6a; }
        .se-section { background: #fff; border-radius: 12px; padding: 18px; margin-bottom: 16px; }
        .se-section-title { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #3A6A48; text-transform: uppercase; letter-spacing: 0.6px; }
        .se-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .se-field label { font-size: 12px; color: #6a6a6a; font-weight: 600; }
        .se-field input, .se-field textarea { padding: 10px 12px; border: 1px solid rgba(20,20,20,0.15); border-radius: 8px; font-size: 14px; font-family: inherit; background: #fff; color: #141414; }
        .se-field input:focus, .se-field textarea:focus { outline: none; border-color: #3A6A48; }
        .se-field textarea { resize: vertical; min-height: 80px; }
        .se-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
        .se-link-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .se-url { flex: 1 1 240px; padding: 10px 12px; background: #f5efe2; border-radius: 6px; font-size: 12px; word-break: break-all; }
        .se-items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
        .se-item { display: flex; gap: 12px; padding: 12px; background: #f9f5ea; border-radius: 8px; align-items: flex-start; }
        .se-item-handle { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 36px; padding-top: 24px; }
        .se-item-handle button { width: 28px; height: 24px; border: none; background: transparent; cursor: pointer; font-size: 14px; color: #3A6A48; border-radius: 4px; }
        .se-item-handle button:disabled { opacity: 0.3; cursor: not-allowed; }
        .se-item-pos { font-size: 11px; color: #6a6a6a; font-weight: 600; }
        .se-item-thumb { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: #d8d0bc; }
        .se-item-thumb-ph { display: flex; align-items: center; justify-content: center; font-size: 11px; color: #6a6a6a; font-weight: 600; }
        .se-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .se-item-name { font-size: 14px; font-weight: 600; font-family: 'Figtree', sans-serif; }
        .se-item-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #5a5a5a; }
        .se-item-price { color: #3A6A48; font-weight: 600; }
        .se-item-body textarea { padding: 8px; border: 1px solid rgba(20,20,20,0.1); border-radius: 6px; font-size: 12px; font-family: inherit; background: #fff; color: #141414; resize: vertical; }
        .se-item-remove { width: 32px; height: 32px; background: transparent; border: 1px solid rgba(185,28,28,0.3); border-radius: 50%; color: #b91c1c; cursor: pointer; font-size: 16px; flex-shrink: 0; align-self: center; }
        .se-empty { padding: 24px; text-align: center; color: #6a6a6a; font-size: 13px; }
        .se-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; gap: 8px; flex-wrap: wrap; }
        .se-footer-right { display: flex; gap: 8px; }
        .se-btn { padding: 10px 18px; border-radius: 8px; border: 1px solid transparent; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; text-decoration: none; display: inline-block; }
        .se-btn-ghost { background: transparent; color: #141414; border-color: rgba(20,20,20,0.18); }
        .se-btn-primary { background: #3A6A48; color: #EDE8DC; }
        .se-btn-primary:disabled { opacity: 0.6; }
        .se-btn-trash { background: transparent; color: #b91c1c; border-color: rgba(185,28,28,0.3); }
      `}</style>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const slug = ctx.params?.slug as string | undefined
  const broker = await getBrokerBySlug(slug)
  if (!broker) return { notFound: true }
  return { props: { broker } }
}
