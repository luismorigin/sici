'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { BarChartCard, CompatibilidadCard, PrecioComparativoCard } from './ChartCard'

interface PremiumModalProps {
  onClose: () => void
}

export default function PremiumModal({ onClose }: PremiumModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-y-auto"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors z-10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-8">
            {/* Header */}
            <div className="border-b-2 border-slate-200 pb-6 mb-8 flex justify-between items-start">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-brand-dark mb-1">
                  INFORME PREMIUM – SIMÓN
                </h2>
                <p className="text-slate-500">Estudio Fiduciario Personalizado • Equipetrol</p>
              </div>
              <div className="text-right text-sm text-slate-500">
                <div><strong>Generado:</strong> {new Date().toLocaleDateString('es-ES')}</div>
                <div><strong>Propiedades:</strong> 987 Analizadas</div>
              </div>
            </div>

            {/* Section 1: Profile */}
            <section className="bg-slate-50 rounded-xl p-6 mb-8">
              <h3 className="text-brand-primary font-bold mb-4">🌐 1. PERFIL FIDUCIARIO PROFUNDO</h3>
              <p className="mb-3"><strong>Tipo:</strong> 🏡 Hogar Estratégico con Visión de Liquidez.</p>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Un comprador que busca equilibrio entre seguridad financiera, comodidad de vida y liquidez futura. Tu ventana de decisión es de <strong>2 a 8 semanas</strong>, perfecta para negociar sin perder oportunidades.
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold mb-2">Prioridades Críticas</h4>
                  <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                    <li>2 Dormitorios (óptimo reventa)</li>
                    <li>Piso medio/alto (menos ruido)</li>
                    <li>Seguridad alta (prioridad emocional)</li>
                    <li>Bajo mantenimiento</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-bold mb-2">Psicología Detectada</h4>
                  <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                    <li>Rechazo a visitas inútiles</li>
                    <li>Sensibilidad al sobreprecio</li>
                    <li>Necesidad de control con guía experta</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 2: Executive Summary */}
            <section className="mb-8">
              <h3 className="text-brand-primary font-bold mb-4">📊 2. RESUMEN EJECUTIVO</h3>

              {/* KPIs */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { value: 36, label: 'En tu Rango' },
                  { value: 8, label: 'Alta Compatibilidad', color: 'text-state-success' },
                  { value: 2, label: 'Gangas Fiduciarias', color: 'text-premium-gold' },
                  { value: 4, label: 'Riesgos Ocultos', color: 'text-state-danger' }
                ].map((kpi, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-4 text-center bg-white">
                    <div className={`text-2xl font-extrabold ${kpi.color || 'text-brand-dark'}`}>{kpi.value}</div>
                    <div className="text-xs text-slate-500 font-semibold">{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <BarChartCard
                  title="Distribución de Precios"
                  data={[
                    { label: '60k-70k', value: 14 },
                    { label: '70k-80k', value: 22 },
                    { label: '80k-90k', value: 36, highlight: true },
                    { label: '90k+', value: 18 }
                  ]}
                />
                <CompatibilidadCard porcentaje={78} mensaje="Tu perfil tiene alta resonancia con el inventario disponible." />
                <PrecioComparativoCard
                  title="Precio Real vs Media"
                  comparaciones={[
                    { proyecto: 'Vienna', precio: 1091, diferencia: -9 },
                    { proyecto: 'Belvedere', precio: 1153, diferencia: -4 },
                    { proyecto: 'Nova Tower', precio: 1160, diferencia: 3 }
                  ]}
                  media={1200}
                />
              </div>

              <div className="bg-blue-50 border-l-4 border-brand-primary rounded-r-lg p-4">
                <p className="text-brand-dark">
                  <strong>Conclusión Estratégica:</strong> Tu presupuesto cae en la franja más competitiva y segura del mercado para 2 dormitorios. Tienes poder de negociación.
                </p>
              </div>
            </section>

            {/* Section 3: Top 3 */}
            <section className="mb-8">
              <h3 className="text-brand-primary font-bold mb-4">🏆 3. TOP 3 OPORTUNIDADES DETECTADAS</h3>

              {/* Property 1 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                <div className="bg-brand-dark text-white p-4 flex justify-between items-center">
                  <span className="font-bold">⭐ 1. TORRE VIENNA</span>
                  <span className="bg-state-success text-white text-xs px-2 py-1 rounded">91% Match</span>
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-2xl font-extrabold text-brand-dark mb-1">$89,500</div>
                    <div className="text-state-success font-semibold text-sm mb-3">▼ 9% Bajo Precio Mercado</div>
                    <ul className="text-sm text-slate-600 space-y-1">
                      <li>• 82m² · 2 Dorms · Piso 8</li>
                      <li>• Calle Las Maples</li>
                      <li>• Piscina, Gimnasio, Seguridad 24/7</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-sm font-bold mb-2">ANÁLISIS FIDUCIARIO</h5>
                    <p className="text-sm text-slate-600 mb-2">Balance perfecto entre precio y reputación. Consistencia en mantenimiento y alta liquidez de reventa.</p>
                    <p className="text-sm text-state-danger"><strong>⚠️ Riesgo:</strong> Poca ventana de negociación.</p>
                  </div>
                </div>
              </div>

              {/* Property 2 & 3 simplified */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-brand-dark">2. BELVEDERE</span>
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded">88% Match</span>
                  </div>
                  <div className="text-xl font-bold text-brand-dark">$90,000</div>
                  <p className="text-sm text-slate-500">78m² · 2 Dorms · Piso 10 · Sirari</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-brand-dark">3. PARK LANE</span>
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded">85% Match</span>
                  </div>
                  <div className="text-xl font-bold text-brand-dark">$88,000</div>
                  <p className="text-sm text-slate-500">70m² · 1 Dorm + Esc · Piso 12</p>
                </div>
              </div>
            </section>

            {/* Section 4: Top 10 Table */}
            <section className="mb-8">
              <h3 className="text-brand-primary font-bold mb-4">🔟 4. TOP 10 RESUMIDO</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="text-left p-3">Propiedad</th>
                      <th className="p-3">Precio</th>
                      <th className="p-3">m²</th>
                      <th className="p-3">Match</th>
                      <th className="p-3">USD/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { nombre: 'Vienna', precio: 89.5, m2: 82, match: 0.91, precioM2: 1091 },
                      { nombre: 'Belvedere', precio: 90, m2: 78, match: 0.88, precioM2: 1153 },
                      { nombre: 'Park Lane', precio: 88, m2: 70, match: 0.85, precioM2: 1257 },
                      { nombre: 'Nova Tower', precio: 87, m2: 75, match: 0.82, precioM2: 1160 }
                    ].map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="p-3 text-brand-primary font-medium">{row.nombre}</td>
                        <td className="p-3 text-center">${row.precio}k</td>
                        <td className="p-3 text-center">{row.m2}</td>
                        <td className="p-3 text-center text-state-success font-bold">{row.match}</td>
                        <td className="p-3 text-center">{row.precioM2}</td>
                      </tr>
                    ))}
                    <tr className="text-slate-400">
                      <td className="p-3">...y 6 más</td>
                      <td colSpan={4} className="p-3 text-center">(Ver reporte completo)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 5: Insights */}
            <section className="mb-8">
              <h3 className="text-brand-primary font-bold mb-4">🧿 5. INSIGHTS OCULTOS</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h5 className="font-bold text-amber-800 mb-2">Liquidez Superior</h5>
                  <p className="text-sm text-amber-900">Detectamos 3 torres con rotación comprobada. Si comprás aquí, vender en 5 años será rápido.</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h5 className="font-bold text-red-800 mb-2">Riesgos Detectados</h5>
                  <p className="text-sm text-red-900">Vibración estructural en Av. Beni y sobreprecio injustificado en 3 preventas cercanas.</p>
                </div>
              </div>
            </section>

            {/* Section 6: Financial - PRÓXIMAMENTE */}
            <section className="mb-8 relative">
              <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] rounded-xl z-10 flex items-center justify-center">
                <span className="bg-premium-gold text-white px-4 py-2 rounded-full font-bold text-sm">
                  Próximamente
                </span>
              </div>
              <div className="bg-slate-50 rounded-xl p-6 opacity-50">
                <h3 className="text-brand-primary font-bold mb-4">🧮 6. ESCENARIO FINANCIERO</h3>
                <p className="text-slate-500 text-sm">Análisis de liquidez, renta estimada y riesgo de depreciación por propiedad.</p>
              </div>
            </section>

            {/* Section 7: Real Life Map - PRÓXIMAMENTE */}
            <section className="mb-8 relative">
              <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] rounded-xl z-10 flex items-center justify-center">
                <span className="bg-premium-gold text-white px-4 py-2 rounded-full font-bold text-sm">
                  Próximamente
                </span>
              </div>
              <div className="bg-slate-50 rounded-xl p-6 opacity-50">
                <h3 className="text-brand-primary font-bold mb-4">🗺 7. MAPA DE VIDA REAL</h3>
                <p className="text-slate-500 text-sm">Calidad de vida, alertas urbanas, ruidos y accesibilidad.</p>
              </div>
            </section>

            {/* Section 8: Motivators */}
            <section className="mb-8 bg-blue-50 rounded-xl p-6">
              <h3 className="text-brand-primary font-bold mb-4">🧠 8. MOTIVADORES Y RIESGOS</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold mb-2">Tus Motivadores</h4>
                  <p className="text-sm text-slate-600">Claridad antes que velocidad, control financiero y sensación de seguridad estructural.</p>
                </div>
                <div>
                  <h4 className="text-sm font-bold mb-2">Riesgos Psicológicos</h4>
                  <p className="text-sm text-slate-600">Saturación por exceso de opciones y ansiedad por decidir sin respaldo técnico.</p>
                </div>
              </div>
            </section>

            {/* Section 9: Human Advice */}
            <section className="mb-8">
              <h3 className="text-brand-primary font-bold mb-4">🤝 9. CAPA 3: ASESORAMIENTO HUMANO</h3>
              <div className="border border-slate-200 rounded-xl p-6">
                <p className="text-slate-600 mb-4">
                  Incluye <strong>Verificación Fiduciaria</strong> por un estratega real: visita técnica, evaluación de mantenimiento, revisión legal y chequeo de ruidos.
                </p>
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                  <strong>Nota:</strong> Este servicio tiene un costo de <strong>$100 USD</strong> por propiedad verificada.
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mb-4">
                  <span>✓ Visita técnica presencial</span>
                  <span>✓ Análisis jurídico</span>
                  <span>✓ Check de administración</span>
                  <span>✓ Fotos y video real</span>
                </div>
                <button className="bg-[#25D366] text-white px-4 py-2 rounded-lg font-semibold text-sm">
                  Contratar Verificación ($100)
                </button>
              </div>
            </section>

            {/* Section 10: Conclusion */}
            <section className="bg-brand-dark text-white rounded-xl p-8 text-center">
              <h3 className="font-display text-2xl font-bold mb-4">📌 CONCLUSIÓN FINAL</h3>
              <p className="mb-4 max-w-2xl mx-auto">
                Estás en una posición privilegiada. El análisis profundo está hecho. Ahora viene la parte humana: validar físicamente, negociar con inteligencia y comprar con seguridad.
              </p>
              <p className="text-slate-300 text-sm mb-6 max-w-xl mx-auto">
                <strong>Recomendación:</strong> Solicitar verificación de Vienna y Belvedere. Comparar liquidez y negociar dentro de tu ventana de 2-8 semanas.
              </p>
              <div className="inline-block bg-white/10 border border-white/20 rounded-lg px-8 py-4 font-bold text-lg">
                Simón Recomienda: ⭐ TORRE VIENNA
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
