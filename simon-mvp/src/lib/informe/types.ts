/**
 * Types for Informe Fiduciario Premium v2
 * Extracted from api/informe.ts
 */

export interface Propiedad {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  dormitorios: number
  banos: number | null
  precio_usd: number
  precio_m2: number
  area_m2: number
  dias_en_mercado: number | null
  fotos_urls: string[]
  amenities_confirmados: string[]
  amenities_por_verificar: string[]
  razon_fiduciaria: string | null
  posicion_mercado: {
    categoria: string
    diferencia_pct: number
  } | null
  posicion_precio_edificio: number | null
  unidades_en_edificio: number | null
  estado_construccion: string
  fecha_entrega?: string | null  // formato 'YYYY-MM'
  lat?: number
  lng?: number
  // Nuevos campos para informe premium v3
  estacionamientos?: number | null
  baulera?: boolean | null
  equipamiento_detectado?: string[]
  // Datos del asesor para contacto
  asesor_nombre?: string | null
  asesor_wsp?: string | null
  asesor_inmobiliaria?: string | null
}

export interface DatosUsuario {
  presupuesto: number
  dormitorios: number | null
  zonas: string[]
  estado_entrega: string
  innegociables: string[]
  deseables: string[]
  ubicacion_vs_metros: number  // 1-5
  calidad_vs_precio: number    // 1-5
  quienes_viven: string
  // Nuevos campos Level 2 para personalización
  necesita_parqueo?: boolean
  necesita_baulera?: boolean
  pareja_alineados?: boolean
  mascotas?: boolean
}

export interface Analisis {
  precio_m2_promedio: number
  dias_mediana: number
  total_analizadas: number
}

export interface LeadData {
  leadId: number
  codigoRef: string
  nombre: string
  whatsapp: string
}

export interface InformeRequest {
  propiedades: Propiedad[]
  datosUsuario: DatosUsuario
  analisis: Analisis
  leadData?: LeadData  // Datos del lead (beta tester con feedback)
}
