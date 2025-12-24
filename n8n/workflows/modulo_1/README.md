# n8n Workflows — SICI Discovery

**Sistema:** SICI — Sistema Inteligente de Captura Inmobiliaria  
**Módulo:** Módulo 1 — Discovery & Existencia  
**Versión:** 1.2.0  
**Fecha:** 24 Diciembre 2025

---

## 📁 Workflows Disponibles

| Archivo | Descripción | Versión | Estado |
|---------|-------------|---------|--------|
| `flujo_a_discovery_century21_v1.0.3_FINAL.json` | Flujo A Discovery Century21 | v1.0.3 | ✅ Producción |
| `flujo_a_discovery_remax_v1.0.2_FINALjson` | Flujo A Discovery Remax | v1.0.2 | ✅ Producción |
| `flujo_b_processing_v3.0.json` | Flujo B Enrichment (HTML) | v3.0 | ✅ Producción |
| `Flujo Merge - Nocturno v1.0.0.json` | Merge Discovery + Enrichment | v1.0.0 | ✅ Producción |
| `flujo_c_verificador_v1.1.0_FINAL.json.json` | Verificador propiedades inactivas | v1.1.0 | ✅ Producción |

**Nota:** Flujo B fue movido de `modulo_2/` a `modulo_1/` (24 Dic 2025) ya que es parte integral del pipeline del Módulo 1.

## ⏰ Schedule Nocturno

| Hora | Workflow | Descripción | Slack |
|------|----------|-------------|-------|
| 1:00 AM | Flujo A Discovery (C21 + Remax) | Detecta URLs nuevas | ✅ |
| 2:00 AM | Flujo B Enrichment | Extrae datos HTML | ✅ |
| **3:00 AM** | **Flujo Merge** | Fusiona Discovery + Enrichment | ✅ |
| 6:00 AM | Flujo C Verificador | Verifica propiedades inactivas | ✅ |

**Nota:** Discovery captura ~273 propiedades (Century21) y ~160 propiedades (Remax) diariamente.

---

## 🔄 Flujo A — Discovery Century21 v1.0.3 FINAL

### ✅ Estado Actual

- **Versión:** v1.0.3 FINAL
- **Última actualización:** 18 Diciembre 2025
- **Estado:** ✅ Producción
- **Cobertura campos:** 100% de campos disponibles extraídos

### 📊 Campos Extraídos

| Campo | Fuente JSON | Cobertura | Notas |
|-------|-------------|-----------|-------|
| `url` | `urlCorrectaPropiedad` | 100% | |
| `codigo_propiedad` | `id` | 100% | |
| `latitud` | `lat` | 100% | |
| `longitud` | `lon` | 100% | |
| `precio_usd` | calculado | ~15% | Solo cuando moneda=USD |
| `precio_usd_original` | `precio` | 100% | |
| `moneda_original` | `moneda` | 100% | |
| `area_total_m2` | `m2C` | 99% | ✅ v1.0.2: Corregido |
| `dormitorios` | `recamaras` | 66% | ✅ v1.0.2: Corregido |
| `banos` | `banos` | 68% | C21 a veces null |
| `estacionamientos` | `estacionamientos` | 13% | ✅ v1.0.3: Agregado |
| `tipo_propiedad_original` | `tipoPropiedad` | 99% | |
| `fecha_publicacion` | `fechaAlta` | 99% | ✅ v1.0.3: Agregado |

### 📝 Changelog

**v1.0.3 (18 Dic 2025) - FINAL:**
- ✅ Agregado: `fecha_publicacion` (usa `fechaAlta`)
- ✅ Agregado: `estacionamientos`
- ✅ Query SQL con 17 parámetros completos

**v1.0.2 (18 Dic 2025):**
- ✅ Corregido: `area_total_m2` ahora usa `m2C` (NO `superficie`)
- ✅ Corregido: `dormitorios` ahora usa `recamaras` (NO `dormitorios`)
- ✅ Agregado: Cálculo de `precio_usd` cuando moneda=USD

**v1.0.0 (16 Dic 2025):**
- Versión inicial

### 🏗️ Arquitectura

```
[Trigger 1:00 AM]
       │
═══════╪═══ SNAPSHOT (Grid Geográfico) ═════════════════════
       │
       ▼
[Generar Cuadrantes] → [Split] → [HTTP Request Grid] → [Wait 2s] → [Extraer Props]
   (~6 cuadrantes)       │                                              │
                         └──────────────────────────────────────────────┘
                                      │
                                      ▼
                               [Aggregate]
       │
═══════╪═══ COMPARACIÓN ════════════════════════════════════
       │
       ▼
[Query BD Activas] → [Preparar Comparación] → [Log Stats]
                      (deduplicación crítica
                       por grid overlap)
       │
═══════╪═══ DECISIÓN ═══════════════════════════════════════
       │
       ├──→ [Propiedades] → registrar_discovery() → INSERT/UPDATE
       └──→ [Ausentes] ───→ UPDATE directo → inactivo_pending
                                      │
                                      ▼
                              [Resumen Final]
```

### ⚙️ Configuración Grid

```javascript
LAT_SUR = -17.775
LAT_NORTE = -17.750
LON_OESTE = -63.205
LON_ESTE = -63.185
STEP = 0.010  // ~1.1km por cuadrante
```

**Resultado:** ~6 cuadrantes que cubren completamente Equipetrol

### 📋 Prerequisitos

1. **Credencial Postgres** configurada en n8n
   - Nombre sugerido: `Supabase SICI`
   - Configurar en 3 nodos:
     - "Registrar Discovery"
     - "Obtener URLs Activas BD"
     - "Marcar Ausentes"

2. **Función SQL desplegada**
   - `registrar_discovery()` v2.0.0 en Supabase

3. **Tabla existente**
   - `propiedades_v2` con estructura canónica

### 📥 Importar en n8n

1. Abrir n8n → Settings → Import from File
2. Seleccionar `flujo_a_discovery_century21_v1.0.3_FINAL.json`
3. Configurar credencial Postgres en los 3 nodos
4. Guardar y activar

---

## 🧪 Testing

### ✅ Test 1: Verificar campos extraídos

```sql
SELECT 
    COUNT(*) as total,
    COUNT(area_total_m2) as con_area,
    COUNT(dormitorios) as con_dormitorios,
    COUNT(banos) as con_banos,
    COUNT(estacionamientos) as con_estacionamientos,
    COUNT(fecha_publicacion) as con_fecha_pub,
    ROUND(COUNT(area_total_m2)::NUMERIC / COUNT(*) * 100, 2) as porcentaje_area
FROM propiedades_v2
WHERE fuente = 'century21'
  AND fecha_discovery >= NOW() - INTERVAL '1 hour';
```

**Resultado esperado:**
```
total: ~273
con_area: ~273 (100%)
con_dormitorios: ~180 (66%)
con_estacionamientos: ~35 (13%)
con_fecha_pub: ~273 (99%)
```

### ✅ Test 2: Verificar precio_usd

```sql
SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN moneda_original = 'USD' THEN 1 END) as con_usd,
    COUNT(CASE WHEN moneda_original = 'BOB' THEN 1 END) as con_bob,
    COUNT(precio_usd) as con_precio_usd_poblado
FROM propiedades_v2
WHERE fuente = 'century21'
  AND fecha_discovery >= NOW() - INTERVAL '1 hour';
```

**Resultado esperado:**
```
total: ~273
con_usd: ~40 (15%)
con_bob: ~233 (85%)
con_precio_usd_poblado: ~40 (15%)
```

**Nota:** `precio_usd` solo se puebla cuando `moneda_original = 'USD'`. Esto es correcto.

### ✅ Test 3: Verificar snapshot completo

```sql
-- Ver ejemplo de propiedad con todos los campos
SELECT 
    id,
    codigo_propiedad,
    precio_usd,
    precio_usd_original,
    moneda_original,
    area_total_m2,
    dormitorios,
    banos,
    estacionamientos,
    fecha_publicacion,
    tipo_propiedad_original,
    datos_json_discovery->>'m2C' as m2c_json,
    datos_json_discovery->>'recamaras' as recamaras_json,
    datos_json_discovery->>'fechaAlta' as fecha_alta_json
FROM propiedades_v2
WHERE fuente = 'century21'
  AND fecha_discovery >= NOW() - INTERVAL '1 hour'
ORDER BY id DESC
LIMIT 3;
```

---

## 📊 Comparación con Remax

| Aspecto | Remax | Century21 |
|---------|-------|-----------|
| **Método snapshot** | API paginada (8 páginas) | Grid geográfico (~6 cuadrantes) |
| **Headers HTTP** | Básicos | Completos (CORS, cookie) |
| **Cookie** | No requerida | Auto-emitida (PHPSESSID) |
| **Duplicados** | 0% | 5-10% (por overlap de grid) |
| **Parsing** | Directo | Defensivo (3 estructuras) |
| **Tiempo ejecución** | ~20s | ~15s |
| **Cobertura precio_usd** | 99% | 15% (resto BOB) |
| **Cobertura área** | 99% | 99% |
| **Cobertura dormitorios** | 83% | 66% |

---

## 📚 Documentación Relacionada

- **Función SQL:** `sql/functions/registrar_discovery.sql` v2.0.0
- **Arquitectura:** `docs/MODULO_1_FLUJO_A_IMPLEMENTACION.md`
- **JSON Reference:** `docs/JSON_DISCOVERY_REFERENCE.md`
- **Workflows finales:** `FLUJO_A_WORKFLOWS_FINALES.md`

---

## ⚠️ Notas Importantes

### 1. Campos con baja cobertura (esperado)

- **dormitorios (66%):** Century21 no siempre proporciona `recamaras` en JSON de mapa
- **banos (68%):** Century21 a veces tiene este campo como null
- **estacionamientos (13%):** Muy raro en ambos portales

**Esto NO es un error del workflow, es limitación de la fuente.**

### 2. precio_usd = 0 cuando todas son BOB

Si el snapshot del día tiene 0 propiedades USD:
```
con_precio_usd: 0
```

Esto es **correcto**. Century21 tiene principalmente propiedades en BOB.

### 3. Parsing defensivo implementado

El workflow maneja 3 estructuras diferentes de respuesta:
- Array directo: `[{...}]`
- Con results: `{results: [{...}]}`
- Con datas: `{datas: {results: [{...}]}}`

---

## 🔧 Mantenimiento

### Actualizar número de cuadrantes

Si Equipetrol crece y necesitas más cobertura:

```javascript
// En nodo "Generar Cuadrantes Grid"
const LAT_SUR = -17.775;    // Ajustar coordenadas
const LAT_NORTE = -17.750;
const LON_OESTE = -63.205;
const LON_ESTE = -63.185;
const STEP = 0.010;         // Reducir STEP = más cuadrantes
```

### Monitorear rate limits

Si Century21 bloquea requests:
- Aumentar `Wait 2s` a 3-4 segundos
- Verificar headers HTTP
- Regenerar cookie en cada ejecución

---

## 🚀 Deploy

### Configuración Schedule

- **Trigger:** Cron `0 1 * * *` (1:00 AM diario)
- **Duración estimada:** 15-20 segundos
- **Prioridad:** Alta (ejecutar antes que Flujo B)

### Activación

1. Importar workflow
2. Configurar credenciales (3 nodos)
3. Ejecutar test manual
4. Verificar logs sin errores
5. Activar schedule

---

---

## 📦 Changelog Repo

**v1.2.0 (24 Dic 2025):**
- Flujo B movido de modulo_2/ a modulo_1/
- Flujo Merge con Slack webhook configurado
- Todos los schedules activos

**v1.1.0 (23 Dic 2025):**
- Agregado Flujo Merge v1.0.0
- SQL merge_discovery_enrichment v2.0.0

**v1.0.0 (18 Dic 2025):**
- Flujos A y C finalizados

---

**Versión documento:** 1.2.0  
**Última actualización:** 24 Diciembre 2025  
**Mantenedor:** Equipo SICI
