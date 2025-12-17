# n8n Workflows — SICI Discovery

**Sistema:** SICI — Sistema Inteligente de Captura Inmobiliaria
**Módulo:** Módulo 1 — Discovery & Existencia
**Versión:** 1.0.0
**Fecha:** Diciembre 2025

---

## Workflows disponibles

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `flujo_a_discovery_remax_v1.json` | Flujo A completo para Remax | 🟢 Estable |
| `flujo_a_discovery_century21_v1.json` | Flujo A completo para Century21 | 🟡 Testing |

---

## Flujo A — Discovery Remax v1.0.0

### Arquitectura

```
[Trigger 1:00 AM]
       │
═══════╪═══ SNAPSHOT ═══════════════════════════════════════
       │
       ▼
[Generar URLs] → [Split] → [HTTP Request] → [Wait 2s] → [Extraer Props]
                    │                                         │
                    └─────────────────────────────────────────┘
                                      │
                                      ▼
                               [Aggregate]
       │
═══════╪═══ COMPARACIÓN ════════════════════════════════════
       │
       ▼
[Query BD Activas] → [Preparar Comparación] → [Log Stats]
       │
═══════╪═══ DECISIÓN ═══════════════════════════════════════
       │
       ├──→ [Nuevas] ────→ registrar_discovery() → INSERT
       ├──→ [Existentes] → registrar_discovery() → UPDATE
       └──→ [Ausentes] ──→ UPDATE directo → inactivo_pending
                                      │
                                      ▼
                              [Resumen Final]
```

### Prerequisitos

1. **Credencial Postgres** configurada en n8n
   - ID: `POSTGRES_CREDENTIAL_ID` (reemplazar en JSON)
   - Nombre sugerido: `Supabase SICI`

2. **Función SQL desplegada**
   - `registrar_discovery()` v2.0.0 en Supabase

3. **Tabla existente**
   - `propiedades_v2` con estructura canónica

### Importar en n8n

1. Abrir n8n → Settings → Import from File
2. Seleccionar `flujo_a_discovery_remax_v1.json`
3. Configurar credencial Postgres (reemplazar `POSTGRES_CREDENTIAL_ID`)
4. Guardar y activar

---

## Testing

### Test 1: Primera ejecución (BD vacía)

**Objetivo:** Verificar INSERT de propiedades nuevas

```sql
-- Antes
SELECT COUNT(*) FROM propiedades_v2 WHERE fuente = 'remax';
-- Esperado: 0
```

1. Ejecutar workflow manualmente
2. Verificar logs: `Nuevas: ~150`, `Existentes: 0`, `Ausentes: 0`

```sql
-- Después
SELECT COUNT(*) FROM propiedades_v2 WHERE fuente = 'remax' AND status = 'nueva';
-- Esperado: ~150
```

### Test 2: Segunda ejecución (sin cambios)

**Objetivo:** Verificar UPDATE sin cambio de estado

1. Ejecutar workflow nuevamente
2. Verificar logs: `Nuevas: 0`, `Existentes: ~150`, `Ausentes: 0`

```sql
-- Verificar que status se preservó
SELECT COUNT(*) FROM propiedades_v2 WHERE fuente = 'remax' AND status = 'nueva';
-- Esperado: ~150 (sin cambios)
```

### Test 3: Simular ausencia

**Objetivo:** Verificar marcado de `inactivo_pending`

```sql
-- Simular propiedad que ya no existe en el portal
INSERT INTO propiedades_v2 (url, fuente, status, fecha_discovery)
VALUES ('https://remax.bo/propiedad/99999', 'remax', 'nueva', NOW());
```

1. Ejecutar workflow
2. Verificar logs: `Ausentes: 1`

```sql
-- Verificar estado
SELECT status FROM propiedades_v2 WHERE url = 'https://remax.bo/propiedad/99999';
-- Esperado: inactivo_pending
```

### Test 4: Simular reaparición

**Objetivo:** Verificar que propiedad ausente se rescata

```sql
-- Propiedad con id real que existe en el portal pero estaba marcada ausente
UPDATE propiedades_v2
SET status = 'inactivo_pending'
WHERE url = 'https://remax.bo/propiedad/51591';  -- usar ID real
```

1. Ejecutar workflow
2. Verificar que aparece en `existentes`

```sql
-- Verificar rescate (status debería volver a nueva o preservar anterior)
SELECT status FROM propiedades_v2 WHERE url = 'https://remax.bo/propiedad/51591';
```

---

## Configuración

### Variables a ajustar

| Variable | Ubicación | Valor actual | Descripción |
|----------|-----------|--------------|-------------|
| `TOTAL_PAGES` | Nodo "Generar URLs Remax" | 8 | Páginas de API Remax |
| `POSTGRES_CREDENTIAL_ID` | Nodos Postgres | (configurar) | ID credencial n8n |

### Schedule

- **Trigger:** Cron `0 1 * * *` (1:00 AM diario)
- **Duración estimada:** 20-30 segundos

---

## Versionado

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2025-12-16 | Versión inicial — Snapshot, Comparación, Decisión |

---

---

## Flujo A — Discovery Century21 v1.0.0

### Arquitectura

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

### Diferencias con Remax

| Aspecto | Remax | Century21 |
|---------|-------|-----------|
| Método snapshot | API paginada (8 páginas) | Grid geográfico (~6 cuadrantes) |
| Headers HTTP | Básicos | Completos (CORS, cookie) |
| Cookie | No requerida | Auto-emitida (PHPSESSID) |
| Duplicados | 0% | 5-10% (por overlap) |
| Parsing | Directo | Defensivo (3 estructuras) |
| Tiempo | ~20s | ~12s |

### Configuración Grid

```javascript
LAT_SUR = -17.775
LAT_NORTE = -17.750
LON_OESTE = -63.205
LON_ESTE = -63.185
STEP = 0.010  // ~1.1km por cuadrante
```

---

## Próximos pasos

1. [x] Testing Remax completo
2. [ ] Testing Century21
3. [ ] Ajustar credenciales reales
4. [ ] Activar schedules
