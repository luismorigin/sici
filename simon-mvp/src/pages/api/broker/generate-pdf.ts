/**
 * API: Generar PDF profesional para propiedad broker
 *
 * POST /api/broker/generate-pdf
 * Body: { propiedad_id: number }
 *
 * Genera PDF con @react-pdf/renderer, sube a Supabase Storage
 * Retorna URL del PDF generado
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { pdf } from '@react-pdf/renderer'
import React from 'react'
import { PropertyPDFDocument, Broker, PropiedadBroker } from '@/lib/pdf/PropertyPDFDocument'
import { generateQRCode, getShortUrl } from '@/lib/pdf/generateQRCode'

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

interface GeneratePDFResponse {
  success: boolean
  pdf_url?: string
  short_link?: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeneratePDFResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { propiedad_id } = req.body

  if (!propiedad_id || typeof propiedad_id !== 'number') {
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

    // Si no hay token, intentar obtener del header x-broker-id (para impersonación o testing)
    const impersonateBrokerId = req.headers['x-broker-id'] as string | undefined

    if (impersonateBrokerId) {
      brokerId = impersonateBrokerId
    } else if (userEmail) {
      // Buscar broker por email
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

    // 2. Obtener datos del broker
    const { data: broker, error: brokerError } = await supabase
      .from('brokers')
      .select('id, nombre, email, telefono, whatsapp, empresa, inmobiliaria, foto_url, logo_url')
      .eq('id', brokerId)
      .single()

    if (brokerError || !broker) {
      return res.status(404).json({ success: false, error: 'Broker no encontrado' })
    }

    // 3. Obtener datos de la propiedad
    const { data: propiedad, error: propError } = await supabase
      .from('propiedades_broker')
      .select(`
        id, codigo, proyecto_nombre, zona, direccion,
        precio_usd, area_m2, dormitorios, banos, piso,
        cantidad_parqueos, parqueo_incluido, baulera_incluida,
        expensas_usd, estado_construccion, fecha_entrega,
        escritura_lista, descripcion, amenidades, score_calidad,
        broker_id
      `)
      .eq('id', propiedad_id)
      .single()

    if (propError || !propiedad) {
      return res.status(404).json({ success: false, error: 'Propiedad no encontrada' })
    }

    // Verificar que la propiedad pertenece al broker
    if (propiedad.broker_id !== brokerId) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para esta propiedad' })
    }

    // 4. Obtener fotos ordenadas
    const { data: fotosData } = await supabase
      .from('propiedad_fotos')
      .select('url')
      .eq('propiedad_id', propiedad_id)
      .order('orden', { ascending: true })
      .limit(10)

    const fotos = (fotosData || []).map(f => f.url)

    // 5. Generar QR code
    const shortUrl = getShortUrl(propiedad.codigo)
    const qrDataUrl = await generateQRCode(shortUrl)

    // 6. Renderizar PDF
    const pdfElement = React.createElement(PropertyPDFDocument, {
      propiedad: propiedad as PropiedadBroker,
      fotos,
      broker: broker as Broker,
      qrDataUrl,
    }) as any // Cast needed due to strict @react-pdf/renderer types
    const pdfDoc = pdf(pdfElement)
    const pdfBuffer = await pdfDoc.toBuffer()

    // 7. Subir a Supabase Storage
    const fileName = `${propiedad.codigo}.pdf`
    const filePath = `broker/${brokerId}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('pdfs-broker')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Error subiendo PDF:', uploadError)
      return res.status(500).json({ success: false, error: 'Error al subir PDF' })
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('pdfs-broker')
      .getPublicUrl(filePath)

    // 8. Guardar registro en propiedad_pdfs
    // Primero verificar si ya existe un registro para esta propiedad
    const { data: existingPdf } = await supabase
      .from('propiedad_pdfs')
      .select('id, version')
      .eq('propiedad_id', propiedad.id)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (existingPdf) {
      // Actualizar el existente
      const { error: updateError } = await supabase
        .from('propiedad_pdfs')
        .update({
          url: publicUrl,
          short_link: shortUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPdf.id)

      if (updateError) {
        console.error('Error actualizando registro PDF:', updateError)
      }
    } else {
      // Crear nuevo registro
      const { error: insertError } = await supabase
        .from('propiedad_pdfs')
        .insert({
          propiedad_id: propiedad.id,
          url: publicUrl,
          short_link: shortUrl,
          version: 1,
        })

      if (insertError) {
        console.error('Error insertando registro PDF:', insertError)
      }
    }

    // 9. Retornar éxito
    return res.status(200).json({
      success: true,
      pdf_url: publicUrl,
      short_link: shortUrl,
    })

  } catch (error) {
    console.error('Error generando PDF:', error)
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
