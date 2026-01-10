import { motion } from 'framer-motion'

const reasons = [
  'hay más oferta',
  'más rotación',
  'más información',
  'más demanda',
  'y más ruido'
]

export default function WhyEquipetrol() {
  return (
    <section className="py-24 bg-white relative overflow-hidden" id="por-que">
      {/* Background decoration */}
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-gradient-radial from-brand-primary/5 to-transparent blur-3xl" />

      <div className="max-w-3xl mx-auto px-6 relative z-10">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <span className="text-brand-primary text-sm font-bold uppercase tracking-wider">
            Por qué sólo Equipetrol (por ahora)
          </span>

          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-brand-dark mt-2 mb-6">
            Porque queremos hacerlo perfecto.
          </h2>

          <p className="text-lg text-slate-500 mb-8">
            Simón está en fase inicial y estamos empezando por la zona donde:
          </p>

          {/* Reasons */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {reasons.map((reason, i) => (
              <motion.div
                key={i}
                className="bg-slate-50 border border-slate-200 rounded-full px-5 py-2.5 font-semibold text-brand-dark flex items-center gap-2 shadow-sm"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <svg className="w-4 h-4 text-brand-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {reason}
              </motion.div>
            ))}
          </div>

          {/* Closing */}
          <motion.div
            className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <p className="text-brand-dark font-medium leading-relaxed">
              Equipetrol es el lugar ideal para que Simón te entregue recomendaciones ultra precisas. <span className="text-slate-500">Pronto estaremos en otras zonas.</span>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
