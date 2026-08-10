# Inventario completo antes de consolidar las tablas — 10-ago-2026

> Reemplaza en los hechos al escenario de `CUTOVER_DATA_PLAN.md` (escrito el 17-jul), que suponía a
> n8n vivo y a prod como base. **El founder dio de baja Firecrawl y el servidor de n8n a fines de
> julio**: prod dejó de escribirse el 28-jul y no vuelve. Este doc es el mapa verificado de qué cuelga
> de cada tabla HOY. Todo lo de abajo está medido contra la BD y el repo, no recordado.

## 0. Estado de hecho

| | |
|---|---|
| `propiedades_v2` (vieja) | **congelada desde el 28-jul**. 3.695 filas. Serie de absorción cortada el 27-jul |
| `propiedades_v2_shadow` (híbrido) | **viva**, 1.453 filas · 834 venta + 327 alquiler activas · matching 87,3% / 78,0% |
| Routines | 5 agendadas y corriendo (venta+alquiler × Equipetrol+ZN, más el audit) |
| Esquema de ambas | **idéntico** — 88 columnas, cero diferencias. 14 índices cada una |
| Choques de identidad | **cero** — donde comparten número, es la misma propiedad |
| RLS | **desactivado en ambas** (ver §5.1) |

**El híbrido NO pierde inventario (verificado).** Las 144 props que prod tenía como activas y shadow
no tiene se explican enteras: 133 son brochures de preventa apartados a propósito en
`proyectos_detectados`, 6 estaban mal clasificadas en prod (alquiler/anticrético/casa/local), 2 son
republicaciones con URL nueva ya presentes, y los 5 deptos restantes **están borrados en el portal**
(302 en Remax, 404 en C21, chequeados uno por uno).

## 1. Mapa por superficie — quién lee qué

### Leen SHADOW (la data buena) — todo lo que da la cara
| Superficie | Objeto | Dónde corre |
|---|---|---|
| Feeds `/ventas` `/alquileres` | `buscar_unidades_simple_shadow`, `buscar_unidades_alquiler_shadow` | **Vercel** |
| Home, `/sobre-simon`, `/whatsapp` | vistas `_shadow` vía `superficies-data.ts` | **Vercel** |
| `/mercado/equipetrol/*` | `mercado-shadow-data.ts` + `market_absorption_snapshots_shadow` | **Vercel** |
| Shortlists `/b/[hash]` | `rpcShadowFirst` (shadow-first con fallback a prod) | **Vercel** |
| **Bot WhatsApp** | RPCs `buscar_propiedades` / `resumen_mercado` / `buscar_similares` + **SQL crudo con `v_mercado_venta_shadow` y `v_mercado_alquiler_shadow` en `lab-kapso/src/sici.js:49,79,115,137`** | **servidor del bot** |
| **ACM** (`acm-pool`, `acm-buscar`) | `v_mercado_venta_shadow`, `v_estado_obra_inferido_shadow`, `propiedades_v2_shadow` | **Vercel** |
| `/zona-norte/ventas` | shadow | **Vercel** |
| Las 5 routines nocturnas | `propiedades_v2_shadow` en 20 archivos de `scripts/deptos-equipetrol` | **máquina local** |

### Leen PROD (la tabla congelada)
| Superficie | Estado |
|---|---|
| **Admin `/admin/propiedades/[id]`** | 🔴 lee y escribe SOLO en prod — ver §3.1 |
| **Estudios de mercado** (`scripts/estudio-mercado/src/db.ts`) | 🔴 data congelada **+ fórmula duplicada** — ver §3.2 |
| `/ventas/casas` → `v_mercado_casas` | se congela (proyecto nuevo desde cero) |
| Mercado ZN (`mercado-data-zn.ts`, `mercado-alquiler-data-zn.ts`) | dark launch |
| `/admin/market`, `/admin/salud`, supervisor | interno |
| ~70 funciones SQL del pipeline n8n (merge, matching, enrichment, discovery) | muertas con n8n |

### Sin riesgo
`docs/analysis/mesa-data.js` (Mesa de Guerra + informe) es data **congelada al 3-ago**, no consulta la
BD en vivo. Al regenerarlo hay que apuntarlo a la base nueva.

## 2. 🔴 Lo que hace que esto NO sea una operación de base de datos

**Los nombres `_shadow` están escritos en tres sistemas que se despliegan por separado:**

1. **El sitio** (Vercel) — desplegado hoy, llamando `buscar_unidades_simple_shadow` y compañía.
2. **El bot de WhatsApp** (`lab-kapso`, otro repo, otro servidor) — con los nombres de vista escritos
   en SQL crudo. **El bot está en producción y recibe mensajes reales.**
3. **Las 5 routines** (máquina local) — 20 archivos con `propiedades_v2_shadow` adentro.

**Si se renombra de un golpe, los tres se rompen al mismo tiempo** y quedan rotos hasta que cada uno
se actualice y se vuelva a desplegar. El sitio se cae aunque el código del repo esté perfecto, porque
lo que corre es el build anterior.

👉 **Por eso el renombrado va con alias, no de un golpe.** Los objetos `_shadow` se mantienen vivos
como puente hasta que los tres sistemas estén actualizados y desplegados. Ver §6.

## 3. Problemas reales encontrados

### 3.1 El admin edita la base que nadie lee 🔴
`usePropertyEditor.ts` lee y escribe **solo** `propiedades_v2` (líneas 180, 859, 904-1013): datos,
candados e historial. Ninguna referencia a shadow. Corregir un precio, un GPS o poner un candado desde
el dashboard **no cambia nada en el sitio público**, y el cron nocturno pisa el dato igual porque los
candados viven en la otra tabla. Rompe la regla #1 ("Manual > Automatic") sin dar ningún error.

### 3.2 Los estudios de mercado: dos problemas, no uno 🔴
- Consultan `propiedades_v2` directo (`db.ts:104,142,176,191,219`) → inventario del 28-jul.
- **Tienen su propia copia de la normalización de precio en JS** (`db.ts:81-90`: si el tag es
  `paralelo`, multiplica por `tc_paralelo/6.96`). **Apuntarlos a la base nueva NO alcanza**: seguirían
  inflando ~47% porque la cuenta la hacen ellos. Hay que sacarles la fórmula y que lean las vistas de
  mercado, que ya normalizan (regla #2: una sola normalización).
- Bueno: **la zona ya es un parámetro** (`queryVenta(zona?)`), no está clavada a Equipetrol → aplicar
  zonas nuevas no es trabajo. Residuo a revisar: `ZONAS_EXCLUIDAS = ['Sin zona','Eq. 3er Anillo']`.

### 3.3 Shortlists y leads: piloto congelado, sin usuarios ✅ NO BLOQUEA
311 de 637 ítems de shortlist, 32 de 62 favoritos y 259 de 283 leads apuntan a ids ausentes en shadow.
**Decisión del founder (10-ago): son datos de prueba de un piloto congelado, sin usuarios ni servicio.
No hay nada que rescatar.** Se vacían cuando el piloto se retome de verdad; hoy no molestan a nadie.
(Sin esa aclaración, el renombrado habría roto la mitad de las shortlists en circulación.)

### 3.4 La tabla nueva no puede dar de alta una propiedad 🔴
`propiedades_v2.id` tiene `DEFAULT nextval('propiedades_v2_id_seq')`. **`propiedades_v2_shadow.id` no
tiene default** — los ids se asignan a mano (rango 8.000.xxx, 414 filas). Cuando shadow sea la tabla
principal, **cualquier alta sin id explícito falla**: admin "nueva propiedad", alta del broker,
cualquier INSERT del sitio. Hay que ligarle una secuencia arrancada por encima de 8.000.999.

### 3.5 Seguridad: `anon` podía escribir las tablas ✅ RESUELTO (mig 317, aplicada 10-ago)
Tenían `anon=arwdDxtm` = **todos los permisos**, con **RLS desactivado**. Con la clave pública del
sitio —que viaja en el navegador de cualquier visitante— se podía insertar, modificar o borrar filas.
No lo abrió nadie: es el *default privilege* del schema `public` (regla #13 del CLAUDE.md).

**Cerrado por la mig 317 el 10-ago.** Verificado después de aplicar: `anon=rm` en la vieja (solo
lectura, que 3 puntos del sitio necesitan), ausente en la nueva, fuera de ambas secuencias. `/`,
`/ventas` y `/alquileres` responden 200 **con datos**. `authenticated` quedó intacto a propósito (es
lo que usa el admin para guardar) → **endurecerlo va junto con el arreglo de §3.1, no antes**.
Pendiente cosmético: a `anon` le quedó el privilegio `MAINTAIN` sobre la vieja.
🔴 **Sigue pendiente el modelo de RLS** (backlog Tier 2, `docs/canonical/SEGURIDAD_SUPABASE.md`).

## 4. Lo que NO hace falta (verificado, no asumido)
- **Trigger de zona en shadow:** de 1.158 activas con GPS, solo **3** tienen la zona desalineada. Las
  routines la calculan al escribir. Hará falta el día que algo edite shadow a mano — o sea, después
  de arreglar §3.1, no antes.
- **Cambiar `precio_normalizado()` ahora:** se pensó para un escenario que ya no existe. Hoy la
  fórmula vieja solo alimenta superficies congeladas o internas.

## 5. Detalles técnicos que no dan error pero cambian resultados
- **Vistas vs funciones al renombrar:** en Postgres las **vistas** quedan pegadas a la tabla vieja (se
  ligan por OID), las **funciones** saltan a la nueva (se ligan por nombre). `v_mercado_casas` seguiría
  leyendo el archivo (conveniente); `snapshot_absorcion_mercado()` pasaría a leer la nueva (no
  deseado). Repasar una por una.
- **Permisos del bot:** `bot_kapso_readonly` tiene GRANT sobre `v_mercado_venta`, `v_mercado_alquiler`
  y sus gemelas `_shadow`. Los permisos siguen al objeto al renombrar, pero un objeto **nuevo** nace
  sin ellos → si se crea una vista canónica nueva, hay que re-otorgar o el bot se queda ciego.
- **Índices:** 14 en cada tabla, distintos entre sí. Los de shadow cubren lo que consulta el feed
  (zona, microzona, status, precio, piso, GPS, proyecto). No hay que portar los de prod.

## 6. Pre-mortem: por qué NO se renombran las dos tablas de una vez

Antes de proponer el plan se buscó qué podría fallar. Aparecieron dos cosas que tumbaron la versión
anterior de este mismo capítulo (un plan de 4 etapas con alias, ya descartado):

🔴 **(a) La fórmula vieja empezaría a leer datos nuevos.** `buscar_unidades_reales` y `buscar_extras`
leen `FROM propiedades_v2` y calculan con `precio_normalizado()` (la que infla ~47%). Hoy son
**inofensivas porque leen una tabla congelada**. Si `propiedades_v2` pasa a ser la base buena, se
despiertan sobre datos vivos: precios inflados en la **creación de shortlists**
(`api/broker/shortlists/index.ts`) y en el **CMA del broker** (`api/broker/generate-cma.ts`).
**No da error: da un número creíble y falso.**
🔑 Lo que hoy separa a las dos fórmulas **es el nombre de la tabla, no otra cosa.**

🔴 **(b) "Las ~70 funciones de n8n están muertas" era falso.** Al menos **6 las usa el sitio vivo**
(`buscar_unidades_reales`, `buscar_extras`, `analisis_mercado_fiduciario`, `calcular_confianza_datos`,
`inferir_datos_proyecto`, `procesar_decision_sin_match`) — admin de propiedades y proyectos, CMA y
shortlists. Desactivarlas en bloque rompía el admin.

🟠 **(c) El renombrado NO arregla los candados.** Verificado: `campos_bloqueados` aparece **0 veces**
en `cargar-deptos-shadow.mjs` y `cargar-alquiler-shadow.mjs` (solo lo mira el audit). Aunque el admin
escriba donde el sitio lee, **el cron de esa noche le pisa la corrección**. El arreglo del admin son
DOS cosas, no una.

🟠 **(d) Choque de ids.** El cargador calcula el próximo id por su cuenta (máx + 1, hoy 8.000.724).
Si además se liga una secuencia, ambos pueden entregar el mismo número la misma noche → clave
duplicada. Arrancar la secuencia MUY por encima (p. ej. 9.000.000) o que el cargador la use.

🟡 **(e)** El admin pasará a listar 2.242 filas menos (esperado). **(f)** El reemplazo masivo en los
74 archivos de scripts puede romper alguno que compare las dos tablas a propósito — revisar antes.

## 7. Plan vigente — en DOS TIEMPOS (surgió de una pregunta del founder, 10-ago)

La clave: **hay tres movimientos posibles, no dos.** (A) renombrar solo la vieja · (B) renombrar las
dos · (C) no tocar nada. El riesgo de §6(a) **solo aparece en B**. En A la fórmula vieja se queda sin
tabla y **falla ruidoso** en vez de mentir en silencio.

**PASO 0 — soltar las routines de la base vieja (⚠️ SIN ESTO, EL TIEMPO 1 CORTA LA CAPTURA).**
Descubierto el 10-ago al verificar, contra mi propia predicción de que "las routines no se enteran":
- 🔴 `discovery-deptos.mjs` y `discovery-alquiler.mjs` leían `propiedades_v2` con un
  `if (error) process.exit(1)` → **abortaban las 4 capturas nocturnas** (Eq + ZN, venta + alquiler).
  El dato era **informativo** desde el 20-jul y nadie consumía `existentes_urls` ni `resumen.prod`.
- 🟠 `verificar-shadow-alquiler.mjs` cruzaba contra prod **sin chequear `error`** → al archivarse la
  tabla habría impreso **"✅ INVENTARIO CERRADO"**: un fallo disfrazado de éxito. Se retiró el bloque
  entero (medía contra una foto congelada: un aviso bajado del portal el 5-ago sigue `es_activa` ahí
  para siempre). Se conservó en comentario su lección: **la identidad de un aviso es la URL, no el id.**
- 🟡 `traerLote()` de los dos cargadores (modo `--prep`, que el cron no usa): ahora explica por qué
  no está disponible en vez de morir con un error de Postgres.
- 🔴 **`reconstruir_serie_precios_reexpresada()` (la tarea MENSUAL de la curva de `/mercado`) lee la
  tabla vieja** — y está bien que lo haga: la serie se arma con 6,5 meses de precios históricos que
  viven ahí. **En el TIEMPO 2 pasaría a leer la base nueva y reconstruiría la curva con muchos menos
  datos, sin fallar.** Hay que repuntarla explícitamente a `propiedades_v2_archivo`.
- ✅ Verificado limpio: los 9 scripts de las routines (audit incluido) y las otras 5 RPC que invocan.
- ✅ Probado con las 4 capturas corridas a mano **antes** de tocar ninguna tabla.

**TIEMPO 1 — `propiedades_v2` → `propiedades_v2_archivo`. Nada más.**

> 📎 **En la MISMA operación va el repunte de la serie de precios** (no antes: `_archivo` todavía no
> existe; no después: en la ventana intermedia la tarea mensual reconstruiría la curva contra la
> tabla equivocada). La función lee las DOS a propósito — la vieja aporta los 6,5 meses de historia,
> shadow lo actual — así que se cambia **una sola línea**, parcheando la definición VIVA (regla #7,
> mismo patrón que las migs 311/316: nunca transcribir la función):
>
> ```sql
> DO $$
> DECLARE def text; buscado text := 'JOIN propiedades_v2 p ON p.id = ph.propiedad_id';
> BEGIN
>   SELECT pg_get_functiondef(p.oid) INTO def
>     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
>    WHERE n.nspname = 'public' AND p.proname = 'reconstruir_serie_precios_reexpresada';
>   -- Aborta si la función cambió: un parche a medias la deja válida y semánticamente rota.
>   IF def IS NULL OR position(buscado IN def) = 0 THEN
>     RAISE EXCEPTION 'El JOIN esperado no está — la función cambió. Abortado sin tocar nada.';
>   END IF;
>   EXECUTE replace(def, buscado, 'JOIN propiedades_v2_archivo p ON p.id = ph.propiedad_id');
> END $$;
> ```
>
> Verificación: correr `node scripts/deptos-equipetrol/reconstruir-serie-precios.mjs` y comparar el
> total de filas de `market_price_reexpresado` contra el de antes del cutover. Si bajó mucho, la
> función está leyendo la tabla chica.
Todo lo que todavía dependa de la base vieja salta con error, junto y el día elegido:
el admin, los estudios, el feed `/ventas/casas`, `/admin/market`, supervisor, y las funciones de
§6(a)/(b). **Eso es el objetivo, no un daño colateral**: el sistema revela sus dependencias en vez de
que alguien las adivine leyendo código (que ya falló: se escaparon el bot, los ids y los candados).
Se hace un día laborable, con tiempo para mirar. Reversible con un `ALTER TABLE ... RENAME` inverso.

**Entre los dos tiempos — arreglar lo que gritó:**
apagar o repuntar `buscar_unidades_reales` y `buscar_extras` · conservar las otras 4 funciones vivas ·
apuntar el admin a la base buena · **hacer que los cargadores respeten `campos_bloqueados`** (§6c) ·
apagar el feed de casas · dejar los estudios para su reescritura (§3.2).

**TIEMPO 2 — `propiedades_v2_shadow` → `propiedades_v2`** (+ la secuencia de §6d).
Cuando ya nadie usa el nombre viejo, dárselo a la base buena **no tiene riesgo**: no queda ninguna
fórmula vieja viva para confundirse. Mismo destino final que el plan B, en dos pasos seguros.

**Lo que NO entra en ningún tiempo:** cambiar `precio_normalizado()` (va con casas), el trigger de
zona (§4), tocar casas/terrenos/anticrético (proyecto nuevo), y **borrar el archivo — nunca**: ahí
viven los 33 matches de condominio, el crudo histórico y 22k filas de `precios_historial`.

⏸️ **Estado al 10-ago: sin decidir por el founder.** Nada de esto está aplicado.

## 8. Qué implica para el crecimiento (deptos ZN → casas/terrenos → ciudad)
- **Una sola tabla discriminada por tipo y zona** ya es el patrón que funciona. La próxima vertical se
  construye **dentro** de la base principal con su propio spec de lectura, **no en otra tabla
  paralela**. "Shadow" fue un laboratorio con fecha de vencimiento; este documento es la factura de
  haberlo dejado abierto tres semanas de más. Un laboratorio por vertical multiplica ese costo.
- **Se replica por vertical:** el spec del lector, el gate de captura, el matcher contra su catálogo
  (`proyectos_master` edificios / `condominios_master` casas) y la routine nocturna.
- **No se replica:** la tabla, las vistas de mercado ni la normalización de precio.
- **Los catálogos sobreviven a todo:** 454 edificios (281 con alias) y 45 condominios, en tablas
  propias que ningún cutover toca.
- Al escalar a la ciudad, el límite no es el modelo de datos sino el motor: la routine depende de la
  máquina prendida y de la cuota Max. Ver §Automatización de `CUTOVER_DATA_PLAN.md`.

---
Verificado el 10-ago-2026 contra la BD y el repo. Complementa (y en los hechos supersede) a
`CUTOVER_DATA_PLAN.md` §Checklist.
