import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Contadores {
  matching: number
  sinMatch: number
  excluidas: number
}

export default function SupervisorIndex() {
  const [contadores, setContadores] = useState<Contadores>({
    matching: 0,
    sinMatch: 0,
    excluidas: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchContadores()
  }, [])

  const fetchContadores = async () => {
    if (!supabase) return

    try {
      // Matching pendientes
      const { data: matchingData } = await supabase.rpc('obtener_pendientes_para_sheets')

      // Sin match
      const { data: sinMatchData } = await supabase.rpc('obtener_sin_match_para_exportar', { p_limit: 1000 })

      // Excluidas
      const { data: excluidasData } = await supabase.rpc('exportar_propiedades_excluidas')

      setContadores({
        matching: matchingData?.length || 0,
        sinMatch: sinMatchData?.length || 0,
        excluidas: excluidasData?.length || 0
      })
    } catch (err) {
      console.error('Error fetching contadores:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalPendientes = contadores.matching + contadores.sinMatch + contadores.excluidas

  return (
    <>
      <Head>
        <title>Supervisor HITL | SICI Admin</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Supervisor HITL</h1>
              <p className="text-slate-400 text-sm">Human-in-the-Loop Dashboard</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm">
                Propiedades
              </Link>
              <Link href="/admin/proyectos" className="text-slate-300 hover:text-white text-sm">
                Proyectos
              </Link>
              <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm">
                Ir a Buscar
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto py-12 px-6">
          {/* Resumen */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900">
                {loading ? '...' : totalPendientes}
              </h2>
              <p className="text-gray-500">items pendientes de revisión</p>
            </div>

            {totalPendientes === 0 && !loading && (
              <div className="text-center py-4">
                <div className="text-5xl mb-2">&#127881;</div>
                <p className="text-green-600 font-medium">Todo al día</p>
              </div>
            )}
          </div>

          {/* Cards de secciones */}
          <div className="grid grid-cols-3 gap-6">
            {/* Matching */}
            <Link
              href="/admin/supervisor/matching"
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4 border-amber-500"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-4xl">&#128269;</div>
                {contadores.matching > 0 && (
                  <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                    {contadores.matching}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Matching Pendientes
              </h3>
              <p className="text-gray-500 text-sm">
                Aprobar o rechazar matches de 70-84% confianza
              </p>
            </Link>

            {/* Sin Match */}
            <Link
              href="/admin/supervisor/sin-match"
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4 border-orange-500"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-4xl">&#128204;</div>
                {contadores.sinMatch > 0 && (
                  <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                    {contadores.sinMatch}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Propiedades Huérfanas
              </h3>
              <p className="text-gray-500 text-sm">
                Asignar proyecto a propiedades sin match
              </p>
            </Link>

            {/* Excluidas */}
            <Link
              href="/admin/supervisor/excluidas"
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4 border-red-500"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-4xl">&#128683;</div>
                {contadores.excluidas > 0 && (
                  <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                    {contadores.excluidas}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Propiedades Excluidas
              </h3>
              <p className="text-gray-500 text-sm">
                Revisar y corregir propiedades con datos problemáticos
              </p>
            </Link>
          </div>

          {/* Info */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Sistema HITL (Human-in-the-Loop)</strong>
            <p className="mt-1">
              Este dashboard reemplaza los workflows de Google Sheets para la revisión manual de propiedades.
              Todas las acciones se registran directamente en la base de datos.
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
