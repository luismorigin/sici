/**
 * Generador PDF — Informe de Inteligencia Comercial MARE / Mariscal Construcciones
 * Colores: Simon Brand (Negro #0a0a0a, Crema #f8f6f3, Oro #c9a959)
 * Fonts: Helvetica (built-in, similar weight to Manrope)
 *
 * Ejecutar: node scripts/generate-mariscal-report.jsx
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
    React.createElement(Text, { style: dark ? s.footerTextBlanco : s.footerText }, 'Confidencial \u2014 Mariscal Construcciones'),
    React.createElement(Text, { style: s.footerPage }, `${page}`)
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

const MariscalReport = () => (
  React.createElement(Document, {
    title: 'Informe Inteligencia Comercial - Condominio MARE - Mariscal Construcciones',
    author: 'Simon - Inteligencia Inmobiliaria',
    subject: 'Analisis de mercado inmobiliario Equipetrol',
  },

    // ═══════════════════════════════════════════
    // PAGE 1: COVER
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCover },
      React.createElement(View, { style: { alignItems: 'center', flex: 1, justifyContent: 'center' } },
        React.createElement(Text, { style: s.coverLabel }, 'SIMON \u2014 INTELIGENCIA INMOBILIARIA'),
        React.createElement(View, { style: s.coverLine }),
        React.createElement(Text, { style: s.coverTitle }, 'INFORME DE'),
        React.createElement(Text, { style: s.coverTitle }, 'INTELIGENCIA COMERCIAL'),
        React.createElement(View, { style: { height: 12 } }),
        React.createElement(Text, { style: s.coverSubtitle }, 'Condominio MARE'),
        React.createElement(Text, { style: { ...s.coverMeta, fontSize: 12, color: '#ffffffcc' } }, 'Mariscal Construcciones'),
        React.createElement(View, { style: { ...s.coverLine, marginVertical: 30 } }),
        React.createElement(Text, { style: s.coverMeta }, '18 de febrero de 2026'),
        React.createElement(Text, { style: s.coverMeta }, 'Precios en USD (TC oficial Bs 6.96). Fuente TC paralelo: Binance P2P'),
        React.createElement(View, { style: { height: 40 } }),
        React.createElement(Text, { style: { ...s.coverMeta, fontSize: 7 } }, '222 propiedades venta activas \u00b7 95 alquileres \u00b7 Fuentes: Century21 + Remax Bolivia'),
        React.createElement(Text, { style: { ...s.coverMeta, fontSize: 7 } }, 'Precios normalizados a USD (TC oficial Bs 6.96)')
      )
    ),

    // ═══════════════════════════════════════════
    // PAGE 2: EXECUTIVE SUMMARY
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'RESUMEN EJECUTIVO' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'MARE en contexto'),

      // KPI Row 1
      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '7'),
          React.createElement(Text, { style: s.kpiLabel }, 'UDS DISPONIBLES'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '$2,185'),
          React.createElement(Text, { style: s.kpiLabel }, '$/M\u00b2 DIRECTO'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, 'Sirari'),
          React.createElement(Text, { style: s.kpiLabel }, 'UBICACI\u00d3N'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '2D'),
          React.createElement(Text, { style: s.kpiLabel }, 'TIPOLOG\u00cdA EXCLUSIVA'),
        ),
      ),

      // KPI Row 2
      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '222'),
          React.createElement(Text, { style: s.kpiLabel }, 'MERCADO ACTIVAS'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '9.9%'),
          React.createElement(Text, { style: s.kpiLabel }, 'TASA 2D'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '0%'),
          React.createElement(Text, { style: s.kpiLabel }, 'SIRARI\u00d72D PORTALES'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '$184K'),
          React.createElement(Text, { style: s.kpiLabel }, 'TICKET PROMEDIO'),
        ),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      // Key finding 1
      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'MARE compite en el cruce mas exigente: Sirari \u00d7 2 dormitorios.'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'El 2D es la tipologia mas lenta (9.9%, 9.1 meses). Sirari es la zona mas lenta en portales (4.8%, 20 meses). Pero las ventas premium ocurren directo, no en portales.'),
      ),

      // Key finding 2
      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'Precio competitivo en segmento ultra-premium.'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'A $2,185/m2, MARE esta 9% por encima de la mediana 2D ($2,005) pero por debajo de Sky Moon ($3,265), Luxe Suites ($2,996) y Sky Eclipse ($2,553). Mejor relacion amenidades/precio del segmento.'),
      ),

      // Key finding 3
      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'Revendedores inflan el precio de MARE en portales.'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Markup de +3% a +62%. El equipo comercial directo ofrece mejor precio que cualquier portal.'),
      ),

      // Key finding 4
      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'ROI estimado: 5.6% conservador, 7.3% moderado, 8.8% optimista.'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Con renta desde dia 1 a $1,100+/mes, en 18 meses el costo efectivo baja al nivel de la mediana del mercado.'),
      ),

      React.createElement(Footer, { page: 2, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 3: DISCLAIMER + METODOLOGIA
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'ANTES DE LEER' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Sobre este informe'),
      React.createElement(View, { style: s.divider }),

      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 12 } }, 'Qu\u00e9 es y qu\u00e9 no es'),
      React.createElement(Text, { style: s.body }, 'Este informe analiza 222 propiedades activas en venta y 95 alquileres en Equipetrol y zonas aleda\u00f1as. Los datos provienen del scraping automatizado diario de Century21 Bolivia y Remax Bolivia.'),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Limitaciones cr\u00edticas:'),
        React.createElement(Bullet, { text: 'Esto NO es todo el mercado. Solo vemos lo publicado en C21 + Remax. El inventario directo de desarrolladoras NO est\u00e1 en esta base.' }),
        React.createElement(Bullet, { text: '"Absorbida" = desapareci\u00f3 del portal. Puede ser vendida, retirada, expirada o transferida. No es sin\u00f3nimo de venta cerrada.' }),
        React.createElement(Bullet, { text: 'Los precios son de lista (publicados), no precios de cierre real.' }),
        React.createElement(Bullet, { text: 'Las unidades de MARE en esta BD son de revendedores externos, no del equipo comercial de Mariscal.' }),
      ),

      React.createElement(View, { style: s.divider }),
      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 8 } }, 'Normalizaci\u00f3n de precios'),
      React.createElement(Text, { style: s.body }, 'Todas las propiedades en la base de datos estan normalizadas a USD al tipo de cambio oficial (Bs 6.96). Los anuncios publicados "al paralelo" se convierten: precio x TC Binance (9.26) / 6.96. Esto permite comparar todas las propiedades en la misma unidad.'),
      React.createElement(Text, { style: s.body }, 'Los precios del PDF de MARE estan en "dolares paralelo". Para comparar con el mercado, se convierten a USD oficial: precio x TC Binance (9.26) / 6.96 = x1.33. Ejemplo: $150K paralelo = $199K USD oficial.'),

      React.createElement(View, { style: s.divider }),
      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, marginBottom: 8 } }, 'Absorci\u00f3n: datos limpios al 18 Feb 2026'),
      React.createElement(Text, { style: s.body }, 'El sistema de tracking se activ\u00f3 el 12 Feb 2026. Durante la puesta en marcha se identific\u00f3 contaminaci\u00f3n por backlog retroactivo en las m\u00e9tricas de absorci\u00f3n. Al 18 Feb, la absorci\u00f3n de venta ya est\u00e1 limpia (ventana de 30 d\u00edas reales). La absorci\u00f3n de alquiler se limpia el ~14 Mar.'),

      React.createElement(Footer, { page: 3, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 4: PANORAMA GENERAL
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'PARTE 1' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Panorama general del mercado'),

      // KPIs
      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '222'),
          React.createElement(Text, { style: s.kpiLabel }, 'ACTIVAS EN VENTA'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '48'),
          React.createElement(Text, { style: s.kpiLabel }, 'ABSORBIDAS 30D'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '17.8%'),
          React.createElement(Text, { style: s.kpiLabel }, 'TASA ABSORCI\u00d3N'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '4.6'),
          React.createElement(Text, { style: s.kpiLabel }, 'MESES INVENTARIO'),
        ),
      ),

      React.createElement(View, { style: s.kpiRow },
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '$2,071'),
          React.createElement(Text, { style: s.kpiLabel }, 'MEDIANA $/M\u00b2'),
        ),
        React.createElement(View, { style: s.kpiBox },
          React.createElement(Text, { style: s.kpiValue }, '$140K'),
          React.createElement(Text, { style: s.kpiLabel }, 'TICKET MEDIANO'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Con 4.6 meses de inventario. No es "caliente" ni est\u00e1 en crisis \u2014 se mueve a velocidad moderada. A este ritmo, las 222 unidades activas tardar\u00edan ~5 meses en vaciarse si no entrara nuevo inventario.'),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      // Absorcion por tipologia
      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 13 } }, 'Absorci\u00f3n por tipolog\u00eda \u2014 30 d\u00edas limpios'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '20%' } }, 'TIPOLOG\u00cdA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '13%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.thNegro, width: '15%', textAlign: 'right' } }, 'ABSORB. 30D'),
          React.createElement(Text, { style: { ...s.thNegro, width: '13%', textAlign: 'right' } }, 'TASA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '15%', textAlign: 'right' } }, 'MESES INV.'),
          React.createElement(Text, { style: { ...s.thNegro, width: '12%', textAlign: 'right' } }, '$/M\u00b2'),
          React.createElement(Text, { style: { ...s.thNegro, width: '12%', textAlign: 'right' } }, 'TICKET'),
        ),
        // Studio
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%' } }, 'Studio (0d)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '13%', textAlign: 'right' } }, '28'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '15%', textAlign: 'right' } }, '9'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '13%', textAlign: 'right' } }, '24.3%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '15%', textAlign: 'right' } }, '3.1'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%', textAlign: 'right' } }, '$2,228'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%', textAlign: 'right' } }, '$87K'),
        ),
        // 1 dorm
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%' } }, '1 dormitorio'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '13%', textAlign: 'right' } }, '92'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '15%', textAlign: 'right' } }, '26'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '13%', textAlign: 'right' } }, '22.2%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '15%', textAlign: 'right' } }, '3.5'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%', textAlign: 'right' } }, '$2,094'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%', textAlign: 'right' } }, '$106K'),
        ),
        // 2 dorm - HIGHLIGHTED
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '20%' } }, '2 dormitorios'),
          React.createElement(Text, { style: { ...s.tdOro, width: '13%', textAlign: 'right' } }, '82'),
          React.createElement(Text, { style: { ...s.tdOro, width: '15%', textAlign: 'right' } }, '9'),
          React.createElement(Text, { style: { ...s.tdOro, width: '13%', textAlign: 'right' } }, '9.9%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '15%', textAlign: 'right' } }, '9.1'),
          React.createElement(Text, { style: { ...s.tdOro, width: '12%', textAlign: 'right' } }, '$2,005'),
          React.createElement(Text, { style: { ...s.tdOro, width: '12%', textAlign: 'right' } }, '$188K'),
        ),
        // 3 dorm
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '20%' } }, '3 dormitorios'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '13%', textAlign: 'right' } }, '19'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '15%', textAlign: 'right' } }, '4'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '13%', textAlign: 'right' } }, '17.4%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '15%', textAlign: 'right' } }, '4.8'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%', textAlign: 'right' } }, '$1,972'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '12%', textAlign: 'right' } }, '$348K'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold' } }, 'Los 2 dormitorios son la tipolog\u00eda m\u00e1s lenta del mercado por amplio margen.'),
        React.createElement(Text, { style: s.calloutTextBlanco }, '9.9% de absorci\u00f3n vs 17\u201324% de las dem\u00e1s. Con 9.1 meses de inventario, tardan m\u00e1s del doble que studios o 3 dormitorios. MARE ofrece exclusivamente 2 dormitorios.'),
      ),

      React.createElement(Footer, { page: 4, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 5: ABSORCION POR ZONA
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'PARTE 1 (CONT.)' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Absorci\u00f3n por zona'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '25%' } }, 'ZONA'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'ABSORB. 30D'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'TASA'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'MESES INV.'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, '$/M\u00b2 MED.'),
        ),
        ...[
          ['Eq. Centro', '99', '28', '22.0%', '3.5', '$2,071', false],
          ['Villa Br\u00edgida', '36', '12', '25.0%', '3.0', '$1,850', false],
          ['Eq. Norte', '22', '3', '12.0%', '7.3', '$2,200', false],
          ['Eq. Oeste', '25', '3', '10.7%', '8.3', '$1,900', false],
          ['Sirari', '40', '2', '4.8%', '20.0', '$2,071', true],
        ].map(([zona, act, abs, tasa, meses, pm2, highlight], i) =>
          React.createElement(View, { key: i, style: highlight ? s.tableRowHighlight : (i % 2 ? s.tableRowAlt : s.tableRow) },
            React.createElement(Text, { style: highlight ? { ...s.tdBold, width: '25%', color: C.oro } : { ...s.td, width: '25%' } }, zona),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '15%', textAlign: 'right' } : { ...s.td, width: '15%', textAlign: 'right' } }, act),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '15%', textAlign: 'right' } : { ...s.td, width: '15%', textAlign: 'right' } }, abs),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '15%', textAlign: 'right' } : { ...s.td, width: '15%', textAlign: 'right' } }, tasa),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '15%', textAlign: 'right' } : { ...s.td, width: '15%', textAlign: 'right' } }, meses),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '15%', textAlign: 'right' } : { ...s.td, width: '15%', textAlign: 'right' } }, pm2),
          )
        ),
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'Sirari: 20 meses de inventario.'),
        React.createElement(Text, { style: s.calloutText }, 'Solo 2 propiedades se movieron en 30 d\u00edas. Caveat: Sirari es zona donde desarrolladoras venden directo \u2014 es probable que la absorci\u00f3n real sea mayor.'),
      ),

      React.createElement(View, { style: s.divider }),

      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 13 } }, 'El cruce cr\u00edtico: Sirari \u00d7 2 dormitorios'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '35%' } }, 'COMBINACI\u00d3N'),
          React.createElement(Text, { style: { ...s.th, width: '20%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.th, width: '20%', textAlign: 'right' } }, 'ABSORB. 30D'),
          React.createElement(Text, { style: { ...s.th, width: '25%', textAlign: 'right' } }, 'TASA'),
        ),
        ...[
          ['Sirari + 2 dorms', '8', '0', '0.0%', true],
          ['Sirari + 1 dorm', '19', '2', '9.5%', false],
          ['Sirari + 3 dorms', '7', '0', '0.0%', false],
          ['Eq. Centro + 2 dorms', '39', '3', '7.1%', false],
          ['Villa Br\u00edgida + 2 dorms', '14', '4', '22.2%', false],
        ].map(([combo, act, abs, tasa, highlight], i) =>
          React.createElement(View, { key: i, style: highlight ? s.tableRowHighlight : s.tableRow },
            React.createElement(Text, { style: highlight ? { ...s.tdBold, width: '35%', color: C.rojo } : { ...s.td, width: '35%' } }, combo),
            React.createElement(Text, { style: highlight ? { ...s.tdBold, width: '20%', textAlign: 'right', color: C.rojo } : { ...s.td, width: '20%', textAlign: 'right' } }, act),
            React.createElement(Text, { style: highlight ? { ...s.tdBold, width: '20%', textAlign: 'right', color: C.rojo } : { ...s.td, width: '20%', textAlign: 'right' } }, abs),
            React.createElement(Text, { style: highlight ? { ...s.tdBold, width: '25%', textAlign: 'right', color: C.rojo } : { ...s.td, width: '25%', textAlign: 'right' } }, tasa),
          )
        ),
      ),

      React.createElement(View, { style: s.dividerOro }),

      React.createElement(Text, { style: { ...s.sectionTitle, fontSize: 13 } }, 'Estado de entrega \u2014 2 dormitorios'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '30%' } }, 'ESTADO'),
          React.createElement(Text, { style: { ...s.th, width: '17%', textAlign: 'right' } }, 'ACTIVAS'),
          React.createElement(Text, { style: { ...s.th, width: '18%', textAlign: 'right' } }, 'ABSORB. 30D'),
          React.createElement(Text, { style: { ...s.th, width: '15%', textAlign: 'right' } }, 'TASA'),
          React.createElement(Text, { style: { ...s.th, width: '20%', textAlign: 'right' } }, 'NOTA'),
        ),
        React.createElement(View, { style: s.tableRowHighlight },
          React.createElement(Text, { style: { ...s.tdBold, width: '30%' } }, 'Entrega/Existente'),
          React.createElement(Text, { style: { ...s.tdBold, width: '17%', textAlign: 'right' } }, '82'),
          React.createElement(Text, { style: { ...s.tdBold, width: '18%', textAlign: 'right' } }, '9'),
          React.createElement(Text, { style: { ...s.tdBold, width: '15%', textAlign: 'right' } }, '9.9%'),
          React.createElement(Text, { style: { ...s.tdBold, width: '20%', textAlign: 'right' } }, '\u2014 base \u2014'),
        ),
      ),

      React.createElement(Text, { style: { ...s.body, fontSize: 8, fontStyle: 'italic', marginTop: 4 } }, 'No hay unidades 2D de preventa en el mercado visible con filtros de calidad.'),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'El mercado de 2 dormitorios est\u00e1 dominado por stock existente.'),
        React.createElement(Text, { style: s.calloutText }, 'MARE compite en este segmento con la ventaja de ser producto reciente con amenidades premium.'),
      ),

      React.createElement(Footer, { page: 5, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 6: MARE EN EL MERCADO
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'PARTE 2' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'MARE en el mercado'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Precio de la desarrolladora vs revendedores vs mercado'),

      React.createElement(View, { style: s.dividerBlanco }),

      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Disponibilidad directa \u2014 PDF Mariscal (7 unidades 2 dorms)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '14%' } }, 'TIPO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '10%', textAlign: 'right' } }, 'PISO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, '\u00c1REA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'PRECIO PDF'),
          React.createElement(Text, { style: { ...s.thNegro, width: '22%', textAlign: 'right' } }, 'PRECIO USD OFICIAL'),
          React.createElement(Text, { style: { ...s.thNegro, width: '22%', textAlign: 'right' } }, '$/M\u00b2 REAL'),
        ),
        ...[
          ['Tipo 3', 'P5', '73.08m\u00b2', '$119,038', '$158,367', '$2,167'],
          ['Tipo 12', 'P5', '83.37m\u00b2', '$135,799', '$180,670', '$2,168'],
          ['Tipo 12', 'P10', '83.19m\u00b2', '$135,505', '$180,279', '$2,167'],
          ['Tipo 6', 'P7', '84.96m\u00b2', '$138,388', '$184,115', '$2,168'],
          ['Tipo 12', 'P22', '83.31m\u00b2', '$141,713', '$188,539', '$2,264'],
          ['Tipo 4', 'P8', '86.76m\u00b2', '$143,109', '$190,396', '$2,194'],
          ['Tipo 2', 'P12', '137.41m\u00b2', '$226,656', '$301,582', '$2,195'],
        ].map(([tipo, piso, area, pPdf, pReal, m2], i) =>
          React.createElement(View, { key: i, style: s.tableRowNegro },
            React.createElement(Text, { style: { ...s.tdNegro, width: '14%' } }, tipo),
            React.createElement(Text, { style: { ...s.tdNegro, width: '10%', textAlign: 'right' } }, piso),
            React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, area),
            React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, pPdf),
            React.createElement(Text, { style: { ...s.tdOro, width: '22%', textAlign: 'right' } }, pReal),
            React.createElement(Text, { style: { ...s.tdOro, width: '22%', textAlign: 'right' } }, m2),
          )
        ),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Markup del revendedor'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '40%' } }, 'CANAL'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, '$/M\u00b2'),
          React.createElement(Text, { style: { ...s.thNegro, width: '35%', textAlign: 'right' } }, 'VS DESARROLLADORA'),
        ),
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '40%' } }, 'Mariscal directo (PDF)'),
          React.createElement(Text, { style: { ...s.tdOro, width: '25%', textAlign: 'right' } }, '$2,185'),
          React.createElement(Text, { style: { ...s.tdOro, width: '35%', textAlign: 'right' } }, '\u2014 base \u2014'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, 'C21 (ID 175, 2d 142m\u00b2)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$2,253'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%', textAlign: 'right' } }, '+3%'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, 'C21 (studio, 43m\u00b2)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$2,513'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%', textAlign: 'right', color: C.rojo } }, '+15%'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '40%' } }, 'C21 (ID 158, 1d 70m\u00b2)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '25%', textAlign: 'right' } }, '$3,535'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '35%', textAlign: 'right', color: C.rojo } }, '+62%'),
        ),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'MARE vs mercado de 2 dormitorios'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '45%' } }, 'REFERENCIA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '25%', textAlign: 'right' } }, '$/M\u00b2'),
          React.createElement(Text, { style: { ...s.thNegro, width: '30%', textAlign: 'right' } }, 'VS MARE'),
        ),
        ...[
          ['MARE desarrolladora', '$2,185', '\u2014 base \u2014', true],
          ['Mediana mercado 2d', '$2,005', 'MARE +9%', false],
          ['Mediana Sirari 2d', '$1,948', 'MARE +12%', false],
          ['Mediana Eq. Norte 2d', '$2,337', 'MARE \u22127%', false],
        ].map(([ref, m2, vs, highlight], i) =>
          React.createElement(View, { key: i, style: highlight ? { ...s.tableRowNegro, backgroundColor: '#c9a95920' } : s.tableRowNegro },
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '45%' } : { ...s.tdNegro, width: '45%' } }, ref),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '25%', textAlign: 'right' } : { ...s.tdNegro, width: '25%', textAlign: 'right' } }, m2),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '30%', textAlign: 'right' } : { ...s.tdNegro, width: '30%', textAlign: 'right' } }, vs),
          )
        ),
      ),

      React.createElement(Footer, { page: 6, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 7: COMPETIDORES ULTRA-PREMIUM
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'PARTE 3' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Competidores ultra-premium (\u2265$2,000/m\u00b2, 2 dorms)'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: '24%' } }, 'EDIFICIO'),
          React.createElement(Text, { style: { ...s.th, width: '18%' } }, 'ZONA'),
          React.createElement(Text, { style: { ...s.th, width: '14%', textAlign: 'right' } }, '$/M\u00b2'),
          React.createElement(Text, { style: { ...s.th, width: '10%', textAlign: 'right' } }, 'ACT.'),
          React.createElement(Text, { style: { ...s.th, width: '17%' } }, 'ESTADO'),
          React.createElement(Text, { style: { ...s.th, width: '17%', textAlign: 'right' } }, 'ABS. 30D'),
        ),
        ...[
          ['Sky Moon', 'Eq. Norte', '$3,265', '2', 'Entrega', '0', false],
          ['Sky Lux', 'Eq. Norte', '$3,218', '1', 'No espec.', '0', false],
          ['Luxe Tower', 'Eq. Centro', '$3,014', '1', 'Preventa', '0', false],
          ['Luxe Suites', 'Eq. Centro', '$2,996', '2', 'Preventa', '0', false],
          ['Uptown NUU', 'Eq. Centro', '$2,810', '1', 'Entrega', '0', false],
          ['Sirari Palm', 'Sirari', '$2,695', '1', 'Entrega', '0', false],
          ['Sky Eclipse', 'Eq. Oeste', '$2,553', '4', 'No espec.', '0', false],
          ['Las Dalias', 'Sirari', '$2,514', '1', 'Preventa', '0', false],
          ['MonteBelluna', 'V. Br\u00edgida', '$2,475', '1', 'No espec.', '0', false],
          ['Domus Infinity', 'Eq. Centro', '$2,463', '1', 'Preventa', '0', false],
          ['Eurodesign Le Blanc', 'Eq. Norte', '$2,381', '3', 'Preventa', '0', false],
          ['MARE (brokers)', 'Sirari', '$2,253', '1', 'Preventa', '0', true],
          ['MARE (directa)', 'Sirari', '$2,185', '7 uds', 'Entrega*', '?', true],
          ['La Foret', 'Eq. Centro', '$2,184', '1', 'Entrega', '0', false],
          ['Sky Level', 'Eq. Centro', '$2,055', '2', 'Preventa', '0', false],
          ['OMNIA PRIME', 'Sirari', '$2,031', '1', 'No espec.', '0', false],
          ['Platinum II', 'V. Br\u00edgida', '$2,006', '2', 'Nuevo', '0', false],
        ].map(([ed, zona, m2, act, estado, abs30, highlight], i) =>
          React.createElement(View, { key: i, style: highlight ? s.tableRowHighlight : (i % 2 ? s.tableRowAlt : s.tableRow) },
            React.createElement(Text, { style: highlight ? { ...s.tdBold, width: '24%', color: C.oro } : { ...s.td, width: '24%' } }, ed),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '18%' } : { ...s.td, width: '18%' } }, zona),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '14%', textAlign: 'right' } : { ...s.td, width: '14%', textAlign: 'right' } }, m2),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '10%', textAlign: 'right' } : { ...s.td, width: '10%', textAlign: 'right' } }, act),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '17%' } : { ...s.td, width: '17%' } }, estado),
            React.createElement(Text, { style: highlight ? { ...s.tdOro, width: '17%', textAlign: 'right' } : { ...s.td, width: '17%', textAlign: 'right' } }, abs30),
          )
        ),
      ),

      React.createElement(Text, { style: { ...s.body, fontSize: 7, fontStyle: 'italic' } }, '*En BD figura como preventa, pero edificio en retoques finales seg\u00fan broker'),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'De 17 edificios ultra-premium, ninguno registr\u00f3 absorci\u00f3n en portales en 30 d\u00edas.'),
        React.createElement(Text, { style: s.calloutText }, 'Esto sugiere que el segmento se vende directo (desarrolladoras, no portales), que es genuinamente lento, o ambas cosas. MARE es el proyecto con m\u00e1s unidades disponibles al segundo menor precio del top tier.'),
      ),

      React.createElement(Footer, { page: 7, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 8: RENTA Y ROI
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'PARTE 4' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Renta y retorno de inversi\u00f3n'),

      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Mercado de alquiler por tipolog\u00eda'),
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '25%' } }, 'TIPOLOG\u00cdA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '15%', textAlign: 'right' } }, 'UNIDADES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'MEDIANA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'P75'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'MEDIA'),
        ),
        ...[
          ['Studio', '13', '$503', '$546', '$539'],
          ['1 dorm', '44', '$546', '$691', '$598'],
          ['2 dorm', '31', '$862', '$1,214', '$984'],
          ['3 dorm', '5', '$1,652', '$1,798', '$1,494'],
        ].map(([tip, n, med, p75, avg], i) =>
          React.createElement(View, { key: i, style: i === 2 ? { ...s.tableRowNegro, backgroundColor: '#c9a95920' } : s.tableRowNegro },
            React.createElement(Text, { style: i === 2 ? { ...s.tdOro, width: '25%' } : { ...s.tdNegro, width: '25%' } }, tip),
            React.createElement(Text, { style: i === 2 ? { ...s.tdOro, width: '15%', textAlign: 'right' } : { ...s.tdNegro, width: '15%', textAlign: 'right' } }, n),
            React.createElement(Text, { style: i === 2 ? { ...s.tdOro, width: '20%', textAlign: 'right' } : { ...s.tdNegro, width: '20%', textAlign: 'right' } }, med),
            React.createElement(Text, { style: i === 2 ? { ...s.tdOro, width: '20%', textAlign: 'right' } : { ...s.tdNegro, width: '20%', textAlign: 'right' } }, p75),
            React.createElement(Text, { style: i === 2 ? { ...s.tdOro, width: '20%', textAlign: 'right' } : { ...s.tdNegro, width: '20%', textAlign: 'right' } }, avg),
          )
        ),
      ),

      React.createElement(View, { style: s.dividerBlanco }),

      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Yield bruto del mercado'),
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '25%' } }, 'TIPOLOG\u00cdA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'TICKET VENTA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'RENTA ANUAL'),
          React.createElement(Text, { style: { ...s.thNegro, width: '15%', textAlign: 'right' } }, 'YIELD'),
          React.createElement(Text, { style: { ...s.thNegro, width: '20%', textAlign: 'right' } }, 'A\u00d1OS RET.'),
        ),
        ...[
          ['Studio', '$87K', '$6,036', '6.9%', '14.4'],
          ['1 dorm', '$106K', '$6,552', '6.2%', '16.2'],
          ['2 dorm', '$188K', '$10,344', '5.5%', '18.2'],
          ['3 dorm', '$348K', '$19,824', '5.7%', '17.6'],
        ].map(([tip, ticket, renta, yld, anos], i) =>
          React.createElement(View, { key: i, style: s.tableRowNegro },
            React.createElement(Text, { style: { ...s.tdNegro, width: '25%' } }, tip),
            React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, ticket),
            React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, renta),
            React.createElement(Text, { style: { ...s.tdNegro, width: '15%', textAlign: 'right' } }, yld),
            React.createElement(Text, { style: { ...s.tdNegro, width: '20%', textAlign: 'right' } }, anos),
          )
        ),
      ),

      React.createElement(View, { style: s.dividerOro }),

      React.createElement(Text, { style: { ...s.sectionTitleBlanco, fontSize: 12 } }, 'Yield estimado de MARE (2 dormitorios)'),
      React.createElement(Text, { style: { ...s.bodyBlanco, fontStyle: 'italic', marginBottom: 8 } }, 'Basado en 2 alquileres reales de MARE: studio +6% vs mercado, 1 dorm +57% vs mercado'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '22%' } }, 'ESCENARIO'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'RENTA/MES'),
          React.createElement(Text, { style: { ...s.thNegro, width: '18%', textAlign: 'right' } }, 'RENTA/A\u00d1O'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'TICKET'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'YIELD'),
          React.createElement(Text, { style: { ...s.thNegro, width: '14%', textAlign: 'right' } }, 'A\u00d1OS'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Conservador'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '$862'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '$10,344'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$184K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '5.6%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '17.8'),
        ),
        React.createElement(View, { style: { ...s.tableRowNegro, backgroundColor: '#c9a95920' } },
          React.createElement(Text, { style: { ...s.tdOro, width: '22%' } }, 'Moderado (+30%)'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '$1,120'),
          React.createElement(Text, { style: { ...s.tdOro, width: '18%', textAlign: 'right' } }, '$13,440'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '$184K'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '7.3%'),
          React.createElement(Text, { style: { ...s.tdOro, width: '14%', textAlign: 'right' } }, '13.7'),
        ),
        React.createElement(View, { style: s.tableRowNegro },
          React.createElement(Text, { style: { ...s.tdNegro, width: '22%' } }, 'Optimista (+57%)'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '$1,353'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '18%', textAlign: 'right' } }, '$16,236'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '$184K'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '8.8%'),
          React.createElement(Text, { style: { ...s.tdNegro, width: '14%', textAlign: 'right' } }, '11.3'),
        ),
      ),

      React.createElement(View, { style: s.calloutNegro },
        React.createElement(Text, { style: { ...s.calloutTextBlanco, fontFamily: 'Helvetica-Bold' } }, 'Ventaja de renta inmediata'),
        React.createElement(Text, { style: s.calloutTextBlanco }, 'Con 18 meses de alquiler a $1,120/mes, el inversionista acumula ~$20,160. El costo efectivo baja de $184K a $164K \u2192 $/m\u00b2 efectivo de ~$1,950 \u2014 al nivel de la mediana del mercado.'),
      ),

      React.createElement(Footer, { page: 8, dark: true }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 9: CONCLUSIONES
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCrema },
      React.createElement(SectionLabel, { text: 'PARTE 5' }),
      React.createElement(Text, { style: s.sectionTitle }, 'Conclusiones y recomendaciones'),

      React.createElement(View, { style: s.divider }),

      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, fontSize: 11, marginBottom: 10 } }, 'Lo que los datos dicen con confianza'),

      React.createElement(Bullet, { text: '2 dormitorios es la tipolog\u00eda m\u00e1s lenta del mercado (9.9%, 9.1 meses inventario). Dato duro de 30 d\u00edas limpios.' }),
      React.createElement(Bullet, { text: 'Sirari es la zona m\u00e1s lenta en portales (4.8%, 20 meses). Caveat: no sabemos cu\u00e1nto se vende directo.' }),
      React.createElement(Bullet, { text: 'El mercado de 2 dormitorios est\u00e1 dominado por stock existente. MARE compite con producto reciente y amenidades premium.' }),
      React.createElement(Bullet, { text: 'MARE tiene el mayor paquete de amenidades del segmento ultra-premium al segundo precio m\u00e1s bajo ($2,185/m\u00b2).' }),
      React.createElement(Bullet, { text: 'Todo el segmento ultra-premium de 2 dorms est\u00e1 congelado en portales \u2014 0 absorciones en 30 d\u00edas de 17 edificios.' }),
      React.createElement(Bullet, { text: 'Las rentas de MARE ya muestran premium (+6% studios, +57% 1 dorm vs mercado). Prometedor con 2 datapoints.' }),
      React.createElement(Bullet, { text: 'Los revendedores distorsionan el precio de MARE en portales (markup de 3% a 62%).' }),

      React.createElement(View, { style: s.dividerOro }),

      React.createElement(Text, { style: { ...s.body, fontFamily: 'Helvetica-Bold', color: C.negro, fontSize: 11, marginBottom: 10 } }, 'Argumentos para el equipo comercial'),

      React.createElement(View, { style: { ...s.callout, marginBottom: 8 } },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'Argumento #1 \u2014 Producto reciente con amenidades premium'),
        React.createElement(Text, { style: s.calloutText }, '"MARE es producto fresco en un mercado de 2 dormitorios dominado por stock existente. Con el mayor paquete de amenidades del segmento premium, se diferencia de la competencia."'),
      ),

      React.createElement(View, { style: { ...s.callout, marginBottom: 8 } },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'Argumento #2 \u2014 Mejor relaci\u00f3n valor/precio'),
        React.createElement(Text, { style: s.calloutText }, '"MARE ofrece amenidades premium a $2,185/m\u00b2. Sky Moon cobra $3,265. Luxe Suites cobra $2,996. MARE entrega m\u00e1s por menos."'),
      ),

      React.createElement(View, { style: { ...s.callout, marginBottom: 8 } },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold', color: C.oro } }, 'Argumento #3 \u2014 Para el inversionista'),
        React.createElement(Text, { style: s.calloutText }, '"Con renta estimada de $1,100+/mes, MARE genera retorno desde el d\u00eda 1. En 18 meses de renta, el costo efectivo baja al nivel de la mediana del mercado."'),
      ),

      React.createElement(View, { style: s.divider }),

      React.createElement(View, { style: s.alertRojo },
        React.createElement(Text, { style: { ...s.calloutText, fontFamily: 'Helvetica-Bold' } }, 'Precauci\u00f3n honesta'),
        React.createElement(Text, { style: s.calloutText }, 'La combinaci\u00f3n Sirari + 2 dormitorios es la celda m\u00e1s lenta del mercado visible (0% absorci\u00f3n, 8 activas). Si la venta directa de Mariscal tambi\u00e9n est\u00e1 lenta, considerar incentivos, planes de pago agresivos, o paquetes con renta garantizada.'),
      ),

      React.createElement(Footer, { page: 9, dark: false }),
    ),

    // ═══════════════════════════════════════════
    // PAGE 10: DATOS PENDIENTES + CIERRE
    // ═══════════════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageNegro },
      React.createElement(SectionLabel, { text: 'SIGUIENTE PASO' }),
      React.createElement(Text, { style: s.sectionTitleBlanco }, 'Lo que no sabemos'),
      React.createElement(Text, { style: s.sectionSubtitleBlanco }, 'Datos que Mariscal puede aportar para completar el an\u00e1lisis'),

      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderNegro },
          React.createElement(Text, { style: { ...s.thNegro, width: '35%' } }, 'PREGUNTA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '35%' } }, 'POR QU\u00c9 IMPORTA'),
          React.createElement(Text, { style: { ...s.thNegro, width: '30%' } }, 'QUI\u00c9N TIENE LA RESP.'),
        ),
        ...[
          ['Unidades totales de MARE', 'Calcular % vendido real', 'Mariscal'],
          ['Unidades vendidas directo', 'Saber si Sirari se mueve fuera de portales', 'Mariscal'],
          ['Velocidad venta mensual', 'Contrastar vs 0% de portales', 'Mariscal'],
          ['Precio cierre real', 'Saber si hay descuentos vs lista', 'Mariscal'],
          ['% inversionistas vs usuario final', 'Calibrar argumento de renta', 'Mariscal'],
          ['Renta real de 2 dorms MARE', 'Solo tenemos 0d y 1d', 'Propietarios'],
        ].map(([preg, imp, quien], i) =>
          React.createElement(View, { key: i, style: s.tableRowNegro },
            React.createElement(Text, { style: { ...s.tdNegro, width: '35%', fontFamily: 'Helvetica-Bold' } }, preg),
            React.createElement(Text, { style: { ...s.tdNegro, width: '35%' } }, imp),
            React.createElement(Text, { style: { ...s.tdOro, width: '30%' } }, quien),
          )
        ),
      ),

      React.createElement(View, { style: { ...s.dividerOro, marginVertical: 30 } }),

      React.createElement(View, { style: { alignItems: 'center', marginTop: 20 } },
        React.createElement(Text, { style: { ...s.coverLabel, marginBottom: 16 } }, 'SIMON \u2014 INTELIGENCIA INMOBILIARIA'),
        React.createElement(Text, { style: { color: '#ffffff99', fontSize: 9, textAlign: 'center', lineHeight: 1.6 } }, '222 propiedades venta \u00b7 95 alquileres \u00b7 Century21 + Remax Bolivia'),
        React.createElement(Text, { style: { color: '#ffffff99', fontSize: 9, textAlign: 'center', lineHeight: 1.6 } }, 'Precios en USD (TC oficial Bs 6.96)'),
        React.createElement(Text, { style: { color: '#ffffff99', fontSize: 9, textAlign: 'center', lineHeight: 1.6 } }, 'Absorci\u00f3n calculada con ventana limpia de 30 d\u00edas al 18 Feb 2026'),
        React.createElement(View, { style: { height: 20 } }),
        React.createElement(Text, { style: { color: '#ffffff50', fontSize: 8, textAlign: 'center' } }, 'simonbo.com'),
        React.createElement(Text, { style: { color: '#ffffff30', fontSize: 7, textAlign: 'center', marginTop: 8 } }, 'Documento confidencial \u2014 Preparado para Mariscal Construcciones'),
      ),

      React.createElement(Footer, { page: 10, dark: true }),
    ),
  )
);

// ─── Generate ───
async function generate() {
  console.log('Generando PDF...');
  const doc = React.createElement(MariscalReport);

  const outputDir = path.resolve(__dirname, '..', '..', 'docs', 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'INFORME_MARE_MARISCAL_2026-02-18_v2.pdf');
  await renderToFile(doc, outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`PDF generado: ${outputPath}`);
  console.log(`Tama\u00f1o: ${(stats.size / 1024).toFixed(1)} KB`);
}

generate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
