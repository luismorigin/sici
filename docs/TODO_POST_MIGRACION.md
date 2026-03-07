# TODO Post-Migración — Precios Ventas (2026-03-07)

Migraciones 174-177 ejecutadas. Extractor CASO 2 deployado en n8n.

## Verificación inmediata (mañana 2026-03-08)

- [ ] Verificar que pipeline nocturno no infla props nuevas con "paralelo":
  ```sql
  SELECT id, precio_usd, precio_usd_original,
         ROUND(precio_usd::numeric / NULLIF(precio_usd_original, 0)::numeric, 2) AS ratio
  FROM propiedades_v2
  WHERE tipo_operacion = 'venta'
    AND fecha_enrichment >= CURRENT_DATE
    AND tipo_cambio_detectado = 'paralelo';
  -- Esperado: ratio = 1.00 para todas
  ```
- [ ] Confirmar que Binance sigue actualizando config_global id=4:
  ```sql
  SELECT id, clave, valor, fecha_actualizacion FROM config_global WHERE id = 4;
  -- Esperado: fecha_actualizacion = hoy o ayer
  ```
- [ ] Confirmar cambios n8n: flujo_b_processing_v3.0 tiene config lowercase + CASO 2 sin multiplicar

## Revisión manual — COMPLETADA

### 6 props activas (migración 177) — CORREGIDAS
- [x] 299 (Ed. ITAJU): $477,326 → $359,000 (meta tag verificado)
- [x] 300 (Ed. ITAJU): $490,622 → $369,000 (meta tag verificado)
- [x] 301 (Ed. ITAJU): $477,330 → $359,003 (meta tag verificado)
- [x] 308 (Sky Lux): $268,046 → $200,000 (TC paralelo, verificado)
- [x] 494 (Luxe Tower): $216,992 → $163,060 (desc "tipo de cambio blue")
- [x] 521 (Experience): $103,983 → $77,586 (TC paralelo, verificado)

### 10 T-Veinticinco (inactivo_pending) — NO CORREGIDAS
- 208-217: URLs devuelven 404. Props inactivas, no afectan métricas de mercado.
  Precios inflados persisten pero son irrelevantes (excluidas de queries activos).

## Bugs frontend corregidos

- [x] `obtenerMicrozonas()` en `supabase.ts`: usaba `precio_usd` raw → ahora normaliza con `normalizarPrecio()`
- [x] `buscarSiguienteRango()` en `supabase.ts`: usaba `precio_usd` raw → ahora normaliza con `normalizarPrecio()`
- [x] Tipos actualizados: `RawPropiedadRango` y `RawPropiedadMicrozona` ahora incluyen `tipo_cambio_detectado`

## Reglas documentadas en CLAUDE.md

- [x] Sección "Sistema de precios — Definiciones" agregada
- [x] Regla fundamental: SIEMPRE usar `precio_normalizado()` / `normalizarPrecio()`, nunca `precio_usd` directo

## Backlog calidad de datos

- [ ] Normalización de zonas (ver `docs/analysis/NORMALIZACION_ZONAS_PROPUESTA.md`)
  - [ ] Paso 1: Crear función `microzona_a_zona()` — riesgo nulo
  - [ ] Paso 2: Normalizar `proyectos_master.zona` (27 proyectos con zona incorrecta)
  - [ ] Paso 3: Normalizar `propiedades_v2.zona` alquiler (32 props sucias)
  - [ ] Paso 4: Fix `v_metricas_mercado` + `calcular_posicion_mercado` (48 props Eq. Norte sin datos)
  - [ ] Paso 5: Simplificar `zonas.ts`
- [ ] Resolver 94 props sin zona (39 proyectos_master + propiedades sin GPS)
- [ ] Enrichment LLM para ventas (actualmente solo regex)

## Referencia

- Auditoría completa: `docs/analysis/AUDITORIA_PRECIOS_VENTAS.md`
- Migraciones: `sql/migrations/174_*.sql` .. `177_*.sql`
- Propuesta zonas: `docs/analysis/NORMALIZACION_ZONAS_PROPUESTA.md`
