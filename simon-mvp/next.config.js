/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // simonbo.com muestra landing-v2 (sin cambiar URL)
      { source: '/', destination: '/landing-v2' }
    ]
  }
}

module.exports = nextConfig
