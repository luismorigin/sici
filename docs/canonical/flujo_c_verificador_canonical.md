# CONTRATO MÍNIMO - FLUJO C: EL VERIFICADOR DE AUSENCIAS

## RESPONSABILIDAD ÚNICA
**Confirmar técnicamente ausencias marcadas por Discovery, SOLO en fuentes con señal HTTP confiable.**

---

## ROL EN EL SISTEMA

### ✅ LO QUE ES:
- **Confirmador técnico post-facto** de bajas ya detectadas por Discovery
- **Limpiador de falsos positivos** donde la señal HTTP sea confiable
- **Opcional y selectivo** - NO afecta análisis de mercado

### ❌ LO QUE NO ES:
- NO es decisor de bajas (eso ya lo hizo Discovery)
- NO es cronómetro (no aplica períodos de gracia)
- NO es requisito para estudios de mercado (usan `primera_ausencia_at`)
- NO es universal (solo actúa en fuentes confiables)

---

## FUENTES Y CONFIABILIDAD

### FUENTE CONFIABLE (Remax):
```
✓ HTTP 404 → ausencia confirmada
✓ Flujo C puede confirmar: inactivo_pending → inactivo_confirmed
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
- **`inactivo_confirmed`** → Flujo C confirmó técnicamente (solo Remax)

### Campos requeridos:
```
primera_ausencia_at: timestamp    // Poblado por Discovery (día de baja oficial)
fuente: text                      // "remax" | "century21"
status: text                      // "activo" | "inactivo_pending" | "inactivo_confirmed"
```

### Transiciones permitidas:
```
Remax:
inactivo_pending → inactivo_confirmed  (si HTTP 404)
inactivo_pending → activo              (si vuelve a aparecer, vía Discovery)

Century21:
inactivo_pending → inactivo_pending    (Flujo C NO actúa)
inactivo_pending → activo              (si vuelve a aparecer, vía Discovery)
```

---

## PROCESO DE VERIFICACIÓN

### Input:
```sql
SELECT * FROM propiedades 
WHERE status = 'inactivo_pending'
AND fuente = 'remax'  -- Solo fuentes confiables
```

### Verificación por propiedad:
```
1. Intenta HTTP GET de URL original
2. Si HTTP 404:
   └─ status = 'inactivo_confirmed'
3. Si HTTP 200:
   └─ NO actuar (puede ser error temporal)
4. Si timeout/error red:
   └─ NO actuar (intentar en próxima corrida)
```

### Output:
- Propiedades Remax confirmadas como baja definitiva
- Log simple: cuántas confirmadas, cuántas sin cambio

---

## GARANTÍAS Y LÍMITES

### ✅ LO QUE GARANTIZA:
- **Confirmación técnica** solo cuando señal HTTP es inequívoca
- **No falsos positivos** en confirmaciones (HTTP 404 es definitivo)
- **Respeto a fuentes no confiables** (no actúa sobre Century21)
- **Idempotencia** (puede correr múltiples veces sin riesgo)

### ❌ LO QUE NO GARANTIZA:
- NO decide timing de bajas (eso es responsabilidad de Discovery)
- NO confirma Century21 (queda en pending indefinidamente)
- NO afecta estudios de mercado (usan `primera_ausencia_at`, no `status`)
- NO aplica período de gracia (Discovery ya decidió ausencia)

---

## CONTRATOS CON OTROS COMPONENTES

### Con FLUJO A (Discovery):
**RECIBE:**
- Propiedades en `inactivo_pending` con `primera_ausencia_at` poblado
- Discovery ya decidió que están ausentes

**NO INTERFIERE:**
- Si Discovery vuelve a encontrarlas, las marca `activo` (Flujo C no opina)

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
Discovery la encuentra de nuevo → marca como activo
Flujo C NO participa en esta decisión
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

## MÉTRICAS MÍNIMAS

```
- Total Remax verificadas
- % confirmadas como HTTP 404
- % aún sin confirmar (HTTP 200 o errores)
```

**NO es necesario medir:**
- Tiempo en pending (irrelevante)
- Tasa de falsos positivos (Discovery ya filtró)
- Century21 (no aplica)

---

## IMPLEMENTACIÓN FUTURA

Cuando sea necesario:
1. Query simple de Remax en `inactivo_pending`
2. Loop: HTTP GET + check status code
3. Update a `inactivo_confirmed` si 404
4. Log de métricas básicas

**Complejidad estimada:** 2-3 horas  
**Prioridad:** Baja (no afecta análisis de mercado)

---

## VERSIÓN
- **Documento**: Contrato Flujo C v2.0 (Simplificado)
- **Fecha**: Diciembre 2024
- **Estado**: LISTO PARA APROBACIÓN
- **Cambios vs v1.0**: 
  - Eliminado período de gracia (Discovery ya decide)
  - Agregada confiabilidad por fuente
  - Aclarado que NO afecta estudios de mercado
  - Simplificado a confirmador técnico puro