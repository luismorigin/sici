# Plan de Orden del Repositorio SICI v2

> Fecha: 27 Feb 2026
> Autor: Claude Code (auditoría + plan)
> Estado: Pendiente aprobación

## Contexto

SICI ha crecido orgánicamente desde dic 2025: 171 migraciones SQL, 59 páginas Next.js, 19 workflows n8n, y CLAUDE.md de 567 líneas. La auditoría del 27 Feb 2026 limpió docs, archivos basura, y legacy huérfano. Este plan aborda los problemas estructurales restantes, priorizando seguridad → impacto → limpieza. Cada fase es independiente y requiere aprobación.

## Resumen

| Fase | Título | Riesgo | Archivos | Impacto |
|------|--------|--------|----------|---------|
| 1 | Adelgazar CLAUDE.md | NONE | ~4 | Alto — Claude Code lee esto en cada conversación |
| 2 | Documentación onboarding + catálogo SQL | NONE | ~5 nuevos | Alto — mapa de funciones para Claude Code |
| 3 | Archivar n8n stale workflows | NONE | ~7 mover | Bajo — limpieza visual |
| 4 | Limpiar directorio vacío | NONE | ~1 | Trivial |
| 5 | ESLint + Prettier en simon-mvp | LOW | ~4 config | Medio — calidad de código |
| 6 | Reorganizar root components | MEDIUM | ~15 | Medio — estructura frontend |
| 7 | Exportar funciones SQL a canonical files | MEDIUM | ~20 nuevos | Alto — fuente de verdad SQL |
| 8 | Archivar legacy pages | HIGH | ~25 | Alto — eliminar 4,600+ líneas dead code |

---

### Fase 1 — Adelgazar CLAUDE.md (567 → ~280 líneas)

**Riesgo:** NONE
**Archivos:** ~4

CLAUDE.md se inyecta completo en cada conversación de Claude Code. Con 567 líneas, la tabla de migraciones sola (~170 líneas) consume contexto sin aportar valor operativo diario.

**Qué se hace:**
- Extraer tabla de migraciones (001-169) → `docs/migrations/MIGRATION_INDEX.md`
- Extraer "Backlog Calidad de Datos" → `docs/backlog/CALIDAD_DATOS_BACKLOG.md`
- Extraer "Deuda Técnica" → `docs/backlog/DEUDA_TECNICA.md`
- Dejar en CLAUDE.md solo un enlace a cada doc extraído
- Objetivo: ≤280 líneas manteniendo Quick Context, Reglas Críticas, Zonas, Estructura, Estado Actual (resumido), Pages, Queries

**Criterio de aceptación:**
- CLAUDE.md < 300 líneas
- Toda info extraída accesible via enlaces relativos
- Zero cambios a código

**Archivos clave:**
- `CLAUDE.md`
- `docs/migrations/MIGRATION_INDEX.md` (nuevo)
- `docs/backlog/CALIDAD_DATOS_BACKLOG.md` (nuevo)
- `docs/backlog/DEUDA_TECNICA.md` (nuevo)

---

### Fase 2 — Documentación onboarding + catálogo de funciones SQL

**Riesgo:** NONE
**Archivos:** ~5 nuevos

Hay ~90 funciones custom SICI en producción, pero solo 22 archivos canónicos en `sql/functions/`. Cuando Claude Code necesita modificar una función como `inferir_datos_proyecto()`, debe buscar en 171 migraciones o hacer `pg_get_functiondef()`. Un catálogo resuelve esto.

**Qué se hace:**
- Crear `sql/functions/FUNCTION_CATALOG.md` — inventario de las ~90 funciones agrupadas por dominio (discovery, enrichment, merge, matching, alquiler, query_layer, hitl, broker, admin, helpers, triggers, tc_dinamico), indicando: nombre, archivo canónico (si existe), última migración que la modificó
- Crear `CONTRIBUTING.md` — cómo levantar el entorno, estructura del repo, convenciones, cómo crear migraciones
- Crear `n8n/README.md` — inventario de workflows activos vs stale, horarios

**Criterio de aceptación:**
- Catálogo lista las ~90 funciones con ubicación
- CONTRIBUTING.md permite onboarding de un dev nuevo
- Zero cambios a código

**Archivos clave:**
- `sql/functions/FUNCTION_CATALOG.md` (nuevo)
- `CONTRIBUTING.md` (nuevo)
- `n8n/README.md` (nuevo)

---

### Fase 3 — Archivar n8n stale workflows

**Riesgo:** NONE
**Archivos:** 7 mover

6 workflows en `n8n/workflows/modulo_2/` usan Google Sheets (reemplazado por Admin Dashboard). El README ya documenta esto. Moverlos a `archive/` limpia la carpeta.

**Qué se hace:**
- Crear `n8n/workflows/modulo_2/archive/`
- Mover 6 workflows stale: `matching_supervisor.json`, `supervisor_sin_match.json`, `supervisor_excluidas.json`, `exportar_sin_match.json`, `exportar_excluidas.json`, `SICI - Radar Mensual v1.1.json`
- Actualizar `n8n/workflows/modulo_2/README.md`
- Resultado: modulo_2/ queda con 3 activos: `matching_nocturno.json`, `auditoria_diaria_sici.json`, `tc_dinamico_binance.json`

**Criterio de aceptación:**
- modulo_2/ solo contiene 3 JSONs activos + README + archive/
- Archivados intactos en archive/

---

### Fase 4 — Limpiar directorio vacío

**Riesgo:** NONE
**Archivos:** 1

`simon-mvp/src/components/market/` está vacío (0 archivos). No hay imports que lo referencien.

**Qué se hace:**
- Eliminar directorio vacío
- Verificar con grep que ningún import apunta a `components/market`

**Criterio de aceptación:**
- No existen directorios vacíos en src/

---

### Fase 5 — ESLint + Prettier en simon-mvp

**Riesgo:** LOW
**Archivos:** ~4 config nuevos

No hay linting ni formateo configurado. `next lint` existe en package.json pero sin `.eslintrc`.

**Qué se hace:**
- Crear `.eslintrc.json` basado en `next/core-web-vitals` + TypeScript (nivel `warn`, no `error`)
- Crear `.prettierrc` (semi: false, singleQuote: true — inferido del código existente)
- Agregar scripts: `"format"`, `"lint:fix"`
- Verificar que `npm run lint` pasa sin errores fatales

**Criterio de aceptación:**
- `npm run lint` ejecuta sin errores (warnings OK)
- `next build` sigue funcionando
- No se bloquean commits existentes

**Archivos clave:**
- `simon-mvp/.eslintrc.json` (nuevo)
- `simon-mvp/.prettierrc` (nuevo)
- `simon-mvp/package.json` (actualizar)

---

### Fase 6 — Reorganizar root components

**Riesgo:** MEDIUM
**Archivos:** ~15 (12 mover + imports a actualizar)

12 componentes sueltos en `simon-mvp/src/components/` raíz deberían estar agrupados.

**Qué se hace:**
- Crear `components/ui/` → mover: NumberInput, OptionButton, ProgressBar, QuestionCard, TextInput, InternalHeader
- Crear `components/shared/` → mover: FilterBar, ContactarBrokerModal, FeedbackPremiumModal, MapaResultados, MicrozonasMap
- Mover BrokerLayout → `components/broker/BrokerLayout.tsx`
- Actualizar todos los imports en pages y componentes
- Verificar con `next build`

**Criterio de aceptación:**
- components/ raíz sin .tsx sueltos (solo subdirectorios)
- `next build` completa sin errores
- Todos los imports actualizados

---

### Fase 7 — Exportar funciones SQL críticas a canonical files

**Riesgo:** MEDIUM
**Archivos:** ~20 nuevos

De ~90 funciones en producción, ~43 tienen archivo canónico. Las ~47 restantes solo existen en migraciones o BD. Exportar las más críticas usando `pg_get_functiondef()` (NUNCA desde migraciones locales — lección documentada).

**Qué se hace:**
- Crear subdirectorios: `sql/functions/{hitl,broker,triggers,helpers,admin}/`
- Exportar ~20 funciones prioritarias:
  - **hitl/**: procesar_decision_sin_match, procesar_accion_excluida, procesar_validacion_auto_aprobado, exportar_propiedades_excluidas, detectar_razon_exclusion
  - **broker/**: buscar_unidades_broker, calcular_score_broker, verificar_broker, registrar_contacto_broker
  - **admin/**: inferir_datos_proyecto, propagar_proyecto_a_propiedades, sincronizar_propiedad_desde_proyecto
  - **helpers/**: precio_normalizado, campo_esta_bloqueado, normalize_nombre, es_propiedad_vigente
  - **triggers/**: proteger_amenities_candados, trg_matchear_alquiler_fn, trigger_asignar_zona_alquiler
  - **matching/**: matching_alquileres_batch (agregar al dir existente)
- Cada archivo con header: nombre, última migración, fecha exportación
- Actualizar FUNCTION_CATALOG.md con nuevas rutas
- NO ejecutar contra producción — solo referencia

**Criterio de aceptación:**
- Cobertura sube de ~43 a ~65+ funciones con archivo canónico
- Cada archivo exportado desde producción (pg_get_functiondef)
- Catálogo actualizado

---

### Fase 8 — Archivar legacy pages

**Riesgo:** HIGH
**Archivos:** ~25 (12 páginas + componentes dependientes)

12 páginas legacy reemplazadas por el flujo premium v2 pero interconectadas entre sí. `resultados.tsx` tiene 4,628 líneas.

**Qué se hace:**
- Verificar en Google Analytics que ninguna tiene tráfico significativo (>10 visits/semana)
- Mover páginas legacy a `pages/_archive/` (Next.js ignora prefix `_`)
- Mover `components/pro/` (7 archivos, solo usado por `pro.tsx`) a `components/_archive/pro/`
- Evaluar si `components/landing/` puede archivarse o si landing-v2 lo necesita
- Si hay tráfico: crear redirects en next.config.js
- Verificar con `next build`

**Páginas legacy:**
filtros.tsx, form.tsx, formV2.tsx, results.tsx, resultsV2.tsx, resultados.tsx (4,628 líneas), summary.tsx, contact.tsx, pro.tsx, formulario-vivienda.tsx, formulario-inversion-plusvalia.tsx, formulario-inversion-renta.tsx

**Criterio de aceptación:**
- Zero páginas legacy accesibles en producción (archivadas o con redirect)
- `next build` sin errores
- Código preservado en `_archive/` para referencia

---

## Orden de ejecución recomendado

```
Sesión 1:  Fases 1-4 (NONE risk, pura documentación y organización)
Sesión 2:  Fase 5 (LOW risk, config de linting)
Sesión 3:  Fases 6-7 (MEDIUM risk, reorganización + SQL canonical)
Sesión 4:  Fase 8 (HIGH risk, requiere verificar analytics primero)
```

## Verificación por fase

1. `git status` — confirmar solo archivos esperados cambiaron
2. `next build` — si la fase tocó simon-mvp
3. Commit dedicado por fase
4. Aprobación antes de siguiente fase
