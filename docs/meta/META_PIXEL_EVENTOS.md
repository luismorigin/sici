# Meta Pixel — simonbo.com

## Configuracion

- **Pixel ID:** `934634159284471`
- **Instalacion:** `_app.tsx` via `next/script` con `strategy="lazyOnload"`
- **Scope:** Solo rutas publicas (excluye `/admin/*`, `/broker/*`, y modo debug)
- **Helper:** `fbqTrack()` en `lib/meta-pixel.ts` — unico punto de disparo

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

`/ventas` no tiene tracking de eventos GA4 todavia. Cuando se agregue, replicar el mismo patron con `fbqTrack()`:
- `Lead` en click WhatsApp
- `ViewContent` en abrir detalle
- `Search` en aplicar filtros

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
