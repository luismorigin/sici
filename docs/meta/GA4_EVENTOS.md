# Google Analytics 4 — simonbo.com

## Configuracion

- **Measurement ID:** `G-Q8CRRJD6SL`
- **Instalacion:** `_app.tsx` via `next/script` con `strategy="lazyOnload"`
- **Scope:** Solo rutas publicas (excluye `/admin/*`, `/broker/*`, y modo debug `?debug=1`)
- **Helper:** `trackEvent()` en `lib/analytics.ts` — unico punto de disparo

## Eventos por pagina

### `/alquileres` — 17 eventos

#### Conversiones

| Evento | Trigger | Params | Notas |
|--------|---------|--------|-------|
| `click_whatsapp` | Click boton WhatsApp | `property_id`, `zona`, `precio`, `source` | source: `card_desktop`, `card_mobile`, `map_card`, `map_card_mobile`, `bottom_sheet`, `comparativo` |

#### Engagement

| Evento | Trigger | Params | Notas |
|--------|---------|--------|-------|
| `page_enter_alquiler` | Cargar pagina | — | Marca inicio de sesion |
| `session_alquiler` | `visibilitychange` → hidden (una sola vez) | `duration_seconds`, `max_scroll_depth`, `cards_viewed`, `total_cards`, `had_interaction` | Resumen de sesion. Fix 3 abr 2026: ahora single-fire (antes se disparaba en cada cambio de tab, inflaba 1.7x) |
| `bounce_no_action` | Salir sin interactuar (>3s) | `duration_seconds` | Fix 3 abr 2026: eliminados falsos positivos por cambio de tab momentaneo |
| `view_property` | Ver card / swipe mobile | `property_id`, `property_name`, `position` | Cada card vista |
| `open_detail` | Abrir bottom sheet | `property_id`, `property_name` | Detalle expandido |
| `swipe_photos` | Primer swipe de fotos en card o bottom sheet | `property_id`, `photo_index`, `total_photos`, `source` | source: `card`, `bottom_sheet`. Reemplaza `view_photos` (eliminado 3 abr 2026) |
| `apply_filters` | Aplicar filtros | `zonas`, `dorms`, `precio_max`, `total_results` | Que buscan los usuarios |
| `no_results` | Filtros sin resultados | `zonas`, `dorms`, `precio_max` | Demanda no cubierta |
| `toggle_favorite` | Agregar/quitar favorito | `property_id`, `action`, `total_favs` | action: `add` / `remove` |
| `open_compare` | Abrir comparativo | `property_ids`, `count` | Usuarios en fase de decision |
| `switch_view` | Cambiar grid/mapa | `view_mode` | `grid` o `map` |
| `select_map_pin` | Click pin en mapa | `property_id` | Interaccion con mapa |
| `open_map_mobile` | Abrir mapa en mobile | — | Engagement mobile |
| `share_alquiler` | Compartir propiedad | `property_id`, `zone`, `price`, `dorms` | Viralidad |
| `open_shared_alquiler` | Abrir link compartido | `property_id` | Tracking de links compartidos |
| `reset_filters` | Limpiar filtros aplicados | `results_count` | Abandonar busqueda filtrada. Agregado 3 abr 2026 |
| `lead_gate` | Completar gate "Ver anuncio original" | `property_id`, `property_name`, `zona` | Lead con nombre/tel/correo. Agregado 3 abr 2026 |
| `chat_open` | Usuario abre el chat bot | — | Agregado 4 abr 2026 |
| `chat_message` | Usuario envia mensaje al bot | `message_length` | Agregado 4 abr 2026 |
| `chat_search` | Mensaje con intent de busqueda | `dorms`, `precio_max`, `zona`, `amoblado`, `mascotas`, `parqueo`, `piscina` | Solo params detectados. Nivel 3: qué busca la gente |
| `chat_click_property` | Click en card de propiedad desde el chat | `property_id`, `property_name`, `zona` | Nivel 2: bot → feed. Agregado 4 abr 2026 |
| `chat_lead` | WhatsApp lead desde el chat bot | `property_id`, `zona`, `fuente` | fuente siempre 'chat-bot'. Agregado 4 abr 2026 |
| `nudge_filter_shown` | Pill "Filtra por zona o precio" aparece | `card_index` | Se muestra 1 vez/sesion tras 15+ cards sin open_detail ni filtro. Agregado 4 abr 2026 |
| `nudge_filter_tap` | Usuario toca el pill | — | Scrollea a filter card y abre chips |
| `nudge_filter_dismiss` | Usuario cierra el pill con X | — | Auto-dismiss a los 5s no genera evento |

### `/ventas` — 10 eventos

#### Conversiones

| Evento | Trigger | Params | Notas |
|--------|---------|--------|-------|
| `click_whatsapp_venta` | Click boton WhatsApp | `property_id`, `property_name`, `zona`, `precio_usd`, `source` | source: `card_mobile`, `detail_sheet` |
| `lead_gate_venta` | Completar gate "Ver anuncio" | `property_id`, `property_name`, `zona` | Lead capturado con nombre/tel/correo |

#### Engagement

| Evento | Trigger | Params | Notas |
|--------|---------|--------|-------|
| `open_detail_venta` | Abrir bottom sheet | `property_id`, `property_name`, `zona`, `precio_usd` | Detalle expandido |
| `view_photos_venta` | Abrir galeria fotos | `property_id`, `property_name`, `fotos_count` | Indica interes alto |
| `apply_filters_venta` | Aplicar filtros | `zonas`, `dorms`, `precio_min`, `precio_max`, `estado_entrega`, `total_results` | Incluye preventa/inmediata |
| `no_results_venta` | Filtros sin resultados | `zonas`, `dorms` | Demanda no cubierta |
| `toggle_favorite_venta` | Agregar/quitar favorito | `property_id`, `action` | action: `add` / `remove` |
| `share_venta` | Compartir propiedad | `property_id`, `property_name`, `zona` | Viralidad |
| `switch_view_venta` | Cambiar grid/mapa | `view_mode` | `grid` o `map` |
| `open_map_mobile_venta` | Abrir mapa en mobile | — | Engagement mobile |

### `/` (landing) — 1 evento

| Evento | Trigger | Params |
|--------|---------|--------|
| `landing_view` | Cargar pagina | — |

### `/filtros-v2 → /formulario-v2 → /resultados-v2` (funnel premium) — 5 eventos

| Evento | Trigger | Archivo | Notas |
|--------|---------|---------|-------|
| `filtros_started` | Entrar a filtros | `filtros-v2.tsx` | Inicio funnel |
| `formulario_completed` | Completar formulario | `formulario-v2.tsx` | Mid-funnel |
| `resultados_view` | Ver resultados | `resultados-v2.tsx` | Llegaron al final |
| `favorite_toggle` | Toggle favorito en resultados | `resultados-v2.tsx` | Seleccion de propiedades |
| `favorite_complete` | Completar seleccion (max) | `resultados-v2.tsx` | Funnel completado |
| `premium_requested` | Solicitar informe premium | `resultados-v2.tsx` | Conversion premium |

## Paginas sin tracking custom

| Pagina | Tracking | Notas |
|--------|----------|-------|
| `/mercado/equipetrol/*` | Solo `page_view` automatico | Clarity cubre scroll depth y heatmaps |
| `/condado-vi` | Solo `page_view` automatico | Landing de cliente externo |
| `/admin/*` | Excluido | No trackear admin |
| `/broker/*` | Excluido | No trackear broker |

## Notas tecnicas

- `trackEvent()` es fire-and-forget, no-op si GA no cargo
- `strategy="lazyOnload"` difiere GA hasta despues de `window.onload` + `requestIdleCallback` — zero impacto en FCP/LCP
- `?debug=1` en URL desactiva GA4 completamente (para testing sin contaminar datos)
- Los eventos GA4 se disparan junto a Meta Pixel cuando aplica — no reemplazar, complementar
- Eventos de alquileres usan `trackEvent` local en `alquileres.tsx` (legacy). Ventas usa `trackEvent` de `lib/analytics.ts` (unificado)

## Backlog — eventos pendientes

| Evento | Pagina | Cuando implementar | Prioridad |
|--------|--------|--------------------|-----------|
| `click_whatsapp_venta` via Meta Pixel | `/ventas` | Cuando se activen campanas de venta | Media |
| `ViewContent` Meta Pixel en ventas | `/ventas` | Cuando se activen campanas de venta | Media |
| Scroll depth custom | `/mercado/*` | Si Clarity no es suficiente | Baja |
| Unificar `trackEvent` en alquileres | `/alquileres` | Refactor menor, no urgente | Baja |

### Verificación pendiente

- **`bounce_no_action` post-fix (18 abr 2026)** — medir en GA4 a partir del 20 abr 2026 (48h post-deploy). Filtrar `event_name=bounce_no_action` en Explore, ventana últimos 2 días. Esperado: 15-25% de sesiones de `/alquileres`. Si sigue en 0 → revisar si algún otro handler está marcando `hasInteracted=true` automáticamente. Si sale >40% → revisar si el umbral `duration > 3` es muy laxo.

## Cortes de datos

Fechas donde los eventos cambiaron y los datos antes/despues NO son comparables directamente:

| Fecha | Cambio | Efecto en datos |
|-------|--------|-----------------|
| 27 feb 2026 | Fix bug `click_whatsapp` en render | Pre-27 feb: clicks inflados (se disparaba en cada render). Usar `leads_alquiler` como fuente de verdad |
| 3 abr 2026 | `session_alquiler` single-fire | Pre-3 abr: sesiones infladas ~1.7x (se re-disparaba en cada `visibilitychange`). `bounce_no_action` tenia falsos positivos |
| 3 abr 2026 | `view_photos` eliminado, reemplazado por `swipe_photos` | `view_photos` siempre fue 0 (codigo muerto). `swipe_photos` es el primer dato real de interaccion con fotos |
| 3 abr 2026 | Agregados `reset_filters`, `lead_gate` | Sin datos anteriores para estos eventos |
| 3 abr 2026 | `keepalive: true` en fetch de leads WA | Pre-3 abr: BD sub-reportaba leads vs GA4 (~83% perdidos en mobile). Post-fix deberian converger |
| 4 abr 2026 | Agregados `nudge_filter_shown/tap/dismiss` | Pill aparece tras 15+ cards sin interaccion. Sin datos anteriores |
| 8 abr 2026 | `utm_source` en `leads_alquiler` | Pre-8 abr: `utm_source=NULL` para todos los leads (no se capturaba). Split paid/orgánico confiable solo desde esta fecha |
| 18 abr 2026 | Fix `bounce_no_action` falso positivo | Pre-18 abr: `hasInteracted=true` se marcaba en el view_property automático del scroll-snap inicial → `bounce_no_action` siempre 0 (imposible). Post-fix: solo interacciones explícitas marcan `hasInteracted`, volumen esperado 15-25% de sesiones |

## Verificacion

1. Abrir simonbo.com (sin `?debug=1`)
2. Abrir Chrome DevTools → Network → filtrar `collect?` (requests a GA)
3. Navegar a `/alquileres` → verificar `page_enter_alquiler`
4. Aplicar filtro → verificar `apply_filters`
5. Click WhatsApp → verificar `click_whatsapp`
6. Navegar a `/ventas` → verificar `page_view` automatico
7. Click WhatsApp en ventas → verificar `click_whatsapp_venta`
8. Verificar en [GA4 DebugView](https://analytics.google.com/analytics/web/#/a.../debugview) que los eventos llegan con parametros
9. Confirmar que `?debug=1` desactiva todo
