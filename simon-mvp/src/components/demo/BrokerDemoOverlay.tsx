// Overlay completo del modo Demo Broker (/broker/demo). Encapsula:
//  - Listener global de clicks sobre links wa.me (interceptados → modal)
//  - Listener para evento custom 'simon:demo-blocked' (lo emite ventas.tsx
//    cuando intenta enviar shortlist en demo)
//  - Modal educativo controlado por el contexto del bloqueo
//  - Bottom sheet intro auto-abierto la primera visita (cookie distinta a
//    la del cliente final para que el broker prospect lo vea aunque ya
//    haya visto /b/demo antes)
//  - Pill flotante "🎯 Modo Demo" con CTA "Activá tu cuenta"
//  - Pill flotante "ⓘ ¿Cómo funciona?" para reabrir intro
//
// Single touch en ventas.tsx/alquileres.tsx: solo necesitan renderizar
// <BrokerDemoOverlay /> cuando brokerDemoMode + emitir evento custom desde
// el catch del handleSendShortlist.

import { useEffect, useState } from 'react'
import DemoModalEducational from './DemoModalEducational'
import BrokerDemoIntroSheet from './BrokerDemoIntroSheet'
import { buildWhatsAppURL } from '@/lib/whatsapp'
import {
  FOUNDER_WHATSAPP,
  getDemoCTAMessage,
  type DemoCTAContext,
} from '@/lib/demo-config'

const BROKER_INTRO_COOKIE = 'simon_demo_broker_intro_seen'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=')[1] || '') : null
}

function writeCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return
  const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`
}

const FALLBACK_CONTEXT: DemoCTAContext = 'contactar_captador'

interface ModalContent {
  title: string
  body: string
  context: DemoCTAContext
}

const MODAL_CONTENTS: Record<string, ModalContent> = {
  contactar_captador: {
    title: 'Captador disponible en versión real',
    body: 'En tu cuenta activa, este botón te conecta directo con el broker captador original de la propiedad con un mensaje pre-armado.',
    context: 'contactar_captador',
  },
  enviar_shortlist: {
    title: 'Así le llega a tu cliente',
    body: 'En tu cuenta activa, tu cliente recibe un link con el logo de tu franquicia, tu foto y tu WhatsApp directo. Te abrimos un ejemplo armado por nosotros (con propiedades distintas a las que marcaste, pero el formato es idéntico) para que veas cómo se ve.',
    context: 'enviar_shortlist',
  },
  guardar_favorito: {
    title: 'Tu panel real guarda todo',
    body: 'En la versión real tus favoritos y selecciones quedan guardadas entre sesiones. Hoy en demo se ven en pantalla pero no se persisten.',
    context: 'guardar_favorito',
  },
}

export default function BrokerDemoOverlay() {
  const [introOpen, setIntroOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalContent, setModalContent] = useState<ModalContent>(MODAL_CONTENTS.contactar_captador)

  // Intro auto-abierto primera visita.
  useEffect(() => {
    if (readCookie(BROKER_INTRO_COOKIE)) return
    const t = window.setTimeout(() => setIntroOpen(true), 400)
    return () => window.clearTimeout(t)
  }, [])

  const closeIntro = () => {
    setIntroOpen(false)
    writeCookie(BROKER_INTRO_COOKIE, '1', 365)
  }

  // Listener global de clicks sobre wa.me. Captura phase para correr antes
  // de que el browser navegue al target="_blank".
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const link = target.closest('a[href*="wa.me/"]') as HTMLAnchorElement | null
      if (!link) return
      // Excluir el botón "Hablá con Luis" del banner demo (también es wa.me).
      // Le ponemos data-attr para skipear la intercepción.
      if (link.dataset.demoBypass === '1') return
      e.preventDefault()
      e.stopPropagation()
      setModalContent(MODAL_CONTENTS.contactar_captador)
      setModalOpen(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Listener para acciones bloqueadas que emiten ventas.tsx/alquileres.tsx
  // (ej. enviar shortlist, guardar favorito).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ context?: string }>).detail
      const ctxKey = detail?.context && MODAL_CONTENTS[detail.context] ? detail.context : FALLBACK_CONTEXT
      setModalContent(MODAL_CONTENTS[ctxKey])
      setModalOpen(true)
    }
    window.addEventListener('simon:demo-blocked', handler)
    return () => window.removeEventListener('simon:demo-blocked', handler)
  }, [])

  const founderWaUrl = buildWhatsAppURL(FOUNDER_WHATSAPP, getDemoCTAMessage('watermark_top'))

  return (
    <>
      <div className="bdo-top-banner" role="status" aria-label="Modo Demo activo">
        <button
          type="button"
          className="bdo-banner-tag"
          onClick={() => setIntroOpen(true)}
          aria-label="Ver guía: qué es el modo demo y cómo usarlo"
          title="Click para ver cómo usar el demo"
        >
          <span aria-hidden="true">🎯</span>
          <span className="bdo-banner-tag-text">Modo Demo</span>
          <span className="bdo-banner-tag-info" aria-hidden="true">ⓘ</span>
        </button>
        <span className="bdo-banner-pipe" aria-hidden="true">·</span>
        <span className="bdo-banner-text">Activá tu cuenta para acceso real</span>
        <a
          href={founderWaUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-demo-bypass="1"
          className="bdo-banner-cta"
        >
          Activá tu cuenta
        </a>
      </div>

      <BrokerDemoIntroSheet isOpen={introOpen} onClose={closeIntro} />

      <DemoModalEducational
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        context={modalContent.context}
        title={modalContent.title}
        body={modalContent.body}
        customPrimary={modalContent.context === 'enviar_shortlist' ? {
          label: 'Ver el ejemplo →',
          onClick: () => {
            setModalOpen(false)
            window.open('/b/demo?ref=demo-broker', '_blank', 'noopener,noreferrer')
          },
        } : undefined}
        footerLink={modalContent.context === 'enviar_shortlist' ? {
          label: '¿Querés activar tu cuenta? Hablá con el founder →',
          onClick: () => {
            window.open(founderWaUrl, '_blank', 'noopener,noreferrer')
          },
        } : undefined}
      />

      {/* Empuja los banners broker existentes 32px abajo para hacerle lugar
          al banner demo top:0. Aplica global porque los banners están en
          <style jsx> scoped en ventas.tsx/alquileres.css. */}
      <style jsx global>{`
        .vt-broker-banner { top: 32px !important; }
        .alq-broker-banner { top: 32px !important; }
      `}</style>

      <style jsx>{`
        /* Banner demo arena (#EDE8DC) — contraste con el banner broker
           oscuro abajo, sin competir con verdes (chip TC y otros). */
        .bdo-top-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 32px;
          background: #EDE8DC;
          color: #141414;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 0 12px;
          border-bottom: 1px solid rgba(20, 20, 20, 0.08);
          /* z-index 100 — encima del banner broker (60) pero DEBAJO de
             bottom sheets (500+) y modales (200+). Cuando el broker
             prospect abre un sheet, el banner demo queda tapado por el
             overlay del sheet y la X/CTAs del sheet son clickeables. */
          z-index: 100;
          white-space: nowrap;
        }
        .bdo-banner-tag {
          background: transparent;
          color: #141414;
          border: 1px solid rgba(20, 20, 20, 0.25);
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-family: inherit;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          line-height: 1;
          transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
        }
        .bdo-banner-tag:hover {
          background: rgba(20, 20, 20, 0.06);
          border-color: rgba(20, 20, 20, 0.45);
          transform: translateY(-1px);
        }
        .bdo-banner-tag-text {
          letter-spacing: 0.5px;
        }
        .bdo-banner-tag-info {
          font-size: 12px;
          opacity: 0.7;
          margin-left: 1px;
        }
        .bdo-banner-pipe {
          color: rgba(20, 20, 20, 0.25);
        }
        .bdo-banner-text {
          color: rgba(20, 20, 20, 0.7);
          font-size: 12px;
        }
        .bdo-banner-cta {
          background: #141414;
          color: #EDE8DC;
          padding: 4px 12px;
          border-radius: 999px;
          text-decoration: none;
          font-weight: 600;
          letter-spacing: 0.2px;
          font-size: 11px;
          line-height: 1.4;
          transition: background 160ms ease, transform 160ms ease;
        }
        .bdo-banner-cta:hover {
          background: #2a2a2a;
          transform: translateY(-1px);
        }
        @media (max-width: 640px) {
          .bdo-top-banner {
            font-size: 11px;
            gap: 6px;
            padding: 0 8px;
          }
          .bdo-banner-text {
            display: none;
          }
          .bdo-banner-tag {
            font-size: 10px;
            padding: 3px 8px;
          }
          .bdo-banner-cta {
            font-size: 10.5px;
            padding: 3px 10px;
          }
        }
      `}</style>
    </>
  )
}
