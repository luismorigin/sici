# Performance Learnings — simonbo.com

Lecciones aprendidas optimizando Core Web Vitals. Referencia para futuros cambios.

## LCP (Largest Contentful Paint)

### Preload debe coincidir con la URL final (3 abr 2026)

**Problema:** `<link rel="preload" href="https://cdn.21online.lat/foto.jpg">` preloadeaba la imagen raw, pero Next.js Image pedía `/_next/image?url=...&w=640&q=75`. Doble descarga.

**Fix:** Preload apunta a la URL de Next.js Image:
```html
<link rel="preload" as="image" href="/_next/image?url=${encodeURIComponent(url)}&w=640&q=75" fetchPriority="high" />
```

**Regla:** Si usás `next/image`, el preload debe apuntar a `/_next/image?url=...&w=...&q=...`, no a la URL del CDN.

### Usar initialProperties (SSR) para preload, no state (3 abr 2026)

**Problema:** Preload usaba `properties[0]` (state). Después del `useEffect` fetch, properties se reemplazaba y la primera foto podía cambiar — preload desperdiciado.

**Fix:** Usar `initialProperties[0]` (prop de `getStaticProps`) que está disponible en el HTML estático antes de hidratación.

### `sizes` preciso en next/image (3 abr 2026)

**Problema:** `sizes="100vw"` hacía que Next.js sirviera imagen de 1920px en desktop cuando la card ocupa mucho menos.

**Fix:** `sizes="(max-width: 767px) 100vw, 50vw"` — mobile recibe 640px, desktop 960px.

**Regla:** Nunca usar `sizes="100vw"` en imágenes que no ocupan el viewport completo.

### Cadena serial SSR → fetch → render → image (diagnóstico)

La página tiene `getStaticProps` con 8 propiedades pre-renderizadas, pero un `useEffect` en mount hace fetch de 200 propiedades y reemplaza las iniciales. La imagen LCP no empieza a cargar hasta que ese fetch termina (~250ms extra). El preload mitiga esto parcialmente.

## INP (Interaction to Next Paint)

### setState en scroll handler — guard con ref (3 abr 2026)

**Problema:** `setActiveCardIndex(idx)` se llamaba en cada `requestAnimationFrame` durante scroll (~10-15 veces por swipe). Cada setState disparaba re-render de 200+ items en `feedItems.map()`.

**Fix:**
```js
const activeCardIdxRef = useRef(0)
// En scroll handler:
if (idx !== activeCardIdxRef.current) {
  activeCardIdxRef.current = idx
  setActiveCardIndex(idx)  // Solo cuando cambia de card
}
```

**Impacto:** ~50-80ms menos de INP.

**Regla:** En scroll handlers con RAF, usar ref para el valor rápido y solo setState cuando el valor realmente cambia.

### React.memo con custom comparator (3 abr 2026)

**Problema:** `MobilePropertyCard` recibía callbacks inline (`() => toggleFavorite(id)`) que cambiaban en cada render. `React.memo` default haría shallow compare y siempre re-renderizaría.

**Fix:** Custom comparator que solo chequea las props que importan:
```js
const MobilePropertyCard = memo(function MobilePropertyCard({ ... }) {
  ...
}, (prev, next) =>
  prev.property.id === next.property.id &&
  prev.isFavorite === next.isFavorite &&
  prev.favoritesCount === next.favoritesCount &&
  prev.isFirst === next.isFirst &&
  prev.isSpotlight === next.isSpotlight &&
  prev.petFilterActive === next.petFilterActive
)
```

**Regla:** Cuando no podés estabilizar callbacks con `useCallback` (porque dependen de datos per-item), usar `React.memo` con comparator que ignora los callbacks.

### useMemo en arrays construidos en render (3 abr 2026)

**Problema:** `feedItems` (200+ items) se reconstruía en cada render aunque `properties` no cambió.

**Fix:** `useMemo` con deps `[properties, spotlightProperty, spotlightId]`.

**Impacto:** ~20-30ms menos.

**Regla:** Arrays/objetos construidos en render que se pasan a `.map()` deben estar en `useMemo`.

### scroll-snap-stop: always — no quitar (3 abr 2026)

`scroll-snap-stop: always` agrega ~50-80ms de layout recalc pero es necesario para el UX TikTok (una card por swipe). Sin él, swipes rápidos saltean cards. No es optimizable sin cambiar el UX.

## Tracking GA4

### visibilitychange dispara múltiples veces (3 abr 2026)

**Problema:** `session_alquiler` se disparaba en cada `visibilitychange → hidden`, no solo al salir. Abrir WhatsApp, recibir notificación, o cambiar de app lo triggeraba. Resultado: 1.7x sesiones infladas + bounces falsos.

**Fix:** Flag `sessionSent` en el ref de analytics:
```js
if (a.sessionSent) return
a.sessionSent = true
```

**Regla:** Eventos de sesión deben ser single-fire. Usar flag en ref, no depender de `visibilitychange` como proxy de "usuario se fue".

### keepalive en fetch fire-and-forget (3 abr 2026)

**Problema:** `window.open()` (abre WhatsApp) antes del `fetch('/api/lead-alquiler')`. En mobile, el browser suspende/mata el tab antes de que el fetch complete. GA4 (gtag) ya disparó pero el POST a BD se pierde.

**Fix:** `keepalive: true` en el fetch options.

**Regla:** Todo fetch fire-and-forget que va después de `window.open()` o navegación necesita `keepalive: true`.

### BD puede tener MAS leads que GA4 (3 abr 2026)

Adblockers bloquean `gtag()` (dominio googletagmanager.com) pero no bloquean fetches a tu propio dominio (`/api/lead-alquiler`). Resultado: BD > GA4 para conversiones. `leads_alquiler` es fuente de verdad, no GA4.

### Código muerto en tracking (3 abr 2026)

`view_photos` tenía 0 eventos porque la función `openViewer` que lo disparaba nunca era llamada — el flujo de fotos cambió a sliders en card/bottom-sheet. Reemplazado por `swipe_photos` que mide el primer swipe de fotos real.

**Regla:** Auditar periódicamente que los eventos GA4 correspondan al UX actual, no al UX de cuando se implementaron.

## Landing Performance (6 feb 2026)

### Round 1: Lighthouse 72→88
- Fonts: `@import url()` → `next/font/google` (elimina render-blocking CSS)
- `getStaticProps` + ISR (6h) para datos de landing
- framer-motion: `next/dynamic` condicional
- First Load JS: 149kB → 92.8kB (-38%)

### Round 2: Mobile unused JS
- `prefetch={false}` en Links de landing (~96 KiB saved)
- Reducir font weights (Cormorant 3→1, Manrope 4→2)

### Round 3: FCP/LCP mobile
- `backdrop-filter: blur()` es MUY caro en mobile (4x CPU throttle, +500ms FCP)
- Preconnects stale desperdician TLS connections (~150ms RTT cada uno en 4G)
- GA `lazyOnload` difiere hasta `window.onload` + `requestIdleCallback`
- `<style jsx global>` agrega CSS al body (no cacheable) — mejor en globals.css
- `theme-color` #0a0a0a previene flash blanco en mobile
