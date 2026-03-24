# SIMÓN — LÍMITES DE LA DATA Y ANÁLISIS FIDUCIARIO

## Qué puede aseverar Simón, qué no, y cuándo podrá

**Documento Canónico**
**Versión:** 1.1
**Fecha:** 23 Marzo 2026 (actualizado post-migraciones 199-200)
**Estado:** Vivo — actualizar cuando cambie el estado de la data

---

## PROPÓSITO

Este documento define los **límites reales** de lo que SICI puede afirmar con honestidad sobre el mercado inmobiliario de Equipetrol, Santa Cruz de la Sierra. Es la referencia obligatoria antes de generar cualquier análisis — ya sea para un comprador que busca vivienda o para un inversionista evaluando retorno.

**Regla madre:** Si este documento dice que un dato no es aseverable, ningún análisis de Simón puede presentarlo como hecho. Puede mencionarlo como indicador con caveats explícitos, o no mencionarlo.

---

## ÍNDICE

1. [Naturaleza de la data](#1-naturaleza-de-la-data)
2. [Matriz de aseverabilidad](#2-matriz-de-aseverabilidad)
3. [Limitaciones específicas por fuente](#3-limitaciones-específicas)
4. [Estado de los snapshots](#4-estado-de-los-snapshots)
5. [Guía por perfil de usuario](#5-guía-por-perfil-de-usuario)
6. [Qué mejorar y cuándo](#6-qué-mejorar-y-cuándo)
7. [Glosario fiduciario](#7-glosario-fiduciario)

---

## 1. NATURALEZA DE LA DATA

### Qué captura SICI

SICI captura **precios de publicación** de portales inmobiliarios (Century21, Remax, Bien Inmuebles). Esto implica:

| Lo que tenemos | Lo que NO tenemos | Por qué importa |
|----------------|-------------------|-----------------|
| Precio publicado de venta | Precio de cierre (transacción real) | El vendedor puede cerrar 5-15% por debajo del publicado |
| Precio publicado de alquiler | Renta efectiva pagada | El arrendatario negocia, puede haber 10-20% de descuento |
| Listing aparece/desaparece | Confirmación de que se vendió | Un listing puede desaparecer por expiración, cambio de agencia, o decisión del vendedor |
| Características publicadas | Verificación en campo | Área, dormitorios, amoblado dependen de lo que el anunciante declara |

**Principio fundamental:** Toda la data de SICI es data de **oferta**, no de **demanda ni de transacción**. Los análisis deben construirse sobre esta realidad.

### Precios normalizados

SICI normaliza precios de venta vía `precio_normalizado()` para manejar el tipo de cambio paralelo. Esto resuelve la comparabilidad entre propiedades, pero **no resuelve** la brecha entre precio publicado y precio real.

---

## 2. MATRIZ DE ASEVERABILIDAD

### Nivel VERDE — Aseverable con confianza

Datos observables directamente en la data, con volumen suficiente.

| Dato | Fuente | Volumen típico | Cómo usarlo |
|------|--------|----------------|-------------|
| **Posicionamiento de precio de venta** (percentil, comparación vs. mediana zona/dorm) | `v_mercado_venta` | 95-140 por zona principal | "Este precio está en el percentil X para su segmento" |
| **Inventario activo de venta** (conteo por zona, dormitorios, estado construcción) | `v_mercado_venta` | 300+ total, 25-140 por zona | "Hay X departamentos compitiendo en tu segmento" |
| **Distribución de precios de venta** (mediana, P25, P75, rango) | `v_mercado_venta` | Ídem | "El rango de precio/m² para 2 dorms en Sirari va de $X a $Y" |
| **Preventa vs. entrega inmediata** (proporción por zona) | `v_mercado_venta` | Ídem | "58% de la oferta en Eq. Centro es entrega inmediata" |
| **Oferta nueva entrante** (listings nuevos en últimos 30 días) | `market_absorption_snapshots` | Serie diaria desde 12 Mar 2026 (v2) | "Entran ~56 listings nuevos de 1 dorm por mes" |
| **Tendencia de inventario** (crecimiento/contracción) | `market_absorption_snapshots` | Serie v2 desde 12 Mar 2026 | "El inventario de 2 dorms se contrajo 14% en los últimos 40 días" |

### Nivel AMARILLO — Indicador con caveats obligatorios

Datos derivados o con limitaciones de muestra que requieren disclaimers explícitos.

| Dato | Limitación | Caveat obligatorio | Volumen |
|------|------------|-------------------|---------|
| **Renta publicada por dormitorio** (nivel Equipetrol global) | Precios de publicación, no de cierre. Mezcla amoblado/no amoblado | "Renta publicada (no efectiva). Incluye amoblados y no amoblados — la diferencia puede ser 40-60%." | n=62 (1d), n=51 (2d) a nivel Equipetrol |
| **Renta publicada por zona** | Muestra muy chica en zonas secundarias | Reportar n siempre. Solo Eq. Centro (n=56) tiene masa mínima | n=11-28 en zonas secundarias |
| **Absorción de venta** (propiedades confirmadas como inactivas) | Verificador arreglado 22 Mar + backfill ejecutado 23 Mar (migración 199). Serie histórica recalculada desde 12 Feb. Absorción real ~20-30%, no 0-12% como mostraba antes. Limitación: "confirmada" = desapareció del portal y no volvió en 2 días, no necesariamente vendida | "Tasa de absorción basada en propiedades que desaparecen de portales. Proxy de actividad de mercado, no confirmación de venta cerrada." | 26-45 absorbidas/mes por tipología |
| **Duración de listing** como proxy de demanda relativa | No es velocidad de venta. Es cuánto tiempo lleva publicado | "Listings en zona X duran en promedio Y días. Esto sugiere demanda relativa, no confirma velocidad de venta." | Mismo que inventario |
| **Ratio precios publicados venta/alquiler** como indicador de yield | Dos precios de publicación divididos entre sí. Doble incertidumbre. No segmenta amoblado | "Indicador de referencia basado en precios publicados. NO es yield real. No distingue amoblado/no amoblado." | Cruce de dos muestras con limitaciones propias |

### Nivel ROJO — No aseverable hoy

Datos que Simón NO puede presentar como hechos. Mencionarlos solo como contexto con disclaimer de ausencia de data.

| Dato | Por qué no | Qué hacer en cambio |
|------|-----------|---------------------|
| **Yield / retorno de inversión** | Requiere precios de cierre + rentas efectivas + vacancia real. Ninguno disponible | Presentar el ratio de publicación como "indicador de referencia" (nivel amarillo), no como retorno |
| **Vacancia** | Cero data empírica | Si se menciona, usar rango amplio (8-15%) y declarar: "Estimación general sin base en datos locales medidos" |
| **Apreciación / valorización** | Sin data longitudinal (SICI tiene <3 meses de serie v2) | Escenarios hipotéticos (0% / 2-3% / 5%) con disclaimer: "Simón no tiene data para proyectar apreciación" |
| **Flujo de caja neto** | Depende de vacancia, mantenimiento, renta efectiva — todos ausentes | No ofrecer como cálculo. Puedes ofrecer una "simulación con supuestos del usuario" donde el usuario pone sus propios números |
| **Tasa de absorción como "velocidad de venta"** | "Absorbida" = desapareció del portal 2+ días, no necesariamente vendida. Puede incluir: despublicadas, cambiadas de agencia, expiradas | Usar como proxy de actividad de mercado, no como confirmación de ventas cerradas |
| **Precio de cierre** | No capturamos transacciones reales | Declarar: "Precio de publicación. El precio de cierre puede diferir" |

---

## 3. LIMITACIONES ESPECÍFICAS

### 3.1 Amoblado vs. no amoblado (alquiler)

**Estado actual (Mar 2026):**
- 64% de listings de alquiler declaran "amoblado"
- 26% no declaran nada
- 4% declaran "no amoblado"
- 6% "semi-amoblado"

**Impacto medido:** En Eq. Centro 2 dorms, la diferencia entre amoblado ($1,289 avg) y no amoblado ($805 avg) es ~60%. Mezclarlos en un promedio produce un número que no representa a ninguno de los dos.

**Causa:** Los anunciantes no declaran consistentemente si el departamento está amoblado. No es un problema de enrichment — el dato no existe en el aviso original en muchos casos.

**Regla para análisis:**
- NUNCA presentar un promedio de renta sin declarar que mezcla amoblados y no amoblados
- Si n lo permite, separar. Si no, declarar la limitación
- Para cualquier cálculo de yield, usar solo listings que declaren explícitamente su estado de amoblado

### 3.2 Dormitorios = 0 (monoambientes/estudios)

**Estado actual:** ~81 propiedades de venta clasificadas como 0 dormitorios. Son monoambientes legítimos (30-46 m², edificios conocidos). La auditoría de clasificación dorm=0 vs dorm=1 ya se realizó y el bug de misclassificación fue corregido (migración 198, ~21 Mar 2026).

**Regla para análisis:**
- Categoría válida — son estudios/monoambientes reales
- No mezclar con 1 dormitorio en promedios

### 3.3 Zonas de alquiler — muestra insuficiente para granularidad

| Zona | Alquileres activos | ¿Suficiente para reportar por zona? |
|------|-------------------|-------------------------------------|
| Eq. Centro | 56 | Sí — con caveat de amoblado |
| Eq. Norte | 28 | Marginal — reportar con n explícito |
| Sirari | 26 | Marginal — reportar con n explícito |
| V. Brígida | 12 | No — agregar a nivel Equipetrol |
| Eq. Oeste | 11 | No — agregar a nivel Equipetrol |

**Regla:** Si zona+dormitorio produce n < 10, subir un nivel de agregación (zona sin dorms, o dormitorio sin zona). Siempre reportar n.

### 3.4 Snapshots — discontinuidades históricas

| Fecha | Evento | Impacto en series |
|-------|--------|-------------------|
| 12 Feb 2026 | Primer snapshot | Inicio de la serie |
| 12 Mar 2026 | Migración 194 — snapshot v2 con filtros de calidad | Inventario bajó ~8.5% de un día. **Series v1 y v2 no son comparables.** Usar `filter_version = 2` para serie limpia |
| 13-22 Mar 2026 | Verificador no corrió → absorción = 0 | **CORREGIDO** por backfill (migración 199). Datos recalculados |
| 22 Mar 2026 | Verificador arreglado (v5.1): eliminado filtro `fuente = 'remax'`, ahora procesa C21 + Remax | Serie de absorción confiable en adelante |
| 23 Mar 2026 | Backfill migración 199: recalculada absorción para las 40 fechas históricas con C21 incluido | Serie completa corregida retroactivamente. Absorción 2 dorms: 0-12% → 20-31% |

**Regla:** Serie comparable de inventario/precios comienza el 12 Mar 2026 (v2). Serie de absorción corregida retroactivamente desde el 12 Feb 2026 (migración 199). La discontinuidad v1/v2 persiste para inventario pero NO para absorción (recalculada uniformemente).

---

## 4. ESTADO DE LOS SNAPSHOTS

### Qué captura el snapshot hoy

`market_absorption_snapshots` corre diariamente a las 9 AM. Granularidad: **por dormitorio** (0, 1, 2, 3) × **por zona** (global + 5 zonas). Genera ~24 filas/día.

| Métrica | Confiable | Notas |
|---------|-----------|-------|
| `venta_activas` | Sí (v2) | Filtros de calidad correctos desde mig. 194 |
| `venta_nuevas_30d` | Sí | Basado en `fecha_creacion`, robusto |
| `venta_absorbidas_30d` | Sí (post backfill mig. 199) | Serie histórica recalculada con C21 + Remax. "Absorbida" = desapareció 2+ días, no necesariamente vendida |
| `venta_tasa_absorcion` | Sí (post backfill) | Derivado de absorbidas. Rango real: 20-31% para 2 dorms |
| `venta_meses_inventario` | Sí (post backfill) | Derivado de absorbidas. Rango real: 2-4 meses para 1-2 dorms |
| `venta_ticket_*` (mediana, P25, P75) | Sí | Precios normalizados via `precio_normalizado()` |
| `venta_usd_m2` | Sí | Promedio precio/m² |
| `absorbidas_ticket_promedio` | Sí (post backfill) | Precio promedio de propiedades absorbidas |
| `absorbidas_usd_m2` | Sí (post backfill) | USD/m² promedio de absorbidas |
| `alquiler_activas` | Sí | Conteo correcto |
| `alquiler_mensual_*` | Sí con caveats | Mezcla amoblado/no amoblado. Precios de publicación |
| `roi_bruto_anual` | No confiable | Cruza dos precios de publicación sin segmentar amoblado. Inestable (saltos de 6% a 12% en un día) |
| `anos_retorno` | No confiable | Mismo problema que roi_bruto |

### Qué falta en el snapshot

- **Segmentación amoblado/no amoblado** (alquiler) — hoy mezcla todo
- ~~Segmentación por zona~~ — **RESUELTO** migración 200
- ~~`inactivo_pending` como absorción probable~~ — **RESUELTO** migración 200

---

## 5. GUÍA POR PERFIL DE USUARIO

### Perfil A: Comprador para vivir

**Pregunta central:** "¿Este precio es justo para lo que estoy buscando?"

| Qué puede decir Simón | Nivel | Ejemplo |
|-----------------------|-------|---------|
| Posición del precio vs. mercado | VERDE | "Tu depto está en el percentil 72 de precio/m² para 2 dorms en Sirari" |
| Cuánta oferta hay en tu segmento | VERDE | "Hay 16 departamentos similares compitiendo ahora" |
| Rango de precios en tu segmento | VERDE | "El rango va de $1,782 a $2,394/m² (P25 a P75)" |
| Si hay más o menos oferta que hace un mes | VERDE | "El inventario de 2 dorms bajó 14% en el último mes" |
| Preventa vs. entrega inmediata | VERDE | "60% de la oferta en Sirari es entrega inmediata" |
| Qué tan rápido se mueve el mercado | AMARILLO | "Los listings en esta zona duran en promedio X días" (proxy, no velocidad de venta) |

**Lo que Simón NO dice al comprador:**
- "Este departamento vale X" (no tenemos valuación, tenemos comparación de oferta)
- "Va a subir/bajar de precio" (sin data longitudinal suficiente)
- "Es buena inversión" (no es el perfil — compra para vivir)

### Perfil B: Inversionista

**Pregunta central:** "¿Tiene sentido financiero esta inversión?"

**Respuesta honesta de Simón hoy:** No podemos responder esa pregunta con la data que tenemos. Pero podemos darte la mejor radiografía de mercado disponible en Bolivia para que vos decidas.

| Qué puede decir Simón | Nivel | Ejemplo |
|-----------------------|-------|---------|
| Todo lo del Perfil A | VERDE | Posicionamiento, inventario, distribución |
| Renta publicada de referencia (con caveats) | AMARILLO | "Rentas publicadas para 2 dorms en Equipetrol: mediana $X/mes (n=51). Mezcla amoblados y no amoblados. Precios de publicación, no de cierre." |
| Ratio indicativo venta/alquiler | AMARILLO | "El ratio de precios publicados sugiere un indicador bruto de ~6-7% anual. NO es yield real." |
| Absorción por zona como señal de liquidez | AMARILLO | "En Eq. Centro se absorbieron 17 deptos de 2 dorms en 30 días (tasa 28%, 2.5 meses inventario). En V. Brígida solo 2 (tasa 10%, 9.5 meses)." + caveat: absorbida = desapareció del portal, no necesariamente vendida |
| Pending como rango de absorción | AMARILLO | "41 confirmadas + 7 pendientes = rango probable 41-48 absorciones" |
| Tendencia de inventario como señal de mercado | VERDE | "El inventario se contrajo / expandió X% — señal de presión de oferta/demanda" |

**Lo que Simón NO dice al inversionista:**
- Yield, cap rate, o retorno esperado como dato
- Flujo de caja proyectado
- "Comprar / no comprar" como recomendación
- Vacancia como dato (no lo tenemos)
- Apreciación como proyección

**Lo que Simón SÍ puede ofrecer al inversionista como herramienta:**
- Simulador donde el usuario pone SUS supuestos (vacancia, mantenimiento, renta esperada) y Simón calcula con los datos de mercado que sí tiene. La responsabilidad de los supuestos es del usuario. Simón aporta el posicionamiento de precio y el contexto de mercado.

---

## 6. QUÉ MEJORAR Y CUÁNDO

### Completado

| Mejora | Estado | Impacto |
|--------|--------|---------|
| Verificador corriendo consistentemente | Arreglado 22 Mar 2026 | Absorción confiable en adelante |
| Verificador procesa C21 + Remax | Fix v5.1 — 23 Mar 2026 | C21 ya no queda stuck en pending |
| Backfill absorción histórica | Migración 199 — 23 Mar 2026 | Serie completa 12 Feb - 23 Mar recalculada con C21 |
| Snapshot v2 con filtros de calidad | Desplegado 12 Mar 2026 | Serie limpia de inventario/precios |
| Snapshot por zona (venta) | Migración 200 — 23 Mar 2026 | Métricas de venta segmentadas por zona (~20 filas/día extra) |
| Tracking `inactivo_pending` | Migración 200 — 23 Mar 2026 | Columna `venta_pending_30d` en snapshot global y por zona |

### Corto plazo (próximas 4-8 semanas)

| Mejora | Qué resuelve | Esfuerzo |
|--------|-------------|----------|

### Mediano plazo (2-3 meses)

| Mejora | Qué resuelve | Esfuerzo |
|--------|-------------|----------|
| **Inferencia de amoblado por LLM** (desde fotos o descripción) | Mejorar tasa de clasificación del 74% actual | Alto — requiere prompt engineering + validación |
| **Snapshot de alquiler con flag amoblado** | Separar series amoblado / no amoblado / sin dato | Bajo (una vez que amoblado mejore) |
| **Vacancia observable por edificio** | Para proyectos con unidades totales conocidas, inferir piso de vacancia | Medio — cruzar `proyectos_master` con listings de alquiler por edificio |

### Largo plazo (6+ meses, requiere data externa)

| Mejora | Qué resuelve | Cómo obtenerla |
|--------|-------------|---------------|
| **Precios de cierre** | Gap entre publicación y transacción real | Alianzas con brokers, Derechos Reales, o encuesta post-venta |
| **Rentas efectivas** | Gap entre publicación y renta pagada | Encuesta a administradores de edificios o datos de contratos |
| **Data longitudinal de precios** (12+ meses) | Tendencias de apreciación/depreciación por zona | Tiempo — SICI la generará automáticamente |
| **Absorción cruzada con precio** | "¿A qué precio se vende realmente vs. a qué precio se publica?" | Precio al momento de absorción (`absorbidas_usd_m2`) con 12+ meses de data |

---

## 7. GLOSARIO FIDUCIARIO

Términos como Simón debe usarlos — y como NO debe usarlos.

| Término | Uso correcto | Uso INCORRECTO |
|---------|-------------|----------------|
| **Precio de mercado** | "Precio mediano publicado en tu segmento" | "Lo que vale tu propiedad" |
| **Yield** | "Indicador de referencia basado en precios publicados" | "Retorno de tu inversión" |
| **Absorción** | "Propiedades confirmadas como vendidas por broker" | "Velocidad de venta del mercado" |
| **Días en mercado** | "Antigüedad promedio de los listings activos" | "Tiempo que tarda en venderse" |
| **Tendencia** | "El inventario creció/decreció X% en los últimos Y días" | "El mercado está subiendo/bajando" |
| **Vacancia** | "No tenemos datos medidos de vacancia en esta zona" | Cualquier número presentado como dato |
| **Apreciación** | "Simón no proyecta apreciación. Escenarios hipotéticos: 0% / 2-3% / 5%" | Cualquier proyección presentada como estimación |
| **Competencia** | "Hay X propiedades activas en tu segmento" | "Hay mucha/poca competencia" (juicio sin umbral definido) |
| **Precio normalizado** | "Precio ajustado por tipo de cambio para comparabilidad" | "Precio real" |

---

## REGLA DE CIERRE

Antes de publicar cualquier análisis, reporte, o respuesta de Simón que involucre datos de mercado, verificar contra este documento:

1. ¿El dato que estoy presentando es VERDE, AMARILLO, o ROJO?
2. Si es AMARILLO: ¿incluí el caveat obligatorio?
3. Si es ROJO: ¿lo estoy presentando como hecho? → **No publicar.**
4. ¿Reporté el n (tamaño de muestra) cuando es relevante?
5. ¿Distinguí "precio publicado" de "precio real" cuando corresponde?

**Si no pasa estos 5 checks, el análisis no sale.**

---

*Simón | Inteligencia Inmobiliaria — Santa Cruz de la Sierra, Bolivia*
*Documento canónico de límites de data | Marzo 2026*
