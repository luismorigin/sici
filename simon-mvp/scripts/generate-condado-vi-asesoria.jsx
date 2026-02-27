/**
 * Generador PDF - Asesoria Comercial CONDADO VI Plaza Italia v7
 * Informe estrategico para la desarrolladora (Proinco / Condado)
 * Colores: Simon Brand (Negro #0a0a0a, Crema #f8f6f3, Oro #c9a959)
 *
 * Ejecutar: node scripts/generate-condado-vi-asesoria.jsx
 */

const React = require('react');
const { Document, Page, Text, View, StyleSheet, renderToFile } = require('@react-pdf/renderer');
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
  acento: '#1a1a2e',
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
  bodyNegro: { fontSize: 9, lineHeight: 1.6, marginBottom: 8, color: C.negro },

  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.acento, paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderNegro: { flexDirection: 'row', backgroundColor: '#ffffff15', paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#00000010' },
  tableRowNegro: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#ffffff10' },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#00000005', borderBottomWidth: 0.5, borderBottomColor: '#00000010' },
  tableRowHighlight: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#c9a95915', borderBottomWidth: 0.5, borderBottomColor: '#c9a95930' },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.blanco, textTransform: 'uppercase', letterSpacing: 1 },
  thNegro: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.oro, textTransform: 'uppercase', letterSpacing: 1 },
  td: { fontSize: 8, color: C.negro },
  tdNegro: { fontSize: 8, color: '#ffffffdd' },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.negro },
  tdOro: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.oro },

  kpiRow: { flexDirection: 'row', marginBottom: 16, gap: 12 },
  kpiBox: { flex: 1, backgroundColor: C.negro, padding: 14, alignItems: 'center' },
  kpiBoxCrema: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center', borderWidth: 0.5, borderColor: '#00000015' },
  kpiBoxOro: { flex: 1, backgroundColor: '#c9a95918', padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.oro },
  kpiValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 },
  kpiValueNegro: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 4 },
  kpiLabel: { fontSize: 7, color: '#ffffff88', textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' },
  kpiLabelNegro: { fontSize: 7, color: C.gris, textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' },

  callout: { backgroundColor: '#c9a95912', borderLeftWidth: 3, borderLeftColor: C.oro, padding: 12, marginBottom: 14 },
  calloutNegro: { backgroundColor: '#ffffff08', borderLeftWidth: 3, borderLeftColor: C.oro, padding: 12, marginBottom: 14 },
  calloutText: { fontSize: 9, lineHeight: 1.5, color: C.negro },
  calloutTextBlanco: { fontSize: 9, lineHeight: 1.5, color: '#ffffffdd' },

  alertRojo: { backgroundColor: '#c9404012', borderLeftWidth: 3, borderLeftColor: C.rojo, padding: 12, marginBottom: 14 },
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

const TOTAL_PAGES = 14;

const Footer = ({ page, total, dark }) => (
  React.createElement(View, { style: s.footer },
    React.createElement(Text, { style: dark ? s.footerTextBlanco : s.footerText }, 'Simon - Inteligencia Inmobiliaria'),
    React.createElement(Text, { style: dark ? s.footerTextBlanco : s.footerText }, 'Confidencial - Asesoria Condado VI'),
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

// ─── Helper: Table Row ───
const TR = ({ cells, widths, alt, highlight, dark }) => {
  let rowStyle = dark
    ? s.tableRowNegro
    : highlight ? s.tableRowHighlight : alt ? s.tableRowAlt : s.tableRow;
  if (highlight && dark) rowStyle = { ...s.tableRowNegro, backgroundColor: '#c9a95920' };
  const cellStyle = dark ? s.tdNegro : s.td;
  const cellStyleBold = dark ? s.tdOro : s.tdBold;
  return React.createElement(View, { style: rowStyle },
    ...cells.map((c, i) => {
      const w = widths[i] || '10%';
      const align = i === 0 ? 'left' : 'right';
      const bold = c && c.bold;
      const val = bold ? c.text : c;
      return React.createElement(Text, {
        key: i,
        style: { ...(bold ? cellStyleBold : cellStyle), width: w, textAlign: align }
      }, val);
    })
  );
};


// ─── Document ───
const AsesoriaCondadoVI = () => (
  React.createElement(Document, {
    title: 'Asesoria Comercial - Condado VI Plaza Italia v9',
    author: 'Simon - Inteligencia Inmobiliaria',
  },

    // =============================================
    // PAGE 1: COVER (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCover },
      React.createElement(View, { style: { alignItems: 'center', flex: 1, justifyContent: 'center' } },
        React.createElement(Text, { style: s.coverLabel }, 'ASESORIA COMERCIAL'),
        React.createElement(View, { style: s.coverLine }),
        React.createElement(Text, { style: s.coverTitle }, 'CONDADO VI'),
        React.createElement(Text, { style: s.coverSubtitle }, 'Plaza Italia - Equipetrol Centro'),
        React.createElement(View, { style: { height: 8 } }),
        React.createElement(Text, { style: s.coverSubtitle2 }, 'Estrategia de venta con inventario real y datos de mercado'),
        React.createElement(View, { style: { ...s.coverLine, marginVertical: 30 } }),
        React.createElement(Text, { style: s.coverMeta }, 'Preparado para: Proinco / Constructora Condado'),
        React.createElement(Text, { style: s.coverMeta }, '13 de febrero de 2026'),
        React.createElement(Text, { style: s.coverMeta }, 'Datos: 106 propiedades venta activas Eq. Centro + alquileres Equipetrol'),
        React.createElement(Text, { style: s.coverMeta }, 'Fuentes: Century 21 Bolivia, Remax Bolivia, BCB, Binance P2P'),
        React.createElement(View, { style: { height: 30 } }),
        React.createElement(Text, { style: { ...s.coverMeta, fontSize: 8 } }, 'CONFIDENCIAL'),
        React.createElement(View, { style: { height: 20 } }),
        React.createElement(Text, { style: { ...s.coverMeta, fontSize: 7 } }, 'Precios mercado: USD TC oficial Bs 6.96 | Precios Condado: USD billete (ver nota metodologica)')
      )
    ),

    // =============================================
    // PAGE 2: NOTA METODOLOGICA (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'METODOLOGIA' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Nota Metodologica: Los 3 Tipos de Cambio'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Bolivia opera con multiples tipos de cambio. Entender esta diferencia es fundamental para interpretar correctamente los precios de este informe.'),

      // TC Table
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '25%' } }, 'TIPO DE CAMBIO'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'TASA'),
          React.createElement(Text, { style: { ...s.th, width: '60%' } }, 'DESCRIPCION'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '25%' } }, 'TC Oficial BCB'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, 'Bs 6.96'),
          React.createElement(Text, { style: { ...s.td, width: '60%' } }, 'Fijo desde 2011. Usado por bancos, contratos formales, hipotecas.'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '25%' } }, 'TC Referencial BCB'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, 'Bs 8.65'),
          React.createElement(Text, { style: { ...s.td, width: '60%' } }, 'Nuevo TC diario del BCB. Fuente oficial, conservadora. Condado lo usa para pagos en BOB.'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '25%' } }, 'TC Paralelo Binance'),
          React.createElement(Text, { style: { ...s.td, width: '15%', textAlign: 'right' } }, '~Bs 9.17'),
          React.createElement(Text, { style: { ...s.td, width: '60%' } }, 'Mercado P2P. TC real de calle (compra 9.13 / venta 9.21). Donde el comprador vende sus dolares.'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Como comparamos precios en este informe'),
        React.createElement(Text, { style: s.calloutText }, 'La base de datos SICI normaliza TODOS los precios del mercado a USD TC oficial (Bs 6.96). Condado vende en USD billete a $1,650/m2. Para comparar manzanas con manzanas:'),
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginTop: 6 } }, 'USD billete x (TC Ref 8.65 / TC Oficial 6.96) = USD oficial'),
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, '$1,650 x 1.2428 = $2,051/m2 oficial'),
        React.createElement(Text, { style: { ...s.calloutText, marginTop: 6 } }, 'Usamos TC Referencial BCB (8.65) como factor de conversion porque es fuente oficial, conservadora, y es el TC que Condado ya acepta para pagos en bolivianos.'),
      ),

      React.createElement(View, { style: s.alertAzul },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Donde aparece cada TC en este informe'),
        React.createElement(Bullet, { text: 'Paginas 3-8, 10-14: todos los precios en USD TC oficial para comparacion con mercado', negro: true }),
        React.createElement(Bullet, { text: 'Pagina 4 (Inventario): muestra USD billete, BOB (x8.65), y USD oficial', negro: true }),
        React.createElement(Bullet, { text: 'Pagina 9 (Estrategia de Pago): UNICA seccion con los 3 tipos de cambio', negro: true }),
      ),

      React.createElement(Footer, { page: 2, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 3: RESUMEN EJECUTIVO (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'RESUMEN EJECUTIVO' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Condado VI: Diagnostico y Oportunidad'),

      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '14'),
          React.createElement(Text, { style: s.kpiLabel }, 'DISPONIBLES'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '44%'),
          React.createElement(Text, { style: s.kpiLabel }, 'VENDIDO'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '$2,051'),
          React.createElement(Text, { style: s.kpiLabel }, 'USD OFICIAL/M2'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '13'),
          React.createElement(Text, { style: s.kpiLabel }, 'ITEMS EQUIPAM.'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Inventario disponible'),
        React.createElement(Text, { style: s.calloutText }, '14 unidades de 25 totales (11 vendidas = 44%). Desglose: 4 unidades 1D (62m2), 7 unidades 2D (87-87m2), 3 unidades 3D (144m2). Pisos 1 a 5, entrega inmediata.'),
      ),

      React.createElement(View, { style: s.alertVerde },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Posicionamiento: Mediana exacta del mercado'),
        React.createElement(Text, { style: s.calloutText }, 'A $2,051/m2 oficial, Condado VI se posiciona en la mediana exacta para 2D ($2,055). Para 1D ($2,081) esta ligeramente debajo. Para 3D ($1,556) esta por encima pero justificado por equipamiento. Con 13 items incluidos, la propuesta de valor es superior al P75.'),
      ),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Diagnostico: El producto no es el problema. El control de la narrativa es el problema.'),
        React.createElement(Text, { style: s.calloutText }, 'Condado VI tiene presencia en internet, pero no la controla. Otros cuentan su historia -- y la cuentan mal: con nombres distintos, precios distintos, fotos falsas (renders) y estado de obra incorrecto (preventa en vez de entrega inmediata).'),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Equipamiento: Lider absoluto del mercado'),
        React.createElement(Text, { style: s.calloutText }, '13 items incluidos en el precio: cocina encimera, campana, horno electrico, heladera, lavavajillas, lavadora/secadora, AC frio/calor en TODOS los ambientes, intercomunicador, calefon, box vidrio templado, espejos, iluminacion completa, roperos. Ahorro estimado: $7,000-8,000 USD. Ningun competidor ofrece esto.'),
      ),

      React.createElement(Footer, { page: 3, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 4: INVENTARIO REAL (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'INVENTARIO' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Inventario Real: 14 unidades disponibles'),
      React.createElement(Text, { style: s.sectionSubtitle }, '25 departamentos totales, 11 vendidos (44%), entrega inmediata. Precio lista en USD billete, conversion a BOB (x8.65) y USD oficial (/6.96).'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '7%' } }, 'PISO'),
          React.createElement(Text, { style: { ...s.th, width: '8%' } }, 'DPTO'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, 'M2'),
          React.createElement(Text, { style: { ...s.th, width: '8%', textAlign: 'center' } }, 'TIP'),
          React.createElement(Text, { style: { ...s.th, width: '22%', textAlign: 'right' } }, 'USD BILLETE'),
          React.createElement(Text, { style: { ...s.th, width: '22%', textAlign: 'right' } }, 'BOB (x8.65)'),
          React.createElement(Text, { style: { ...s.th, width: '23%', textAlign: 'right' } }, 'USD OFICIAL'),
        ),
        // P1
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P1'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '101'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '62.21'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$102,647'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 887,893'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$127,572'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P1'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '102'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '87.62'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$144,573'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 1,250,557'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$179,677'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P1'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '103'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '86.73'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$143,105'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 1,237,854'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$177,854'),
        ),
        // P2
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P2'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '201'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '62.21'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$102,647'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 887,893'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$127,572'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P2'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '202'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '87.62'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$144,573'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 1,250,557'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$179,677'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P2'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '205'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '144.31'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$238,112'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 2,059,666'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$295,930'),
        ),
        // P3
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P3'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '301'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '62.21'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$102,647'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 887,893'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$127,572'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P3'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '302'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '87.62'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$144,573'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 1,250,557'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$179,677'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P3'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '303'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '86.73'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$143,105'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 1,237,854'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$177,854'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P3'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '305'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '144.31'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$238,112'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 2,059,666'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$295,930'),
        ),
        // P4
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P4'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '401'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '62.21'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$102,647'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 887,893'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$127,572'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P4'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '405'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '144.31'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$238,112'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 2,059,666'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$295,930'),
        ),
        // P5
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P5'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '502'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '87.62'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$144,573'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 1,250,557'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$179,677'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '7%' } }, 'P5'),
          React.createElement(Text, { style: { ...s.td, width: '8%' } }, '503'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '86.73'),
          React.createElement(Text, { style: { ...s.td, width: '8%', textAlign: 'center' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, '$143,105'),
          React.createElement(Text, { style: { ...s.td, width: '22%', textAlign: 'right' } }, 'Bs 1,237,854'),
          React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'right' } }, '$177,854'),
        ),
      ),

      // Summary by typology
      React.createElement(View, { style: { flexDirection: 'row', gap: 12, marginBottom: 12 } },
        React.createElement(View, { style: { flex: 1, backgroundColor: '#c9a95912', padding: 10, borderLeftWidth: 3, borderLeftColor: C.oro } },
          React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold' } }, '1D: 4 uds x 62m2'),
          React.createElement(Text, { style: { fontSize: 8, color: C.gris } }, '$102,647 billete'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: '#c9a95912', padding: 10, borderLeftWidth: 3, borderLeftColor: C.oro } },
          React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold' } }, '2D: 7 uds x 87m2'),
          React.createElement(Text, { style: { fontSize: 8, color: C.gris } }, '$143-145K billete'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: '#c9a95912', padding: 10, borderLeftWidth: 3, borderLeftColor: C.oro } },
          React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold' } }, '3D: 3 uds x 144m2'),
          React.createElement(Text, { style: { fontSize: 8, color: C.gris } }, '$238,112 billete'),
        ),
      ),

      React.createElement(View, { style: s.alertAzul },
        React.createElement(Text, { style: s.calloutText }, 'Extras opcionales (aparte del precio base): Parqueo $12,500 USD | Baulera $5,500 USD. Nota: competidores tambien cobran parqueo/baulera aparte. Comparar manzanas con manzanas.'),
      ),

      React.createElement(Footer, { page: 4, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 5: ESTRATEGIA 1D (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'ESTRATEGIA POR TIPOLOGIA' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, '1 Dormitorio: La tipologia mas liquida'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, '4 unidades disponibles | 62m2 | $102,647 billete = $127,572 oficial | $2,051/m2 oficial'),

      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: s.kpiValueNegro }, '11'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'ABSORBIDAS'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: s.kpiValueNegro }, '3.7'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'MESES INVENTARIO'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: s.kpiValueNegro }, '21.2%'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'TASA ABSORCION'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Target: Inversor refugio de valor, padres comprando para hijos, profesional joven'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Los 1D son la tipologia MAS liquida de Equipetrol Centro. 11 unidades absorbidas (41 activas) = 3.7 meses de inventario. Demanda real y constante.'),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Posicionamiento: Mediana exacta'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Condado $2,051 vs Mediana mercado $2,081. P25=$1,824, P75=$2,342. Ligeramente debajo de la mediana (-1.4%), pero con equipamiento de P75+.'),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Renta: Yield atractivo para inversores'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Alquiler mediana 1D: $524/mes. Sobre billete ($102,647): yield 6.1% anual. Sobre oficial ($127,572): yield 4.9% anual. 68 alquileres 1D activos en Equipetrol (P25 $460, P75 $648).'),
      ),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '35%' } }, 'COMPETENCIA 1D'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, '$/M2 OFICIAL'),
          React.createElement(Text, { style: { ...s.thNegro, width: '45%' } }, 'NOTA'),
        ),
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '35%' } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.tdOro, width: '20%', textAlign: 'right' } }, '$2,051'),
          React.createElement(Text, { style: { ...s.tdOro, width: '45%' } }, 'Llave en mano + linea blanca completa'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, 'Atrium (broker)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, '$2,391'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '45%' } }, 'Publicado C21, +17% vs Condado'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, 'Sky Plaza Italia'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, '$1,912-2,101'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '45%' } }, 'Cocina equip., AC, semi-amoblado'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, 'HH Once (preventa)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, '$1,925-2,081'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '45%' } }, 'Encimera, extractor, muebles cocina'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold' } }, 'Argumento clave: "Llave en mano con linea blanca completa (heladera, lavavajillas, lavadora). Debajo de la mediana del mercado. Entrega inmediata, yield 6.1% anual"'),
      ),

      React.createElement(Footer, { page: 5, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 6: ESTRATEGIA 2D (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'ESTRATEGIA POR TIPOLOGIA' }),
      React.createElement(Text, { style: s.sectionTitle }, '2 Dormitorios: Volumen alto, absorcion moderada'),
      React.createElement(Text, { style: s.sectionSubtitle }, '7 unidades disponibles (50% del inventario) | 87m2 | $143-145K billete | $2,051/m2 oficial'),

      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '5'),
          React.createElement(Text, { style: s.kpiLabel }, 'ABSORBIDAS'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: { ...s.kpiValue, color: C.oro } }, '8.6'),
          React.createElement(Text, { style: s.kpiLabel }, 'MESES INVENTARIO'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: { ...s.kpiValue, color: C.oro } }, '10.4%'),
          React.createElement(Text, { style: s.kpiLabel }, 'TASA ABSORCION'),
        ),
      ),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Advertencia honesta: mercado 2D competido'),
        React.createElement(Text, { style: s.calloutText }, '43 unidades 2D activas en Equipetrol Centro. 5 absorbidas = 8.6 meses de inventario. Absorcion moderada pero es la tipologia con mas oferta. El diferenciador TIENE que ser el equipamiento.'),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Target: Familia con capital, padres comprando, profesional 35-50'),
        React.createElement(Text, { style: s.calloutText }, 'Comprador que busca calidad y conveniencia. No quiere preventa, no quiere equipar. Quiere mudarse.'),
      ),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '30%' } }, 'COMPETENCIA 2D'),
          React.createElement(Text, { style: { ...s.th, width: '12%', textAlign: 'right' } }, 'UDS'),
          React.createElement(Text, { style: { ...s.th, width: '25%', textAlign: 'right' } }, '$/M2 OFICIAL'),
          React.createElement(Text, { style: { ...s.th, width: '33%' } }, 'NOTA'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '30%' } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.tdBold, width: '12%', textAlign: 'right' } }, '7'),
          React.createElement(Text, { style: { ...s.tdBold, width: '25%', textAlign: 'right' } }, '$2,051'),
          React.createElement(Text, { style: { ...s.tdBold, width: '33%' } }, 'Equip. + linea blanca'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '30%' } }, 'T-Veinticinco'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '10'),
          React.createElement(Text, { style: { ...s.td, width: '25%', textAlign: 'right' } }, '$1,868-2,104'),
          React.createElement(Text, { style: { ...s.td, width: '33%' } }, 'Equip. similar, sin linea blanca'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '30%' } }, 'Atrium'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '7'),
          React.createElement(Text, { style: { ...s.td, width: '25%', textAlign: 'right' } }, '$1,943'),
          React.createElement(Text, { style: { ...s.td, width: '33%' } }, 'Granito, roperos, sin linea blanca'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '30%' } }, 'Mediana mercado'),
          React.createElement(Text, { style: { ...s.td, width: '12%', textAlign: 'right' } }, '43'),
          React.createElement(Text, { style: { ...s.td, width: '25%', textAlign: 'right' } }, '$2,055'),
          React.createElement(Text, { style: { ...s.td, width: '33%' } }, 'P25=$1,872 | P75=$2,233'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Renta: Yield competitivo'),
        React.createElement(Text, { style: s.calloutText }, 'Alquiler mediana 2D: $898/mes. Sobre billete ($144,573): yield 7.5% anual. 48 alquileres 2D activos en Equipetrol (P25 $805, P75 $1,221). El yield sobre billete es el mas alto de las 3 tipologias.'),
      ),

      React.createElement(View, { style: s.alertVerde },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'Argumento clave: "En un mercado 2D competido (8.6 meses inventario), Condado es el unico con linea blanca completa (heladera, lavavajillas, lavadora). Mudarse en 24 horas. Yield 7.5% sobre billete."'),
      ),

      React.createElement(Footer, { page: 6, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 7: ESTRATEGIA 3D (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'ESTRATEGIA POR TIPOLOGIA' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, '3 Dormitorios: Nicho premium, decision lenta'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, '3 unidades disponibles | 144m2 | $238,112 billete = $295,930 oficial | $2,051/m2 oficial'),

      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: s.kpiValueNegro }, '1'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'ABSORBIDA'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: s.kpiValueNegro }, '9'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'ACTIVAS MERCADO'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: s.kpiValueNegro }, '10%'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'TASA ABSORCION'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Target: Familia establecida, empresario en relocacion, comprador de upgrade'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Nicho reducido: solo 9 unidades 3D activas en Equipetrol Centro. 1 absorbida confirmada (La Riviera, $1,208/m2). Inventario >12 meses. Mercado de decision lenta donde el comprador evalua antes de actuar. La competencia en entrega inmediata equipada es practicamente nula.'),
      ),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '25%' } }, 'METRICA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, 'MERCADO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, 'CONDADO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%' } }, 'VENTAJA'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, 'Mediana $/m2'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$1,556'),
          React.createElement(Text, { style: { ...s.tdOro, width: '25%', textAlign: 'right' } }, '$2,051'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, '+32% (equipamiento)'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, 'P25'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$1,254'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '-'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, '-'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, 'P75'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$2,630'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '-'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, 'Debajo P75'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, 'Renta mediana'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$1,509/mes'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '-'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, 'Yield 7.6% bill.'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Competencia en portales'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Condado VI 3D publicado en Remax a $315,225-325,008 ($2,184-2,252/m2) por Juan Jose Cruz Garcia. Precio broker es +6-10% sobre precio directo. Con 9 activas y solo 1 absorcion confirmada, es un mercado de decision lenta. La ventaja: poca competencia en entrega inmediata equipada.'),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold' } }, 'Argumento clave: "144m2 full-equipado en Plaza Italia, mejor que una casa. Entrega inmediata, piscina panoramica, gimnasio, terraza con churrasquera. Sin el dolor de cabeza de construir."'),
      ),

      React.createElement(Footer, { page: 7, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 8: POR QUE CONDADO (LLAVE EN MANO) (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'PROPUESTA DE VALOR' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Por que Condado VI y no otro mas barato?'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'La respuesta no esta en el precio por metro cuadrado. Esta en lo que recibes por ese precio.'),

      // Comparison table - 4 columns honest
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '31%' } }, 'ITEM'),
          React.createElement(Text, { style: { ...s.th, width: '23%', textAlign: 'center' } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.th, width: '23%', textAlign: 'center' } }, 'T-25'),
          React.createElement(Text, { style: { ...s.th, width: '23%', textAlign: 'center' } }, 'ATRIUM'),
        ),
        ...[
          ['Mob. cocina completo', 'SI (encimera gas)', 'SI (alto+bajo)', 'SI (granito)'],
          ['Campana extractora', 'SI', 'SI', '-'],
          ['Horno', 'SI (electrico)', 'SI (empotrado)', '-'],
          ['Microondas', '-', 'SI', '-'],
          ['Meson granito', 'SI', '-', 'SI'],
          ['AC todos ambientes', 'SI', 'SI', 'SI'],
          ['Roperos/vestidores', 'SI', 'SI (vestidores)', 'SI (empotrados)'],
          ['Box bano vidrio', 'SI', 'SI', 'SI (lujo)'],
          ['Chapa digital', 'SI', 'SI', '-'],
          ['Iluminacion LED', 'SI', 'SI', 'SI'],
          ['Calefon a gas', 'SI', '?', '?'],
          ['HELADERA', 'SI', 'NO', 'NO'],
          ['LAVAVAJILLAS', 'SI', 'NO', 'NO'],
          ['LAVADORA/SECADORA', 'SI', 'NO', 'NO'],
        ].map((row, i) => {
          var isUnique = row[0] === 'HELADERA' || row[0] === 'LAVAVAJILLAS' || row[0] === 'LAVADORA/SECADORA';
          return React.createElement(View, { key: i, style: isUnique ? s.tableRowHighlight : (i % 2 === 0 ? s.tableRow : s.tableRowAlt) },
            React.createElement(Text, { style: { ...s.td, width: '31%', fontSize: 7.5, fontFamily: isUnique ? 'Helvetica-Bold' : 'Helvetica' } }, row[0]),
            React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'center', fontSize: 7.5, color: row[1] === 'SI' || row[1].startsWith('SI') ? C.verde : C.gris } }, row[1]),
            React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'center', fontSize: 7.5, color: row[2] === 'NO' ? C.rojo : (row[2] === 'SI' || row[2].startsWith('SI') ? C.verde : C.gris) } }, row[2]),
            React.createElement(Text, { style: { ...s.td, width: '23%', textAlign: 'center', fontSize: 7.5, color: row[3] === 'NO' ? C.rojo : (row[3] === 'SI' || row[3].startsWith('SI') ? C.verde : C.gris) } }, row[3]),
          );
        }),
      ),

      React.createElement(View, { style: { flexDirection: 'row', gap: 12, marginBottom: 14 } },
        React.createElement(View, { style: { flex: 1, ...s.callout } },
          React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Diferenciador real'),
          React.createElement(Text, { style: { ...s.calloutText, fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'Linea blanca'),
          React.createElement(Text, { style: s.calloutText }, 'Heladera + lavavajillas + lavadora/secadora ($3-4K) que ningun competidor incluye'),
        ),
        React.createElement(View, { style: { flex: 1, ...s.callout } },
          React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Tiempo de mudanza'),
          React.createElement(Text, { style: { ...s.calloutText, fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.oro } }, '24 horas'),
          React.createElement(Text, { style: s.calloutText }, 'vs 2+ anos en preventa + semanas equipando'),
        ),
      ),

      React.createElement(View, { style: s.alertVerde },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Amenidades edificio (7 confirmadas)'),
        React.createElement(Text, { style: s.calloutText }, 'Piscina panoramica, Gimnasio equipado, Salon social, Terraza cubierta con churrasquera, Terraza de relajacion, Balcones panoramicos a Plaza Italia, Ascensores Orona ultima tecnologia.'),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'Equipamiento base comparable a T-25 y Atrium. El diferenciador: linea blanca completa (heladera, lavavajillas, lavadora/secadora). El comprador se muda sin comprar electrodomesticos.'),
      ),

      React.createElement(Footer, { page: 8, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 9: ESTRATEGIA FORMAS DE PAGO (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'ESTRATEGIA DE PAGO' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'El Conflicto del Tipo de Cambio'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'La brecha entre TC paralelo (9.26) y TC referencial (8.65) crea un "pastel" de Bs 62,616 por unidad 1D. Ambas partes quieren ese beneficio. La solucion: repartirlo.'),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'El conflicto explicado (ejemplo 1D = $102,647 billete)'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'COMPRADOR con USD: prefiere vender USD a 9.26, pagar BOB a 8.65. Costo real: ~$95,886 (-6.6%).'),
        React.createElement(Text, { style: { ...s.calloutTextBlanco, marginTop: 4 } }, 'CONDADO recibiendo billete: vende USD a 9.26 = Bs 950,512. Recibiendo BOB: solo Bs 887,897.'),
        React.createElement(Text, { style: { ...s.calloutTextBlanco, marginTop: 4 } }, 'La diferencia: Bs 62,616 (~$6,761). Ese es el "pastel" que ambos quieren.'),
      ),

      // Table 1: What buyer pays
      React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 8, marginTop: 4 } }, 'Tabla 1: Lo que el comprador paga (1D ejemplo)'),
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '40%' } }, 'FORMA DE PAGO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, 'COSTO REAL'),
          React.createElement(Text, { style: { ...s.thNegro, width: '35%' } }, 'RESULTADO'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, 'Vende USD->BOB, paga BOB'),
          React.createElement(Text, { style: { ...s.tdOro, width: '25%', textAlign: 'right' } }, '~$95,886'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, 'Ahorra $6,761 (6.6%)'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, 'USD billete directo'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$102,647'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, 'Precio lista (referencia)'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, 'Via broker en portal'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '~$148,732'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, 'Paga 10-17% mas (comision broker)'),
        ),
      ),

      // Table 2: What Condado receives
      React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 8 } }, 'Tabla 2: Lo que Condado recibe (1D ejemplo)'),
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '40%' } }, 'ESCENARIO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, 'RECIBE Bs'),
          React.createElement(Text, { style: { ...s.thNegro, width: '35%' } }, 'VS RECIBIR BOB'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, 'Recibe BOB (x8.65)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, 'Bs 887,897'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, 'Base'),
        ),
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '40%' } }, '3% desc. billete ($99,568)'),
          React.createElement(Text, { style: { ...s.tdOro, width: '25%', textAlign: 'right' } }, 'Bs 921,999'),
          React.createElement(Text, { style: { ...s.tdOro, width: '35%' } }, '+Bs 34,102 vs BOB'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, '5% desc. billete ($97,515)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, 'Bs 902,989'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, '+Bs 15,092 vs BOB'),
        ),
      ),

      React.createElement(View, { style: { ...s.calloutNegro, borderLeftColor: C.verde } },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'La solucion: 3-5% descuento por USD billete (WIN-WIN)'),
        React.createElement(Text, { style: s.calloutTextBlanco }, '- Comprador paga menos que precio lista'),
        React.createElement(Text, { style: s.calloutTextBlanco }, '- Condado recibe MAS bolivianos netos que si cobrara en BOB'),
        React.createElement(Text, { style: s.calloutTextBlanco }, '- Ambos se reparten el spread del TC'),
      ),

      React.createElement(Footer, { page: 9, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 10: POSICIONAMIENTO MERCADO (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'POSICIONAMIENTO' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Condado VI en el Mapa de Precios'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Todos los precios en USD TC oficial. Condado VI a $2,051/m2 oficial (equivalente a $1,650/m2 billete).'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '10%' } }, 'TIP.'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, 'N'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'P25'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'MEDIANA'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'P75'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'right' } }, 'CONDADO'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'center' } }, 'POSICION'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '10%' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '41'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$1,824'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$2,081'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$2,342'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'right', color: C.oro } }, '$2,051'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'center', color: C.verde } }, '< P50'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '10%' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '43'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$1,872'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$2,055'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$2,233'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'right', color: C.oro } }, '$2,051'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'center', color: C.verde } }, '= P50'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdBold, width: '10%' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '10%', textAlign: 'right' } }, '9'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$1,254'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$1,556'),
          React.createElement(Text, { style: { ...s.td, width: '16%', textAlign: 'right' } }, '$2,630'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'right', color: C.oro } }, '$2,051'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'center' } }, '> P50'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Lectura del posicionamiento'),
        React.createElement(Bullet, { text: '1D: Ligeramente debajo de la mediana ($2,051 vs $2,081, -1.4%). Precio competitivo + unico con linea blanca completa incluida.', negro: true }),
        React.createElement(Bullet, { text: '2D: Mediana exacta ($2,051 vs $2,055). Equipamiento base similar a T-25 y Atrium, pero linea blanca incluida diferencia.', negro: true }),
        React.createElement(Bullet, { text: '3D: Sobre mediana ($2,051 vs $1,556) pero debajo del P75 ($2,630). Justificado por equipamiento completo. Solo 9 activas en zona.', negro: true }),
      ),

      React.createElement(View, { style: s.alertVerde },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'Conclusion: "Precio en la mediana (o debajo) CON linea blanca incluida". Equipamiento base comparable a T-25 y Atrium, pero heladera + lavavajillas + lavadora/secadora que nadie mas incluye.'),
      ),

      // Absorption summary
      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 14, marginTop: 8 } }, 'Absorcion Equipetrol Centro (ultimos 30 dias)'),
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '12%' } }, 'TIP.'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'ABSORB.'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'TASA'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'MESES INV'),
          React.createElement(Text, { style: { ...s.th, width: '16%', textAlign: 'center' } }, 'RITMO'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '12%' } }, '1D'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '41'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '11'),
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', textAlign: 'right', color: C.verde } }, '21.2%'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '3.7'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'center', color: C.verde } }, 'RAPIDO'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdBold, width: '12%' } }, '2D'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '43'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '5'),
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', textAlign: 'right', color: C.oro } }, '10.4%'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '8.6'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'center', color: C.oro } }, 'MODERADO'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '12%' } }, '3D'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '9'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '1'),
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', textAlign: 'right', color: C.oro } }, '10%'),
          React.createElement(Text, { style: { ...s.td, width: '18%', textAlign: 'right' } }, '>12'),
          React.createElement(Text, { style: { ...s.tdBold, width: '16%', textAlign: 'center', color: C.oro } }, 'LENTO'),
        ),
      ),

      React.createElement(Footer, { page: 10, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 11: DIAGNOSTICO PRESENCIA DIGITAL (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'PRESENCIA DIGITAL' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Tu marca existe en internet, pero no es tuya'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Auditoria de visibilidad digital 360: Google, portales, Meta Ads, redes sociales. 5 hallazgos criticos.'),

      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: { ...s.kpiValueNegro, color: C.rojo } }, '0'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'CANALES PROPIOS'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: s.kpiValueNegro }, '10+'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'RESULTADOS DE TERCEROS'),
        ),
        React.createElement(View, { style: { flex: 1, backgroundColor: C.crema, padding: 14, alignItems: 'center' } },
          React.createElement(Text, { style: { ...s.kpiValueNegro, color: C.rojo } }, '5+'),
          React.createElement(Text, { style: s.kpiLabelNegro }, 'NOMBRES DISTINTOS'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '1. Otros cuentan tu historia (y la cuentan mal)'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Los 10 primeros resultados de Google para "Condado VI Plaza Italia" son de terceros: Infocasas, C21, UltraCasas, agentes independientes. CERO son de Proinco. Cada broker le pone el nombre que quiere: "Condado VI", "Condado 6", "Quartier Italia", "Equipetrol Plaza Italia". El comprador encuentra lo que parecen 5 edificios distintos.'),
      ),

      React.createElement(View, { style: { ...s.calloutNegro, borderLeftColor: C.rojo } },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '2. Te venden como preventa cuando ya estas terminado'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Brokers publican "Preventa entrega Sept 2025" cuando el edificio ya tiene entrega inmediata con 44% vendido. Espanta al comprador que quiere mudarse ya y atrae al que busca precio bajo de preventa que no encuentra.'),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '3. Tus fotos son renders de un edificio que ya existe'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'El edificio esta terminado pero el comprador ve renders en Google Maps, portales y redes. Fotos reales del equipamiento incluido serian el mejor argumento de venta y nadie las tiene.'),
      ),

      React.createElement(View, { style: { ...s.calloutNegro, borderLeftColor: C.rojo } },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '4. El precio que ve el comprador no es tu precio'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Cada broker publica a un TC distinto. Uno a $1,455/m2, otro a $1,605, otro a $2,252. Condado no tiene forma de corregir esto porque no controla ningun canal propio.'),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, '5. 6 edificios Condado en Equipetrol, cero activos digitales'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'No hay pagina web, no hay Instagram, no hay Google Business Profile verificado. Buscar "Proinco" en Google devuelve empresas de Camerun, Brasil y Espana. La marca tiene equity offline que no se traduce en nada online.'),
      ),

      React.createElement(Footer, { page: 11, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 12: BROKERS (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'CANAL BROKER' }),
      React.createElement(Text, { style: s.sectionTitle }, 'A que brokers llamar'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Ranking basado en datos reales: volumen de listings, edificios que comercializan y ventas cerradas en Eq. Centro.'),

      // TIER 1: Ampliar canal existente
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 6 } }, 'AMPLIAR CANAL EXISTENTE'),
      React.createElement(View, { style: { backgroundColor: '#4a996015', padding: 10, marginBottom: 12 } },
        React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 } }, 'Juan Jose Cruz Garcia - Remax Futuro'),
        React.createElement(Text, { style: { fontSize: 9, color: C.gris } }, '+591 76181883'),
        React.createElement(Text, { style: { fontSize: 9, color: C.verde, fontFamily: 'Helvetica-Bold', marginTop: 4 } }, 'Ya publica Condado VI 3D a $315,225. Agregar 1D y 2D al portafolio.'),
      ),

      // TIER 2: Venden competencia directa
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 6 } }, 'VENDEN COMPETENCIA DIRECTA (prioridad alta)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '28%' } }, 'BROKER'),
          React.createElement(Text, { style: { ...s.th, width: '18%' } }, 'INMOB.'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, 'ACTIV.'),
          React.createElement(Text, { style: { ...s.th, width: '24%' } }, 'VENDE'),
          React.createElement(Text, { style: { ...s.th, width: '20%' } }, 'TELEFONO'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '28%', fontSize: 8 } }, 'Nathalia Tarradelles V.'),
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 8 } }, 'C21 Forza'),
          React.createElement(Text, { style: { ...s.tdBold, width: '10%', textAlign: 'right', fontSize: 8 } }, '10'),
          React.createElement(Text, { style: { ...s.td, width: '24%', fontSize: 7.5 } }, 'T-Veinticinco (2D)'),
          React.createElement(Text, { style: { ...s.td, width: '20%', fontSize: 7.5 } }, '+591 78048846'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '28%', fontSize: 8 } }, 'Paula E. Magarelli P.'),
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 8 } }, 'Remax Magna'),
          React.createElement(Text, { style: { ...s.tdBold, width: '10%', textAlign: 'right', fontSize: 8 } }, '5'),
          React.createElement(Text, { style: { ...s.td, width: '24%', fontSize: 7.5 } }, 'Atrium (2D)'),
          React.createElement(Text, { style: { ...s.td, width: '20%', fontSize: 7.5 } }, '+591 76200694'),
        ),
      ),

      React.createElement(View, { style: { ...s.callout, marginTop: 6, marginBottom: 10 } },
        React.createElement(Text, { style: { ...s.calloutText, fontSize: 8 } }, 'Nathalia tiene 10 listings de T-25 (competidor #1 de Condado en 2D). Paula tiene 4 unidades de Atrium (competidor #2). Ambas conocen el comprador target y pueden posicionar Condado VI como alternativa con linea blanca incluida.'),
      ),

      // TIER 3: Vendedores probados sin producto
      React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 6 } }, 'VENDEDORES PROBADOS SIN PRODUCTO (oportunidad)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '28%' } }, 'BROKER'),
          React.createElement(Text, { style: { ...s.th, width: '18%' } }, 'INMOB.'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, 'VEND.'),
          React.createElement(Text, { style: { ...s.th, width: '24%' } }, 'VENDIO'),
          React.createElement(Text, { style: { ...s.th, width: '20%' } }, 'TELEFONO'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '28%', fontSize: 8 } }, 'Silvia R. Espinoza C.'),
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 8 } }, 'Remax Fortaleza'),
          React.createElement(Text, { style: { ...s.tdBold, width: '10%', textAlign: 'right', fontSize: 8, color: C.verde } }, '7'),
          React.createElement(Text, { style: { ...s.td, width: '24%', fontSize: 7.5 } }, 'Varios Eq. Centro'),
          React.createElement(Text, { style: { ...s.td, width: '20%', fontSize: 7.5 } }, '+591 70967413'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.tdBold, width: '28%', fontSize: 8 } }, 'Henry Vaca Martorell'),
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 8 } }, 'C21 Elite'),
          React.createElement(Text, { style: { ...s.tdBold, width: '10%', textAlign: 'right', fontSize: 8, color: C.verde } }, '6'),
          React.createElement(Text, { style: { ...s.td, width: '24%', fontSize: 7.5 } }, 'Spazios/Spazios Eden'),
          React.createElement(Text, { style: { ...s.td, width: '20%', fontSize: 7.5 } }, '+591 69091740'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.tdBold, width: '28%', fontSize: 8 } }, 'Luis F. Ortiz Paz'),
          React.createElement(Text, { style: { ...s.td, width: '18%', fontSize: 8 } }, 'C21 B&R'),
          React.createElement(Text, { style: { ...s.tdBold, width: '10%', textAlign: 'right', fontSize: 8, color: C.verde } }, '3'),
          React.createElement(Text, { style: { ...s.td, width: '24%', fontSize: 7.5 } }, 'Domus Infinity/Insignia'),
          React.createElement(Text, { style: { ...s.td, width: '20%', fontSize: 7.5 } }, '+591 75026490'),
        ),
      ),

      React.createElement(View, { style: { ...s.callout, marginTop: 6, marginBottom: 10 } },
        React.createElement(Text, { style: { ...s.calloutText, fontSize: 8 } }, 'Silvia cerro 7 ventas y tiene 0 listings activos = necesita producto. Henry vendio 6 Spazios (mismo segmento). Luis vendio 3 Domus (1D competidor directo). Los tres saben cerrar en Eq. Centro.'),
      ),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Nota sobre comisiones'),
        React.createElement(Text, { style: s.calloutText }, 'Si la comision de Condado es menor que la de la competencia, los brokers priorizan otros edificios. La comision es el incentivo #1 del broker. Verificar que sea competitiva (3-5% en Bolivia).'),
      ),

      React.createElement(Footer, { page: 12, total: TOTAL_PAGES, dark: false }),
    ),

    // =============================================
    // PAGE 13: PLAN DE ACCION 90 DIAS (dark)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'PLAN DE ACCION' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Roadmap 90 Dias'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, '3 fases para tomar control de la narrativa y acelerar ventas de Condado VI'),

      React.createElement(NumItem, { num: 1, title: 'MES 1: Tomar control de la narrativa', desc: 'Crear Google Business Profile verificado. Sesion de fotos profesional del edificio terminado (reemplazar renders). Alinear nombre oficial "Condado VI Plaza Italia" con todos los brokers. Unificar precio publicado. Ampliar con J.J. Cruz (1D+2D). Contactar Nathalia Tarradelles (T-25), Paula Magarelli (Atrium), Silvia Espinoza, Henry Vaca.', dark: true }),

      React.createElement(NumItem, { num: 2, title: 'MES 2: Implementar estrategia TC', desc: 'Capacitar equipo de ventas en las 3 opciones de pago (BOB referencial, USD billete, descuento billete). Definir politica de descuento 3-5% para USD billete. Preparar calculadora simple para mostrar al comprador: "Si paga billete con 3% descuento, ambos ganan". Monitorear TC paralelo semanalmente.', dark: true }),

      React.createElement(NumItem, { num: 3, title: 'MES 3: Evaluar y ajustar', desc: 'Revisar metricas: visitas, consultas, cierres. Comparar absorcion pre/post activacion. Si 1D se mueve rapido (esperado), subir precio 2-3%. Si 2D sigue lento, considerar bundle parqueo. Si 3D no se mueve, explorar renta corporativa como alternativa. Ajustar precios de broker si estan desalineados.', dark: true }),

      React.createElement(View, { style: s.dividerBlanco }),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, 'Opciones estrategicas para formas de pago'),
        React.createElement(Bullet, { text: 'RECOMENDADO: 3-5% descuento por USD billete. Win-win: comprador paga menos, Condado recibe mas Bs que cobrando BOB.', dark: true }),
        React.createElement(Bullet, { text: 'PASIVO: Aceptar BOB a TC referencial (8.65). Condado recibe menos. Comprador contento.', dark: true }),
        React.createElement(Bullet, { text: 'RIESGOSO: Precio BOB mas alto (ej. TC 9.00). Puede espantar compradores, pero protege margen.', dark: true }),
        React.createElement(Bullet, { text: 'COMPROMISO: Split 50% USD billete + 50% BOB. Riesgo compartido.', dark: true }),
      ),

      React.createElement(View, { style: { ...s.calloutNegro, borderLeftColor: C.verde } },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold' } }, 'Prioridad inmediata: La fruta al alcance de la mano son los 1D. 4 unidades, absorcion rapida (3.7 meses), yield atractivo (6.1%). Vender los 1D genera caja y momentum para los 2D.'),
      ),

      React.createElement(Footer, { page: 13, total: TOTAL_PAGES, dark: true }),
    ),

    // =============================================
    // PAGE 14: LA PREGUNTA DIFICIL + DISCLAIMER (crema)
    // =============================================
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'CONCLUSION' }),
      React.createElement(Text, { style: s.sectionTitle }, 'La Pregunta Dificil'),
      React.createElement(Text, { style: s.sectionSubtitle }, 'Que recibe el comprador por $2,051/m2 en Condado VI vs en otro edificio?'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '40%' } }, 'CONCEPTO'),
          React.createElement(Text, { style: { ...s.th, width: '30%', textAlign: 'center' } }, 'CONDADO VI'),
          React.createElement(Text, { style: { ...s.th, width: '30%', textAlign: 'center' } }, 'COMPETIDOR ~$2K'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'Entrega'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.verde } }, 'Inmediata'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center', color: C.rojo } }, '1-3 anos preventa'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'Equipamiento (13 items)'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.verde } }, 'Incluido'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center', color: C.rojo } }, 'Comprador paga'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'AC frio/calor todos ambientes'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.verde } }, 'SI'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center', color: C.rojo } }, 'Rara vez'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'Electrodomesticos completos'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.verde } }, 'SI'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center', color: C.rojo } }, 'NO'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'Roperos completos'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.verde } }, 'SI'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center', color: C.rojo } }, 'NO'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'Ubicacion Plaza Italia'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.verde } }, 'SI'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center' } }, 'Variable'),
        ),
        React.createElement(View, { style: s.tableRow },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'Track record desarrollador'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.verde } }, '6 edificios'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center' } }, 'Variable'),
        ),
        React.createElement(View, { style: s.tableRowAlt },
          React.createElement(Text, { style: { ...s.td, width: '40%' } }, 'Ahorro vs equipar por cuenta propia'),
          React.createElement(Text, { style: { ...s.tdBold, width: '30%', textAlign: 'center', color: C.oro } }, '$7,000-8,000'),
          React.createElement(Text, { style: { ...s.td, width: '30%', textAlign: 'center' } }, '$0'),
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'A $2,051/m2 con 13 items de equipamiento incluido, entrega inmediata y ubicacion Plaza Italia, Condado VI es una de las mejores propuestas de valor en Equipetrol Centro. El problema no es el producto. Es que el mercado no lo sabe.'),
      ),

      React.createElement(View, { style: s.divider }),

      React.createElement(View, { style: { backgroundColor: '#00000008', padding: 12, marginBottom: 12 } },
        React.createElement(Text, { style: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', marginBottom: 4, color: C.gris } }, 'DISCLAIMER'),
        React.createElement(Text, { style: { fontSize: 7, lineHeight: 1.4, color: C.grisMedio } }, 'Este informe fue generado por Simon - Inteligencia Inmobiliaria utilizando datos de portales publicos (Century 21 Bolivia, Remax Bolivia), BCB, y Binance P2P. Los datos de inventario de Condado VI fueron proporcionados directamente por Proinco. Los precios de mercado reflejan listings activos en portales y pueden diferir de precios de cierre. Las tasas de absorcion son estimaciones basadas en propiedades que dejaron de estar activas en portales. Este documento es CONFIDENCIAL y solo para uso interno de Proinco / Constructora Condado.'),
      ),

      React.createElement(View, { style: { alignItems: 'center', marginTop: 8 } },
        React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 4 } }, 'Simon - Inteligencia Inmobiliaria'),
        React.createElement(Text, { style: { fontSize: 8, color: C.gris } }, 'simonbo.com | Datos que venden'),
        React.createElement(Text, { style: { fontSize: 8, color: C.gris, marginTop: 2 } }, 'Contacto Condado: mbeatrizbw@gmail.com | Proincoestate@gmail.com'),
        React.createElement(Text, { style: { fontSize: 8, color: C.gris } }, 'Direccion: Calle Hernan Aldava Paz, Equipetrol, Plaza Italia'),
      ),

      React.createElement(Footer, { page: 14, total: TOTAL_PAGES, dark: false }),
    ),

  )
);

// ─── Generate PDF ───
const outDir = path.join(__dirname, '..', 'docs', 'reports');
const outFile = path.join(outDir, 'ASESORIA_CONDADO_VI_PLAZA_ITALIA_2026-02-13_v9.pdf');

const fs = require('fs');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

renderToFile(React.createElement(AsesoriaCondadoVI), outFile)
  .then(() => {
    console.log(`PDF generado: ${outFile}`);
    console.log(`${TOTAL_PAGES} paginas`);
  })
  .catch((err) => {
    console.error('Error generando PDF:', err);
    process.exit(1);
  });
