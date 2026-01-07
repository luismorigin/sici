import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Tipos para la respuesta
export interface GuiaFiduciariaResponse {
  perfil_fiduciario: {
    situacion_actual: string
    capacidad_financiera: string
    horizonte_temporal: string
    tolerancia_riesgo: string
    flexibilidad: string
    estado_emocional: string
  }
  guia_fiduciaria: {
    lectura_situacion: string
    validacion_presupuesto: string
    alertas_detectadas: string[]
    recomendacion_principal: string
    que_priorizar: string[]
    que_evitar: string[]
    pregunta_clave: string
    mensaje_final: string
  }
  alertas: Array<{
    tipo: 'roja' | 'amarilla' | 'verde'
    mensaje: string
    accion_sugerida: string
  }>
  mbf_ready: {
    precio_max: number
    precio_min?: number
    dormitorios_min: number
    dormitorios_max?: number
    zonas: string[]
    amenities_requeridos: string[]
    amenities_deseados: string[]
  }
}

const PROMPT_GUIA_FIDUCIARIA = `Eres Simón, asesor fiduciario inmobiliario especializado en Santa Cruz, Bolivia.

Tu rol es analizar las respuestas de un formulario de búsqueda de vivienda y generar una guía fiduciaria personalizada que ayude al usuario a tomar una decisión informada, sin presiones comerciales.

CONTEXTO IMPORTANTE:
- Zona: Equipetrol y microzonas (Sirari, Villa Brigida, Faremafu, Equipetrol Norte)
- Mercado: Preventa y proyectos nuevos
- Precio promedio: $1,200-1,800 USD/m²
- Usuarios: Familias bolivianas clase media-alta buscando vivienda propia

Dado este formulario completado:
{formulario_json}

Genera un JSON con esta estructura exacta:

{
  "perfil_fiduciario": {
    "situacion_actual": "Descripción breve de su situación (ej: 'Pareja joven con hijo, actualmente alquila')",
    "capacidad_financiera": "Análisis de su capacidad real (ej: 'Presupuesto realista para la zona')",
    "horizonte_temporal": "Cuánto tiempo planean quedarse (ej: '5-10 años, familia en crecimiento')",
    "tolerancia_riesgo": "Nivel de riesgo que pueden asumir (ej: 'Conservador, prioriza seguridad')",
    "flexibilidad": "Qué tan flexibles son en sus criterios (ej: 'Flexible en zona, rígido en dormitorios')",
    "estado_emocional": "Estado emocional detectado (ej: 'Cansado de buscar, riesgo de decisión apresurada')"
  },
  "guia_fiduciaria": {
    "lectura_situacion": "Párrafo de 2-3 oraciones que refleje comprensión profunda de su situación",
    "validacion_presupuesto": "Es su presupuesto realista para lo que buscan? Sé honesto.",
    "alertas_detectadas": ["Lista de señales de alerta detectadas en sus respuestas"],
    "recomendacion_principal": "Una recomendación clara y accionable",
    "que_priorizar": ["Top 3 cosas que deben priorizar basado en sus respuestas"],
    "que_evitar": ["Top 3 errores comunes que deben evitar en su situación"],
    "pregunta_clave": "Una pregunta que deberían hacerse antes de decidir",
    "mensaje_final": "Mensaje de apoyo y perspectiva (sin ser vendedor)"
  },
  "alertas": [
    {
      "tipo": "roja|amarilla|verde",
      "mensaje": "Descripción de la alerta",
      "accion_sugerida": "Qué hacer al respecto"
    }
  ],
  "mbf_ready": {
    "precio_max": 150000,
    "dormitorios_min": 2,
    "zonas": ["Equipetrol", "Sirari"],
    "amenities_requeridos": ["piscina", "seguridad"],
    "amenities_deseados": ["gimnasio", "pet_friendly"]
  }
}

REGLAS:
1. Sé honesto y directo, no vendedor
2. Si detectas señales de presión o urgencia excesiva, alerta sobre esto
3. Si el presupuesto no es realista, dilo claramente
4. Los amenities_requeridos son los que marcó como innegociables
5. Las zonas deben mapearse a los nombres de BD: "Equipetrol", "Sirari", "Equipetrol Norte", "Villa Brigida", "Faremafu"
6. Responde SOLO con el JSON, sin texto adicional`

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { formulario } = req.body

    if (!formulario) {
      return res.status(400).json({ error: 'Formulario requerido' })
    }

    const prompt = PROMPT_GUIA_FIDUCIARIA.replace(
      '{formulario_json}',
      JSON.stringify(formulario, null, 2)
    )

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    // Extraer el texto de la respuesta
    let responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : ''

    // Limpiar markdown code blocks si existen
    responseText = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    // Parsear el JSON de la respuesta
    const guiaFiduciaria: GuiaFiduciariaResponse = JSON.parse(responseText)

    return res.status(200).json(guiaFiduciaria)

  } catch (error: any) {
    console.error('Error generando guía fiduciaria:', error)

    // Si falla Claude, devolver estructura básica
    return res.status(500).json({
      error: 'Error generando guía',
      fallback: true,
      message: error.message
    })
  }
}
