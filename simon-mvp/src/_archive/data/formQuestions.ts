export type QuestionType =
  | 'single'
  | 'multiple'
  | 'number'
  | 'text'
  | 'slider'
  | 'chips'
  | 'conditional'

export interface QuestionOption {
  id: string
  label: string
  icon?: string
  subQuestion?: Question
}

export interface Question {
  id: string
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
  validation?: (value: any) => boolean
}

export const sections = [
  { id: 'A', name: 'Contexto de Vida', emoji: '👥', questions: 5 },
  { id: 'B', name: 'Historia de Busqueda', emoji: '📅', questions: 6 },  // +1 (B3 casi compraste)
  { id: 'C', name: 'Situacion Financiera', emoji: '💰', questions: 7 }, // +1 (C7 venta urgente)
  { id: 'D', name: 'Ubicacion', emoji: '📍', questions: 5 },
  { id: 'E', name: 'La Propiedad', emoji: '🏠', questions: 6 },
  { id: 'F', name: 'Horizonte', emoji: '🎯', questions: 4 },            // +1 (F4 familia crece)
  { id: 'G', name: 'Trade-offs', emoji: '⚖️', questions: 4 },
  { id: 'H', name: 'Alertas', emoji: '🚨', questions: 4 },              // +1 (H4 exito)
  { id: 'I', name: 'Validacion', emoji: '✅', questions: 2 },
]

export const questions: Question[] = [
  // === SECCION A: CONTEXTO DE VIDA ===
  {
    id: 'A1',
    section: 'A',
    sectionName: 'Contexto de Vida',
    question: '¿Quienes van a vivir en esta propiedad?',
    subtitle: 'Esto nos ayuda a entender tus necesidades de espacio',
    type: 'single',
    required: true,
    options: [
      { id: 'solo', label: 'Solo yo', icon: '👤' },
      { id: 'pareja_sin_hijos', label: 'Pareja sin hijos', icon: '👫' },
      { id: 'pareja_con_hijos', label: 'Pareja con hijos', icon: '👨‍👩‍👧' },
      { id: 'hijos_custodia', label: 'Hijos tiempo parcial / custodia compartida', icon: '👨‍👧' },
      { id: 'familia_extendida', label: 'Familia extendida', icon: '👨‍👩‍👧‍👦' },
      { id: 'roommates', label: 'Con roommates', icon: '🏠' },
    ]
  },
  {
    id: 'A1_hijos',
    section: 'A',
    sectionName: 'Contexto de Vida',
    question: '¿Cuantos hijos?',
    subtitle: 'Y sus edades aproximadas',
    type: 'chips',
    chips: ['1 hijo', '2 hijos', '3 hijos', '4+ hijos'],
    required: false,
  },
  {
    id: 'A2',
    section: 'A',
    sectionName: 'Contexto de Vida',
    question: '¿Tenes mascotas?',
    subtitle: 'Importante para filtrar edificios pet-friendly',
    type: 'single',
    required: true,
    options: [
      { id: 'no', label: 'No tengo mascotas', icon: '🚫' },
      { id: 'perro_chico', label: 'Perro chico', icon: '🐕' },
      { id: 'perro_grande', label: 'Perro mediano/grande', icon: '🦮' },
      { id: 'gato', label: 'Gato', icon: '🐈' },
      { id: 'otro', label: 'Otra mascota', icon: '🐾' },
    ]
  },
  {
    id: 'A3',
    section: 'A',
    sectionName: 'Contexto de Vida',
    question: '¿Alguien tiene necesidades especiales?',
    subtitle: 'Selecciona todas las que apliquen',
    type: 'multiple',
    required: false,
    options: [
      { id: 'movilidad', label: 'Movilidad reducida', icon: '♿' },
      { id: 'home_office', label: 'Trabajo remoto full-time', icon: '💻' },
      { id: 'horarios_nocturnos', label: 'Horarios nocturnos', icon: '🌙' },
      { id: 'adulto_mayor', label: 'Adulto mayor', icon: '👴' },
      { id: 'ninguna', label: 'Ninguna aplica', icon: '✓' },
    ]
  },
  {
    id: 'A4',
    section: 'A',
    sectionName: 'Contexto de Vida',
    question: '¿Donde queda tu trabajo?',
    subtitle: 'Zona o direccion aproximada',
    type: 'text',
    placeholder: 'Ej: Equipetrol, Centro, Remoto...',
    required: false,
  },

  // === SECCION B: HISTORIA DE BUSQUEDA ===
  {
    id: 'B1',
    section: 'B',
    sectionName: 'Historia de Busqueda',
    question: '¿Hace cuanto estas buscando?',
    subtitle: 'Se honesto, nos ayuda a entender tu situacion',
    type: 'single',
    required: true,
    options: [
      { id: 'recien', label: 'Recien empiezo', icon: '🌱' },
      { id: '1-6_meses', label: '1-6 meses', icon: '📅' },
      { id: '6-12_meses', label: '6-12 meses', icon: '⏳' },
      { id: 'mas_1_ano', label: 'Mas de 1 año', icon: '📆' },
      { id: 'mas_2_anos', label: 'Mas de 2 años', icon: '🗓️' },
    ]
  },
  {
    id: 'B2',
    section: 'B',
    sectionName: 'Historia de Busqueda',
    question: '¿Cuantas propiedades viste?',
    subtitle: 'Aproximadamente',
    type: 'single',
    required: true,
    options: [
      { id: 'menos_5', label: 'Menos de 5', icon: '1️⃣' },
      { id: '5-15', label: 'Entre 5 y 15', icon: '🔢' },
      { id: '15-30', label: 'Entre 15 y 30', icon: '📊' },
      { id: 'mas_30', label: 'Mas de 30', icon: '📈' },
    ]
  },
  {
    id: 'B3',
    section: 'B',
    sectionName: 'Historia de Busqueda',
    question: '¿Hubo alguna propiedad que casi compras?',
    subtitle: 'Si la hubo, ¿por que no la compraste? (opcional)',
    type: 'text',
    placeholder: 'Ej: Casi compro una en Sirari pero el precio subio...',
    required: false,
  },
  {
    id: 'B4',
    section: 'B',
    sectionName: 'Historia de Busqueda',
    question: '¿Como te sentis con la busqueda?',
    subtitle: 'Tu estado emocional es importante',
    type: 'single',
    required: true,
    options: [
      { id: 'energizado', label: 'Energizado, recien arranco', icon: '⚡' },
      { id: 'activo', label: 'Activo, con esperanza', icon: '😊' },
      { id: 'cansado', label: 'Cansado pero sigo', icon: '😔' },
      { id: 'frustrado', label: 'Frustrado', icon: '😤' },
      { id: 'presionado', label: 'Presionado', icon: '😰' },
    ]
  },
  {
    id: 'B5',
    section: 'B',
    sectionName: 'Historia de Busqueda',
    question: '¿Hay fecha limite real?',
    subtitle: 'Vence alquiler, nacimiento, etc.',
    type: 'single',
    required: true,
    options: [
      { id: 'no', label: 'No, sin urgencia', icon: '😌' },
      { id: 'flexible', label: 'Mas o menos, flexible', icon: '🤷' },
      { id: 'si_meses', label: 'Si, en algunos meses', icon: '📅' },
      { id: 'si_urgente', label: 'Si, muy pronto', icon: '🚨' },
    ]
  },
  {
    id: 'B6',
    section: 'B',
    sectionName: 'Historia de Busqueda',
    question: '¿Que aprendiste de lo que viste?',
    subtitle: 'Esto nos ayuda a no repetir errores',
    type: 'text',
    placeholder: 'Ej: Necesito mas silencio del que pensaba...',
    required: false,
  },

  // === SECCION C: SITUACION FINANCIERA ===
  {
    id: 'C1',
    section: 'C',
    sectionName: 'Situacion Financiera',
    question: '¿Cual es tu presupuesto maximo?',
    subtitle: 'El techo real, aunque te estires',
    type: 'number',
    placeholder: '150000',
    unit: 'USD',
    min: 50000,
    max: 500000,
    required: true,
  },
  {
    id: 'C2',
    section: 'C',
    sectionName: 'Situacion Financiera',
    question: '¿De donde sale el dinero?',
    subtitle: 'Selecciona todas las que apliquen',
    type: 'multiple',
    required: true,
    options: [
      { id: 'ahorro', label: 'Ahorro propio (disponible, sin contar emergencia)', icon: '💰' },
      { id: 'venta_propiedad', label: 'Venta de otra propiedad', icon: '🏠' },
      { id: 'credito', label: 'Credito hipotecario', icon: '🏦' },
      { id: 'prestamo_familiar', label: 'Prestamo familiar', icon: '👨‍👩‍👧' },
    ]
  },
  {
    id: 'C3',
    section: 'C',
    sectionName: 'Situacion Financiera',
    question: '¿Cuanto pagas hoy de vivienda?',
    subtitle: 'Alquiler + expensas actuales',
    type: 'single',
    required: true,
    options: [
      { id: '0', label: 'No pago / vivo con familia', icon: '🏠' },
      { id: '300', label: 'Menos de $300/mes', icon: '💵' },
      { id: '500', label: '$300 - $500/mes', icon: '💵' },
      { id: '800', label: '$500 - $800/mes', icon: '💰' },
      { id: '1200', label: '$800 - $1200/mes', icon: '💰' },
      { id: '1500', label: 'Mas de $1200/mes', icon: '💎' },
    ]
  },
  {
    id: 'C4',
    section: 'C',
    sectionName: 'Situacion Financiera',
    question: '¿Cuanto MAXIMO podrias pagar por mes?',
    subtitle: 'Cuota + expensas, sin estresarte',
    type: 'number',
    placeholder: '1000',
    unit: 'USD/mes',
    min: 0,
    max: 5000,
    required: true,
  },
  {
    id: 'C5',
    section: 'C',
    sectionName: 'Situacion Financiera',
    question: '¿Maximo de expensas que toleras?',
    subtitle: 'Edificios premium tienen expensas altas',
    type: 'number',
    placeholder: '200',
    unit: 'USD/mes',
    min: 0,
    max: 1000,
    required: true,
  },
  {
    id: 'C6',
    section: 'C',
    sectionName: 'Situacion Financiera',
    question: '¿Tenes reserva para imprevistos?',
    subtitle: 'Ideal: 6+ meses de gastos',
    type: 'single',
    required: true,
    options: [
      { id: 'holgada', label: 'Si, mas de 6 meses', icon: '💪' },
      { id: 'justa', label: 'Justa (3-6 meses)', icon: '👌' },
      { id: 'poca', label: 'Poca (1-3 meses)', icon: '😬' },
      { id: 'no', label: 'No tengo', icon: '😰' },
    ]
  },
  {
    id: 'C7',
    section: 'C',
    sectionName: 'Situacion Financiera',
    question: 'Si en 2 años necesitas vender urgente, ¿que impacto tendria?',
    subtitle: 'Escenario hipotetico para evaluar tu flexibilidad',
    type: 'single',
    required: true,
    options: [
      { id: 'ninguno', label: 'Ninguno, tengo espalda', icon: '💪' },
      { id: 'incomodo', label: 'Incomodo pero manejable', icon: '😐' },
      { id: 'problema', label: 'Problema serio', icon: '😰' },
      { id: 'desastre', label: 'Desastre financiero', icon: '💥' },
    ]
  },

  // === SECCION D: UBICACION ===
  // Microzonas de Equipetrol (fuente: geodata/microzonas_equipetrol_v4.geojson)
  {
    id: 'D1',
    section: 'D',
    sectionName: 'Ubicacion',
    question: '¿Que microzonas de Equipetrol te interesan?',
    subtitle: 'Mira el mapa arriba para ubicarte. Selecciona todas las que consideras.',
    type: 'multiple',
    required: true,
    options: [
      { id: 'flexible', label: 'Flexible / me adapto a cualquier microzona', icon: '✨' },
      { id: 'equipetrol', label: 'Equipetrol (consolidado)', icon: '🔵' },
      { id: 'sirari', label: 'Sirari (premium tranquila)', icon: '🟠' },
      { id: 'equipetrol_norte_norte', label: 'Equipetrol Norte/Norte (premium)', icon: '🔴' },
      { id: 'equipetrol_norte_sur', label: 'Equipetrol Norte/Sur (premium tranquila)', icon: '🟡' },
      { id: 'villa_brigida', label: 'Villa Brigida (emergente)', icon: '🟢' },
      { id: 'faremafu', label: 'Faremafu (buffer)', icon: '🟣' },
    ]
  },
  {
    id: 'D2',
    section: 'D',
    sectionName: 'Ubicacion',
    question: '¿Hay microzonas que RECHAZAS?',
    subtitle: 'Donde definitivamente NO buscarias',
    type: 'multiple',
    required: false,
    options: [
      { id: 'ninguna', label: 'Ninguna en particular', icon: '✓' },
      { id: 'equipetrol', label: 'Equipetrol', icon: '🚫' },
      { id: 'sirari', label: 'Sirari', icon: '🚫' },
      { id: 'equipetrol_norte_norte', label: 'Equipetrol Norte/Norte', icon: '🚫' },
      { id: 'equipetrol_norte_sur', label: 'Equipetrol Norte/Sur', icon: '🚫' },
      { id: 'villa_brigida', label: 'Villa Brigida', icon: '🚫' },
      { id: 'faremafu', label: 'Faremafu', icon: '🚫' },
    ]
  },
  {
    id: 'D3',
    section: 'D',
    sectionName: 'Ubicacion',
    question: 'Cercania al trabajo, ¿que tan importante?',
    subtitle: 'Considera tu rutina diaria',
    type: 'single',
    required: true,
    options: [
      { id: 'critico', label: 'Critico (max 15 min)', icon: '🔴' },
      { id: 'importante', label: 'Importante (max 30 min)', icon: '🟡' },
      { id: 'flexible', label: 'Flexible (hasta 45 min)', icon: '🟢' },
      { id: 'no_aplica', label: 'No aplica (remoto)', icon: '🏠' },
    ]
  },
  {
    id: 'D4',
    section: 'D',
    sectionName: 'Ubicacion',
    question: '¿Cuantos estacionamientos necesitas?',
    type: 'single',
    required: true,
    options: [
      { id: '0', label: 'Ninguno', icon: '0️⃣' },
      { id: '1', label: 'Uno', icon: '1️⃣' },
      { id: '2', label: 'Dos', icon: '2️⃣' },
      { id: 'mas', label: 'Mas de 2', icon: '➕' },
    ]
  },
  {
    id: 'D5',
    section: 'D',
    sectionName: 'Ubicacion',
    question: '¿Que tanto te afecta el trafico?',
    type: 'single',
    required: true,
    options: [
      { id: 'mucho', label: 'Mucho, lo evito', icon: '😤' },
      { id: 'bastante', label: 'Bastante', icon: '😕' },
      { id: 'normal', label: 'Normal, es parte de la vida', icon: '🤷' },
      { id: 'poco', label: 'Poco, no me molesta', icon: '😌' },
    ]
  },

  // === SECCION E: LA PROPIEDAD ===
  {
    id: 'E1',
    section: 'E',
    sectionName: 'La Propiedad',
    question: 'Dormitorios MINIMOS:',
    subtitle: 'El minimo que necesitas',
    type: 'single',
    required: true,
    options: [
      { id: '1', label: '1 dormitorio', icon: '1️⃣' },
      { id: '2', label: '2 dormitorios', icon: '2️⃣' },
      { id: '3', label: '3 dormitorios', icon: '3️⃣' },
      { id: '4', label: '4+ dormitorios', icon: '4️⃣' },
    ]
  },
  {
    id: 'E2',
    section: 'E',
    sectionName: 'La Propiedad',
    question: 'Baños MINIMOS:',
    type: 'single',
    required: true,
    options: [
      { id: '1', label: '1 baño', icon: '1️⃣' },
      { id: '2', label: '2 baños', icon: '2️⃣' },
      { id: '3', label: '3+ baños', icon: '3️⃣' },
    ]
  },
  {
    id: 'E3',
    section: 'E',
    sectionName: 'La Propiedad',
    question: 'Metros cuadrados MINIMOS:',
    subtitle: 'Deja vacio si no estas seguro',
    type: 'number',
    placeholder: '90',
    unit: 'm2',
    min: 30,
    max: 500,
    required: false,
  },
  {
    id: 'E4',
    section: 'E',
    sectionName: 'La Propiedad',
    question: '¿Que es INNEGOCIABLE?',
    subtitle: 'Sin esto, NO te interesa aunque sea perfecta',
    type: 'multiple',
    required: true,
    options: [
      { id: 'silencio', label: 'Silencio', icon: '🔇' },
      { id: 'pet_friendly', label: 'Pet friendly', icon: '🐕' },
      { id: 'seguridad', label: 'Seguridad 24/7', icon: '🔒' },
      { id: 'estacionamiento', label: 'Estacionamiento', icon: '🚗' },
      { id: 'balcon', label: 'Balcon/terraza', icon: '🌅' },
      { id: 'ascensor', label: 'Ascensor', icon: '🛗' },
      { id: 'luminosidad', label: 'Luminosidad', icon: '☀️' },
      { id: 'ninguno', label: 'Ninguno es innegociable', icon: '✓' },
    ]
  },
  {
    id: 'E5',
    section: 'E',
    sectionName: 'La Propiedad',
    question: '¿Que DESEARIAS tener?',
    subtitle: 'Te gustaria, pero podes vivir sin',
    type: 'multiple',
    required: false,
    options: [
      { id: 'piscina', label: 'Piscina', icon: '🏊' },
      { id: 'gym', label: 'Gimnasio', icon: '🏋️' },
      { id: 'parrilla', label: 'Area BBQ', icon: '🍖' },
      { id: 'salon', label: 'Salon eventos', icon: '🎉' },
      { id: 'juegos', label: 'Area juegos niños', icon: '🎮' },
      { id: 'rooftop', label: 'Rooftop', icon: '🌆' },
    ]
  },
  {
    id: 'E6',
    section: 'E',
    sectionName: 'La Propiedad',
    question: '¿Que RECHAZAS?',
    subtitle: 'Aunque el depto sea bueno, NO te interesa si...',
    type: 'multiple',
    required: false,
    options: [
      { id: 'planta_baja', label: 'Planta baja', icon: '🚫' },
      { id: 'sin_ascensor', label: 'Sin ascensor (piso alto)', icon: '🚫' },
      { id: 'muy_grande', label: 'Edificio muy grande (+50)', icon: '🚫' },
      { id: 'avenida_ruidosa', label: 'Frente a avenida', icon: '🚫' },
      { id: 'ninguno', label: 'Ninguno me molesta', icon: '✓' },
    ]
  },

  // === SECCION F: HORIZONTE ===
  {
    id: 'F1',
    section: 'F',
    sectionName: 'Horizonte',
    question: 'Esta propiedad es para...',
    type: 'single',
    required: true,
    options: [
      { id: 'definitivo', label: 'Mi hogar por muchos años', icon: '🏡' },
      { id: 'temporal', label: 'Vivir un tiempo (3-7 años)', icon: '📅' },
      { id: 'paso', label: 'Paso intermedio', icon: '🔄' },
      { id: 'empezar', label: 'Empezar, despues crecer', icon: '📈' },
    ]
  },
  {
    id: 'F2',
    section: 'F',
    sectionName: 'Horizonte',
    question: '¿Cuanto tiempo pensas vivir ahi?',
    type: 'single',
    required: true,
    options: [
      { id: '1-3', label: '1-3 años', icon: '📅' },
      { id: '3-7', label: '3-7 años', icon: '📆' },
      { id: '7-15', label: '7-15 años', icon: '🗓️' },
      { id: 'indefinido', label: '+15 años / indefinido', icon: '♾️' },
    ]
  },
  {
    id: 'F3',
    section: 'F',
    sectionName: 'Horizonte',
    question: '¿Importa poder vender/alquilar facil?',
    type: 'single',
    required: true,
    options: [
      { id: 'muy', label: 'Muy importante', icon: '💰' },
      { id: 'algo', label: 'Algo importante', icon: '🤷' },
      { id: 'poco', label: 'Poco importante', icon: '😌' },
    ]
  },
  {
    id: 'F4',
    section: 'F',
    sectionName: 'Horizonte',
    question: '¿Tu familia podria crecer en los proximos 5 años?',
    subtitle: 'Hijos, familiares que se mudan, etc.',
    type: 'single',
    required: true,
    options: [
      { id: 'si', label: 'Si, es probable', icon: '👶' },
      { id: 'tal_vez', label: 'Tal vez', icon: '🤔' },
      { id: 'no', label: 'No', icon: '✋' },
      { id: 'no_aplica', label: 'Ya no aplica', icon: '✓' },
    ]
  },

  // === SECCION G: TRADE-OFFS ===
  {
    id: 'G1',
    section: 'G',
    sectionName: 'Trade-offs',
    question: 'Si tuvieras que elegir...',
    subtitle: 'No vale "ambas"',
    type: 'single',
    required: true,
    options: [
      { id: 'ubicacion', label: 'Mejor ubicacion, menos metros', icon: '📍' },
      { id: 'metros', label: 'Mas metros, peor ubicacion', icon: '📐' },
    ]
  },
  {
    id: 'G2',
    section: 'G',
    sectionName: 'Trade-offs',
    question: 'Otra eleccion dificil...',
    type: 'single',
    required: true,
    options: [
      { id: 'nuevo', label: 'Edificio nuevo sin amenities', icon: '🆕' },
      { id: 'amenities', label: 'Edificio antiguo con amenities', icon: '🏊' },
    ]
  },
  {
    id: 'G3',
    section: 'G',
    sectionName: 'Trade-offs',
    question: 'Y si tuvieras que elegir...',
    type: 'single',
    required: true,
    options: [
      { id: 'silencio', label: 'Silencio total, sin vista', icon: '🔇' },
      { id: 'vista', label: 'Vista increible, algo de ruido', icon: '🌅' },
    ]
  },
  {
    id: 'G4',
    section: 'G',
    sectionName: 'Trade-offs',
    question: '¿Que ESTAS DISPUESTO a resignar?',
    subtitle: 'Selecciona lo que podrias sacrificar',
    type: 'multiple',
    required: true,
    options: [
      { id: 'metros', label: 'Algunos metros', icon: '📐' },
      { id: 'dormitorio', label: 'Un dormitorio', icon: '🛏️' },
      { id: 'amenities', label: 'Amenities', icon: '🏊' },
      { id: 'piso', label: 'Piso alto / vista', icon: '🏢' },
      { id: 'zona', label: 'La zona ideal', icon: '📍' },
      { id: 'nada', label: 'Nada, no resigno', icon: '✋' },
    ]
  },

  // === SECCION H: ALERTAS ===
  {
    id: 'H1',
    section: 'H',
    sectionName: 'Alertas',
    question: '¿Que te preocupa MAS?',
    subtitle: 'Maximo 3',
    type: 'multiple',
    required: true,
    options: [
      { id: 'arrepentirme', label: 'Equivocarme', icon: '😰' },
      { id: 'pagar_mas', label: 'Pagar de mas', icon: '💸' },
      { id: 'no_vender', label: 'No poder vender', icon: '🏠' },
      { id: 'ahogarme', label: 'Ahogarme con cuotas', icon: '😵' },
      { id: 'perder_oportunidad', label: 'Perder oportunidades', icon: '⏰' },
      { id: 'pareja', label: 'Desacuerdo con pareja', icon: '💔' },
    ]
  },
  {
    id: 'H2',
    section: 'H',
    sectionName: 'Alertas',
    question: '¿Quien mas decide?',
    type: 'single',
    required: true,
    options: [
      { id: 'solo', label: 'Solo yo', icon: '👤' },
      { id: 'pareja_alineados', label: 'Mi pareja (alineados)', icon: '💑' },
      { id: 'pareja_dudas', label: 'Mi pareja (algunas dudas)', icon: '🤔' },
      { id: 'familia', label: 'Familia opina', icon: '👨‍👩‍👧' },
    ]
  },
  {
    id: 'H3',
    section: 'H',
    sectionName: 'Alertas',
    question: '¿Sentis presion para cerrar?',
    type: 'single',
    required: true,
    options: [
      { id: 'no', label: 'No, a mi ritmo', icon: '😌' },
      { id: 'poco', label: 'Un poco', icon: '🤷' },
      { id: 'bastante', label: 'Bastante', icon: '😬' },
      { id: 'mucha', label: 'Mucha presion', icon: '😰' },
    ]
  },
  {
    id: 'H4',
    section: 'H',
    sectionName: 'Alertas',
    question: '¿Como seria el EXITO de esta compra para vos?',
    subtitle: 'En tus propias palabras',
    type: 'text',
    placeholder: 'Ej: Encontrar un lugar tranquilo donde mi familia este comoda por muchos años...',
    required: true,
  },

  // === SECCION I: VALIDACION ===
  {
    id: 'I1',
    section: 'I',
    sectionName: 'Validacion',
    question: 'Tu presupuesto maximo es firme?',
    subtitle: 'Si aparece el depto PERFECTO pero cuesta 15% mas...',
    type: 'single',
    required: true,
    options: [
      { id: 'firme', label: 'Mi limite es firme', icon: '🛑' },
      { id: 'podria', label: 'Podria estirarme', icon: '🤔' },
      { id: 'evaluaria', label: 'Evaluaria el caso', icon: '🤷' },
    ]
  },
  {
    id: 'I2',
    section: 'I',
    sectionName: 'Validacion',
    question: '¿Algo importante que no pregunte?',
    subtitle: 'Opcional',
    type: 'text',
    placeholder: 'Cualquier detalle que consideres importante...',
    required: false,
  },
]

export const totalQuestions = questions.length
