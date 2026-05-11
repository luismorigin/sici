# Auditoría descripciones — feed `/alquileres`

Análogo a `scripts/auditoria-feed-ventas/` pero para alquileres. Diferencias clave:

- **Sin Firecrawl.** Los 3 portales (C21, Remax, BI) sirven HTML estático suficiente. Curl directo + extractores por fuente. Costo $0.
- **Sin TC paralelo.** Alquiler usa `precio_mensual_bob` como fuente de verdad y `precio_mensual` USD = `bob/6.96` derivado.
- **Flags semánticos Tier A** (4): amoblado, expensas, mascotas, precio.
- **Tabla compartida** con audit ventas (migración 244 agrega `tipo_operacion`).

## Setup

```powershell
cd scripts/auditoria-feed-alquileres
npm install
```

Variables leídas de `simon-mvp/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (recomendado para escribir, sino `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

## Backfill (1 vez, antes del primer audit)

Las ~138 props del feed alquiler enriquecidas pre-9-may-2026 NO tienen `datos_json_enrichment.descripcion` poblada. El backfill las llena con la cruda actual del portal.

```powershell
npm run backfill:dry      # dry-run — solo reporta, no toca BD
npm run backfill          # aplica UPDATES (138 filas)
```

Modo limitado para test:
```powershell
node backfill-descripciones.mjs --dry-run --limit 5
```

**Caveat semántico**: la cruda backfilleada es la del momento del backfill, no del momento del enrichment original. Eso significa que el primer audit posterior comparará "scraped HOY" contra "cruda HOY" y dará drift ~0%. Eso es deliberado: establece el baseline. Audit #2 (1 mes después) ya mide drift real contra ese baseline.

## Audit standalone (capa 1 sola)

Igual al de ventas pero contra `v_mercado_alquiler`:

```powershell
node run.mjs --limit 5      # smoke test
node run.mjs --limit 50     # sample
node run.mjs                # completo (~141 props)
```

## Audit interno (sin fetch)

```powershell
node audit-internal.mjs
```

Solo capa 2: detecta inconsistencias entre `precio_mensual_bob` BD y precio mencionado en la descripción cruda + edificio mencionado vs `nombre_edificio` BD. No requiere red más allá de Supabase.

## Audit mensual (skill)

`/audit-feed-alquileres-mensual` — orquesta las 3 capas + persiste a Supabase + análisis humano.

Setup (una vez):
```powershell
copy "scripts\auditoria-feed-alquileres\audit-feed-alquileres-mensual.command.md" ".claude\commands\audit-feed-alquileres-mensual.md"
```

(El archivo `.claude/commands/...` está gitignored. La fuente vive en este directorio).

## Buckets de similitud

Idéntico a ventas:

| Bucket | % Levenshtein | Interpretación |
|---|---|---|
| Reescrita | < 70% | Cambió significativamente |
| Cambio relevante | 70-90% | Drift importante |
| Cambio menor | 90-99% | Edits cosméticos |
| Idénticas | ≥ 99% | Sin cambios |

## Flags semánticos (Tier A — 4 flags)

Decisión 2026-05-10 basada en sampling de 12 descripciones reales del feed:

- `amoblado_aparecio` / `amoblado_desaparecio` — broker rota frecuentemente entre amoblado/sin amoblar
- `expensas_aparecio` / `expensas_desaparecio` — "incluye expensas" ↔ "expensas aparte" cambia precio neto
- `mascotas_aparecio` / `mascotas_desaparecio` — dato decisivo para inquilino
- `precio_aparecio` / `precio_desaparecio` — números explícitos en BOB o USD

**Tier B en backlog** (parqueo, disponibilidad). **Tier C descartado** (garantía, contrato mínimo — frecuencia <5% del feed).

## Costo

- Backfill: $0 (curl directo)
- Audit mensual: $0 (curl directo)

vs `auditoria-feed-ventas` que cuesta ~$1.75/mes en Firecrawl (necesario para C21 venta porque depende de JS-render).
