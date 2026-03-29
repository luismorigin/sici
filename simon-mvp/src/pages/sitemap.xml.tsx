import type { GetServerSideProps } from 'next'

function Sitemap() { return null }

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const baseUrl = 'https://simonbo.com'
  const now = new Date().toISOString().split('T')[0]

  const urls = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/mercado/equipetrol', changefreq: 'daily', priority: '0.9' },
    { loc: '/mercado/equipetrol/ventas', changefreq: 'daily', priority: '0.9' },
    { loc: '/mercado/equipetrol/alquileres', changefreq: 'daily', priority: '0.9' },
    { loc: '/ventas', changefreq: 'daily', priority: '0.8' },
    { loc: '/alquileres', changefreq: 'daily', priority: '0.8' },
    { loc: '/filtros-v2', changefreq: 'weekly', priority: '0.6' },
  ]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${baseUrl}${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate')
  res.write(sitemap)
  res.end()

  return { props: {} }
}

export default Sitemap
