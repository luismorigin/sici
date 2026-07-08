---
description: Audit mensual del feed /ventas con FETCHER DIRECTO ($0, sin Firecrawl). Gemela de /audit-feed-ventas-mensual — mismas 3 capas y mismo análisis, pero gratis. Genera reporte ejecutivo con análisis humano.
---

# Audit mensual — feed /ventas (fetcher directo, $0)

**Gemela de `/audit-feed-ventas-mensual`**, con una sola diferencia: la **Capa 1** trae las descripciones con el **fetcher directo del híbrido ZN** (C21 `?json=true` / Remax `data-page`) en vez de Firecrawl → **costo $0**.

Todo lo demás es idéntico: Capa 2 (inconsistencias internas), Capa 3 (matching), **Capa 4 (detector de duplicados, `lib/dup-checks.mjs`)**, detector de cambio de precio, `--macrozona`, stats, persistencia y reporte. **Las dos skills conviven**: esta es la de uso por defecto ($0); la de Firecrawl queda como **respaldo** por si algún portal cambia su API pública.

> **Cuál usar:** por defecto **esta** ($0). Si un día el fetcher falla mucho (portal cambió `?json=true`/`data-page`, o bloqueo de IP), caé a `/audit-feed-ventas-mensual` (Firecrawl, paga pero absorbe anti-bot).

## Diferencias vs la de Firecrawl

| | Firecrawl | **Esta (fetcher $0)** |
|---|---|---|
| Capa 1 | `scrapeBatch` Firecrawl + parsear HTML | `c21Detalle`/`remaxDetalle` → desc directa del JSON |
| Costo | $1.75–$3.90 | **$0** |
| Capa 3 matching | usa `<title>` del HTML | usa la **descripción** fetcheada (mejor señal) |
| Modo en BD | `normal` | `fetch` (para distinguir en el histórico `audit_descripciones_runs`) |
| Anti-bot | lo absorbe Firecrawl | circuit breaker propio (corta si la IP se bloquea) |

> **⚠️ La persistencia al histórico requiere la mig 267** (`modo='fetch'` no era un valor válido del constraint hasta entonces — la mig 242 solo permitía `normal`/`cached`/`partial`). Si el INSERT falla con `audit_descripciones_runs_modo_check`, aplicar la mig 267; el reporte local se genera igual. Para re-guardar una corrida ya fetcheada sin re-scrapear: `reguardar-corrida-zn.mjs <run-dir> --apply`.

## Argumentos

- (sin args) — Equipetrol completo, $0
- `--macrozona <equipetrol|zona-norte|todas>` — alcance (default equipetrol). A diferencia de la de Firecrawl, acá `zona-norte`/`todas` **no cuestan más** (son $0), pero hacen más requests → más riesgo de bloqueo. Igual conviene avisar.
- `--limit <N>` — tope de props en la Capa 1 (default 1000 = todo el feed). Para probar: `--limit 5`.
- `--skip-insert` — no escribe a Supabase

## Flujo de ejecución

```powershell
cd "C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\scripts\auditoria-feed-ventas"
node audit-feed-ventas-mensual-fetch.mjs $ARGUMENTS
```

Genera los archivos en `reports/mensual-<timestamp>/` (`combined.json`, `duplicados.json`, `meta.json`, `summary.md`). Leerlos igual que en la skill de Firecrawl. El `summary.md` incluye la sección **👥 Posibles duplicados** (clusters de mismo edificio+precio+área+desc; **verificar leyendo el anuncio** — código/piso/ID-base Remax — antes de marcar `duplicado_de`; precios distintos = unidades distintas, típico de preventa).

> **Changelog 8-jul-2026 — Capa 4 (duplicados) portada del Firecrawl.** Hasta hoy la gemela $0 NO corría el detector de duplicados (solo lo tenía la de Firecrawl), pese a que su descripción decía "mismas capas". Se portó `runDuplicados()` (reusa `lib/dup-checks.mjs` sobre el mismo universo de la Capa 1 por `id`, desc fetcheada). Detectado al correr el mensual-fetch de Equipetrol del 8-jul (había que correr el `dup-checks` a mano). Ahora ambas gemelas detectan apart-hoteles / re-publicaciones.

## Anti-bloqueo (importante)

La Capa 1 va **secuencial** con pausa + jitter entre requests y un **circuit breaker**: si se acumulan ~5 fallos seguidos, aborta la corrida (la IP probablemente está bloqueada; reintentar en horas). Por eso una corrida completa (~364 props) tarda varios minutos. Si ves el mensaje 🛑 de circuit breaker, esperá y reintentá, o usá la de Firecrawl esa vez.

## Análisis humano y reporte ejecutivo

**Idéntico a `/audit-feed-ventas-mensual`** — ese `.command.md` es la fuente de verdad del análisis (ruido conocido, patrones críticos TC/precio/listings/matching, detectores de atractores y auto-aprobados, estructura del reporte, preguntas al usuario). Seguir esa guía tal cual; lo único que cambia acá es de dónde sale la descripción (fetcher $0) y que no hay costo Firecrawl.

**Caveat propio del fetcher:** en Remax la descripción viene de `description_website + marketing_description` (más completa que la que persiste el pipeline), así que el `sim%` de drift puede dar más bajo sin ser una rebaja — leer el aviso antes de accionar (igual que siempre).
