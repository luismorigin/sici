import { StyleSheet, Font } from '@react-pdf/renderer'

// Colores del sistema
export const colors = {
  primary: '#0066cc',
  primaryDark: '#004d99',
  success: '#059669',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray500: '#6b7280',
  gray700: '#374151',
  gray900: '#111827',
  white: '#ffffff',
}

// Estilos compartidos del PDF
export const styles = StyleSheet.create({
  // === PÁGINA ===
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.gray700,
    backgroundColor: colors.white,
  },

  // === HEADER (Logo + Broker) ===
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 100,
    height: 35,
    objectFit: 'contain',
  },
  inmobiliariaText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  brokerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brokerPhoto: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    objectFit: 'cover',
  },
  brokerPhotoPlaceholder: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brokerInitials: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  brokerName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  brokerTitle: {
    fontSize: 9,
    color: colors.gray500,
  },

  // === HERO IMAGE ===
  heroContainer: {
    marginBottom: 15,
  },
  heroImage: {
    width: '100%',
    height: 220,
    objectFit: 'cover',
    borderRadius: 8,
  },

  // === PRECIO Y NOMBRE ===
  priceBox: {
    backgroundColor: colors.gray900,
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 5,
  },
  location: {
    fontSize: 11,
    color: colors.gray300,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.white,
  },
  priceM2: {
    fontSize: 11,
    color: colors.gray300,
  },

  // === SPECS INLINE ===
  specsInline: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 15,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.gray100,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  specIcon: {
    fontSize: 12,
  },
  specText: {
    fontSize: 10,
    color: colors.gray700,
  },

  // === GALERÍA ===
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
  },
  thumbnail: {
    width: 80,
    height: 60,
    objectFit: 'cover',
    borderRadius: 4,
  },

  // === FOOTER PÁGINA 1 ===
  footerPage1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  codeText: {
    fontSize: 10,
    color: colors.gray500,
  },
  qrCode: {
    width: 70,
    height: 70,
  },

  // === PÁGINA 2: ESPECIFICACIONES ===
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.gray900,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  specCard: {
    width: '30%',
    backgroundColor: colors.gray50,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  specCardLabel: {
    fontSize: 9,
    color: colors.gray500,
    marginBottom: 4,
  },
  specCardValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.gray900,
  },

  // === ESTADO Y ENTREGA ===
  infoBox: {
    backgroundColor: colors.gray50,
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 10,
    color: colors.gray500,
  },
  infoValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.gray900,
  },
  infoBadge: {
    backgroundColor: colors.success,
    color: colors.white,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    fontSize: 9,
  },

  // === AMENIDADES ===
  amenitiesContainer: {
    marginBottom: 20,
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  amenityPill: {
    backgroundColor: colors.gray100,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  amenityText: {
    fontSize: 9,
    color: colors.gray700,
  },

  // === DESCRIPCIÓN ===
  descriptionBox: {
    backgroundColor: colors.gray50,
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  descriptionText: {
    fontSize: 10,
    color: colors.gray700,
    lineHeight: 1.5,
  },

  // === CONTACTO BROKER ===
  contactBox: {
    backgroundColor: colors.primary,
    padding: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 20,
  },
  contactPhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    objectFit: 'cover',
    borderWidth: 2,
    borderColor: colors.white,
  },
  contactPhotoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  contactInitials: {
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 2,
  },
  contactCompany: {
    fontSize: 10,
    color: colors.gray200,
    marginBottom: 8,
  },
  contactInfo: {
    fontSize: 11,
    color: colors.white,
    marginBottom: 3,
  },

  // === FOOTER FINAL ===
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
})

// Helper para obtener iniciales
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Helper para formatear precio
export function formatPrice(price: number): string {
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

// Helper para formatear estado de construcción
export function formatEstadoConstruccion(estado: string | null): string {
  const map: Record<string, string> = {
    'entrega_inmediata': 'Entrega Inmediata',
    'en_construccion': 'En Construcción',
    'preventa': 'Preventa',
    'planos': 'En Planos',
    'no_especificado': 'No especificado',
  }
  return map[estado || 'no_especificado'] || estado || 'No especificado'
}
