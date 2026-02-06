import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'
import Script from 'next/script'
import { Inter, Outfit } from 'next/font/google'

const AnimatePresenceWrapper = dynamic(
  () => import('framer-motion').then(mod => {
    const { AnimatePresence } = mod
    return function Wrapper({ children, routerKey }: { children: React.ReactNode; routerKey: string }) {
      return (
        <AnimatePresence mode="wait" initial={false}>
          <div key={routerKey}>{children}</div>
        </AnimatePresence>
      )
    }
  }),
  { ssr: false }
)

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
})

// Rutas que usan framer-motion para transiciones entre páginas
const ANIMATED_ROUTES = ['/filtros', '/formulario', '/form', '/results', '/resultsV2', '/contact', '/summary', '/formV2']

// Rutas premium que usan Cormorant/Manrope (no necesitan Inter/Outfit)
const PREMIUM_ROUTES = ['/', '/landing-v2', '/filtros-v2', '/formulario-v2', '/resultados-v2']

const GA_ID = 'G-Q8CRRJD6SL'

export default function App({ Component, pageProps, router }: AppProps) {
  const needsAnimation = ANIMATED_ROUTES.some(r => router.asPath.startsWith(r))
  const isPremiumRoute = PREMIUM_ROUTES.includes(router.pathname)

  return (
    <div className={isPremiumRoute ? '' : `${inter.variable} ${outfit.variable}`}>
      {/* Google Analytics */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>

      {needsAnimation ? (
        <AnimatePresenceWrapper routerKey={router.asPath}>
          <Component {...pageProps} />
        </AnimatePresenceWrapper>
      ) : (
        <Component {...pageProps} />
      )}
    </div>
  )
}
