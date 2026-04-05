// API: Simon Bot — conversational engine for /alquileres
// POST /api/chat-alquileres { message, history, session_id }
// - Rate limit: 20 messages / 10 min per session
// - MOCK_CLAUDE=true → returns mock response
// - Returns { response: ChatBotResponse, usage?, mock? }

import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { SYSTEM_PROMPT_TEMPLATE, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW } from '@/components/simon-chat/chat-constants'
import { buildListingSummary, buildMarketStats } from '@/components/simon-chat/chat-utils'
import type { UnidadAlquiler } from '@/lib/supabase'
import type { ChatRequest, ChatApiResponse, ChatBotResponse } from '@/components/simon-chat/chat-types'
import mockResponse from '@/test/mockChatResponse.json'

// ── Clients ──────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MOCK_MODE = process.env.MOCK_CLAUDE === 'true'

// ── Usage tracking (in-memory, resets on deploy) ─────────────────────────────

interface DailyUsage {
  date: string
  messages: number
  input_tokens: number
  output_tokens: number
  errors: number
  sessions: Set<string>
}

const usageByDay = new Map<string, DailyUsage>()

function trackUsage(sessionId: string, input: number, output: number, isError = false) {
  const today = new Date().toISOString().slice(0, 10)
  let day = usageByDay.get(today)
  if (!day) {
    day = { date: today, messages: 0, input_tokens: 0, output_tokens: 0, errors: 0, sessions: new Set() }
    usageByDay.set(today, day)
    // Keep only last 7 days
    const keys = Array.from(usageByDay.keys()).sort()
    while (keys.length > 7) { usageByDay.delete(keys.shift()!); }
  }
  day.messages++
  day.input_tokens += input
  day.output_tokens += output
  if (isError) day.errors++
  day.sessions.add(sessionId)
}

function getUsageStats() {
  const days = Array.from(usageByDay.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date: d.date,
      messages: d.messages,
      sessions: d.sessions.size,
      input_tokens: d.input_tokens,
      output_tokens: d.output_tokens,
      errors: d.errors,
      cost_usd: +(d.input_tokens * 0.80 / 1_000_000 + d.output_tokens * 4.00 / 1_000_000).toFixed(4),
    }))
  const total = days.reduce((acc, d) => ({
    messages: acc.messages + d.messages,
    sessions: acc.sessions + d.sessions,
    input_tokens: acc.input_tokens + d.input_tokens,
    output_tokens: acc.output_tokens + d.output_tokens,
    errors: acc.errors + d.errors,
    cost_usd: +(acc.cost_usd + d.cost_usd).toFixed(4),
  }), { messages: 0, sessions: 0, input_tokens: 0, output_tokens: 0, errors: 0, cost_usd: 0 })
  return { days, total }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseKey) : null

// ── Rate limiter (by session_id + IP) ────────────────────────────────────────

const sessionRateMap = new Map<string, number[]>()
const ipRateMap = new Map<string, number[]>()
const IP_RATE_LIMIT = 60  // generous per-IP limit (multiple users behind NAT)

setInterval(() => {
  const now = Date.now()
  for (const [key, hits] of sessionRateMap.entries()) {
    const recent = hits.filter(t => now - t < CHAT_RATE_WINDOW)
    if (recent.length === 0) sessionRateMap.delete(key)
    else sessionRateMap.set(key, recent)
  }
  for (const [key, hits] of ipRateMap.entries()) {
    const recent = hits.filter(t => now - t < CHAT_RATE_WINDOW)
    if (recent.length === 0) ipRateMap.delete(key)
    else ipRateMap.set(key, recent)
  }
}, 5 * 60_000)

function checkRate(sessionId: string, ip: string): boolean {
  const now = Date.now()
  // Session limit
  const sessionHits = (sessionRateMap.get(sessionId) || []).filter(t => now - t < CHAT_RATE_WINDOW)
  if (sessionHits.length >= CHAT_RATE_LIMIT) return false
  // IP limit (prevents abuse with rotating session IDs)
  const ipHits = (ipRateMap.get(ip) || []).filter(t => now - t < CHAT_RATE_WINDOW)
  if (ipHits.length >= IP_RATE_LIMIT) return false
  sessionHits.push(now)
  sessionRateMap.set(sessionId, sessionHits)
  ipHits.push(now)
  ipRateMap.set(ip, ipHits)
  return true
}

function getClientIP(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  if (Array.isArray(forwarded)) return forwarded[0]
  return req.socket?.remoteAddress || 'unknown'
}

// ── Listings cache (5 min) ───────────────────────────────────────────────────

let cachedListings: UnidadAlquiler[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60_000

async function getListings(): Promise<UnidadAlquiler[]> {
  const now = Date.now()
  if (cachedListings && now - cacheTime < CACHE_TTL) return cachedListings

  if (!supabase) return []

  const { data, error } = await supabase.rpc('buscar_unidades_alquiler', {
    p_filtros: { limite: 200, solo_con_fotos: true }
  })

  if (error || !data) {
    console.error('[chat-alquileres] Error fetching listings:', error)
    return cachedListings || []
  }

  // Minimal mapping — we only need fields for the summary
  cachedListings = (data as any[]).map(p => ({
    id: p.id,
    nombre_edificio: p.nombre_edificio || null,
    nombre_proyecto: p.nombre_proyecto || null,
    desarrollador: p.desarrollador || null,
    zona: p.zona || 'Sin zona',
    dormitorios: p.dormitorios ?? 0,
    banos: p.banos ? parseFloat(p.banos) : null,
    area_m2: parseFloat(String(p.area_m2)) || 0,
    precio_mensual_bob: parseFloat(String(p.precio_mensual_bob)) || 0,
    precio_mensual_usd: p.precio_mensual_usd ? parseFloat(p.precio_mensual_usd) : null,
    amoblado: p.amoblado || null,
    acepta_mascotas: p.acepta_mascotas ?? null,
    deposito_meses: p.deposito_meses ? parseFloat(p.deposito_meses) : null,
    servicios_incluidos: null,
    contrato_minimo_meses: p.contrato_minimo_meses ?? null,
    monto_expensas_bob: p.monto_expensas_bob ? parseFloat(String(p.monto_expensas_bob)) : null,
    piso: p.piso ? parseInt(p.piso) : null,
    estacionamientos: p.estacionamientos ?? null,
    baulera: p.baulera ?? null,
    latitud: p.latitud ? parseFloat(p.latitud) : null,
    longitud: p.longitud ? parseFloat(p.longitud) : null,
    fotos_urls: p.fotos_urls || [],
    fotos_count: p.fotos_count || 0,
    url: p.url || '',
    fuente: p.fuente || '',
    agente_nombre: p.agente_nombre || null,
    agente_telefono: p.agente_telefono || null,
    agente_whatsapp: p.agente_whatsapp || null,
    dias_en_mercado: p.dias_en_mercado ?? null,
    estado_construccion: p.estado_construccion || 'entrega_inmediata',
    id_proyecto_master: p.id_proyecto_master || null,
    amenities_lista: p.amenities_lista || null,
    equipamiento_lista: p.equipamiento_lista || null,
    descripcion: p.descripcion || null,
  }))

  cacheTime = now
  return cachedListings
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET → return usage stats (for /admin/salud)
  if (req.method === 'GET') {
    return res.status(200).json(getUsageStats())
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { message, history, session_id } = req.body as ChatRequest

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required' })
  }

  // Rate limit (session + IP)
  const ip = getClientIP(req)
  if (!checkRate(session_id, ip)) {
    return res.status(429).json({
      response: {
        text: 'Estás enviando muchos mensajes. Esperá un momento y volvé a intentar.',
        quick_replies: ['Ver todas las opciones'],
      },
      error: 'rate_limit',
    })
  }

  // Mock mode
  if (MOCK_MODE) {
    console.log('[chat-alquileres] MOCK MODE — returning test response')
    return res.status(200).json(mockResponse)
  }

  try {
    // Fetch listings + build context
    const listings = await getListings()
    const listingSummary = buildListingSummary(listings)
    const marketStats = buildMarketStats(listings)

    const systemPrompt = SYSTEM_PROMPT_TEMPLATE
      .replace('{count}', String(listings.length))
      .replace('{listings_table}', listingSummary)
      .replace('{market_stats}', marketStats)

    // Build messages (last 10 turns max)
    const trimmedHistory = (history || []).slice(-10)
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...trimmedHistory,
      { role: 'user', content: message },
    ]

    // Call Claude Haiku
    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages,
    })

    // Extract text
    let responseText = completion.content[0].type === 'text'
      ? completion.content[0].text
      : ''

    // Extract JSON from response — Claude sometimes adds text before/after the JSON
    let botResponse: ChatBotResponse
    try {
      // Try 1: direct parse
      botResponse = JSON.parse(responseText.trim())
    } catch {
      try {
        // Try 2: extract JSON object from within the response
        const jsonMatch = responseText.match(/\{[\s\S]*"text"\s*:[\s\S]*\}/)
        if (jsonMatch) {
          // Clean markdown code fences if present
          const cleaned = jsonMatch[0]
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim()
          botResponse = JSON.parse(cleaned)
        } else {
          throw new Error('No JSON found')
        }
      } catch {
        // Fallback: use raw text as message
        const cleanText = responseText
          .replace(/```json[\s\S]*```/g, '')  // remove any JSON blocks
          .replace(/```[\s\S]*```/g, '')
          .trim()
        botResponse = {
          text: cleanText || 'No pude procesar la respuesta. ¿Querés intentar de nuevo?',
          quick_replies: ['Ver todas las opciones', '¿Qué zonas cubrís?'],
        }
      }
    }

    // Validate property_ids exist in actual listings
    if (botResponse.property_ids) {
      const validIds = new Set(listings.map(l => l.id))
      botResponse.property_ids = botResponse.property_ids.filter(id => validIds.has(id))
    }

    // Correct total_results with real count from cached listings
    if (botResponse.filter_context) {
      const fc = botResponse.filter_context
      const matched = listings.filter(l => {
        if (fc.dormitorios !== undefined && fc.dormitorios !== null && l.dormitorios !== fc.dormitorios) return false
        if (fc.precio_mensual_max && l.precio_mensual_bob > fc.precio_mensual_max) return false
        if (fc.precio_mensual_min && l.precio_mensual_bob < fc.precio_mensual_min) return false
        if (fc.amoblado && l.amoblado !== 'si') return false
        if (fc.acepta_mascotas && l.acepta_mascotas !== true) return false
        if (fc.con_parqueo && (l.estacionamientos || 0) < 1) return false
        if (fc.zonas_permitidas?.length && !fc.zonas_permitidas.some(z => l.zona.toLowerCase().includes(z.toLowerCase()))) return false
        return true
      })
      botResponse.total_results = matched.length

      // Replace TOTAL_OPTIONS placeholder with real count
      botResponse.text = botResponse.text.replace(/TOTAL_OPTIONS/g, String(matched.length))
      // Also replace any number Claude invented near "opciones/opción"
      botResponse.text = botResponse.text.replace(/(\d+)\s*(opciones|opción)/g, `${matched.length} $2`)
    }

    // Validate WhatsApp action — strip if broker phone is missing
    if (botResponse.action === 'open_whatsapp' && botResponse.whatsapp_context) {
      const propId = botResponse.whatsapp_context.property_id
      const listing = listings.find(l => l.id === propId)
      const phone = listing?.agente_whatsapp || listing?.agente_telefono
      if (!phone) {
        // No broker phone available — remove action, suggest card view instead
        botResponse.action = null
        botResponse.whatsapp_context = undefined
        botResponse.text += '\n\n(No tengo el contacto directo de ese broker. Podés ver el anuncio original desde la ficha.)'
      } else {
        // Ensure we use the real phone from DB, not what Claude hallucinated
        botResponse.whatsapp_context.broker_phone = phone
      }
    }

    // Track usage
    trackUsage(session_id, completion.usage.input_tokens, completion.usage.output_tokens)

    const apiResponse: ChatApiResponse = {
      response: botResponse,
      usage: {
        input_tokens: completion.usage.input_tokens,
        output_tokens: completion.usage.output_tokens,
      },
    }

    return res.status(200).json(apiResponse)

  } catch (error: any) {
    console.error('[chat-alquileres] Error:', error)
    trackUsage(session_id, 0, 0, true)
    return res.status(500).json({
      response: {
        text: 'Tuve un problema procesando tu consulta. Probá de nuevo en un momento.',
        quick_replies: ['Intentar de nuevo', 'Ver todas las opciones'],
      },
      error: error.message,
    })
  }
}
