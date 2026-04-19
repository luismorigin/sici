import '@/styles/globals.css'
import '@/styles/alquileres.css'
import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'
import Script from 'next/script'
import { Inter, Outfit, Figtree, DM_Sans } from 'next/font/google'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'
import { useEffect, useState } from 'react'

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

// Simon Brand v1.3
const figtree = Figtree({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-figtree',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-sans',
  display: 'swap',
})


// Rutas que usan framer-motion para transiciones entre páginas
const ANIMATED_ROUTES = ['/filtros', '/formulario', '/form', '/results', '/resultsV2', '/contact', '/summary', '/formV2']

// Rutas premium que usan Cormorant/Manrope (no necesitan Inter/Outfit)
const PREMIUM_ROUTES = ['/', '/landing-v2', '/filtros-v2', '/formulario-v2', '/resultados-v2', '/alquileres', '/condado-vi']

const GA_ID = 'G-Q8CRRJD6SL'

export default function App({ Component, pageProps, router }: AppProps) {
  const needsAnimation = ANIMATED_ROUTES.some(r => router.asPath.startsWith(r))
  const isPremiumRoute = PREMIUM_ROUTES.includes(router.pathname)
  // Admin pages (except login) get wrapped with AuthProvider so auth
  // is verified ONCE and shared — no more flash-to-login on navigation.
  const isAdminRoute = router.pathname.startsWith('/admin') && router.pathname !== '/admin/login'

  // Debug mode: ?debug=1 desactiva GA y persiste en localStorage
  const [isDebug, setIsDebug] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('debug')) {
      const val = params.get('debug') === '1'
      localStorage.setItem('simon_debug', val ? '1' : '0')
      setIsDebug(val)
    } else {
      setIsDebug(localStorage.getItem('simon_debug') === '1')
    }
  }, [])

  // Visitor UUID cross-session (Fase 1 modal WA captura). Solo en rutas públicas.
  // Debug incluido: Lucho necesita trackear QA del flujo.
  useEffect(() => {
    if (router.pathname.startsWith('/admin')) return
    if (router.pathname.startsWith('/broker')) return
    import('@/lib/visitor').then(({ getVisitorId }) => { getVisitorId() }).catch(() => {})
  }, [router.pathname])

  const page = needsAnimation ? (
    <AnimatePresenceWrapper routerKey={router.asPath}>
      <Component {...pageProps} />
    </AnimatePresenceWrapper>
  ) : (
    <Component {...pageProps} />
  )

  return (
    <div className={isPremiumRoute ? `${figtree.variable} ${dmSans.variable}` : `${inter.variable} ${outfit.variable}`}>
      {/* Google Analytics — solo en rutas públicas, no admin/broker, no debug */}
      {!isDebug && !router.pathname.startsWith('/admin') && !router.pathname.startsWith('/broker') && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="lazyOnload"
          />
          <Script id="google-analytics" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>

          {/* Meta Pixel */}
          <Script id="meta-pixel" strategy="lazyOnload">
            {`
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
              n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
              (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '934634159284471');
              fbq('init', '1353819603435799');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            <img height="1" width="1" style={{display:'none'}}
              src="https://www.facebook.com/tr?id=934634159284471&ev=PageView&noscript=1" />
            <img height="1" width="1" style={{display:'none'}}
              src="https://www.facebook.com/tr?id=1353819603435799&ev=PageView&noscript=1" />
          </noscript>
        </>
      )}

      {isAdminRoute ? (
        <AdminAuthProvider>{page}</AdminAuthProvider>
      ) : (
        page
      )}
    </div>
  )
}
