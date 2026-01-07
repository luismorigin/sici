import { motion } from 'framer-motion'
import { useState } from 'react'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  multiline?: boolean
}

export default function TextInput({
  value,
  onChange,
  placeholder,
  multiline = false
}: TextInputProps) {
  const [focused, setFocused] = useState(false)

  const InputComponent = multiline ? 'textarea' : 'input'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg mx-auto"
    >
      <div className={`relative border-b-2 transition-colors duration-200 ${
        focused ? 'border-neutral-900' : 'border-neutral-200'
      }`}>
        <InputComponent
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          rows={multiline ? 3 : undefined}
          className={`w-full py-4 text-xl font-light bg-transparent
                     outline-none placeholder:text-neutral-400 resize-none
                     ${multiline ? 'text-left' : 'text-center'}`}
        />
      </div>

      <p className="text-center text-sm text-neutral-400 mt-4">
        {value.length > 0
          ? `${value.length} caracteres`
          : 'Podes dejarlo vacio si preferis'}
      </p>
    </motion.div>
  )
}
