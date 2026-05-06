// lib/property-reports-server.ts — queries server-side de reportes broker.
//
// USO: SOLO server-side (API routes + getServerSideProps).
// Usa SUPABASE_SERVICE_ROLE_KEY porque broker_property_reports tiene RLS deny-all.
// NO importar desde components client.
//
// Patrón espeja a lib/broker-shortlists-server.ts y lib/simon-brokers.ts.
// Schema: sql/migrations/240_broker_property_reports.sql.

import { createClient } from '@supabase/supabase-js'
import type {
  PropertyReport,
  PropertyReportStatus,
  PropertyReportTipo,
  PropertyReportWithJoins,
  AdminMetrics,
  AdminListResponse,
} from '@/types/broker-property-report'
import { ALL_TIPOS, TIPO_LABELS, tiposActivosDe } from '@/types/broker-property-report'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('property-reports-server: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const REPORT_COLS =
  'id, simon_broker_id, propiedad_id, ' +
  'tc_sospechoso, precio_incorrecto, area_incorrecta, dorms_banos_incorrectos, ' +
  'vendida_pero_activa, ya_alquilada, nombre_edificio_incorrecto, zona_gps_incorrecta, ' +
  'nota, status, resolution_notes, resolved_at, resolved_by, created_at, updated_at'

// ============================================================
// Crear reporte (POST broker)
// ============================================================

export interface CreateReportInput {
  brokerSlug: string
  propiedadId: number
  tipos: Partial<Record<PropertyReportTipo, boolean>>
  nota?: string | null
}

export interface CreateReportResult {
  report: PropertyReport
  duplicate: boolean
}

export interface CreateReportError {
  code:
    | 'broker_invalid'
    | 'propiedad_not_found'
    | 'no_tipos'
    | 'nota_too_long'
    | 'tipo_op_mismatch'
    | 'db_error'
  message: string
}

/**
 * Crea un reporte. Validaciones:
 *  - broker activo (status='activo' en simon_brokers)
 *  - propiedad existe
 *  - al menos 1 tipo true
 *  - nota ≤ 200 chars
 *  - coherencia tipo_operacion: ya_alquilada solo en alquiler,
 *    vendida_pero_activa solo en venta
 *
 * Anti-duplicado: si ya hay un reporte pendiente del mismo broker para la
 * misma prop, retorna `{ duplicate: true }` sin insertar.
 */
export async function createReport(
  input: CreateReportInput
): Promise<{ ok: true; result: CreateReportResult } | { ok: false; error: CreateReportError }> {
  const supa = getSupabaseAdmin()

  // 1. Validar broker activo + obtener id
  const { data: broker, error: brokerErr } = await supa
    .from('simon_brokers')
    .select('id, status')
    .eq('slug', input.brokerSlug)
    .eq('status', 'activo')
    .maybeSingle()
  if (brokerErr) {
    return { ok: false, error: { code: 'db_error', message: brokerErr.message } }
  }
  if (!broker) {
    return { ok: false, error: { code: 'broker_invalid', message: 'broker_slug inválido o inactivo' } }
  }

  // 2. Validar propiedad existe + obtener tipo_operacion
  const { data: prop, error: propErr } = await supa
    .from('propiedades_v2')
    .select('id, tipo_operacion')
    .eq('id', input.propiedadId)
    .maybeSingle()
  if (propErr) {
    return { ok: false, error: { code: 'db_error', message: propErr.message } }
  }
  if (!prop) {
    return { ok: false, error: { code: 'propiedad_not_found', message: `propiedad #${input.propiedadId} no existe` } }
  }

  // 3. Validar al menos 1 tipo true
  const tiposActivos = ALL_TIPOS.filter((t) => input.tipos[t] === true)
  if (tiposActivos.length === 0) {
    return { ok: false, error: { code: 'no_tipos', message: 'al menos 1 tipo de error es requerido' } }
  }

  // 4. Validar nota length
  const notaTrimmed = input.nota?.trim() || null
  if (notaTrimmed && notaTrimmed.length > 200) {
    return { ok: false, error: { code: 'nota_too_long', message: 'nota max 200 caracteres' } }
  }

  // 5. Validar coherencia tipo_operacion
  const propTipoOp = prop.tipo_operacion as 'venta' | 'alquiler' | null
  if (input.tipos.ya_alquilada && propTipoOp !== 'alquiler') {
    return { ok: false, error: { code: 'tipo_op_mismatch', message: 'tipo "ya_alquilada" solo aplica a propiedades de alquiler' } }
  }
  if (input.tipos.vendida_pero_activa && propTipoOp !== 'venta') {
    return { ok: false, error: { code: 'tipo_op_mismatch', message: 'tipo "vendida_pero_activa" solo aplica a propiedades de venta' } }
  }

  // 6. Anti-duplicado: ¿hay reporte pendiente del mismo broker+prop?
  const { data: existing } = await supa
    .from('broker_property_reports')
    .select(REPORT_COLS)
    .eq('simon_broker_id', broker.id)
    .eq('propiedad_id', input.propiedadId)
    .in('status', ['pending', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) {
    return { ok: true, result: { report: existing as unknown as PropertyReport, duplicate: true } }
  }

  // 7. INSERT
  const insertRow: Record<string, unknown> = {
    simon_broker_id: broker.id,
    propiedad_id: input.propiedadId,
    nota: notaTrimmed,
  }
  for (const t of ALL_TIPOS) {
    insertRow[t] = input.tipos[t] === true
  }

  const { data: inserted, error: insertErr } = await supa
    .from('broker_property_reports')
    .insert(insertRow)
    .select(REPORT_COLS)
    .single()
  if (insertErr || !inserted) {
    return { ok: false, error: { code: 'db_error', message: insertErr?.message || 'insert failed' } }
  }

  return { ok: true, result: { report: inserted as unknown as PropertyReport, duplicate: false } }
}

// ============================================================
// Listar reportes del broker (GET broker, banner SSR)
// ============================================================

export async function listReportsForBroker(
  brokerSlug: string,
  opts: {
    propiedadIds?: number[]
    statusIn?: PropertyReportStatus[]
  } = {}
): Promise<PropertyReport[]> {
  const supa = getSupabaseAdmin()

  // Lookup broker.id por slug
  const { data: broker } = await supa
    .from('simon_brokers')
    .select('id')
    .eq('slug', brokerSlug)
    .maybeSingle()
  if (!broker) return []

  let query = supa
    .from('broker_property_reports')
    .select(REPORT_COLS)
    .eq('simon_broker_id', broker.id)
    .order('created_at', { ascending: false })

  if (opts.statusIn && opts.statusIn.length > 0) {
    query = query.in('status', opts.statusIn)
  }
  if (opts.propiedadIds && opts.propiedadIds.length > 0) {
    query = query.in('propiedad_id', opts.propiedadIds)
  }

  const { data, error } = await query
  if (error) {
    console.error('[property-reports-server] listReportsForBroker error:', error)
    return []
  }
  return (data || []) as unknown as PropertyReport[]
}

// ============================================================
// Listar reportes para admin (GET admin, panel cola)
// ============================================================

export interface AdminListFilters {
  status?: PropertyReportStatus | 'all'
  simonBrokerId?: string
  propiedadId?: number
  tipoError?: PropertyReportTipo
  desde?: string
  hasta?: string
  page?: number
  pageSize?: number
}

export async function listReportsForAdmin(
  filters: AdminListFilters = {}
): Promise<AdminListResponse> {
  const supa = getSupabaseAdmin()
  const page = Math.max(0, filters.page ?? 0)
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50))
  const status = filters.status ?? 'pending'

  // Query principal con count
  let query = supa
    .from('broker_property_reports')
    .select(REPORT_COLS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)

  if (status !== 'all') {
    query = query.eq('status', status)
  }
  if (filters.simonBrokerId) {
    query = query.eq('simon_broker_id', filters.simonBrokerId)
  }
  if (filters.propiedadId) {
    query = query.eq('propiedad_id', filters.propiedadId)
  }
  if (filters.tipoError) {
    query = query.eq(filters.tipoError, true)
  }
  if (filters.desde) {
    query = query.gte('created_at', filters.desde)
  }
  if (filters.hasta) {
    query = query.lte('created_at', filters.hasta)
  }

  const { data: rows, count, error } = await query
  if (error) {
    console.error('[property-reports-server] listReportsForAdmin error:', error)
    return {
      reports: [],
      total: 0,
      page,
      pageSize,
      metrics: emptyMetrics(),
      recurrent_prop_ids: [],
    }
  }

  // Hidratar joins (broker + propiedad). Se hace por separado (no PostgREST
  // foreign embed) porque las FK pueden no estar declaradas en el schema cache.
  const reports = (rows || []) as unknown as PropertyReport[]
  const brokerIds = Array.from(new Set(reports.map((r) => r.simon_broker_id)))
  const propIds = Array.from(new Set(reports.map((r) => r.propiedad_id)))

  const [brokersRes, propsRes] = await Promise.all([
    brokerIds.length > 0
      ? supa.from('simon_brokers').select('id, slug, nombre, foto_url').in('id', brokerIds)
      : Promise.resolve({ data: [], error: null }),
    propIds.length > 0
      ? supa
          .from('propiedades_v2')
          .select('id, nombre_edificio, zona, tipo_operacion, precio_usd')
          .in('id', propIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const brokersMap = new Map<string, PropertyReportWithJoins['broker']>()
  for (const b of (brokersRes.data || []) as Array<{
    id: string
    slug: string
    nombre: string
    foto_url: string | null
  }>) {
    brokersMap.set(b.id, {
      id: b.id,
      slug: b.slug,
      nombre: b.nombre,
      foto_url: b.foto_url ?? null,
    })
  }

  const propsMap = new Map<number, PropertyReportWithJoins['propiedad']>()
  for (const p of (propsRes.data || []) as Array<{
    id: number
    nombre_edificio: string | null
    zona: string | null
    tipo_operacion: 'venta' | 'alquiler'
    precio_usd: number | string | null
  }>) {
    propsMap.set(p.id, {
      id: p.id,
      titulo: null,
      nombre_edificio: p.nombre_edificio ?? null,
      zona: p.zona ?? null,
      tipo_operacion: p.tipo_operacion,
      precio_usd: p.precio_usd != null ? parseFloat(String(p.precio_usd)) : null,
    })
  }

  const enriched: PropertyReportWithJoins[] = reports.map((r) => ({
    ...r,
    broker: brokersMap.get(r.simon_broker_id) ?? null,
    propiedad: propsMap.get(r.propiedad_id) ?? null,
  }))

  // Métricas + recurrencia (queries paralelas; tolerantes a fallo individual)
  const [metrics, recurrentPropIds] = await Promise.all([
    computeAdminMetrics(supa),
    computeRecurrentPropIds(supa),
  ])

  return {
    reports: enriched,
    total: count ?? enriched.length,
    page,
    pageSize,
    metrics,
    recurrent_prop_ids: recurrentPropIds,
  }
}

function emptyMetrics(): AdminMetrics {
  return {
    pending_count: 0,
    in_review_count: 0,
    reports_this_week: 0,
    reports_last_week: 0,
    avg_resolution_hours_30d: null,
    top_reported_props: [],
  }
}

async function computeAdminMetrics(
  supa: ReturnType<typeof getSupabaseAdmin>
): Promise<AdminMetrics> {
  try {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [pendingRes, inReviewRes, thisWeekRes, lastWeekRes, resolved30dRes] = await Promise.all([
      supa.from('broker_property_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supa.from('broker_property_reports').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
      supa.from('broker_property_reports').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supa
        .from('broker_property_reports')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twoWeeksAgo)
        .lt('created_at', weekAgo),
      supa
        .from('broker_property_reports')
        .select('created_at, resolved_at')
        .eq('status', 'resolved')
        .gte('resolved_at', thirtyDaysAgo)
        .limit(1000),
    ])

    let avgHours: number | null = null
    const resolvedRows = (resolved30dRes.data || []) as Array<{ created_at: string; resolved_at: string }>
    if (resolvedRows.length > 0) {
      const sumMs = resolvedRows.reduce((acc, r) => {
        const diff = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()
        return acc + (diff > 0 ? diff : 0)
      }, 0)
      avgHours = sumMs / resolvedRows.length / (1000 * 60 * 60)
    }

    // Top 3 props más reportadas en pending+in_review
    const { data: topRows } = await supa
      .from('broker_property_reports')
      .select('propiedad_id')
      .in('status', ['pending', 'in_review'])
    const counts = new Map<number, number>()
    for (const row of (topRows || []) as Array<{ propiedad_id: number }>) {
      counts.set(row.propiedad_id, (counts.get(row.propiedad_id) ?? 0) + 1)
    }
    const top_reported_props = Array.from(counts.entries())
      .map(([propiedad_id, count]) => ({ propiedad_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    return {
      pending_count: pendingRes.count ?? 0,
      in_review_count: inReviewRes.count ?? 0,
      reports_this_week: thisWeekRes.count ?? 0,
      reports_last_week: lastWeekRes.count ?? 0,
      avg_resolution_hours_30d: avgHours,
      top_reported_props,
    }
  } catch (err) {
    console.error('[property-reports-server] computeAdminMetrics error:', err)
    return emptyMetrics()
  }
}

async function computeRecurrentPropIds(
  supa: ReturnType<typeof getSupabaseAdmin>
): Promise<number[]> {
  try {
    const { data } = await supa
      .from('broker_property_reports')
      .select('propiedad_id, simon_broker_id')
      .in('status', ['pending', 'in_review'])
    const propsToBrokers = new Map<number, Set<string>>()
    for (const row of (data || []) as Array<{ propiedad_id: number; simon_broker_id: string }>) {
      if (!propsToBrokers.has(row.propiedad_id)) {
        propsToBrokers.set(row.propiedad_id, new Set())
      }
      propsToBrokers.get(row.propiedad_id)!.add(row.simon_broker_id)
    }
    return Array.from(propsToBrokers.entries())
      .filter(([, brokers]) => brokers.size >= 2)
      .map(([propId]) => propId)
  } catch (err) {
    console.error('[property-reports-server] computeRecurrentPropIds error:', err)
    return []
  }
}

// ============================================================
// Actualizar status (PATCH admin)
// ============================================================

export interface UpdateReportStatusInput {
  id: string
  status: PropertyReportStatus
  resolutionNotes?: string | null
  resolvedBy?: string | null
}

export async function updateReportStatus(
  input: UpdateReportStatusInput
): Promise<PropertyReport | null> {
  const supa = getSupabaseAdmin()
  const isResolved = input.status === 'resolved' || input.status === 'false_positive'

  const payload: Record<string, unknown> = {
    status: input.status,
    resolution_notes: input.resolutionNotes?.trim() || null,
  }

  if (isResolved) {
    payload.resolved_at = new Date().toISOString()
    payload.resolved_by = input.resolvedBy?.trim() || null
  } else {
    // Volver a pending/in_review limpia los campos de resolución
    payload.resolved_at = null
    payload.resolved_by = null
  }

  const { data, error } = await supa
    .from('broker_property_reports')
    .update(payload)
    .eq('id', input.id)
    .select(REPORT_COLS)
    .maybeSingle()
  if (error) {
    throw new Error(`updateReportStatus failed: ${error.message}`)
  }
  return (data as unknown as PropertyReport) ?? null
}

// ============================================================
// Slack dispatch (best-effort, non-blocking)
// ============================================================

const SLACK_TIPO_LABELS = TIPO_LABELS

interface SlackDispatchInput {
  report: PropertyReport
  brokerNombre: string
  brokerSlug: string
  propiedadNombre: string
  propiedadZona: string | null
  propiedadTipoOp: 'venta' | 'alquiler' | null
  appOrigin: string
}

/**
 * Dispatcha mensaje a SLACK_WEBHOOK_URL en Block Kit. Best-effort: si falla,
 * loggea pero no propaga error (el POST del broker no debe ver fallo Slack).
 * Si la env var no está, log y sale silenciosamente.
 */
export async function dispatchSlackNotification(input: SlackDispatchInput): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('[property-reports-server] SLACK_WEBHOOK_URL no configurado, skipping')
    return
  }

  try {
    const tiposActivos = tiposActivosDe(input.report)
    const tiposLabels = tiposActivos.map((t) => SLACK_TIPO_LABELS[t]).join(' · ')

    const propLine = `#${input.report.propiedad_id} — ${input.propiedadNombre}` +
      (input.propiedadZona ? `\n${input.propiedadZona}` : '') +
      (input.propiedadTipoOp ? ` · ${input.propiedadTipoOp}` : '')

    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':rotating_light: Reporte de datos broker' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Broker:*\n${input.brokerNombre} (${input.brokerSlug})` },
          { type: 'mrkdwn', text: `*Prop:*\n${propLine}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Tipos:* ${tiposLabels || '—'}` },
      },
    ]

    if (input.report.nota) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Nota broker:*\n>${input.report.nota}` },
      })
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Abrir editor de prop' },
          url: `${input.appOrigin}/admin/propiedades/${input.report.propiedad_id}`,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ver en panel reportes' },
          url: `${input.appOrigin}/admin/property-reports?id=${input.report.id}`,
        },
      ],
    })

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Reporte ID \`${input.report.id}\` · ${new Date(input.report.created_at).toLocaleString('es-BO')}`,
        },
      ],
    })

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Nuevo reporte de ${input.brokerNombre} sobre prop #${input.report.propiedad_id}`,
        unfurl_links: false,
        blocks,
      }),
    })

    if (!response.ok) {
      console.error(`[property-reports-server] Slack responded ${response.status}`)
    }
  } catch (err) {
    console.error('[property-reports-server] dispatchSlackNotification error:', err)
  }
}

/**
 * Helper para resolver appOrigin desde un Request (X-Forwarded-Host o env).
 * Prefiere VERCEL_URL en deploys, luego NEXT_PUBLIC_SITE_URL, fallback localhost.
 */
export function resolveAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://simonbo.com'
}
