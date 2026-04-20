---
name: Estudio Condado VI — Abril 2026 (sesión completa)
description: Contexto exhaustivo de la sesión del 13 Abr 2026. Investigación profunda del mercado, auditoría de listings, fix de absorción, decisiones de presentación, y todo lo necesario para construir el HTML v2 del estudio.
type: project
originSessionId: fde97c3e-cbbe-4e20-be3d-41c7a36fda85
---
# Estudio de Mercado Condado VI — Abril 2026

> **Estado (19 Abr 2026):** Estudio ENTREGADO. Cierre del acuerdo trimestral original ($250/mes × 3 meses). **No hay estudio de mayo comprometido** — mayo no era parte del acuerdo. Pendiente cobro del último mes (USD 250). Ver `PENDIENTES.md`.

## Contexto de la sesión (13 Abr 2026)

Lucho necesita preparar el segundo estudio de mercado mensual para Condado VI (desarrolladora Constructora Condado, contacto Adolfo Altamirano). El primero se entregó el 12-13 de marzo 2026. Este se entrega el 15 de abril. Durante la sesión se descubrieron problemas serios en la métrica de absorción que llevaron a una migración correctiva (211) y a una reestructuración de cómo se presentan los datos.

---

## 1. QUÉ SE ENTREGÓ EN MARZO (baseline)

### Formato
- HTML interactivo autocontenido: `simon-mvp/public/reports/condado-vi.html` (2,393 líneas)
- Design system propio Condado VI: Playfair Display + DM Sans, paleta marfil (#FAF7F2) / ébano (#1A1714) / caramelo (#A07A5A) / arena (#E8E2DA)
- Chart.js para gráficos, reveal animations al scroll, tabs, acordeones, slider TC interactivo
- También se generaron PDFs (asesoría + anexo estratégico)

### 15 secciones del HTML v1
1. `#hero` — Condado VI Plaza Italia (badge "Estudio de Mercado")
2. `#panorama` — El mercado hoy (KPIs generales, corte 12 Mar)
3. `#zonas` — Precio por zona (chart barras $/m²)
4. `#evolucion` — Febrero → Marzo (deltas)
5. `#estado` — Entregado vs Preventa (segmentación)
6. `#centro` — El campo de batalla (Eq. Centro: 140 uds, 62 proyectos)
7. `#proyectos` — El mapa competitivo (tabs por segmento de precio)
8. `#absorcion` — Dónde está la demanda real (barras absorción por tipología)
9. `#terrazzo` — Condado VI vs Terrazzo (comparativa + scorecard + chart)
10. `#competidores` — Dónde compite Condado VI (scatter precio vs velocidad)
11. `#alquiler` — Referencia de rentabilidad (yield cards por tipología)
12. `#tc` — ¿Qué pasa si el dólar sube? (slider TC interactivo)
13. `#acciones` — Qué hacer y cuándo (timeline recomendaciones)
14. `#resumen` — La foto completa (fortalezas/debilidades grid)
15. `#footer` — Datos contacto

### Data clave de marzo
- 311 unidades en 5 microzonas, 62 proyectos
- Mediana general: $2,033/m², ticket promedio $162K
- TC paralelo: Bs 9.454
- 8 competidores analizados en detalle
- Equipamiento scorecard: Condado VI 10/10 (único con línea blanca completa)
- Comparativa Terrazzo: Condado $2,241/m² vs Terrazzo $2,030/m² (-7%), pero Condado entrega inmediata con equip 10/10 vs Terrazzo preventa dic 2026 con equip 6/10
- Absorción 2D reportada como ~2% mensual (49 meses inventario) — DATO ERRÓNEO, estaba contaminado

### Compromisos de marzo
- Monitoreo mensual USD 250/mes (marzo, abril, mayo)
- Siguiente informe ~15 abril
- Análisis profundo de Atrium en abril
- Búsqueda de terrenos en Equipetrol
- Landing web USD 500 (adelanto Bs 1,750 recibido)

---

## 2. INVENTARIO CONDADO VI (confirmado 13 Abr por Adolfo)

**0 ventas desde marzo.** 14 unidades disponibles, precios sin cambio ($1,650/m² USD).

| Piso | Dpto | M² | Dorms | Precio USD |
|---|---|---|---|---|
| 1 | 101 | 62.21 | 1 | $102,646.50 |
| 1 | 102 | 87.62 | 2 | $144,573.00 |
| 1 | 103 | 86.73 | 2 | $143,104.50 |
| 2 | 201 | 62.21 | 1 | $102,646.50 |
| 2 | 202 | 87.62 | 2 | $144,573.00 |
| 2 | 205 | 144.31 | 3 | $238,111.50 |
| 3 | 301 | 62.21 | 1 | $102,646.50 |
| 3 | 302 | 87.62 | 2 | $144,573.00 |
| 3 | 303 | 86.73 | 2 | $143,104.50 |
| 3 | 305 | 144.31 | 3 | $238,111.50 |
| 4 | 401 | 62.21 | 1 | $102,646.50 |
| 4 | 405 | 144.31 | 3 | $238,111.50 |
| 5 | 502 | 87.62 | 2 | $144,573.00 |
| 5 | 503 | 86.73 | 2 | $143,104.50 |

Resumen: 4×1D, 7×2D, 3×3D. Precio uniforme $1,650/m² USD.

### Brochure vs realidad
El brochure (21 páginas, PDF en `C:\Users\LUCHO\Downloads\Condado VI Plaza Italia Brochure (1).pdf`) muestra 5 modelos:
- Modelo 1: 1D, 62.21m²
- Modelo 2: 2D, 87.62m²
- Modelo 3: 2D, 86.73m²
- Modelo 4: 2D, 95.43m² — **NO aparece en inventario** (probablemente vendido)
- Modelo 5: 3D, 144.31m² (brochure dice 144.21, inventario 144.31)

Precios de preventa en brochure eran más altos ($1,750-$1,850/m²). Los actuales ($1,650) representan una baja — nunca se discutió con Adolfo si fue intencional.

---

## 3. AUDITORÍA DE LISTINGS EN PORTALES

### Solo 3 listings de venta activos (de 14 unidades!)

**ID 968 (C21, 1D):** $102,647 paralelo → $136,892 norm, $2,200/m², 52 días. Título "Condado Park 6" — correcto (6 = VI). Dpto 301 piso 3. Equip completo 12 items. `solo_tc_paralelo = true`.

**ID 1037 (C21, 1D):** $132,733, $2,141/m², 70 días. Título genérico "departamento en venta de 1 dormitorio" — NO menciona Condado VI. 0 equipamiento detectado en el anuncio. Amenities sí listadas (piscina, gimnasio, etc.).

**ID 423 (Remax, 1D):** $140,107, $2,252/m², **243 días** en mercado. TC no_especificado. Equip 12 items. Listing muy viejo.

### Listings que NO son venta
**ID 1180 (C21, 2D):** Es un ALQUILER, no venta. URL dice "departamento-en-alquiler". Bs 7,500/mes, amoblado. Es un dpto que alguien ya compró y puso en alquiler.

### Listing con falso positivo
**ID 53 (Remax, 2D):** BD marca `inactivo_confirmed` con `primera_ausencia_at = 2026-03-25`. Adolfo dice que sigue activo en Remax. 243 días, $190,848, $2,200/m². Verificar manualmente.

### El problema central
10-11 de 14 unidades son invisibles en portales. Los 7×2D y 3×3D no están listados para venta. Solo se ven 3 dptos de 1 dormitorio — siendo que 2D es la tipología con mayor demanda.

---

## 4. DATA DEL MERCADO (13 Abr 2026)

### Panorama general por zona

| Zona | Uds activas | Avg precio | Avg $/m² | Avg área |
|---|---|---|---|---|
| Equipetrol Centro | 113 | $176,735 | $2,247 | 79m² |
| Sirari | 65 | $170,817 | $2,110 | 82m² |
| Villa Brigida | 49 | $115,653 | $1,850 | 65m² |
| Equipetrol Oeste | 48 | $129,330 | $2,030 | 66m² |
| Equipetrol Norte | 22 | $168,728 | $2,462 | 70m² |
| Eq. 3er Anillo | 2 | $204,598 | $1,444 | 140m² |

Total: ~305 unidades (era 311 en marzo).

### Condado VI en la BD
- Zona real: **Equipetrol Centro** (por GPS -17.7685, -63.1973), no Eq. Norte
- Proyecto master ID 34: "Condado VI Plaza Italia", desarrollador Constructora Condado
- 5 proyectos Condado en BD: Condado II, III, IV, Park V, VI

### Top competidores Eq. Centro (50 proyectos, top 10)

| Proyecto | Uds | $/m² | Días | Señal |
|---|---|---|---|---|
| HH Once Equipetrol | 10 | $1,784 | 103 | Entry-level, volumen |
| Atrium | 8 | $2,224 | 171 | ESTANCADO |
| Sky Level | 7 | $1,896 | 163 | Estancado |
| Edificio Spazios | 7 | $2,487 | 40 | RÁPIDO, premium |
| Sky Tower | 6 | $2,860 | 80 | Premium |
| Luxe Suites | 5 | $2,671 | 44 | RÁPIDO, premium |
| Uptown NUU | 4 | $2,926 | 106 | Ultra premium |
| Condado VI | 3 | $2,198 | 122 | Pocas en portal |
| Spazios Edén | 3 | $2,039 | 27 | NUEVO, rápido |
| Sky Plaza Italia | 3 | $2,541 | 92 | Vecino directo |

### Seguimiento competidores marzo → abril

**Atrium:** 10→8 uds, días 134→171, precio estable $2,224. Se estanca más. Las 8 que quedan incluyen 5 unidades de Remax con 200 días. 2 absorbidas en el mes pero las restantes no se mueven.

**Terrazzo:** Los 6 listings que teníamos marcados como "TERRAZO" están todos `inactivo_confirmed`. Pero la corrección de Lucho: Terrazzo vende directo, nunca estuvo realmente en portales. Hay que contactar al vendedor para inventario actualizado.

**Spazios:** Creció de 3-4 a 7 unidades. $2,487/m², 40 días promedio. Se mueve rápido en segmento premium.

---

## 5. ALQUILERES Y AMOBLADO

### Mejora: cobertura 100% amoblado
Prompt LLM alquiler v2.1 (commit `96aeb62` del 13 Abr): default "no" cuando la descripción no menciona amoblado. Basado en auditoría: 94% de los NULLs eran no amoblados.

### Distribución actual (127 alquileres activos)
- Amoblado: 82 (64.6%)
- No amoblado: 38 (29.9%)
- Semi: 7 (5.5%)
- Sin dato: 0 (era 28% antes)

### Premium amoblado en Eq. Centro

| Dorms | Amoblado | No amoblado | Premium | n amob | n no amob |
|---|---|---|---|---|---|
| Mono | $469 | $431 | +8.8% | 8 | 1 |
| 1D | $538 | $611 | -11.8%* | 15 | 2 |
| 2D | $1,170 | $899 | **+30.1%** | 10 | 5 |
| 3D | $1,602 | — | n/a | 4 | 0 |

*n=2 no amoblado, no significativo

### Argumento para Condado
Condado entrega con línea blanca completa (heladera, lavadora, secadora, lavavajillas). Si un comprador pone a alquilar amoblado un 2D: renta esperada $1,170/mes vs $899 sin amoblar. El equipamiento de Condado facilita capturar ese +30%.

---

## 6. ABSORCIÓN — LA INVESTIGACIÓN PROFUNDA

### El problema inicial
Los snapshots de absorción mostraban tasa de 36% para 2D en Eq. Centro (19 absorbidas en 30 días). Lucho sospechó que era demasiado alto.

### Lo que descubrimos

**Asimetría de filtros en `snapshot_absorcion_mercado()`:**
- Inventario activo: filtro 300d + duplicados + multiproyecto + parqueos + zona
- Absorbidas: SOLO `inactivo_confirmed` + `primera_ausencia_at` 30d (sin los demás filtros)
- Esto inflaba la tasa artificialmente

**El salto del 10 de abril:** Inventario 2D en Eq. Centro cayó de 43→33 en un solo día (10 unidades). No es absorción natural. Causas: reclasificaciones de duplicados/multiproyecto + inactivaciones manuales admin.

### Verificación prop por prop (2D Eq. Centro, últimos 30d)

Solo encontramos 9 props inactivadas, de las 19 que decía el snapshot:

Props con `primera_ausencia_at` (verificador las detectó ausentes del portal):
- ID 1309 (sin nombre): 24d, probablemente vendida
- ID 205 (Baruc Uno): 129d, posible venta
- ID 636 (Sky Collection): 72d, posible venta
- ID 375 (Luxe Suites): 209d, posible (o expiró)
- ID 905 (Sky Plaza Italia): 243d, dudosa (pudo expirar)
- ID 53 (Condado VI): 243d, **falso positivo** (Adolfo dice activo)
- ID 980 (Madero Residence): 47d, probablemente vendida

Props con `primera_ausencia_at = NULL` (inactivación manual, curación admin):
- ID 450 (Edificio Ariaa): inactivada 14:05, probable curación
- ID 246 (Domus Infinity): inactivada 14:03, probable curación

Las otras ~10 "absorbidas" del snapshot eran artefactos: props que salieron de la vista por pasar 300 días, reclasificaciones de multiproyecto, duplicados marcados post-facto.

### La vista v_mercado_venta vs el snapshot

Las vistas `v_mercado_venta` y `v_mercado_alquiler` son filtros de UX para el marketplace (Simon feeds públicos). Filtran a ≤300d venta, ≤150d alquiler para que el usuario vea props relevantes. Esto está correcto para el frontend.

Pero para estudios de mercado y absorción, el filtro de días distorsiona. Si una prop pasa de 290 a 310 días "desaparece" del conteo sin ser vendida. Para absorción lo correcto es medir el mercado real sin límite de días.

Decisión: **Opción C — dos métricas separadas.** Frontend con filtros UX (no se toca), absorción sin filtro de días (se corrige).

### Migración 211 (ejecutada 13 Abr)

Archivo: `sql/migrations/211_fix_absorcion_alinear_filtros.sql`

Cambios:
1. Inventario activo: **quitar filtro 300d** (mide mercado real)
2. Absorbidas/pending: **alinear filtros** (duplicado_de, multiproyecto, parqueo, zona, `primera_ausencia_at IS NOT NULL`)
3. `venta_usd_m2`: cambiar de AVG a **PERCENTILE_CONT(0.5)** (mediana)
4. Nuevas columnas: `venta_absorbidas_entrega`, `venta_absorbidas_preventa`, `roi_amoblado`, `roi_no_amoblado`, `anos_retorno_amoblado`, `anos_retorno_no_amoblado`
5. Backfill serie v2: recalculó absorbidas con filtros correctos
6. `filter_version = 3`

NO toca: `v_mercado_venta`, `v_mercado_alquiler`, `buscar_unidades_*`, frontend.

### Series de absorción

- **v1** (12 Feb–11 Mar): NO USAR. C21 verificador roto.
- **v2** (12 Mar–13 Abr): Parcial. Absorbidas backfilled, inventario con filtro 300d (no corregible).
- **v3** (14 Abr+): Confiable. Filtros alineados.

v3 necesita ≥90 días para ser estable. Para el estudio del 15 de abril, la absorción no alcanza.

### Documentación creada
- `docs/canonical/ABSORCION_LIMITACIONES.md` — documento canónico con series, cortes, verde/amarillo/rojo
- CLAUDE.md regla 12 — referencia a absorción para cualquier sesión en repo SICI
- COMMENT ON TABLE/COLUMN en BD — para que repos externos (Advisor) vean los caveats
- Se le dio a Lucho el texto para el CLAUDE.md de Advisor (él lo crea)

---

## 7. SIMON ADVISOR — FUNCIONES APROVECHABLES

Proyecto en `C:\Users\LUCHO\Desktop\Censo inmobiliario\simon-advisor`. 6 herramientas de Claude con lógica de análisis que podemos adaptar para el estudio:

**`computeInvestmentScore()`** — Score 0-10 ponderado: precio vs segmento 25%, yield 25%, posición edificio 10%, días mercado 15%, escasez tipología 10%, posición tipología 15%. Ajusta por preventa (meses muertos). Genera highlights automáticos.

**`market_overview`** — Stats por zona+dorms con medianas y percentiles. Chart de $/m² por zona.

**`yield_analysis`** — Cruza venta×alquiler con mediana (no promedio). Calcula yield bruto + años retorno. Disclaimer automático de "solo bruto".

**`scarcity_report`** — Nivel CRITICA (<3%), ALTA (3-10%), MEDIA (10-20%), BAJA (>20%) por tipología+zona+precio.

**`property_deep_dive`** — Razones fiduciarias automáticas: escasez a precio, mejor precio edificio, posición zona. Trae 5 comparables.

**Market Position** — Categoriza cada prop como oportunidad/bajo/promedio/sobre/premium, ajustado por segmento (preventa vs entrega). Usa mediana del segmento, no promedio general.

---

## 8. DECISIONES PARA EL ESTUDIO V2

### Absorción: Opción A (transparente)
No presentar tasas de absorción como métricas duras. En su lugar: "En las últimas 3 semanas, X departamentos de 2D salieron del mercado en Equipetrol Centro: [nombres]. El inventario visible bajó de N a M unidades." Factual, verificable, honesto.

### Metodología: mostrar mejoras
Decirle a Adolfo que mejoramos la metodología. Esto no debilita el informe anterior — demuestra que el sistema mejora. El dato de absorción 2D de marzo (2%, 49 meses inventario) estaba contaminado. No lo corregimos explícitamente en el informe, pero los nuevos datos no repiten ese error.

### Secciones propuestas para v2
1. Resumen ejecutivo
2. Metodología (transparente, mejoras vs marzo)
3. Panorama Equipetrol (305 uds, 6 zonas, distribución)
4. Zoom Equipetrol Centro (113 uds, por tipología, medianas)
5. Escasez por tipología (NUEVO — scarcity report de Advisor)
6. Posición competitiva Condado VI (preventa vs entrega separados)
7. Investment Score comparativo (NUEVO — lógica de Advisor)
8. Rotación observada 21 días (Opción A, con caveats)
9. Alquileres + Yield segmentado (amoblado vs no, premium +30%)
10. Razones fiduciarias por unidad (NUEVO — deep dive)
11. Seguimiento competidores (Atrium estancado, Terrazzo directo, Spazios creció)
12. Recomendaciones actualizadas (visibilidad en portales como #1)

### Dato más potente para Adolfo
"Tu competidor Atrium acumula 171 días sin moverse. Mientras tanto, vos tenés 14 unidades disponibles pero el mercado solo ve 3 departamentos de 1 dormitorio. Tus 7 unidades de 2D y 3 de 3D son invisibles."

---

## 9. COMUNICACIÓN CON ADOLFO

### Historial
- 13 Mar: entrega estudio v1 + cotización landing + screenshot mockup
- 18 Mar: Lucho pide planos, tipologías, fotos reales
- 18 Mar: Adolfo responde con brochure PDF + inventario Excel + info del proyecto. Dice "mañana me reúno con Beatriz para coordinar la información"
- Después del 18 Mar: NO mandó correcciones del texto, NO mandó fotos reales, NO mandó planos separados
- 13 Abr: Lucho envía mensaje pidiendo confirmación inventario + material landing. Adolfo confirma inventario igual, 0 ventas.

### Mensaje enviado 13 Abr (para copiar a WhatsApp)
Se redactó un mensaje combinando ambos temas (estudio + landing). Sin emojis ni barras de blockquote (no se copian bien a WhatsApp). Pregunta inventario/precios + pide fotos reales + revisión texto landing.

### Landing page Condado VI
- Propuesta en `docs/fichas/CONDADO_VI_LANDING_PROPUESTA.md` (v4 post-CRO, 10 secciones)
- Componente Next.js existe: `simon-mvp/src/pages/condado-vi.tsx`
- Design system propio: marfil/caramelo/ébano, Playfair+DM Sans
- Cotización USD 500, adelanto recibido
- **BLOQUEADA por falta de material del cliente** (fotos reales, correcciones texto)
- Del brochure se pueden sacar renders 3D de tipologías (páginas 6-20)

---

## 10. SIMULACIÓN DE PRECIO: $1,550/m² + TC BANCO CENTRAL

Adolfo pidió incluir un análisis con precio de $1,550/m² (vs actual $1,650) aplicando el TC referencial del Banco Central.

**Aclaración importante — hay 3 tipos de cambio distintos:**
- **TC Oficial**: 6.96 — fijado por el gobierno, operaciones bancarias formales
- **TC Paralelo (Binance)**: ~9.45 — el que SICI usa como referencia en `precio_normalizado()` porque refleja el mercado real
- **TC Referencial del Banco Central**: valor distinto al oficial y al paralelo. Es el que Adolfo quiere usar. Hay que buscarlo al momento de hacer el estudio.

**Análisis necesario:**
1. Buscar TC referencial del Banco Central vigente
2. Tabla de tickets por tipología × escenario ($1,650/$1,550 × TC paralelo/referencial)
3. Impacto en posición competitiva de Condado vs mercado
4. Impacto en yield para el inversionista
5. Sección interactiva tipo slider doble (precio × TC) como evolución del slider TC del v1

---

## 11. DECISIÓN: HERRAMIENTAS REUTILIZABLES (Opción B)

En vez de queries ad-hoc, construir un módulo TypeScript en `scripts/estudio-mercado/` donde cada sección del HTML = una herramienta reutilizable. Parámetros genéricos (`id_proyecto_master`, `zona`) — sirve para cualquier desarrolladora, no solo Condado.

**Fase 1 (ahora, con Condado como primer caso):**
- Módulo TS que consulta BD y genera data para cada sección del HTML
- Herramientas: panorama, competidores, posición proyecto, yield segmentado, rotación observada, escasez
- Lógica adaptada de Simon Advisor (`tool-executor.ts`): scoring, market position, scarcity levels
- Output: HTML autocontenido con design system Condado VI

**Fase 2 (backlog):**
- Mini-advisor conversacional para desarrolladoras (Claude API sobre las herramientas de Fase 1)
- Potencial producto API vendible

**Por qué ahora y no después:**
- Tenemos el caso concreto (Condado 15 Abr) — no es diseño especulativo
- Advisor ya validó la lógica — no partimos de cero
- Cada cliente nuevo reutiliza todo — Condado paga el desarrollo, el segundo cliente es ganancia
- Las herramientas mejoran con cada estudio que hagamos

Ver `docs/backlog/DEUDA_TECNICA.md` sección "Herramientas de estudio de mercado".

---

## 11. PENDIENTES

- [x] Respuesta de Adolfo: inventario confirmado igual, 0 ventas
- [ ] Contactar vendedor Terrazzo para inventario actualizado
- [ ] Verificar ID 53 en Remax manualmente
- [x] Migración 211 ejecutada
- [x] COMMENT ON TABLE ejecutados en BD
- [ ] Verificar primer snapshot v3 (14 Abr 9AM)
- [ ] Crear CLAUDE.md de simon-advisor (Lucho tiene el texto)
- [ ] Construir módulo `scripts/estudio-mercado/` con herramientas reutilizables
- [ ] Generar HTML v2 del estudio con las herramientas

---

## 12. CÓMO ARRANCAR LA PRÓXIMA CONVERSACIÓN

Decir algo como:

"Leé `docs/clientes/condado/ESTUDIO_ABRIL_2026_CONTEXTO.md`. Necesito construir herramientas de estudio de mercado para desarrolladoras inmobiliarias en `scripts/estudio-mercado/` y generar el HTML v2 para Condado VI. Las herramientas deben responder las preguntas de una desarrolladora: posición competitiva de su proyecto, demanda por tipología en su zona, seguimiento de competidores, simulación de precio, visibilidad en portales vs inventario real, yield para el comprador-inversor. Simon Advisor es solo una referencia de lógica (scoring, percentiles) pero el diseño tiene que partir del problema de la desarrolladora, no del inversionista. Cada herramienta debe ser reutilizable para otros edificios/clientes cambiando parámetros. Verificá que el snapshot v3 corrió bien."

Con eso la próxima sesión tiene: contexto completo, enfoque correcto (desarrolladora, no inversionista), y el approach de herramientas reutilizables.
