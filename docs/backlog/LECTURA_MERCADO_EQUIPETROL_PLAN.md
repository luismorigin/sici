# Lectura de Mercado Equipetrol — Plan de Interconexión

> **Estado:** Plan vivo. Inventario y diagnóstico de mayo 2026. Pendiente decisión de arranque (M1-M5).
> **Objetivo:** Tener una lectura de mercado completa de Equipetrol que sirva a tres audiencias (uso interno, clientes B2B pagos, brokers/inversionistas) en tres modos (snapshot puntual, recurrente, dashboard live).
> **Alcance:** Equipetrol y sus 6 sub-zonas canónicas (Equipetrol Centro, Equipetrol Norte, Sirari, Villa Brigida, Equipetrol Oeste, Eq. 3er Anillo). Replicable a otras zonas en el futuro.

---

## 1. Resumen ejecutivo

El repo tiene **50+ herramientas dispersas** que ya hacen parte del trabajo de lectura de mercado, organizadas en 6 capas: capa SQL, scripts/frameworks, APIs frontend, dashboards/páginas, formatos/outputs ya generados, y documentación de limitaciones.

El hallazgo principal: **conviven dos frameworks de generación de estudios** en `scripts/estudio-mercado/` que parecen duplicados pero son productos distintos — Baseline (macro, multizona, público) y Genérico (micro, proyecto específico, B2B). Ambos funcionan, ambos ya generaron entregables reales, no son WIP.

El gap real no es generación — es **distribución e integración**. Los frameworks generan HTML; falta servirlo dinámicamente, programar corridas recurrentes, y conectar los entregables con las superficies de consumo (`/admin/market`, `/mercado/equipetrol`, clientes B2B).

Se proponen **5 movimientos (M1-M5)** ordenados por dependencias técnicas, no por prioridad. Cada uno con tamaño aproximado.

---

## 2. Audiencias y frecuencias

| Audiencia | Modo | Estado actual |
|-----------|------|---------------|
| Uso interno (Lucho) | Snapshot | `/admin/market` live + queries ad-hoc |
| Uso interno (Lucho) | Recurrente | **Gap** — no hay memo mensual ejecutivo |
| Uso interno (Lucho) | Live | `/admin/market` cubre |
| B2B pago (Proinco / Condado) | Snapshot | Framework Genérico manual, validado con Condado VI |
| B2B pago | Recurrente | **Gap** — backlog Fase 1 SAAS lo resuelve |
| B2B pago | Live | **Gap** — backlog Fase 3 SAAS lo resuelve |
| Broker / inversionista | Snapshot | `/api/informe` + `/api/generar-guia` por propiedad |
| Inversor público (SEO) | Snapshot | `/mercado/equipetrol/*` activo |
| Inversor público (SEO) | Recurrente | **Gap parcial** — el HTML baseline existe pero no está linkeado a la página pública |

---

## 3. Inventario por capa

### 3.1. Capa SQL (fuente única de verdad)

**Vistas canónicas:**
- `v_mercado_venta` (migración 193) — Props venta con filtros pre-aplicados (300d/730d, sin duplicados, área ≥20m², excluye parqueos). Expone `precio_norm`, `precio_m2`, `dias_en_mercado`.
- `v_mercado_alquiler` (migración 193, filtro 150d migración 207) — Props alquiler con `precio_mensual_bob` como fuente, `precio_mensual` USD derivado.
- `v_metricas_mercado` — Estadísticas agregadas por (dormitorios, zona): stock, precio promedio/mediana/min/max, área, precio/m², días.

**Tabla de snapshots:**
- `market_absorption_snapshots` — Histórico diario desde 12 feb 2026. 3 series: v1 (rota), v2 (absorbidas backfilled pero inventario con filtro 300d), v3 (limpia desde 14 abr 2026). Campos: inventario, absorbidas (entrega/preventa), precio/m² mediana, ROI amoblado/no amoblado. Snapshots agrupados por dormitorios 1-3 + global, 5 zonas + global.

**Funciones de análisis (`sql/functions/query_layer/`):**
- `buscar_unidades_reales.sql` — 27 columnas de análisis por propiedad. Core del advisor.
- `buscar_unidades_alquiler.sql` — Equivalente para alquiler con yield.
- `buscar_unidades_simple.sql` — Versión lite (feed público).
- `generar_razon_fiduciaria.sql` — Genera contexto narrativo por propiedad (escasez, precio_bajo, premium, unico). Moat textual.
- `calcular_posicion_mercado.sql` — Compara precio/m² vs zona+dorms. Categorías: oportunidad, bajo_promedio, promedio, sobre_promedio, premium.

**Snapshot job:**
- `snapshot_absorcion_mercado.sql` — Cron 9 AM. Doble loop (global + por zona). Usa mediana desde migración 211.

### 3.2. Scripts / frameworks (en `scripts/estudio-mercado/`)

**Framework Baseline (`src/baseline/`)** — Reporte público trimestral macro.
- Orquestador: `generate-baseline.ts` (npm script `report:baseline`)
- Config parametrizable por edición: `config/equipetrol-abril-2026.ts`
- 6 tools: `panorama-multizona`, `demanda-multizona`, `precios-zona-dorms`, `rotacion-multizona`, `top-proyectos`, `alquiler-multizona`
- 12 secciones HTML en `html/sections/`: cover, vistazo, submercados, oferta, precios, concentracion, alquiler, tres-lecturas, ficha, limites, metodologia, cta-producto
- Narrativa editorial parametrizable vía archivo .md (`narrativa/equipetrol.md`)
- Output último: `scripts/estudio-mercado/public/reports/equipetrol-baseline-abril-2026.html`

**Framework Genérico (`src/` raíz)** — Estudio por proyecto específico (B2B).
- Orquestador: `generate.ts` (npm script `generate`)
- Config por cliente: `config/condado-vi.ts` (incluye inventory array detallado, falsos positivos, TC, escenarios)
- 8 tools: `panorama-mercado`, `posicion-competitiva`, `competidores`, `demanda-tipologia`, `simulacion-precio`, `visibilidad-portales`, `yield-inversor`, `rotacion-observada`
- HTML en `html/sections.ts` (monolito, no subdividido)
- Outputs últimos: `simon-mvp/public/reports/condado-vi-abril-2026.html`, `condado-vi.html`, `condado-vi-plan-comercial.html`

**Stack común:** tsx + `@supabase/supabase-js` v2 + HTML/SVG puro (sin template engine).

### 3.3. APIs frontend (`simon-mvp/src/pages/api/`)

- `informe.ts` — POST. Genera HTML informe fiduciario premium v3 (9 secciones + mapa). Template en `lib/informe/`.
- `razon-fiduciaria.ts` — POST. Descripción narrativa contextual por propiedad usando Claude.
- `generar-guia.ts` — POST. Genera guía PDF inversionista.
- `ventas.ts` / `alquileres.ts` — Proxies a `buscar_unidades_simple` y `buscar_unidades_alquiler` con rate limit.
- `chat-alquileres.ts` — Análisis multipropiedad por chat (Claude + memory).
- `tc-actual.ts` — Precio TC actual (Binance P2P).

**Lib helpers:**
- `lib/mercado-data.ts` / `lib/mercado-alquiler-data.ts` — Fetchers de KPIs, tipologías, zonas, históricos.
- `lib/informe/` — Template HTML (9 secciones), types, helpers.

### 3.4. Páginas / dashboards (`simon-mvp/src/pages/`)

**Admin (autenticado):**
- `/admin/market` — Dashboard venta live. KPIs, tipologías, proyectos, absorción por zona, serie temporal.
- `/admin/market-alquileres` — Dashboard alquiler equivalente.

**Públicas:**
- `/mercado/equipetrol` — Hub: índice ventas + alquileres (Schema.org CollectionPage).
- `/mercado/equipetrol/ventas` — Análisis venta detallado (Article + Dataset + FAQPage).
- `/mercado/equipetrol/alquileres` — Análisis alquiler detallado.
- `/ventas`, `/alquileres` — Feeds con análisis embebido (badge `posicion_mercado`, tooltip `razon_fiduciaria`).
- `/condado-vi` — Landing cliente (hardcodeada, sería dinámica en Fase 1 SAAS).

### 3.5. Formatos / outputs ya existentes

**Reportes HTML estáticos generados:**
- `simon-mvp/public/reports/condado-vi-abril-2026.html` (Genérico, 152 KB)
- `simon-mvp/public/reports/condado-vi.html` (Genérico, versión anterior)
- `simon-mvp/public/reports/condado-vi-plan-comercial.html` (Genérico, plan táctico)
- `scripts/estudio-mercado/public/reports/equipetrol-baseline-abril-2026.html` (Baseline)

**Presentaciones (MD / PDF / PPTX):**
- `docs/reports/ESTUDIO_MERCADO_CONDADO_2026_03.md/.pdf/.pptx` y `_v2`
- `docs/reports/PRESENTACION_CONDADO_VI_v2_DISENO.md`

**Documentación cliente:**
- `docs/clientes/condado/` — PLAN_COMERCIAL, contextos, propuestas, guía seguimiento brokers
- `docs/clientes/proinco.md` — Brief Proinco
- `docs/fichas/CONDADO_VI.md`, `TERRAZZO.md` — Fichas técnicas de proyectos

**Templates email:**
- `docs/informes/correo_entrega_condado_vi_2026_03.md` y `_04`
- `docs/informes/reporte_mkt_*`, `reporte_tracking_paid_*`

### 3.6. Documentación de limitaciones (lectura obligatoria antes de presentar datos)

- `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` — Matriz de aseverabilidad por perfil. Precio publicado ≠ cierre. Vidriera ≠ inventario real. Verde / amarillo / rojo.
- `docs/canonical/ABSORCION_LIMITACIONES.md` — Series v1/v2/v3 de snapshots. Cortes de datos (23 mar backfill C21, 13 abr migración 211). Absorbida ≠ vendida.
- `docs/reports/FILTROS_CALIDAD_MERCADO.md` — SQL obligatorios para queries de mercado (filtros canónicos de calidad).
- `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_1.md` y `PARTE_2.md` — Fundamentos y ejecución técnica.
- `docs/architecture/TIPO_CAMBIO_SICI.md` — Sistema TC dual (oficial + paralelo).
- `docs/baseline/LEARNINGS_EQUIPETROL_BASELINE.md` — Decisiones editoriales del reporte público (público = dev/inversor, no comprador; metodología al final; hallazgos punzantes; caveats portal).

---

## 4. Los dos frameworks — análisis comparativo

| Aspecto | Baseline (`src/baseline/`) | Genérico (`src/`) |
|---------|---------------------------|-------------------|
| Propósito | Reporte trimestral público | Dossier por proyecto B2B |
| Scope | Multizona (5 sub-zonas Equipetrol) | Monozona + inventario de UN proyecto |
| Audiencia | Inversor general / SEO | Cliente decisor / desarrolladora |
| Tools | 6 (panorama, demanda, precios, rotacion, top, alquiler) | 8 (panorama, posicion, competidores, demanda, simulacion, visibilidad, yield, rotacion) |
| Output último | `equipetrol-baseline-abril-2026.html` | `condado-vi-abril-2026.html` y variantes |
| Imports cruzados | Ninguno | Ninguno |
| Estado | Funcional, probado | Funcional, probado |

### 4.1. Overlap real entre tools

| Tool Baseline | Tool Genérico equivalente | Diferencia |
|---------------|---------------------------|------------|
| `panorama-multizona` | `panorama-mercado` | Baseline multizona / Genérico todo el mercado; outputs distintos |
| `demanda-multizona` | `demanda-tipologia` | Baseline detalla estado mix; Genérico categoriza demanda (CRITICA/ALTA/MEDIA/BAJA) |
| `rotacion-multizona` | `rotacion-observada` | Baseline mide antigüedad de listings; Genérico mide salidas del mercado |
| `alquiler-multizona` | `yield-inversor` | Baseline reporta por zona + amoblado; Genérico calcula yield + años retorno |
| `precios-zona-dorms` | (integrado en panorama-mercado, sin percentiles) | Baseline P25-mediana-P75; Genérico no hace análisis percentílico |
| `top-proyectos` | (no existe en Genérico) | Solo Baseline |
| (no existe en Baseline) | `posicion-competitiva` | Solo Genérico — vs mediana zona por tipología |
| (no existe en Baseline) | `competidores` | Solo Genérico — top 10 con signal (NUEVO/ACTIVO/PROLONGADO/ESTANCADO) |
| (no existe en Baseline) | `simulacion-precio` | Solo Genérico — escenarios precio×TC sobre inventario |
| (no existe en Baseline) | `visibilidad-portales` | Solo Genérico — % inventario visible en portales |

**Conclusión:** No hay overlap completo en ningún tool. Hay alineación parcial en `panorama` y `rotacion`, pero con propósitos distintos. Las 4 tools únicas del Genérico (`posicion-competitiva`, `competidores`, `simulacion-precio`, `visibilidad-portales`) son las más valiosas para análisis interno por proyecto.

### 4.2. Decisión sobre fusión

**No fusionar.** Son productos distintos con audiencias distintas. La capa SQL ya es única — los dos frameworks se alimentan de las mismas vistas, no hay redundancia abajo. Lo que sí se podría unificar a futuro es la capa de soporte (DB helpers, design system, brand tokens), no las tools.

---

## 5. Mapa audiencia → herramienta

| Audiencia / Modo | Herramienta hoy | Estado |
|------------------|-----------------|--------|
| Vos / snapshot | `/admin/market` + queries ad-hoc + skill `/metrics` | Live |
| Vos / recurrente | _Gap_ — sin memo mensual armado | Resuelve M3 |
| B2B / snapshot | Framework Genérico (manual) | Validado con Condado VI |
| B2B / recurrente | _Gap_ — Fase 1 SAAS pendiente | Resuelve M4 |
| B2B / live | _Gap_ — Fase 3 SAAS pendiente | Resuelve M4 (Fase 3) |
| Broker / snapshot | `/api/informe` + `/api/generar-guia` por propiedad | Live |
| Inversor público / snapshot | `/mercado/equipetrol/*` (SEO público, ISR) | Live |
| Inversor público / recurrente | HTML baseline existe pero no linkeado | Resuelve M1 |

---

## 6. Plan de 5 movimientos

Orden por dependencias técnicas, no por prioridad.

### M1. Servir baseline en `/mercado/equipetrol` (1 día)

**Qué:** Mover `scripts/estudio-mercado/public/reports/equipetrol-baseline-abril-2026.html` a `simon-mvp/public/reports/` y agregar link/sección "Reporte trimestral completo" desde `/mercado/equipetrol/ventas`.

**Por qué primero:** El HTML ya existe. Cero construcción, pura integración. Quick win publicable hoy.

**Resuelve:** Gap "Inversor público / recurrente".

### M2. Reducir friction del genérico (2-3 días)

**Qué:** Wrappear el orquestador del Genérico en CLI interactivo (`tsx generate --interactive`) o endpoint admin `/admin/estudios/nuevo` con formulario. Hoy correr un análisis nuevo requiere crear `src/config/{cliente}.ts` a mano con inventario, falsos positivos, TC — editor TypeScript + npm run.

**Por qué segundo:** Habilita uso interno rápido + es **prerequisito de M4** (la API SAAS necesita que el motor del Genérico sea modular y parametrizable por input externo).

**Resuelve:** Gap "análisis rápido por proyecto" (uso interno) + base técnica para B2B.

### M3. Memo mensual ejecutivo interno

**Estado:** Fase 1 (validar formato) **cerrada 13 may 2026**. Fase 2 (automatización como script CLI) pendiente.

**Fase 1 — Validación del formato (cerrada):**
Se iteró a mano sobre el resumen mensual con datos reales de Equipetrol al 13 mayo 2026. Resultado:
- HTML de referencia: `scripts/estudio-mercado/public/reports/equipetrol-resumen-mayo-2026.html`
- Learnings y decisiones de diseño: `docs/baseline/LEARNINGS_RESUMEN_MENSUAL.md`
- 3 hallazgos de calidad de datos registrados: `docs/backlog/CALIDAD_DATOS_BACKLOG.md` (SANTORINI duplicados latentes, matching no respeta `activo=false`, límite estructural de distinción de tipos de entrada)

**Lo que se validó:**
- 11 bloques en el HTML que entregan análisis profesional sobrio con indicadores accionables
- Filtros canónicos en queries (incluyendo `pm.activo = true` y dedup por signatura)
- SICI puede entregar: stock, precios, distribución, concentración, yield, movimiento del pipeline (con caveat)
- SICI NO puede entregar: lanzamientos primarios genuinos, velocidad de venta real, absorción real, aceleración del mercado
- El ritmo real de lanzamientos primarios en Equipetrol es ~1 cada 3 meses (verificado caso a caso sobre 90 días)
- Validación humana caso a caso es necesaria para "lanzamientos verificados" — sin ella, 4 de cada 5 candidatos del top son falsos positivos

**Fase 2 — Automatización como script CLI (pendiente, ~3-5 días):**
- Estructura propuesta en `LEARNINGS_RESUMEN_MENSUAL.md` sección 10
- `scripts/estudio-mercado/src/resumen-mensual/` con orquestador + tools + html + narrativa
- Genera HTML público + log interno con candidatos a verificar
- Workflow del usuario: correr script, validar candidatos en log, completar bloques editoriales del HTML (15-25 min/mes)

**Fase 3 — Página Next.js (opcional):**
- Solo si Fase 2 se usa recurrentemente. `/admin/resumen-mes` con ISR.

**Resuelve:** Gap "memo mensual ejecutivo" (uso interno).

### M4. API `/api/estudio/[slug]` — Fase 1 SAAS (2-4 semanas)

**Qué:** El movimiento estratégico. Plan completo en `docs/backlog/ESTUDIOS_MERCADO_SAAS.md`.
- Mover tools del Genérico de `scripts/estudio-mercado/src/` a `simon-mvp/src/lib/estudio-mercado/`
- Tabla `informe_accesos` (token, slug, fecha_expiración, cliente)
- API dinámica que regenera HTML on-demand con datos frescos
- Cliente abre URL única → ve datos actualizados al momento

**Depende de:** M2 (motor modular del Genérico).

**Resuelve las tres frictions B2B:**
- Generar → reuso de lib + input simplificado de M2
- Entregar recurrente → mismo URL, datos frescos cada request
- Vender → URL demoteable y compartible, demo viva

### M5. Packaging comercial B2B (paralelo, no técnico)

**Qué:**
- Pricing definido (el backlog SAAS menciona USD 1,500 setup + USD 250/mes)
- Propuesta tipo (formalizar el caso Condado VI como template)
- 1-pager demo

**Cuándo:** En paralelo a M4. No bloquea nada técnico.

**Resuelve:** Friction "vender" del B2B.

---

## 7. Diagrama de interconexión

```
            ┌──────────────────────────────────────────────┐
            │  CAPA SQL ÚNICA — fuente de verdad           │
            │  v_mercado_venta / v_mercado_alquiler        │
            │  v_metricas_mercado                          │
            │  market_absorption_snapshots                 │
            └─────────┬────────────────────┬───────────────┘
                      │                    │
        ┌─────────────┴──────────┐  ┌──────┴───────────┐
        │ Framework BASELINE     │  │ Framework        │
        │ (macro / multizona)    │  │ GENÉRICO         │
        │                        │  │ (micro / proyecto│
        │ 6 tools: panorama,     │  │  específico)     │
        │ demanda, precios,      │  │ 8 tools incl.    │
        │ rotacion, top-proy,    │  │ posicion-comp,   │
        │ alquiler               │  │ competidores,    │
        │                        │  │ simulacion-precio│
        │                        │  │ visib-portales   │
        └─────┬──────────┬───────┘  └────────┬─────────┘
              │          │                   │
       ┌──────▼───┐   ┌──▼──────┐    ┌───────▼────────┐
       │ M1       │   │ M3      │    │ M2 (CLI mejor) │
       │ /mercado │   │ Memo    │    │       ↓        │
       │ público  │   │ mensual │    │ M4 API /estudio│
       │          │   │ interno │    │   [slug] SAAS  │
       └──────────┘   └─────────┘    └───────┬────────┘
                                             │
                                       ┌─────▼───────┐
                                       │ M5 packaging│
                                       │ comercial   │
                                       └─────────────┘
```

La capa SQL es única. Los dos frameworks se alimentan de las mismas vistas. La fuente de verdad ya está unificada abajo — solo los outputs son distintos porque los públicos son distintos.

---

## 8. Limitaciones a respetar (declarar en cada output)

| Métrica | Cuándo es confiable |
|---------|---------------------|
| Absorción venta | Desde 14 abr 2026 (serie v3 limpia). Estable ≥90d → ~14 jul 2026 |
| Absorción alquiler | Desde 14 mar 2026 (30d post-launch pipeline) |
| Días en mercado | OK con `dias_en_mercado` de la vista. **Nunca** usar `fecha_discovery` (se pisa cada noche) |
| Precio | Siempre `precio_normalizado()` o `precio_norm` de la vista. **Nunca** `precio_usd` directo |
| Vidriera | "Inventario publicado" ≠ "inventario real" — declarar siempre |
| Absorbida | "Salió del portal" ≠ "vendida" (puede ser listing expirado o retirado) — declarar siempre |
| Filtros canónicos | `duplicado_de IS NULL`, `tipo_propiedad_original NOT IN ('baulera','parqueo','garaje','deposito')`, `es_multiproyecto = false`, `area_total_m2 >= 20` — obligatorios en queries ad-hoc |

Caveats canónicos en `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` y `ABSORCION_LIMITACIONES.md`. Los outputs nuevos deben citarlos al pie.

---

## 9. Próximos pasos (decisión pendiente)

**Sin asumir orden de ejecución.** Tres caminos razonables para arrancar:

1. **M1 — Quick win público (1 día):** Mover HTML baseline a simon-mvp y linkearlo desde `/mercado/equipetrol`. Resultado visible inmediato, cero riesgo.
2. **M3 — Memo mensual interno (3-5 días):** El gap que más se nombró. Genera capacidad operativa propia.
3. **M2 + M4 — SAAS B2B (2-4 semanas):** Movimiento estratégico. Resuelve las tres frictions B2B. El más grande, el de más palanca.

**M5 corre en paralelo a cualquiera.**

---

## 10. Referencias cruzadas

- `docs/backlog/ESTUDIOS_MERCADO_SAAS.md` — Roadmap completo Fases 0-3 del producto SAAS B2B (lo que M4 implementa)
- `docs/backlog/PRODUCTO_INFORME_MERCADO.md` — Requerimientos del informe premium
- `docs/baseline/LEARNINGS_EQUIPETROL_BASELINE.md` — Decisiones editoriales del reporte público trimestral
- `docs/baseline/LEARNINGS_RESUMEN_MENSUAL.md` — Decisiones de diseño + workflow del resumen mensual interno (Fase 1 cerrada 13 may 2026)
- `scripts/estudio-mercado/public/reports/equipetrol-resumen-mayo-2026.html` — HTML de referencia del resumen mensual
- `docs/clientes/condado/PLAN_COMERCIAL_CONDADO_VI.md` — Estrategia comercial del primer caso B2B
- `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` — Matriz de aseverabilidad
- `docs/canonical/ABSORCION_LIMITACIONES.md` — Cortes de datos de market_absorption_snapshots
- `docs/reports/FILTROS_CALIDAD_MERCADO.md` — SQL canónicos de filtros
- `CLAUDE.md` (raíz) — Reglas críticas del proyecto, secciones de zonas y precios

---

**Última actualización:** 2026-05-13 (mayo 2026). Plan vivo — actualizar al avanzar movimientos.

**Cambios desde versión anterior:**
- M3 Fase 1 (validar formato) cerrada con HTML de mayo + doc de learnings.
- Agregadas referencias al `LEARNINGS_RESUMEN_MENSUAL.md` y al HTML de referencia.
