# TODO Post-Migración — Precios Ventas (2026-03-07)

Migraciones 174-178 ejecutadas. Extractor CASO 2 deployado en n8n.

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
| **Total** | **117** | Props con precio_usd corregido |

## Backlog calidad de datos

- [ ] Normalización de zonas (ver `docs/analysis/NORMALIZACION_ZONAS_PROPUESTA.md`)
  - [x] Paso parcial: Villa Brígida → Villa Brigida (migración 178)
  - [ ] Paso 1: Crear función `microzona_a_zona()` — riesgo nulo
  - [ ] Paso 2: Normalizar `proyectos_master.zona` (27 proyectos con zona incorrecta)
  - [ ] Paso 3: Normalizar `propiedades_v2.zona` alquiler (32 props sucias)
  - [ ] Paso 4: Fix `v_metricas_mercado` + `calcular_posicion_mercado` (48 props Eq. Norte sin datos)
  - [ ] Paso 5: Simplificar `zonas.ts`
- [ ] Resolver 94 props sin zona (39 proyectos_master + propiedades sin GPS)

## Referencia

- Auditoría completa: `docs/analysis/AUDITORIA_PRECIOS_VENTAS.md`
- Migraciones: `sql/migrations/174_*.sql` .. `178_*.sql`
- Propuesta zonas: `docs/analysis/NORMALIZACION_ZONAS_PROPUESTA.md`
