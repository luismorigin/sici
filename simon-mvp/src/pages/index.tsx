import Head from 'next/head'
import {
  Navbar,
  Hero,
  ProblemSection,
  StepsSection,
  WhoSection,
  WhyEquipetrol,
  ReportExample,
  LeadForm,
  PremiumSection,
  MarketLens,
  PriceChecker,
  CTAFinal,
  Footer
} from '@/components/landing'

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>Simón – Departamentos en Equipetrol | Inteligencia Inmobiliaria</title>
        <meta
          name="description"
          content="Encontrá tu departamento ideal en Equipetrol sin marearte. Simón revisa el mercado y te muestra solo las 3 mejores opciones para vos."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Navbar />

      <main>
        {/* Hero */}
        <Hero />

        {/* Problem - Why current search doesn't work */}
        <ProblemSection />

        {/* 3 Steps */}
        <StepsSection />

        {/* Why Equipetrol only */}
        <WhyEquipetrol />

        {/* Market Lens - Real-time data (MOAT temprano) */}
        <MarketLens />

        {/* Price Checker - Verificador de ofertas */}
        <PriceChecker />

        {/* Who is it for - antes del form para auto-identificación */}
        <WhoSection />

        {/* Report Example with Lead Form embedded */}
        <ReportExample />
        <div className="bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-b-3xl shadow-card border border-t-0 border-slate-200">
              <LeadForm />
            </div>
          </div>
        </div>

        {/* Premium Section */}
        <PremiumSection />

        {/* Final CTA */}
        <CTAFinal />
      </main>

      <Footer />
    </>
  )
}
