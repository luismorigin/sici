# TIEMPO 2 — foto previa y SQL (17-ago-2026)

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
