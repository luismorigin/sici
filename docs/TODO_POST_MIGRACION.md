# TODO Post-Migración — Precios Ventas (2026-03-07)

Migraciones 174-183 ejecutadas. Extractor CASO 2 deployado en n8n.

## Verificación inmediata (2026-03-08) — COMPLETADA

- [x] Verificar que pipeline nocturno no infla props nuevas con "paralelo":
  - Enrichment corrió OK con TC correcto (9.54 paralelo, 6.96 oficial)
  - Props 586, 590, 837, 842, 1096 re-enriquecidas y merge completado
- [x] Confirmar que Binance sigue actualizando config_global id=4:
  - `tipo_cambio_paralelo = 9.54`, `fecha_actualizacion = 2026-03-08 09:00`
- [x] Confirmar cambios n8n: flujo_b_processing_v3.0 corregido:
  - "Cargar Config Global": query cambiado a claves lowercase
  - "Transformar Config": lee claves lowercase, sin fallback — falla si no hay datos
  - "Preparar Datos": sin fallback hardcodeado (10.20 eliminado)
  - "Extractor Century21": TC_PARALELO sin fallback (7.25 eliminado) + throw si falta
  - "Extractor Remax": TC_PARALELO sin fallback (10.20 eliminado) + throw si falta
- [x] Migración 174 ejecutada: claves UPPERCASE (id=1,2) desactivadas en config_global

## Correcciones ejecutadas

### Migración 176 — 85 props CASO 2 (enrichment detectó USD pero merge multiplicó)
- [x] 85 props corregidas con precio real USD
- [x] depende_de_tc = false, candados actualizados

### Migración 177 — 6 props revisión manual
- [x] 299, 300, 301 (ITAJU), 308 (Sky Lux), 494 (Luxe Tower), 521 (Experience)

### Migración 178 — 26 props CASO 2 edge cases + ID 1105 + Villa Brígida
- [x] 26 props: enrichment regex clasificó mal moneda o merge detectó paralelo por regex
- [x] Candados actualizados (22 existentes) y creados (4 nuevos) con valor_original correcto
- [x] ID 1105 excluido (excluido_calidad): garbage data, descripcion = "."
- [x] 31 props Villa Brígida → Villa Brigida (normalización tilde)

### Migración 179 — Limpieza 9 props sin datos
- [x] 285, 286: inactivo_confirmed (avisos terminados) → luego 285 a anticrético, 286 inactivo
- [x] 609: excluido_calidad (precio genérico)
- [x] 1007: excluido_operacion (anticrético)
- [x] 586, 590, 837, 842, 1096: re-enrichment exitoso (status = nueva → enrichment → merge)

### Migración 180 — 7 duplicados Sky Equinox
- [x] IDs 1000-1004, 1049, 1050: duplicado_de = 999

### Migración 181 — Excluir 9 props fuera de zona
- [x] Nuevo enum `excluida_zona` agregado a `estado_propiedad`
- [x] 9 props excluidas: 285, 580, 581, 598, 885, 886, 1019, 1055, 1072
- [x] 2 props adicionales excluidas: 493 (Alpha, Av. Beni), 948 (Vilareal Duo)
- [x] Documentado en `docs/reports/FILTROS_CALIDAD_MERCADO.md`

### Migración 182 — Normalizar 51 props con zona problemática (2026-03-09)
- [x] PARTE 1: 13 props con zona='Equipetrol Centro' corregidas por PostGIS:
  - 7 → Equipetrol (837, 842, 902, 910, 971, 980, 1096)
  - 5 → Villa Brigida (1011, 1061, 1064, 1069, 1071)
  - 1 → Faremafu (1095)
- [x] PARTE 2: 45 props fuera de todos los polígonos → excluida_zona:
  - 30 con zona=NULL (Miro Tower ×15, Swissôtel ×2, La Casona ×2, Curupau Isuto ×2, etc.)
  - 7 con zona='Equipetrol Centro' (Stone 4 ×4, Portobello Isuto ×2, Miro Tower ×1)
  - 8 multiproyecto Miro Tower (605-610, 978, 979, 1076)

### Migración 183 — Corregir 11 props 'Equipetrol Centro' restantes (2026-03-09)
- [x] 5 → Equipetrol (716, 718, 844, 898, 1045)
- [x] 1 → Equipetrol Norte/Norte (770 Sky Moon)
- [x] 1 → Faremafu (834 Lofty Island)
- [x] 3 → Villa Brigida (839, 840, 1086 Stone 3)
- [x] 1 → Sirari (1021 Giardino, verificado manualmente)
- [x] **Resultado: 0 props activas con zona='Equipetrol Centro'**

### Matching manual (2026-03-08)
- [x] 999 → Sky Equinox (PM 50)
- [x] 837 → Spazios (corregido post re-enrichment)
- [x] 842 → Once By Macororo (enrichment OK)
- [x] 1096 → Torre Fragata (PM 92)
- [x] 910 → Aura Concept (PM 324)
- [x] 1011 → Plus+ Isuto (PM 325, nuevo)
- [x] 1068 → Portobello Green (PM 326, nuevo)
- [x] 1095 → Sky Eclipse (PM 30)
- [x] 586, 590 → Miro Tower (PM 273, re-enrichment)
- [x] 834 → Lofty Island (PM 2)
- [x] 971 → Sky Onix (PM 323)
- [x] 1018 → Stone 4 (PM 268)
- [x] 1021 → Giardino (PM 8)
- [x] 980 → Madero Residence (PM 278)

### 10 T-Veinticinco (inactivo_pending) — NO CORREGIDAS
- 208-217: URLs devuelven 404. Props inactivas, no afectan métricas de mercado.

### 5 props con enrichment regex corrupto — NO NECESITAN CORRECCIÓN
- 335 (Haus): enrichment extrajo 9,368 en vez de 93,680 (faltó un cero). precio_usd correcto.
- 459 (Sky Eclipse): enrichment extrajo 21,480 (basura). precio_usd = $149,500 correcto.
- 629 (Lofty Island): enrichment tomó precio "desde" genérico ($116K). precio_usd = $167K correcto.
- 824, 826 (Lofty Island): enrichment confundió parqueo ($13K) con precio depto. precio_usd correcto.

## Bugs frontend corregidos

- [x] `obtenerMicrozonas()` en `supabase.ts`: usaba `precio_usd` raw → ahora normaliza con `normalizarPrecio()`
- [x] `buscarSiguienteRango()` en `supabase.ts`: usaba `precio_usd` raw → ahora normaliza con `normalizarPrecio()`
- [x] Tipos actualizados: `RawPropiedadRango` y `RawPropiedadMicrozona` ahora incluyen `tipo_cambio_detectado`

## Reglas documentadas en CLAUDE.md

- [x] Sección "Sistema de precios — Definiciones" agregada
- [x] Regla fundamental: SIEMPRE usar `precio_normalizado()` / `normalizarPrecio()`, nunca `precio_usd` directo

## Totales corregidos

| Migración | Props | Tipo |
|-----------|-------|------|
| 176 | 85 | CASO 2 — enrichment USD, merge multiplicó |
| 177 | 6 | Revisión manual verificada |
| 178 | 26 | CASO 2 edge cases — enrichment regex falló |
| 180 | 7 | Duplicados Sky Equinox |
| 181 | 11 | Excluidas por zona (GPS fuera de polígonos) |
| 182 | 58 | 13 zona corregida (PostGIS) + 45 excluida_zona (fuera polígonos) |
| 183 | 11 | 11 zona corregida ('Equipetrol Centro' → microzona real) |
| **Total** | **204** | Props corregidas/excluidas |

## Matching rate final

- **375/376 props activas con proyecto asignado (99.7%)**
- Única sin match: ID 1103 (Calle Los Claveles, Sirari, sin nombre de edificio)

## Cambios n8n (2026-03-08)

- [x] "Cargar Config Global": query lowercase (`tipo_cambio_oficial`, `tipo_cambio_paralelo`)
- [x] "Transformar Config": claves lowercase, throw si no hay datos
- [x] "Preparar Datos": sin fallback, falla ruidosamente si config no llega
- [x] "Extractor Century21": TC_PARALELO sin fallback 7.25
- [x] "Extractor Remax": TC_PARALELO sin fallback 10.20

## Pendientes n8n + docs (post migración 184)

- [x] Actualizar `MEDIA_ZONA_USD_M2` en Extractor C21 v16.5 (n8n) — keys nuevas + valores reales 2026-03-09
- [x] Actualizar `MEDIA_ZONA_USD_M2` en Extractor Remax v1.9 (n8n) — keys nuevas + valores reales 2026-03-09
- [x] Actualizar `zona_validada_gps` en C21/Remax: agregado `"Equipetrol": 2100` como key genérica en MEDIA_ZONA_USD_M2
- [x] Actualizar CLAUDE.md con tabla de zonas canónicas post-migración 184
- [ ] Refactor extractores: `MEDIA_ZONA_USD_M2` debería leerse de la BD (snapshots o query) en vez de estar hardcodeado. Los bounding boxes de `zona_validada_gps` deberían reemplazarse por `get_zona_by_gps()`.

## Backlog calidad de datos

- [x] Normalización de zonas venta — 'Equipetrol Centro' eliminado (migraciones 182-183)
  - [x] Paso parcial: Villa Brígida → Villa Brigida (migración 178)
  - [x] 24 props corregidas zona/microzona por PostGIS (182 + 183)
  - [x] 45 props fuera de polígonos → excluida_zona (182)
  - [x] 0 props activas con zona='Equipetrol Centro'
- [x] Normalización de zonas — migración 186 (2026-03-09)
  - [x] Paso 1a: Lofty Island (PM 2) → zona='Equipetrol Oeste' (manual pre-migración)
  - [x] Paso 1b: 10 props de 7 proyectos fuera de polígonos → excluida_zona (manual pre-migración)
  - [x] Paso 1c: 28 props microzona='Equipetrol' → 'Equipetrol Centro' (migración 186)
  - [x] Paso 1d: 1 prop zona='Villa Brígida' → 'Villa Brigida' (migración 186)
  - [x] Paso 1e: 6 props alquiler zona=NULL → excluida_zona (fuera de polígonos, migración 186)
  - [x] Paso 1f: 2 props alquiler microzona=NULL → copiada desde zona (migración 186)
  - [x] Paso 2: Fix `v_metricas_mercado` — agregar `status = 'completado'` (migración 186)
  - [x] Paso 3: Fix `buscar_unidades_reales()` — ILIKE→exact match para zona/microzona (migración 186)
  - [x] Paso 4: Simplificar `zonas.ts` — eliminar `dbAlquiler` (aliases legacy ya no existen en BD)
  - [x] `calcular_posicion_mercado` — ya usa exact match, no necesitó cambios
  - [ ] 39 proyectos con zona='Sin zona': 38 fuera de polígonos (0 props activas), 1 corregido (Lofty Island). No requieren acción.

## Referencia

- Auditoría completa: `docs/analysis/AUDITORIA_PRECIOS_VENTAS.md`
- Migraciones: `sql/migrations/174_*.sql` .. `186_*.sql`
- Filtros de calidad: `docs/reports/FILTROS_CALIDAD_MERCADO.md`
- Propuesta zonas: `docs/analysis/NORMALIZACION_ZONAS_PROPUESTA.md`
