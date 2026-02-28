# Backlog Calidad de Datos — SICI

> Extraído de CLAUDE.md el 27 Feb 2026

## Baños Corregidos (14 props) - 21 Ene 2026

Auditoría manual con IA completada. 14 propiedades corregidas con `campos_bloqueados`:
- IDs: 456, 230, 255, 166, 188, 224, 231, 243, 355, 357, 415, 62, 241

## Baños Pendientes de Revisión Manual (17 props)

**3 dorms + 1 baño (muy sospechoso):**
| ID | Proyecto | Área | URL |
|----|----------|------|-----|
| 405 | MIRO TOWER | 94m² | https://c21.com.bo/propiedad/91243_departamento-en-venta-de-3-dormitorios |

**2 dorms + 1 baño (revisar):**
| ID | Proyecto | Área | URL |
|----|----------|------|-----|
| 156 | SKY EQUINOX | 208m² | https://c21.com.bo/propiedad/94808_departamento-2-dormitorio-sky-equinox |
| 309 | Domus Infinity | 58m² | https://c21.com.bo/propiedad/89096_en-venta-departamento-de-1-dormitorio-escritorio-zona-equipetrol |
| 339 | Edificio Spazios | 83m² | https://c21.com.bo/propiedad/86032_departamentos-de-lujo-en-venta-en-equipetrol-condominio-spazios-1 |
| 342 | Spazios Edén | 105m² | https://c21.com.bo/propiedad/92558_departamento-en-preventa-en-spazios-eden-equipetrol |
| 344 | Spazios Edén | 105m² | https://c21.com.bo/propiedad/92783_departamento-en-preventa-en-spazios-eden-equipetrol |
| 359 | Stone 3 | 63m² | https://c21.com.bo/propiedad/89355_stone-3-departamento-2-dormitorios-en-pre-venta-zona-equipetrol |
| 364 | PORTOBELLO ISUTO | 62m² | https://c21.com.bo/propiedad/89963_departamento-dos-dormitorios-en-venta-portobello-isuto |
| 385 | Concret Equipetrol | 98m² | https://c21.com.bo/propiedad/84208_equipetrol-preventa-departamento-de-2-habitaciones-edificio-concret-equipetrol |
| 404 | MIRO TOWER | 79m² | https://c21.com.bo/propiedad/91230_departamento-en-venta-de-2-dormitorios |
| 412 | PORTOBELLO 5 | 55m² | https://c21.com.bo/propiedad/90003_departamento-2-dormitorios-en-pre-venta-zona-equipetrol-canal-isuto |
| 488 | Spazios Edén | 105m² | https://c21.com.bo/propiedad/92784_departamento-en-preventa-en-spazios-eden-equipetrol |

**1 dorm + 2 baños (verificar si correcto):**
| ID | Proyecto | Área | URL |
|----|----------|------|-----|
| 158 | MARE | 70m² | https://c21.com.bo/propiedad/94505_departamento-en-venta-en-condominio-mare |
| 283 | Lofty Island | 68m² | https://c21.com.bo/propiedad/71299_lofty-island-equipetrol-departamento-de-1-dormitorio-en-fachada-y-con-balcon |
| 387 | Stone 3 | 54m² | https://c21.com.bo/propiedad/80766_departamento-en-venta-en-cond-stone-ii-equipetrol |
| 392 | Swissôtel | 76m² | https://c21.com.bo/propiedad/87696_departamento-en-venta-hotel-swissotel-zona-canal-isuto |
| 452 | Uptown NUU | 68m² | https://c21.com.bo/propiedad/96445_tu-hogar-o-tu-santuario-personal |

## Datos Corruptos Detectados

| ID | Problema | Acción |
|----|----------|--------|
| 380 | Spazios Edén $57,153 por 105m² ($544/m²) - precio irrealmente bajo vs $146k de unidades idénticas | Revisar fuente, marcar inactivo o corregir precio |

## Backlog Extractores n8n

- [x] ~~**REIMPORTAR flujo_b_processing_v3.0.json en n8n**~~ - Resuelto: `precio_normalizado()` (migraciones 167-168) maneja TC paralelo a nivel SQL
- [x] ~~**Fix 2 TC Paralelo**~~ - Resuelto: `precio_normalizado()` convierte precios paralelo a USD reales

## Validaciones Pendientes en Pipeline

- [ ] Agregar validación precio/m² en merge: si < $800 para Equipetrol, flaggear como `requiere_revision`
- [x] Filtro `tipo_operacion = 'venta'` en función `buscar_unidades_reales()` (migración 026)
- [x] Filtro `area >= 20m²` para excluir parqueos/bauleras mal clasificados (migración 026)
- [ ] Detectar duplicados por proyecto + área + dormitorios con precios muy diferentes

## UX Completado

- [x] **Leyenda de símbolos en resultados** - Banner colapsable en resultsV2.tsx explicando: incluido, sin confirmar, parqueos, baulera, piso, plan pagos, TC paralelo, descuento, negociable
