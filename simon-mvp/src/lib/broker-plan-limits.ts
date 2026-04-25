/**
 * Límites del Plan Inicial de Simon Broker.
 *
 * Source of truth para los caps de shortlists. Importar desde acá en lugar de
 * hardcodear los números en API routes, middleware, componentes o términos
 * de uso. Si mañana cambian, se cambian acá y propaga.
 *
 * Estos valores son INTENCIONALMENTE conservadores. Son la palanca de
 * monetización para el Plan Pro futuro: cuando un broker quiera más vistas
 * o mayor duración, paga upgrade. Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.
 *
 * INVARIANTE EDITORIAL: NUNCA habilitar branding propio del broker (logo
 * custom, dominio custom, colores). La marca SIEMPRE es Simón — los brokers
 * son canal de adquisición de usuarios, no white-label. Plan Pro futuro =
 * más límites + features productivas (analytics detallados de visitas, push
 * notifications, etc.), nunca branding.
 *
 * Por qué el cap del Plan Inicial igual sirve aunque Pro no esté diseñado:
 * sin cap, un broker puede postear el link de su shortlist en Instagram /
 * grupos masivos de WA y convertirla en mini-portal público — eso diluye la
 * marca Simón y rompe el modelo "Simon = canal de adquisición de usuarios
 * finales". El cap previene esto independientemente de si después hay un
 * upgrade vendible o no.
 *
 * Estos valores ESPEJAN los DEFAULTs SQL de la migración 235 (max_views=20,
 * expires_at=NOW()+30d). Si se desincronizan, el código de la app va a pasar
 * un valor distinto al default SQL al INSERT — lo cual está bien si es
 * intencional (ej. distinguir tiers en el futuro), pero hay que ser explícito.
 */
export const SHORTLIST_LIMITS = {
  inicial: {
    /** Vistas únicas por dispositivo antes de bloquear. Bs 350/mes. */
    maxViewsPerShortlist: 20,
    /** Días desde creación antes de expirar automáticamente. */
    expirationDays: 30,
  },
  // Plan Pro futuro: precio y features SIN DEFINIR todavía.
  // Más vistas/duración por sí solas NO son diferenciador suficiente — un
  // broker puede armar 2 shortlists para 2 clientes en vez de upgradear.
  // Pro va a necesitar features productivas adicionales (analytics detallados
  // del link compartido, push notifications cuando el cliente abre, bulk ops,
  // etc.) cuando se diseñe. Hasta entonces, NO agregar `pro: {...}` acá.
} as const

export type PlanTier = keyof typeof SHORTLIST_LIMITS
