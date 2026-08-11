# Foto previa — TIEMPO 1 del cutover (renombrar la base vieja)

> Medido el **11-ago-2026, ~9:00 local**, ANTES de ejecutar
> `ALTER TABLE propiedades_v2 RENAME TO propiedades_v2_archivo`.
> Existe para que el veredicto sea **número contra número**, no una lectura mía.
> Goal, predicción y evals: `INVENTARIO_CUTOVER_2026-08-10.md` §7-bis.
>
> ⚠️ **Al re-medir, usar exactamente las mismas llamadas de este archivo.** Dos errores ya cometidos
> hoy midiendo mal: (a) comparar el total de la RPC (647, todas las zonas) contra el tope de un feed
> que filtra por Equipetrol; (b) llamar `/api/ventas` **sin** `shadow:true` — el default del endpoint
> es la base vieja, así que mide lo que el usuario NO ve (329 en vez de 354).

## A) Superficies de cara al cliente — EVAL 1 (el único que aborta)

Estos números **tienen que quedar idénticos**. Si alguno cae → rollback inmediato.

| Superficie | Llamada exacta | Valor previo |
|---|---|---|
| Feed ventas (sitio en vivo) | `POST simonbo.com/api/ventas` `{"shadow":true,"filtros":{}}` | **354** props · 1.249 kB |
| Feed alquileres (sitio en vivo) | `POST simonbo.com/api/alquileres` `{"shadow":true,"filtros":{}}` | **182** props · 591 kB |
| Home `/` | GET | 200 · 99.477 b |
| `/ventas` | GET | 200 · 289.342 b |
| `/alquileres` | GET | 200 · 54.128 b |
| `/mercado/equipetrol` | GET | 200 · 25.582 b |
| `/zona-norte/ventas` | GET | 200 · 958.970 b |
| `/ventas/casas` | GET | 200 · 806.711 b |
| **Bot** `resumen_mercado('venta',…)` | RPC | total **391** · mediana **97.510** · rango 40.000–1.040.000 |
| **Bot** `resumen_mercado('alquiler',…)` | RPC | total **168** · mediana **Bs 4.250** · rango 2.600–20.000 |
| **Bot** `buscar_propiedades('venta',…,5)` | RPC | responde con filas (primera: id 1188) |

🔎 **`/ventas/casas` y `/zona-norte/ventas` son el control de la teoría de las vistas:** la predicción
dice que NO se rompen porque las vistas quedan pegadas a la tabla por OID, no por nombre. Si alguna
cae, esa teoría era falsa y hay que revisar todo lo demás que la asume.

## B) Motor de captura — EVAL 2

| Qué | Valor previo (corrida del 11-ago) |
|---|---|
| Discovery venta Equipetrol | 518 en zona · 18 nuevas · 39 desaparecidas |
| Discovery alquiler Equipetrol | 188 en zona · 6 nuevas · 25 desaparecidas |
| Discovery venta Zona Norte | 472 en zona · 15 nuevas · 29 desaparecidas |
| Discovery alquiler Zona Norte | 123 en zona · 10 nuevas · 7 desaparecidas |

Los "nuevas/desaparecidas" **van a diferir** entre corridas (el portal se mueve): lo que se compara es
que **corran completos y sin abortar**, y que el total en zona quede en el mismo orden de magnitud.

## C) Estado de la base

| Objeto | Valor previo |
|---|---|
| `propiedades_v2` (vieja) | 3.695 filas · 1.490 activas |
| `propiedades_v2_shadow` (nueva) | 1.479 filas · 1.183 activas |
| RPC feed venta shadow (todas las zonas) | 647 |
| RPC feed alquiler shadow (todas las zonas) | 286 |
| `v_mercado_venta_shadow` / `_alquiler_shadow` | 749 / 286 |
| `v_mercado_venta` / `_alquiler` / `_casas` (prod) | 800 / 271 / 100 |
| `proyectos_master` / `condominios_master` | 456 / 45 |
| Snapshots shadow | 1.228 filas · última fecha 2026-08-11 |

## D) Lo que la predicción dice que SÍ se rompe — EVAL 3

Se mide **antes** para poder afirmar que se rompió por el renombrado y no que ya estaba roto.

| Pieza | Valor previo | Esperado después |
|---|---|---|
| `buscar_unidades_reales('{"limite":9999}')` | **426** filas | ❌ error: la tabla no existe |
| `buscar_extras(ARRAY[…])` | responde (0 con ids de shadow) | ❌ error |
| Admin `/admin/propiedades` | lista la tabla vieja | ❌ error al abrir |
| Estudios de mercado | leen `propiedades_v2` | ❌ error |
| `reconstruir_serie_precios_reexpresada()` | lee la vieja + shadow | ❌ error (se repunta al archivo en la misma operación) |
| Vistas de prod (`v_mercado_*`) | 800 / 271 / 100 | ✅ **siguen igual** (pegadas por OID) |

### Agregado en la ronda 3 (9 AM) — lo que toca la tabla DESDE AFUERA

| Pieza | Valor previo | Qué se hace |
|---|---|---|
| Trigger `trigger_tc_actualizado` (en `config_global`) | activo · 796 props marcadas | **DESACTIVAR en el mismo movimiento** — si no, rompe la actualización del TC |
| Actualización del TC | `config_global` acepta UPDATE | ✅ debe seguir aceptándolo DESPUÉS (probar con un update del TC) |
| `v_amenities_proyecto` (materializada) | lee la vieja · **0 consumidores** | queda huérfana; falla solo si algo la refresca |
| `trg_separar_hitl_por_macrozona` | sobre `matching_sugerencias` (sin escrituras) | se deja; riesgo bajo |
| `pg_cron` — 3 jobs activos | ninguno toca la tabla | ✅ no deberían verse afectados |

## E) VEREDICTO — ejecutado el 11-ago-2026

**SQL aplicado por el founder:** trigger del TC desactivado + `propiedades_v2` → `propiedades_v2_archivo`
+ `reconstruir_serie_precios_reexpresada` repunteada al archivo. Todo en una transacción.

| Eval | Resultado |
|---|---|
| 1 · Superficies de cara al cliente idénticas | ✅ **PASA** |
| 2 · Las 4 capturas corren | ✅ **PASA** |
| 3 · Lo roto coincide con lo predicho | ✅ **PASA** |
| 4 · Nadie llega a la vieja por defecto | ✅ **PASA** |

### Eval 1 — medido contra la foto previa, valor por valor

| Superficie | Previo | Post | |
|---|---|---|---|
| Feed ventas (en vivo) | 354 | **354** | ✅ |
| Feed alquileres (en vivo) | 182 | **182** | ✅ |
| Las 6 páginas públicas | 200 · pesos anotados | **200 · pesos idénticos byte a byte** | ✅ |
| Bot venta | 391 · 97.510 | **391 · 97.510** | ✅ |
| Bot alquiler | 168 · 4.250 | **168 · 4.250** | ✅ |
| Vistas prod `v_mercado_*` | 800 / 271 / 100 | **800 / 271 / 100** | ✅ |
| Vistas shadow | 749 / 286 | **749 / 286** | ✅ |
| Archivo / base nueva | 3.695 / 1.479 | **3.695 / 1.479** | ✅ |

🔑 **`/ventas/casas` sobrevivió** — era el control de la teoría de que las vistas se ligan por **OID y
no por nombre**. Media predicción se apoyaba en eso. Confirmada.

### Eval 2 — las 4 capturas, corridas DESPUÉS del renombrado

| Captura | Previo (en zona) | Post | Nuevas | Desaparecidas | |
|---|---|---|---|---|---|
| Venta Equipetrol | 518 | **525** | 8 | 30 | ✅ |
| Alquiler Equipetrol | 188 | **189** | 0 | 23 | ✅ |
| Venta Zona Norte | 472 | **463** | 9 | 36 | ✅ |
| Alquiler Zona Norte | 123 | **122** | 4 | 8 | ✅ |

Cero errores, cero abortos. Las diferencias son el movimiento del portal en ~5 h — lo que se
compara es que **corran completas**, no que den el mismo número.
🔑 Sin el **paso 0** las cuatro habrían abortado acá (`if (error) process.exit(1)` leyendo la tabla
vieja) y el sistema habría pasado la noche sin capturar.

### Eval 3 — se rompió lo predicho, y solo lo predicho

| Pieza | Esperado | Observado |
|---|---|---|
| `buscar_unidades_reales` | error | ✅ `relation "propiedades_v2" does not exist` |
| `buscar_extras` | error | ✅ mismo error |
| Admin `/admin/propiedades` | error al abrir | ✅ mismo error (verificado por el founder en el navegador) |
| Vistas de prod | siguen igual | ✅ intactas |
| Trigger del TC | desactivado | ✅ `tgenabled = 'D'` |
| Serie de precios | apunta al archivo | ✅ 1 mención al archivo + 1 a shadow |

### 🎯 Lo que se rompió y NO estaba predicho

**NINGUNO.**

Es el resultado que el eval 3 contempla como "el mapa era correcto". Vale anotar por qué llegó a
serlo: las 4 rondas de análisis, y sobre todo la ronda 4 —que usó `pg_depend` en vez de mi
imaginación— más el **paso 0**, que sacó de encima la única dependencia que sí habría cortado algo
vivo (los discoveries abortaban y las 4 capturas nocturnas no habrían corrido).
