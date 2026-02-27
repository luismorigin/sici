# Caso Condado VI Plaza Italia — Market Fit de Simón

## Resumen

Primer caso completo de asesoría comercial de Simón para una desarrolladora.
Cliente: **Proinco / Constructora Condado** (6 edificios en Equipetrol).
Proyecto: **Condado VI Plaza Italia** — 25 unidades (14 disponibles, 11 vendidas).
Fecha del informe base: **13 de febrero de 2026**.
Actualización de seguimiento: **25 de febrero de 2026** (12 días después).

---

## Entregables Producidos

### 1. Equipetrol Market Intelligence (14 páginas)
- **Audiencia:** Contexto macro del mercado
- **Contenido:** 233 unidades activas en 5 microzonas, absorción, ROI por tipología
- **Herramienta:** NotebookLM + datos SICI
- **Archivo:** `Equipetrol_Market_Intelligence.pdf`

### 2. Condado VI Market Analysis (14 páginas)
- **Audiencia:** Posicionamiento del proyecto en el mercado
- **Contenido:** Dónde cae Condado VI en precios, competencia directa, equipamiento
- **Herramienta:** NotebookLM + datos SICI
- **Archivo:** `Condado_VI_Market_Analysis.pdf`

### 3. Condado VI Strategy (8 páginas)
- **Audiencia:** Plan ejecutivo para la gerencia
- **Contenido:** Diagnóstico digital + roadmap 3 meses + activación broker
- **Herramienta:** NotebookLM + datos SICI
- **Archivo:** `Condado_VI_Strategy.pdf`

### 4. Asesoría Comercial v9 (14 páginas)
- **Audiencia:** Estrategia detallada interna
- **Contenido:** TC, inventario unidad por unidad, estrategia por tipología, brokers con nombre y teléfono
- **Herramienta:** @react-pdf/renderer (generado por código)
- **Script:** `simon-mvp/scripts/generate-condado-vi-asesoria.jsx`
- **Archivo:** `ASESORIA_CONDADO_VI_PLAZA_ITALIA_2026-02-13_v9.pdf`

### 5. Anexo Estratégico v3 (12 páginas)
- **Audiencia:** Data de soporte y herramientas comerciales
- **Contenido:** Escenarios absorción, perfiles comprador, guía objeciones, 10 preguntas estratégicas
- **Herramienta:** @react-pdf/renderer (generado por código)
- **Script:** `simon-mvp/scripts/generate-condado-vi-anexo.jsx`
- **Archivo:** `ANEXO_ESTRATEGICO_CONDADO_VI_2026-02-13_v3.pdf`

### 6. Informe de Posicionamiento
- **Herramienta:** @react-pdf/renderer (generado por código)
- **Script:** `simon-mvp/scripts/generate-condado-vi-report.jsx`

---

## Datos del Proyecto (13 Feb 2026)

| Métrica | Valor |
|---------|-------|
| Total unidades | 25 |
| Vendidas | 11 (44%) |
| Disponibles | 14 (4x1D, 7x2D, 3x3D) |
| Precio oficial | $2,051/m² USD oficial |
| Precio billete | $1,650/m² USD billete |
| Entrega | Inmediata |
| Equipamiento | 13 items incluidos (incl. línea blanca completa) |
| Amenidades | 7 confirmadas (piscina, gym, salón, terraza, ascensores Orona) |

## Diagnóstico Clave

### El producto NO es el problema
- Precio en la mediana exacta del mercado ($2,051 vs $2,055)
- Único edificio con línea blanca completa (heladera, lavavajillas, lavadora/secadora)
- Marca con demanda comprobada (Condado Park V vendido en 14 días a $2,358/m²)

### El problema es la narrativa digital
- **0 canales propios** (no web, no Instagram, no Google Business)
- **5+ nombres distintos** en portales (Condado VI, Condado 6, Quartier Italia, etc.)
- **Renders en vez de fotos reales** del edificio terminado
- **Precios incoherentes** entre brokers ($1,455 a $2,252/m²)
- **Status incorrecto** — brokers lo venden como "preventa" cuando tiene entrega inmediata

---

## Actualización 12 Días Después (25 Feb 2026)

### Por qué importa: demuestra el valor del monitoreo continuo

### Cambios en Equipetrol Centro

| Métrica | 13 Feb | 25 Feb | Delta |
|---------|--------|--------|-------|
| Activas totales | ~106 | 102 | -4 |
| 1D activas | 41 | 39 | -2 |
| 2D activas | 43 | 42 | -1 |
| 3D activas | 9 | 8 | -1 |
| Mediana $/m² | $2,055 | $2,055 | = |
| TC Paralelo | Bs 9.17 | Bs 9.03 | -Bs 0.14 |

### Movimientos detectados de Condado VI
- **ID 174 — Condado 1D (62.21m²):** Desapareció de portales el 14 Feb (inactivo_pending)
- **ID 427 — Condado VI 3D (144.31m²):** Desapareció de portales el 25 Feb (inactivo_pending)
- **ID 816 — Condado Park V 2D:** Nuevo listing activo (reemplaza al vendido ID 556)

### Competidores directos
- **T-Veinticinco:** 10 unidades → 10 unidades. Cero movimiento en 12 días.
- **Atrium:** 7-8 unidades → 9 unidades. Sumó listings (no vendió, creció).

### Caso Spazios (ejemplo de transparencia)
- 10 unidades Spazios/Spazios Edén desaparecieron simultáneamente el 13 Feb
- Todas de Century 21, mismo día → patrón de **retiro masivo de listings**
- NO es absorción. Probablemente fin de exclusividad o cambio de broker.
- **Lección:** una baja en portales ≠ una venta. Siempre distinguir.

### Impacto del TC
- El spread TC ref (8.65) vs paralelo bajó de Bs 0.52 a Bs 0.38 por dólar
- El "pastel" por unidad 1D pasó de ~Bs 62,600 a ~Bs 39,000
- La ventana del descuento billete se está achicando
- Esto invalida los cálculos de la estrategia de pago del informe del 13 Feb

---

## Flujo de Producción (Replicable)

### Informes con NotebookLM (3 documentos visuales)
1. Preparar datos desde SICI (queries a Supabase)
2. Escribir prompt con contenido slide por slide
3. Agregar override de diseño (ver `PRESENTACIONES_DISENO.md` en memory)
4. Subir PDFs previos como fuentes de contexto en NotebookLM
5. Pedir "Genera en formato de Presentación Detallada"

### Informes con @react-pdf/renderer (2 documentos detallados)
1. Scripts JSX en `simon-mvp/scripts/generate-condado-vi-*.jsx`
2. Ejecutar: `node scripts/generate-condado-vi-asesoria.jsx`
3. Genera PDF con branding Simón (negro/crema/oro, Helvetica)
4. Datos hardcodeados en el script (snapshot del momento)

### Actualización de seguimiento (3 slides)
1. Consultar base de datos actual via API REST Supabase
2. Comparar con datos del informe anterior
3. Identificar movimientos (bajas, altas, cambios de precio, TC)
4. Generar prompt para NotebookLM con los deltas
5. Ser TRANSPARENTE: distinguir hechos de interpretaciones

---

## Servicios Derivados (Modelo de Negocio)

Este caso demostró viabilidad para estos servicios:

| Servicio | Tipo | Rango Precio |
|----------|------|-------------|
| Estudio de Mercado | One-shot | $800 - $2,500 |
| Asesoría Comercial Estratégica | One-shot | $2,500 - $5,000 |
| Monitoreo Mensual | Recurrente | $300 - $500/mes |
| Activación Broker | One-shot + comisión | $500 - $1,000 + 0.5-1% |
| Control Narrativa Digital | Setup + recurrente | $500 setup + $150-300/mes |
| CMA (Valoración) | One-shot | $150 - $300/unidad |
| Factibilidad Pre-Proyecto | One-shot premium | $3,000 - $8,000 |

### Revenue potencial por cliente
- Paquete integral año 1: $12,000 - $14,400
- Si portfolio completo (6 edificios): $14,400/año solo monitoreo

---

## Datos de Contacto del Cliente

- **Empresa:** Proinco / Constructora Condado
- **Emails:** mbeatrizbw@gmail.com | Proincoestate@gmail.com
- **Dirección:** Calle Hernán Aldava Paz, Equipetrol, Plaza Italia
- **Broker existente:** Juan José Cruz García (Remax Futuro) +591 76181883

---

## Lecciones Aprendidas

### 1. La transparencia genera más confianza que vender
- Distinguir "desapareció de portal" de "se vendió" en cada mención
- El caso Spazios (10 bajas simultáneas = retiro, no venta) es el mejor ejemplo
- Nunca inflar números de absorción

### 2. Los datos de SICI son el diferenciador real
- Ninguna consultora en Bolivia tiene absorción en tiempo real
- El delta de 12 días (TC bajó, competidores no vendieron) es imposible sin monitoreo continuo
- El informe de Feb 13 ya estaba desactualizado el Feb 25

### 3. NotebookLM + SICI = producción rápida
- 3 documentos visuales de alta calidad generados en horas, no semanas
- Los scripts @react-pdf generan documentos técnicos más detallados
- Combinar ambos cubre audiencias diferentes (visual para gerencia, detallado para operaciones)

### 4. El flujo narrativo importa
- Abrir con mercado macro (credibilidad) → posicionar el proyecto → diagnóstico → plan
- No entregar los 5 documentos de golpe
- Dejar Asesoría + Anexo como material de referencia, no presentarlos slide por slide

### 5. Las preguntas son más valiosas que las respuestas
- Las 10 preguntas estratégicas generan diálogo y descubren información que SICI no tiene
- "¿A qué precio cerraron las 11 vendidas?" es más poderoso que cualquier dato del informe
