# Plan de cutover de DATA — qué pasa con la historia cuando shadow se vuelve la base

> Reconocimiento 17-jul-2026 (deptos-venta Equipetrol). **El cutover del founder NO es actualizar
> producción: es que `propiedades_v2_shadow` PASE A SER LA BASE** (auditada, sin parches) y la vieja
> (`propiedades_v2` + n8n) se jubile. Este doc analiza qué pasa con la data histórica y los snapshots.
> **NO se implementa nada acá** — es el mapa para cuando el founder decida ejecutar. Gemelo de
> `AUDITORIAS_POST_CUTOVER.md` (que cubre las skills de audit). Datos verificados en el Apéndice.

## Principio rector (por qué casi todo se resuelve solo)

La arquitectura del proyecto es **"crudo + tag adentro, normalizado afuera"**: cada prop guarda
`precio_usd` (el billete, el precio real que pide el vendedor) + `tipo_cambio_detectado` (el tag). **La
normalización NO se guarda — se calcula al leer** (`precio_normalizado()` es una función, no una columna;
`precio_usd_actualizado` está deprecado). Consecuencia: cambiar el régimen de TC = cambiar la FUNCIÓN,
y toda la data se re-muestra sola sobre el mismo crudo. No se "reconvierte al revés" nada.

## 🔴 La ÚNICA decisión irreversible: archivar la vieja, NO volarla

- **Archivar** = dejar de escribir en `propiedades_v2` (n8n se apaga, el híbrido pasa a ser la base),
  pero **conservar la tabla**. Preserva el billete crudo de TODA la historia (2.281 props con crudo+tag).
- **Volar** = borrarla. Se pierde para siempre el crudo histórico → sin material para reconstruir la
  serie de precios/yields. **Irreversible.**
- **Recomendación: archivar.** Es casi gratis (una tabla que no se toca) y deja todas las puertas
  abiertas. Volar es la única jugada sin retorno de todo el cutover.

## Cutover Equipetrol-PRIMERO: plan de acción (objetivo del founder)

Meta: **poner deptos-venta Equipetrol en prod primero**, sin romper el resto, y después adaptar el
híbrido a las otras zonas con las mejoras ya hechas. Transición eficiente.

### La clave que lo hace fácil: n8n NO es todo-o-nada
n8n tiene workflows separados (deptos-venta, alquiler, casas, por zona). El cutover de Equipetrol
**apaga SOLO el workflow de deptos-venta Equipetrol**. Todo lo demás (ZN, casas, alquiler) **sigue con
n8n, intacto**. No hay conflicto de captura; ZN no se toca.

### Los DOS bloqueos reales
1. **Captura diaria automática de Equipetrol** (= "me faltan los snapshots/mercado diarios"). Para que la
   absorción de Equipetrol no se corte al apagar su workflow n8n, el híbrido tiene que capturar cada noche
   **solo**. Hoy corre a mano → pre-requisito duro. Ver §Automatización.
2. **La normalización es GLOBAL.** `precio_normalizado()` la usan feed + snapshots + estudios para TODAS las
   zonas → no se cambia solo para Equipetrol sin tocar ZN. Dos caminos:
   - **Simple (recomendado):** aceptar el TC nuevo **para todo** (Equipetrol + ZN), un solo swap. ZN también
     baja ~34% (correcto: es el precio real). Requiere **auditar el crudo de ZN** (cazar sucios de v16.5).
   - **Complejo:** aislar Equipetrol con su propia función; ZN sigue con la vieja. Dos regímenes conviviendo.

### Las 4 fases
1. **Motor automático** (desbloquea la captura diaria): construir `reader-api` → medir modelos baratos
   contra el ground truth → montar routine + proxy → probar el ciclo end-to-end.
2. **Normalización + consumidores (Paquete TC):** auditar el crudo de ZN → swappear `precio_normalizado()`
   + re-apuntar snapshots/vistas/estudios a la data híbrida.
3. **Switch de Equipetrol:** feed público + snapshots de Equipetrol leen la data híbrida (absorción sin
   corte; precios con el escalón declarado) → apagar SOLO el workflow deptos-venta Equipetrol en n8n.
4. **Después:** adaptar el híbrido a ZN (mismo patrón shadow) + apagar su workflow, zona por zona.

## ⚠️ Zona Norte NO tiene shadow — está en prod (dark launch) con el pipeline VIEJO
**Aclaración (verificado 17-jul): ZN NO tiene un shadow aislado.** Confusión frecuente: shadow ≠ dark launch.
- **Shadow** (Equipetrol): tabla aislada `propiedades_v2_shadow` + función `precio_normalizado_shadow` → laboratorio, no toca prod.
- **Dark launch** (ZN + casas): la data está **en PROD** (`propiedades_v2`), con la función **vieja global**;
  los feeds `/zona-norte/*` y `/ventas/casas` solo están **ocultos** (noindex). Estar ocultos NO los aísla.
- En `propiedades_v2_shadow`: ZN = **1 sola** prop suelta; casas = **0**. El shadow es ~100% Equipetrol.

**Inventario ZN en PROD (con la regla vieja):**
- **Deptos ZN: ~554+ activos** (14 microzonas: anillos Banzer/Radial 26/La Salle/Alemana), scraper **n8n `v16.5`
  (256) + `1.9`/`null`**.
- **Casas ZN: ~103 activas en el feed** (`v_mercado_casas`, verificado 19-jul; mig 262). ⚠️ El bruto de la vista es ~298 — el swap global de TC toca TODAS las filas casa de ZN (activas o no), no solo el feed.
- Total del FEED ~**650 props ZN** en v16.5. ⚠️ El **alcance de la auditoría de crudo** (antes del swap) es MAYOR: el bruto de deptos+casas ZN que la función re-normaliza. Defectos del enfoque viejo: TC inflado, matching flojo, sin campos v4.2.

**Qué pasa con esta data:**
- **No se borra ni queda colgada:** el híbrido, al expandirse a ZN, la **re-lee y corrige fila por fila** (como
  Equipetrol). `propiedades_v2` es la misma tabla; cada fila se mejora cuando el híbrido la re-mira.
- **🔴 El Paquete TC (swap de `precio_normalizado()`) toca TODA `propiedades_v2` — deptos ZN Y casas ZN.**
  `v_mercado_casas` usa `precio_normalizado()` (mig 262, líneas 69-70) → el swap recalcula también las casas ZN.
  El dark-launch NO protege (la función es global). Si swapeás antes de re-procesar ZN, TODAS las props ZN v16.5
  (crudo sin auditar) se re-normalizan con la lógica nueva → **riesgo de des-normalizar mal** (feed ~650; el
  BRUTO que la función toca es mayor — dimensionar sobre el bruto).
- **Antes del swap global:** (a) **auditar el crudo de ZN** (deptos + casas) como en Equipetrol, o (b) **migrar
  ZN por shadow** primero (más limpio, más lento).

## Automatización (pre-requisito de apagar n8n) — hallazgos 17-jul
Hoy el híbrido corre **a mano, en sesión bajo Max** (subagentes-lectores). Para reemplazar el MOTOR de n8n
(captura diaria automática) faltan 3 ladrillos:
1. **`reader-api.mjs`** (hoy stub): el MOAT llamando a un LLM por API con el READER_SPEC como system-prompt,
   en un loop (sin subagentes — su viabilidad en routine cloud no está documentada). Desacopla el modelo.
2. **Fetch sin bloqueo desde la nube:** **proxy residencial ROTATIVO** (IPRoyal ~$1,75-7/GB, tráfico no
   expira; Decodo/BrightData más caros). Solo rota IP — el bajar+parsear ya lo hace el híbrido → mucho más
   barato que Firecrawl (que cobra por página). Se enchufa en `fetchRetry` (una capa; ya hay `lib/firecrawl.mjs`
   de precedente). Tráfico liviano: **las fotos NO se descargan** (solo se guarda la URL → hotlinking del CDN
   del portal, $0 storage/bandwidth; riesgo: fotos rotas si el portal las borra). Estimación Equipetrol
   ~1,5 GB/mes ≈ pocos dólares (MEDIR bytes reales en una corrida).
3. **Routine cloud de Claude Code:** corre en la nube (sin tu compu), **bajo tu suscripción Max, NO API**
   (draws down subscription usage). Consume cuota; hay tope diario. **Modelo elegible** (recomendado barato).
- **Costo del LLM (medido hoy, 69 anuncios, Opus):** ~667k tokens = **~10k tokens/anuncio**. En $: **~$14 con
  Opus por API (no escala) vs ~$0,25 con modelo barato** (DeepSeek/GLM/Qwen). **Opus quema demasiada cuota/plata
  a escala → el camino es reader-api + modelo barato medido contra el ground truth.** Haiku ya se probó y no
  alcanzó; con el spec v4.2 (más complejo) daría peor.
- **Escala (ciudad → Bolivia):** Max NO escala (cuota). A ese volumen: API + modelo barato + proxy bulk. El
  presupuesto = (requests × $/GB proxy) + (anuncios × $/anuncio LLM), lineal con el volumen.

## Qué pasa con cada activo de data

### 1. Inventario de props → se recupera solo (re-normaliza hacia adelante, NO al revés)
El feed shadow YA es la base limpia. La historia de props vive en la vieja archivada, con su billete.
Al swappear `precio_normalizado()` a la versión nueva, cualquier consumidor re-muestra el crudo viejo
en el régimen nuevo. Las `paralelo` bajan ~34% (se les saca el inflado ×~1.5); las `oficial`/`no_esp`
quedan igual. **Trabajo real:** auditar los casos de crudo sucio (bug histórico `tc=paralelo` +
`precio_usd`=oficial inflado → ver memoria `project_bug_tc_flag_paralelo_historico`). Es un subconjunto.

### 2. Snapshots → NO funcionan solos (esto es lo que hay que tocar)
`snapshot_absorcion_mercado.sql` tiene DOS dependencias clavadas a prod:
1. **Lee `FROM propiedades_v2`** directo (la tabla, no una vista intercambiable).
2. **Calcula con `precio_normalizado()`** — la función vieja, que infla el paralelo.

Al poner shadow como base hay que:
- **Re-apuntar la fuente** a shadow (o migrar los datos de shadow a `propiedades_v2`).
- **Swappear `precio_normalizado()`** a la versión nueva. Si NO → el snapshot le re-infla el precio a
  la data limpia de shadow (arruina justo lo que se mejoró).

Esto es el **"Paquete TC"**: función + snapshots + vistas + estudios JS van TODOS JUNTOS al cutover
(los 4 lugares que consumen la normalización). No es difícil, pero **no es automático**.

### 3. Series históricas → dos destinos MUY distintos
- **Absorción / conteos** (activas, absorbidas, nuevas, meses de inventario): **inmunes al TC** →
  continúan sin cortes. Es la parte más valiosa para proyectar y no se pierde.
- **Precios / $/m² / yields**: quedan en "dólares viejos" (inflados). Los snapshots viejos NO se
  recalculan solos (son valores guardados). → **escalón en el cutover**.
  - Recompute EXACTO de la serie vieja = difícil: el snapshot promedió el inventario ACTIVO de cada
    día pasado, y no se puede reconstruir con precisión qué props estaban activas cada fecha
    (`fecha_discovery` se pisa cada noche, regla 11).
    Para una serie de TENDENCIA alcanza; para niveles exactos no.
  - Opción honesta (recomendada): **absorción continua** + **precios con corte declarado** en el
    cutover (mismo patrón que las `filter_version` v1/v2/v3 que ya existen). Cero fabricación.

## Mejoras del snapshot que shadow HABILITA (además del re-apuntado)

Ya que se toca el snapshot para re-apuntarlo, conviene aprovechar la data más rica y limpia de shadow.

**A) Calidad del número (misma métrica, menos ruido) — prioridad, sirve al yield:**
- **Dedup → mediana limpia:** hoy 15 Santorini idénticos sesgan la mediana; con los apart-hoteles
  marcados (`duplicado_de`), la mediana refleja edificios reales.
- **Crudo limpio → percentiles reales** (menos precios corruptos/inflados por bugs viejos).
- **Absorción más real:** el verificador de shadow da baja por 2 señales (HTTP + ausencia), no por
  `fecha_discovery` pisada.

**B) Cortes nuevos (métrica nueva) — de acá para adelante, NO retroactivo:**
- amoblado/equipado real, estado honesto (preventa vs entrega sin el `entrega_inmediata` inventado),
  piso, parqueo, expensas. La vieja no tenía estos campos → la serie rica arranca en el cutover.

**C) Deuda estructural a saldar en el mismo movimiento:**
- Que el snapshot lea de una **vista** (`v_mercado_venta_shadow`), no de la tabla directa → un solo
  lugar donde vive el filtro de calidad.
- Consolidar los filtros de calidad (hoy duplicados en la función Y en las vistas → se desincronizan;
  origen del ticket #15 de contaminación ZN).

## Métricas para analista de inversión — qué sale y qué no

Objetivo del founder: pasar de "ver el mercado" a **yields y proyecciones**. Cada métrica lleva su
etiqueta de origen (la matriz fiduciaria ya existe, ver abajo).

| Métrica | Estado con la data de shadow |
|---|---|
| $/m² por zona × tipología | ✅ directo (precio de LISTA) |
| Absorción / meses de inventario | ✅ directo (con caveat: salida de listado ≠ venta) |
| **Tendencia** ($/m² y absorción mes a mes) | ✅ desde la serie continua post-cutover |
| **Spread preventa vs terminado** | ✅ estado honesto + precio (la jugada clásica del inversor) |
| **Days-on-market** (tiempo hasta salir) | ✅ `fecha_publicacion` + baja del verificador |
| **Concentración** (cuánto de una zona es 1 edificio/captador) | ✅ matching a edificio + captador |
| Yield **bruto** (alquiler ÷ venta) | ✅ directo |
| Yield **neto** / punto de equilibrio | 🟡 solo con SUPUESTO de expensas — el monto casi no está en el origen (los portales no lo publican; ver Apéndice). NO es carencia nuestra. |
| Precio de **cierre** real | 🔴 no capturamos transacciones (viven en Derechos Reales) |
| Rentabilidad **realizada** (a cuánto se revendió) | 🔴 solo vemos oferta, no cierres |

## Límites fiduciarios heredados (YA son doctrina — no se re-inventan)

Las dos limitaciones que el founder señaló ya están escritas y se heredan tal cual:
- **Precio = oferta, no cierre** (`docs/canonical/LIMITES_DATA_FIDUCIARIA.md`): "el vendedor puede
  cerrar 5-15% por debajo del publicado" → declarar "Precio de publicación. El de cierre puede diferir".
- **Absorción ≠ venta** (`docs/canonical/ABSORCION_LIMITACIONES.md`): la salida del listado puede ser
  "vendida, retirada por el broker, listing expirado, o error del portal". Nunca "meses de inventario"
  como predicción; "rotación observada", no "predicha".

Todo lo que se mide es el **mercado de OFERTA** (lo que se pide y por cuánto tiempo se lista), no el de
TRANSACCIONES. Es estructural en cualquier dato de portal. **El MOAT no es tener más números — es ser
el único que dice con honestidad qué es cada número** (oferta / observado / estimado, nunca disfrazado
de cierre). Matriz verde/amarillo/rojo en `LIMITES_DATA_FIDUCIARIA.md`.

## Frontend + backend: código YA consolidado en main (✅ PR #22, 18-jul-2026)

> **Actualización 18-jul:** las dos ramas (backend híbrido + frontend `desktop-fase-2`) **ya se mergearon a `main`**
> (PR #22, merge commit `66e055e`). Lo que sigue del cutover es OPERATIVO (Paquete TC, motor automático, apagar
> n8n), **NO** el merge de ramas. Renumerar migs 268/276 sigue pendiente (paso de cutover). Detalle histórico abajo:

El cutover no es solo data — fue **código en dos ramas separadas que se consolidaron** (ya hecho):
- **Backend shadow** → rama `claude/hybrid-worktree-structure-3b7b53` (esta): discovery, reader, cargador,
  audits, migraciones shadow, la data. Traía el endpoint `/api/ventas-shadow.ts` (**retirado en la integración** →
  el frontend integró shadow en `/api/ventas`; el merge de `buscar_extras_shadow` sobrevive ahí — NO dropear, ver `CONTRATO_FRONTEND_SHADOW.md`).
- **Frontend consolidado** → rama `feat/desktop-fase-2` (**ya en main vía PR #22**): tiene TODO
  el frontend — rediseño desktop + mobile + shortlist + feeds que leen shadow (`?shadow=1`, en `/api/ventas.ts`
  + `/api/alquileres.ts`). **Ya mergeó `claude/session-context-e0ffd1`** (que era solo la fuente) + 5 commits
  encima (pet friendly chip, preview shadow en `/b/hash`, sheet rico, chip fiduciario, rediseño mobile shortlist).
  Al merge a main va **`desktop-fase-2`** — session-context ya está adentro, NO mergear las dos por separado.

**La DATA ya está unida** (una sola `propiedades_v2_shadow` en Supabase; los dos worktrees le hablan a la
misma tabla → en dev ya conviven). **Lo que falta unir es el CÓDIGO.** Puntos:
- ✅ **RECONCILIADO en la integración:** el backend (`hybrid`) traía el endpoint separado `/api/ventas-shadow.ts`;
  el frontend (`desktop-fase-2`) integra shadow en `/api/ventas.ts` + `/api/alquileres.ts` con `?shadow=1`.
  Ganó la forma integrada del frontend; `ventas-shadow.ts` se retiró (dead code).
- Hoy el front shadow es **dark-launch a propósito**: `?shadow=1` / endpoint que da 404 en prod. El público
  no lo ve. Al cutover, el feed PÚBLICO (`/ventas`, `/alquileres`) pasa a leer la data del híbrido.
- **No aplicar el front nuevo antes que el backend**: son dos mitades de la misma decisión. Se activan JUNTOS
  (frontend + backend + Paquete TC), no por separado.
- ✅ **Consolidado (PR #22):** las dos ramas se mergearon a main. Conflictos resueltos (`CLAUDE.md`,
  `MIGRATION_INDEX.md`, `ventas.tsx`→gana el frontend). **Renumerar migs 268/276 sigue PENDIENTE** (paso de cutover).

### Consumidores: el FEED lee prod por default; las SHORTLISTS leen SHADOW-first (decidido 19-jul)
> ✅ **Decisión del founder (19-jul): se deja como está.** Son dos comportamientos DISTINTOS y deliberados:
> - **Feed** (`/ventas`, `/alquileres`): **PROD** por default; `?shadow=1` es opt-in (modo prueba).
> - **Shortlists `/b/[hash]`**: **SHADOW-first** siempre (`rpcShadowFirst` en `b/[hash].tsx` + vista `_shadow` en
>   `shortlist-market.ts`), con fallback a prod. Los links que circulan por WhatsApp ya muestran la data nueva
>   (precio ~34% menor = el correcto). Verificado en código 19-jul; el founder lo aceptó explícitamente.
>
> **Consecuencia para el cutover (importante): las shortlists NO hay que tocarlas.** Ya leen la data nueva, y
> cuando prod pase a ser igual a shadow el fallback lo resuelve solo. El ítem del checklist "quitar `?shadow=1`
> en shortlists" **NO aplica** (no tienen ese toggle). Lo único que hay que switchear al cutover es el **FEED**.

El modelo es: los consumidores leen **prod**; `?shadow=1` es solo el modo de PRUEBA para ver la data híbrida
antes del cutover. El cutover **migra la data buena a prod** — NO apunta los consumidores a shadow. Consumidores
con toggle hoy:
- **Feed** `/ventas` `/alquileres` (`?shadow=1`).
- **Shortlists** `/b/hash` (`?shadow=1`, decisión 17-jul opción 1): los links reales que circulan por WhatsApp
  siguen en prod (el cliente ve lo que vio); `?shadow=1` es para validar el espejo completo. 
Al cutover: **quitar / volver default los `?shadow=1` en TODOS** (feed + shortlists) — no olvidar ninguno.
- 🔴 **Las shortlists dependen de `buscar_extras_shadow`** para las secciones "lo que la hace especial"
  (amenidades_extra) + amoblado en VENTA (la RPC principal de venta mig 277 NO los expone). Al cutover, cuando
  las shortlists lean prod con data nueva, ese helper (o su equivalente en prod) **tiene que existir** o esas
  secciones salen vacías. Refuerza: **NO dropear `buscar_extras_shadow`** (ver `CONTRATO_FRONTEND_SHADOW.md`).
- **Escalón de precio en links de shortlist: YA OCURRIÓ** (desde el deploy del PR #22 las shortlists leen
  shadow-first) → los links de WhatsApp **ya muestran** el precio nuevo (~34% menos). **NO hay un segundo escalón
  al cutover para shortlists.** El escalón que SÍ queda pendiente es el del **FEED público**, que hoy sigue en prod.

## Checklist de cutover de DATA (para EJECUTAR cuando el founder decida — no ahora)

0. [ ] **Motor automático (pre-requisito de apagar n8n):** `reader-api` + medir modelo barato vs ground
       truth + routine cloud + proxy rotativo. Sin captura diaria automática, la absorción de Equipetrol se
       corta al apagar su workflow. Ver §Automatización.
1. [ ] **Archivar** `propiedades_v2` (NO borrar — respaldo del crudo histórico). Apagar **solo el workflow
       deptos-venta Equipetrol** en n8n (ZN/casas/alquiler siguen). El shadow de Equipetrol pasa a base.
2. [ ] **Paquete TC junto:** swappear `precio_normalizado()` a la versión nueva + re-apuntar snapshots,
       vistas y estudios JS a la fuente híbrida, todo en el mismo movimiento. **Toca TODA `propiedades_v2`,
       incluida ZN v16.5** → ver ítem 3. **+ reescribir los docs canónicos de TC** que hoy describen el régimen
       VIEJO como correcto (`docs/arquitectura/TIPO_CAMBIO_SICI.md` —su header lo auto-exige antes de tocar la
       función—, `docs/canonical/ABSORCION_LIMITACIONES.md`, `LIMITES_DATA_FIDUCIARIA.md`).
2b.[✅ HECHO — PR #22 (18-jul); SOLO RESTA renumerar migs 268/276] **Consolidar las 2 ramas (frontend + backend)** — reconciliar `feat/desktop-fase-2` (frontend
       consolidado: desktop+mobile+shortlist, feeds `?shadow=1`; ya mergeó session-context) con esta (`hybrid`,
       backend + `/api/ventas-shadow` [retirado en la integración]). Divergencia del front shadow ✅ RECONCILIADA (gana `/api/ventas`); resolver conflictos de
       `CLAUDE.md`/`MIGRATION_INDEX.md`/`ventas.tsx` y renumerar migs: **268 duplicada** (main×híbrido) Y
       **276 duplicada** (híbrido×frontend: `276_shadow_alquiler_rpc_campos_frontend` vs `276_buscar_extras_prod`).
       Renumerar es cosmético (las migs ya están aplicadas; la BD no trackea el filename). Apuntar el feed
       PÚBLICO a la data del híbrido. **Frontend y backend se
       activan JUNTOS, no por separado.**
3. [ ] **Auditar crudo sucio** (props `tc=paralelo` con `precio_usd`=oficial inflado) antes de confiar
       en el re-normalizado automático — **en Equipetrol Y en TODAS las props ZN v16.5 que el swap global toca**
       (feed activo ~650; pero el BRUTO de deptos+casas ZN es mayor — casas: feed ~103 vs bruto ~298 → dimensionar
       la auditoría sobre el bruto, no el feed). Alternativa: migrar ZN por shadow antes.
4. [ ] **Mejoras del snapshot** (mismo movimiento): leer de vista + dedup + absorción por 2 señales.
5. [ ] **Serie de precios/yields:** decidir corte declarado (recomendado) vs recompute aproximado.
6. [ ] **Métricas de inversión** nuevas: cada una con su etiqueta de la matriz fiduciaria.
7. [ ] Cortes ricos nuevos (amoblado/estado/piso) → pueden esperar, se agregan después sin rehacer.

## Apéndice — datos verificados 17-jul-2026 (con qué material se cuenta)

- **Serie v3 (limpia):** 14-abr → 17-jul = **94 días**, diaria, continua (4.963 filas). Recién cruzó
  los 90 días = piso mínimo para hablar de absorción con menos caveats.
- **Serie total** (v1+v2+v3): desde 12-feb (5.692 filas). Snapshots corren a diario, vivos hasta hoy.
- **Props venta en la vieja:** 2.377 · con crudo+tag **2.281 (96%)** · tag `paralelo` (las que cambian
  de número) **1.499** · con `fecha_publicacion` 2.376 → material intacto para recomputar.
- **Expensas (el monto casi no existe en el origen):** venta 11/458 · alquiler monto 3/184, pero
  **flag "incluidas o no" 96/184 (52%)** → señal CUALITATIVA (ajusta comparación), no monto para restar.
- Snapshot lee `FROM propiedades_v2` + `precio_normalizado()` (`sql/functions/snapshots/snapshot_absorcion_mercado.sql`).

Contexto: `TC_NUEVO_DECISION.md` · `AUDITORIAS_POST_CUTOVER.md` · `docs/arquitectura/TIPO_CAMBIO_SICI.md`
· `docs/canonical/{ABSORCION_LIMITACIONES,LIMITES_DATA_FIDUCIARIA}.md` · memoria `project_checkpoint_deptos_hibrido`.
