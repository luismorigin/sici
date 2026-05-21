# Backlog Calidad de Datos — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 9 Mar 2026.

## Monoambientes catalogados como "1 dormitorio" — DETECTADO (21 May 2026)

**Problema:** error sistemático de extracción en **los 3 portales**: props que la fuente publica como **"monoambiente"** están cargadas con `dormitorios = 1`. Detectado desde un consumidor externo de SICI comparando contra la fuente.

**Por qué no lo atrapa un cruce interno:** `dormitorios=1` y `tipo='departamento'` están mal de forma **consistente entre sí** → cruzar campos internos (área vs dorms) no lo detecta. Solo se ve comparando contra la fuente.

**La señal de "monoambiente" difiere por portal** (verificado 21 May, `propiedades_v2`, `duplicado_de IS NULL`):

| Portal | Dónde aparece "monoambiente" | Mal catalogadas (dorms=1) |
|---|---|---|
| **C21** | en la **URL** (`url ILIKE '%monoambiente%'`, 320 props) | 68 (47 con área <40m²) |
| **Remax** | **solo en el JSON crudo** — NO en URL, NO en subtype (todo es "Departamento" en su taxonomía) | 3 |
| **Bien Inmuebles** | **solo en el JSON crudo** | 2 |

→ C21 es el grueso (~58 altamente sospechosas con área <40m²); Remax (3) y BI (2) son pocos pero **confirman que el bug es multi-portal**, no solo C21.

```sql
-- Señal UNIVERSAL (cubre los 3 portales): "monoambiente" en el JSON crudo o la URL
SELECT id, fuente, tipo_operacion, dormitorios, area_total_m2, url
FROM propiedades_v2
WHERE dormitorios = 1
  AND (datos_json_discovery::text ILIKE '%monoambiente%' OR url ILIKE '%monoambiente%')
  AND duplicado_de IS NULL
ORDER BY fuente, area_total_m2;
```

**Impacto:** búsquedas por dormitorios sesgadas (quien pide "1 dorm" recibe monoambientes; quien pide monoambiente/0d se pierde estas). Afecta a todos los consumidores de `propiedades_v2`/`v_mercado_*`.

**Causa probable** (`dormitorios` es campo de DISCOVERY — regla "Discovery > Enrichment"):
- **C21:** el portal expone "monoambiente" en el título/URL pero el extractor lo carga como `dormitorios=1` (default o mapeo erróneo).
- **Remax/BI:** el portal NO tiene tipo "monoambiente" estructurado (Remax = todo "Departamento"); el dato está solo en el texto, que el extractor no lee para inferir 0 dorms.

**Fix sugerido:**
- **Corto plazo:** corregir las confirmadas (`dormitorios=0`) **respetando `campos_bloqueados`** (regla "Manual > Automatic"). Validar abriendo algunos avisos antes de UPDATE masivo.
- **Largo plazo:** que el enrichment LLM (que sí lee el texto) detecte monoambiente y setee 0 dorms — más robusto que el extractor por portal. Revisar caso inverso (departamentos como monoambiente).

**Caveat:** "monoambiente" en URL/JSON es señal fuerte, NO prueba 100% (área <40m² afina; las de área ≥40 con dorms=1 podrían ser legítimas — 1 dorm en edificio "monoambiente").

## Coherencia texto↔dato — otros candidatos (backlog, 21 May 2026)

El bug de monoambientes es un caso del patrón "el campo estructurado del portal contradice el texto". Otros atributos con calidad propia (dimensionado sobre `v_mercado_venta`, 364 props venta):

- **TC paralelo** (`tipo_cambio_detectado`): **117/364 (32%) `no_especificado`**. **El de mayor impacto en el valor** (define `precio_normalizado`). NO es el mismo bug (el TC rara vez está explícito en el texto). Ya tiene tratamiento parcial (badge "TC sospechoso" a 30% bajo mediana, upgrade LLM). Dominio propio → análisis aparte.
- **Preventa/inmediata** (`estado_construccion`): **25/364 (7%) `no_especificado`**. **Mismo patrón que monoambiente** (detectable por texto: "preventa", "en construcción", "en pozo", "entrega inmediata", "a estrenar"). Impacto alto (preventa ~39% más barata). Candidato a guardrail determinístico **reutilizando el approach de monoambiente**.
- **Penthouse/dúplex mal tipados**: ~4 penthouse + ~11 dúplex con la palabra en texto pero `tipo='departamento'`. Afecta clasificación de tipo. Volumen chico → corrección manual o guardrail propio.
- **Baños**: sano (4 sospechosas de 364, ya hubo corrección histórica). No prioritario.

> Cuidado: NO generalizar el guardrail a cualquier palabra. Señales ruidosas verificadas: `oficina` (1269 falsos: "cerca de oficinas", "home office"), `loft`/`estudio` (ambiguos). Solo "monoambiente" y los términos de preventa/inmediata son señales limpias.

## Baños Corregidos (14 props) - 21 Ene 2026

Auditoría manual con IA completada. 14 propiedades corregidas con `campos_bloqueados`:
- IDs: 456, 230, 255, 166, 188, 224, 231, 243, 355, 357, 415, 62, 241

## Baños Pendientes — RESUELTO (9 Mar 2026)

17 props revisadas. 13/18 ya están inactivas o excluidas (no afectan métricas).
Las 5 activas (156, 309, 385, 158, 452) tienen valores plausibles — no requieren corrección.

## Datos Corruptos — RESUELTO (9 Mar 2026)

| ID | Problema | Estado |
|----|----------|--------|
| 380 | Spazios Edén $544/m² | `inactivo_pending` — no afecta métricas |

## Backlog Extractores n8n

- [x] ~~**REIMPORTAR flujo_b_processing_v3.0.json en n8n**~~ - Resuelto: `precio_normalizado()` (migraciones 167-168) maneja TC paralelo a nivel SQL
- [x] ~~**Fix 2 TC Paralelo**~~ - Resuelto: `precio_normalizado()` convierte precios paralelo a USD reales

## Validaciones Pendientes en Pipeline

- [x] Validación precio/m² < $800: cubierto por `v_metricas_mercado` (filtra `BETWEEN 800 AND 4000`) + `buscar_unidades_reales` (outlier flag ±55%)
- [x] Filtro `tipo_operacion = 'venta'` en función `buscar_unidades_reales()` (migración 026)
- [x] Filtro `area >= 20m²` para excluir parqueos/bauleras mal clasificados (migración 026)
- [x] ~~Detectar duplicados por proyecto + área + dormitorios con precios muy diferentes~~ — Investigado 23 Mar: 19 pares, 63% son problemas de TC detection (no duplicados reales). Cross-source price variance es comportamiento normal. Cerrado.
- [x] ~~Auditar `tipo_cambio_detectado = NULL` en props activas de venta~~ — Migración 216 (15 Abr): 83 props backfilled (77 merge pre-v2.4 + 6 post). 28→oficial, 1→paralelo (ID 186, precio corregido), 54→no_especificado

## RESUELTO: Falsos positivos verificador — primera_ausencia_at stale (15 Abr 2026, migración 215)

**Root cause:** `registrar_discovery()` no limpiaba `primera_ausencia_at` al re-encontrar props inactivas. Scraper intermitente + `COALESCE(primera_ausencia_at, NOW())` en "Marcar Ausentes" preservaba valores de semanas atrás → verificador auto-confirmaba inmediatamente. 57/118 Remax activas (48%) tenían datos stale.

**Fix:** Migración 215 — `primera_ausencia_at = NULL, razon_inactiva = NULL` en `registrar_discovery()` PASO 3 + cleanup one-time. Cero impacto en absorción (conjuntos disjuntos: cleanup toca `completado`, absorción cuenta `inactivo_confirmed`).

**Análisis técnico completo:** `docs/bugs/BUG_FALSOS_POSITIVOS_REMAX.md`

## UX Completado

- [x] **Leyenda de símbolos en resultados** - Banner colapsable en resultsV2.tsx explicando: incluido, sin confirmar, parqueos, baulera, piso, plan pagos, TC paralelo, descuento, negociable

## Audits — Próximos pasos (13 May 2026)

- [x] **Skill `/audit-feed-ventas-semanal` v1.1** creada — `scripts/auditoria-feed-ventas/audit-feed-ventas-semanal.command.md`. Capas 2+3+4 sin Firecrawl, ventana configurable, race-condition guard 30 min. Test inicial sobre rango 14d-7d reveló 12 falsos positivos → recalibrada en v1.1.
- [ ] **Pendiente: `/audit-feed-alquileres-semanal`** — clonar de la skill ventas semanal adaptando: precio_mensual_bob (no precio_usd), sin TC paralelo, filtro ≤150d, 3 fuentes (C21+Remax+BI), vista `v_mercado_alquiler`, métricas yield mensual/m².
- [ ] **Validación GPS en matcher** — atrapa caso A1 del audit (LLM confunde proyectos con prefijo común). Hoy el matcher prioriza `nombre_exacto` sobre GPS — si nombre matchea pero GPS está fuera de `radio_metros`, debería downgrade a `pending` (HITL). Backlog post-skill semanal alquileres.
- [ ] **Aliases para proyectos sin aliases** — auditoría reveló que la mayoría de proyectos Eurodesign + Mirage no tenían aliases. Sería útil un audit one-shot que detecte pm con `alias_conocidos = NULL` y sugiera variantes desde props históricas.

## Hallazgos del resumen mensual Equipetrol (13 May 2026)

Detectados al cruzar `propiedades_v2` con `proyectos_master` para armar lectura mensual de mercado. Ambos contaminan métricas de movimiento, concentración y "lanzamientos del mes".

### 1. Duplicados latentes en SANTORINI VENTURA

**Síntoma:** 14+ propiedades activas con signatura idéntica (precio $70,402 + 56m² + 1D + estado entrega) sin marcar como duplicados. Cada una con URL distinta en Remax. El broker subió la misma unidad múltiples veces; el algoritmo de detección no las consolidó.

**Impacto:**
- Stock zonal de Villa Brígida inflado (~17 props que probablemente son la misma)
- Tabla "lanzamientos del mes" mostraba SANTORINI primero con 17 unidades — falso positivo
- Análisis derivados ("V. Brígida explotó en actividad") completamente erróneos

**Recomendación:** Revisar lógica de detección de duplicados latentes — actualmente parece basarse en URL o algún hash demasiado estricto. Considerar matching por signatura (precio + área + dorms + estado + id_proyecto_master) cuando hay ≥3 props idénticas en mismo proyecto.

### 2. Matching no respeta `proyectos_master.activo = false`

**Síntoma:** El proyecto Mare (id=4) fue marcado como duplicado de Condominio MARE (id=65) en nov 2025 e inactivado (`activo = false`). Pero 6 props nuevas que entraron al pipeline después siguieron matcheando al proyecto inactivo en lugar del activo, generando huérfanas.

**Evidencia:**
```sql
-- id=4 está inactivo y tiene notas explícitas de consolidación
SELECT id_proyecto_master, nombre_oficial, activo, notas
FROM proyectos_master
WHERE id_proyecto_master IN (4, 65);
-- id=4 "Mare" activo=false, notas="Duplicado de ID 65 - Propiedades transferidas - Inactivado 2025-11-26"
-- id=65 "Condominio MARE" activo=true

-- Pero hay 6 props vinculadas a id=4 (huérfanas)
SELECT COUNT(*) FROM propiedades_v2 WHERE id_proyecto_master = 4; -- 6
```

**Impacto:**
- Cualquier análisis de concentración por proyecto/desarrollador queda inflado (Mare aparece como "Mare Desarrollos" cuando debería ser "Mariscal Construcciones")
- Lecturas de zona se ensucian: las 6 huérfanas estaban geográficamente en coords de id=4 (Eq. Centro) pero el proyecto real Condominio MARE está en Sirari
- Cualquier consolidación futura de proyectos duplicados va a generar el mismo bug si el matching no se arregla

**Recomendación:**
- Función de matching debe filtrar `activo = true` antes de seleccionar `id_proyecto_master`
- Cleanup one-shot: re-vincular las 6 huérfanas de id=4 hacia id=65
- Auditar otros proyectos con `activo = false` para detectar huérfanas similares

**Query de auditoría sugerida:**
```sql
-- Detectar todas las huérfanas en proyectos inactivos
SELECT pm.id_proyecto_master, pm.nombre_oficial, pm.notas,
       COUNT(p.id) AS props_huerfanas
FROM proyectos_master pm
JOIN propiedades_v2 p ON p.id_proyecto_master = pm.id_proyecto_master
WHERE pm.activo = false
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.notas
HAVING COUNT(p.id) > 0
ORDER BY props_huerfanas DESC;
```

### 3. Limitación estructural: SICI no distingue tipos de "entrada al pipeline"

**Síntoma:** Las "entradas" que registra el snapshot (`venta_nuevas_30d = 157` en mayo) mezclan:
- Lanzamientos primarios genuinos (edificio físicamente nuevo)
- Mercado secundario (reventa de unidad usada en edificio existente)
- Re-publicaciones (broker borra y resube anuncio viejo)
- Re-discoveries (SICI re-descubre prop que ya conocía)
- Consolidación de duplicados latentes (como SANTORINI)
- Habilitaciones (proyecto que pasa de preventa a entrega)

**Impacto:** Cualquier interpretación de "aceleración del mercado", "acumulación de vidriera" o "lanzamientos del mes" es inválida sin distinguir tipos. La métrica `venta_nuevas_30d` mide actividad de captura SICI, no actividad real del mercado.

**Mitigación corto plazo:** declarar el límite en cada output editorial (ya aplicado en resumen mensual Equipetrol 13 May).

**Recomendación largo plazo:**
- Campo `tipo_oferta` en `propiedades_v2`: primario / secundario / re-publicación
- Campo `año_construccion` en `proyectos_master` (data manual desde notas de prensa / observación)
- Tabla manual `lanzamientos_oficiales` alimentada editorialmente con fecha de lanzamiento real
- Para B2B pagos: la clasificación se hace manual caso a caso, no se intenta automatizar
