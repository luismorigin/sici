# Sistema de Prospección y Demo Público de Brokers

Documento de referencia para el sistema de prospección de brokers captadores de Equipetrol y los demos públicos `/broker/demo` y `/b/demo`. Para historia y diseño de Simón Broker base, ver `docs/broker/README.md`.

## 1. Demo público (sin login)

URLs en producción:
- `simonbo.com/broker/demo` — perspectiva del broker activo (inventario, panel, shortlists)
- `simonbo.com/broker/demo/alquileres` — mismo flujo en alquiler
- `simonbo.com/b/demo` — perspectiva del cliente final (cómo recibe la shortlist)

**Migración 236** crea row real en `simon_brokers` con `slug='demo'` (nombre `[Tu Nombre]`, telefono +59176308808 → founder, status='activo') y row en `broker_shortlists` con `hash='demo'` (max_views=999999, expires_at=2099, status='active') + 8 items curados de Equipetrol.

**Sanitización server-side** de captadores en `lib/demo-mode.ts`:
- `agente_nombre` → null
- `agente_telefono`, `agente_whatsapp` → fake `+59100000000` (placeholder para que el botón se renderice como en producción pero sin filtrar dato real)
- `agente_oficina` se mantiene (Remax/C21/BI son públicos en portales originales)

**Intercepción de clicks WA**:
- Links `<a href="wa.me/...">` capturados via `document.addEventListener('click', ..., true)` en `BrokerDemoOverlay.tsx`
- Handler programático `triggerWhatsAppCapture` (alquiler) interceptado via `setDemoModeForCapture(true)` en `useWhatsAppCapture.tsx`
- Ambos disparan evento custom `simon:demo-blocked` que el overlay traduce a modal educativo

**Componentes clave**:
- `components/demo/BrokerDemoOverlay.tsx` — banner top arena fixed (32px), pill ⓘ, listener wa.me, modal educativo
- `components/demo/BrokerDemoIntroSheet.tsx` — bottom sheet primera visita (cookie `simon_demo_broker_intro_seen` 365d), 4 bullets "Qué incluye" + 3 steps "Probá así"
- `components/demo/DemoIntroBottomSheet.tsx` — equivalente para `/b/demo` (perspectiva cliente)
- `components/demo/DemoFooterWatermark.tsx` — pie con CTA pill verde salvia "Activá tu cuenta de Simón"
- `components/demo/DemoBackToBrokerBanner.tsx` — banner top en `/b/demo?ref=demo-broker` para volver al panel broker

**Acciones bloqueadas en demo (con modal educativo)**:
- WA captador → "Captador disponible en versión real"
- Enviar shortlist → "Así le llega a tu cliente" (con CTA secundario "Ver el ejemplo →" que abre `/b/demo?ref=demo-broker`)
- Favoritos UI-funcional sin persistir (sesión limpia, no hidrata localStorage)

## 2. Panel de prospección `/admin/prospection`

Sistema interno del founder para outreach a brokers captadores de Equipetrol (NO son usuarios de Simón — son agentes de Remax/C21/BI cuyo contacto está en `propiedades_v2.agente_telefono`).

**Migración 237**: tabla `broker_prospection` con `(telefono PK, nombre, agencia, tier 1|2|3, props_activas, props_recientes_90d, status pending|msg1_sent|msg2_sent|msg3_sent, fecha_msg1/2/3, notas, created_at, updated_at)`. RLS deny-all.

**Migración 238**: agrega `dias_pub_min` (publicación más reciente) y `dias_pub_max` (más antigua) — ordenamiento por antigüedad en el panel.

**RPC `populate_broker_prospection()`**: agrupa desde `buscar_unidades_simple` por `agente_telefono` normalizado, filtra a las 6 zonas canónicas de Equipetrol, calcula tier por count (T1: 1-5, T2: 6-10, T3: 11+) y conteos de antigüedad. UPSERT preservando status / fechas / notas. Idempotente.

**Distribución actual**: T1=169 brokers, T2=6, T3=2 (177 total).

**3 mensajes WA secuenciales** (templates en `pages/admin/prospection.tsx`):
1. Msg 1: imagen `/public/demo-broker-msg1.png` + caption corto "Así verían tus clientes tus propiedades con Simón."
2. Msg 2: bullets de valor con `[nombre]` placeholder + link `simonbo.com/broker/demo`
3. Msg 3: cierre "20 brokers fundadores" + precio congelado 12 meses

**Drawer de respuestas pre-armadas** (`components/admin/ProspectionResponsesDrawer.tsx`): 12 respuestas + 4 reglas. 2 entry points: botón global (sin broker, solo copy) y botón por fila (con broker, habilita "Abrir WA"). Reemplaza `[nombre]` placeholder en respuestas que lo tienen.

**Modal Msg 1** (`components/admin/ProspectionMsg1Modal.tsx`): preview de imagen + botón "Copiar imagen al clipboard" (Clipboard API + ClipboardItem) con fallback a abrir nueva pestaña. Botón "Copiar caption". Botón "Abrir WhatsApp con caption".

**API routes**:
- `GET /api/admin/prospection` — list + stats con filtros (tier/status/agencia/search) + sort dinámico (sort_props, sort_dias)
- `POST /api/admin/prospection/refresh` — ejecuta la RPC populate
- `PATCH /api/admin/prospection/[telefono]` — actualiza status (con `stamp_dates` para setear fecha_msgN si era NULL) + notas

**Lib server-side**: `lib/broker-prospection.ts` (queries con service_role).

## 3. Activación

1. Aplicar migraciones 236, 237, 238 en Supabase (idempotentes)
2. Subir imagen `simon-mvp/public/demo-broker-msg1.png` (subida en commit `7a1d8aa`)
3. Login admin → `/admin/prospection` → click "Refrescar lista" para popular los 177 brokers iniciales

## 4. Iteración

**Cambiar copy de mensajes 1/2/3**: editar templates en `simon-mvp/src/pages/admin/prospection.tsx` (constantes `MSG1_CAPTION`, `MSG2_TEMPLATE`, `MSG3`).

**Cambiar respuestas pre-armadas**: editar arrays `RESPUESTAS` y `REGLAS` en `simon-mvp/src/components/admin/ProspectionResponsesDrawer.tsx`.

**Cambiar imagen Msg 1**: reemplazar `simon-mvp/public/demo-broker-msg1.png`. Si convertís a webp para reducir peso, ajustar `MSG1_IMAGE_PATH` en `ProspectionMsg1Modal.tsx`.

**Agregar/quitar tiers o thresholds**: editar el CASE de la RPC `populate_broker_prospection()` en `sql/migrations/238_broker_prospection_antiguedad.sql` (la 238 reemplaza la 237 por completo).

**Agregar columnas de tracking** (ej. fecha de respuesta del broker, sí/no aceptó reunión): migración nueva con ALTER TABLE + actualizar interface `ProspectionBroker` en `lib/broker-prospection.ts` y panel.

## 5. Limitaciones conocidas

- WA `wa.me/?text=` no permite adjuntar imagen via URL. Por eso Msg 1 abre modal con "Copiar imagen + Abrir WA con caption" (2 pasos).
- Si un broker desaparece de `v_mercado_venta` (todas sus propiedades se vendieron/inactivaron), su row queda en `broker_prospection` con datos viejos. Re-correr la RPC NO actualiza esos a `props_activas=0`. Si surge el caso, agregar UPDATE separado en la RPC.
- Sin paginación en `/admin/prospection` (177 caben en una tabla scrollable). Si crece >500 brokers, agregar.
