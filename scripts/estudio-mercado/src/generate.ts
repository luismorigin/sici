import 'dotenv/config'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchTC, setTC } from './db.js'
import {
  panoramaMercado, posicionCompetitiva, competidores,
  demandaTipologia, simulacionPrecio, visibilidadPortales,
  yieldInversor, rotacionObservada,
} from './tools/index.js'
import { assembleHTML } from './html/shell.js'
import type { ClientConfig, EstudioCompleto } from './types.js'

// --- Config loader ---
async function loadConfig(name: string): Promise<ClientConfig> {
  const mod = await import(`./config/${name}.js`)
  // Support both default and named exports
  return mod.default ?? mod[Object.keys(mod)[0]]
}

// --- Main ---
async function main() {
  const configName = process.argv[2] ?? 'condado-vi'
  console.log(`\n  Generando estudio de mercado: ${configName}\n`)

  // 1. Load config
  const config = await loadConfig(configName)
  console.log(`  Proyecto: ${config.projectName}`)
  console.log(`  Zona: ${config.zona}`)
  console.log(`  Inventario: ${config.inventory.length} unidades\n`)

  // 2. Fetch TC and set for precio_normalizado calculations
  const tc = await fetchTC()
  setTC(tc)
  console.log(`  TC paralelo: Bs ${tc.paralelo.toFixed(2)}`)
  console.log(`  TC oficial: Bs ${tc.oficial.toFixed(2)}\n`)

  // 3. Run all tools in parallel
  console.log('  Ejecutando herramientas...')
  const [panorama, posicion, comp, demanda, simulacion, visibilidad, yieldData, rotacion] = await Promise.all([
    panoramaMercado(tc),
    posicionCompetitiva(config, tc),
    competidores(config.zona, 10),
    demandaTipologia(config.zona),
    simulacionPrecio(config, tc),
    visibilidadPortales(config, tc),
    yieldInversor(config.zona),
    rotacionObservada(config.zona, 30, tc.paralelo, config.falsosPositivosIds ?? []),
  ])

  console.log(`  - Panorama: ${panorama.totalUnidades} unidades en ${panorama.byZona.length} zonas`)
  console.log(`  - Competidores: ${comp.totalProyectos} proyectos, top ${comp.top.length}`)
  console.log(`  - Demanda: ${demanda.byDorms.length} tipologias`)
  console.log(`  - Posicion: ${posicion.categoriaGlobal} (${posicion.diffPctGlobal > 0 ? '+' : ''}${posicion.diffPctGlobal}%)`)
  console.log(`  - Visibilidad: ${visibilidad.visiblesEnPortal}/${visibilidad.totalInventario} visibles (gap ${visibilidad.gapPct}%)`)
  console.log(`  - Yield: ${yieldData.byDorms.length} tipologias con datos`)
  console.log(`  - Rotacion: ${rotacion.totalRotadas} salidas en ${rotacion.dias}d`)
  console.log(`  - Simulacion: ${simulacion.escenarios.length} escenarios\n`)

  // 4. Assemble
  const estudio: EstudioCompleto = {
    config,
    tc,
    panorama,
    posicion,
    competidores: comp,
    demanda,
    simulacion,
    visibilidad,
    yield: yieldData,
    rotacion,
  }

  const html = assembleHTML(estudio)

  // 5. Write output
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const outputPath = resolve(__dirname, '..', '..', '..', 'simon-mvp', 'public', 'reports', `${configName}-abril-2026.html`)
  writeFileSync(outputPath, html, 'utf-8')

  console.log(`  HTML generado: ${outputPath}`)
  console.log(`  Tamano: ${(html.length / 1024).toFixed(1)} KB\n`)
}

main().catch(err => {
  console.error('\n  Error:', err.message)
  process.exit(1)
})
