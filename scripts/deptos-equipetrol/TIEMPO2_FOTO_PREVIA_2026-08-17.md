# TIEMPO 2 — foto previa y SQL (17-ago-2026)

> # ✅ EJECUTADO Y VERIFICADO — 17-ago-2026
> **La tabla viva se llama `propiedades_v2`.** Se cumplió la predicción al pie de la letra: **no se
> movió un solo número**. Las tres capas verificadas:
>
> | Capa | Resultado |
> |---|---|
> | **Base** | `propiedades_v2`=TABLA · `propiedades_v2_shadow`=vista · 1590 vs 1590 · RPC feed **652**/**288** · RPC bot responde · vistas mercado **758**/**288** · `anon` sigue sin poder leer |
> | **Lectura en producción** | los 5 feeds y `/mercado` en 200 · **ACM recalculado sin caché** (timestamp nuevo, mismos **385** comparables) · **shortlist `/b/[hash]`, que se renderiza en cada request, con sus 11 propiedades** |
> | **Escritura real** | el **cargador real** aplicó una prop (8000920 "Zero") **a través del atajo**: *"✅ 1 escritos en propiedades_v2_shadow"*, y la fila quedó **idéntica** (precio, área, dorms, pm, zona) |
>
> 🔑 **Lo que evitó un falso OK:** los feeds son páginas cacheadas cada 6 h, así que un 200 podía ser
> caché y no prueba de que la base respondiera. Se detectó porque **el ACM devolvió el mismo
> timestamp al milisegundo**. Las pruebas válidas fueron las dos superficies que **no** se cachean:
> el ACM con cache-buster y la shortlist dinámica.
> 👉 Es la lección del día otra vez: *un `curl` a una página cacheada no ve la base*. La herramienta
> define el punto ciego.
>
> **Pendiente:** la limpieza (6 funciones · 53 puntos de código · 6 skills) y recién después sacar el
> atajo. Ver `docs/RETOMAR.md` §"LA LIMPIEZA POSTERIOR".
>
> ### 🔍 Revisión visual del founder — un hallazgo, y NO es del rename
> Al mirar los feeds noté dos cosas y se verificaron las dos:
> 1. **Los conteos coinciden exacto.** `/ventas` muestra **351** y la RPC del feed filtrada a
>    Equipetrol devuelve **351**; `/alquileres` muestra **182** y la base tiene **182**. (El "380" de
>    la foto previa venía del `<title>`, que se regenera cada 6 h y era del build anterior.)
>    **Y los precios están sanos**: $2.455/m², $1.486/m², mediana **$1.677/m²**. Si algo hubiera
>    tomado la fórmula vieja estarían ~47% arriba.
> 2. **`/zona-norte/ventas` se ve distinto** — grid con sidebar en vez de lista con mapa. Es
>    preexistente: `splitDesktop` aparece **21 veces en `ventas.tsx` y 0 en `zona-norte/ventas.tsx`**.
>    Ese feed nunca recibió el rediseño de julio.
> 🐛 **Y de ahí salió un bug real, ajeno al cutover: el feed ZN muestra 24 de 301 propiedades.**
> El API responde perfecto (`POST /api/ventas` con las 13 microzonas ZN → `total: 301`, status 200,
> leyendo la tabla renombrada); el DOM tiene exactamente 24 tarjetas. La página no aplica el fetch
> diferido que sí funciona en `/ventas`.
> 🔑 **Cómo se sabe que no es del rename:** los dos feeds usan el mismo mecanismo (24 en el SSG + el
> resto por fetch). Si fuera del rename, `/ventas` también estaría en 24 — y muestra 351.
> Está en dark launch (`noindex`), así que no hay nadie afectado. Flagueado como tarea aparte.

> Medido **antes** de ejecutar, contra **producción** (`simonbo.com`) y la base. Es contra estos
> números que se compara después. Mismo método que el TIEMPO 1.
> Plan y contexto: `BARRIDO_RENAME_2026-08-17.md` · `docs/RETOMAR.md` §2.

## 1. Producción — todo 200

| Ruta | Estado | Título |
|---|---|---|
| `/ventas` | 200 | **380** Departamentos en Venta en Equipetrol — Desde $69,000 |
| `/alquileres` | 200 | **168** Alquileres en Equipetrol — Desde Bs 3.500/mes |
| `/zona-norte/ventas` | 200 | **371** Departamentos en Venta en Zona Norte — Desde $53,000 |
| `/ventas/casas` | 200 | (sirve) |
| `/b/eATeEcOMG2` (shortlist real, 11 items) | 200 | Selección de Simón para Carlos |
| `/mercado/equipetrol` | 200 | Mercado Inmobiliario Equipetrol — Agosto 2026 |
| `/api/acm-pool?dorms=2` | 200 | **n = 385** comparables |
| `/acm-b7k2.html` | 200 | — |

## 2. Base de datos

| Métrica | Valor |
|---|---:|
| filas totales | **1.590** |
| venta activas | 857 |
| alquiler activas | 352 |
| id más alto | **8.000.924** |
| props con candados | **147** |
| `v_mercado_venta_shadow` | **758** |
| `v_mercado_alquiler_shadow` | **288** |

## 3. Las RPC que tienen que seguir respondiendo

| RPC | Resultado |
|---|---|
| `buscar_unidades_simple_shadow` | **652** filas |
| `buscar_unidades_alquiler_shadow` | **288** filas |
| `resumen_mercado('venta')` · `buscar_propiedades('venta')` · `buscar_propiedades('alquiler')` | responden (**las 3 del bot**) |

## 4. Verificado antes de ejecutar

- ✅ **El nombre `propiedades_v2` está LIBRE** (`pg_class` no devuelve nada): el TIEMPO 1 lo dejó en
  `propiedades_v2_archivo`. Sin esto el rename falla.
- ✅ `main` limpio y sincronizado, sin cambios de código a medias → si algo se rompe, **fue el
  rename** y no un deploy colgado.
- ✅ El atajo probado en tabla de juguete: el upsert del cargador funciona a través de una vista,
  **incluido el conflicto real** sobre un id existente.

## 5. Predicción firmada — qué esperamos

**NO se rompe nada.** El atajo mantiene vivo el nombre `propiedades_v2_shadow`, así que las 6
funciones que lo nombran, los 53 puntos de código y las 6 skills siguen funcionando sin tocarse.
Todos los números de §1, §2 y §3 deben quedar **idénticos**.

**Si algo se mueve, se revierte.** No hay resultado "aceptable con matices": la predicción es que
nada cambia.

## 5-bis. ✅ ENSAYO EN VACÍO (dry-run) — idea del founder, corrido y PASA

*"¿no podés hacer un dry run o un test previo de esto?"* — Sí: el DDL en Postgres es
**transaccional**, así que se ejecutó el movimiento completo, se verificó por dentro y se deshizo con
`ROLLBACK`. Sin dejar rastro.

Y lo más valioso: **dentro de la transacción se probó que las funciones siguen encontrando el nombre
a través del atajo**, que era justo lo que había que confirmar.

| Chequeo | Esperado | Obtenido |
|---|---|---|
| la tabla se llama | `propiedades_v2=TABLA` + `propiedades_v2_shadow=vista` | ✅ exacto |
| el atajo acepta escritura | `YES / insertable=YES` | ✅ |
| filas por la tabla vs por el atajo | 1590 vs 1590 | ✅ |
| **la RPC del feed a través del atajo** | 652 | ✅ **652** — idéntico a §3 |
| la RPC del bot | responde | ✅ |

**Post-rollback verificado:** `propiedades_v2_shadow` volvió a ser TABLA, no quedó ninguna vista, y
los 15 índices y 2 secuencias siguen en su lugar.

⚠️ **Lo que el ensayo NO cubre** (y por eso no reemplaza a la verificación posterior): la escritura
del cargador real y el comportamiento del sitio. Viven en otras conexiones y **no ven una transacción
sin confirmar**.
ℹ️ Nota cosmética: los índices conservan sus nombres (`propiedades_v2_shadow_*_idx`) después del
rename. No afecta nada; solo queda feo hasta la limpieza.

## 6. El SQL

```sql
BEGIN;

-- 1. La tabla viva toma por fin el nombre bueno
ALTER TABLE public.propiedades_v2_shadow RENAME TO propiedades_v2;

-- 2. EL ATAJO. El nombre viejo sigue existiendo, apuntando a la misma tabla.
--    Mantiene andando las 6 funciones, los 53 puntos de código y las 6 skills
--    SIN tocar una línea. Se saca recién cuando la limpieza esté hecha.
CREATE VIEW public.propiedades_v2_shadow AS SELECT * FROM public.propiedades_v2;

-- 3. Permisos del atajo, calcados de la tabla.
--    🔴 Regla 13: toda vista nueva en `public` nace con anon/authenticated en ALL
--    por los default privileges del schema. Y una vista lee con permisos del DUEÑO,
--    así que dejarla abierta a `anon` reabriría lo que cerró la mig 317.
REVOKE ALL ON public.propiedades_v2_shadow FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propiedades_v2_shadow TO authenticated, service_role;
GRANT SELECT ON public.propiedades_v2_shadow TO claude_readonly;

COMMIT;
```

### Verificación inmediata (debe dar TABLA + vista)

```sql
SELECT relname,
       CASE relkind WHEN 'r' THEN 'TABLA' WHEN 'v' THEN 'vista' ELSE relkind::text END AS que_es
FROM pg_class
WHERE relnamespace='public'::regnamespace AND relname LIKE 'propiedades_v2%'
ORDER BY 1;
```

## 7. 🔴 ROLLBACK — tenerlo a mano ANTES de empezar

Tarda segundos y **no se pierde ningún dato**: nunca se transforma nada, solo cambia una etiqueta.

```sql
BEGIN;
DROP VIEW public.propiedades_v2_shadow;   -- primero el atajo: el nombre tiene que quedar libre
ALTER TABLE public.propiedades_v2 RENAME TO propiedades_v2_shadow;
COMMIT;
```
