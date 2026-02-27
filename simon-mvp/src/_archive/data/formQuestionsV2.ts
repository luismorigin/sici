// =====================================================
// FORMULARIO MVP v2 - Arquitectura 2 Niveles
// Nivel 1: 8 campos (~2 min) - Quick Search
// Nivel 2: +10 campos (~3 min) - Contexto Fiduciario
// =====================================================

export type QuestionType =
  | 'single'
  | 'multiple'
  | 'number'
  | 'text'
  | 'chips'

export interface QuestionOption {
  id: string
  label: string
  icon?: string
}

export interface Question {
  id: string
  level: 1 | 2  // NEW: nivel del formulario
  section: string
  sectionName: string
  question: string
  subtitle?: string
  type: QuestionType
  options?: QuestionOption[]
  placeholder?: string
  min?: number
  max?: number
  unit?: string
  required?: boolean
  chips?: string[]
  sqlField?: string  // Campo que afecta en SQL
}

// Secciones simplificadas
export const sectionsV2 = [
  { id: 'N1', name: 'Busqueda Rapida', emoji: '🔍', level: 1, questions: 8 },
  { id: 'N2', name: 'Contexto Personal', emoji: '👤', level: 2, questions: 11 },  // +1 por hijos
]

// =====================================================
// NIVEL 1 - BUSQUEDA RAPIDA (8 campos)
// Output: Lista de propiedades SIN razon fiduciaria
// =====================================================

export const level1Questions: Question[] = [
  // 1.1 NOMBRE (primero para capturar lead)
  {
    id: 'L1_nombre',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: '¿Como te llamas?',
    subtitle: 'Para personalizar tu experiencia',
    type: 'text',
    placeholder: 'Tu nombre',
    required: true,
  },

  // 1.2 WHATSAPP (segundo para capturar lead)
  {
    id: 'L1_whatsapp',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: '¿Tu WhatsApp?',
    subtitle: 'Solo para contactarte si lo solicitas',
    type: 'text',
    placeholder: '70000000',
    required: true,
  },

  // 1.3 PRESUPUESTO
  {
    id: 'L1_presupuesto',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: '¿Cual es tu presupuesto MAXIMO?',
    subtitle: 'Te mostraremos opciones hasta este monto',
    type: 'number',
    placeholder: '150000',
    unit: 'USD',
    min: 50000,
    max: 500000,
    required: true,
    sqlField: 'precio_max'
  },

  // 1.4 ZONA (microzonas de Equipetrol)
  {
    id: 'L1_zona',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: '¿Donde queres vivir?',
    subtitle: 'Elegi las zonas que te interesan',
    type: 'multiple',
    required: true,
    sqlField: 'zona',
    options: [
      { id: 'equipetrol', label: 'Equipetrol (centro historico)', icon: '🔵' },
      { id: 'sirari', label: 'Sirari (premium tranquila)', icon: '🟠' },
      { id: 'equipetrol_norte_norte', label: 'Equipetrol Norte (financiero)', icon: '🔴' },
      { id: 'equipetrol_norte_sur', label: 'Equipetrol Norte/Sur (transicion)', icon: '🟡' },
      { id: 'villa_brigida', label: 'Villa Brigida (emergente)', icon: '🟢' },
      { id: 'faremafu', label: 'Equipetrol Oeste - Busch (universitario)', icon: '🟣' },
    ]
  },

  // 1.5 DORMITORIOS
  {
    id: 'L1_dormitorios',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: '¿Cuantos dormitorios minimo?',
    type: 'single',
    required: true,
    sqlField: 'dormitorios',
    options: [
      { id: '1', label: '1', icon: '1️⃣' },
      { id: '2', label: '2', icon: '2️⃣' },
      { id: '3', label: '3', icon: '3️⃣' },
      { id: '4', label: '4+', icon: '4️⃣' },
    ]
  },

  // 1.6 AREA MINIMA
  {
    id: 'L1_area',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: '¿Tamano minimo?',
    type: 'single',
    required: true,
    sqlField: 'area_min',
    options: [
      { id: '0', label: 'No importa', icon: '🤷' },
      { id: '50', label: 'Al menos 50 m2', icon: '📐' },
      { id: '70', label: 'Al menos 70 m2', icon: '📐' },
      { id: '90', label: 'Al menos 90 m2', icon: '📐' },
      { id: '120', label: 'Al menos 120 m2', icon: '📐' },
    ]
  },

  // 1.7 INNEGOCIABLES
  {
    id: 'L1_innegociables',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: 'Sin esto, NO me interesa',
    subtitle: 'Maximo 3',
    type: 'multiple',
    required: true,
    options: [
      { id: 'pet_friendly', label: 'Pet friendly', icon: '🐕' },
      { id: 'estacionamiento', label: 'Estacionamiento', icon: '🚗' },
      { id: 'seguridad', label: 'Seguridad 24/7', icon: '🔒' },
      { id: 'ascensor', label: 'Ascensor', icon: '🛗' },
      { id: 'balcon', label: 'Balcon o terraza', icon: '🌅' },
      { id: 'ninguno', label: 'Ninguno es innegociable', icon: '✓' },
    ]
  },

  // 1.8 FINANCIACION
  {
    id: 'L1_financiacion',
    level: 1,
    section: 'N1',
    sectionName: 'Busqueda Rapida',
    question: '¿Como financias la compra?',
    type: 'single',
    required: true,
    options: [
      { id: 'efectivo', label: 'Efectivo / ahorro', icon: '💰' },
      { id: 'credito', label: 'Credito hipotecario', icon: '🏦' },
      { id: 'venta', label: 'Venta de otra propiedad', icon: '🏠' },
      { id: 'combinacion', label: 'Combinacion', icon: '🔄' },
    ]
  },
]

// =====================================================
// NIVEL 2 - CONTEXTO FIDUCIARIO (+10 campos)
// Output: Lista + RAZON FIDUCIARIA personalizada
// =====================================================

export const level2Questions: Question[] = [
  // 2.1 COMPOSICION HOGAR
  {
    id: 'L2_composicion',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Quienes van a vivir?',
    type: 'single',
    required: true,
    options: [
      { id: 'solo', label: 'Solo yo', icon: '👤' },
      { id: 'pareja', label: 'Pareja sin hijos', icon: '👫' },
      { id: 'familia_chica', label: 'Pareja + 1-2 hijos', icon: '👨‍👩‍👧' },
      { id: 'familia_grande', label: 'Familia grande (3+ hijos)', icon: '👨‍👩‍👧‍👦' },
      { id: 'extendida', label: 'Familia extendida', icon: '🏠' },
    ]
  },

  // 2.2 CANTIDAD DE HIJOS (importante para dimensionar espacio)
  {
    id: 'L2_hijos',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Cuantos hijos?',
    subtitle: 'Para dimensionar el espacio necesario',
    type: 'single',
    required: false,  // Solo aplica si tiene hijos
    options: [
      { id: '0', label: 'No tengo hijos', icon: '🚫' },
      { id: '1', label: '1 hijo', icon: '1️⃣' },
      { id: '2', label: '2 hijos', icon: '2️⃣' },
      { id: '3', label: '3 hijos', icon: '3️⃣' },
      { id: '4+', label: '4 o mas', icon: '4️⃣' },
    ]
  },

  // 2.3 MASCOTAS
  {
    id: 'L2_mascotas',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Tenes mascotas?',
    type: 'single',
    required: true,
    options: [
      { id: 'no', label: 'No', icon: '🚫' },
      { id: 'perro_chico', label: 'Perro chico', icon: '🐕' },
      { id: 'perro_grande', label: 'Perro mediano/grande', icon: '🦮' },
      { id: 'gato', label: 'Gato', icon: '🐈' },
      { id: 'otro', label: 'Otra mascota', icon: '🐾' },
    ]
  },

  // 2.3 TIEMPO BUSCANDO
  {
    id: 'L2_tiempo_buscando',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Hace cuanto buscas?',
    type: 'single',
    required: true,
    options: [
      { id: 'recien', label: 'Recien empiezo (< 1 mes)', icon: '🌱' },
      { id: '1-6', label: 'Algunos meses (1-6)', icon: '📅' },
      { id: '6-12', label: 'Bastante tiempo (6-12 meses)', icon: '⏳' },
      { id: 'mas_1', label: 'Mas de un año', icon: '📆' },
    ]
  },

  // 2.4 ESTADO EMOCIONAL
  {
    id: 'L2_estado',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Como te sentis con la busqueda?',
    type: 'single',
    required: true,
    options: [
      { id: 'activo', label: 'Activo, con energia', icon: '⚡' },
      { id: 'cansado', label: 'Cansado pero sigo', icon: '😔' },
      { id: 'frustrado', label: 'Frustrado', icon: '😤' },
      { id: 'presionado', label: 'Presionado', icon: '😰' },
    ]
  },

  // 2.5 HORIZONTE
  {
    id: 'L2_horizonte',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Cuanto tiempo pensas vivir ahi?',
    type: 'single',
    required: true,
    options: [
      { id: '1-3', label: '1-3 años (paso intermedio)', icon: '📅' },
      { id: '3-7', label: '3-7 años (mediano plazo)', icon: '📆' },
      { id: '7+', label: '7+ años (largo plazo)', icon: '🏡' },
    ]
  },

  // 2.6 TRADE-OFF: UBICACION VS METROS
  {
    id: 'L2_tradeoff_ubicacion',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: 'Si tuvieras que elegir:',
    type: 'single',
    required: true,
    options: [
      { id: 'ubicacion', label: 'Mejor ubicacion, menos metros', icon: '📍' },
      { id: 'metros', label: 'Mas metros, peor ubicacion', icon: '📐' },
    ]
  },

  // 2.7 TRADE-OFF: EXPENSAS
  {
    id: 'L2_tradeoff_expensas',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: 'Si tuvieras que elegir:',
    type: 'single',
    required: true,
    options: [
      { id: 'perfecto_caro', label: 'Depto perfecto, expensas altas ($300+)', icon: '💎' },
      { id: 'bueno_barato', label: 'Depto bueno, expensas bajas ($150)', icon: '💰' },
    ]
  },

  // 2.8 QUIEN DECIDE
  {
    id: 'L2_decision',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Quien mas decide?',
    type: 'single',
    required: true,
    options: [
      { id: 'solo', label: 'Solo yo', icon: '👤' },
      { id: 'pareja_si', label: 'Mi pareja (alineados)', icon: '💑' },
      { id: 'pareja_mas_o_menos', label: 'Mi pareja (mas o menos)', icon: '🤔' },
      { id: 'familia', label: 'Familia opina fuerte', icon: '👨‍👩‍👧' },
    ]
  },

  // 2.9 PRESION EXTERNA
  {
    id: 'L2_presion',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Sentis presion para cerrar rapido?',
    type: 'single',
    required: true,
    options: [
      { id: 'no', label: 'No, a mi ritmo', icon: '😌' },
      { id: 'poco', label: 'Un poco', icon: '🤷' },
      { id: 'bastante', label: 'Bastante / Mucha', icon: '😰' },
    ]
  },

  // 2.10 CONFIRMAR INNEGOCIABLES
  {
    id: 'L2_confirmar',
    level: 2,
    section: 'N2',
    sectionName: 'Contexto Personal',
    question: '¿Confirmas tus innegociables?',
    subtitle: 'Los que elegiste en el paso anterior',
    type: 'single',
    required: true,
    options: [
      { id: 'confirmo', label: 'Si, los confirmo', icon: '✅' },
      { id: 'cambiar', label: 'Quiero cambiar algo', icon: '✏️' },
    ]
  },
]

// Todas las preguntas combinadas
export const allQuestions = [...level1Questions, ...level2Questions]

// Helpers
export const getLevel1Questions = () => level1Questions
export const getLevel2Questions = () => level2Questions
export const getTotalLevel1 = () => level1Questions.length  // 8
export const getTotalLevel2 = () => level2Questions.length  // 10
export const getTotalQuestions = () => allQuestions.length  // 18

// Extraer filtros MBF de respuestas nivel 1
export function extractMBFFilters(answers: Record<string, any>) {
  return {
    precio_max: answers.L1_presupuesto || 200000,
    dormitorios: parseInt(answers.L1_dormitorios) || 2,
    area_min: parseInt(answers.L1_area) || 0,
    zona: answers.L1_zona?.[0] || null,  // Primera zona seleccionada
    zonas_permitidas: answers.L1_zona || [],
    solo_con_fotos: true,
    limite: 5
  }
}

// Extraer contexto fiduciario de respuestas nivel 2
export function extractFiduciaryContext(answers: Record<string, any>) {
  return {
    composicion: answers.L2_composicion || null,
    hijos: mapHijos(answers.L2_hijos),
    mascota: answers.L2_mascotas || 'no',
    meses_buscando: mapTiempoBuscando(answers.L2_tiempo_buscando),
    estado_emocional: answers.L2_estado || 'activo',
    horizonte: answers.L2_horizonte || '3-7',
    prioriza: answers.L2_tradeoff_ubicacion || 'ubicacion',
    sensible_expensas: answers.L2_tradeoff_expensas === 'bueno_barato',
    decision_compartida: answers.L2_decision !== 'solo',
    alineacion_pareja: answers.L2_decision,
    presion_externa: answers.L2_presion || 'no',
    innegociables: answers.L1_innegociables || [],
    deseables: answers.L1_deseables || [],
  }
}

function mapHijos(value: string): number {
  switch (value) {
    case '0': return 0
    case '1': return 1
    case '2': return 2
    case '3': return 3
    case '4+': return 4
    default: return 0
  }
}

function mapTiempoBuscando(value: string): number {
  switch (value) {
    case 'recien': return 0
    case '1-6': return 3
    case '6-12': return 9
    case 'mas_1': return 15
    default: return 0
  }
}
