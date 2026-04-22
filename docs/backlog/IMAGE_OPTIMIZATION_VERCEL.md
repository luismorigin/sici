# Image Optimization — migrar de Vercel a URLs directas del CDN

## Contexto

22 abril 2026 — Vercel notifica que el Hobby tier alcanzó **100% de las 5,000 Image Optimization Transformations/mes**. Las imágenes adicionales pueden fallar o servirse sin optimizar. El proyecto no se pausa.

**Diagnóstico clave**: SICI está pagando por re-optimizar imágenes que ya vienen optimizadas desde los CDNs origen.

## Evidencia de fotos optimizadas en el origen

Test hecho 22 abr 2026 contra URLs reales del feed:

| Fuente | Formato | Tamaño típico | CDN | % del inventario |
|---|---|---|---|---|
| C21 (`cdn.21online.lat`) | JPEG | 10-135 KB según variante | AWS CloudFront | ~80% |
| Remax (`intramax.bo`) | WebP (mayoría) + JPEG | 15-17 KB | Propio, 30d cache | ~20% |
| Bien Inmuebles (`www.bieninmuebles.com.bo`) | Desconocido | Sin muestra | Desconocido | <1% |

Conclusión: C21 y Remax ya sirven thumbnails optimizados. Pasarlos por Vercel es desperdicio.

## Cómo se consume hoy (drivers del gasto)

Código grepeado en `simon-mvp/src/pages/`:

| Archivo:línea | Uso | Transformaciones por evento |
|---|---|---|
| `ventas.tsx:419` | Card principal del feed | 1 × prop visible |
| `ventas.tsx:969` | Thumbnails de props similares (w=256, q=60) | 4-6 × prop clickeada |
| `ventas.tsx:1407` | Preload LCP (w=640, q=75) | 1 × render de feed |
| `alquileres.tsx:717` | Preload LCP (w=640, q=75) | 1 × render de feed |
| `alquileres.tsx:2188` | Thumbnails props similares | 4-6 × prop clickeada |
| `<Image>` en `condado-vi.tsx`, `HeroSimon.tsx`, `MicrozonasMap.tsx` | Landing + hero | Bajo volumen |

**Estimación**: ~60-80 transformaciones por sesión de `/alquileres`. Con ~70-80 sesiones activas/mes → agotás el límite.

**Observación clave**: el código no usa `<Image>` de Next en los feeds. Usa `<img>` apuntando **manualmente** al endpoint `/_next/image?url=...&w=X&q=Y`. Esto significa que `unoptimized: true` en `next.config.js` **no resuelve el problema** — hay que cambiar las URLs directamente.

## Riesgos de migrar a URLs directas del CDN

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sin srcset responsive (retina bajará misma res que mobile) | Bajo-medio | Fotos origen ya son 10-135KB; overhead mínimo |
| Sin conversión AVIF (Vercel la hace, CDN origen no) | Marginal | Ahorro perdido: ~5-10 KB por foto |
| Browser debe resolver DNS + TLS para CDN externo | Medio | Agregar `<link rel="preconnect">` en `_document.tsx` |
| LCP preload puede empeorar sin edge cache de Vercel | Medio | Preconnect + preload siguen funcionando |
| Quality `q=60/75` hardcoded se pierde | Nulo | Origen ya sirve quality baja |
| `/_next/image` endpoint puede dar 404 con `unoptimized: true` | Alto si no se migra código | Migrar las 6 URLs antes de tocar config |

## Otros riesgos de performance detectados en el análisis

### Galería del bottom sheet (ventas.tsx:862, alquileres.tsx)
```tsx
<BottomSheetGallery photos={p.fotos_urls} propertyId={p.id} />
```
Pasa el array completo. Si la prop tiene 18 fotos, potencialmente 18 transformaciones al abrir. **Verificar si tiene lazy loading interno** (no lo chequeé en este análisis).

### Thumbnails sobredimensionados
`w=256&q=60` pero el CSS renderiza a ~80×80px. Si se mantiene Vercel Image Optimization, bajar a `w=128` ahorra ~50% de peso. Con URL directa este ajuste no aplica.

### Preload con `w=640` no cubre retina desktop
Cards desktop pueden querer `w=1200` en retina. Con URL directa perdés ese boost. Impacto marginal si la foto origen ya es <200KB.

## Plan en capas

### 🟢 Capa 1 — Fix inmediato (20 min)

**Objetivo**: cerrar el consumo de transformaciones Vercel sin tocar performance.

**Cambios**:

1. **Reemplazar las 6 invocaciones de `/_next/image`** por la URL directa:

```tsx
// Antes
<img src={`/_next/image?url=${encodeURIComponent(url)}&w=640&q=75`} />

// Después
<img src={url} fetchPriority="high" />
```

Ubicaciones:
- `simon-mvp/src/pages/ventas.tsx:419` (card principal)
- `simon-mvp/src/pages/ventas.tsx:969` (thumbnail props similares)
- `simon-mvp/src/pages/ventas.tsx:1407` (preload LCP)
- `simon-mvp/src/pages/alquileres.tsx:717` (preload LCP)
- `simon-mvp/src/pages/alquileres.tsx:2188` (thumbnail props similares)
- (grep `/_next/image` por si aparece algún otro)

2. **Agregar preconnect a los 3 CDNs** en `simon-mvp/src/pages/_document.tsx`:

```tsx
<link rel="preconnect" href="https://cdn.21online.lat" crossOrigin="anonymous" />
<link rel="preconnect" href="https://intramax.bo" crossOrigin="anonymous" />
<link rel="preconnect" href="https://www.bieninmuebles.com.bo" crossOrigin="anonymous" />
```

3. **Activar `unoptimized: true` en `next.config.js`** para que los `<Image>` residuales (condado-vi, hero, mapa) no sigan transformando:

```js
images: {
  unoptimized: true,
  remotePatterns: [ /* dejar como está */ ],
},
```

**Riesgo**: bajo. **Rollback**: revertir los 6 cambios + config.

### 🟡 Capa 2 — Medir regresión (10 min post-deploy)

Smoke test obligatorio después del deploy:

1. Chrome DevTools → Lighthouse Mobile con throttling "Slow 4G"
2. Abrir `/alquileres`, medir LCP
3. Comparar con baseline (hoy). Esperado: ±100ms
4. Abrir bottom sheet de una card → medir tiempo de carga de galería
5. Verificar que ninguna foto da 404

**Criterio de rollback**: si LCP mobile empeora >200ms → revertir y saltar a Capa 3.

### 🔵 Capa 3 — Cloudflare Images (solo si Capa 1 falla, 2-3h)

Si Capa 1 degrada performance notoriamente, migrar a Cloudflare Images como proxy:

- Free tier: **100,000 transformaciones/mes** (20× Vercel)
- Sirve AVIF/WebP según `Accept` header
- srcset responsive automático
- Edge cache global (~300 POPs)

Integración:
```tsx
// Patrón
<img src={`https://imagedelivery.net/{ACCOUNT_HASH}/{encodeURIComponent(originalUrl)}/w=640,q=75`} />
```

Requiere:
- Cuenta Cloudflare con Images habilitado
- Hash del account
- Definir variants (w=256, w=640, w=1200)
- Actualizar 6 invocaciones + `<Image>` residuales

Costo: $0 hasta 100k/mes. Si se supera, $5/mes por 100k adicional.

## Métricas a vigilar post-cambio

- **LCP mobile** (Real User Monitoring Vercel) — baseline hoy, comparar 7 días post-deploy
- **Transformaciones Vercel** (dashboard billing) — debería bajar a ~0
- **GA4 `page_load` duration en `/ventas` y `/alquileres`** — no debería moverse
- **Error rate de imágenes** (network tab en prod) — 0 si preconnect está ok

## Referencias

- Email original Vercel: 22 abr 2026 — "Your site is growing! 100% of free tier usage"
- Análisis de tamaños reales: commit de este backlog (tests con curl a las 3 fuentes)
- Doc oficial Next.js `unoptimized`: https://nextjs.org/docs/api-reference/next/image#unoptimized
- Doc oficial Cloudflare Images: https://developers.cloudflare.com/images/
- Performance learnings del proyecto: `docs/performance/PERFORMANCE_LEARNINGS.md`

## Decisión pendiente

- [ ] Ejecutar Capa 1 esta semana → cierra el email de Vercel inmediatamente
- [ ] Capa 2 post-deploy → criterio verde/rojo
- [ ] Capa 3 solo si Capa 2 da rojo
