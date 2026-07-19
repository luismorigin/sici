# Desktop Fase 2 — Checkpoint (11 Jul 2026)

> Documento de handoff de la rama `feat/desktop-fase-2`. Si estás retomando este
> trabajo (en worktree o checkout directo), leé esto primero.

## Qué se hizo en esta rama (4 commits, local sin push)

El **detalle de propiedad desktop en `/ventas` ya NO es side sheet: es un modal
centrado estilo Zillow** (1120px, overlay 0.78 sobre el feed). Iterado con Lucho
vía mockups: v1 side angosto → v2 modal → v3 riel lleno → **v4 final** (`147ded4`).

### Estructura del modal v4 (todo en `simon-mvp/src/pages/ventas.tsx`)

| Pieza | Implementación |
|---|---|
| Nav de anclas sticky | `bsm-nav` (Resumen·Datos·Mercado·Similares + fav/cerrar). `scrollIntoView` + `scroll-margin-top` en secciones |
| Fotos full-width | 1 grande + 4 chicas, altura fija — CSS grid sobre `.bsg-scroll` dentro de `.bsm-photos`; `nth-child(n+6)` ocultas. **Las fotos son puerta, no cuerpo** |
| "Ver las N fotos" | botón `bsm-verfotos` → abre `PhotoViewer` (reusado de alquileres, z-index 9999) |
| Números grandes | `bsm-stats` (dorm · m² · baños) en col 2 del header (grid) |
| Dos columnas | wrappers `bsm-body` / `bsm-main` / `bsm-aside` — **`display:contents` en mobile** (DOM idéntico, mobile verificado intacto a 375px) |
| Tarjeta sticky | **SOLO WhatsApp + Compartir** (como "Request a tour" de Zillow — el precio NO se repite). `bsm-aside` lleva `align-self:stretch` o el sticky no tiene recorrido |
| Mercado / Similares | extraídos a consts `mercadoSection` / `similaresSection` (con ids de ancla), UNA sola vez en la columna principal |
| Mapa Ubicación | `bsm-flow-map` con `VentaMap` — props `railMapProps`/`railMapNoop` **memoizados** (identidad inestable rebuilda el mapa Leaflet) |
| Confianza | línea "X días publicado · captado por [agente · oficina]" (`bsm-trust`) |

Los tabs del sheet desktop se **eliminaron** (`sideTab` ya no existe; `showTab()`
devuelve true = un solo scroll). El panel mapa+resumen del feed queda visible
bajo el velo y **nunca se desmonta** (crash Leaflet `_leaflet_pos`).

## Decisiones de diseño de Lucho (NO revertir sin consultarle)

1. **Mockup ANTES de implementar** — no decidir diseño en código directo.
2. **Una cosa a la vez en pantalla** — el modal tapa el feed (overlay fuerte),
   sin mapa asomando por atrás.
3. **Fotos acotadas** — nada de mosaico infinito (la v3 de fotos completas daba
   6.000px de scroll).
4. El sticky lleva **solo lo esencial** — sin precio duplicado, sin mapa/mercado
   adentro, sin scroll interno.

## Qué FALTA

1. ✅ **HECHO** — **Espejo v4 en `/alquileres`** (tema claro, clase `bs-side-alq` en
   `styles/alquileres.css`, tab Costos en lugar de Compra, mapa `AlquilerMapMulti`).
   Ver `FEED_MODAL_CLARO_CHECKPOINT.md` ("ESPEJO COMPLETO ✅").
2. Review de Lucho + push/PR → **sigue pendiente** (la rama no está pusheada).
3. Pendientes viejos de fase 2:
   - URL por propiedad `/ventas/p/[id]` (SEO + OG) — pendiente.
   - "dibujar área de búsqueda / buscar en esta zona" en el mapa — **movido al backlog**
     (`docs/backlog/FILTROS_FEED_PUBLICO.md` §3).
   - Satélite — **RETIRADO** (necesita token Mapbox; Esri/Google no funcionan desde Bolivia).
     Ver CLAUDE.md "Rediseño DESKTOP feeds".

## Cómo verificar (gotchas)

- **Playwright headless, NO el preview MCP** (no hidrata el layout desktop).
  Script listo: `simon-mvp/_shot-modal.mjs` (untracked) — dev server corriendo
  en :3000, `node _shot-modal.mjs` desde `simon-mvp/`.
- Ver también `docs/design/VERIFICAR_FEEDS_DESKTOP.md`.
- NUNCA `npm run build` con el dev server corriendo.
