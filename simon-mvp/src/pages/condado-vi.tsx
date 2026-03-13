import Head from 'next/head'
import Image from 'next/image'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Playfair_Display, DM_Sans } from 'next/font/google'

// ─── Fonts ───────────────────────────────────────────────
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-playfair',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm',
  display: 'swap',
})

// ─── WhatsApp helpers ────────────────────────────────────
const WA_NUMBER = '59177030100'
const waLink = (msg: string) =>
  `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`
const WA_GENERAL = waLink('Hola, me interesa Condado VI Plaza Italia')
const WA_VISITA = waLink('Hola, quiero agendar una visita a Condado VI Plaza Italia')
const WA_1D = waLink('Hola, me interesa un 1 dormitorio en Condado VI Plaza Italia')
const WA_2D = waLink('Hola, me interesa un 2 dormitorios en Condado VI Plaza Italia')
const WA_3D = waLink('Hola, me interesa un 3 dormitorios en Condado VI Plaza Italia')

// ─── Data ────────────────────────────────────────────────
const TIPOLOGIAS = [
  { dorms: '1 Dormitorio', m2: '62 m²', precio: '$103,000', desc: 'Para profesionales y parejas que quieren espacio real.', wa: WA_1D, planta: '/condado-vi/planta-1d.png' },
  { dorms: '2 Dormitorios', m2: '87 m²', precio: '$143,000', desc: 'Doble orientación, luz natural todo el día.', wa: WA_2D, planta: '/condado-vi/planta-2d.png' },
  { dorms: '3 Dormitorios', m2: '144 m²', precio: '$238,000', desc: '3 dormitorios amplios sin salir de Equipetrol Centro.', wa: WA_3D, planta: '/condado-vi/planta-3d.png' },
]

const EQUIPAMIENTO = {
  Cocina: ['Mesones de granito', 'Horno empotrado', 'Microondas', 'Campana extractora', 'Heladera', 'Lavavajillas'],
  Lavandería: ['Lavadora', 'Secadora'],
  Confort: ['Aire acondicionado', 'Closets empotrados', 'Calefón', 'Box de baño en vidrio', 'Cerradura digital', 'Aislamiento acústico', 'Intercomunicador'],
}

const AMENIDADES = ['Piscina', 'Gimnasio', 'Churrasquera', 'Salón de eventos', 'Seguridad 24/7', 'Ascensor', 'Terraza con vista']

const AMENIDAD_PHOTOS: Record<string, string> = {
  'Piscina': '/condado-vi/piscina.png',
  'Gimnasio': '/condado-vi/gimnasio.png',
  'Churrasquera': '/condado-vi/churrasquera.png',
  'Salón de eventos': '/condado-vi/salon-eventos.png',
  'Terraza con vista': '/condado-vi/salon-comedor.png',
}

const TIMELINE = [
  { nombre: 'Condado I', estado: 'Entregado' },
  { nombre: 'Condado II', estado: 'Entregado' },
  { nombre: 'Condado III', estado: 'Entregado' },
  { nombre: 'Condado IV', estado: 'Entregado' },
  { nombre: 'Condado Park V', estado: 'Entregado' },
  { nombre: 'Condado VI Plaza Italia', estado: 'Entrega inmediata', active: true },
]

const FAQS = [
  { q: '¿Qué incluye el departamento?', a: '16 items: cocina completa (horno, microondas, heladera, lavavajillas, campana, mesones de granito), lavadora, secadora, aire acondicionado, closets, box de baño, cerradura digital, aislamiento acústico, calefón e intercomunicador.' },
  { q: '¿Cuándo puedo mudarme?', a: 'Mañana, si querés. El edificio está terminado y tu departamento te espera.' },
  { q: '¿En qué moneda es el precio?', a: 'USD. Se recibe al tipo de cambio paralelo vigente. También aceptamos bolivianos.' },
  { q: '¿Puedo visitar el departamento?', a: 'Sí. El edificio está terminado. Coordiná tu visita por WhatsApp.' },
  { q: '¿Tienen financiamiento bancario?', a: 'Sí. Consultá condiciones con nuestro equipo.' },
  { q: '¿Por qué 7 amenidades y no 12?', a: 'Porque cada amenidad que no se usa la pagás igual en expensas. Y las que sí se usan, mejor que no estén llenas de gente. Pocos vecinos, amenidades reales.' },
  { q: '¿Cuánto son las expensas?', a: 'Consultá el monto exacto por WhatsApp. Al tener amenidades pensadas para el uso real, las expensas se mantienen razonables.' },
]

const DISTANCIAS = [
  { lugar: 'Plaza Italia', tiempo: '30 seg', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c4-4 8-7.5 8-12a8 8 0 10-16 0c0 4.5 4 8 8 12z"/><circle cx="12" cy="10" r="2"/></svg> },
  { lugar: 'Restaurantes', tiempo: '2 min', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg> },
  { lugar: 'Supermercado', tiempo: '5 min', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> },
  { lugar: 'Colegios', tiempo: '8 min', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg> },
]

const EQUIP_ICONS: Record<string, string> = {
  'Mesones de granito': '◈', 'Horno empotrado': '♨', 'Microondas': '◉', 'Campana extractora': '▲',
  'Heladera': '❄', 'Lavavajillas': '◎', 'Lavadora': '◐', 'Secadora': '◑',
  'Aire acondicionado': '❅', 'Closets empotrados': '▣', 'Calefón': '♦', 'Box de baño en vidrio': '◻',
  'Cerradura digital': '⬡', 'Aislamiento acústico': '◈', 'Intercomunicador': '◉',
}

// All gallery images for lightbox
const GALLERY_IMAGES = [
  { src: '/condado-vi/vista-aerea.jpg', alt: 'Vista aérea de Condado VI y Equipetrol' },
  { src: '/condado-vi/balcon-plaza-v2.png', alt: 'Vista desde balcón hacia Plaza Italia' },
  { src: '/condado-vi/lobby-entrada.png', alt: 'Entrada del edificio Condado VI' },
  { src: '/condado-vi/cocina-equipada.png', alt: 'Cocina completamente equipada' },
  { src: '/condado-vi/salon-comedor.png', alt: 'Salón comedor con terraza' },
  { src: '/condado-vi/piscina.png', alt: 'Piscina con vista panorámica' },
  { src: '/condado-vi/gimnasio.png', alt: 'Gimnasio residencial' },
  { src: '/condado-vi/churrasquera.png', alt: 'Churrasquera y terraza' },
  { src: '/condado-vi/salon-eventos.png', alt: 'Salón de eventos' },
  { src: '/condado-vi/fachada-real.jpg', alt: 'Fachada real de Condado VI' },
]

// ─── Lightbox Component ──────────────────────────────────
function Lightbox({ images, startIndex, onClose }: { images: typeof GALLERY_IMAGES; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex)

  const prev = useCallback(() => setIndex(i => (i - 1 + images.length) % images.length), [images.length])
  const next = useCallback(() => setIndex(i => (i + 1) % images.length), [images.length])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose, prev, next])

  // Swipe support for mobile
  const touchStart = useRef(0)
  const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) { diff > 0 ? next() : prev() }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-condado-ebano/95 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close */}
      <button onClick={onClose} className="absolute top-5 right-5 z-10 text-white/70 hover:text-white p-2">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>

      {/* Prev */}
      <button onClick={(e) => { e.stopPropagation(); prev() }} className="absolute left-3 md:left-6 z-10 text-white/50 hover:text-white p-2">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>

      {/* Image */}
      <div className="relative w-full h-full max-w-5xl max-h-[85vh] mx-4 md:mx-12" onClick={(e) => e.stopPropagation()}>
        <Image
          src={images[index].src}
          alt={images[index].alt}
          fill
          className="object-contain"
          sizes="100vw"
          priority
        />
      </div>

      {/* Next */}
      <button onClick={(e) => { e.stopPropagation(); next() }} className="absolute right-3 md:right-6 z-10 text-white/50 hover:text-white p-2">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      {/* Counter */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 font-dm text-sm text-white/50">
        {index + 1} / {images.length}
      </div>
    </div>
  )
}

// ─── Clickable Image (opens lightbox) ────────────────────
function GalleryImage({ src, alt, galleryIndex, onOpen, className = '', aspectClass = '' }: {
  src: string; alt: string; galleryIndex: number; onOpen: (i: number) => void; className?: string; aspectClass?: string
}) {
  return (
    <button
      onClick={() => onOpen(galleryIndex)}
      className={`relative rounded-xl overflow-hidden cursor-zoom-in group block w-full ${className}`}
      style={aspectClass ? { aspectRatio: aspectClass } : undefined}
    >
      <Image src={src} alt={alt} fill className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" sizes="(max-width: 768px) 100vw, 576px" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      {/* Zoom icon hint */}
      <div className="absolute bottom-2 right-2 bg-condado-ebano/50 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </div>
    </button>
  )
}

// ─── Other Components ────────────────────────────────────

function StickyNav({ visible }: { visible: boolean }) {
  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      style={{ backgroundColor: 'rgba(250,247,242,0.95)', backdropFilter: 'blur(8px)' }}
    >
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between border-b border-condado-arena">
        <span className="font-dm font-medium text-sm tracking-wide text-condado-carbon">CONDADO VI</span>
        <a
          href={WA_GENERAL}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-condado-caramelo hover:bg-condado-caramelo-dark text-condado-marfil font-dm font-medium text-xs px-4 py-2 rounded-full transition-colors"
        >
          Escribinos →
        </a>
      </div>
    </nav>
  )
}

function FloatingWA({ visible }: { visible: boolean }) {
  return (
    <a
      href={WA_GENERAL}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed bottom-5 right-5 z-50 bg-condado-caramelo hover:bg-condado-caramelo-dark text-white rounded-full shadow-lg transition-all duration-500 flex items-center gap-2 px-5 py-3.5 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
      }`}
      style={{ boxShadow: '0 4px 20px rgba(184,144,111,0.35)' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      <span className="font-dm text-sm font-medium">Escribinos</span>
    </a>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-condado-arena">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left min-h-[48px]"
      >
        <span className="font-dm font-medium text-condado-carbon text-[17px] leading-snug pr-4">{q}</span>
        <span className={`text-condado-caramelo transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-90' : ''}`}>
          ▸
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-48 pb-5' : 'max-h-0'}`}>
        <p className="font-dm text-condado-piedra text-[15px] leading-relaxed">{a}</p>
      </div>
    </div>
  )
}

function PhotoPlaceholder({ aspect = '4/3', label = 'Foto real', className = '' }: { aspect?: string; label?: string; className?: string }) {
  return (
    <div
      className={`bg-condado-arena/50 rounded-xl flex items-center justify-center ${className}`}
      style={{ aspectRatio: aspect }}
    >
      <span className="font-dm text-xs text-condado-piedra/60 tracking-wider uppercase">{label}</span>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────
export default function CondadoVI() {
  const [showNav, setShowNav] = useState(false)
  const [showWA, setShowWA] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)

  const openLightbox = useCallback((index: number) => setLightbox(index), [])
  const closeLightbox = useCallback(() => setLightbox(null), [])

  // Find gallery index by src
  const galleryIdx = (src: string) => GALLERY_IMAGES.findIndex(g => g.src === src)

  useEffect(() => {
    let waTimeout: NodeJS.Timeout
    const handleScroll = () => {
      const scrollY = window.scrollY
      const viewportH = window.innerHeight
      setShowNav(scrollY > viewportH * 0.8)
      const docH = document.documentElement.scrollHeight
      if (scrollY / (docH - viewportH) > 0.3) setShowWA(true)
    }
    waTimeout = setTimeout(() => setShowWA(true), 3000)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => { window.removeEventListener('scroll', handleScroll); clearTimeout(waTimeout) }
  }, [])

  return (
    <>
      <Head>
        <title>Condado VI Plaza Italia — Tu vida frente a Plaza Italia</title>
        <meta name="description" content="Departamentos completamente equipados frente a Plaza Italia, Equipetrol Centro. 1, 2 y 3 dormitorios. Entrega inmediata. 16 items incluidos." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1A1714" />
      </Head>

      <div
        className={`${playfair.variable} ${dmSans.variable} antialiased bg-condado-marfil text-condado-carbon`}
        style={{ fontFamily: 'var(--font-dm), system-ui, sans-serif' }}
      >
        <StickyNav visible={showNav} />
        <FloatingWA visible={showWA} />
        {lightbox !== null && <Lightbox images={GALLERY_IMAGES} startIndex={lightbox} onClose={closeLightbox} />}

        {/* ═══ 1. HERO ═══ */}
        <div ref={heroRef} className="relative h-screen min-h-[600px] flex flex-col justify-end overflow-hidden">
          <div className="absolute inset-0 bg-condado-ebano">
            <Image src="/condado-vi/balcon-plaza-v2.png" alt="Vista desde el balcón de Condado VI hacia Plaza Italia" fill className="object-cover" priority sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-b from-condado-ebano/30 via-transparent to-condado-ebano/80" />
            <div className="absolute inset-0 bg-condado-ebano/25" />
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-5 md:px-10 pb-12 md:pb-20 w-full">
            <div className="mb-6">
              <span className="inline-block font-dm text-xs tracking-wider uppercase text-condado-marfil bg-condado-ebano/70 backdrop-blur-[4px] border border-condado-marfil/30 rounded-full px-4 py-1.5">
                Edificio terminado — Visitalo hoy
              </span>
            </div>

            <h1 className="font-playfair font-medium text-4xl md:text-6xl lg:text-7xl text-condado-marfil leading-tight mb-4">
              Tu vida frente a<br />Plaza Italia.
            </h1>

            <p className="font-dm text-lg md:text-xl text-condado-arena mb-8 max-w-lg">
              Completamente equipado. Entrega inmediata.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-md">
              <a href={WA_GENERAL} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-condado-caramelo hover:bg-condado-caramelo-dark text-condado-marfil font-dm font-medium text-base text-center rounded-full px-6 py-3.5 transition-colors"
                style={{ boxShadow: '0 4px 20px rgba(184,144,111,0.3)' }}>
                Escribinos por WhatsApp →
              </a>
              <a href={WA_VISITA} target="_blank" rel="noopener noreferrer"
                className="flex-1 border border-condado-marfil/40 hover:border-condado-marfil/70 text-condado-marfil font-dm font-medium text-base text-center rounded-full px-6 py-3.5 transition-colors">
                Agendá tu visita
              </a>
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 animate-bounce">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(250,247,242,0.4)" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          </div>
        </div>

        {/* ═══ 2. LA VISTA ═══ */}
        <section className="bg-white">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-10">
              Esto es lo que ves cada mañana.
            </h2>

            <div className="space-y-2">
              <GalleryImage src="/condado-vi/vista-aerea.jpg" alt="Vista aérea" galleryIndex={galleryIdx('/condado-vi/vista-aerea.jpg')} onOpen={openLightbox} aspectClass="4/3" />
              <div className="grid grid-cols-2 gap-2">
                <GalleryImage src="/condado-vi/balcon-plaza-v2.png" alt="Balcón Plaza Italia" galleryIndex={galleryIdx('/condado-vi/balcon-plaza-v2.png')} onOpen={openLightbox} aspectClass="1/1" />
                <GalleryImage src="/condado-vi/lobby-entrada.png" alt="Entrada edificio" galleryIndex={galleryIdx('/condado-vi/lobby-entrada.png')} onOpen={openLightbox} aspectClass="1/1" />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 3. VIDA COTIDIANA ═══ */}
        <section className="bg-condado-marfil">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-12">
              Diseñado para vivir,<br />no para impresionar.
            </h2>

            <div className="space-y-12 md:space-y-16">
              {/* Block 1 */}
              <div className="md:grid md:grid-cols-2 md:gap-12 md:items-center">
                <GalleryImage src="/condado-vi/cocina-equipada.png" alt="Cocina equipada" galleryIndex={galleryIdx('/condado-vi/cocina-equipada.png')} onOpen={openLightbox} aspectClass="4/3" className="mb-6 md:mb-0" />
                <div>
                  <h3 className="font-dm font-medium text-xl text-condado-carbon mb-3">&ldquo;Llegás y está todo&rdquo;</h3>
                  <p className="font-dm text-[17px] text-condado-piedra leading-relaxed">
                    Cocina completa con mesones de granito, horno, microondas, heladera, lavavajillas, lavadora y secadora. 16 items incluidos. Solo traé tu ropa.
                  </p>
                </div>
              </div>

              <div className="border-t border-condado-arena" />

              {/* Block 2 */}
              <div className="md:grid md:grid-cols-2 md:gap-12 md:items-center">
                <GalleryImage src="/condado-vi/salon-comedor.png" alt="Espacios amplios" galleryIndex={galleryIdx('/condado-vi/salon-comedor.png')} onOpen={openLightbox} aspectClass="4/3" className="mb-6 md:mb-0 md:order-2" />
                <div className="md:order-1">
                  <h3 className="font-dm font-medium text-xl text-condado-carbon mb-3">&ldquo;Espacios que respiran&rdquo;</h3>
                  <p className="font-dm text-[17px] text-condado-piedra leading-relaxed">
                    Desde 62 m² en 1 dormitorio hasta 144 m² en 3 dormitorios — 19% más espacio que el promedio de Equipetrol Centro. Ambientes amplios pensados para vivir cómodo, no para maximizar m² vendibles.
                  </p>
                </div>
              </div>

              <div className="border-t border-condado-arena" />

              {/* Block 3 */}
              <div className="md:grid md:grid-cols-2 md:gap-12 md:items-center">
                <GalleryImage src="/condado-vi/lobby-entrada.png" alt="Plaza Italia" galleryIndex={galleryIdx('/condado-vi/lobby-entrada.png')} onOpen={openLightbox} aspectClass="4/3" className="mb-6 md:mb-0" />
                <div>
                  <h3 className="font-dm font-medium text-xl text-condado-carbon mb-3">&ldquo;La plaza es tu jardín&rdquo;</h3>
                  <p className="font-dm text-[17px] text-condado-piedra leading-relaxed">
                    Plaza Italia está cruzando la calle. Salí a caminar, paseá con tu mascota, despejate. A 30 segundos de tu puerta, sin subir al auto.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-12 text-center">
              <a href={WA_GENERAL} target="_blank" rel="noopener noreferrer"
                className="inline-block font-dm text-base text-condado-caramelo hover:text-condado-caramelo-dark border-b border-condado-caramelo hover:border-condado-caramelo-dark transition-colors pb-0.5">
                ¿Querés conocerlo? →
              </a>
            </div>
          </div>
        </section>

        {/* ═══ 4. UBICACION ═══ */}
        <section className="bg-white">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-10">
              Plaza Italia.<br />Tu nuevo vecindario.
            </h2>

            <GalleryImage src="/condado-vi/vista-aerea.jpg" alt="Vista aérea Plaza Italia" galleryIndex={galleryIdx('/condado-vi/vista-aerea.jpg')} onOpen={openLightbox} aspectClass="16/10" className="mb-8" />

            <p className="font-dm text-[17px] text-condado-piedra leading-relaxed mb-8 max-w-2xl">
              Condado VI está literalmente frente a Plaza Italia, la zona más deseada para vivir en Santa Cruz. A metros de Av. San Martín, restaurantes, colegios y todo el circuito comercial de Equipetrol.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {DISTANCIAS.map((d) => (
                <div key={d.lugar} className="bg-condado-marfil rounded-xl p-5 flex flex-col items-center text-center">
                  <span className="text-condado-caramelo mb-2">{d.icon}</span>
                  <span className="font-dm font-medium text-lg text-condado-carbon block">{d.tiempo}</span>
                  <span className="font-dm text-sm text-condado-piedra tracking-wide">{d.lugar}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 5. TIPOLOGIAS + TESTIMONIO ═══ */}
        <section className="bg-condado-marfil">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-10">
              Encontrá el espacio que<br />se ajusta a tu vida.
            </h2>

            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:overflow-visible scrollbar-hide">
              {TIPOLOGIAS.map((t) => (
                <div key={t.dorms} className="min-w-[300px] md:min-w-0 snap-center bg-white rounded-xl border border-condado-arena flex flex-col overflow-hidden"
                  style={{ boxShadow: '0 2px 12px rgba(44,40,36,0.06)' }}>
                  <div className="relative bg-condado-ebano" style={{ aspectRatio: '4/3' }}>
                    <Image src={t.planta} alt={`Planta ${t.dorms}`} fill className="object-contain" sizes="(max-width: 768px) 300px, 384px" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-dm font-medium text-xl text-condado-carbon mb-1">{t.dorms}</h3>
                    <p className="font-dm text-base text-condado-piedra mb-1">{t.m2}</p>
                    <p className="font-dm font-medium text-lg text-condado-carbon mb-2">
                      Desde {t.precio} <span className="text-sm text-condado-piedra font-normal">USD (TC paralelo)</span>
                    </p>
                    <p className="font-dm text-[15px] text-condado-piedra mb-5 flex-1">{t.desc}</p>
                    <a href={t.wa} target="_blank" rel="noopener noreferrer"
                      className="block w-full bg-condado-caramelo hover:bg-condado-caramelo-dark text-condado-marfil font-dm font-medium text-base text-center rounded-full py-3.5 transition-colors">
                      Escribinos por WhatsApp →
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <p className="font-dm text-sm text-condado-piedra mt-4">
              * Precios en USD. Se recibe al tipo de cambio paralelo vigente.
            </p>

            <blockquote className="mt-12 md:mt-16 border-l-2 border-condado-caramelo pl-6 max-w-2xl mx-auto">
              <p className="font-playfair text-xl md:text-2xl text-condado-carbon italic leading-relaxed">
                &ldquo;Llegamos con las maletas y no tuvimos que comprar nada. La cocina, la lavadora, todo estaba listo. Salimos a caminar a la plaza esa misma tarde.&rdquo;
              </p>
              <footer className="mt-3 font-dm text-base text-condado-piedra">
                — Residente Condado, Equipetrol
              </footer>
            </blockquote>
          </div>
        </section>

        {/* ═══ 6. EQUIPAMIENTO ═══ */}
        <section className="bg-white">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-10">
              Cada detalle pensado para<br />que no te falte nada.
            </h2>

            {Object.entries(EQUIPAMIENTO).map(([category, items]) => (
              <div key={category} className="mb-8">
                <span className="font-dm text-sm font-medium tracking-widest uppercase text-condado-caramelo mb-4 block">
                  {category}
                </span>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {items.map((item) => (
                    <div key={item} className="flex items-center gap-3 bg-condado-marfil rounded-lg px-4 py-3.5">
                      <span className="text-condado-caramelo text-base">{EQUIP_ICONS[item] || '◆'}</span>
                      <span className="font-dm text-[15px] text-condado-carbon">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="bg-condado-ebano rounded-xl p-6 md:p-8 mt-8">
              <p className="font-dm text-condado-marfil text-lg md:text-xl leading-relaxed">
                Lo que en otros edificios de la zona cuesta <span className="text-condado-caramelo font-medium">$3,000 a $5,000 USD</span> adicionales, acá ya está incluido.
              </p>
            </div>

            <div className="mt-8 text-center">
              <a href={WA_GENERAL} target="_blank" rel="noopener noreferrer"
                className="inline-block font-dm text-base text-condado-caramelo hover:text-condado-caramelo-dark border-b border-condado-caramelo hover:border-condado-caramelo-dark transition-colors pb-0.5">
                Todo incluido. ¿Querés verlo? →
              </a>
            </div>
          </div>
        </section>

        {/* ═══ 7. AMENIDADES ═══ */}
        <section className="bg-condado-marfil">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-3">
              7 amenidades. Pocos vecinos.<br />Las que importan, sin la multitud.
            </h2>
            <p className="font-dm text-[17px] text-condado-piedra mb-10 max-w-xl leading-relaxed">
              En torres grandes, las amenidades son para el brochure — la piscina llena, el gimnasio en fila, las expensas por las nubes. Acá cada espacio se usa, se cuida, y se paga lo justo.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {AMENIDADES.map((amenidad, i) => {
                const photo = AMENIDAD_PHOTOS[amenidad]
                const isLast = i === AMENIDADES.length - 1
                const gIdx = photo ? galleryIdx(photo) : -1
                return (
                  <div key={amenidad} className={isLast ? 'col-span-2 md:col-span-1' : ''}>
                    {photo ? (
                      <GalleryImage src={photo} alt={amenidad} galleryIndex={gIdx} onOpen={openLightbox} aspectClass={isLast ? '2/1' : '1/1'} className="mb-2" />
                    ) : (
                      <PhotoPlaceholder aspect={isLast ? '2/1' : '1/1'} label={amenidad} className="mb-2" />
                    )}
                    <span className="font-dm text-base text-condado-carbon">{amenidad}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ═══ 8. CONSTRUCTORA ═══ */}
        <section className="bg-white">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-12">
              5 edificios en Equipetrol.<br />Todos entregados.
            </h2>

            <div className="relative pl-8 max-w-md">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-condado-arena" />
              {TIMELINE.map((item) => (
                <div key={item.nombre} className="relative mb-8 last:mb-0">
                  <div
                    className={`absolute -left-8 top-1 rounded-full border-2 ${item.active ? 'w-5 h-5 bg-condado-caramelo border-condado-caramelo' : 'w-3 h-3 bg-condado-arena border-condado-arena'}`}
                    style={item.active ? { boxShadow: '0 0 12px rgba(184,144,111,0.4)', marginLeft: '-4px', marginTop: '-4px' } : {}}
                  />
                  <div>
                    <span className={`font-dm block ${item.active ? 'font-medium text-condado-carbon text-lg' : 'text-condado-piedra text-base'}`}>{item.nombre}</span>
                    <span className={`font-dm ${item.active ? 'text-sm text-condado-caramelo font-medium uppercase tracking-wider' : 'text-sm text-condado-piedra'}`}>{item.estado}</span>
                  </div>
                </div>
              ))}
            </div>

            <GalleryImage src="/condado-vi/fachada-real.jpg" alt="Fachada real Condado VI" galleryIndex={galleryIdx('/condado-vi/fachada-real.jpg')} onOpen={openLightbox} aspectClass="4/3" className="mt-10 max-w-md" />

            <p className="font-dm text-[17px] text-condado-piedra mt-6 max-w-lg leading-relaxed">
              Cada edificio entregado a tiempo y como se prometió. Tu compra está respaldada por una trayectoria real.
            </p>

            <div className="mt-8">
              <a href={WA_GENERAL} target="_blank" rel="noopener noreferrer"
                className="inline-block bg-condado-caramelo hover:bg-condado-caramelo-dark text-condado-marfil font-dm font-medium text-base rounded-full px-6 py-3.5 transition-colors"
                style={{ boxShadow: '0 4px 20px rgba(184,144,111,0.3)' }}>
                Escribinos por WhatsApp →
              </a>
            </div>
          </div>
        </section>

        {/* ═══ 9. FAQ ═══ */}
        <section className="bg-condado-marfil">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-carbon mb-10">
              Preguntas frecuentes
            </h2>
            <div className="max-w-2xl">
              {FAQS.map((faq) => <FaqItem key={faq.q} q={faq.q} a={faq.a} />)}
            </div>
          </div>
        </section>

        {/* ═══ 10. FOOTER ═══ */}
        <section className="bg-condado-ebano">
          <div className="max-w-6xl mx-auto px-5 md:px-10 py-16 md:py-24 text-center">
            <h2 className="font-playfair text-3xl md:text-4xl text-condado-marfil mb-8">
              Solo falta que lo conozcas.
            </h2>

            <a href={WA_GENERAL} target="_blank" rel="noopener noreferrer"
              className="inline-block bg-condado-caramelo hover:bg-condado-caramelo-dark text-condado-marfil font-dm font-medium text-lg rounded-full px-8 py-4 transition-colors mb-6"
              style={{ boxShadow: '0 4px 20px rgba(184,144,111,0.3)' }}>
              Escribinos por WhatsApp →
            </a>

            <div className="space-y-2">
              <a href="tel:+59177030100" className="block font-dm text-condado-piedra hover:text-condado-arena transition-colors text-base">
                +591 77030100
              </a>
              <p className="font-dm text-sm text-condado-piedra/60">
                Precios en USD al tipo de cambio paralelo vigente
              </p>
            </div>

            <div className="border-t border-condado-piedra/20 mt-10 pt-6">
              <p className="font-dm text-sm text-condado-piedra/40">
                Constructora Condado — Equipetrol Centro, Santa Cruz de la Sierra
              </p>
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .font-playfair { font-family: var(--font-playfair), Georgia, serif; }
        .font-dm { font-family: var(--font-dm), system-ui, sans-serif; }
      `}</style>
    </>
  )
}
