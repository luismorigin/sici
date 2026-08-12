// ============================================================================
// Cliente de Supabase para el SERVIDOR — SERVER-ONLY
// ----------------------------------------------------------------------------
// 🔴 Importar SOLO desde getStaticProps / getServerSideProps / API routes.
//    NUNCA desde un componente: la clave de servicio no debe llegar al browser.
//
// POR QUÉ EXISTE (11-ago-2026, ver docs/backlog/SSG_FEEDS_PRIMERA_PINTURA_2026-08-11.md):
// El `getStaticProps` de los feeds usaba el cliente con la clave PÚBLICA. Esa clave
// puede *ejecutar* las RPC `_shadow`, pero las RPC son SECURITY INVOKER y adentro leen
// `propiedades_v2_shadow`, donde la mig 317 le sacó el SELECT a `anon` (era el fix del
// agujero por el que la clave pública podía escribir propiedades). Resultado: la RPC
// fallaba con 42501, `rpcShadowFirst` caía a la RPC vieja —que apunta a la tabla
// archivada— y la página se armaba VACÍA, sin una línea en ningún log.
//
// Medido en producción el 11-ago: los 4 feeds servían `initialProperties: 0`.
// `/ventas/casas` era el único que traía datos, porque lee una VISTA (las vistas corren
// con permisos del dueño) en vez de una RPC. Esa fue la pista.
//
// 🔑 El arreglo NO es abrir permisos: es usar la llave que ya los tiene, del lado donde
// no se expone. Mismo patrón que `lib/mercado-shadow-data.ts`.
// ============================================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

/**
 * Cliente con `service_role` para usar en el servidor.
 *
 * @returns `null` si falta la variable de entorno — a propósito, para que quien llame
 *   pueda degradar al comportamiento anterior (primera pintura vacía, el navegador
 *   carga igual) en vez de romper el build. Nunca peor que la línea de base.
 */
export function getServerSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.warn('[supabase-server] falta SUPABASE_SERVICE_ROLE_KEY — el SSG queda sin propiedades iniciales')
    cached = null
    return null
  }

  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
