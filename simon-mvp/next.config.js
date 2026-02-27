/** @type {import('next').NextConfig} */
const nextConfig = {
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
        ],
      },
    ]
  },
}

module.exports = nextConfig
