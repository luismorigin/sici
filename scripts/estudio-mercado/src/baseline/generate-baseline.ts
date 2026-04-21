import 'dotenv/config'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchTCBinance, setTCBaseline } from './db-baseline.js'
import {
  panoramaMultizona, demandaMultizona, preciosZonaDorms,
  topProyectos, rotacionMultizona, alquilerMultizona,
} from './tools/index.js'
import { assembleBaselineHTML } from './html/shell-baseline.js'
import { createNarrativaRenderer } from './narrativa/loader.js'
import type { BaselineConfig, BaselineResult } from './types-baseline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function loadConfig(name: string): Promise<BaselineConfig> {
  const mod = await import(`./config/${name}.js`)
  return mod.default ?? mod[Object.keys(mod)[0]]
}

async function main() {
  const configName = process.argv[2] ?? 'equipetrol-abril-2026'
  console.log(`\n  Generando reporte baseline: ${configName}\n`)

  const config = await loadConfig(configName)
  console.log(`  Reporte: ${config.reportName}`)
  console.log(`  Edición: ${config.edicion}`)
  console.log(`  Zonas: ${config.zonasIncluidas.join(', ')}\n`)

  // 1. TC Binance (obtener_tc_actuales RPC)
  const tc = await fetchTCBinance()
  setTCBaseline(tc)
  console.log(`  TC oficial: Bs ${tc.oficial.toFixed(2)}`)
  console.log(`  TC paralelo: Bs ${tc.paralelo.toFixed(2)} (spread +${tc.spread.toFixed(1)}%)`)
  console.log(`  Fecha paralelo: ${tc.fechaParalelo}\n`)

  // 2. Correr las 6 tools en paralelo
  console.log('  Ejecutando tools...')
  const [panorama, demanda, precios, proyectos, rotacion, alquiler] = await Promise.all([
    panoramaMultizona(config.zonasIncluidas),
    demandaMultizona(config.zonasIncluidas),
    preciosZonaDorms(config.zonasIncluidas),
    topProyectos(config.zonasIncluidas),
    rotacionMultizona(config.zonasIncluidas),
    alquilerMultizona(config.zonasIncluidas),
  ])

  console.log(`  - Panorama: ${panorama.totalVenta} venta / ${panorama.totalAlquiler} alquiler en ${panorama.totalZonas} zonas`)
  console.log(`  - Inventario estancado excluido: ${panorama.inventarioEstancado} (${panorama.inventarioEstancadoPct}%)`)
  console.log(`  - Demanda: ${demanda.totalGeneral} unidades con mix por zona×dorms`)
  console.log(`  - Precios: ${precios.segmentos.length} segmentos (${precios.rangosChart.length} con n≥20)`)
  console.log(`  - Top proyectos: ${proyectos.top.length} proyectos ≥${proyectos.minUnidades} uds (${proyectos.pctTopSobreTotal}% del inventario)`)
  console.log(`  - Concentración: ${proyectos.concentracion.length} desarrolladoras con ≥2 proyectos`)
  console.log(`  - Alquiler: ${alquiler.total} unidades, ${alquiler.porZona.length} zonas\n`)

  // 3. Cargar narrativa editorial
  const narrativaPath = resolve(__dirname, 'narrativa', `${config.narrativaFile}.md`)
  const narrativa = createNarrativaRenderer(narrativaPath)

  // 4. Ensamblar
  const result: BaselineResult = {
    config,
    tc,
    panorama,
    demanda,
    precios,
    proyectos,
    rotacion,
    alquiler,
  }

  const html = assembleBaselineHTML(result, narrativa)

  // 5. Escribir output
  const outputPath = resolve(__dirname, '..', '..', 'public', 'reports', config.outputFilename)
  writeFileSync(outputPath, html, 'utf-8')

  console.log(`  HTML generado: ${outputPath}`)
  console.log(`  Tamaño: ${(html.length / 1024).toFixed(1)} KB\n`)
}

main().catch(err => {
  console.error('\n  Error:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
