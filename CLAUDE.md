# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching (venta + alquiler)
- Tabla principal: `propiedades_v2` — conteos vivos via `v_mercado_venta` / `v_mercado_alquiler`
- Tabla proyectos: `proyectos_master` (99%+ con GPS)
- Tracking: `workflow_executions` (health check)
- Fuentes: Century21, Remax, Bien Inmuebles

**Casas ZN** (`tipo_propiedad_original='casa'`) — pipeline propio, **aislado del feed de deptos** (0 en `v_mercado_venta`, 0 con `id_proyecto_master`). Cargadas vía **flujo híbrido manual** (`scripts/sonda-suelo/`: discovery/dedup/fetch-contacto/merge + agentes-lectores para el MOAT, con contacto del captador) — NO el n8n viejo de Equipetrol. Condominios en `condominios_master` (FK `id_condominio_master`; matcher `matchear_condominio(lat,lon,nombre)` nombre-primario + GPS). Feed `v_mercado_casas` → `/ventas/casas` **en prod (dark launch/noindex)** + cron de captura `/cron-casas` (`scripts/casas-zn/`, $0 bajo Max). Pendiente: validar → og:image → público. Diseño: `docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md`.
**Casas ZN × ALQUILER** (exploratorio, en curso): prototipo read-only `scripts/casas-zn/muestra-alquiler-zn.mjs` + clasificador `clasificar-uso.mjs` (`uso_inmueble`: residencial/mixto/comercial, expuesto como filtro NO exclusión). Falta pipeline+feed+migración. Ver memoria `project_feed_alquiler_casas_zn_uso`.
**Deptos Equipetrol → HÍBRIDO** — el flujo propio (discovery + reader-extendido en sesión = MOAT) que reemplazó al n8n de deptos. 🚀 **Toda la app pública de Equipetrol lee la base del híbrido** desde el 21-jul-2026; ya NO es dark-launch. 🏁 **n8n NO vuelve** (el founder dio de baja Firecrawl y el servidor a fines de julio): `propiedades_v2_archivo`, `market_absorption_snapshots` y `workflow_executions` están **congeladas desde el 27-28 jul** — cualquier número que salga de ahí es una foto vieja que no falla, solo se queda quieta. El cutover se cerró el 17-18 ago; la tabla viva es `propiedades_v2` y **el atajo `propiedades_v2_shadow` ya no existe** (ver regla #3). ⚠️ Las **migs 268 y 276 colisionan** con main/frontend → renumerar (`docs/migrations/MIGRATION_INDEX.md`). **TC nuevo** (unificación oficial=paralelo) en `TC_NUEVO_DECISION.md` — **principio de arquitectura: normalización = frontera de acceso, crudo+tag adentro / normalizado afuera** (portable, para la Plataforma Híbrida Genérica). Reader spec: `scripts/deptos-equipetrol/READER_SPEC.md` **v4.2**. 🔁 El discovery **captura** (no filtra) la republicación por *slug reescrito* de C21, detectándola por el código del aviso: es el ÚNICO punto donde el apply toca filas que no vienen en el material → memoria `project_c21_slug_reescrito`. **Capturas:** `/cron-deptos-ventas` + `/cron-deptos-alquiler` (Equipetrol) · `/cron-deptos-ventas-zn` + `/cron-deptos-alquiler-zn` (Zona Norte) — 🔴 **son los mismos scripts y TODOS los pasos llevan `--zona=zona-norte`**: el default de `lib/zonas-hibrido.mjs` es `equipetrol`, y un paso sin el flag **no falla, hace la cosa equivocada en silencio**. **Auditorías:** `/audit-cola-shadow` (matching + dedup, las 2 zonas) · `/audit-deptos-shadow` (drift). **Parte matutino: `/revisar-routines`** — 🔴 se leen los **LOGS de las 5 routines** (`output/`, un log por zona), **NO la BD**, y se comparan entre sí los horarios que declaran los logs (el `lastRunAt` de la scheduled-task no dice el orden real). Cutover: `scripts/deptos-equipetrol/INVENTARIO_CUTOVER_2026-08-10.md` (fuente única) · post-cutover: `AUDITORIAS_POST_CUTOVER.md` · estado: memoria `project_checkpoint_deptos_hibrido` · retomar: `docs/RETOMAR.md`.

## ✅ Ya NO hay tareas manuales de mercado (20-ago-2026, mig 334)

Hasta hoy esta sección mandaba correr **1 vez por mes**
`node scripts/deptos-equipetrol/reconstruir-serie-precios.mjs` para que la curva histórica
de `/mercado` avanzara. 🔴 **Esa instrucción quedó inválida con el cutover y nadie lo notó**:
el backfill lee `precios_historial` + `propiedades_v2_archivo`, **las dos congeladas el
27-jul**. Correrlo hoy agrega 6 días y después nada, para siempre. La curva llevaba
**un mes detenida** bajo un badge que decía "Actualizado hoy" — no fallaba, se quedaba
quieta, que en un gráfico de mercado se lee como "el mercado está tranquilo".

**La curva ahora avanza sola.** La sirve `v_serie_precios_venta` (mig 334), que EMPALMA:
· hasta el 20-jul → `market_price_reexpresado` (la historia estimada, irreemplazable:
  su fuente ya no existe) · del 21-jul en adelante → `market_absorption_snapshots_shadow`,
  que escribe el cron cada noche y **tiene macrozona**.
🔑 El empalme está **medido**: en el día en que las dos series se tocan dan 1.700 y 1.700
(1 dorm). La migración lo vuelve a verificar y aborta si aparece un escalón >5%.
La vista expone `fuente` ('historico' / 'medido') para poder declararlo en pantalla.

⚠️ **`reconstruir-serie-precios.mjs` NO se borra**: sirve si algún día se mejora el método
sobre el tramo histórico. Pero **ya no es tarea recurrente** — no puede avanzar la curva.

🔴 **Lo que SÍ sigue sin publicarse: la actividad de mercado (absorción).** La tarjeta no
se pinta y es a propósito (`absorcionPct: null` en `lib/mercado-data.ts`). Las dos fuentes
fallan por su lado: la de prod está congelada, y la viva se calcula sobre las bajas de los
últimos 30 días cuando `primera_ausencia_at` tiene **3 días de historia** (la primera es del
17-ago) → da 1,0% en Equipetrol y 0,0% en ZN, saltando de 0 a 6 de un día al otro. Se
reactiva a mediados de sep, comparando antes contra la serie vieja.

### 💱 El TC ya NO es tarea manual (12-ago-2026)
`config_global.tipo_cambio_paralelo` se refresca solo: es el **paso 0** de `/cron-deptos-ventas`
(01:17, el primero de la noche), y los otros 3 crons heredan el valor fresco.
🔑 **Va primero porque el clasificador de la captura lo usa**: `clasificarTCporRatio()` decide si el
precio de un aviso está en USD o en Bs comparando contra el paralelo vivo, con 6% de tolerancia.
Hasta el 12-ago las 4 capturas **leían** el TC y ninguna lo **refrescaba** — quedó congelado 16 días
(27-jul→12-ago, brecha 0,95%) y nadie se enteró. Un falso positivo de `paralelo` es *"el bug
histórico que infló 368 deptos"*.
**Un fallo del TC NO frena la captura**: el script sale con `exit 1` en 5 situaciones y las 5 son
guardarraíles correctos (Binance caído, TC fuera de 8–15, salto >10%, doble corrida) — se anota en el
log y se sigue. A mano: `node scripts/deptos-equipetrol/capturar-tc-binance.mjs` (dry-run) o
`--apply`. Plan y foto previa: `docs/arquitectura/TC_BINANCE_PLAN_2026-08-12.md`.

## MCP Servers

```json
{ "postgres-sici": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://claude_readonly:***@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"] } }
```

Server oficial Anthropic, **readonly por diseño** (solo tool `query` para SELECT; `claude_readonly` tiene SELECT en todas las tablas — defense in depth). **Mutations (UPDATE/INSERT/DELETE)** no son ejecutables desde el MCP: el patrón canónico es Claude genera el SQL, el humano lo aplica desde Supabase UI o psql.

## n8n Environment Variables

Workflows n8n usan env vars para secrets (NO hardcodear): `SLACK_WEBHOOK_SICI=...`. **Nunca commitear webhooks reales** — Slack los revoca.

## Reglas Criticas

1. **Manual > Automatic** — `campos_bloqueados` SIEMPRE se respetan
2. **Discovery > Enrichment** — para campos físicos (area, dorms, GPS)
3. 🟢 **La tabla viva se llama `propiedades_v2` — el TIEMPO 2 se ejecutó el 17-ago-2026.** Se cumplió la predicción firmada: no se movió un solo número (verificado en base, lectura en producción y **escritura real con el cargador**; confirmado end-to-end porque el bot respondió por WhatsApp). Tres nombres, tres cosas distintas:
   - **`propiedades_v2`** = 🟢 **LA TABLA VIVA.** El nombre bueno, por fin.
   - **`propiedades_v2_shadow`** = ✅ **YA NO EXISTE.** Fue el "atajo" (una vista) que sostuvo el sistema entre el rename y la limpieza; se borró el **18-ago-2026** al terminar los 3 frentes — 6 funciones (mig 327), 53 puntos de código y 6 skills. **Cualquier query a ese nombre falla: es correcto.**
   - **`propiedades_v2_archivo`** = la vieja de n8n, **congelada desde el 28-jul**. Se conserva (33 matches de condominio, crudo histórico, 22k filas de `precios_historial`).
   `propiedades` a secas es LEGACY de 2025. Detalle: `scripts/deptos-equipetrol/TIEMPO2_FOTO_PREVIA_2026-08-17.md` · mapa completo: `BARRIDO_RENAME_2026-08-17.md`
4. **SQL > Regex** — potenciar matching en BD, no extractores
5. **Human-in-the-Loop** — HITL migrado a Admin Dashboard (ya no Google Sheets)
6. **Alquiler aislado** — pipeline alquiler usa funciones PROPIAS (`_alquiler`), NUNCA modificar funciones de venta
7. **pg_get_functiondef() SIEMPRE** — antes de modificar cualquier función SQL, exportar la versión de producción. NUNCA confiar en archivos de migración locales.
8. **Filtros de calidad en estudios** — al consultar props para informes: `duplicado_de IS NULL`, `tipo_propiedad_original NOT IN ('baulera','parqueo','garaje','deposito')`, `(es_multiproyecto = false OR es_multiproyecto IS NULL)` (columna directa, NO `llm_output`), `area_total_m2 >= 20`, `<=300d` venta (730 preventa) / `<=150d` alquiler. Detalle: `docs/reports/FILTROS_CALIDAD_MERCADO.md`
9. **Auditorías de datos** — filtrar primero por los mismos criterios de mercado (`duplicado_de IS NULL`, `status='completado'`). Props que no pasan esos filtros NO son anomalías — ya están excluidas.
   🔑 **Y antes de declarar cerrado cualquier barrido: ¿qué clase de objeto NO puede ver el instrumento que estoy usando?** Un barrido hereda el punto ciego de su herramienta: el catálogo (`pg_*`) no ve el repositorio, un `grep` no ve el grafo de llamadas (no encuentra llamadores internos al mismo archivo), un patrón de texto no distingue prefijo de sufijo (`precio_normalizado` matchea `precio_normalizado_shadow`). Las tres mordieron el **17-ago-2026**, el mismo día: el barrido del rename recorrió 74 funciones, 17 vistas y 33 triggers, **se sintió completo**, y había ignorado **53 puntos de código** — incluidos los 2 cargadores nocturnos. 👉 Recorrer cada eje con **otra** herramienta, y desconfiar de la sensación de completitud. Detalle: `scripts/deptos-equipetrol/BARRIDO_RENAME_2026-08-17.md` §doble check.
10. **Queries de mercado ad-hoc** — 🆕 **Para la CURVA de precios: `v_serie_precios_venta`** (mig 334, empalmada y multi-macrozona; filtrar SIEMPRE por `macrozona`). 🔴 Sin GRANT para `anon` a propósito —lee los snapshots shadow—: se consume con la llave de servidor (`lib/mercado-shadow-data.ts`), nunca con la pública. Para todo lo demás: 🔴 **SIEMPRE las vistas `_shadow`: `v_mercado_venta_shadow` / `v_mercado_alquiler_shadow`.** *(Sigue vigente tras el TIEMPO 2: las vistas se ligan por OID, así que el rename no las movió — las `_shadow` siguen leyendo la tabla viva y las sin sufijo, el archivo.)* Las gemelas sin sufijo (`v_mercado_venta`, `v_mercado_alquiler`, `v_mercado_casas`) **quedaron pegadas a `propiedades_v2_archivo`** cuando el TIEMPO 1 renombró la tabla — las vistas se ligan por OID, no por nombre. **No dan error: sirven la foto congelada del 27-jul.** Es el bug que dejó el resumen de mercado de ZN mostrando datos viejos hasta el 12-ago. (Excepción: `v_mercado_casas` apunta bien, porque las casas viven en el archivo — 98 en el feed al 21-ago, y el número baja con las bajas.) NUNCA filtros canónicos a mano contra la tabla. Exponen `precio_m2`, `precio_norm`, `dias_en_mercado` (venta), `precio_mensual` (alquiler). Alquiler: `precio_mensual_bob` (fuente de verdad, display Bs) → `precio_mensual` USD derivado por TC oficial salvo `solo_tc_paralelo=true`; NO es la normalización de venta. Vistas filtran ≤150d (inventario estancado → `propiedades_v2` directo). **NUNCA `precio_usd`.** Detalle TC: `docs/arquitectura/TIPO_CAMBIO_SICI.md`
11. **Días en mercado (venta)** — NUNCA `fecha_discovery` (se pisa con `NOW()` cada noche). Usar `dias_en_mercado` de la vista o `fecha_publicacion` directo (`fecha_creacion` proxy solo si pub NULL).
12. **Series de mercado — TRES tablas distintas, declarar SIEMPRE cuál se usa:**
    - `market_absorption_snapshots` (**prod**, régimen TC viejo, la escribe n8n 9:00): `filter_version` v1 rota · v2 filtro 300d · v3 limpia desde 14-abr. ⚠️ Sus **precios están ~45% por encima** de lo que muestra la app hoy, y la **v3 anterior a junio está inflada** por los bugs de monoambientes (21-may) y flag paralelo (23-jun). Sus **conteos** (absorción/inventario) sí son válidos y son la única historia larga.
    - `market_absorption_snapshots_shadow` (**medida**, régimen TC nuevo, `filter_version=4`, migs 283-286 + **313** + **314**): la escribe el cron híbrido cada noche (paso 5c). Suma concentración de edificios, días en mercado, spread preventa/entrega y cortes amoblado/equipado/parqueo. **Arrancó el 21-jul** → la absorción necesita ~30-60d para ser confiable.
      🔴 **CORTE EL 3-AGO (mig 314) — la serie NO es comparable de punta a punta.** Hasta ese día las vistas shadow contaban **avisos ya dados de baja** (filtraban `status` pero no `es_activa`, y en shadow la baja se marca con `es_activa=false` sin tocar el status). La función del snapshot lee de esas vistas → **todas las filas del 21-jul al 3-ago inclusive están infladas**: 8,2% en venta y 15,6% en alquiler al 2-ago, y **la distorsión crece con el tiempo** porque las bajas se acumulan (o sea: el inventario real cayó MÁS de lo que muestra la curva). La fila del 3-ago se reescribió limpia a mano; **las del 21-jul al 2-ago no se pueden reconstruir** (la función calcula sobre el estado actual, no sobre el pasado). Al presentar la serie, declarar el corte: antes del 3-ago la tendencia sirve, el nivel no.
      🔴 **MULTI-MACROZONA desde la mig 313 (31-jul):** tiene columna **`macrozona`** y el UNIQUE es `(fecha, dormitorios, zona, macrozona)`. **`zona='global'` es el agregado DE SU MACROZONA, no el total** — `('global','Equipetrol')` conserva la serie desde el 21-jul y `('global','Zona Norte')` arrancó el 31-jul. **Toda consulta a esta tabla filtra por `macrozona`**, o mezcla dos mercados con niveles de precio distintos. Antes de la 313 estuvo blindada a Equipetrol a propósito (mig 312: ZN estaba a media relectura y una serie con cobertura parcial "crece" por el avance de la relectura, no por el mercado); se levantó al llegar ZN al 97,1% de cobertura. Nada está hardcodeado por zona: agregar una macrozona no requiere tocar la función.
    - `market_price_reexpresado` (**ESTIMACIÓN**, migs 287-289): 6,5 meses de precios recalculados prop-por-prop al régimen nuevo, en USD **y Bs** + el TC de cada fecha. Error de método ~7%, declarado. Sirve para la **forma de la curva**, no para el nivel exacto de una fecha. Backfill **congelado el 21-jul** (su fuente murió con el cutover). Desde la mig 334 es el PRIMER TRAMO de `v_serie_precios_venta`, no la curva entera.
    - Al presentar: declarar tabla y versión · absorbida ≠ vendida · NUNCA "meses de inventario" como predicción · **NUNCA un % de variación de precio sin decir la moneda** (en USD y en Bs dan cosas muy distintas: el dólar se movió). Detalle: `docs/canonical/ABSORCION_LIMITACIONES.md`
13. **Seguridad Supabase / RLS** — antes de API routes con Supabase, RLS, DROP, o views/RPC: leer `docs/canonical/SEGURIDAD_SUPABASE.md`. Claves: service_role server-side (nunca anon/`NEXT_PUBLIC_`), rename `_trash_*` antes de DROP, grep+`pg_depend` antes de RLS, views sin `SECURITY DEFINER`. Migraciones que crean tablas/RPC/views en `public` usan `sql/migrations/_template.sql` (GRANT explícitos, obligatorio desde 30-oct por cambio Data API). 🔴 **Y REVOKE primero (lección mig 283→284):** toda tabla nueva en `public` nace con `anon`/`authenticated` en **ALL** por los *default privileges* del schema — los GRANT **suman, no revocan**. Sin `REVOKE ALL ... FROM anon, authenticated` (tabla **y** secuencia del BIGSERIAL) una tabla interna queda escribible desde el browser. Verificar siempre con `SELECT relacl FROM pg_class WHERE relname='...'`.
    🔴 **Y AL REVÉS — cerrar una tabla rompe lo que la lee POR DENTRO (lecciones 306 · 315 · 317):**
    las **vistas** corren con permisos del dueño (cerrar la tabla no las afecta), pero una **RPC
    `SECURITY INVOKER` lee con los permisos de quien llama**. `anon` puede *ejecutarla* y la función
    falla *adentro* con `42501`. Pasó **dos veces con la misma vista** y costó caro:
    · la **315** recreó `v_estado_obra_inferido_shadow` sin GRANT para `anon` y la **317** revocó
      `propiedades_v2_shadow` → **19 días de bot caído**, arreglado con la **320** (las 3 RPC del bot
      a `SECURITY DEFINER SET search_path = public`);
    · la misma 317 dejó **la primera pintura de los 4 feeds vacía** — el SSG usaba la clave pública y
      caía al fallback, que apunta a la tabla archivada. Fix: `lib/supabase-server.ts` (service_role,
      import dinámico DENTRO de `getStaticProps`).
    👉 **Antes de un REVOKE, listar las RPC `prosecdef = false` que leen esa tabla**, no solo las
    vistas. Y el arreglo **no** es devolver el GRANT —eso deja la trampa armada para la próxima
    migración—: es DEFINER, o la llave de servidor del lado donde no se expone.
14. **Brokers — dos tablas distintas, NUNCA confundir** (ninguna FK entre ellas):
    - `brokers` (legacy B2B captación, no se usa hoy) — admin `/admin/brokers`
    - `simon_brokers` (MVP, mig 231) — `/broker/[slug]` arman shortlists, admin `/admin/simon-brokers`, lib `lib/simon-brokers.ts`
    - `broker_shortlists` + `_items`/`_hearts`/`_views` (228/234/235) + `is_destacada` (239) — lib `lib/broker-shortlists-server.ts`. Detalle: `docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md`
    - `broker_prospection` (237+238) — outreach a captadores, `/admin/prospection`. Ver `docs/broker/PROSPECCION_Y_DEMO.md`
15. **Skills de auditoría feed/cola — ⚠️ ALCANCE PARTIDO desde el 21-jul** (changelog en cada `.command.md`; fuente de verdad = `scripts/auditoria-*/` del repo, las skills viven gitignored en `.claude/commands/`):
    - 🔧 **Al tocar cualquier `.command.md`, correr después `node scripts/verificar-skills.mjs`** (o `--fix`). La copia a `.claude/commands/` es **manual**, así que se olvida — y el síntoma es traicionero: el archivo del repo dice lo correcto y la skill que CORRE está vieja. El 31-jul se descubrió así que `/audit-cola-shadow` llevaba 2 días atrás (auditaba solo Equipetrol) y que otras 2 estaban desincronizadas desde junio. El script compara las 15 ignorando fin de línea, resuelve el destino que cada archivo declara (ojo: `fetch-test.command.md` → `probar-fetcher-ventas`) y **no pisa una copia más nueva que la fuente**.
    - 🔴 **REGLA DE ALCANCE:** las skills `audit-feed-*` corren sobre **PROD** (`v_mercado_venta/alquiler`, régimen TC viejo) → hoy auditan **ZN + casas**, NO Equipetrol. El feed público de **Equipetrol lee SHADOW** y lo auditan sus gemelas del híbrido (`/audit-cola-shadow` + `/audit-deptos-shadow`), que ya cubren drift, matching y dedup. **Correr una `audit-feed-*` con `--macrozona equipetrol` audita data que nadie ve** (y su promesa de "audita exactamente lo que muestra el feed" ya no aplica ahí). Al cutover, cuando prod = shadow, el alcance vuelve a unificarse.
    - **Mensuales** (→ ZN/casas): `/audit-feed-ventas-mensual` (~$1.75 Firecrawl, **NUNCA sin OK explícito del user en el momento**) + gemela $0 `/audit-feed-ventas-mensual-fetch` (fetcher directo, validada con `/probar-fetcher-ventas`) + `/audit-feed-alquileres-mensual` ($0). Drift portal + capas SQL + detector duplicados (`lib/dup-checks.mjs`). Persisten en `audit_descripciones_*`. Pre-req alquileres: `npm run backfill` 1 vez.
    - **Semanales** (→ ZN/casas): `/audit-feed-ventas-semanal` / `/audit-feed-alquileres-semanal`. $0 sin persistencia, props nuevas en ventana (`--dias`, `--macrozona`; **el default `equipetrol` quedó obsoleto — pasar la macrozona ZN explícitamente**). Detector TC + candado **formato-objeto** (un string NO protege — merge usa `_is_campo_bloqueado`). Check matching = regex + juez LLM. Sus checks de TC (doble normalización, flag paralelo) son del **régimen viejo** → válidos en ZN, sin sentido en shadow.
    - **`/audit-cola-matching`**: audita la cola (`matching_sugerencias.estado='pendiente_<macrozona>'`) ANTES de aprobar. El `.mjs` filtra/fetchea; **veredicto = subagentes-lectores (juez LLM), NUNCA el script**. SQL read-only (UPDATE + candado `IS NULL`).
    - **Shadow (híbrido)** — fuente de verdad en `scripts/deptos-equipetrol/` (NO `scripts/auditoria-*/`): `/audit-cola-shadow` (matching + dedup apart-hotel **y republicación SIN código repetido**, **7 superficies** — 1 sin-match+nombre · 2 auto-match riesgoso · 3 dedup · 4 el lector dudó · 5 match LEJOS del edificio · 6 **el edificio se contradice sobre su estado de obra** (6-ago) · 7 **mismo depto a precios incompatibles** (8-ago, >30% entre avisos con igual pm+área+captador; el dedup NO puede verlos porque el precio es parte de su clave de grupo) —, respeta `campos_bloqueados`) + `/audit-deptos-shadow` (drift = re-lectura del anuncio vs lo guardado). $0 read-only sobre `propiedades_v2`; veredicto de matching = subagentes-lectores. 🔁 **El audit ya NO es la única puerta del dedup**: desde el PR #64 la republicación por **slug reescrito de C21** se resuelve en la CAPTURA (ver Quick Context).
    - Memorias TC: `precio_paralelo_vs_oficial_billete`, `feedback_candado_formato_objeto`, `project_bug_tc_flag_paralelo_historico`.

## Zonas Canonicas (6 zonas)

Fuente de verdad: tabla `zonas_geograficas` — **7 polígonos / 6 nombres en Equipetrol**; la tabla completa tiene 22 filas porque también guarda las 14 de Zona Norte, así que **toda consulta filtra por `zona_general`**. 🔴 **El trigger `trg_asignar_zona_venta` (mig 173) NO actúa sobre la tabla viva.** Vive en `propiedades_v2_archivo` junto con los otros 4 — `propiedades_v2` tiene **cero triggers** (verificado 18-ago-2026): nació como tabla nueva y nunca los heredó. 👉 **En el híbrido la zona la escribe el CARGADOR al capturar**: corregir un GPS a mano **no recalcula la zona**, hay que actualizarla en el mismo UPDATE. Es la trampa que hizo perder un paso revisando las routines del 18-ago. `get_zona_by_gps(lat,lon)` (mig 185) para ad-hoc y para calcular la zona nueva a mano — 🔴 **pero devuelve `TABLE(zona text)`, no un valor: usada dentro de un `SELECT` normal BORRA EN SILENCIO las filas cuyo GPS no cae en ninguna zona**, en vez de darles `NULL`. El 20-ago un `SELECT ..., get_zona_by_gps(lat,lon) FROM proyectos_master WHERE zona='Sin zona'` devolvió **1 fila de 19** y se leyó como "solo hay un caso". Va SIEMPRE con `LEFT JOIN LATERAL get_zona_by_gps(lat,lon) AS z(zona) ON TRUE`. 🔑 Y el hallazgo de fondo: de esos 19, **18 estaban fuera de todos los polígonos y su 'Sin zona' era CORRECTO** (edificios fuera de cobertura) — el campo vacío significa dos cosas distintas, y el filtro `pm.zona != 'Sin zona'` de la RPC del feed depende de eso. Desde mig 184 los nombres en BD = display definitivos.

| Valor en BD (`p.zona`, `pm.zona`) | Display (`zonas.ts`) |
|---|---|
| `Equipetrol Centro` | Eq. Centro |
| `Equipetrol Norte` | Eq. Norte |
| `Sirari` | Sirari |
| `Villa Brigida` | V. Brigida |
| `Equipetrol Oeste` | Eq. Oeste |
| `Eq. 3er Anillo` | Eq. 3er Anillo |

Conteos: `SELECT zona, COUNT(*) FROM v_mercado_venta GROUP BY zona`. Descripción geográfica + perfiles: `docs/canonical/ZONAS_EQUIPETROL.md`. En queries usar nombres de BD directos (`lib/zonas.ts` mapea BD→display via `displayZona()`/`getZonaLabel()`). Aliases legacy en `zonas.ts`: `Equipetrol`, `Faremafu`, `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Franja`, `Villa Brígida`.

## Sistema de precios — Definiciones

> ⚠️ **Pre-cutover conviven DOS regímenes.** Lo de abajo describe el de **PROD** (`precio_normalizado()`, paralelo ×tc/6.96). El entorno **shadow** usa el régimen **TC-nuevo** (`precio_normalizado_shadow`, mig 272 — sin el ×1.47; ver `scripts/deptos-equipetrol/TC_NUEVO_DECISION.md`). **🚀 Desde el 21-jul-2026 (lanzamiento TC nuevo, PRs #27/#28) TODA la app pública de Equipetrol lee SHADOW**: feeds `/ventas`+`/alquileres` (default; `?shadow=0` = escape a prod), landing/home, `/mercado/*` (gráfico de precio histórico "en construcción"), shortlists `/b/[hash]` (display + snapshots de precio) y el **bot WhatsApp**.
> 🔴 **LAS 3 RPC DEL BOT SON `resumen_mercado`, `buscar_propiedades` y `buscar_similares`** — verificar siempre en el código real del workflow (`lab-kapso/workflows/simon/workflow.js`), NO en la documentación. **NO son las del sitio** (`buscar_unidades_simple_shadow` y compañía): confundirlas costó **19 días de bot caído** — la mig 317 se justificó nombrando "las 3 RPC del bot", que eran las otras. **No se afirmó sin verificar: se verificó el objeto equivocado.** Migs 320 (DEFINER + `search_path`), 321/325 (timeout); memoria `project_bot_caido_tres_semanas`. **Migs 330/331: las 3 devuelven `amenidades`** (vocabulario CERRADO de 15 valores, propiedad + edificio vía `amenidades_normalizadas(id)`) — cobertura **al 19-ago** 355/391 en venta y 173/186 en alquiler; 🔑 **`[]` significa "no tenemos el dato", NO "no tiene"**. 🆕 **Mig 336 (21-ago): las 2 RPC de consulta VALIDAN sus parámetros** — fuera de dominio dan `22023`/400 nombrando el valor y los válidos (Kapso le pasa el error al modelo y el reintento corrige). Antes todo lo que no fuera exactamente `'venta'` caía a alquiler, NULL incluido. 🔴 **`p_estado` en alquiler y `p_amoblado` en venta se rechazan A PROPÓSITO — no son un filtro pendiente de implementar**: sin dato detrás (0/196 y 305/385) devolverían `[]`, que el bot lee como "no hay". **`p_amoblado` acepta `no_declarado`**: el faltante se declara, nunca se completa ni se infiere. **Zona Norte CERRADA al bot** (lista blanca derivada de `zonas_geograficas`). Detalle: memoria `project_rpc_bot_validan_parametros`. — Los precios públicos son del **régimen nuevo** (~31% menores en venta; alquiler Bs igual). 🔴 **Las funciones/vistas de PROD siguen en régimen viejo y son inofensivas SOLO porque leen una tabla congelada**: calculan con `precio_normalizado()` y, apuntadas a la base viva, inflarían ~47% **sin dar error**. Tres siguen así a propósito — `buscar_unidades_reales`, `razon_fiduciaria_texto` y `generar_razon_fiduciaria` —: **no se desarmaron en la mig 328 porque `simon-advisor` (OTRO repo, deploy propio) las usa**, y renombrarlas rompería una app publicada. Deuda declarada en `simon-advisor/RETOMAR_ADVISOR.md`. Detalle: `scripts/deptos-equipetrol/LANZAMIENTO_TC_NUEVO.md`.

- `precio_usd`: paralelo = USD **billete** (lo que pide el vendedor en físico). Resto = USD directo del listing.
- `tipo_cambio_detectado`: **los 4 valores vivos son `no_especificado` · `oficial_viejo` · `paralelo` · `bob`** (conteo del 19-ago: 628 / 117 / 75 / 49 en venta). 🔴 **`oficial` YA NO EXISTE** — esta línea lo listaba y no queda un solo registro con ese tag. No es un detalle de redacción: **el criterio de comparación del badge de TC (mig 227) compara contra `IN ('paralelo','oficial')`**, una lista blanca escrita cuando `oficial` existía → su referencia quedó en 70 avisos de 761 y **el criterio dejó de marcar a nadie, sin fallar**. La ficha vieja y el bug son la misma raíz. Detalle: `docs/reports/AUDITORIA_SENALES_PRECIO_2026-08-19.md`.
- `depende_de_tc`: `true` si el precio depende del TC. `false` = USD real verificado.
- `precio_usd_actualizado`: **DEPRECADO 19-jun** (cron `recalcular-precios-diario` desagendado; superado por `precio_normalizado()` en vivo). Ningún query lo consume.
- `precio_usd_original` (en `datos_json_enrichment`): **NO confiable** (BOB crudo Remax / USD×TC C21). No usar para correcciones automáticas.
- `precio_normalizado()`: precio comparable. Paralelo: `precio_usd × tc_paralelo / 6.96`. Resto: `precio_usd` directo. **SIEMPRE** usar para queries de mercado.

### Reglas fundamentales de precio

1. **`precio_usd` NUNCA directo** para comparar/mostrar/calcular. Siempre `precio_normalizado()` (SQL) o `normalizarPrecio()` (JS).
2. **`precio_normalizado()` es la ÚNICA normalización** — no normalizar antes de guardar. Si el código escribe `precio_usd`, escribe el valor crudo (billete para paralelo, USD directo resto).
3. **Dashboard (`usePropertyEditor.ts`)**: `calcularPrecioNormalizado()` → billete directo a `precio_usd`; `calcularPrecioDisplay()` muestra el normalizado en UI. NUNCA mezclar.
4. **`buscar_unidades_reales()` retorna `precio_normalizado() AS precio_usd`** — frontend recibe valores ya normalizados, no re-normalizar en JS.
5. Para ad-hoc usar `v_mercado_venta` (expone `precio_norm`/`precio_m2`) — regla 10.

Referencia completa: `docs/arquitectura/TIPO_CAMBIO_SICI.md` — 🔴 **empezar por su §0**, que es lo único actualizado al régimen nuevo: el vocabulario de tags vigente y **por qué `oficial_viejo` es el sucesor de `oficial`**. De §1 en adelante el documento describe el régimen VIEJO (sirve de historia, sus listas de tags NO). (flujo portal→extractor→merge→dashboard→query, bugs históricos, TC Binance).

## Documentacion Principal

| Proposito | Archivo |
|-----------|---------|
| **Product Brief Simón** | `docs/simon/SIMON_PRODUCT_BRIEF.md` |
| **Simon Broker** | `docs/broker/README.md` (MVP venta + Fase 2 alquileres + v1 protección shortlists, mig 228-235) |
| **Demo + Prospección** | `docs/broker/PROSPECCION_Y_DEMO.md` (mig 236-238) |
| **📐 ACM broker + cliente vendedor** | `docs/broker/ACM_CONTEXTO_ARRANQUE.md` — **empezar por ahí**. Prototipo con data real de anoche, servido en `simonbo.com/acm-b7k2.html` (`noindex`), **sin tocar ninguna superficie de producción**. Son DOS productos en una pantalla: el broker **edita** y el cliente **lee un documento congelado** (el ACM entero viaja comprimido en el hash de la URL → el link no cambia de número cuando el pool se refresca). 🔴 **La recomendación firmada por el broker va tipográficamente separada de la medición**: Simón no recomienda precio, aporta la evidencia. Piezas: `api/acm-pool.ts` (comparables ≤3 dorm de `v_mercado_venta_shadow`) · `api/acm-buscar.ts` (URL del aviso → propiedad, **por el código**) · `docs/broker/acm-prototipo.html` (archivo de trabajo) · `preparar-para-web.mjs` (genera la copia servida — correrlo tras **cada** cambio) · `scripts/eval-acm.mjs` (**23 checks**, necesita el server en :3300). 🔴 **Antes de escribir cualquier query del ACM: `docs/broker/DONDE_VIVE_CADA_DATO.md`** — la lista de dónde vive cada dato y dónde ya se buscó mal; buscar en el lugar equivocado no da error, da un número creíble y falso |
| **Contacto Directo B2C (bot) ✅ PROD** | `docs/broker/CONTACTO_DIRECTO_B2C_PLAN.md` — shortlists del bot `simon-asistente` contactan al captador vía flag `simon_brokers.contacto_directo` (mig 256). Atribución `buildAtribucionWaMessage` en `lib/wa-message.ts`. Rollback = `contacto_directo=false`. Memoria `project_plan_contacto_directo_b2c`. **Rediseño mobile + shadow-por-default:** el feed público de la shortlist `/b/[hash]` (mobile) usa el sheet rico del feed y lee data SHADOW por defecto (helper `rpcShadowFirst` en `lib/rpc-shadow.ts` — usado por `b/[hash].tsx`, el SSG de los feeds y los snapshots de precio de `api/broker/shortlists` — + `pages/api/shortlist-market.ts`, cutover-safe con fallback a prod). Memoria `project_shortlist_mobile_redesign` |
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **Plataforma Híbrida Genérica (visión)** | `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md` — reemplazar n8n por plataforma genérica (tipo×operación×zona); casas ZN ya producidas por el híbrido |
| **Simon Arquitectura Cognitiva** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Metodología Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Pipeline Alquiler Canonical** | `docs/canonical/pipeline_alquiler_canonical.md` |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` |
| **Zonas Equipetrol** | `docs/canonical/ZONAS_EQUIPETROL.md` |
| **Proyecto Zona Norte** | `docs/proyectos/zona-norte/` — arquitectura multi-macrozona (ADR-009), strangler pattern (Equipetrol prod NO se toca). Empezar por `README.md`→`DECISIONES.md`→`BACKLOG.md`→`BITACORA.md`→`operacion.md`. Tool GPS: `scripts/verify-pm-gps/` |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` |
| **Alquileres queries** | `docs/canonical/ALQUILERES_QUERIES.md` |
| **Learnings Baseline Equipetrol** | `docs/baseline/LEARNINGS_EQUIPETROL_BASELINE.md` |
| **Fichas técnicas proyectos** | `docs/fichas/` — data de desarrollador no disponible en portales |
| **Estudios mercado SaaS** | `docs/backlog/ESTUDIOS_MERCADO_SAAS.md` — framework `scripts/estudio-mercado/` |
| **🏗️ Paquete B2B desarrolladoras (Mesa + Informe)** | `docs/analysis/README_MESA_INFORME.md` — **empezar por ahí**. Tablero interactivo (`mesa-de-guerra.html`) + informe imprimible (`mockup-informe-mercado.html`) + **`mesa-data.js` = FUENTE ÚNICA** (data del corte + META + CONF + CTX + SLOTS + EDITORIAL). 🔴 **Los 3 archivos viajan JUNTOS**; refrescar corte o clonar a otra zona = regenerar SOLO `mesa-data.js`, las vistas no se tocan. Prototipo con data real **congelada al 3-ago-2026** (no se auto-refresca). El pase editorial por edición tiene checklist fiduciario de 8 reglas en el README. Contexto estratégico: `ANALISIS_DATA_ENGINE_MOAT.md` · rigor: `AUDITORIA_ESTADISTICA_MESA_INFORME.md` (🔴 antigüedad del stock ≠ tiempo de venta) · pricing: `docs/backlog/PRODUCTO_INFORME_MERCADO.md` §10 |
| **Sistema TC y precios** | `docs/arquitectura/TIPO_CAMBIO_SICI.md` — **§0 = el vocabulario de tags vigente** (`no_especificado` · `oficial_viejo` · `paralelo` · `bob`); el resto es el régimen viejo |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| **Brand Guidelines** | Repo externo `simon-brand` — ver sección abajo |
| **Índice migraciones** | `docs/migrations/MIGRATION_INDEX.md` |
| **Catálogo funciones SQL** | `sql/functions/FUNCTION_CATALOG.md` |
| **Backlogs** | `docs/backlog/`: CALIDAD_DATOS_BACKLOG, DEUDA_TECNICA, RETENCION_USUARIOS, MATCHING_ALQUILER_PLAN, SUPABASE_RLS_BACKLOG, IMAGE_OPTIMIZATION_VERCEL, CRM_CLIENTES_B2C_PLAN, CASAS_TERRENOS_PRD, AGENTE_DESARROLLADORAS_PRD, PRODUCTO_INFORME_MERCADO, **MEDICION_FUNNEL_PLAN**, **MERCADO_MOBILE_REDESIGN_PLAN** |
| **Métrica del negocio = contactos WA/semana** | Tabla `wa_clicks` (mig 299) — el **CLIC** de WhatsApp en TODAS las superficies (shortlist · feed venta/alquiler · compare). El beacon vive DENTRO de `openWhatsApp()` (`lib/whatsapp.ts`) → cubre los ~39 call-sites sin tocarlos; el `hash` de la shortlist se deduce de la URL y el server resuelve **de quién** es el clic sin pedirle nada al usuario. **NO reemplaza `leads_alquiler`** (ese es el que DEJÓ SUS DATOS en el modal — eventos distintos, coexisten). 🔴 Se mide el **clic, no el envío** (salvo destino = número de Simón → se confirma en `simon_mensajes`). Query: `SELECT date_trunc('week',created_at), COUNT(*) FROM wa_clicks WHERE NOT es_bot AND NOT es_test GROUP BY 1` |
| **Estado de obra inferido (feed venta **y BOT**)** | Vista `v_estado_obra_inferido_shadow` (migs 302/303/**315**/**329** — desde la 329 las 3 RPC del bot también la usan, y `buscar_propiedades` **FILTRA** por estado, no solo lo informa). Baja el "sin confirmar" **del 52% al 14%**. Señales validadas con backtest: **vecinos unánimes del edificio 96,7%** · **hay alquiler activo 95%** (no se alquila lo no construido). 🔴 **NO usar `proyectos_master.estado_construccion`: acierta 78%** (envejece). Se calcula **al leer** → una prop nueva sale inferida sola y el feed se corrige solo al entregarse el edificio. Cascada v315, del más fuerte al más débil: **verificado** (observación humana, lo único afirmable sin reservas) · **conflicto_resuelto** · **aviso** (el suyo, *solo si vigente*) · **vecinos** · **alquiler**. Expone `estado_origen` para **declarar** lo deducido, nunca afirmarlo. 🔑 **Los dos estados NO son simétricos: un edificio no vuelve al pozo** — "entregado" es evidencia positiva, "preventa" es el default del aviso que nadie actualizó → en conflicto gana entregado, y **NUNCA por mayoría** (en HH Once la mayoría dice preventa y está equivocada). La observación humana va a `proyectos_master.entrega_verificada{,_at,_por,_notas}` y guarda **la fecha de la observación, no el estado** ("al X ya estaba entregado" no caduca; `'en_pozo'` sí, a 365 d). Los conflictos los levanta la **superficie 6** de `/audit-cola-shadow`; el dictado del founder es lo que corta la relectura nocturna |
| **Contrato atribución ↔ marketing** | `docs/canonical/CONTRATO_ATRIBUCION_MARKETING.md` — qué está implementado del lado SICI (`/ir` VIVO desde 22-jul, **registra en Supabase NO en GA4** — un 302 no ejecuta JS), cómo degrada el texto si falta la pieza, y **qué le toca resolver a marketing**: `mkt_piezas` tiene 32 piezas y el slate de Higgsfield llegó a 66 → **50 de 95 links mostrarían el código (`m51`) en vez del nombre**. No bloquea, es tono. El repo de marketing (`Higgsfield/`) NO se toca desde acá: se le pasa el path de este doc |
| **Medición / funnel** | `docs/backlog/MEDICION_FUNNEL_PLAN.md` — número elegido = **contactos WhatsApp/semana**; plan de 4 pasos (paso 1 ✅ 22-jul), acciones manuales del founder en la UI de GA4, y qué NO se va a hacer. 🔴 **`source`/`medium`/`campaign` son nombres RESERVADOS de GA4**: usarlos como parámetro de evento pisa la fuente de tráfico — el parámetro se llama `origen` |
| **Seguridad Supabase (reglas)** | `docs/canonical/SEGURIDAD_SUPABASE.md` |
| **Límites data fiduciaria** | `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` — qué puede aseverar Simón, matriz verde/amarillo/rojo |
| **TC sospechoso criterios** | `docs/canonical/TC_SOSPECHOSO_CRITERIOS.md` — badge "Confirmar tipo de cambio". 🔴 **El badge tiene DOS vías y una está MUDA (medido 19-ago):** la **A** (mig 311, el aviso ancla a un TC viejo → tag `oficial_viejo`) es la única que dispara; la **B** (mig 227, comparación: $/m² >28% bajo su grupo, factor 0.72) marca **CERO** — su mediana se calcula con `IN ('paralelo','oficial')` y **el tag `oficial` ya no existe**, así que casi ningún grupo llega al mínimo de 3 y nadie tiene contra qué compararse. **No falla: dejó de mirar.** 🔒 **DECIDIDO (21-ago): la B NO se repara ni se conecta al badge, y esto no se re-abre.** Reparar la referencia es una línea y revive la comparación (7 → 79 grupos con mediana), pero encendería 8 avisos de los cuales **6 tienen precio redondo en dólares** ($87.000, $55.000, $30.000, $75.000, $80.000, $90.000): ahí no hay ninguna moneda que confirmar. 🔑 **El criterio B no mide lo que el badge dice** — mide *precio atípico*, que suele venir del área mal leída (la superficie descubierta incluida en el total contamina el `$/m²` en 163 avisos), no del tipo de cambio. Convertirla en una señal propia de "precio atípico" sería un producto aparte y exige limpiar las áreas primero. Evidencia: `docs/reports/AUDITORIA_SENALES_PRECIO_2026-08-19.md` (midió 13 de 15; re-medido el 21-ago da 6 de 8, misma proporción). 🟢 **CORREGIDO 18-ago-2026: el badge SÍ dispara en el régimen nuevo.** 🔑 **Dispara en EXACTAMENTE las props del feed que llevan el tag `oficial_viejo`** — medido el 21-ago: 79 de 656 (12%), y las 79 tienen ese tag, **cero por cualquier otra vía**. Esa correspondencia 1:1 es la regla; el conteo se mueve con el inventario (el 18-ago eran 93 de 656 — el denominador no cambió, sí cuántas `oficial_viejo` están vivas en el feed). Para medirlo: `SELECT count(*) FROM buscar_unidades_simple_shadow('{"limite":5000}') WHERE tc_sospechoso` — 🔴 **sin `limite` la RPC topea en 500 y el número sale sesgado**. Esta fila decía "en Equipetrol/shadow el badge NO dispara y está bien así", y quedó vieja cuando la **mig 311** lo reactivó para el tag `oficial_viejo`. 🔑 **Es la mitad B de una decisión**: `precio_normalizado_shadow` **ya NO descuenta** el `oficial_viejo` — que el aviso mencione el rate viejo no prueba que el precio en dólares salga de ahí, y medido contra las vecinas del mismo edificio vale igual sin descontar —, así que **se publica lo que dice el anuncio y se enciende el badge**. No se inventa un descuento: se declara la duda. Ejemplo vivo: **8000865 (One Isuto)**, $95.400 / 53 m² = $1.800/m² con `tc_sospechoso = true`. En ZN/casas (régimen viejo) sigue disparando por el criterio de la 227. |
| **Refactor ventas / UX alquileres** | `docs/refactor/VENTAS_SIMPLIFICADO.md`, `AUDITORIA_UX_ALQUILERES.md`, `docs/design/UX_AUDIT_MOBILE_ALQUILERES.md` |
| **Verificar feeds (desktop + mobile)** | `docs/design/VERIFICAR_FEEDS_DESKTOP.md` — usar Playwright headless (el preview interno no hidrata el layout desktop); gotchas: no pinta tiles satelitales JPEG · mobile necesita `isMobile`+`hasTouch` · un carrusel `overflow-x` NO se arrastra con `mouse.move`, va `mouse.wheel` |
| **Filtro por área del mapa (Airbnb)** | `docs/design/PLAN_MAPA_FILTRO_AIRBNB.md` — "Buscar en esta zona" en `/ventas` y `/alquileres`, escritorio y celular (PR #62, 3-ago). Decisiones, los 2 bugs de bucle que costaron encontrar, y qué feeds heredan solo el fix del mapa |
| **Análisis (LLM/precios/comparativas)** | `docs/analysis/` — AUDITORIA_DATOS_VENTAS, COMPARATIVA_VENTAS_VS_ALQUILERES, PRUEBA_LLM_VS_REGEX_VENTAS, RESUMEN_EJECUTIVO_LLM_VENTAS, COMPARATIVA_ALQUILERES_VS_VENTAS_LLM |
| **Prompts LLM activos** | `scripts/llm-enrichment/` — `prompt-ventas.md` (v4.1), `prompt-alquiler-v2.md` (v2.0), casas/terrenos v1.0; README en la carpeta |
| **Tracking (GA4/Meta/Clarity)** | `docs/meta/` — GA4_EVENTOS, META_PIXEL_EVENTOS, CLARITY_TRACKING |
| **GA4 Metrics Script** | `scripts/check_ga4_metrics.py` (comando `/metrics`) — modos retention/campaign/ux/overview |
| **Performance Learnings** | `docs/performance/PERFORMANCE_LEARNINGS.md` |
| **Cómo contribuir** | `CONTRIBUTING.md` |

## Simon Brand (repo externo)

Source of truth: `C:/Users/LUCHO/Desktop/Censo inmobiliario/simon-brand/`. Leer por path absoluto, no copiar. Si diverge con sici, **simon-brand gana**. Tokens sincronizados en `simon-mvp/src/lib/simon-design-tokens.ts`.

## Pipeline Nocturno

### Venta (modulo_1)
```
1:00  Discovery C21 + Remax → propiedades_v2
2:00  Enrichment regex → datos_json_enrichment
2:15  Enrichment LLM (Haiku 4.5, v4.1) → llm_output
3:00  Merge v2.6.0 → consolidado + TC paralelo + LLM + guardrail monoambiente (mig 246)
4:00  Matching → id_proyecto_master + nombre_edificio (mig 170)
6:00  Verificador venta v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 150/noche)
9:00  Auditoria + Snapshots absorcion
```

### Alquiler
```
1:30  Discovery C21 + Remax
2:30  Discovery Bien Inmuebles + Enrichment LLM (Haiku 4.5, v2.0 + PROYECTOS CONOCIDOS)
3:30  Merge alquiler v1.4.0 (enrichment-first, sin TC paralelo) + guardrail monoambiente (mig 214+247)
7:00  Verificador alquiler v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 60/noche)
```

### Casas y Terrenos (n8n, mig 221) — **DESACTIVADO**
Pipeline n8n Equipetrol-only (discovery 1:15 + enrichment all-in-one 2:30, Firecrawl + Haiku, TC `obtener_tc_actuales()`). **Reemplazado por el flujo híbrido manual de casas ZN** (ver Quick Context) porque no captura contacto ni matchea condominios. **BLINDAJE (21-jun): deptos y casas comparten `propiedades_v2` → cada pipeline filtra por TIPO.** Discovery deptos ZN excluye `tipo_propiedad_original IN ('casa','terreno','lote')`; Equipetrol NO se tocó. Regla TC casas: "7" = oficial. Diseño: `docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md`.

## Estructura Clave

```
sici/
├── sql/functions/   → Funciones SQL canónicas (discovery, enrichment, merge v2.6.0,
│                      matching v3.1, alquiler, query_layer, snapshots, tc_dinamico,
│                      hitl, admin, broker, helpers, triggers) — ver FUNCTION_CATALOG.md
├── sql/migrations/  → ver docs/migrations/MIGRATION_INDEX.md
├── scripts/
│   ├── deptos-equipetrol/ → 🔴 EL HÍBRIDO (deptos venta+alquiler, Equipetrol Y Zona Norte):
│   │                        discovery/cargador/verificador/audits + READER_SPEC*.md +
│   │                        los .command.md de las skills + output/ (gitignored: logs,
│   │                        materiales, SQL del audit). La perilla de zona vive en
│   │                        lib/zonas-hibrido.mjs — default `equipetrol`.
│   │                        🔴 ÚNICA EXCEPCIÓN al filtro de zona: el índice de códigos C21
│   │                        del "slug reescrito" se cruza contra shadow COMPLETO (el código
│   │                        es único en todo C21 → detecta aunque el aviso cambie de zona;
│   │                        avisa `⚠️ cambió de zona, revisar`)
│   ├── llm-enrichment/  → ventas v4.1, alquiler v2.0, casas/terrenos v1.0
│   ├── casas-zn/        → cron /cron-casas (reusa sonda-suelo/lib)
│   ├── sonda-suelo/     → flujo híbrido casas ZN
│   ├── auditoria-*/     → skills audit feed/cola (fuente de verdad)
│   ├── estudio-mercado/ → framework estudios SaaS
│   ├── poc-zona-norte/  → POC discovery Zona Norte (poc-discovery.mjs + geojson)
│   └── verificar-skills.mjs → ¿la skill que CORRE dice lo mismo que el repo? (ver abajo)
├── geodata/         → microzonas_equipetrol_v4.geojson
├── n8n/workflows/   → modulo_1 (venta), modulo_2 (matching/audit/TC),
│                      alquiler (6 wf), casas_terrenos (DESACTIVADO)
├── docs/            → backlog, canonical, meta, refactor, analysis, fichas,
│                      clientes, proyectos (zona-norte), informes, archive
└── simon-mvp/       → Frontend Next.js (simonbo.com) — ver abajo
```

## simon-mvp Arquitectura

Refactorizado S1-S6: monolitos admin descompuestos en patrón **tipos → constantes → hook → componentes → página orquestadora**.

```
simon-mvp/src/
├── types/        → propiedad-editor, proyecto-editor, db-responses (RPC Supabase), landing
├── config/       → propiedad-constants (MICROZONAS, TIPO_OPERACION, DORMITORIOS, amenidades)
├── hooks/        → usePropertyEditor, useProjectEditor, useAdminAuth (context en _app), useBrokerAuth
├── components/admin/ → PropertyGallery, LockPanel, LockIcon, AmenitiesEditor, PaymentPlanEditor,
│                       PropiedadesVinculadasTable
├── components/venta/ → VentaMap (Leaflet, pins de precio + clustering). Props del filtro por
│                       área: `onUserMove` (solo movimientos del usuario) y `onViewportChange`
│                       (además emite el encuadre inicial); exporta el tipo `MapViewBounds`.
│                       🔴 Ambos SUPRIMEN los movimientos programáticos — sin eso el panTo del
│                       resalte genera un bucle encuadre→lista→resalte→panTo
├── components/alquiler/ → AlquilerMapMulti (gemelo de VentaMap, tema claro), AlquilerMap
│                       (1 sola prop, detalle), CompareSheet, PhotoViewer
├── components/feed/  → 🟢 **FeedVentas.tsx y FeedAlquileres.tsx — los feeds COMPARTIDOS**,
│                       parametrizados por macrozona (18-ago): las 4 páginas de feed
│                       (`/ventas`, `/alquileres`, `/zona-norte/*`) son envoltorios de
│                       ~250 líneas con su `<Head>` y su `getStaticProps`.
│                       + FeedDesktopNav, EdificioSelect, IsotipoSimon, PriceHistogram
├── lib/          → **macrozonas** (🟢 la declaración de qué es cada zona del feed: `zonasDB`,
│                   zonas del filtro, ejemplos del buscador, rutas, `indexable`. Agregar
│                   una macrozona = una entrada acá + una página delgada),
│                   supabase (cliente + RPC mappers), zonas, precio-utils, format-utils,
│                   mercado-data, mercado-alquiler-data, casas (feed casas ZN), meta-pixel,
│                   wa-message, broker-shortlists-server, informe/ (types+helpers+template),
│                   busqueda-natural (parser lenguaje natural $0 sin IA, feeds mobile+desktop),
│                   superficies-data (datos vivos ISR de las superficies /,/sobre-simon,/whatsapp);
│                   + broker/demo/phone/property-reports/whatsapp/analytics
├── pages/admin/  → orquestadores delgados (ver tabla Admin Pages)
├── pages/api/    → API routes (ver Broker Pages & API)
├── components/   → landing-premium, alquiler, broker, mercado
│                   (filters-premium y results-premium borrados el 14-ago con el funnel)
├── contexts/     → AdminAuthContext (provider de admin auth, lo consume useAdminAuth)
├── test/         → mocks JSON (chat, guía/razón fiduciaria, formulario)
└── styles/       → globals.css, premium-theme.ts
```

Editores grandes: `propiedades/[id]` (~1035L, `usePropertyEditor`), `proyectos/[id]` (~1145L, `useProjectEditor`), `api/informe` (~150L, `informe/`).

## Admin Pages

| Ruta | Proposito |
|------|-----------|
| `/admin/login` | email+password (default 24h) + magic link (fallback). Reset: `simon-mvp/scripts/set-admin-password.mjs` (requiere `SUPABASE_SERVICE_ROLE_KEY`) |
| `/admin/propiedades` + `/[id]` | Listado venta/alquiler + editor (candados, amenidades, pagos, galería) |
| `/admin/proyectos` + `/[id]` | Listado/crear + editor (datos, inferir, propagar, tabla props) |
| `/admin/brokers` | Brokers B2B (tabla `brokers` legacy) |
| `/admin/simon-brokers` + `/[slug]` | Brokers MVP (`simon_brokers`, mig 231) + gestión shortlists (mig 235). APIs `/api/admin/shortlists*` |
| `/admin/prospection` | Prospección captadores (`broker_prospection`, mig 237+238). APIs `/api/admin/prospection*` |
| `/admin/supervisor` + `/matching`/`/sin-match`/`/excluidas`/`/auto-aprobados` | Dashboard HITL |
| `/admin/contactos` | **CRM B2C del bot** — quién le escribió a Simón por WhatsApp, con su conversación completa, sus selecciones (props + ♥ favoritos + aperturas) e intentos de contacto. Los datos entran SOLOS por `/api/kapso/webhook` (mig 292); la vista `v_simon_contactos_resumen` deriva los contadores (migs 296/300/301). APIs `/api/admin/contactos*`. 🔴 **La identidad HOY SIGUE SIENDO EL TELÉFONO — la mig 319 está ESCRITA pero NO APLICADA** (verificado en la base el 21-ago-2026: `simon_resolver_contacto()` y `simon_eventos_sin_procesar` **no existen**; de ese par solo corrió la **318**, que creó `simon_contacto_bsuids`). El plan, cuando se aplique: Meta está sacando el teléfono del payload —quien adopta un username obtiene privacidad de número y `wa_id`/`from` desaparecen—, así que la identidad pasa al par **(`meta_portfolio_id`, `business_scoped_user_id`)**, resuelto SIEMPRE por `simon_resolver_contacto()` con el orden **BSUID → teléfono → crear** (al revés se generan duplicados imposibles de fusionar), y lo que el ingest no entienda irá crudo a `simon_eventos_sin_procesar` porque Meta no reenvía. El BSUID **cambia con el tiempo** (el número del founder tiene 3, el último desde la reconexión del 28-jul): los viejos viven como alias en `simon_contacto_bsuids`. Gate de 5 chequeos y rollback limitado → memoria `project_crm_identidad_bsuid`. ⚠️ Las shortlists/favoritos siguen cruzando **por teléfono**: un contacto sin número los muestra en cero y la UI lo declara. Manual: `scripts/kapso-bsuid/README.md` |
| `/admin/revisar` | **Bandeja del audit** (`audit_hallazgos`, mig 335) — entrar por PROBLEMA en vez de por propiedad. Descartar un hallazgo impide que el audit lo re-abra cada noche |
| `/admin/salud` | Health dashboard sistema |
| `/admin/market` + `/market-alquileres` | Market Pulse (usa `market_absorption_snapshots`, `zona='global'` para globales) |
| `/admin/alquileres` | Cards + inline edit + WA tracking |

## Landing Pages

| Ruta | Proposito |
|------|-----------|
| `/` | **Home principal** (switch 7-jul, `index.tsx` sirve `HomePrincipal` de `pages/home.tsx`) — buscador natural que rutea a los feeds filtrados, banda de mercado viva (TC del día), propiedades reales, demos de valor. `/home`→`/` (301). Datos: `lib/superficies-data.ts` (ISR 6h) |
| `/sobre-simon` | **Sobre Simon** — método, principios, qué no promete, roadmap. Indexable |
| `/whatsapp` | **Landing WhatsApp conversacional** — port de la maqueta v6 (chat-héroe animado, dos puertas), fotos reales de Equipetrol (`public/equipetrol-aerea.jpg`, `wa-card-*.jpg`). Indexable |
| `/landing-v2` | Landing Premium anterior (negro/crema/oro) — ya NO es `/`, queda accesible directo |
| ~~`/filtros-v2`, `/formulario-v2`, `/resultados-v2`~~ | ⛔ **Funnel premium APAGADO (14-ago-2026)** — páginas y componentes (`filters-premium`, `results-premium`) borrados; las 3 rutas **redirigen 301 a `/ventas`**, igual que los 11 redirects históricos que apuntaban ahí (`/form`, `/results`, `/resultados`, `/formulario-vivienda`…). Motivo: dormido hacía meses (el producto es el feed) y era el **último consumidor no-admin de `buscar_unidades_reales()`**, la RPC del régimen viejo que bloqueaba el TIEMPO 2. Con él cayeron 4 funciones muertas de `lib/supabase.ts`. `/landing-v2` NO se tocó: sigue viva |
| `/ventas` | **Feed ventas** — rediseño mobile + desktop (ver abajo), buscador inteligente, card limpia, **mapa que filtra la lista por área visible** (patrón Airbnb). Mobile=TikTok + mapa-explorador con carrusel; desktop=lista densa + panel (mapa/side sheet) |
| `/alquileres` | **Feed alquileres** — mismo patrón mobile + desktop que ventas, filtro por área incluido (ver flujo abajo) |
| `/zona-norte/ventas` + `/alquileres` | Feeds ZN `[dark launch/noindex]` — 🟢 **YA NO SON COPIAS (18-ago-2026): los 4 feeds comparten UN componente por operación**, `components/feed/FeedVentas.tsx` y `FeedAlquileres.tsx`, parametrizados por **macrozona**. Las 4 páginas quedaron en ~250 líneas (su `<Head>` + `getStaticProps`); ZN heredó el rediseño completo que antes solo tenía Equipetrol. 🔑 **Agregar una macrozona nueva (Urubó, Zona Este) = declarar una entrada en `lib/macrozonas.ts` + una página delgada.** Ahí vive TODO lo que varía: `zonasDB` (el filtro real), `zonasCanonicas` y `zonasAlquilerUI` (lo que ofrece el filtro), ejemplos del buscador (**venta y alquiler van aparte**: 'hasta 150 mil' no sirve donde se paga 3.000 Bs/mes), rutas e `indexable`. **`rutaMercado: null` OCULTA el enlace** en vez de mandarte al mercado de otra zona. Red de seguridad: `scripts/eval-feeds-zonas.mjs` (Playwright, mide los 4 feeds: cuántas props, **de qué macrozona son** y qué piezas del rediseño hay; `--guardar`/`--comparar` contra línea de base). 🔴 **`/api/ventas` Y `/api/alquileres` tienen EQUIPETROL COMO DEFAULT**: una llamada sin `zonas_permitidas` devuelve Equipetrol, **no un error**. El 18-ago eso hizo que el feed de ZN sirviera props de Eq. Centro y V. Brigida en producción — y **pasó `tsc` y `build` sin una queja**. Por eso el aislamiento se fuerza DENTRO de `fetchFromAPI` (las dos operaciones), no en los llamadores. ⚠️ Y el feed carga **24 en el SSG + el resto por fetch diferido**: si ese fetch no se dispara, muestra 24 de ~305. 🔑 **Una zona se FILTRA por `zonasDB` pero se NOMBRA en una docena de textos** (H1, resumen de mercado, chips del buscador, mini estudio del sheet, `trackEvent`): esos textos no fallan, mienten en silencio — y `grep "Equipetrol"` no encuentra "Sirari". Detalle: `docs/design/FIX_FEED_ZN_AISLAMIENTO.md` · `PLAN_ZN_ALINEAR_Y_ESCALAR.md` · `PLAN_ALQUILERES_PARAMETRIZAR.md` · pendientes en `MACROZONAS_PENDIENTES.md` · memorias `project_feeds_parametrizados_por_macrozona`, `project_feed_zona_norte_aislamiento` y `feedback_aislamiento_no_depende_del_llamador` |
| `/ventas/casas` | **Feed casas ZN** `[dark launch/noindex]` — sobre `v_mercado_casas` (SSG + client-side). Aislado de deptos. `pages/ventas/casas.tsx` + `lib/casas.ts`. Captura `/cron-casas` |
| `/mercado/equipetrol` (+ `/ventas`, `/alquileres`) | Mercado hub + páginas SEO (Schema.org Article/Dataset/FAQPage). 🟢 **Desde el 20-ago-2026 las 3 son ENVOLTORIOS de ~40 líneas**: el contenido vive en `components/mercado/PaginaMercadoHub · PaginaMercadoVentas · PaginaMercadoAlquileres`, parametrizados por macrozona igual que los feeds. Todo lo que varía por zona se declara en `lib/macrozonas.ts` (`nombreSEO`, `geo`, `mercadoDesde`, `rutaMercado`, `indexable`) |
| `/mercado/zona-norte` (+ `/ventas`, `/alquileres`) | **Mercado de Zona Norte** `[dark launch/noindex]` — creado el 20-ago-2026 reusando los mismos 3 componentes. 🔑 **NO tiene curva histórica y es correcto**: su serie arranca el 31-jul y `fetchSerieMensualVentas` devuelve `null` con menos de 2 meses dibujables, en vez de inventar una tendencia con 20 días. La curva **aparece sola** cuando el dato madure (~oct). Tampoco lleva la banda "−12 a −17%": esa banda es el error del método de reexpresión de Equipetrol, no una propiedad del mercado — se muestra solo si `serie.incluyeEstimado` |
| `/condado-vi` | Landing cliente (estudio de mercado) |
| `/go` | Launcher personal (links rápidos, noindex). Editable en array `SECTIONS` de `pages/go.tsx` |

Flujo prod (desde switch 7-jul): `simonbo.com (/) = Home` → buscador natural o accesos rápidos → `/ventas` / `/alquileres`. El logo de los feeds vuelve a `/`. **Superficies públicas** (`/`, `/sobre-simon`, `/whatsapp`) comparten tokens brand v1.4 + `lib/superficies-data.ts`; el buscador de la home usa `construirDestino()` (infiere venta/alquiler por operación explícita → moneda → magnitud de precio ≥20.000=venta) y pasa deep-links a los feeds (`/ventas` lee `?zonas/?dormitorios/?precio_min/?precio_max/?preventa`; `/alquileres` sus equivalentes en Bs). **Alquileres**: cards → bottom sheet (galería, características, amenidades, Google Maps, mini estudio de mercado, props similares, preguntas al broker max 3, ver anuncio original [gate], sticky WA) → WhatsApp broker. Comparativo Express desde 2+ favoritos (CompareSheet).

**Rediseño mobile feeds (7-jul, EN PROD)**: ambos feeds comparten el patrón. Los nombres de clase viven en el código (`mc-*`/`mt-*`/`mfh-*` en ventas · `amc-*`/`alq-*` en alquileres). 🔴 **Deuda: ventas usa styled-jsx inline y alquileres CSS externo (`styles/alquileres.css`) → cada pieza se toca DOS veces.** Piezas propias del mobile: header sticky con buscador natural (`lib/busqueda-natural`, $0 sin IA), card limpia (todo lo transaccional en el sheet), barra fija inferior, y **mapa-explorador** con carrusel de mini-tarjetas sincronizado en dos sentidos con los pines, que se actualiza solo al mover el mapa — sin botón de confirmar, decisión de producto: en el celular el resultado se ve al instante. 🔴 **Tope `RAIL_MAX = 30` DECLARADO en el contador** ("372 en pantalla · las 30 más cercanas"): truncar en silencio se leería como "esto es todo". ⚠️ **Regla de layout:** los hijos del contenido de la card van con `flex-shrink:0` — sin eso, en viewports bajos (iPhone SE) el flex aplasta el título y lo recorta. ⚠️ El WhatsApp del menú es `SIMON_WHATSAPP`: el **número de negocio, NO el del fundador**. **Pendiente**: isologo oficial (hoy placeholder arena+punto verde).

**Rediseño DESKTOP feeds (8-jul, EN PROD — PR #19 squash a `main`)**: "mesa de decisión" — más densidad, mapa visible, detalle sin perder el feed. Solo en el feed público desktop (`splitDesktop = isDesktop && !brokerMode && !publicShareMode`; broker/public-share conservan su grid clásico). Mobile NO se tocó (todo scopeado a clases desktop). Piezas:
- **Nav superior** compartido `components/feed/FeedDesktopNav.tsx` (variante `dark`=ventas / `light`=alquileres) — Simon · Alquileres · Ventas · Preventa · Mercado · Simulá y calculá · WhatsApp · perfil · menú. Es el único componente REALMENTE compartido entre feeds (patrón a replicar).
- **Layout split**: fila de **pills de filtro** con dropdowns (sidebar 320px eliminado; `FilterPillsVentas`/`vfp-*` styled-jsx, `FilterPillsAlquiler`/`afp-*` en `alquileres.css`) — mismo motor que `DesktopFilters` (autoApply debounce + remount por `filterComponentVersion`), sticky bajo el nav al scrollear. Debajo: **lista densa** (cards horizontales `VentaListCard`/`vlc-*`, `AlquilerListCard`/`alc-*`) a la izquierda + **panel derecho** con dos estados: sin selección = **mapa + resumen de mercado** del filtro; con selección = **side sheet** (mismo `BottomSheet` con prop `sideMode`, clases `bs-side`/`bs-side-alq`) — `position:fixed` anclado al viewport (columna ~52%), footer WhatsApp/Compartir fijo abajo, tabs Resumen|Mercado|Compra(venta)/Costos(alquiler)|Similares, contenido acotado ~640px + galería full-bleed.
- **Toggle lista | mixto | mapa** (solo-lista = 2 columnas densas sin panel; mixto = 1 col + mapa; mapa = full).
- **Filtro por área del mapa "Buscar en esta zona"** (3-ago, PR #62 — patrón Airbnb): mover el mapa muestra un botón flotante (`vd-map-search-btn`/`ad-map-search-btn`); al aplicarlo, lista + contador + **resumen de mercado** se acotan al encuadre (memo `confirmadosEnBounds`, predicado único `inMapBounds()` a nivel módulo). Chip **"Área del mapa ×"** en la count-row — **fuera de las pills a propósito**: se remontan con `filterComponentVersion` y se perdería. El área persiste al cambiar filtros server-side (se re-intersecta). 🔴 **Regla de oro: el mapa recibe SIEMPRE la lista completa, nunca la acotada** — recibiría su propio filtro y se re-encuadraría en loop. Detalle y postmortem: `docs/design/PLAN_MAPA_FILTRO_AIRBNB.md`.
- **Chip fiduciario en card** ("Bajo/Dentro/Sobre el rango típico · N comparables" — cascada del sheet, ≥6 pool; respuesta Simon al "Recomendado por Propi", sin veredictos).
- **Comparativo Express** ancho (≥1100px: 1040px, nota fiduciaria + acciones compartir/abrir favoritos/WA).
- **Deuda**: ventas (styled-jsx) y alquileres (`alquileres.css`) son gemelos con sistemas CSS distintos → cada pieza se toca 2 veces. **La deuda ya no es solo desktop**: el filtro por área duplicó ~24 clases (`vd-*`/`ad-*` y `mt-*`/`alq-*`) y un componente entero (`MapRailCard`/`MapRailCardAlq`). **Modo satélite RETIRADO** (Esri bloqueado en la red de Bolivia, Google bloquea hotlinking, headless no verifica JPEG cross-origin; requiere token Mapbox). Verificación: `docs/design/VERIFICAR_FEEDS_DESKTOP.md` (Playwright, desktop **y mobile**).
- ✅ **Deuda del mapa CERRADA (3-ago)**: `VentaMap`/`AlquilerMapMulti` ya no se reconstruyen al cambiar `properties` (construcción una vez + markers que se repueblan; handler en ref; firma `id:precio` contra redibujos por identidad). Seleccionar un pin ya **no resetea el zoom**. Lo heredan TODOS los feeds — incluidos `/zona-norte/*` y `/ventas/casas`, que **NO reciben el botón** (no tienen layout split).

- **Fonts:** Figtree (display) + DM Sans (body) — brand v1.4
- **Colores:** Arena #EDE8DC, Negro #141414, Salvia #3A6A48 — `simon-design-tokens.ts`
- **GA:** `G-Q8CRRJD6SL` (`?debug=1` desactiva). **Meta Pixel:** `934634159284471` (mismo scope, excluye admin/broker/debug). Eventos: Lead, ViewContent, Search, Contact.

## Broker Pages & API Routes

**Broker:** `/broker/login`, `/dashboard`, `/nueva-propiedad`, `/editar/[id]`, `/fotos/[id]`, `/leads`, `/perfil`
**API públicas:** `/api/ventas`, `/alquileres`, `/razon-fiduciaria` `[legacy]`, `/generar-guia`, `/informe`, `/contactar-broker`, `/abrir-whatsapp`, `/lead-alquiler`, `/lead-gate`, `/crear-lead-feedback`, `/notify-slack`
**API broker:** `/api/broker/*` — CRUD props, fotos, PDF, CMA, perfil

## Estado Actual

`docs/backlog/` (pendientes). ⚠️ **`/admin/salud` NO sirve de termómetro**: sus 3 fuentes están mudas
desde el 28-jul (`propiedades_v2`, `auditoria_snapshots`, `workflow_executions`).

```sql
-- 🟢 La tabla viva se llama `propiedades_v2` desde el TIEMPO 2 (17-ago, regla #3).
--    `propiedades_v2_shadow` sigue funcionando: es la VISTA-atajo sobre la misma tabla.
SELECT status, fuente, COUNT(*) FROM propiedades_v2 GROUP BY 1,2;         -- Estado general
SELECT COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as matched,
       COUNT(*) FILTER (WHERE status='completado')            as total
  FROM propiedades_v2;                                                    -- Matching
-- Lo que sirve el feed (ya con los filtros canónicos aplicados):
SELECT COUNT(*) FROM v_mercado_venta_shadow;      -- venta
SELECT COUNT(*) FROM v_mercado_alquiler_shadow;   -- alquiler
```

## Repo Legacy

- `sici-matching/` — funciones SQL a tabla deprecada. **NO USAR.**
- `simon-mvp/src/_archive/` — eliminado en S1. Redirects 301 en `next.config.js`.
