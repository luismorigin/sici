// Hook que centraliza la lógica de shortlists del broker en /broker/[slug].
// Maneja:
//  - Carga de shortlists existentes del broker
//  - Crear nueva shortlist (POST + abre WhatsApp)
//  - Archivar / actualizar
//
// La "selección actual" (lo que el broker está marcando con ⭐) NO vive acá:
// vive en el state de favoritos del feed `/ventas` para no duplicar lógica.
// Ver pages/ventas.tsx ~L1111 (`favorites` Set).

import { useCallback, useEffect, useState } from 'react'
import {
  listShortlistsByBroker,
  createShortlist,
  archiveShortlist,
  updateShortlist,
  publicShortlistURL,
} from '@/lib/broker-shortlists'
import { buildWhatsAppURL, defaultShortlistMessage } from '@/lib/whatsapp'
import type { Broker } from '@/lib/brokers-demo'
import type { BrokerShortlist, CreateShortlistPayload } from '@/types/broker-shortlist'

export interface UseBrokerShortlistsResult {
  shortlists: BrokerShortlist[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createAndSend: (input: CreateAndSendInput) => Promise<{ shortlist: BrokerShortlist; whatsappUrl: string }>
  archive: (id: string) => Promise<void>
  buildShareUrl: (hash: string) => string
  buildDefaultMessage: (clienteNombre: string, shortlistUrl: string, cantidadPropiedades: number) => string
}

export interface CreateAndSendInput {
  cliente_nombre: string
  cliente_telefono: string
  mensaje_whatsapp?: string
  propiedad_ids: number[]
  tipo_operacion?: 'venta' | 'alquiler'
}

export function useBrokerShortlists(broker: Broker | null): UseBrokerShortlistsResult {
  const [shortlists, setShortlists] = useState<BrokerShortlist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!broker) return
    setLoading(true)
    setError(null)
    try {
      const data = await listShortlistsByBroker(broker.slug)
      setShortlists(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando shortlists')
    } finally {
      setLoading(false)
    }
  }, [broker])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createAndSend = useCallback(async (input: CreateAndSendInput) => {
    if (!broker) throw new Error('Broker no resuelto')

    const payload: CreateShortlistPayload = {
      broker_slug: broker.slug,
      cliente_nombre: input.cliente_nombre,
      cliente_telefono: input.cliente_telefono,
      mensaje_whatsapp: input.mensaje_whatsapp || null,
      propiedad_ids: input.propiedad_ids,
      tipo_operacion: input.tipo_operacion,
    }

    const shortlist = await createShortlist(payload)
    const url = publicShortlistURL(shortlist.hash)
    const message = input.mensaje_whatsapp ||
      defaultShortlistMessage({
        clienteNombre: input.cliente_nombre,
        brokerNombre: broker.nombre,
        shortlistUrl: url,
        cantidadPropiedades: input.propiedad_ids.length,
      })
    const whatsappUrl = buildWhatsAppURL(input.cliente_telefono, message)

    setShortlists(prev => [shortlist, ...prev])
    return { shortlist, whatsappUrl }
  }, [broker])

  const archive = useCallback(async (id: string) => {
    await archiveShortlist(id)
    setShortlists(prev => prev.filter(s => s.id !== id))
  }, [])

  const buildShareUrl = useCallback((hash: string) => publicShortlistURL(hash), [])
  const buildDefaultMessage = useCallback((clienteNombre: string, shortlistUrl: string, cantidadPropiedades: number) => {
    if (!broker) return ''
    return defaultShortlistMessage({
      clienteNombre,
      brokerNombre: broker.nombre,
      shortlistUrl,
      cantidadPropiedades,
    })
  }, [broker])

  // Suprimir warning de updateShortlist sin uso (lo expongo aunque no esté wired al UI todavía)
  void updateShortlist

  return { shortlists, loading, error, refresh, createAndSend, archive, buildShareUrl, buildDefaultMessage }
}
