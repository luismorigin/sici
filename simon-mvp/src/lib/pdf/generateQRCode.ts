import QRCode from 'qrcode'

/**
 * Genera un código QR como data URL (base64)
 * @param url - URL a codificar en el QR
 * @returns Data URL del QR en formato PNG base64
 */
export async function generateQRCode(url: string): Promise<string> {
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
    return qrDataUrl
  } catch (error) {
    console.error('Error generando QR code:', error)
    // Retornar un placeholder vacío en caso de error
    throw new Error('No se pudo generar el código QR')
  }
}

/**
 * Genera la URL corta para una propiedad
 * @param codigo - Código SIM-XXXXX de la propiedad
 * @returns URL completa simon.bo/p/SIM-XXXXX
 */
export function getShortUrl(codigo: string): string {
  // Por ahora usamos la URL del dashboard ya que la página pública no existe aún
  // TODO: Cambiar a simon.bo/p/{codigo} cuando exista la página pública
  return `https://simon.bo/p/${codigo}`
}

export default generateQRCode
