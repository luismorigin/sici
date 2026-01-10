import { motion } from 'framer-motion'

const problems = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Búsqueda Interminable',
    description: 'Deja de perder horas navegando por innumerables anuncios obsoletos e irrelevantes.'
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
    title: 'Exceso de Información',
    description: 'Eliminamos el ruido para ofrecerte solo las mejores opciones verificadas.'
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Costos Ocultos',
    description: 'No más sorpresas. Te ayudamos a encontrar lugares con precios transparentes.'
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
            El método antiguo no funciona
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white mt-2">
            La Búsqueda de Departamento es un Lío.
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
