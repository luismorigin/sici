import Head from 'next/head'
import { useEffect } from 'react'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import {
  NavSimon,
  HeroSimon,
  MercadoHero,
  ProductosSection,
  ProblemaSection,
  ComoFuncionaSection,
  CTAFooterSimon,
} from '@/components/landing-v2'
import { trackEvent } from '@/lib/analytics'
import { fetchLandingData, type LandingData } from '@/lib/landing-data'

export default function LandingV2({
  heroMetrics,
  snapshot,
  microzonas,
  zonasAlquiler,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  useEffect(() => {
    trackEvent('landing_view')
  }, [])

  return (
    <>
      <Head>
        <title>Simon — Inteligencia Inmobiliaria | Equipetrol</title>
        <meta
          name="description"
          content="Encontra tu departamento ideal en Equipetrol. Inteligencia artificial que analiza el mercado y te muestra las mejores opciones con datos verificados."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="font-s-body antialiased">
        <NavSimon />

        <main>
          <HeroSimon />
          <MercadoHero
            microzonas={microzonas}
            zonasAlquiler={zonasAlquiler}
            tcActual={snapshot.tc_actual}
            heroMetrics={heroMetrics}
          />
          <ProductosSection
            heroMetrics={heroMetrics}
            microzonas={microzonas}
            zonasAlquiler={zonasAlquiler}
          />
          <ProblemaSection />
          <ComoFuncionaSection />
        </main>

        <CTAFooterSimon />
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps<LandingData> = async () => {
  const data = await fetchLandingData()
  return {
    props: data,
    revalidate: 21600, // 6 horas
  }
}
