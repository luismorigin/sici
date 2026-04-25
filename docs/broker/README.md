# Simon Broker — Documentación del producto

Carpeta de trabajo para **Simon Broker**, el tier SaaS pago (Bs. 75-210/mes) sobre la plataforma Simon dirigido a brokers inmobiliarios en Equipetrol.

## Índice

| Archivo | Propósito |
|---|---|
| [PRD.md](PRD.md) | Product Requirements Document del MVP mínimo. Scope congelado, cronograma 3 semanas, decisiones tomadas. |
| [BACKLOG.md](BACKLOG.md) | Ideas parqueadas para v2+. Cada entrada con rationale de por qué no entra al MVP. |
| [SHORTLIST_PROTECTION_V1_PLAN.md](SHORTLIST_PROTECTION_V1_PLAN.md) | Plan + implementación realizada del v1 protección (caps, expiración, fingerprint, watermark, términos). Mergeado a main `037584b` el 25 Abr 2026. |

## Principio rector

> **Honestidad profesional como moat. Profesional, no mentiroso.**

El broker que use Simon tiene que poder defender cualquier número del producto ante un cliente que pregunte "¿cómo lo calculaste?". Data verificable, metodología transparente, sin supuestos ocultos.

## Estado actual

- **Fase:** MVP venta + Fase 2 alquileres + v1 Protección shortlists mergeados a `main`
- **Última actualización:** 2026-04-25
- **Merges:** `05bc1eb` (MVP venta, 23 Abr) · `65ccc4b` (Fase 2 alquileres, 24 Abr) · `037584b` (Protección v1, 25 Abr)
- **Target founding:** 15-25 brokers en 60-90 días post-deploy
- **Auth:** no al inicio (slug en URL). Se agrega cuando crezca la base o haya datos sensibles.
- **Migraciones aplicadas:** 228 (tablas shortlists), 229 (snapshot USD RAW), 230 (snapshot USD normalizado), 231 (`simon_brokers` reemplaza hardcoded), 233 (snapshot BOB alquiler), 234 (`broker_shortlist_hearts` feedback cliente), **235 (protección v1: caps+expiración+fingerprint+terms)**

### Features en producción

**Admin:** `/admin/simon-brokers` (crear/editar/pausar brokers en ~30s durante reunión).

**Broker arma shortlists:**
- `/broker/[slug]` — modo broker sobre feed venta (estrella ⭐ + chips selección + banner arena)
- `/broker/[slug]/alquileres` — mismo flujo sobre feed alquiler (Fase 2)
- Tabs "Ventas | Alquileres" en banner broker para cambiar entre ambos
- ShortlistSendModal con validación teléfono E.164 (auto-prefija +591)
- "Mis shortlists" con agrupación por cliente (teléfono normalizado) + chip `[Venta]`/`[Alquiler]` + alerta "cliente existente" (Nivel 1)
- Editor `/broker/[slug]/shortlists/[id]` con fotos + precios (Bs/$us según tipo) + reordenar + archivar

**Link público al cliente:**
- `/b/[hash]` ramifica según `tipo_operacion` del primer item → `VentasPage` o `AlquileresPage` con prop `publicShare`
- Header fijo con foto/nombre del broker + inmobiliaria + CTA WhatsApp pre-armado desde corazones marcados
- FAB mapa mobile (publicShareMode oculta el top bar)
- Sin gate/preguntas al broker/chat/filtros — contexto curado
- CTAs WhatsApp siempre al broker (cards, BottomSheet, MapFloatCard, CompareSheet), nunca al agente original
- Badge "↓ bajó" / "↑ antes Bs X" si el snapshot vs actual difiere >1% (tanto venta USD como alquiler BOB)

**Feedback cliente → broker:**
- API pública `/api/public/shortlist-hearts` GET/POST/DELETE scoped por hash, sin auth
- Valida que `propiedad_id` pertenezca a la shortlist antes de escribir (anti-manipulación)
- Corazones persisten en BD (no localStorage) — el broker ve "N de M marcadas" + chip ❤ en items con corazón en el editor

**Protección de shortlists (v1, migración 235):**
- **Cap 20 vistas únicas / 30 días** por shortlist en Plan Inicial (Bs 350/mes). Lever de monetización Plan Pro futuro.
- **Fingerprint** = cookie `sl_visitor_<first8>` HttpOnly 1 año + fallback `sha256(ip+ua+shortlist_id)`. Resiste NAT pesado de Tigo/Entel.
- **Eventos de visita** registrados en `broker_shortlist_views` (1 fila por hit, `is_unique` distingue primera vs return).
- **3 razones de bloqueo** distintas: `expired`, `view_limit_reached`, `suspended`. UI muestra mensaje específico + CTA WhatsApp para pedir nuevo link.
- **Watermark** al pie del feed con ID corto (`#abc12345`) trazable si el broker hace screenshot para distribución pública.
- **Términos de uso** obligatorios: checkbox en `/admin/simon-brokers` al crear broker, persistido como `terms_accepted_at` en `simon_brokers`.
- **Admin gestión:** `/admin/simon-brokers/[slug]` muestra todas las shortlists del broker con status/vistas/expiración + botones suspender/reactivar individuales (API `/api/admin/shortlists/*`).
- **Cache `private, no-store`** en SSR de `/b/[hash]` — incompatible con Set-Cookie de fingerprint si el CDN cacheara.
- **Invariante editorial:** marca SIEMPRE Simón. NUNCA white-label. Plan Pro = más límites + features productivas, nunca branding.
- Plan completo: `docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md`

### Diseño: shortlist NO es mixta

El UI no permite armar shortlists venta+alquiler juntas. El broker está en una ruta u otra, cada página envía su `tipo_operacion` fijo. `/b/[hash]` asume homogeneidad (tipo del primer item). Mixto está parqueado en backlog (features "Shortlists vivas" Nivel 2 y "Cliente como entidad" Nivel 3).

### Pendientes parqueados en BACKLOG.md

- **Rate limit** en API pública — activar al 5to broker o primer incidente
- **Snooze visual** panel — activar cuando un broker tenga ≥30 shortlists
- ~~**Expiración automática**~~ — ✅ implementada en v1 protección (migración 235, expira a 30 días desde `created_at`)

Ver `BACKLOG.md` sección "Infra / arquitectura" y "UX / panel del broker" para detalle.

## Cómo trabajar con esta carpeta

1. **Todas las ideas nuevas van al BACKLOG.md** con una línea de rationale. Zero debate en el momento.
2. **El PRD se actualiza** cuando una idea del backlog se promueve al MVP o cuando termina una feature (se marca completada).
3. **Nada se borra** — incluso ideas descartadas quedan con la razón por la que no se hacen.
