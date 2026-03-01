# Auditoría de Calidad de Datos — Ventas (propiedades_v2)

**Fecha:** 2026-03-01
**Scope:** Propiedades de venta en `propiedades_v2` (tipo_operacion = 'venta')
**Propósito:** Diagnóstico completo para garantizar datos confiables en reportes de mercado

---

## 1. Cobertura General

### Totales por status y fuente

| Fuente | nuevo | en_proceso | completado | expirado | duplicado | **Total** |
|--------|------:|----------:|----------:|--------:|----------:|----------:|
| century21 | 94 | 5 | 313 | 84 | 22 | **518** |
| remax | 72 | 1 | 95 | 6 | 4 | **178** |
| **Total** | **166** | **6** | **408** | **90** | **26** | **696** |

**Observaciones:**
- 696 propiedades totales de venta
- 408 completadas (58.6%) — solo estas entran a reportes
- C21 domina 3:1 sobre Remax
- 166 en status `nuevo` (23.8%) — pendientes de procesamiento

### Cobertura de campos críticos (sobre no-duplicados: 670)

| Campo | Con valor | Sin valor | % cobertura |
|-------|----------:|----------:|------------:|
| zona | 438 | **232** | 65.4% |
| nombre_edificio | 428 | 242 | 63.9% |
| id_proyecto_master | 561 | 109 | 83.7% |
| area_total_m2 | 541 | 129 | 80.7% |
| dormitorios | 556 | 114 | 83.0% |
| precio_usd | 664 | 6 | 99.1% |
| latitud | 531 | 139 | 79.3% |
| amenities | 430 | 240 | 64.2% |

**Alerta crítica:** 232 propiedades sin zona (34.6%). Estas no aparecen en ningún filtro por zona en reportes de mercado.

### Matching (id_proyecto_master)

- **Con proyecto:** 561 (80.6%)
- **Sin proyecto:** 109 (15.7%)
- **Duplicados:** 26 (3.7%)
- **Matching rate (no-duplicados):** 561/670 = **83.7%**

---

## 2. nombre_edificio — Detección de Basura

### Resumen

| Categoría | Cantidad | % del total con nombre |
|-----------|----------:|----------------------:|
| Nombres limpios | 372 | 86.9% |
| **Basura detectada** | **56** | **13.1%** |
| Sin nombre (NULL) | 242 | — |
| **Total con nombre** | **428** | 100% |

### Clasificación de basura por categoría

| Categoría | Props | Ejemplos |
|-----------|------:|---------|
| keyword_operacion | 21 | "Venta", "Pre Venta", "Pre-Venta", "En Venta" |
| frase_marketing | 10 | "FORMAS DE PAGO:", "oportunidad de inversión", "Estrenar!" |
| slug_url_c21 | 9 | "departamento-en-venta-en-equipetrol-8", "en-pre-venta-monoambiente" |
| nombre_zona | 9 | "Equipetrol", "Equipetrol Norte", "Norte" |
| contiene_newline | 8 | "Gold\nedificio gold", "DORMITORIOS\nZONA EQUIPETROL" |
| palabra_generica | 7 | "Departamentos", "edificio", "Departamento" |
| fragmento_truncado | 6 | "De Dise", "Se Vende D" |
| fragmento_descripcion | 5 | "Ubicado en una zona...", "moderno edificio con..." |

### Inconsistencias nombre vs proyecto

| Situación | Cantidad | Implicancia |
|-----------|----------:|------------|
| nombre NULL pero tiene id_pm | 138 | Podrían heredar nombre del proyecto master |
| nombre presente pero sin id_pm | 41 | Matching pendiente o nombre incorrecto |
| nombre basura con id_pm | ~30 | Candidatos a limpieza inmediata (tienen nombre correcto en pm) |

**Acción recomendada:** Los 138 con id_pm pero sin nombre pueden poblar `nombre_edificio` desde `proyectos_master.nombre`. Los ~30 con basura + id_pm pueden corregirse automáticamente.

---

## 3. Precios y Tipo de Cambio

### Precios nulos o ausentes

| Situación | Cantidad |
|-----------|----------:|
| precio_usd IS NULL | 6 |
| precio_bob IS NULL (con precio_usd) | ~200 |

### Anomalías de precio

#### Precios < $10,000 USD

| ID | Precio USD | Área m² | $/m² | Nombre | Observación |
|----|----------:|--------:|-----:|--------|------------|
| 131 | $3,520 | 3.0 | $1,173 | NULL | **Parqueo/baulera** — filtrar por tipo_propiedad |

#### Precios > $500,000 USD

| ID | Precio USD | Área m² | $/m² | Nombre | Observación |
|----|----------:|--------:|-----:|--------|------------|
| 1006 | $1,478,448 | 74.6 | **$19,818** | Torres Santini | **ERROR 10x** — descripción dice $147,000 |
| 289 | $699,000 | 222.0 | $3,149 | Normandie | Penthouse legítimo |
| 420 | $650,000 | 293.0 | $2,218 | The One Tower | Penthouse legítimo |
| 445 | $594,000 | 283.0 | $2,099 | Mirador del Sol | Penthouse legítimo |
| 411 | $584,000 | 240.0 | $2,433 | Normandie | Penthouse legítimo |
| 316 | $558,000 | 187.0 | $2,984 | Aqua Tower | Penthouse legítimo |

#### Precio por m² > $3,500

| ID | $/m² | Precio USD | Área m² | Nombre |
|----|-----:|----------:|--------:|--------|
| 1006 | $19,818 | $1,478,448 | 74.6 | Torres Santini — **ERROR** |
| 131 | $1,173 | $3,520 | 3.0 | NULL — **Parqueo** |
| 468 | $3,667 | $55,000 | 15.0 | NULL — **Área sospechosa** |
| 753 | $3,600 | $162,000 | 45.0 | Kaoba — Verificar |
| 907 | $3,529 | $60,000 | 17.0 | NULL — **Área sospechosa** |

**Resumen de anomalías de precio:**
- 1 error confirmado (ID 1006: precio 10x inflado)
- 1 parqueo mal clasificado (ID 131)
- 2-3 propiedades con área sospechosamente baja (15-17 m²)
- Penthouses > $500K son legítimos

### Tipo de cambio

El sistema usa TC paralelo (Binance P2P, ~6.96 BOB/USD). Las propiedades en BOB se convierten usando este TC. El error de ID 1006 probablemente viene de aplicar TC sobre un precio que ya estaba en USD.

---

## 4. Campos Bloqueados (campos_bloqueados)

### Cobertura

| Métrica | Valor |
|---------|------:|
| Props con candados (no-dup) | 418/660 (63.3%) |
| Props sin candados | 242 (36.7%) |

### Distribución por campo bloqueado

| Campo | Props bloqueadas | % del total con candados |
|-------|-----------------:|------------------------:|
| amenities | 373 | 89.2% |
| equipamiento | 285 | 68.2% |
| estado_construccion | 221 | 52.9% |
| precio_usd | 122 | 29.2% |
| precio_bob | 99 | 23.7% |
| area_total_m2 | 85 | 20.3% |
| dormitorios | 72 | 17.2% |
| nombre_edificio | 61 | 14.6% |

**Observaciones:**
- amenities es el campo más bloqueado (89.2%) — indica mucha corrección manual
- precio bloqueado en ~25% de props — protege contra TC errors en merge
- nombre_edificio solo 14.6% bloqueado — la mayoría aún vulnerable a merge overwrite

### Implicancia para pipeline v2

Si se implementa enrichment LLM para ventas, los campos bloqueados seguirán siendo respetados (merge no los sobreescribe). Esto protege las correcciones manuales existentes.

---

## 5. Amenidades y Sincronización

### Props con id_pm pero amenities vacíos

| Fuente de amenities | Props con vacío |
|---------------------|----------------:|
| datos_json_enrichment → amenities | 21 |
| amenities (campo merge) | 13 |

Estas 13-21 propiedades tienen un proyecto asignado pero no heredaron amenidades ni del enrichment ni del merge. Posible causa: discovery no extrajo amenidades y enrichment no las detectó en la descripción.

### Sincronización proyecto → propiedad

Cuando un proyecto master tiene amenidades definidas, `propagar_proyecto_a_propiedades()` las copia a las propiedades vinculadas. Las 13 con merge vacío pero id_pm deberían revisarse: o el proyecto no tiene amenidades, o la propagación falló.

---

## 6. Propiedades Inactivas / Expiradas

### Distribución de scores de calidad (props completadas con id_pm)

| Rango score_calidad | Cantidad |
|---------------------|----------:|
| >= 90 | 355 |
| 80-89 | 18 |
| 70-79 | 4 |
| < 70 | 0 |
| **Total con score** | **377** |

| Rango score_fiduciario | Cantidad |
|------------------------|----------:|
| >= 80 | 369 |
| 60-79 | 8 |
| < 60 | 0 |
| **Total con score** | **377** |

**Calidad general alta:** 94.2% tienen score_calidad >= 90 y 97.9% tienen score_fiduciario >= 80.

### Propiedades sin actualización reciente

- **Activas sin update > 30 días:** 0
- **Expiradas (status = expirado):** 90

El verificador de ausencias funciona correctamente — no hay propiedades activas abandonadas.

---

## 7. Últimas 2 Semanas (período sin supervisión)

### Volumen

| Métrica | Últimas 2 sem (15-28 Feb) | Mes anterior (15 Ene - 14 Feb) |
|---------|---------------------------:|-------------------------------:|
| Props nuevas | 122 | 139 |
| C21 | 88 | — |
| Remax | 34 | — |

### Calidad comparada

| Métrica | Últimas 2 sem | Mes anterior | Delta |
|---------|---------------:|-------------:|------:|
| Con id_proyecto_master | 37 (30.3%) | 118 (84.9%) | **-54.6 pp** |
| Con nombre_edificio | 46 (37.7%) | 123 (88.5%) | **-50.8 pp** |
| Con zona | 48 (39.3%) | 131 (94.2%) | **-54.9 pp** |
| Score calidad promedio | 90.4 | 93.8 | -3.4 |

### Caída dramática en las últimas 2 semanas

La calidad cayó significativamente en todos los indicadores:
- **Matching rate:** 85% → 30% (-55 pp)
- **nombre_edificio fill:** 88% → 38% (-50 pp)
- **zona fill:** 94% → 39% (-55 pp)

**Causa probable:** Las 122 props nuevas están mayoritariamente en status `nuevo` (sin procesar por enrichment/merge/matching). Esto sugiere que el pipeline nocturno no está procesando las nuevas propiedades al ritmo esperado, o hay un backlog acumulado.

### nombre_edificio basura en últimas 2 semanas

De las 46 propiedades con nombre en este período, se encontraron múltiples valores basura:

| Nombre | Cantidad | Categoría |
|--------|----------:|-----------|
| "Venta" | 3 | keyword_operacion |
| "Gold\nedificio gold" | 2 | contiene_newline |
| "DORMITORIOS\nZONA EQUIPETROL" | 1 | contiene_newline |
| "Pre Venta" | 1 | keyword_operacion |
| "Estrenar!" | 1 | frase_marketing |

**Estimación:** ~15-20% de los nombres nuevos son basura, consistente con el patrón histórico.

---

## 8. Resumen Ejecutivo

### Tabla de problemas priorizados

| # | Problema | Afectados | Severidad | Impacto en reportes | Acción recomendada |
|---|----------|----------:|:---------:|---------------------|-------------------|
| 1 | **Props sin zona** | 232 (34.6%) | **ALTA** | No aparecen en filtros por zona, sesgan volumen | Reprocesar GPS → PostGIS trigger, o asignar zona desde id_pm |
| 2 | **Backlog últimas 2 sem** | 122 props | **ALTA** | 30% matching vs 85% histórico | Investigar pipeline nocturno, forzar re-ejecución |
| 3 | **nombre_edificio basura** | 56 (13.1%) | **MEDIA** | Nombres incorrectos en reportes | Migración SQL: limpiar por categoría, heredar de pm |
| 4 | **nombre_edificio NULL con id_pm** | 138 | **MEDIA** | Oportunidad perdida de dato correcto | UPDATE SET nombre = pm.nombre WHERE nombre IS NULL |
| 5 | **Precio error 10x (ID 1006)** | 1 | **MEDIA** | Distorsiona promedios $/m² de la zona | Corregir manualmente: $1,478,448 → $147,844 |
| 6 | **Parqueo/baulera sin filtrar** | ~5-10 | **BAJA** | Contaminan estadísticas si pasan filtros | Verificar tipo_propiedad_original, excluir en queries |
| 7 | **Áreas sospechosas (< 20m²)** | 3-5 | **BAJA** | Distorsionan $/m² | Revisar IDs 468, 907 — posibles parqueos |
| 8 | **Amenidades vacías con id_pm** | 13-21 | **BAJA** | Propiedades sin datos completos | Ejecutar propagación desde proyecto master |

### Priorización para reportes de mercado confiables

**Fase 1 — Inmediata (impacto alto, esfuerzo bajo):**
1. Corregir precio ID 1006 (1 UPDATE)
2. Poblar nombre_edificio desde proyectos_master para las 138 con id_pm (1 UPDATE)
3. Limpiar 56 nombres basura con reglas por categoría (1 migración)

**Fase 2 — Corto plazo (impacto alto, esfuerzo medio):**
4. Investigar y resolver backlog de últimas 2 semanas
5. Reprocesar 232 propiedades sin zona (GPS → PostGIS, o zona desde pm)

**Fase 3 — Mejora estructural (prevención):**
6. Implementar enrichment LLM para ventas (ver `COMPARATIVA_VENTAS_VS_ALQUILERES.md`)
7. Agregar validación de nombre_edificio en merge (rechazar patrones basura)
8. Agregar alerta automática cuando nombre_edificio contiene keywords operación

### Métricas objetivo post-limpieza

| Métrica | Actual | Objetivo |
|---------|-------:|--------:|
| Zona fill rate | 65.4% | > 95% |
| nombre_edificio fill (limpio) | 55.5% | > 80% |
| Matching rate | 83.7% | > 90% |
| Props con $/m² anómalo | 5 | 0 |
| Basura en nombre_edificio | 13.1% | < 2% |

---

*Auditoría generada con queries directas a producción. Datos al 2026-03-01.*
