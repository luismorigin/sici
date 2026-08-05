// API read-only: el pool de comparables que consume el ACM (docs/broker/acm-prototipo.html).
//
// Devuelve los avisos de venta de Equipetrol de 1 y 2 dormitorios, con todo lo que el
// documento necesita para cada uno: precio normalizado, superficie, antigüedad, estado
// de obra, parqueo, amenidades, la URL de su aviso original, su foto y la fecha de
// entrega declarada. Sin esto el prototipo trabaja con un pool congelado y le muestra
// precios viejos a un cliente real.
//
// 🔴 Alcance: Equipetrol, 1-2 dormitorios. Los 3+ dorm quedan afuera a propósito — hay
// ~29 avisos en 21 edificios, así que al filtrar por superficie y radio casi nunca se
// juntan los 5 comparables mínimos y el informe no se emitiría igual.
//
// Precio: `precio_norm` de la vista shadow (régimen TC nuevo), nunca `precio_usd`
// crudo — regla 1 del sistema de precios en CLAUDE.md.
// Seguridad: service_role server-side (SEGURIDAD_SUPABASE.md regla 1).
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ZONAS_EQUIPETROL_DB } from '@/lib/zonas'

const AREA_MINIMA = 20
const DORMS_MAX = 2
// PostgREST corta en 1000 filas sin avisar y un total exactamente redondo parece un
// dato: se pide de a tandas explícitas hasta que una vuelva incompleta.
const TANDA = 1000

export interface AcmComparable {
  id: number
  e: string          // edificio
  lat: number
  lon: number
  d: number          // dormitorios
  a: number          // superficie m²
  p: number          // precio normalizado USD
  m2: number         // USD/m²
  dias: number       // días publicado
  pq: 'i' | 'n' | 's'  // parqueo: incluido / no / sin declarar
  est: 'P' | 'E' | '-' // preventa / entregado / sin declarar
  am: { pis: 0 | 1; gym: 0 | 1; cow: 0 | 1; sau: 0 | 1 }
  u?: string | null   // aviso original, prefijo 'c' (C21) o 'r' (Remax)
  foto?: string | null
  ent?: string | null // fecha de entrega declarada
}

export interface AcmPoolResponse {
  corte: string       // ISO de cuándo se armó
  n: number
  comparables: AcmComparable[]
}

const amenidad = (fl: unknown, clave: string): 0 | 1 =>
  Array.isArray(fl) && fl.some((x) => String(x).toLowerCase().includes(clave)) ? 1 : 0

// "Junio 2027" — el día no se declara en los avisos, así que decirlo sería inventarlo.
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function mesYAnio(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return res.status(500).json({ error: 'Falta configuración de Supabase' })

  try {
    const supabase = createClient(url, serviceKey)

    const filas: any[] = []
    for (let desde = 0; ; desde += TANDA) {
      const { data, error } = await supabase
        .from('v_mercado_venta_shadow')
        .select('id,nombre_edificio,latitud,longitud,dormitorios,area_total_m2,precio_norm,' +
                'precio_m2,dias_en_mercado,parqueo_incluido,estacionamientos,' +
                'estado_construccion,id_proyecto_master,fuente,url')
        .in('zona', ZONAS_EQUIPETROL_DB)
        .lte('dormitorios', DORMS_MAX)
        .gte('area_total_m2', AREA_MINIMA)
        .not('latitud', 'is', null)
        .not('precio_norm', 'is', null)
        .order('id')
        .range(desde, desde + TANDA - 1)
      if (error) throw error
      filas.push(...(data ?? []))
      if (!data || data.length < TANDA) break
    }

    // Amenidades y fecha de entrega son del EDIFICIO, no del aviso: viven en
    // proyectos_master. 🔴 La entrega NO sale de advisor_property_snapshot: ahí solo
    // la declaran 11 avisos contra 88 acá.
    const pms = Array.from(new Set(filas.map((f) => f.id_proyecto_master).filter(Boolean)))
    const porEdificio = new Map<number, { am: string[]; ent: string | null }>()
    for (let i = 0; i < pms.length; i += 500) {
      const { data } = await supabase
        .from('proyectos_master')
        .select('id_proyecto_master,amenidades_edificio,fecha_entrega')
        .in('id_proyecto_master', pms.slice(i, i + 500))
      for (const pm of data ?? []) {
        porEdificio.set(pm.id_proyecto_master, {
          am: Array.isArray(pm.amenidades_edificio) ? pm.amenidades_edificio : [],
          ent: mesYAnio(pm.fecha_entrega),
        })
      }
    }

    // La FOTO sale del snapshot más reciente de cada aviso.
    // 🔴 No alcanza con el último snapshot: cubre ~140 de 365 avisos, porque no todos
    // se releen la misma noche. Hay que mirar hacia atrás y quedarse con el primero de
    // cada propiedad — y paginar, porque son miles de filas y PostgREST corta en 1000
    // sin avisar (un total exactamente redondo parece un dato y no lo es).
    const ids = filas.map((f) => f.id)
    const desdeFecha = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
    const fotos = new Map<number, string>()
    for (let i = 0; i < ids.length; i += 150) {
      const tanda = ids.slice(i, i + 150)
      for (let pag = 0; ; pag += TANDA) {
        const { data, error } = await supabase
          .from('advisor_property_snapshot')
          .select('property_id,fotos_urls,snapshot_date')
          .in('property_id', tanda)
          .gte('snapshot_date', desdeFecha)
          .order('property_id')
          .order('snapshot_date', { ascending: false })
          .range(pag, pag + TANDA - 1)
        if (error) throw error
        for (const s of data ?? []) {
          // el orden garantiza que la primera de cada propiedad es la más reciente
          if (fotos.has(s.property_id)) continue
          if (Array.isArray(s.fotos_urls) && s.fotos_urls.length) fotos.set(s.property_id, s.fotos_urls[0])
        }
        if (!data || data.length < TANDA) break
      }
    }

    const comparables: AcmComparable[] = filas.map((f) => {
      const edif = porEdificio.get(f.id_proyecto_master)
      const am = edif?.am ?? []
      // El código del aviso, no la URL entera: el cliente le pone el dominio según el
      // prefijo. Ahorra ~40 caracteres por fila sobre 350 filas.
      const cod = f.url ? String(f.url).replace(/^.*\/propiedad\//, '') : null
      return {
        id: f.id,
        e: (f.nombre_edificio || '(sin edificio)').trim(),
        lat: Number(f.latitud), lon: Number(f.longitud),
        d: f.dormitorios,
        a: Math.round(Number(f.area_total_m2)),
        p: Math.round(Number(f.precio_norm)),
        m2: Math.round(Number(f.precio_m2 ?? Number(f.precio_norm) / Number(f.area_total_m2))),
        dias: f.dias_en_mercado ?? 0,
        // 🔴 Solo se afirma el positivo: "sin declarar" no es "no tiene" (regla
        // heredada de expensas y amenidades).
        pq: f.parqueo_incluido === true || (f.estacionamientos ?? 0) > 0 ? 'i'
          : f.parqueo_incluido === false ? 'n' : 's',
        // 🔴 El enum dice `entrega_inmediata`, no `entregado`: escribirlo mal no rompe
        // nada, simplemente deja a todos "sin estado declarar" y el informe mezcla
        // preventa con entregado sin avisar.
        est: f.estado_construccion === 'preventa' || f.estado_construccion === 'pozo' ? 'P'
          : f.estado_construccion === 'entrega_inmediata' ? 'E' : '-',
        am: { pis: amenidad(am, 'piscina'), gym: amenidad(am, 'gim'),
              cow: amenidad(am, 'cowork') || amenidad(am, 'co-work'), sau: amenidad(am, 'sauna') },
        u: cod ? (f.fuente === 'century21' ? 'c' : 'r') + cod : null,
        foto: fotos.get(f.id) ?? null,
        ent: edif?.ent ?? null,
      }
    })

    // 6 h: el pipeline corre de madrugada, no tiene sentido pegarle a la base por cada visita
    res.setHeader('Cache-Control', 'public, max-age=21600, s-maxage=21600')
    const payload: AcmPoolResponse = {
      corte: new Date().toISOString(), n: comparables.length, comparables,
    }
    return res.status(200).json(payload)
  } catch (e: any) {
    console.error('[acm-pool]', e?.message || e)
    return res.status(500).json({ error: 'No se pudo armar el pool' })
  }
}
