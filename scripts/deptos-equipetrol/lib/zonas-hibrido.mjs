// ============================================================================
// PERILLA DE ZONA del flujo híbrido
// ----------------------------------------------------------------------------
// POR QUÉ: hasta hoy cada script traía las 6 zonas de Equipetrol escritas
// adentro — la MISMA lista copiada en 7 archivos (`ZONAS_EQ`), más `ZONA_KEY` y
// `macrozona: 'equipetrol'` sueltos. Apuntar el híbrido a otra zona obligaba a
// duplicar los scripts, que es exactamente el patrón que ya duele en el frontend
// (ventas/alquileres gemelos: cada arreglo se hace dos veces). Una máquina, una
// perilla.
//
// 🔒 DEFAULT = equipetrol. Sin pasar nada, TODO se comporta igual que antes →
// las routines nocturnas (~1:17 venta, ~2:11 alquiler) no cambian. Zona Norte
// hay que pedirla explícitamente. Es a propósito: si algo de ZN sale mal, no
// puede arrastrar a lo que ya funciona.
//
// Uso:
//   node discovery-deptos.mjs                      -> equipetrol (default)
//   node discovery-deptos.mjs --zona=zona-norte    -> Zona Norte
//   ZONA_HIBRIDO=zona-norte node discovery-deptos.mjs
// ============================================================================

/**
 * Config por zona.
 *  - bboxKey        : clave en `sonda-suelo/lib/zonas.mjs` (la red ancha del crawl).
 *  - macrozona      : etiqueta para `proyectos_detectados` (cola de multiproyectos).
 *  - zonas          : nombres canónicos de BD (`zonas_geograficas.nombre`). Es el
 *                     filtro FINO — el bbox solo acota el crawl; la zona la dicta
 *                     `get_zona_by_gps`, fuente de verdad.
 *  - usaPoligono    : si el bbox tiene un polígono real detrás, `enZona` descarta
 *                     los puntos de afuera. Equipetrol NO lo tiene (rectángulo);
 *                     ZN sí (MultiPolygon de las 14 sub-zonas) → menos cuadrantes.
 *  - sufijoArchivo  : se agrega a los nombres de los archivos de trabajo. Vacío en
 *                     Equipetrol A PROPÓSITO (los nombres actuales no cambian → la
 *                     routine sigue encontrando lo suyo). Sin esto, dos zonas
 *                     corriendo a la vez se pisan los chunks de lectura — el bug
 *                     silencioso del 28-jul, que pierde veredictos sin avisar.
 *  - m2Tipico       : rango de $/m² para que el lector desempate dudas de tipo de
 *                     cambio (READER_SPEC). Es propio de cada zona: el rango de
 *                     Equipetrol aplicado a ZN haría clasificar mal.
 */
export const ZONAS_HIBRIDO = {
  equipetrol: {
    id: 'equipetrol',
    nombre: 'Equipetrol',
    bboxKey: 'equipetrol-deptos',
    macrozona: 'equipetrol',
    usaPoligono: false,
    sufijoArchivo: '',
    // RE-MEDIDA 28-sep-2026: p25–p75 de `v_mercado_venta_shadow` (n=397, mediana $1.667).
    // Antes decía { 1700, 2200 } — p50–p90 del 28-jul, o sea la mitad DE ARRIBA de la
    // distribución. Ver el porqué en READER_SPEC.md §banda de $/m².
    m2Tipico: { min: 1480, max: 1905 },
    zonas: [
      'Equipetrol Centro',
      'Equipetrol Norte',
      'Sirari',
      'Villa Brigida',
      'Equipetrol Oeste',
      'Eq. 3er Anillo',
    ],
  },

  'zona-norte': {
    id: 'zona-norte',
    nombre: 'Zona Norte',
    bboxKey: 'zona-norte',
    macrozona: 'zona-norte',
    usaPoligono: true,
    sufijoArchivo: '-zn',
    // CALIBRADO 28-jul-2026 con la data, no a ojo. Método: $/m² sobre el precio CRUDO
    // (régimen TC nuevo = el crudo es el precio real) de las activas con tag directo.
    // Validación del método ANTES de aplicarlo a ZN: el mismo cálculo sobre Equipetrol
    // da p50=1703 / p90=2281, que reproduce el "~1700-2200" que la spec ya usaba → el
    // criterio es "p50 a p90", y se puede trasladar.
    //
    // 🔴 CORREGIDO el mismo día, con el aviso de un lector de la primera tanda: una banda
    // ÚNICA para ZN es engañosa. Equipetrol es compacta; Zona Norte va del 2do al 8vo anillo
    // y el precio cae con la distancia — del 3er-4to Banzer/Alemana ($1.693/m²) al 8vo Viru
    // Viru ($1.051/m²) hay 38%. Con la banda global (1.500-1.900) la periferia entera queda
    // "por debajo de lo normal" y el lector podría forzar un TC para acomodarla.
    // Por eso la banda es POR MICROZONA. `default` es el respaldo para las que tienen n<5.
    // RE-MEDIDA 28-sep-2026: p25–p75 de `v_mercado_venta_shadow` (n=400, mediana $1.246),
    // DESPUÉS de aplicar las 46 correcciones del drift de ZN — la banda se mide sobre precios
    // que ella misma ayudó a clasificar, así que se re-mide después de un audit, nunca antes.
    // Antes decía { 1280, 1900 }, del 28-jul y con el método viejo (p50–p90).
    m2Tipico: { min: 1020, max: 1460 },
    //
    // 🗑️ `m2TipicoPorZona` (9 microzonas, calibrada el 28-jul) se BORRÓ el 28-sep-2026.
    // Dos razones, las dos medidas:
    //   1. **Nadie la leía.** El material se arma con `ZONA.m2Tipico` (la global) en los dos
    //      cargadores; un `grep m2TipicoPorZona` daba UN solo hit: su propia definición.
    //      Era trabajo escrito y muerto, y peor: una tercera versión de la verdad (el spec
    //      decía 1500–1900, el código 1280–1900 y esta tabla otra cosa por zona).
    //   2. **Conectarla no mejora.** Backtest sobre 81 props etiquetadas por el TEXTO del
    //      aviso, con las bandas calculadas EXCLUYENDO esas 81: global 2 errores / 43 decididas,
    //      por microzona 2 errores / 40 decididas. Más complejidad, mismo error, menos casos
    //      resueltos. Si algún día se re-intenta, que sea con ese backtest, no a ojo.
    // Las 14 microzonas ZN. Verificadas una a una contra `zonas_geograficas`
    // (28-jul-2026): las 14 existen con este nombre exacto. Espejo de
    // `ZONAS_ZONA_NORTE` en `simon-mvp/src/lib/zonas.ts` — si una cambia, cambian las dos.
    zonas: [
      '2do-3er anillo La Salle-Banzer',
      '2do-3er anillo Banzer-Alemana',
      '2do-3er anillo Alemana-Mutualista',
      '3er-4to anillo La Salle-Banzer',
      '3er-4to anillo Banzer-Alemana',
      '3er-4to anillo Alemana-Mutualista',
      '4to-6to anillo Radial 26-Banzer',
      '4to-6to anillo Banzer-Alemana',
      '4to-6to anillo Alemana-Mutualista',
      '6to-8vo anillo Radial 26-Banzer',
      '6to-8vo anillo Banzer-Alemana',
      '6to-8vo anillo Alemana-Mutualista',
      '8vo anillo Paraiso - Radial 26-Banzer',
      '8vo anillo Viru Viru - Banzer-G77',
    ],
  },
};

/** Resuelve la zona desde `--zona=<id>`, `ZONA_HIBRIDO`, o el default (equipetrol). */
export function resolverZona(argv = process.argv.slice(2)) {
  const flag = argv.find((a) => a.startsWith('--zona='))?.split('=')[1];
  const id = flag || process.env.ZONA_HIBRIDO || 'equipetrol';
  const cfg = ZONAS_HIBRIDO[id];
  if (!cfg) {
    console.error(`\n❌ Zona desconocida: "${id}". Opciones: ${Object.keys(ZONAS_HIBRIDO).join(' · ')}\n`);
    process.exit(1);
  }
  return cfg;
}

/** Nombre de archivo con el sufijo de la zona antes de la extensión. */
export function conSufijo(nombre, zona) {
  if (!zona.sufijoArchivo) return nombre;
  const i = nombre.lastIndexOf('.');
  return i < 0 ? `${nombre}${zona.sufijoArchivo}` : `${nombre.slice(0, i)}${zona.sufijoArchivo}${nombre.slice(i)}`;
}
