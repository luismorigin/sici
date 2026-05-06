# Sistema de Reportes Broker → SICI — Brief para PRD

**Estado:** brief de alcance acordado, pendiente PRD formal
**Fecha:** 2026-05-05
**Contexto:** input para el PRD-creator que arranca el diseño técnico/UX del feature.

## Problema

Algunas propiedades en el feed broker tienen datos incorrectos al momento de incluirlas en una shortlist enviada al cliente final. El broker detecta los errores pero hoy no tiene forma de:
1. Reportarlos para que SICI los corrija.
2. Evitar que la información incorrecta llegue al cliente (más allá de no marcar la prop manualmente).

Resolver esto impacta la confianza del broker en el producto y la calidad de la información que llega al cliente final.

## Hotfix ya en producción (no parte del PRD)

5 commits aplicados a `main` el 2026-05-05 antes de armar este brief:
- `87884bb` — badge interno "Confirmar tipo de cambio" oculto al cliente final en `/b/[hash]` (era leak de señal interna). Toast aviso al broker al marcar prop con `tc_sospechoso`.
- `8deed85` + `93b1b09` + `84178a7` — fix UX del toast (CSS, posición, SVG triángulo amarillo, duración 5s, kind `info`/`warn`).

El hotfix cubre **un solo tipo de error** (TC sospechoso) con **un solo canal** (toast efímero al broker). Este PRD diseña la solución general, persistente y multi-error.

## Decisiones de alcance acordadas

### 1. Quién reporta
**Solo broker** — en `/broker/[slug]` (venta) y `/broker/[slug]/alquileres`. No público (`/ventas`, `/alquileres`) ni cliente final (`/b/[hash]`).

**Rationale:** brokers son expertos del mercado Equipetrol, sus reportes son alta señal/bajo ruido. Abrir al público se evalúa después si hay demanda.

### 2. Tipos de error (8 categorías)

1. **TC paralelo publicado como oficial** — broker confirma o niega el flag `tc_sospechoso` ya existente.
2. **Precio incorrecto** — sin más detalle, broker explica en nota libre.
3. **Área m² incorrecta** — campo `area_m2` mal extraído.
4. **Dormitorios o baños incorrectos** — campos `dormitorios` / `banos` mal extraídos.
5. **Vendida pero sigue activa** — la prop ya se vendió pero el portal/pipeline la mantiene activa.
6. **Ya alquilada** (solo alquiler) — equivalente a "vendida" pero para `/alquileres`.
7. **Nombre del edificio incorrecto** — caso especial, ver nota más abajo.
8. **Zona/GPS mal asignada** — el trigger `trg_asignar_zona_venta` puso la prop en zona incorrecta.

**Caso especial: nombre de edificio.** Tiene dos sub-casos:
- (a) Prop matcheada con `id_proyecto_master` incorrecto → fix = re-matchear.
- (b) Prop sin proyecto matcheado y `nombre_edificio` extraído por LLM mal → fix = corregir campo.

El admin debe poder discernir cuál es. Por eso el campo libre opcional (#3 abajo) es clave.

### 3. Acción al reportar
**Solo registra a BD + Slack** — no oculta nada del feed, no afecta a otros brokers, no fuerza al broker a desmarcar la prop. Si el broker quiere protegerse, simplemente no marca la prop con ⭐ en su shortlist (su flow normal).

**Rationale:** evita falsos positivos que puedan ocultar props legítimas. La protección al cliente del broker pasa por la decisión consciente del broker, no por automation agresiva.

### 4. Campo libre opcional
**Sí** — agregar textarea opcional (max 200 chars) tipo "Nota para SICI" donde el broker puede sugerir el valor correcto, dar contexto, o adjuntar evidencia textual ("vista en bombo del agente Juan el 15 abril", "el verdadero nombre es Torre Mistral, no Edificio Mistral").

**Rationale:** reduce ambigüedad para el admin sin agregar complejidad significativa al broker.

### 5. Vinculación al broker reportador
**Sí** — FK a `simon_brokers.id` siempre. El reporte registra qué broker lo hizo.

**Rationale:** alta señal de calidad (brokers más activos = más reportes), permite contactar al broker si hay duda, permite construir métricas de "broker confiable".

### 6. Workflow admin
- **Slack al canal de alertas SICI** cada vez que llega un reporte (notificación inmediata).
- **Panel `/admin/property-reports`** con cola: pendientes / en revisión / resueltos.
- Acciones desde el panel: link directo al editor de la prop (`/admin/propiedades/[id]`), marcar como resuelto, marcar como falso positivo, asignar a alguien (futuro).
- **Sin notificación de vuelta al broker** en MVP — no hay canal interno (no hay notification center, no se confirmó que brokers quieran WA del producto). Pendiente v2: panel "Mis reportes" en `/broker/[slug]/perfil` con estado pendiente/resuelto.

### 7. Métricas
- # reportes por semana (tendencia de calidad de datos)
- Tiempo medio de resolución (pendiente → resuelto)
- % reportes confirmados como válidos vs falsos positivos (calidad del señal del broker)
- Reportes recurrentes sobre la misma prop (señal de bug en el pipeline que requiere fix sistémico)

## Lo que el PRD debe decidir

El brief acordó **el QUÉ**. El PRD-creator debe diseñar:

1. **Schema de BD** — tabla `broker_property_reports` con columnas, FKs, índices, triggers. Considerar `tipo_error` enum vs múltiples bool, vs JSONB de checkboxes (un reporte puede tener varios tipos al mismo tiempo).
2. **API routes** — `/api/broker/property-reports` POST + GET (lista del broker) + admin endpoints.
3. **UX broker** — botón "Reportar" en cards (¿posición? ¿qué pasa con los íconos existentes ⭐ ⤴ 💬?), modal con checkboxes + textarea, confirmación.
4. **UX admin** — panel `/admin/property-reports` con cola, filtros (status, broker, fecha, tipo), acciones, link a editor.
5. **Slack webhook** — qué info incluir en el mensaje (broker, prop, tipo, nota).
6. **Fases** — qué entra en MVP vs Fase 2 (ej: panel admin básico vs analytics, métricas en `/admin/salud` vs separadas).

## Referencias en el codebase

- **Hotfix UX del toast TC**: `simon-mvp/src/pages/ventas.tsx` — funciones `Toast` (~L1416), `showToast` (~L1714), CSS `.ventas-toast` y `.ventas-toast-warn` (~L2880).
- **Backlog del banner agregado**: `docs/broker/BACKLOG.md` entrada "Banner persistente agregado de calidad de datos en shortlist" — lo decidido es que el banner va dentro de este sistema, como Fase 1 (visualización del estado de calidad del set de favoritos del broker).
- **Tabla brokers**: `simon_brokers` (migración 231). FK target.
- **Tabla shortlists**: `broker_shortlists` (migración 228) + `broker_shortlist_items` — para entender cómo se relacionan reportes con shortlists (¿un reporte puede asociarse a una shortlist específica? probablemente no — el reporte es sobre la prop, no sobre el envío).
- **Sistema HITL existente**: `/admin/supervisor/*` — patrón de cola admin para revisar/resolver. Buen referente para el panel `/admin/property-reports`.
- **Ejemplo UX externo**: Infocasas tiene patrón similar (botón "Reportar" en card → modal con checkboxes). Diferencia clave: ellos son portal (responsable = agente original), nosotros somos agregador (responsable = SICI o agente, depende del campo).

## Próximo paso

Iniciar nueva conversación con foco. Sugerencia: invocar al agente `dev-workflows:prd-creator` con este brief como input + pedirle producir un PRD formal en `docs/broker/REPORTES_DATOS_PRD.md`.
