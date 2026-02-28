# Informe Estrategico: Mercado Inmobiliario Equipetrol

**Fecha:** Febrero 2026 | **Fuente:** SICI - 262 unidades verificadas con GPS | **TC Paralelo:** Bs 9.33/USD

> Documento para toma de decisiones de compra de departamentos en la zona Equipetrol de Santa Cruz de la Sierra, Bolivia. Datos auditados manualmente con verificacion GPS via PostGIS.

---

## 1. Panorama General

| Indicador | Valor |
|-----------|-------|
| Unidades activas en venta | 262 (con zona verificada) + 55 perifericas |
| Proyectos monitoreados | 54+ edificios |
| $/m2 promedio general | **$2,076** |
| Ticket promedio | **$172,000 USD** |
| Area promedio | 81 m2 |
| Dormitorios promedio | 1.5 |
| Cobertura de zonas | 5 microzonas con poligonos GPS |
| Tasa de matching a proyecto | 98% (310/317) |

---

## 2. Comparativo por Zona

| Zona | Uds | Proy | $/m2 Avg | Mediana $/m2 | P25-P75 | Ticket Avg | Area |
|------|-----|------|----------|-------------|---------|-----------|------|
| **Eq. Norte** | 23 | 15 | $2,429 | $2,387 | $2,121-$2,750 | $171K | 71m2 |
| **Eq. Centro** | 124 | 54 | $2,172 | $2,087 | $1,850-$2,449 | $166K | 81m2 |
| **Sirari** | 46 | 17 | $2,135 | $2,063 | $1,929-$2,372 | $211K | 98m2 |
| **Eq. Oeste** | 31 | 10 | $1,967 | $1,753 | $1,626-$2,188 | $209K | 96m2 |
| **Villa Brigida** | 38 | 21 | $1,878 | $1,905 | $1,590-$2,120 | $132K | 73m2 |

**Lectura clave:**
- Eq. Norte cobra un premium de +26% vs Villa Brigida
- Eq. Oeste tiene la mayor dispersion (spread P25-P75 de $562), lo que indica mas oportunidades de negociacion
- Sirari ofrece las areas mas generosas (98m2 avg) a un precio intermedio
- Eq. Centro domina con 48% de la oferta total (124/262)

---

## 3. Mapa de Calor: $/m2 por Zona x Dormitorios

**Escala:** Verde (<$1,800) | Ambar ($1,800-$2,200) | Rojo (>$2,200)

| Zona | Mono (0D) | 1 Dorm | 2 Dorms | 3 Dorms | 4 Dorms |
|------|-----------|--------|---------|---------|---------|
| **Eq. Centro** | ROJO $2,663 (12) | AMBAR $2,177 (54) | AMBAR $2,092 (47) | AMBAR $2,017 (10) | VERDE $1,317 (1) |
| **Eq. Norte** | ROJO $2,501 (5) | ROJO $2,304 (9) | ROJO $2,515 (9) | - | - |
| **Sirari** | AMBAR $2,144 (5) | AMBAR $2,043 (21) | ROJO $2,227 (12) | ROJO $2,201 (7) | ROJO $2,475 (1) |
| **Eq. Oeste** | ROJO $2,274 (2) | AMBAR $1,888 (14) | AMBAR $1,875 (13) | ROJO $2,311 (1) | ROJO $3,296 (1) |
| **V. Brigida** | AMBAR $1,877 (4) | AMBAR $2,038 (15) | VERDE $1,755 (14) | VERDE $1,720 (4) | AMBAR $1,825 (1) |

**Insights:**
- Los monoambientes son premium en TODAS las zonas (+20-30% vs 2D) por efecto de area chica
- Villa Brigida es la unica zona con 2D y 3D en verde
- Eq. Norte es rojo en todas las tipologias - zona mas cara consistentemente
- El sweet spot de volumen esta en 1-2D de Eq. Centro (101 unidades = 39% del total)

---

## 4. Rangos de Ticket por Tipologia (P25 - Mediana - P75)

| Zona | 1 Dorm | 2 Dorms | 3 Dorms |
|------|--------|---------|---------|
| **Eq. Centro** | $91K - **$106K** - $136K | $172K - **$193K** - $222K | $251K - **$335K** - $399K |
| **Eq. Norte** | $123K - **$125K** - $159K | $231K - **$236K** - $241K | - |
| **Sirari** | $97K - **$103K** - $139K | $173K - **$189K** - $271K | $477K - **$477K** - $504K |
| **Eq. Oeste** | $110K - **$116K** - $150K | $136K - **$163K** - $168K | - |
| **V. Brigida** | $85K - **$99K** - $104K | $132K - **$141K** - $158K | $231K - **$275K** - $283K |

**Guia rapida por presupuesto:**
- **$80-100K:** 1D en Villa Brigida o Sirari
- **$100-150K:** 1D en cualquier zona, o 2D en Villa Brigida/Eq. Oeste
- **$150-200K:** 2D en Eq. Centro o Sirari
- **$200-250K:** 2D premium en Eq. Norte, o 3D en Villa Brigida
- **$250K+:** 3D en Eq. Centro, o producto premium Sirari

---

## 5. Preventa vs Entrega Inmediata

| Zona | Preventa $/m2 (uds) | Entrega $/m2 (uds) | Delta | Senal |
|------|---------------------|-------------------|-------|-------|
| **Eq. Centro** | $2,164 (47) | $2,190 (29) | +1.2% | Neutro |
| **Eq. Norte** | $2,188 (6) | $2,579 (8) | +17.9% | **Preventa atractiva** |
| **Eq. Oeste** | $1,715 (15) | $2,121 (5) | +23.7% | **Preventa MUY atractiva** |
| **Sirari** | $2,154 (23) | $2,082 (16) | -3.3% | Entrega mas barata |
| **V. Brigida** | $1,708 (7) | $1,826 (15) | +6.9% | Preventa atractiva |

**Lectura clave:**
- Eq. Oeste tiene el mayor descuento en preventa (-24% vs entrega) - mayor plusvalia potencial
- Sirari es la excepcion: entrega inmediata mas barata que preventa (posible sobreoferta en preventas nuevas)
- Eq. Centro esta equilibrado - el mercado ya precio la diferencia

### Composicion del inventario

| Zona | % Preventa | % Entrega | % Otro |
|------|-----------|-----------|--------|
| **Eq. Centro** | 38% | 26% | 36% |
| **Eq. Norte** | 26% | 35% | 39% |
| **Eq. Oeste** | 48% | 16% | 36% |
| **Sirari** | 50% | 35% | 15% |
| **V. Brigida** | 18% | 50% | 32% |

Villa Brigida tiene mas entrega inmediata (50%) - mercado maduro. Sirari y Eq. Oeste son zonas en desarrollo con mucha preventa.

---

## 6. Segmentacion de Mercado por Zona

| Zona | Oportunidad (<$1,800/m2) | Mercado ($1,800-$2,200) | Premium (>$2,200) |
|------|--------------------------|------------------------|-------------------|
| **Eq. Centro** | 24 (19%) | 51 (41%) | 49 (40%) |
| **Eq. Norte** | 3 (13%) | 6 (26%) | 14 (61%) |
| **Sirari** | 8 (17%) | 18 (39%) | 20 (43%) |
| **Eq. Oeste** | 16 (52%) | 8 (26%) | 7 (23%) |
| **V. Brigida** | 14 (37%) | 19 (50%) | 5 (13%) |

**Lectura:**
- Eq. Oeste tiene 52% de unidades bajo $1,800/m2 (mayor concentracion de oportunidades)
- Eq. Norte es 61% premium - zona consolidada de alto nivel
- Villa Brigida es la mas equilibrada con 50% en rango de mercado

---

## 7. Top Proyectos por $/m2 (minimo 3 unidades)

### Segmento Premium (>$2,200/m2)

| Proyecto | Zona | Uds | $/m2 | Rango Ticket |
|----------|------|-----|------|-------------|
| Sky Moon | Eq. Norte | 5 | **$2,979** | $110K-$386K |
| Sky Tower | Eq. Centro | 6 | **$2,906** | $88K-$136K |
| Cond. MARE | Sirari | 3 | **$2,722** | $108K-$320K |
| Edif. Spazios | Eq. Centro | 4 | **$2,612** | $110K-$456K |
| Luxe Suites | Eq. Centro | 4 | **$2,561** | $87K-$227K |
| Sky Eclipse | Eq. Centro | 6 | **$2,520** | $103K-$241K |
| Sky Eclipse | Eq. Oeste | 7 | **$2,493** | $105K-$308K |
| Uptown NUU | Eq. Oeste | 3 | **$2,460** | $101K-$1.8M |
| Luxe Tower | Eq. Centro | 4 | **$2,448** | $132K-$277K |

### Segmento Mercado ($1,800-$2,200/m2)

| Proyecto | Zona | Uds | $/m2 | Rango Ticket |
|----------|------|-----|------|-------------|
| Condado VI | Eq. Centro | 3 | **$2,252** | $140K-$325K |
| La Riviera | Sirari | 3 | **$2,251** | $352K-$750K |
| Las Dalias | Sirari | 15 | **$2,231** | $98K-$189K |
| ITAJU | Sirari | 5 | **$2,225** | $477K-$765K |
| Eurodesign Le Blanc | Eq. Norte | 5 | **$2,157** | $85K-$240K |
| Stone 3 | V. Brigida | 4 | **$2,106** | $73K-$105K |
| Atrium | Eq. Centro | 11 | **$2,090** | $99K-$213K |
| Sky Level | Eq. Centro | 5 | **$2,055** | $103K-$193K |
| T-VEINTICINCO | Eq. Centro | 9 | **$1,894** | $188K-$272K |
| HH Once | Eq. Centro | 8 | **$1,882** | $77K-$143K |
| Spazios Eden | Eq. Centro | 6 | **$1,867** | $76K-$196K |

### Segmento Oportunidad (<$1,800/m2)

| Proyecto | Zona | Uds | $/m2 | Rango Ticket |
|----------|------|-----|------|-------------|
| SKY EQUINOX | Sirari | 6 | **$1,736** | $61K-$270K |
| Lofty Island | Eq. Centro | 3 | **$1,708** | $116K-$180K |
| Lofty Island | Eq. Oeste | 12 | **$1,650** | $110K-$168K |
| HH Chuubi | Eq. Centro | 5 | **$1,600** | $90K-$193K |
| Concret Equipetrol | V. Brigida | 3 | **$1,550** | $71K-$158K |
| Aura Residences | V. Brigida | 4 | **$1,345** | $114K-$134K |

---

## 8. Recomendaciones por Perfil de Comprador

### Inversor (rentabilidad por alquiler)
- **Mejor zona:** Eq. Oeste en preventa ($1,715/m2) - 24% de upside vs entrega
- **Tipologia ideal:** 1D de 60-70m2 - mayor demanda de alquiler
- **Proyecto destacado:** Lofty Island Eq. Oeste ($1,650/m2, 12 unidades disponibles)
- **Riesgo:** Zona con mucha preventa (48%), verificar plazos de entrega

### Primera vivienda ($100-150K)
- **Mejor zona:** Villa Brigida - 2D a $141K mediana, 50% entrega inmediata
- **Alternativa:** Eq. Oeste 1D a $116K mediana
- **Proyectos:** Concret Equipetrol, Aura Residences, Stone 3
- **Ventaja:** Zona madura con servicios establecidos

### Comprador premium ($200K+)
- **Mejor zona:** Sirari - 2D a $189K, areas generosas (98m2 avg), buen mix preventa/entrega
- **Upgrade:** Eq. Norte 2D a $236K mediana - zona mas exclusiva
- **Proyectos:** Las Dalias, La Riviera, ITAJU, Sky Moon
- **Ventaja:** Sirari tiene 35% entrega inmediata - se puede mudar rapido

### Especulador (plusvalia)
- **Eq. Norte:** 61% del inventario es premium, zona en desarrollo con precios al alza
- **Eq. Oeste preventa:** Descuento de 24% vs entrega - mayor gap del mercado
- **Evitar:** Eq. Centro monoambientes - ya estan en $2,663/m2, poco margen de apreciacion
- **Riesgo:** Eq. Oeste tiene pocos proyectos entregados (16%) - menor liquidez

---

## 9. Datos de Calidad del Estudio

| Metrica | Valor |
|---------|-------|
| Propiedades totales en BD | 317 completadas |
| Con zona GPS verificada | 262 (82%) |
| Con proyecto asignado | 310 (98%) |
| Fuentes de datos | Century 21, Remax |
| Verificacion GPS | PostGIS ST_Contains contra poligonos |
| Ultima auditoria manual | Febrero 2026 |
| Propiedades excluidas | Duplicados, parqueos, bauleras, alquiler, anticretico |
| Filtros aplicados | area >= 20m2, precio > $1,000, venta, no duplicadas |

---

*Generado por SICI (Sistema Inteligente de Captura Inmobiliaria) - Febrero 2026*
*Datos verificados con GPS y auditoria manual. Precios en USD al TC paralelo Bs 9.33.*
