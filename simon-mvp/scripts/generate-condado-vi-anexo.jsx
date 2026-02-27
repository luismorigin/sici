/**
 * Generador PDF - Anexo Estrategico CONDADO VI Plaza Italia
 * Complemento a la Asesoria Comercial v7
 * Colores: Simon Brand (Negro #0a0a0a, Crema #f8f6f3, Oro #c9a959)
 *
 * Ejecutar: node scripts/generate-condado-vi-anexo.jsx
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
  acento: '#1a1a2e',
  blanco: '#ffffff',
  gris: '#666666',
  grisMedio: '#999999',
  grisClaro: '#e5e5e5',
  rojo: '#c94040',
  verde: '#4a9960',
  azul: '#4a7999',
};

// ─── Styles ───
const s = StyleSheet.create({
  pageCover: { backgroundColor: C.negro, padding: 60, justifyContent: 'center', alignItems: 'center' },
  pageCrema: { backgroundColor: C.crema, padding: 40, paddingBottom: 50, fontSize: 9, fontFamily: 'Helvetica', color: C.negro },
  pageNegro: { backgroundColor: C.negro, padding: 40, paddingBottom: 50, fontSize: 9, fontFamily: 'Helvetica', color: C.blanco },

  coverLabel: { color: C.oro, fontSize: 8, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 24 },
  coverTitle: { color: C.blanco, fontSize: 28, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 8 },
  coverSubtitle: { color: C.oro, fontSize: 16, fontFamily: 'Helvetica', textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },
  coverSubtitle2: { color: '#ffffff99', fontSize: 12, textAlign: 'center', marginBottom: 40 },
  coverMeta: { color: '#ffffff99', fontSize: 9, textAlign: 'center', marginBottom: 4 },
  coverLine: { width: 40, height: 1, backgroundColor: C.oro, marginVertical: 20 },

  sectionLabel: { color: C.oro, fontSize: 7, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 },
  sectionTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  sectionTitleBlanco: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 12, color: C.blanco },
  sectionSubtitle: { fontSize: 11, color: C.gris, marginBottom: 16, lineHeight: 1.5 },
  sectionSubtitleBlanco: { fontSize: 11, color: '#ffffffaa', marginBottom: 16, lineHeight: 1.5 },

  body: { fontSize: 9, lineHeight: 1.6, marginBottom: 8, color: C.gris },
  bodyBlanco: { fontSize: 9, lineHeight: 1.6, marginBottom: 8, color: '#ffffffcc' },

  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.acento, paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderNegro: { flexDirection: 'row', backgroundColor: '#ffffff15', paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#00000010' },
  tableRowNegro: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#ffffff10' },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#00000005', borderBottomWidth: 0.5, borderBottomColor: '#00000010' },
  tableRowAltNegro: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#ffffff08', borderBottomWidth: 0.5, borderBottomColor: '#ffffff10' },
  tableRowHighlight: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#c9a95915', borderBottomWidth: 0.5, borderBottomColor: '#c9a95930' },
  tableRowHighlightNegro: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#c9a95920', borderBottomWidth: 0.5, borderBottomColor: '#c9a95930' },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.blanco, textTransform: 'uppercase', letterSpacing: 1 },
  thNegro: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.oro, textTransform: 'uppercase', letterSpacing: 1 },
  td: { fontSize: 8, color: C.negro },
  tdNegro: { fontSize: 8, color: '#ffffffdd' },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.negro },
  tdBoldNegro: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffffdd' },
  tdOro: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.oro },

  kpiRow: { flexDirection: 'row', marginBottom: 16, gap: 12 },
  kpiBox: { flex: 1, backgroundColor: C.negro, padding: 14, alignItems: 'center' },
  kpiBoxCrema: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center', borderWidth: 0.5, borderColor: '#00000015' },
  kpiBoxOro: { flex: 1, backgroundColor: '#c9a95918', padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.oro },
  kpiValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 },
  kpiValueBlanco: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.blanco, marginBottom: 4 },
  kpiValueNegro: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 4 },
  kpiLabel: { fontSize: 7, color: '#ffffff88', textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' },
  kpiLabelNegro: { fontSize: 7, color: C.gris, textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' },

  callout: { backgroundColor: '#c9a95912', borderLeftWidth: 3, borderLeftColor: C.oro, padding: 12, marginBottom: 14 },
  calloutNegro: { backgroundColor: '#ffffff08', borderLeftWidth: 3, borderLeftColor: C.oro, padding: 12, marginBottom: 14 },
  calloutText: { fontSize: 9, lineHeight: 1.5, color: C.negro },
  calloutTextBlanco: { fontSize: 9, lineHeight: 1.5, color: '#ffffffdd' },

  alertRojo: { backgroundColor: '#c9404012', borderLeftWidth: 3, borderLeftColor: C.rojo, padding: 12, marginBottom: 14 },
  alertRojoNegro: { backgroundColor: '#c9404018', borderLeftWidth: 3, borderLeftColor: C.rojo, padding: 12, marginBottom: 14 },
  alertVerde: { backgroundColor: '#4a996012', borderLeftWidth: 3, borderLeftColor: C.verde, padding: 12, marginBottom: 14 },
  alertAzul: { backgroundColor: '#4a799912', borderLeftWidth: 3, borderLeftColor: C.azul, padding: 12, marginBottom: 14 },

  divider: { height: 1, backgroundColor: '#00000010', marginVertical: 16 },
  dividerOro: { height: 1, backgroundColor: '#c9a95940', marginVertical: 16 },
  dividerBlanco: { height: 1, backgroundColor: '#ffffff15', marginVertical: 16 },

  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 7, color: C.grisMedio },
  footerTextBlanco: { fontSize: 7, color: '#ffffff40' },
  footerPage: { fontSize: 7, color: C.oro },

  bulletRow: { flexDirection: 'row', marginBottom: 6, paddingLeft: 8 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.oro, marginTop: 4, marginRight: 8 },
  bulletText: { flex: 1, fontSize: 9, lineHeight: 1.5, color: C.gris },
  bulletTextBlanco: { flex: 1, fontSize: 9, lineHeight: 1.5, color: '#ffffffcc' },
  bulletTextNegro: { flex: 1, fontSize: 9, lineHeight: 1.5, color: C.negro },

  numBox: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.oro, alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2 },
  numText: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.blanco },
  numBoxNegro: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2 },
});

const TOTAL_PAGES = 10;

const Footer = ({ page, total, dark }) => (
  React.createElement(View, { style: s.footer },
    React.createElement(Text, { style: dark ? s.footerTextBlanco : s.footerText }, 'Simon - Inteligencia Inmobiliaria'),
    React.createElement(Text, { style: dark ? s.footerTextBlanco : s.footerText }, 'Confidencial - Anexo Condado VI'),
    React.createElement(Text, { style: s.footerPage }, `${page} / ${total}`)
  )
);

const Bullet = ({ text, dark, negro }) => (
  React.createElement(View, { style: s.bulletRow },
    React.createElement(View, { style: s.bulletDot }),
    React.createElement(Text, { style: negro ? s.bulletTextNegro : dark ? s.bulletTextBlanco : s.bulletText }, text)
  )
);

const NumItem = ({ num, title, desc, dark }) => (
  React.createElement(View, { style: { flexDirection: 'row', marginBottom: 12 } },
    React.createElement(View, { style: dark ? s.numBoxNegro : s.numBox },
      React.createElement(Text, { style: s.numText }, String(num))
    ),
    React.createElement(View, { style: { flex: 1 } },
      React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: dark ? C.blanco : C.negro, marginBottom: 3 } }, title),
      React.createElement(Text, { style: { fontSize: 9, lineHeight: 1.5, color: dark ? '#ffffffbb' : C.gris } }, desc)
    )
  )
);

const SectionLabel = ({ text }) => React.createElement(Text, { style: s.sectionLabel }, text);

// ─── Document ───

const AnexoCondadoVI = () => (
  React.createElement(Document, {
    title: 'Anexo Estrategico - Condado VI Plaza Italia',
    author: 'Simon - Inteligencia Inmobiliaria',
  },

    // =============================================
    // PAGE 1: COVER (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCover },
      React.createElement(View, { style: { alignItems: 'center', flex: 1, justifyContent: 'center' } },
        React.createElement(Text, { style: s.coverLabel }, 'ANEXO ESTRATEGICO'),
        React.createElement(View, { style: s.coverLine }),
        React.createElement(Text, { style: s.coverTitle }, 'CONDADO VI'),
        React.createElement(Text, { style: s.coverSubtitle }, 'Plaza Italia - Equipetrol Centro'),
        React.createElement(View, { style: { height: 8 } }),
        React.createElement(Text, { style: s.coverSubtitle2 }, 'Analisis de Mercado Detallado'),
        React.createElement(View, { style: { ...s.coverLine, marginVertical: 30 } }),
        React.createElement(Text, { style: s.coverMeta }, 'Febrero 2026 - CONFIDENCIAL'),
        React.createElement(Text, { style: { ...s.coverMeta, marginTop: 8 } }, 'Simon - Inteligencia Inmobiliaria'),
        React.createElement(View, { style: { height: 40 } }),
        React.createElement(Text, { style: { ...s.coverMeta, fontSize: 7 } }, 'Datos: 233 unidades activas Equipetrol + 138 alquileres | 13 Feb 2026 | Fuentes: C21, Remax, BCB, Binance P2P')
      )
    ),

    // =============================================
    // PAGE 2: PANORAMA EQUIPETROL (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'MACRO' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Equipetrol: 5 zonas, 233 unidades activas'),

      // Zone overview table
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '22%' } }, 'ZONA'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'ABS. 30D'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'TASA'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'MED $/M2'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'AREA'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '22%' } }, 'Eq. Centro'),
          React.createElement(Text, { style: { ...s.tdBold, width: '15%', textAlign: 'right' } }, '106'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '19'),
          React.createElement(Text, { style: { ...s.tdOro, width: '15%', textAlign: 'right' } }, '15.2%'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$2,055'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '81 m2'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'Sirari'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '43'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '2'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '4.4%'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$2,055'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '99 m2'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'V. Brigida'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '38'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '13'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '25.5%'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,905'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '73 m2'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'Eq. Oeste'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '24'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '2'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '7.7%'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$2,188'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '100 m2'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '22%' } }, 'Eq. Norte'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '22'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '4.3%'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$2,404'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '71 m2'),
        ),
      ),

      React.createElement(View, { style: s.divider }),

      // Absorption heat map
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 10, color: C.negro } }, 'Absorcion por zona y tipologia (30 dias)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '18%' } }, 'ZONA'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, '1D ACT'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, '1D ABS'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, '1D %'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, '2D ACT'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, '2D ABS'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, '2D %'),
          React.createElement(Text, { style: { ...s.th, width: '11%', textAlign: 'right' } }, '3D ACT'),
          React.createElement(Text, { style: { ...s.th, width: '11%', textAlign: 'right' } }, '3D %'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', fontSize: 7 } }, 'Eq. Centro'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '41'),
          React.createElement(Text, { style: { ...s.tdOro, width: '10%', textAlign: 'right', fontSize: 7 } }, '11'),
          React.createElement(Text, { style: { ...s.tdOro, width: '10%', textAlign: 'right', fontSize: 7 } }, '21.2%'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '43'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '5'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '10.4%'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '9'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '10%'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 7 } }, 'Sirari'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '19'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '2'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '9.5%'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '11'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '0'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '0.0%'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '7'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '0.0%'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 7 } }, 'V. Brigida'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '15'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '4'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '21.1%'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '14'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '5'),
          React.createElement(Text, { style: { ...s.tdOro, width: '10%', textAlign: 'right', fontSize: 7 } }, '26.3%'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '4'),
          React.createElement(Text, { style: { ...s.tdOro, width: '11%', textAlign: 'right', fontSize: 7 } }, '20.0%'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 7 } }, 'Eq. Norte'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '8'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '0'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '0.0%'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '9'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '10.0%'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '0'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '-'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 7 } }, 'Eq. Oeste'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '11'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '8.3%'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '9'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right', fontSize: 7 } }, '10.0%'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '11%', textAlign: 'right', fontSize: 7 } }, '0.0%'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'Eq. Centro concentra 45% de la oferta (106 de 233) y 51% de las absorciones (19 de 37). Es el mercado mas grande y mas liquido. Condado compite aqui.')
      ),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, '1D lidera absorcion en Eq. Centro (21.2%). 2D moderado (10.4%). 3D lento: 10% tasa (1 absorcion confirmada de 10). V. Brigida es la zona mas liquida en 2D (26.3%).')
      ),

      React.createElement(Footer, { page: 2, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 3: COMPETIDORES DIRECTOS (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'COMPETENCIA' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Competidores directos con nombre'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Eq. Centro, rango $1,800-2,400/m2 USD oficial'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '20%' } }, 'EDIFICIO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '8%', textAlign: 'center' } }, 'TIP'),
          React.createElement(Text, { style: { ...s.thNegro, width: '10%', textAlign: 'right' } }, 'UDS'),
          React.createElement(Text, { style: { ...s.thNegro, width: '17%', textAlign: 'right' } }, '$/M2'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'center' } }, 'ESTADO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, 'DIF VS CONDADO'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '20%', fontSize: 7 } }, 'T-VEINTICINCO'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '8%', textAlign: 'center', fontSize: 7 } }, '2D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '10%', textAlign: 'right', fontSize: 7 } }, '10'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '17%', textAlign: 'right', fontSize: 7 } }, '$1,868-2,104'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'center', fontSize: 7 } }, 'no especif.'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right', fontSize: 7 } }, '-9% a +3%'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '20%', fontSize: 7 } }, 'Atrium'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '8%', textAlign: 'center', fontSize: 7 } }, '2D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '10%', textAlign: 'right', fontSize: 7 } }, '7'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '17%', textAlign: 'right', fontSize: 7 } }, '$1,943'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'center', fontSize: 7 } }, 'no especif.'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right', fontSize: 7 } }, '-4% a +17%'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '20%', fontSize: 7 } }, 'Spazios Eden'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '8%', textAlign: 'center', fontSize: 7 } }, '1D+2D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '10%', textAlign: 'right', fontSize: 7 } }, '5'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '17%', textAlign: 'right', fontSize: 7 } }, '$1,852-1,906'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'center', fontSize: 6, color: C.oroClaro } }, 'PREVENTA'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right', fontSize: 7 } }, '-10% a -7%'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '20%', fontSize: 7 } }, 'Sky Level'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '8%', textAlign: 'center', fontSize: 7 } }, '1D+2D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '10%', textAlign: 'right', fontSize: 7 } }, '3'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '17%', textAlign: 'right', fontSize: 7 } }, '$2,055'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'center', fontSize: 6, color: C.oroClaro } }, 'PREVENTA'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right', fontSize: 7 } }, '= mismo precio'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '20%', fontSize: 7 } }, 'HH Once'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '8%', textAlign: 'center', fontSize: 7 } }, '1D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '10%', textAlign: 'right', fontSize: 7 } }, '3'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '17%', textAlign: 'right', fontSize: 7 } }, '$1,925-2,081'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'center', fontSize: 6, color: C.oroClaro } }, 'PREVENTA'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right', fontSize: 7 } }, '-6% a +1%'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '20%', fontSize: 7 } }, 'Ent. inmediata*'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '8%', textAlign: 'center', fontSize: 7 } }, 'mix'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '10%', textAlign: 'right', fontSize: 7 } }, '6+'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '17%', textAlign: 'right', fontSize: 7 } }, '$1,912-2,342'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'center', fontSize: 6, color: C.verde } }, 'INMEDIATA'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right', fontSize: 7 } }, '-7% a +14%'),
        ),
        React.createElement(View, { style: s.tableRowHighlightNegro },
          React.createElement(Text, { style: { ...s.tdOro, width: '20%', fontSize: 7 } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.tdOro, width: '8%', textAlign: 'center', fontSize: 7 } }, '1-2-3D'),
          React.createElement(Text, { style: { ...s.tdOro, width: '10%', textAlign: 'right', fontSize: 7 } }, '14'),
          React.createElement(Text, { style: { ...s.tdOro, width: '17%', textAlign: 'right', fontSize: 7 } }, '$2,051'),
          React.createElement(Text, { style: { ...s.tdOro, width: '20%', textAlign: 'center', fontSize: 6 } }, 'INMEDIATA'),
          React.createElement(Text, { style: { ...s.tdOro, width: '25%', textAlign: 'right', fontSize: 7 } }, 'REFERENCIA'),
        ),
      ),

      React.createElement(Text, { style: { fontSize: 7, color: '#ffffff60', marginBottom: 14 } }, '* Entrega inmediata: La Foret, Haus, Macororo, Malibu Inside, Sky Collection, Sky Plaza Italia'),

      React.createElement(View, { style: s.dividerBlanco }),

      React.createElement(NumItem, { num: 1, dark: true,
        title: 'T-VEINTICINCO: mayor competidor por volumen (10 uds 2D)',
        desc: 'Precio similar. Equipamiento base comparable (cocina, horno, campana, microondas, AC, vestidores, box vidrio, chapa digital). Ventaja T-25: porcelanato 120x120, vidrios DVH, microondas. Ventaja Condado: linea blanca (heladera, lavavajillas, lavadora/secadora). T-25 tiene mas presencia en portales, pero con informacion inconsistente.',
      }),
      React.createElement(NumItem, { num: 2, dark: true,
        title: 'Sky Level: paga lo mismo y ESPERA 2 anos',
        desc: '$2,055/m2 en PREVENTA = exactamente el precio de Condado TERMINADO. El comprador inteligente elige Condado: mismo precio, cero riesgo, mudanza inmediata.',
      }),
      React.createElement(NumItem, { num: 3, dark: true,
        title: 'Entrega inmediata: cobran mas sin linea blanca',
        desc: 'Haus ($2,342), Sky Collection ($2,156), Malibu Inside ($2,252): todos mas caros. Equipamiento base similar pero ninguno incluye heladera, lavavajillas ni lavadora/secadora.',
      }),

      React.createElement(Footer, { page: 3, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 4: QUE SE VENDIO (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'ABSORBIDOS' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Que se vendio en los ultimos 30 dias'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Unidades absorbidas en Eq. Centro - evidencia de demanda real'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '25%' } }, 'EDIFICIO'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'center' } }, 'TIP'),
          React.createElement(Text, { style: { ...s.th, width: '12%', textAlign: 'right' } }, 'ABS.'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, '$/M2'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'DIAS MERCADO'),
          React.createElement(Text, { style: { ...s.th, width: '20%', textAlign: 'right' } }, 'VS CONDADO'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '25%' } }, 'Domus Infinity'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.tdBold, width: '12%', textAlign: 'right' } }, '3'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,640'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '47 dias'),
          React.createElement(Text, { style: { ...s.td, width: '20%', textAlign: 'right', color: C.verde } }, '-20%'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdBold, width: '25%' } }, 'EURODESIGN'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.tdBold, width: '12%', textAlign: 'right' } }, '3'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,321'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '52 dias'),
          React.createElement(Text, { style: { ...s.td, width: '20%', textAlign: 'right', color: C.verde } }, '-36%'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '25%' } }, 'Lofty Island'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,624'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '24 dias'),
          React.createElement(Text, { style: { ...s.td, width: '20%', textAlign: 'right', color: C.verde } }, '-21%'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdBold, width: '25%' } }, 'Nomad Smart Studio'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,808'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '5 dias!'),
          React.createElement(Text, { style: { ...s.td, width: '20%', textAlign: 'right', color: C.verde } }, '-12%'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '25%' } }, 'Condado Park V'),
          React.createElement(Text, { style: { ...s.tdOro, width: '10%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.tdOro, width: '12%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.tdOro, width: '15%', textAlign: 'right' } }, '$2,358'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '12 dias'),
          React.createElement(Text, { style: { ...s.td, width: '20%', textAlign: 'right', color: C.rojo } }, '+15%'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '25%' } }, 'Edificio Klug'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$2,573'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '47 dias'),
          React.createElement(Text, { style: { ...s.td, width: '20%', textAlign: 'right', color: C.rojo } }, '+25%'),
        ),
      ),

      React.createElement(View, { style: s.divider }),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, '1D lidera absorcion. 2D moderado. 3D lento.'),
        React.createElement(Text, { style: s.calloutText }, 'De 19 absorbidas en Eq. Centro: 11 son 1D (58%), 5 son 2D (26%), 1 es 3D (5%). El 1D es la tipologia mas liquida con diferencia.')
      ),

      React.createElement(View, { style: s.alertVerde },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Condado Park V 2D se vendio en 12 dias a $2,358/m2'),
        React.createElement(Text, { style: s.calloutText }, 'MAS CARO que Condado VI ($2,051). Valida demanda real por la marca Condado. El producto se vende -- el problema es que otros controlan la narrativa.')
      ),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Nomad Smart Studio: vendido en 5 dias.'),
        React.createElement(Text, { style: s.calloutText }, 'El 1D bien posicionado vuela. Condado tiene 4 unidades 1D sin presencia propia en ningun canal digital.')
      ),

      React.createElement(Footer, { page: 4, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 5: DIAGNOSTICO PRESENCIA DIGITAL (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'PRESENCIA DIGITAL' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Tu marca existe en internet, pero no es tuya'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Auditoria digital 360. Los 10 primeros resultados de Google para "Condado VI Plaza Italia" son de terceros. CERO son de Proinco.'),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '1. Otros cuentan tu historia (y la cuentan mal)'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Cada broker le pone el nombre que quiere: "Condado VI", "Condado 6", "Quartier Italia", "Equipetrol Plaza Italia". El comprador encuentra lo que parecen 5 edificios distintos que son el mismo.'),
      ),

      React.createElement(View, { style: { ...s.calloutNegro, borderLeftColor: C.rojo } },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '2. Te venden como preventa cuando ya estas terminado'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Brokers publican "Preventa entrega Sept 2025". El edificio ya tiene entrega inmediata con 44% vendido. Espanta al comprador que quiere mudarse ya.'),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '3. Tus fotos son renders de un edificio terminado'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Fotos reales del equipamiento incluido (linea blanca, chapa digital, meson granito, ascensores Orona) serian el mejor argumento de venta y nadie las tiene.'),
      ),

      React.createElement(View, { style: { ...s.calloutNegro, borderLeftColor: C.rojo } },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '4. El precio que ve el comprador no es tu precio'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Cada broker publica a un TC distinto. Uno a $1,455/m2, otro a $1,605, otro a $2,252. Sin canal propio, no hay forma de corregirlo.'),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '5. 6 edificios Condado en Equipetrol, cero activos digitales'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'No hay web, no hay Instagram, no hay Google Business verificado. Buscar "Proinco" devuelve empresas de otros paises. La marca tiene equity offline que no se traduce online.'),
      ),

      // SECTION 2: OTROS EDIFICIOS "CONDADO" (referencia)
      React.createElement(View, { style: { marginTop: 14 } },
        React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 8 } }, 'FUENTES DE LA AUDITORIA (verificables)'),
        React.createElement(Bullet, { text: 'Google Search: "Condado VI Plaza Italia Santa Cruz" -- 10 primeros resultados', dark: true }),
        React.createElement(Bullet, { text: 'Infocasas: listing como "Preventa" ref #C4DC58', dark: true }),
        React.createElement(Bullet, { text: 'Infocasas: listing como "Quartier Italia" ref #XB8E52 a $1,455/m2', dark: true }),
        React.createElement(Bullet, { text: 'UltraCasas: listings #1027452 (preventa), #1053598 (alquiler)', dark: true }),
        React.createElement(Bullet, { text: 'Meta Ads Library: sin cuenta oficial de Proinco/Condado', dark: true }),
        React.createElement(Bullet, { text: 'Google Maps: ficha con renders, sin fotos reales', dark: true }),
      ),

      React.createElement(View, { style: { ...s.calloutNegro, marginTop: 10, borderLeftColor: C.oro } },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold' } }, 'La marca Condado tiene equity de 6 edificios en Equipetrol. Condado Park V 2D se vendio en 12 dias a $2,358/m2. Hay demanda real. El problema no es el producto -- es que otros controlan la narrativa.'),
      ),

      React.createElement(Footer, { page: 5, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 6: RENTA Y YIELD REAL (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'RENTA' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Renta real: mapa de alquileres Equipetrol'),

      // Rental table by typology
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: C.negro } }, 'Alquileres activos - todo Equipetrol (USD/mes)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '12%' } }, 'DORMS'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'ACTIVOS'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'P25'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'MEDIANA'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'P75'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'AREA'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '12%' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '68'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$460'),
          React.createElement(Text, { style: { ...s.tdBold, width: '15%', textAlign: 'right' } }, '$524'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$648'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '-'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '12%' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '48'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$805'),
          React.createElement(Text, { style: { ...s.tdBold, width: '15%', textAlign: 'right' } }, '$898'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,221'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '-'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '12%' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '9'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,078'),
          React.createElement(Text, { style: { ...s.tdBold, width: '15%', textAlign: 'right' } }, '$1,509'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '$1,800'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '-'),
        ),
      ),

      React.createElement(View, { style: s.divider }),

      // Yield table
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: C.negro } }, 'Yield real usando precios Condado'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '8%' } }, 'TIP'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'BILLETE'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'RENTA/MES'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'RENTA/ANO'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'YIELD BILL'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'OFICIAL'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, 'YIELD OF.'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '8%' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$102,647'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$524'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$6,288'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '6.1%'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$127,572'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '4.9%'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '8%' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$144,573'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$898'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$10,776'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right', fontSize: 10 } }, '7.5%'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$179,677'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '6.0%'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '8%' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$238,112'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$1,509'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '$18,108'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '7.6%'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$295,930'),
          React.createElement(Text, { style: { ...s.td, width: '14%', textAlign: 'right' } }, '6.1%'),
        ),
      ),

      React.createElement(Text, { style: { fontSize: 7, color: C.grisMedio, marginBottom: 12 } }, '3D renta basada en 9 alquileres activos (P25 $1,078, mediana $1,509, P75 $1,800).'),

      React.createElement(View, { style: s.divider }),

      // Renta by zona
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: C.negro } }, 'Renta mediana por zona (USD/mes)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '30%' } }, 'ZONA'),
          React.createElement(Text, { style: { ...s.th, width: '23%', textAlign: 'right' } }, '1D'),
          React.createElement(Text, { style: { ...s.th, width: '23%', textAlign: 'right' } }, '2D'),
          React.createElement(Text, { style: { ...s.th, width: '24%', textAlign: 'right' } }, '3D'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '30%' } }, 'Eq. Centro'),
          React.createElement(Text, { style: { ...s.tdOro, width: '23%', textAlign: 'right' } }, '$517'),
          React.createElement(Text, { style: { ...s.tdOro, width: '23%', textAlign: 'right' } }, '$862'),
          React.createElement(Text, { style: { ...s.tdOro, width: '24%', textAlign: 'right' } }, '$1,509'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '30%' } }, 'Eq. Norte/Sur'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$460'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$715'),
          React.createElement(Text, { style: { ...s.td, width: '24%', textAlign: 'right' } }, '-'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '30%' } }, 'Sirari'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$503'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$1,307'),
          React.createElement(Text, { style: { ...s.td, width: '24%', textAlign: 'right' } }, '-'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '30%' } }, 'V. Brigida'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$453'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$1,042'),
          React.createElement(Text, { style: { ...s.td, width: '24%', textAlign: 'right' } }, '-'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 } }, 'El 2D rinde 7.5% bruto en billete = argumento de inversion real. El 3D alcanza 7.6%.'),
        React.createElement(Text, { style: s.calloutText }, 'No vender yield al TC oficial (mediocre). Vender yield al billete (competitivo). Descontar ~1.5pts por vacancia y gastos = 6.0% neto.')
      ),

      React.createElement(Footer, { page: 6, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 7: VELOCIDAD DE VENTA (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'ABSORCION' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Velocidad de venta y proyeccion'),

      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: { ...s.kpiBox, backgroundColor: '#ffffff10' } },
          React.createElement(Text, { style: s.kpiValue }, '3.7'),
          React.createElement(Text, { style: s.kpiLabel }, 'MESES INV. 1D'),
        ),
        React.createElement(View, { style: { ...s.kpiBox, backgroundColor: '#ffffff10' } },
          React.createElement(Text, { style: { ...s.kpiValueBlanco, color: C.oro } }, '8.6'),
          React.createElement(Text, { style: s.kpiLabel }, 'MESES INV. 2D'),
        ),
        React.createElement(View, { style: { ...s.kpiBox, backgroundColor: '#ffffff10' } },
          React.createElement(Text, { style: { ...s.kpiValueBlanco, color: C.oro } }, '>12'),
          React.createElement(Text, { style: s.kpiLabel }, 'MESES INV. 3D'),
        ),
      ),

      // Eq. Centro absorption detail
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.blanco, marginBottom: 10 } }, 'Absorcion Eq. Centro por tipologia'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '12%' } }, 'TIP'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'ABS/MES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'TASA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'MESES INV'),
          React.createElement(Text, { style: { ...s.thNegro, width: '16%', textAlign: 'right' } }, 'CONDADO'),
        ),
        React.createElement(View, { style: s.tableRowHighlightNegro },
          React.createElement(Text, { style: { ...s.tdOro, width: '12%' } }, '1D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '41'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '11'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '21.2%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '3.7'),
          React.createElement(Text, { style: { ...s.tdOro, width: '16%', textAlign: 'right' } }, '4 uds'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%' } }, '2D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '43'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '5'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '10.4%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right', color: C.oro } }, '8.6'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '7 uds'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%' } }, '3D'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '9'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '10%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right', color: C.oro } }, '>12'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '16%', textAlign: 'right' } }, '3 uds'),
        ),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      // Market share scenarios
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.blanco, marginBottom: 10 } }, 'Escenarios para vender 14 unidades Condado'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '28%' } }, 'ESCENARIO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'SHARE'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'UDS/MES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'MESES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'ANOS'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '28%' } }, 'Pesimista'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '1%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '~0.2'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right', color: C.rojo } }, '70'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right', color: C.rojo } }, '5.8'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%' } }, 'Realista'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '3%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '~0.6'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '23'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '1.9'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '28%' } }, 'Optimista'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '5%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '~1'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right', color: C.verde } }, '14'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right', color: C.verde } }, '1.2'),
        ),
        React.createElement(View, { style: s.tableRowHighlightNegro },
          React.createElement(Text, { style: { ...s.tdOro, width: '28%' } }, 'Con control digital'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '10%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '~2'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '7'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '0.6'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, '1D se vende rapido (3.7 meses). 2D moderado (8.6 meses). 3D lento (>12 meses).'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Condado vendio 11 de 25 (44%). Velocidad historica desconocida -> pregunta #2.')
      ),

      React.createElement(Footer, { page: 7, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 8: PERFILES DE COMPRADOR (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'PERFILES' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Perfiles de comprador por tipologia'),

      // 1D section
      React.createElement(View, { style: { backgroundColor: C.negro, padding: 10, marginBottom: 10 } },
        React.createElement(Text, { style: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.oro } }, '1D - $102,647 billete / $127,572 oficial'),
      ),

      React.createElement(NumItem, { num: 'A',
        title: 'Inversor refugio (40-60 anos)',
        desc: 'Tiene USD billete ahorrados, busca activo tangible. No quiere riesgo ni esperar. Compra, equipa, alquila en 2 semanas. Yield 5.9% billete.',
      }),
      React.createElement(NumItem, { num: 'B',
        title: 'Padres comprando para hijo (45-65 anos)',
        desc: 'Hijo estudia/trabaja en Equipetrol. Quieren seguridad + ubicacion. La renta futura es bonus. Deciden rapido si el producto esta listo.',
      }),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 } }, 'Pitch 1D'),
        React.createElement(Text, { style: s.calloutText }, '"Compra directo, ahorra 6-17% vs broker en portal. Linea blanca incluida (heladera, lavavajillas, lavadora). Alquila en 2 semanas."')
      ),

      React.createElement(View, { style: s.divider }),

      // 2D section
      React.createElement(View, { style: { backgroundColor: C.negro, padding: 10, marginBottom: 10 } },
        React.createElement(Text, { style: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.oro } }, '2D - $143-145K billete / $178-180K oficial'),
      ),

      React.createElement(NumItem, { num: 'A',
        title: 'Familia con capital (30-40 anos)',
        desc: 'Primer departamento. $143K billete NO es ticket de pareja joven. Es familia con capital o padres ayudando.',
      }),
      React.createElement(NumItem, { num: 'B',
        title: 'Profesional establecido (35-50 anos)',
        desc: 'Ahorros en USD, quiere vivir en Equipetrol. Valora entrega inmediata + linea blanca incluida. Se muda sin comprar electrodomesticos.',
      }),
      React.createElement(NumItem, { num: 'C',
        title: 'Inversor patrimonial (45-60 anos)',
        desc: 'Diversificar inversiones. Yield 7.2% billete es argumento real. 87m2 equipado = alquila rapido.',
      }),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 } }, 'Pitch 2D'),
        React.createElement(Text, { style: s.calloutText }, '"Todo incluido, 87m2 con linea blanca por $143K. Competencia cobra lo mismo pero sin heladera, lavavajillas ni lavadora."')
      ),

      React.createElement(View, { style: s.divider }),

      // 3D section
      React.createElement(View, { style: { backgroundColor: C.negro, padding: 10, marginBottom: 10 } },
        React.createElement(Text, { style: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.oro } }, '3D - $238,112 billete / $295,930 oficial'),
      ),

      React.createElement(NumItem, { num: 'A',
        title: 'Familia establecida (40-55 anos) - vivienda definitiva',
        desc: 'Comparan con casas. 144m2 full-equipado en Plaza Italia. Seguridad + piscina + gym + cero mantenimiento.',
      }),
      React.createElement(NumItem, { num: 'B',
        title: 'Empresario relocacion (35-55 anos)',
        desc: 'Viene de otra ciudad, quiere algo listo para mudarse. Valora calidad + ubicacion + que no falte nada.',
      }),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 } }, 'Pitch 3D'),
        React.createElement(Text, { style: s.calloutText }, '"144m2 full-equipado en Plaza Italia. Mejor que casa: seguridad, piscina, gym, cero mantenimiento."')
      ),

      React.createElement(Footer, { page: 8, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 9: GUIA DE OBJECIONES (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'HERRAMIENTAS COMERCIALES' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Guia de objeciones con respuesta'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Respuestas con datos, no con humo.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '28%' } }, 'OBJECION'),
          React.createElement(Text, { style: { ...s.thNegro, width: '72%' } }, 'RESPUESTA CON DATOS'),
        ),

        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"Es caro"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, '$2,051/m2 oficial = mediana exacta. Comprando directo ahorra 6-17% vs portal. + linea blanca incluida (heladera, lavavajillas, lavadora).'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"Prefiero preventa mas barata"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, 'Preventa hoy sale $2,500-2,800/m2. Condado a $2,051 terminado = precio de ayer. + riesgo obra + 2 anos espera.'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"El yield es bajo"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, 'Depende como mide. Comprando en billete, el costo baja y el yield sube. 2D rinde 7.2% sobre billete.'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"Solo 6 amenidades"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, 'Si, pero incluye linea blanca completa (heladera, lavavajillas, lavadora/secadora). Ahorro $3-4K. Equipamiento base comparable a T-25 y Atrium.'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"Brokers cobran mas"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, 'Correcto. Broker publica a $2,184/m2, directo sale $2,051/m2 = 6% menos. Comprando directo, cualquier forma de pago.'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"Por que no se vendio todo?"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, '44% vendido. Problema: otros controlan la narrativa digital -- nombres distintos, precios distintos, fotos falsas, estado incorrecto. No es el producto.'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"Que pasa con el TC?"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, 'Condado acepta billete Y BOB al TC ref BCB (8.65). 3 opciones de pago con transparencia total.'),
        ),
        React.createElement(View, { style: s.tableRowAltNegro },
          React.createElement(Text, { style: { ...s.tdBoldNegro, width: '28%', fontSize: 7.5 } }, '"Puedo negociar?"'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '72%', fontSize: 7.5, lineHeight: 1.4 } }, '3-5% descuento contado USD billete (win-win). 5-8% por compra multiple (2+).'),
        ),
      ),

      React.createElement(Footer, { page: 9, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 10: PREGUNTAS ESTRATEGICAS + DISCLAIMER (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'SIGUIENTE NIVEL' }),
      React.createElement(Text, { style: s.sectionTitle }, '10 preguntas estrategicas'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Las respuestas definen la estrategia final.'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '5%' } }, '#'),
          React.createElement(Text, { style: { ...s.th, width: '45%' } }, 'PREGUNTA'),
          React.createElement(Text, { style: { ...s.th, width: '50%' } }, 'POR QUE IMPORTA'),
        ),

        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '1'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Las 11 vendidas, a que precio cerraron?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Si cerraron bajo lista, el precio real es menor. Si a lista, esta validado.'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '2'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Cuanto tiempo tardaron las 11?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Define velocidad real. 11 en 6 meses = 2/mes. En 18 meses = 0.6/mes.'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '3'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Tienen equipo comercial propio?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Si solo brokers (que publican 2-3 de 14), el canal esta roto.'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '4'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Aceptarian publicar precio en billete + BOB referencial?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Transparencia = diferenciador. Puede incomodar brokers.'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '5'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Presupuesto para marketing digital?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Sin presencia digital, el producto no existe.'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '6'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Tienen co-working, pet friendly, sauna?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Si si y no publican = omision. Si no = considerar agregar.'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '7'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Que comision pagan a brokers?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Si menor que competencia, brokers empujan otros edificios primero.'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '8'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Ofrecen financiamiento directo?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, '"Muda hoy, paga en cuotas" - preventa no puede hacer esto.'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '9'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Objetivo de venta a 6 meses?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Liquidez (bajar precio) o margen (mantener). Cambia recomendaciones.'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdOro, width: '5%' } }, '10'),
          React.createElement(Text, { style: { ...s.td, width: '45%', fontSize: 7.5, lineHeight: 1.4 } }, 'Condado IV desaparecio - se vendio?'),
          React.createElement(Text, { style: { ...s.td, width: '50%', fontSize: 7.5, lineHeight: 1.4 } }, 'Si vendio = absorcion real. Si retiro = por que?'),
        ),
      ),

      React.createElement(View, { style: s.dividerOro }),

      // Disclaimer
      React.createElement(View, { style: { backgroundColor: '#00000008', padding: 12 } },
        React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.gris, marginBottom: 4 } }, 'DISCLAIMER'),
        React.createElement(Text, { style: { fontSize: 7, lineHeight: 1.5, color: C.grisMedio } }, 'Datos provenientes de portales inmobiliarios publicos (C21, Remax). No incluyen inventario directo de desarrolladoras. Precios en USD TC oficial salvo donde se indica. TC paralelo Binance P2P referencial. Simon no garantiza exactitud de datos de terceros.'),
      ),

      React.createElement(View, { style: { height: 16 } }),

      // Simon footer box
      React.createElement(View, { style: { backgroundColor: C.negro, padding: 16, alignItems: 'center' } },
        React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 } }, 'Simon - Inteligencia Inmobiliaria'),
        React.createElement(Text, { style: { fontSize: 9, color: '#ffffffaa' } }, 'Datos que venden. No intuicion.'),
        React.createElement(View, { style: { height: 8 } }),
        React.createElement(Text, { style: { fontSize: 8, color: '#ffffff60' } }, 'simonbo.com'),
      ),

      React.createElement(Footer, { page: 10, total: TOTAL_PAGES, dark: false }),
    ),
  )
);

// ─── Generate ───
async function generate() {
  console.log('Generando PDF Anexo Estrategico Condado VI...');
  const doc = React.createElement(AnexoCondadoVI);

  const outputDir = path.resolve(__dirname, '..', 'docs', 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'ANEXO_ESTRATEGICO_CONDADO_VI_2026-02-13_v3.pdf');
  await renderToFile(doc, outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`PDF generado: ${outputPath}`);
  console.log(`Tamano: ${(stats.size / 1024).toFixed(1)} KB`);
}

generate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
