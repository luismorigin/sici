# Foto previa — antes de los arreglos 1 y 2 (17-ago-2026)

> **Por qué existe:** pedido del founder antes de tocar nada — *"necesito que hagas tests primero de
> que no romperán nada del sistema que no esté roto"*. Mismo patrón que `FOTO_PREVIA_TIEMPO1_2026-08-11.md`:
> medir ANTES, para que después se pueda comparar en vez de opinar.
>
> **Los dos arreglos que esto habilita:**
> 1. Sacarle a `rpcShadowFirst` la caída a la RPC vieja (`lib/rpc-shadow.ts`, 4 líneas).
> 2. Borrar las funciones que calculan con `precio_normalizado()` y leen la tabla que ya no existe,
>    para que el rename del TIEMPO 2 no las despierte.

## 1. Lo que FUNCIONA hoy — tiene que seguir igual

Medido contra la base y contra el server local.

| Superficie | Estado al 17-ago |
|---|---|
| `/ventas` | **380** deptos · desde $69.000 |
| `/alquileres` | **168** · desde Bs 3.500/mes |
| `/zona-norte/ventas` | **371** · desde $53.000 |
| `/ventas/casas` | sirve ("Casas en venta — Zona Norte") |
| `/b/eATeEcOMG2` (shortlist real, 11 items) | sirve ("Selección de Simón para Carlos") |
| `/mercado/equipetrol` | sirve |
| RPC `buscar_unidades_simple_shadow` | **652** filas |
| RPC `buscar_unidades_alquiler_shadow` | **288** filas |
| RPC `buscar_extras_shadow` | responde (20/20 ids) |
| RPC del bot: `resumen_mercado`, `buscar_propiedades` | responden (venta y alquiler) |

## 2. Lo que YA ESTÁ ROTO hoy — puede seguir roto

Verificado **ejecutándolas**, no leyendo el código:

| Función | Resultado hoy |
|---|---|
| `buscar_unidades_simple` | ❌ `relation "propiedades_v2" does not exist` |
| `buscar_unidades_alquiler` | ❌ ídem |
| `buscar_extras` | ❌ ídem |
| `buscar_unidades_reales` | ❌ ídem |
| `razon_fiduciaria_texto` | ❌ ídem |

## 3. 🔑 El hallazgo del test: la rotura se HEREDA

Tres funciones **no mencionan `propiedades_v2` en su propio texto**, así que un barrido por nombre de
tabla las da por sanas. Las tres están rotas igual, porque llaman a una que sí la lee — y **ninguna
tiene manejo de excepción**, así que la llamada aborta la función entera:

| Parece sana | Llama a | Verificado |
|---|---|---|
| `razon_fiduciaria_texto` | `generar_razon_fiduciaria` | ❌ **ejecutada: falla con 42P01** |
| `populate_broker_prospection` | `buscar_unidades_simple` | rota por herencia (no se ejecutó: hace UPSERT) |
| `generate_advisor_snapshot` | `buscar_unidades_reales` | rota por herencia (no se ejecutó: escribe) |

👉 **Consecuencia para el arreglo 2:** borrar las candidatas **no rompe** a estas tres, porque ya
están rotas. Pero el criterio *"¿esta función menciona la tabla muerta?"* **no alcanza** para decidir
qué se borra: hay que mirar también quién llama a quién.

⚠️ **`populate_broker_prospection` tiene un llamador VIVO**: `/api/admin/prospection/refresh`, el
botón de refrescar de `/admin/prospection`. **Ese botón está roto hoy** y nadie lo reportó — el B2B
está pausado. No es un problema nuevo ni lo crea el borrado, pero conviene saberlo antes de tocar.

## 4. Las candidatas del arreglo 2

Las 6 que **calculan con `precio_normalizado()` (fórmula vieja) y leen la tabla inexistente**:

| Función | Llamadores en código | La usan otras funciones | Veredicto |
|---|---:|---|---|
| `buscar_unidades_simple` | 1 (el fallback de `rpcShadowFirst`) | `populate_broker_prospection` (rota) | borrar **después** del arreglo 1 |
| `buscar_unidades_reales` | **0** | `analisis_mercado_fiduciario`, `knowledge_graph_health_check`, `generate_advisor_snapshot` — **las 3 rotas** | borrar |
| `analisis_mercado_fiduciario` | 1 (`lib/supabase.ts:1076`) | — | revisar si su llamador JS quedó huérfano |
| `explicar_precio` | 0 | `analisis_mercado_fiduciario` (rota) | borrar |
| `generar_razon_fiduciaria` | 0 | `razon_fiduciaria_texto` (rota) | borrar |
| `snapshot_absorcion_mercado` | 0 | — | borrar (es el snapshot de n8n; el vivo es `_shadow`) |

## 5. 🔴 Lo que NO se toca

**`precio_normalizado()` se queda.** La usan **4 vistas**, y las 4 leen `propiedades_v2_archivo`:

- `v_mercado_casas` ← **sirve el feed vivo `/ventas/casas`**
- `v_mercado_venta` · `v_metricas_mercado` · `v_alternativas_proyecto`

Borrar la función rompería el feed de casas, que hoy funciona. La fórmula vieja es correcta **para el
archivo**: esos datos son del régimen viejo. Lo que hay que borrar son sus consumidores rotos, no ella.

## 6. Criterio de aborto

Después de cada arreglo, se vuelve a medir §1. **Si cualquier fila de §1 cambia, se revierte.**
Ninguna de las dos operaciones debería mover un solo número de ahí: la §2 ya está rota y la §5 no se
toca.

Para el arreglo 1 hay además una prueba propia: hoy, si la RPC `_shadow` falla, la página cae a la
vieja y **queda vacía** (porque la vieja también falla). Después del arreglo debe **mostrar el error**
en vez de vaciarse — mismo síntoma visible, mejor diagnóstico.
