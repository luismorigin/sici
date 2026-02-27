import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { sections, questions } from '@/data/formQuestions'

interface FormData {
  respuestas: { [key: string]: any }
  tiempo_segundos: number
}

export default function SummaryPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<FormData | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>('A')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Verificar que tenemos lead_id y form_data
    const leadId = localStorage.getItem('simon_lead_id')
    const data = localStorage.getItem('simon_form_data')

    if (!leadId) {
      router.push('/contact')
      return
    }

    if (!data) {
      router.push('/form')
      return
    }

    try {
      setFormData(JSON.parse(data))
    } catch (e) {
      router.push('/form')
    }
  }, [router])

  const getAnswerDisplay = (questionId: string, answer: any): string => {
    if (answer === undefined || answer === null || answer === '') {
      return '(sin responder)'
    }

    const question = questions.find(q => q.id === questionId)
    if (!question) return String(answer)

    // Para preguntas de opción única, buscar el label
    if (question.type === 'single' && question.options) {
      const option = question.options.find(o => o.id === answer)
      return option ? `${option.icon || ''} ${option.label}`.trim() : String(answer)
    }

    // Para preguntas múltiples, mostrar lista
    if (question.type === 'multiple' && Array.isArray(answer)) {
      if (question.options) {
        return answer
          .map(a => {
            const opt = question.options?.find(o => o.id === a)
            return opt ? opt.label : a
          })
          .join(', ')
      }
      return answer.join(', ')
    }

    // Para números con unidad
    if (question.type === 'number' && question.unit) {
      return `${Number(answer).toLocaleString()} ${question.unit}`
    }

    // Para chips
    if (question.type === 'chips') {
      return String(answer)
    }

    return String(answer)
  }

  const getSectionQuestions = (sectionId: string) => {
    return questions.filter(q => q.section === sectionId)
  }

  const handleEditSection = (sectionId: string) => {
    router.push(`/form?startSection=${sectionId}`)
  }

  const handleGenerateGuia = () => {
    setLoading(true)
    router.push('/results')
  }

  if (!formData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900" />
      </main>
    )
  }

  const leadNombre = localStorage.getItem('simon_lead_nombre') || 'Usuario'

  return (
    <>
      <Head>
        <title>Confirmar respuestas | Simon</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen px-6 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Listo, {leadNombre.split(' ')[0]}!
            </h1>
            <p className="text-neutral-600">
              Revisá tus respuestas antes de generar tu Guía Fiduciaria
            </p>
          </motion.div>

          {/* Sections Accordion */}
          <div className="space-y-3 mb-8">
            {sections.map((section, index) => {
              const sectionQuestions = getSectionQuestions(section.id)
              const isExpanded = expandedSection === section.id
              const answeredCount = sectionQuestions.filter(
                q => formData.respuestas[q.id] !== undefined &&
                     formData.respuestas[q.id] !== '' &&
                     formData.respuestas[q.id] !== null
              ).length

              return (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
                >
                  {/* Section Header */}
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{section.emoji}</span>
                      <div className="text-left">
                        <p className="font-medium text-neutral-900">{section.name}</p>
                        <p className="text-sm text-neutral-500">
                          {answeredCount} de {sectionQuestions.length} respuestas
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditSection(section.id)
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1"
                      >
                        Editar
                      </button>
                      <svg
                        className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Section Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-3 border-t border-neutral-100 pt-3">
                          {sectionQuestions.map(q => {
                            const answer = formData.respuestas[q.id]
                            // Skip conditional questions that weren't shown
                            if (q.id === 'A1_hijos' && formData.respuestas['A1'] !== 'pareja_con_hijos') {
                              return null
                            }

                            return (
                              <div key={q.id} className="flex justify-between items-start gap-4">
                                <p className="text-sm text-neutral-600 flex-1">
                                  {q.question}
                                </p>
                                <p className="text-sm font-medium text-neutral-900 text-right max-w-[50%]">
                                  {getAnswerDisplay(q.id, answer)}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>

          {/* Time spent */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center text-sm text-neutral-400 mb-6"
          >
            Tiempo en el formulario: {Math.round(formData.tiempo_segundos / 60)} minutos
          </motion.p>

          {/* Generate Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-3"
          >
            <button
              onClick={handleGenerateGuia}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all
                         flex items-center justify-center gap-3
                         ${loading
                           ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                           : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generando tu guía...
                </>
              ) : (
                <>
                  Generar mi Guía Fiduciaria
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </>
              )}
            </button>

            <button
              onClick={() => router.push('/form')}
              className="w-full py-3 text-neutral-500 hover:text-neutral-700 text-sm"
            >
              Volver al cuestionario
            </button>
          </motion.div>
        </div>
      </main>
    </>
  )
}
