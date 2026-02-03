/**
 * API: Generar CMA (Comparative Market Analysis) para propiedad broker
 *
 * POST /api/broker/generate-cma
 * Body: { propiedad_id: number }
 *
 * Genera PDF con análisis comparativo de mercado:
 * - Busca comparables similares en la zona
 * - Obtiene estadísticas de mercado
 * - Calcula posición de precio
 * - Genera PDF profesional
 *
 * Requiere: créditos CMA disponibles o pago
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { pdf } from '@react-pdf/renderer'
import React from 'react'
import {
  CMAPDFDocument,
  PropiedadAnalizada,
  Comparable,
  MetricasZona,
  PosicionMercado,
  Broker,
  Diferenciadores,
} from '@/lib/pdf/CMAPDFDocument'

// Cliente Supabase con service role para storage
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Cliente para autenticación del usuario
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Función para convertir imagen URL a base64
async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const base64 = buffer.toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch (error) {
    console.error('Error converting image to base64:', url, error)
    return null
  }
}

interface GenerateCMAResponse {
  success: boolean
  pdf_url?: string
  cma_id?: number
  creditos_restantes?: number
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenerateCMAResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { propiedad_id } = req.body

  console.log('CMA Request - propiedad_id:', propiedad_id, 'type:', typeof propiedad_id)

  // Aceptar tanto número como string numérico
  const propiedadIdNum = typeof propiedad_id === 'string' ? parseInt(propiedad_id, 10) : propiedad_id

  if (!propiedadIdNum || isNaN(propiedadIdNum)) {
    return res.status(400).json({ success: false, error: 'propiedad_id es requerido' })
  }

  try {
    // 1. Obtener sesión del usuario
    const authHeader = req.headers.authorization
    let userEmail: string | null = null
    let brokerId: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { data: { user } } = await supabaseAuth.auth.getUser(token)
      userEmail = user?.email || null
    }

    // Si no hay token, intentar obtener del header x-broker-id
    const impersonateBrokerId = req.headers['x-broker-id'] as string | undefined

    if (impersonateBrokerId) {
      brokerId = impersonateBrokerId
    } else if (userEmail) {
      const { data: brokerData } = await supabase
        .from('brokers')
        .select('id')
        .eq('email', userEmail)
        .single()
      brokerId = brokerData?.id
    }

    if (!brokerId) {
      return res.status(401).json({ success: false, error: 'No autorizado' })
    }

    // 2. Verificar créditos CMA disponibles
    const { data: broker, error: brokerError } = await supabase
      .from('brokers')
      .select('id, nombre, email, telefono, empresa, inmobiliaria, cma_creditos')
      .eq('id', brokerId)
      .single()

    if (brokerError || !broker) {
      return res.status(404).json({ success: false, error: 'Broker no encontrado' })
    }

    const creditosActuales = broker.cma_creditos || 0
    if (creditosActuales <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Sin créditos CMA disponibles',
        creditos_restantes: 0
      })
    }

    // 3. Obtener datos de la propiedad (incluyendo amenidades, equipamiento, etc.)
    console.log('Buscando propiedad ID:', propiedadIdNum, 'para broker:', brokerId)

    const { data: propiedad, error: propError } = await supabase
      .from('propiedades_broker')
      .select(`
        id, codigo, proyecto_nombre, zona, precio_usd,
        area_m2, dormitorios, banos, piso, estado_construccion,
        broker_id, score_calidad, cantidad_parqueos, parqueo_incluido,
        baulera_incluida, acepta_plan_pagos, precio_negociable,
        amenidades
      `)
      .eq('id', propiedadIdNum)
      .single()

    console.log('Resultado query propiedad:', propiedad ? 'encontrada' : 'NO encontrada', propError?.message || '')

    if (propError || !propiedad) {
      return res.status(404).json({ success: false, error: 'Propiedad no encontrada' })
    }

    // Verificar que la propiedad pertenece al broker
    if (propiedad.broker_id !== brokerId) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para esta propiedad' })
    }

    // 4. Obtener foto principal
    const { data: fotoData } = await supabase
      .from('propiedad_fotos')
      .select('url')
      .eq('propiedad_id', propiedad_id)
      .eq('es_principal', true)
      .single()

    const fotoPrincipal = fotoData?.url
      ? await imageUrlToBase64(fotoData.url)
      : null

    // 5. Buscar comparables usando buscar_unidades_reales()
    // CMA correcto: primero misma tipología exacta, luego expandir si necesario
    const areaMin = Math.round(propiedad.area_m2 * 0.7)
    const areaMax = Math.round(propiedad.area_m2 * 1.3)

    // CMA PROFESIONAL: Solo comparar MISMA tipología (dormitorios exactos)
    // Un especialista NUNCA mezcla 1 dorm con 2 dorms

    // Paso 1: Buscar comparables con MISMA cantidad de dormitorios (área ±30%)
    let comparablesRaw: any[] = []
    const { data: comparablesExactos, error: compError1 } = await supabase.rpc('buscar_unidades_reales', {
      p_filtros: {
        zona: propiedad.zona,
        dormitorios: propiedad.dormitorios,  // Parámetro correcto: "dormitorios" no "dormitorios_min/max"
        area_min: areaMin,
        area_max: areaMax,
        limite: 25
      }
    })

    if (compError1) {
      console.error('Error buscando comparables exactos:', compError1)
    }

    comparablesRaw = comparablesExactos || []

    // Paso 2: Si hay pocos, expandir área pero SIEMPRE mantener mismos dormitorios
    if (comparablesRaw.length < 8) {
      const { data: comparablesExpandidos } = await supabase.rpc('buscar_unidades_reales', {
        p_filtros: {
          zona: propiedad.zona,
          dormitorios: propiedad.dormitorios,  // Mantener mismo dormitorios
          area_min: Math.round(propiedad.area_m2 * 0.3),  // Expandir más el área
          area_max: Math.round(propiedad.area_m2 * 2.0),
          limite: 25
        }
      })

      // Agregar solo los que no están ya en la lista
      const idsExistentes = new Set(comparablesRaw.map((c: any) => c.id))
      const nuevos = (comparablesExpandidos || []).filter((c: any) => !idsExistentes.has(c.id))
      comparablesRaw = [...comparablesRaw, ...nuevos]
    }

    // NOTA: Ya NO expandimos a ±1 dormitorio - un CMA profesional no mezcla tipologías
    console.log(`CMA: Encontrados ${comparablesRaw.length} comparables de ${propiedad.dormitorios} dormitorios`)

    const comparables: Comparable[] = (comparablesRaw || [])
      .filter((c: any) => c.id !== propiedad.id) // Excluir la misma propiedad
      .slice(0, 10)
      .map((c: any) => ({
        id: c.id,
        proyecto: c.proyecto || 'Sin nombre',
        zona: c.zona || propiedad.zona,
        precio_usd: c.precio_usd || 0,
        area_m2: c.area_m2 || c.area || 0,  // area_m2 o area según versión
        precio_m2: c.precio_m2 || 0,
        dormitorios: c.dormitorios || 0,
        banos: c.banos || 0,
        estado_construccion: c.estado_construccion,
        desarrollador: c.desarrollador,
        parqueo_incluido: c.parqueo_incluido,
        baulera_incluida: c.baulera_incluida,
        plan_pagos: c.plan_pagos || c.acepta_plan_pagos,
        es_propiedad_analizada: false
      }))

    // Extraer amenidades y equipamiento de la propiedad
    const amenidadesRaw = propiedad.amenidades || {}

    const amenidades: string[] = Array.isArray(amenidadesRaw.lista)
      ? amenidadesRaw.lista
      : (Array.isArray(amenidadesRaw.amenidades_edificio) ? amenidadesRaw.amenidades_edificio : [])

    const equipamiento: string[] = Array.isArray(amenidadesRaw.equipamiento)
      ? amenidadesRaw.equipamiento
      : []

    // Calcular área promedio de comparables
    const areaPromedioComparables = comparables.length > 0
      ? Math.round(comparables.reduce((sum, c) => sum + c.area_m2, 0) / comparables.length)
      : propiedad.area_m2

    // Calcular % de comparables con parqueo incluido
    const comparablesConParqueo = comparables.filter(c => c.parqueo_incluido).length
    const pctParqueo = comparables.length > 0
      ? Math.round((comparablesConParqueo / comparables.length) * 100)
      : 0

    // 6. CMA PROFESIONAL: Calcular métricas DESDE LOS COMPARABLES (no vista general)
    // Un experto calcula promedios solo de las propiedades que está comparando

    let metricas: MetricasZona

    if (comparables.length > 0) {
      // Calcular desde los comparables encontrados
      const precios = comparables.map(c => c.precio_usd).sort((a, b) => a - b)
      const preciosM2 = comparables.map(c => c.precio_m2).sort((a, b) => a - b)

      const avgPrecio = Math.round(precios.reduce((sum, p) => sum + p, 0) / precios.length)
      const avgPrecioM2 = Math.round(preciosM2.reduce((sum, p) => sum + p, 0) / preciosM2.length)

      // Mediana: valor del medio
      const medianIdx = Math.floor(precios.length / 2)
      const medianaPrecio = precios.length % 2 === 0
        ? Math.round((precios[medianIdx - 1] + precios[medianIdx]) / 2)
        : precios[medianIdx]

      metricas = {
        stock: comparables.length,
        precio_promedio: avgPrecio,
        precio_mediana: medianaPrecio,
        precio_min: precios[0],
        precio_max: precios[precios.length - 1],
        precio_m2: avgPrecioM2,  // Promedio de $/m² de comparables
        dias_promedio: 60
      }

      console.log(`CMA Métricas desde ${comparables.length} comparables: Promedio $${avgPrecio}, $/m² promedio $${avgPrecioM2}`)
    } else {
      // Sin comparables, usar datos de la propiedad
      metricas = {
        stock: 0,
        precio_promedio: propiedad.precio_usd,
        precio_mediana: propiedad.precio_usd,
        precio_min: propiedad.precio_usd,
        precio_max: propiedad.precio_usd,
        precio_m2: Math.round(propiedad.precio_usd / propiedad.area_m2),
        dias_promedio: 60
      }
    }

    // 7. CMA PROFESIONAL: Calcular posición vs los COMPARABLES (precio/m²)
    // Un experto compara $/m², no precio total (porque áreas varían)

    const precioM2Propiedad = propiedad.area_m2 > 0
      ? Math.round(propiedad.precio_usd / propiedad.area_m2)
      : 0

    // Diferencia en $/m² vs promedio de comparables
    const diffPctM2 = metricas.precio_m2 > 0
      ? Math.round((precioM2Propiedad - metricas.precio_m2) / metricas.precio_m2 * 100)
      : 0

    let categoria: PosicionMercado['categoria'] = 'promedio'
    let texto = 'En rango de mercado'

    if (diffPctM2 <= -20) {
      categoria = 'oportunidad'
      texto = `${Math.abs(diffPctM2)}% bajo promedio $/m² (oportunidad)`
    } else if (diffPctM2 <= -10) {
      categoria = 'bajo_promedio'
      texto = `${Math.abs(diffPctM2)}% bajo promedio $/m²`
    } else if (diffPctM2 >= 20) {
      categoria = 'premium'
      texto = `${diffPctM2}% sobre promedio $/m² (premium)`
    } else if (diffPctM2 >= 10) {
      categoria = 'sobre_promedio'
      texto = `${diffPctM2}% sobre promedio $/m²`
    }

    const posicion: PosicionMercado = {
      diferencia_pct: diffPctM2,
      posicion_texto: texto,
      categoria
    }

    console.log(`CMA Posición: Tu $/m² = $${precioM2Propiedad}, Promedio comparables = $${metricas.precio_m2}, Diferencia = ${diffPctM2}%`)

    // 8. Calcular diferenciadores (ventajas vs desventajas)
    const diferenciadores: Diferenciadores = {
      ventajas: [],
      desventajas: []
    }

    // Área vs promedio
    if (propiedad.area_m2 > areaPromedioComparables * 1.1) {
      diferenciadores.ventajas.push(`Área superior al promedio (${propiedad.area_m2} vs ${areaPromedioComparables} m²)`)
    } else if (propiedad.area_m2 < areaPromedioComparables * 0.9) {
      diferenciadores.desventajas.push(`Área menor al promedio (${propiedad.area_m2} vs ${areaPromedioComparables} m²)`)
    }

    // Parqueo incluido
    if (propiedad.parqueo_incluido && pctParqueo < 50) {
      diferenciadores.ventajas.push(`Parqueo incluido (solo ${pctParqueo}% en zona lo incluye)`)
    } else if (propiedad.parqueo_incluido) {
      diferenciadores.ventajas.push('Parqueo incluido en precio')
    }

    // Baulera incluida
    if (propiedad.baulera_incluida) {
      diferenciadores.ventajas.push('Baulera incluida en precio')
    }

    // Plan de pagos
    if (propiedad.acepta_plan_pagos) {
      diferenciadores.ventajas.push('Plan de pagos disponible con desarrollador')
    }

    // Precio negociable
    if (propiedad.precio_negociable) {
      diferenciadores.ventajas.push('Precio negociable')
    }

    // Precio/m² competitivo
    if (metricas.precio_m2 > 0 && precioM2Propiedad < metricas.precio_m2 * 0.95) {
      diferenciadores.ventajas.push(`Precio/m² competitivo (${precioM2Propiedad} vs ${metricas.precio_m2} promedio)`)
    } else if (metricas.precio_m2 > 0 && precioM2Propiedad > metricas.precio_m2 * 1.1) {
      diferenciadores.desventajas.push(`Precio/m² sobre el promedio de zona`)
    }

    // Estado construcción - Factor clave de precio
    if (propiedad.estado_construccion === 'preventa') {
      diferenciadores.desventajas.push('Preventa (tiempo de espera para entrega)')
    } else if (propiedad.estado_construccion === 'entrega_inmediata') {
      diferenciadores.ventajas.push('Entrega inmediata - justifica premium de 5-15% vs preventa')
    } else if (propiedad.estado_construccion === 'en_construccion') {
      diferenciadores.desventajas.push('En construcción (entrega futura)')
    }

    // Score calidad
    if (propiedad.score_calidad && propiedad.score_calidad >= 80) {
      diferenciadores.ventajas.push(`Score de calidad alto (${propiedad.score_calidad}/100)`)
    }

    // 9. Crear comparables con propiedad destacada
    const propiedadComoComparable: Comparable = {
      id: propiedad.id,
      proyecto: propiedad.proyecto_nombre,
      zona: propiedad.zona,
      precio_usd: propiedad.precio_usd,
      area_m2: propiedad.area_m2,
      precio_m2: precioM2Propiedad,
      dormitorios: propiedad.dormitorios,
      banos: propiedad.banos,
      estado_construccion: propiedad.estado_construccion,
      parqueo_incluido: propiedad.parqueo_incluido,
      baulera_incluida: propiedad.baulera_incluida,
      plan_pagos: propiedad.acepta_plan_pagos,
      es_propiedad_analizada: true
    }

    // Insertar la propiedad analizada en la tabla de comparables
    const comparablesConPropiedad = [...comparables, propiedadComoComparable]
      .sort((a, b) => a.precio_usd - b.precio_usd)

    // 10. Generar PDF
    const propiedadAnalizada: PropiedadAnalizada = {
      id: propiedad.id,
      codigo: propiedad.codigo,
      proyecto_nombre: propiedad.proyecto_nombre,
      zona: propiedad.zona,
      precio_usd: propiedad.precio_usd,
      area_m2: propiedad.area_m2,
      dormitorios: propiedad.dormitorios,
      banos: propiedad.banos,
      piso: propiedad.piso,
      estado_construccion: propiedad.estado_construccion,
      // Nuevos campos
      amenidades,
      equipamiento,
      score_calidad: propiedad.score_calidad,
      cantidad_parqueos: propiedad.cantidad_parqueos,
      parqueo_incluido: propiedad.parqueo_incluido,
      baulera_incluida: propiedad.baulera_incluida,
      plan_pagos: propiedad.acepta_plan_pagos,
      precio_negociable: propiedad.precio_negociable,
      diferenciadores
    }

    const brokerData: Broker = {
      id: broker.id,
      nombre: broker.nombre,
      email: broker.email,
      telefono: broker.telefono,
      empresa: broker.empresa,
      inmobiliaria: broker.inmobiliaria
    }

    // Nota sobre cantidad de comparables
    const notaComparables = comparables.length < 5
      ? `Análisis basado en ${comparables.length} propiedades comparables disponibles en la zona.`
      : undefined

    const pdfElement = React.createElement(CMAPDFDocument, {
      propiedad: propiedadAnalizada,
      comparables: comparablesConPropiedad, // Incluye la propiedad destacada
      metricas,
      posicion,
      broker: brokerData,
      fotoPrincipal: fotoPrincipal || undefined,
      diferenciadores,
      notaComparables
    }) as any

    const pdfDoc = pdf(pdfElement)
    const pdfBuffer = await pdfDoc.toBuffer()

    // 9. Subir a Supabase Storage
    const timestamp = Date.now()
    const fileName = `CMA-${propiedad.codigo}-${timestamp}.pdf`
    const filePath = `cma-reports/${brokerId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('pdfs-broker')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Error subiendo PDF CMA:', uploadError)
      return res.status(500).json({ success: false, error: 'Error al subir PDF' })
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('pdfs-broker')
      .getPublicUrl(filePath)

    // 10. Registrar uso en broker_cma_uso
    const { data: cmaRecord, error: cmaError } = await supabase
      .from('broker_cma_uso')
      .insert({
        broker_id: brokerId,
        tipo: 'cma_completo',
        propiedad_analizada: {
          id: propiedad.id,
          codigo: propiedad.codigo,
          proyecto: propiedad.proyecto_nombre,
          zona: propiedad.zona,
          precio_usd: propiedad.precio_usd,
          area_m2: propiedad.area_m2,
          dormitorios: propiedad.dormitorios
        },
        comparables_usados: comparables.length,
        rango_estimado: {
          min: Math.round(metricas.precio_promedio * 0.95),
          sugerido: metricas.precio_promedio,
          max: Math.round(metricas.precio_promedio * 1.05)
        },
        pdf_url: publicUrl,
        monto_pagado: 0 // Crédito usado, no pago
      })
      .select('id')
      .single()

    if (cmaError) {
      console.error('Error registrando CMA:', cmaError)
    }

    // 11. Consumir crédito
    const { error: updateError } = await supabase
      .from('brokers')
      .update({
        cma_creditos: creditosActuales - 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', brokerId)

    if (updateError) {
      console.error('Error decrementando crédito:', updateError)
    }

    // 12. Retornar éxito
    return res.status(200).json({
      success: true,
      pdf_url: publicUrl,
      cma_id: cmaRecord?.id,
      creditos_restantes: creditosActuales - 1
    })

  } catch (error) {
    console.error('Error generando CMA:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno',
    })
  }
}

// Configurar límites para la API
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
  },
}
