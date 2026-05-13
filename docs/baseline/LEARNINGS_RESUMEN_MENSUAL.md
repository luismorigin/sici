# Learnings — Resumen Mensual Equipetrol

> **Capturado:** 13 mayo 2026, sesión de diseño Fase 1 (validar formato).
> **HTML de referencia:** `scripts/estudio-mercado/public/reports/equipetrol-resumen-mayo-2026.html`
> **Plan vivo:** `docs/backlog/LECTURA_MERCADO_EQUIPETROL_PLAN.md`
> **Doc paralelo:** `docs/baseline/LEARNINGS_EQUIPETROL_BASELINE.md` (reporte trimestral público — distinto producto, mismas raíces metodológicas)

Este documento captura todo lo aprendido al construir el resumen mensual interno desde cero. Sirve como base de Fase 2 (automatización como script CLI) para que no se redescubra cada problema desde cero.

---

## 1. Propósito del resumen mensual

**Audiencia primaria:** Lucho, para asesoría operativa y toma de decisiones (interna y B2B).
**Frecuencia:** mensual (rolling 30d desde la fecha del corte).
**Diferencia con el baseline trimestral:**

| | Baseline trimestral | Resumen mensual |
|---|---------------------|-----------------|
| Audiencia | Público / inversor / dev / SEO | Interno + B2B operativo |
| Tono | Editorial con tesis | Análisis profesional sobrio |
| Cadencia | Cada 3 meses, cerrado | Cada mes, rolling |
| Output | HTML largo con narrativa | HTML corto con indicadores accionables |
| Validación humana | Sí, escritura editorial | Sí, validación caso a caso de lanzamientos |

---

## 2. Estructura del HTML — 11 bloques

Orden definitivo validado con datos reales:

1. **Header** — Equipetrol — {Mes} {Año} · Datos al {Fecha} · Comparativa vs mes anterior
2. **Análisis del mes** — Lectura editorial (1-2 párrafos + bottom line) — *escritura humana*
3. **Stock actual** — 4 KPIs: venta, alquiler, $/m² mediana global, TC paralelo
4. **Actividad del pipeline** — 4 KPIs: entradas/salidas venta + alquiler, con caveat fuerte
5. **Composición del stock venta por dormitorios** — tabla: stock, %, entró, salió, Δ
6. **Venta por submercado** — tabla zonas con stock, entradas, salidas, Δ, $/m², perfil + deltas vs mes anterior
7. **Alquiler por submercado** — tabla zonas: stock, renta mediana USD, renta promedio USD, nota
8. **Yield bruto aproximado** — tabla zonas: renta×12, ticket, yield bruto, nota
9. **Concentración por desarrollador** — tabla top 7 con ≥2 proyectos: proyectos, unidades, % mercado, destacados
10. **Proyectos con más entradas al pipeline** — tabla top 8: proyecto, dev, zona, uds dedup, tipo probable
11. **Lanzamientos primarios verificados — últimos 90 días** — tabla 3 meses con validación humana caso a caso
12. **Indicadores accionables del mes** — 6-8 puntos editoriales con datos respaldando — *escritura humana*
13. **Indicadores a vigilar el próximo mes** — 4 hipótesis con watchout — *escritura humana*
14. **Lo que SICI no puede medir** — 6 límites estructurales declarados explícitamente
15. **Caveats canónicos al pie** — vidriera ≠ venta cerrada, filtros aplicados, serie limpia desde

---

## 3. Filtros obligatorios en queries

Las queries que cruzan `propiedades_v2` con `proyectos_master` deben aplicar TODOS estos filtros. Omitir cualquiera contamina las métricas:

```sql
-- Filtros a propiedades_v2
AND p.tipo_operacion = 'venta'  -- o 'alquiler'
AND p.status = 'completado'     -- o el equivalente al caso
AND p.fuente IN ('century21','remax')  -- alquiler suma 'bien_inmuebles'
AND p.precio_usd > 0
AND p.area_total_m2 >= 20
AND p.duplicado_de IS NULL
AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
AND p.zona IS NOT NULL

-- Filtro a proyectos_master (CRÍTICO — se omitió en la sesión inicial y contaminó todo)
AND pm.activo = true
```

**Dedup adicional por signatura** (para detectar duplicados latentes que `duplicado_de IS NULL` no captura):
```sql
SELECT DISTINCT ON (p.id_proyecto_master, p.precio_usd, p.area_total_m2, p.dormitorios, p.estado_construccion)
  p.*
FROM ...
ORDER BY p.id_proyecto_master, p.precio_usd, p.area_total_m2, p.dormitorios, p.estado_construccion, p.id
```

---

## 4. Métricas que SICI SÍ puede entregar (confiables)

- **Stock activo** (con filtros canónicos + dedup + activo=true)
- **Distribución por tipología** (dorms 0/1/2/3)
- **Distribución por zona** (Eq. Centro / Sirari / V. Brígida / Eq. Oeste / Eq. Norte)
- **Precios** — medianas, P25, P75 — comparables entre meses si se usa la misma metodología
- **Ticket mediano** por zona y global
- **Concentración por desarrollador** — proyectos con ≥2 proyectos activos
- **Yield bruto aproximado** — referencia comparativa entre zonas
- **Movimiento del pipeline** — entradas/salidas/pending, con caveat
- **Salidas por estado de construcción** — entrega vs preventa
- **Inventario estancado** — props con >300d publicadas
- **TC paralelo y oficial**
- **Renta mediana USD por zona** (alquiler)
- **Mix amoblado / no amoblado** (alquiler)

---

## 5. Métricas que SICI NO puede entregar

Declarar explícitamente en cada output. Estas métricas requieren capacidades que el pipeline actual no tiene:

1. **Lanzamientos primarios genuinos** — el sistema no distingue entre edificio nuevo, mercado secundario, re-publicación, edificio existente que recién apareció en portal. Requiere validación humana caso a caso.
2. **Velocidad de venta real** — SICI ve cuándo entra/sale del portal, no cuándo se vende. Brecha típica publicación → cierre: 5-15% venta, 10-20% alquiler.
3. **Tasa de absorción del mercado** — "absorbida" del pipeline puede ser venta cerrada, retiro, expiración o consolidación de duplicados.
4. **Aceleración / acumulación del mercado** — el ratio entradas/salidas del pipeline mezcla actividad de captura con actividad real del mercado. Da dirección general pero no se puede traducir a "el mercado se aceleró/enfrió".
5. **Movimiento real de precio mes a mes** — medianas calculan sobre listings publicados, no transacciones cerradas. Para hablar de "subió/bajó" hace falta transacciones, no disponibles en SICI.
6. **Estacionalidad vs tendencia** — requiere al menos 3 cortes mensuales comparables. Con 1 mes solo se puede declarar "cambio observado", no tendencia.
7. **Impacto cuantitativo del TC paralelo** — contexto macro que afecta todo, pero no se puede aislar el efecto cuantitativo con la data disponible.

---

## 6. Workflow de validación humana

El resumen mensual **NO se puede automatizar end-to-end**. La automatización cubre el 80%; el 20% restante requiere validación humana caso a caso para que el output sea honesto.

### Lo que automatiza el script (Fase 2)

- Stock con todos los filtros correctos
- KPIs, tablas por zona, tipología, concentración devs, yield
- Actividad del pipeline con caveats fijos
- Bloques 3-10 del HTML, completos
- Bloque "Lo que SICI no puede medir" (texto fijo)
- Caveats canónicos al pie
- Detección de candidatos sospechosos (signaturas duplicadas, huérfanas, lanzamientos potenciales)

### Lo que requiere validación humana cada mes

1. **Bloque 2 "Análisis del mes"** — 1-2 párrafos editoriales + bottom line. Mirando los datos generados, escribir la lectura del mes en 10-15 min.
2. **Bloque 11 "Lanzamientos primarios verificados"** — el script lista los proyectos candidatos del top de los últimos 3 meses con su `primera_pub`, `uds_dedup`, `props_pre_mes`. Vos validás caso a caso si cada uno es lanzamiento real, secundario, habilitación o duplicación.
3. **Bloque 12 "Indicadores accionables"** — 6-8 puntos. Algunos pueden tener plantilla (concentración por dev, distribución por zona), otros requieren juicio (qué destacar este mes).
4. **Bloque 13 "Indicadores a vigilar"** — 4 hipótesis con watchout. Pueden tener plantilla parcial, requieren revisión.

### Reglas para detectar candidatos a lanzamiento primario (alerta automática)

El script debe flaggear cualquier proyecto que cumpla:
- `uds_dedup ≥ 10` Y
- `primera_pub >= NOW() - 30 days` Y
- `props_pre_mes = 0`

→ candidato fuerte a lanzamiento primario, requiere validación.

También flaggear:
- `uds_sin_dup_flag - uds_dedup ≥ 5` → posibles duplicados latentes
- Proyectos con `pm.activo = false` Y `props_huerfanas > 0` → bug de matching

---

## 7. Casos bandera ilustrativos

### Rhodium (abril 2026) — lanzamiento primario verificado
- Elite Desarrollos, Sirari, 17 unidades dedupadas
- Primera publicación 16 mar 2026
- Sin duplicados latentes (`uds_sin_dup_flag = uds_dedup = 17`)
- Sin props pre-mes (`props_existentes_pre_mes = 0` en ventana abril)
- **Validado por Lucho:** SÍ es lanzamiento real. Único de los últimos 90 días.

### SANTORINI VENTURA (mayo 2026) — duplicados latentes
- Constructora Santorini Suites, Villa Brígida
- 17 props "originales" (sin `duplicado_de` marcado), 4 signaturas únicas
- Misma unidad subida 14 veces con URLs distintas, no detectada por el algoritmo
- **Hallazgo de calidad de datos** → registrado en `docs/backlog/CALIDAD_DATOS_BACKLOG.md`

### Mare ↔ Condominio MARE (mayo 2026) — huérfanas tras consolidación
- Dos `id_proyecto_master`: 4 (Mare, Mare Desarrollos, Eq. Centro, `activo=false`) y 65 (Condominio MARE, Mariscal Construcciones, Sirari, `activo=true`)
- ID 4 marcado como duplicado de ID 65 en nov 2025, pero 6 props quedaron huérfanas vinculadas al inactivo
- El matcher de SICI no respeta `activo=false` → bug estructural
- **Hallazgo de calidad de datos** → registrado en backlog
- **Mitigación:** filtrar `pm.activo = true` en todas las queries

### Condado VI Plaza Italia (marzo 2026) — falso lanzamiento
- Apareció en el top de marzo con 3 unidades nuevas dedupadas
- Primera publicación 2 feb 2026 (parecía reciente)
- **Validado por Lucho:** NO es lanzamiento. Proyecto ya terminando hace tiempo, solo entró al portal recién.
- Lección: la métrica automática lo iba a clasificar como lanzamiento. Solo el conocimiento del mercado real lo descarta.

### SÖLO Industrial Apartments (mayo 2026) — preventa preexistente
- Apareció en el top de mayo con 4 unidades dedupadas
- Primera publicación 6 may 2026 (parecía muy reciente)
- **Validado por Lucho:** estaba en preventa hace tiempo, solo se activaron unidades adicionales este mes.
- Lección: `primera_pub` reciente no garantiza "lanzamiento nuevo"; el broker pudo haber publicado más unidades de un proyecto ya existente.

---

## 8. Tono editorial — reglas

1. **Sin jerga técnica en el HTML del resumen.** Nada de `pm.activo`, `duplicado_de IS NULL`, "filter_version", "snapshot del cron", etc. Esos detalles van al backlog interno, no al output que vas a usar para asesoría.
2. **Indicadores con caveats > silencio académico.** Mejor decir "el pipeline registró X movimientos pero ese número incluye también re-publicaciones" que no mostrar el dato.
3. **Distinguir "datos" de "interpretación".** Los datos van en tablas/KPIs sin opinión. La interpretación va en bloques editoriales explícitos ("Análisis del mes", "Indicadores accionables").
4. **Sin emojis** — paleta sobria, paleta Simon (arena #EDE8DC, negro #1a1a1a, salvia #3A6A48 para acentos).
5. **Sin verbos como "se aceleró", "se enfrió", "acumulación"** a menos que la data soporte explícitamente esa afirmación.
6. **Distinción explícita pipeline vs mercado real.** El lector debe entender que SICI mide el pipeline de captura, no el mercado.

---

## 9. Cortes de datos a respetar

- **Serie v3 limpia de `market_absorption_snapshots`:** desde 14 abr 2026. Comparativas pre-fecha son ruidosas (v2 vs v3 = filtros distintos).
- **Pipeline alquiler confiable:** desde 14 mar 2026 (~30d post-launch).
- **Función `snapshot_absorcion_mercado`:** mide "mercado real" sin filtro 300d, mientras que las vistas (`v_mercado_venta`) sí lo aplican. El resumen mensual usa la versión del snapshot.
- **Pipeline alquiler nuevas/absorbidas no se guarda en snapshots.** Para alquiler hay que hacer query directa a `propiedades_v2` con `fecha_creacion` y `primera_ausencia_at`.

---

## 10. Roadmap 3 fases

### Fase 1 — Validar formato (CERRADA · 13 may 2026)

Iteramos a mano sobre el HTML de mayo 2026 hasta llegar a un formato que captura indicadores accionables sin sobrepasar lo que SICI puede entregar honestamente. Salida: `scripts/estudio-mercado/public/reports/equipetrol-resumen-mayo-2026.html`.

### Fase 2 — Automatizar como script CLI (próximo paso)

Estructura propuesta:

```
scripts/estudio-mercado/src/resumen-mensual/
├── generate-resumen.ts        # Orquestador
├── config/equipetrol.ts       # Config (zonas, filtros, fechas)
├── tools/
│   ├── stock-actual.ts        # Bloque 3
│   ├── actividad-pipeline.ts  # Bloque 4
│   ├── composicion-dorms.ts   # Bloque 5
│   ├── zonas-venta.ts         # Bloque 6
│   ├── zonas-alquiler.ts      # Bloque 7
│   ├── yield.ts               # Bloque 8
│   ├── concentracion-dev.ts   # Bloque 9
│   ├── top-entradas.ts        # Bloque 10
│   ├── lanzamientos-candidatos.ts  # Bloque 11 (datos, sin validación)
│   └── alertas.ts             # Log interno: duplicados latentes, huérfanas, etc.
├── html/
│   ├── shell.ts               # HTML shell + CSS
│   └── sections.ts            # Renderers por bloque
└── narrativa/equipetrol.md    # Texto editorial fijo (caveats, "lo que SICI no puede medir")
```

**Output esperado:**
- `scripts/estudio-mercado/public/reports/equipetrol-resumen-{mes}-{año}.html`
- `scripts/estudio-mercado/logs/resumen-{mes}-{año}.json` — log interno con candidatos a verificar, alertas de calidad, métricas de salud

**Invocación:**
```bash
npm run resumen:mensual equipetrol
# Opcionalmente: --date=2026-06-13 para snapshot histórico
```

**Workflow del usuario:**
1. Correr el script
2. Abrir HTML
3. Mirar log interno → validar caso a caso candidatos a lanzamiento
4. Editar HTML: completar bloques 2 (Análisis del mes), 11 (Lanzamientos verificados), 12-13 (Indicadores)
5. Cerrar / publicar / enviar por mail

**Tiempo estimado:** 15-25 minutos de trabajo manual por mes.

### Fase 3 — Convertirlo en página Next.js (opcional)

Solo si Fase 2 se usa recurrentemente y vale tener acceso live siempre fresco. `/admin/resumen-mes` con ISR y campos editables para bloques editoriales.

---

## 11. Decisiones de diseño documentadas

### Por qué dos niveles de output (HTML + log)

El HTML es para asesoría y B2B — limpio, editorial, sin jerga técnica. El log JSON interno es para Lucho cuando audita la corrida, identifica bugs nuevos, o agrega al backlog. Mezclarlos contamina el HTML.

### Por qué NO automatizar la "Análisis del mes" con LLM

Probado conceptualmente con la narrativa hardcoded del baseline trimestral. Fallo: la tesis 2 de abril ("Sirari preventa supera a entrega") se contradijo con los datos de mayo (41% preventa) cuando se regeneró sin reescribir el texto. Conclusión: si delegamos la escritura editorial a un prompt + datos crudos, el resultado puede tener contradicciones internas serias. Es trabajo humano.

### Por qué la validación caso a caso de lanzamientos NO es opcional

5 casos en esta sesión donde los datos crudos sugerían "lanzamiento" y la verdad era distinta: SANTORINI (duplicados), Mare (huérfanas), Condado VI (terminando hace tiempo), SÖLO (preventa preexistente), HH Once (ya estaba antes). 4 de 5 falsos positivos. Sin Lucho verificando, el reporte tendría errores serios.

### Por qué dejar el caveat fuerte sobre "el pipeline mide captura, no mercado"

Es la diferencia entre un análisis honesto y uno que parece sólido pero contiene afirmaciones que no se sostienen. Sin este caveat, el lector podría leer "157 entradas en mayo" como "157 lanzamientos al mercado" — falso.

---

## 12. Métricas de éxito del resumen mensual

Cómo evaluar si una corrida fue útil:

- ¿Permite responder "qué pasa en Equipetrol este mes" en 5 minutos de lectura? Sí.
- ¿Tiene indicadores que se traducen a decisiones operativas para comprador / dev / inversor? Sí (los bloques 12-13).
- ¿Declara honestamente sus límites? Sí (bloque 14).
- ¿Es comparable mes a mes? Sí, si se usan los mismos filtros y dedup.
- ¿Permite contextualizar el mes en 90 días? Sí (bloque 11).

Si una corrida futura no cumple uno de estos, revisar este doc para entender qué cambió.
