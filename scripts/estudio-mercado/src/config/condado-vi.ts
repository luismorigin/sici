import type { ClientConfig } from '../types.js'

export const condadoVI: ClientConfig = {
  projectName: 'Condado VI Plaza Italia',
  projectSubtitle: 'Constructora Condado',
  developerName: 'Constructora Condado',
  zona: 'Equipetrol Centro',
  id_proyecto_master: 34,
  precioM2Billete: 1650,
  tcDetectado: 'paralelo',
  fecha: 'Abril 2026',
  fechaCorte: '13 de abril de 2026',
  // Escenarios solicitados por Adolfo: $1,550 y $1,650 a diferentes TCs
  precioEscenarios: [1550, 1650],
  tcEscenarios: [6.96, 9.28],
  inventory: [
    { piso: 1, dpto: '101', m2: 62.21, dorms: 1, precioUsd: 102646.50 },
    { piso: 1, dpto: '102', m2: 87.62, dorms: 2, precioUsd: 144573.00 },
    { piso: 1, dpto: '103', m2: 86.73, dorms: 2, precioUsd: 143104.50 },
    { piso: 2, dpto: '201', m2: 62.21, dorms: 1, precioUsd: 102646.50 },
    { piso: 2, dpto: '202', m2: 87.62, dorms: 2, precioUsd: 144573.00 },
    { piso: 2, dpto: '205', m2: 144.31, dorms: 3, precioUsd: 238111.50 },
    { piso: 3, dpto: '301', m2: 62.21, dorms: 1, precioUsd: 102646.50 },
    { piso: 3, dpto: '302', m2: 87.62, dorms: 2, precioUsd: 144573.00 },
    { piso: 3, dpto: '303', m2: 86.73, dorms: 2, precioUsd: 143104.50 },
    { piso: 3, dpto: '305', m2: 144.31, dorms: 3, precioUsd: 238111.50 },
    { piso: 4, dpto: '401', m2: 62.21, dorms: 1, precioUsd: 102646.50 },
    { piso: 4, dpto: '405', m2: 144.31, dorms: 3, precioUsd: 238111.50 },
    { piso: 5, dpto: '502', m2: 87.62, dorms: 2, precioUsd: 144573.00 },
    { piso: 5, dpto: '503', m2: 86.73, dorms: 2, precioUsd: 143104.50 },
  ],
}
