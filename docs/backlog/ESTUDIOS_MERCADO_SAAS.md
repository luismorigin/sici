# Producto: Estudios de Mercado — Servicio Recurrente

> Estado: Backlog — plan diseñado, sin implementación
> Fecha: 15 abril 2026
> Referencia: `scripts/estudio-mercado/` (framework existente)
> Pricing ref: $1,500 setup + $250/mes (ver `PRODUCTO_INFORME_MERCADO.md`)

---

## Visión

Estudio de mercado que se actualiza solo con data de SICI. El desarrollador recibe URL privada, datos frescos cada noche. Modelo: suscripción mensual por desarrolladora.

## Estado actual del framework

- **8 tools de análisis** funcionando: panorama, posición, competidores, demanda, simulación, visibilidad, yield, rotación
- **1 cliente activo**: Condado VI (HTML estático en `public/reports/`)
- **Template HTML** completo (13 secciones, Chart.js, responsive, brand Simón)
- **Secciones cualitativas hardcodeadas** en `sections.ts` (equipamiento, amenidades, recomendaciones)
- **Orquestador**: `generate.ts` — carga config → fetch TC → ejecuta 8 tools en paralelo → ensambla HTML
- **Tipos**: `EstudioCompleto` agrupa todos los resultados, `ClientConfig` define input por cliente

## Fases

### Fase 0 — Parametrizar contenido cualitativo (~1 día)

Objetivo: separar datos del cliente del código del template.

- [ ] Crear tipo `QualitativeContent` en `types.ts` (equipamiento, amenidades, recomendaciones, heroImage, fortalezas/debilidades)
- [ ] Extraer contenido hardcodeado de `sections.ts` a `src/narrativa/condado-vi.md`
- [ ] Crear `src/narrativa/_parser.ts` que lee `.md` → `QualitativeContent`
- [ ] Modificar `renderDiferenciador` y `renderRecomendaciones` para recibir `QualitativeContent`
- [ ] Crear `src/config/_registry.ts` para lookup de clientes por slug
- [ ] Crear `src/narrativa/_template.md` para onboarding de nuevos clientes
- [ ] **Verificar**: HTML generado idéntico al actual

Datos hardcodeados a parametrizar (`sections.ts`):
- L29: heroImage URL (Condado balcón)
- L226-228: `zonaM2Map` y `globalM2Map` (medianas área por dorms) — TODO: agregar a tool `demandaTipologia`
- L248-261: tabla equipamiento vs competidores (5 columnas hardcoded)
- L268-282: amenidades proyecto vs competidores premium
- L1147-1195: 7 recomendaciones con texto editorial

### Fase 1 — Entrega dinámica (~2 días)

Objetivo: el cliente accede por URL con token, datos siempre frescos.

- [ ] API route `/api/estudio/[slug]` en simon-mvp (genera HTML on-demand)
- [ ] Tabla `informe_accesos` (slug, token, email, expires_at) para auth por token
- [ ] **Mover tools** a `simon-mvp/src/lib/estudio-mercado/` (necesario para Vercel serverless — no puede importar desde `scripts/`)
- [ ] Nombre del HTML dinámico (no hardcodeado a "abril-2026")
- [ ] Cache: regenerar máximo 1x/día (ISR o cache manual)

### Fase 2 — Segundo cliente de prueba (~1 día)

Objetivo: validar que el framework funciona con N=2.

- [ ] Crear config para otro proyecto (ej: Terrazzo, Sky Tower)
- [ ] Crear `narrativa/{slug}.md` con contenido cualitativo
- [ ] Generar estudio y validar output
- [ ] Documentar proceso de onboarding (checklist)

### Fase 3 — Productización (futuro)

- [ ] Formulario onboarding (7 bloques — ver `PRODUCTO_INFORME_MERCADO.md` §4)
- [ ] Magic link por email (sin login)
- [ ] Dashboard admin de clientes/accesos
- [ ] PDF export
- [ ] LLM para narrativa automática (recomendaciones, diferenciadores)
- [ ] Tabla `inventario_desarrollador` (captura de datos verificados de primera fuente)

## Estructura propuesta (post Fase 0)

```
scripts/estudio-mercado/src/
  config/
    condado-vi.ts          ← existente
    _registry.ts           ← NUEVO: Map<slug, ClientConfig>
  narrativa/
    condado-vi.md          ← NUEVO: contenido cualitativo extraído
    _template.md           ← NUEVO: template para onboarding
    _parser.ts             ← NUEVO: lee .md → QualitativeContent
  tools/                   ← existente, sin cambios
  html/                    ← existente, parametrizar sections.ts
  types.ts                 ← agregar QualitativeContent
  generate.ts              ← usar registry + narrativa
```

## Dependencia crítica

Los 8 tools viven en `scripts/estudio-mercado/` con su propio `package.json` y cliente Supabase. Vercel serverless no puede importar desde `scripts/`. En Fase 1 hay que mover a `simon-mvp/src/lib/estudio-mercado/` o configurar monorepo.

## Plan detallado

Ver `C:\Users\LUCHO\.claude\plans\structured-launching-zebra.md` para el plan completo con tipos TS, estructura de narrativa, y registry.
