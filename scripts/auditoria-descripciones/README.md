# Auditoría de descripciones — feed `/ventas`

Re-scrapea propiedades vivas del feed con Firecrawl, extrae la descripción usando la **misma lógica** que el pipeline nocturno (`flujo_b_processing`), y la compara contra la guardada en `datos_json_enrichment->>'descripcion'`. Detecta drift que el pipeline no captura cuando la metadata (precio/dorms/m2) no cambia pero la descripción sí.

## Setup

```powershell
cd scripts/auditoria-descripciones
npm install
```

Las variables se leen de `simon-mvp/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o `SUPABASE_SERVICE_ROLE_KEY`)
- `FIRECRAWL_API_KEY`

## Uso

```powershell
# Smoke test (5 props)
node run.mjs --limit 5

# Auditoría sample (50 más viejas en mercado)
node run.mjs --limit 50

# Auditoría completa
node run.mjs
```

## Output

Cada corrida genera `reports/<timestamp>/`:
- `summary.md` — reporte legible: 4 buckets de similitud + sección semántica + top 10 side-by-side
- `results.json` — todos los datos crudos para queries automáticas
- `raw/<id>-<fuente>.json` — descripción individual por prop (vieja vs nueva)

## Buckets de similitud

| Bucket | % Levenshtein | Interpretación |
|---|---|---|
| Reescrita | < 70% | Cambió significativamente |
| Cambio relevante | 70-90% | Drift importante |
| Cambio menor | 90-99% | Edits cosméticos |
| Idénticas | ≥ 99% | Sin cambios |

## Flags semánticos

Reportados aparte (suben al top), capturan cambios chicos pero importantes:
- `amoblado_aparecio` / `amoblado_desaparecio`
- `preventa_aparecio` / `preventa_desaparecio`
- `entrega_inmediata_aparecio` / `entrega_inmediata_desaparecio`
- `negociable_aparecio` / `negociable_desaparecio`
- `urgente_aparecio` / `urgente_desaparecio`
- `rebajado_aparecio` / `rebajado_desaparecio`

## Costo

Firecrawl ~$0.005/URL × 50 props ≈ **$0.25 por corrida**.
