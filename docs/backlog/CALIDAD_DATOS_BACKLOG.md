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
- [ ] Detectar duplicados por proyecto + área + dormitorios con precios muy diferentes

## UX Completado

- [x] **Leyenda de símbolos en resultados** - Banner colapsable en resultsV2.tsx explicando: incluido, sin confirmar, parqueos, baulera, piso, plan pagos, TC paralelo, descuento, negociable
