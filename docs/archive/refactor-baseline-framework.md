# Handoff — Refactor framework reporte público baseline

> **Creado:** 21 abril 2026 (fin de sesión)
> **Propósito:** Prompt listo para pegar en sesión nueva que continúe el refactor
> **Estado:** Plan aprobado, implementación pendiente (tareas #6-#10 del sistema)

---

## Prompt para sesión nueva

Copiar el bloque de abajo y pegarlo como primer mensaje en una conversación nueva:

```
Vengo a continuar el refactor del framework del reporte público
"Baseline de Equipetrol Abril 2026". Contexto completo:

ESTADO ACTUAL:
- HTML draft publicable en:
  scripts/estudio-mercado/public/reports/equipetrol-baseline-abril-2026.html
- Datos al 20 abril 2026, corpus 327 unidades venta + 121 alquiler
- Disclaimer sobre inventario estancado (16 listings fuera, ~4.5%) ya agregado
- BD limpia: 7 zonas canónicas, CHECK constraint zona_valida instalado

DECISIONES YA TOMADAS (no rediscutir):
1. Framework baseline va EN PARALELO al framework de clientes en
   scripts/estudio-mercado/src/baseline/. No se toca nada existente
   (db.ts, generate.ts, tools/*.ts, html/*.ts, config/condado-vi.ts).
2. Reporte baseline usa filtros de antigüedad (300/730/150 días) —
   paridad con feed público. Estudios por cliente siguen sin filtro.
3. TC source del baseline: obtener_tc_actuales() de Binance P2P
   (no config_global). Estudios por cliente siguen con config_global.
4. Narrativa editorial separada en markdown parametrizable.

TAREAS YA DEFINIDAS EN EL SISTEMA (#6 a #10):
- #6 Crear baseline/db-baseline.ts + 6 tools en paralelo
- #7 Extraer narrativa a baseline/narrativa/equipetrol.md
- #8 Modularizar template HTML en baseline/html/sections/
- #9 Crear config + generate-baseline.ts + npm script
- #10 Validar paridad numérica + commit

Estimación: 1 día pleno de trabajo concentrado.

DOCS CLAVE para entender contexto:
- docs/backlog/UNIFICACION_MERCADO_DATA.md (Fase 2, 4 superficies)
- docs/backlog/ESTUDIOS_MERCADO_SAAS.md (roadmap producto)
- docs/canonical/LIMITES_DATA_FIDUCIARIA.md (matriz verde/amarillo/rojo)
- docs/reports/FILTROS_CALIDAD_MERCADO.md (filtros canónicos)

Arrancá leyendo TaskList para ver las tareas #6-#10, después leé
el HTML actual para entender la estructura a replicar, y recién ahí
empezá #6. Antes de escribir una línea de código nuevo, confirmame
que tu plan de archivos concretos coincide con lo que las descripciones
de las tareas dicen.
```

---

## Contexto adicional (opcional, leer si hace falta profundizar)

### Arquitectura objetivo

```
scripts/estudio-mercado/src/
├── (todo lo existente INTOCABLE — framework de clientes)
└── baseline/                        ← NUEVO, todo acá
    ├── db-baseline.ts               ← fetchTC Binance + queryVenta con filtros antigüedad
    ├── types-baseline.ts
    ├── generate-baseline.ts
    ├── config/
    │   └── equipetrol-abril-2026.ts
    ├── tools/                       ← 6 tools nuevas
    │   ├── panorama-multizona.ts
    │   ├── demanda-multizona.ts
    │   ├── precios-zona-dorms.ts    ← nueva completa
    │   ├── top-proyectos.ts         ← nueva completa
    │   ├── rotacion-multizona.ts
    │   └── alquiler-multizona.ts    ← nueva completa
    ├── narrativa/
    │   └── equipetrol.md
    └── html/
        ├── shell-baseline.ts
        ├── styles.ts
        └── sections/
            ├── cover.ts
            ├── metodologia.ts
            ├── vistazo.ts
            ├── submercados.ts
            ├── oferta.ts
            ├── precios.ts
            ├── concentracion.ts
            ├── alquiler.ts
            ├── limites.ts
            └── ficha.ts
```

### Decisiones editoriales a respetar

- Precio normalizado: explicación completa con ejemplo numérico (listing al paralelo vs oficial, diff 36%)
- Antigüedad del listado ≠ días en mercado real: subsección explicativa en §2
- Tesis editorial: "el mercado es dual por producto, no por zona" — evitar lenguaje de velocidad de venta
- Top proyectos: usar "No esp." en lugar de "—" cuando estado_construccion = no_especificado
- Metodología al frente (§2), lo que NO afirma visible (§9), contacto sobrio al pie (§10)

### Pasos para arrancar tarea #6

1. `Read scripts/estudio-mercado/src/db.ts` — replicar patrones, no reimportar
2. `Read scripts/estudio-mercado/src/types.ts` — tipos base
3. `Read scripts/estudio-mercado/src/tools/panorama-mercado.ts` — patrón para tools nuevas
4. Escribir `baseline/db-baseline.ts` replicando patrón pero con Binance + filtros antigüedad
5. Escribir las 6 tools una por una
6. Test unitario mínimo: paridad con query SQL actual del HTML

### Si hay fricción con tipos TypeScript

- Todas las vistas retornan `precio_norm`, `precio_m2`, `dias_en_mercado` precalculados
- `obtener_tc_actuales()` retorna JSON: `{ oficial: { valor, fecha }, paralelo: { valor, fecha }, spread }`
- Usar `.rpc('obtener_tc_actuales')` desde Supabase client

### Validación de paridad

El HTML actual debe coincidir byte a byte (o muy cerca) con el generado por el script. Si diverge:
- Primero chequear TC paralelo usado (script usa Binance, HTML fue con 9.46 del 18 abr)
- Después chequear filtros de antigüedad aplicados
- Después chequear orden de operaciones (normalización antes vs después de agrupar)

---

## Commits relacionados

- `843fbcd` — draft inicial HTML + fix broker editor + cambios BD
- `0a475b4` — disclaimer inventario estancado + backlog Fase 2
- `843fbcd..0a475b4` pushados a `origin/main`

## Contacto del trabajo

Este handoff se generó al final de una sesión de ~4 horas que cubrió: diseño editorial del reporte, limpieza de zonas en BD, fix frontend broker editor, disclaimer fiduciario, y documentación del backlog de Fase 2 (unificación de 4 superficies con data de mercado).
