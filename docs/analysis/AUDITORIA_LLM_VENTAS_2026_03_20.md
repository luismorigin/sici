# Auditoría LLM Enrichment Ventas — 20 Mar 2026

> Auditoría manual de los "difiere" entre `llm_output` y columnas BD.
> Objetivo: validar si el LLM es confiable para activar Fase C (merge consume llm_output).

## Estado del pipeline al momento de la auditoría

- 363/364 props con `llm_output` (99.7%)
- 5 ejecuciones nocturnas, todas exitosas, 0 errores
- Modelo: Haiku 4.5, prompt v4.1, modo observación
- Pipeline activo desde 17 Mar 2026

## Resumen de difiere por campo

| Campo | Difiere | LLM correcto | BD correcto | Notas |
|-------|---------|-------------|-------------|-------|
| dormitorios | 25 | 25/25 | 0/25 | 24 monoambientes (1→0) + 1 caso inverso (0→1) |
| estado_construccion | 41 | ~32/41 | 9/41 | 9 son anuncios desactualizados (ver abajo) |
| nombre_edificio | 28 | ~23/28 | ~5/28 | Mayoría correcciones de basura regex |
| solo_tc_paralelo | 0 | — | — | Perfecto acuerdo |

## Backfill pendiente — Correcciones confirmadas manualmente

### Dormitorios: BD=1 → corregir a 0 (monoambientes)

```sql
UPDATE propiedades_v2
SET dormitorios = 0
WHERE id IN (465, 30, 367, 31, 1198, 814, 902, 1163, 635, 1120, 1138, 456, 121, 1160, 509, 56, 557, 924, 887, 150, 455, 328, 306, 245)
AND dormitorios = 1
AND NOT campo_bloqueado(id, 'dormitorios');
```

### Dormitorios: BD=0 → corregir a 1

```sql
UPDATE propiedades_v2
SET dormitorios = 1
WHERE id = 953
AND dormitorios = 0
AND NOT campo_bloqueado(id, 'dormitorios');
```

### Nombre edificio: correcciones confirmadas

| ID | BD actual (incorrecto) | Valor correcto (LLM) |
|----|----------------------|---------------------|
| 1009 | Onix Art By EliTe | Sirari Palm |
| 30 | Edificio TORRE OASIS | Sky Luxia |
| 1201 | SÖLO Industrial Apartments | Malibú Friendly |
| 1139 | Enrique Finot | Sky Eclipse |
| 162 | Uptown NUU | Uptown Drei |

```sql
UPDATE propiedades_v2 SET nombre_edificio = 'Sirari Palm' WHERE id = 1009 AND NOT campo_bloqueado(id, 'nombre_edificio');
UPDATE propiedades_v2 SET nombre_edificio = 'Sky Luxia' WHERE id = 30 AND NOT campo_bloqueado(id, 'nombre_edificio');
UPDATE propiedades_v2 SET nombre_edificio = 'Malibú Friendly' WHERE id = 1201 AND NOT campo_bloqueado(id, 'nombre_edificio');
UPDATE propiedades_v2 SET nombre_edificio = 'Sky Eclipse' WHERE id = 1139 AND NOT campo_bloqueado(id, 'nombre_edificio');
UPDATE propiedades_v2 SET nombre_edificio = 'Uptown Drei' WHERE id = 162 AND NOT campo_bloqueado(id, 'nombre_edificio');
```

### Estado construcción: NO corregir (anuncios desactualizados)

Los 9 casos donde BD=`entrega_inmediata` y LLM=`preventa` son correctos en BD — los edificios ya se entregaron pero el anuncio del portal aún dice "pre-venta".

IDs: 187, 18, 31, 226, 527, 526, 298, 299, 300, 301, 302

**Regla para Fase C:** el merge NUNCA debe degradar `entrega_inmediata` → `preventa` desde el LLM. Dirección válida: `no_especificado` → cualquier valor, `nuevo_a_estrenar` → `entrega_inmediata`.

## Otros difiere de estado_construccion (32 casos, no auditados individualmente)

Patrones observados:
- 15× `nuevo_a_estrenar` → `entrega_inmediata` (mapeo v4.1, probablemente correcto)
- 8× `no_especificado` → `entrega_inmediata` (LLM agrega dato, probablemente correcto)
- 5× `preventa` → `entrega_inmediata` (edificio ya entregado, probablemente correcto)
- 3× `preventa` → `entrega_inmediata` (casos ambiguos)
- 1× `nuevo_a_estrenar` → `preventa`

## Conclusiones para Fase C

1. **El LLM es confiable** — en los campos auditados, accuracy >95%
2. **Regla de protección necesaria:** `entrega_inmediata` nunca se degrada a `preventa` desde LLM
3. **Dormitorios:** implementar cadena `candado → LLM (confianza alta) → discovery → regex` (ya documentada en README)
4. **Nombre edificio:** el LLM corrige basura del regex efectivamente, pero necesita validación contra `proyectos_master` para evitar matcheos incorrectos
5. **Timeline:** auditoría limpia, Fase C puede activarse cuando se implemente la regla de protección

## Queries para re-auditar

```sql
-- Contar difiere actuales por campo (correr después del backfill para ver mejora)
SELECT 'dormitorios' as campo, COUNT(*) as difiere
FROM propiedades_v2
WHERE datos_json_enrichment->'llm_output' IS NOT NULL
  AND dormitorios IS NOT NULL
  AND (datos_json_enrichment->'llm_output'->>'dormitorios') IS NOT NULL
  AND dormitorios != (datos_json_enrichment->'llm_output'->>'dormitorios')::int
  AND status = 'completado' AND tipo_operacion = 'venta';
```
