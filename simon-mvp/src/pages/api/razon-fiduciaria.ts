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
  microzona?: string
  dormitorios: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  amenities: string[]
  // Datos de mercado del SQL (nuevos)
  razon_sql?: string          // Razón genérica del SQL
  stock_bajo_precio?: number  // Cuántas hay bajo este precio
  posicion_precio?: number    // Posición en el proyecto (1=más barato)
  total_proyecto?: number     // Total unidades en proyecto
  diff_vs_promedio?: number   // % vs promedio de zona
}

// Contexto del usuario (nivel 2)
export interface PerfilUsuario {
  nombre?: string
  composicion: string         // solo, pareja, familia_chica, etc.
  hijos?: number
  mascota: string             // no, perro_chico, perro_grande, gato
  meses_buscando: number
  estado_emocional: string    // activo, cansado, frustrado, presionado
  horizonte: string           // 1-3, 3-7, 7+
  prioriza: string            // ubicacion, metros
  sensible_expensas: boolean
  decision_compartida: boolean
  presion_externa: string     // no, poco, bastante
  innegociables: string[]
  deseables: string[]
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

## PERFIL DEL COMPRADOR:
{perfil_json}

## PROPIEDADES A EVALUAR (con datos de mercado):
{propiedades_json}

## TU TAREA:
Para CADA propiedad, genera una razón fiduciaria que COMBINE:
1. Los DATOS DE MERCADO (escasez, precio vs promedio, posición)
2. El CONTEXTO PERSONAL del usuario (familia, mascotas, horizonte, estado emocional)

## FORMATO DE RESPUESTA (JSON):
{
  "propiedades": [
    {
      "id": 123,
      "razon_fiduciaria": "2-3 oraciones que combinen datos + contexto personal",
      "score": 9,
      "encaja": true,
      "alerta": null
    }
  ]
}

## ESTRUCTURA DE RAZÓN FIDUCIARIA (2-3 oraciones):

**Primera oración: DATO DE MERCADO + RELEVANCIA PERSONAL**
- Usa el dato de escasez/precio del SQL pero hazlo relevante para SU situación
- Ejemplo: "1 de solo 3 opciones pet-friendly bajo $120k - importante porque tu perro grande necesita edificio que realmente acepte mascotas"

**Segunda oración: CONTEXTO PERSONAL**
- Menciona su composición familiar, horizonte de vida, o estado emocional
- Ejemplo: "Para tu familia de 4 buscando estabilidad a largo plazo, los 85m² son justos pero la ubicación en Sirari compensa"

**Tercera oración (si aplica): ALERTA O TRADE-OFF**
- Solo si hay algo que vigilar o decidir
- Ejemplo: "Ojo: llevás 8 meses buscando - no decidas por cansancio"

## EJEMPLOS BUENOS:

"1 de solo 5 bajo $130k en Villa Brigida. Tu perro grande va a estar cómodo - es de los pocos edificios que realmente acepta mascotas grandes. Buena opción para tu horizonte de +7 años."

"15% bajo el promedio de Equipetrol Norte ($1,850/m² vs $2,100). Para tu pareja sin hijos priorizando ubicación sobre metros, encaja perfecto. Solo asegurense de estar alineados antes de ofertar."

"El más económico de 8 unidades en Sky Tower. Pero OJO: no tiene piscina que marcaste como innegociable. Solo verla si flexibilizás ese criterio."

## EJEMPLOS MALOS (NO USAR):
- "Buena opción en buena zona" (genérico, no dice nada)
- "15% bajo tu tope" (dato sin contexto personal)
- "Departamento moderno con amenities" (no menciona al usuario)

## REGLAS DURAS:
1. SIEMPRE combina dato de mercado + contexto personal
2. SIEMPRE menciona algo específico del perfil del usuario
3. Si viola innegociable → alerta obligatoria + score ≤ 4
4. Si lleva +6 meses buscando o está "cansado/frustrado" → mencionar en alguna propiedad
5. Score: 8-10 = encaja perfecto, 5-7 = encaja parcial, 1-4 = viola algo importante
6. Responde SOLO JSON válido, sin markdown ni texto adicional`

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
