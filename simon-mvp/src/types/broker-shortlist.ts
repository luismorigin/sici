// Tipos compartidos del sistema de shortlists del broker (S2 MVP).
// Ver docs/broker/PRD.md F2 y migración 228_broker_shortlists.sql.

export interface BrokerShortlist {
  id: string
  broker_slug: string
  hash: string

  cliente_nombre: string
  cliente_telefono: string
  mensaje_whatsapp: string | null

  is_published: boolean
  archived_at: string | null

  view_count: number
  last_viewed_at: string | null

  created_at: string
  updated_at: string

  // Derivado del primer item (asumimos shortlist homogénea). Solo viene desde
  // el endpoint GET /api/broker/shortlists, no desde POST ni desde la tabla.
  tipo_operacion?: 'venta' | 'alquiler'
}

export interface BrokerShortlistItem {
  id: string
  shortlist_id: string
  propiedad_id: number
  tipo_operacion: 'venta' | 'alquiler'
  comentario_broker: string | null
  orden: number
  added_at: string
  // Snapshots del precio cuando se agregó a la shortlist.
  // NULL para items pre-migración. Se comparan contra el precio actual al
  // renderizar /b/[hash] para mostrar badge "bajó" / "subió" si la diferencia
  // es > 1%.
  //   - precio_usd_snapshot / precio_norm_snapshot → solo items de venta (migraciones 229/230)
  //   - precio_mensual_bob_snapshot               → solo items de alquiler (migración 233)
  precio_usd_snapshot?: number | null
  precio_norm_snapshot?: number | null
  precio_mensual_bob_snapshot?: number | null
  // Preview enriquecido (solo viene del endpoint GET por id, no de la creación).
  // Para items de venta viene precio_usd poblado; para alquiler precio_mensual_bob.
  preview?: {
    proyecto: string
    zona: string | null
    precio_usd: number | null
    precio_mensual_bob: number | null
    area_m2: number | null
    dormitorios: number | null
    foto: string | null
  } | null
}

// Item enriquecido con data de propiedad para render
export interface BrokerShortlistItemWithProperty extends BrokerShortlistItem {
  propiedad: {
    id: number
    proyecto: string
    zona: string | null
    precio_usd: number | null
    area_total_m2: number | null
    dormitorios: number | null
    fotos: string[]
  }
}

export interface BrokerShortlistWithItems extends BrokerShortlist {
  items: BrokerShortlistItem[]
}

// Payload para crear nueva shortlist desde el modal "Enviar"
export interface CreateShortlistPayload {
  broker_slug: string
  cliente_nombre: string
  cliente_telefono: string
  mensaje_whatsapp?: string | null
  propiedad_ids: number[]
  tipo_operacion?: 'venta' | 'alquiler'
}

// Payload para editar (panel /broker/[slug]/shortlists/[id])
export interface UpdateShortlistPayload {
  cliente_nombre?: string
  cliente_telefono?: string
  mensaje_whatsapp?: string | null
  is_published?: boolean
  items?: Array<{
    propiedad_id: number
    orden: number
    comentario_broker?: string | null
    tipo_operacion?: 'venta' | 'alquiler'
  }>
}
