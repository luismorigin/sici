// types/broker-property-report.ts — tipos compartidos client/server
//
// Mirror del schema de migración 240 (sql/migrations/240_broker_property_reports.sql).
// Importable desde components client (solo elimina TS en build).

export type PropertyReportStatus =
  | 'pending'
  | 'in_review'
  | 'resolved'
  | 'false_positive'

export type PropertyReportTipo =
  | 'tc_sospechoso'
  | 'precio_incorrecto'
  | 'area_incorrecta'
  | 'dorms_banos_incorrectos'
  | 'vendida_pero_activa'
  | 'ya_alquilada'
  | 'nombre_edificio_incorrecto'
  | 'zona_gps_incorrecta'

export const ALL_TIPOS: PropertyReportTipo[] = [
  'tc_sospechoso',
  'precio_incorrecto',
  'area_incorrecta',
  'dorms_banos_incorrectos',
  'vendida_pero_activa',
  'ya_alquilada',
  'nombre_edificio_incorrecto',
  'zona_gps_incorrecta',
]

export const TIPO_LABELS: Record<PropertyReportTipo, string> = {
  tc_sospechoso: 'TC sospechoso',
  precio_incorrecto: 'Precio',
  area_incorrecta: 'Área m²',
  dorms_banos_incorrectos: 'Dorms/baños',
  vendida_pero_activa: 'Ya vendida',
  ya_alquilada: 'Ya alquilada',
  nombre_edificio_incorrecto: 'Nombre edificio',
  zona_gps_incorrecta: 'Zona/GPS',
}

export const TIPO_LABELS_LARGOS: Record<PropertyReportTipo, string> = {
  tc_sospechoso: 'Tipo de cambio (paralelo publicado como oficial)',
  precio_incorrecto: 'Precio incorrecto',
  area_incorrecta: 'Área m² incorrecta',
  dorms_banos_incorrectos: 'Dormitorios o baños incorrectos',
  vendida_pero_activa: 'Ya vendida (sigue activa)',
  ya_alquilada: 'Ya alquilada',
  nombre_edificio_incorrecto: 'Nombre del edificio incorrecto',
  zona_gps_incorrecta: 'Zona/GPS mal asignada',
}

export interface PropertyReport {
  id: string
  simon_broker_id: string
  propiedad_id: number

  tc_sospechoso: boolean
  precio_incorrecto: boolean
  area_incorrecta: boolean
  dorms_banos_incorrectos: boolean
  vendida_pero_activa: boolean
  ya_alquilada: boolean
  nombre_edificio_incorrecto: boolean
  zona_gps_incorrecta: boolean

  nota: string | null
  status: PropertyReportStatus
  resolution_notes: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Reporte enriquecido para panel admin (con joins broker + propiedad).
 */
export interface PropertyReportWithJoins extends PropertyReport {
  broker: {
    id: string
    slug: string
    nombre: string
    foto_url: string | null
  } | null
  propiedad: {
    id: number
    titulo: string | null
    nombre_edificio: string | null
    zona: string | null
    tipo_operacion: 'venta' | 'alquiler'
    precio_usd: number | null
  } | null
}

/**
 * Payload del POST /api/broker/property-reports (cliente → server).
 * tipos_error: Partial → solo se envían los tipos true (los false se omiten
 * o se envían false; el server interpreta por presencia).
 */
export interface CreatePropertyReportPayload {
  broker_slug: string
  propiedad_id: number
  tipos_error: Partial<Record<PropertyReportTipo, boolean>>
  nota?: string
}

export interface CreatePropertyReportResponse {
  report: PropertyReport
  duplicate: boolean
}

/**
 * Helper: convierte el row de BD a array de tipos activos (string[]).
 * Útil para frontend (chips, mensajes Slack).
 */
export function tiposActivosDe(report: PropertyReport): PropertyReportTipo[] {
  return ALL_TIPOS.filter((t) => report[t] === true)
}

export interface AdminMetrics {
  pending_count: number
  in_review_count: number
  reports_this_week: number
  reports_last_week: number
  avg_resolution_hours_30d: number | null
  top_reported_props: Array<{ propiedad_id: number; count: number }>
}

export interface AdminListResponse {
  reports: PropertyReportWithJoins[]
  total: number
  page: number
  pageSize: number
  metrics: AdminMetrics
  recurrent_prop_ids: number[]
}
