/**
 * CMAPDFDocument - Componente PDF para Análisis Comparativo de Mercado (v2.0 Professional)
 *
 * Genera un reporte profesional de CMA de 3-4 páginas incluyendo:
 * - Página 1: Portada + Resumen Ejecutivo
 * - Página 2: Características de la Propiedad (amenidades, equipamiento, diferenciadores)
 * - Página 3: Tabla de Comparables con propiedad destacada
 * - Página 4: Recomendación de Precio detallada
 */

import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

// Colores del sistema CMA
const colors = {
  primary: '#0066cc',
  primaryDark: '#004d99',
  primaryLight: '#e6f2ff',
  success: '#059669',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray500: '#6b7280',
  gray700: '#374151',
  gray900: '#111827',
  white: '#ffffff',
}

// Estilos específicos del CMA Profesional
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.gray700,
    backgroundColor: colors.white,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 10,
    color: colors.gray500,
    marginTop: 4,
  },
  date: {
    fontSize: 10,
    color: colors.gray500,
  },

  // Propiedad Analizada
  propertyCard: {
    backgroundColor: colors.gray900,
    padding: 20,
    borderRadius: 8,
    marginBottom: 20,
    flexDirection: 'row',
    gap: 15,
  },
  propertyImage: {
    width: 120,
    height: 90,
    borderRadius: 6,
    objectFit: 'cover',
  },
  propertyImagePlaceholder: {
    width: 120,
    height: 90,
    borderRadius: 6,
    backgroundColor: colors.gray700,
    justifyContent: 'center',
    alignItems: 'center',
  },
  propertyInfo: {
    flex: 1,
  },
  propertyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
  },
  propertyZone: {
    fontSize: 10,
    color: colors.gray300,
    marginBottom: 8,
  },
  propertySpecs: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 8,
  },
  specBadge: {
    backgroundColor: colors.gray700,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  specText: {
    fontSize: 9,
    color: colors.gray200,
  },
  propertyPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  propertyPriceM2: {
    fontSize: 10,
    color: colors.gray300,
    marginTop: 2,
  },

  // Resumen Ejecutivo
  summarySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.gray50,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 9,
    color: colors.gray500,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  summarySubtext: {
    fontSize: 8,
    color: colors.gray500,
    marginTop: 2,
  },

  // Posición de Mercado
  positionBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  positionText: {
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Score de Calidad (NUEVO)
  scoreSection: {
    marginBottom: 15,
    padding: 15,
    backgroundColor: colors.gray50,
    borderRadius: 8,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 8,
  },
  scoreBarContainer: {
    height: 12,
    backgroundColor: colors.gray200,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 4,
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 6,
  },
  scoreValue: {
    fontSize: 10,
    color: colors.gray500,
    textAlign: 'right' as const,
  },

  // Amenidades y Equipamiento (NUEVO)
  pillsSection: {
    marginBottom: 15,
  },
  pillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  amenityPill: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  amenityPillText: {
    fontSize: 9,
    color: colors.primary,
  },
  equipmentPill: {
    backgroundColor: colors.gray100,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.gray300,
  },
  equipmentPillText: {
    fontSize: 9,
    color: colors.gray700,
  },

  // Características (NUEVO)
  characteristicsSection: {
    marginBottom: 15,
    padding: 15,
    backgroundColor: colors.gray50,
    borderRadius: 8,
  },
  characteristicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  characteristicCheck: {
    width: 16,
    height: 16,
    backgroundColor: colors.success,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  characteristicCheckText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: 'bold',
  },
  characteristicText: {
    fontSize: 10,
    color: colors.gray700,
  },

  // Diferenciadores (NUEVO)
  diffSection: {
    marginBottom: 15,
  },
  diffContainer: {
    flexDirection: 'row',
    gap: 15,
  },
  diffColumn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
  },
  diffColumnVentajas: {
    backgroundColor: colors.successLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  diffColumnDesventajas: {
    backgroundColor: colors.warningLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  diffTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  diffTitleVentajas: {
    color: colors.success,
  },
  diffTitleDesventajas: {
    color: colors.warning,
  },
  diffItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 6,
  },
  diffBullet: {
    fontSize: 12,
    marginTop: -1,
  },
  diffText: {
    fontSize: 9,
    color: colors.gray700,
    flex: 1,
  },

  // Tabla de Comparables
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.gray900,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.white,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  tableRowAlt: {
    backgroundColor: colors.gray50,
  },
  tableRowHighlight: {
    backgroundColor: colors.primaryLight,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  tableCell: {
    fontSize: 8,
    color: colors.gray700,
  },
  tableCellBold: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  tableCellHighlight: {
    fontSize: 8,
    color: colors.primary,
    fontWeight: 'bold',
  },

  // Columnas de la tabla (7 columnas) - Total 100%
  colProyecto: { width: '20%', paddingRight: 4 },
  colArea: { width: '11%', textAlign: 'center' as const, paddingRight: 4 },
  colDorms: { width: '9%', textAlign: 'center' as const, paddingRight: 4 },
  colPrecio: { width: '16%', textAlign: 'right' as const, paddingRight: 4 },
  colPrecioM2: { width: '14%', textAlign: 'right' as const, paddingRight: 4 },
  colEstado: { width: '18%', paddingRight: 4 },
  colCaract: { width: '12%', textAlign: 'center' as const },

  // Leyenda tabla
  tableLegend: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendIcon: {
    fontSize: 10,
  },
  legendText: {
    fontSize: 8,
    color: colors.gray500,
  },

  // Estadísticas de Mercado
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: '31%',
    backgroundColor: colors.gray50,
    padding: 12,
    borderRadius: 8,
  },
  statLabel: {
    fontSize: 9,
    color: colors.gray500,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.gray900,
  },

  // Recomendaciones de Precio (MEJORADA)
  priceRecommendation: {
    marginBottom: 20,
  },
  priceRangeCard: {
    backgroundColor: colors.gray50,
    padding: 20,
    borderRadius: 8,
    marginBottom: 15,
  },
  priceRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  priceRangeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  priceRangeLabel: {
    flex: 1,
    fontSize: 10,
    color: colors.gray700,
  },
  priceRangeValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  priceRangeCurrent: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: 'bold',
  },
  recommendationBox: {
    backgroundColor: colors.successLight,
    padding: 20,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    marginBottom: 20,
  },
  recommendationTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.success,
    marginBottom: 8,
  },
  recommendationText: {
    fontSize: 10,
    color: colors.gray700,
    lineHeight: 1.5,
  },
  priceRange: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 15,
  },
  priceRangeItem: {
    alignItems: 'center',
  },
  priceRangeLabelOld: {
    fontSize: 9,
    color: colors.gray500,
    marginBottom: 4,
  },
  priceRangeValueOld: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.success,
  },

  // Footer
  footer: {
    marginTop: 'auto',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 9,
    color: colors.gray500,
  },
  footerBrand: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: 'bold',
  },

  // Disclaimer
  disclaimer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: colors.gray100,
    borderRadius: 4,
  },
  disclaimerText: {
    fontSize: 8,
    color: colors.gray500,
    fontStyle: 'italic',
    textAlign: 'center' as const,
  },

  // Page number
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 30,
    fontSize: 9,
    color: colors.gray500,
  },
})

// Types
export interface Broker {
  id: string
  nombre: string
  email: string
  telefono?: string
  empresa?: string
  inmobiliaria?: string
}

export interface Diferenciadores {
  ventajas: string[]
  desventajas: string[]
}

export interface PropiedadAnalizada {
  id: number
  codigo: string
  proyecto_nombre: string
  zona: string
  precio_usd: number
  area_m2: number
  dormitorios: number
  banos: number
  piso?: number
  estado_construccion?: string
  // Nuevos campos v2.0
  amenidades?: string[]
  equipamiento?: string[]
  score_calidad?: number
  cantidad_parqueos?: number
  parqueo_incluido?: boolean
  baulera_incluida?: boolean
  plan_pagos?: boolean
  precio_negociable?: boolean
  diferenciadores?: Diferenciadores
}

export interface Comparable {
  id: number
  proyecto: string
  zona: string
  precio_usd: number
  area_m2: number
  precio_m2: number
  dormitorios: number
  banos: number
  estado_construccion?: string
  desarrollador?: string
  // Nuevos campos v2.0
  parqueo_incluido?: boolean
  baulera_incluida?: boolean
  plan_pagos?: boolean
  es_propiedad_analizada?: boolean
}

export interface MetricasZona {
  stock: number
  precio_promedio: number
  precio_mediana: number
  precio_min: number
  precio_max: number
  precio_m2: number
  dias_promedio: number
}

export interface PosicionMercado {
  diferencia_pct: number
  posicion_texto: string
  categoria: 'oportunidad' | 'bajo_promedio' | 'promedio' | 'sobre_promedio' | 'premium'
}

export interface CMAPDFProps {
  propiedad: PropiedadAnalizada
  comparables: Comparable[]
  metricas: MetricasZona
  posicion: PosicionMercado
  broker: Broker
  fotoPrincipal?: string
  diferenciadores?: Diferenciadores
  notaComparables?: string
}

// Helpers
function formatPrice(price: number): string {
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function formatEstado(estado: string | null | undefined): string {
  const map: Record<string, string> = {
    'entrega_inmediata': 'Entrega Inmediata',
    'en_construccion': 'En Construcción',
    'preventa': 'Preventa',
    'planos': 'En Planos',
  }
  return map[estado || ''] || estado || 'N/A'
}

function getPositionColor(categoria: string): { bg: string; text: string } {
  const colorMap: Record<string, { bg: string; text: string }> = {
    oportunidad: { bg: colors.successLight, text: colors.success },
    bajo_promedio: { bg: colors.successLight, text: colors.success },
    promedio: { bg: colors.gray100, text: colors.gray700 },
    sobre_promedio: { bg: colors.warningLight, text: colors.warning },
    premium: { bg: colors.dangerLight, text: colors.danger },
  }
  return colorMap[categoria] || colorMap.promedio
}

function formatAmenity(amenity: string): string {
  // Convertir snake_case a Title Case
  return amenity
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Iconos de características para la tabla
function getCaracteristicasIconos(comp: Comparable): string {
  const icons: string[] = []
  if (comp.parqueo_incluido) icons.push('P')
  if (comp.baulera_incluida) icons.push('B')
  if (comp.plan_pagos) icons.push('$')
  return icons.join(' ') || '-'
}

export function CMAPDFDocument({
  propiedad,
  comparables,
  metricas,
  posicion,
  broker,
  fotoPrincipal,
  diferenciadores,
  notaComparables,
}: CMAPDFProps) {
  const precioM2 = propiedad.area_m2 > 0
    ? Math.round(propiedad.precio_usd / propiedad.area_m2)
    : 0

  const positionColors = getPositionColor(posicion.categoria)

  // Calcular precios sugeridos
  const precioVentaRapida = Math.round(metricas.precio_promedio * 0.92)
  const precioCompetitivo = Math.round(metricas.precio_promedio * 0.97)
  const precioMercado = metricas.precio_promedio
  const precioPremium = Math.round(metricas.precio_promedio * 1.05)

  // Usar diferenciadores del prop o de la propiedad
  const diffs = diferenciadores || propiedad.diferenciadores || { ventajas: [], desventajas: [] }

  // Características adicionales para mostrar
  const caracteristicasAdicionales: string[] = []
  if (propiedad.cantidad_parqueos && propiedad.cantidad_parqueos > 0) {
    caracteristicasAdicionales.push(`${propiedad.cantidad_parqueos} Parqueo${propiedad.cantidad_parqueos > 1 ? 's' : ''} ${propiedad.parqueo_incluido ? 'incluido' : 'disponible'}`)
  } else if (propiedad.parqueo_incluido) {
    caracteristicasAdicionales.push('Parqueo incluido')
  }
  if (propiedad.baulera_incluida) {
    caracteristicasAdicionales.push('Baulera incluida')
  }
  if (propiedad.plan_pagos) {
    caracteristicasAdicionales.push('Plan de pagos con desarrollador')
  }
  if (propiedad.precio_negociable) {
    caracteristicasAdicionales.push('Precio negociable')
  }

  // Amenidades y equipamiento
  const amenidades = propiedad.amenidades || []
  const equipamiento = propiedad.equipamiento || []

  return (
    <Document>
      {/* PÁGINA 1: Portada + Resumen Ejecutivo */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Análisis Comparativo de Mercado</Text>
            <Text style={styles.subtitle}>CMA - Comparative Market Analysis</Text>
          </View>
          <View>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('es-BO', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </Text>
          </View>
        </View>

        {/* Propiedad Analizada */}
        <View style={styles.propertyCard}>
          {fotoPrincipal ? (
            <Image src={fotoPrincipal} style={styles.propertyImage} />
          ) : (
            <View style={styles.propertyImagePlaceholder}>
              <Text style={{ color: colors.gray300, fontSize: 24 }}>🏢</Text>
            </View>
          )}
          <View style={styles.propertyInfo}>
            <Text style={styles.propertyName}>{propiedad.proyecto_nombre}</Text>
            <Text style={styles.propertyZone}>{propiedad.zona}, Santa Cruz</Text>
            <View style={styles.propertySpecs}>
              <View style={styles.specBadge}>
                <Text style={styles.specText}>{propiedad.dormitorios} Dorm.</Text>
              </View>
              <View style={styles.specBadge}>
                <Text style={styles.specText}>{propiedad.banos} Baños</Text>
              </View>
              <View style={styles.specBadge}>
                <Text style={styles.specText}>{propiedad.area_m2} m²</Text>
              </View>
              {propiedad.piso && (
                <View style={styles.specBadge}>
                  <Text style={styles.specText}>Piso {propiedad.piso}</Text>
                </View>
              )}
            </View>
            <Text style={styles.propertyPrice}>{formatPrice(propiedad.precio_usd)}</Text>
            <Text style={styles.propertyPriceM2}>{formatPrice(precioM2)}/m²</Text>
          </View>
        </View>

        {/* Resumen Ejecutivo */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Resumen Ejecutivo</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Precio Promedio Zona</Text>
              <Text style={styles.summaryValue}>{formatPrice(metricas.precio_promedio)}</Text>
              <Text style={styles.summarySubtext}>{propiedad.dormitorios} dorm. en {propiedad.zona}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Precio/m² Zona</Text>
              <Text style={styles.summaryValue}>{formatPrice(metricas.precio_m2)}</Text>
              <Text style={styles.summarySubtext}>vs {formatPrice(precioM2)} tu prop.</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Stock Disponible</Text>
              <Text style={styles.summaryValue}>{metricas.stock}</Text>
              <Text style={styles.summarySubtext}>propiedades similares</Text>
            </View>
          </View>

          {/* Posición de Mercado */}
          <View style={[
            styles.positionBadge,
            { backgroundColor: positionColors.bg }
          ]}>
            <Text style={[styles.positionText, { color: positionColors.text }]}>
              {posicion.posicion_texto}
            </Text>
          </View>
        </View>

        {/* Estadísticas de Mercado */}
        <Text style={styles.sectionTitle}>Estadísticas de Mercado - {propiedad.zona}</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Precio Mínimo</Text>
            <Text style={styles.statValue}>{formatPrice(metricas.precio_min)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Precio Mediana</Text>
            <Text style={styles.statValue}>{formatPrice(metricas.precio_mediana)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Precio Máximo</Text>
            <Text style={styles.statValue}>{formatPrice(metricas.precio_max)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Días Promedio</Text>
            <Text style={styles.statValue}>{metricas.dias_promedio}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Diferencia vs Mercado</Text>
            <Text style={[
              styles.statValue,
              { color: posicion.diferencia_pct < 0 ? colors.success : posicion.diferencia_pct > 0 ? colors.danger : colors.gray700 }
            ]}>
              {posicion.diferencia_pct > 0 ? '+' : ''}{posicion.diferencia_pct}%
            </Text>
          </View>
        </View>

        {/* Footer Página 1 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado por <Text style={styles.footerBrand}>Simón</Text> para {broker.nombre}
          </Text>
        </View>
        <Text style={styles.pageNumber}>1</Text>
      </Page>

      {/* PÁGINA 2: Características de la Propiedad */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Características de la Propiedad</Text>

        {/* Score de Calidad */}
        {propiedad.score_calidad && propiedad.score_calidad > 0 && (
          <View style={styles.scoreSection}>
            <Text style={styles.scoreLabel}>Score de Calidad</Text>
            <View style={styles.scoreBarContainer}>
              <View style={[styles.scoreBarFill, { width: `${propiedad.score_calidad}%` }]} />
            </View>
            <Text style={styles.scoreValue}>{propiedad.score_calidad}/100</Text>
          </View>
        )}

        {/* Amenidades del Edificio */}
        {amenidades.length > 0 && (
          <View style={styles.pillsSection}>
            <Text style={styles.sectionTitle}>Amenidades del Edificio</Text>
            <View style={styles.pillsGrid}>
              {amenidades.slice(0, 12).map((amenidad, idx) => (
                <View key={idx} style={styles.amenityPill}>
                  <Text style={styles.amenityPillText}>{formatAmenity(amenidad)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Equipamiento Incluido */}
        {equipamiento.length > 0 && (
          <View style={styles.pillsSection}>
            <Text style={styles.sectionTitle}>Equipamiento Incluido</Text>
            <View style={styles.pillsGrid}>
              {equipamiento.slice(0, 12).map((equipo, idx) => (
                <View key={idx} style={styles.equipmentPill}>
                  <Text style={styles.equipmentPillText}>{formatAmenity(equipo)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Características Adicionales */}
        {caracteristicasAdicionales.length > 0 && (
          <View style={styles.characteristicsSection}>
            <Text style={styles.scoreLabel}>Características Adicionales</Text>
            {caracteristicasAdicionales.map((caract, idx) => (
              <View key={idx} style={styles.characteristicItem}>
                <View style={styles.characteristicCheck}>
                  <Text style={styles.characteristicCheckText}>✓</Text>
                </View>
                <Text style={styles.characteristicText}>{caract}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Diferenciadores */}
        {(diffs.ventajas.length > 0 || diffs.desventajas.length > 0) && (
          <View style={styles.diffSection}>
            <Text style={styles.sectionTitle}>¿Por Qué Esta Propiedad?</Text>
            <View style={styles.diffContainer}>
              {/* Ventajas */}
              <View style={[styles.diffColumn, styles.diffColumnVentajas]}>
                <Text style={[styles.diffTitle, styles.diffTitleVentajas]}>➕ Ventajas</Text>
                {diffs.ventajas.length > 0 ? (
                  diffs.ventajas.map((v, idx) => (
                    <View key={idx} style={styles.diffItem}>
                      <Text style={styles.diffBullet}>•</Text>
                      <Text style={styles.diffText}>{v}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.diffText}>Sin ventajas destacadas</Text>
                )}
              </View>

              {/* Consideraciones */}
              <View style={[styles.diffColumn, styles.diffColumnDesventajas]}>
                <Text style={[styles.diffTitle, styles.diffTitleDesventajas]}>⚠️ Consideraciones</Text>
                {diffs.desventajas.length > 0 ? (
                  diffs.desventajas.map((d, idx) => (
                    <View key={idx} style={styles.diffItem}>
                      <Text style={styles.diffBullet}>•</Text>
                      <Text style={styles.diffText}>{d}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.diffText}>Sin consideraciones especiales</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Footer Página 2 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado por <Text style={styles.footerBrand}>Simón</Text> • simon.bo
          </Text>
        </View>
        <Text style={styles.pageNumber}>2</Text>
      </Page>

      {/* PÁGINA 3: Comparables + Tabla */}
      <Page size="A4" style={styles.page}>
        {/* Tabla de Comparables */}
        <Text style={styles.sectionTitle}>
          Propiedades Comparables - {propiedad.dormitorios} Dormitorios ({comparables.length})
        </Text>

        {/* Nota sobre metodología */}
        <Text style={{ fontSize: 9, color: colors.gray500, marginBottom: 10 }}>
          Comparación exclusiva con propiedades de {propiedad.dormitorios} dormitorios en {propiedad.zona}.
          {notaComparables ? ` ${notaComparables}` : ''}
        </Text>
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colProyecto]}>Proyecto</Text>
            <Text style={[styles.tableHeaderCell, styles.colArea]}>Área</Text>
            <Text style={[styles.tableHeaderCell, styles.colDorms]}>Dorms</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrecio]}>Precio</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrecioM2]}>$/m²</Text>
            <Text style={[styles.tableHeaderCell, styles.colEstado]}>Estado</Text>
            <Text style={[styles.tableHeaderCell, styles.colCaract]}>Caract.</Text>
          </View>

          {/* Rows */}
          {comparables.slice(0, 12).map((comp, idx) => {
            const isHighlighted = comp.es_propiedad_analizada
            return (
              <View
                key={comp.id}
                style={[
                  styles.tableRow,
                  isHighlighted ? styles.tableRowHighlight : (idx % 2 === 1 ? styles.tableRowAlt : {})
                ]}
              >
                <Text style={[
                  isHighlighted ? styles.tableCellHighlight : styles.tableCellBold,
                  styles.colProyecto
                ]}>
                  {isHighlighted ? '▶ ' : ''}{comp.proyecto.slice(0, 18)}
                </Text>
                <Text style={[isHighlighted ? styles.tableCellHighlight : styles.tableCell, styles.colArea]}>
                  {comp.area_m2}m²
                </Text>
                <Text style={[isHighlighted ? styles.tableCellHighlight : styles.tableCell, styles.colDorms]}>
                  {comp.dormitorios}
                </Text>
                <Text style={[isHighlighted ? styles.tableCellHighlight : styles.tableCell, styles.colPrecio]}>
                  {formatPrice(comp.precio_usd)}
                </Text>
                <Text style={[isHighlighted ? styles.tableCellHighlight : styles.tableCell, styles.colPrecioM2]}>
                  {formatPrice(comp.precio_m2)}
                </Text>
                <Text style={[isHighlighted ? styles.tableCellHighlight : styles.tableCell, styles.colEstado]}>
                  {formatEstado(comp.estado_construccion)}
                </Text>
                <Text style={[isHighlighted ? styles.tableCellHighlight : styles.tableCell, styles.colCaract]}>
                  {getCaracteristicasIconos(comp)}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Leyenda */}
        <View style={styles.tableLegend}>
          <View style={styles.legendItem}>
            <Text style={styles.legendIcon}>P</Text>
            <Text style={styles.legendText}>= Parqueo incluido</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={styles.legendIcon}>B</Text>
            <Text style={styles.legendText}>= Baulera incluida</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={styles.legendIcon}>$</Text>
            <Text style={styles.legendText}>= Plan de pagos</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={[styles.legendIcon, { color: colors.primary }]}>▶</Text>
            <Text style={styles.legendText}>= Tu propiedad</Text>
          </View>
        </View>

        {/* Footer Página 3 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado por <Text style={styles.footerBrand}>Simón</Text> • simon.bo
          </Text>
        </View>
        <Text style={styles.pageNumber}>3</Text>
      </Page>

      {/* PÁGINA 4: Recomendación de Precio */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Recomendación de Precio</Text>

        <Text style={{ fontSize: 10, color: colors.gray500, marginBottom: 15 }}>
          Basado en {comparables.length} propiedades comparables de {propiedad.dormitorios} dormitorios
          en {propiedad.zona} (rango de área: {Math.round(propiedad.area_m2 * 0.7)}-{Math.round(propiedad.area_m2 * 1.3)}m²)
        </Text>

        {/* Rangos de Precio Mejorados */}
        <View style={styles.priceRangeCard}>
          {/* Venta Rápida */}
          <View style={styles.priceRangeRow}>
            <View style={[styles.priceRangeDot, { backgroundColor: colors.danger }]} />
            <Text style={styles.priceRangeLabel}>Venta Rápida (descuento agresivo)</Text>
            <Text style={styles.priceRangeValue}>{formatPrice(precioVentaRapida)}</Text>
          </View>

          {/* Competitivo */}
          <View style={styles.priceRangeRow}>
            <View style={[styles.priceRangeDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.priceRangeLabel}>Precio Competitivo</Text>
            <Text style={styles.priceRangeValue}>{formatPrice(precioCompetitivo)}</Text>
          </View>

          {/* Mercado */}
          <View style={styles.priceRangeRow}>
            <View style={[styles.priceRangeDot, { backgroundColor: colors.success }]} />
            <Text style={styles.priceRangeLabel}>Precio de Mercado (promedio zona)</Text>
            <Text style={styles.priceRangeValue}>{formatPrice(precioMercado)}</Text>
            {Math.abs(propiedad.precio_usd - precioMercado) < precioMercado * 0.05 && (
              <Text style={styles.priceRangeCurrent}>← TU PRECIO</Text>
            )}
          </View>

          {/* Premium */}
          <View style={styles.priceRangeRow}>
            <View style={[styles.priceRangeDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.priceRangeLabel}>Precio Premium (si hay diferenciadores)</Text>
            <Text style={styles.priceRangeValue}>{formatPrice(precioPremium)}</Text>
          </View>
        </View>

        {/* Análisis del precio actual */}
        <View style={styles.recommendationBox}>
          <Text style={styles.recommendationTitle}>
            {posicion.categoria === 'oportunidad' || posicion.categoria === 'bajo_promedio'
              ? '✅ Precio Competitivo'
              : posicion.categoria === 'promedio'
                ? '✅ Precio en Rango de Mercado'
                : '⚠️ Precio Sobre el Promedio'}
          </Text>
          <Text style={styles.recommendationText}>
            {posicion.categoria === 'oportunidad' || posicion.categoria === 'bajo_promedio'
              ? `Tu precio actual de ${formatPrice(propiedad.precio_usd)} está ${Math.abs(posicion.diferencia_pct)}% por debajo del promedio de mercado. Esto representa una oportunidad atractiva para compradores y debería facilitar una venta rápida.`
              : posicion.categoria === 'promedio'
                ? `Tu precio actual de ${formatPrice(propiedad.precio_usd)} está alineado con el mercado. Es un precio justo que debería atraer compradores calificados.`
                : `Tu precio actual de ${formatPrice(propiedad.precio_usd)} está ${posicion.diferencia_pct}% sobre el promedio de mercado. ${diffs.ventajas.length > 2 ? 'Tus diferenciadores justifican un precio premium.' : 'Considera ajustar el precio o destacar más las ventajas de la propiedad.'}`
            }
          </Text>
        </View>

        {/* Resumen Final */}
        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionTitle}>Tu Propiedad vs. Mercado</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tu Precio</Text>
              <Text style={styles.summaryValue}>{formatPrice(propiedad.precio_usd)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Promedio Zona</Text>
              <Text style={styles.summaryValue}>{formatPrice(metricas.precio_promedio)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Diferencia</Text>
              <Text style={[
                styles.summaryValue,
                { color: posicion.diferencia_pct < 0 ? colors.success : posicion.diferencia_pct > 0 ? colors.danger : colors.gray700 }
              ]}>
                {posicion.diferencia_pct > 0 ? '+' : ''}{posicion.diferencia_pct}%
              </Text>
            </View>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Este análisis es una estimación basada en datos de mercado disponibles a la fecha de emisión.
            Los precios finales pueden variar según negociación, condiciones específicas de la propiedad,
            y factores externos del mercado inmobiliario. Simón no garantiza resultados específicos.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado por <Text style={styles.footerBrand}>Simón</Text> • simon.bo • {new Date().toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })}
          </Text>
          <Text style={{ fontSize: 8, color: colors.gray500, marginTop: 4 }}>
            Preparado para: {broker.nombre} {broker.inmobiliaria ? `(${broker.inmobiliaria})` : ''}
          </Text>
        </View>
        <Text style={styles.pageNumber}>4</Text>
      </Page>
    </Document>
  )
}

export default CMAPDFDocument
