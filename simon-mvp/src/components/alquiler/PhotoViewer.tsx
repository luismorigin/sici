import { useState, useEffect, useRef, useCallback } from 'react'

interface PhotoViewerProps {
  photos: string[]
  initialIndex: number
  buildingName: string
  subtitle: string
  onClose: () => void
}

export default function PhotoViewer({ photos, initialIndex, buildingName, subtitle, onClose }: PhotoViewerProps) {
  const [currentIdx, setCurrentIdx] = useState(initialIndex)
  const [controlsVisible, setControlsVisible] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll to initial photo on mount
  useEffect(() => {
    const el = scrollRef.current
    if (el && initialIndex > 0) {
      el.scrollTo({ left: initialIndex * el.offsetWidth, behavior: 'instant' as ScrollBehavior })
    }
  }, [initialIndex])

  // Track current slide via scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        if (!el) { ticking = false; return }
        const idx = Math.round(el.scrollLeft / el.offsetWidth)
        setCurrentIdx(idx)
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-hide controls after 3s
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setControlsVisible(true)
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [resetHideTimer])

  // Keyboard: Escape to close, arrows to navigate
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && currentIdx > 0) {
        scrollRef.current?.scrollTo({ left: (currentIdx - 1) * scrollRef.current.offsetWidth, behavior: 'smooth' })
      }
      if (e.key === 'ArrowRight' && currentIdx < photos.length - 1) {
        scrollRef.current?.scrollTo({ left: (currentIdx + 1) * scrollRef.current.offsetWidth, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIdx, photos.length, onClose])

  // Prevent body scroll while viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function handleTap() {
    setControlsVisible(prev => !prev)
    if (!controlsVisible) resetHideTimer()
  }

  function goTo(idx: number) {
    scrollRef.current?.scrollTo({ left: idx * scrollRef.current!.offsetWidth, behavior: 'smooth' })
    resetHideTimer()
  }

  return (
    <div className="pv-overlay">
      {/* Controls - top */}
      <div className={`pv-top ${controlsVisible ? '' : 'hidden'}`}>
        <button className="pv-close" aria-label="Cerrar visor" onClick={onClose}>&times;</button>
        <div className="pv-counter">{currentIdx + 1} / {photos.length}</div>
      </div>

      {/* Photos */}
      <div className="pv-slides" ref={scrollRef} onClick={handleTap}>
        {photos.map((url, i) => (
          <div key={i} className="pv-slide">
            {url ? (
              <img src={url} alt={`${buildingName} - Foto ${i + 1}`} draggable={false} />
            ) : (
              <div className="pv-no-photo">Sin foto</div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop arrows */}
      {currentIdx > 0 && (
        <button className={`pv-arrow pv-arrow-left ${controlsVisible ? '' : 'hidden'}`} aria-label="Foto anterior" onClick={() => goTo(currentIdx - 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 20, height: 20 }}><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {currentIdx < photos.length - 1 && (
        <button className={`pv-arrow pv-arrow-right ${controlsVisible ? '' : 'hidden'}`} aria-label="Foto siguiente" onClick={() => goTo(currentIdx + 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 20, height: 20 }}><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}

      {/* Caption - bottom */}
      <div className={`pv-caption ${controlsVisible ? '' : 'hidden'}`}>
        <div className="pv-caption-name">{buildingName}</div>
        <div className="pv-caption-sub">{subtitle}</div>
      </div>

      <style jsx>{`
        .pv-overlay {
          position: fixed; inset: 0; z-index: 400; background: #0a0a0a;
          display: flex; flex-direction: column;
        }
        .pv-top {
          position: absolute; top: 0; left: 0; right: 0; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; padding-top: max(16px, env(safe-area-inset-top));
          transition: opacity 0.2s;
        }
        .pv-top.hidden { opacity: 0; pointer-events: none; }
        .pv-close {
          width: 44px; height: 44px; border-radius: 50%;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
          color: #fff; font-size: 22px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .pv-counter {
          background: rgba(10,10,10,0.75); padding: 6px 14px; border-radius: 100px;
          font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.8);
          font-family: 'Manrope', sans-serif;
        }
        .pv-slides {
          flex: 1; display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
          scrollbar-width: none; -webkit-overflow-scrolling: touch;
        }
        .pv-slides::-webkit-scrollbar { display: none; }
        .pv-slide {
          flex: 0 0 100%; display: flex; align-items: center; justify-content: center;
          scroll-snap-align: center; padding: 0 8px;
        }
        .pv-slide img {
          max-width: 100%; max-height: 100%; width: auto; height: auto;
          object-fit: contain; user-select: none; -webkit-user-drag: none;
        }
        @media (orientation: landscape) {
          .pv-slide img {
            width: 100%; height: 100%; max-width: none; max-height: none;
            object-fit: cover;
          }
        }
        .pv-no-photo {
          color: rgba(255,255,255,0.3); font-size: 14px; font-family: 'Manrope', sans-serif;
        }
        .pv-arrow {
          display: none; position: absolute; top: 50%; transform: translateY(-50%);
          width: 48px; height: 48px; border-radius: 50%;
          background: rgba(10,10,10,0.6); border: 1px solid rgba(255,255,255,0.1);
          cursor: pointer; z-index: 2;
          align-items: center; justify-content: center;
          transition: opacity 0.2s;
        }
        .pv-arrow.hidden { opacity: 0; pointer-events: none; }
        .pv-arrow-left { left: 16px; }
        .pv-arrow-right { right: 16px; }
        @media (min-width: 768px) {
          .pv-arrow { display: flex; }
        }
        .pv-caption {
          position: absolute; bottom: 0; left: 0; right: 0; z-index: 2;
          padding: 20px 24px; padding-bottom: max(20px, env(safe-area-inset-bottom));
          background: linear-gradient(transparent, rgba(10,10,10,0.8));
          transition: opacity 0.2s;
        }
        .pv-caption.hidden { opacity: 0; pointer-events: none; }
        .pv-caption-name {
          font-family: 'Cormorant Garamond', serif; font-size: 22px; color: #fff;
          line-height: 1.2; margin-bottom: 2px;
        }
        .pv-caption-sub {
          font-size: 12px; color: rgba(255,255,255,0.6); font-family: 'Manrope', sans-serif;
          letter-spacing: 0.5px;
        }
        @media (prefers-reduced-motion: reduce) {
          .pv-top, .pv-caption, .pv-arrow { transition: none; }
        }
      `}</style>
    </div>
  )
}
