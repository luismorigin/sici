# /cron-deptos — Captura híbrida de deptos Equipetrol → SHADOW (bajo Max, $0)

> **Fuente de verdad** de este comando. Copiar a `.claude/commands/cron-deptos.md` para usarlo
> como `/cron-deptos` (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Qué es:** corre el ciclo híbrido de deptos-venta Equipetrol COMPLETO dentro de la sesión —
> discovery propio → lectura (MOAT) → apply → feed — contra el **entorno SHADOW aislado**
> (`propiedades_v2_shadow`). **PROD (n8n) queda intacto.** El único paso que necesita "modelo"
> (el MOAT = leer el anuncio y dictar precio/TC/dorms/nombre/gate) lo hacen **subagentes-lectores en
> paralelo** (patrón `/audit-cola-matching`) → **$0, bajo Max, sin API, sin servidor**.
>
> **Opción A (corrido con cola al final):** el comando encadena los pasos de una y termina imprimiendo
> la cola de excepciones (PM_NUEVO, ambiguos, sin-match). NO se aprueba depto por depto: el juez
> dictamina, y el humano solo resuelve los dudosos que quedan al final.
>
> **Gemelo:** `/cron-casas` (mismo patrón, para casas ZN a prod). Diseño y decisiones:
> `SESION_READER_DISCOVERY.md`, `ESTADO_MIGRACION.md`, `READER_SPEC.md`, `TC_NUEVO_DECISION.md` +
> memoria `project_checkpoint_deptos_hibrido`.

## Alcance de HOY (incremento 1 — EXISTENTES)

Este comando procesa las **existentes** (deptos ya en `propiedades_v2` que el híbrido RE-lee para
corregir precio/TC/matching y llevarlos a shadow con el régimen TC nuevo). Es la mayor parte del
inventario que rota. Las **nuevas** (en el portal, aún no en prod) quedan para el **incremento 2**
(ver §Pendientes) porque requieren asignarles `id` en shadow — decisión de diseño propia.

## Pasos (ejecutá en orden, todo desde `scripts/deptos-equipetrol/`)

> Primera vez en una máquina nueva: `cd scripts/deptos-equipetrol && npm install`.

### 1. Discovery + diff (read-only, no escribe)
```
node discovery-deptos.mjs
```
Sale a C21 + Remax (tipo=departamento, red ancha Equipetrol), filtra por `get_zona_by_gps` ∈ las 6
microzonas, y diffea contra `propiedades_v2`. Mirá el resumen: **NUEVAS**, **existentes**,
**desaparecidas**. Escribe `output/discovery-deptos-<ts>.json`.
- Si el circuit breaker (🛑) se dispara → **no insistas**, la IP está bloqueada, esperá unas horas.
- Cooldown de 20 min entre corridas (`--force` para saltarlo, con criterio).

### 2. Prep — material de lectura de las EXISTENTES (read-only, $0)
```
node cargar-deptos-shadow.mjs --prep 40
```
Fetchea el detalle ($0) de hasta N existentes **frescas** (excluye las ya en shadow + las rechazadas)
y arma `output/material-<ts>.json` con `veredicto: null` por depto. N agnóstico a la fuente (drena
C21 y Remax parejo). Para re-leer ids puntuales: `--prep --ids 3521,3540,...`.
- El material trae: slug, título, descripción, señales estructuradas (precio/TC/dorms/baños/piso/área),
  la lectura de n8n para contrastar, `tasa_paralelo` del lote (Binance) y candidatos de matching.

### 3. MOAT — lectura por subagentes-lectores (el juez; lo hacés VOS con subagentes)
Dividí las entradas del `material-<ts>.json` en chunks de ~10 y lanzá **N subagentes en paralelo**
(patrón `/audit-cola-matching`). Cada subagente recibe su chunk + lee **`READER_SPEC.md`** y devuelve
el `veredicto` de cada depto. Mergeá los veredictos de vuelta al `material-<ts>.json`.

Cada `veredicto` sigue el schema de `READER_SPEC.md`. Lo esencial:
- **gate**: `aceptar` | `rechazar` (+ `razon_gate`). Rechazar = multiproyecto, anticrético, baulera,
  parqueo, o precio irrecuperablemente contradictorio. Es lo más importante — un error acá mete basura.
- **precio_usd** (CRUDO, la descripción manda) + **tipo_cambio_detectado**:
  - `oficial_viejo` → texto ancla EXPLÍCITO a "6.96" / "Bs 7" / "TC 7" (se coticó al rate viejo barato).
  - `bob` → C21 en bolivianos sin precio USD en el texto (`precio_usd` = monto BOB, se normaliza LIVE).
  - `paralelo` / `oficial` / `no_especificado` → **default** (oficial-nuevo ≈ paralelo; USD directo).
  - Regla: elegí el TC que deje $/m² coherente (~$1.700–2.200); ver memoria `feedback_clasificacion_tc_por_m2`.
- **dormitorios** (0 = monoambiente), **banos**, **piso**, **nombre_edificio_canonico** (o `null` si
  el aviso no lo da — NUNCA forzar por GPS), **amenidades/amenidades_extra/equipamiento**, **amoblado**,
  **es_multiproyecto** (taguea, no rechaza).

> La normalización shadow ya entiende `bob`/`oficial_viejo`/default (`precio_normalizado_shadow`) — el
> lector solo emite el tag + el crudo; el feed traduce en vivo. No pre-normalizar.

### 4. Apply — escribe la fila correcta a shadow (muta SOLO `propiedades_v2_shadow`)
```
node cargar-deptos-shadow.mjs --apply output/material-<ts>.json
```
Arma la fila de una (estructurado + veredicto), resuelve el match **name-first** (`matcher.mjs`:
score≥0.95+zona → AUTO; ambiguo/débil → sin match, lo levanta el audit; nunca fuerza por GPS), protege
`fecha_publicacion` con LEAST (anti re-scrape/bump), y upsertea. Rechazados → memoria en `rechazados.json`.
Imprime: **X escritos**, rechazados por gate, reporte por depto (precio/TC/dorms/pm), **alias sugeridos**
y **con-nombre-sin-auto-match** (= la cola de excepciones).

### 5. Verificar el feed shadow (que la data rica renderice)
Levantá el dev y mirá `localhost:3000/ventas?shadow=1` (hard-reload si ves prod por el SSG):
```
npm run dev --prefix ../../simon-mvp        # o preview_start simon-mvp-dev
```
Verificá con **Playwright** (mejor que el preview Chrome headless para este feed): precios del régimen
nuevo (paralelo a valor de cara, `oficial_viejo` descontado, `bob` live), equipamiento canónico + extra,
amoblado/equipado. Alternativa $0 sin browser: comparar por SQL `buscar_unidades_simple_shadow` vs prod.

### 6. Reportar + log
Reportá al usuario: cuántos escritos/rechazados/retenidos, las correcciones notables vs n8n (precio
corrupto cazado, TC re-clasificado, match recuperado), y **la cola de excepciones** (PM_NUEVO a crear,
ambiguos, sin-match). Registrá una línea en `output/cron-deptos-log.md` (fecha + números).

## Reglas

- **SHADOW, prod intacto.** El `--apply` solo muta `propiedades_v2_shadow` (service_role). A prod: solo
  SELECT + RPC read-only (`buscar_proyecto_fuzzy`). Los alias sugeridos se REGISTRAN, no se escriben a
  `proyectos_master`. **El cutover a prod (híbrido escribe `propiedades_v2` real / n8n se apaga) es una
  decisión APARTE, irreversible, SIEMPRE con OK explícito del founder** — este comando no lo hace.
- **$0 bajo Max.** El MOAT son subagentes en la sesión, sin API. `reader-api.mjs` (stub) es el camino
  futuro para automatizarlo por API (mismo `READER_SPEC.md` como system-prompt).
- **El juez manda, no el script.** El `.mjs` filtra/fetchea/matchea; el VEREDICTO (precio/TC/gate) lo
  dan los subagentes-lectores. NUNCA dejar que el estructurado decida solo — ahí está el valor.
- **Anti-bloqueo de IP (`fetcher.mjs`):** cooldown 20 min + circuit breaker (aborta a los 5 fallos) +
  jitter + backoff. Si ves el 🛑: no insistas, esperá unas horas; para re-procesar usá el material ya
  generado, no re-crawlees.
- **TC nuevo** (unificación oficial≈paralelo): congelado en `TC_NUEVO_DECISION.md`. Principio de
  arquitectura: **normalización = frontera de acceso** — crudo+tag adentro, normalizado afuera. El
  paquete TC completo va JUNTO a prod al cutover.

## Pendientes / incrementos futuros

- **🔴 Incremento 2 — empalme de NUEVAS.** Las nuevas del discovery (portal, no en prod) necesitan:
  (a) fetchear su detalle desde la URL del portal (como `cron-casas-zn.mjs`, NO por id de prod);
  (b) **asignar `id` en shadow** (hoy shadow usa el id real de prod, que las nuevas no tienen — decidir:
  secuencia propia negativa/alta, o id real al cutover). Extiende `cargar-deptos-shadow.mjs` con
  `--nuevas <discovery-json>`. Es lo que hace que el comando CAPTURE inventario nuevo, no solo re-lea.
- **🔴 Incremento 3 — verificador integrado.** Correr un verificador (modelo `../casas-zn/verificador-casas.mjs`,
  adaptado a `propiedades_v2_shadow` + las `desaparecidas` del discovery) → confirmar bajas por HTTP
  (C21 4xx / Remax redirect) con gracia 2d y disyuntor >40%.
- **Candados** (solo para comparación shadow-vs-prod limpia): sembrar `campos_bloqueados` prod→shadow.
  Para solo cargar/enriquecer NO hace falta. Ver `ESTADO_MIGRACION.md` §Frenos.
- **Repoblar el inventario COMPLETO** con el lector nuevo (los ~19 en shadow son muestra; el discovery
  ve ~423 en zona).
- **Empaquetar el orquestador** (`cron-deptos-equipetrol.mjs`) que encadene los pasos determinísticos
  (discovery + prep) en un solo `.mjs` — hoy este `.command.md` es el orquestador (el agente ejecuta).
- Contexto: `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md` (visión) + memoria `project_checkpoint_deptos_hibrido`.
