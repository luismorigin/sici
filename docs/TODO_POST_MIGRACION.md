# TODO Post-Migración — Precios Ventas (2026-03-07)

Migraciones 174-176 ejecutadas. Extractor CASO 2 deployadoen n8n.

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

## Revisión manual (16 props pendientes)

- [ ] **4 precio ambiguo** — descripción dice "desde" (precio mínimo del proyecto, no de la unidad):
  - 299 (Ed. ITAJU, SICI $477,326, desc "desde 327,000 USDT")
  - 300 (Ed. ITAJU, SICI $490,622, desc "desde 327,000 USDT")
  - 301 (Ed. ITAJU, SICI $477,330, desc "desde 327,000 USDT")
  - 494 (Luxe Tower, SICI $216,992, solo precio/m2 $1,250-1,450)

- [ ] **12 sin precio en descripción** — requieren visita al URL del listing:
  - 208, 209, 210, 211, 212, 213, 214, 215, 216, 217 (T-Veinticinco, todos inactivo_pending)
  - 308 (Sky Lux, completado)
  - 521 (Experience, completado)

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
- Migraciones: `sql/migrations/174_*.sql`, `175_*.sql`, `176_*.sql`
- Propuesta zonas: `docs/analysis/NORMALIZACION_ZONAS_PROPUESTA.md`
