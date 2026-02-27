# Simón Landing Page - Roadmap de Implementación

**Fecha:** 10 Enero 2026
**Prototipo visual:** `docs/design/LANDING_PROTOTIPO_V1.html`
**Stack:** Next.js + React + Tailwind CSS + Supabase

---

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| Secciones totales | 12 |
| % Construible MVP | ~65% |
| Funciones backend existentes | 8 |
| Sprints estimados | 4 |

---

## Plan de Sprints

### Sprint 1-2: MVP Landing (ACTUAL)

**Objetivo:** Landing funcional con data real y lead capture.

#### Secciones a implementar:

| Sección | % Backend | Prioridad |
|---------|-----------|-----------|
| Hero + Match Card | 90% | P0 |
| Problem Section | 100% (estático) | P0 |
| 3 Steps | 100% (estático) | P0 |
| Who Is It For | 100% (estático) | P0 |
| Why Equipetrol | 100% (estático) | P0 |
| Report Example | 85% | P0 |
| Premium Modal | 60% | P1 |
| Market Lens (parcial) | 35% | P1 |
| Lead Capture | 100% | P0 |

#### Dependencias backend (ya existen):
- `analisis_mercado_fiduciario()`
- `generar_resumen_fiduciario()`
- `v_metricas_mercado`
- `tc_binance_historial`

#### Archivos a crear:
```
simon-mvp/src/
├── pages/
│   └── index.tsx                    # Landing page principal
├── components/
│   └── landing/
│       ├── Navbar.tsx
│       ├── Hero.tsx
│       ├── MatchCard.tsx
│       ├── ProblemSection.tsx
│       ├── StepsSection.tsx
│       ├── WhoSection.tsx
│       ├── WhyEquipetrol.tsx
│       ├── ReportExample.tsx
│       ├── ProfileBox.tsx
│       ├── ChartCard.tsx
│       ├── PropertyCard.tsx
│       ├── LeadForm.tsx
│       ├── PremiumSection.tsx
│       ├── PremiumModal.tsx
│       ├── MarketLens.tsx
│       ├── CTAFinal.tsx
│       └── Footer.tsx
├── lib/
│   └── supabase.ts                  # Cliente Supabase
├── hooks/
│   └── useMarketData.ts             # Hook para data de mercado
└── types/
    └── landing.ts                   # Tipos TypeScript
```

---

### Sprint 3-4: V2 Completo

**Objetivo:** Premium Modal completo + Market View.

| Feature | Dependencia |
|---------|-------------|
| Premium Modal - Escenario Financiero | `liquidez_proyecto`, `renta_estimada` |
| Premium Modal - Mapa Vida Real | Data cualitativa de zonas |
| Market View - Microzonas | `obtener_metricas_zona()` |
| Market View - Oportunidades | Extensión `detectar_senales_alerta()` |
| `calcular_confianza_datos()` | Nueva función SQL |

---

### V3: Futuro

| Feature | Dependencia |
|---------|-------------|
| Historial precios | Nueva tabla `historial_precios` |
| Tendencias | Tracking de demanda |
| Insight del día | Generación IA |

---

## Descartado (No implementar)

- Riesgos esenciales (requiere data cualitativa manual)
- Insight del día (requiere IA generativa)

---

## Arquitectura Técnica

### Paleta de Colores (Tailwind)

```javascript
// Extender tailwind.config.js
colors: {
  brand: {
    primary: '#3B82F6',    // Azul principal
    dark: '#0F172A',       // Negro/azul oscuro
  },
  state: {
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  }
}
```

### Fuentes

- **Títulos:** Outfit (Google Fonts)
- **Cuerpo:** Inter (ya instalada)

### Componentes de UI

| Componente | Variantes |
|------------|-----------|
| Button | primary, secondary, outline, gold |
| Card | default, dark, premium |
| Badge | success, warning, danger, neutral |
| Chart | bar, progress, donut |

---

## Data Flow

```
Landing Page
    │
    ├─► Hero (estático)
    │
    ├─► Report Example
    │       │
    │       └─► useMarketData() ─► Supabase RPC
    │               │
    │               ├─► analisis_mercado_fiduciario()
    │               ├─► v_metricas_mercado
    │               └─► tc_binance_historial
    │
    ├─► Market Lens
    │       │
    │       └─► useLensData() ─► Supabase
    │               │
    │               ├─► propiedades_v2 (últimas 24h)
    │               └─► tc_binance_historial
    │
    └─► Lead Form
            │
            └─► submitLead() ─► Supabase Insert
                    │
                    └─► tabla: leads
```

---

## Decisiones Técnicas

1. **Server-side vs Client-side rendering:**
   - Landing: SSG (Static Site Generation)
   - Report Example: Client-side con loading states
   - Market Lens: Client-side con polling cada 5 min

2. **Secciones Premium con badge "Próximamente":**
   - Escenario Financiero (Sección 6)
   - Mapa de Vida Real (Sección 7)

3. **Iconos:** Phosphor Icons (CDN o npm)

4. **Animaciones:** Framer Motion (ya instalado)

---

## Métricas de Éxito MVP

- [ ] Landing carga en < 3s
- [ ] Report Example muestra data real de BD
- [ ] Market Lens muestra snapshot 24h
- [ ] Lead form guarda en Supabase
- [ ] Responsive en mobile

---

## Commits Incrementales

1. `feat(landing): estructura base y navbar`
2. `feat(landing): hero section con match card`
3. `feat(landing): secciones estáticas (problem, steps, who, why)`
4. `feat(landing): report example con data real`
5. `feat(landing): premium modal con badges próximamente`
6. `feat(landing): market lens parcial`
7. `feat(landing): lead capture funcional`
8. `feat(landing): footer y ajustes finales`
