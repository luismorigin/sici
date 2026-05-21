# MOAT FIDUCIARIO: Interpretación vs Información

> **Versión:** 2.0
> **Última actualización:** 12 Enero 2026
> **Propósito:** Documento canónico que define el patrón fiduciario de Simón

## Principio Core

**El moat NO es mostrar datos. Es INTERPRETAR datos y dar consejo accionable.**

Patrón fiduciario:
1. **DATO** → Lo que medimos
2. **INTERPRETACIÓN** → Qué puede significar
3. **ACCIÓN** → Qué hacer con eso

La diferencia entre un portal y un asesor fiduciario es que el portal muestra, el asesor interpreta y aconseja.

---

## 1. PRECIO VS MERCADO

### Portal genérico:
> "Esta opción está 12% bajo el promedio de Equipetrol"

### Simón fiduciario:
> "Este precio está 12% bajo el mercado. Eso puede significar:
> 1. Oportunidad real porque el vendedor tiene urgencia
> 2. Hay algo que no vemos en las fotos
> 3. Error de publicación
>
> **Acción:** Antes de emocionarte, preguntá al asesor por qué está tan bajo."

---

## 2. TIEMPO EN MERCADO

### Portal genérico:
> "Lleva 47 días publicada (más que el promedio de 30)"

### Simón fiduciario:
> "47 días sin venderse cuando la mediana de la zona es 74 días.
> Es una publicación relativamente reciente.
>
> **Acción:** El precio probablemente está firme todavía."

### Datos reales de mercado (consultar en vivo — no hardcodear):

```sql
SELECT ROUND(AVG(dias_en_mercado))                                          AS promedio,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_en_mercado))  AS mediana
FROM v_mercado_venta;
```

### Interpretación cualitativa (relativa a la mediana/promedio actuales):

| Días en mercado | Interpretación | Acción sugerida |
|-----------------|----------------|-----------------|
| < 30 días | Recién publicado | Precio firme probable |
| Hasta la mediana | Tiempo normal | Tiempo normal en el mercado |
| Entre mediana y promedio | Por encima de lo típico | Hay margen de negociación |
| > promedio | Inventario lento | Consultá si aceptan ofertas |

**Nota importante:** No tenemos datos para cuantificar el % de descuento esperable. Solo podemos afirmar que mayor tiempo = mayor poder de negociación en términos cualitativos.

---

## 3. COMPARACIÓN DENTRO DEL EDIFICIO

### Portal genérico:
> "Hay 3 unidades más en este edificio, esta es la más barata"

### Simón fiduciario:
> "De las 4 unidades disponibles en este edificio, esta es la más barata.
> Las otras 3 están entre $125k y $140k.
> O encontraste la ganga del edificio, o hay algo diferente en esta unidad (piso bajo, sin vista, etc).
>
> **Acción:** Preguntá qué la hace más barata."

### Interpretaciones posibles:
- **Más barata del edificio:** ¿Ganga o compromiso? Investigar
- **Más cara del edificio:** ¿Premium real o sobreprecio?
- **En el medio:** Opción balanceada, menos riesgo

---

## 4. EXPENSAS / GASTOS COMUNES

### Si NO tenemos el dato:
> "No tenemos información de expensas. Según nuestra investigación de mercado, en edificios similares de Equipetrol las expensas típicas varían según tipo de edificio y dormitorios.
>
> **Impacto:** Depende de amenities del edificio.
>
> **Acción:** Preguntá qué incluyen y el monto exacto."

### Si SÍ tenemos el dato:
> "Expensas: $180/mes. Es alto para la zona.
>
> **Acción:** Verificá qué incluye - a veces expensas altas = mejor mantenimiento, a veces = mala administración."

### Estimados de expensas

> **Fuente de verdad:** `simon-mvp/src/config/estimados-mercado.ts` (`EXPENSAS` + `getExpensasEstimadas()`). Son estimados de investigación de mercado (Equipetrol, jul-2025 → ene-2026), **no datos de la BD** — `monto_expensas_bob` está casi vacío. El `.ts` tiene su propia metadata de fuentes/período/versión. **No dupliques los rangos acá**; si cambian, se actualizan en el `.ts`.

**Qué incluyen típicamente** (cualitativo, estable):
- ✅ Seguridad 24h, mantenimiento áreas comunes, ascensores
- ✅ Uso de piscina, churrasqueras, gimnasio
- ✅ Agua potable (~50% de edificios nuevos)
- ❌ NO incluyen: Electricidad, gas, internet individual

**Caso especial:** Edificio GOLD ofrece "Expensas 0" - servicios se pagan por uso via app.

---

## 5. ESTACIONAMIENTO

### Estimados de estacionamiento

> **Fuente de verdad:** `config/estimados-mercado.ts` (`ESTACIONAMIENTO` + `getEstacionamientoEstimado()`). Estimado de investigación, no BD (`parqueo_precio_adicional` poblado en ~8 de 363 props).

**Tendencia principal:** La mayoría de edificios nuevos **vende parqueo por separado**, especialmente en monoambientes y 1 dormitorio. Precios de compra/alquiler y probabilidad de inclusión por dormitorios → ver el `.ts` (no duplicar acá).

### Si INCLUYE:
> "Incluye estacionamiento. En Equipetrol, un parqueo separado cuesta $10,000-15,000.
>
> **Impacto:** Si NO incluyera, tendrías que sumar eso al precio real. Esta unidad ya lo incluye - es valor que no ves en el precio."

### Si NO incluye o no sabemos:
> "Estacionamiento: Probablemente NO incluido (según tipo de depto).
>
> **Impacto:** Si no incluye: +$10,000-15,000 al precio real.
>
> **Acción:** Verificá antes de comparar precios."

---

## 6. BAULERA

### Estimados de baulera

> **Fuente de verdad:** `config/estimados-mercado.ts` (`BAULERA` + `getBauleraEstimada()`). Estimado de investigación, no BD (`baulera_precio_adicional` poblado en ~1 de 363 props). Precios de compra, tamaño y probabilidad de inclusión por dormitorios → ver el `.ts`.

### Si NO sabemos:
> "Baulera: Probablemente NO incluida (según tipo de depto).
>
> **Impacto:** Si no incluye: +$2,000-4,000.
>
> **Acción:** Preguntá si está en el precio."

---

## 7. EQUIPAMIENTO DE LA UNIDAD

### Portal genérico:
> "Incluye: A/C, cocina equipada, calefón"

### Simón fiduciario:
> "Viene con A/C y cocina equipada.
>
> **Impacto:** Te ahorra $3,000-5,000 que gastarías si compraras un depto vacío.
>
> **Comparación:** Otros departamentos en tu búsqueda NO incluyen esto - tendrías costo oculto."

### Valor del equipamiento:

> **Fuente de verdad:** `simon-mvp/src/config/estimados-equipamiento.ts`. Costos de reposición por item (A/C, cocina, calefón, etc.) — estimado de investigación, no BD. No duplicar los valores acá.

### Restricción Fiduciaria Implementada:

- **SI detectamos** → "Publicación menciona X" (no "incluye" - no sabemos si es todo)
- **SI NO detectamos** → "No especificado" (no "no tiene" - puede tener pero broker no lo puso)
- **SIEMPRE** → Mostrar costo de referencia (educativo)
- **SIEMPRE** → Pedir que pregunte/verifique

---

## 8. AMENIDADES

### Portal genérico:
> "Amenidades: Piscina, Gym, Churrasquera"

### Simón fiduciario:
> "Tiene piscina (✓ confirmado) y gym (? por confirmar según descripción).
>
> **Comparación:** El 60% de opciones en tu búsqueda tiene piscina, pero solo 30% tiene gym.
>
> **Acción:** Confirmá el gym antes de visitar si es importante para vos."

### Niveles de confianza:
| Confianza | Cómo mostrarlo | Significado |
|-----------|----------------|-------------|
| Alta | ✓ Confirmado | Visto en fotos o specs oficiales |
| Media | ~ Probable | Mencionado en descripción |
| Baja | ? Por confirmar | No detectado, preguntar |

### Amenidades y su impacto en valor:

> **Fuente de verdad:** `config/amenidades-mercado.ts`. % de propiedades con cada amenidad e impacto estimado en precio → ver el `.ts` (no duplicar acá).

### Amenidades Estándar (No mostrar %)

En Equipetrol, estas amenidades son estándar y los brokers no siempre las mencionan:
- Ascensor
- Área Social
- Seguridad 24/7
- Terraza/Balcón
- Recepción
- Lavadero

---

## 9. HONESTIDAD RADICAL: Lo que NO sabemos

### Regla de oro:
**Si no tenemos el dato, decirlo explícitamente y dar contexto útil basado en investigación de mercado.**

### Ejemplo completo:
> "**Lo que SÍ puedo decirte:**
> - Esta opción está 12% bajo el promedio de Equipetrol
> - Lleva 47 días publicada (menos que la mediana de 74)
> - Tiene piscina confirmada, gimnasio por confirmar
> - Hay 3 unidades más en este edificio, esta es la más barata
>
> **Lo que NO sé (con estimados de zona):**
> - Expensas: Estimado $70-120/mes para 2 dorm
> - Estacionamiento: Probablemente NO incluido, +$10,000-13,000 si no incluye
> - Baulera: A veces incluida, +$3,000-3,500 si no incluye
>
> **Qué preguntarle al asesor:**
> 1. ¿Por qué esta unidad es más barata que las otras del edificio?
> 2. ¿Qué incluyen las expensas y cuál es el monto exacto?
> 3. ¿Incluye estacionamiento y baulera?"

---

## TABLA RESUMEN: Impacto Económico Total

> Rangos referenciales. Fuente de verdad de los estimados: `config/estimados-mercado.ts` (expensas, parqueo, baulera) y `config/estimados-equipamiento.ts`. No son datos de la BD.

| Factor | Tipo de impacto | Fuente |
|--------|------------------|--------|
| Precio vs mercado | ±% del precio | `v_mercado_venta` (`precio_norm`, `precio_m2`) |
| Tiempo en mercado | Mayor tiempo = mayor poder negociación | `v_mercado_venta.dias_en_mercado` |
| Expensas | costo mensual | `config/estimados-mercado.ts` (`EXPENSAS`) |
| Estacionamiento | costo de compra adicional | `config/estimados-mercado.ts` (`ESTACIONAMIENTO`) |
| Baulera | costo de compra adicional | `config/estimados-mercado.ts` (`BAULERA`) |
| Equipamiento | costo de reposición | `config/estimados-equipamiento.ts` |
| Amenidades premium | +% valor | `config/amenidades-mercado.ts` |

---

## REGLAS DE IMPLEMENTACIÓN

### 1. Siempre interpretar, nunca solo mostrar
❌ "Precio: $120,000 - 12% bajo mercado"
✅ "Precio 12% bajo mercado. Puede ser oportunidad o señal de alerta. Preguntá por qué."

### 2. Si no tenemos dato, dar contexto de investigación
❌ "Expensas: No disponible"
✅ "Expensas: Sin info. Estimado zona: $70-120/mes. Preguntá qué incluyen y el monto exacto."

### 3. Siempre dar acción concreta
❌ "90 días en mercado, más que el promedio"
✅ "90 días = hay margen de negociación. Consultá si aceptan ofertas."

### 4. Comparar vs alternativas
❌ "Incluye A/C"
✅ "Incluye A/C. 40% de opciones en tu búsqueda no lo incluyen - ahorrarías $1,500."

### 5. Mostrar costo real, no solo precio publicado
❌ "Precio: $70,402"
✅ "Precio publicado: $70,402. Costo real estimado si no incluye parqueo ni baulera: $85,000-88,000"

### 6. No inventar datos sin fundamento
❌ "Podés ofertar 10-15% menos"
✅ "Hay margen de negociación. Consultá si aceptan ofertas."

---

## IMPLEMENTACIÓN ACTUAL (MVP Ene 2026)

### ✅ Implementado en tarjetas TOP 3:

| Feature | Estado | Archivos |
|---------|--------|----------|
| Costos a verificar | ✅ | `estimados-mercado.ts`, `resultados.tsx` |
| Días en mercado | ✅ | `resultados.tsx` líneas 387-417 |
| Comparación edificio | ✅ | `resultados.tsx` líneas 421-468 |
| Amenidades con % | ✅ | `amenidades-mercado.ts`, `resultados.tsx` |
| Equipamiento fiduciario | ✅ | `estimados-equipamiento.ts`, `resultados.tsx` |
| Posición de mercado | ✅ | `resultados.tsx` líneas 294-317 |

---

## POST-MVP ROADMAP

### Nivel 1: Mejoras Rápidas (2-3 horas)

| Mejora | Descripción | Estado |
|--------|-------------|--------|
| Prob. inclusión parqueo | Mostrar "(Rara vez incluido en 1D)" | ✅ Implementado |
| Acción por posición | Texto según oportunidad/premium | ✅ Implementado |
| Preventa contextual | Si es preventa → "verificá fecha de entrega" | ✅ Implementado |

### Nivel 2: Medio Plazo (requiere investigación)

| Mejora | Descripción | Requisito |
|--------|-------------|-----------|
| Fecha entrega en preventa | Mostrar fecha real si está disponible en `proyectos_master.fecha_entrega_estimada` | JOIN en `buscar_unidades_reales()` |
| % Negociación por días | Cuantificar descuento esperable | Investigación de mercado real |
| Comparador lado a lado | UI para comparar TOP 3 visualmente | Diseño UI |
| Detalle excluidas | Por qué cada una fue excluida | Ya está en SQL |
| Histórico de precios | Bajadas de precio detectadas | Tracking en pipeline |

### Nivel 3: Largo Plazo

| Mejora | Descripción |
|--------|-------------|
| CrediCheck | Simulador de financiamiento |
| Análisis de barrio | Ruido, tráfico, seguridad |
| Predicción de plusvalía | Basado en zona y desarrollo |
| Chat con asesor | Conexión directa para dudas |

---

## PREMIUM REPORT STRUCTURE ($29.99)

```
┌──────────────────────────────────────────────────────────┐
│  INFORME PREMIUM - Tu Búsqueda Personalizada             │
│  Generado: [fecha] | Válido: 30 días                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  SECCIÓN 1: TUS 3 MEJORES OPCIONES (Detalle Completo)    │
│  ─────────────────────────────────────────────────────   │
│  Para cada una:                                          │
│  • Análisis de precio vs mercado (gráfico)               │
│  • Desglose de costos reales estimados                   │
│  • Equipamiento detectado + checklist verificación       │
│  • Posición en edificio + comparables                    │
│  • Score de oportunidad (1-10)                           │
│  • Riesgos identificados                                 │
│  • Preguntas específicas para hacer                      │
│                                                          │
│  SECCIÓN 2: COMPARADOR LADO A LADO                       │
│  ─────────────────────────────────────────────────────   │
│  Tabla comparativa: precio, $/m², amenities, etc.        │
│  Veredicto: Cuál es mejor para tu perfil                 │
│                                                          │
│  SECCIÓN 3: PROPIEDADES EXCLUIDAS                        │
│  ─────────────────────────────────────────────────────   │
│  Por qué las excluimos + precio si te interesa revisar   │
│  Advertencias si alguna parece buena pero tiene riesgo   │
│                                                          │
│  SECCIÓN 4: CONTEXTO DE MERCADO                          │
│  ─────────────────────────────────────────────────────   │
│  • Stock total en zona                                   │
│  • Tu presupuesto cubre: X% del mercado                  │
│  • Tiempo promedio en mercado                            │
│  • Tendencia de precios                                  │
│                                                          │
│  SECCIÓN 5: GUÍA DE NEGOCIACIÓN                          │
│  ─────────────────────────────────────────────────────   │
│  • Qué preguntar en cada visita                          │
│  • Señales de alerta a buscar                            │
│  • Estrategia de oferta según tiempo en mercado          │
│                                                          │
│  BONUS: Contacto directo con asesores verificados        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## CHANGELOG

| Fecha | Cambio |
|-------|--------|
| 2026-01-12 | v2.0 - Documento canónico creado |
| 2026-01-12 | Corregido: Sección 2 sin % negociación sin fundamento |
| 2026-01-12 | Agregado: Restricción fiduciaria equipamiento |
| 2026-01-12 | Agregado: Regla 6 "No inventar datos sin fundamento" |
| 2026-01-12 | Agregado: Post-MVP Roadmap |
| 2026-01-12 | Agregado: Premium Report Structure |
| 2026-01-12 | Implementado: Prob. inclusión parqueo/baulera en UI |
| 2026-01-12 | Implementado: Acción contextual por posición mercado |
| 2026-01-12 | Implementado: Preventa contextual ("verificá fecha de entrega") |
| 2026-01-12 | Pendiente: Mostrar fecha entrega real desde proyectos_master |
| 2026-01-12 | Reformulado: Razón fiduciaria - solo escasez con patrón MOAT |
| 2026-01-12 | Coherencia: Acción de escasez vinculada con días en mercado |
| 2026-01-12 | SÍNTESIS FIDUCIARIA: Resumen inteligente combinando todos los datos |
| 2026-01-12 | SQL dinámico: dias_promedio y dias_mediana en v_metricas_mercado |
