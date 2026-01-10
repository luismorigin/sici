import { motion } from 'framer-motion'
import ProfileBox from './ProfileBox'
import PropertyCard from './PropertyCard'
import { BarChartCard, CompatibilidadCard, PrecioComparativoCard } from './ChartCard'

// Sample data - in production this comes from backend
const sampleData = {
  perfil: 'Hogar Estratégico de Valor',
  presupuesto: 90000,
  prioridades: ['Seguridad', 'Piso Medio/Alto', 'Piscina'],
  sensibilidad: 'alta' as const,
  compatibilidad: 78,
  totalProps: 144,
  distribucion: [
    { label: '60k-70k', value: 14 },
    { label: '70k-80k', value: 22 },
    { label: '80k-90k', value: 36, highlight: true },
    { label: '90k+', value: 18 }
  ],
  comparaciones: [
    { proyecto: 'Vienna', precio: 1091, diferencia: -9 },
    { proyecto: 'Belvedere', precio: 1153, diferencia: -4 },
    { proyecto: 'Nova Tower', precio: 1160, diferencia: 3 }
  ],
  topPropiedades: [
    { nombre: 'Torre Vienna', precio: 89500, dormitorios: 2, area: 82, matchScore: 86, confianza: 91 },
    { nombre: 'Belvedere', precio: 90000, dormitorios: 2, area: 78, matchScore: 82, confianza: 89 },
    { nombre: 'Nova Tower', precio: 87000, dormitorios: 2, area: 75, matchScore: 79, confianza: 88 }
  ]
}

export default function ReportExample() {
  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200" id="informe">
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-brand-dark mb-3">
            Tu Informe Preliminar Gratuito
          </h2>
          <p className="text-slate-500">
            Esto es exactamente lo que recibes al completar el formulario, pero adaptado a ti.
          </p>
        </motion.div>

        {/* Report container */}
        <motion.div
          className="bg-white rounded-3xl shadow-card overflow-hidden border border-slate-200"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          {/* Report header */}
          <div className="bg-brand-dark text-white px-6 py-4 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-bold">Informe de Mercado #987</span>
            </div>
            <div className="flex gap-6 text-sm opacity-90">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                Equipetrol
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {sampleData.totalProps} Props. Validadas
              </span>
            </div>
          </div>

          {/* Report body */}
          <div className="p-6">
            {/* Profile box */}
            <ProfileBox
              perfil={sampleData.perfil}
              presupuesto={sampleData.presupuesto}
              prioridades={sampleData.prioridades}
              sensibilidad={sampleData.sensibilidad}
            />

            {/* Charts grid */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <BarChartCard
                title="Distribución de Precios"
                data={sampleData.distribucion}
              />
              <CompatibilidadCard
                porcentaje={sampleData.compatibilidad}
                mensaje={`Hay ${sampleData.distribucion.find(d => d.highlight)?.value || 0} propiedades en tu "Zona Dorada".`}
              />
              <PrecioComparativoCard
                title="Precio m² vs Media ($1200)"
                comparaciones={sampleData.comparaciones}
                media={1200}
              />
            </div>

            {/* Top 3 properties */}
            <h4 className="font-bold text-brand-dark mb-4">Top 3 Propiedades Detectadas</h4>
            <div className="grid md:grid-cols-3 gap-4">
              {sampleData.topPropiedades.map((prop, i) => (
                <PropertyCard key={i} {...prop} />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
