/**
 * Generador PDF — Informe Inversion 1D/Monoambiente para Guisela
 * Version 3.0 — Rediseno visual premium (crema/oro/azul)
 * Diseno tipo consultoria: cards, barras yield, badges estado
 *
 * Ejecutar: node scripts/generate-inversion-guisela.jsx
 */

const React = require('react');
const { Document, Page, Text, View, Link, StyleSheet, renderToFile } = require('@react-pdf/renderer');
const path = require('path');

// ─── Brand ───
const C = {
  negro: '#0a0a0a',
  crema: '#f8f6f3',
  oro: '#c9a959',
  oroClaro: '#faf5eb',
  oroBorde: '#d4b76a',
  blanco: '#ffffff',
  gris50: '#f9f9f9',
  gris100: '#f0f0f0',
  gris200: '#e5e5e5',
  gris300: '#cccccc',
  gris500: '#888888',
  gris700: '#555555',
  gris900: '#222222',
  azul: '#3a7ca5',
  azulOscuro: '#1e3a5f',
  azulPalido: '#eef4f8',
  verde: '#2d8a4e',
  verdePalido: '#e8f5ee',
  naranja: '#d4772c',
  naranjaPalido: '#fef3e8',
};

// ─── Styles ───
const s = StyleSheet.create({
  // Pages
  pageCover: {
    backgroundColor: C.crema,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  page: {
    backgroundColor: C.blanco,
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: C.gris900,
  },

  // Cover
  coverBarLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: C.oro,
  },
  coverContent: {
    paddingLeft: 48,
    paddingRight: 48,
    alignItems: 'flex-start',
    width: '100%',
    flex: 1,
    justifyContent: 'center',
  },
  coverLabel: {
    color: C.oro,
    fontSize: 8,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  coverTitle: {
    color: C.negro,
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  coverSubtitle: {
    color: C.oro,
    fontSize: 15,
    marginBottom: 20,
  },
  coverLine: {
    width: 80,
    height: 2,
    backgroundColor: C.oro,
    marginBottom: 20,
  },
  coverMeta: {
    color: C.gris700,
    fontSize: 10,
    marginBottom: 4,
  },

  // Typography
  h1: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.gris900, marginBottom: 4 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.gris900, marginBottom: 6 },
  label: { color: C.oro, fontSize: 7, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  body: { fontSize: 9, lineHeight: 1.6, color: C.gris700, marginBottom: 6 },
  caption: { fontSize: 7.5, color: C.gris500, lineHeight: 1.4 },
  small: { fontSize: 7, color: C.gris500 },

  // Layout
  row: { flexDirection: 'row' },
  divider: { height: 1, backgroundColor: C.gris100, marginVertical: 12 },
  dividerOro: { height: 1, backgroundColor: C.oro, marginVertical: 12, opacity: 0.3 },
  spacer: { height: 10 },
  spacerSm: { height: 6 },

  // Tables
  tableHeader: { flexDirection: 'row', backgroundColor: C.azulOscuro, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 3 },
  tableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.gris100 },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: C.gris50, borderBottomWidth: 0.5, borderBottomColor: C.gris100 },
  tableRowHL: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#c9a95912', borderBottomWidth: 0.5, borderBottomColor: '#c9a95930' },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.blanco, textTransform: 'uppercase', letterSpacing: 1 },
  td: { fontSize: 8, color: C.gris900 },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.gris900 },
  tdOro: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.oro },

  // Callout
  callout: { backgroundColor: C.gris50, borderLeftWidth: 3, borderLeftColor: C.oro, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, borderRadius: 4 },
  calloutTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.gris900, marginBottom: 3 },
  calloutBody: { fontSize: 8.5, lineHeight: 1.5, color: C.gris700 },

  // Note
  note: { backgroundColor: C.oroClaro, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12, borderRadius: 4, borderWidth: 0.5, borderColor: C.oroBorde },
  noteText: { fontSize: 8, color: C.gris700, lineHeight: 1.5 },

  // Links
  link: { color: C.azul, textDecoration: 'underline', fontSize: 8 },

  // Footer
  footer: { position: 'absolute', bottom: 18, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 7, color: C.gris300 },
  footerBrand: { fontSize: 7, color: C.gris300, letterSpacing: 1 },
});

// ─── Reusable Components ───

const Footer = ({ page }) => (
  React.createElement(View, { style: s.footer, fixed: true },
    React.createElement(Text, { style: s.footerBrand }, 'SIMON'),
    React.createElement(Text, { style: s.footerText }, page ? `${page}` : '')
  )
);

const WaLink = ({ phone, name }) => {
  const clean = phone.replace(/[^0-9]/g, '');
  return React.createElement(Link, { src: `https://wa.me/${clean}`, style: s.link }, `${name} — WhatsApp`);
};

const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

// ── Badge section pill ──
const SectionBadge = ({ text, color, bgColor }) => (
  React.createElement(View, {
    style: {
      backgroundColor: bgColor,
      borderRadius: 10,
      paddingVertical: 3,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
      marginBottom: 8,
    }
  },
    React.createElement(Text, {
      style: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: color, letterSpacing: 1.5, textTransform: 'uppercase' }
    }, text)
  )
);

// ── Yield Bar ──
const YieldBar = ({ value, maxValue, color }) => {
  // value is the yield number (e.g. 9 for 9%)
  const pct = Math.min((value / maxValue) * 100, 100);
  return React.createElement(View, {
    style: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 2 }
  },
    React.createElement(View, {
      style: { width: 80, height: 7, backgroundColor: C.gris200, borderRadius: 3, overflow: 'hidden' }
    },
      React.createElement(View, {
        style: { width: `${pct}%`, height: 7, backgroundColor: color, borderRadius: 3 }
      })
    ),
    React.createElement(Text, {
      style: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: color, marginLeft: 6 }
    }, `${value}%`)
  );
};

// ── Status Badge ──
const StatusBadge = ({ estado }) => {
  let label, bgColor, textColor;
  if (estado.toLowerCase().includes('preventa')) {
    label = 'PREVENTA';
    bgColor = C.naranjaPalido;
    textColor = C.naranja;
  } else if (estado.toLowerCase().includes('negociable') || estado.toLowerCase().includes('120 dias')) {
    label = 'NEGOCIABLE';
    bgColor = C.azulPalido;
    textColor = C.azul;
  } else {
    label = 'LISTO';
    bgColor = C.verdePalido;
    textColor = C.verde;
  }
  return React.createElement(View, {
    style: { backgroundColor: bgColor, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 }
  },
    React.createElement(Text, {
      style: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: textColor, letterSpacing: 0.5 }
    }, label)
  );
};

// ── Price Badge ──
const PriceBadge = ({ precio }) => (
  React.createElement(View, {
    style: { backgroundColor: C.oroClaro, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8 }
  },
    React.createElement(Text, {
      style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.oro }
    }, `$${fmt(precio)}`)
  )
);

// ── Number Circle ──
const NumberCircle = ({ num, color }) => (
  React.createElement(View, {
    style: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: color,
      justifyContent: 'center',
      alignItems: 'center',
    }
  },
    React.createElement(Text, {
      style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.blanco }
    }, `${num}`)
  )
);

// ── Property Card v2 ──
const PropertyCardV2 = ({ num, edificio, zona, m2, precio, precioM2, retorno, estado, agente, telefono, url, id, nota, tcNota, accentColor }) => {
  // Parse yield number from retorno string (e.g. "~9% anual" → 9)
  const yieldNum = parseFloat(retorno.replace(/[^0-9.]/g, ''));
  return React.createElement(View, {
    style: {
      marginBottom: 9,
      borderLeftWidth: 4,
      borderLeftColor: accentColor,
      backgroundColor: C.blanco,
      borderWidth: 0.5,
      borderColor: C.gris200,
      borderRadius: 6,
      overflow: 'hidden',
    }
  },
    // Header row
    React.createElement(View, {
      style: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 4,
      }
    },
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
        React.createElement(NumberCircle, { num, color: accentColor }),
        React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.gris900 } }, edificio)
      ),
      React.createElement(PriceBadge, { precio })
    ),
    // Meta row
    React.createElement(View, {
      style: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 4, gap: 6 }
    },
      React.createElement(Text, {
        style: { fontSize: 8, color: C.gris500 }
      }, `${zona}  ·  ${m2}m\u00B2  ·  $${fmt(precioM2)}/m\u00B2`),
      React.createElement(StatusBadge, { estado })
    ),
    // TC note
    tcNota
      ? React.createElement(Text, {
          style: { fontSize: 7, color: C.oro, paddingHorizontal: 12, marginBottom: 2 }
        }, `\u26A0 ${tcNota}`)
      : null,
    // Body
    React.createElement(View, { style: { paddingHorizontal: 12, paddingBottom: 8 } },
      // Yield bar
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 } },
        React.createElement(Text, { style: { fontSize: 8, color: C.gris500, width: 68 } }, 'Retorno est.'),
        React.createElement(YieldBar, { value: yieldNum, maxValue: 10, color: accentColor })
      ),
      // Contact
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 } },
        React.createElement(Text, { style: { fontSize: 8, color: C.gris500, width: 68 } }, 'Contacto'),
        telefono
          ? React.createElement(WaLink, { phone: telefono, name: agente })
          : React.createElement(Text, { style: { fontSize: 8, color: C.gris900, fontFamily: 'Helvetica-Bold' } }, agente || 'Sin contacto')
      ),
      // Link
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 } },
        React.createElement(Text, { style: { fontSize: 8, color: C.gris500, width: 68 } }, 'Publicacion'),
        React.createElement(Link, { src: url, style: s.link }, 'Ver propiedad')
      ),
      // Nota
      nota
        ? React.createElement(Text, {
            style: { fontSize: 7.5, color: C.gris500, fontFamily: 'Helvetica-Oblique', marginTop: 4, lineHeight: 1.4 }
          }, nota)
        : null
    )
  );
};

// ── KPI Box ──
const KpiBox = ({ value, label, bgColor, textColor, labelColor, borderColor }) => {
  const boxStyle = {
    flex: 1,
    backgroundColor: bgColor,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderRadius: 8,
  };
  if (borderColor) {
    boxStyle.borderWidth = 1;
    boxStyle.borderColor = borderColor;
  }
  return React.createElement(View, { style: boxStyle },
    React.createElement(Text, {
      style: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: textColor, marginBottom: 3 }
    }, value),
    React.createElement(Text, {
      style: { fontSize: 6.5, color: labelColor, textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' }
    }, label)
  );
};

// ── Metric Bar (comparativo) ──
const MetricBar = ({ label, sencillo, premium, sencilloWidth, premiumWidth }) => (
  React.createElement(View, { style: { marginBottom: 8 } },
    React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.gris900, marginBottom: 3 } }, label),
    React.createElement(View, { style: { flexDirection: 'row', gap: 6 } },
      // Sencillo bar
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(View, { style: { height: 14, backgroundColor: C.gris100, borderRadius: 3, overflow: 'hidden' } },
          React.createElement(View, { style: { width: `${sencilloWidth}%`, height: 14, backgroundColor: C.azul, borderRadius: 3, justifyContent: 'center', paddingLeft: 4 } },
            React.createElement(Text, { style: { fontSize: 6.5, color: C.blanco, fontFamily: 'Helvetica-Bold' } }, sencillo)
          )
        )
      ),
      // Premium bar
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(View, { style: { height: 14, backgroundColor: C.gris100, borderRadius: 3, overflow: 'hidden' } },
          React.createElement(View, { style: { width: `${premiumWidth}%`, height: 14, backgroundColor: C.oro, borderRadius: 3, justifyContent: 'center', paddingLeft: 4 } },
            React.createElement(Text, { style: { fontSize: 6.5, color: C.blanco, fontFamily: 'Helvetica-Bold' } }, premium)
          )
        )
      )
    )
  )
);

// ── Reco Card ──
const RecoCard = ({ icon, titulo, precio, razon, borderColor }) => (
  React.createElement(View, {
    style: {
      flex: 1,
      backgroundColor: C.gris50,
      borderRadius: 6,
      padding: 10,
      borderLeftWidth: 3,
      borderLeftColor: borderColor,
    }
  },
    React.createElement(Text, { style: { fontSize: 8, marginBottom: 2 } }, icon),
    React.createElement(Text, { style: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.gris900, marginBottom: 1 } }, titulo),
    React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.oro, marginBottom: 2 } }, precio),
    React.createElement(Text, { style: { fontSize: 7, color: C.gris500, lineHeight: 1.3 } }, razon)
  )
);


// ─── Data: Perfil Sencillo ───
// Rango ajustado a $51K-$69K — no hay opciones sub-$50K con zona confirmada en Equipetrol
const sencillas = [
  { num: 1, edificio: 'Santorini Ventura', zona: 'Villa Brigida', m2: 45, precio: 51500, precioM2: 1137,
    retorno: '~8% anual', estado: 'Listo para alquilar · 120 dias (mas negociable)', agente: 'Carlos Chavez', telefono: '+59177394030',
    url: 'https://remax.bo/propiedad/venta-departamento-santa-cruz-de-la-sierra-equipetrolnoroeste-120056075-126', id: 121,
    nota: '120 dias publicado, hay margen de negociacion. Renta real mismo edificio: Bs 2,500/mes. Con amoblado sube a ~Bs 3,500.' },
  { num: 2, edificio: 'Domus Tower', zona: 'Equipetrol Centro', m2: 34, precio: 63197, precioM2: 1880,
    retorno: '~7.5% anual', estado: 'Listo · 39 dias', agente: 'Ana Carola Penafiel Molina', telefono: '+59175022012',
    url: 'https://c21.com.bo/propiedad/97574_departamento-de-lujo-en-venta-en-equipetrol', id: 557,
    nota: '1 dormitorio en Eq. Centro. Alborada Group Bolivia. Mediana alquiler 1D en zona: Bs 3,500/mes.' },
  { num: 3, edificio: 'Portobello 5', zona: 'Villa Brigida', m2: 42, precio: 67385, precioM2: 1587,
    retorno: '~7% anual (desde entrega)', estado: 'Preventa · 58 dias', agente: 'Beiby Edith Anez Bejarano', telefono: '+59176026552',
    url: 'https://c21.com.bo/propiedad/95926_monoambiente-en-pre-venta-portobello-5', id: 432,
    nota: 'Monoambiente preventa. Port-Delux (Canal Isuto) con track record. Renta estimada ~Bs 3,200/mes en V. Brigida.' },
  { num: 4, edificio: 'Uptown Drei', zona: 'Equipetrol Oeste', m2: 34, precio: 68247, precioM2: 2007,
    retorno: '~6.5% anual (desde entrega)', estado: 'Preventa · 30 dias', agente: 'C21 (verificar contacto)', telefono: null,
    url: 'https://c21.com.bo/propiedad/98333_condominio-uptown-drei-c-nicolas-ortiz-equipetrol', id: 553,
    nota: 'Monoambiente preventa. Linea Uptown NUU — zona mixta universitaria + residencial. Recien publicado.' },
  { num: 5, edificio: 'Edificio Murure', zona: 'Equipetrol Centro', m2: 38, precio: 68965, precioM2: 1815,
    retorno: '~6.5% anual', estado: 'A estrenar · 109 dias (mas negociable)', agente: 'Jessica Barbery', telefono: '+59176370100',
    url: 'https://c21.com.bo/propiedad/91113_en-venta-monoambiente-en-equipetrol', id: 234,
    nota: 'Monoambiente a estrenar en Eq. Centro. 109 dias publicado — hay margen de negociacion. Mediana alquiler mono zona: Bs 3,175/mes.' },
];

// ─── Data: Perfil Premium ───
const premium = [
  { num: 1, edificio: 'La Foret', zona: 'Equipetrol Centro', m2: 41, precio: 70402, precioM2: 1733,
    retorno: '~8% anual', estado: 'Listo para alquilar · 77 dias', agente: 'Maria Elizabeth Coimbra', telefono: '+59170850865',
    url: 'https://c21.com.bo/propiedad/94676_monoambiente-en-equipetrol-en-venta', id: 150,
    nota: 'Edificio boutique, ubicacion central. Renta real mismo edificio: Bs 3,200/mes.' },
  { num: 2, edificio: 'HH Once', zona: 'Equipetrol Centro', m2: 37, precio: 77111, precioM2: 2081,
    retorno: '~8% anual (desde entrega)', estado: 'Preventa — entrega marzo 2026 · 75 dias', agente: 'Fernando Lamas Varanda', telefono: '+59178000988',
    url: 'https://c21.com.bo/propiedad/95876_preventa-de-monoambiente-en-edificio-hh-once', id: 455,
    nota: 'HH Desarrollos con track record. Entrega inminente (marzo 2026), capital parado solo semanas.' },
  { num: 3, edificio: 'Sky Equinox', zona: 'Sirari', m2: 35, precio: 78780, precioM2: 2238,
    retorno: '~8% anual (desde entrega)', estado: 'Preventa — entrega junio 2027 (~16 meses) · 77 dias', agente: 'Elizabeth Oconnor', telefono: '+59175930620',
    url: 'https://c21.com.bo/propiedad/94804_departamento-monoambiente-sky-equinox', id: 152,
    nota: 'El Sky mas accesible en zona premium. El retorno empieza desde la entrega (jun 2027), no desde la compra. Capital parado ~16 meses. Comparable Sky Lux alquila a Bs 3,800/mes.',
    tcNota: 'Precio publicado $60,842 en USD paralelo — equivalente a $78,780 a TC oficial' },
  { num: 4, edificio: 'Sky Plaza Italia', zona: 'Equipetrol Centro', m2: 42, precio: 105017, precioM2: 2475,
    retorno: '~5% anual', estado: 'Listo para alquilar · 42 dias', agente: 'Diego Pinto Bejarano', telefono: '+59177671006',
    url: 'https://c21.com.bo/propiedad/97568_monoambiente-en-venta-edificio-sky-collection-plaza-italia', id: 497,
    nota: 'Linea Sky consolidada. Renta real mismo edificio: Bs 3,000/mes (mono). Como 1D podria rentar Bs 4,200-4,700 (retorno ~6-7%).',
    tcNota: 'Precio publicado $81,105 en USD paralelo — equivalente a $105,017 a TC oficial' },
  { num: 5, edificio: 'Sky Magnolia', zona: 'Sirari', m2: 40, precio: 107265, precioM2: 2682,
    retorno: '~5.5% anual', estado: 'Listo para alquilar · 72 dias', agente: 'Carla Leon Cuba', telefono: '+59172648968',
    url: 'https://c21.com.bo/propiedad/95420_monoambiente-en-venta-en-equipetrol-equipado-y-semiamoblado', id: 429,
    nota: 'Ya viene amoblado — alquiler inmediato sin inversion adicional. Sirari = perfil corporativo. Renta real mismo edificio: Bs 3,500/mes.',
    tcNota: 'Precio publicado $82,841 en USD paralelo — equivalente a $107,265 a TC oficial' },
];


// ─── PDF Document ───
const Informe = () => (
  React.createElement(Document, { title: 'Informe de Inversion — Monoambiente / 1D Equipetrol', author: 'Simon' },

    // ═══════════════════════════════════
    //  PAGE 1: COVER — Crema elegante
    // ═══════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.pageCover },
      // Barra dorada izquierda
      React.createElement(View, { style: s.coverBarLeft }),
      // Content
      React.createElement(View, { style: s.coverContent },
        React.createElement(Text, { style: s.coverLabel }, 'SIMON  —  INTELIGENCIA INMOBILIARIA'),
        React.createElement(View, { style: s.coverLine }),
        React.createElement(Text, { style: s.coverTitle }, 'Informe de'),
        React.createElement(Text, { style: s.coverTitle }, 'Inversion'),
        React.createElement(Text, { style: s.coverSubtitle }, 'Monoambiente / 1 Dormitorio'),
        React.createElement(View, { style: { height: 16 } }),
        React.createElement(Text, { style: s.coverMeta }, 'Equipetrol, Santa Cruz de la Sierra'),
        React.createElement(View, { style: { ...s.coverLine, marginTop: 20 } }),
        React.createElement(Text, { style: { ...s.coverMeta, color: C.gris500 } }, 'Preparado para Guisela'),
        React.createElement(Text, { style: { ...s.coverMeta, color: C.gris500, marginTop: 8 } }, '26 de febrero de 2026')
      ),
      React.createElement(Footer, { page: '' })
    ),

    // ═══════════════════════════════════
    //  PAGE 2: CONTEXTO + RENTAS
    // ═══════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.page },

      // ── Recuadro Guisela ──
      React.createElement(View, {
        style: {
          backgroundColor: '#fef9ee',
          borderWidth: 1,
          borderColor: C.oro,
          borderRadius: 6,
          padding: 14,
          marginBottom: 14,
        }
      },
        React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.gris900, marginBottom: 6 } }, 'PARA GUISELA — Verificar antes de presentar al cliente:'),
        React.createElement(Text, { style: { fontSize: 9, color: C.gris700, lineHeight: 1.8 } },
          '\u25A1  Clickea cada link de publicacion y confirma que sigue activo\n' +
          '\u25A1  HH Once: entrega marzo 2026 confirmada?\n' +
          '\u25A1  Confirma precios con cada agente por WhatsApp\n' +
          '\u25A1  Mandame lo que confirmes y genero el PDF final'
        )
      ),

      React.createElement(Text, { style: s.label }, 'CONTEXTO'),
      React.createElement(Text, { style: s.h1 }, 'Dos perfiles de inversion'),
      React.createElement(View, { style: s.spacerSm }),

      React.createElement(Text, { style: s.body }, 'Cliente busca departamento monoambiente o 1 dormitorio en Equipetrol para alquilar. Pago en dolares. Preferencia por monoambiente.'),

      // ── Profile cards side by side ──
      React.createElement(View, { style: { flexDirection: 'row', gap: 10, marginBottom: 14 } },
        // Sencillo card
        React.createElement(View, {
          style: {
            flex: 1,
            backgroundColor: C.azulPalido,
            padding: 12,
            borderLeftWidth: 4,
            borderLeftColor: C.azul,
            borderRadius: 6,
          }
        },
          React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.azulOscuro, marginBottom: 3 } }, 'Perfil Sencillo'),
          React.createElement(Text, { style: { fontSize: 9, color: C.gris700 } }, '~$51,000 - $69,000'),
          React.createElement(Text, { style: { fontSize: 8, color: C.gris500, marginTop: 3 } }, 'Maximizar retorno')
        ),
        // Premium card
        React.createElement(View, {
          style: {
            flex: 1,
            backgroundColor: C.oroClaro,
            padding: 12,
            borderLeftWidth: 4,
            borderLeftColor: C.oro,
            borderRadius: 6,
          }
        },
          React.createElement(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#7a6530', marginBottom: 3 } }, 'Perfil Premium'),
          React.createElement(Text, { style: { fontSize: 9, color: C.gris700 } }, '~$70,000 - $107,000'),
          React.createElement(Text, { style: { fontSize: 8, color: C.gris500, marginTop: 3 } }, 'Seguridad + apreciacion')
        )
      ),

      React.createElement(View, { style: s.callout },
        React.createElement(Text, { style: s.calloutTitle }, 'Referencia: "Vendi 2 en Sky Elite a $42K cash"'),
        React.createElement(Text, { style: s.calloutBody }, 'Esos precios ya no existen en Sky. Lo mas cercano hoy: Sky Equinox preventa $78,780 (Sirari, entrega jun 2027). Fuera de Sky, la opcion mas accesible es Santorini Ventura a $51,500 (45m2, Sirari). El mercado se estabilizo.')
      ),

      React.createElement(View, { style: s.divider }),

      // ── Rentas ──
      React.createElement(Text, { style: s.label }, 'MERCADO DE ALQUILER'),
      React.createElement(Text, { style: s.h2 }, 'Referencia para calcular retorno'),
      React.createElement(Text, { style: { ...s.caption, marginBottom: 8 } }, '138 alquileres activos en Equipetrol (0-1 dorm). Datos al 26 Feb 2026.'),

      // ── Rentas table with mini-bars ──
      React.createElement(View, { style: { marginBottom: 12 } },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: 90 } }, 'Tipologia'),
          React.createElement(Text, { style: { ...s.th, width: 35 } }, 'Oferta'),
          React.createElement(Text, { style: { ...s.th, width: 60 } }, 'Desde'),
          React.createElement(Text, { style: { ...s.th, width: 60 } }, 'Mediana'),
          React.createElement(Text, { style: { ...s.th, width: 50 } }, 'P75'),
          React.createElement(Text, { style: { ...s.th, width: 50 } }, 'Hasta'),
          React.createElement(Text, { style: { ...s.th, width: 65 } }, 'Rango')
        ),
        // Monoambiente row
        React.createElement(View, { style: { ...s.tableRowHL, alignItems: 'center' } },
          React.createElement(Text, { style: { ...s.tdBold, width: 90 } }, 'Monoambiente'),
          React.createElement(Text, { style: { ...s.td, width: 35 } }, '25'),
          React.createElement(Text, { style: { ...s.td, width: 60 } }, 'Bs 2,500'),
          React.createElement(Text, { style: { ...s.tdOro, width: 60 } }, 'Bs 3,450'),
          React.createElement(Text, { style: { ...s.td, width: 50 } }, 'Bs 3,850'),
          React.createElement(Text, { style: { ...s.td, width: 50 } }, 'Bs 8,700'),
          React.createElement(View, { style: { width: 65, height: 6, backgroundColor: C.gris200, borderRadius: 3, overflow: 'hidden' } },
            React.createElement(View, { style: { width: '60%', height: 6, backgroundColor: C.oro, borderRadius: 3 } })
          )
        ),
        // 1 Dormitorio row
        React.createElement(View, { style: { ...s.tableRow, alignItems: 'center' } },
          React.createElement(Text, { style: { ...s.tdBold, width: 90 } }, '1 Dormitorio'),
          React.createElement(Text, { style: { ...s.td, width: 35 } }, '113'),
          React.createElement(Text, { style: { ...s.td, width: 60 } }, 'Bs 2,150'),
          React.createElement(Text, { style: { ...s.tdOro, width: 60 } }, 'Bs 3,700'),
          React.createElement(Text, { style: { ...s.td, width: 50 } }, 'Bs 4,550'),
          React.createElement(Text, { style: { ...s.td, width: 50 } }, 'Bs 6,500'),
          React.createElement(View, { style: { width: 65, height: 6, backgroundColor: C.gris200, borderRadius: 3, overflow: 'hidden' } },
            React.createElement(View, { style: { width: '75%', height: 6, backgroundColor: C.azul, borderRadius: 3 } })
          )
        )
      ),

      // ── Comparables ──
      React.createElement(Text, { style: s.label }, 'RENTAS REALES POR EDIFICIO'),
      React.createElement(View, { style: { marginBottom: 8 } },
        React.createElement(View, { style: s.tableHeader },
          React.createElement(Text, { style: { ...s.th, width: 140 } }, 'Edificio'),
          React.createElement(Text, { style: { ...s.th, width: 55 } }, 'Tipo'),
          React.createElement(Text, { style: { ...s.th, width: 45 } }, 'm2'),
          React.createElement(Text, { style: { ...s.th, width: 100 } }, 'Renta mensual')
        ),
        ...[
          ['Sky Lux', 'Mono', '31-32', 'Bs 3,800 - 4,000'],
          ['Sky Moon', 'Mono', '42', 'Bs 4,700'],
          ['Sky Collection P.I.', 'Mono', '46', 'Bs 3,000'],
          ['MARE', 'Mono', '41', 'Bs 3,600'],
          ['La Foret', 'Mono', '44', 'Bs 3,200'],
          ['Sky Magnolia', '1D', '40', 'Bs 3,500'],
          ['Santorini Ventura', '1D', '45', 'Bs 2,500'],
          ['Sky Eclipse', '1D', '65-68', 'Bs 4,850 - 5,500'],
          ['Sky Moon', '1D', '41-42', 'Bs 4,550 - 5,220'],
        ].map((r, i) => React.createElement(View, { style: i % 2 === 0 ? s.tableRow : s.tableRowAlt, key: i },
          React.createElement(Text, { style: { ...s.td, width: 140 } }, r[0]),
          React.createElement(Text, { style: { ...s.td, width: 55 } }, r[1]),
          React.createElement(Text, { style: { ...s.td, width: 45 } }, r[2]),
          React.createElement(Text, { style: { ...s.tdBold, width: 100 } }, r[3])
        ))
      ),

      React.createElement(Footer, { page: '2' })
    ),

    // ═══════════════════════════════════
    //  PAGE 3: PERFIL SENCILLO
    // ═══════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(SectionBadge, { text: 'PERFIL SENCILLO', color: C.blanco, bgColor: C.azul }),
      React.createElement(Text, { style: s.h1 }, 'Sencillo — $51,000 a $69,000'),
      React.createElement(Text, { style: { ...s.body, marginBottom: 4 } }, 'Para maximizar retorno. Renta esperada Bs 2,500-3,500/mes. No hay opciones sub-$50K con zona confirmada en Equipetrol — se incluyeron las mas cercanas.'),

      React.createElement(View, { style: { flexDirection: 'row', gap: 8, marginBottom: 14 } },
        React.createElement(KpiBox, { value: '6.5-8%', label: 'RETORNO BRUTO', bgColor: C.azulOscuro, textColor: C.blanco, labelColor: '#ffffff88' }),
        React.createElement(KpiBox, { value: '$51K-$69K', label: 'INVERSION', bgColor: C.azulOscuro, textColor: C.blanco, labelColor: '#ffffff88' }),
        React.createElement(KpiBox, { value: '$1,137-$2,007', label: 'PRECIO / M2', bgColor: C.azulOscuro, textColor: C.blanco, labelColor: '#ffffff88' })
      ),

      ...sencillas.map(p => React.createElement(PropertyCardV2, { ...p, key: p.id, accentColor: C.azul })),

      React.createElement(Footer, { page: '3' })
    ),

    // ═══════════════════════════════════
    //  PAGE 4: PERFIL PREMIUM
    // ═══════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(SectionBadge, { text: 'PERFIL PREMIUM', color: '#7a6530', bgColor: C.oroClaro }),
      React.createElement(Text, { style: s.h1 }, 'Premium — $70,000 a $107,000'),
      React.createElement(Text, { style: { ...s.body, marginBottom: 4 } }, 'Para seguridad y apreciacion. Edificios con piscina, gym, cowork. Menor vacancia, mejor reventa.'),

      React.createElement(View, { style: s.note },
        React.createElement(Text, { style: s.noteText }, '\u26A0 Nota TC: 3 de estas propiedades se publican en "dolares paralelo". El precio que ves aca es el equivalente real a tipo de cambio oficial (6.96 BOB/USD). Entre parentesis figura el precio publicado original.')
      ),

      React.createElement(View, { style: { flexDirection: 'row', gap: 8, marginBottom: 14 } },
        React.createElement(KpiBox, { value: '5-8%', label: 'RETORNO BRUTO', bgColor: C.crema, textColor: C.gris900, labelColor: C.gris500, borderColor: C.oro }),
        React.createElement(KpiBox, { value: '$70K-$107K', label: 'INVERSION', bgColor: C.crema, textColor: C.gris900, labelColor: C.gris500, borderColor: C.oro }),
        React.createElement(KpiBox, { value: '$1,733-$2,682', label: 'PRECIO / M2', bgColor: C.crema, textColor: C.gris900, labelColor: C.gris500, borderColor: C.oro })
      ),

      ...premium.map(p => React.createElement(PropertyCardV2, { ...p, key: p.id, accentColor: C.oro })),

      React.createElement(Footer, { page: '4' })
    ),

    // ═══════════════════════════════════
    //  PAGE 5: COMPARATIVO — Infografico
    // ═══════════════════════════════════
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(Text, { style: s.label }, 'COMPARATIVO'),
      React.createElement(Text, { style: s.h1 }, 'Sencillo vs Premium'),
      React.createElement(View, { style: s.spacerSm }),

      // Legend
      React.createElement(View, { style: { flexDirection: 'row', gap: 16, marginBottom: 12 } },
        React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
          React.createElement(View, { style: { width: 12, height: 8, backgroundColor: C.azul, borderRadius: 2 } }),
          React.createElement(Text, { style: { fontSize: 7.5, color: C.gris500 } }, 'Sencillo')
        ),
        React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
          React.createElement(View, { style: { width: 12, height: 8, backgroundColor: C.oro, borderRadius: 2 } }),
          React.createElement(Text, { style: { fontSize: 7.5, color: C.gris500 } }, 'Premium')
        )
      ),

      // Metric bars
      React.createElement(MetricBar, { label: 'Inversion tipica', sencillo: '$51K-$69K', premium: '$70K-$107K', sencilloWidth: 55, premiumWidth: 85 }),
      React.createElement(MetricBar, { label: 'Renta mensual', sencillo: 'Bs 2,500-3,500', premium: 'Bs 3,000-3,800', sencilloWidth: 55, premiumWidth: 70 }),
      React.createElement(MetricBar, { label: 'Retorno bruto', sencillo: '6.5-8%', premium: '5-8%', sencilloWidth: 75, premiumWidth: 60 }),
      React.createElement(MetricBar, { label: 'Vacancia', sencillo: 'Media', premium: 'Baja', sencilloWidth: 55, premiumWidth: 35 }),
      React.createElement(MetricBar, { label: 'Reventa', sencillo: 'Estable', premium: 'Apreciacion', sencilloWidth: 45, premiumWidth: 70 }),
      React.createElement(MetricBar, { label: 'Disponibilidad', sencillo: '2/5 listos + 3 prev.', premium: '3/5 listos + 2 prev.', sencilloWidth: 45, premiumWidth: 60 }),

      React.createElement(View, { style: s.dividerOro }),

      // ── 4 Reco cards (2×2 grid) ──
      React.createElement(Text, { style: { ...s.label, marginBottom: 10 } }, 'RECOMENDACIONES'),
      React.createElement(View, { style: { flexDirection: 'row', gap: 8, marginBottom: 8 } },
        React.createElement(RecoCard, {
          icon: '\u2191',
          titulo: 'Max retorno',
          precio: 'Santorini V. — $51,500',
          razon: '120 dias publicado, negociable. Renta real Bs 2,500. Retorno ~8%.',
          borderColor: C.azul,
        }),
        React.createElement(RecoCard, {
          icon: '\u2696',
          titulo: 'Equilibrio',
          precio: 'La Foret — $70,402',
          razon: 'Eq. Centro, entrega inmediata. Renta verificada Bs 3,200.',
          borderColor: C.oro,
        })
      ),
      React.createElement(View, { style: { flexDirection: 'row', gap: 8, marginBottom: 14 } },
        React.createElement(RecoCard, {
          icon: '\u26A1',
          titulo: 'Plug & play',
          precio: 'Sky Magnolia — $107,265',
          razon: 'Ya amoblado, listo dia 1. Retorno ~5.5%, cero gestion.',
          borderColor: C.verde,
        }),
        React.createElement(RecoCard, {
          icon: '\u23F3',
          titulo: 'Ojo preventa',
          precio: 'Sky Equinox — $78,780',
          razon: 'Buen precio pero entrega jun 2027. Capital parado 16 meses.',
          borderColor: C.naranja,
        })
      ),

      React.createElement(View, { style: s.dividerOro }),

      // Footer legal
      React.createElement(Text, { style: { ...s.caption, textAlign: 'center', marginBottom: 3 } }, 'Simon — Inteligencia Inmobiliaria  |  Fuentes: Century 21, Remax, Bien Inmuebles'),
      React.createElement(Text, { style: { ...s.caption, textAlign: 'center' } }, 'TC oficial: 6.96 BOB/USD  |  TC paralelo: 9.012  |  Retorno bruto = (Renta mensual x 12) / (Precio x TC oficial) x 100'),
      React.createElement(Text, { style: { ...s.caption, textAlign: 'center', marginTop: 6 } }, 'Verifica disponibilidad y precio con cada agente antes de presentar al cliente.'),

      React.createElement(Footer, { page: '5' })
    )
  )
);

// ─── Render ───
const outPath = path.join(__dirname, '..', 'docs', 'reports', 'Informe_Inversion_1D_Monoambiente_Guisela_Feb2026_v3.pdf');
renderToFile(React.createElement(Informe), outPath).then(() => {
  console.log(`PDF generado: ${outPath}`);
}).catch(err => {
  console.error('Error:', err);
});
