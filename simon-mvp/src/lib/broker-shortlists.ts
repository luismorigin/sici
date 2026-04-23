// Wrappers fetch para shortlists del broker (cliente-side).
// Las API routes usan service_role para escribir/leer la BD; este módulo solo
// arma las llamadas HTTP desde el browser.

import type {
  BrokerShortlist,
  BrokerShortlistWithItems,
  CreateShortlistPayload,
  UpdateShortlistPayload,
} from '@/types/broker-shortlist'

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export function listShortlistsByBroker(brokerSlug: string): Promise<BrokerShortlist[]> {
  return jsonFetch<BrokerShortlist[]>(`/api/broker/shortlists?slug=${encodeURIComponent(brokerSlug)}`)
}

export function getShortlistById(id: string): Promise<BrokerShortlistWithItems> {
  return jsonFetch<BrokerShortlistWithItems>(`/api/broker/shortlists/${id}`)
}

export function createShortlist(payload: CreateShortlistPayload): Promise<BrokerShortlist> {
  return jsonFetch<BrokerShortlist>('/api/broker/shortlists', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateShortlist(id: string, payload: UpdateShortlistPayload): Promise<BrokerShortlist> {
  return jsonFetch<BrokerShortlist>(`/api/broker/shortlists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function archiveShortlist(id: string): Promise<{ success: true }> {
  return jsonFetch<{ success: true }>(`/api/broker/shortlists/${id}`, { method: 'DELETE' })
}

export function publicShortlistURL(hash: string, base?: string): string {
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : 'https://simonbo.com')
  return `${origin}/b/${hash}`
}
