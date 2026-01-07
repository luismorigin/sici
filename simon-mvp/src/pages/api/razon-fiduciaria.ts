import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface PropiedadInput {
  id: number
  proyecto: string
  zona: string
  dormitorios: number
  precio_usd: number
  area_m2: number
  amenities: string[]
}

export interface RazonFiduciariaResponse {
  propiedades: Array<{
    id: number
    razon_fiduciaria: string
    score: number // 1-10
    encaja: boolean
  }>
}

const PROMPT_RAZON_FIDUCIARIA = `Eres Simón, asesor fiduciario inmobiliario.

Dado este perfil del comprador:
{perfil_json}

Y estas propiedades disponibles:
{propiedades_json}

Para CADA propiedad, genera una frase de 1-2 oraciones explicando por qué encaja o no encaja con lo que busca el usuario. Sé específico y menciona datos concretos.

Responde en JSON con esta estructura exacta:
{
  "propiedades": [
    {
      "id": 123,
      "razon_fiduciaria": "Cumple tus 3 innegociables: piscina, seguridad 24h y pet friendly. 15% bajo tu tope de presupuesto.",
      "score": 9,
      "encaja": true
    },
    {
      "id": 456,
      "razon_fiduciaria": "Buen precio pero sin piscina, que marcaste como innegociable. Considera solo si flexibilizás ese criterio.",
      "score": 6,
      "encaja": false
    }
  ]
}

REGLAS:
1. Menciona datos específicos (%, amenities, zona)
2. Si no encaja, explica por qué sin ser negativo
3. El score va de 1-10 según qué tan bien encaja con el perfil
4. Sé honesto, no vendas
5. Responde SOLO con el JSON, sin texto adicional`

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { perfil, propiedades } = req.body

    if (!perfil || !propiedades || propiedades.length === 0) {
      return res.status(400).json({ error: 'Perfil y propiedades requeridos' })
    }

    const prompt = PROMPT_RAZON_FIDUCIARIA
      .replace('{perfil_json}', JSON.stringify(perfil, null, 2))
      .replace('{propiedades_json}', JSON.stringify(propiedades, null, 2))

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
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
    const razones: RazonFiduciariaResponse = JSON.parse(responseText)

    return res.status(200).json(razones)

  } catch (error: any) {
    console.error('Error generando razones fiduciarias:', error)

    // Si falla, devolver razones genéricas
    const { propiedades } = req.body || { propiedades: [] }

    return res.status(200).json({
      fallback: true,
      propiedades: propiedades.map((p: PropiedadInput) => ({
        id: p.id,
        razon_fiduciaria: `${p.dormitorios} dormitorios en ${p.zona}. Precio: $${p.precio_usd.toLocaleString()}.`,
        score: 7,
        encaja: true
      }))
    })
  }
}
