// Lee el marco de normalización nuevo (shadow) en las superficies públicas.
//
// ⛔ 17-ago-2026 — SE LE QUITÓ EL FALLBACK A LA RPC VIEJA. Antes hacía:
//
//     const s = await supabase.rpc(`${base}_shadow`, params)
//     if (!s.error) return s
//     return supabase.rpc(base, params)   // ← el suplente
//
// y se justificaba así: *"CUTOVER-SAFE: si la RPC `_shadow` deja de existir cuando shadow→prod,
// cae automáticamente a la RPC prod (que para entonces YA es igual a shadow) → nada se rompe"*.
//
// 🔴 Esa premisa era falsa y no iba a dejar de serlo. La RPC vieja **no es igual ni se va a
// volver igual**: `buscar_unidades_simple` calcula con `precio_normalizado()` (régimen viejo,
// ~47% más alto) y la `_shadow` con `precio_normalizado_shadow()`. Son dos fórmulas distintas.
//
// Por qué había que sacarlo ANTES del TIEMPO 2, en una cadena de 5 pasos:
//   1. el rename le cambia el nombre a la tabla;
//   2. `buscar_unidades_simple_shadow` se rompe — nombra `propiedades_v2_shadow`, que deja de existir;
//   3. este helper hacía lo que fue programado a hacer: llamar a la vieja;
//   4. la vieja, hasta ese momento rota, **empieza a funcionar** (el nombre que ella busca acaba
//      de aparecer);
//   5. y sirve precios ~47% inflados en el feed público, **sin un error en ningún log**.
// El rename rompe la función buena y el helper la reemplaza en silencio por la que miente.
//
// 🔑 Y el disparador no era hipotético: se activó DOS VECES en agosto. La mig 317 cerró los
// permisos, la RPC `_shadow` empezó a fallar con 42501 y este fallback entró. Salió barato solo
// porque la vieja también estaba rota: quedaron páginas vacías (visibles) y el bot caído 19 días.
// Con la tabla ya renombrada, ese mismo evento devuelve números creíbles y falsos.
//
// Medido antes de tocar (`scripts/deptos-equipetrol/FOTO_PREVIA_ARREGLOS_2026-08-17.md`): el
// helper recibe exactamente 3 bases en todo el repo — `buscar_unidades_simple`,
// `buscar_unidades_alquiler` y `buscar_extras` —, las 3 tienen gemela `_shadow` que responde, y
// las 3 viejas fallan hoy con 42P01. O sea que quitar el fallback **no cambia nada hoy**: cambia
// "falla y después falla" por "falla". Lo que cambia es mañana.
//
// 👉 Regla que queda: ante una falla, esta capa **devuelve el error**. No hay plan B silencioso.
// Un feed vacío se ve; un feed con precios inflados, no. Detalle: `BARRIDO_RENAME_2026-08-17.md`.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rpcShadowFirst(supabase: any, base: string, params: any) {
  const r = await supabase.rpc(`${base}_shadow`, params)
  if (r.error) {
    // Que quede rastro: el modo de falla que esto reemplaza no dejaba ninguno.
    console.error(`[rpc-shadow] ${base}_shadow falló — NO se cae a la RPC vieja:`, r.error)
  }
  return r
}
