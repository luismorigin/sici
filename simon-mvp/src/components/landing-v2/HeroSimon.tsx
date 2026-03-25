import Link from 'next/link'
import Image from 'next/image'

export default function HeroSimon() {
  return (
    <section className="relative min-h-[620px] md:min-h-[620px] overflow-hidden">
      {/* Background photo */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/skyline-equipetrol.jpg"
          alt="Skyline de Equipetrol"
          fill
          priority
          className="object-cover object-center"
        />
        {/* Arena overlay gradient left-to-right */}
        <div
          className="absolute inset-0 z-[1]"
          style={{
            background: `linear-gradient(
              to right,
              #EDE8DC 0%,
              rgba(237,232,220,0.93) 35%,
              rgba(237,232,220,0.8) 55%,
              rgba(237,232,220,0.55) 75%,
              rgba(237,232,220,0.4) 100%
            )`,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-[3] px-6 md:px-12 py-[100px] max-w-[1100px] mx-auto">
        {/* Pre-headline */}
        <p className="font-s-body font-normal text-[13px] text-s-piedra tracking-[0.5px] uppercase mb-7 flex items-center gap-2.5">
          <PulseDot />
          Inteligencia inmobiliaria · Santa Cruz
        </p>

        {/* Headline */}
        <h1
          className="font-s-display font-medium text-s-negro leading-[1.05] mb-6 max-w-[820px]"
          style={{ fontSize: 'clamp(36px, 5vw, 64px)', letterSpacing: '-1.5px' }}
        >
          ¿Sabés realmente<br />
          cuánto vale<br />
          <span className="text-s-tinta">lo que estás mirando?</span>
        </h1>

        {/* Body */}
        <p
          className="font-s-body font-light text-s-tinta leading-relaxed max-w-[480px] mb-10"
          style={{ fontSize: 'clamp(16px, 1.8vw, 19px)' }}
        >
          Simon analiza el mercado de Equipetrol con datos reales y actualizados todos los días.
          Sin portales desactualizados. Sin consejos de alguien que tiene algo que venderte.
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-3.5 flex-wrap">
          <Link
            href="/alquileres"
            prefetch={false}
            className="font-s-body font-medium text-[15px] text-s-arena bg-s-negro px-8 py-3.5 min-h-[52px] no-underline inline-flex items-center gap-2 rounded-s-btn transition-transform duration-200 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(20,20,20,0.12)]"
          >
            Ver alquileres →
          </Link>
          <Link
            href="/mercado/equipetrol"
            prefetch={false}
            className="font-s-body font-normal text-[15px] text-s-tinta bg-transparent border border-s-arena-mid px-7 py-3.5 min-h-[52px] no-underline inline-flex items-center rounded-s-btn transition-colors hover:border-s-piedra"
          >
            Datos del mercado
          </Link>
        </div>

        {/* Trust bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 mt-10 pt-7 border-t border-s-arena-mid">
          <div className="flex items-center gap-2 font-s-body text-[13px] text-s-piedra font-normal">
            <PulseDot />
            Actualizado hoy
          </div>
          <div className="flex items-center gap-2 font-s-body text-[13px] text-s-piedra font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-s-salvia flex-shrink-0" />
            3 fuentes verificadas
          </div>
          <div className="flex items-center gap-2 font-s-body text-[13px] text-s-piedra font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-s-salvia flex-shrink-0" />
            144 alquileres activos
          </div>
        </div>
      </div>
    </section>
  )
}

function PulseDot() {
  return (
    <>
      <style jsx global>{`
        @keyframes s-dot-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.8); opacity: 0.3; }
        }
        @keyframes s-ring-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .s-pulse-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #3A6A48;
          flex-shrink: 0; position: relative;
          animation: s-dot-pulse 2.5s ease-in-out infinite;
        }
        .s-pulse-dot::after {
          content: ''; position: absolute; inset: -2px; border-radius: 50%;
          border: 1.5px solid #3A6A48;
          animation: s-ring-pulse 2.5s ease-out infinite;
        }
      `}</style>
      <span className="s-pulse-dot" />
    </>
  )
}
