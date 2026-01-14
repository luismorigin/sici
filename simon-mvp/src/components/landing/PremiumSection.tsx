import { motion } from 'framer-motion'
import { useState } from 'react'
import PremiumModal from './PremiumModal'

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    title: 'Comparador TOP 3',
    description: 'Tus 3 mejores opciones lado a lado: precio/m², amenities, días publicado. Comparás con la misma base.'
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Precio vs Mercado',
    description: 'Sabé si estás pagando de más. Te mostramos cómo se compara cada depto contra el promedio de su zona.'
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Lo que NO sabemos',
    description: 'Somos honestos: expensas, parqueo incluido, estado real. Te marcamos qué falta verificar antes de decidir.'
  }
]

export default function PremiumSection() {
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    // Guardar en localStorage por ahora (TODO: conectar a Supabase leads_mvp)
    const waitlist = JSON.parse(localStorage.getItem('premium_waitlist') || '[]')
    waitlist.push({ email, timestamp: new Date().toISOString(), interes_premium: true })
    localStorage.setItem('premium_waitlist', JSON.stringify(waitlist))

    setSubmitted(true)
    setLoading(false)
  }

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
              <span className="text-slate-400">Compará con datos reales, no con intuición.</span>
            </p>

            {/* Price */}
            <div className="mb-10">
              <span className="text-2xl text-slate-500 line-through mr-3">$49.99</span>
              <span className="text-5xl font-extrabold text-premium-gold">$29.99</span>
              <p className="text-slate-400 mt-2">Precio de lanzamiento</p>
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

            {/* CTA: Ver Ejemplo */}
            <div className="mb-10">
              <button
                onClick={() => setShowModal(true)}
                className="btn btn-gold-outline px-8 py-4 text-base"
              >
                Ver Ejemplo Real
              </button>
            </div>

            {/* Waitlist Section */}
            <div className="bg-white/5 border border-premium-gold/30 rounded-2xl p-8 max-w-md mx-auto">
              <div className="text-premium-gold text-2xl mb-2">🎁</div>
              <h4 className="text-white font-bold text-lg mb-2">
                ¿Querés probarlo gratis?
              </h4>
              <p className="text-slate-400 text-sm mb-4">
                Los primeros 50 lo reciben sin costo. Dejá tu email y te avisamos.
              </p>

              {submitted ? (
                <div className="text-state-success text-sm">
                  ✓ ¡Listo! Te avisamos cuando esté disponible.
                </div>
              ) : (
                <form onSubmit={handleWaitlist} className="flex gap-2">
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-premium-gold"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-gold px-6 py-3 text-sm whitespace-nowrap"
                  >
                    {loading ? '...' : 'Unirme'}
                  </button>
                </form>
              )}

              <p className="text-slate-500 text-xs mt-4">
                🔒 Sin compromiso · Te avisamos por email
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {showModal && <PremiumModal onClose={() => setShowModal(false)} />}
    </>
  )
}
