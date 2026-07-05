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
      { source: '/filtros', destination: '/filtros-v2', permanent: true },
      { source: '/form', destination: '/formulario-v2', permanent: true },
      { source: '/formV2', destination: '/formulario-v2', permanent: true },
      { source: '/results', destination: '/resultados-v2', permanent: true },
      { source: '/resultsV2', destination: '/resultados-v2', permanent: true },
      { source: '/resultados', destination: '/resultados-v2', permanent: true },
      { source: '/summary', destination: '/filtros-v2', permanent: true },
      { source: '/contact', destination: '/filtros-v2', permanent: true },
      { source: '/pro', destination: '/', permanent: true },
      { source: '/formulario-vivienda', destination: '/formulario-v2', permanent: true },
      { source: '/formulario-inversion-plusvalia', destination: '/formulario-v2', permanent: true },
      { source: '/formulario-inversion-renta', destination: '/formulario-v2', permanent: true },
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
