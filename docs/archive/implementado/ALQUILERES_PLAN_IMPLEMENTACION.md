# Plan de Implementacion: Alquileres en SICI

> **Fecha:** 11 Feb 2026
> **Status:** Pendiente aprobacion
> **Prerequisito:** [ALQUILERES_INVESTIGACION.md](./ALQUILERES_INVESTIGACION.md)
> **Scope:** Backend + recopilacion de datos (frontend/matching/fiduciaria es posterior)

---

## 0. Decisiones Resueltas

### Decision 1: Anticretico -> EXCLUIR

Anticretico es un modelo financiero distinto (prestamo con devolucion, no renta mensual). Queda excluido del pipeline de alquileres. Se mantiene `excluido_operacion` para anticretico.

### Decision 2: Moneda -> BOB canonico + USD convertido

Alquileres en Bolivia se publican, negocian y pagan en Bs. TC paralelo NO aplica para alquileres.
- `precio_mensual_bob` → precio canonico en Bs
- `precio_mensual_usd` → convertido con TC oficial del dia de discovery

### Decision 3: Matching -> SI, mismos proyectos_master

Un edificio es una entidad fisica unica. Sky Tower tiene ventas Y alquileres. `buscar_proyecto_fuzzy()` funciona sin cambios.

### Decision 4: Modelo LLM -> Haiku primero

- Costo: ~$0.004/prop con Haiku ($0.40/mes para 100 props)
- Si precision <90%, escalar a Sonnet solo para casos dificiles
- Temperature 0, schema estricto

### Decision 5: Fallback -> Triple safety net

```
LLM (Haiku) → falla? → Regex Light (4 campos basicos) → falla? → status='requiere_revision' + Slack alert
```

### Decision 6: Merge mejorado con confianza -> FASE 2 (no en MVP)

Primero validar pipeline basico. Merge de alquiler sera enrichment-first (invierte logica actual). Si despues de 2 semanas >15% de casos donde enrichment deberia ganar, implementar confianza.

---

## 1. Datos Reales de la BD

| Metrica | Valor |
|---------|-------|
| Alquileres detectados | 61 (todos Remax) |
| C21 alquileres | 0 (URL hardcodeada a venta) |
| Con enrichment | **0%** (nunca se proceso) |
| Con nombre edificio | **0%** |
| Con descripcion | **0%** |
| Precio promedio | $705 USD/mes |
| Rango precios | $359 - $1,724 USD/mes |
| Area promedio | 70 m2 |
| Status | 24 excluido_operacion, 35 inactivo_pending, 2 completado |

**Conclusion:** Territorio virgen — solo datos crudos de discovery de Remax, cero enrichment. C21 nunca scrapeo alquileres.

---

## 2. Arquitectura

### 2.1 Tabla: misma propiedades_v2

NO crear tabla separada. Razones:
- Un edificio puede tener venta + alquiler
- Matching usa mismos `proyectos_master`
- `tipo_operacion_enum` ya incluye 'alquiler'
- Columnas compartidas (area, dorms, banos, GPS, edificio, amenidades)
- Solo se agregan ~7 columnas especificas de alquiler

### 2.2 Pipeline separado

```
VENTA (no se toca):
  1:00 AM  Discovery C21 venta (existente)
  1:00 AM  Discovery Remax venta (existente)
  2:00 AM  Enrichment regex venta (existente)
  3:00 AM  Merge venta (existente)

ALQUILER (nuevo):
  1:30 AM  Discovery C21 alquiler (NUEVO - URL operacion_alquiler)
  1:30 AM  Discovery Remax alquiler (NUEVO - filtro transaction_type)
  2:30 AM  Enrichment LLM alquiler (NUEVO - parser + Haiku)
  3:30 AM  Merge alquiler (NUEVO - sin TC paralelo, enrichment-first)
```

### 2.3 Funciones SQL

| Funcion | Estrategia |
|---------|-----------|
| `registrar_discovery()` | **NO SE TOCA** — pipeline venta intacto |
| `registrar_discovery_alquiler()` | **NUEVA** — UPSERT para alquileres en propiedades_v2 |
| `registrar_enrichment_alquiler()` | **NUEVA** — recibe JSON del LLM, escribe columnas + datos_json_enrichment |
| `merge_alquiler()` | **NUEVA** — enrichment-first, sin TC paralelo, sin score fiduciario |

**Principio: CERO cambios a funciones del sistema vivo.**
- Tres funciones nuevas, completamente independientes
- El pipeline de venta no se entera de que existen
- Anticretico sigue siendo excluido por registrar_discovery() original

### 2.4 Enrichment con LLM

```
Firecrawl (HTML completo, ya funciona)
    |
    v
PARSER SIMPLE (codigo n8n, ~80 lineas):
  C21: meta tags + JSON-LD + fotos + agente
  Remax: data-page JSON + fotos + agente
  Ambos: concatenar TODO el texto visible
    |
    v
PROMPT LLM (Haiku, temperature 0):
  Input: datos estructurados + texto visible concatenado
  Output: JSON con schema estricto (~25 campos)
    |
    v
VALIDACION (codigo n8n, ~30 lineas):
  - precio > 0 y < Bs 50,000/mes
  - area entre 15 y 500 m2
  - dorms 0-6, banos 0-6
  - expensas < precio
    |
    v
registrar_enrichment_alquiler()
```

---

## 3. Columnas Nuevas en propiedades_v2

```sql
-- Migracion 135: Columnas alquiler
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS
  precio_mensual_bob       NUMERIC(10,2),  -- Precio mensual en Bs
  precio_mensual_usd       NUMERIC(10,2),  -- Convertido a USD (TC oficial)
  deposito_meses           NUMERIC(2,1),   -- 1, 1.5, 2, 3 meses (permite medios)
  amoblado                 TEXT,           -- 'si', 'no', 'semi', null (CHECK constraint)
  acepta_mascotas          BOOLEAN,        -- true/false/null
  servicios_incluidos      JSONB,          -- ["agua","luz","internet"] (consistente con SICI)
  contrato_minimo_meses    INTEGER,        -- Duracion minima contrato
  monto_expensas_bob       NUMERIC(10,2);  -- Gastos comunes mensuales en Bs

-- CHECK constraints
CHECK (amoblado IS NULL OR amoblado IN ('si', 'no', 'semi'));
CHECK (deposito_meses IS NULL OR deposito_meses BETWEEN 0 AND 6);
CHECK (contrato_minimo_meses IS NULL OR contrato_minimo_meses BETWEEN 1 AND 60);
CHECK (precio_mensual_bob IS NULL OR precio_mensual_bob > 0);

-- 3 indices para alquiler
CREATE INDEX idx_prop_alquiler_activo ON propiedades_v2(precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND duplicado_de IS NULL;
CREATE INDEX idx_prop_alquiler_pipeline ON propiedades_v2(status)
  WHERE tipo_operacion = 'alquiler' AND status IN ('nueva', 'actualizado');
CREATE INDEX idx_prop_alquiler_filtros ON propiedades_v2(dormitorios, precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND duplicado_de IS NULL;
```

**Correcciones Etapa A:** `deposito_meses` NUMERIC(2,1) permite 1.5 meses; `servicios_incluidos` JSONB por consistencia con SICI; `monto_expensas_bob` se crea aqui (no existia previamente).

---

## 4. Prompt LLM (Schema Estricto)

```
SISTEMA: Eres un extractor de datos inmobiliarios para Bolivia.
Extraes datos de paginas web de propiedades en ALQUILER.
NUNCA inventes datos. Si no aparece en el texto, usa null.

DATOS ESTRUCTURADOS YA EXTRAIDOS (alta confianza):
{datos_parser}

TEXTO VISIBLE DE LA PAGINA:
{texto_concatenado}

Devuelve SOLO este JSON:
{
  "nombre_edificio": string | null,
  "precio_mensual_bs": number | null,
  "precio_usd_mencionado": number | null,
  "expensas_bs": number | null,
  "deposito_meses": number | null,
  "contrato_minimo_meses": number | null,
  "area_m2": number | null,
  "dormitorios": number | null,
  "banos": number | null,
  "banos_detalle": string | null,
  "estacionamientos": number | null,
  "baulera": boolean | null,
  "piso": number | null,
  "pisos_edificio": number | null,
  "amoblado": "si" | "no" | "semi" | null,
  "acepta_mascotas": boolean | null,
  "servicios_incluidos": string[] | null,
  "estado_construccion": "terminado" | "en_construccion" | null,
  "antiguedad_anos": number | null,
  "orientacion": string | null,
  "amenidades": string[] | null,
  "equipamiento": string[] | null,
  "descripcion_limpia": string | null,
  "conflictos": [{"campo": string, "detalle": string}] | null
}
```

**Costo estimado:** ~3,500 tokens input + ~500 output = ~$0.004/prop con Haiku = **$0.40/mes** para 100 props.

---

## 5. Secuencia de Migraciones

| # | Archivo | Que hace | Dependencia |
|---|---------|----------|-------------|
| 135 | `rental_columns` | 8 columnas + 5 CHECK + 3 indices | Ninguna |
| 136 | `registrar_discovery_alquiler` | **NUEVA** funcion discovery alquiler (NO toca registrar_discovery) | 135 |
| 137 | `registrar_enrichment_alquiler` | **NUEVA** funcion enrichment LLM para alquiler | 135 |
| 138 | `merge_alquiler` | **NUEVA** funcion merge: enrichment-first, sin TC paralelo | 135, 137 |
| 139 | `reactivar_alquileres_existentes` | 61 props excluidas/inactivas → status 'nueva' | 136 |

---

## 6. Workflows n8n Nuevos

### 6.1 Discovery C21 Alquiler
- Clonar `flujo_a_discovery_century21_v1.0.3_FINAL.json`
- Cambiar URL: `operacion_venta` → `operacion_alquiler`
- Implementar fix BUG_001: validar tipo_operacion contra URL slug
- Llamar `registrar_discovery()` (modificada)
- Cron: 1:30 AM

### 6.2 Discovery Remax Alquiler
- Clonar `flujo_a_discovery_remax_v1.0.2_FINAL.json`
- Cambiar filtro API: `transaction_type = 2` (alquiler en Remax)
- Cron: 1:30 AM

### 6.3 Enrichment LLM Alquiler
- **NUEVO workflow** (no clonar el de regex)
- Query: `WHERE tipo_operacion = 'alquiler' AND status = 'nueva'`
- Firecrawl: scrape HTML completo (misma config que venta)
- Parser: extraer datos estructurados (meta, JSON-LD, data-page, fotos)
- HTTP Request: Anthropic API (Haiku, temperature 0)
- Validacion post-LLM
- Fallback: regex light si LLM falla
- Llamar `registrar_enrichment_alquiler()`
- Cron: 2:30 AM

### 6.4 Merge Alquiler
- Query: `WHERE tipo_operacion = 'alquiler' AND status IN ('nueva','actualizado')`
- Llamar `merge_alquiler()`
- Enrichment-first (invierte prioridad vs merge venta)
- Sin logica TC paralelo
- Sin score fiduciario
- Cron: 3:30 AM

---

## 7. Fases de Implementacion

### FASE 1: Infraestructura BD (1-2 dias)
- [ ] Migracion 130 (columnas)
- [ ] Migracion 131 (fix registrar_discovery)
- [ ] Migracion 132 (registrar_enrichment_alquiler)
- [ ] Migracion 133 (merge_alquiler)
- [ ] Test unitario de cada funcion SQL

### FASE 2: LLM Integration (2-3 dias)
- [ ] Definir prompt final con 5 ejemplos reales
- [ ] Crear workflow enrichment LLM en n8n
- [ ] Configurar ANTHROPIC_API_KEY en n8n env vars
- [ ] Implementar batching (10 props, 5s entre batches)
- [ ] Validacion post-LLM + fallback regex light
- [ ] Test con 10 propiedades reales (scrape manual)

### FASE 3: Discovery Workflows (1-2 dias)
- [ ] Workflow Discovery C21 alquiler
- [ ] Workflow Discovery Remax alquiler
- [ ] Fix BUG_001 en C21
- [ ] Test: ejecutar discovery manual, verificar datos en BD

### FASE 4: Merge + Scheduling (1 dia)
- [ ] Workflow Merge alquiler en n8n
- [ ] Configurar cron jobs (1:30, 2:30, 3:30 AM)
- [ ] Test E2E: pipeline completo

### FASE 5: Reactivar datos existentes (0.5 dias)
- [ ] Migracion 134 (reactivar 61 alquileres)
- [ ] Ejecutar enrichment de las 61 props
- [ ] Verificar resultados

### FASE 6: QA + Monitoreo (1-2 dias)
- [ ] Pipeline 2 noches consecutivas
- [ ] Medir: precision LLM, tasa de fallback, campos completos
- [ ] Alerta Slack si >10% requiere revision

**Total estimado: 7-11 dias**

---

## 8. Criterios de Exito

| Metrica | Target |
|---------|--------|
| Props alquiler en BD | ≥100 (C21 + Remax) |
| Enrichment completado | ≥95% |
| Campos criticos completos | ≥90% (precio, area, dorms, banos) |
| Precision LLM | ≥90% en campos criticos |
| Matching a proyectos_master | ≥80% |
| Costo LLM mensual | <$1 USD |

---

## 9. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigacion |
|--------|---------|------------|
| LLM precision <80% | Datos basura | Escalar a Sonnet + mas ejemplos en prompt |
| C21 sin alquileres en Equipetrol | Sin datos C21 | Expandir zona, Remax cubre bien |
| Anthropic API caida | Pipeline se detiene | Fallback regex light + cola re-proceso |
| Contaminar pipeline venta | Regresion critica | Workflows y funciones SQL completamente separados |

---

## 10. Lo que NO incluye este plan (posterior)

- Frontend: buscar_unidades_reales() para alquiler
- Frontend: toggle Venta/Alquiler en filtros
- Matching nocturno para alquileres
- HITL: supervisor de alquileres
- Market: metricas mercado alquiler
- CMA / razon fiduciaria (no aplica a alquiler)

---

## 11. Archivos a Crear/Modificar

### Nuevos (IMPLEMENTADOS):
```
sql/migrations/135_rental_columns.sql                    ✅ CREADO
sql/migrations/136_registrar_discovery_alquiler.sql      ✅ CREADO
sql/migrations/137_registrar_enrichment_alquiler.sql     ✅ CREADO
sql/migrations/138_merge_alquiler.sql                    ✅ CREADO
sql/migrations/139_reactivar_alquileres_existentes.sql   ✅ CREADO
sql/functions/alquiler/registrar_discovery_alquiler.sql  ✅ (ref a migración 136)
sql/functions/alquiler/registrar_enrichment_alquiler.sql ✅ (ref a migración 137)
sql/functions/alquiler/merge_alquiler.sql                ✅ (ref a migración 138)
n8n/workflows/alquiler/flujo_discovery_c21_alquiler.json      (pendiente)
n8n/workflows/alquiler/flujo_discovery_remax_alquiler.json    (pendiente)
n8n/workflows/alquiler/flujo_enrichment_llm_alquiler.json     (pendiente)
n8n/workflows/alquiler/flujo_merge_alquiler.json              (pendiente)
```

### Modificar:
```
NINGUNO — Cero cambios a funciones del sistema vivo de venta
```
