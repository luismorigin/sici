# Simon Broker — Backlog

Ideas, features y mejoras parqueadas para después del MVP.

**Regla:** cada entrada tiene una línea de rationale de por qué no entra ahora. Nada se borra — incluso ideas descartadas quedan con la razón por la que no se hacen.

**Formato:**
```
### Nombre de la idea
**Tier:** v2 | v2-premium | descartada | esperando-señal
**Agregado:** fecha
**Rationale:** por qué no ahora
**Cuándo reactivar:** señal que dispararía revisión
```

---

## Fase 2 — Extensión natural (✅ HECHA — merge 2026-04-24)

### Extender Simon Broker a alquileres
**Tier:** ✅ **HECHA** — merge commit `65ccc4b` el 2026-04-24
**Agregado:** 2026-04-22 · **Completada:** 2026-04-24

**Resumen de lo entregado** (15 commits en rama `broker-fase2`):
- `/broker/[slug]/alquileres` — modo broker sobre `AlquileresPage` (delega a `getStaticProps` de alquileres + `brokerSlug/broker` prop)
- Tabs "Ventas | Alquileres" en el banner broker (nav entre ambos feeds desde la misma página)
- `/b/[hash]` ramifica por `tipo_operacion` del primer item → VentasPage o AlquileresPage con props `publicShare`
- Header público fijo con foto/nombre del broker + inmobiliaria + CTA WhatsApp con mensaje armado desde corazones marcados
- FAB mapa mobile en publicShareMode (top bar oculto)
- Ocultamiento de gate/preguntas/chat/filtros en publicShareMode (cliente ve contexto curado)
- CTAs WA al broker en cards, BottomSheet, MapFloatCard y CompareSheet (no al agente original)
- Migración 233 — `broker_shortlist_items.precio_mensual_bob_snapshot` (badge cambio de precio en alquiler)
- Migración 234 — tabla `broker_shortlist_hearts` (feedback del cliente al broker) + API `/api/public/shortlist-hearts` (GET/POST/DELETE scoped por hash)
- Editor broker muestra "N de M marcadas por el cliente" + chip rojo en items con corazón
- Chip `[Venta]`/`[Alquiler]` en "Mis shortlists" para distinguir envíos
- Fix bloqueante: validación teléfono E.164 en ShortlistSendModal (auto-prefija +591 si se tipea solo 8 dígitos boliviano)

**Rationale original (preservado):** El MVP cubre venta. La extensión a alquiler se apoya en infraestructura que ya existe en `/alquileres`: sistema de favoritos (corazones), CompareSheet, mini estudio de mercado en sheet, similares. **No se construye ACM de alquiler** — en alquiler el usuario elige rápido (no es decisión de inversión), el mini estudio de mercado ya existente alcanza, y los corazones + CompareSheet son herramienta de curación natural.

**Qué cambia específicamente (sobre infra existente):**
- **Modo broker en sheet de `/alquileres`** (mismo patrón que `/ventas`):
  - Quita "preguntas al broker"
  - Quita gate "ver anuncio original"
  - Agrega botón ⭐ (agrega a shortlist)
  - **Sin ACM construido** — mantiene el mini estudio de mercado que ya existe
- **Link compartido `/b/[hash]` soporta items de alquiler:**
  - Render según `tipo_operacion` de cada item
  - Cliente puede dar corazones dentro del link (reutiliza sistema de favoritos existente, scoped al hash)
  - Cliente puede abrir `CompareSheet` con 2+ favoritos (reutiliza componente existente)
- **Feedback del cliente al broker:**
  - Tabla nueva `broker_shortlist_hearts` registra qué propiedades marcó el cliente (por hash + `propiedad_id`)
  - El broker entra a su shortlist y ve *"cliente marcó corazón en 3 de 7 propiedades"*
  - Da contexto para decidir cuándo llamar/escribir
- **Tabs "Ventas / Alquileres"** en `/broker/[slug]`
- Shortlist acepta items mixtos (columna `tipo_operacion` en `broker_shortlist_items` desde día uno)

**Lo que NO se construye:**
- RPC `buscar_acm_alquiler` (descartado — innecesario)
- Página ACM dedicada de alquiler (descartado)
- PDF ACM alquiler (descartado)

**Preparar en MVP (cero costo, blinda Fase 2):**
- Columna `tipo_operacion` en `broker_shortlist_items` desde migración inicial
- Página `/broker/[slug]` con layout preparado para tabs

**Cuándo reactivar:** inmediatamente después de S3 del MVP ventas. Plan de 3-5 días:
- Día 1: Modo broker en sheet de `/alquileres` + botón ⭐
- Día 2: Link compartido `/b/[hash]` renderiza items de alquiler + favoritos/CompareSheet embebidos
- Día 3: Tabla `broker_shortlist_hearts` + feedback visible en panel del broker
- Día 4-5: Tabs venta/alquiler en `/broker/[slug]` + polish + testing

---

## Features producto

### Shortlists "vivas" por cliente (Nivel 2)
**Tier:** v1.3 — probar cuando aparezca señal de uso real
**Agregado:** 2026-04-23
**Rationale:** Hoy cada envío a un mismo cliente crea shortlist nueva (fila nueva, hash nuevo, link nuevo). En S3 agregamos el Nivel 1: agrupamos por cliente en el panel del broker + badge "cliente existente" al crear. Pero no resuelve el problema real del cliente: cuando un broker le manda 3 propiedades hoy y 2 más el mes próximo, el cliente acumula 2 links distintos en su WhatsApp → se pierde el hilo.

**Solución propuesta:**
- Al crear nueva shortlist para un teléfono que ya existe, preguntar: *"¿Agregar estas 3 propiedades a la shortlist de Juan (del 15 de abril), o crear una shortlist nueva?"*
- Si agrega → INSERT en `broker_shortlist_items` con el mismo `shortlist_id` existente. Mismo link, cliente recibe notificación opcional *"Abel actualizó tu selección"*.
- Si crea nueva → flujo actual (misma fila nueva + link nuevo).
- Panel broker puede tener vista "timeline" dentro de la shortlist: qué props se agregaron y cuándo.

**Esfuerzo estimado:** ~1 día dev. No requiere migración estructural (usa `broker_shortlist_items.created_at` para timeline).

**Cuándo reactivar:** cuando un founder del MVP diga explícitamente *"Juan me volvió a pedir, no quiero mandarle otro link"*. Esa señal probablemente aparezca en los primeros 10-15 envíos reales. Antes de eso es spec'ulación.

### Cliente como entidad (Nivel 3 — tabla `broker_clientes`)
**Tier:** v2 — requiere product-market-fit con volumen
**Agregado:** 2026-04-23
**Rationale:** Modelo de datos "correcto" para un producto maduro: el cliente es una entidad de primera clase, las shortlists le pertenecen. Permite:
- Tabla `broker_clientes` (telefono UNIQUE por broker, nombre, email opcional, notas privadas del broker).
- `broker_shortlists.cliente_id` FK en lugar de `cliente_telefono` string duplicado.
- Página `/broker/[slug]/clientes/[id]` consolida todo del cliente: shortlists activas, histórico, favoritos acumulados cross-shortlist, último contacto, notas.
- Link permanente por cliente (`/b/<clienteHash>`) que nunca cambia — el broker va agregando props, el cliente ve su "feed" evolucionar como un mini-portal personalizado.
- Base para features futuras: alertas ("te apareció un 3 dorm que te puede interesar"), analytics ("Juan vio 12 props pero nunca puso corazón, quizás no le gusta la zona"), re-engagement campaigns.

**Esfuerzo estimado:** ~3-4 días dev. Migración fuerte (refactor `broker_shortlists` + backfill cliente_id + UI nueva). Data model cleanup.

**Cuándo reactivar:** cuando haya señal real de que brokers gestionan *"clientes activos como portfolio"* (no solo envíos esporádicos). Indicador: brokers que tienen ≥5 clientes con ≥3 envíos cada uno en el último mes. Antes de eso la tabla nueva está subutilizada.

**Anti-señal:** si los brokers siguen usando shortlists como "emails sueltos" (1-2 envíos por cliente máximo), el Nivel 3 es over-engineering.

### Activación de broker en el momento (opción mini — tabla + admin sin auth)
**Tier:** v1.2 — cola post Fase 2 alquileres
**Agregado:** 2026-04-23
**Rationale:** Problema comercial real: cuando cierra un broker en un café/reunión, hoy la activación requiere editar `lib/brokers-demo.ts` + commit + deploy Vercel (~5-10 min, frágil sin laptop/wifi). Eso pone en riesgo el momentum del cierre. La solución NO es auth + billing completo (tier v2, ver "Producto comercial abierto") — es solo mover el registro de broker de archivo a BD + UI rápido de creación. Mantiene el modelo slug público del MVP (cero fricción para el broker en el momento del cierre) y deja facturación fuera del producto (Google Sheet + QR por WhatsApp).

**Alcance (~4-6h dev):**
- Migrar `lib/brokers-demo.ts` → tabla Supabase `brokers_mvp` (mismos campos: slug, nombre, telefono, foto_url, inmobiliaria, status, fecha_alta)
- Página `/admin/brokers/crear` (form 4 campos + slug)
- SSR gate en `/broker/[slug]`: valida `status='activo'` en BD, si no → 404
- Editor `/admin/brokers/[id]` (editar datos, toggle status, borrar)
- Pagos: fuera del producto (Google Sheet + QR por WA, toggle manual de status cuando deja de pagar)

**Flujo objetivo en el café:** abrir `/admin/brokers/crear` en celu → completar 4 campos (30 seg) → darle URL `simonbo.com/broker/<slug>` → broker operativo en el acto.

**Cuándo reactivar:** inmediatamente después de Fase 2 alquileres (~2 semanas desde hoy). Si aparece oportunidad de cierre **antes** de terminar S3, hacer la opción mini en paralelo (no bloquea testing S3).

**Cuándo NO basta con esta opción:** cuando haya ≥15 brokers activos + demanda externa (brokers desconocidos pidiendo acceso). Ahí se justifica el bloque completo "Producto comercial abierto" (auth real, billing admin, onboarding self-serve, notificaciones, rate limiting — ~2 días dev).

### Snapshot de precio en items del shortlist
**Tier:** v1.1 — agregar antes de escalar a 10+ brokers
**Agregado:** 2026-04-23
**Rationale:** Hoy el shortlist es 100% live: cuando el cliente abre `/b/[hash]`, ve el precio actual de la BD, no el precio cuando el broker armó la shortlist. Esto crea problema cuando un vendedor ajusta precio entre el armado y la apertura del cliente:
- Si baja: oportunidad perdida (broker no se entera, cliente lo ve solo)
- Si sube: pérdida de credibilidad ("vos me dijiste $180k, dice $200k")

**Solución técnica:**
- Agregar columna `precio_usd_snapshot NUMERIC` a `broker_shortlist_items`
- Llenar al INSERT con el precio actual de la propiedad
- En `/b/[hash]`, comparar `precio_usd_snapshot` vs `precio_usd` actual:
  - Si baja: badge verde "Bajó de $X → $Y"
  - Si sube: badge gris "Antes $X → ahora $Y"
  - Si igual: nada

**Estimación:** 30-60 min de dev (migración + INSERT update + render badge).
**Cuándo reactivar:** antes de escalar a 10+ brokers o si aparece el primer caso real en feedback.

### Producto comercial abierto (registro público de brokers)
**Tier:** v2 — bloque de features para self-serve
**Agregado:** 2026-04-23
**Rationale:** El MVP funciona para founding cerrado (15-25 brokers conocidos, slugs creados a mano). Para abrir registro público y escalar a 100+ brokers hace falta un bloque de features en conjunto:

1. **Auth real** (email/password o magic link) — hoy solo slug en URL
2. **Branding propio del broker** (logo + 1-2 colores en el link compartido) — hoy solo nombre + foto
3. **Dashboard de métricas** (vistas por shortlist, propiedades más tocadas, conversiones) — hoy solo `view_count` en BD sin UI
4. **Onboarding** (tour primer uso, formulario alta self-serve, página `/broker/signup`) — hoy creado a mano por el equipo
5. **Notificaciones al broker** (email/WA cuando el cliente abre el link) — hoy reactivo, broker entra a "Mis shortlists" para chequear
6. **Rate limiting + abuse protection** en API broker — hoy escritura abierta (riesgo aceptable solo en fase founding)

**Estimación:** ~1 semana de dev en bloque, asumiendo el flow del MVP ya validado con feedback de founders.

**Cuándo reactivar:** cuando product-market-fit esté validado con los 15-25 founders del MVP y haya señal real de demanda externa (brokers que no conocemos pidiendo acceso).

### PDF export del ACM
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** El 90% de casos se resuelve con ACM inline en el sheet. PDF agrega 2 semanas de build (template nuevo + `lib/informe/` extendido) sin validación de que los brokers lo quieran.
**Cuándo reactivar:** cuando 3+ brokers lo pidan explícito en feedback post-MVP.

### Toggles per-propiedad en link compartido
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Permitir al broker elegir qué datos del ACM aparecen en el link que manda al cliente (yield sí/no, histórico sí/no, etc). Es elegante pero complejo sin señal real. En MVP todos los links muestran el mismo set básico.
**Cuándo reactivar:** tras 2-3 semanas de uso real, cuando aparezca la pregunta "¿puedo ocultar X a clientes?".

### Open Graph dinámico para links compartidos
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Imagen preview custom en WhatsApp con collage de fotos + nombre del broker. Técnicamente propenso a romperse (cache, fuentes, timeouts). WhatsApp funciona OK sin preview custom.
**Cuándo reactivar:** cuando el producto esté estable y haya que pulir la presentación de share.

### Dashboard de mercado custom sin marca Simon
**Tier:** esperando-señal
**Agregado:** 2026-04-22
**Rationale:** El MVP resuelve "visión del mercado para el broker" reutilizando las páginas públicas `/mercado/equipetrol` existentes (hub + ventas + alquileres). Son más completas de lo que hubiera construido. El trade-off es que muestran branding Simon — aceptable para uso interno del broker.
**Cuándo reactivar:** si aparece demanda real de brokers que quieren compartir un dashboard de mercado con sus clientes bajo su propia marca (sin Simon visible). Entonces evaluar dashboard custom en `/broker/[slug]/mercado`.

### Editor de lectura semanal compartible
**Tier:** descartada (re-frame)
**Agregado:** 2026-04-22
**Rationale:** Originalmente era newsletter editorial que el broker edita y comparte al cliente. Se re-definió: la lectura semanal del broker es **uso interno** (dashboard de mercado `/broker/[slug]/mercado`). No se publica ni se comparte.
**Cuándo reactivar:** si aparece demanda explícita de brokers que quieren compartir contenido editorial con clientes. En ese caso evaluar si Simon provee el contenido o solo el canal.

### Branding custom del broker (logo, colores)
**Tier:** v2-premium
**Agregado:** 2026-04-22
**Rationale:** Permitir que el broker suba su logo y elija 1-2 colores para su link compartido. Buen hook de tier premium pero innecesario para validar valor en MVP.
**Cuándo reactivar:** al definir pricing tiers definitivos post-MVP.

### Dominio custom del broker vía CNAME
**Tier:** v2-premium
**Agregado:** 2026-04-22
**Rationale:** `selection.martinsilva.com` en lugar de `simonbo.com/b/[hash]`. Alta complejidad técnica (SSL wildcard, DNS, verificación). Gran gancho premium pero lejano.
**Cuándo reactivar:** cuando haya ≥20 brokers pagantes y al menos 3 hayan pedido custom domain.

### Tracking analytics del link compartido
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Dashboard del broker mostrando "link X visto N veces, propiedad Y fue la más clickeada". Útil pero no bloquea la venta. Se puede reemplazar por GA4 events mientras tanto.
**Cuándo reactivar:** post-MVP, cuando los brokers pregunten "¿cómo sé si el cliente abrió el link?".

### Comparación lado a lado (tabla de N propiedades)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Mostrar 3-5 propiedades en tabla comparativa (precio, m², dorm, yield, etc.). Es valor real pero el shortlist ya cumple función similar. Priorizar feedback real.
**Cuándo reactivar:** si los brokers piden comparar visualmente propiedades al armar shortlist.

### Exportables para co-brokering
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** PDFs pensados para compartir con otros brokers (no clientes). Requiere formato distinto al link público (más técnico, incluye comisión, etc.). Out of scope para MVP solo-broker.
**Cuándo reactivar:** cuando Simon tenga red de brokers que co-broquean y haya demanda de formato formal.

### Alertas de nuevas propiedades matching criterios de cliente
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** "Avisame cuando aparezca un 3 dorm en Equipetrol Centro bajo $180k" → notificación al broker. Extremadamente útil pero requiere infra de notificaciones + gestión de criterios guardados.
**Cuándo reactivar:** tras MVP, cuando los brokers pidan "¿cómo me entero de listings nuevos?".

---

## Bugs / deuda técnica detectada

### Detector TC sobre-atribuye 'oficial' cuando listing solo dice "USD"
**Tier:** bug — investigar post-MVP
**Agregado:** 2026-04-22
**Rationale:** Props como Sky Level 1584 tienen descripción que solo dice "USD 141,000.00" sin calificar oficial/paralelo. El detector (regex + LLM upgrade merge v2.5.0) las marca como `tipo_cambio_detectado = 'oficial'` cuando deberían quedar `'no_especificado'`. Consecuencia: escapan al badge "Confirmar TC" aunque su precio esté claramente debajo de mediana.
**Impacto estimado:** probablemente decenas de props en el feed. Requiere auditoría del detector + posible ajuste del prompt LLM.
**Workaround:** fix manual por propiedad con UPDATE + `campos_bloqueados`. Ver sesión 2026-04-22.
**Cuándo reactivar:** post-MVP broker, como sub-proyecto de calidad de datos.

### tc_sospechoso no dispara en cohorts chicos (<3 props declaradas)
**Tier:** edge case — aceptado para MVP
**Agregado:** 2026-04-22
**Rationale:** El criterio tc_sospechoso requiere `HAVING COUNT(*) >= 3` en el grupo de referencia (zona + dorms + estado, solo TC declarado). Cuando el cohort es muy chico, la mediana queda NULL y el badge no dispara aunque la prop esté claramente debajo del mercado.

Caso concreto: Sky Level 1584 en Eq. Centro 2-dorm preventa. Al forzar manualmente su TC a 'no_especificado' (fix del detector), el grupo quedó con solo 2 props declaradas → no dispara.

**Opciones futuras:**
- B) Bajar HAVING a ≥2 — pragmatico, reduce rigor estadístico
- C) Fallback a cohort más amplio (solo zona+dorms, o solo zona) si el específico es <3
- D) Override manual por prop — nueva columna `tc_confirmar_override` (nullable) que fuerza/suprime el badge

**Cuándo reactivar:** si aparecen más casos edge en feedback de brokers del Founding Program. Evaluar opción C como más robusta.

## Features data / metodología

### Yield a nivel edificio individual
**Tier:** descartada (cobertura insuficiente)
**Agregado:** 2026-04-22
**Rationale:** Solo 6.7% de las props venta tienen ≥3 alquileres comparables en el mismo edificio. 77.5% no tienen ninguno. Yield a nivel unidad es matemáticamente engañoso.
**Cuándo reactivar:** solo si crece dramáticamente la cobertura de alquileres por edificio. Improbable.

### Proyección / tendencia de apreciación
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** 4 meses de tracking no sostienen una tendencia estadística defendible. Prometer apreciación con este horizonte es arriesgado.
**Cuándo reactivar:** cuando haya ≥12 meses de histórico limpio (aprox. diciembre 2026). Revisar metodología con SICI.

### Absorción como serie temporal presentable
**Tier:** esperando-señal
**Agregado:** 2026-04-22
**Rationale:** Serie v3 limpia tiene 9 días (22 Abr 2026). Necesita ≥90 días para ser estable. Antes del 14 Jul 2026, solo se presenta como snapshot mensual con disclaimer.
**Cuándo reactivar:** 14 Jul 2026. Revisar calidad de v3 con SICI.

### Real estate mercado secundario (portales adicionales)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Expandir más allá de C21 + Remax para cobertura más amplia. Requiere nuevos extractores + lógica de merge.
**Cuándo reactivar:** cuando el producto broker tenga tracción y necesite escalar cobertura.

---

## Roadmap de data externa

### Derechos Reales — precios reales de cierre
**Tier:** P1 (gestión institucional paralela)
**Agregado:** 2026-04-22
**Rationale:** Única forma de validar absorción real vs aparente y habilitar apreciación + yield reales. Acceso institucional complejo, sin API pública.
**Cuándo reactivar:** arrancar trámite en paralelo al build del MVP. Tiempo estimado 6-12 meses hasta tener data.

### Red de brokers-sensor
**Tier:** P2 (post-MVP inmediato)
**Agregado:** 2026-04-22
**Rationale:** Los brokers del Founding Program reportan "se vendió / se retiró" → convierte absorción aparente en señal de venta real. Requiere feature broker-sensor no incluida en MVP.
**Cuándo reactivar:** a partir de la semana 4 post-MVP, cuando haya founders activos.

### Acuerdos con desarrolladoras — inventario no publicado
**Tier:** P4 (post product-market-fit)
**Agregado:** 2026-04-22
**Rationale:** Sales cycle con cada desarrolladora, zero leverage si Simon no tiene red grande de brokers. Valor alto para preventa pero no es SaaS, es hand-crafted.
**Cuándo reactivar:** cuando haya ≥50 brokers activos.

### Catastro SC — uso de suelo + licencias
**Tier:** P5 (para Simon Advisor futuro)
**Agregado:** 2026-04-22
**Rationale:** Data dispersa, acceso complicado. Más útil para inversionistas/desarrolladores que para brokers.
**Cuándo reactivar:** cuando se inicie build de Simon Advisor.

### GA4 + CRM broker como señal de interés
**Tier:** v2 (quick win)
**Agregado:** 2026-04-22
**Rationale:** "Unidad con 40 views vs 3 views = precio bien/mal puesto" → indicador barato. Ya tenemos GA4.
**Cuándo reactivar:** post-MVP, sumar al dashboard de mercado como indicador de atención.

---

## Infra / arquitectura

### Login y auth reales (email/password o magic link)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** MVP usa slug en URL. Auth se agrega cuando la base crezca o haya datos sensibles.
**Cuándo reactivar:** cuando ≥15 brokers activos o aparezca data sensible (información de clientes, comisiones, etc.).

### RLS estricto en tablas broker
**Tier:** v2 (con login)
**Agregado:** 2026-04-22
**Rationale:** MVP tiene tablas `broker_shortlists` con escritura abierta. En fase founding con 15-25 brokers conocidos, riesgo aceptable.
**Cuándo reactivar:** junto con login real.

### Onboarding self-serve (formulario público de alta)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** MVP crea slugs manualmente. Cuando la base quiera crecer más allá del Founding Program, hace falta landing `/broker/signup`.
**Cuándo reactivar:** post-MVP, tras validar product-market-fit.

### Rate limit en API pública `/api/public/shortlist-hearts`
**Tier:** esperando-señal
**Agregado:** 2026-04-24
**Rationale:** El endpoint POST/DELETE de hearts (Fase 2 Día 3, migración 234) acepta requests ilimitadas. Scoped al hash de la shortlist — quien tenga el link puede marcar/desmarcar sin límite. Con 1 broker founding (Abel) no es problema: no hay atacantes, los clientes marcan 3-5 corazones humanos. Agregar rate limit hoy es over-engineering para un escenario que no existe.

**Riesgo concreto si no se resuelve antes de escalar:** un script con el hash puede spammear 1000 POSTs/segundo → contamina data del broker ("cliente marcó 847 veces"), gasta cuota Supabase, llena logs.

**Implementación futura (orden de esfuerzo):**
1. **Upstash Ratelimit** (Redis serverless, estándar en Next.js/Vercel) — 10 min setup, gratis hasta ~10k requests/día. Cross-instance.
2. **Vercel Firewall** (Pro/Enterprise) — config via `vercel.json`, 5 min si ya hay plan Pro
3. **In-memory Map en handler** — 15 min, no persiste deploys, no funciona con múltiples lambdas

Para MVP founding 3-5 brokers la opción 3 alcanza. Para 15+ brokers ir a Upstash.

**Límite propuesto:** 20 hits/minuto por hash. Uso humano máximo (marcar + corregir + re-marcar) cabe holgado. Script = bloqueo inmediato.

**Cuándo reactivar:** al sumar el 5to broker activo o al primer incidente de data contaminada. Activar en el momento — el fix es barato (~15 min) y no justifica construirlo antes.

---

## UX / panel del broker

### Snooze visual de shortlists antiguas en panel "Mis shortlists"
**Tier:** v1.1
**Agregado:** 2026-04-24
**Rationale:** Hoy el panel lista TODAS las shortlists activas del broker ordenadas por fecha desc, agrupadas por cliente (teléfono). Funciona bien con 5-10 shortlists. Con 30+ el broker se pierde entre las recientes y las viejas.

**Solución propuesta (sin cambios de BD):** dividir el panel en 2 secciones:
- **Activas** (<30 días, o con apertura reciente por `last_viewed_at`)
- **Antiguas** (colapsable, muestra contador "N shortlists más antiguas")

**Esfuerzo estimado:** 30 min dev. Solo cambios en `ShortlistsPanel.tsx`. Sin migración, sin cron, sin cambios de schema.

**Cuándo reactivar:** cuando un broker founding tenga ≥30 shortlists activas y reporte confusión, o cuando el scroll del panel pase una pantalla en mobile. Observar en el primer mes de uso real.

### Expiración automática de shortlists
**Tier:** v1.3
**Agregado:** 2026-04-24
**Rationale:** Hoy las shortlists viven para siempre mientras `archived_at IS NULL` y `is_published = TRUE`. Ventaja: relaciones largas (un cliente busca por meses) se mantienen. Desventaja: shortlists abandonadas quedan accesibles por años con precios snapshot desactualizados.

**Opciones posibles (decidir cuando se active):**
- **A. Auto-expira N días** (ej: 90) — cron pone `is_published=false`. Limpia sola pero corta relaciones legítimas.
- **B. Auto-archiva por inactividad** — si `last_viewed_at` < N días, auto `archived_at`. Solo limpia lo olvidado, más lógica.
- **C. Aviso al broker** — email/WA "tu shortlist de Juan cumplió 30 días sin apertura, ¿cerrar o reenviar?". Re-engagement pero requiere mailer + cron.

**No implementar ahora** porque:
1. Corta-relaciones legítimas sin señal real
2. Ya existe archivado manual (`archived_at` en tabla 228 + botón en editor)
3. El volumen hoy no justifica infra de cron + scheduling

**Cuándo reactivar:** cuando aparezca confusión real reportada — ej: "el cliente de Abel abrió un link de hace 4 meses y me confundió con precios viejos", o cuando el panel tenga tantas shortlists que el snooze visual (v1.1) no alcance. Evaluar B como más balanceada (preserva uso activo, limpia abandono).

### Paridad total venta/alquiler en banner broker (mapa inline + viewmode desktop)
**Tier:** v1.1
**Agregado:** 2026-04-24
**Rationale:** Hoy el broker en `/broker/[slug]/alquileres` tiene paridad **visual** con `/broker/[slug]` (mismo banner, tabs, chip ⚙ Filtros, toggle Grid|Mapa) — commit del 24 abr. Pero falta paridad **estructural** en dos puntos:

**1. Mobile — mapa inline (no overlay)**
- Hoy: tap en "Mapa" abre `alq-mobile-map-overlay` full-screen con su propio header (`Mapa de Alquileres` + X). El banner del broker queda tapado.
- Ventas: tap en "Mapa" reemplaza el feed inline; el banner queda visible arriba.
- Cambio: condicional `brokerMode && mobileMapOpen` → renderizar `MapMultiComponent` en el body del feed en lugar del overlay full-screen. Quitar el header propio (el banner ya hace de header). Ajustar `calc(100dvh - altura_banner)`.
- **Esfuerzo:** ~1-2h, riesgo bajo si se gatea con `brokerMode` (no-broker mantiene flotante + overlay actual).

**2. Desktop — toggle Grid|Mapa al banner del broker**
- Hoy: en `/broker/[slug]/alquileres` desktop, el toggle viewmode está dentro de `desktop-main` (alquileres.tsx ~L1069-1090, dos botones grandes con borde).
- Ventas: el toggle vive **en el banner** del broker (mini chip `vt-broker-viewmode`).
- Cambio: mover el toggle desktop al `alq-broker-banner` (renderizar el mismo `alq-broker-viewmode` que ya existe en mobile). Eliminar los botones inline de `desktop-main` cuando `brokerMode`.
- **Esfuerzo:** ~15-30 min. Solo JSX + un par de reglas CSS para que el toggle aparezca también en desktop dentro del banner.

**Total:** ~1.5-2.5h ambos juntos, scoped a brokerMode → cero riesgo para usuarios públicos en `/alquileres` o `/ventas`.

**Cuándo reactivar:** después de probar con Abel un par de semanas. Si el header del overlay full-screen mobile lo confunde (extra X, extra título), o si en desktop pide buscar el toggle "donde está en ventas", priorizar. Si nadie lo nota, queda parqueado — la paridad visual del banner ya cubre lo importante.

### Swipe táctil en cards del feed venta/alquileres broker mobile (virtualización)
**Tier:** baja-prioridad / esperando-señal
**Agregado:** 2026-04-25
**Rationale:** Hoy las cards del feed broker mobile (`/broker/[slug]` venta y `/broker/[slug]/alquileres`) usan foto estática + flechas para cambiar foto. Las cards del shortlist público `/b/[hash]` sí permiten swipe táctil (carrusel scroll-snap con lazy-load por slide). Asimetría intencional.

**Por qué no se hizo:** intentamos extender el carrusel `useCarousel = true` al feed broker, pero crashea mobile con "ocurrió un problema". El feed venta tiene 70+ cards × 8-10 fotos cada una. Probamos lazy-load de imágenes (`maxLoaded` por card) — no resolvió. Hipótesis: el problema es la cantidad de DOM, no de imágenes. 70 cards × N divs `vc-slide` = ~700 elementos extra con `scroll-snap-type:x mandatory` cada uno. El motor de layout mobile no aguanta.

**Para hacerlo bien se necesita virtualización de slides:**
- En cada card, solo renderizar 2-3 divs (idx ± 1), no todos.
- Cuando user hace swipe, agregar el siguiente y quitar el de atrás del DOM.
- Mantener el scroll-snap funcional con un sub-conjunto rotativo de slides.
- Esfuerzo estimado: 2-3h, no garantizado que funcione (el patrón tiene casos edge complicados con scroll-snap en containers virtualizados).

**No es prioridad porque:**
1. Foto estática + flechas en mobile broker funciona bien — el broker tiene quizás 5-7 cards visibles a la vez en su flujo de armar shortlist.
2. Tap en la foto abre el sheet con galería swipeable completa (PhotoViewer). El broker ahí sí puede ver fotos cómodamente.
3. Lo que el cliente final ve (`/b/[hash]`) sí tiene swipe — esa era la prioridad real.

**Cuándo reactivar:** si el broker reporta dolor concreto con las flechas en mobile (ej: "no puedo ver fotos rápido al armar shortlist"), o cuando alguien tenga ganas de meterse con virtualización react-virtual / react-window.

---

## Ideas sueltas sin clasificar

*(Zona libre para ideas que aparecen en conversación y todavía no se piensan. Se clasifican en la próxima revisión del backlog.)*

- **Integración WhatsApp Business API** — notificaciones y leads del link compartido entrando a un número único.
- **Simon Agent para desarrolladoras** — skill/agente separado que cruza SICI + normativas + costos construcción (ver `docs/backlog/AGENTE_DESARROLLADORAS_PRD.md`).
- **Feed privado del broker con propiedades exclusivas** — el broker sube listings que solo aparecen en su slug (no en `/ventas` público).
- **"Mi opinión" del broker por propiedad** — nota persistente visible solo al broker ("cliente Juan la vio, no le gustó la orientación").
- **Sincronización bidireccional con Intramax/CRM broker** — tomar captaciones propias del broker en lugar de solo C21/Remax.
