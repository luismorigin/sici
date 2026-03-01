/**
 * Types and constants for Proyecto Editor
 * Extracted from admin/proyectos/[id].tsx
 */

export interface ProyectoFormData {
  nombre_oficial: string
  desarrollador: string
  zona: string
  estado_construccion: string
  fecha_entrega: string
  cantidad_pisos: string
  total_unidades: string
  latitud: string
  longitud: string
  amenidades: string[]
  amenidades_custom: string[]
  equipamiento_base: string[]
  equipamiento_base_custom: string[]
  fotos_proyecto: FotoProyecto[]
}

export interface ProyectoOriginal {
  id_proyecto_master: number
  nombre_oficial: string
  desarrollador: string | null
  zona: string | null
  latitud: number | null
  longitud: number | null
  activo: boolean
  estado_construccion: string | null
  fecha_entrega: string | null
  amenidades_edificio: string[] | null
  equipamiento_base: string[] | null
  cantidad_pisos: number | null
  total_unidades: number | null
  aliases: string[] | null
  updated_at: string | null
  fotos_proyecto: FotoProyecto[] | null
}

export interface PropiedadVinculada {
  id: number
  precio_usd: number
  precio_mensual_usd: number | null
  precio_mensual_bob: number | null
  tipo_operacion: string
  dormitorios: number
  area_total_m2: number
  estado_construccion: string | null
  fecha_publicacion: string | null
  fecha_discovery: string | null
  fuente: string | null
  tipo_cambio_detectado: string | null
  datos_json: {
    agente?: {
      nombre?: string
      oficina_nombre?: string
    }
  } | null
}

export interface AmenidadInferida {
  amenidad: string
  porcentaje: number
}

export interface EquipamientoInferido {
  equipamiento: string
  porcentaje: number
}

export interface DatosInferidos {
  success: boolean
  error?: string
  total_propiedades: number
  amenidades_frecuentes: AmenidadInferida[]
  amenidades_opcionales: AmenidadInferida[]
  frecuencia_amenidades: { [key: string]: { cantidad: number; porcentaje: number } }
  equipamiento_frecuente: EquipamientoInferido[]
  equipamiento_opcional: EquipamientoInferido[]
  frecuencia_equipamiento: { [key: string]: { cantidad: number; porcentaje: number } }
  estado_sugerido: { estado: string | null; porcentaje: number | null }
  pisos_max: number | null
  fotos_proyecto: { propiedad_id: number; url: string }[]
}

export interface FotoProyecto {
  url: string
  orden: number
}

export interface ProyectoStats {
  total: number
  totalVenta: number
  totalAlquiler: number
  precioMin: number
  precioMax: number
  precioM2Prom: number
  alquilerMin: number
  alquilerMax: number
  alquilerProm: number
  areaProm: number
  diasProm: number
  porDorms: { [key: number]: number }
  topBrokers: [string, number][]
}

export const ESTADO_CONSTRUCCION = [
  { id: 'entrega_inmediata', label: 'Entrega Inmediata' },
  { id: 'en_construccion', label: 'En Construcción' },
  { id: 'preventa', label: 'Preventa' },
  { id: 'en_planos', label: 'En Planos' },
  { id: 'usado', label: 'Usado' },
  { id: 'no_especificado', label: 'No Especificado' }
]

export const AMENIDADES_OPCIONES_PROYECTO = [
  'Piscina', 'Gimnasio', 'Seguridad 24/7', 'Ascensor', 'Pet Friendly',
  'Co-working', 'Churrasquera', 'Sauna/Jacuzzi', 'Salón de eventos', 'Área de juegos',
  'Roof garden', 'Bar/Lounge', 'Canchas deportivas', 'Sala yoga', 'Jardín'
]

export const EQUIPAMIENTO_OPCIONES_PROYECTO = [
  'Aire acondicionado', 'Cocina equipada', 'Closets', 'Calefón/Termotanque',
  'Cortinas/Blackouts', 'Amoblado', 'Lavadora', 'Secadora', 'Heladera',
  'Microondas', 'Horno empotrado', 'Lavavajillas', 'Balcón', 'Vista panorámica'
]
