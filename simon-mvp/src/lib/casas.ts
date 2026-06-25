/**
 * Tipos, mappers y filtros para el feed de casas en venta — Zona Norte.
 * Fuente: vista v_mercado_casas (read-only, ~291 filas, todas Zona Norte).
 *
 * Aislado del feed de deptos. No modifica ni importa UnidadVenta.
 */

// ===== Interfaces =====

export interface UnidadCasa {
  id: number
  titulo: string                  // condominio_nombre || 'Casa'
  condominioNombre: string | null
  zona: string
  microzona: string | null
  dormitorios: number | null
  banos: number | null
  precio_usd: number
  precio_norm: number             // ya normalizado por la vista
  precio_m2: number               // precio_norm / area_total_m2
  area_total_m2: number | null    // área construida
  area_terreno_m2: number | null
  frente_m: number | null
  fondo_m: number | null
  estacionamientos: number | null
  enCondominio: boolean           // id_condominio_master IS NOT NULL
  amenidades: string[]            // casa + condominio, dedup, lowercase-normalizado
  descripcion: string | null
  fotos_urls: string[]
  fotos_count: number
  latitud: number | null
  longitud: number | null
  agente_nombre: string | null
  agente_telefono: string | null
  oficina_nombre: string | null
  fuente: string
  codigo_propiedad: string | null
  dias_en_mercado: number | null
  tipo_cambio_detectado: string | null
  fecha_publicacion: string | null
  url: string
}

export interface FiltrosCasa {
  microzonas: string[]            // vacío = todas las ZN
  precioMin: number
  precioMax: number
  dormitorios: number[]           // vacío = todos; 5 incluye 5+
  condominio: 'todos' | 'cerrado' | 'individual'
  amenidades: string[]            // subset de ['piscina','jardin','churrasquera']
  terrenoMin: number              // 0 = sin filtro mínimo
  terrenoMax: number              // 0 = sin filtro máximo
  orden: 'recientes' | 'precio_asc' | 'precio_desc' | 'terreno_desc'
}

// ===== Mapper =====

/**
 * Mapea una fila cruda de v_mercado_casas a UnidadCasa.
 *
 * La vista expone columnas directas (precio_usd, precio_norm, precio_m2,
 * area_total_m2, area_terreno_m2, etc.) y JSONB en datos_json_enrichment
 * (fotos_urls, agente_nombre/telefono, descripcion, amenidades) más
 * condominio_amenidades (jsonb array de la tabla condominios_master).
 */
export function mapCasaRow(row: any): UnidadCasa {
  const dj = row.datos_json_enrichment ?? {}
  const llm = dj.llm_output ?? {}

  // Helper: primer array no vacío (las casas de hoy guardan en dj directo; cuando
  // el cron pueble llm_output, este preferirá el array poblado en vez de uno vacío).
  const firstArr = (...cands: any[]): any[] => {
    for (const c of cands) if (Array.isArray(c) && c.length) return c
    return []
  }
  // Helper: primer string no vacío.
  const firstStr = (...cands: any[]): string | null => {
    for (const c of cands) if (c != null && String(c).trim() !== '') return String(c)
    return null
  }

  // Fotos — preferir el array poblado (llm_output o dj directo)
  const fotos_urls = firstArr(llm.fotos_urls, dj.fotos_urls).filter(Boolean)

  // Amenidades casa (del array poblado: llm_output o dj directo)
  const amenidadesCasa: string[] = firstArr(llm.amenidades, dj.amenidades)

  // Amenidades heredadas del condominio (columna directa de la vista)
  const amenidadesCondominio: string[] = Array.isArray(row.condominio_amenidades)
    ? row.condominio_amenidades
    : []

  // Dedup case-insensitive
  const amenidadesSet = new Set<string>()
  const amenidades: string[] = []
  for (const a of [...amenidadesCasa, ...amenidadesCondominio]) {
    const key = String(a).toLowerCase().trim()
    if (key && !amenidadesSet.has(key)) {
      amenidadesSet.add(key)
      amenidades.push(String(a).trim())
    }
  }

  const precioUsd = parseFloat(String(row.precio_usd)) || 0
  const precioNorm = parseFloat(String(row.precio_norm ?? row.precio_usd)) || 0
  const areaTotalM2 = row.area_total_m2 ? parseFloat(String(row.area_total_m2)) : null
  // precio_m2 canónico de la vista (= precio_normalizado()/area); recalcular solo si falta
  const precioM2 = parseFloat(String(row.precio_m2))
    || (areaTotalM2 && areaTotalM2 > 0 ? Math.round(precioNorm / areaTotalM2) : 0)

  return {
    id: Number(row.id),
    titulo: row.condominio_nombre || 'Casa',
    condominioNombre: row.condominio_nombre ?? null,
    zona: row.zona || 'Sin zona',
    microzona: row.microzona ?? null,
    dormitorios: row.dormitorios != null ? Number(row.dormitorios) : null,
    banos: row.banos != null ? parseFloat(String(row.banos)) : null,
    precio_usd: precioUsd,
    precio_norm: precioNorm,
    precio_m2: precioM2,
    area_total_m2: areaTotalM2,
    area_terreno_m2: row.area_terreno_m2 ? parseFloat(String(row.area_terreno_m2)) : null,
    frente_m: row.frente_m ? parseFloat(String(row.frente_m)) : null,
    fondo_m: row.fondo_m ? parseFloat(String(row.fondo_m)) : null,
    estacionamientos: row.estacionamientos != null ? Number(row.estacionamientos) : null,
    enCondominio: row.id_condominio_master != null,
    amenidades,
    descripcion: firstStr(llm.descripcion, dj.descripcion, row.descripcion),
    fotos_urls,
    fotos_count: fotos_urls.length,
    latitud: row.latitud ? parseFloat(String(row.latitud)) : null,
    longitud: row.longitud ? parseFloat(String(row.longitud)) : null,
    agente_nombre: firstStr(llm.agente_nombre, dj.agente_nombre),
    agente_telefono: firstStr(llm.agente_telefono, dj.agente_telefono),
    oficina_nombre: firstStr(llm.oficina_nombre, dj.oficina_nombre),
    fuente: row.fuente || '',
    codigo_propiedad: row.codigo_propiedad ?? null,
    dias_en_mercado: row.dias_en_mercado != null ? Number(row.dias_en_mercado) : null,
    tipo_cambio_detectado: row.tipo_cambio_detectado ?? null,
    fecha_publicacion: row.fecha_publicacion ?? null,
    url: row.url || '',
  }
}

// ===== Filtrado =====

/**
 * Normaliza un string para matching de amenidades:
 * lowercase, sin tildes, trim.
 */
function normalizeAmenidad(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Filtra la lista de casas según los filtros activos (100% client-side).
 *
 * Amenidades: matchea si CUALQUIERA de las pedidas aparece en las de la casa
 * (comparación normalizada, sin tildes).
 * Terreno: si hay filtro activo (>0) y la casa no tiene terreno, se oculta.
 * Dormitorios: 5 incluye 5, 6, 7, … (5+).
 */
export function filtrarCasas(casas: UnidadCasa[], f: FiltrosCasa): UnidadCasa[] {
  const hasMicrozonas = f.microzonas.length > 0
  const hasDorms = f.dormitorios.length > 0
  const hasAmenidades = f.amenidades.length > 0
  const hasTerrenoMin = f.terrenoMin > 0
  const hasTerrenoMax = f.terrenoMax > 0
  const terrenoFiltroActivo = hasTerrenoMin || hasTerrenoMax

  // Normalizar los pedidos una vez
  const amenidadesPedidas = f.amenidades.map(normalizeAmenidad)

  return casas.filter(c => {
    // Microzonas
    if (hasMicrozonas && !f.microzonas.includes(c.zona)) return false

    // Precio
    if (c.precio_norm < f.precioMin) return false
    if (f.precioMax > 0 && c.precio_norm > f.precioMax) return false

    // Dormitorios
    if (hasDorms) {
      const d = c.dormitorios
      if (d === null) return false
      const match = f.dormitorios.some(fd => {
        if (fd === 5) return d >= 5
        return d === fd
      })
      if (!match) return false
    }

    // Condominio
    if (f.condominio === 'cerrado' && !c.enCondominio) return false
    if (f.condominio === 'individual' && c.enCondominio) return false

    // Amenidades
    if (hasAmenidades) {
      const casaAmenidadesNorm = c.amenidades.map(normalizeAmenidad)
      const tieneAlguna = amenidadesPedidas.some(ap =>
        casaAmenidadesNorm.some(ca => ca.includes(ap) || ap.includes(ca))
      )
      if (!tieneAlguna) return false
    }

    // Terreno
    if (terrenoFiltroActivo) {
      const t = c.area_terreno_m2
      if (t === null) return false
      if (hasTerrenoMin && t < f.terrenoMin) return false
      if (hasTerrenoMax && t > f.terrenoMax) return false
    }

    return true
  })
}

// ===== Ordenamiento =====

export function ordenarCasas(casas: UnidadCasa[], orden: FiltrosCasa['orden']): UnidadCasa[] {
  const arr = [...casas]
  switch (orden) {
    case 'precio_asc':
      return arr.sort((a, b) => a.precio_norm - b.precio_norm)
    case 'precio_desc':
      return arr.sort((a, b) => b.precio_norm - a.precio_norm)
    case 'terreno_desc':
      return arr.sort((a, b) => (b.area_terreno_m2 ?? 0) - (a.area_terreno_m2 ?? 0))
    case 'recientes':
    default:
      // Recientes: dias_en_mercado asc (menor = más reciente), null al final
      return arr.sort((a, b) => {
        const da = a.dias_en_mercado ?? 99999
        const db = b.dias_en_mercado ?? 99999
        return da - db
      })
  }
}
