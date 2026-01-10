// Types for the landing page

export interface PropertyMatch {
  id: number;
  nombre_proyecto: string;
  precio: number;
  area: number;
  dormitorios: number;
  score_matching: number;
  precio_m2: number;
  zona: string;
  amenities: string[];
  razon_fiduciaria?: string;
}

export interface MarketMetrics {
  precio_promedio_m2: number;
  total_propiedades: number;
  propiedades_por_dormitorios: {
    dormitorios: number;
    cantidad: number;
  }[];
  rango_precios: {
    min: number;
    max: number;
    mediana: number;
  };
}

export interface TCBinance {
  precio_venta: number;
  precio_compra: number;
  fecha: string;
  variacion_24h?: number;
}

export interface LensSnapshot {
  nuevos_24h: number;
  bajadas_precio: number;
  retirados: number;
  tc_paralelo: number;
  tc_variacion: number;
  impacto_real: number;
  precio_real_m2: number;
}

export interface Lead {
  id?: string;
  nombre: string;
  email: string;
  whatsapp: string;
  presupuesto?: number;
  dormitorios?: number;
  created_at?: string;
}

export interface AnalisisContexto {
  presupuesto_max: number;
  zona: string;
  dormitorios: number;
  area_minima?: number;
  innegociables?: string[];
}

export interface ReportData {
  perfil_fiduciario: string;
  presupuesto: number;
  prioridades: string[];
  sensibilidad_precio: 'alta' | 'media' | 'baja';
  compatibilidad_mercado: number;
  propiedades_en_rango: number;
  top_propiedades: PropertyMatch[];
  distribucion_precios: {
    rango: string;
    cantidad: number;
    es_match: boolean;
  }[];
}
