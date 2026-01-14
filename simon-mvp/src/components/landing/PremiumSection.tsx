import { motion } from 'framer-motion'
import { useState } from 'react'
import PremiumModal from './PremiumModal'

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Seguridad de Compra',
    description: 'Analizamos 32 variables críticas para detectar problemas legales o estructurales ocultos.'
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: 'Valor y Plusvalía',
    description: 'Entendé si estás pagando el precio justo y cuánto valdrá tu departamento en el futuro.'
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
    title: 'Mapa de Vida Real',
    description: 'Conocé el entorno real: ruidos, tráfico, seguridad nocturna y comodidad diaria.'
  }
]

export default function PremiumSection() {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <section className="py-24 bg-brand-dark relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-premium-gold/15 to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {/* Badge */}
            <span className="badge badge-premium mb-6">
              Recomendado para Compradores e Inversores Serios
            </span>

            {/* Title */}
            <h2 className="font-display text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent mb-6">
              Informe Fiduciario Premium
            </h2>

            {/* Subtitle */}
            <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-8">
              ¿Vas a tomar una decisión de $150,000? No lo hagas a ciegas.
              <br />
              <span className="text-slate-400">Obtén seguridad total, detección de riesgos y una proyección clara de valor antes de firmar nada.</span>
            </p>

            {/* Price */}
            <div className="mb-10">
              <span className="text-5xl font-extrabold text-premium-gold">29.99 $us</span>
              <p className="text-slate-400 mt-2">Pago único. Garantía de Satisfacción.</p>
            </div>

            {/* Features grid */}
            <div className="grid md:grid-cols-3 gap-6 text-left mb-10">
              {features.map((feature, i) => (
                <motion.div
                  key={i}
                  className="bg-white/5 border border-white/10 rounded-2xl p-6"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="text-premium-gold mb-3">
                    {feature.icon}
                  </div>
                  <h4 className="font-bold text-white mb-2">{feature.title}</h4>
                  <p className="text-sm text-slate-400">{feature.description}</p>
                </motion.div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 justify-center">
              <button className="btn btn-gold px-8 py-4 text-base">
                Obtener Informe Premium
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="btn btn-gold-outline px-8 py-4 text-base"
              >
                Ver Ejemplo Real
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {showModal && <PremiumModal onClose={() => setShowModal(false)} />}
    </>
  )
}
