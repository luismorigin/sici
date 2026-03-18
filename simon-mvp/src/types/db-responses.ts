/**
 * Raw response types from Supabase RPCs and direct queries.
 * These represent the shape of data BEFORE mapping to app interfaces.
 */

// === RPC buscar_unidades_reales / buscar_unidades_broker ===

export interface RawUnidadRealRow {
  id: number
  nombre_proyecto: string | null
  proyecto: string | null
  desarrollador: string | null
  zona: string | null
  microzona: string | null
  dormitorios: number
  banos: string | null
  precio_usd: string | number
  precio_m2: string | number
  area_m2: string | number
  score_calidad: number | null
  agente_nombre: string | null
  asesor_nombre: string | null
  agente_telefono: string | null
  asesor_wsp: string | null
  agente_oficina: string | null
  asesor_inmobiliaria: string | null
  fotos_urls: string[] | null
  cantidad_fotos: number | null
  url: string | null
  amenities_lista: string[] | null
  razon_fiduciaria: string | null
  es_multiproyecto: boolean | null
  estado_construccion: string | null
  dias_en_mercado: number | null
  // Comparación edificio
  unidades_en_edificio: number | null
  posicion_precio_edificio: number | null
  precio_min_edificio: string | null
  precio_max_edificio: string | null
  // Comparación tipología
  unidades_misma_tipologia: number | null
  posicion_en_tipologia: number | null
  precio_min_tipologia: string | null
  precio_max_tipologia: string | null
  // Amenidades fiduciarias
  amenities_confirmados: string[] | null
  amenities_por_verificar: string[] | null
  equipamiento_detectado: string[] | null
  descripcion: string | null
  posicion_mercado: { categoria: string; diferencia_pct: number } | null
  // GPS y extras
  latitud: string | null
  longitud: string | null
  estacionamientos: number | null
  baulera: boolean | null
  piso: string | null
  // Forma de pago
  plan_pagos_desarrollador: boolean | null
  acepta_permuta: boolean | null
  solo_tc_paralelo: boolean | null
  precio_negociable: boolean | null
  descuento_contado_pct: number | null
  // Parqueo/baulera precios
  parqueo_incluido: boolean | null
  parqueo_precio_adicional: number | null
  baulera_incluido: boolean | null
  baulera_precio_adicional: number | null
  // Plan de pagos detallado
  plan_pagos_cuotas: unknown | null
  plan_pagos_texto: string | null
  fecha_entrega: string | null
  // Broker-specific aliases
  acepta_plan_pagos?: boolean | null
  solo_contado_paralelo?: boolean | null
  descuento_contado?: number | null
  plan_pagos?: string | null
  codigo_sim?: string | null
}

// === RPC buscar_unidades_alquiler ===

export interface RawUnidadAlquilerRow {
  id: number
  nombre_edificio: string | null
  nombre_proyecto: string | null
  desarrollador: string | null
  zona: string | null
  dormitorios: number | null
  banos: string | null
  area_m2: string | number
  precio_mensual_bob: string | number
  precio_mensual_usd: string | null
  amoblado: string | null
  acepta_mascotas: boolean | null
  deposito_meses: string | null
  servicios_incluidos: string | null
  contrato_minimo_meses: number | null
  monto_expensas_bob: string | null
  piso: string | null
  estacionamientos: number | null
  baulera: boolean | null
  latitud: string | null
  longitud: string | null
  fotos_urls: string[] | null
  fotos_count: number | null
  url: string | null
  fuente: string | null
  agente_nombre: string | null
  agente_telefono: string | null
  agente_whatsapp: string | null
  dias_en_mercado: number | null
  estado_construccion: string | null
  id_proyecto_master: number | null
  amenities_lista: string[] | null
  equipamiento_lista: string[] | null
  descripcion: string | null
}

// === RPC buscar_unidades_simple (feed /ventas) ===

export interface RawUnidadSimpleRow {
  id: number
  nombre_proyecto: string | null
  desarrollador: string | null
  zona: string | null
  microzona: string | null
  dormitorios: number
  banos: string | null
  precio_usd: string | number
  precio_m2: string | number
  area_m2: string | number
  score_calidad: number | null
  agente_nombre: string | null
  agente_telefono: string | null
  agente_oficina: string | null
  fotos_urls: string[] | null
  fotos_count: number | null
  url: string | null
  amenities_lista: string[] | null
  es_multiproyecto: boolean | null
  estado_construccion: string | null
  dias_en_mercado: number | null
  amenities_confirmados: string[] | null
  amenities_por_verificar: string[] | null
  equipamiento_detectado: string[] | null
  descripcion: string | null
  latitud: string | null
  longitud: string | null
  estacionamientos: number | null
  baulera: boolean | null
  fecha_entrega: string | null
  piso: string | null
  plan_pagos_desarrollador: boolean | null
  acepta_permuta: boolean | null
  solo_tc_paralelo: boolean | null
  precio_negociable: boolean | null
  descuento_contado_pct: number | null
  parqueo_incluido: boolean | null
  parqueo_precio_adicional: number | null
  baulera_incluido: boolean | null
  baulera_precio_adicional: number | null
  plan_pagos_cuotas: unknown | null
  plan_pagos_texto: string | null
  fuente: string | null
}

// === Direct queries (obtenerMetricasMercado) ===

export interface RawPropiedadMercado {
  precio_usd: number
  area_total_m2: number
  dormitorios: number | null
  estado_construccion: string | null
  fecha_publicacion: string | null
  fecha_discovery: string | null
  tipo_cambio_detectado: string | null
}

// === buscarSiguienteRango ===

export interface RawPropiedadRango {
  precio_usd: number
  area_total_m2: number
  tipo_cambio_detectado: string | null
  proyectos_master: { zona: string } | null
}

// === obtenerMicrozonas ===

export interface RawPropiedadMicrozona {
  microzona: string | null
  precio_usd: number
  area_total_m2: number
  tipo_cambio_detectado: string | null
  id_proyecto_master: number | null
}

// === admin/salud.tsx ===

export interface PropiedadSalud {
  status: string
  id_proyecto_master: number | null
  score_calidad_dato: number | null
  zona: string | null
  dormitorios: number | null
  fecha_creacion: string
  tipo_operacion: string | null
  precio_mensual_bob: number | null
  datos_json: { agente_nombre?: string } | null
}

export interface MatchingSugerenciaConTipo {
  id: number
  propiedades_v2: { tipo_operacion: string | null } | null
}

export interface SinMatchRow {
  id: number
  tipo_operacion: string | null
}
