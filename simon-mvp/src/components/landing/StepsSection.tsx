import { motion } from 'framer-motion'
import Link from 'next/link'

const steps = [
  {
    number: 1,
    title: 'Define tu Sueño',
    description: 'Dinos tus requisitos no negociables: precio, tamaño, comodidades e incluso tu estilo de vida deseado.'
  },
  {
    number: 2,
    title: 'Analiza el Mercado',
    description: 'Nuestra IA se pone a trabajar, escaneando miles de anuncios y analizando datos que nunca imaginarías.'
  },
  {
    number: 3,
    title: 'Encuentra tu Pareja Ideal',
    description: 'Recibe una lista personalizada y curada de los mejores departamentos. El lugar perfecto está a solo un clic.'
  }
]

export default function StepsSection() {
  return (
    <section className="py-24 bg-white" id="como-funciona">
      <div className="max-w-6xl mx-auto px-6">
        <motion.h2
          className="font-display text-3xl md:text-4xl font-extrabold text-brand-dark text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Tu Búsqueda, Simplificada en 3 Pasos.
        </motion.h2>

        <div className="max-w-2xl mx-auto">
          {/* Timeline */}
          <div className="relative">
            {/* Line */}
            <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-200" />

            {/* Steps */}
            <div className="space-y-10">
              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  className="flex gap-6 relative"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                >
                  {/* Number */}
                  <div className="w-12 h-12 rounded-full bg-brand-primary text-white font-bold text-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-primary/20 z-10">
                    {step.number}
                  </div>

                  {/* Content */}
                  <div className="pt-1">
                    <h3 className="font-display text-xl font-bold text-brand-dark mb-2">
                      {step.title}
                    </h3>
                    <p className="text-slate-500 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <motion.div
            className="text-center mt-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <Link href="#cta-form" className="btn btn-primary px-10 py-4 text-base">
              Empezar Búsqueda
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
