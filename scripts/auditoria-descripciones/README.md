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

---

## Skill `/audit-mensual` (slash command)

Corrida mensual orquestada de las 3 capas (drift Firecrawl + inconsistencias internas SQL + audit matching). Reporte ejecutivo con análisis humano.

### Setup (una vez)

Copiar el archivo de skill a tu `.claude/commands/`:

```powershell
# Desde el repo principal sici/
copy "scripts\auditoria-descripciones\audit-mensual.command.md" ".claude\commands\audit-mensual.md"
```

(El archivo `.claude/commands/audit-mensual.md` está gitignored, por eso vive en `audit-mensual.command.md` dentro del repo.)

### Uso

```
/audit-mensual                              ← corrida normal con Firecrawl ($1.75)
/audit-mensual --use-cached <run-dir>       ← test sin gastar Firecrawl
/audit-mensual --skip-insert                ← no escribe a Supabase (si migración no aplicada)
```

### Pre-requisitos

- Migración SQL `242_audit_descripciones.sql` aplicada en Supabase (sino usar `--skip-insert`)
- `FIRECRAWL_API_KEY` en `simon-mvp/.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` en `simon-mvp/.env.local`

### Output

- `reports/mensual-<timestamp>/combined.json` — detalle por prop
- `reports/mensual-<timestamp>/summary.md` — reporte ejecutivo bruto
- `reports/mensual-<timestamp>/meta.json` — stats + run_id
- Persistido en Supabase: `audit_descripciones_runs` + `audit_descripciones_items`
