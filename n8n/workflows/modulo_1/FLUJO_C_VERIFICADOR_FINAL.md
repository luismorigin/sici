# FLUJO C - VERIFICADOR DE PROPIEDADES INACTIVAS

**Sistema:** SICI - Sistema Inteligente de Captura Inmobiliaria  
**Módulo:** Módulo 1 - Discovery & Existencia  
**Workflow:** Flujo C - Verificador  
**Versión:** 1.1.0 FINAL  
**Fecha:** 18 Diciembre 2025  
**Estado:** ✅ Producción

---

## 0. Resumen Ejecutivo

**Propósito:** Confirmar técnicamente (vía HTTP) las propiedades marcadas como `inactivo_pending` por Flujo A Discovery.

**Scope:** Solo propiedades Remax (Century21 no confiable por HTTP 200 permanente).

**Resultados:**
- ✅ Auto-confirmación por tiempo (>= 7 días ausente)
- ✅ Confirmación por HTTP 404
- ✅ Reactivación por HTTP 200
- ✅ Skip temporal por HTTP 302/errores

---

## 1. Contexto y Necesidad

### **Problema que resuelve**

Flujo A Discovery detecta ausencias diarias marcando propiedades como `inactivo_pending`, pero:
- ❌ No confirma técnicamente (no hace HTTP check)
- ❌ Podría ser ausencia temporal (error del portal)
- ❌ No reactiva propiedades que reaparecen

### **Solución: Flujo C**

Verificación técnica periódica que:
1. Confirma inactividad permanente (HTTP 404 o >= 7 días)
2. Reactiva propiedades que reaparecen (HTTP 200)
3. Espera pacientemente en casos ambiguos (HTTP 302)

---

## 2. Arquitectura del Workflow

### **Pipeline completo:**

```
[Trigger 6:00 AM diario]
        ↓
[Query: Obtener pending Remax con días ausente]
        ↓
[¿Hay propiedades?]
   ├─ NO → [Sin pendientes] → [Merge outputs]
   └─ SÍ ↓
[Split propiedades] (loop automático)
        ↓
[HTTP HEAD] (verificar URL)
        ↓
[Wait 1s] (rate limiting)
        ↓
[Procesar respuesta] (lógica de decisión)
        ↓
[Confirmar baja?]
   ├─ SÍ (confirm) → [UPDATE inactivo_confirmed]
   └─ NO → [Reactivar?]
              ├─ SÍ (reactivate) → [UPDATE Reactivar]
              └─ NO (skip) → [Log skipped]
                        ↓
              (Loop continúa con siguiente)
        ↓
[Agregar resultados] ← Solo cuando Split termina
        ↓
[Generar resumen]
        ↓
[Merge outputs]
```

---

## 3. Lógica de Decisión

### **Reglas aplicadas (en orden):**

| Condición | Días | HTTP | Acción | Nuevo Status |
|-----------|------|------|--------|--------------|
| `dias_desde_ausencia >= 7` | >= 7 | Any | **confirm** | `inactivo_confirmed` |
| HTTP 404 | Any | 404 | **confirm** | `inactivo_confirmed` |
| HTTP 200 | Any | 200 | **reactivate** | `nueva` |
| HTTP 302/301 | < 7 | 302/301 | **skip** | Sin cambios |
| Error red | Any | 0 | **skip** | Sin cambios |
| Otros | < 7 | 4xx/5xx | **skip** | Sin cambios |

### **Parámetro clave:**

```javascript
const MAX_DIAS_PENDING = 7;  // Días antes de auto-confirmar
```

---

## 4. Queries SQL

### **Query principal (Obtener pending):**

```sql
SELECT 
    id,
    url,
    fuente,
    codigo_propiedad,
    status,
    primera_ausencia_at,
    EXTRACT(DAY FROM NOW() - primera_ausencia_at)::INTEGER as dias_desde_ausencia
FROM propiedades_v2
WHERE status = 'inactivo_pending'::estado_propiedad
  AND fuente = 'remax'  -- ✅ SOLO REMAX
ORDER BY primera_ausencia_at ASC
LIMIT 100;
```

### **UPDATE confirmar:**

```sql
UPDATE propiedades_v2
SET 
  status = 'inactivo_confirmed',
  es_activa = FALSE,
  fecha_actualizacion = NOW()
WHERE id = {{ $json.id }}
  AND status = 'inactivo_pending'
RETURNING id, url, status;
```

### **UPDATE reactivar:**

```sql
UPDATE propiedades_v2
SET 
  status = 'nueva'::estado_propiedad,
  primera_ausencia_at = NULL,  -- ✅ CRÍTICO
  es_activa = TRUE,
  fecha_discovery = NOW(),
  fecha_actualizacion = NOW()
WHERE id = {{ $json.id }}
  AND status = 'inactivo_pending'::estado_propiedad
RETURNING id, url, status, primera_ausencia_at;
```

---

## 5. Código JavaScript Clave

### **Nodo: Procesar respuesta (v2.2.0)**

```javascript
// Obtener datos de la propiedad
const propiedadData = $('Split propiedades').first().json;
const diasDesdeAusencia = propiedadData.dias_desde_ausencia || 0;
const primeraAusenciaAt = propiedadData.primera_ausencia_at;
const MAX_DIAS_PENDING = 7;

// Determinar statusCode
let statusCode = 0;
if (originalData.statusCode) {
  statusCode = originalData.statusCode;
} else if (typeof originalData === 'string' && originalData.includes('<!DOCTYPE')) {
  statusCode = 200;  // HTML presente = 200
}

// Lógica de decisión
if (!primeraAusenciaAt) {
  action = 'skip';
} else if (diasDesdeAusencia >= MAX_DIAS_PENDING) {
  action = 'confirm';  // Auto-confirmación por tiempo
} else if (statusCode === 404) {
  action = 'confirm';
} else if (statusCode === 200) {
  action = 'reactivate';
} else if (statusCode === 301 || statusCode === 302) {
  action = 'skip';
} else {
  action = 'skip';
}
```

### **Nodo: Generar resumen (v2.0.0)**

```javascript
const results = $input.first().json.results || [];

let confirmadas = 0;
let reactivadas = 0;

for (const r of results) {
  if (r.status === 'inactivo_confirmed') confirmadas++;
  else if (r.status === 'nueva') reactivadas++;
}

return [{
  json: {
    status: 'completed',
    flujo: 'Flujo C - Verificador v1.1.0',
    fuente: 'remax',
    total_procesadas: results.length,
    confirmadas_inactivas: confirmadas,
    reactivadas: reactivadas,
    porcentaje_confirmadas: Math.round((confirmadas / results.length) * 100),
    propiedades: results.map(r => ({
      id: r.id,
      url: r.url,
      nuevo_status: r.status,
      accion: r.status === 'inactivo_confirmed' 
        ? 'Confirmada inactiva' 
        : r.status === 'nueva' 
          ? 'Reactivada' 
          : 'Mantenida'
    }))
  }
}];
```

---

## 6. Configuración de Nodos Críticos

### **Nodo: HTTP HEAD**

```
Method: HEAD
URL: {{ $json.url }}

Options:
  ✅ Full Response: ON (crítico para capturar statusCode)
  ✅ Timeout: 10000ms
  ✅ Max Redirects: 3
  ✅ Continue On Fail: OFF
```

**Nota:** HEAD es más eficiente que GET (no descarga HTML).

### **Nodo: Split propiedades**

```
Options:
  ✅ Batch Size: 1
  ✅ Reset: OFF

Conexiones:
  Output 0 (cuando termina) → Agregar resultados
  Output 1 (cada batch) → HTTP HEAD
```

**Importante:** Los nodos de procesamiento NO se conectan de vuelta. El loop es automático.

---

## 7. Casos de Uso

### **Caso 1: Propiedad ausente >= 7 días**

```
Input:
  id: 14
  dias_desde_ausencia: 8
  statusCode: 302 (redirect)

Decisión:
  action: "confirm"
  reason: "Auto-confirmado: 8 días ausente (límite: 7)"

Output BD:
  status: inactivo_confirmed ✅
  fecha_actualizacion: NOW()
```

### **Caso 2: Propiedad eliminada (HTTP 404)**

```
Input:
  id: 11
  dias_desde_ausencia: 2
  statusCode: 404

Decisión:
  action: "confirm"
  reason: "HTTP 404 - Eliminación confirmada (ausente 2 días)"

Output BD:
  status: inactivo_confirmed ✅
```

### **Caso 3: Propiedad reapareció (HTTP 200)**

```
Input:
  id: 2
  dias_desde_ausencia: 3
  statusCode: 200

Decisión:
  action: "reactivate"
  reason: "HTTP 200 - Propiedad reapareció después de 3 días"

Output BD:
  status: nueva ✅
  primera_ausencia_at: NULL ✅
  es_activa: TRUE
```

### **Caso 4: Redirect temporal (HTTP 302, < 7 días)**

```
Input:
  id: 15
  dias_desde_ausencia: 4
  statusCode: 302

Decisión:
  action: "skip"
  reason: "HTTP 302 redirect - Esperar (día 4/7)"

Output BD:
  Sin cambios (se verificará mañana)
```

---

## 8. Testing y Validación

### **Test 1: Auto-confirmación por tiempo**

```sql
-- Simular propiedad ausente >= 7 días
UPDATE propiedades_v2
SET primera_ausencia_at = NOW() - INTERVAL '8 days'
WHERE id IN (
  SELECT id FROM propiedades_v2
  WHERE status = 'inactivo_confirmed'::estado_propiedad
    AND fuente = 'remax'
  LIMIT 5
);
```

**Ejecutar Flujo C → Debería confirmar todas** ✅

### **Test 2: Reactivación**

```sql
-- Marcar propiedad activa como pending
UPDATE propiedades_v2
SET 
  status = 'inactivo_pending'::estado_propiedad,
  primera_ausencia_at = NOW() - INTERVAL '2 days'
WHERE id = 2;
```

**Ejecutar Flujo C → Debería reactivar (si URL da 200)** ✅

### **Verificación post-ejecución:**

```sql
SELECT 
    status,
    COUNT(*) as total,
    COUNT(CASE WHEN fecha_actualizacion >= NOW() - INTERVAL '5 minutes' 
          THEN 1 END) as recien_procesadas
FROM propiedades_v2
WHERE fuente = 'remax'
  AND status IN ('inactivo_pending'::estado_propiedad, 
                 'inactivo_confirmed'::estado_propiedad,
                 'nueva'::estado_propiedad)
GROUP BY status;
```

---

## 9. Monitoreo y Métricas

### **Dashboard de estado:**

```sql
-- Propiedades pending por días ausente
SELECT 
    CASE 
        WHEN EXTRACT(DAY FROM NOW() - primera_ausencia_at) < 3 THEN '0-2 días'
        WHEN EXTRACT(DAY FROM NOW() - primera_ausencia_at) < 7 THEN '3-6 días'
        ELSE '7+ días (auto-confirmar hoy)'
    END as rango,
    COUNT(*) as total
FROM propiedades_v2
WHERE status = 'inactivo_pending'::estado_propiedad
  AND fuente = 'remax'
GROUP BY rango;
```

**Esperado después de Flujo C:**
- `7+ días`: 0 (todas auto-confirmadas)

### **Historial de confirmaciones:**

```sql
-- Propiedades confirmadas en últimos 7 días
SELECT 
    DATE(fecha_actualizacion) as fecha,
    COUNT(*) as confirmadas
FROM propiedades_v2
WHERE status = 'inactivo_confirmed'::estado_propiedad
  AND fuente = 'remax'
  AND fecha_actualizacion >= NOW() - INTERVAL '7 days'
GROUP BY DATE(fecha_actualizacion)
ORDER BY fecha DESC;
```

---

## 10. Limitaciones y Consideraciones

### **Solo Remax:**

- ✅ Remax: HTTP 404 confiable
- ❌ Century21: HTTP 200 siempre (aún con "Aviso terminado")

**Estrategia para Century21:**
- Confiar en ausencia persistente de Discovery
- Auto-confirmar después de 14-30 días (futuro)
- No usar Flujo C

### **Rate Limiting:**

- Wait 1s entre requests
- Timeout 10s por request
- Max 100 propiedades por ejecución

### **Casos edge:**

- **primera_ausencia_at NULL:** Skip con error log
- **Error de red persistente:** Skip, reintenta mañana
- **HTTP 5xx:** Skip (problema temporal del servidor)

---

## 11. Despliegue y Producción

### **Schedule:**

```
Trigger: 6:00 AM diario
Cron: 0 6 * * *
Timezone: America/La_Paz (Bolivia)
```

### **Credenciales:**

```
Postgres: Supabase - Censo Inmobiliario
```

### **Activación:**

1. Verificar credenciales conectadas
2. Activar toggle del workflow (arriba)
3. Verificar ejecución manual exitosa
4. Monitorear primera ejecución automática

---

## 12. Troubleshooting

### **Problema: No procesa todas las propiedades**

**Causa:** Loop de Split mal configurado  
**Solución:** Output 0 → Agregar resultados, NO conectar los UPDATEs

### **Problema: statusCode siempre 0**

**Causa:** "Full Response" desactivado  
**Solución:** Options → Full Response: ON

### **Problema: Resumen muestra 0 confirmadas**

**Causa:** Código de resumen antiguo  
**Solución:** Usar código v2.0.0 que lee `r.status`

### **Problema: No reactiva propiedades**

**Causa:** HTTP HEAD devuelve objeto vacío  
**Solución:** Cambiar a GET O activar "Full Response"

---

## 13. Changelog

### **v1.1.0 - 18 Diciembre 2025** ✅ FINAL

**Agregado:**
- ✅ Auto-confirmación por tiempo (>= 7 días)
- ✅ Reactivación cuando propiedad reaparece (HTTP 200)
- ✅ Nodo "Reactivar Propiedad" con limpieza de `primera_ausencia_at`
- ✅ Resumen mejorado con contadores correctos
- ✅ HTTP HEAD con Full Response

**Corregido:**
- ✅ Loop de Split (Output 0 correctamente conectado)
- ✅ Código "Procesar respuesta" v2.2.0 con auto-confirmación
- ✅ Código "Generar resumen" v2.0.0 adaptado
- ✅ statusCode correctamente capturado

**Probado:**
- ✅ 17 propiedades auto-confirmadas por tiempo
- ✅ 2 propiedades reactivadas por HTTP 200
- ✅ Resumen con métricas correctas

### **v1.0.0 - Diciembre 2025** 

**Inicial:**
- ✅ Verificación HTTP HEAD básica
- ✅ Confirmación por HTTP 404
- ⚠️ Sin auto-confirmación por tiempo
- ⚠️ Sin reactivación

---

## 14. Referencias

**Documentación relacionada:**
- `discovery_canonical_v2.md` - Contrato arquitectónico Discovery
- `FLUJO_A_WORKFLOWS_FINALES.md` - Workflows de Discovery
- `JSON_DISCOVERY_REFERENCE.md` - Estructura de datos

**Queries útiles:**
- Ver pending: `WHERE status = 'inactivo_pending' AND fuente = 'remax'`
- Ver confirmadas: `WHERE status = 'inactivo_confirmed'`
- Ver días ausente: `EXTRACT(DAY FROM NOW() - primera_ausencia_at)`

---

## 15. Próximos Pasos (Futuro)

**Módulo 1 - Completar:**
- [ ] Flujo B: Enrichment (validación profunda)
- [ ] Merge: Unificación Discovery + Enrichment
- [ ] Matching: Vincular con proyectos maestros

**Flujo C - Mejoras futuras:**
- [ ] Century21 con detección de "Aviso terminado" en HTML
- [ ] Notificaciones Slack de confirmaciones diarias
- [ ] Dashboard visual de métricas
- [ ] Exportar historial a Google Sheets

---

**FIN DEL DOCUMENTO**

✅ Flujo C Verificador v1.1.0 - Producción Ready
