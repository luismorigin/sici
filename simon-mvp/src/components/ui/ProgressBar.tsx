import { motion } from 'framer-motion'
import { sections } from '@/data/formQuestions'

interface ProgressBarProps {
  currentQuestion: number
  totalQuestions: number
  currentSection: string
}

export default function ProgressBar({
  currentQuestion,
  totalQuestions,
  currentSection
}: ProgressBarProps) {
  const progress = ((currentQuestion + 1) / totalQuestions) * 100
  const section = sections.find(s => s.id === currentSection)

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      {/* Section indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{section?.emoji}</span>
          <span className="text-sm font-medium text-neutral-600">
            {section?.name}
          </span>
        </div>
        <span className="text-sm text-neutral-400">
          {currentQuestion + 1} / {totalQuestions}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-neutral-900 rounded-full progress-bar"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Section dots */}
      <div className="flex justify-between mt-3">
        {sections.map((s) => (
          <div
            key={s.id}
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              s.id <= currentSection
                ? 'bg-neutral-900'
                : 'bg-neutral-200'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
