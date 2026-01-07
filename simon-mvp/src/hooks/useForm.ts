import { useState, useCallback } from 'react'
import { questions, Question } from '@/data/formQuestions'

export interface FormState {
  [questionId: string]: any
}

export function useForm() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<FormState>({})
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [startTime] = useState(Date.now())

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
    buildFormData
  }
}
