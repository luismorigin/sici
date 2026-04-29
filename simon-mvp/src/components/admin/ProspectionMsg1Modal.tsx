// Modal del Msg 1 de prospección. Muestra preview de la imagen
// (demo-broker-msg1.png en /public) + caption + 2 acciones:
//  - Copiar imagen al clipboard (Clipboard API, fallback nueva pestaña)
//  - Abrir WhatsApp con caption pre-armado
//
// Flujo del founder: copia la imagen → pega en WA → manda. Después
// puede mandar el caption (que también está copiado / disponible para
// pegar como segundo mensaje, o como mismo mensaje con la imagen).

import { useState } from 'react'
import { buildWhatsAppURL } from '@/lib/whatsapp'

const MSG1_IMAGE_PATH = '/demo-broker-msg1.png'
const MSG1_CAPTION = 'Así verían tus clientes tus propiedades con Simón.'

export interface ProspectionMsg1ModalProps {
  isOpen: boolean
  onClose: () => void
  broker: { telefono: string; nombre: string } | null
}

export default function ProspectionMsg1Modal({ isOpen, onClose, broker }: ProspectionMsg1ModalProps) {
  const [copiedImage, setCopiedImage] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)

  if (!isOpen || !broker) return null

  const waUrl = buildWhatsAppURL(broker.telefono, MSG1_CAPTION)

  const handleCopyImage = async () => {
    setCopyError(null)
    try {
      const response = await fetch(MSG1_IMAGE_PATH)
      if (!response.ok) throw new Error(`No se pudo cargar la imagen (${response.status})`)
      const blob = await response.blob()
      // Algunos browsers solo soportan PNG en clipboard. Si la imagen es
      // jpg/webp, hacemos fallback a abrir en nueva pestaña.
      // (typeof ClipboardItem evita el narrowing agresivo de TS sobre `window`).
      if (typeof ClipboardItem === 'undefined') {
        window.open(MSG1_IMAGE_PATH, '_blank', 'noopener,noreferrer')
        setCopyError('Tu navegador no soporta copiar imagen al clipboard. Te abrí la imagen en pestaña nueva — guardala / copiala desde ahí.')
        return
      }
      const item = new ClipboardItem({ [blob.type]: blob })
      await navigator.clipboard.write([item])
      setCopiedImage(true)
      setTimeout(() => setCopiedImage(false), 2500)
    } catch (err) {
      console.error('[Msg1Modal] copy image failed:', err)
      // Fallback: abrir en pestaña nueva para que pueda guardarla
      window.open(MSG1_IMAGE_PATH, '_blank', 'noopener,noreferrer')
      setCopyError('No se pudo copiar al clipboard. Te abrí la imagen en pestaña nueva.')
    }
  }

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(MSG1_CAPTION)
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
    } catch {
      // Sin fallback — el caption está visible y se puede seleccionar manualmente
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Mensaje 1 · {broker.nombre}</h2>
            <p className="text-xs text-gray-500">Imagen + caption corto</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-2">×</button>
        </div>

        <div className="p-5">
          <div className="rounded-lg overflow-hidden bg-gray-100 mb-4 max-h-[40vh] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MSG1_IMAGE_PATH}
              alt="Mockup de Simón Broker"
              className="max-w-full max-h-[40vh] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
                const parent = (e.target as HTMLImageElement).parentElement
                if (parent) {
                  parent.innerHTML = '<div class="p-8 text-center text-gray-500 text-sm">⚠️ Imagen no encontrada en /public/demo-broker-msg1.png — subila al repo antes de usar.</div>'
                }
              }}
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-sm text-gray-700">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Caption</div>
            {MSG1_CAPTION}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleCopyImage}
              className={`w-full py-3 px-4 rounded-xl font-semibold transition-colors ${
                copiedImage ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {copiedImage ? '✓ Imagen copiada al clipboard' : '1. Copiar imagen al clipboard'}
            </button>

            <button
              type="button"
              onClick={handleCopyCaption}
              className={`w-full py-2.5 px-4 rounded-xl font-medium transition-colors text-sm ${
                copiedText ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {copiedText ? '✓ Caption copiado' : '2. Copiar caption'}
            </button>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 px-4 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#1ea952] transition-colors"
            >
              3. Abrir WhatsApp con caption
            </a>
          </div>

          {copyError && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              {copyError}
            </p>
          )}

          <div className="mt-4 text-xs text-gray-500 leading-relaxed">
            <strong>Cómo enviarlo:</strong> 1) Copiá la imagen, 2) Abrí WA, 3) Pegá la imagen en el chat (Ctrl+V), 4) El caption ya está pre-armado.
          </div>
        </div>
      </div>
    </div>
  )
}
