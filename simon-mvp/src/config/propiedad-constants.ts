/**
 * Constants for the property editor (/admin/propiedades/[id])
 */

export const MICROZONAS = [
  { id: 'equipetrol_centro', label: 'Equipetrol Centro' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'equipetrol_norte', label: 'Equipetrol Norte' },
  { id: 'villa_brigida', label: 'Villa Brígida' },
  { id: 'equipetrol_oeste', label: 'Equipetrol Oeste (Busch)' },
]

/** Form ID → BD microzona column value */
export const MICROZONA_ID_TO_DB: Record<string, string> = {
  'equipetrol_centro': 'Equipetrol',
  'sirari': 'Sirari',
  'equipetrol_norte': 'Equipetrol Norte/Norte',
  'villa_brigida': 'Villa Brigida',
  'equipetrol_oeste': 'Faremafu',
}

export const AMENIDADES_OPCIONES = [
  'Piscina', 'Gimnasio', 'Seguridad 24/7', 'Ascensor', 'Pet Friendly',
  'Co-working', 'Churrasquera', 'Sauna/Jacuzzi', 'Salón de eventos', 'Área de juegos',
  'Roof garden', 'Bar/Lounge', 'Canchas deportivas', 'Sala yoga', 'Jardín',
]

export const EQUIPAMIENTO_OPCIONES = [
  'Aire acondicionado', 'Cocina equipada', 'Closets', 'Calefón/Termotanque',
  'Cortinas/Blackouts', 'Amoblado', 'Lavadora', 'Secadora', 'Heladera',
  'Microondas', 'Horno empotrado', 'Lavavajillas', 'Balcón', 'Vista panorámica',
]

export const TIPO_OPERACION = [
  { id: 'venta', label: 'Venta' },
  { id: 'alquiler', label: 'Alquiler' },
  { id: 'anticretico', label: 'Anticrético' },
]

export const ESTADO_CONSTRUCCION = [
  { id: 'entrega_inmediata', label: 'Entrega Inmediata' },
  { id: 'en_construccion', label: 'En Construcción' },
  { id: 'preventa', label: 'Preventa' },
  { id: 'en_planos', label: 'En Planos' },
  { id: 'usado', label: 'Usado' },
  { id: 'no_especificado', label: 'No Especificado' },
]

export const DORMITORIOS_OPCIONES = [
  { value: '0', label: 'Monoambiente' },
  { value: '1', label: '1 dormitorio' },
  { value: '2', label: '2 dormitorios' },
  { value: '3', label: '3 dormitorios' },
  { value: '4', label: '4 dormitorios' },
  { value: '5', label: '5 dormitorios' },
  { value: '6', label: '6+ dormitorios' },
]

export const MOMENTOS_PAGO = [
  { id: 'reserva', label: 'Al reservar', emoji: '🔖' },
  { id: 'firma_contrato', label: 'Firma de contrato', emoji: '✍️' },
  { id: 'durante_obra', label: 'Durante construcción', emoji: '🏗️' },
  { id: 'cuotas_mensuales', label: 'Cuotas mensuales', emoji: '📅' },
  { id: 'entrega', label: 'Contra entrega', emoji: '🔑' },
  { id: 'personalizado', label: 'Otro momento', emoji: '📝' },
]

export const CAMPOS_BLOQUEABLES = [
  'dormitorios', 'banos', 'area_total_m2', 'precio_usd', 'estacionamientos',
  'estado_construccion', 'fecha_entrega', 'amenities', 'equipamiento',
  'piso', 'gps', 'parqueo_incluido', 'baulera', 'zona', 'forma_pago',
]
