// /admin/revisar — LA BANDEJA DEL AUDIT (paso 3 del plan del admin).
//
// La "segunda puerta" del encuadre del founder: el admin entra por PROPIEDAD
// (/admin/propiedades) o por PROBLEMA (acá). Las dos terminan en lo mismo — mirar el
// dato, decidir y trabarlo — pero se llega distinto.
//
// 🔑 POR QUÉ ES UNA PILA DE TARJETAS Y NO UNA TABLA.
// Medido sobre el log del audit: 38 corridas y ~15 veredictos en total, o sea entre 0
// y 5 casos por noche. No hace falta filtrar, paginar ni ordenar — hace falta que
// cada caso muestre TODO lo que necesita para decidirse sin abrir otra pestaña.
// Es lo contrario del supervisor que se retiró hoy, que mostraba un score y ya.
//
// 🔴 LO QUE NUNCA DEBE PASAR ACÁ: que la bandeja vacía y la bandeja rota se vean
// igual. "No hay nada que revisar" es una buena noticia; "no pude cargar" es otra
// cosa. Se distinguen siempre.
import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAdminAuth } from '@/hooks/useAdminAuth'

interface Hallazgo {
  id: number
  superficie: number
  propiedad_id: number
  macrozona: string
  operacion: string
  veredicto: string | null
  pm_actual: number | null
  pm_propuesto: number | null
  nombre_propuesto: string | null
  evidencia: string | null
  contexto: Record<string, unknown>
  estado: string
  primera_vez_at: string
  visto_veces: number
}

const SUPERFICIE_NOMBRE: Record<number, string> = {
  1: 'Sin edificio, pero el aviso lo nombra',
  2: 'Match automático riesgoso',
  4: 'El lector dudó al asignarlo',
}

const VEREDICTO_ESTILO: Record<string, { texto: string; clase: string }> = {
  APROBAR:   { texto: '✅ Asignar el edificio',    clase: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  CORREGIR:  { texto: '🔴 Corregir el edificio',   clase: 'bg-red-100 text-red-800 border-red-300' },
  CONFIRMAR: { texto: '✅ Confirmar el que tiene', clase: 'bg-sky-100 text-sky-800 border-sky-300' },
  RECHAZAR:  { texto: '⛔ Desconectar del edificio', clase: 'bg-amber-100 text-amber-800 border-amber-300' },
  PM_NUEVO:  { texto: '🆕 Edificio nuevo',         clase: 'bg-violet-100 text-violet-800 border-violet-300' },
  SIN_NOMBRE:{ texto: '— El aviso no lo nombra',   clase: 'bg-slate-100 text-slate-700 border-slate-300' },
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function BandejaDelAudit() {
  const { admin, loading: authLoading } = useAdminAuth()
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [cargando, setCargando] = useState(true)
  // 🔴 `null` = cargó bien · string = falló. Sin esta distinción, una bandeja rota
  // se ve idéntica a una bandeja vacía — y "no hay nada que revisar" es justo lo que
  // uno quiere creer.
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<number | null>(null)
  const [avisos, setAvisos] = useState<Record<number, string>>({})

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await fetch('/api/admin/hallazgos')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setHallazgos(j.hallazgos || [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo cargar')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { if (admin) cargar() }, [admin, cargar])

  async function resolver(h: Hallazgo, accion: 'aplicar' | 'descartar') {
    let motivo: string | null = null
    if (accion === 'descartar') {
      // Un "no" sin razón se vuelve a proponer la noche siguiente y nadie recuerda
      // por qué se había dicho que no.
      motivo = window.prompt('¿Por qué se descarta? (queda registrado)')
      if (motivo === null) return
    }
    setTrabajando(h.id)
    try {
      const r = await fetch('/api/admin/hallazgos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: h.id, accion, motivo }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setHallazgos(prev => prev.filter(x => x.id !== h.id))
    } catch (e) {
      // El error va PEGADO a su tarjeta, no en un toast que se va: casi siempre es
      // el candado avisando que el mundo se movió, y eso hay que poder leerlo.
      setAvisos(prev => ({ ...prev, [h.id]: e instanceof Error ? e.message : 'no se pudo' }))
    } finally {
      setTrabajando(null)
    }
  }

  if (authLoading) return <div className="min-h-screen grid place-items-center text-slate-500">Verificando acceso…</div>
  if (!admin) return null

  return (
    <>
      <Head><title>Revisar hallazgos | SICI Admin</title></Head>
      <div className="min-h-screen bg-slate-50">
        <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white py-4 px-6 shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Revisar hallazgos</h1>
              <p className="text-slate-400 text-sm">Lo que el audit encontró anoche y necesita tu decisión</p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={cargar} disabled={cargando}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
                {cargando ? 'Cargando…' : '🔄 Actualizar'}
              </button>
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm">Propiedades</Link>
              <Link href="/admin/market" className="text-slate-300 hover:text-white text-sm">Market</Link>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-8">
          {error ? (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
              <p className="font-semibold text-red-800">No se pudo cargar la bandeja</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <p className="text-red-600 text-xs mt-3">
                🔑 Esto <b>no</b> significa que no haya hallazgos — significa que no se pudieron leer.
              </p>
            </div>
          ) : cargando ? (
            <p className="text-slate-500 text-center py-16">Cargando…</p>
          ) : hallazgos.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-slate-800 font-medium">Nada que revisar</p>
              <p className="text-slate-500 text-sm mt-1">
                El audit no dejó hallazgos pendientes. Se llena solo con la corrida de esta noche.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-slate-600 text-sm">
                <b>{hallazgos.length}</b> {hallazgos.length === 1 ? 'caso espera' : 'casos esperan'} tu decisión.
              </p>

              {hallazgos.map(h => {
                const v = h.veredicto ? VEREDICTO_ESTILO[h.veredicto] : null
                const dias = diasDesde(h.primera_vez_at)
                return (
                  <article key={h.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-slate-500">#{h.propiedad_id}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-700">{SUPERFICIE_NOMBRE[h.superficie] || `Superficie ${h.superficie}`}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{h.macrozona} · {h.operacion}</span>
                      </div>
                      {/* Cuántas noches lleva esperando. Un caso que vuelve 6 veces no
                          es un caso más: es uno que nadie se anima a decidir. */}
                      {h.visto_veces > 1 && (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          vuelve hace {dias === 0 ? 'hoy' : `${dias} día${dias === 1 ? '' : 's'}`} · {h.visto_veces} veces
                        </span>
                      )}
                    </div>

                    <div className="px-5 py-4">
                      {v && (
                        <span className={`inline-block text-sm font-medium px-3 py-1 rounded-full border ${v.clase}`}>
                          {v.texto}
                        </span>
                      )}

                      <p className="text-sm text-slate-700 mt-3">
                        {h.pm_actual ? <>Edificio actual: <b>{h.pm_actual}</b></> : <span className="text-slate-500">Hoy no tiene edificio asignado</span>}
                        {h.pm_propuesto != null && <> → pasaría a <b>{h.pm_propuesto}</b></>}
                        {h.nombre_propuesto && <> · nombre propuesto: <b>{h.nombre_propuesto}</b></>}
                      </p>

                      {/* 🔑 LA EVIDENCIA ES EL CORAZÓN DE LA PANTALLA. Sin la cita del
                          anuncio, aprobar es confiar a ciegas en un score — que es
                          exactamente lo que hacía el supervisor que se retiró hoy. */}
                      {h.evidencia && (
                        <blockquote className="mt-3 border-l-4 border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-700 italic">
                          {h.evidencia}
                        </blockquote>
                      )}

                      {avisos[h.id] && (
                        <p className="mt-3 text-sm bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2">
                          {avisos[h.id]}
                        </p>
                      )}

                      <div className="mt-4 flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => resolver(h, 'aplicar')}
                          disabled={trabajando === h.id || h.pm_propuesto == null}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg">
                          {trabajando === h.id ? 'Aplicando…' : 'Aplicar'}
                        </button>
                        <button
                          onClick={() => resolver(h, 'descartar')}
                          disabled={trabajando === h.id}
                          className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm px-4 py-2 rounded-lg">
                          Descartar
                        </button>
                        <Link href={`/admin/propiedades/${h.propiedad_id}`}
                          className="text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2">
                          Abrir la propiedad
                        </Link>
                        {h.pm_propuesto == null && h.veredicto === 'PM_NUEVO' && (
                          <span className="text-xs text-slate-500">
                            Un edificio nuevo se crea en <Link href="/admin/proyectos" className="underline">Proyectos</Link> —
                            necesita GPS verificado a mano.
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
