# Auditoría General SICI — 27 Feb 2026

## Completado hoy

### Documentación
- **40 docs archivados** → `docs/archive/`
  - 9 OBSOLETOS (datos incorrectos, sistemas abandonados)
  - 31 IMPLEMENTADOS (specs/planes ya completados)
- 50 archivos ACTIVO + REFERENCIA permanecen en `docs/`
- CLAUDE.md actualizado: tabla Documentación Principal limpia

### Migraciones SQL
- **5 duplicados renombrados** con sufijo "b" (115b, 116b, 140b, 147b, 148b)
- **28 filas agregadas** a tabla CLAUDE.md (migraciones 140b-168 faltantes)
- **Migración 169 creada y desplegada**: drop overload fantasma `registrar_discovery_alquiler(TEXT)`
  - Confirmado: los 3 workflows n8n (C21, Remax, BI) usan overload VARCHAR
  - Confirmado: 1 sola función queda en BD post-drop

### Limpieza archivos
- `broker-share.html` eliminado (legacy, reemplazado por `/admin/alquileres`)
- `.claude-sessions/` eliminado (4 sesiones stale, 48 días sin uso)
- `.claude/agents/`, `.claude/commands/` eliminados (dirs vacíos)
- 5 archivos basura Windows eliminados (`nul`, paths corruptos)

### Auditorías completadas
- **docs/** — 90 archivos clasificados (ACTIVO/IMPLEMENTADO/OBSOLETO/REFERENCIA)
- **sql/migrations/** — 170 archivos, 0 no desplegados, max desplegada: 168
- **sql/functions/ vs BD** — 38 en repo, 143 en BD, 105 sin archivo canonical
- **n8n/workflows/** — 19 workflows, todos activos, 3 con refs legacy a Sheets
- **simon-mvp/pages/** — 57 páginas: 6 producción, 12 admin, 7 broker, 14 API, 12 legacy
- **simon-mvp/components/** — 7 huérfanos (6 en `landing/`, 1 en `broker/`)
- **sici/ raíz** — README.md obsoleto, geodata OK, tests OK

---

## Plan de fases pendientes

> Cada fase requiere aprobación antes de ejecutar.
> Antes de cualquier cambio: mostrar qué se va a hacer y qué archivos se tocan.

### Fase 2A — Canonical de funciones críticas ✅

Exportadas de BD via `pg_get_functiondef()` el 27 Feb 2026:

| Función | Archivo | Última migración |
|---------|---------|-----------------|
| `buscar_unidades_reales()` | `sql/functions/query_layer/buscar_unidades_reales.sql` | 168 |
| `buscar_unidades_alquiler()` | `sql/functions/query_layer/buscar_unidades_alquiler.sql` | 163 |
| `generar_razon_fiduciaria()` | `sql/functions/query_layer/generar_razon_fiduciaria.sql` | 168 |
| `calcular_posicion_mercado()` | `sql/functions/query_layer/calcular_posicion_mercado.sql` | 168 |
| `snapshot_absorcion_mercado()` | `sql/functions/snapshots/snapshot_absorcion_mercado.sql` | 168 |

### Fase 2B — Sync horarios n8n

- Corregir en CLAUDE.md los horarios reales de producción (repo dice 1:30/2:30/3:30, CLAUDE.md dice 2:00/3:00/4:00)
- Limpiar refs a Google Sheets en 3 workflows HITL (matching_supervisor, supervisor_sin_match, supervisor_excluidas)

**Riesgo:** Bajo (documentación + workflows no críticos)

### Fase 2C — Auditar frontend legacy completo

Verificar que las 12 páginas legacy no tengan tráfico ni estén indexadas antes de mover.

**Páginas a auditar:**
- `landing-premium.tsx`, `filtros.tsx`, `form.tsx`, `formV2.tsx`
- `formulario-vivienda.tsx`, `formulario-inversion-renta.tsx`, `formulario-inversion-plusvalia.tsx`
- `results.tsx`, `resultsV2.tsx`, `resultados.tsx`, `summary.tsx`, `contact.tsx`

**Componentes huérfanos identificados:**
- `landing/CTAFinal.tsx`, `landing/PremiumSection.tsx`, `landing/ProblemSection.tsx`
- `landing/StepsSection.tsx`, `landing/WhoSection.tsx`, `landing/WhyEquipetrol.tsx`
- `broker/ScoreBreakdown.tsx`

**Riesgo:** Ninguno (solo análisis)

### Fase 2D — README

Actualizar README.md con métricas reales.

**Riesgo:** Bajo (solo documentación)

---

## Regla de seguridad

Antes de modificar cualquier función SQL: **siempre `pg_get_functiondef()` primero.**

**NO ejecutar ninguna fase sin aprobación explícita.**
