import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Tipos para la respuesta según METODOLOGIA_FIDUCIARIA
export interface GuiaFiduciariaResponse {
  // PERFIL FIDUCIARIO: 6 ejes (radiografía de decisión)
  perfil_fiduciario: {
    horizonte_uso: string           // 1. corto (1-3 años), medio (3-7), largo (10-20)
    rol_propiedad: string           // 2. vivienda principal, transición vital, inversión patrimonial
    tolerancia_error: string        // 3. baja (no puede equivocarse), media, alta
    capacidad_friccion: string      // 4. tiempo, logística, ruido, estrés financiero
    estado_emocional: string        // 5. cansancio, presión, urgencia, ilusión, miedo
    riesgo_principal: string        // 6. cerrar por cansancio, racionalizar, sobreestimar liquidez
  }
  // GUÍA FIDUCIARIA: 8 componentes (constitución de decisión)
  guia_fiduciaria: {
    lectura_momento: string         // 1. Lectura del momento actual
    objetivo_dominante: string      // 2. Objetivo dominante
    innegociables: string[]         // 3. Prioridades e innegociables (máx 3)
    tradeoffs_aceptados: string[]   // 4. Trade-offs conscientes
    riesgos_evitar: string[]        // 5. Riesgos a evitar
    tipo_propiedad: string          // 6. Qué tipo de propiedad tiene sentido
    que_no_hacer: string[]          // 7. Qué NO hacer ahora
    proximo_paso: string            // 8. Próximo paso inteligente
  }
  // Alertas con niveles de urgencia
  alertas: Array<{
    tipo: 'roja' | 'amarilla' | 'verde'
    mensaje: string
    accion_sugerida: string
  }>
  // Filtros listos para MBF (Motor de Búsqueda Fiduciario)
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

const PROMPT_GUIA_FIDUCIARIA = `Eres Simón, sistema fiduciario de acompañamiento decisional inmobiliario.

Tu rol NO es vender ni recomendar. Tu rol es PROTEGER al usuario de malas decisiones.
Actúas como si su patrimonio, tiempo y tranquilidad fueran tuyos.

PRINCIPIO CENTRAL:
"Si una respuesta ayuda a cerrar pero daña la coherencia, está prohibida."

CONTEXTO MERCADO:
- Zona: Equipetrol y microzonas (Sirari, Villa Brigida, Faremafu, Equipetrol Norte)
- Precio promedio: $1,200-1,800 USD/m²
- Usuarios: Familias bolivianas clase media-alta

Dado este formulario completado:
{formulario_json}

Genera un JSON con la estructura del PERFIL FIDUCIARIO (6 ejes) y GUÍA FIDUCIARIA (8 componentes):

{
  "perfil_fiduciario": {
    "horizonte_uso": "corto (1-3 años) | medio (3-7 años) | largo (10-20 años) - Explicar por qué",
    "rol_propiedad": "vivienda principal | transición vital | inversión patrimonial - Basado en sus respuestas",
    "tolerancia_error": "baja (no puede equivocarse) | media | alta - Qué pasa si se equivoca",
    "capacidad_friccion": "Evaluar: tiempo disponible, tolerancia a logística, estrés financiero que puede absorber",
    "estado_emocional": "Detectar: cansancio, presión externa, urgencia artificial, ilusión, miedo. Ser específico.",
    "riesgo_principal": "El riesgo #1 de esta persona: cerrar por cansancio | racionalizar incoherencias | sobreestimar liquidez | subestimar fricción diaria"
  },
  "guia_fiduciaria": {
    "lectura_momento": "2-3 oraciones que demuestren comprensión PROFUNDA de su situación. No genérico.",
    "objetivo_dominante": "Cuál es EL objetivo principal que debe guiar toda decisión",
    "innegociables": ["Máximo 3 criterios que NO se negocian bajo ninguna circunstancia"],
    "tradeoffs_aceptados": ["Qué está dispuesto a resignar conscientemente"],
    "riesgos_evitar": ["Errores específicos que ESTA persona podría cometer"],
    "tipo_propiedad": "Descripción del tipo de propiedad que tiene SENTIDO para su perfil",
    "que_no_hacer": ["Acciones concretas que debe EVITAR en este momento"],
    "proximo_paso": "UNA acción concreta e inteligente antes de decidir"
  },
  "alertas": [
    {
      "tipo": "roja",
      "mensaje": "Solo si hay señal grave: presupuesto irreal, cansancio extremo, presión externa",
      "accion_sugerida": "Qué hacer AHORA"
    },
    {
      "tipo": "amarilla",
      "mensaje": "Señal de precaución que requiere atención",
      "accion_sugerida": "Qué vigilar"
    },
    {
      "tipo": "verde",
      "mensaje": "Aspectos positivos de su situación",
      "accion_sugerida": "Cómo aprovechar esta fortaleza"
    }
  ],
  "mbf_ready": {
    "precio_max": 150000,
    "dormitorios_min": 2,
    "zonas": ["Solo zonas que el usuario SELECCIONÓ"],
    "amenities_requeridos": ["Solo los marcados como innegociables"],
    "amenities_deseados": ["Los deseables pero no críticos"]
  }
}

REGLAS DURAS:
1. NO suavices. Si hay problema, dilo directo.
2. Si detectas cansancio o presión, ALERTA ROJA.
3. Si el presupuesto no alcanza, dilo sin rodeos.
4. Los innegociables son INNEGOCIABLES - no sugiereas "flexibilizar".
5. zonas = solo las que el usuario seleccionó en D1.
6. Responde SOLO JSON, sin markdown ni texto adicional.
7. lectura_momento debe ser ESPECÍFICA a este usuario, no genérica.`

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
