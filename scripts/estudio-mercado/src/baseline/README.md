# Baseline Framework — Reportes públicos trimestrales

Framework para generar los reportes **públicos** trimestrales de mercado (actualmente: baseline Equipetrol). Vive en paralelo al framework de estudios privados por cliente (`src/generate.ts` + `src/tools/` + `src/html/`), sin tocar nada de ese lado.

## Diferencias vs framework clientes (no mezclar)

| | Clientes (intocable) | Baseline (acá) |
|---|---|---|
| TC | `config_global` | `obtener_tc_actuales()` Binance |
| Filtros antigüedad | Sin límite (corpus completo) | 300d entrega, 730d preventa, 150d alquiler |
| Scope | Un proyecto focal | Multi-zona, multi-tipología |
| Config | `ClientConfig` con inventory, precioM2Billete, etc | `BaselineConfig` simple (zonas, fechaCorte) |
| Narrativa | Hardcodeada en HTML | Markdown parametrizado con `{{vars}}` |
| Comando | `npm run generate` | `npm run report:baseline` |

**Regla:** no importar desde `src/*.ts` del framework clientes. El baseline es self-contained en `src/baseline/`.

## Estructura

```
src/baseline/
├── db-baseline.ts            # fetchTC Binance + queryVenta/Alquiler con filtros antigüedad
├── types-baseline.ts         # tipos de outputs de tools + BaselineResult
├── generate-baseline.ts      # orquestador: fetchTC → tools → narrativa → HTML
├── config/
│   └── equipetrol-abril-2026.ts
├── tools/                    # 6 tools multizona
│   ├── panorama-multizona.ts
│   ├── demanda-multizona.ts
│   ├── precios-zona-dorms.ts
│   ├── top-proyectos.ts
│   ├── rotacion-multizona.ts
│   └── alquiler-multizona.ts
├── narrativa/
│   ├── equipetrol.md         # copy editorial parametrizado
│   └── loader.ts             # parser MD + renderTemplate({{var}})
└── html/
    ├── shell-baseline.ts     # doctype + head + TOC + mini-TOC
    ├── styles.ts             # CSS completo inline
    ├── brand.ts              # isotipo Simón SVG (3 variantes)
    ├── labels.ts             # dormLabel, zonaLong, zonaShort
    ├── charts.ts             # Chart.js — no usado actualmente
    └── sections/             # 11 secciones HTML
        ├── cover.ts
        ├── tres-lecturas.ts
        ├── metodologia.ts
        ├── vistazo.ts
        ├── submercados.ts
        ├── oferta.ts
        ├── precios.ts
        ├── concentracion.ts
        ├── alquiler.ts
        ├── limites.ts
        ├── cta-producto.ts
        └── ficha.ts
```

## Cómo correr

```bash
npm run report:baseline                        # default: equipetrol-abril-2026
npm run report:baseline equipetrol-julio-2026  # edición diferente
```

Lee la config, corre las 6 tools en paralelo, carga la narrativa con placeholders y escribe el HTML final a `public/reports/{outputFilename}.html`.

## Agregar edición nueva

1. **Config nueva** — copiar `config/equipetrol-abril-2026.ts` → `config/equipetrol-julio-2026.ts`. Ajustar `fechaCorte`, `fechaCorteISO`, `edicion`, `outputFilename`. Mantener `narrativaFile` si el copy no cambia (`'equipetrol'`) o apuntar a un MD distinto si cambia la voz editorial.

2. **Narrativa (opcional)** — si la voz editorial cambia, copiar `narrativa/equipetrol.md` → `narrativa/equipetrol-julio.md` y ajustar `config.narrativaFile = 'equipetrol-julio'`.

3. **Ejecutar** — `npm run report:baseline equipetrol-julio-2026`.

## Editar narrativa sin tocar código

`narrativa/equipetrol.md` usa formato `## key` + bloques de texto con placeholders `{{var}}`. Los valores los rellena `generate-baseline` con data real de las tools. Si un placeholder no tiene valor, se loguea warning sin romper.

Secciones editables sin tocar TS:
- `hero.eyebrow`, `hero.title`, `hero.subtitle`
- `s1.reader_note_*`, `s1.tesis_N.title/quote/body`
- `s2.*` (universo, filtros, TC, antigüedad, fechas corte)
- `s3.nota_estado`
- `s4.perfil.{ZonaCanonica}` — uno por zona
- `s6.lead`, `s6.lectura_*`
- `s7.concentracion_*`
- `s8.*` (anomalía amoblado, caveat, lead)
- `s9.no_presentamos` (JSON array), `s9.agenda` (JSON array)
- `cta.*` (kicker, title, body, button, meta)
- `s10.ficha` (JSON array)
- `footer.*`

## Integraciones

- **Supabase**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en `.env`
- **TC**: RPC `obtener_tc_actuales()` — Binance P2P cache daily
- **Data sources**: `propiedades_v2` (ventas + alquileres), `proyectos_master` (top proyectos en §7)

## Output

- HTML autocontenido (~85 KB) en `public/reports/{outputFilename}.html`
- SVG inline para todos los gráficos (sin Chart.js, sin dependencias JS externas)
- Font Google (Figtree + DM Sans) vía preconnect
- OG image SVG en `public/og/{outputFilename.svg}`

## Validación

No hay tests automáticos. Validación por paridad visual con draft anterior + typecheck:

```bash
npx tsc --noEmit   # debe dar exit 0
npm run report:baseline
# abrir en browser y comparar con edición previa
```

## Referencias

- **Decisiones editoriales**: `docs/baseline/LEARNINGS_EQUIPETROL_BASELINE.md`
- **Zonas canonical**: `docs/canonical/ZONAS_EQUIPETROL.md`
- **Filtros mercado**: `docs/reports/FILTROS_CALIDAD_MERCADO.md`
- **Límites data fiduciaria**: `docs/canonical/LIMITES_DATA_FIDUCIARIA.md`
