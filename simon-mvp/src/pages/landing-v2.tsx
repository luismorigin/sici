import Head from 'next/head'
import {
  NavbarPremium,
  HeroPremium,
  ProblemPremium,
  StepsPremium,
  MarketLensPremium,
  CTAPremium,
  FooterPremium
} from '@/components/landing-premium'

export default function LandingV2() {
  return (
    <>
      <Head>
        <title>Simon — Inteligencia Inmobiliaria | Equipetrol</title>
        <meta
          name="description"
          content="Encontra tu departamento ideal en Equipetrol. Inteligencia artificial que analiza el mercado y te muestra las 3 mejores opciones con datos verificados."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Premium Fonts */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Manrope:wght@300;400;500;600&display=swap');

        :root {
          --color-black: #0a0a0a;
          --color-white: #ffffff;
          --color-cream: #f8f6f3;
          --color-gold: #c9a959;
          --color-gold-light: #d4b978;
          --color-gray: #666666;
          --color-muted: #999999;
        }

        .font-display {
          font-family: 'Cormorant Garamond', Georgia, serif;
        }

        .font-body {
          font-family: 'Manrope', -apple-system, sans-serif;
        }

        /* Apply Manrope as default body font */
        body {
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
      `}</style>

      <div className="antialiased">
        <NavbarPremium />

        <main>
          {/* Hero - Full screen with property count */}
          <HeroPremium />

          {/* Problem - Why current search is broken */}
          <ProblemPremium />

          {/* Steps - How Simon works */}
          <StepsPremium />

          {/* Market Lens - Real-time data MOAT */}
          <MarketLensPremium />

          {/* Final CTA */}
          <CTAPremium />
        </main>

        <FooterPremium />
      </div>
    </>
  )
}
