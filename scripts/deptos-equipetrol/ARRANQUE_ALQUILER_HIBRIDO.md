# Arranque — Híbrido de ALQUILER (deptos Equipetrol)

> Handoff para empezar el híbrido de alquiler tras cerrar venta. Escrito 12-jul-2026.
> Retomar aquí después de un `/clear`. Contexto de venta: `ESTADO_MIGRACION.md`, `READER_SPEC.md` (v4, VENTA),
> `WORKLIST_REVISION.md`, `AUDITORIAS_POST_CUTOVER.md`.

## Punto de partida (qué está hecho)
**El híbrido de VENTA está validado en shadow** (inventario Equipetrol cerrado, 378 props, spec v4 convergido,
feed sano). El **método está probado**: discovery propio → `--prep` (fetch $0) → subagentes-lectores con spec
congelado → `--apply` a entorno shadow aislado → matcher name-first. El cutover de venta queda pendiente de
DECISIONES del founder (paquete TC, apagar n8n, renumerar migs) — no de más trabajo técnico.

**Alquiler es el siguiente frente.** NO es "más de lo mismo": misma arquitectura, pero sistema de precios y
spec DISTINTOS.

## Lo que se REUSA de venta (arquitectura probada)
- `discovery-deptos.mjs` (grid C21 STEP 0.005 + Remax) — filtra por tipo, adaptar a `tipo_operacion=alquiler`.
- `cargar-deptos-shadow.mjs` (`--prep`→lector→`--apply`) — el esqueleto sirve; cambian los campos de precio.
- `lib/matcher.mjs` (name-first, GPS secundario) — igual.
- Patrón subagentes-lectores (spec congelado → material local → loop-until-dry).
- Entorno shadow aislado (clonar el patrón mig 268/269 para alquiler).
- Discriminador unidad-vs-multiproyecto + gate (con el fix "desde"=multiproyecto del 11-jul).

## Lo que es DISTINTO (el trabajo real)
1. **Sistema de precios — LO GRANDE.** Alquiler NO usa la normalización de venta.
   - Fuente de verdad = **`precio_mensual_bob`** (display en Bs); el USD (`precio_mensual`) se deriva por TC
     oficial salvo `solo_tc_paralelo=true`. NUNCA `precio_usd`. Ver CLAUDE.md regla 10 + `docs/arquitectura/TIPO_CAMBIO_SICI.md`.
   - El reader de alquiler debe leer el precio MENSUAL (Bs o USD) + condiciones (expensas incluidas?, anticrético).
2. **Reader spec PROPIO** — el `READER_SPEC.md` v4 es de VENTA. Alquiler necesita su spec: precio mensual,
   amoblado/equipado (más relevante en alquiler), gate inverso (rechazar VENTA colada en alquiler), expensas.
3. **Tercera fuente: Bien Inmuebles** (además de C21+Remax) — ver memoria `BIEN_INMUEBLES_INTEGRACION` +
   `bien_inmuebles_zona_extractor` (zona la deriva el trigger GPS, el extractor manda `zona:null`).
4. **Estrangular 6 workflows n8n de alquiler** (no 1): `n8n/workflows/alquiler/` — discovery C21/Remax,
   discovery BI + enrichment LLM (Haiku v2.0), merge v1.4.0 (enrichment-first, SIN TC paralelo), verificador v2.0.
5. **Funciones `_alquiler` AISLADAS** (CLAUDE.md regla 6): NUNCA tocar funciones de venta. El shadow de alquiler
   clona `buscar_unidades_alquiler`/`v_mercado_alquiler`, no las de venta.

## Plan sugerido (arrancar con RECONOCIMIENTO, no codear)
Mismo enfoque que funcionó con las auditorías (mapear antes de construir):
1. **Mapear el pipeline de alquiler n8n actual** (6 wf) — qué hace cada uno, qué escribe. Subagentes Explore.
2. **Definir el sistema de precios de alquiler** para el híbrido: cómo lee/guarda el reader el precio mensual
   (Bs crudo? tag TC?), respetando que la normalización es la frontera de acceso (crudo+tag adentro).
3. **Redactar el reader spec de alquiler** (v1) — análogo al v4 de venta pero para precio mensual + condiciones.
4. **Adaptar discovery + cargador** a `tipo_operacion=alquiler` + entorno shadow de alquiler (mig análoga a 268/269).
5. Barrido piloto (10-20) → validar → iterar el spec (loop-until-dry).

## Docs de alquiler existentes (leer en el reconocimiento)
- `docs/canonical/pipeline_alquiler_canonical.md` — pipeline canónico.
- `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` — filtro 150d, expirado_stale, paths JSON fotos, búsqueda por ID.
- `docs/canonical/ALQUILERES_QUERIES.md` — queries.
- Memorias: `descripcion_cruda_alquiler_resuelto`, `BIEN_INMUEBLES_INTEGRACION`, `trigger_zona_alquiler_fix_232`,
  `project_feed_alquiler_casas_zn_uso` (uso residencial/mixto/comercial — filtro, no exclusión).
- Prompt LLM actual: `scripts/llm-enrichment/prompt-alquiler-v2.md` (v2.0) — base para el reader spec.

## OJO / invariantes
- **Alquiler aislado** (regla 6): funciones `_alquiler` propias, NUNCA modificar venta.
- Precio: **`precio_mensual_bob` fuente de verdad**, NUNCA `precio_usd`.
- El cutover de alquiler comparte piezas con el de venta (paquete TC, renumerar migs, loop drift→re-lectura).
