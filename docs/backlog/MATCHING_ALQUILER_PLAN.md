# Plan: Mejorar matching alquileres — 82.5% → 95%+

> Creado: 28 Mar 2026
> Contexto: Auditoría pipeline alquiler reveló match rate 82.5% (ventas: 97.5%)

## Estado actual post-auditoría

| Métrica | Antes (27 Mar) | Después fixes | Target |
|---------|---------------|---------------|--------|
| Match rate | 82.5% | 87.8% | 95%+ |
| Sin match | 26 | 18 | <8 |
| Zonas legacy | 17 | 1 | 0 |

### Fixes ya desplegados (27 Mar)
- [x] **Migración 202**: trigger zona alquiler detecta zonas no canónicas (+16 props)
- [x] **Aliases PM**: Smart You, T-25, Planitinium 2, YOU PLAZA, SOLO (+5 props)
- [x] **HITL aprobados**: LE BLANC Eurodesign, Malibu Eco Friendly (+2 props, 1 pendiente)

### Las 18 sin match restantes

| Categoría | Cant | IDs | Solución |
|-----------|------|-----|----------|
| sin_nombre (LLM tampoco tiene) | 8 | 87, 740, 743, 871, 881, 1085, 1124, 1225 | Prompt v2.0 podría ayudar parcialmente |
| No existe en PM | 5 | 964, 1089, 1133, 1157, 1281 | Crear proyectos o verificar si son alias |
| Nombre con ruido | 2 | 105, 1156/1191 | Prompt v2.0 con PROYECTOS CONOCIDOS |
| Trigram bajo HITL | 1 | 1196 | Revisar manualmente |
| campo_bloqueado | 1 | 711 | Intencional, no tocar |

## Plan de ejecución (3 fases)

### Fase 1 — Prompt LLM alquiler v2.0 (sin riesgo)
**Objetivo**: Recopilar datos de confianza sin cambiar comportamiento del pipeline.

**Cambios**:
1. Actualizar nodo "Construir Prompt" en n8n `flujo_enrichment_llm_alquiler`
2. Agregar query de proyectos_master por zona antes del loop
3. Inyectar lista PROYECTOS CONOCIDOS en el prompt
4. Agregar campos de salida: `nombre_edificio_confianza`, `dormitorios_confianza`
5. Agregar instrucciones: match contra lista PM, regla monoambiente=0, limpiar basura

**Riesgo**: ZERO — merge_alquiler no lee estos campos nuevos. Se acumulan en `llm_output`.

**Costo**: +$0.20/mes (750 tokens extra por inyección de proyectos).

**Criterio de éxito**: Prompt desplegado, datos acumulándose en `llm_output`.

**Estado**: COMPLETADO (28 Mar 2026). Workflow `Enrichment LLM Alquiler v2.0.0` activo en n8n. Testeado con props 105 y 1156 — ambas normalizaron nombre correctamente (Onix Art By EliTe, Sky Elite) con confianza alta.

**Doc**: `scripts/llm-enrichment/prompt-alquiler-v2.md`

### Fase 2 — Eval con datos reales (7 días después de Fase 1)
**Objetivo**: Validar calidad del prompt v2.0 antes de cambiar merge.

**Query de eval**:
```sql
SELECT
  p.id,
  p.nombre_edificio as col_nombre,
  dje->'llm_output'->>'nombre_edificio' as llm_nombre,
  dje->'llm_output'->>'nombre_edificio_confianza' as llm_conf,
  p.dormitorios as col_dorms,
  (dje->'llm_output'->>'dormitorios')::int as llm_dorms,
  dje->'llm_output'->>'dormitorios_confianza' as dorms_conf,
  p.id_proyecto_master
FROM propiedades_v2 p,
     LATERAL (SELECT p.datos_json_enrichment) AS dje(dje)
WHERE p.tipo_operacion = 'alquiler'
  AND p.fecha_enrichment >= CURRENT_DATE - INTERVAL '7 days'
  AND dje->'llm_output'->>'nombre_edificio_confianza' IS NOT NULL
ORDER BY p.id;
```

**Checklist eval**:
- [ ] LLM normaliza nombres contra lista PM correctamente (ej: "Eco Sostenible X" → nombre limpio)
- [ ] Confianza alta correlaciona con nombres que existen en PM
- [ ] Confianza media/baja correlaciona con nombres dudosos o no en PM
- [ ] Dormitorios: monoambientes correctamente marcados como 0 (no NULL ni 1)
- [ ] Sin regresiones en campos existentes (precios, amenities, equipamiento)
- [ ] Tasa de error nombre_edificio < 10% (benchmark ventas: 8.6%)

**Criterio de éxito**: Checklist 6/6, tasa error < 10%.

### Fase 3 — Migración merge_alquiler v1.3.0 (si eval positivo)
**Objetivo**: merge_alquiler consume LLM para nombre_edificio y dormitorios.

**Cambios en merge_alquiler**:
1. nombre_edificio: candado → LLM híbrido (mismo approach que mig 201 ventas) → columna → NULL
2. dormitorios: candado → LLM alta → columna → NULL (mismo approach que ventas)
3. Bump version 1.2.0 → 1.3.0

**Dependencias**:
- Helpers `_is_nombre_edificio_sospechoso()` y `_nombre_existe_en_proyectos()` ya desplegados (mig 201)
- Prompt v2.0 desplegado y validado (Fase 2)

**Riesgo**: MEDIO — mismo riesgo que ventas (~8.6% error LLM), mitigado por:
- Validación contra PM (approach híbrido)
- campos_bloqueados siempre respetados
- Solo afecta props con status 'nueva' o 'actualizado'

**Impacto esperado**: +3-5 matches (nombre corregido) + ~4 dormitorios corregidos (NULL→0).

## Proyectos nuevos pendientes de crear en PM

Estos 5 edificios no existen en `proyectos_master` y no son alias de ninguno existente:

| Nombre | Zona | Props alquiler | Acción |
|--------|------|---------------|--------|
| Phantom by Elite | Eq. Centro / Sirari | 1089, 1157 | Crear PM + GPS |
| AARTHI | Eq. Centro | 1133 | Crear PM + GPS |
| Edificio One Life | Eq. Centro | 964 | Crear PM + GPS |
| OMNIA SUITES | V. Brigida | 1281 | Verificar si es alias de CONDOMINIO OMNIA PRIME |
| Aguazu II | fuera de zona | 1181 | Fuera de cobertura, no crear |

## Bug conocido: precio C21 formato boliviano

**id 1178 (ventas)**: precio "88.800,00" parseado como $89. Extractor C21 confunde punto de miles con decimal.
Fix manual aplicado + candado. Pendiente: revisar extractor C21 para formato `\d{1,3}\.\d{3},\d{2}`.

## Notas

- `merge_alquiler` es mucho más simple que `merge_discovery_enrichment` (ventas). No tiene scoring, discrepancias, ni fases. Cambio es más pequeño.
- Pipeline alquiler NO registra en `workflow_executions` — considerar agregar tracking.
- `mv_nombre_proyecto_lookup` debe refrescarse después de agregar aliases. El workflow de matching debería incluir `REFRESH MATERIALIZED VIEW` al inicio.
