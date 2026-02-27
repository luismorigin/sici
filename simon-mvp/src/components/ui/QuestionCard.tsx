import { motion, AnimatePresence } from 'framer-motion'
import { Question } from '@/data/formQuestions'
import OptionButton from './OptionButton'
import NumberInput from './NumberInput'
import TextInput from './TextInput'
import MicrozonasMap from './MicrozonasMap'

interface QuestionCardProps {
  question: Question
  answer: any
  onAnswer: (value: any) => void
  direction: 'forward' | 'backward'
}

export default function QuestionCard({
  question,
  answer,
  onAnswer,
  direction
}: QuestionCardProps) {
  const handleSingleSelect = (optionId: string) => {
    onAnswer(optionId)
  }

  const handleMultipleSelect = (optionId: string) => {
    const current = Array.isArray(answer) ? answer : []
    if (current.includes(optionId)) {
      onAnswer(current.filter((id: string) => id !== optionId))
    } else {
      // Max 3 for preocupaciones
      if (question.id === 'H1' && current.length >= 3) {
        return
      }
      onAnswer([...current, optionId])
    }
  }

  const variants = {
    enter: (direction: 'forward' | 'backward') => ({
      x: direction === 'forward' ? 100 : -100,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction: 'forward' | 'backward') => ({
      x: direction === 'forward' ? -100 : 100,
      opacity: 0
    })
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={question.id}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="w-full max-w-2xl mx-auto"
      >
        {/* Mapa de microzonas para pregunta D1 */}
        {question.id === 'D1' && <MicrozonasMap />}

        {/* Question header */}
        <div className="text-center mb-10">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-semibold text-neutral-900 mb-3"
          >
            {question.question}
          </motion.h2>
          {question.subtitle && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-neutral-500"
            >
              {question.subtitle}
            </motion.p>
          )}
        </div>

        {/* Answer area */}
        <div className="space-y-3">
          {/* Single select */}
          {question.type === 'single' && question.options && (
            <div className="space-y-3">
              {question.options.map((option, index) => (
                <OptionButton
                  key={option.id}
                  label={option.label}
                  icon={option.icon}
                  selected={answer === option.id}
                  onClick={() => handleSingleSelect(option.id)}
                  type="single"
                  index={index}
                />
              ))}
            </div>
          )}

          {/* Multiple select */}
          {question.type === 'multiple' && question.options && (
            <div className="space-y-3">
              {question.options.map((option, index) => (
                <OptionButton
                  key={option.id}
                  label={option.label}
                  icon={option.icon}
                  selected={Array.isArray(answer) && answer.includes(option.id)}
                  onClick={() => handleMultipleSelect(option.id)}
                  type="multiple"
                  index={index}
                />
              ))}
            </div>
          )}

          {/* Number input */}
          {question.type === 'number' && (
            <NumberInput
              value={answer}
              onChange={onAnswer}
              placeholder={question.placeholder || ''}
              unit={question.unit || ''}
              min={question.min}
              max={question.max}
            />
          )}

          {/* Text input */}
          {question.type === 'text' && (
            <TextInput
              value={answer || ''}
              onChange={onAnswer}
              placeholder={question.placeholder || ''}
              multiline={question.id.includes('B5') || question.id.includes('I2')}
            />
          )}

          {/* Chips */}
          {question.type === 'chips' && question.chips && (
            <div className="flex flex-wrap justify-center gap-3">
              {question.chips.map((chip, index) => (
                <motion.button
                  key={chip}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onAnswer(chip)}
                  className={`px-6 py-3 rounded-full text-lg font-medium transition-all
                             ${answer === chip
                               ? 'bg-neutral-900 text-white'
                               : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                >
                  {chip}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
