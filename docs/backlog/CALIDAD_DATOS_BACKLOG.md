# Backlog Calidad de Datos — SICI

> Extraído de CLAUDE.md el 27 Feb 2026. Actualizado 9 Mar 2026.

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
- [ ] Auditar `tipo_cambio_detectado = NULL` en props activas de venta (causa raíz de las anomalías de precio detectadas arriba)

## CRITICO: Falsos positivos Remax — Props activas marcadas inactivo_confirmed (13 Abr 2026)

**Impacto:** 11 de 23 props Remax marcadas como `inactivo_confirmed` en Eq. Centro (últimos 30d) siguen activas en el portal (HTTP 200). Contamina rotación, absorción, conteos de mercado. Tasa de falsos positivos: ~48%.

**IDs confirmados:** 53, 56, 68, 905, 921, 980, 1160, 1183, 1307, 1309, 1310

**Root cause:** Race condition entre pipelines. La lógica de reactivación en `determinar_status_post_discovery()` es correcta (`inactivo_confirmed` → `actualizado`), y discovery las re-encuentra (`fecha_discovery` actualizada). Pero `fecha_actualizacion` es 5h posterior a `fecha_discovery` — otro proceso las vuelve a inactivar el mismo día.

**Investigar:**
1. Revisar ejecuciones n8n del 12 Abr entre 09:00-15:00 — qué workflow corrió a las 14:06 y pisó el status
2. Si es merge: verificar si `merge_discovery_enrichment()` pisa `es_activa`/`status` de vuelta a inactivo
3. Si es verificador: verificar si corre dos veces al día

**Historial:** Este problema se ha tocado 4 veces (Feb 11, Mar 22 BUG-001, Mar 23 mig 199, Abr 6 Verificador v2.0). Cada vez se descubre una capa nueva.

**Backlog C21:** Servidor caído al momento del test batch (18 URLs sin verificar). Verificar cuando vuelva si tiene el mismo problema.

**Fix one-time pendiente:** Reactivar las 11 props Remax confirmadas como falsos positivos.

## UX Completado

- [x] **Leyenda de símbolos en resultados** - Banner colapsable en resultsV2.tsx explicando: incluido, sin confirmar, parqueos, baulera, piso, plan pagos, TC paralelo, descuento, negociable
