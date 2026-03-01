# Normalización de Zonas y Microzonas — Diagnóstico y Propuesta

**Fecha:** 2026-03-01
**Scope:** Todo el sistema de zonas: BD, triggers, RPCs, frontend
**Propósito:** Unificar a una sola convención eliminando ambigüedades

---

## 1. Estado Actual: 4 Fuentes de Verdad

| Fuente | Valores | Quién la usa |
|--------|---------|-------------|
| `zonas_geograficas.nombre` (PostGIS) | 7 polígonos | Triggers, backfills |
| `proyectos_master.zona` | 10 valores (incluye basura) | buscar_unidades_reales, matching, admin filters |
| `propiedades_v2.zona` | Venta: 8 vals. Alquiler: 11 vals (sucios) | RPCs alquiler, market-alquileres, merge |
| `propiedades_v2.microzona` | 7 valores (= zonas_geograficas.nombre) | market.tsx, razón fiduciaria, v_metricas_mercado |

## 2. Hallazgo Crítico: Zona viene 100% de PostGIS

Ni discovery ni enrichment escriben zona. Verificado contra 967 propiedades (660 venta + 307 alquiler):

| Fuente de datos | `datos_json->>'zona'` | `datos_json_enrichment->>'zona'` |
|-----------------|:---------------------:|:--------------------------------:|
| Venta (660) | 0 | 0 |
| Alquiler (307) | 0 | 0 |

**C21, Remax y Bien Inmuebles no proveen zona en sus APIs.** El LLM de enrichment tampoco la extrae.

**Consecuencia:** La lógica de zona en `merge_discovery_enrichment()` (líneas 450-465: `blocked > discovery > enrichment > existing`) es **dead code**. Discovery y enrichment siempre envían NULL, así que merge siempre cae al branch `existing` (preserva el valor actual). Zona se escribe exclusivamente por triggers PostGIS.

## 3. Los 7 Polígonos PostGIS (fuente de verdad)

| zonas_geograficas.nombre | zona_general | Zona canónica (display) |
|---|---|---|
| `Equipetrol` | Equipetrol | Equipetrol Centro |
| `Equipetrol Norte/Norte` | Equipetrol | Equipetrol Norte |
| `Equipetrol Norte/Sur` | Equipetrol | Equipetrol Norte |
| `Faremafu` | Equipetrol | Equipetrol Oeste |
| `Sirari` | Equipetrol | Sirari |
| `Villa Brigida` | Equipetrol | Villa Brígida |
| `Equipetrol Franja` | Equipetrol | Eq. 3er Anillo (marginal) |

**Nota:** `zona_general` es siempre `'Equipetrol'` para todos — columna inútil.

## 4. Mapeo Completo de Valores por Tabla

| Zona canónica | zonas_geo | pm.zona | p.zona venta | p.zona alquiler | p.microzona | zonas.ts db |
|---|---|---|---|---|---|---|
| Eq. Centro | `Equipetrol` | `Equipetrol` (82) | `Equipetrol` (257) | `Equipetrol` (100), **`Eq Centro`** (19) | `Equipetrol` | `Equipetrol` |
| Eq. Norte | `Eq Norte/Norte`, `Eq Norte/Sur` | `Eq Norte/Norte` (16), `Eq Norte/Sur` (9), **`Eq Norte`** (5), **`Eq Centro`** (6) | `Eq Norte/Norte` (39), `Eq Norte/Sur` (9) | `Eq Norte/Norte` (26), `Eq Norte/Sur` (15), **`Eq Norte`** (10) | `Eq Norte/Norte`, `Eq Norte/Sur` | `Equipetrol Norte` |
| Sirari | `Sirari` | `Sirari` (29) | `Sirari` (110) | `Sirari` (48) | `Sirari` | `Sirari` |
| V. Brigida | `Villa Brigida` | `Villa Brigida` (25) | `Villa Brigida` (77) | `Villa Brigida` (15), **`Villa Brígida`** (2) | `Villa Brigida` | `Villa Brigida` |
| Eq. Oeste | `Faremafu` | `Faremafu` (16) | `Faremafu` (70) | `Faremafu` (16), **`Eq Oeste`** (1) | `Faremafu` | `Faremafu` |
| Marginal | `Eq Franja` | `Eq Franja` (2) | `Eq Franja` (2) | `Eq Franja` (3) | `Eq Franja` | — |
| — | — | **`Sin zona`** (39) | **`Eq Centro`** (2) | **`Sin zona`** (4) | — | — |

**Valores en negrita** = inconsistencias/basura.

## 5. Inconsistencias Detectadas

| # | Problema | Dónde | Cantidad | Severidad |
|---|---------|-------|----------|:---------:|
| 1 | `pm.zona = 'Equipetrol Norte'` genérico (no existe en PostGIS) | proyectos_master | 5 proyectos | MEDIA |
| 2 | `pm.zona = 'Equipetrol Centro'` (nombre display) | proyectos_master | 6 proyectos | MEDIA |
| 3 | `pm.zona = 'Sin zona'` (sin asignar) | proyectos_master | 39 proyectos | ALTA |
| 4 | Alquiler p.zona sucia: `Eq Centro`(19), `Eq Norte`(10), `Villa Brígida`(2), `Eq Oeste`(1) | propiedades_v2 | 32 props | MEDIA |
| 5 | Venta p.zona residual: `Equipetrol Centro`(2) | propiedades_v2 | 2 props | BAJA |
| 6 | `zona_general` siempre = `'Equipetrol'` | zonas_geograficas | 7 rows | BAJA |
| 7 | `zonas.ts` db = `'Equipetrol Norte'` pero este valor no existe en PostGIS | zonas.ts | — | MEDIA |

## 6. Bug Funcional: `calcular_posicion_mercado`

`buscar_unidades_reales` llama `calcular_posicion_mercado(pm.zona)` con valores como `'Equipetrol Norte'`. Pero `v_metricas_mercado` agrupa por `COALESCE(microzona, zona)` que produce `'Equipetrol Norte/Norte'` o `'Equipetrol Norte/Sur'`. El `WHERE zona = p_zona` nunca matchea → **48 propiedades de venta en Eq. Norte obtienen "sin datos" en posición de mercado**.

## 7. Uso de zona vs microzona por Componente

| Componente | p.zona | p.microzona | pm.zona |
|------------|:------:|:-----------:|:-------:|
| buscar_unidades_reales | — | return only | filter, group, return |
| buscar_unidades_alquiler | filter, return | — | fallback |
| calcular_posicion_mercado | — | — | param → v_metricas_mercado |
| generar_razon_fiduciaria | fallback | primary | — |
| v_metricas_mercado (vista) | fallback | primary | — |
| matching GPS/fuzzy | p.zona = pm.zona | — | join condition |
| merge ventas | write (dead code) | — | — |
| trigger alquiler | write | write | read |
| trigger venta (173) | write | write | — |
| market.tsx (venta dashboard) | — | primary | — |
| market-alquileres.tsx | primary | — | yield mapping |
| admin propiedades | display alquiler | — | filter venta |
| zonas.ts | — | — | dropdowns (z.db) |

## 8. Propuesta de Normalización

### Principio

```
microzona (7 valores fijos de PostGIS) ──→ zona (5+1 valores canónicos)
                                            derivada por función determinística
```

### Función helper

```sql
CREATE FUNCTION microzona_a_zona(p_microzona TEXT) RETURNS TEXT AS $$
  SELECT CASE p_microzona
    WHEN 'Equipetrol Norte/Norte' THEN 'Equipetrol Norte'
    WHEN 'Equipetrol Norte/Sur' THEN 'Equipetrol Norte'
    ELSE p_microzona
  END;
$$ LANGUAGE sql IMMUTABLE;
```

El mapeo es trivial: solo Norte/Norte y Norte/Sur se agrupan. El resto pasa sin cambio.

### 5 Pasos de implementación

**Paso 1 — Helper `microzona_a_zona()`** (1 migración, riesgo nulo)
- Crear la función SQL IMMUTABLE
- No toca datos

**Paso 2 — Normalizar `proyectos_master.zona`** (1 migración, riesgo bajo)
- 6 con `'Equipetrol Centro'` → `'Equipetrol'`
- 5 con `'Equipetrol Norte'` genérico → re-derivar desde PostGIS del proyecto
- 39 con `'Sin zona'` que tengan GPS → derivar desde PostGIS
- Agregar columna `pm.microzona` (opcional, para granularidad fina)

**Paso 3 — Normalizar `propiedades_v2.zona` alquiler** (1 migración, riesgo medio)
- 19 `Equipetrol Centro` → `Equipetrol`
- 10 `Equipetrol Norte` → re-derivar desde microzona
- 2 `Villa Brígida` → `Villa Brigida`
- 1 `Equipetrol Oeste` → `Faremafu`
- Modificar `trigger_asignar_zona_alquiler`: `zona = microzona_a_zona(microzona)` en vez de `zona_general`

**Paso 4 — Arreglar `v_metricas_mercado` y `calcular_posicion_mercado`** (1 migración, riesgo medio)
- Vista: `microzona_a_zona(COALESCE(microzona, zona)) AS zona` → siempre 5+1 valores
- Corrige el bug de 48 propiedades Eq. Norte sin posición de mercado

**Paso 5 — Simplificar `zonas.ts`** (0 migraciones, riesgo bajo)
- `dbAlquiler` ya no necesario si alquiler está normalizado
- `db` ya es correcto (`'Equipetrol Norte'` = valor canónico)
- Eliminar dead code de mapeo sucio

### Resultado post-normalización

| Tabla | `microzona` | `zona` |
|-------|-------------|--------|
| zonas_geograficas | `.nombre` (7 vals) | — |
| proyectos_master | `.microzona` (nuevo, 7 vals) | `.zona` = microzona_a_zona() (5+1 vals) |
| propiedades_v2 | `.microzona` (7 vals, PostGIS) | `.zona` = microzona_a_zona() (5+1 vals) |
| v_metricas_mercado | — | microzona_a_zona() (5+1 vals) |
| zonas.ts | — | z.db = 5 vals canónicos |

**Una convención, una función de mapeo, cero ambigüedad.**

### Cleanup adicional (opcional)

- Eliminar lógica de zona del merge ventas (dead code, líneas 450-465)
- Eliminar `zona_general` de `zonas_geograficas` (siempre 'Equipetrol', inútil)
- Eliminar `dbAlquiler` de `zonas.ts` (ya no necesario post-normalización)

---

*Diagnóstico generado con queries directas a producción. Datos al 2026-03-01.*
