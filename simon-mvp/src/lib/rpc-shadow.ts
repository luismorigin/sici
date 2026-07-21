// Shadow-first con fallback a prod (lanzamiento TC nuevo, pre-cutover).
// Las superficies públicas leen el marco de normalización nuevo (shadow).
// CUTOVER-SAFE: si la RPC `_shadow` deja de existir cuando shadow→prod, cae
// automáticamente a la RPC prod (que para entonces YA es igual a shadow) →
// nada se rompe, sin tocar código.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rpcShadowFirst(supabase: any, base: string, params: any) {
  const s = await supabase.rpc(`${base}_shadow`, params)
  if (!s.error) return s
  return supabase.rpc(base, params)
}
