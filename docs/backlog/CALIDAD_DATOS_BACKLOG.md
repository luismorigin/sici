# Backlog Calidad de Datos — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 9 Mar 2026.

## Monoambientes catalogados como "1 dormitorio" — RESUELTO (22 May 2026)

**Cierre (22 May 2026):** verificado contra prod. La corrección retroactiva ya estaba aplicada (302 props con señal monoambiente en `dorms=0`, 124 con candado manual + resto sostenido por el guardrail del merge). Quedaban 2 residuales activas en `v_mercado_*` (1926 venta `dorms=1`; 1943 alquiler `dorms=NULL`) — corregidas a `dorms=0` + candado (`motivo=correccion_monoambiente_retroactivo`). Barrido final: **cero props completadas con `dorms=1`/`NULL` + señal monoambiente**; las 27 con `dorms=NULL` restantes son `inactivo_confirmed`/`excluida_zona` (fuera de feed). Bug cerrado por ambos lados: retroactivo + guardrail merge (mig 246/247) para nuevas.

**Reconfirmado (24 May 2026):** barrido contra la **descripción cruda** (`datos_json_enrichment->>'descripcion'`, existe en venta para los 3 portales). 0 monoambientes mal catalogados vivos en venta y alquiler; el caso inverso (col=0 siendo 1-dorm real) dio 1 prop, ya corregida + candada. El "LLM-gana sobre discovery" captura los nuevos; el candado blinda los detectados. Ver memoria `audit_overrides_llm_dorms.md`.

**Problema (histórico, contexto del porqué):** error sistemático de extracción en **los 3 portales**: props que la fuente publica como **"monoambiente"** están cargadas con `dormitorios = 1`. Detectado desde un consumidor externo de SICI comparando contra la fuente.

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

- **TC paralelo** (`tipo_cambio_detectado`): **el de mayor impacto en el valor** (define `precio_normalizado`). NO es el mismo bug que monoambiente. El grueso de las divergencias ya está **blindado con candados manuales** del founder (+ badge "TC sospechoso", mig 227). Señales de lectura confirmadas (22 May 2026): "sólo dólares"/"billete" → `paralelo`; precio publicado en **Bs** → `oficial`. **Cuidado:** marcar `paralelo` sobre un `precio_usd` que ya fue convertido desde BOB al oficial **infla por doble conteo** (`× tc_paralelo/6.96`). Caso por caso, NO automatizar. (Caso resuelto: Spazios 1233 — billete en USD mal convertido desde BOB; corregido a `precio_usd` billete + paralelo + candado.)
- **Preventa/inmediata** (`estado_construccion`): **NO es candidato a guardrail tipo monoambiente** (revisado 22 May 2026 — la conclusión anterior era errónea). Contraintuitivo: el aviso "preventa" suele estar **viejo** — el edificio ya se entregó y el founder corrige a `entrega_inmediata` por conocimiento de terreno. El LLM lee el aviso original y "miente". La protección `existing_protected` del merge (no degrada `inmediata`→`preventa`) **es by-design**, el guardián de esa corrección. El `enrichment` regex (`registrar_enrichment`) puede revertir si la prop NO tiene candado → fix correcto: **blindar con candado** las confirmadas como entregadas, NO un guardrail automático. Relacionado: `DEUDA_TECNICA.md` (sección "Discovery pisa correcciones del LLM") — acá el "pisado" es correcto, no un bug.
- **Penthouse/dúplex mal tipados**: ~4 con la palabra en texto pero `tipo='departamento'`. Solo ~1 bug real (`penthouse` existe como tipo; `duplex` no existe → "departamento" no es falso, solo menos granular). Volumen chico → corrección manual.
- **Baños**: sano. No prioritario.

> Cuidado: NO generalizar el guardrail determinístico (texto pisa dato) a cualquier campo. Solo **"monoambiente"** es señal limpia, porque el aviso no envejece (un monoambiente es siempre 0 dorms). `estado_construccion` NO sirve (el aviso envejece: preventa→entregado) y `tipo_cambio` tampoco (la señal vive en interpretación: Bs vs dólares billete). Señales ruidosas ya descartadas: `oficina` (falsos: "cerca de oficinas", "home office"), `loft`/`estudio`.

## `tipo_operacion` mal cargado en origen por C21 — NO automatizar mientras el volumen sea bajo (8 Jun 2026)

**Problema:** corredores de Century21 cargan listings de **alquiler/anticrético** con el campo estructurado `tipoOperacion="venta"` en el origen. SICI copia ese campo y la prop entra al feed `/ventas` con precio basura (el canon mensual o el monto de anticrético en Bs ÷ 6.96 → ej. $603, $9/m²). Detectado en el audit semanal del 8-jun: 7 props (#2597, #2641 alquiler; #2613, #2614, #2615, #2599, #2616 anticrético). Todas reclasificadas + candadas (`tipo_operacion`, formato objeto).

**Causa raíz — NO es bug de SICI:** el dato entra **envenenado desde C21**. El monto lo delata (4.200 Bs ≈ $603 es imposible para una venta — es canon mensual). El scraper de venta le pide a C21 "sección venta", y C21 devuelve estos listings *dentro* de esa sección porque el corredor los indexó como venta.

**Por qué el mecanismo existente NO lo agarra:** `registrar_discovery` ya marca `excluido_operacion` a todo lo que llega con operación ≠ venta — pero estos llegan con `tipoOperacion=venta`, así que pasan. (Confirmado: 0 props C21 en `excluido_operacion`; el scraper de venta nunca recibe no-venta… salvo estos mal etiquetados.)

**❌ NO arreglar en el merge:** el `merge` ni siquiera setea `tipo_operacion` (solo lo lee para el score). Quien lo asigna es `registrar_discovery` ← scraper n8n. Meter un guardrail en el merge sería tocar la función más crítica de venta (regla 7) para nada.

**Riesgo de automatizar (por qué se decide NO hacerlo hoy):** falso positivo de **listings duales** — caso real #1370 *"departamento en alquiler **o** venta de lujo"* (1.47M Bs, venta legítima de $211K). Un guardrail que excluya por ver "alquiler" en URL/título **borra ventas reales del feed en silencio**, sobre ~598 listings C21 cada noche. `anticretico` es señal limpia; **`alquiler` es traicionera** (duales comunes).

**Decisión (8-jun-2026): NO se implementa guardrail mientras el volumen siga bajo (~7/semana).** La mitigación vigente es el **audit semanal de ventas** (`/audit-feed-ventas-semanal`, check 2.4 sub-caso URL/desc), costo $0, con criterio humano que distingue el dual #1370 que un script rompería. Re-evaluar solo si el volumen crece de forma sostenida.

**Si en el futuro se automatiza** (solo con volumen alto que lo justifique), el lugar correcto es el **scraper n8n** (no el merge, no el SQL), y **solo con la señal `anticretico`** (nunca `alquiler`, por los duales) → cae solo en `excluido_operacion`. Cubre ~60% del problema (los anticréticos) con riesgo casi nulo. Alternativa de riesgo ~cero sin tocar pipeline: filtro defensivo en la vista `v_mercado_venta` que excluya `url ~* 'anticretico'`.

**Query de detección** (la usa el audit; sirve para re-dimensionar):
```sql
SELECT p.id, p.precio_usd, p.url
FROM propiedades_v2 p
WHERE p.tipo_operacion='venta' AND p.fuente='century21'
  AND p.status IN ('completado','actualizado')
  AND NOT campo_esta_bloqueado(campos_bloqueados,'tipo_operacion')
  AND p.url ~* 'anticretico';  -- 'en-alquiler' añade FP de duales ("alquiler o venta"), filtrar a mano
```

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
- [x] **`/audit-feed-alquileres-semanal` v1.2** creada — `scripts/auditoria-feed-alquileres/audit-feed-alquileres-semanal.command.md`. Equivalente a ventas semanal adaptado: precio_mensual_bob (no precio_usd), sin TC paralelo, filtro ≤150d, 3 fuentes (C21+Remax+BI), vista `v_mercado_alquiler`. 7 checks capa 2 + 4 capa 3 + 3 capa 4; 8 calibraciones tras retest sobre 37 props (FP 85%→25%). Costo $0.
- [ ] **Validación GPS en matcher** — atrapa caso A1 del audit (LLM confunde proyectos con prefijo común). Hoy el matcher prioriza `nombre_exacto` sobre GPS — si nombre matchea pero GPS está fuera de `radio_metros`, debería downgrade a `pending` (HITL). Backlog post-skill semanal alquileres.
- [ ] **Aliases para proyectos sin aliases** — auditoría reveló que la mayoría de proyectos Eurodesign + Mirage no tenían aliases. Sería útil un audit one-shot que detecte pm con `alias_conocidos = NULL` y sugiera variantes desde props históricas.

## Hallazgos del resumen mensual Equipetrol (13 May 2026)

Detectados al cruzar `propiedades_v2` con `proyectos_master` para armar lectura mensual de mercado. Ambos contaminan métricas de movimiento, concentración y "lanzamientos del mes".

### 1. Duplicados latentes en SANTORINI VENTURA — RESUELTO (24 May 2026)

**Cierre (24 May 2026):** verificado contra prod. El cluster ya no infla el feed: 1 prop canónica activa (id 1754) + 15 marcadas `duplicado_de` (ids 1740-1757, quedan fuera de `v_mercado_venta`); el resto de la signatura $70.402/56m²/1D está `inactivo_confirmed`. Lo único que queda son parqueos/bauleras de área chica (3m², 12,5m²) que el filtro `area >= 20` ya excluye del mercado — no es el bug reportado. Consolidado por curación manual del founder.

**Síntoma (histórico):** 14+ propiedades activas con signatura idéntica (precio $70,402 + 56m² + 1D + estado entrega) sin marcar como duplicados. Cada una con URL distinta en Remax. El broker subió la misma unidad múltiples veces; el algoritmo de detección no las consolidó.

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
