# /cron-deptos-alquiler-zn — Captura híbrida de deptos ALQUILER Zona Norte → SHADOW (bajo Max, gratis)

> **Gemelo de `/cron-deptos-alquiler`** (Equipetrol) y hermano de `/cron-deptos-ventas-zn`.
> Misma maquinaria, otra zona: **todo pasa `--zona=zona-norte`**. Para el detalle conceptual del ciclo
> leé `cron-deptos-alquiler.command.md` — acá está lo operativo y **lo que cambia en ZN**.
>
> **Fuente de verdad** de este comando. Copiar a `.claude/commands/cron-deptos-alquiler-zn.md`.
>
> ⏰ **Agendar después de `/cron-deptos-ventas-zn`.** Sugerido: **~5:10** (Equipetrol venta ~1:17 ·
> Equipetrol alquiler ~2:11 · audit ~3:10 · ZN venta ~4:10 · ZN alquiler ~5:10). Nunca dos crawls a la vez.

## 🔴 LA PERILLA VA EN TODOS LOS PASOS QUE LA ACEPTAN

| paso | script | zona |
|---|---|---|
| 1 Discovery | `discovery-alquiler.mjs` | ✅ **pasar `--zona=zona-norte`** |
| 2b Prep NUEVAS | `cargar-alquiler-shadow.mjs` | ✅ **pasar** |
| 3 Partir chunks | `partir-lectura.mjs` | ⚙️ la toma del **material** |
| 3 Inyectar | `inyectar-veredictos.mjs` | ✅ **pasar** |
| 4 Apply | `cargar-alquiler-shadow.mjs` | ✅ **pasar** |
| 5 Verificador | `verificador-alquiler.mjs` | ✅ **pasar** |
| 5b/5c pet_friendly · snapshot | `derivar-pet-friendly.mjs` · `snapshot-shadow.mjs` | ⚪ **globales a propósito** |
| 6 Verificación de feed | `verificar-shadow-alquiler.mjs` | ⚪ **global** → sus números incluyen Equipetrol; leerlos como total, no como ZN |

## Lo que cambia en Zona Norte

- **Backlog inicial: 5 props** (medido 30-jul) — mucho más chico que el de venta (119).
  🔴 **Y 2 de esas 5 son de Bien Inmuebles**, fuente que el híbrido **no cubre** (solo C21 + Remax):
  **nunca van a entrar por acá**. No las esperes ni las persigas; si el día de mañana importan, es una
  decisión aparte (sumar BI al discovery del híbrido).
- **El alquiler NO usa la normalización de venta.** `precio_mensual_bob` es la fuente de verdad
  (display en Bs) y el USD se deriva por TC oficial. La banda de $/m² de venta no aplica; la referencia
  de renta ronda **$6–$12/m²/mes**.
- **Ojo con la moneda mentida del estructurado** (patrón medido varias noches en Equipetrol, no es
  exclusivo de Remax): el portal dice `USD 355` y el aviso dice `Bs 3.900`. **El texto manda.** De
  creerle al portal, la prop entra ~11× cara.
- **Aviso MIXTO (se alquila Y se vende) → ACEPTAR como alquiler** (regla v3 del
  `READER_SPEC_ALQUILER.md`, 30-jul), con el mensual coherente en magnitud (≈Bs 1.500–30.000).

## Pasos (en orden, desde `scripts/deptos-equipetrol/`)

### 1. Discovery + diff (read-only)
```
node discovery-alquiler.mjs --zona=zona-norte
```
C21 (renta) + Remax (alquiler) sobre las 14 microzonas de ZN, diffeado contra shadow **filtrado por
zona**. Circuit breaker → no insistir; avisa solo por Slack con diagnóstico DNS.

### 2b. Prep NUEVAS (read-only)
```
node cargar-alquiler-shadow.mjs --nuevas output/discovery-alquiler-zn-<ts>.json 40
```
⚠️ **El `--prep` de existentes no se usa acá**: el discovery es shadow-relativo, así que lo que está
en prod pero no en shadow ya viene como NUEVA.

### 3. MOAT — subagentes-lectores (el juez)
```
node partir-lectura.mjs output/material-alq-nuevas-<ts>-zn.json 10   # → lectura-alquiler-zn-<fecha>-c1..N.json
```
Cada subagente lee su chunk + **`READER_SPEC_ALQUILER.md`** (¡no el de venta!) y escribe
`output/veredictos-alquiler-zn-<fecha>-cK.json`. El chunk trae `"operacion": "alquiler"` y
`"zona": "zona-norte"` adentro: **si no coinciden, parar y avisar**.

#### 🔁 Reintento con backoff (obligatorio en corrida desatendida)
Si un subagente falla por error de **servicio** (`529 Overloaded`, `500`, timeout, "API Error"):

1. **Reintentá ese chunk hasta 3 veces**, esperando **60s → 180s → 300s**.
2. Si a la 3ª sigue fallando, seguí con los otros y reintentá el que falló **al final**.
3. Recién ahí leé inline con el mismo spec. **Si tuviste que leer más de 2 chunks inline, abortá y
   avisá por Slack** en vez de entregar una corrida a medias.
4. **Registrá en el log** los reintentos y las lecturas inline.

> 🔑 **Por qué reintentar y NO achicar la tanda:** el 30-jul los dos intentos de subagente murieron con
> `529` **con 4 props** (y la lectura terminó haciéndose inline), mientras que el 29-jul se leyeron
> **166 props en 13 chunks** sin problema. Es inestabilidad del servicio, no escala.

```
node inyectar-veredictos.mjs output/material-alq-nuevas-<ts>-zn.json output/veredictos-alquiler-zn-<fecha>-c*.json --zona=zona-norte
```
⚠️ **Reemplaza, no acumula**: todos los archivos en UNA corrida.

### 4. Apply
```
node cargar-alquiler-shadow.mjs --apply output/material-alq-nuevas-<ts>-zn.json --zona=zona-norte
```
Gate: rechaza venta pura / anticrético / baulera-parqueo. La **basura estructural** se materializa como
descarte; la **operación mal tipeada** solo se rechaza → si un aviso reaparece noche tras noche,
**leelo antes de suprimirlo**: puede ser un alquiler real que el gate está tirando (caso Nano Tec,
30-jul → memoria `feedback_ejemplo_en_spec_pesa_como_regla`).

### 5. Verificador
```
node verificador-alquiler.mjs --zona=zona-norte              # DRY-RUN
node verificador-alquiler.mjs --zona=zona-norte --apply      # aplica
```

### 5b / 5c — globales, SIN `--zona`
```
node derivar-pet-friendly.mjs
node snapshot-shadow.mjs
```
Idempotente por fecha: re-fresca la foto del día. Un salto de nivel al entrar ZN es **composición,
no mercado**.

### 6. Verificación del feed
```
node verificar-shadow-alquiler.mjs
```
⚪ Global: conteo + anti-doble-normalización + matching + mediana. **Sus números son de TODO shadow**
(Equipetrol + ZN) → para el detalle de ZN, filtrar por zona en SQL.
Gotcha conocido: `buscar_unidades_alquiler_shadow('{}')` trae **LIMIT 50** por default y ordena por
fecha — una prop nueva puede "no aparecer" solo por eso. Verificar con `{"ids":[...],"limite":N}`.

### 7. Log + Slack
Registrá en **`output/cron-deptos-alquiler-zn-log.md`** (archivo PROPIO, no el de Equipetrol).

```
node notificar-slack.mjs "<resumen>"
```
El mensaje **debe empezar diciendo la zona** (`🌆 Cron deptos-ALQUILER ZONA NORTE`). Incluir:
escritas / rechazadas por gate (y por qué) / verificador / reintentos del MOAT / cola. Si no hay nada
pendiente, decir **`Sin cola pendiente`** explícitamente — sin eso no se distingue "corrió y está
limpio" de "no corrió".

## Reglas

- **SHADOW, prod intacto.** Alquiler usa funciones PROPIAS (`_alquiler`): **NUNCA** tocar las de venta.
- **El texto manda sobre el estructurado**, siempre — en precio, moneda y operación.
- **El juez manda, no el script.**
- **Las condiciones de alquiler** (`expensas_incluidas`, `equipado`, `uso_inmueble`) viven en
  `datos_json`, **no** en `datos_json_enrichment`. Buscarlas en la columna equivocada da NULL y parece
  pérdida de datos.
