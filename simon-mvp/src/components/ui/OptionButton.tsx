import { motion } from 'framer-motion'
import clsx from 'clsx'

interface OptionButtonProps {
  label: string
  icon?: string
  selected: boolean
  onClick: () => void
  type: 'single' | 'multiple'
  index: number
}

export default function OptionButton({
  label,
  icon,
  selected,
  onClick,
  type,
  index
}: OptionButtonProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={onClick}
      className={clsx(
        'w-full p-4 rounded-2xl border-2 text-left transition-all duration-200',
        'flex items-center gap-4 group',
        selected
          ? 'border-neutral-900 bg-neutral-900 text-white'
          : 'border-neutral-200 hover:border-neutral-400 bg-white'
      )}
    >
      {/* Checkbox/Radio indicator */}
      <div
        className={clsx(
          'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0',
          'transition-all duration-200',
          selected
            ? 'border-white bg-white'
            : 'border-neutral-300 group-hover:border-neutral-400'
        )}
      >
        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={clsx(
              type === 'single' ? 'w-3 h-3 rounded-full bg-neutral-900' : '',
              type === 'multiple' ? 'text-neutral-900' : ''
            )}
          >
            {type === 'multiple' && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </motion.div>
        )}
      </div>

      {/* Icon */}
      {icon && (
        <span className="text-2xl flex-shrink-0">{icon}</span>
      )}

      {/* Label */}
      <span className={clsx(
        'text-lg font-medium',
        selected ? 'text-white' : 'text-neutral-700'
      )}>
        {label}
      </span>
    </motion.button>
  )
}
