import { motion } from 'framer-motion'
import Link from 'next/link'

export default function CTAFinal() {
  return (
    <section className="py-16 px-6">
      <motion.div
        className="max-w-4xl mx-auto bg-brand-dark-card text-white rounded-3xl p-10 md:p-16 text-center shadow-card"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4">
          ¿Listo para Dejar de Buscar y Empezar a Vivir?
        </h2>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8">
          Deja que Simón haga el trabajo pesado. Tu departamento perfecto en Equipetrol te está esperando.
        </p>
        <Link href="#top" className="btn btn-primary px-10 py-5 text-lg">
          Encontrar Mi Departamento Perfecto Ahora
        </Link>
      </motion.div>
    </section>
  )
}
