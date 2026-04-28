// Página pública compartida: /b/[hash]
//
// Renderiza el feed REAL de /ventas o /alquileres (según tipo_operacion de los
// items), pero con prop publicShare que oculta sidebar/filtros/spotlight/mapa/
// gate/preguntas/WA-agente y muestra header del broker arriba con WA al broker.
//
// Asume shortlist HOMOGÉNEA: todos los items del mismo tipo_operacion. El UI
// actual no permite armar mixto (el broker está en /broker/[slug] venta O
// /broker/[slug]/alquileres alquiler). Si apareciera mixto en BD (ej: legacy),
// se usa el tipo del primer item como fallback y los demás siguen ese feed.
//
// SSR sin cache (no-store) — incompatible con Set-Cookie de fingerprint.
// Si cacheáramos, el CDN serviría el mismo Set-Cookie a múltiples clientes
// y el uniqueness del cap fallaría. Ver migración 235 + SHORTLIST_PROTECTION_V1_PLAN.md.
// robots noindex/nofollow + Disallow /b/ en robots.txt.

import { useEffect, useState } from 'react'
import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { createClient } from '@supabase/supabase-js'
import VentasPage, { getStaticProps as ventasGetStaticProps } from '../ventas'
import type { PublicShareData } from '../ventas'
import AlquileresPage, { getStaticProps as alquileresGetStaticProps } from '../alquileres'
import type { PublicShareDataAlquiler } from '../alquileres'
import { getBrokerBySlug } from '@/lib/simon-brokers'
import {
  getShortlistByHashWithStatus,
  fingerprintExists,
  registerNewVisit,
  registerReturnVisit,
  markAsExpired,
  markAsViewLimitReached,
} from '@/lib/broker-shortlists-server'
import {
  computeFingerprint,
  buildVisitorCookie,
  sha256,
} from '@/lib/shortlist-fingerprint'
import ShortlistBlockedPage, { type BlockReason } from '@/components/broker/ShortlistBlockedPage'
import ShortlistWatermark from '@/components/broker/ShortlistWatermark'
import DemoFooterWatermark from '@/components/demo/DemoFooterWatermark'
import DemoModalEducational from '@/components/demo/DemoModalEducational'
import DemoIntroBottomSheet from '@/components/demo/DemoIntroBottomSheet'
import DemoIntroTrigger from '@/components/demo/DemoIntroTrigger'
import DemoBackToBrokerBanner from '@/components/demo/DemoBackToBrokerBanner'
import {
  isDemoShortlistHash,
  sanitizeVentasArrayForDemo,
  sanitizeAlquileresArrayForDemo,
} from '@/lib/demo-mode'
import { DEMO_SHORTLIST_TITLE } from '@/lib/demo-config'
import type { RawUnidadSimpleRow, RawUnidadAlquilerRow } from '@/types/db-responses'
import type { UnidadVenta, UnidadAlquiler } from '@/lib/supabase'

interface ShortlistMeta {
  id: string
  createdAt: string
  expiresAt: string
  brokerNombre: string
}

type VentaPageProps = {
  kind: 'venta'
  seo: any
  initialProperties: UnidadVenta[]
  publicShare: PublicShareData
  shortlistTitle: string
  shortlistMeta: ShortlistMeta
  isDemo: boolean
}

type AlquilerPageProps = {
  kind: 'alquiler'
  seo: any
  initialProperties: UnidadAlquiler[]
  publicShare: PublicShareDataAlquiler
  shortlistTitle: string
  shortlistMeta: ShortlistMeta
  isDemo: boolean
}

type BlockedProps = {
  kind: 'blocked'
  reason: BlockReason
  broker: { nombre: string; telefono: string }
}

type PageProps = VentaPageProps | AlquilerPageProps | BlockedProps

const DEMO_INTRO_COOKIE = 'simon_demo_intro_seen'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=')[1] || '') : null
}

function writeCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return
  const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`
}

export default function PublicShortlistPage(props: PageProps) {
  const [demoBrokerModalOpen, setDemoBrokerModalOpen] = useState(false)
  const [demoIntroOpen, setDemoIntroOpen] = useState(false)

  // Auto-abrir intro la primera vez que el visitante entra a /b/demo.
  // El useEffect corre client-side post-mount — el sheet animaba desde
  // translateY(100%), entonces se ve un slide-up nítido en lugar de
  // aparecer ya abierto. Cookie 365d para no insistir.
  const isDemoMode = props.kind !== 'blocked' && props.isDemo
  useEffect(() => {
    if (!isDemoMode) return
    if (readCookie(DEMO_INTRO_COOKIE)) return
    const t = window.setTimeout(() => setDemoIntroOpen(true), 350)
    return () => window.clearTimeout(t)
  }, [isDemoMode])

  const closeDemoIntro = () => {
    setDemoIntroOpen(false)
    writeCookie(DEMO_INTRO_COOKIE, '1', 365)
  }

  if (props.kind === 'blocked') {
    return <ShortlistBlockedPage reason={props.reason} broker={props.broker} />
  }

  const itemCount = props.publicShare.items.length

  // En modo demo, cualquier click sobre un anchor wa.me dentro del feed
  // (botón WA del broker en cards, sheet, compare) se intercepta acá y se
  // reemplaza por un modal explicativo. Event delegation evita modificar
  // ventas.tsx/alquileres.tsx/CompareSheet en 6+ puntos. publicShareMode
  // ya garantiza que NO hay otros wa.me en el DOM (los del agente
  // original están ocultos), así que es seguro capturar todos.
  const interceptDemoWaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!props.isDemo) return
    const target = e.target as HTMLElement | null
    if (!target) return
    const link = target.closest('a[href*="wa.me/"]') as HTMLAnchorElement | null
    if (!link) return
    e.preventDefault()
    e.stopPropagation()
    setDemoBrokerModalOpen(true)
  }

  const feed =
    props.kind === 'alquiler' ? (
      <AlquileresPage seo={props.seo} initialProperties={props.initialProperties} publicShare={props.publicShare} />
    ) : (
      <VentasPage seo={props.seo} initialProperties={props.initialProperties} publicShare={props.publicShare} />
    )

  return (
    <>
      <Head>
        <title>{props.shortlistTitle}</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta property="og:title" content={props.shortlistTitle} />
        <meta property="og:description" content={`${itemCount} propiedades seleccionadas en Equipetrol`} />
        <meta property="og:type" content="website" />
      </Head>
      {props.isDemo ? (
        <div onClickCapture={interceptDemoWaClick} style={{ display: 'contents' }}>
          {feed}
        </div>
      ) : (
        feed
      )}
      {props.isDemo ? (
        <DemoFooterWatermark />
      ) : (
        <ShortlistWatermark
          brokerNombre={props.shortlistMeta.brokerNombre}
          shortlistId={props.shortlistMeta.id}
          createdAt={props.shortlistMeta.createdAt}
          expiresAt={props.shortlistMeta.expiresAt}
        />
      )}
      {props.isDemo && (
        <>
          <DemoBackToBrokerBanner />
          <DemoModalEducational
            isOpen={demoBrokerModalOpen}
            onClose={() => setDemoBrokerModalOpen(false)}
            context="wa_broker_b_demo"
            title="Es una muestra de cómo lo verán tus clientes"
            body="Cuando uses Simón con tus clientes reales, este botón abre TU WhatsApp directamente — vas a poder responder consultas, coordinar visitas y ver qué propiedades marcaron como favoritas en tu panel de broker."
          />
          <DemoIntroBottomSheet isOpen={demoIntroOpen} onClose={closeDemoIntro} />
          <DemoIntroTrigger onClick={() => setDemoIntroOpen(true)} />
        </>
      )}
    </>
  )
}

function mapRowVenta(r: RawUnidadSimpleRow): UnidadVenta {
  return {
    id: r.id,
    proyecto: r.nombre_proyecto || 'Sin proyecto',
    desarrollador: r.desarrollador || null,
    zona: r.zona || 'Sin zona',
    microzona: r.microzona || null,
    dormitorios: r.dormitorios ?? 0,
    banos: r.banos ? parseFloat(String(r.banos)) : null,
    precio_usd: parseFloat(String(r.precio_usd)) || 0,
    precio_m2: parseFloat(String(r.precio_m2)) || 0,
    area_m2: parseFloat(String(r.area_m2)) || 0,
    score_calidad: r.score_calidad ?? null,
    agente_nombre: r.agente_nombre || null,
    agente_telefono: r.agente_telefono || null,
    agente_oficina: r.agente_oficina || null,
    fotos_urls: r.fotos_urls || [],
    fotos_count: r.fotos_count || 0,
    url: r.url || '',
    amenities_lista: r.amenities_lista || [],
    es_multiproyecto: r.es_multiproyecto || false,
    estado_construccion: r.estado_construccion || 'no_especificado',
    dias_en_mercado: r.dias_en_mercado ?? null,
    amenities_confirmados: r.amenities_confirmados || [],
    amenities_por_verificar: r.amenities_por_verificar || [],
    equipamiento_detectado: r.equipamiento_detectado || [],
    descripcion: r.descripcion || null,
    latitud: r.latitud ? parseFloat(String(r.latitud)) : null,
    longitud: r.longitud ? parseFloat(String(r.longitud)) : null,
    estacionamientos: r.estacionamientos ?? null,
    baulera: r.baulera ?? null,
    fecha_entrega: r.fecha_entrega || null,
    piso: r.piso || null,
    plan_pagos_desarrollador: r.plan_pagos_desarrollador ?? null,
    acepta_permuta: r.acepta_permuta ?? null,
    solo_tc_paralelo: r.solo_tc_paralelo ?? null,
    precio_negociable: r.precio_negociable ?? null,
    descuento_contado_pct: r.descuento_contado_pct ?? null,
    parqueo_incluido: r.parqueo_incluido ?? null,
    parqueo_precio_adicional: r.parqueo_precio_adicional ?? null,
    baulera_incluido: r.baulera_incluido ?? null,
    baulera_precio_adicional: r.baulera_precio_adicional ?? null,
    plan_pagos_cuotas: r.plan_pagos_cuotas ?? null,
    plan_pagos_texto: r.plan_pagos_texto || null,
    fuente: r.fuente || '',
    tc_sospechoso: r.tc_sospechoso ?? false,
  }
}

function mapRowAlquiler(r: RawUnidadAlquilerRow): UnidadAlquiler {
  return {
    id: r.id,
    nombre_edificio: r.nombre_edificio || null,
    nombre_proyecto: r.nombre_proyecto || null,
    desarrollador: r.desarrollador || null,
    zona: r.zona || 'Sin zona',
    dormitorios: r.dormitorios ?? 0,
    banos: r.banos ? parseFloat(r.banos) : null,
    area_m2: parseFloat(String(r.area_m2)) || 0,
    precio_mensual_bob: parseFloat(String(r.precio_mensual_bob)) || 0,
    precio_mensual_usd: r.precio_mensual_usd ? parseFloat(r.precio_mensual_usd) : null,
    amoblado: r.amoblado || null,
    acepta_mascotas: r.acepta_mascotas ?? null,
    deposito_meses: r.deposito_meses ? parseFloat(r.deposito_meses) : null,
    servicios_incluidos: r.servicios_incluidos ? (typeof r.servicios_incluidos === 'string' ? JSON.parse(r.servicios_incluidos) : r.servicios_incluidos) : null,
    contrato_minimo_meses: r.contrato_minimo_meses || null,
    monto_expensas_bob: r.monto_expensas_bob ? parseFloat(r.monto_expensas_bob) : null,
    piso: r.piso ? parseInt(r.piso, 10) : null,
    estacionamientos: r.estacionamientos || null,
    baulera: r.baulera ?? null,
    latitud: r.latitud ? parseFloat(r.latitud) : null,
    longitud: r.longitud ? parseFloat(r.longitud) : null,
    fotos_urls: r.fotos_urls || [],
    fotos_count: r.fotos_count || 0,
    url: r.url || '',
    fuente: r.fuente || '',
    agente_nombre: r.agente_nombre || null,
    agente_telefono: r.agente_telefono || null,
    agente_whatsapp: r.agente_whatsapp || null,
    dias_en_mercado: r.dias_en_mercado || null,
    estado_construccion: r.estado_construccion || 'no_especificado',
    id_proyecto_master: r.id_proyecto_master || null,
    amenities_lista: r.amenities_lista || null,
    equipamiento_lista: r.equipamiento_lista || null,
    descripcion: r.descripcion || null,
  }
}

function blockedProps(
  reason: BlockReason,
  broker: { nombre: string; telefono: string }
): { props: BlockedProps } {
  return {
    props: {
      kind: 'blocked',
      reason,
      broker: { nombre: broker.nombre, telefono: broker.telefono },
    },
  }
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  // SIN cache: incompatible con Set-Cookie de fingerprint (el CDN cachearía
  // la cookie y la serviría a otros visitantes, rompiendo el uniqueness del cap).
  ctx.res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate')
  ctx.res.setHeader('X-Robots-Tag', 'noindex, nofollow')

  const hash = ctx.params?.hash as string | undefined
  if (!hash) return { notFound: true }

  const isDemo = isDemoShortlistHash(hash)

  // Lookup con campos de protección (filtra is_published + archived_at IS NULL).
  const shortlist = await getShortlistByHashWithStatus(hash)
  if (!shortlist) return { notFound: true }

  const broker = await getBrokerBySlug(shortlist.broker_slug)
  if (!broker) return { notFound: true }

  // En modo demo se saltan todos los gates: la shortlist demo NO tiene
  // expiración real, NO acumula vistas únicas, NO se suspende. Cada visitante
  // (broker prospect) la abre cuantas veces quiera para evaluar el producto.
  if (!isDemo) {
    // ========== GATES DE PROTECCIÓN (migración 235) ==========
    // Orden importa: suspended > expired > view_limit. Suspended siempre gana
    // (admin manual lo decidió). Expired antes que cap porque marca status sin
    // gastar query de fingerprint.

    // 1. Suspendida por admin
    if (shortlist.status === 'suspended') {
      return blockedProps('suspended', broker)
    }

    // 2. Pre-bloqueada por admin/cron (status ya es expired/view_limit_reached)
    if (shortlist.status === 'expired') {
      return blockedProps('expired', broker)
    }
    if (shortlist.status === 'view_limit_reached') {
      return blockedProps('view_limit_reached', broker)
    }

    // 3. Expiración lazy (cron no llegó, status sigue active)
    if (new Date(shortlist.expires_at) < new Date()) {
      await markAsExpired(shortlist.id)
      return blockedProps('expired', broker)
    }

    // 4. Cap de vistas únicas: necesita fingerprint
    const fp = computeFingerprint(ctx.req as Parameters<typeof computeFingerprint>[0], shortlist.id)
    const ipHash = fp.ip !== 'unknown' ? sha256(fp.ip) : null
    const referrer = (ctx.req.headers.referer as string | undefined) || null
    const visitMeta = { ipHash, userAgent: fp.userAgent || null, referrer }

    const alreadyVisited = await fingerprintExists(shortlist.id, fp.fingerprint)

    if (!alreadyVisited && shortlist.current_views >= shortlist.max_views) {
      await markAsViewLimitReached(shortlist.id)
      return blockedProps('view_limit_reached', broker)
    }

    // 5. Registrar visita (no bloquea render, pero awaiteamos para garantizar
    //    que current_views/last_viewed_at queden correctos antes de devolver).
    if (alreadyVisited) {
      await registerReturnVisit(shortlist.id, fp.fingerprint, visitMeta)
    } else {
      await registerNewVisit(shortlist.id, fp.fingerprint, visitMeta)
    }

    // 6. Set-Cookie persistente si no había una. Próxima visita del mismo
    //    dispositivo va a usar la cookie en lugar del fallback IP+UA.
    if (fp.isNewVisitor) {
      ctx.res.setHeader('Set-Cookie', buildVisitorCookie(shortlist.id, fp.fingerprint))
    }

    // ========== FIN GATES ==========
  }

  // A partir de acá, supabase con service_role para queries de items/hearts.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: items, error: errItems } = await supabase
    .from('broker_shortlist_items')
    .select('*')
    .eq('shortlist_id', shortlist.id)
    .order('orden', { ascending: true })

  if (errItems) throw errItems
  const safeItems = items || []

  // Hearts del cliente (migración 234). Para hidratar el state del cliente
  // al cargar, de modo que los corazones ya marcados aparezcan como activos.
  // En modo demo NO se persisten hearts — la shortlist demo es compartida
  // por todos los visitantes y no podemos mostrar favoritos cruzados entre
  // brokers prospects distintos. El UI client-side los maneja en state local.
  let initialHearts: number[] = []
  if (!isDemo) {
    const { data: heartRows } = await supabase
      .from('broker_shortlist_hearts')
      .select('propiedad_id')
      .eq('shortlist_id', shortlist.id)
    initialHearts = (heartRows || []).map((r: { propiedad_id: number }) => r.propiedad_id)
  }

  const shortlistMeta: ShortlistMeta = {
    id: shortlist.id,
    createdAt: shortlist.created_at,
    expiresAt: shortlist.expires_at,
    brokerNombre: broker.nombre,
  }

  // Determinar tipo_operacion por el primer item (shortlist homogénea).
  // Si no hay items, default a venta (shortlist vacía, caso degenerado).
  const primerTipo = safeItems[0]?.tipo_operacion as 'venta' | 'alquiler' | undefined
  const tipoOperacion: 'venta' | 'alquiler' = primerTipo === 'alquiler' ? 'alquiler' : 'venta'

  const shortlistTitle = isDemo
    ? DEMO_SHORTLIST_TITLE
    : `Selección de ${broker.nombre} para ${shortlist.cliente_nombre}`
  const propIds = safeItems.map(i => i.propiedad_id)

  // ======================== RAMA ALQUILER ========================
  if (tipoOperacion === 'alquiler') {
    let properties: UnidadAlquiler[] = []
    let itemComments: Record<number, string | null> = {}
    let priceSnapshots: Record<number, { bobSnapshot: number | null; bobActual: number | null }> = {}

    if (propIds.length > 0) {
      const [rpcRes, bobRes] = await Promise.all([
        supabase.rpc('buscar_unidades_alquiler', { p_filtros: { limite: 500, solo_con_fotos: false } }),
        supabase.from('propiedades_v2').select('id, precio_mensual_bob').in('id', propIds),
      ])

      const indexed = new Map<number, RawUnidadAlquilerRow>()
      for (const r of (rpcRes.data || []) as RawUnidadAlquilerRow[]) indexed.set(r.id, r)
      properties = safeItems
        .map(i => indexed.get(i.propiedad_id))
        .filter((r): r is RawUnidadAlquilerRow => Boolean(r))
        .map(mapRowAlquiler)

      // Sanitizar agente_* server-side antes de hidratar al cliente. Sin esto,
      // un broker prospect con DevTools puede leer __NEXT_DATA__ y extraer
      // los WhatsApps de captadores. Ver lib/demo-mode.ts.
      if (isDemo) properties = sanitizeAlquileresArrayForDemo(properties)

      const bobActualByPropId = new Map<number, number | null>()
      for (const r of (bobRes.data || []) as Array<{ id: number; precio_mensual_bob: string | number | null }>) {
        const v = r.precio_mensual_bob != null ? parseFloat(String(r.precio_mensual_bob)) : null
        bobActualByPropId.set(r.id, Number.isFinite(v as number) ? (v as number) : null)
      }

      itemComments = safeItems.reduce<Record<number, string | null>>((acc, it) => {
        acc[it.propiedad_id] = it.comentario_broker
        return acc
      }, {})
      priceSnapshots = safeItems.reduce<Record<number, { bobSnapshot: number | null; bobActual: number | null }>>((acc, it) => {
        const snap = (it as { precio_mensual_bob_snapshot?: number | string | null }).precio_mensual_bob_snapshot
        acc[it.propiedad_id] = {
          bobSnapshot: snap != null ? parseFloat(String(snap)) : null,
          bobActual: bobActualByPropId.get(it.propiedad_id) ?? null,
        }
        return acc
      }, {})
    }

    // Reusamos el SEO base de /alquileres (meta tags + KPIs de mercado)
    const alquileresResult = await alquileresGetStaticProps({} as Parameters<typeof alquileresGetStaticProps>[0])
    const baseProps = 'props' in alquileresResult ? (alquileresResult.props as Record<string, unknown>) : {}

    return {
      props: {
        kind: 'alquiler',
        seo: baseProps.seo as AlquilerPageProps['seo'],
        initialProperties: properties,
        publicShare: {
          hash,
          broker: {
            slug: broker.slug,
            nombre: broker.nombre,
            telefono: broker.telefono,
            foto_url: broker.foto_url,
            inmobiliaria: broker.inmobiliaria,
          },
          items: properties,
          itemComments,
          priceSnapshots,
          initialHearts,
          isDemo,
        },
        shortlistTitle,
        shortlistMeta,
        isDemo,
      },
    }
  }

  // ========================= RAMA VENTA =========================
  let properties: UnidadVenta[] = []
  let itemComments: Record<number, string | null> = {}
  let priceSnapshots: Record<number, { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null }> = {}
  if (propIds.length > 0) {
    // 3 fuentes en paralelo:
    //  - RPC buscar_unidades_simple → datos de display (incluye precio_usd normalizado actual)
    //  - propiedades_v2.precio_usd  → RAW actual (para detectar cambio del agente vs TC)
    //  - items ya tienen precio_usd_snapshot (raw) y precio_norm_snapshot (normalizado)
    const [rpcRes, rawRes] = await Promise.all([
      supabase.rpc('buscar_unidades_simple', { p_filtros: { limite: 500, solo_con_fotos: false } }),
      supabase.from('propiedades_v2').select('id, precio_usd').in('id', propIds),
    ])

    const indexed = new Map<number, RawUnidadSimpleRow>()
    for (const r of (rpcRes.data || []) as RawUnidadSimpleRow[]) indexed.set(r.id, r)
    properties = safeItems
      .map(i => indexed.get(i.propiedad_id))
      .filter((r): r is RawUnidadSimpleRow => Boolean(r))
      .map(mapRowVenta)

    // Sanitizar agente_* server-side antes de hidratar al cliente. Sin esto,
    // un broker prospect con DevTools puede leer __NEXT_DATA__ y extraer los
    // WhatsApps de captadores. Ver lib/demo-mode.ts.
    if (isDemo) properties = sanitizeVentasArrayForDemo(properties)

    const rawActualByPropId = new Map<number, number | null>()
    for (const r of (rawRes.data || []) as Array<{ id: number; precio_usd: string | number | null }>) {
      const v = r.precio_usd != null ? parseFloat(String(r.precio_usd)) : null
      rawActualByPropId.set(r.id, Number.isFinite(v as number) ? (v as number) : null)
    }

    itemComments = safeItems.reduce<Record<number, string | null>>((acc, it) => {
      acc[it.propiedad_id] = it.comentario_broker
      return acc
    }, {})
    priceSnapshots = safeItems.reduce<Record<number, { rawSnapshot: number | null; normSnapshot: number | null; rawActual: number | null }>>((acc, it) => {
      const rawSnap = (it as { precio_usd_snapshot?: number | string | null }).precio_usd_snapshot
      const normSnap = (it as { precio_norm_snapshot?: number | string | null }).precio_norm_snapshot
      acc[it.propiedad_id] = {
        rawSnapshot: rawSnap != null ? parseFloat(String(rawSnap)) : null,
        normSnapshot: normSnap != null ? parseFloat(String(normSnap)) : null,
        rawActual: rawActualByPropId.get(it.propiedad_id) ?? null,
      }
      return acc
    }, {})
  }

  // Reusamos el SEO de /ventas (mismas defaults para meta tags base)
  const ventasResult = await ventasGetStaticProps({} as Parameters<typeof ventasGetStaticProps>[0])
  const baseProps = 'props' in ventasResult ? (ventasResult.props as Record<string, unknown>) : {}

  return {
    props: {
      kind: 'venta',
      seo: baseProps.seo as VentaPageProps['seo'],
      initialProperties: properties,
      publicShare: {
        hash,
        broker,
        items: properties,
        itemComments,
        priceSnapshots,
        initialHearts,
        isDemo,
      },
      shortlistTitle,
      shortlistMeta,
      isDemo,
    },
  }
}
