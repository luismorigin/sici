# CONTRATO CANONICAL - FLUJO C: EL VERIFICADOR DE AUSENCIAS

## RESPONSABILIDAD ÚNICA
**Confirmar técnicamente (vía HTTP) y auto-confirmar por tiempo las ausencias marcadas por Discovery, SOLO en fuentes con señal HTTP confiable. Adicionalmente, reactivar propiedades que reaparecen.**

---

## ROL EN EL SISTEMA

### ✅ LO QUE ES:
- **Confirmador técnico post-facto** de bajas ya detectadas por Discovery
- **Auto-confirmador por tiempo** después de N días en pending (configurable)
- **Reactivador automático** cuando propiedades reaparecen (HTTP 200)
- **Limpiador de falsos positivos** donde la señal HTTP sea confiable
- **Selectivo por fuente** - Solo actúa en fuentes confiables (Remax)

### ❌ LO QUE NO ES:
- NO es decisor inicial de bajas (eso ya lo hizo Discovery)
- NO es requisito para estudios de mercado (usan `primera_ausencia_at`)
- NO confirma Century21 (señal HTTP no confiable)

---

## FUENTES Y CONFIABILIDAD

### FUENTE CONFIABLE (Remax):
```
✓ HTTP 404 → ausencia confirmada
✓ HTTP 200 → propiedad existe (reactivar)
✓ Flujo C puede confirmar: inactivo_pending → inactivo_confirmed
✓ Flujo C puede reactivar: inactivo_pending → nueva
✓ Razón: señal técnica inequívoca
```

### FUENTE NO CONFIABLE (Century21):
```
✗ HTTP 200 con página genérica → señal ambigua
✗ Flujo C NO actúa → deja en inactivo_pending
✗ Razón: imposible distinguir baja real de error temporal
```

### Regla general:
**Si no hay señal técnica confiable, Flujo C NO confirma.**

---

## ESTADOS Y TRANSICIONES

### Estados involucrados:
- **`inactivo_pending`** → Discovery marcó ausencia (input de Flujo C)
- **`inactivo_confirmed`** → Flujo C confirmó técnicamente o por tiempo
- **`nueva`** → Flujo C reactivó la propiedad (reaparición)

### Campos requeridos:
```
primera_ausencia_at: timestamp    // Poblado por Discovery (día de baja oficial)
fuente: text                      // "remax" | "century21"
status: estado_propiedad          // enum PostgreSQL
es_activa: boolean                // Flag de actividad
```

### Transiciones permitidas por Flujo C:

**Remax (fuente confiable):**
```
inactivo_pending → inactivo_confirmed  (si HTTP 404)
inactivo_pending → inactivo_confirmed  (si >= MAX_DIAS_PENDING días)
inactivo_pending → nueva               (si HTTP 200 - reactivación)
inactivo_pending → inactivo_pending    (si HTTP 302/error - skip)
```

**Century21 (fuente NO confiable):**
```
inactivo_pending → inactivo_pending    (Flujo C NO actúa)
// Solo Discovery puede reactivar vía snapshot
```

---

## PROCESO DE VERIFICACIÓN

### Parámetro configurable:
```javascript
const MAX_DIAS_PENDING = 7;  // Días antes de auto-confirmar
```

### Input:
```sql
SELECT 
    id,
    url,
    fuente,
    status,
    primera_ausencia_at,
    EXTRACT(DAY FROM NOW() - primera_ausencia_at)::INTEGER as dias_desde_ausencia
FROM propiedades_v2
WHERE status = 'inactivo_pending'::estado_propiedad
  AND fuente = 'remax'  -- Solo fuentes confiables
ORDER BY primera_ausencia_at ASC;
```

### Lógica de decisión (en orden de prioridad):
```
1. Si primera_ausencia_at es NULL:
   └─ SKIP con error (datos inconsistentes)

2. Si dias_desde_ausencia >= MAX_DIAS_PENDING:
   └─ CONFIRM (auto-confirmación por tiempo)
   └─ status = 'inactivo_confirmed'

3. Si HTTP 404:
   └─ CONFIRM (confirmación técnica inmediata)
   └─ status = 'inactivo_confirmed'

4. Si HTTP 200:
   └─ REACTIVATE (propiedad existe)
   └─ status = 'nueva'
   └─ primera_ausencia_at = NULL  // CRÍTICO: limpiar
   └─ es_activa = TRUE

5. Si HTTP 302/301:
   └─ SKIP (redirect ambiguo, esperar)

6. Si error red/timeout:
   └─ SKIP (reintentar en próxima corrida)
```

### Output:
- Propiedades confirmadas como baja definitiva
- Propiedades reactivadas (reaparecieron)
- Propiedades sin cambio (esperando)
- Métricas: total procesadas, confirmadas, reactivadas, skipped

---

## GARANTÍAS Y LÍMITES

### ✅ LO QUE GARANTIZA:
- **Confirmación técnica** solo cuando señal HTTP es inequívoca (404)
- **Auto-confirmación** después de MAX_DIAS_PENDING días (por defecto 7)
- **Reactivación automática** cuando propiedad reaparece (HTTP 200)
- **Limpieza de primera_ausencia_at** en reactivaciones (crítico)
- **No falsos positivos** en confirmaciones
- **Respeto a fuentes no confiables** (Century21 excluido)
- **Idempotencia** (puede correr múltiples veces sin riesgo)
- **100% automático** (sin intervención manual)

### ❌ LO QUE NO GARANTIZA:
- NO decide ausencias iniciales (eso es responsabilidad de Discovery)
- NO confirma Century21 (señal HTTP no confiable)
- NO afecta estudios de mercado (usan `primera_ausencia_at`)
- NO procesa propiedades sin primera_ausencia_at (error de datos)

---

## CONTRATOS CON OTROS COMPONENTES

### Con FLUJO A (Discovery):
**RECIBE:**
- Propiedades en `inactivo_pending` con `primera_ausencia_at` poblado
- Discovery ya decidió que están ausentes en snapshot

**DEVUELVE:**
- Propiedades confirmadas como `inactivo_confirmed`
- Propiedades reactivadas como `nueva` (con primera_ausencia_at limpia)

**COLABORA:**
- Flujo C reactiva (HTTP 200) propiedades que Discovery marcó ausentes
- Discovery puede re-marcar ausentes si vuelven a desaparecer
- Ambos respetan estados avanzados del otro

### Con MATCHING:
**GARANTIZA:**
- Matching NO procesa `inactivo_pending` ni `inactivo_confirmed`
- Solo propiedades `activo` entran a matching

### Con ESTUDIOS DE MERCADO:
**ACLARACIÓN CRÍTICA:**
- Estudios usan `primera_ausencia_at` (fecha de Discovery)
- NO usan `status` ni fecha de confirmación de Flujo C
- Flujo C es irrelevante para análisis de "tiempo en mercado"

---

## CASOS ESPECIALES

### Propiedad vuelve a aparecer:
```
OPCIÓN A: Flujo C la detecta primero (HTTP 200)
  └─ Flujo C: inactivo_pending → nueva
  └─ Limpia primera_ausencia_at
  └─ Discovery en próximo snapshot: mantiene activa

OPCIÓN B: Discovery la detecta primero (en snapshot)
  └─ Discovery: inactivo_pending → nueva
  └─ Limpia primera_ausencia_at
  └─ Flujo C: no la procesa (ya no está pending)
```

### Century21 con ausencias:
```
Discovery marca: inactivo_pending
Flujo C NO confirma (queda en pending)
Análisis de mercado usa primera_ausencia_at igual
```

### Falso positivo de Discovery:
```
Discovery la encuentra en próxima corrida → marca activo
Flujo C NO intervino → no hay daño
```

---

## MÉTRICAS

### Obligatorias:
```
- Total procesadas
- Confirmadas inactivas (HTTP 404 + auto-confirmación)
- Reactivadas (HTTP 200)
- Mantenidas pending (HTTP 302/errores)
- Porcentaje confirmadas
```

### Opcionales para debugging:
```
- Confirmadas por HTTP 404 vs por tiempo
- Días promedio hasta auto-confirmación
- Tasa de reactivación
```

### NO medir:
- Century21 (excluido del flujo)
- Tasa de falsos positivos (Discovery ya filtró)

---

## IMPLEMENTACIÓN

**Estado:** ✅ PRODUCCIÓN desde 18 Diciembre 2025

### Workflow n8n:
- **Archivo:** `n8n/workflows/modulo_1/flujo_c_verificador_v1.1.0_FINAL.json`
- **Schedule:** Diario 6:00 AM (cron: `0 6 * * *`)
- **Nodos clave:**
  - Query pending con dias_desde_ausencia
  - HTTP HEAD (método optimizado)
  - Procesar respuesta (lógica de decisión v2.2.0)
  - UPDATE confirmar
  - UPDATE reactivar (con limpieza de primera_ausencia_at)
  - Generar resumen (v2.0.0)

### Configuración:
```javascript
MAX_DIAS_PENDING = 7  // Configurable en nodo "Procesar respuesta"
```

### Testing:
- ✅ Auto-confirmación >= 7 días: 17 propiedades
- ✅ Reactivación HTTP 200: 2 propiedades
- ✅ Loop completo: 17/17 procesadas
- ✅ Resumen con métricas correctas

---

## VERSIÓN
- **Documento**: Contrato Flujo C v3.0 (Producción)
- **Fecha**: 18 Diciembre 2025
- **Estado**: ✅ IMPLEMENTADO Y PROBADO

### Changelog:

**v3.0 - 18 Diciembre 2025:**
- ✅ Agregada auto-confirmación por tiempo (>= MAX_DIAS_PENDING días)
- ✅ Agregada reactivación automática (HTTP 200)
- ✅ Nueva transición: inactivo_pending → nueva
- ✅ Limpieza de primera_ausencia_at en reactivaciones
- ✅ Parámetro configurable MAX_DIAS_PENDING (default: 7)
- ✅ Métricas ampliadas (confirmadas + reactivadas)
- ✅ Implementación completa en producción

**v2.0 - Diciembre 2024:**
- Eliminado período de gracia
- Agregada confiabilidad por fuente
- Simplificado a confirmador técnico

**v1.0 - Inicial:**
- Concepto básico de verificación HTTP
