/**
 * Generador PDF — Informe de Posicionamiento CONDADO VI Plaza Italia
 * Colores: Simon Brand (Negro #0a0a0a, Crema #f8f6f3, Oro #c9a959)
 * Fonts: Helvetica (built-in, similar weight to Manrope)
 *
 * Ejecutar: node scripts/generate-condado-vi-report.jsx
 */

const React = require('react');
const { Document, Page, Text, View, StyleSheet, Font, renderToFile } = require('@react-pdf/renderer');
const fs = require('fs');
const path = require('path');

// ─── Brand Colors ───
const C = {
  negro: '#0a0a0a',
  crema: '#f8f6f3',
  oro: '#c9a959',
  oroClaro: '#d4bc7a',
  blanco: '#ffffff',
  gris: '#666666',
  grisMedio: '#999999',
  grisClaro: '#e5e5e5',
  rojo: '#c94040',
  verde: '#4a9960',
};

// ─── Styles ───
const s = StyleSheet.create({
  // Pages
  pageCover: {
    backgroundColor: C.negro,
    padding: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageCrema: {
    backgroundColor: C.crema,
    padding: 40,
    paddingBottom: 50,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: C.negro,
  },
  pageNegro: {
    backgroundColor: C.negro,
    padding: 40,
    paddingBottom: 50,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: C.blanco,
  },

  // Cover
  coverLabel: {
    color: C.oro,
    fontSize: 8,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  coverTitle: {
    color: C.blanco,
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  coverSubtitle: {
    color: C.oro,
    fontSize: 18,
    fontFamily: 'Helvetica',
    textAlign: 'center',
    marginBottom: 40,
    fontStyle: 'italic',
  },
  coverMeta: {
    color: '#ffffff99',
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 4,
  },
  coverLine: {
    width: 40,
    height: 1,
    backgroundColor: C.oro,
    marginVertical: 20,
  },

  // Sections
  sectionLabel: {
    color: C.oro,
    fontSize: 7,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 12,
  },
  sectionTitleBlanco: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 12,
    color: C.blanco,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: C.gris,
    marginBottom: 16,
    lineHeight: 1.5,
  },
  sectionSubtitleBlanco: {
    fontSize: 11,
    color: '#ffffffaa',
    marginBottom: 16,
    lineHeight: 1.5,
  },

  // Text
  body: {
    fontSize: 9,
    lineHeight: 1.6,
    marginBottom: 8,
    color: C.gris,
  },
  bodyBlanco: {
    fontSize: 9,
    lineHeight: 1.6,
    marginBottom: 8,
    color: '#ffffffcc',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  oro: {
    color: C.oro,
  },
  rojo: {
    color: C.rojo,
  },
  verde: {
    color: C.verde,
  },

  // Tables
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.negro,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderNegro: {
    flexDirection: 'row',
    backgroundColor: '#ffffff15',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#00000010',
  },
  tableRowNegro: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ffffff10',
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#00000005',
    borderBottomWidth: 0.5,
    borderBottomColor: '#00000010',
  },
  tableRowHighlight: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#c9a95915',
    borderBottomWidth: 0.5,
    borderBottomColor: '#c9a95930',
  },
  th: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.blanco,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  thNegro: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.oro,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  td: {
    fontSize: 8,
    color: C.negro,
  },
  tdNegro: {
    fontSize: 8,
    color: '#ffffffdd',
  },
  tdBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.negro,
  },
  tdOro: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.oro,
  },

  // KPI boxes
  kpiRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: C.negro,
    padding: 14,
    alignItems: 'center',
  },
  kpiBoxCrema: {
    flex: 1,
    backgroundColor: C.crema,
    padding: 14,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#00000015',
  },
  kpiValue: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: C.oro,
    marginBottom: 4,
  },
  kpiValueBlanco: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: C.blanco,
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 7,
    color: '#ffffff88',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
  },
  kpiLabelNegro: {
    fontSize: 7,
    color: C.gris,
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
  },

  // Callout
  callout: {
    backgroundColor: '#c9a95912',
    borderLeftWidth: 3,
    borderLeftColor: C.oro,
    padding: 12,
    marginBottom: 14,
  },
  calloutNegro: {
    backgroundColor: '#ffffff08',
    borderLeftWidth: 3,
    borderLeftColor: C.oro,
    padding: 12,
    marginBottom: 14,
  },
  calloutText: {
    fontSize: 9,
    lineHeight: 1.5,
    color: C.negro,
  },
  calloutTextBlanco: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#ffffffdd',
  },

  // Alert
  alertRojo: {
    backgroundColor: '#c9404012',
    borderLeftWidth: 3,
    borderLeftColor: C.rojo,
    padding: 12,
    marginBottom: 14,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#00000010',
    marginVertical: 16,
  },
  dividerOro: {
    height: 1,
    backgroundColor: '#c9a95940',
    marginVertical: 16,
  },
  dividerBlanco: {
    height: 1,
    backgroundColor: '#ffffff15',
    marginVertical: 16,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7,
    color: C.grisMedio,
  },
  footerTextBlanco: {
    fontSize: 7,
    color: '#ffffff40',
  },
  footerPage: {
    fontSize: 7,
    color: C.oro,
  },

  // Bullet
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.oro,
    marginTop: 4,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.5,
    color: C.gris,
  },
  bulletTextBlanco: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.5,
    color: '#ffffffcc',
  },
});

// ─── Helper Components ───

const Footer = ({ page, total, dark }) => (
  React.createElement(View, { style: s.footer },
    React.createElement(Text, { style: dark ? s.footerTextBlanco : s.footerText }, 'Simon \u2014 Inteligencia Inmobiliaria'),
    React.createElement(Text, { style: dark ? s.footerTextBlanco : s.footerText }, 'Confidencial \u2014 Condado VI Plaza Italia'),
    React.createElement(Text, { style: s.footerPage }, `${page} / ${total}`)
  )
);

const Bullet = ({ text, dark }) => (
  React.createElement(View, { style: s.bulletRow },
    React.createElement(View, { style: s.bulletDot }),
    React.createElement(Text, { style: dark ? s.bulletTextBlanco : s.bulletText }, text)
  )
);

const Divider = ({ dark, oro }) => (
  React.createElement(View, { style: oro ? s.dividerOro : dark ? s.dividerBlanco : s.divider })
);

const SectionLabel = ({ text }) => (
  React.createElement(Text, { style: s.sectionLabel }, text)
);

// ─── Document ───

const CondadoVIReport = () => (
  React.createElement(Document, {
    title: 'Analisis de Posicionamiento - Condado VI Plaza Italia',
    author: 'Simon - Inteligencia Inmobiliaria',
    subject: 'Analisis de mercado inmobiliario Equipetrol Centro',
  },

    // ═══════════════════════════════════════════
    // PAGE 1: COVER
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCover },
      React.createElement(View, { style: { alignItems: 'center', flex: 1, justifyContent: 'center' } },
        React.createElement(Text, { style: s.coverLabel }, 'ANALISIS DE POSICIONAMIENTO'),
        React.createElement(View, { style: s.coverLine }),
        React.createElement(Text, { style: s.coverTitle }, 'CONDADO VI'),
        React.createElement(View, { style: { height: 12 } }),
        React.createElement(Text, { style: s.coverSubtitle }, 'Plaza Italia \u2014 Equipetrol Centro'),
        React.createElement(View, { style: { ...s.coverLine, marginVertical: 30 } }),
        React.createElement(Text, { style: s.coverMeta }, 'Informe preparado para la desarrolladora'),
        React.createElement(Text, { style: s.coverMeta }, '18 de febrero de 2026'),
        React.createElement(Text, { style: s.coverMeta }, 'Precios en USD (TC oficial Bs 6.96)'),
        React.createElement(Text, { style: s.coverMeta }, 'Fuentes: Century 21 Bolivia, Remax Bolivia, Binance P2P'),
        React.createElement(View, { style: { height: 40 } }),
        React.createElement(Text, { style: { ...s.coverMeta, fontSize: 7 } }, 'Precios normalizados a USD (TC oficial Bs 6.96)')
      )
    ),

    // ═══════════════════════════════════════════
    // PAGE 2: RESUMEN EJECUTIVO
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'RESUMEN EJECUTIVO' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Condado VI en el mercado'),
      React.createElement(Text, { style: { ...s.bodyBlanco, fontStyle: 'italic', marginBottom: 12 } }, 'Basado en 4 publicaciones de brokers en Remax (1 activa, 3 historicas de Ago 2025). No incluye inventario directo de la desarrolladora.'),

      // KPI Row 1
      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '$2,252'),
          React.createElement(Text, { style: s.kpiLabel }, 'PRECIO PROMEDIO'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, 'P50-P75'),
          React.createElement(Text, { style: s.kpiLabel }, 'POSICION EN MERCADO'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, 'Ent. inm.'),
          React.createElement(Text, { style: s.kpiLabel }, 'ESTADO'),
        ),
      ),

      // KPI Row 2
      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '115'),
          React.createElement(Text, { style: s.kpiLabel }, 'ACTIVAS EQ. CENTRO'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '19.6%'),
          React.createElement(Text, { style: s.kpiLabel }, 'ABSORCION ZONA'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '1D,2D,3D'),
          React.createElement(Text, { style: s.kpiLabel }, 'TIPOLOGIAS PUBLICADAS'),
        ),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      // Key findings
      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Bullet, { text: 'Las publicaciones de brokers muestran $2,252/m2 consistente en las 3 tipologias — posicionado entre P50 y P75 de Equipetrol Centro.', dark: true }),
        React.createElement(Bullet, { text: '1 dormitorio es el segmento mas liquido de la zona (29% absorcion, 44 activas). El broker publico un 1D a $140K en Ago 2025 (ya inactivo).', dark: true }),
        React.createElement(Bullet, { text: '2 dormitorios tiene absorcion lenta (6.1%). El broker publico un 2D a $195K en Ago 2025 (ya inactivo) — por debajo de la mediana de ticket ($190K).', dark: true }),
        React.createElement(Bullet, { text: '3 dormitorios: unica publicacion activa hoy. $315K (Feb 2026, TC paralelo) compite contra mediana de $295K — posicion solida.', dark: true }),
      ),

      React.createElement(Footer, { page: 2, total: 11, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 3: METODOLOGIA
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'METODOLOGIA' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Que mide este informe'),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: s.calloutText }, 'Este informe analiza la posicion competitiva de Condado VI Plaza Italia dentro de Equipetrol Centro, usando datos de 115 propiedades de venta activas publicadas en Century 21 Bolivia y Remax Bolivia. Los precios estan normalizados a USD al tipo de cambio oficial (Bs 6.96). Los anuncios publicados "al paralelo" se convierten a USD oficial: precio x TC Binance (9.26) / 6.96.'),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Filtros de calidad aplicados:'),
        React.createElement(Text, { style: s.calloutText }, 'Se excluyen duplicados, parqueos/bauleras/garajes, multiproyectos, unidades < 20 m2, y propiedades con mas de 300 dias en mercado (730 para preventa).'),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Importante — datos limitados:'),
        React.createElement(Text, { style: s.calloutText }, 'Los datos de Condado VI provienen UNICAMENTE de lo que los brokers publican en portales. No tenemos el inventario completo de la desarrolladora. Solo detectamos 4 publicaciones en Remax, de las cuales 3 ya estan inactivas (precios historicos). Los precios de 1D y 2D corresponden a publicaciones de agosto 2025.'),
      ),

      React.createElement(View, { style: s.divider }),
      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 12 } }, 'Publicaciones detectadas de Condado VI'),
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '10%' } }, 'TIP.'),
          React.createElement(Text, { style: { ...s.th, width: '14%' } }, 'AREA'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'PRECIO'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, '$/M2'),
          React.createElement(Text, { style: { ...s.th, width: '20%' } }, 'PUBLICACION'),
          React.createElement(Text, { style: { ...s.th, width: '12%' } }, 'FUENTE'),
          React.createElement(Text, { style: { ...s.th, width: '14%' } }, 'STATUS'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '14%' } }, '62 m2'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$140,107'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,252'),
          React.createElement(Text, { style: { ...s.td, width: '20%' } }, '13 Ago 2025'),
          React.createElement(Text, { style: { ...s.td, width: '12%' } }, 'Remax'),
          React.createElement(Text, { style: { ...s.rojo, width: '14%', fontSize: 8 } }, 'Inactiva'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '14%' } }, '87 m2'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$195,329'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,252'),
          React.createElement(Text, { style: { ...s.td, width: '20%' } }, '13 Ago 2025'),
          React.createElement(Text, { style: { ...s.td, width: '12%' } }, 'Remax'),
          React.createElement(Text, { style: { ...s.rojo, width: '14%', fontSize: 8 } }, 'Inactiva'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdOro, width: '10%' } }, '3D'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%' } }, '144 m2'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$315,225'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '$2,184'),
          React.createElement(Text, { style: { ...s.tdOro, width: '20%' } }, '12 Feb 2026'),
          React.createElement(Text, { style: { ...s.tdOro, width: '12%' } }, 'Remax'),
          React.createElement(Text, { style: { ...s.verde, width: '14%', fontSize: 8 } }, 'Activa'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '14%' } }, '144 m2'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$325,008'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,252'),
          React.createElement(Text, { style: { ...s.td, width: '20%' } }, '13 Ago 2025'),
          React.createElement(Text, { style: { ...s.td, width: '12%' } }, 'Remax'),
          React.createElement(Text, { style: { ...s.rojo, width: '14%', fontSize: 8 } }, 'Inactiva'),
        ),
      ),
      React.createElement(Text, { style: { ...s.body, fontSize: 7, fontStyle: 'italic' } }, 'La unidad 3D activa ($315K) fue publicada "al paralelo" y normalizada a TC oficial. Las 3 inactivas de Ago 2025 pueden haber sido vendidas o simplemente retiradas del portal. Los precios de Ago 2025 son referenciales — pueden no reflejar los precios actuales de la desarrolladora.'),

      React.createElement(Footer, { page: 3, total: 11, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 4: EQUIPETROL COMPLETO — PANORAMA
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'PANORAMA EQUIPETROL' }),
      React.createElement(Text, { style: s.sectionTitle }, 'El mercado completo: 222 unidades en 5 zonas'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Condado VI compite en Equipetrol Centro, la zona con mas inventario y mayor absorcion. Pero el comprador compara con todo Equipetrol.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '22%' } }, 'ZONA'),
          React.createElement(Text, { style: { ...s.th, width: '12%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'ABSORB. 30D'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'ABSORCION'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'MED. $/M2'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'MED. TICKET'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, '1D/2D/3D'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdOro, width: '22%' } }, 'Eq. Centro'),
          React.createElement(Text, { style: { ...s.tdOro, width: '12%', textAlign: 'right' } }, '112'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '28'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '19.6%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '$2,055'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '$150K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '10%', textAlign: 'right' } }, '43/45/10'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'Sirari'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '36'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '2'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '5.3%'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,063'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$139K'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '15/8/7'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'V. Brigida'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '35'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '13'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '27.1%'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$1,855'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$120K'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '12/14/4'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'Eq. Oeste'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '31'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '3'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '8.8%'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,007'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$150K'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '15/12/1'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'Eq. Norte'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '22'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '5'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '18.5%'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,404'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$155K'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '8/9/0'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Equipetrol Centro: la mejor combinacion volumen + liquidez'),
        React.createElement(Text, { style: s.calloutText }, 'Con 112 activas y 19.6% de absorcion, Eq. Centro es la zona mas liquida despues de V. Brigida (27.1% pero con tickets menores). Sirari tiene precios similares pero absorcion de solo 5.3%. Eq. Norte es el mas caro ($2,404/m2) pero con solo 22 unidades.'),
      ),

      React.createElement(View, { style: s.divider }),
      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 12 } }, 'Condado VI vs todo Equipetrol (percentiles)'),
      React.createElement(Text, { style: { ...s.body, fontStyle: 'italic', marginBottom: 8 } }, '222 unidades activas, todas las zonas. Datos de mercado al 18 Feb 2026.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '10%' } }, 'TIP.'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'P25'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'MEDIANA'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'P75'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'vs EQUIP.'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'vs EQ.CEN'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$1,727'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,003'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,314'),
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', textAlign: 'right' } }, '$2,252'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, 'P50-P75'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, 'P50-P75'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$1,752'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$1,918'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,252'),
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', textAlign: 'right' } }, '$2,252'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '~P75'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '~P75'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$1,459'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$1,871'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$2,258'),
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', textAlign: 'right' } }, '$2,184'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, 'P50-P75'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, 'P50-P75'),
        ),
      ),
      React.createElement(Text, { style: { ...s.body, fontSize: 7, fontStyle: 'italic' } }, 'Precios de Condado VI segun publicaciones de brokers (1D y 2D de Ago 2025, 3D de Feb 2026). Percentiles de todo Equipetrol (222 uds) y Eq. Centro (112 uds).'),

      React.createElement(Footer, { page: 4, total: 11, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 5: EL MERCADO EQUIPETROL CENTRO (detalle)
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'EQUIPETROL CENTRO — DETALLE' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'La zona de Condado VI en profundidad'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, '112 unidades activas de venta, 28 absorbidas en 30 dias. La zona mas grande y liquida de Equipetrol.'),

      // Absorcion por tipologia
      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Absorcion por tipologia'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '22%' } }, 'TIPOLOGIA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'ABSORB. 30D'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'ABSORCION'),
          React.createElement(Text, { style: { ...s.thNegro, width: '22%', textAlign: 'right' } }, 'MESES INV.'),
        ),
        // 1 Dorm - HIGHLIGHTED (best absorption)
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '22%' } }, '1 Dorm'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '44'),
          React.createElement(Text, { style: { ...s.tdOro, width: '20%', textAlign: 'right' } }, '18'),
          React.createElement(Text, { style: { ...s.tdOro, width: '20%', textAlign: 'right' } }, '29.0%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '22%', textAlign: 'right' } }, '2.4'),
        ),
        // 2 Dorms
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, '2 Dorms'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '46'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, '3'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, '6.1%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%', textAlign: 'right' } }, '15.3'),
        ),
        // 3 Dorms
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, '3 Dorms'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '10'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, '9.1%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%', textAlign: 'right' } }, '10.0'),
        ),
        // TOTAL
        React.createElement(View, { style: { ...s.tableRowNegro, borderTopWidth: 1, borderTopColor: '#ffffff30' } },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%', fontFamily: 'Helvetica-Bold' } }, 'TOTAL'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right', fontFamily: 'Helvetica-Bold' } }, '100'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right', fontFamily: 'Helvetica-Bold' } }, '22'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right', fontFamily: 'Helvetica-Bold' } }, '18.0%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%', textAlign: 'right', fontFamily: 'Helvetica-Bold' } }, '4.5'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: s.calloutTextBlanco }, '1 dormitorio lidera: 29% de absorcion con solo 2.4 meses de inventario. Es el segmento mas dinamico de Equipetrol Centro y donde Condado VI tiene producto publicado.'),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      // Top 10 proyectos
      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Top 10 proyectos por volumen en Eq. Centro'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '30%' } }, 'PROYECTO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'UNIDADES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, '$/M2 PROM'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, 'TICKET PROM'),
        ),
        ...[
          ['Atrium', '11', '$2,090', '$160K'],
          ['T-VEINTICINCO', '9', '$1,894', '$221K'],
          ['HH Once', '8', '$1,882', '$103K'],
          ['Sky Tower', '6', '$2,939', '$106K'],
          ['HH Chuubi', '5', '$1,600', '$114K'],
          ['Sky Level', '5', '$2,055', '$139K'],
          ['Luxe Tower', '4', '$2,588', '$204K'],
          ['Lofty Island', '4', '$1,740', '$147K'],
          ['Luxe Suites', '4', '$2,561', '$168K'],
          ['Sky Plaza Italia', '3', '$1,963', '$85K'],
        ].map(([proy, uds, pm2, ticket], i) =>
          React.createElement(View, { key: i, style: s.tableRowNegro },
            React.createElement(Text, { style: { ...s.tdNegro, width: '30%' } }, proy),
            React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, uds),
            React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, pm2),
            React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, ticket),
          )
        ),
      ),

      React.createElement(Footer, { page: 5, total: 11, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 6: PRECIOS — CONDADO VI VS MERCADO
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'POSICIONAMIENTO' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Condado VI vs mercado Equipetrol Centro'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Precio por m2 y ticket comparados con percentiles de la zona (115 unidades activas). Precios de Condado VI segun publicaciones de brokers.'),

      // PRECIO POR M2
      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 12 } }, 'PRECIO POR M2 (USD oficial)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '10%' } }, 'TIP.'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'P25'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'MEDIANA'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'P75'),
          React.createElement(Text, { style: { ...s.th, width: '20%', textAlign: 'right' } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.th, width: '22%', textAlign: 'right' } }, 'POSICION'),
        ),
        ...[
          ['1D', '$1,779', '$2,055', '$2,366', '$2,252', 'P50-P75'],
          ['2D', '$1,872', '$2,028', '$2,224', '$2,252', '~P75'],
          ['3D', '$1,312', '$1,621', '$2,519', '$2,184', 'P50-P75'],
        ].map(([tip, p25, med, p75, condado, pos], i) =>
          React.createElement(View, { key: i, style: i % 2 ? s.tableRowAlt : s.tableRow },
            React.createElement(Text, { style: { ...s.td, width: '10%' } }, tip),
            React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, p25),
            React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, med),
            React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, p75),
            React.createElement(Text, { style: { ...s.tdBold, width: '20%', textAlign: 'right' } }, condado),
            React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, pos),
          )
        ),
      ),

      React.createElement(View, { style: s.dividerOro }),

      // TICKET TOTAL
      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 12 } }, 'TICKET TOTAL (USD oficial)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '10%' } }, 'TIP.'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'P25'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'MEDIANA'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'P75'),
          React.createElement(Text, { style: { ...s.th, width: '20%', textAlign: 'right' } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.th, width: '22%', textAlign: 'right' } }, 'POSICION'),
        ),
        // 1D - highlight oro (> P75)
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdOro, width: '10%' } }, '1D'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$85K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$104K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$132K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '20%', textAlign: 'right' } }, '$140K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '22%', textAlign: 'right' } }, '> P75'),
        ),
        // 2D
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$145K'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$190K'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$231K'),
          React.createElement(Text, { style: { ...s.tdBold, width: '20%', textAlign: 'right' } }, '$195K'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '~P50'),
        ),
        // 3D
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '10%' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$235K'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$295K'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$429K'),
          React.createElement(Text, { style: { ...s.tdBold, width: '20%', textAlign: 'right' } }, '$315K'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'P50-P75'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Lectura rapida:'),
        React.createElement(Text, { style: s.calloutText }, 'En $/m2, Condado VI esta consistentemente en la franja P50-P75 ($2,184-2,252/m2) — producto premium pero no el mas caro de la zona. En ticket, el 1D ($140K) supera el P75 por su area generosa (62m2), mientras el 2D ($195K) es muy competitivo justo en la mediana.'),
      ),
      React.createElement(Text, { style: { ...s.body, fontSize: 7, fontStyle: 'italic' } }, 'Nota: Los precios de 1D ($140K) y 2D ($195K) provienen de publicaciones de Ago 2025 ya inactivas. Solo el 3D ($315K, Feb 2026) esta activo hoy. Los precios actuales de la desarrolladora pueden diferir.'),

      React.createElement(Footer, { page: 6, total: 11, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 7: AMENIDADES — COMPARACION
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'AMENIDADES' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Que ofrece cada proyecto'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Condado VI compensa pocas amenidades de edificio con el mejor equipamiento de unidad del segmento.'),

      // ── Tabla 1: Amenidades de edificio ──
      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 11, marginBottom: 6 } }, 'Amenidades de edificio'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '22%' } }, 'AMENIDAD'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'COND. VI'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'SKY ECL.'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'DOMUS'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'EURO D.'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'ATRIUM'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'COND. V'),
        ),
        ...[
          ['Piscina',         'SI', 'SI', 'SI', 'SI', 'SI', 'SI'],
          ['Gimnasio',        'SI', 'SI', 'SI', 'SI', 'SI', '-'],
          ['Seguridad 24/7',  'SI', 'SI', 'SI', 'SI', 'SI', 'SI'],
          ['Churrasquera',    'SI', 'SI', 'SI', '-',  'SI', 'SI'],
          ['Ascensor',        'SI', 'SI', 'SI', 'SI', 'SI', 'SI'],
          ['Co-working',      '-',  'SI', 'SI', 'SI', 'SI', '-'],
          ['Pet Friendly',    '-',  'SI', 'SI', 'SI', 'SI', '-'],
          ['Sauna / Jacuzzi', '-',  'SI', 'SI', '-',  '-',  '-'],
          ['Salon de eventos','-',  'SI', 'SI', 'SI', '-',  'SI'],
          ['Sala de juegos',  '-',  'SI', 'SI', '-',  '-',  '-'],
          ['Bar / Lounge',    '-',  '-',  'SI', '-',  '-',  '-'],
          ['Rooftop / Cine',  '-',  '-',  '-',  'SI', '-',  '-'],
        ].map(([amenidad, c6, sky, dom, euro, atr, c5], i) =>
          React.createElement(View, { key: i, style: i % 2 ? s.tableRowAlt : s.tableRow },
            React.createElement(Text, { style: { ...s.td, width: '22%' } }, amenidad),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', fontFamily: 'Helvetica-Bold', color: c6 === 'SI' ? C.verde : '#ccc' } }, c6),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: sky === 'SI' ? C.verde : '#ccc' } }, sky),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: dom === 'SI' ? C.verde : '#ccc' } }, dom),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: euro === 'SI' ? C.verde : '#ccc' } }, euro),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: atr === 'SI' ? C.verde : '#ccc' } }, atr),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: c5 === 'SI' ? C.verde : '#ccc' } }, c5),
          )
        ),
        // TOTAL row
        React.createElement(View, { style: { ...s.tableRow, borderTopWidth: 1, borderTopColor: '#00000020' } },
          React.createElement(Text, { style: { ...s.tdBold, width: '22%' } }, 'TOTAL'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center', color: C.rojo } }, '5/12'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '10/12'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '11/12'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '9/12'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '8/12'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '5/12'),
        ),
      ),

      React.createElement(View, { style: s.dividerOro }),

      // ── Tabla 2: Equipamiento de unidad ──
      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 11, marginBottom: 6 } }, 'Equipamiento incluido en la unidad'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '22%' } }, 'EQUIPAMIENTO'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'COND. VI'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'SKY ECL.'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'DOMUS'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'EURO D.'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'ATRIUM'),
          React.createElement(Text, { style: { ...s.th, width: '13%', textAlign: 'center' } }, 'COND. V'),
        ),
        ...[
          ['Aire acondicionado', 'SI', 'SI', 'SI', '-',  'SI', 'SI'],
          ['Cocina equipada',    'SI', 'SI', 'SI', '-',  'SI', 'SI'],
          ['Heladera',           'SI', 'SI', '-',  '-',  '-',  '-'],
          ['Horno',              'SI', 'SI', '-',  '-',  'SI', 'SI'],
          ['Lavadora',           'SI', '-',  '-',  '-',  '-',  '-'],
          ['Secadora',           'SI', '-',  '-',  '-',  '-',  '-'],
          ['Lavavajillas',       'SI', '-',  '-',  '-',  '-',  '-'],
          ['Closets',            'SI', '-',  'SI', '-',  'SI', 'SI'],
          ['Intercomunicador',   'SI', '-',  '-',  '-',  '-',  '-'],
        ].map(([equip, c6, sky, dom, euro, atr, c5], i) =>
          React.createElement(View, { key: i, style: i % 2 ? s.tableRowAlt : s.tableRow },
            React.createElement(Text, { style: { ...s.td, width: '22%' } }, equip),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', fontFamily: 'Helvetica-Bold', color: c6 === 'SI' ? C.verde : '#ccc' } }, c6),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: sky === 'SI' ? C.verde : '#ccc' } }, sky),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: dom === 'SI' ? C.verde : '#ccc' } }, dom),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: euro === 'SI' ? C.verde : '#ccc' } }, euro),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: atr === 'SI' ? C.verde : '#ccc' } }, atr),
            React.createElement(Text, { style: { ...s.td, width: '13%', textAlign: 'center', color: c5 === 'SI' ? C.verde : '#ccc' } }, c5),
          )
        ),
        // TOTAL row
        React.createElement(View, { style: { ...s.tableRow, borderTopWidth: 1, borderTopColor: '#00000020' } },
          React.createElement(Text, { style: { ...s.tdBold, width: '22%' } }, 'TOTAL'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center', color: C.verde } }, '9/9'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '4/9'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '3/9'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '0/9'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '4/9'),
          React.createElement(Text, { style: { ...s.tdBold, width: '13%', textAlign: 'center' } }, '4/9'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Condado VI: menos areas comunes, mas equipamiento privado'),
        React.createElement(Text, { style: s.calloutText }, 'Es el unico proyecto con lavadora, secadora y lavavajillas incluidos — un diferenciador fuerte para el comprador que valora mudarse sin gastar en electrodomesticos. Pero en amenidades comunes (5/12), queda debajo de Sky Eclipse (10), Domus Infinity (11) y Euro Design (9). Agregar co-working y pet friendly al marketing — si el edificio lo permite — cerraria la brecha con Atrium y los Sky.'),
      ),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Limitacion: datos de terceros'),
        React.createElement(Text, { style: s.calloutText }, 'Las amenidades y equipamiento listados provienen exclusivamente de lo que los brokers publican en sus anuncios — no del inventario oficial de la desarrolladora. No encontramos pagina web ni brochure de Condado VI Plaza Italia para verificar. Con un listado oficial de amenidades y equipamiento, este analisis seria significativamente mas preciso y podria identificar diferenciadores que los brokers no mencionan en sus publicaciones.'),
      ),

      React.createElement(Footer, { page: 7, total: 11, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 8: COMPETIDORES DIRECTOS
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'COMPETENCIA DIRECTA' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Proyectos similares en Eq. Centro (>$2,000/m2)'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Competidores en el rango de precio de Condado VI \u2014 entrega inmediata y preventa.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '22%' } }, 'PROYECTO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '10%', textAlign: 'center' } }, 'DORMS'),
          React.createElement(Text, { style: { ...s.thNegro, width: '13%', textAlign: 'right' } }, 'AREA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, '$/M2'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'center' } }, 'ESTADO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '23%', textAlign: 'right' } }, 'VS CONDADO'),
        ),
        ...[
          ['Sky Eclipse', '2D', '90 m2', '$2,501', 'No espec.', 'Superior', false],
          ['Domus Infinity', '2D', '77 m2', '$2,463', 'Preventa', 'Superior', false],
          ['Nano Smart', '2D', '62 m2', '$2,446', 'A estrenar', 'Superior', false],
          ['Euro Design Le Blanc', '2D', '88 m2', '$2,408', 'Ent. inmed.', 'Superior', false],
          ['CONDADO VI', '2D', '87 m2', '$2,252', 'Ent. inmed.', '\u2014', true],
          ['Atrium', '2D', '95 m2', '$2,241', 'No espec.', 'Similar', false],
          ['Condado Park V', '2D', '85 m2', '$2,161', 'No espec.', 'Hermano', false],
          ['Sky Collection', '2D', '73 m2', '$2,156', 'Ent. inmed.', 'Inferior', false],
          ['Macororo 12', '2D', '87 m2', '$2,140', 'No espec.', 'Inferior', false],
          ['Klug', '2D', '74 m2', '$2,115', 'No espec.', 'Inferior', false],
        ].map(([proy, dorms, area, pm2, estado, vs, highlight], i) =>
          React.createElement(View, { key: i, style: highlight ? { ...s.tableRowNegro, backgroundColor: '#c9a95920' } : s.tableRowNegro },
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '22%' } : { ...s.tdNegro, width: '22%' } }, proy),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '10%', textAlign: 'center' } : { ...s.tdNegro, width: '10%', textAlign: 'center' } }, dorms),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '13%', textAlign: 'right' } : { ...s.tdNegro, width: '13%', textAlign: 'right' } }, area),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '14%', textAlign: 'right' } : { ...s.tdNegro, width: '14%', textAlign: 'right' } }, pm2),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '18%', textAlign: 'center' } : { ...s.tdNegro, width: '18%', textAlign: 'center' } }, estado),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '23%', textAlign: 'right' } : { ...s.tdNegro, width: '23%', textAlign: 'right' } }, vs),
          )
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: s.calloutTextBlanco }, 'En 2 dormitorios, Condado VI se ubica justo en el medio del segmento premium: por debajo de Sky Eclipse ($2,501) y Luxe Suites ($2,561), pero por encima de Atrium ($2,241) y Macororo 12 ($2,140). La ventaja competitiva de Condado VI es la combinacion de entrega inmediata + area generosa (87m2) + precio razonable.'),
      ),

      React.createElement(Footer, { page: 8, total: 11, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 9: FAMILIA CONDADO
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'ECOSISTEMA CONDADO' }),
      React.createElement(Text, { style: s.sectionTitle }, 'La familia Condado en Equipetrol'),
      React.createElement(Text, { style: s.sectionSubtitle }, '5 edificios del mismo desarrollador en la zona. Track record demostrado.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '20%' } }, 'EDIFICIO'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'center' } }, 'TIP.'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'AREA'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, '$/M2'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'TICKET'),
          React.createElement(Text, { style: { ...s.th, width: '24%', textAlign: 'center' } }, 'ESTADO'),
        ),
        ...[
          ['Condado II', '3D', '228 m2', '$1,254', '$286K', 'Ent. inmed.', false],
          ['Condado III', '3D', '143 m2', '\u2014', 'Alquiler', 'Ent. inmed.', false],
          ['CONDADO IV', '1D', '62 m2', '$2,391', '$149K', 'No espec.', false],
          ['Condado Park V', '2D', '85 m2', '$2,161', '$184K', 'No espec.', false],
          ['CONDADO VI', '1D-3D', '62-144 m2', '$2,184-2,252', '$140-325K', 'Ent. inmed.', true],
        ].map(([ed, tip, area, pm2, ticket, estado, highlight], i) =>
          React.createElement(View, { key: i, style: highlight ? s.tableRowHighlight : (i % 2 ? s.tableRowAlt : s.tableRow) },
            React.createElement(Text, { style: highlight ? { ...s.tdBold, width: '20%', color: C.oro } : { ...s.td, width: '20%' } }, ed),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '10%', textAlign: 'center' } : { ...s.td, width: '10%', textAlign: 'center' } }, tip),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '16%', textAlign: 'right' } : { ...s.td, width: '16%', textAlign: 'right' } }, area),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '14%', textAlign: 'right' } : { ...s.td, width: '14%', textAlign: 'right' } }, pm2),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '16%', textAlign: 'right' } : { ...s.td, width: '16%', textAlign: 'right' } }, ticket),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '24%', textAlign: 'center' } : { ...s.td, width: '24%', textAlign: 'center' } }, estado),
          )
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Evolucion de precios:'),
        React.createElement(Text, { style: s.calloutText }, 'Condado II ($1,254/m2) \u2192 Condado IV ($2,391/m2) \u2192 Condado VI ($2,252/m2). El pricing de Condado VI es consistente con la generacion actual (IV-V-VI), todos en la franja $2,150-2,400/m2.'),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: s.calloutText }, 'Condado III tiene 2 alquileres activos de 3D (143m2), confirmando demanda de renta en el edificio vecino. Dato relevante para inversores del VI.'),
      ),

      React.createElement(Footer, { page: 9, total: 11, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 10: RENTA Y YIELD
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'RENTA E INVERSION' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Yield estimado para Condado VI'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Rentas de Equipetrol (71 alquileres 1D, 58 2D, 11 3D). Escenarios conservador, moderado y optimista.'),
      React.createElement(Text, { style: { ...s.bodyBlanco, fontSize: 7, fontStyle: 'italic', marginBottom: 8 } }, 'Tickets de 1D ($140K) y 2D ($195K) basados en publicaciones de Ago 2025 (inactivas). El 3D ($315K) es precio activo de Feb 2026. Si los precios actuales difieren, el yield cambia proporcionalmente.'),

      // ── 1 Dormitorio ──
      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Yield estimado: 1 dormitorio ($140K)'),
      React.createElement(Text, { style: { ...s.bodyBlanco, fontStyle: 'italic', marginBottom: 6 } }, 'Mediana Equipetrol 1D: $503/mes. P75: $693/mes.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '22%' } }, 'ESCENARIO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'RENTA/MES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'RENTA/ANO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'TICKET'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'YIELD'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'ANOS'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Conservador'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$503'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$6,036'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$140K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '4.3%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '23.2'),
        ),
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '22%' } }, 'Moderado (+30%)'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$654'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$7,848'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '$140K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '5.6%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '17.9'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Optimista (+57%)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$790'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$9,480'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$140K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '6.8%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '14.8'),
        ),
      ),

      // ── 2 Dormitorios ──
      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Yield estimado: 2 dormitorios ($195K)'),
      React.createElement(Text, { style: { ...s.bodyBlanco, fontStyle: 'italic', marginBottom: 6 } }, 'Mediana Equipetrol 2D: $862/mes. P75: $1,218/mes.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '22%' } }, 'ESCENARIO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'RENTA/MES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'RENTA/ANO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'TICKET'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'YIELD'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'ANOS'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Conservador'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$862'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$10,344'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$195K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '5.3%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '18.9'),
        ),
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '22%' } }, 'Moderado (+30%)'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$1,121'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$13,452'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '$195K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '6.9%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '14.5'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Optimista (+57%)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$1,353'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$16,236'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$195K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '8.3%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '12.0'),
        ),
      ),

      // ── 3 Dormitorios ──
      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Yield estimado: 3 dormitorios ($315K)'),
      React.createElement(Text, { style: { ...s.bodyBlanco, fontStyle: 'italic', marginBottom: 6 } }, 'Mediana Equipetrol 3D: $1,509/mes. P75: $1,798/mes.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '22%' } }, 'ESCENARIO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'RENTA/MES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'RENTA/ANO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'TICKET'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'YIELD'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'ANOS'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Conservador'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$1,509'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$18,108'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$315K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '5.7%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '17.4'),
        ),
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '22%' } }, 'Moderado (+30%)'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$1,962'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '$23,544'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '$315K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '7.5%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '13.4'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Optimista (+57%)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$2,369'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '$28,428'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$315K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '9.0%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '11.1'),
        ),
      ),

      React.createElement(Text, { style: { ...s.bodyBlanco, fontSize: 7, fontStyle: 'italic', marginTop: 4 } }, 'Conservador = mediana Equipetrol. Moderado = +30% (premium edificio nuevo). Optimista = +57% (premium maximo observado). Yield bruto, no descuenta vacancia ni comisiones.'),

      React.createElement(Footer, { page: 10, total: 11, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 11: CONCLUSIONES
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'CONCLUSIONES' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Condado VI: bien posicionado, oportunidades claras'),

      React.createElement(View, { style: s.divider }),

      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, fontSize: 11, marginBottom: 10 } }, 'Lo que los datos dicen con confianza:'),

      React.createElement(Bullet, { text: 'Basado en publicaciones de brokers: Condado VI se posiciona entre P50 y P75 del mercado en $/m2 — producto premium pero accesible. No es el mas caro ni el mas barato de la zona.' }),
      React.createElement(Bullet, { text: '1 dormitorio (62m2, $140K en Ago 2025) es el segmento estrella de la zona: absorcion de 29%, solo 2.4 meses de inventario. El precio publicado era competitivo — verificar si el actual es similar.' }),
      React.createElement(Bullet, { text: '2 dormitorios (87m2, $195K en Ago 2025) tenia ticket competitivo (mediana de mercado) pero la absorcion de la zona es lenta (6.1%). Necesita diferenciacion para acelerar venta.' }),
      React.createElement(Bullet, { text: '3 dormitorios (144m2, $315K activo Feb 2026) tiene muy poca competencia en Eq. Centro (solo 10 activas). Con precio en P50-P75 y area generosa, es un producto atractivo para end-user.' }),
      React.createElement(Bullet, { text: 'El yield estimado en escenario moderado va de 5.6% (1D) a 7.5% (3D) — competitivo para Equipetrol Centro. El 2D es el mas atractivo en yield/riesgo (6.9%, 14.5 anos).' }),

      React.createElement(View, { style: s.dividerOro }),

      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, fontSize: 11, marginBottom: 10 } }, 'Oportunidades para la desarrolladora:'),

      React.createElement(Bullet, { text: 'Priorizar venta de 1D: demanda comprobada, ciclo rapido, entry point accesible ($140K). Ideal para inversores.' }),
      React.createElement(Bullet, { text: '2D necesita estrategia activa: plan de pagos, renta garantizada, o bundle parqueo incluido. La absorcion de 6.1% sugiere que el mercado no los busca organicamente.' }),
      React.createElement(Bullet, { text: '3D es nicho premium: pocos competidores (10 en toda la zona). Posicionar como end-user con diferenciador de area (144m2 es generoso para Eq. Centro promedio de 169m2 en 3D).' }),
      React.createElement(Bullet, { text: 'Track record de la familia Condado (II a VI) es un argumento de confianza. Mostrar evolucion de producto y precios como validacion de mercado.' }),

      React.createElement(View, { style: s.divider }),

      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 4 } }, 'Siguiente paso: inventario completo'),
      React.createElement(Text, { style: s.body }, 'Este analisis se basa en 4 publicaciones de brokers (3 inactivas de Ago 2025 + 1 activa de Feb 2026). No encontramos pagina web ni brochure oficial de Condado VI Plaza Italia — las amenidades y equipamiento provienen unicamente de los anuncios de brokers, que suelen ser incompletos.'),
      React.createElement(Text, { style: { ...s.body, marginTop: 4 } }, 'Con el inventario real, precios actualizados, y un listado oficial de amenidades/equipamiento, SICI puede generar un informe mucho mas preciso: posicion de mercado unidad por unidad, comparacion de amenidades verificada, scoring fiduciario, recomendaciones de pricing por piso, y monitoreo mensual de absorcion vs competencia.'),

      React.createElement(Footer, { page: 11, total: 11, dark: false }),
    ),
  )
);

// ─── Generate ───
async function generate() {
  console.log('Generando PDF Condado VI...');
  const doc = React.createElement(CondadoVIReport);

  const outputDir = path.resolve(__dirname, '..', 'docs', 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'INFORME_CONDADO_VI_PLAZA_ITALIA_2026-02-18.pdf');
  await renderToFile(doc, outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`PDF generado: ${outputPath}`);
  console.log(`Tamano: ${(stats.size / 1024).toFixed(1)} KB`);
}

generate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
