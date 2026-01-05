# Plan: Supervisor de Propiedades Excluidas (HITL)

> **Fecha:** 5 Enero 2026
> **Estado:** Pendiente implementación
> **Prioridad:** Media

## Problema

16 propiedades con GPS válido están excluidas del matching (`es_para_matching = false`) y nunca llegan al Sheet para revisión humana. Quedan en "limbo eterno".

**Causas de exclusión detectadas:**
| Razón | Cantidad | IDs |
|-------|----------|-----|
| Dormitorios NULL (dato crítico) | 10 | 152-155, 381, 403, 404, 405, 285, 286 |
| Precio NULL (dato crítico) | 2 | 285, 286 |
| Score < 80 por precio/m² anómalo | 4 | 304, 335, 160, 164 |
| Datos basura (ej: 3500 dorms) | 1 | 304 |

---

## Objetivo

Crear un flujo **Human-in-the-Loop** para revisar propiedades excluidas, similar a Matching Supervisor y Sin Match Supervisor.

**Filosofía:** Humano revisa URL original, corrige datos si es necesario, y decide si activar o excluir permanentemente.

---

## Flujo Propuesto

```
Propiedades con es_para_matching = FALSE
    ↓
Export a Google Sheet "Propiedades_Excluidas"
    ↓
Humano revisa URL de cada una
    ↓
Acciones:
├─ CORREGIR: Arreglar datos (dorms, precio) + activar
├─ ACTIVAR: Datos OK, solo activar matching
├─ EXCLUIR: Datos basura, excluir permanentemente
└─ ELIMINAR: Propiedad inválida, borrar del sistema
    ↓
Supervisor procesa acciones
    ↓
Propiedades activadas entran al flujo normal:
├─ Matching Nocturno → genera sugerencias
├─ Si matchea → Matching Supervisor
└─ Si no matchea → Sin Match Supervisor
```

---

## Estrategia: Corregir Datos + Re-Merge (Sin Modificar Merge)

**Filosofía:** No tocamos `merge_discovery_enrichment.sql`. Solo corregimos los datos de entrada y dejamos que el Merge recalcule naturalmente.

**Flujo:**
```
Humano revisa URL → Corrige dormitorios/precio
    ↓
Supervisor actualiza datos en propiedades_v2
    ↓
Supervisor llama a merge_discovery_enrichment() para esa propiedad
    ↓
Merge recalcula score_fiduciario con datos corregidos
    ↓
Si score >= 80 → es_para_matching = TRUE automáticamente
    ↓
Propiedad entra al flujo normal de matching
```

**Ventajas:**
- Cero cambios a archivos SQL existentes
- El Merge sigue funcionando exactamente igual
- Score se recalcula correctamente con datos reales
- Menor riesgo de afectar el sistema

---

## Componentes a Crear

### 1. Tabla `propiedades_excluidas_export`

```sql
CREATE TABLE propiedades_excluidas_export (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades_v2(id),
    url TEXT,
    fuente VARCHAR(50),
    precio_usd NUMERIC,
    precio_m2 NUMERIC,
    dormitorios INTEGER,
    area_m2 NUMERIC,
    zona VARCHAR(100),
    score_fiduciario INTEGER,
    razon_exclusion TEXT,

    -- Campos para revisión humana
    accion VARCHAR(20),  -- CORREGIR, ACTIVAR, EXCLUIR, ELIMINAR
    dorms_correcto INTEGER,
    precio_correcto NUMERIC,
    notas TEXT,

    -- Tracking
    estado VARCHAR(20) DEFAULT 'pendiente',
    fecha_export TIMESTAMP DEFAULT NOW(),
    fecha_procesado TIMESTAMP,
    row_number INTEGER,

    UNIQUE(propiedad_id)
);
```

### 2. Google Sheet "Propiedades_Excluidas"

| Columna | Tipo | Descripción |
|---------|------|-------------|
| propiedad_id | Número | ID de la propiedad |
| url | Link | **Clickeable** para revisar |
| fuente | Texto | century21/remax |
| precio_usd | Número | Precio actual |
| precio_m2 | Número | Para detectar anomalías |
| dormitorios | Número | Valor actual (puede ser NULL o erróneo) |
| area_m2 | Número | Área |
| zona | Texto | Zona actual |
| score | Número | Score fiduciario |
| razon_exclusion | Texto | Por qué está excluida |
| **ACCION** | Dropdown | CORREGIR, ACTIVAR, EXCLUIR, ELIMINAR |
| **DORMS_CORRECTO** | Número | Nuevo valor si CORREGIR |
| **PRECIO_CORRECTO** | Número | Nuevo valor si CORREGIR |
| **NOTAS** | Texto | Observaciones |
| row_number | Número | Para borrar fila después |

### 3. Workflow "Exportar Propiedades Excluidas"

**Trigger:** Manual o semanal
**Función:** Exporta propiedades con `es_para_matching = FALSE` que no estén ya exportadas

```sql
SELECT
    p.id as propiedad_id,
    p.url,
    p.fuente,
    p.precio_usd,
    CASE WHEN p.area_total_m2 > 0
         THEN ROUND(p.precio_usd::numeric / p.area_total_m2, 0)
         ELSE NULL END as precio_m2,
    p.dormitorios,
    p.area_total_m2 as area_m2,
    p.zona,
    p.score_fiduciario as score,
    CASE
        WHEN p.precio_usd IS NULL THEN 'Sin precio'
        WHEN p.dormitorios IS NULL THEN 'Sin dormitorios'
        WHEN p.score_fiduciario < 80 THEN 'Score bajo: ' || p.score_fiduciario
        ELSE 'Otro'
    END as razon_exclusion
FROM propiedades_v2 p
WHERE p.es_para_matching = FALSE
  AND p.status = 'completado'
  AND p.id_proyecto_master IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM propiedades_excluidas_export e
      WHERE e.propiedad_id = p.id
  )
ORDER BY p.score_fiduciario DESC;
```

### 4. Workflow "Supervisor Propiedades Excluidas"

**Trigger:** Manual o diario (8 PM después de otros supervisores)

**Acciones:**

| ACCION | Qué hace |
|--------|----------|
| CORREGIR | 1. Actualiza dormitorios/precio con valores correctos<br>2. Llama `merge_discovery_enrichment(codigo)` para recalcular<br>3. Si score >= 80, propiedad queda activa automáticamente |
| ACTIVAR | Solo para propiedades que ya tienen datos OK pero score >= 80:<br>Llama `merge_discovery_enrichment(codigo)` para forzar recálculo |
| EXCLUIR | Marca `es_para_matching = FALSE` + agrega a `campos_bloqueados`<br>(para que Merge no la reactive) |
| ELIMINAR | `DELETE FROM propiedades_v2 WHERE id = X` |

**SQL para cada acción:**

```sql
-- CORREGIR: Actualizar datos + re-merge
UPDATE propiedades_v2
SET dormitorios = $dorms_correcto,
    precio_usd = $precio_correcto,
    fecha_actualizacion = NOW()
WHERE id = $propiedad_id;

-- Forzar re-merge para recalcular score
SELECT merge_discovery_enrichment(
    (SELECT codigo_propiedad FROM propiedades_v2 WHERE id = $propiedad_id)
);

-- EXCLUIR: Bloquear permanentemente (único caso que toca campos_bloqueados)
UPDATE propiedades_v2
SET es_para_matching = FALSE,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb)
                        || '{"es_para_matching": "excluido_revision_humana"}'::jsonb
WHERE id = $propiedad_id;

-- ELIMINAR: Borrar propiedad
DELETE FROM propiedades_v2 WHERE id = $propiedad_id;
```

---

## Modificaciones a Archivos Existentes

**NINGUNA** - Este plan no modifica archivos SQL existentes.

Solo creamos archivos nuevos y usamos las funciones existentes tal como están.

---

## Flujo Post-Corrección

```
Propiedad activada por Supervisor Excluidas
    ↓
Matching Nocturno (4 AM)
    ├─ GPS match → Sugerencia 60-85%
    └─ Fuzzy match → Solo si tiene nombre
    ↓
┌─────────────────────────────────────────┐
│ Si hay sugerencia:                      │
│   → Sheet Matching_Pendientes           │
│   → Matching Supervisor aprueba/rechaza │
├─────────────────────────────────────────┤
│ Si NO hay sugerencia:                   │
│   → Export Sin Match (7 AM)             │
│   → Sheet Sin_Match                     │
│   → Supervisor Sin Match decide         │
└─────────────────────────────────────────┘
    ↓
Propiedad asignada a proyecto ✅
```

---

## Archivos a Crear

| Archivo | Descripción |
|---------|-------------|
| `sql/migrations/019_supervisor_excluidas.sql` | Tabla `propiedades_excluidas_export` + índices |
| `n8n/workflows/modulo_2/exportar_excluidas.json` | Workflow: Export propiedades excluidas a Sheet |
| `n8n/workflows/modulo_2/supervisor_excluidas.json` | Workflow: Procesa acciones CORREGIR/ACTIVAR/EXCLUIR/ELIMINAR |
| Google Sheet | Nueva pestaña "Propiedades_Excluidas" con dropdowns |

**No se modifica ningún archivo existente.**

---

## Orden de Implementación

1. **Crear migración 019** - Tabla `propiedades_excluidas_export`
2. **Crear Sheet** - Nueva pestaña "Propiedades_Excluidas" con dropdowns
3. **Crear workflow Export** - Exporta las 16 actuales al Sheet
4. **Crear workflow Supervisor** - Procesa acciones (usa merge existente)
5. **Test manual** - Revisar una propiedad, corregir datos, verificar que entra a matching

---

## Riesgos y Mitigación

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Afectar sistema existente | **Muy baja** | No modificamos archivos existentes |
| Dato corregido sigue malo | Media | Humano verifica URL antes de corregir |
| Score no sube a 80 después de corregir | Baja | Re-merge recalcula con datos nuevos |
| Doble revisión (excluidas → sin_match) | Media | Aceptable: 2 revisiones = más seguro |

---

## Notas

- Similar a Matching Supervisor y Sin Match Supervisor
- Usa `campos_bloqueados` existente (no requiere nueva columna)
- Las 16 propiedades actuales se procesan una vez, luego flujo ongoing
- ID 304 (3500 dorms, $503 precio) debería marcarse ELIMINAR
