import React from 'react'
import { Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { styles, colors, getInitials, formatPrice, formatEstadoConstruccion } from './styles'

// Tipos
export interface Broker {
  id: string
  nombre: string
  email: string
  telefono: string
  whatsapp?: string
  empresa?: string
  inmobiliaria?: string
  foto_url?: string
  logo_url?: string
}

export interface PropiedadBroker {
  id: number
  codigo: string
  proyecto_nombre: string
  zona: string
  direccion?: string
  precio_usd: number
  area_m2: number
  dormitorios: number
  banos: number
  piso?: number
  cantidad_parqueos?: number
  parqueo_incluido?: boolean
  baulera_incluida?: boolean
  expensas_usd?: number
  estado_construccion?: string
  fecha_entrega?: string
  escritura_lista?: boolean
  descripcion?: string
  amenidades?: {
    lista?: string[]
    equipamiento?: string[]
  }
  score_calidad?: number
}

interface PDFDocumentProps {
  propiedad: PropiedadBroker
  fotos: string[]
  broker: Broker
  qrDataUrl: string
}

export function PropertyPDFDocument({ propiedad, fotos, broker, qrDataUrl }: PDFDocumentProps) {
  const precioM2 = propiedad.area_m2 > 0
    ? Math.round(propiedad.precio_usd / propiedad.area_m2)
    : 0

  const amenidades = propiedad.amenidades?.lista || []
  const equipamiento = propiedad.amenidades?.equipamiento || []
  const fotoPrincipal = fotos[0] || null
  const fotosGaleria = fotos.slice(1, 7)

  const inmobiliariaName = broker.inmobiliaria || broker.empresa || ''

  return (
    <Document>
      {/* ========== PÁGINA 1: PORTADA + GALERÍA ========== */}
      <Page size="A4" style={styles.page}>
        {/* Header con Logo y Broker */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            {broker.logo_url ? (
              <Image src={broker.logo_url} style={styles.logo} />
            ) : (
              <Text style={styles.inmobiliariaText}>{inmobiliariaName}</Text>
            )}
          </View>
          <View style={styles.brokerInfo}>
            <View>
              <Text style={styles.brokerName}>{broker.nombre}</Text>
              <Text style={styles.brokerTitle}>Asesor Inmobiliario</Text>
            </View>
            {broker.foto_url ? (
              <Image src={broker.foto_url} style={styles.brokerPhoto} />
            ) : (
              <View style={styles.brokerPhotoPlaceholder}>
                <Text style={styles.brokerInitials}>{getInitials(broker.nombre)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Foto Principal */}
        {fotoPrincipal && (
          <View style={styles.heroContainer}>
            <Image src={fotoPrincipal} style={styles.heroImage} />
          </View>
        )}

        {/* Box con Precio y Nombre */}
        <View style={styles.priceBox}>
          <Text style={styles.projectName}>{propiedad.proyecto_nombre}</Text>
          <Text style={styles.location}>{propiedad.zona}, Santa Cruz</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(propiedad.precio_usd)}</Text>
            <Text style={styles.priceM2}>{formatPrice(precioM2)}/m²</Text>
          </View>
        </View>

        {/* Specs Inline */}
        <View style={styles.specsInline}>
          <View style={styles.specItem}>
            <Text style={styles.specText}>{propiedad.dormitorios} Dorm.</Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specText}>{propiedad.banos} Baño{propiedad.banos !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specText}>{propiedad.area_m2} m²</Text>
          </View>
          {(propiedad.cantidad_parqueos || propiedad.parqueo_incluido) && (
            <View style={styles.specItem}>
              <Text style={styles.specText}>
                {propiedad.cantidad_parqueos || 1} Parqueo{(propiedad.cantidad_parqueos || 1) !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Galería de Thumbnails */}
        {fotosGaleria.length > 0 && (
          <View style={styles.gallery}>
            {fotosGaleria.map((foto, idx) => (
              <Image key={idx} src={foto} style={styles.thumbnail} />
            ))}
          </View>
        )}

        {/* Footer con Código y QR */}
        <View style={styles.footerPage1}>
          <View>
            <Text style={styles.codeText}>Código: {propiedad.codigo}</Text>
            <Text style={styles.codeText}>simon.bo/p/{propiedad.codigo}</Text>
          </View>
          {qrDataUrl && (
            <Image src={qrDataUrl} style={styles.qrCode} />
          )}
        </View>
      </Page>

      {/* ========== PÁGINA 2: ESPECIFICACIONES + CONTACTO ========== */}
      <Page size="A4" style={styles.page}>
        {/* Especificaciones Grid */}
        <Text style={styles.sectionTitle}>Especificaciones</Text>
        <View style={styles.specGrid}>
          <View style={styles.specCard}>
            <Text style={styles.specCardLabel}>Superficie</Text>
            <Text style={styles.specCardValue}>{propiedad.area_m2} m²</Text>
          </View>
          <View style={styles.specCard}>
            <Text style={styles.specCardLabel}>Dormitorios</Text>
            <Text style={styles.specCardValue}>{propiedad.dormitorios}</Text>
          </View>
          <View style={styles.specCard}>
            <Text style={styles.specCardLabel}>Baños</Text>
            <Text style={styles.specCardValue}>{propiedad.banos}</Text>
          </View>
          {propiedad.piso && (
            <View style={styles.specCard}>
              <Text style={styles.specCardLabel}>Piso</Text>
              <Text style={styles.specCardValue}>{propiedad.piso}°</Text>
            </View>
          )}
          <View style={styles.specCard}>
            <Text style={styles.specCardLabel}>Parqueos</Text>
            <Text style={styles.specCardValue}>
              {propiedad.cantidad_parqueos || (propiedad.parqueo_incluido ? 1 : 0)}
              {propiedad.parqueo_incluido && ' incl.'}
            </Text>
          </View>
          <View style={styles.specCard}>
            <Text style={styles.specCardLabel}>Baulera</Text>
            <Text style={styles.specCardValue}>
              {propiedad.baulera_incluida ? 'Incluida' : 'No incluida'}
            </Text>
          </View>
        </View>

        {/* Estado y Entrega */}
        <Text style={styles.sectionTitle}>Estado y Entrega</Text>
        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Estado de construcción</Text>
            <Text style={styles.infoValue}>
              {formatEstadoConstruccion(propiedad.estado_construccion || null)}
            </Text>
          </View>
          {propiedad.fecha_entrega && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Fecha de entrega</Text>
              <Text style={styles.infoValue}>{propiedad.fecha_entrega}</Text>
            </View>
          )}
          {propiedad.escritura_lista !== undefined && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Escritura lista</Text>
              <Text style={styles.infoValue}>
                {propiedad.escritura_lista ? 'Sí' : 'No'}
              </Text>
            </View>
          )}
          {propiedad.expensas_usd && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Expensas mensuales</Text>
              <Text style={styles.infoValue}>{formatPrice(propiedad.expensas_usd)}/mes</Text>
            </View>
          )}
        </View>

        {/* Amenidades del Edificio */}
        {amenidades.length > 0 && (
          <View style={styles.amenitiesContainer}>
            <Text style={styles.sectionTitle}>Amenidades del Edificio</Text>
            <View style={styles.amenitiesGrid}>
              {amenidades.slice(0, 12).map((amenidad, idx) => (
                <View key={idx} style={styles.amenityPill}>
                  <Text style={styles.amenityText}>{amenidad}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Equipamiento de la Unidad */}
        {equipamiento.length > 0 && (
          <View style={styles.amenitiesContainer}>
            <Text style={styles.sectionTitle}>Equipamiento de la Unidad</Text>
            <View style={styles.amenitiesGrid}>
              {equipamiento.slice(0, 8).map((item, idx) => (
                <View key={idx} style={styles.amenityPill}>
                  <Text style={styles.amenityText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Descripción */}
        {propiedad.descripcion && (
          <View style={styles.descriptionBox}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.descriptionText}>
              {propiedad.descripcion.slice(0, 400)}
              {propiedad.descripcion.length > 400 ? '...' : ''}
            </Text>
          </View>
        )}

        {/* Contacto Broker */}
        <View style={styles.contactBox}>
          {broker.foto_url ? (
            <Image src={broker.foto_url} style={styles.contactPhoto} />
          ) : (
            <View style={styles.contactPhotoPlaceholder}>
              <Text style={styles.contactInitials}>{getInitials(broker.nombre)}</Text>
            </View>
          )}
          <View style={styles.contactDetails}>
            <Text style={styles.contactName}>{broker.nombre}</Text>
            <Text style={styles.contactCompany}>
              {inmobiliariaName || 'Asesor Inmobiliario'}
            </Text>
            {broker.whatsapp && (
              <Text style={styles.contactInfo}>WhatsApp: {broker.whatsapp}</Text>
            )}
            {broker.telefono && !broker.whatsapp && (
              <Text style={styles.contactInfo}>Tel: {broker.telefono}</Text>
            )}
            <Text style={styles.contactInfo}>{broker.email}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado por <Text style={styles.footerBrand}>Simón</Text> • simon.bo • {new Date().toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export default PropertyPDFDocument
