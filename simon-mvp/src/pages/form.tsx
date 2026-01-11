import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useForm } from '@/hooks/useForm'
import { supabase } from '@/lib/supabase'
import ProgressBar from '@/components/ProgressBar'
import QuestionCard from '@/components/QuestionCard'

export default function FormPage() {
  const router = useRouter()
  const { startSection } = router.query
  const [leadId, setLeadId] = useState<number | null>(null)
  const lastSavedSection = useRef<string | null>(null)

  const {
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
    buildFormData,
    getCurrentSection,
    getSectionAnswers,
    saveProgress,
    getElapsedSeconds
  } = useForm(typeof startSection === 'string' ? startSection : undefined)

  // Verificar lead_id al montar
  useEffect(() => {
    const storedLeadId = localStorage.getItem('simon_lead_id')
    if (!storedLeadId) {
      // No hay lead, redirigir a contacto
      router.push('/contact')
      return
    }
    setLeadId(parseInt(storedLeadId))
  }, [router])

  // Guardar progreso cuando cambia de sección
  useEffect(() => {
    const currentSec = getCurrentSection()

    // Si cambió de sección y tenemos lead_id, guardar progreso
    if (lastSavedSection.current && lastSavedSection.current !== currentSec && leadId) {
      const completedSection = lastSavedSection.current
      const sectionAnswers = getSectionAnswers(completedSection)

      // Guardar en localStorage primero (rápido)
      saveProgress()

      // Guardar en BD (async)
      if (supabase) {
        supabase.rpc('actualizar_progreso_seccion', {
          p_lead_id: leadId,
          p_seccion: completedSection,
          p_respuestas: sectionAnswers
        }).then(({ error }) => {
          if (error) console.error('Error guardando progreso:', error)
        })
      }
    }

    lastSavedSection.current = currentSec
  }, [currentIndex, getCurrentSection, getSectionAnswers, leadId, saveProgress])

  const handleNext = async () => {
    if (isLastQuestion && canProceed) {
      // Guardar formulario completo
      const formData = buildFormData()
      localStorage.setItem('simon_form_data', JSON.stringify(formData))

      // Guardar en BD si tenemos lead_id y supabase
      if (leadId && supabase) {
        try {
          await supabase.rpc('finalizar_formulario', {
            p_lead_id: leadId,
            p_formulario: formData,
            p_tiempo_segundos: getElapsedSeconds()
          })

          // Notificar a Slack
          const leadNombre = localStorage.getItem('simon_lead_nombre') || ''
          fetch('/api/notify-slack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'form_completed',
              leadId,
              data: { nombre: leadNombre }
            })
          }).catch(() => {})

        } catch (error) {
          console.error('Error finalizando formulario:', error)
        }
      }

      // Ir a página de resumen
      router.push('/summary')
    } else {
      next()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canProceed) {
      handleNext()
    }
  }

  // Si viene de editar desde summary, mostrar botón diferente
  const isEditing = typeof startSection === 'string'

  return (
    <>
      <Head>
        <title>Formulario | Simon</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main
        className="min-h-screen flex flex-col px-6 py-8"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Header */}
        <header className="w-full max-w-2xl mx-auto mb-8">
          <ProgressBar
            currentQuestion={currentIndex}
            totalQuestions={totalQuestions}
            currentSection={currentQuestion.section}
          />
        </header>

        {/* Question area */}
        <div className="flex-1 flex items-center justify-center">
          <QuestionCard
            question={currentQuestion}
            answer={answers[currentQuestion.id]}
            onAnswer={setAnswer}
            direction={direction}
          />
        </div>

        {/* Navigation */}
        <footer className="w-full max-w-2xl mx-auto mt-8">
          <div className="flex justify-between items-center">
            {/* Back button */}
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

            {/* Next/Submit button */}
            <motion.button
              whileHover={{ scale: canProceed ? 1.02 : 1 }}
              whileTap={{ scale: canProceed ? 0.98 : 1 }}
              onClick={handleNext}
              disabled={!canProceed && currentQuestion.required}
              className={`btn-primary flex items-center gap-2
                        ${!canProceed && currentQuestion.required
                          ? 'opacity-50 cursor-not-allowed'
                          : ''}`}
            >
              {isLastQuestion
                ? (isEditing ? 'Volver al resumen' : 'Confirmar respuestas')
                : 'Continuar'}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </motion.button>
          </div>

          {/* Skip hint for optional questions */}
          {!currentQuestion.required && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-neutral-400 mt-4"
            >
              Podes saltear esta pregunta si preferis
            </motion.p>
          )}

          {/* Keyboard hint */}
          <p className="text-center text-xs text-neutral-300 mt-6">
            Presiona Enter para continuar
          </p>

          {/* Link to go back to summary if editing */}
          {isEditing && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => router.push('/summary')}
              className="w-full text-center text-sm text-neutral-500 hover:text-neutral-700 mt-4 underline"
            >
              Volver al resumen sin guardar
            </motion.button>
          )}
        </footer>
      </main>
    </>
  )
}
