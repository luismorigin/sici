import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import mockRazonFiduciaria from '@/test/mockRazonFiduciaria.json'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Modo mock para testing sin gastar tokens
const MOCK_MODE = process.env.MOCK_CLAUDE === 'true'

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

const PROMPT_RAZON_FIDUCIARIA = `Eres Simón, sistema fiduciario inmobiliario. Tu rol es evaluar COHERENCIA, no vender.

PERFIL DEL COMPRADOR (extraído del formulario):
{perfil_json}

PROPIEDADES A EVALUAR:
{propiedades_json}

Para CADA propiedad, genera una FICHA DE COHERENCIA que responda:
"¿Esta propiedad es coherente con lo que ESTA PERSONA ESPECÍFICA dijo que necesita?"

Responde en JSON:
{
  "propiedades": [
    {
      "id": 123,
      "razon_fiduciaria": "ESPECÍFICA al perfil: menciona SUS innegociables, SU presupuesto, SU situación. No genérico.",
      "score": 9,
      "encaja": true,
      "alerta": null
    },
    {
      "id": 456,
      "razon_fiduciaria": "Explica QUÉ criterio viola y por qué importa para ESTE usuario.",
      "score": 4,
      "encaja": false,
      "alerta": "Viola innegociable: sin piscina"
    }
  ]
}

ESTRUCTURA DE RAZÓN FIDUCIARIA (2-3 oraciones):
1. Primera oración: Qué criterios del USUARIO cumple/viola (ser específico)
2. Segunda oración: Qué implica esto para SU situación (no genérico)
3. Tercera (opcional): Trade-off o consideración relevante

EJEMPLOS BUENOS:
- "Cumple tu innegociable de piscina y está en Sirari que elegiste. El precio/m² de $1,450 está en rango normal para la zona."
- "Viola tu innegociable: sin seguridad 24h. Tu situación de pareja con niño pequeño hace esto crítico."
- "20% bajo tu tope de $150k, pero en Villa Brigida que NO seleccionaste. Solo verla si flexibilizás zona."

EJEMPLOS MALOS (NO USAR):
- "Buena opción con amenities atractivos" (genérico)
- "15% bajo tu tope" (sin contexto)
- "Departamento moderno en buena zona" (no menciona al usuario)

REGLAS:
1. SIEMPRE menciona criterios específicos del usuario
2. Si viola innegociable, ponlo en "alerta"
3. Score: 8-10 = cumple todo, 5-7 = cumple parcial, 1-4 = viola algo importante
4. Responde SOLO JSON, sin markdown`

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

    // Modo mock para testing sin gastar tokens
    if (MOCK_MODE) {
      console.log('[MOCK MODE] Retornando razones fiduciarias de prueba')
      // Mapear IDs reales a mock (usar los primeros 3 del mock)
      const mockResponse = {
        propiedades: propiedades.slice(0, 3).map((p: any, i: number) => ({
          ...mockRazonFiduciaria.propiedades[i % 3],
          id: p.id  // Usar el ID real de la propiedad
        }))
      }
      return res.status(200).json(mockResponse)
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
