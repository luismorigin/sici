import { motion } from 'framer-motion'
import Link from 'next/link'

const personas = [
  { icon: '🏢', text: 'Querés vivir en Equipetrol' },
  { icon: '⏰', text: 'No querés perder tiempo con portales y varios agentes' },
  { icon: '🔀', text: 'Te marean tantas opciones' },
  { icon: '🛡️', text: 'No confiás en anuncios desactualizados' },
  { icon: '🔍', text: 'Necesitás claridad absoluta' },
  { icon: '🎯', text: 'Querés ver solo lo que encaja con vos' }
]

export default function WhoSection() {
  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200" id="para-quien">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center max-w-xl mx-auto mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-brand-dark mb-4">
            ¿Para quién es Simón?
          </h2>
          <p className="text-slate-500">
            Simón no es para todos. Es una herramienta especializada para compradores exigentes.
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {personas.map((persona, i) => (
            <motion.div
              key={i}
              className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-brand-primary hover:shadow-sm transition-all cursor-default"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xl flex-shrink-0">
                {persona.icon}
              </div>
              <span className="font-semibold text-brand-dark">{persona.text}</span>
            </motion.div>
          ))}
        </div>

        {/* CTA box */}
        <motion.div
          className="max-w-lg mx-auto bg-white border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h4 className="font-display text-xl font-bold text-brand-dark mb-3">
            ¿Te sentís identificado?
          </h4>
          <p className="text-slate-500 mb-6">
            Si respondiste sí a la mayoría, entonces Simón es tu mejor aliado.
          </p>
          <Link href="#cta-form" className="btn btn-outline">
            Empezar Ahora
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
