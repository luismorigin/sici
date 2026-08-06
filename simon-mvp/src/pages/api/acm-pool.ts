// API read-only: el pool de comparables que consume el ACM (docs/broker/acm-prototipo.html).
//
// Devuelve los avisos de venta de Equipetrol de 1 y 2 dormitorios, con todo lo que el
// documento necesita para cada uno: precio normalizado, superficie, antigüedad, estado
// de obra, parqueo, amenidades, la URL de su aviso original, su foto y la fecha de
// entrega declarada. Sin esto el prototipo trabaja con un pool congelado y le muestra
// precios viejos a un cliente real.
//
// Alcance: Equipetrol, hasta 3 dormitorios.
// Los 3 dorm entran aunque sean pocos (28 avisos en 20 edificios): medido unidad por
// unidad, 19 de las 27 frescas SÍ alcanzan los 5 comparables mínimos a 800 m, con 6,2
// de promedio. Dejarlos afuera por "son pocos" habría negado el informe a dos de cada
// tres casos donde el dato alcanzaba. Cuando no alcanza, el motor no emite y lo dice —
// que es la salida correcta y ya estaba construida.
// Los 4+ dorm quedan afuera: hay UNO solo, no hay con qué compararlo.
//
// Precio: `precio_norm` de la vista shadow (régimen TC nuevo), nunca `precio_usd`
// crudo — regla 1 del sistema de precios en CLAUDE.md.
// Seguridad: service_role server-side (SEGURIDAD_SUPABASE.md regla 1).
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ZONAS_EQUIPETROL_DB } from '@/lib/zonas'

const AREA_MINIMA = 20
const DORMS_MAX = 3
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
  am: string[]         // las que tenga cargadas el edificio — vacío = no cargadas, NO "no tiene"
  mz?: string | null   // microzona
  amo?: boolean        // ¿el aviso declara si está amoblado? (en venta: ninguno, hasta ahora)
  b?: number | null    // baños (lo declara el 95% de los avisos)
  pi?: number | null   // piso (lo declara el 47%)
  eo?: 'aviso' | 'vecinos' | 'alquiler' | null // de dónde salió el estado de obra
  u?: string | null   // aviso original, prefijo 'c' (C21) o 'r' (Remax)
  foto?: string | null
  ent?: string | null // fecha de entrega declarada
}

export interface AcmPoolResponse {
  corte: string       // ISO de cuándo se armó
  n: number
  comparables: AcmComparable[]
}

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
                'estado_construccion,id_proyecto_master,fuente,url,banos,piso,microzona,amoblado,' +
                // misma fuente que el feed (buscar_unidades_simple_shadow): el aviso trae
                // sus fotos en datos_json. Cubre 365/365 — el snapshot diario solo 213.
                'datos_json->contenido->fotos_urls')
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

    // ESTADO DE OBRA. La vista v_estado_obra_inferido_shadow (migs 302/303) deduce el
    // estado de los avisos que no lo declaran: rescata 119 de los 182 que acá quedaban
    // en "sin declarar", o sea que la mezcla de preventa con entregado baja del 50% al
    // 17%. 🔴 Trae `estado_origen` justamente para poder DECLARAR lo deducido: cuando
    // sale de los vecinos del edificio o de que hay un alquiler activo, el documento lo
    // dice — nunca se presenta una inferencia como si el aviso lo hubiera declarado.
    const estados = new Map<number, { est: 'P' | 'E'; origen: string }>()
    for (let i = 0; i < filas.length; i += 500) {
      const { data } = await supabase
        .from('v_estado_obra_inferido_shadow')
        .select('propiedad_id,estado_efectivo,estado_origen')
        .in('propiedad_id', filas.slice(i, i + 500).map((f) => f.id))
      for (const e of data ?? []) {
        const v = e.estado_efectivo === 'preventa' || e.estado_efectivo === 'pozo' ? 'P'
          : e.estado_efectivo === 'entrega_inmediata' || e.estado_efectivo === 'entregado' ? 'E' : null
        if (v) estados.set(e.propiedad_id, { est: v, origen: e.estado_origen })
      }
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

    // MICROZONA. El trigger no se la asignó a 108 de 365 avisos, pero la microzona es
    // del EDIFICIO: si otro aviso de la misma torre la tiene, vale para todos. Eso sube
    // la cobertura de 257 a 318 (87%). Los que quedan sin, quedan sin — no se inventa.
    const mzPorEdificio = new Map<string, string>()
    for (const f of filas) {
      const e = (f.nombre_edificio || '').trim()
      if (e && f.microzona && !mzPorEdificio.has(e)) mzPorEdificio.set(e, f.microzona)
    }

    const comparables: AcmComparable[] = filas.map((f) => {
      const edif = porEdificio.get(f.id_proyecto_master)
      const inf = estados.get(f.id)
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
        est: inf ? inf.est
          : f.estado_construccion === 'preventa' || f.estado_construccion === 'pozo' ? 'P'
          : f.estado_construccion === 'entrega_inmediata' ? 'E' : '-',
        eo: inf ? (inf.origen as any) : (f.estado_construccion ? 'aviso' : null),
        amo: f.amoblado != null,
        mz: f.microzona ?? mzPorEdificio.get((f.nombre_edificio || '').trim()) ?? null,
        b: f.banos != null ? Number(f.banos) : null,
        pi: f.piso != null ? Number(f.piso) : null,
        am,
        u: cod ? (f.fuente === 'century21' ? 'c' : 'r') + cod : null,
        foto: Array.isArray(f.fotos_urls) && f.fotos_urls.length ? f.fotos_urls[0] : null,
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
