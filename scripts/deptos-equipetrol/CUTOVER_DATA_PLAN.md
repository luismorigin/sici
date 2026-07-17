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

## Frontend + backend: dos mitades del cutover, en dos ramas distintas

El cutover no es solo data — es **código en dos ramas separadas que hay que consolidar**:
- **Backend shadow** → rama `claude/hybrid-worktree-structure-3b7b53` (esta): discovery, reader, cargador,
  audits, migraciones shadow, la data. Incluye el endpoint `/api/ventas-shadow.ts` (con el merge de
  `buscar_extras_shadow` — NO dropear, ver `CONTRATO_FRONTEND_SHADOW.md`).
- **Frontend shadow** → rama `claude/session-context-e0ffd1` (otro worktree, ~65 commits sin push): el
  rediseño (modal claro / desktop) + los feeds que leen shadow con toggle `?shadow=1` (integrado en
  `/api/ventas.ts` + `/api/alquileres.ts`, no en un endpoint aparte).

**La DATA ya está unida** (una sola `propiedades_v2_shadow` en Supabase; los dos worktrees le hablan a la
misma tabla → en dev ya conviven). **Lo que falta unir es el CÓDIGO.** Puntos:
- Las dos ramas **divergieron en cómo implementan el frontend shadow** (endpoint separado en hybrid vs
  integrado con `?shadow=1` en session-context) → hay que **reconciliar**, no mergear a ciegas.
- Hoy el front shadow es **dark-launch a propósito**: `?shadow=1` / endpoint que da 404 en prod. El público
  no lo ve. Al cutover, el feed PÚBLICO (`/ventas`, `/alquileres`) pasa a leer la data del híbrido.
- **No aplicar el front nuevo antes que el backend**: son dos mitades de la misma decisión. Se activan JUNTOS
  (frontend + backend + Paquete TC), no por separado.
- Ambas ramas están **sin push** → consolidar implica merge (con conflictos esperables en `CLAUDE.md` y en
  la numeración de migraciones — ver checklist).

## Checklist de cutover de DATA (para EJECUTAR cuando el founder decida — no ahora)

1. [ ] **Archivar** `propiedades_v2` (apagar n8n, NO borrar). Shadow pasa a base.
2. [ ] **Paquete TC junto:** swappear `precio_normalizado()` a la versión nueva + re-apuntar snapshots,
       vistas y estudios JS a la fuente shadow, todo en el mismo movimiento.
2b.[ ] **Consolidar las 2 ramas (frontend + backend)** — reconciliar `session-context-e0ffd1` (front, feeds
       `?shadow=1`) con esta (`hybrid`, backend + `/api/ventas-shadow`). Resolver la divergencia del front
       shadow + conflictos de `CLAUDE.md` y renumerar migs (268 duplicada). Apuntar el feed PÚBLICO a la data
       del híbrido. **Frontend y backend se activan JUNTOS, no por separado.**
3. [ ] **Auditar crudo sucio** (props `tc=paralelo` con `precio_usd`=oficial inflado) antes de confiar
       en el re-normalizado automático.
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
