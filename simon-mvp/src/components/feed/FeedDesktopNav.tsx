import Link from 'next/link'

// Nav superior desktop de los feeds (ventas + alquileres).
// Variantes: 'dark' (ventas — fondo negro) y 'light' (alquileres — fondo arena).
// El item Preventa vive dentro de ventas: en /ventas aplica el filtro vía
// onPreventa; desde otros feeds navega a /ventas?preventa=1 (deep-link existente).
// El menú hamburguesa y el perfil reusan los drawers mfd-*/mfp-* de cada página.
export default function FeedDesktopNav({ active, variant, whatsappHref, onPreventa, onComparador, onMenu, onProfile }: {
  active: 'ventas' | 'alquileres'
  variant: 'dark' | 'light'
  whatsappHref: string
  onPreventa?: () => void
  onComparador?: () => void
  onMenu: () => void
  onProfile: () => void
}) {
  return (
    <nav className={`fdn fdn-${variant}`} aria-label="Navegación principal">
      <Link href="/" className="fdn-brand" aria-label="Simon inicio">
        <span className="fdn-logo" aria-hidden="true" />
        <span className="fdn-brand-text">Simon</span>
      </Link>
      <div className="fdn-links">
        {active === 'alquileres'
          ? <span className="fdn-link fdn-link-active">Alquileres</span>
          : <Link href="/alquileres" className="fdn-link">Alquileres</Link>}
        {active === 'ventas'
          ? <span className="fdn-link fdn-link-active">Ventas</span>
          : <Link href="/ventas" className="fdn-link">Ventas</Link>}
        {onPreventa
          ? <button type="button" className="fdn-link" onClick={onPreventa}>Preventa</button>
          : <Link href="/ventas?preventa=1" className="fdn-link">Preventa</Link>}
        <a href="/mercado/equipetrol" className="fdn-link">Mercado</a>
        <div className="fdn-drop">
          <button type="button" className="fdn-link fdn-drop-btn">Simulá y calculá <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div className="fdn-drop-menu">
            <button type="button" className="fdn-drop-item" onClick={onComparador}>Comparador de propiedades</button>
            <span className="fdn-drop-item fdn-drop-soon">Calculadora de renta <em>Próximamente</em></span>
            <span className="fdn-drop-item fdn-drop-soon">Crédito hipotecario <em>Próximamente</em></span>
          </div>
        </div>
      </div>
      <div className="fdn-right">
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="fdn-wa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Hablar por WhatsApp
        </a>
        <button type="button" className="fdn-icon" aria-label="Tu cuenta" onClick={onProfile}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
        </button>
        <button type="button" className="fdn-icon" aria-label="Menú" onClick={onMenu}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      <style jsx>{`
        .fdn { position:fixed; top:0; left:0; right:0; z-index:90; height:56px; display:flex; align-items:center; gap:24px; padding:0 20px; font-family:'DM Sans',sans-serif; }
        .fdn-dark { background:#141414; border-bottom:1px solid rgba(237,232,220,0.08); color:#EDE8DC; }
        .fdn-light { background:#EDE8DC; border-bottom:1px solid #D8D0BC; color:#141414; }
        .fdn-brand { display:flex; align-items:center; gap:8px; text-decoration:none; flex:0 0 auto; }
        .fdn-logo { width:24px; height:24px; border-radius:50%; position:relative; flex:0 0 auto; }
        .fdn-dark .fdn-logo { background:#EDE8DC; }
        .fdn-light .fdn-logo { background:#141414; }
        .fdn-logo::after { content:''; position:absolute; top:4px; left:4px; width:9px; height:9px; border-radius:50%; background:#3A6A48; }
        .fdn-light .fdn-logo::after { background:#7BB389; }
        .fdn-brand-text { font-family:'Figtree',sans-serif; font-size:21px; font-weight:500; letter-spacing:0.2px; }
        .fdn-dark .fdn-brand-text { color:#EDE8DC; }
        .fdn-light .fdn-brand-text { color:#141414; }
        .fdn-links { display:flex; align-items:center; gap:4px; min-width:0; }
        .fdn-link { display:inline-flex; align-items:center; gap:5px; background:none; border:none; cursor:pointer; text-decoration:none; padding:6px 12px; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:14px; white-space:nowrap; }
        .fdn-dark .fdn-link { color:#B8AD9E; }
        .fdn-dark .fdn-link:hover { color:#EDE8DC; background:rgba(237,232,220,0.06); }
        .fdn-light .fdn-link { color:#7A7060; }
        .fdn-light .fdn-link:hover { color:#141414; background:rgba(20,20,20,0.05); }
        .fdn-link-active { font-weight:600; cursor:default; position:relative; }
        .fdn-dark .fdn-link-active { color:#7BB389; }
        .fdn-light .fdn-link-active { color:#3A6A48; }
        .fdn-link-active::after { content:''; position:absolute; left:12px; right:12px; bottom:-1px; height:2px; border-radius:2px; }
        .fdn-dark .fdn-link-active::after { background:#7BB389; }
        .fdn-light .fdn-link-active::after { background:#3A6A48; }
        .fdn-drop { position:relative; }
        .fdn-drop-menu { position:absolute; top:100%; left:0; min-width:250px; padding:6px; border-radius:12px; display:none; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.25); }
        .fdn-dark .fdn-drop-menu { background:#1e1e1e; border:1px solid rgba(237,232,220,0.1); }
        .fdn-light .fdn-drop-menu { background:#FAFAF8; border:1px solid #D8D0BC; }
        .fdn-drop:hover .fdn-drop-menu, .fdn-drop:focus-within .fdn-drop-menu { display:flex; }
        .fdn-drop-item { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; text-align:left; background:none; border:none; cursor:pointer; padding:10px 12px; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:13px; white-space:nowrap; }
        .fdn-dark .fdn-drop-item { color:#EDE8DC; }
        .fdn-dark .fdn-drop-item:hover { background:rgba(237,232,220,0.06); }
        .fdn-light .fdn-drop-item { color:#141414; }
        .fdn-light .fdn-drop-item:hover { background:rgba(20,20,20,0.05); }
        .fdn-drop-soon { cursor:default; opacity:0.55; }
        .fdn-drop-soon:hover { background:none !important; }
        .fdn-drop-soon em { font-style:normal; font-size:10px; font-weight:600; padding:2px 7px; border-radius:100px; letter-spacing:0.2px; }
        .fdn-dark .fdn-drop-soon em { color:#9A8E7A; background:rgba(237,232,220,0.06); border:1px solid rgba(237,232,220,0.12); }
        .fdn-light .fdn-drop-soon em { color:#7A7060; background:rgba(20,20,20,0.04); border:1px solid #D8D0BC; }
        .fdn-right { margin-left:auto; display:flex; align-items:center; gap:6px; flex:0 0 auto; }
        .fdn-wa { display:inline-flex; align-items:center; gap:7px; text-decoration:none; font-size:13px; font-weight:600; padding:8px 14px; border-radius:100px; white-space:nowrap; }
        .fdn-dark .fdn-wa { color:#EDE8DC; border:1px solid rgba(237,232,220,0.22); }
        .fdn-dark .fdn-wa:hover { background:rgba(237,232,220,0.08); }
        .fdn-light .fdn-wa { color:#141414; border:1px solid #C9C0AA; }
        .fdn-light .fdn-wa:hover { background:rgba(20,20,20,0.04); }
        .fdn-icon { width:38px; height:38px; display:flex; align-items:center; justify-content:center; background:none; border:none; cursor:pointer; border-radius:50%; }
        .fdn-dark .fdn-icon { color:#EDE8DC; }
        .fdn-dark .fdn-icon:hover { background:rgba(237,232,220,0.08); }
        .fdn-light .fdn-icon { color:#141414; }
        .fdn-light .fdn-icon:hover { background:rgba(20,20,20,0.05); }
        @media (max-width: 1100px) { .fdn-wa { display:none; } }
      `}</style>
    </nav>
  )
}
