import { motion } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import testFormulario from '@/test/testFormulario.json'

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true'

export default function Landing() {
  const router = useRouter()

  const handleLoadTestProfile = () => {
    // Cargar datos de prueba para v2
    const formData = {
      tipo_formulario: 'vivienda_mvp_v2',
      version: '2.0',
      nivel_completado: 1,
      fecha: new Date().toISOString(),
      tiempo_segundos: 120,
      respuestas: {
        L1_presupuesto: 150000,
        L1_zona: ['equipetrol', 'sirari'],
        L1_dormitorios: '2',
        L1_area: '70',
        L1_innegociables: ['estacionamiento', 'seguridad'],
        L1_deseables: ['piscina'],
        L1_financiacion: 'efectivo',
        L1_nombre: 'Usuario Prueba'
      },
      mbf_filtros: {
        precio_max: 150000,
        dormitorios: 2,
        area_min: 70,
        zonas_permitidas: ['Equipetrol', 'Sirari'],
        solo_con_fotos: true,
        limite: 5
      }
    }

    localStorage.setItem('simon_form_data', JSON.stringify(formData))
    localStorage.setItem('simon_level', '1')

    router.push('/resultsV2?level=1')
  }

  return (
    <>
      <Head>
        <title>Simon - Encontra tu proximo hogar</title>
        <meta name="description" content="Tu filtro inteligente para encontrar la propiedad perfecta sin arrepentirte" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">S</span>
          </div>
        </motion.div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center max-w-2xl"
        >
          <h1 className="text-5xl md:text-6xl font-bold text-neutral-900 mb-6 leading-tight">
            Encontra tu proximo hogar
            <br />
            <span className="text-neutral-400">sin arrepentirte despues</span>
          </h1>

          <p className="text-xl text-neutral-600 mb-12 leading-relaxed">
            No somos inmobiliaria. Somos tu filtro inteligente.
            <br />
            Te ayudamos a entender que buscas realmente.
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          <button
            onClick={() => {
              localStorage.clear()
              router.push('/formV2')
            }}
            className="btn-primary text-lg px-12 py-5 rounded-full
                             flex items-center gap-3 group">
              Empezar
              <svg
                className="w-5 h-5 transition-transform group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </button>

          {/* Dev mode button */}
          {DEV_MODE && (
            <button
              onClick={handleLoadTestProfile}
              className="text-sm text-neutral-400 hover:text-neutral-600 underline"
            >
              [DEV] Cargar perfil de prueba
            </button>
          )}
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex items-center gap-8 mt-12 text-neutral-400"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Gratis</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            <span>5 minutos</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>Sin compromiso</span>
          </div>
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-24 w-full max-w-4xl"
        >
          <h2 className="text-center text-2xl font-semibold text-neutral-900 mb-12">
            Como funciona
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">1</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Busqueda rapida</h3>
              <p className="text-neutral-500">
                8 preguntas basicas (~2 min) y te mostramos opciones reales con fotos.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">2</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Personaliza (opcional)</h3>
              <p className="text-neutral-500">
                10 preguntas mas (+3 min) para entender tu situacion y darte razones personalizadas.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">3</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Opciones coherentes</h3>
              <p className="text-neutral-500">
                Te explicamos POR QUE cada propiedad encaja (o no) con tu vida.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <footer className="mt-24 text-center text-sm text-neutral-400">
          <p>Simon by SICI - Santa Cruz, Bolivia</p>
        </footer>
      </main>
    </>
  )
}
