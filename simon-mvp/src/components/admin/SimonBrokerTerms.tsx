// Términos de uso de Simon Broker mostrados en el form de creación de broker
// (/admin/simon-brokers). El admin debe afirmar que el broker los leyó antes
// de poder crear el registro.
//
// Los caps (vistas/expiración) se importan de SHORTLIST_LIMITS.inicial para
// que cualquier cambio futuro a los límites se refleje automáticamente acá.
//
// Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.

import { SHORTLIST_LIMITS } from '@/lib/broker-plan-limits'

export default function SimonBrokerTerms() {
  const cap = SHORTLIST_LIMITS.inicial.maxViewsPerShortlist
  const dias = SHORTLIST_LIMITS.inicial.expirationDays

  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-4 text-sm text-slate-700 space-y-3">
      <h3 className="font-semibold text-slate-900 text-sm">
        Términos de uso de Simon Broker
      </h3>
      <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
        <li>
          Las shortlists generadas en Simón son para <strong>uso privado</strong>{' '}
          entre el broker y sus clientes específicos.
        </li>
        <li>
          Cada shortlist tiene un límite de <strong>{cap} visualizaciones únicas</strong>{' '}
          y expira automáticamente en <strong>{dias} días</strong> desde su creación.
        </li>
        <li>
          Está <strong>prohibido distribuir</strong> links de shortlist en:
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>Redes sociales públicas (Instagram, Facebook, TikTok, X, etc.)</li>
            <li>Anuncios pagos de cualquier plataforma</li>
            <li>Canales o grupos masivos de WhatsApp Business</li>
            <li>Cualquier canal de marketing público o masivo</li>
          </ul>
        </li>
        <li>
          Las shortlists con captura pública de leads y distribución masiva{' '}
          <strong>NO están incluidas</strong> en el plan Broker. Para esos casos,
          contactar a Simón para acuerdos comerciales especiales.
        </li>
        <li>
          La violación de estos términos implica{' '}
          <strong>suspensión inmediata del servicio</strong> sin reembolso del
          período pagado.
        </li>
        <li>
          Simón monitorea patrones de uso de las shortlists para detectar abuso.
          Esta monitorización se limita a <strong>metadata técnica</strong>{' '}
          (hash de IP, dispositivo, frecuencia, timestamps) y no incluye
          contenido personal del cliente final.
        </li>
      </ol>
    </div>
  )
}
