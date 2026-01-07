import { motion } from 'framer-motion'
import { useState } from 'react'

interface NumberInputProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder: string
  unit: string
  min?: number
  max?: number
}

export default function NumberInput({
  value,
  onChange,
  placeholder,
  unit,
  min,
  max
}: NumberInputProps) {
  const [focused, setFocused] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val === '') {
      onChange(undefined)
      return
    }
    const num = parseInt(val.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(num)) {
      if (max && num > max) return
      onChange(num)
    }
  }

  const formatValue = (val: number | undefined) => {
    if (val === undefined) return ''
    return val.toLocaleString('es-BO')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto"
    >
      <div className={`relative border-b-2 transition-colors duration-200 ${
        focused ? 'border-neutral-900' : 'border-neutral-200'
      }`}>
        <input
          type="text"
          inputMode="numeric"
          value={formatValue(value)}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="w-full py-4 text-4xl font-light text-center bg-transparent
                     outline-none placeholder:text-neutral-300"
        />
        <span className={`absolute right-0 top-1/2 -translate-y-1/2 text-xl
                         transition-colors duration-200 ${
          value ? 'text-neutral-600' : 'text-neutral-300'
        }`}>
          {unit}
        </span>
      </div>

      {/* Quick buttons */}
      {unit === 'USD' && (
        <div className="flex justify-center gap-3 mt-6">
          {[80000, 120000, 150000, 200000].map((amount) => (
            <button
              key={amount}
              onClick={() => onChange(amount)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all
                         ${value === amount
                           ? 'bg-neutral-900 text-white'
                           : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
            >
              ${(amount / 1000)}k
            </button>
          ))}
        </div>
      )}

      {unit === 'USD/mes' && (
        <div className="flex justify-center gap-3 mt-6">
          {[300, 500, 800, 1000, 1500].map((amount) => (
            <button
              key={amount}
              onClick={() => onChange(amount)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all
                         ${value === amount
                           ? 'bg-neutral-900 text-white'
                           : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
            >
              ${amount}
            </button>
          ))}
        </div>
      )}

      {unit === 'm2' && (
        <div className="flex justify-center gap-3 mt-6">
          {[60, 80, 100, 120, 150].map((amount) => (
            <button
              key={amount}
              onClick={() => onChange(amount)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all
                         ${value === amount
                           ? 'bg-neutral-900 text-white'
                           : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
            >
              {amount}m2
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
