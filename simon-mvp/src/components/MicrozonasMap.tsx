import { motion } from 'framer-motion'
import Image from 'next/image'

// Microzonas de Equipetrol (6 residenciales + Flexible)
interface MicrozonaInfo {
  id: string
  nombre: string
  color: string
}

const microzonas: MicrozonaInfo[] = [
  { id: 'equipetrol', nombre: 'Equipetrol (consolidado)', color: '#3388ff' },
  { id: 'sirari', nombre: 'Sirari (premium tranquila)', color: '#ff7800' },
  { id: 'equipetrol_norte_norte', nombre: 'Eq. Norte/Norte (premium)', color: '#ff0000' },
  { id: 'equipetrol_norte_sur', nombre: 'Eq. Norte/Sur (premium tranquila)', color: '#ff6666' },
  { id: 'villa_brigida', nombre: 'Villa Brigida (emergente)', color: '#00ff00' },
  { id: 'faremafu', nombre: 'Faremafu (buffer)', color: '#9900ff' },
]

export default function MicrozonasMap() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl mx-auto mb-8 p-4 bg-neutral-50 rounded-2xl"
    >
      <h3 className="text-sm font-medium text-neutral-500 mb-4 text-center">
        Microzonas de Equipetrol
      </h3>

      {/* Mapa imagen real */}
      <div className="relative w-full aspect-[4/3] bg-white rounded-xl overflow-hidden border border-neutral-200">
        <Image
          src="/microzonas-equipetrol.png"
          alt="Mapa de microzonas de Equipetrol"
          fill
          className="object-contain"
          priority
        />
      </div>

      {/* Leyenda */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
        {microzonas.map((z) => (
          <div key={z.id} className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: z.color }}
            />
            <span className="text-neutral-600">{z.nombre}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-400 text-center mt-3">
        Todas las zonas estan dentro de Equipetrol, Santa Cruz
      </p>
    </motion.div>
  )
}
