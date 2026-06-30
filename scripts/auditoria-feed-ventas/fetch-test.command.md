---
description: PRUEBA ($0) — valida si el fetcher directo (C21 ?json=true / Remax data-page) recupera las descripciones del feed de ventas tan bien como Firecrawl, antes de migrar el audit mensual.
---

# Probar fetcher directo — feed /ventas

Skill de **prueba aislada** para decidir si conviene migrar el audit mensual de ventas de **Firecrawl ($1.75–$3.90)** al **fetcher directo del híbrido ZN ($0)**.

Toma una muestra del feed, trae la descripción de cada prop con el fetcher directo y la compara contra la cruda guardada en BD. **100% read-only, NO usa Firecrawl, NO escribe nada.** No toca el audit mensual (que sigue intacto).

## Por qué existe

El audit mensual usa Firecrawl (paga, 1 request por prop). El flujo híbrido de Zona Norte ya recupera descripciones **gratis** con `fetch()` directo:
- **C21** → `?json=true` (devuelve la ficha completa en JSON)
- **Remax** → atributo `data-page` del HTML (SPA Inertia)

Esta skill prueba ese fetcher sobre **ventas** sin riesgo. Si la tasa de éxito es alta, se migra el audit mensual a $0.

## Argumentos

- (sin args) — 20 props de Equipetrol, mezcla C21 + Remax
- `--n <N>` — tamaño de la muestra (default 20)
- `--fuente <c21|remax|ambos>` — limitar a un portal (default ambos). Remax es el más dudoso (SPA)
- `--macrozona <equipetrol|zona-norte|todas>` — alcance (default equipetrol)

## Flujo de ejecución

Correr desde `scripts/auditoria-feed-ventas/`:

```powershell
cd "C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\scripts\auditoria-feed-ventas"
node fetch-test.mjs $ARGUMENTS
```

Reemplazar `$ARGUMENTS` con lo que haya pasado el usuario (o sin args).

## Cómo leer el resultado

El script imprime:
- **Tabla por prop**: `ok` (¿trajo descripción?), `len_bd` vs `len_fetch` (largos), `sim%` (cuánto se parece la del fetcher a la de BD).
- **Resumen por fuente**: % de éxito y similitud promedio por portal.
- **Veredicto**:
  - ✅ **≥90% éxito** → el fetcher sirve, vale migrar el audit mensual a $0.
  - 🟡 **70–90%** → revisar los `✗` (¿bloqueo? ¿URLs raras?) antes de migrar.
  - 🔴 **<70%** → no migrar; investigar qué falla (anti-bot, cambio de formato).

`sim%` alto = el fetcher trae lo mismo que ya teníamos (bueno). `sim%` bajo con `ok=✓` = el portal cambió la descripción (es drift real, no falla del fetcher).

## Anti-bloqueo

Reusa `fetchRetry` de `scripts/sonda-suelo/lib/fetcher.mjs`: User-Agent de browser, pausa con jitter entre requests, y **circuit breaker** (si se acumulan fallos seguidos, aborta — la IP probablemente está bloqueada; reintentar en horas). Por eso conviene muestras chicas (20–50), no barridos masivos.

## Si el veredicto es ✅

El siguiente paso (otra tarea) sería migrar `audit-feed-ventas-mensual.mjs`: reemplazar `lib/firecrawl.mjs` por este fetcher en la Capa 1 y adaptar `lib/extractor.mjs` (que hoy parsea HTML de Firecrawl) para leer la descripción directa del JSON. Eso deja el audit mensual en **$0**.
