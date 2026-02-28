/**
 * Types for the property editor (/admin/propiedades/[id])
 */

export type EstadoInclusion = 'incluido' | 'no_incluido' | 'sin_confirmar' | 'precio_adicional'

export interface CuotaPago {
  id: string
  porcentaje: string
  momento: 'reserva' | 'firma_contrato' | 'durante_obra' | 'cuotas_mensuales' | 'entrega' | 'personalizado'
  descripcion: string
}

export interface FormData {
  tipo_operacion: string
  proyecto_nombre: string
  desarrollador: string
  microzona: string
  piso: string
  precio_publicado: string
  tipo_precio: 'usd_oficial' | 'usd_paralelo' | 'bob'
  area_m2: string
  dormitorios: string
  banos: string
  estacionamientos: string
  parqueo_opcion: EstadoInclusion
  parqueo_precio_adicional: string
  baulera: boolean
  baulera_opcion: EstadoInclusion
  baulera_precio_adicional: string
  estado_construccion: string
  fecha_entrega: string
  expensas_usd: string
  acepta_financiamiento: boolean
  plan_pagos_cuotas: CuotaPago[]
  plan_pagos_texto: string
  solo_tc_paralelo: boolean
  acepta_permuta: boolean
  precio_negociable: boolean
  descuento_contado: string
  latitud: string
  longitud: string
  asesor_nombre: string
  asesor_telefono: string
  asesor_inmobiliaria: string
  descripcion: string
  amenidades: string[]
  amenidades_custom: string[]
  equipamiento: string[]
  equipamiento_custom: string[]
}

export interface CamposBloqueados {
  [key: string]: {
    bloqueado: boolean
    por: string
    usuario_id: string
    usuario_nombre: string
    fecha: string
    valor_original?: any
  } | boolean
}

export interface PropiedadOriginal {
  id: number
  tipo_operacion: string | null
  nombre_edificio: string | null
  zona: string | null
  microzona: string | null
  precio_usd: number | null
  precio_usd_original: number | null
  precio_mensual_bob: number | null
  precio_mensual_usd: number | null
  moneda_original: string | null
  tipo_cambio_detectado: string | null
  tipo_cambio_usado: number | null
  depende_de_tc: boolean | null
  area_total_m2: number | null
  dormitorios: number | null
  banos: number | null
  estacionamientos: number | null
  parqueo_incluido: boolean | null
  parqueo_precio_adicional: number | null
  baulera: boolean | null
  baulera_incluido: boolean | null
  baulera_precio_adicional: number | null
  piso: number | null
  plan_pagos_desarrollador: boolean | null
  plan_pagos_cuotas: CuotaPago[] | null
  plan_pagos_texto: string | null
  acepta_permuta: boolean | null
  solo_tc_paralelo: boolean | null
  precio_negociable: boolean | null
  descuento_contado_pct: number | null
  estado_construccion: string | null
  latitud: number | null
  longitud: number | null
  url: string | null
  fuente: string | null
  score_calidad_dato: number | null
  fecha_publicacion: string | null
  fecha_discovery: string | null
  datos_json: any
  datos_json_discovery: any
  datos_json_enrichment: any
  campos_bloqueados: CamposBloqueados | null
  id_proyecto_master: number | null
}

export interface ProyectoMaster {
  nombre_oficial: string
  desarrollador: string | null
  zona: string | null
  estado_construccion?: string | null
  fecha_entrega?: string | null
  amenidades_edificio?: string[] | null
  equipamiento_base?: string[] | null
}

export interface ProyectoOption {
  id: number
  nombre: string
  desarrollador: string | null
  latitud: number | null
  longitud: number | null
}

export interface HistorialEntry {
  id: number
  campo: string
  valor_anterior: any
  valor_nuevo: any
  usuario_nombre: string
  usuario_tipo: string
  motivo: string | null
  fecha: string
}
