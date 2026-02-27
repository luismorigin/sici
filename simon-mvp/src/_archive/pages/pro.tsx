import Head from 'next/head'
import { useState } from 'react'
import { Navbar, Footer, LeadForm } from '@/components/landing'
import { ProHero, ProfileSelector, PropertyForm, ProResults, VendedorResults, BrokerResults } from '@/components/pro'
import type { Perfil } from '@/components/pro/ProfileSelector'
import type { DatosPropiedad } from '@/components/pro/PropertyForm'

type Paso = 'selector' | 'formulario' | 'resultados' | 'lead'

export default function ProPage() {
  const [paso, setPaso] = useState<Paso>('selector')
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [datosPropiedad, setDatosPropiedad] = useState<DatosPropiedad | null>(null)

  const handleSelectPerfil = (p: Perfil) => {
    setPerfil(p)
    setPaso('formulario')
  }

  const handleSubmitForm = (datos: DatosPropiedad) => {
    setDatosPropiedad(datos)
    setPaso('resultados')
  }

  const handleBackToSelector = () => {
    setPaso('selector')
    setPerfil(null)
    setDatosPropiedad(null)
  }

  const handleBackToForm = () => {
    setPaso('formulario')
  }

  const handleShowLeadForm = () => {
    setPaso('lead')
  }

  // Títulos por perfil para SEO
  const titulos = {
    vendedor: '¿Cuánto vale tu propiedad? | Simón Pro',
    broker: 'CMA Profesional | Simón Pro',
    avaluador: 'Referencias de Mercado | Simón Pro'
  }

  return (
    <>
      <Head>
        <title>{perfil ? titulos[perfil] : 'Simón Pro – Herramientas Profesionales'}</title>
        <meta
          name="description"
          content="Herramientas de inteligencia inmobiliaria para vendedores, brokers y avaluadores. Referencias de mercado sin sesgo, basadas en datos reales de Equipetrol."
        />
        <meta name="robots" content="noindex" /> {/* Por ahora no indexar */}
      </Head>

      <Navbar />

      <main className="min-h-screen bg-slate-50">
        {/* Hero - siempre visible */}
        <ProHero />

        {/* Paso 1: Selector de perfil */}
        {paso === 'selector' && (
          <ProfileSelector onSelect={handleSelectPerfil} />
        )}

        {/* Paso 2: Formulario */}
        {paso === 'formulario' && perfil && (
          <PropertyForm
            perfil={perfil}
            onSubmit={handleSubmitForm}
            onBack={handleBackToSelector}
          />
        )}

        {/* Paso 3: Resultados */}
        {paso === 'resultados' && perfil && datosPropiedad && (
          perfil === 'vendedor' ? (
            <VendedorResults
              datosPropiedad={datosPropiedad}
              onBack={handleBackToForm}
              onShowLeadForm={handleShowLeadForm}
            />
          ) : perfil === 'broker' ? (
            <BrokerResults
              datosPropiedad={datosPropiedad}
              onBack={handleBackToForm}
              onShowLeadForm={handleShowLeadForm}
            />
          ) : (
            <ProResults
              perfil={perfil}
              datosPropiedad={datosPropiedad}
              onBack={handleBackToForm}
              onShowLeadForm={handleShowLeadForm}
            />
          )
        )}

        {/* Paso 4: Lead Form */}
        {paso === 'lead' && perfil && (
          <section className="py-16 bg-white">
            <div className="max-w-lg mx-auto px-6">
              <button
                onClick={() => setPaso('resultados')}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-6 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Volver a resultados
              </button>
              <LeadForm tipo={perfil} />
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  )
}
