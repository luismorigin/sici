# MERGE - DOCUMENTO CANÓNICO

**Versión:** 2.0.0  
**Fecha:** Diciembre 2024  
**Estado:** DEFINITIVO - SCORING POST-MERGE  
**Archivo:** `docs/canonical/merge_canonical.md`

---

## 0. CAMBIO ARQUITECTÓNICO v2.0

**BREAKING CHANGE:** Scoring y Verificación movidos de Flujo B a fase post-Merge.

**Razón del cambio:**
- Los scores deben calcularse sobre datos **consolidados** (Discovery + Enrichment)
- Scorear datos parciales (solo enrichment) no refleja calidad real
- El Verificador debe validar coherencia de datos **finales**, no intermedios

**Nueva arquitectura:**
```
Discovery → Enrichment (Extract) → Merge (Consolidate + Score + Verify) → Completado
```

---

## 1. RESPONSABILIDAD ÚNICA

**Consolidar datos de Discovery + Enrichment aplicando reglas de prioridad, luego calcular scores de calidad y validar coherencia técnica sobre los datos finales consolidados.**

### Pipeline completo

```
Propiedad status='actualizado'
  ↓
[FASE 1: CONSOLIDACIÓN]
  Aplica reglas de prioridad
  Resuelve discrepancias
  ↓
datos_json (Discovery + Enrichment merged)
  ↓
[FASE 2: SCORING]
  Calcula completitud de datos
  ↓
score_calidad_dato (0-100)
  ↓
[FASE 3: VERIFICACIÓN]
  Valida coherencia técnica
  ↓
score_fiduciario (0-100) + flags_semanticos
  ↓
Propiedad status='completado' + scores finales
```

---

## 2. REGLAS DE PRIORIDAD PARA CONSOLIDACIÓN

### Jerarquía de fuentes

```
1. Candados manuales (campos_bloqueados) → SIEMPRE respetados
2. Enrichment > Discovery → Datos HTML priorizados
3. Excepción GPS: Discovery > Enrichment → Coordenadas de API más confiables
```

### Casos especiales

| Campo | Regla | Razón |
|-------|-------|-------|
| `latitud`, `longitud` | Discovery > Enrichment | GPS de API más preciso que HTML parsing |
| `precio_usd` | Enrichment > Discovery | HTML tiene detalles completos |
| `area_total_m2` | Enrichment > Discovery | HTML más confiable |
| `id_proyecto_master` | Manual > Sugerencia | Decisión humana prioritaria |

---

## 3. FASE 1: CONSOLIDACIÓN

### 3.1 Lógica de merge

```javascript
function consolidar(discovery, enrichment, candados) {
  const datosConsolidados = {};
  
  for (const campo in CAMPOS_MERGE) {
    // 1. Si está bloqueado manualmente → preservar
    if (candados[campo]) {
      datosConsolidados[campo] = valorActual(campo);
      continue;
    }
    
    // 2. Excepción GPS: Discovery > Enrichment
    if (['latitud', 'longitud'].includes(campo)) {
      datosConsolidados[campo] = discovery[campo] || enrichment[campo];
      continue;
    }
    
    // 3. Regla general: Enrichment > Discovery
    datosConsolidados[campo] = enrichment[campo] || discovery[campo];
  }
  
  return datosConsolidados;
}
```

### 3.2 Detección de discrepancias

```javascript
function detectarDiscrepancias(discovery, enrichment) {
  const discrepancias = [];
  
  for (const campo of CAMPOS_CRITICOS) {
    const valDiscovery = discovery[campo];
    const valEnrichment = enrichment[campo];
    
    if (valDiscovery && valEnrichment && valDiscovery !== valEnrichment) {
      discrepancias.push({
        campo: campo,
        discovery: valDiscovery,
        enrichment: valEnrichment,
        resolucion: 'enrichment',  // Por regla de prioridad
        diferencia: calcularDiferencia(valDiscovery, valEnrichment)
      });
    }
  }
  
  return discrepancias;
}
```

---

## 4. FASE 2: SCORING (POST-CONSOLIDACIÓN)

**NUEVO en v2.0:** Los scores ahora se calculan sobre `datos_json` (consolidado), NO sobre `datos_json_enrichment` (parcial).

### 4.1 Campos Core (Requeridos)

```javascript
const CAMPOS_CORE = [
  'precio_usd',
  'area_total_m2',
  'dormitorios',
  'banos',
  'tipo_operacion',
  'estado_construccion',
  'latitud',
  'longitud',
  'fuente',
  'url'
];
```

### 4.2 Cálculo de score

```javascript
function calcularScoreCalidadDato(datosConsolidados) {
  let scoreCore = 0;
  
  // Validar campos core (70 puntos máx)
  for (const campo of CAMPOS_CORE) {
    if (validarCampo(campo, datosConsolidados[campo])) {
      scoreCore += 7;  // 10 campos × 7pts = 70pts
    }
  }
  
  // Validar campos opcionales (30 puntos máx)
  const scoreOpcionales = calcularScoreOpcionales(datosConsolidados);
  
  const scoreFinal = scoreCore + scoreOpcionales;
  
  return {
    score_calidad_dato: Math.round(scoreFinal),
    score_core: scoreCore,
    score_opcionales: scoreOpcionales,
    es_para_matching: (scoreCore === 70)
  };
}
```

---

## 5. FASE 3: VERIFICACIÓN (POST-CONSOLIDACIÓN)

**NUEVO en v2.0:** Verificación sobre datos consolidados, no sobre datos parciales.

### 5.1 Validaciones de coherencia

```javascript
function verificarCoherencia(datosConsolidados, scoreCalidadDato) {
  const flags = [];
  
  // 1. Precio/m² razonable
  const precioM2 = datosConsolidados.precio_usd / datosConsolidados.area_total_m2;
  if (precioM2 < 500 || precioM2 > 5000) {
    flags.push({
      tipo: precioM2 < 500 ? 'error' : 'warning',
      campo: 'precio_m2',
      valor: precioM2,
      razon: precioM2 < 500 ? 'Precio/m² muy bajo' : 'Precio/m² muy alto'
    });
  }
  
  // 2. Área vs Dormitorios
  if (datosConsolidados.area_total_m2 < 30 && datosConsolidados.dormitorios > 1) {
    flags.push({
      tipo: 'warning',
      campo: 'area_vs_dormitorios',
      razon: 'Área pequeña para múltiples dormitorios'
    });
  }
  
  // 3. Baños vs Dormitorios
  if (datosConsolidados.banos > datosConsolidados.dormitorios + 2) {
    flags.push({
      tipo: 'warning',
      campo: 'banos_vs_dormitorios',
      razon: 'Más baños de lo típico'
    });
  }
  
  return flags;
}
```

### 5.2 Score fiduciario

```javascript
function calcularScoreFiduciario(scoreCalidadDato, flags) {
  let penalizacion = 0;
  
  for (const flag of flags) {
    if (flag.tipo === 'warning') penalizacion += 5;
    if (flag.tipo === 'error') penalizacion += 15;
  }
  
  const scoreFiduciario = Math.max(0, scoreCalidadDato - penalizacion);
  
  return {
    score_fiduciario: scoreFiduciario,
    penalizacion_total: penalizacion,
    es_para_matching_verificado: (scoreFiduciario >= 80 && errores === 0)
  };
}
```

---

## 6. FUNCIÓN SQL: merge_discovery_enrichment()

### 6.1 Firma v2.0

```sql
CREATE OR REPLACE FUNCTION merge_discovery_enrichment(
    p_identificador TEXT
) RETURNS JSONB
```

**Acepta:** `id`, `codigo_propiedad`, o `url`

### 6.2 Pipeline completo

```sql
BEGIN
    -- 1. Obtener datos discovery y enrichment
    SELECT datos_json_discovery, datos_json_enrichment, campos_bloqueados
    INTO v_discovery, v_enrichment, v_candados
    FROM propiedades_v2 WHERE [identificador];
    
    -- 2. Consolidar aplicando reglas de prioridad
    v_datos_consolidados := consolidar(v_discovery, v_enrichment, v_candados);
    
    -- 3. Detectar discrepancias
    v_discrepancias := detectar_discrepancias(v_discovery, v_enrichment);
    
    -- 4. NUEVO v2.0: Calcular scores sobre datos consolidados
    v_scoring := calcular_score_calidad_dato(v_datos_consolidados);
    v_verificacion := verificar_coherencia(v_datos_consolidados, v_scoring);
    
    -- 5. Persistir datos consolidados + scores
    UPDATE propiedades_v2 SET
        datos_json = v_datos_consolidados,
        score_calidad_dato = v_scoring.score_calidad_dato,
        score_fiduciario = v_verificacion.score_fiduciario,
        flags_semanticos = v_verificacion.flags,
        discrepancias_detectadas = v_discrepancias,
        status = 'completado',
        fecha_merge = NOW()
    WHERE [identificador];
    
    RETURN resultado;
END;
```

---

## 7. CONTRATOS CON OTROS MÓDULOS

### Con Discovery (Flujo A):
- **Recibe:** `datos_json_discovery` (snapshot API/Grid)
- **Usa:** GPS, algunos metadatos

### Con Enrichment (Flujo B v3.0):
- **Recibe:** `datos_json_enrichment` (80+ campos estructurados)
- **Usa:** Mayoría de datos (priorizados sobre discovery)

### Con Módulo 2 (Enrichment de Mercado - Futuro):
- **Entrega:** Datos consolidados + scores finales
- **Estado:** `completado` con validación completa

---

## 8. INVARIANTES

### 8.1 Garantías

- ✅ Candados SIEMPRE respetados
- ✅ Status SIEMPRE es `completado` al finalizar
- ✅ Scores calculados sobre datos consolidados, NO parciales
- ✅ `datos_json` contiene consolidación final
- ✅ `datos_json_discovery` y `datos_json_enrichment` preservados (auditabilidad)

### 8.2 Límites

- ❌ NO modifica `datos_json_discovery` (inmutable)
- ❌ NO modifica `datos_json_enrichment` (inmutable)
- ❌ NO toma decisiones de matching (solo sugiere)
- ❌ NO llama APIs externas

---

## 9. EJEMPLO COMPLETO

### Input:

```javascript
// Discovery (Flujo A)
datos_json_discovery: {
  precio_usd: 120000,
  latitud: -17.7654321,  // ← Más preciso (API)
  area_total_m2: null
}

// Enrichment (Flujo B)
datos_json_enrichment: {
  precio_usd: 120000,
  latitud: -17.765,  // ← Menos preciso (HTML)
  area_total_m2: 85.5,
  dormitorios: 2,
  banos: 2,
  // ... 75+ campos más
}
```

### Proceso:

```javascript
// FASE 1: Consolidar
datos_consolidados = {
  precio_usd: 120000,  // enrichment (regla general)
  latitud: -17.7654321,  // discovery (excepción GPS)
  area_total_m2: 85.5,  // enrichment
  dormitorios: 2,
  banos: 2,
  // ... todos los campos
}

// FASE 2: Scorear
scoring = {
  score_calidad_dato: 95,
  score_core: 70,
  score_opcionales: 25,
  es_para_matching: true
}

// FASE 3: Verificar
verificacion = {
  score_fiduciario: 92,
  penalizacion_total: 3,
  flags_semanticos: [
    {
      tipo: 'info',
      campo: 'precio_m2',
      valor: 1403.51,
      razon: 'Precio/m² dentro del rango normal'
    }
  ]
}
```

### Output:

```javascript
UPDATE propiedades_v2 SET
  datos_json = datos_consolidados,  // ← Consolidación final
  score_calidad_dato = 95,  // ← Score sobre consolidado
  score_fiduciario = 92,
  flags_semanticos = [...],
  status = 'completado',
  es_para_matching = true
```

---

## 10. FUNCIONES AUXILIARES

| Función | Propósito |
|---------|-----------|
| `obtener_propiedades_pendientes_merge()` | Lista propiedades status=actualizado |
| `ejecutar_merge_batch()` | Merge en lote (max 50) |
| `obtener_discrepancias()` | Consulta conflictos detectados |
| `resetear_merge()` | Permite re-ejecutar merge |
| `estadisticas_merge()` | Dashboard de métricas |

---

## 11. VALIDACIÓN DE IMPLEMENTACIÓN

### Checklist:

```
CONSOLIDACIÓN:
✅ Respeta candados siempre
✅ Enrichment > Discovery (regla general)
✅ Discovery > Enrichment (GPS)
✅ Detecta discrepancias correctamente
✅ Preserva datos originales (discovery/enrichment)

SCORING (NUEVO v2.0):
✅ Calcula sobre datos_json (consolidado)
✅ NO calcula sobre datos_json_enrichment (parcial)
✅ Valida 10 campos core
✅ Score opcionales configurable
✅ Determina es_para_matching

VERIFICACIÓN (NUEVO v2.0):
✅ Valida sobre datos consolidados
✅ Coherencia precio/m², área vs dorms, etc.
✅ Genera flags con niveles (info/warning/error)
✅ Calcula score_fiduciario con penalizaciones
✅ Determina es_para_matching_verificado

PERSISTENCIA:
✅ Status SIEMPRE es 'completado'
✅ datos_json contiene consolidación final
✅ Scores finales persistidos
✅ fecha_merge actualizada
```

---

## 12. CONTROL DE VERSIONES

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 2.0.0 | Dic 2024 | **BREAKING:** Scoring y Verificación movidos de Flujo B a post-Merge. Scores ahora calculados sobre datos consolidados (datos_json), no sobre datos parciales (datos_json_enrichment). |
| 1.2.0 | Dic 2024 | Funciones auxiliares completas |
| 1.0.0 | Dic 2024 | Versión inicial (solo consolidación) |

---

**FIN DEL DOCUMENTO CANÓNICO**
