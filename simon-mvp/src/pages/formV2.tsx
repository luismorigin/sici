import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useFormV2 } from '@/hooks/useFormV2'
import QuestionCard from '@/components/QuestionCard'

export default function FormV2Page() {
  const router = useRouter()
  const { level: queryLevel } = router.query
  const initialLevel = queryLevel === '2' ? 2 : 1

  const {
    level,
    currentQuestion,
    currentIndex,
    totalQuestions,
    answers,
    direction,
    isFirstQuestion,
    isLastQuestion,
    canProceed,
    setAnswer,
    next,
    previous,
    saveProgress,
    buildFormData,
    getUserName,
    goToLevel2,
  } = useFormV2(initialLevel as 1 | 2)

  const [nombre, setNombre] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [showContactForm, setShowContactForm] = useState(false)

  // Si es la última pregunta de nivel 1, mostrar form de contacto
  useEffect(() => {
    if (level === 1 && currentQuestion?.id === 'L1_nombre' && canProceed) {
      setShowContactForm(true)
    } else {
      setShowContactForm(false)
    }
  }, [level, currentQuestion, canProceed])

  const handleNext = async () => {
    if (isLastQuestion && canProceed) {
      // Guardar progreso
      saveProgress()

      // Guardar datos del formulario
      const formData = buildFormData()
      localStorage.setItem('simon_form_data', JSON.stringify(formData))
      localStorage.setItem('simon_level', level.toString())

      if (level === 1) {
        // Ir a resultados nivel 1 (sin razón fiduciaria)
        router.push('/resultsV2?level=1')
      } else {
        // Ir a resultados nivel 2 (con razón fiduciaria)
        router.push('/resultsV2?level=2')
      }
    } else {
      next()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canProceed) {
      handleNext()
    }
  }

  const progress = ((currentIndex + 1) / totalQuestions) * 100

  return (
    <>
      <Head>
        <title>{level === 1 ? 'Busqueda Rapida' : 'Personalizar'} | Simon</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main
        className="min-h-screen flex flex-col px-6 py-8"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Header con progreso */}
        <header className="w-full max-w-2xl mx-auto mb-8">
          {/* Nivel badge */}
          <div className="flex justify-between items-center mb-4">
            <span className={`px-3 py-1 rounded-full text-sm font-medium
              ${level === 1
                ? 'bg-blue-100 text-blue-800'
                : 'bg-purple-100 text-purple-800'
              }`}
            >
              {level === 1 ? 'Nivel 1: Busqueda Rapida' : 'Nivel 2: Personalizacion'}
            </span>
            <span className="text-sm text-neutral-500">
              {currentIndex + 1} / {totalQuestions}
            </span>
          </div>

          {/* Barra de progreso */}
          <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${level === 1 ? 'bg-blue-500' : 'bg-purple-500'}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </header>

        {/* Pregunta */}
        <div className="flex-1 flex items-center justify-center">
          {currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              onAnswer={setAnswer}
              direction={direction}
            />
          )}
        </div>

        {/* Navegación */}
        <footer className="w-full max-w-2xl mx-auto mt-8">
          <div className="flex justify-between items-center">
            {/* Botón Anterior */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: isFirstQuestion ? 0.3 : 1 }}
              onClick={previous}
              disabled={isFirstQuestion}
              className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900
                        transition-colors disabled:cursor-not-allowed disabled:hover:text-neutral-500"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Anterior
            </motion.button>

            {/* Botón Siguiente/Finalizar */}
            <motion.button
              whileHover={{ scale: canProceed ? 1.02 : 1 }}
              whileTap={{ scale: canProceed ? 0.98 : 1 }}
              onClick={handleNext}
              disabled={!canProceed && currentQuestion?.required}
              className={`btn-primary flex items-center gap-2
                        ${!canProceed && currentQuestion?.required
                          ? 'opacity-50 cursor-not-allowed'
                          : ''}`}
            >
              {isLastQuestion
                ? (level === 1 ? 'Ver opciones' : 'Ver resultados personalizados')
                : 'Continuar'}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </motion.button>
          </div>

          {/* Hint para preguntas opcionales */}
          {currentQuestion && !currentQuestion.required && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-neutral-400 mt-4"
            >
              Podes saltear esta pregunta
            </motion.p>
          )}

          {/* Tiempo estimado */}
          <p className="text-center text-xs text-neutral-300 mt-6">
            {level === 1 ? '~2 minutos' : '~3 minutos mas'}
          </p>
        </footer>
      </main>
    </>
  )
}
