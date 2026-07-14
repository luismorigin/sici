# /cron-deptos-alquiler — Captura híbrida de deptos ALQUILER Equipetrol → SHADOW (bajo Max, gratis)

> **Fuente de verdad** de este comando. Copiar a `.claude/commands/cron-deptos-alquiler.md` para usarlo
> como `/cron-deptos-alquiler` (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Qué es:** corre el ciclo híbrido de deptos-ALQUILER Equipetrol COMPLETO dentro de la sesión —
> discovery propio → lectura (MOAT) → apply → **verificador** → feed — contra el **entorno SHADOW aislado**
> (`propiedades_v2_shadow`, `tipo_operacion='alquiler'`). **PROD (n8n) queda intacto.** El MOAT (leer el
> anuncio y dictar precio/TC/dorms/nombre/gate/condiciones) lo hacen **subagentes-lectores en paralelo**
> (patrón `/audit-cola-matching`) → **gratis, bajo Max, sin API, sin servidor**.
>
> **Gemelo:** `/cron-deptos` (venta). **Este comando lo MEJORA:** incluye el paso **verificador** (baja de
> desaparecidos) que a `/cron-deptos` le falta (su Incremento 3). El `verificador-alquiler.mjs` es el molde
> para agregárselo a venta después.
>
> **Distinto de venta (lo propio de alquiler):** precio MENSUAL Bs-first (crudo+tag, NUNCA `precio_usd`);
> gate INVERSO (rechaza venta/anticrético colados); condiciones (expensas/depósito/contrato/amoblado/equipado/
> mascotas/uso). Contrato del lector: **`READER_SPEC_ALQUILER.md` (v2)**. Base SQL: migs 274/275
> (`precio_normalizado_alquiler`, `v_mercado_alquiler_shadow`, `buscar_unidades_alquiler_shadow`).

## Pasos (ejecutá en orden, todo desde `scripts/deptos-equipetrol/`)

> Primera vez en una máquina nueva: `cd scripts/deptos-equipetrol && npm install`.

### 1. Discovery + diff (read-only, no escribe)
```
node discovery-alquiler.mjs
```
Sale a C21 (operacion=renta) + Remax (operacion=alquiler, EXCLUYE anticrético), filtra por `get_zona_by_gps`
∈ las 6 microzonas, y diffea contra `propiedades_v2` (SOLO `tipo_operacion='alquiler'`). Resumen: **NUEVAS**,
**existentes**, **desaparecidas**. Escribe `output/discovery-alquiler-<ts>.json`.
- Circuit breaker (🛑) → **no insistas**, IP bloqueada, esperá unas horas. Cooldown 20 min (`--force` con criterio).

### 2. Prep — material de lectura de las EXISTENTES (read-only, gratis)
```
node cargar-alquiler-shadow.mjs --prep 50
```
Fetchea el detalle (gratis) de hasta N existentes frescas (excluye las ya en shadow + rechazadas) → `output/material-alq-<ts>.json`
con `veredicto: null`. Para re-leer ids puntuales: `--prep --ids 3521,3540,...`. **Precio crudo de alquiler:**
el detalle C21 da el USD DERIVADO (bob/6.96, crudo-falso) → el crudo BOB sale de la columna de su moneda / del
discovery (`precios.contrato`); Remax del detalle sí trae crudo. `precioCrudoAlquiler()` ya lo maneja.

### 2b. Prep NUEVAS — capturar inventario que NO está en prod (read-only, gratis)
```
node cargar-alquiler-shadow.mjs --nuevas output/discovery-alquiler-<ts>.json 40
```
Fetchea el detalle (por URL, no por id) de las **NUEVAS** que el discovery vio en el portal pero no están en prod, y
les asigna un **id reservado shadow** (rango 8M; el id real lo da prod al cutover). Van al MISMO flujo MOAT + apply
(pasos 3-4). **Crudo de alquiler:** el discovery expone `precio_raw`+`moneda` del listado — alquiler NUNCA usa el
`precio_usd` derivado (bob/6.96 = crudo-falso). Escribe `output/material-alq-nuevas-<ts>.json`. (Opcional si el
discovery reportó 0 nuevas.)

### 3. MOAT — lectura por subagentes-lectores (el juez; lo hacés VOS con subagentes)
```
node partir-lectura.mjs output/material-alq-<ts>.json 10     # → lectura-chunk-1..N.json (livianos)
```
Lanzá **N subagentes en paralelo**. Cada uno lee su `lectura-chunk-K.json` + **`READER_SPEC_ALQUILER.md`**, y
escribe `output/veredictos-chunk-K.json` (array de veredictos con `id`). Reglas v2 críticas del veredicto:
- **precio_mensual (CRUDO) + moneda_original + tipo_cambio_detectado**: el TEXTO manda la etiqueta y la MONEDA
  (el estructurado —esp. Remax— MIENTE: trae USD pero el aviso cotiza en Bs → tag `bob`). `bob`→Bs/paralelo live;
  `no_especificado`/`paralelo`→USD directo; `oficial_viejo`→6.96/7 explícito → descuenta. NUNCA `precio_usd`.
- **gate INVERSO**: rechazá venta colada (verbo venta Y precio 6 cifras USD) o anticrético. Verbo venta + precio
  de renta ($/mes) = alquiler mislabel → ACEPTAR (el precio es el discriminador duro).
- **condiciones**: expensas_bob/incluidas (solo texto), deposito_meses, contrato_minimo_meses, **amoblado**
  (muebles sueltos, default "no") y **equipado** (electrodomésticos) SEPARADOS, **acepta_mascotas** (texto O
  checkbox portal), **uso_inmueble** (residencial/mixto), servicios_incluidos.
- **dormitorios** (0=mono, la SUITE cuenta), **banos** (dorms≤1→1), **nombre_edificio_canonico** (arábigo, sin
  prefijo; el matcher normaliza romano↔arábigo; `id_proyecto_master` null salvo certeza).
```
node inyectar-veredictos.mjs output/material-alq-<ts>.json output/veredictos-chunk-*.json
```

### 4. Apply — escribe la fila a shadow (muta SOLO `propiedades_v2_shadow`)
```
node cargar-alquiler-shadow.mjs --apply output/material-alq-<ts>.json
```
Arma la fila (**ANTI-DOBLE-NORM**: crudo solo en la columna de su moneda, la otra NULL), resuelve match
name-first (`matcher.mjs`), protege `fecha_publicacion` con LEAST, upsertea. Imprime escritos, rechazados
(gate), reporte por depto, alias sugeridos, y con-nombre-sin-auto-match (la cola de excepciones).

### 5. Verificador — baja de desaparecidos (el paso que a /cron-deptos le falta)
```
node verificador-alquiler.mjs           # DRY-RUN: reporta candidatos + HTTP
node verificador-alquiler.mjs --apply    # aplica contador / baja confirmada
```
Lee las `desaparecidas` del discovery (paso 1), cruza con las que están en shadow, y confirma bajas SOLO con
**2 señales** (ausencia del crawl + HTTP 404/redirect) sostenidas >2d. Disyuntor 40% (crawl parcial → no baja
nada). Status-code-only (inmune a placeholders/bloqueos). Escribe solo shadow, filtrado a alquiler.

### 5b. Refrescar `pet_friendly` del edificio (chip, mig 278)
```
node derivar-pet-friendly.mjs
```
Recalcula `proyectos_master.pet_friendly` desde las unidades shadow (venta+alquiler juntos): `true` si el edificio
tiene alguna unidad con `acepta_mascotas=true` o amenidad "Pet Friendly" (solo señal positiva). Idempotente/
determinístico → mantiene el chip al día cuando entran props nuevas. Escribe SOLO esa columna (prod la ignora; no es
juicio → se automatiza). Las RPCs shadow (migs 279/280) la exponen como chip y sacan "Pet Friendly" de las amenidades.

### 6. Verificar el feed shadow
```
node verificar-shadow-alquiler.mjs       # gratis, sin browser: conteo + anti-doble-norm + matching + mediana + pendientes
```
O el feed real: `npm run dev --prefix ../../simon-mvp` → `localhost:3000/alquileres?shadow=1` (Playwright, no el
preview headless). Chequeá: precio Bs display + USD normalizado (Binance vivo, no ÷6.96), condiciones, amenidades.

### 7. Reportar + log
Reportá: escritos/rechazados/bajas, correcciones notables vs n8n (moneda Remax corregida, TC re-clasificado,
match recuperado), y la cola de excepciones (PM_NUEVO, ambiguos, sin-match). Log en `output/cron-deptos-alquiler-log.md`.

## Reglas
- **SHADOW, prod intacto.** `--apply` y el verificador solo mutan `propiedades_v2_shadow`. A prod: solo SELECT
  + RPC read-only. **El cutover (híbrido escribe prod / n8n se apaga) es decisión APARTE, irreversible, con OK
  explícito del founder.**
- **gratis bajo Max.** El MOAT son subagentes en sesión. `reader-api.mjs` (stub) = camino futuro por API.
- **El juez manda, no el script.** El `.mjs` filtra/fetchea/matchea; el VEREDICTO lo dan los lectores.
- **Anti-doble-normalización** (READER_SPEC_ALQUILER §Regla madre): crudo en la columna de su moneda, la otra
  NULL; la ÚNICA conversión vive en `precio_normalizado_alquiler()` al leer. NUNCA guardar un derivado.
- **Anti-bloqueo IP** (`fetcher.mjs`): cooldown 20min + circuit breaker (5 fallos) + jitter/backoff. 🛑 → esperá.

## Pendientes / incrementos futuros
- ✅ **Empalme de NUEVAS: HECHO** (13-jul) — paso 2b, `--nuevas` en `cargar-alquiler-shadow.mjs` (`prepNuevas`, id 8M);
  `discovery-alquiler.mjs` expone `precio_raw`+`moneda` del listado (alquiler NUNCA usa el `precio_usd` derivado).
- **Empaquetar el orquestador** (`cron-deptos-alquiler.mjs`) que encadene los pasos determinísticos (discovery+prep+
  verificador) en un `.mjs` — hoy este `.command.md` es el orquestador (el agente ejecuta).
- **Bien Inmuebles** = capítulo aparte (3ª fuente; estudiar su página, sirve para venta+alquiler).
- **reader-api** (automatizar el MOAT por API) = camino al cutover sin sesión.
