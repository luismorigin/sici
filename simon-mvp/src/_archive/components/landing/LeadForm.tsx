'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

export type LeadTipo = 'comprador' | 'vendedor' | 'broker' | 'avaluador'

interface LeadFormProps {
  tipo?: LeadTipo
}

export default function LeadForm({ tipo = 'comprador' }: LeadFormProps) {
  return (
    <div className="bg-white border-t border-slate-200 p-8" id="cta-form">
      <div className="max-w-md mx-auto text-center">
        <h3 className="font-display text-2xl font-bold text-brand-dark mb-2">
          Obtené tu análisis personalizado
        </h3>
        <p className="text-slate-500 mb-6">
          Compará precios, descubrí oportunidades y encontrá el depto ideal para vos.
        </p>

        <Link href="/filtros">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-primary w-full py-4 text-base"
          >
            🔍 Empezar Búsqueda Gratis
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </motion.button>
        </Link>

        <p className="text-xs text-slate-400 mt-4">
          Sin registro. 100% gratis. Resultados inmediatos.
        </p>
      </div>
    </div>
  )
}
