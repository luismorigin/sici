import { useState, useCallback, useEffect } from 'react'
import { questions, Question, sections } from '@/data/formQuestions'

export interface FormState {
  [questionId: string]: any
}

export function useForm(initialSection?: string) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<FormState>({})
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [startTime] = useState(Date.now())
  const [previousSection, setPreviousSection] = useState<string | null>(null)

  // Restaurar respuestas guardadas de localStorage al montar
  useEffect(() => {
    const saved = localStorage.getItem('simon_form_data')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.respuestas) {
          setAnswers(parsed.respuestas)
        }
      } catch (e) {
        console.error('Error parsing saved form data:', e)
      }
    }

    // Si hay sección inicial, navegar a ella
    if (initialSection) {
      const firstQuestionIndex = questions.findIndex(q => q.section === initialSection)
      if (firstQuestionIndex >= 0) {
        setCurrentIndex(firstQuestionIndex)
      }
    }
  }, [initialSection])

  const currentQuestion = questions[currentIndex]
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === questions.length - 1

  // Check if current question should be skipped
  const shouldSkipQuestion = useCallback((q: Question, answers: FormState): boolean => {
    // Skip A1_hijos unless A1 is pareja_con_hijos
    if (q.id === 'A1_hijos') {
      return answers['A1'] !== 'pareja_con_hijos'
    }
    return false
  }, [])

  // Check if can proceed
  const canProceed = useCallback(() => {
    const answer = answers[currentQuestion.id]

    if (!currentQuestion.required) return true

    if (currentQuestion.type === 'single') {
      return answer !== undefined && answer !== ''
    }

    if (currentQuestion.type === 'multiple') {
      return Array.isArray(answer) && answer.length > 0
    }

    if (currentQuestion.type === 'number') {
      return answer !== undefined && answer > 0
    }

    if (currentQuestion.type === 'text') {
      return true // Text is usually optional
    }

    return true
  }, [currentQuestion, answers])

  // Set answer for current question
  const setAnswer = useCallback((value: any) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }))
  }, [currentQuestion.id])

  // Go to next question
  const next = useCallback(() => {
    if (!canProceed()) return false

    setDirection('forward')

    let nextIndex = currentIndex + 1

    // Skip questions that should be skipped
    while (nextIndex < questions.length && shouldSkipQuestion(questions[nextIndex], answers)) {
      nextIndex++
    }

    if (nextIndex < questions.length) {
      setCurrentIndex(nextIndex)
      return true
    }

    return false // No more questions
  }, [currentIndex, canProceed, answers, shouldSkipQuestion])

  // Go to previous question
  const previous = useCallback(() => {
    setDirection('backward')

    let prevIndex = currentIndex - 1

    // Skip questions that should be skipped
    while (prevIndex >= 0 && shouldSkipQuestion(questions[prevIndex], answers)) {
      prevIndex--
    }

    if (prevIndex >= 0) {
      setCurrentIndex(prevIndex)
      return true
    }

    return false
  }, [currentIndex, answers, shouldSkipQuestion])

  // Calculate elapsed time
  const getElapsedSeconds = useCallback(() => {
    return Math.round((Date.now() - startTime) / 1000)
  }, [startTime])

  // Build the final form data
  const buildFormData = useCallback(() => {
    return {
      tipo_formulario: 'vivienda_propia',
      version: '1.0',
      fecha: new Date().toISOString(),
      tiempo_segundos: getElapsedSeconds(),
      respuestas: answers
    }
  }, [answers, getElapsedSeconds])

  // Get current section
  const getCurrentSection = useCallback(() => {
    return currentQuestion.section
  }, [currentQuestion])

  // Get section info
  const getSectionInfo = useCallback((sectionId: string) => {
    return sections.find(s => s.id === sectionId)
  }, [])

  // Get answers for a specific section
  const getSectionAnswers = useCallback((sectionId: string) => {
    const sectionQuestions = questions.filter(q => q.section === sectionId)
    const sectionAnswers: FormState = {}
    sectionQuestions.forEach(q => {
      if (answers[q.id] !== undefined) {
        sectionAnswers[q.id] = answers[q.id]
      }
    })
    return sectionAnswers
  }, [answers])

  // Check if section changed (for triggering saves)
  const checkSectionChange = useCallback(() => {
    const currentSec = currentQuestion.section
    if (previousSection && previousSection !== currentSec) {
      const changedFrom = previousSection
      setPreviousSection(currentSec)
      return changedFrom // Return the section that was just completed
    }
    setPreviousSection(currentSec)
    return null
  }, [currentQuestion.section, previousSection])

  // Go to specific section (first question of that section)
  const goToSection = useCallback((sectionId: string) => {
    const firstQuestionIndex = questions.findIndex(q => q.section === sectionId)
    if (firstQuestionIndex >= 0) {
      setDirection('forward')
      setCurrentIndex(firstQuestionIndex)
      return true
    }
    return false
  }, [])

  // Save current progress to localStorage
  const saveProgress = useCallback(() => {
    const formData = buildFormData()
    localStorage.setItem('simon_form_data', JSON.stringify(formData))
  }, [buildFormData])

  return {
    currentQuestion,
    currentIndex,
    totalQuestions: questions.length,
    answers,
    direction,
    isFirstQuestion,
    isLastQuestion,
    canProceed: canProceed(),
    setAnswer,
    next,
    previous,
    getElapsedSeconds,
    buildFormData,
    // Nuevas funciones para el flujo refactorizado
    getCurrentSection,
    getSectionInfo,
    getSectionAnswers,
    checkSectionChange,
    goToSection,
    saveProgress,
    sections
  }
}
