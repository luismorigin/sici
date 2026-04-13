// --- Input types ---

export interface ToolParams {
  id_proyecto_master: number
  zona: string
  filters?: {
    dormitorios?: number[]
  }
}

export interface InventoryUnit {
  piso: number
  dpto: string
  m2: number
  dorms: number
  precioUsd: number
}

export interface ClientConfig {
  projectName: string
  projectSubtitle?: string
  developerName: string
  zona: string
  id_proyecto_master: number
  inventory: InventoryUnit[]
  precioM2Billete: number
  tcDetectado: 'paralelo' | 'oficial' | 'no_especificado'
  fecha: string
  fechaCorte?: string // "13 de abril de 2026"
  colors?: Partial<DesignTokens>
  precioEscenarios?: number[] // $/m2 scenarios for simulation
  tcEscenarios?: number[]     // TC scenarios for simulation
}

export interface DesignTokens {
  marfil: string
  ebano: string
  caramelo: string
  carameloDark: string
  arena: string
  piedra: string
}

// --- Tool outputs ---

export interface ZonaStat {
  zona: string
  uds: number
  medianaM2: number
  medianaTicket: number
  avgArea: number
  medianaDias: number
}

export interface DormStat {
  dorms: number
  uds: number
  medianaM2: number
  medianaTicket: number
}

export interface PanoramaMercadoResult {
  totalUnidades: number
  medianaM2Global: number
  medianaTicketGlobal: number
  tcParalelo: number
  tcOficial: number
  byZona: ZonaStat[]
  byDorms: DormStat[]
}

export type MarketCategory =
  | 'oportunidad'
  | 'bajo_promedio'
  | 'promedio'
  | 'sobre_promedio'
  | 'premium'

export interface TypologyPosition {
  dorms: number
  proyectoM2: number
  medianaZonaM2: number
  diffPct: number
  categoria: MarketCategory
  unidadesEnZona: number
}

export interface PosicionCompetitivaResult {
  categoriaGlobal: MarketCategory
  diffPctGlobal: number
  percentilEnZona: number
  proyectoM2: number
  medianaZonaM2: number
  byTypology: TypologyPosition[]
}

export interface CompetidorInfo {
  proyecto: string
  uds: number
  medianaM2: number
  medianaDias: number
  signal: 'NUEVO' | 'ACTIVO' | 'PROLONGADO' | 'ESTANCADO'
}

export interface CompetidoresResult {
  zona: string
  totalProyectos: number
  totalUnidades: number
  top: CompetidorInfo[]
}

export type ScarcityLevel = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'

export interface DemandaTipologiaItem {
  dorms: number
  uds: number
  pctOfTotal: number
  nivel: ScarcityLevel
}

export interface DemandaTipologiaResult {
  zona: string
  totalZona: number
  byDorms: DemandaTipologiaItem[]
}

export interface SimulacionEscenario {
  precioM2: number
  tc: number
  byUnit: Array<{
    dpto: string
    dorms: number
    m2: number
    ticketUsd: number
    ticketNorm: number
    diffVsMediana: number
    categoria: MarketCategory
  }>
  promedioTicket: number
  promedioDiff: number
}

export interface SimulacionPrecioResult {
  escenarios: SimulacionEscenario[]
  medianasReferencia: Record<number, number> // dorms -> mediana ticket zona
}

export interface ListingVisible {
  id: number
  fuente: string
  dorms: number
  areaM2: number
  precioNorm: number
  precioM2: number
  diasEnMercado: number
  url: string | null
  esMultiproyecto: boolean
  broker: string | null
}

export interface VisibilidadPortalesResult {
  totalInventario: number
  visiblesEnPortal: number
  invisibles: number
  gapPct: number
  detalle: ListingVisible[]
  inventarioPorDorms: Record<number, number>
  visiblesPorDorms: Record<number, number>
}

export interface YieldTipologia {
  dorms: number
  rentaAmobladoUsd: number | null
  rentaNoAmobladoUsd: number | null
  premiumAmobladoPct: number | null
  nAmoblado: number
  nNoAmoblado: number
  yieldBrutoAmob: number | null
  yieldBrutoNoAmob: number | null
  anosRetornoAmob: number | null
  anosRetornoNoAmob: number | null
  medianaVentaTicket: number
}

export interface YieldInversorResult {
  zona: string
  byDorms: YieldTipologia[]
}

export interface PropRotada {
  id: number
  nombreEdificio: string | null
  dorms: number
  areaM2: number
  precioM2: number
  diasEnMercado: number
  fechaSalida: string
}

export interface RotacionObservadaResult {
  zona: string
  dias: number
  totalRotadas: number
  props: PropRotada[]
}

// --- All results combined ---

export interface EstudioCompleto {
  config: ClientConfig
  tc: { paralelo: number; oficial: number }
  panorama: PanoramaMercadoResult
  posicion: PosicionCompetitivaResult
  competidores: CompetidoresResult
  demanda: DemandaTipologiaResult
  simulacion: SimulacionPrecioResult
  visibilidad: VisibilidadPortalesResult
  yield: YieldInversorResult
  rotacion: RotacionObservadaResult
}
