import { useState, useCallback, useEffect } from 'react'
import {
  level1Questions,
  level2Questions,
  Question,
  extractMBFFilters,
  extractFiduciaryContext
} from '@/data/formQuestionsV2'

export interface FormState {
  [questionId: string]: any
}

export type FormLevel = 1 | 2

export function useFormV2(initialLevel: FormLevel = 1) {
  const [level, setLevel] = useState<FormLevel>(initialLevel)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<FormState>({})
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [startTime] = useState(Date.now())
  const [isInitialized, setIsInitialized] = useState(false)

  // Obtener preguntas según nivel
  const getQuestions = useCallback(() => {
    return level === 1 ? level1Questions : level2Questions
  }, [level])

  const questions = getQuestions()
  const currentQuestion = questions[currentIndex]
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === questions.length - 1

  // Restaurar respuestas guardadas AL INICIO
  useEffect(() => {
    if (isInitialized) return

    // Siempre restaurar respuestas de nivel 1 (de simon_form_data o simon_form_v2)
    const savedFormData = localStorage.getItem('simon_form_data')
    const savedProgress = localStorage.getItem('simon_form_v2')

    let restoredAnswers: FormState = {}

    // Primero intentar de simon_form_data (datos completos)
    if (savedFormData) {
      try {
        const parsed = JSON.parse(savedFormData)
        if (parsed.respuestas) {
          restoredAnswers = { ...parsed.respuestas }
        }
      } catch (e) {
        console.error('Error parsing simon_form_data:', e)
      }
    }

    // También de simon_form_v2 (progreso parcial)
    if (savedProgress) {
      try {
        const parsed = JSON.parse(savedProgress)
        if (parsed.answers) {
          restoredAnswers = { ...restoredAnswers, ...parsed.answers }
        }
      } catch (e) {
        console.error('Error parsing simon_form_v2:', e)
      }
    }

    if (Object.keys(restoredAnswers).length > 0) {
      setAnswers(restoredAnswers)
    }

    // El nivel viene del initialLevel (de la URL), NO del localStorage
    // Esto permite que ?level=2 funcione correctamente
    setLevel(initialLevel)
    setCurrentIndex(0)
    setIsInitialized(true)
  }, [initialLevel, isInitialized])

  // Verificar si puede continuar
  const canProceed = useCallback(() => {
    if (!currentQuestion) return false
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
      return answer !== undefined && answer.trim() !== ''
    }

    return true
  }, [currentQuestion, answers])

  // Setear respuesta
  const setAnswer = useCallback((value: any) => {
    if (!currentQuestion) return
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }))
  }, [currentQuestion])

  // Siguiente pregunta
  const next = useCallback(() => {
    if (!canProceed()) return false

    setDirection('forward')

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      return true
    }

    return false
  }, [currentIndex, canProceed, questions.length])

  // Pregunta anterior
  const previous = useCallback(() => {
    setDirection('backward')

    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      return true
    }

    return false
  }, [currentIndex])

  // Cambiar a nivel 2
  const goToLevel2 = useCallback(() => {
    setLevel(2)
    setCurrentIndex(0)
  }, [])

  // Obtener tiempo transcurrido
  const getElapsedSeconds = useCallback(() => {
    return Math.round((Date.now() - startTime) / 1000)
  }, [startTime])

  // Guardar progreso
  const saveProgress = useCallback(() => {
    const data = {
      level,
      answers,
      timestamp: Date.now()
    }
    localStorage.setItem('simon_form_v2', JSON.stringify(data))
  }, [level, answers])

  // Construir datos del formulario
  const buildFormData = useCallback(() => {
    return {
      tipo_formulario: 'vivienda_mvp_v2',
      version: '2.0',
      nivel_completado: level,
      fecha: new Date().toISOString(),
      tiempo_segundos: getElapsedSeconds(),
      respuestas: answers,
      // Filtros MBF para búsqueda SQL
      mbf_filtros: extractMBFFilters(answers),
      // Contexto fiduciario (solo si nivel 2)
      contexto_fiduciario: level === 2 ? extractFiduciaryContext(answers) : null
    }
  }, [level, answers, getElapsedSeconds])

  // Obtener filtros MBF
  const getMBFFilters = useCallback(() => {
    return extractMBFFilters(answers)
  }, [answers])

  // Obtener contexto fiduciario
  const getFiduciaryContext = useCallback(() => {
    return extractFiduciaryContext(answers)
  }, [answers])

  // Obtener nombre del usuario (de nivel 1)
  const getUserName = useCallback(() => {
    return answers.L1_nombre || ''
  }, [answers])

  return {
    // Estado
    level,
    currentQuestion,
    currentIndex,
    totalQuestions: questions.length,
    answers,
    direction,
    isFirstQuestion,
    isLastQuestion,
    canProceed: canProceed(),

    // Acciones
    setAnswer,
    next,
    previous,
    goToLevel2,
    saveProgress,

    // Datos
    getElapsedSeconds,
    buildFormData,
    getMBFFilters,
    getFiduciaryContext,
    getUserName,

    // Info
    isLevel1Complete: level === 1 && isLastQuestion && canProceed(),
    isLevel2Complete: level === 2 && isLastQuestion && canProceed(),
  }
}
