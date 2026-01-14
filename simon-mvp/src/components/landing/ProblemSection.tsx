import { motion } from 'framer-motion'

const problems = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    title: 'Comparar es imposible',
    description: 'Un portal muestra precio, otro muestra m², otro tiene fotos. Simón unifica todo: precio/m², amenities, ubicación exacta. Comparás con la misma base.'
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    title: '$150k... ¿es caro o barato?',
    description: 'Sin saber el precio/m² de la zona, no podés comparar. Simón te muestra $2.125/m² en Equipetrol vs $1.685/m² en Villa Brígida.'
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
    title: 'Te decimos lo que nadie te dice',
    description: '¿Cuánto son las expensas reales? ¿El parqueo está incluido o cuesta aparte? ¿Qué amenities tiene el edificio? Los portales solo ponen fotos bonitas. Simón te da los datos completos para decidir bien.'
  }
]

export default function ProblemSection() {
  return (
    <section className="py-24 bg-brand-dark-card" id="problema">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-brand-primary text-sm font-bold uppercase tracking-wider">
            Buscar en Equipetrol es confuso
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white mt-2">
            Simón lo simplifica con datos reales.
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {problems.map((problem, i) => (
            <motion.div
              key={i}
              className="bg-[#273048] border border-white/5 rounded-3xl p-8 text-center hover:border-brand-primary/30 transition-colors"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <div className="w-16 h-16 rounded-full bg-brand-primary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-primary/30">
                <span className="text-white">{problem.icon}</span>
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">
                {problem.title}
              </h3>
              <p className="text-slate-400 leading-relaxed">
                {problem.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
