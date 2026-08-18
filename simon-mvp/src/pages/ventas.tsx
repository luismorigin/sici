// /ventas — la pagina del feed de EQUIPETROL.
//
// 18-ago-2026: el feed se movio a `components/feed/FeedVentas.tsx`, parametrizado por
// macrozona. Esta pagina quedo con lo que es PROPIO de Equipetrol:
//   · su SEO (`VentasHead`: title, description y el Schema.org con las FAQ que nombran
//     la zona)
//   · su `getStaticProps`
//   · y la declaracion de que macrozona muestra
//
// Agregar Urubo o Las Palmas es copiar ESTA pagina (~30 lineas + su SEO), no las 6.000
// del feed. Ver `docs/design/PLAN_ZN_ALINEAR_Y_ESCALAR.md`.
//
// [!] Mantiene la interfaz publica que ya existia: `pages/b/[hash].tsx` y
// `pages/broker/[slug].tsx` importan de aca el default, el tipo `PublicShareData` y
// `getStaticProps`. Cambiar eso los rompe.
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import type { GetStaticProps } from 'next'
import type { UnidadVenta, FiltrosVentaSimple } from '@/lib/supabase'
import { ZONAS_CANONICAS, ZONAS_EQUIPETROL_DB, ZONAS_ZONA_NORTE, displayZona } from '@/lib/zonas'
import { trackEvent } from '@/lib/analytics'
import { fetchMercadoData, type MercadoData } from '@/lib/mercado-data'
import type { Broker } from '@/lib/simon-brokers'
import ACMInline from '@/components/broker/ACMInline'
import { useBrokerShortlists, DEMO_SHORTLIST_BLOCKED } from '@/hooks/useBrokerShortlists'
import ShortlistSendModal from '@/components/broker/ShortlistSendModal'
import ShortlistsPanel from '@/components/broker/ShortlistsPanel'
import BrokerDemoOverlay from '@/components/demo/BrokerDemoOverlay'
import ReportPropertyModal from '@/components/broker/ReportPropertyModal'
import DataReportsBanner from '@/components/broker/DataReportsBanner'
import EdificioSelect from '@/components/feed/EdificioSelect'
import IsotipoSimon from '@/components/feed/IsotipoSimon'
import { firstName, dormLabelOrNull } from '@/lib/format-utils'
import { buildAtribucionWaMessage, REF_ALTERNATIVAS_ENABLED, buildAlternativasRefLine } from '@/lib/wa-message'
import { openWhatsApp } from '@/lib/whatsapp'
import { parsearBusqueda } from '@/lib/busqueda-natural'
import { useTcParalelo } from '@/lib/useTcParalelo'
import { useTypewriterPlaceholder } from '@/lib/useTypewriterPlaceholder'
import PriceHistogram from '@/components/feed/PriceHistogram'
import { AmenityIcon, SparkleIcon, hasCanonicalIcon } from '@/lib/amenity-icons'
import { AMENIDADES_FILTRABLES } from '@/config/amenidades-mercado'
import FeedDesktopNav from '@/components/feed/FeedDesktopNav'
import ShortlistMobileHeader from '@/components/shortlist/ShortlistMobileHeader'
import ShortlistContextSummary from '@/components/shortlist/ShortlistContextSummary'
import ShortlistBottomBar from '@/components/shortlist/ShortlistBottomBar'
import ShortlistMenu from '@/components/shortlist/ShortlistMenu'
import ShortlistCardChip from '@/components/shortlist/ShortlistCardChip'
import { computeVentaShortlistStats } from '@/lib/shortlist-context'
import type { MapViewBounds } from '@/components/venta/VentaMap'
// WhatsApp oficial de Simon (negocio) — NO el personal del fundador.
import FeedVentas from '@/components/feed/FeedVentas'
// Helpers del SEO: viven junto al feed pero los usa `VentasHead`, que es propio de
// cada macrozona y por eso quedo en la pagina.
import { fmtSEO, formatMesAnioSEO, formatFechaCortaSEO, DORM_LABELS_SEO } from '@/components/feed/FeedVentas'
import type { VentasSEO } from '@/components/feed/FeedVentas'
import { EQUIPETROL } from '@/lib/macrozonas'

export type { PublicShareData } from '@/components/feed/FeedVentas'

function VentasHead({ seo, brokerSlug = null, publicShareHash = null }: {
  seo: VentasSEO
  brokerSlug?: string | null
  publicShareHash?: string | null
}) {
  // En modo shortlist pública (/b/[hash]) el wrapper provee sus propios OG
  // personalizados con el nombre del broker y la cantidad de propiedades.
  // Renderizar VentasHead acá pisaría/duplicaría esos OG y WhatsApp termina
  // mostrando el preview genérico del feed ("348 Departamentos...") en vez
  // de "Selección de <broker> para <cliente>". Skipeamos.
  if (publicShareHash) return null
  const mesAnio = formatMesAnioSEO(seo.fechaActualizacion)
  const fechaCorta = formatFechaCortaSEO(seo.fechaActualizacion)
  // URL canónica según contexto. Sin esto, og:url devuelve el feed público
  // aunque el broker esté en /broker/[slug] o un cliente en /b/[hash],
  // y al compartir el browser/WhatsApp comparte la URL genérica.
  const url = publicShareHash
    ? `https://simonbo.com/b/${publicShareHash}`
    : brokerSlug
    ? `https://simonbo.com/broker/${brokerSlug}`
    : 'https://simonbo.com/ventas'

  const title = `${seo.totalPropiedades} Departamentos en Venta en Equipetrol — Desde ${fmtSEO(seo.tipologias[0]?.precioMediano || 85000)} | Simon`
  const description = `Departamentos en venta en Equipetrol, Santa Cruz, Bolivia. ${seo.totalPropiedades} unidades activas. Precio mediano del m²: ${fmtSEO(seo.medianaPrecioM2)} USD. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz de la Sierra, Bolivia.',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://simonbo.com/#website',
        name: 'Simon',
        url: 'https://simonbo.com',
        publisher: { '@id': 'https://simonbo.com/#organization' },
      },
      {
        '@type': 'RealEstateListing',
        '@id': url,
        url,
        name: title,
        description,
        isPartOf: { '@id': 'https://simonbo.com/#website' },
        provider: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        inLanguage: 'es',
        about: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.764, longitude: -63.197 },
        },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Simon', item: 'https://simonbo.com' },
          { '@type': 'ListItem', position: 2, name: 'Departamentos en Venta', item: url },
        ],
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Departamentos en venta en Equipetrol — ${mesAnio}`,
        description: `${seo.totalPropiedades} departamentos en venta en Equipetrol. Precio mediano del m²: ${fmtSEO(seo.medianaPrecioM2)} USD. Cobertura: 6 zonas. Fuentes: Century 21, Remax, Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        temporalCoverage: seo.fechaActualizacion,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoShape', box: '-17.78 -63.22 -17.75 -63.17' },
        },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Precio mediano por metro cuadrado', value: seo.medianaPrecioM2, unitText: 'USD/m2' },
          { '@type': 'PropertyValue', name: 'Departamentos en venta', value: seo.totalPropiedades, unitText: 'unidades' },
          { '@type': 'PropertyValue', name: 'Actividad de mercado mensual', value: seo.absorcionPct, unitText: 'porcentaje' },
          ...seo.tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Precio mediano ${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}`,
            value: t.precioMediano,
            unitText: 'USD',
          })),
          ...seo.zonas.map(z => ({
            '@type': 'PropertyValue',
            name: `Precio m² en ${z.zonaDisplay}`,
            value: z.medianaPrecioM2,
            unitText: 'USD/m2',
          })),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Cuantos departamentos hay en venta en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `En ${mesAnio} hay ${seo.totalPropiedades} departamentos en venta en Equipetrol, Santa Cruz de la Sierra, Bolivia. Datos actualizados diariamente. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/ventas).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta un departamento en Equipetrol, Santa Cruz?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: seo.tipologias.map(t =>
                `${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}: ${fmtSEO(t.precioMediano)} USD mediano (rango ${fmtSEO(t.precioP25)}–${fmtSEO(t.precioP75)}), ${t.unidades} unidades.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/ventas.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es el precio del metro cuadrado en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El precio mediano del m² en Equipetrol es ${fmtSEO(seo.medianaPrecioM2)} USD (${mesAnio}). Por zona: ${seo.zonas.map(z => `${z.zonaDisplay}: ${fmtSEO(z.medianaPrecioM2)}/m²`).join(', ')}. Fuente: simonbo.com/ventas.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Donde puedo ver departamentos en venta en Equipetrol con precios reales?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Simon (simonbo.com/ventas) muestra ${seo.totalPropiedades} departamentos en venta en Equipetrol con precios verificados y actualizados diariamente desde Century 21, Remax y Bien Inmuebles. Incluye filtros por zona, dormitorios, precio y estado de entrega.`,
            },
          },
        ],
      },
    ],
  }

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#141414" />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:image" content="https://simonbo.com/skyline-equipetrol.jpg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Simon — Inteligencia Inmobiliaria" />
      <meta property="og:locale" content="es_BO" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content="https://simonbo.com/skyline-equipetrol.jpg" />

      {/* Escape de "<": JSON.stringify NO escapa "</script>" — si un dato de
          BD lo contuviera, rompería el parser HTML (XSS). < es JSON válido. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph).replace(/</g, '\\u003c') }}
      />
    </Head>
  )
}

// ===== getStaticProps — SEO data + initial properties =====

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function VentasPage(props: any) {
  return (
    <FeedVentas
      macrozona={EQUIPETROL}
      head={
        <VentasHead
          seo={props.seo}
          brokerSlug={props.brokerSlug ?? null}
          publicShareHash={props.publicShare?.hash ?? null}
        />
      }
      {...props}
    />
  )
}

export const getStaticProps: GetStaticProps<{ seo: VentasSEO; initialProperties: UnidadVenta[] }> = async () => {
  // 🔴 Cliente de SERVIDOR, no el público. Con la clave pública las RPC `_shadow` fallan
  // (42501: no puede leer la tabla desde la mig 317), el helper cae a la RPC vieja —que
  // apunta a la tabla archivada— y esta página se servía SIN propiedades.
  // Ver docs/backlog/SSG_FEEDS_PRIMERA_PINTURA_2026-08-11.md.
  const { getServerSupabase } = await import('@/lib/supabase-server')
  const supabase = getServerSupabase()
  const data = await fetchMercadoData()

  // Fetch initial properties (default filters: recientes, solo_con_fotos)
  let initialProperties: UnidadVenta[] = []
  try {
    if (!supabase) throw new Error('Supabase not configured')
    // Payload SSG mínimo: solo el primer viewport. El listado completo lo trae
    // el cliente con el fetch diferido a idle (ver useEffect de mount). Con 500
    // props completas el __NEXT_DATA__ pesaba ~800KB y hundía LCP/TTI mobile.
    // Lanzamiento TC nuevo: shadow-first con fallback prod (cutover-safe).
    const { rpcShadowFirst } = await import('@/lib/rpc-shadow')
    const { data: rows, error: rpcError } = await rpcShadowFirst(supabase, 'buscar_unidades_simple', {
      p_filtros: { limite: 24, solo_con_fotos: true, orden: 'recientes', zonas_permitidas: ZONAS_EQUIPETROL_DB }
    })
    // El error se MIRA. Ignorarlo fue lo que dejó esta página vacía 2 semanas sin un log.
    if (rpcError) throw rpcError
    if (rows) {
      initialProperties = rows.map((p: any) => ({
        id: p.id,
        proyecto: p.nombre_proyecto || 'Sin proyecto',
        desarrollador: p.desarrollador || null,
        zona: p.zona || 'Sin zona',
        microzona: p.microzona || null,
        // Mismo criterio que /api/ventas: null = "el aviso no lo dice", NO 0 (= monoambiente).
        // Este mapeador es GEMELO del de la API route y se olvidó en el primer arreglo: sin
        // esto la PRIMERA PINTURA seguía mostrando "Mono" y recién al hidratar se corregía.
        dormitorios: p.dormitorios ?? null,
        banos: p.banos ? parseFloat(String(p.banos)) : null,
        precio_usd: parseFloat(String(p.precio_usd)) || 0,
        precio_m2: parseFloat(String(p.precio_m2)) || 0,
        area_m2: parseFloat(String(p.area_m2)) || 0,
        score_calidad: p.score_calidad ?? null,
        agente_nombre: p.agente_nombre || null,
        agente_telefono: p.agente_telefono || null,
        agente_oficina: p.agente_oficina || null,
        fotos_urls: p.fotos_urls || [],
        fotos_count: p.fotos_count || 0,
        url: p.url || '',
        amenities_lista: p.amenities_lista || [],
        es_multiproyecto: p.es_multiproyecto || false,
        estado_construccion: p.estado_construccion || 'no_especificado',
        dias_en_mercado: p.dias_en_mercado ?? null,
        amenities_confirmados: p.amenities_confirmados || [],
        amenities_por_verificar: p.amenities_por_verificar || [],
        equipamiento_detectado: p.equipamiento_detectado || [],
        amenidades_extra: p.amenidades_extra || [],
        equipamiento_otros: p.equipamiento_otros || [],
        pet_friendly: p.pet_friendly ?? null,
        // Solo un EXTRACTO viaja en el payload SSG (la card muestra ~110 chars);
        // el texto completo llega con el fetch diferido del cliente.
        descripcion: p.descripcion ? String(p.descripcion).slice(0, 160) : null,
        latitud: p.latitud ? parseFloat(String(p.latitud)) : null,
        longitud: p.longitud ? parseFloat(String(p.longitud)) : null,
        estacionamientos: p.estacionamientos ?? null,
        baulera: p.baulera ?? null,
        fecha_entrega: p.fecha_entrega || null,
        piso: p.piso || null,
        plan_pagos_desarrollador: p.plan_pagos_desarrollador ?? null,
        acepta_permuta: p.acepta_permuta ?? null,
        solo_tc_paralelo: p.solo_tc_paralelo ?? null,
        precio_negociable: p.precio_negociable ?? null,
        descuento_contado_pct: p.descuento_contado_pct ?? null,
        parqueo_incluido: p.parqueo_incluido ?? null,
        parqueo_precio_adicional: p.parqueo_precio_adicional ?? null,
        baulera_incluido: p.baulera_incluido ?? null,
        baulera_precio_adicional: p.baulera_precio_adicional ?? null,
        plan_pagos_cuotas: p.plan_pagos_cuotas ?? null,
        plan_pagos_texto: p.plan_pagos_texto || null,
        fuente: p.fuente || '',
        tc_sospechoso: p.tc_sospechoso ?? false,
      }))
      // Merge cola larga no canónica (buscar_extras, mig 271). Graceful: si el
      // SQL no está aplicado o no hay data (prod pre-cutover), queda [].
      try {
        const ids = initialProperties.map(pp => pp.id)
        if (ids.length) {
          const { data: extras } = await rpcShadowFirst(supabase, 'buscar_extras', { p_ids: ids })
          if (Array.isArray(extras)) {
            const byId = new Map(extras.map((e: any) => [e.id, e]))
            for (const pp of initialProperties) {
              const e: any = byId.get(pp.id)
              if (e) { pp.amenidades_extra = e.amenidades_extra || []; pp.equipamiento_otros = e.equipamiento_otros || [] }
            }
          }
        }
      } catch { /* helper opcional: no rompe el feed si no existe aún */ }
    }
  } catch (err) {
    console.error('getStaticProps: error fetching initial properties', err)
  }

  return {
    props: {
      seo: {
        totalPropiedades: data.kpis.totalPropiedades,
        medianaPrecioM2: data.kpis.medianaPrecioM2,
        absorcionPct: data.kpis.absorcionPct,
        fechaActualizacion: data.kpis.fechaActualizacion,
        generatedAt: data.generatedAt,
        tipologias: data.tipologias.map(t => ({
          dormitorios: t.dormitorios,
          unidades: t.unidades,
          precioMediano: t.precioMediano,
          precioP25: t.precioP25,
          precioP75: t.precioP75,
        })),
        zonas: data.zonas.map(z => ({
          zonaDisplay: z.zonaDisplay,
          unidades: z.unidades,
          medianaPrecioM2: z.medianaPrecioM2,
        })),
      },
      initialProperties,
    },
    revalidate: 21600, // 6 hours
  }
}

