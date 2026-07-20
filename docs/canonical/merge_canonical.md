# MERGE - DOCUMENTO CANONICO

> ⚠️ **ALCANCE (19-jul-2026):** describe el productor **n8n** (`merge_discovery_enrichment()`). Los **deptos de
> Equipetrol (venta+alquiler)** tienen un productor alternativo — el **flujo híbrido** — que escribe el consolidado
> DIRECTO a `propiedades_v2_shadow` **sin pasar por estas fases**. Al cutover esta descripción deja de aplicar a esa
> vertical (el resto sigue en n8n). Ojo: el **"TC oficial 6.96"** de este doc **ya no es el marco vigente** — ver
> `scripts/deptos-equipetrol/TC_NUEVO_DECISION.md`. Mapa: `scripts/deptos-equipetrol/CUTOVER_DATA_PLAN.md`.

**Version doc:** 3.1.0
**Funcion en produccion:** `merge_discovery_enrichment()` **v2.6.0** (verificar con `pg_get_functiondef`)
**Fecha:** 22 Mayo 2026
**Estado:** IMPLEMENTADO Y VALIDADO
**Archivo:** `docs/canonical/merge_canonical.md`

> **Nota:** Este documento cubre exclusivamente `merge_discovery_enrichment()` (venta).
> El merge de alquiler (`merge_alquiler()`) es una funcion SEPARADA documentada en
> `docs/canonical/pipeline_alquiler_canonical.md`.

---

## 0. CAMBIO ARQUITECTONICO v2.0.0

### Breaking Changes

1. **Inversion de prioridad para campos fisicos:**
   - Antes: Enrichment > Discovery
   - **Ahora: Discovery > Enrichment** para area, dorms, banos, estacionamientos, GPS

2. **Helper obligatorio:** `get_discovery_value()` para normalizar paths Remax vs C21

3. **Scoring post-merge integrado** con `flags_semanticos`

4. **Regla precio con fallback:** Si discrepancia >10%, usar Enrichment

### Nueva Arquitectura

```
Discovery -> Enrichment (Extract) -> Merge (Consolidate + Score) -> Completado
```

---

## 1. RESPONSABILIDAD UNICA

Consolidar datos de Discovery + Enrichment aplicando reglas de prioridad, calcular scores de calidad y validar coherencia tecnica.

### Pipeline

```
Propiedad status='nueva' o 'actualizado'
  |
[FASE 1: EXTRACCION] Helper normaliza paths por portal
  |
[FASE 2: RESOLUCION] Aplica reglas de prioridad
  |
[FASE 3: DISCREPANCIAS] Calcula diferencias con thresholds
  |
[FASE 4: SCORING] Calcula scores sobre datos consolidados
  |
[FASE 5: TC PARALELO] Escribe tipo_cambio_detectado y tipo_cambio_usado a columnas
  |
[FASE 6: PERSISTENCIA] UPDATE con status='completado'
```

---

## 2. REGLAS DE PRIORIDAD v2.0.0

### Jerarquia

```
1. Candados manuales (campos_bloqueados) -> SIEMPRE respetados
2. Discovery > Enrichment -> Para campos fisicos y GPS
3. Enrichment > Discovery -> Para precio normalizado y resto
```

### Matriz de Prioridad

| Campo | Prioridad | Razon |
|-------|-----------|-------|
| `area_total_m2` | **Discovery > Enrichment** | API estructurada mas confiable |
| `dormitorios` | **Candado → LLM(alta, ≠disc) → Discovery → LLM → Enrichment** | v2.4.0: capa LLM + guardrail monoambiente (ver §2.1) |
| `banos` | **Discovery > Enrichment** | API estructurada mas confiable |
| `estacionamientos` | **Discovery > Enrichment** | API estructurada mas confiable |
| `latitud`, `longitud` | **Discovery > Enrichment** | GPS de API mas preciso |
| `nombre_edificio` | **Hibrido LLM** (LLM alta gana si disc/regex es basura o no matchea PM) | v2.6.0 (ver §2.1) |
| `estado_construccion` | **LLM** (con proteccion inmediata→preventa) | v2.4.0 (ver §2.1) |
| `zona` | **Discovery > Enrichment** | v2.1.0 - Para Modulo 2 Matching |
| `tipo_cambio_detectado` | **Enrichment + upgrade LLM** | v2.5.0: LLM alta sube `no_especificado`→especifico |
| `precio_usd` | **Condicional** | Ver regla especial (§3) |
| Resto (amenities, agente, etc.) | Enrichment > Discovery | HTML mas detallado |

### 2.1 Capa LLM (Fase C, v2.4.0+)

El enrichment LLM (Haiku 4.5) corre tras el enrichment regex y escribe `llm_output` en `datos_json_enrichment`. El merge lo consume con jerarquias propias por campo. Principio: **el LLM lee el texto, el discovery trae datos estructurados del portal**; el LLM gana solo con confianza `alta` y donde el dato estructurado es poco confiable.

**Dormitorios** (orden de resolucion):
1. Candado → `blocked`
2. LLM `alta` Y distinto de discovery → `llm`
3. Discovery → `discovery`
4. LLM (sin `alta`) → `llm`
5. Enrichment regex → `enrichment`
6. Valor existente → `existing`

> **Guardrail monoambiente** (mig 246): tras resolver dormitorios, si NO esta candado, quedo `>=1` y la URL o `datos_json_discovery` contienen `'monoambiente'`, se fuerza a `0` con `fuente_dormitorios='monoambiente_guardrail'`. Causa: el LLM suele devolver `dormitorios=null` para monoambientes y discovery (`recamaras=1`) gana. Espejo del guardrail de alquiler (mig 214). Detalle: `docs/backlog/CALIDAD_DATOS_BACKLOG.md`.

**Nombre edificio** (hibrido, v2.6.0): si esta candado → `blocked`. Si no, se calcula el mejor nombre NO-LLM (`COALESCE(discovery, enrichment regex)`):
- El LLM `alta` **gana** si el mejor nombre no-LLM (a) es basura detectada por `_is_nombre_edificio_sospechoso()` **o** (b) no matchea ningun proyecto via `_nombre_existe_en_proyectos()`.
- Si el nombre no-LLM es valido y matchea un PM → se respeta (`discovery`/`enrichment`, safe path).
- Si discovery/regex estan vacios → LLM como fallback.

**Estado construccion** (v2.4.0): si no esta candado y el LLM trae valor, se usa el LLM — **excepto** si el valor actual es `entrega_inmediata` y el LLM dice `preventa` (no se degrada: fuente `existing_protected`).

**Tipo de cambio** (v2.5.0): el merge solo hace **upgrade** con LLM `alta` confianza, subiendo `no_especificado` → `oficial`/`paralelo`. Nunca pisa un TC ya especifico.

---

## 3. REGLA PRECIO (Especial)

```javascript
function determinarPrecioFinal(discovery, enrichment, candados, fuente) {
  // 1. Candado siempre gana
  if (candados.precio_usd) return { valor: actual, fuente: 'blocked' };

  // 2. Si enrichment normalizo (BOB->USD), usar enrichment
  if (enrichment.precio_fue_normalizado ||
      enrichment.tipo_cambio_detectado !== 'no_especificado') {
    return { valor: enrichment.precio_usd, fuente: 'enrichment' };
  }

  // 3. Si discovery tiene USD puro
  const discoveryPrecioUSD = getDiscoveryPrecioUSD(discovery, fuente);
  if (discoveryPrecioUSD) {
    const diff = Math.abs(discoveryPrecioUSD - enrichment.precio_usd) / discoveryPrecioUSD;

    // Discrepancia > 10% -> fallback a enrichment
    if (diff > 0.10) {
      return { valor: enrichment.precio_usd, fuente: 'enrichment_fallback' };
    }

    return { valor: discoveryPrecioUSD, fuente: 'discovery' };
  }

  // 4. Default: enrichment
  return { valor: enrichment.precio_usd, fuente: 'enrichment' };
}
```

### Thresholds Discrepancias

| Rango | Flag | Accion |
|-------|------|--------|
| < 2% | null | OK, usar valor normal |
| 2-10% | warning | Registrar, usar valor normal |
| > 10% | error | **Fallback a enrichment** (solo precio) |

---

## 4. HELPER OBLIGATORIO

### get_discovery_value()

Normaliza paths diferentes entre Remax y Century21:

| Campo | REMAX Path | C21 Path |
|-------|------------|----------|
| area_total_m2 | `listing_information.construction_area_m` | `m2C` |
| dormitorios | `listing_information.number_bedrooms` | `recamaras` |
| banos | `listing_information.number_bathrooms` | `banos` |
| latitud | `location.latitude` (STRING->NUMERIC) | `lat` |
| longitud | `location.longitude` (STRING->NUMERIC) | `lon` |
| precio_usd | `price.price_in_dollars` | Solo si `moneda=USD` |

### Wrappers

```sql
get_discovery_value(campo, discovery, fuente) -> TEXT
get_discovery_value_numeric(campo, discovery, fuente) -> NUMERIC
get_discovery_value_integer(campo, discovery, fuente) -> INTEGER
```

---

## 5. SCORING POST-MERGE

### Score Calidad Dato (0-100)

```javascript
// Campos core: 70 pts (7 campos x 10 pts)
const camposCore = [
  'precio_usd', 'area_total_m2', 'dormitorios', 'banos',
  'latitud+longitud', 'tipo_operacion', 'estado_construccion'
];

// Campos opcionales: 30 pts
const camposOpcionales = [
  'estacionamientos', 'nombre_edificio', 'amenities',
  'descripcion', 'agente_nombre', 'cantidad_fotos'
];
```

### Score Fiduciario

```javascript
scoreFiduciario = scoreCalidadDato - penalizaciones;

// Penalizaciones:
// - precio_m2 < 500: -15 pts (error)
// - precio_m2 > 5000: -10 pts (warning)
// - area < 30m2 con multiples dorms: -5 pts
// - banos > dorms + 2: -5 pts
```

---

## 6. ESTRUCTURA datos_json FINAL

```javascript
{
  "version_merge": "2.6.0",
  "timestamp_merge": "2026-...",
  "fuente": "century21|remax",

  "financiero": {
    "precio_usd": 97700,
    "precio_m2": 2714,
    "moneda_original": "BOB",
    "tipo_cambio_usado": 6.96,
    "tipo_cambio_detectado": "oficial|paralelo|no_especificado",
    "fuente_precio": "discovery|enrichment|enrichment_fallback|blocked",
    "precio_fue_normalizado": false,
    "depende_de_tc": true
  },

  "fisico": {
    "area_total_m2": 36,
    "fuente_area": "discovery",
    "dormitorios": 1,
    "fuente_dormitorios": "discovery",
    "es_monoambiente": false,
    "banos": 1,
    "fuente_banos": "discovery",
    "es_multiproyecto": false
  },

  "ubicacion": {
    "latitud": -17.7718816,
    "longitud": -63.1993099,
    "fuente_gps": "discovery",
    "zona": "Equipetrol",
    "fuente_zona": "discovery"
  },

  "proyecto": {
    "nombre_edificio": "Torre Platinum",
    "fuente_nombre_edificio": "enrichment",
    "nombre_edificio_nivel_confianza": 0.9,
    "estado_construccion": "entrega_inmediata",
    "fuente_estado_construccion": "llm",
    ...
  },
  "amenities": { ... },
  "agente": { ... },
  "contenido": { ... },

  "calidad": {
    "score_calidad_dato": 92,
    "score_fiduciario": 89,
    "flags_semanticos": [],
    "requiere_revision_humana": false,
    "es_para_matching_verificado": true
  },

  "discovery_metadata": {
    "status_portal": "enPromocion",
    "id_original": "92963"
  },

  "discrepancias": {
    "precio": { "discovery": 97701, "enrichment": 97700, "diff_pct": 0.001, "flag": null },
    "area": { "discovery": 36, "enrichment": 36, "diff_pct": 0, "flag": null }
  },

  "trazabilidad": {
    "merge_version": "2.6.0",
    "fecha_merge": "2026-..."
  }
}
```

---

## 7. FUNCION SQL

```sql
merge_discovery_enrichment(p_identificador TEXT) RETURNS JSONB
```

### Busqueda (orden)
1. `codigo_propiedad` (mas comun)
2. `id` (numerico)
3. `url` (fallback)

### Status Entrada Validos
- `nueva`
- `actualizado`

### Status Salida
- **SIEMPRE `completado`**

---

## 8. PRECIO NORMALIZADO (v2.2.0+)

### Problema

Muchos listings en Bolivia publican precios en USD pero al tipo de cambio paralelo (dinamico, siempre > 6.96 oficial; ver `config_global.tipo_cambio_paralelo`) en lugar del oficial (6.96 Bs/USD). Esto infla los precios USD, contaminando estudios de mercado y comparativas.

### Solucion: `precio_normalizado()`

Funcion helper (migracion 167-168) que convierte precios detectados en TC paralelo a USD reales:

```sql
CREATE OR REPLACE FUNCTION precio_normalizado(
  p_precio_usd numeric,
  p_tipo_cambio_detectado text
) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_tipo_cambio_detectado = 'paralelo' THEN
      ROUND(p_precio_usd * (
        SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'
      ) / 6.96, 2)
    ELSE p_precio_usd
  END;
$$;
```

### Como funciona

1. El enrichment LLM detecta `tipo_cambio_detectado` = `oficial` | `paralelo` | `no_especificado`
2. El merge escribe esta columna a `propiedades_v2` (fix v2.2.0)
3. `precio_normalizado()` lee el TC paralelo dinamico de `config_global` (actualizado por workflow Binance P2P)
4. Convierte: `precio_usd * tc_paralelo / 6.96` para obtener USD reales

### Uso

Usado en `buscar_unidades_reales()` y estudios de mercado para obtener precios comparables:

```sql
SELECT
  precio_normalizado(precio_usd, tipo_cambio_detectado) AS precio_real_usd
FROM propiedades_v2
WHERE ...
```

### Columnas TC en propiedades_v2

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `tipo_cambio_detectado` | text | `oficial`, `paralelo`, `no_especificado` |
| `tipo_cambio_usado` | numeric | TC numerico aplicado en enrichment |
| `depende_de_tc` | boolean | true si precio depende de conversion BOB->USD |

---

## 9. CANDADOS: FORMATO DUAL (v2.3.0)

### Problema

El admin panel envia `campos_bloqueados` en formato diferente al original del merge:

- **Formato original (merge):** `["precio_usd", "area_total_m2"]`
- **Formato admin panel:** `{"precio_usd": true, "area_total_m2": true}`

### Solucion: `_is_campo_bloqueado()`

Helper interno que detecta ambos formatos:

```sql
-- Detecta si un campo esta bloqueado en cualquier formato
_is_campo_bloqueado(p_campos_bloqueados jsonb, p_campo text) RETURNS boolean
```

Esto evita que el merge sobreescriba valores editados manualmente desde el admin.

---

## 10. VALIDACION IMPLEMENTACION

### Checklist

```
HELPERS:
- get_discovery_value() implementado
- Casteo GPS Remax (string->numeric)
- Paths por portal normalizados
- _is_campo_bloqueado() detecta formato array y objeto

PRIORIDAD:
- Candados SIEMPRE respetados (ambos formatos)
- Discovery > Enrichment (area, dorms, banos, GPS)
- Precio condicional con fallback 10%

TC PARALELO:
- tipo_cambio_detectado escrito a columna (no solo JSON)
- tipo_cambio_usado escrito a columna
- depende_de_tc calculado correctamente
- precio_normalizado() disponible para queries

SCORING:
- Calculado sobre datos consolidados
- flags_semanticos generados
- requiere_revision_humana calculado

VALIDACIONES:
- banos < 100 (previene overflow NUMERIC(3,1))

PERSISTENCIA:
- Status SIEMPRE es 'completado'
- datos_json con 11 secciones
- discrepancias_detectadas poblado
```

---

## 11. ARCHIVOS

| Archivo | Version | Ubicacion |
|---------|---------|-----------|
| `merge_discovery_enrichment.sql` | v2.6.0 | `sql/functions/merge/` |
| `funciones_helper_merge.sql` | v2.0.0 | `sql/functions/merge/` |
| `funciones_auxiliares_merge.sql` | v2.0.0 | `sql/functions/merge/` |
| `CHANGELOG_MERGE.md` | - | `sql/functions/merge/` |
| Migraciones relevantes | 132-168 (base) + LLM/hibrido + 246 (guardrail) | `sql/migrations/` |

> Para la version exacta en produccion: `SELECT pg_get_functiondef('merge_discovery_enrichment(text)'::regprocedure)`. La fuente de verdad es la funcion, no este doc.

---

## 12. CONTROL DE VERSIONES

| Version | Fecha | Cambios |
|---------|-------|---------|
| doc 3.1.0 | 22 May 2026 | Alinea doc con funcion v2.6.0: capa LLM (§2.1), nombre hibrido, estado_construccion via LLM, TC upgrade LLM, guardrail monoambiente (mig 246) |
| fn 2.6.0 + mig 246 | May 2026 | `nombre_edificio` hibrido (LLM alta gana si disc/regex es basura o no matchea PM). Mig 246 (sin bump): guardrail monoambiente — `dormitorios`→0 si URL/crudo dice "monoambiente" |
| fn 2.5.0 | Abr 2026 | Upgrade `tipo_cambio_detectado` con LLM alta confianza (solo `no_especificado`→especifico, nunca pisa TC ya especifico) |
| fn 2.4.0 | Mar 2026 | Capa LLM (Fase C): jerarquia `dormitorios` candado→LLM alta→discovery→LLM→enrichment; `estado_construccion` via LLM con proteccion inmediata→preventa |
| doc 3.0.0 | 28 Feb 2026 | Documento canonico actualizado. Documenta precio_normalizado(), candados dual-format, TC columns fix |
| fn 2.3.0 | 29 Ene 2026 | Fix candados formato dual (`_is_campo_bloqueado()` helper). Fix banos < 100 validacion (previene overflow NUMERIC(3,1)) |
| 2.2.0 | 14 Ene 2026 | Fix columnas TC: `tipo_cambio_detectado`, `tipo_cambio_usado` ahora escritas a propiedades_v2 (antes solo en JSON). Fix calculo `depende_de_tc`. Postmortem: 477 propiedades tenian NULL en columnas TC |
| 2.1.0 | 25 Dic 2025 | Soporte columnas `nombre_edificio` y `zona` para Modulo 2 |
| 2.0.1 | 24 Dic 2025 | Fix area=0 fallback a enrichment |
| 2.0.0 | 23 Dic 2025 | Inversion prioridad fisicos, helper obligatorio, scoring integrado, fallback precio |
| 1.2.0 | Dic 2024 | Version inicial con funciones auxiliares |

---

**FIN DEL DOCUMENTO CANONICO**
