// /zona-norte/ventas — la pagina del feed de ZONA NORTE.
//
// 18-ago-2026: pasa a usar el MISMO componente que Equipetrol
// (`components/feed/FeedVentas.tsx`), parametrizado por macrozona. Antes era una copia
// de 3.605 lineas que se habia quedado sin el rediseño: no tenia layout desktop, ni
// pills, ni resumen de mercado, ni el rediseño mobile. Ahora lo hereda todo.
//
// Lo que queda aca es lo PROPIO de Zona Norte: su SEO (con `noindex`, sigue en dark
// launch) y su `getStaticProps`.
//
// [!] El aislamiento lo garantiza `macrozona={ZONA_NORTE}`: el componente filtra por
// `macrozona.zonasDB`. El 18-ago este feed sirvio propiedades de Equipetrol porque un
// camino no paso las zonas y el API las devuelve por default — ver
// `docs/design/FIX_FEED_ZN_AISLAMIENTO.md`.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import type { GetStaticProps } from 'next'
import type { UnidadVenta, FiltrosVentaSimple } from '@/lib/supabase'
import { ZONAS_ZONA_NORTE, getMicrozonasZN, displayZona } from '@/lib/zonas'
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
import { firstName } from '@/lib/format-utils'
import { buildAtribucionWaMessage, REF_ALTERNATIVAS_ENABLED, buildAlternativasRefLine } from '@/lib/wa-message'
import { openWhatsApp } from '@/lib/whatsapp'

// 🚪 ZONA NORTE: etiqueta legible del selector SIN hover (feed mobile-first).
// Descarta el labelCorto cifrado ('ZN 2-3 LS/Bz') y arma desde el label completo
// → '2º-3º · La Salle/Banzer'. (Mismo helper que /zona-norte/alquileres.)
import FeedVentas from '@/components/feed/FeedVentas'
import { fmtSEO, formatMesAnioSEO, formatFechaCortaSEO, DORM_LABELS_SEO } from '@/components/feed/FeedVentas'
import type { VentasSEO } from '@/components/feed/FeedVentas'
import { ZONA_NORTE } from '@/lib/macrozonas'

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
    : 'https://simonbo.com/zona-norte/ventas'

  const title = `${seo.totalPropiedades} Departamentos en Venta en Zona Norte — Desde ${fmtSEO(seo.tipologias[0]?.precioMediano || 85000)} | Simon`
  const description = `Departamentos en venta en Zona Norte, Santa Cruz, Bolivia. ${seo.totalPropiedades} unidades activas. Precio mediano del m²: ${fmtSEO(seo.medianaPrecioM2)} USD. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Santa Cruz de la Sierra, Bolivia.',
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
          name: 'Zona Norte, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.718, longitude: -63.153 },
        },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Simon', item: 'https://simonbo.com' },
          { '@type': 'ListItem', position: 2, name: 'Departamentos en Venta en Zona Norte', item: url },
        ],
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Departamentos en venta en Zona Norte — ${mesAnio}`,
        description: `${seo.totalPropiedades} departamentos en venta en Zona Norte. Precio mediano del m²: ${fmtSEO(seo.medianaPrecioM2)} USD. Cobertura: 14 microzonas. Fuentes: Century 21, Remax, Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        temporalCoverage: seo.fechaActualizacion,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Zona Norte, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoShape', box: '-17.771 -63.194 -17.664 -63.111' },
        },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Precio mediano por metro cuadrado', value: seo.medianaPrecioM2, unitText: 'USD/m2' },
          { '@type': 'PropertyValue', name: 'Departamentos en venta', value: seo.totalPropiedades, unitText: 'unidades' },
          ...(seo.absorcionPct != null
            ? [{ '@type': 'PropertyValue', name: 'Actividad de mercado mensual', value: seo.absorcionPct, unitText: 'porcentaje' }]
            : []),
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
            name: 'Cuantos departamentos hay en venta en Zona Norte?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `En ${mesAnio} hay ${seo.totalPropiedades} departamentos en venta en Zona Norte, Santa Cruz de la Sierra, Bolivia. Datos actualizados diariamente. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/zona-norte/ventas).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta un departamento en Zona Norte, Santa Cruz?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: seo.tipologias.map(t =>
                `${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}: ${fmtSEO(t.precioMediano)} USD mediano (rango ${fmtSEO(t.precioP25)}–${fmtSEO(t.precioP75)}), ${t.unidades} unidades.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/zona-norte/ventas.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es el precio del metro cuadrado en Zona Norte?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El precio mediano del m² en Zona Norte es ${fmtSEO(seo.medianaPrecioM2)} USD (${mesAnio}). Por zona: ${seo.zonas.map(z => `${z.zonaDisplay}: ${fmtSEO(z.medianaPrecioM2)}/m²`).join(', ')}. Fuente: simonbo.com/zona-norte/ventas.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Donde puedo ver departamentos en venta en Zona Norte con precios reales?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Simon (simonbo.com/zona-norte/ventas) muestra ${seo.totalPropiedades} departamentos en venta en Zona Norte con precios verificados y actualizados diariamente desde Century 21, Remax y Bien Inmuebles. Incluye filtros por zona, dormitorios, precio y estado de entrega.`,
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
      <meta name="robots" content="noindex, nofollow" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#141414" />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:image" content="https://simonbo.com/skyline-zona-norte.jpg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Simon — Inteligencia Inmobiliaria" />
      <meta property="og:locale" content="es_BO" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content="https://simonbo.com/skyline-zona-norte.jpg" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }}
      />
    </Head>
  )
}

// ===== getStaticProps — SEO data + initial properties =====

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ZonaNorteVentasPage(props: any) {
  return (
    <FeedVentas
      macrozona={ZONA_NORTE}
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
  // Cliente de SERVIDOR — ver la nota en pages/ventas.tsx y
  // docs/backlog/SSG_FEEDS_PRIMERA_PINTURA_2026-08-11.md.
  const { getServerSupabase } = await import('@/lib/supabase-server')
  const supabase = getServerSupabase()
  const data = await fetchMercadoData(ZONA_NORTE)

  // Fetch initial properties (default filters: recientes, solo_con_fotos)
  let initialProperties: UnidadVenta[] = []
  try {
    if (!supabase) throw new Error('Supabase not configured')
    // Shadow-first: la RPC vieja lee `propiedades_v2`, que ya no existe → devolvía 0 filas
    // y el título de la página quedaba en "0 Departamentos en Venta en Zona Norte".
    const { rpcShadowFirst } = await import('@/lib/rpc-shadow')
    // `limite: 24` — solo el primer viewport, igual que /ventas. Estaba en 500 y era
    // inofensivo mientras el SSG devolvía 0; al arreglarlo, el HTML pasó a pesar **918 KB**
    // (medido), que es justo lo que /ventas resolvió bajando a 24: con el payload completo
    // el __NEXT_DATA__ hunde LCP/TTI en mobile. El resto lo trae el cliente al hacer idle.
    const { data: rows, error: rpcError } = await rpcShadowFirst(supabase, 'buscar_unidades_simple', {
      p_filtros: { limite: 24, solo_con_fotos: true, orden: 'recientes', zonas_permitidas: getMicrozonasZN() }
    })
    // El error se MIRA: sin esto, una RPC que falla deja `rows` en null y la página
    // aparece vacía sin una línea en ningún log — el modo de falla que este fix corrige.
    if (rpcError) throw rpcError
    if (rows) {
      initialProperties = rows.map((p: any) => ({
        id: p.id,
        proyecto: p.nombre_proyecto || 'Sin proyecto',
        desarrollador: p.desarrollador || null,
        zona: p.zona || 'Sin zona',
        microzona: p.microzona || null,
        // null = "el aviso no lo dice", NO 0 (= monoambiente). Gemelo del mapeador de
        // /ventas y /api/ventas — ver el caso 8000223 en lib/format-utils.
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
        descripcion: p.descripcion || null,
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

