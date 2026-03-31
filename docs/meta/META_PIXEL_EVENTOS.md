# Meta Pixel — simonbo.com

## Configuracion

- **Pixel 1 (original):** `934634159284471` — Business Manager principal (analytics/audiencias)
- **Pixel 2 (Ads):** `1353819603435799` — "Simon Pixel Ads", vinculado a la cuenta publicitaria
- **Instalacion:** `_app.tsx` via `next/script` con `strategy="lazyOnload"`. Ambos pixels comparten el mismo snippet fbq (doble `fbq('init', ...)`)
- **Scope:** Solo rutas publicas (excluye `/admin/*`, `/broker/*`, y modo debug)
- **Helper:** `fbqTrack()` en `lib/meta-pixel.ts` — unico punto de disparo. Dispara a AMBOS pixels automaticamente (fbq envia a todos los pixels inicializados)

### Por que 2 pixels

El pixel original (`934634159284471`) esta en un Business Manager distinto al de la cuenta publicitaria que corre las campanas. Meta requiere que el pixel pertenezca al mismo Business Manager de la cuenta de ads para optimizar campanas (Advantage+, conversiones, audiencias lookalike). El segundo pixel (`1353819603435799`) esta en el Business Manager correcto para ads.

## Eventos implementados

### Tier 1 — Conversiones core

| Evento Meta | Trigger | Archivo | Notas |
|-------------|---------|---------|-------|
| `PageView` | Automatico en cada pagina | `_app.tsx` | Incluido en el snippet base |
| `Lead` | Click WhatsApp (alquileres) | `alquileres.tsx`, `CompareSheet.tsx` | Cooldown 30s por propiedad. Param `fuente` distingue: `card_desktop`, `card_mobile`, `map_card`, `map_card_mobile`, `bottom_sheet`, `comparativo` |
| `Contact` | Formulario contactar broker (venta premium) | `ContactarBrokerModal.tsx` | Dispara al completar exitosamente |

### Tier 2 — Senales de intencion

| Evento Meta | Trigger | Archivo | Notas |
|-------------|---------|---------|-------|
| `ViewContent` | Abrir detalle propiedad / swipe mobile | `alquileres.tsx` | Incluye `content_ids`, `value` (BOB), `currency` |
| `Search` | Aplicar filtros | `alquileres.tsx` | `search_string` con zonas + dorms + precio max |

## Tier 3 — Backlog (NO implementado)

| Evento | Donde | Cuando implementar | Prioridad |
|--------|-------|--------------------|-----------|
| `filter_zona` (custom) | Seleccion zona especifica | >500 sessions/semana | Baja |
| `view_mercado` (custom) | Visita `/mercado/equipetrol/*` | Cuando haya campana de contenido | Baja |
| `scroll_feed` (custom) | Scroll >50% del feed | Para separar engaged vs lurkers | Baja |
| `AddToWishlist` | Favoritos en BD | Cuando se implemente retencion | Media |
| **CAPI (server-side)** | `/api/lead-alquiler`, `/api/contactar-broker` | Fase 2 | Alta |

## Ventas

`/ventas` tiene tracking GA4 (ver `GA4_EVENTOS.md`) pero NO tiene Meta Pixel todavia. Agregar cuando se activen campanas de venta:
- `Lead` en click WhatsApp (`click_whatsapp_venta`)
- `ViewContent` en abrir detalle (`open_detail_venta`)
- `Search` en aplicar filtros (`apply_filters_venta`)

## Notas tecnicas

- `fbqTrack()` es fire-and-forget, no-op si el pixel no cargo (misma filosofia que `trackEvent` de GA4)
- Los eventos Meta se disparan SIEMPRE junto al evento GA4 equivalente — no reemplazar, complementar
- `value` + `currency` en `Lead` y `ViewContent` permiten optimizar campanas por valor (Meta Advantage+)
- Para CAPI futuro: usar `access_token` + `event_id` para deduplicar browser + server events

## Verificacion

1. Instalar [Meta Pixel Helper](https://chrome.google.com/webstore/detail/meta-pixel-helper) en Chrome
2. Abrir simonbo.com → verificar `PageView`
3. `/alquileres` → aplicar filtro → verificar `Search`
4. Abrir detalle propiedad → verificar `ViewContent`
5. Click WhatsApp → verificar `Lead`
6. Verificar en [Meta Events Manager](https://business.facebook.com/events_manager) que los eventos llegan con parametros
7. Confirmar que NO dispara en `/admin/*` ni `/broker/*`
