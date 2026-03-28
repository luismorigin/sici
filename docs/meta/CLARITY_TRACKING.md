# Microsoft Clarity — simonbo.com

## Configuracion

- **Project ID:** `w2yt0s7ssz`
- **Instalacion:** `_document.tsx` via `next/script` con `strategy="lazyOnload"`
- **Scope:** Todas las rutas (heatmaps + session recordings globales)
- **Dashboard:** https://clarity.microsoft.com/projects/view/w2yt0s7ssz/

## Que captura Clarity

| Feature | Descripcion | Costo |
|---------|-------------|-------|
| Heatmaps | Clicks, scroll depth, areas de atencion por pagina | Gratis |
| Session recordings | Video de sesiones de usuario reales | Gratis |
| Dead clicks | Clicks en elementos que no responden | Gratis |
| Rage clicks | Clicks repetidos frustrados | Gratis |
| Quick backs | Usuarios que vuelven inmediatamente | Gratis |
| Scroll depth | % de pagina vista | Gratis |
| JavaScript errors | Errores de consola capturados | Gratis |

## Implementacion

```tsx
// simon-mvp/src/pages/_document.tsx
<Script
  id="microsoft-clarity"
  strategy="lazyOnload"
  dangerouslySetInnerHTML={{
    __html: `
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "w2yt0s7ssz");
    `,
  }}
/>
```

## Performance

- `lazyOnload`: carga despues de `window.onload` + `requestIdleCallback` — zero impacto en FCP/LCP
- `dns-prefetch` para `clarity.ms` en `<Head>` — resuelve DNS temprano
- Clarity comprime datos y envia en batches — ~2-5 KB/sesion

## Paginas clave para monitorear

| Pagina | Que buscar |
|--------|-----------|
| `/alquileres` | Scroll depth, clicks en cards vs mapa, interaccion filtros |
| `/ventas` | Misma logica, comparar engagement vs alquileres |
| `/mercado/equipetrol` | Scroll depth, que secciones generan interes |
| `/` (landing) | Donde hacen click, hasta donde scrollean, CTA efectividad |
| `/filtros-v2` | Donde abandonan el funnel |

## Relacion con otros trackings

| Herramienta | Proposito | Archivo |
|-------------|-----------|---------|
| **Google Analytics (GA4)** | Metricas cuantitativas: pageviews, eventos, conversiones | `_app.tsx` (`G-Q8CRRJD6SL`) |
| **Meta Pixel** | Optimizacion de campanas Meta Ads | `_app.tsx` (`934634159284471`) |
| **Clarity** | Metricas cualitativas: heatmaps, recordings, UX insights | `_document.tsx` (`w2yt0s7ssz`) |

GA4 te dice QUE pasa (numeros). Clarity te dice POR QUE pasa (comportamiento visual).

## Verificacion

1. Deployar a Vercel
2. Abrir simonbo.com en una pestana
3. Esperar ~2 minutos, navegar varias paginas
4. Ir al [dashboard de Clarity](https://clarity.microsoft.com/projects/view/w2yt0s7ssz/) → deberia mostrar sesiones en "Live"
5. Verificar que heatmaps empiezan a generarse (puede tomar ~30 min con trafico real)

## Notas

- Clarity es 100% gratis sin limites de sesiones (a diferencia de Hotjar/FullStory)
- Compatible con GA4 — se puede vincular para ver recordings desde GA4
- No requiere consentimiento de cookies en Bolivia (no GDPR), pero si se agrega banner futuro, respetar opt-out
- `debug=1` en simonbo.com desactiva GA4 pero NO Clarity (Clarity no tiene modo debug)
