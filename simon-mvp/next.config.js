/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.21online.lat' },
      { protocol: 'https', hostname: 'intramax.bo' },
      { protocol: 'https', hostname: 'www.bieninmuebles.com.bo' },
    ],
    // AVIF/WebP para todo componente next/image (los CDNs de portales sirven
    // JPEG pesados). Cache 24h en el optimizador para no re-transformar.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
  reactStrictMode: true,
  eslint: {
    // Lint errors in legacy code — don't block production builds
    ignoreDuringBuilds: true,
  },
  swcMinify: true,
  compress: true,
  poweredByHeader: false,
  async redirects() {
    return [
      // ⛔ Funnel premium APAGADO el 14-ago-2026 (`/filtros-v2`, `/formulario-v2`,
      // `/resultados-v2` borradas). Estaba dormido hacía meses — el producto es el feed —
      // y era el último consumidor no-admin de `buscar_unidades_reales()`, la RPC del
      // régimen viejo que bloqueaba el TIEMPO 2 del cutover.
      //
      // 🔑 Los redirects viejos NO se borran, se REAPUNTAN a `/ventas`. Son URLs de
      // campañas, marcadores y SEO histórico: borrarlos las convierte en 404, y un 404
      // pierde al visitante en vez de llevarlo al producto vivo. La cadena de dos saltos
      // (/form → /formulario-v2 → /ventas) se aplana a uno solo a propósito.
      { source: '/filtros', destination: '/ventas', permanent: true },
      { source: '/form', destination: '/ventas', permanent: true },
      { source: '/formV2', destination: '/ventas', permanent: true },
      { source: '/results', destination: '/ventas', permanent: true },
      { source: '/resultsV2', destination: '/ventas', permanent: true },
      { source: '/resultados', destination: '/ventas', permanent: true },
      { source: '/summary', destination: '/ventas', permanent: true },
      { source: '/contact', destination: '/ventas', permanent: true },
      { source: '/pro', destination: '/', permanent: true },
      { source: '/formulario-vivienda', destination: '/ventas', permanent: true },
      { source: '/formulario-inversion-plusvalia', destination: '/ventas', permanent: true },
      { source: '/formulario-inversion-renta', destination: '/ventas', permanent: true },
      // Las 3 rutas del funnel en sí. `/landing-v2` NO entra acá: sigue viva y accesible
      // directo (es una landing, no parte del funnel) y no enlazaba a ninguna de estas.
      { source: '/filtros-v2', destination: '/ventas', permanent: true },
      { source: '/formulario-v2', destination: '/ventas', permanent: true },
      { source: '/resultados-v2', destination: '/ventas', permanent: true },
      // Switch home (7-jul): la home vive en `/`. /home canonicaliza a `/`
      // para no tener contenido duplicado (misma página en dos URLs).
      { source: '/home', destination: '/', permanent: true },
    ]
  },
  async rewrites() {
    return [
      // Link puente de las publicaciones: /ir/f03 (el que va en los captions).
      // Rewrite y NO redirect a propósito: un redirect agregaría un salto extra
      // antes de WhatsApp y la URL corta es lo que se publica. Ver
      // pages/api/ir/[[...slug]].ts y docs/backlog/MEDICION_FUNNEL_PLAN.md
      { source: '/ir', destination: '/api/ir' },
      { source: '/ir/:codigo', destination: '/api/ir/:codigo' },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS: Vercel sirve todo por HTTPS; esto solo lo hace explícito al navegador.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // CSP en modo REPORT-ONLY: no bloquea NADA (GA4/Meta/Clarity siguen
          // funcionando igual). Sirve para observar qué bloquearía antes de
          // promoverla a Content-Security-Policy real en el futuro.
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://www.clarity.ms https://scripts.clarity.ms",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://*.clarity.ms https://connect.facebook.net https://www.facebook.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
