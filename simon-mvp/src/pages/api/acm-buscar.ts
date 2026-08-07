// API read-only: resuelve el link de un aviso de C21 o Remax a la propiedad en la base.
//
// Para qué: hoy el broker carga ocho campos a mano antes de ver nada. Si el aviso ya
// está publicado, tiene el link en el portapapeles — pegarlo y que el análisis se arme
// solo saca la barrera más grande del flujo.
//
// 🔴 Se matchea por el CÓDIGO del aviso, no por la URL completa. C21 arma la URL como
// /propiedad/<codigo>_<slug> y REESCRIBE el slug cuando el captador edita el aviso
// (típicamente al bajar el precio) — el mismo aviso queda con dos URLs distintas. El
// código es único por aviso y sobrevive a la edición. Verificado: se extrae del 100%
// de las 400 URLs de Equipetrol, sin colisiones.
//
// Cuando no se encuentra, importa DECIR POR QUÉ: "no está" y "es de otra zona" mandan
// al broker a hacer cosas distintas.
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ZONAS_EQUIPETROL_DB } from '@/lib/zonas'

export type MotivoNoEncontrado =
  | 'url_no_reconocida' | 'fuera_de_equipetrol' | 'es_alquiler'
  | 'sin_ubicacion' | 'tipologia_fuera_de_alcance' | 'no_esta_en_la_base'
  | 'no_pasa_calidad' | 'error'

export interface AcmBuscarResponse {
  encontrado: boolean
  id?: number
  motivo?: MotivoNoEncontrado
  detalle?: string          // en palabras, para mostrar tal cual
  // lo mínimo para precargar el formulario
  edificio?: string
  dormitorios?: number
  area?: number
  precio?: number
  parqueo?: 'i' | 'n' | 's'
  estado?: 'P' | 'E' | '?'
  piso?: number | null
}

/** Lo que la vista devuelve para precargar el formulario.
 *  Hace falta declararlo: el cliente de Supabase no tiene los tipos generados de las
 *  vistas shadow, así que infiere la fila como error genérico y `tsc` rechaza cada
 *  campo — lo que rompe el build de Vercel, no solo el editor. */
interface FilaVista {
  id: number
  nombre_edificio: string | null
  dormitorios: number | null
  area_total_m2: number | null
  precio_norm: number | null
  parqueo_incluido: boolean | null
  estacionamientos: number | null
  estado_construccion: string | null
  piso: number | null
}

/** El código del aviso dentro de la URL. C21: /propiedad/100250_slug → "100250".
 *  Remax: .../venta-departamento-120034093-274 → "120034093-274". */
export function codigoDeUrl(raw: string): { fuente: 'century21' | 'remax'; codigo: string } | null {
  const u = raw.trim()
  const c21 = u.match(/c21\.com\.bo\/propiedad\/(\d+)/i)
  if (c21) return { fuente: 'century21', codigo: c21[1] }
  const rmx = u.match(/remax\.bo\/propiedad\/.*?-(\d+-\d+)(?:[/?#]|$)/i)
  if (rmx) return { fuente: 'remax', codigo: rmx[1] }
  // pegar solo el código también sirve: el broker no siempre trae la URL entera
  const suelto = u.match(/^(\d{4,}(?:-\d+)?)$/)
  if (suelto) return { fuente: 'century21', codigo: suelto[1] }
  return null
}

const MOTIVOS: Record<MotivoNoEncontrado, string> = {
  url_no_reconocida: 'Ese enlace no parece de Century 21 ni de Remax. Pegue la dirección completa del aviso, o cargue los datos a mano.',
  fuera_de_equipetrol: 'Ese aviso está fuera de Equipetrol. Por ahora el análisis solo cubre esa zona.',
  es_alquiler: 'Ese aviso es de alquiler. Este análisis compara precios de venta.',
  sin_ubicacion: 'Ese aviso no tiene ubicación en el mapa, y el análisis se arma por distancia. Puede cargar los datos a mano eligiendo el edificio.',
  tipologia_fuera_de_alcance: 'Esa tipología queda fuera del alcance: el análisis compara hasta 3 dormitorios.',
  no_esta_en_la_base: 'No encontramos ese aviso. Si se publicó en las últimas horas todavía no lo leímos — se releen de madrugada. Mientras tanto puede cargar los datos a mano.',
  no_pasa_calidad: 'Ese aviso está en nuestra base pero no entra al análisis: quedó marcado como duplicado, dado de baja o con datos incompletos.',
  error: 'No pudimos consultar en este momento. Cargue los datos a mano y vuelva a intentar más tarde.',
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<AcmBuscarResponse>) {
  if (req.method !== 'GET') return res.status(405).json({ encontrado: false, motivo: 'url_no_reconocida' })

  const q = String(req.query.url ?? '').slice(0, 500)
  const ref = codigoDeUrl(q)
  if (!ref) return res.status(200).json({
    encontrado: false, motivo: 'url_no_reconocida', detalle: MOTIVOS.url_no_reconocida })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return res.status(500).json({ encontrado: false })

  try {
    const supabase = createClient(url, serviceKey)
    const patron = ref.fuente === 'century21' ? `%/propiedad/${ref.codigo}_%` : `%-${ref.codigo}`

    const no = (motivo: MotivoNoEncontrado) =>
      res.status(200).json({ encontrado: false, motivo, detalle: MOTIVOS[motivo] })

    // Primero en la TABLA: si el aviso existe pero quedó fuera del feed, hay que poder
    // decir por qué y no un genérico "no está".
    // 🔴 Sin `precio_norm`: esa columna la calcula la vista, no existe en la tabla.
    // Pedirla hacía fallar la query entera, y sin mirar `error` el resultado se
    // presentaba como "no encontramos ese aviso" — un mensaje falso sobre un error.
    const { data, error } = await supabase
      .from('propiedades_v2_shadow')
      .select('id,tipo_operacion,zona,latitud,dormitorios')
      .ilike('url', patron)
      .limit(1)
    if (error) { console.error('[acm-buscar] tabla:', error.message); return no('error') }

    const p = data?.[0]
    if (!p) return no('no_esta_en_la_base')
    if (p.tipo_operacion !== 'venta') return no('es_alquiler')
    if (!ZONAS_EQUIPETROL_DB.includes(p.zona)) return no('fuera_de_equipetrol')
    if (p.latitud == null) return no('sin_ubicacion')
    if (p.dormitorios == null || p.dormitorios > 3) return no('tipologia_fuera_de_alcance')

    // Los datos salen de la VISTA, que es la que normaliza el precio (regla 1 y 10 de
    // CLAUDE.md: nunca `precio_usd` crudo). Si el aviso está en la tabla pero no en la
    // vista, es que no pasó los filtros de calidad.
    const { data: v, error: eVista } = await supabase
      .from('v_mercado_venta_shadow')
      .select('id,nombre_edificio,dormitorios,area_total_m2,precio_norm,' +
              'parqueo_incluido,estacionamientos,estado_construccion,piso')
      .eq('id', p.id)
      .limit(1)
    if (eVista) { console.error('[acm-buscar] vista:', eVista.message); return no('error') }
    const m = (v as unknown as FilaVista[] | null)?.[0]
    if (!m) return no('no_pasa_calidad')

    // ESTADO DE OBRA: sale de la vista que lo INFIERE, igual que el pool. El
    // `estado_construccion` crudo de arriba deja la mitad sin declarar — con él, un
    // depto cuyo edificio ya está entregado se precargaba en "no sé" y el broker tenía
    // que corregirlo a mano. Los dos endpoints tienen que responder lo mismo del mismo
    // aviso, o el formulario contradice a sus propios comparables.
    let estado: 'P' | 'E' | '?' =
      m.estado_construccion === 'preventa' || m.estado_construccion === 'pozo' ? 'P'
      : m.estado_construccion === 'entrega_inmediata' ? 'E' : '?'
    const { data: eo, error: eEstado } = await supabase
      .from('v_estado_obra_inferido_shadow')
      .select('estado_efectivo')
      .eq('propiedad_id', p.id)
      .limit(1)
    if (eEstado) { console.error('[acm-buscar] estado:', eEstado.message); return no('error') }
    const ef = (eo as unknown as { estado_efectivo: string }[] | null)?.[0]?.estado_efectivo
    if (ef === 'preventa' || ef === 'pozo') estado = 'P'
    else if (ef === 'entrega_inmediata' || ef === 'entregado') estado = 'E'

    res.setHeader('Cache-Control', 'public, max-age=600')
    return res.status(200).json({
      encontrado: true,
      id: m.id,
      edificio: (m.nombre_edificio || '').trim() || undefined,
      // sin dormitorios el campo queda vacío, no en cero: el formulario debe pedirlo
      dormitorios: m.dormitorios ?? undefined,
      area: m.area_total_m2 != null ? Math.round(Number(m.area_total_m2)) : undefined,
      precio: m.precio_norm != null ? Math.round(Number(m.precio_norm)) : undefined,
      // "sin declarar" no es "no tiene": el formulario queda en "No sé", no en "No incluye"
      parqueo: m.parqueo_incluido === true || (m.estacionamientos ?? 0) > 0 ? 'i'
        : m.parqueo_incluido === false ? 'n' : 's',
      estado,
      piso: m.piso ?? null,
    })
  } catch (e: any) {
    console.error('[acm-buscar]', e?.message || e)
    return res.status(500).json({ encontrado: false })
  }
}
