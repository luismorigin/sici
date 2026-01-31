# Broker Estados Spec

> **Propósito:** Mapeo de estados entre `propiedades_broker` y `propiedades_v2` para futuro merge
> **Fecha:** 2026-01-31
> **Estado:** Documentado, pendiente implementación de mejoras

---

## Estados Actuales

### propiedades_broker
```sql
estado ENUM:
  'borrador'      -- Creada, no publicada
  'en_revision'   -- Pendiente aprobación (no usado)
  'publicada'     -- Visible en búsquedas
  'pausada'       -- Oculta temporalmente por broker
  'vendida'       -- Transacción completada
  'rechazada'     -- Admin rechazó
```

### propiedades_v2
```sql
status VARCHAR:
  'completado'         -- Visible en búsquedas
  'inactivo_pending'   -- Desapareció del scraping, 7 días espera
  'inactivo_confirmed' -- Confirmada como no disponible
  'excluido_operacion' -- Alquiler/anticrético (excluida)
```

---

## Tabla de Equivalencias

| propiedades_broker | propiedades_v2 | Equivalente | Notas |
|-------------------|----------------|-------------|-------|
| `publicada` | `completado` | ✅ Sí | Ambas = visible en búsquedas |
| `vendida` | `inactivo_confirmed` | ⚠️ Parcial | v2 puede ser por desaparición, no solo venta |
| `pausada` | `inactivo_pending` | ⚠️ Diferente | Broker es indefinido, v2 es 7 días auto |
| `borrador` | - | N/A | Solo existe en broker |
| `rechazada` | - | N/A | Solo existe en broker |
| - | `excluido_operacion` | N/A | Solo scraping (alquiler/anticrético) |

---

## Problemas Identificados para Merge

### 1. Falta distinción en razón de baja

**Problema:** `vendida` no distingue entre:
- Realmente se vendió
- Broker eliminó por error
- Broker eliminó porque era duplicada
- Broker cambió de opinión

**Impacto en merge:** Perdemos información sobre por qué la propiedad salió del mercado.

**Solución propuesta:**
```sql
-- Agregar campo (no cambiar ENUM)
ALTER TABLE propiedades_broker
ADD COLUMN razon_baja VARCHAR(50);
-- Valores: 'vendida', 'error', 'duplicada', 'cambio_opinion', 'otro'
```

### 2. Semántica diferente en pausa

| Estado | Quién decide | Duración | Auto-transición |
|--------|--------------|----------|-----------------|
| `pausada` (broker) | Broker | Indefinida | No |
| `inactivo_pending` (v2) | Sistema | 7 días | Sí → inactivo_confirmed |

**Impacto en merge:** Si broker pausa pero scraping la ve activa, ¿qué prevalece?

**Decisión:** Broker override scraping. Si broker pausa, se respeta aunque scraping la vea.

### 3. Falta metadata de cambio de estado

**Problema:** No sabemos quién/cuándo/por qué cambió el estado.

**Solución propuesta:**
```sql
ALTER TABLE propiedades_broker
ADD COLUMN estado_cambiado_por VARCHAR(50), -- 'broker', 'sistema', 'admin'
ADD COLUMN estado_cambiado_fecha TIMESTAMP,
ADD COLUMN estado_razon TEXT;
```

**Nota:** `historial_cambios` ya existe y captura cambios, pero no específicamente para estados.

### 4. Falta flag de verificación en propiedades_v2

**Para merge futuro:** Cuando broker "reclame" una propiedad scrapeada, necesitamos marcarlo.

**Solución propuesta (POST-MERGE):**
```sql
ALTER TABLE propiedades_v2
ADD COLUMN verificada_por_broker BOOLEAN DEFAULT FALSE,
ADD COLUMN broker_id UUID REFERENCES brokers(id),
ADD COLUMN verificada_fecha TIMESTAMP;
```

---

## Transiciones de Estado Permitidas

### propiedades_broker
```
borrador → publicada (broker publica)
borrador → rechazada (admin rechaza)

publicada → pausada (broker pausa)
publicada → vendida (broker marca vendida)

pausada → publicada (broker reactiva)
pausada → vendida (broker marca vendida)

vendida → (terminal, no transiciones)
rechazada → borrador (broker corrige y reenvía)
```

### propiedades_v2
```
completado → inactivo_pending (desaparece del scraping)
completado → excluido_operacion (detectado como alquiler)

inactivo_pending → completado (reaparece en scraping)
inactivo_pending → inactivo_confirmed (7 días sin reaparecer)

inactivo_confirmed → completado (reaparece en scraping)

excluido_operacion → (terminal para búsquedas de venta)
```

---

## Modelo Unificado Propuesto (POST-MERGE)

Cuando se haga el merge, propongo estos estados unificados:

| Estado | Descripción | Visible | Origen posible |
|--------|-------------|---------|----------------|
| `activa` | En el mercado | ✅ | Scraping o broker |
| `activa_verificada` | Broker confirmó datos | ✅ | Broker |
| `pausada_broker` | Broker ocultó temporalmente | ❌ | Broker |
| `pendiente_baja` | Desapareció, esperando confirmación | ⚠️ | Sistema |
| `inactiva` | No disponible (genérico) | ❌ | Sistema |
| `inactiva_vendida` | Broker confirmó venta | ❌ | Broker |
| `inactiva_error` | Broker eliminó por error | ❌ | Broker |
| `excluida_operacion` | Alquiler/anticrético | ❌ | Sistema |
| `rechazada` | Admin rechazó | ❌ | Admin |

---

## Lo que YA Funciona

1. **✅ Historial de cambios:** `propiedades_broker.historial_cambios` JSONB captura ediciones
2. **✅ Campos bloqueados:** `propiedades_broker.campos_bloqueados` protege datos editados
3. **✅ Estados básicos:** `publicada`/`vendida`/`pausada` cubren casos principales
4. **✅ Equivalencia clara:** `publicada` = `completado` sin ambigüedad

---

## Lo que FALTA Implementar

### Prioridad ALTA (antes de merge)
1. Campo `razon_baja` para distinguir motivos de eliminación
2. Campos `estado_cambiado_por/fecha/razon` para auditoría

### Prioridad MEDIA (durante merge)
3. Flag `verificada_por_broker` en propiedades_v2
4. Campo `broker_id` en propiedades_v2 para vincular

### Prioridad BAJA (post-merge)
5. Estados unificados
6. Lógica de sincronización bidireccional

---

## Nivel de Preparación para Merge

**Estado actual: 70%**

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Equivalencia de estados | ✅ | publicada=completado, vendida≈inactivo |
| Tracking de cambios | ✅ | historial_cambios existe |
| Campos bloqueados | ✅ | Merge respetará ediciones broker |
| Razón de baja | ❌ | No distingue vendida vs error |
| Metadata de estado | ❌ | No sabe quién cambió estado |
| Flag verificación en v2 | ❌ | Para implementar en merge |

---

## Migración Futura Sugerida

```sql
-- Migración 09X: Preparar estados para merge
-- Ejecutar ANTES del merge de sincronización

-- 1. Agregar razón de baja
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS razon_baja VARCHAR(50);

COMMENT ON COLUMN propiedades_broker.razon_baja IS
'Motivo de baja: vendida, error, duplicada, cambio_opinion, otro';

-- 2. Agregar metadata de cambio de estado
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS estado_cambiado_por VARCHAR(50),
ADD COLUMN IF NOT EXISTS estado_cambiado_fecha TIMESTAMP,
ADD COLUMN IF NOT EXISTS estado_razon TEXT;

-- 3. Preparar propiedades_v2 para verificación broker
ALTER TABLE propiedades_v2
ADD COLUMN IF NOT EXISTS verificada_por_broker BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS broker_verificador_id UUID,
ADD COLUMN IF NOT EXISTS fecha_verificacion_broker TIMESTAMP;

-- Índice para búsquedas de propiedades verificadas
CREATE INDEX IF NOT EXISTS idx_v2_verificada_broker
ON propiedades_v2(verificada_por_broker)
WHERE verificada_por_broker = TRUE;
```

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-01-31 | Documento inicial con análisis de gaps y propuestas |
