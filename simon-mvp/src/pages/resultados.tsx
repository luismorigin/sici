import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  buscarUnidadesReales,
  UnidadReal,
  FiltrosBusqueda,
  obtenerAnalisisFiduciario,
  AnalisisMercadoFiduciario,
  AlertaFiduciaria,
  OpcionExcluida
} from '@/lib/supabase'
import {
  getCostosOcultosEstimados,
  getIconoInclusion,
  METADATA_INVESTIGACION
} from '@/config/estimados-mercado'
import {
  innegociablesToAmenidades,
  getPorcentajeMercado,
  esAmenidadDestacada,
  esAmenidadEstandar
} from '@/config/amenidades-mercado'
import {
  getMensajeEquipamiento,
  getCostoEquipamiento
} from '@/config/estimados-equipamiento'

/**
 * SÍNTESIS FIDUCIARIA - Resumen inteligente que combina TODOS los datos
 * Patrón MOAT: DATO → CONTEXTO → ACCIÓN
 *
 * Tipos:
 * - oportunidad: Precio bajo + tiempo razonable
 * - premium: Precio alto (puede justificarse)
 * - justo: Precio de mercado
 * - sospechoso: Contradicción (muy bajo + mucho tiempo)
 */
type TipoSintesis = 'oportunidad' | 'premium' | 'justo' | 'sospechoso'

interface SintesisFiduciaria {
  headline: string
  detalles: string
  accion: string
  tipo: TipoSintesis
}

interface DatosSintesis {
  // Precio
  diferenciaPct: number | null  // vs mercado
  // Tiempo
  diasEnMercado: number | null
  diasMedianaZona: number | null  // umbral dinámico
  diasPromedioZona: number | null
  // Escasez (parseado de razon_fiduciaria)
  escasez: number | null
  // Equipamiento
  equipamiento: string[]
  // Estado
  estadoConstruccion: string
  // Amenidades
  amenidadesConfirmadas: string[]
  amenidadesPorVerificar: string[]
  // Costos
  parqueoTexto: string  // "A veces incluido", "Rara vez incluido", etc.
  baulераTexto: string
  costoExtraPotencial: number | null  // monto si no incluyen parqueo+baulera
}

function generarSintesisFiduciaria(datos: DatosSintesis): SintesisFiduciaria {
  const {
    diferenciaPct,
    diasEnMercado,
    diasMedianaZona,
    diasPromedioZona,
    escasez,
    equipamiento,
    estadoConstruccion,
    amenidadesConfirmadas,
    amenidadesPorVerificar,
    parqueoTexto,
    baulераTexto,
    costoExtraPotencial
  } = datos

  // Umbrales dinámicos (fallback a valores conocidos si no hay datos)
  const umbralSospecha = diasMedianaZona ?? 74
  const umbralFuerte = diasPromedioZona ?? 104

  const dias = diasEnMercado ?? 0
  const diffPct = Math.round(diferenciaPct ?? 0)

  // 1. DETERMINAR TIPO BASE
  let tipo: TipoSintesis = 'justo'
  if (diffPct <= -10) {
    tipo = 'oportunidad'
  } else if (diffPct >= 10) {
    tipo = 'premium'
  }

  // 2. DETECTAR CONTRADICCIONES (oportunidad + mucho tiempo = sospechoso)
  // Si está MUY bajo (>20%) y lleva más que la mediana, es sospechoso
  // Si está moderadamente bajo (10-20%) y lleva más que el promedio, es sospechoso
  if (tipo === 'oportunidad') {
    if (diffPct <= -20 && dias >= umbralSospecha) {
      tipo = 'sospechoso'  // Muy bajo + sobre mediana = sospechoso
    } else if (dias >= umbralFuerte) {
      tipo = 'sospechoso'  // Cualquier oportunidad + sobre promedio = sospechoso
    }
  }

  // 3. CONSTRUIR HEADLINE - Precio + Tiempo integrado
  let headline: string
  const meses = dias > 0 ? Math.round(dias / 30) : 0
  const tiempoCorto = dias <= 30 ? 'publicado reciente' : dias < umbralSospecha ? `${meses} mes${meses > 1 ? 'es' : ''} publicado` : null
  const tiempoLargo = dias >= umbralSospecha ? `${meses} meses publicado` : null

  // Si no tenemos datos de comparación (diferenciaPct era null), mostrar mensaje neutro
  const sinDatosComparacion = diferenciaPct === null

  if (sinDatosComparacion) {
    // No podemos comparar vs mercado - mostrar lo que sabemos
    if (tiempoLargo) {
      headline = `${tiempoLargo} - sin datos de zona para comparar precio`
    } else {
      headline = 'Sin datos de zona para comparar precio'
    }
  } else if (tipo === 'sospechoso') {
    headline = `${Math.abs(diffPct)}% bajo mercado - ${tiempoLargo}`
  } else if (diffPct <= -10) {
    headline = `Oportunidad: ${Math.abs(diffPct)}% bajo mercado`
  } else if (diffPct >= 10) {
    headline = `Premium: ${diffPct}% sobre mercado`
  } else if (diffPct >= -5 && diffPct <= 5) {
    headline = 'Precio de mercado'
  } else if (diffPct < 0) {
    headline = `${Math.abs(diffPct)}% bajo promedio`
  } else {
    headline = `${diffPct}% sobre promedio`
  }

  // 4. CONSTRUIR LÍNEAS DE DETALLE - Cada una toca un aspecto
  const lineas: string[] = []

  // Línea 1: Tiempo + Escasez
  const parteTiempo = tiempoCorto ? `${tiempoCorto}` : (tiempoLargo && tipo !== 'sospechoso') ? tiempoLargo : null
  const parteEscasez = escasez && escasez <= 5
    ? (escasez === 1 ? 'única opción similar' : `solo ${escasez} similares`)
    : null

  if (parteTiempo || parteEscasez) {
    const partes = [parteTiempo, parteEscasez].filter(Boolean)
    lineas.push(partes.join(' • '))
  }

  // Línea 2: Amenidades | Equipamiento - con contexto MOAT
  const tieneAmenConfirmadas = amenidadesConfirmadas.length > 0
  const tieneAmenPorVerificar = amenidadesPorVerificar.length > 0
  const tieneEquipamiento = equipamiento.length > 0

  let lineaAmenEquip = ''

  if (tieneAmenConfirmadas) {
    // Caso A: Hay amenidades confirmadas
    const amenTop = amenidadesConfirmadas.slice(0, 2).map(a => `${a} ✓`).join(', ')
    lineaAmenEquip = amenTop
  } else if (tieneAmenPorVerificar) {
    // Caso B: Solo hay por verificar - dar contexto
    lineaAmenEquip = `Sin amenidades confirmadas (verificar: ${amenidadesPorVerificar.slice(0, 2).join(', ')})`
  } else {
    // Caso C: No hay ninguna amenidad
    lineaAmenEquip = 'Amenidades no especificadas'
  }

  // Agregar equipamiento si hay
  if (tieneEquipamiento) {
    const equipTop = equipamiento.slice(0, 2).join(', ')
    lineaAmenEquip = `${lineaAmenEquip} | ${equipTop}`
  } else if (!tieneAmenConfirmadas && !tieneAmenPorVerificar) {
    // Solo si tampoco hay amenidades, mencionar que no hay equip
    lineaAmenEquip = 'Sin amenidades ni equipamiento especificados'
  }

  lineas.push(lineaAmenEquip)

  // Línea 3: Costos (parqueo + baulera)
  const parqueoCorto = parqueoTexto.toLowerCase().includes('rara') ? 'parqueo rara vez incluido'
    : parqueoTexto.toLowerCase().includes('veces') ? 'parqueo a veces incluido'
    : parqueoTexto.toLowerCase().includes('frecuente') ? 'parqueo frecuente incluido'
    : null
  const baulераCorto = baulераTexto.toLowerCase().includes('rara') ? 'baulera rara vez'
    : baulераTexto.toLowerCase().includes('veces') ? 'baulera a veces'
    : null

  if (parqueoCorto || baulераCorto) {
    const costos = [parqueoCorto, baulераCorto].filter(Boolean).join(', ')
    lineas.push(costos)
  }

  // Línea 4: Costo extra potencial (siempre mostrar si hay)
  if (costoExtraPotencial && costoExtraPotencial > 0) {
    lineas.push(`Costo real: hasta +$${costoExtraPotencial.toLocaleString()} si no incluyen parqueo/baulera`)
  }

  // Línea 5: Estado construcción
  if (estadoConstruccion === 'preventa') {
    lineas.push('⚠️ Preventa - verificar fecha entrega')
  }

  // 5. GENERAR ACCIÓN según tipo
  let accion: string

  // Caso especial: sin datos de comparación
  if (sinDatosComparacion) {
    accion = 'Pedí datos de otras unidades en la zona para comparar'
  } else {
    switch (tipo) {
      case 'oportunidad':
        if (estadoConstruccion === 'preventa') {
          accion = 'Buen precio - verificá fecha entrega y qué incluye'
        } else if (escasez && escasez <= 2) {
          accion = 'Pocas opciones a este precio - verificá estado real'
        } else {
          accion = 'Buen precio - verificá por qué y el estado real'
        }
        break
      case 'premium':
        accion = '¿Justifica el precio extra vs alternativas?'
        break
      case 'sospechoso':
        accion = 'Precio atractivo pero investigá por qué no se vendió'
        break
      default: // justo
        accion = 'Sin urgencia - tomá tu tiempo para comparar'
    }
  }

  return {
    headline,
    detalles: lineas.join('\n'),
    accion,
    tipo
  }
}

/**
 * Extrae escasez de la razón fiduciaria del SQL
 */
function parseEscasezDeRazon(razon: string | null | undefined): number | null {
  if (!razon) return null

  // "1 de solo X deptos"
  const match1 = razon.match(/de solo (\d+) deptos?/i)
  if (match1) return parseInt(match1[1])

  // "Solo X opciones"
  const match2 = razon.match(/Solo (\d+) opciones?/i)
  if (match2) return parseInt(match2[1])

  // "Único"
  if (/Único/i.test(razon)) return 1

  return null
}

export default function ResultadosPage() {
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<UnidadReal[]>([])
  const [analisisFiduciario, setAnalisisFiduciario] = useState<AnalisisMercadoFiduciario | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPremiumModal, setShowPremiumModal] = useState(false)

  // Parsear filtros de URL
  const {
    presupuesto,
    zonas,
    dormitorios,
    estado_entrega,
    innegociables,
    // Nivel 2 - para contexto
    quienes_viven,
    mascotas,
    tiempo_buscando,
    estado_emocional,
  } = router.query

  useEffect(() => {
    const cargar = async () => {
      if (!router.isReady) return

      setLoading(true)

      const filtros: FiltrosBusqueda = {
        precio_max: parseInt(presupuesto as string) || 300000,
        limite: 50,
      }

      if (dormitorios) {
        filtros.dormitorios = parseInt(dormitorios as string)
      }

      if (zonas && (zonas as string).length > 0) {
        filtros.zonas_permitidas = (zonas as string).split(',').filter(Boolean)
      }

      if (estado_entrega && estado_entrega !== 'no_importa') {
        filtros.estado_entrega = estado_entrega as any
      }

      // Buscar propiedades que cumplen filtros (con fotos)
      const data = await buscarUnidadesReales(filtros)
      setPropiedades(data)

      // Llamar análisis fiduciario con contexto del usuario
      const innegociablesArray = innegociables
        ? (innegociables as string).split(',').filter(Boolean)
        : []

      const analisis = await obtenerAnalisisFiduciario({
        dormitorios: dormitorios ? parseInt(dormitorios as string) : undefined,
        precio_max: parseInt(presupuesto as string) || 300000,
        zona: zonas ? (zonas as string).split(',')[0] : undefined,
        solo_con_fotos: true,
        limite: 50,
        // Contexto fiduciario para alertas
        innegociables: innegociablesArray,
        contexto: {
          estado_emocional: estado_emocional as string || undefined,
          meses_buscando: tiempo_buscando === 'mas_1_ano' ? 18
            : tiempo_buscando === '6_12_meses' ? 9
            : tiempo_buscando === '3_6_meses' ? 5
            : tiempo_buscando === '1_3_meses' ? 2
            : undefined,
          mascota: mascotas as string || undefined,
          quienes_viven: quienes_viven as string || undefined,
        }
      })

      setAnalisisFiduciario(analisis)
      setLoading(false)
    }

    cargar()
  }, [router.isReady, presupuesto, zonas, dormitorios, estado_entrega, innegociables, tiempo_buscando, estado_emocional, mascotas, quienes_viven])

  // Separar en TOP 3 y alternativas
  const top3 = propiedades.slice(0, 3)
  const alternativas = propiedades.slice(3, 13)

  // Alertas fiduciarias del SQL (bloque_4_alertas)
  const alertasFiduciarias = analisisFiduciario?.bloque_4_alertas?.alertas || []

  // Excluidas del SQL (bloque_2_opciones_excluidas)
  const excluidasFiduciarias = analisisFiduciario?.bloque_2_opciones_excluidas?.opciones || []

  // Contexto de mercado del SQL (bloque_3_contexto_mercado)
  const contextoMercado = analisisFiduciario?.bloque_3_contexto_mercado

  // Opciones válidas con posición de mercado (bloque_1_opciones_validas)
  const opcionesValidas = analisisFiduciario?.bloque_1_opciones_validas?.opciones || []

  // Helper: obtener posición de mercado para una propiedad
  const getPosicionMercado = (propId: number) => {
    const opcion = opcionesValidas.find(o => o.id === propId)
    return opcion?.posicion_mercado || null
  }

  // Detectar compromisos/tradeoffs de una propiedad
  const getCompromisos = (prop: UnidadReal): { texto: string, tipo: 'warning' | 'info' }[] => {
    const compromisos: { texto: string, tipo: 'warning' | 'info' }[] = []

    // Estado construcción
    if (prop.estado_construccion === 'preventa') {
      compromisos.push({ texto: 'Preventa - esperar entrega', tipo: 'warning' })
    }
    if (prop.estado_construccion === 'usado') {
      compromisos.push({ texto: 'Usado', tipo: 'info' })
    }

    // Área pequeña
    if (prop.area_m2 < 50) {
      compromisos.push({ texto: 'Área compacta', tipo: 'info' })
    }

    // Precio por m² alto vs promedio (>$1800 es caro para Equipetrol)
    if (prop.precio_m2 > 1800) {
      compromisos.push({ texto: 'Precio/m² elevado', tipo: 'warning' })
    }

    // Sin amenities (detectar por nombre de proyecto genérico)
    // Esto es una heurística - en producción tendríamos datos de amenities
    if (prop.precio_m2 < 1200) {
      compromisos.push({ texto: 'Edificio básico', tipo: 'info' })
    }

    return compromisos
  }

  // Generar mensaje WhatsApp
  const generarMensajeWhatsApp = () => {
    const zonasTexto = (zonas as string)?.split(',').filter(Boolean).join(', ') || 'Equipetrol'
    const paraQueTexto = router.query.para_que_es === 'vivienda' ? 'Vivienda'
      : router.query.para_que_es === 'inversion_renta' ? 'Inversión renta'
      : router.query.para_que_es === 'inversion_plusvalia' ? 'Inversión plusvalía'
      : 'Vivienda'

    const top3Texto = top3.map((p, i) =>
      `${i + 1}. ${p.proyecto} - $${p.precio_usd.toLocaleString()}`
    ).join('\n')

    const mensaje = `Hola! Usé Simón y encontré opciones que me interesan.

🔍 Mi búsqueda:
- Presupuesto: hasta $${parseInt(presupuesto as string)?.toLocaleString() || '150,000'}
- Zona: ${zonasTexto}
- Dormitorios: ${dormitorios || 'Todos'}
- Para: ${paraQueTexto}

🏆 TOP 3 que me gustaron:
${top3Texto}

¿Me pueden dar más info?`

    return mensaje
  }

  const abrirWhatsApp = () => {
    const mensaje = generarMensajeWhatsApp()
    const url = `https://wa.me/59176308808?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <Link href="/filtros" className="text-blue-600 hover:underline text-sm">
            ← Nueva busqueda
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            Tus resultados personalizados
          </h1>
          <p className="text-gray-600 mt-1">
            {propiedades.length} propiedades encontradas
          </p>
        </div>

        {/* Alertas fiduciarias del SQL */}
        {alertasFiduciarias.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-amber-800 mb-2">Simon te recuerda:</h3>
            <ul className="text-sm text-amber-700 space-y-1">
              {alertasFiduciarias.map((alerta, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span>{alerta.severidad === 'danger' ? '🚨' : alerta.severidad === 'warning' ? '⚠️' : 'ℹ️'}</span>
                  <span>{alerta.mensaje}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Analizando opciones...</p>
          </div>
        ) : (
          <>
            {/* TOP 3 */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🏆</span>
                <h2 className="text-xl font-bold text-gray-900">TUS 3 MEJORES OPCIONES</h2>
              </div>

              <div className="space-y-4">
                {top3.map((prop, idx) => (
                  <div key={prop.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="flex">
                      {/* Foto */}
                      <div className="w-48 h-40 bg-gray-200 flex-shrink-0">
                        {prop.fotos_urls?.[0] ? (
                          <img
                            src={prop.fotos_urls[0]}
                            alt={prop.proyecto}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            Sin foto
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              #{idx + 1} Match
                            </span>
                            <h3 className="font-bold text-gray-900 mt-1">{prop.proyecto}</h3>
                            <p className="text-sm text-gray-500">{prop.zona}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-gray-900">
                              ${prop.precio_usd.toLocaleString()}
                            </p>
                            <p className="text-sm text-gray-500">
                              ${prop.precio_m2}/m²
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                          <span>{prop.dormitorios} dorms</span>
                          <span>{prop.area_m2}m²</span>
                          <span className="capitalize">{prop.estado_construccion?.replace(/_/g, ' ')}</span>
                        </div>

                        {/* SÍNTESIS FIDUCIARIA - Resumen MOAT integrado */}
                        {(() => {
                          const posicion = getPosicionMercado(prop.id)
                          const metricas = contextoMercado?.metricas_zona
                          const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)

                          // Calcular costo extra potencial (parqueo + baulera si no incluidos)
                          // Usar promedio de min-max para cada componente
                          const costoParqueo = Math.round((costos.estacionamiento.compra.min + costos.estacionamiento.compra.max) / 2)
                          const costoBaulera = Math.round((costos.baulera.compra.min + costos.baulera.compra.max) / 2)
                          const costoExtra = costoParqueo + costoBaulera

                          // IMPORTANTE: Solo usar diferencia_pct si posicion_mercado fue exitosa
                          // (tiene datos de la zona + tipología para comparar)
                          const tieneComparacionValida = posicion?.success === true
                          const diferenciaPctValida = tieneComparacionValida ? posicion.diferencia_pct : null

                          const sintesis = generarSintesisFiduciaria({
                            diferenciaPct: diferenciaPctValida,
                            diasEnMercado: prop.dias_en_mercado,
                            diasMedianaZona: metricas?.dias_mediana ?? null,
                            diasPromedioZona: metricas?.dias_promedio ?? null,
                            escasez: parseEscasezDeRazon(prop.razon_fiduciaria),
                            equipamiento: prop.equipamiento_detectado || [],
                            estadoConstruccion: prop.estado_construccion || '',
                            amenidadesConfirmadas: prop.amenities_confirmados || [],
                            amenidadesPorVerificar: prop.amenities_por_verificar || [],
                            parqueoTexto: costos.estacionamiento.texto_inclusion || '',
                            baulераTexto: costos.baulera.texto_inclusion || '',
                            costoExtraPotencial: costoExtra
                          })

                          // Colores según tipo
                          const colores = {
                            oportunidad: 'bg-green-50 border-green-200 text-green-800',
                            premium: 'bg-purple-50 border-purple-200 text-purple-800',
                            justo: 'bg-blue-50 border-blue-200 text-blue-800',
                            sospechoso: 'bg-orange-50 border-orange-200 text-orange-800'
                          }

                          const iconos = {
                            oportunidad: '🎯',
                            premium: '⭐',
                            justo: '✓',
                            sospechoso: '⚠️'
                          }

                          return (
                            <div className={`mt-3 px-3 py-2 rounded-lg border ${colores[sintesis.tipo]}`}>
                              <p className="text-sm font-medium">
                                {iconos[sintesis.tipo]} {sintesis.headline}
                              </p>
                              {sintesis.detalles && (
                                <div className="text-xs mt-1 opacity-80 space-y-0.5">
                                  {sintesis.detalles.split('\n').map((linea, i) => (
                                    <p key={i}>{linea}</p>
                                  ))}
                                </div>
                              )}
                              <p className="text-xs mt-2 font-medium border-t border-current/20 pt-1">
                                → {sintesis.accion}
                              </p>
                            </div>
                          )
                        })()}

                        {/* Costos a verificar - estimados de mercado */}
                        {(() => {
                          const costos = getCostosOcultosEstimados(prop.dormitorios, null, null)
                          return (
                            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-semibold text-amber-800">Costos a verificar</span>
                                <span className="text-xs bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded">estimado zona</span>
                              </div>

                              <div className="space-y-1.5 text-sm">
                                {/* Expensas */}
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 w-4">📋</span>
                                  <div>
                                    <span className="text-gray-700">
                                      Expensas: ${costos.expensas.rango_completo.min}-{costos.expensas.rango_completo.max}/mes
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">
                                      (+${costos.expensas.impacto_anual_completo.min.toLocaleString()}-{costos.expensas.impacto_anual_completo.max.toLocaleString()}/año)
                                    </span>
                                    <p className="text-xs text-gray-600">
                                      Depende de amenities del edificio
                                    </p>
                                    <p className="text-xs text-amber-700">
                                      Preguntá qué incluyen y el monto exacto
                                    </p>
                                  </div>
                                </div>

                                {/* Estacionamiento */}
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 w-4">🚗</span>
                                  <div>
                                    <span className="text-gray-700">
                                      Parqueo: ${costos.estacionamiento.compra.min.toLocaleString()}-{costos.estacionamiento.compra.max.toLocaleString()}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({costos.estacionamiento.texto_inclusion})
                                    </span>
                                    <p className="text-xs text-amber-700">
                                      Preguntá si está incluido en el precio
                                    </p>
                                  </div>
                                </div>

                                {/* Baulera */}
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 w-4">📦</span>
                                  <div>
                                    <span className="text-gray-700">
                                      Baulera: ${costos.baulera.compra.min.toLocaleString()}-{costos.baulera.compra.max.toLocaleString()}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({costos.baulera.texto_inclusion})
                                    </span>
                                    <p className="text-xs text-amber-700">
                                      Preguntá si está incluida en el precio
                                    </p>
                                  </div>
                                </div>

                                {/* Costo adicional potencial */}
                                <div className="flex items-start gap-2 pt-1.5 mt-1 border-t border-amber-200">
                                  <span className="text-amber-600 w-4">💡</span>
                                  <span className="text-amber-700 text-xs font-medium">
                                    Costo real puede ser ${(prop.precio_usd + costos.estacionamiento.compra.min + costos.baulera.compra.min).toLocaleString()}-{(prop.precio_usd + costos.estacionamiento.compra.max + costos.baulera.compra.max).toLocaleString()} si no incluyen parqueo ni baulera
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        {/* Días en mercado - interpretación fiduciaria */}
                        {prop.dias_en_mercado != null && (
                          <div className="mt-2 flex items-start gap-2 text-sm">
                            <span className="text-gray-500">📅</span>
                            <div>
                              <span className="text-gray-700">
                                {prop.dias_en_mercado} días publicado
                                <span className="text-gray-500 text-xs ml-1">(promedio zona: 74)</span>
                              </span>
                              {prop.dias_en_mercado > 60 ? (
                                <>
                                  <p className="text-xs text-gray-600">
                                    Hay margen de negociación
                                  </p>
                                  <p className="text-xs text-amber-700">
                                    Consultá si aceptan ofertas
                                  </p>
                                </>
                              ) : prop.dias_en_mercado > 30 ? (
                                <p className="text-xs text-gray-600">
                                  Tiempo normal en el mercado
                                </p>
                              ) : (
                                <p className="text-xs text-gray-600">
                                  Publicación reciente - precio firme probable
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-1">
                                Nota: Promedio Equipetrol 104 días, mediana 74 días.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Comparación edificio/tipología - interpretación fiduciaria híbrida */}
                        {prop.unidades_en_edificio != null && prop.unidades_en_edificio > 1 && (
                          <div className="mt-2 flex items-start gap-2 text-sm">
                            <span className="text-gray-500">🏢</span>
                            <div>
                              {/* Caso A: Hay 2+ unidades de la misma tipología - comparación precisa */}
                              {prop.unidades_misma_tipologia != null && prop.unidades_misma_tipologia >= 2 ? (
                                <>
                                  <span className="text-gray-700">
                                    {prop.posicion_en_tipologia === 1
                                      ? `La más barata de ${prop.unidades_misma_tipologia} unidades de ${prop.dormitorios} dorms`
                                      : prop.posicion_en_tipologia === prop.unidades_misma_tipologia
                                      ? `La más cara de ${prop.unidades_misma_tipologia} unidades de ${prop.dormitorios} dorms`
                                      : `${prop.posicion_en_tipologia}° de ${prop.unidades_misma_tipologia} unidades de ${prop.dormitorios} dorms`}
                                  </span>
                                  <p className="text-xs text-gray-500">
                                    Rango {prop.dormitorios}D: ${prop.precio_min_tipologia?.toLocaleString()} - ${prop.precio_max_tipologia?.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    {prop.posicion_en_tipologia === 1
                                      ? '¿Ganga o compromiso? Puede tener algo diferente (piso bajo, sin vista)'
                                      : prop.posicion_en_tipologia === prop.unidades_misma_tipologia
                                      ? '¿Premium real o sobreprecio? Verificá qué la hace especial'
                                      : 'Opción balanceada, menor riesgo'}
                                  </p>
                                  {prop.posicion_en_tipologia === 1 && (
                                    <p className="text-xs text-amber-700">
                                      Preguntá qué la hace más barata
                                    </p>
                                  )}
                                </>
                              ) : (
                                /* Caso B: Única unidad de esta tipología - mostrar contexto edificio */
                                <>
                                  <span className="text-gray-700">
                                    Única de {prop.dormitorios} dorms en este edificio
                                  </span>
                                  <p className="text-xs text-gray-500">
                                    Rango edificio (todas): ${prop.precio_min_edificio?.toLocaleString()} - ${prop.precio_max_edificio?.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    No hay otras unidades de {prop.dormitorios} dorms para comparar precio
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Amenidades - interpretación fiduciaria híbrida */}
                        {(() => {
                          // Obtener amenidades que el usuario eligió como innegociables
                          const innegociablesArray = innegociables
                            ? (innegociables as string).split(',').filter(Boolean)
                            : []
                          const amenidadesPedidas = innegociablesToAmenidades(innegociablesArray)
                          const usuarioEligioAmenidades = amenidadesPedidas.length > 0

                          // Preparar "También tiene" / "Amenidades destacadas"
                          // Filtrar estándar (Ascensor, Seguridad 24/7, etc.) - solo mostrar diferenciadoras
                          const amenidadesDiferenciadoras = (prop.amenities_confirmados || [])
                            .filter(a => !esAmenidadEstandar(a))
                          const otrasAmenidades = amenidadesDiferenciadoras
                            .filter(a => !amenidadesPedidas.includes(a))
                            .slice(0, 4)
                          const tieneDestacadas = amenidadesDiferenciadoras.some(a => esAmenidadDestacada(a))

                          // Si no hay amenidades diferenciadoras ni pedidas, no mostrar nada
                          if (!amenidadesDiferenciadoras.length && !amenidadesPedidas.length) {
                            return null
                          }

                          return (
                            <div className="mt-2 flex items-start gap-2 text-sm">
                              <span className="text-gray-500">🏊</span>
                              <div>
                                {/* CASO A: Usuario eligió amenidades - mostrar "Lo que pediste" */}
                                {usuarioEligioAmenidades && (
                                  <>
                                    <p className="text-xs text-gray-500 mb-1">Lo que pediste:</p>
                                    <div className="flex flex-wrap gap-1.5 mb-1">
                                      {amenidadesPedidas.map((amenidad, i) => {
                                        const confirmada = prop.amenities_confirmados?.includes(amenidad)
                                        const porVerificar = prop.amenities_por_verificar?.includes(amenidad)
                                        const estado = confirmada ? 'confirmada' : porVerificar ? 'verificar' : 'no_detectado'
                                        return (
                                          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                                            estado === 'confirmada'
                                              ? 'bg-green-50 text-green-700 border-green-200'
                                              : estado === 'verificar'
                                              ? 'bg-gray-100 text-gray-600 border-gray-200'
                                              : 'bg-red-50 text-red-600 border-red-200'
                                          }`}>
                                            {estado === 'confirmada' ? '✓' : estado === 'verificar' ? '?' : '✗'} {amenidad}
                                          </span>
                                        )
                                      })}
                                    </div>
                                    {amenidadesPedidas.some(a => prop.amenities_por_verificar?.includes(a)) && (
                                      <p className="text-xs text-amber-700 mb-2">
                                        Preguntá por {amenidadesPedidas.filter(a => prop.amenities_por_verificar?.includes(a)).join(' y ')} antes de visitar
                                      </p>
                                    )}
                                    {amenidadesPedidas.some(a => !prop.amenities_confirmados?.includes(a) && !prop.amenities_por_verificar?.includes(a)) && (
                                      <p className="text-xs text-red-600 mb-2">
                                        No tiene {amenidadesPedidas.filter(a => !prop.amenities_confirmados?.includes(a) && !prop.amenities_por_verificar?.includes(a)).join(' ni ')} confirmado
                                      </p>
                                    )}
                                  </>
                                )}

                                {/* Sección de otras amenidades / destacadas (solo diferenciadoras) */}
                                {(otrasAmenidades.length > 0 || (!usuarioEligioAmenidades && amenidadesDiferenciadoras.length > 0)) && (
                                  <>
                                    <p className="text-xs text-gray-500 mb-1">
                                      {usuarioEligioAmenidades ? 'También tiene:' : 'Amenidades destacadas:'}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mb-1">
                                      {(usuarioEligioAmenidades ? otrasAmenidades : amenidadesDiferenciadoras.slice(0, 4)).map((a, i) => {
                                        const pct = getPorcentajeMercado(a)
                                        const destacado = esAmenidadDestacada(a)
                                        return (
                                          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                                            destacado
                                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                                              : 'bg-green-50 text-green-700 border-green-200'
                                          }`}>
                                            ✓ {a} {pct && <span className="text-gray-400">({pct}%)</span>}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  </>
                                )}

                                {/* Nota aclaratoria */}
                                <p className="text-xs text-gray-400 mt-1">
                                  % = propiedades del mercado que lo tienen. <span className="text-purple-500">Morado</span> = poco común (&lt;40%).
                                </p>
                              </div>
                            </div>
                          )
                        })()}

                        {/* Equipamiento - interpretación fiduciaria */}
                        {(() => {
                          const mensaje = getMensajeEquipamiento(
                            prop.dormitorios,
                            prop.equipamiento_detectado || []
                          )

                          return (
                            <div className="mt-2 flex items-start gap-2 text-sm">
                              <span className="text-gray-500">🏠</span>
                              <div>
                                <span className={`text-gray-700 ${mensaje.hayDeteccion ? 'font-medium' : ''}`}>
                                  {mensaje.dato}
                                </span>
                                {mensaje.hayDeteccion && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(prop.equipamiento_detectado || []).map((item, i) => (
                                      <span key={i} className="inline-flex items-center px-2 py-0.5
                                        bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  {mensaje.costoReferencia}
                                </p>
                                <p className="text-xs text-amber-700">
                                  {mensaje.accion}
                                </p>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Alternativas */}
            {alternativas.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {alternativas.length} ALTERNATIVAS
                </h2>

                <div className="grid gap-3">
                  {alternativas.map(prop => {
                    const compromisos = getCompromisos(prop)
                    return (
                      <div key={prop.id} className="bg-white rounded-lg shadow p-4">
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-16 bg-gray-200 rounded flex-shrink-0">
                            {prop.fotos_urls?.[0] ? (
                              <img
                                src={prop.fotos_urls[0]}
                                alt={prop.proyecto}
                                className="w-full h-full object-cover rounded"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                Sin foto
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">{prop.proyecto}</h3>
                            <p className="text-sm text-gray-500">
                              {prop.dormitorios}D · {prop.area_m2}m² · {prop.zona}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">${prop.precio_usd.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">${prop.precio_m2}/m²</p>
                          </div>
                        </div>
                        {/* Compromisos visibles */}
                        {compromisos.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-100">
                            {compromisos.map((c, i) => (
                              <span
                                key={i}
                                className={`text-xs px-2 py-1 rounded ${
                                  c.tipo === 'warning'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {c.tipo === 'warning' ? '⚠️ ' : ''}{c.texto}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Excluidas - datos reales del SQL */}
            {excluidasFiduciarias.length > 0 && (
              <section className="mb-8">
                <div className="bg-gray-100 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">🚫</span>
                    <h2 className="text-lg font-semibold text-gray-700">
                      {excluidasFiduciarias.length} PROPIEDADES EXCLUIDAS (más baratas)
                    </h2>
                  </div>

                  <p className="text-sm text-gray-600 mb-4">
                    Encontramos opciones más económicas pero las excluimos por estas razones:
                  </p>

                  <div className="space-y-2 mb-4">
                    {excluidasFiduciarias.slice(0, 5).map((exc) => (
                      <div
                        key={exc.id}
                        className="flex items-center gap-3 bg-white rounded-lg px-4 py-3"
                      >
                        <span className="text-lg">
                          {exc.analisis_exclusion?.razon_principal?.includes('foto') ? '📷' :
                           exc.analisis_exclusion?.razon_principal?.includes('precio') ? '⚠️' :
                           exc.analisis_exclusion?.razon_principal?.includes('innegociable') ? '❌' : '🚫'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-800">{exc.proyecto}</span>
                          <span className="text-gray-500 mx-2">—</span>
                          <span className="text-gray-600">${exc.precio_usd.toLocaleString()}</span>
                          <p className="text-sm text-gray-500 truncate">
                            {exc.analisis_exclusion?.razon_principal || 'Excluida por filtros'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {excluidasFiduciarias.length > 5 && (
                      <p className="text-sm text-gray-500 text-center py-2">
                        +{excluidasFiduciarias.length - 5} propiedades más excluidas
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mb-4">
                    Simon excluye automáticamente propiedades que no cumplen tus criterios o estándares de calidad.
                    Esto te protege de perder tiempo con listings incompletos o sospechosos.
                  </p>

                  <button
                    onClick={() => setShowPremiumModal(true)}
                    className="w-full py-3 px-4 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Ver detalle en Informe Premium
                  </button>
                </div>
              </section>
            )}

            {/* Contexto de Mercado - datos reales del SQL */}
            {contextoMercado && (
              <section className="mb-8">
                <div className="bg-blue-50 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">📊</span>
                    <h2 className="text-lg font-semibold text-blue-900">
                      CONTEXTO DE MERCADO
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-600">{contextoMercado.stock_total}</p>
                      <p className="text-xs text-gray-500">Total mercado</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-600">{contextoMercado.stock_cumple_filtros}</p>
                      <p className="text-xs text-gray-500">Cumplen tus filtros</p>
                    </div>
                    {contextoMercado.metricas_zona && (
                      <>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-gray-700">
                            ${Math.round(contextoMercado.metricas_zona.precio_promedio / 1000)}k
                          </p>
                          <p className="text-xs text-gray-500">Precio promedio</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-gray-700">
                            ${contextoMercado.metricas_zona.precio_m2_promedio}
                          </p>
                          <p className="text-xs text-gray-500">Precio/m² promedio</p>
                        </div>
                      </>
                    )}
                  </div>

                  {contextoMercado.diagnostico && (
                    <p className="text-sm text-blue-800 bg-blue-100 rounded-lg px-4 py-2">
                      💡 {contextoMercado.diagnostico}
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* CTA WhatsApp */}
            <div className="bg-green-600 rounded-xl p-6 text-white text-center">
              <h3 className="text-xl font-bold mb-2">
                ¿Te interesa alguna opcion?
              </h3>
              <p className="text-green-100 mb-4">
                Escribinos por WhatsApp y te ayudamos a coordinar visitas.
              </p>
              <button
                onClick={abrirWhatsApp}
                className="bg-white text-green-600 font-semibold px-6 py-3 rounded-lg hover:bg-green-50 transition-colors inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Quiero que me contacten
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal Premium */}
      {showPremiumModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative">
            {/* Close button */}
            <button
              onClick={() => setShowPremiumModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <span className="text-4xl mb-2 block">🔓</span>
              <h2 className="text-2xl font-bold text-gray-900">
                DESBLOQUEAR INFORME COMPLETO
              </h2>
            </div>

            {/* Benefits */}
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-lg">✅</span>
                <span className="text-gray-700">Detalle de las {excluidasFiduciarias.length || analisisFiduciario?.bloque_2_opciones_excluidas?.total || 0} propiedades excluidas</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-lg">✅</span>
                <span className="text-gray-700">Comparador lado a lado de tus TOP 3</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-lg">✅</span>
                <span className="text-gray-700">Análisis de mercado completo (CMA)</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-lg">✅</span>
                <span className="text-gray-700">Alertas de precio y oportunidades</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-lg">✅</span>
                <span className="text-gray-700">Contacto directo con asesores verificados</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-lg">✅</span>
                <span className="text-gray-700">PDF descargable para compartir</span>
              </div>
            </div>

            {/* Price */}
            <div className="text-center mb-6">
              <p className="text-gray-500 text-sm line-through">$49.99 USD</p>
              <p className="text-3xl font-bold text-gray-900">$29.99 <span className="text-lg font-normal text-gray-500">USD</span></p>
              <p className="text-sm text-green-600 font-medium">Precio de lanzamiento</p>
            </div>

            {/* CTA */}
            <button
              onClick={() => setShowPremiumModal(false)}
              className="w-full py-4 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors mb-4"
            >
              DESBLOQUEAR AHORA
            </button>

            {/* Trust badges */}
            <p className="text-center text-xs text-gray-500">
              🔒 Pago seguro · Acceso inmediato · PDF descargable
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
