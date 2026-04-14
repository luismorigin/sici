# ANÁLISIS COMPLETO — 11 Preguntas de Alquileres Equipetrol

**Base: 156 propiedades activas en `v_mercado_alquiler` | 389 total históricas | Fecha: 2026-03-21**
**Fuente: SQL puro via MCP postgres-sici contra v_mercado_alquiler (filtros canónicos pre-aplicados)**

---

## Nota metodológica

- **n=156** es suficiente para tendencias generales pero frágil para subgrupos. Cuando cruzamos zona × dormitorios × amoblado × fuente, muchas celdas caen a n=2 o n=3. Esos números son anécdotas, no estadísticas.
- Cada pregunta incluye su **nivel de confianza** y caveats específicos.
- Los campos con alto % de NULL (mascotas 65%, parqueo 46%, expensas 97%) generan un sesgo sistemático: cualquier filtro sobre esos campos **subestima la oferta real**.

---

## 1. Campos con datos reales vs NULL

**Confianza: ALTA** (conteo directo, sin interpretación posible)

| Campo | Informan | No informan | % Info | Veredicto |
|-------|----------|-------------|--------|-----------|
| Superficie | 156 | 0 | 100% | Confiable |
| Zona | 155 | 1 | 99.4% | Confiable |
| Edificio | 150 | 6 | 96.2% | Confiable |
| Dormitorios | 147 | 9 | 94.2% | Confiable |
| Baños | 141 | 15 | 90.4% | Confiable |
| Proyecto master | 136 | 20 | 87.2% | Bueno |
| **Amoblado** | 117 | 39 | 75.0% | Regular |
| **Parqueo** | 84 | 72 | 53.8% | Pobre |
| **Servicios incl.** | 84 | 72 | 53.8% | Pobre |
| Piso | 78 | 78 | 50.0% | Pobre |
| **Mascotas** | 54 | 102 | **34.6%** | Muy pobre |
| Depósito | 31 | 125 | 19.9% | Casi vacío |
| **Expensas** | 4 | 152 | **2.6%** | Vacío |
| **Contrato mín.** | 4 | 152 | **2.6%** | Vacío |

### El dato con criterio:
- **Mascotas:** De 156 deptos, solo 33 confirman mascotas, 21 dicen que no, y **102 NO INFORMAN (65.4%)**. No podemos asumir que "no aceptan" — simplemente el portal no lo registra.
- **Expensas:** Solo 4 de 156 informan el monto. **El 97.4% no dice cuánto son las expensas.** Es un costo oculto real.
- **Amoblado:** 102 dicen "sí", solo 6 dicen "no", 9 "semi". El 25% no informa. El mercado Equipetrol está fuertemente inclinado a amoblados.

---

## 2. Tiempo de publicación

**Confianza: ALTA** — 154 de 156 (98.7%) tienen `fecha_publicacion` real. Solo 2 usan `fecha_discovery` como fallback. El dato de `dias_en_mercado` es sólido.

### Distribución:

| Rango | Cantidad | % | Precio prom | Mediana |
|-------|----------|---|-------------|---------|
| 0-7 días | 15 | 9.6% | Bs 5,715 | Bs 5,500 |
| 8-15 días | 15 | 9.6% | Bs 5,027 | Bs 4,000 |
| 16-30 días | 37 | 23.7% | Bs 4,978 | Bs 4,100 |
| 31-60 días | 43 | 27.6% | Bs 6,491 | Bs 5,500 |
| 61-90 días | 25 | 16.0% | Bs 5,831 | Bs 4,872 |
| 91-120 días | 11 | 7.1% | Bs 6,757 | Bs 4,200 |
| 120+ días | 10 | 6.4% | Bs 4,675 | Bs 3,725 |

- 0-30 días: 67 deptos (43%) — los "frescos"
- 31-60 días: 43 deptos (28%) — en zona de riesgo
- **60+ días: 46 deptos (29.5%)** — zombis

### ¿Los baratos se van más rápido?

| Rango precio | Cant | Días prom | Días mediana | Min | Max |
|-------------|------|-----------|-------------|-----|-----|
| < Bs 3,000 | 14 | 47 | 29 | 5 | 140 |
| Bs 3,000-3,999 | 39 | 63 | 46 | 5 | 360 |
| Bs 4,000-4,999 | 35 | 32 | **25** | 2 | 117 |
| Bs 5,000-5,999 | 18 | 55 | 50 | 4 | 149 |
| Bs 6,000-7,999 | 17 | 51 | **21** | 2 | 352 |
| Bs 8,000+ | 33 | 51 | 44 | 1 | 124 |

**NO es lineal.** Los de Bs 4,000-4,999 son los que más rápido se van (mediana 25 días). Los de Bs 3,000-3,999 duran más (mediana 46 días) — probablemente peor calidad/ubicación. Los más caros (Bs 6,000-8,000) tienen mediana de 21 días — el comprador premium decide rápido.

### Zombis por zona (>60 días):

| Zona | N | Precio prom | Días prom |
|------|---|-------------|-----------|
| Equipetrol Centro | 22 | Bs 5,140 | 97 |
| Sirari | 10 | Bs 5,307 | 95 |
| Equipetrol Norte | 9 | Bs 9,001 | 129 |
| Villa Brígida | 3 | Bs 2,900 | 106 |
| Equipetrol Oeste | 2 | Bs 5,500 | 120 |

Eq. Norte tiene 9 zombis a **Bs 9,001 promedio** — sobrevaluados.

---

## 3. Rotación del mercado

**Confianza: MEDIA** — Los conteos activo/inactivo son reales. Pero no tenemos snapshots de precio para detectar cambios dentro del mismo listing (republicaciones con precio diferente).

### Por fuente y estado:

| Fuente | Completado | Inactivo Confirmed | Inactivo Pending | Excluida Zona |
|--------|-----------|-------------------|-----------------|---------------|
| Century21 | 127 | 154 | 0 | 7 |
| Remax | 31 | 35 | 27 | 1 |
| Bien Inmuebles | 3 | 4 | 0 | 0 |

**Stock total:**
- Activas: 161
- Inactivas (salieron del mercado): 220
- Total registradas: 389
- **Tasa de salida: 56.6%** del total histórico ya no está

Century21 tiene la mayor rotación absoluta (154 inactivas vs 127 activas). No hay datos de cambios de precio dentro del mismo listing.

---

## 4. Dispersión de precio por zona

**Confianza: ALTA para Eq. Centro (n=59), Eq. Norte (29), Sirari (26). MODERADA para Villa Brígida (13), Eq. Oeste (13), Equipetrol (12). NO CONFIABLE para "Sin zona" (2) y "Eq. 3er Anillo" (1) — excluidas de la tabla.**

**Caveat:** El depto de Bs 500 en Eq. Centro (Condominio Portofino Delux, studio) es probablemente un error de dato. Distorsiona el mínimo y el CV% de Eq. Centro.

| Zona | N | Min | P10 | P25 | Mediana | P75 | P90 | Max | CV% |
|------|---|-----|-----|-----|---------|-----|-----|-----|-----|
| Eq. Centro | 59 | 500* | 3,000 | 3,200 | **4,200** | 8,000 | 11,300 | 15,312 | **58.7%** |
| Eq. Norte | 29 | 3,000 | 3,380 | 3,800 | **4,500** | 10,000 | 13,800 | 18,500 | **66.4%** |
| Sirari | 26 | 2,500 | 3,650 | 4,200 | **5,500** | 6,225 | 8,100 | 9,500 | 32.2% |
| Villa Brígida | 13 | 2,500 | 2,840 | 3,200 | **4,000** | 4,250 | 5,980 | 9,500 | 44.4% |
| Eq. Oeste | 13 | 3,550 | 3,880 | 4,850 | **5,500** | 7,500 | 8,620 | 9,850 | 32.5% |
| Equipetrol | 12 | 2,600 | 2,700 | 2,775 | **3,850** | 4,225 | 4,480 | 8,000 | 37.8% |

*\*Probable error de dato*

### Insights:
- **Equipetrol Norte tiene la mayor dispersión (CV 66.4%)** — hay deptos de Bs 3,000 y de Bs 18,500 EN LA MISMA ZONA. No es una zona, es tres mercados distintos.
- **Equipetrol Centro** sin el outlier de Bs 500 tendría un mínimo real de ~Bs 2,600 (P10=3,000). El rango real sigue siendo enorme.
- **Sirari y Eq. Oeste son las más "predecibles"** (CV ~32%) — sabés más o menos qué esperar.

---

## 5. Edificios con múltiples unidades

**Confianza: MEDIA** — Hay un problema de nomenclatura confirmado: "LUXE SUITES" (Remax) y "EDIFICIO LUXE SUITES" (C21) son el **mismo edificio** (ambos id_proyecto_master=9, 7 unidades totales). Además, 2 listings de Remax en LUXE SUITES tienen misma área (43.27m²) y precio (Bs 4,000) — posible duplicado no detectado por el pipeline.

| Edificio | Zona | Unidades | Min Bs | Max Bs | Rango | Dorms | Fuentes |
|----------|------|----------|--------|--------|-------|-------|---------|
| **Sky Moon** | Eq. Norte | **9** | 4,300 | 10,500 | 6,200 | 0,1,2 | C21+Remax |
| **LUXE SUITES** *(consolidado)* | Eq. Centro | **7** | 4,000 | 8,000 | 4,000 | 1,2 | C21+Remax |
| **Sky Eclipse** | Eq. Oeste | **7** | 4,850 | 9,850 | 5,000 | 1,2 | C21 |
| Condominio Metta | Sirari | 3 | 6,000 | 6,000 | **0** | 2 | Remax |
| Madero Residence | Eq. Centro | 3 | 8,000 | 11,000 | 3,000 | 2 | C21 |
| La Riviera | Sirari | 3 | 7,900 | 9,500 | 1,600 | 2 | C21 |
| Condominio Aguai | Eq. Norte | 2 | 18,500 | 18,500 | 0 | 3 | C21 |
| Vertical 60 | V. Brígida | 2 | 4,250 | 9,500 | **5,250** | 1,3 | C21+Remax |

### Insights:
- **Sky Moon = 9 unidades** (5.8% de toda la oferta en un solo edificio). Rango Bs 6,200 entre la más barata y la más cara.
- **LUXE SUITES consolidado = 7 unidades** (antes contadas como 4+3 por diferencia de nombre entre portales).
- **Condominio Metta:** 3 unidades al **mismo precio exacto (Bs 6,000)**. Consistencia total.

---

## 6. Diferencias por portal

**Confianza: BAJA-MEDIA** — La comparación "C21 es más caro" requiere un caveat importante. Controlamos por zona + dormitorios pero **no por m²**. Al agregar precio/m², la historia cambia.

### Resumen global por fuente:
| Portal | Cantidad | % mercado |
|--------|----------|-----------|
| Century21 | 124 | **79.5%** |
| Remax | 30 | 19.2% |
| Bien Inmuebles | 2 | 1.3% |

### Comparación por precio total (zona + dorms):

| Zona | Dorms | C21 mediana | Remax mediana | C21 "más caro" |
|------|-------|-------------|---------------|----------------|
| Eq. Centro | 1d | Bs 3,800 | Bs 3,800 | = |
| Eq. Centro | 2d | Bs 8,000 | Bs 6,000 | +33% |
| Eq. Norte | 1d | Bs 4,500 | Bs 3,450 | +30% |
| Eq. Norte | 2d | Bs 8,828 | Bs 6,975 | +27% |
| Sirari | 2d | Bs 7,350 | Bs 6,000 | +22% |
| Villa Brígida | 1d | Bs 3,220 | Bs 3,400 | Remax +6% |

### PERO al controlar por precio/m²:

| Zona | Dorms | C21 área med. | Remax área med. | C21 Bs/m² | Remax Bs/m² | Diferencia real |
|------|-------|---------------|-----------------|-----------|-------------|-----------------|
| Eq. Centro | 1d | 51 m² | 43 m² | 75.4 | **85.0** | **Remax +13% más caro/m²** |
| Eq. Centro | 2d | 98 m² | 92 m² | **91.1** | 71.7 | C21 +27%/m² |
| Eq. Norte | 1d | 42 m² | 42 m² | **110.1** | 85.1 | C21 +29%/m² |
| Sirari | 2d | 88 m² | 80 m² | 80.4 | 73.8 | C21 +9%/m² |

**Conclusión corregida:** C21 tiende a listar propiedades más grandes (y por ende más caras en total), pero **no siempre más caras por m²**. En Eq. Centro 1 dorm, Remax cobra más por m² que C21. La afirmación "C21 siempre es más caro" es una simplificación. Lo correcto: C21 maneja un segmento de propiedades ligeramente más grandes y, en la mayoría de zonas (no todas), también más caras por m².

---

## 7. Amoblado vs precio (controlado)

**Confianza: MEDIA** — Controlamos por zona+dorms. Las áreas promedio son similares (amoblado 70m² vs no amoblado 70m²) así que el sesgo por tamaño es menor. Pero n=6 para "no amoblado" es muy bajo para conclusiones fuertes. La muestra de "no" es anecdótica.

### Desglose por zona + dormitorios (n >= 2):

| Zona | Dorms | Amoblado | N | Mediana |
|------|-------|----------|---|---------|
| Eq. Centro | 1d | si | 17 | Bs 3,600 |
| Eq. Centro | 1d | no_informa | 6 | Bs 4,200 |
| Eq. Centro | 2d | **si** | 10 | **Bs 8,100** |
| Eq. Centro | 2d | **no** | 3 | **Bs 5,800** |
| Eq. Norte | 0d (studio) | **si** | 4 | **Bs 3,400** |
| Eq. Norte | 0d (studio) | **semi** | 2 | **Bs 4,400** |
| Sirari | 1d | **si** | 7 | **Bs 4,200** |
| Sirari | 1d | **no_informa** | 3 | **Bs 5,500** |
| V. Brígida | 1d | **si** | 7 | **Bs 3,200** |
| V. Brígida | 1d | **no_informa** | 2 | **Bs 4,100** |

### Insights (con caveats):
- Eq. Centro 2d: Amoblado Bs 8,100 vs Sin amoblar Bs 5,800 — amoblado **39% más caro** (lo esperado), pero n=3 para "no" es muy bajo
- **Eq. Norte studios:** Amoblado Bs 3,400 vs Semi Bs 4,400 — semi más caro, pero n=2 para semi (anecdótico)
- **Tendencia general:** Los que "no informan" tienden a ser más caros que los amoblados. Hipótesis: propiedades premium no necesitan aclararlo, o son propiedades más grandes donde el amoblado es menos relevante.

---

## 8. Gaps de precio

**Confianza: ALTA** — Es la distribución directa del inventario real. Los gaps existen.

### Distribución por rangos de Bs 500:

| Rango | Cantidad | Visual |
|-------|----------|--------|
| Bs 500-999 | 1 | # (probable error de dato) |
| **Bs 1,000-2,499** | **0** | **GAP** |
| Bs 2,500-2,999 | 13 | ############# |
| Bs 3,000-3,499 | 22 | ###################### |
| Bs 3,500-3,999 | 17 | ################# |
| **Bs 4,000-4,499** | **25** | **#########################** (PICO) |
| Bs 4,500-4,999 | 10 | ########## |
| Bs 5,000-5,499 | **4** | #### (cuello de botella) |
| Bs 5,500-5,999 | 14 | ############## |
| Bs 6,000-6,499 | 6 | ###### |
| Bs 6,500-6,999 | **1** | # (cuasi-gap) |
| Bs 7,000-7,499 | 3 | ### |
| Bs 7,500-7,999 | 7 | ####### |
| Bs 8,000-8,499 | 7 | ####### |
| Bs 8,500-8,999 | 3 | ### |
| Bs 9,000-9,999 | 6 | ###### |
| Bs 10,000-10,999 | 4 | #### |
| Bs 11,000-11,499 | 3 | ### |
| **Bs 11,500-12,499** | **0** | **GAP** |
| Bs 12,500-13,999 | 5 | ##### |
| Bs 14,000-14,499 | 1 | # |
| **Bs 14,500-14,999** | **0** | **GAP** |
| Bs 15,000-15,499 | 2 | ## |
| **Bs 15,500-18,499** | **0** | **GAP MASIVO** |
| Bs 18,500-18,999 | 2 | ## |

### Gaps que afectan a buscadores reales:
- **Bs 1,000-2,499:** No existe el low-cost en Equipetrol. El piso real es Bs 2,500.
- **Bs 5,000-5,499:** Solo 4 propiedades. Cuello de botella.
- **Bs 6,500-6,999:** Solo 1. Cuasi-gap.
- **Bs 11,500-12,499:** Gap en premium.
- **Bs 15,500-18,499:** Gap masivo de Bs 3,000 — el ultra-luxury es un desierto.

La concentración está en **Bs 2,500-5,000** (87 de 156 = 56% de toda la oferta).

---

## 9. Concentración por portal

**Confianza: ALTA** — Conteo directo.

### Dominancia por zona:

| Zona | C21 | % | Remax | % | BI | % |
|------|-----|---|-------|---|----|----|
| **Eq. Oeste** | 13 | **100%** | 0 | 0% | 0 | 0% |
| Sirari | 21 | 80.8% | 5 | 19.2% | 0 | 0% |
| Eq. Norte | 23 | 79.3% | 6 | 20.7% | 0 | 0% |
| Eq. Centro | 46 | 78.0% | 12 | 20.3% | 1 | 1.7% |
| Equipetrol | 10 | 83.3% | 1 | 8.3% | 1 | 8.3% |
| Villa Brígida | 8 | 61.5% | 5 | **38.5%** | 0 | 0% |

**Caveat:** Esto mide concentración de **listings en portales**, no de inmobiliarias reales. C21 es una franquicia con múltiples oficinas y agentes, pero su portal no expone nombres individuales (a diferencia de Remax). No podemos medir concentración a nivel agente para C21.

### Insights:
- **Equipetrol Oeste: 100% Century21** — monopolio total en listado online
- **Villa Brígida** es la zona con mayor diversidad (61/39)
- Si buscás depto en alquiler en Equipetrol, el 80% del tiempo estás viendo un listing de Century21

---

## 10. Filtros que te dejan en 0

**Confianza: BAJA para combos con mascotas, MEDIA-ALTA para el resto**

**Caveat crítico para mascotas:** Solo 33 de 156 confirman `acepta_mascotas = true`. Los otros 102 son NULL. Cuando filtramos "2 dorms + mascota", solo matcheamos contra los 12 que son 2-dorms Y mascota=true. Pero hay **37 deptos de 2-dorms con mascota=NULL** que podrían aceptar mascotas. Los combos con mascota **subestiman la oferta real probablemente entre 2x y 5x**. Hay que leerlos como "X confirman, pero la oferta real es probablemente mayor."

| Combinación | Confirmados | NULL que podrían sumar | Estado |
|-------------|-------------|----------------------|--------|
| **2 dorms + parqueo + < Bs 4,000** | **0** | N/A (parqueo también es pobre) | VACÍO |
| 3+ dorms + < Bs 5,000 | 1 | N/A | Casi vacío |
| 2 dorms + amoblado + < Bs 4,500 | 1 | N/A (amoblado tiene 75% cobertura) | Casi vacío |
| Studio + mascota | 3 confirmados | ~8 más con mascota=NULL | Escaso confirmado |
| Sirari + 2 dorms + < Bs 5,000 | 1 | N/A | Casi vacío |
| 2 dorms + mascota + < Bs 5,000 | 4 confirmados | ~37 con 2d + mascota=NULL | Subestimado |
| 1 dorm + parqueo + < Bs 4,000 | 5 | N/A | Escaso |
| 1 dorm + mascota + amoblado | 7 confirmados | ~más con mascota=NULL | Subestimado |
| Mascota + < Bs 3,500 | 10 confirmados | ~muchos más con NULL | Subestimado |
| 2 dorms + mascota + parqueo | 12 confirmados | ~más con NULL | Subestimado |

### El dato (corregido):
- **2 dorms + parqueo + < Bs 4,000 = 0 opciones.** Este no tiene sesgo de NULL — realmente no existe. Una combinación que mucha gente pide y el mercado literalmente no ofrece.
- **3 dorms por menos de Bs 5,000 = 1 sola opción** en todo Equipetrol. Sin sesgo de NULL.
- **2 dorms amoblado por menos de Bs 4,500 = 1 opción.** Amoblado tiene 75% cobertura, así que este es bastante confiable.
- Los combos con mascota ("solo 4 opciones") deben comunicarse como: "solo 4 **confirman** aceptar mascotas, pero 37 más no informan — la oferta real es probablemente mayor, pero no podés saberlo sin preguntar uno por uno."

---

## 11. Datos históricos y tendencias

**Confianza: MEDIA** — Tenemos entradas/salidas reales pero no snapshots de precio.

### Stock actual vs histórico:

| Métrica | Valor |
|---------|-------|
| Activas hoy | 156 (en vista) / 161 (en tabla) |
| Inactivas (salieron) | 220 |
| Total registradas | 389 |
| Tasa de salida | 56.6% |
| Nuevas últimos 30 días | 67 |
| Precio prom activas | Bs 5,713 |
| Precio prom inactivas | Bs 5,018 |
| Precio prom nuevas 30d | Bs 5,154 |

### Insights (con caveats):
- **Las inactivas promedian menos (Bs 5,018) que las activas (Bs 5,713).** Caveat: esto podría ser simplemente que las inactivas son más viejas (entraron cuando los precios eran menores), no necesariamente que "lo barato se alquila más rápido." No podemos distinguir sin snapshots temporales de precio.
- **67 propiedades nuevas en 30 días** vs 156 activas = tasa de renovación del 43% mensual.
- **No hay snapshots de precio histórico** — no podemos decir "subió X% este mes". Esta es la limitación más importante del análisis.
- **Sí podemos trackear:** nuevas entradas, salidas, y rotación por semana/zona.

---

## Schema disponible

### Vista principal: `v_mercado_alquiler`
- 86 columnas, filtros de calidad pre-aplicados
- Filtros: status IN (completado, actualizado), duplicado_de IS NULL, area >= 20m², precio > 0
- Campo calculado: `dias_en_mercado`

### Columnas clave:
- `precio_mensual_bob` / `precio_mensual_usd` — TC fijo 6.96
- `amoblado` — 'si' / 'no' / 'semi' / null
- `acepta_mascotas` — true / false / null
- `estacionamientos`, `monto_expensas_bob`, `deposito_meses`, `contrato_minimo_meses`
- `servicios_incluidos` — jsonb array
- `zona`, `fuente`, `dormitorios`, `banos`, `area_total_m2`, `piso`, `nombre_edificio`
- `id_proyecto_master` — link a proyectos_master

### RPC: `buscar_unidades_alquiler(p_filtros JSONB)`
- 34 campos incluyendo agente_nombre, agente_telefono, agente_whatsapp
- Límite: 150 días en mercado

### Fuentes: Century21, Remax, Bien Inmuebles
### Pipeline: Nocturno automático (discovery → enrichment LLM → merge → matching)
