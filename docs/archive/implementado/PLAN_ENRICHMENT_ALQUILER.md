# Plan: Enrichment Alquiler — Estrategia Optimizada

> Fecha: 11 Feb 2026
> Estado: BORRADOR — pendiente aprobación

## Contexto

| Métrica | Valor |
|---------|-------|
| Total alquileres | 218 (157 C21 + 61 Remax) |
| Con enrichment LLM | 44 (24 C21 + 20 Remax) |
| Sin enrichment | 174 (133 C21 + 41 Remax) |
| Costo promedio por prop | ~$0.002 (Haiku 4.5) |
| Tokens promedio | ~2,100/prop |

## Hallazgos Clave

### 1. Discovery C21 tiene 91 campos — muchos GRATIS y no extraídos

| Campo Discovery | Cobertura | Valor para inquilino |
|-----------------|-----------|---------------------|
| `calle` | 100% (157/157) | **Alto** — contiene nombre edificio frecuentemente |
| `asesorNombre` | 100% | Medio — contacto directo |
| `telefono` / `whatsapp` | 100% | **Alto** — contacto inmediato |
| `email` | 100% | Medio |
| `nombreAfiliado` | 100% | Bajo — oficina C21 |
| `mascotas` | 39% (61/157) | **Alto** — decisor clave para inquilinos |
| `alberca` (piscina) | 52% (82/157) | Medio — amenity |
| `estacionamientos` | 28% (44/157) | **Alto** — parqueo incluido o no |
| `cuotaMantenimiento` | 2% (3/157) | **Alto** — pero casi vacío |
| `mantenimiento` | 100% | Medio — texto descriptivo |
| `mantenimientoIncluidoEnPrecio` | 100% | **Alto** — saber si expensas incluidas |
| `fotos` | ? | **Alto** — galería visual |

### 2. Enrichment LLM funciona bien para C21 (no para Remax)

**C21 (24 enriquecidas):** LLM extrae excelente data:
- `nombre_edificio` ✅ (desde descripción de la página)
- `amoblado` ✅ (si/no/parcial)
- `amenities_confirmados` ✅ (lista detallada)
- `equipamiento_detectado` ✅ (cocina, AC, etc.)
- `descripcion_limpia` ✅ (resumen conciso)
- `deposito_meses` (cuando se menciona)
- `servicios_incluidos` (expensas, agua, etc.)
- `contrato_minimo_meses` (cuando se menciona)

**Remax (20 enriquecidas):** Firecrawl no renderiza JS → LLM recibe poco → calidad mala (1.3 campos promedio)

### 3. `calle` contiene nombre del edificio en ~80% de casos C21

Ejemplos reales de `calle`:
- `"CONDOMINIO BARUC UNO"` → edificio = Baruc Uno
- `"Condominio Madero Calle 6 Oeste"` → edificio = Madero
- `"EDIFICIO GOLD"` → edificio = Gold
- `"EDIFICIO SMART ISUTO 1.0"` → edificio = Smart Isuto
- `"Calle Enrique Finot Edificio Macororo 7"` → edificio = Macororo 7
- `"SKY COLLETION"` → edificio = Sky Collection
- `"calle dr marcos terrazas"` → NO tiene edificio ❌

**ADVERTENCIA del usuario:** "el nombre del edificio no siempre está en el encabezado o calle, es lo más difícil de conseguir". El LLM con la página completa es más confiable para esto.

## Estrategia Propuesta

### Fase 1: Extraer datos gratis de Discovery (COSTO $0)

Crear migración SQL que rescate campos de `datos_json_discovery` para C21:

```sql
-- Campos a rescatar a columnas directas:
mascotas           → acepta_mascotas (bool) — NUEVO campo o en datos_json
estacionamientos   → estacionamientos (ya existe)
alberca            → amenity piscina
cuotaMantenimiento → expensas_bs (cuando > 0)
mantenimientoIncluidoEnPrecio → expensas_incluidas (bool)
asesorNombre       → nombre_asesor
telefono           → telefono_asesor
whatsapp           → whatsapp_asesor
email              → email_asesor
```

**No extraer nombre_edificio de `calle`** — el LLM es más confiable para esto.

### Fase 2: Enrichment LLM — solo C21, skip Remax

- **C21 (133 pendientes):** Correr enrichment LLM normal. Costo: ~$0.27
- **Remax (41 pendientes):** NO correr enrichment — Firecrawl no funciona con Remax JS. Investigar alternativa futura (API directa Remax o Playwright).

### Fase 3: Merge Alquiler

Ajustar `merge_alquiler()` para combinar:
1. Datos discovery (mascotas, asesor, mantenimiento, etc.)
2. Datos enrichment LLM (edificio, amoblado, amenities, descripción)
3. Respetar `campos_bloqueados`

### Fase 4: Monitoreo y Calidad

- Dashboard calidad alquileres en `/admin/salud`
- Métricas: % con edificio, % con mascotas, % con descripción

## Riesgos Identificados

| Riesgo | Mitigación |
|--------|-----------|
| `calle` no siempre tiene edificio | Usar LLM como fuente principal para nombre_edificio |
| Remax sin enrichment útil | Aceptar datos mínimos, investigar API directa |
| Costos alquiler no automatizables | NO calcular "1 mes comisión + 1 garantía + 1 adelanto" — varía por propietario |
| Discovery contradice descripción | Enrichment LLM tiene prioridad para campos de la página, Discovery para campos del API |

## Próximos Pasos

1. **Aprobar plan** ← estamos aquí
2. Fase 1: Migración SQL datos gratis discovery
3. Fase 2: Correr enrichment LLM para 133 C21 pendientes
4. Fase 3: Crear/ajustar merge_alquiler()
5. Fase 4: Tests de calidad
