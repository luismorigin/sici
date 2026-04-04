import type { UnidadAlquiler } from '@/lib/supabase'

// ── Response structured from Claude ──────────────────────────────────────────

export interface ChatBotResponse {
  text: string                          // Mensaje principal (puede tener **bold**)
  property_ids?: number[]               // IDs para renderizar cards
  action?: 'open_whatsapp' | 'show_comparison' | null
  whatsapp_context?: {
    property_id: number
    broker_phone: string
    message: string                     // Mensaje pre-armado para WA
  }
  quick_replies?: string[]              // 3-5 sugerencias contextuales
  abuse_warning?: boolean               // true when user is being abusive
}

// ── Chat message in conversation history ─────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  property_ids?: number[]
  action?: ChatBotResponse['action']
  whatsapp_context?: ChatBotResponse['whatsapp_context']
  quick_replies?: string[]
  timestamp: number
}

// ── API request/response ─────────────────────────────────────────────────────

export interface ChatRequest {
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  session_id: string
}

export interface ChatApiResponse {
  response: ChatBotResponse
  usage?: { input_tokens: number; output_tokens: number }
  mock?: boolean
  error?: string
}

// ── Widget props ─────────────────────────────────────────────────────────────

export interface SimonChatWidgetProps {
  properties: UnidadAlquiler[]
  onOpenDetail?: (id: number) => void
  sheetOpen?: boolean  // parent tells us when detail sheet is open
}
