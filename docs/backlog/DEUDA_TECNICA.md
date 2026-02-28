# Deuda Técnica — SICI

> Extraído de CLAUDE.md el 27 Feb 2026

## Merge NO preserva enriquecimientos manuales a `datos_json->amenities`

**Problema:** La función `merge_discovery_enrichment.sql` reconstruye `datos_json->amenities`
completamente desde `datos_json_enrichment` en cada ejecución. Esto significa que:

1. Las migraciones 064 (amenities/equipamiento) y 066 (estacionamientos) enriquecen `datos_json->amenities`
2. Pero el merge nocturno las sobrescribe con los datos originales de enrichment
3. Solo la columna `estacionamientos` está protegida porque enrichment tiene "sin_confirmar" (texto) que merge ignora

**Campos afectados:**
- `datos_json->amenities->amenities_confirmados` - Migración 064
- `datos_json->amenities->amenities_por_verificar` - Migración 064
- `datos_json->amenities->equipamiento_detectado` - Migración 064

**Campos NO afectados (seguros):**
- `estacionamientos` (columna) - Migración 066 (merge preserva porque enrichment no tiene número)
- Campos con `campos_bloqueados` activos

**Solución futura:**
- Modificar merge para verificar `campos_bloqueados->>'amenities'` antes de sobrescribir
- O crear estructura separada `amenities_enriquecidos` que merge no toque

**Estado (28 Feb 2026):** Parcialmente resuelto. La migración 116 agregó el trigger `proteger_amenities_candados()` que protege amenities con candados manuales (`campos_bloqueados`). Sin embargo, amenities sin candado aún se sobrescriben en cada merge. La re-ejecución de migraciones 064 ya no es necesaria para campos protegidos.
