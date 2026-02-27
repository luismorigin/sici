# SIMÓN: Mejoras al Funnel y Estructura de Resultados
## Documento de especificación para implementación

**Fecha:** 12 Enero 2025  
**Contexto:** Decisiones de diseño tomadas en sesión de trabajo nocturna  
**Objetivo:** Que Code pueda implementar las mejoras sin perder contexto

---

## 1. FLUJO COMPLETO DEL FUNNEL

### 1.1 Vista general del flujo

```
ENTRADA GRATIS
│
├─ 6 Filtros básicos con contador tiempo real
├─ Consejos automáticos ("pet friendly elimina 50%")
├─ Teasers de inteligencia ("2 precios sospechosos detectados")
│
↓
ROUTER (Filtro 5: ¿Para qué es?)
│
├─ Vivienda → Formulario COMPLETO
├─ Inversión renta → Formulario BETA + disclaimer
└─ Inversión plusvalía → Formulario BETA + disclaimer
│
↓
RESULTADO GRATIS
│
├─ 3 TOP matches (Simón pone firma)
├─ 10 alternativas con score + qué compromiso tienen
├─ Excluidas más baratas (transparencia total)
├─ Todo con fotos
│
↓
PREMIUM $29.99
│
├─ Fichas de coherencia profundas
├─ Análisis completo de las 13 opciones
├─ Explicación de excluidas
├─ Alertas de riesgo
├─ Perfil fiduciario para broker
├─ CrediCheck gratis incluido
│
↓
BROKER (0.4% en cierre)
```

### 1.2 Principios de diseño fiduciario

| Principio | Implementación |
|-----------|----------------|
| Valor desde el primer click | El contador tiempo real muestra el mercado inmediatamente |
| Formulario largo es inversión, no barrera | El usuario ya vio valor antes de llenarlo |
| Transparencia total | Mostramos las excluidas y explicamos por qué |
| No escondemos nada | Incluso la data incompleta se muestra honestamente |
| El usuario decide | Mostramos opciones y compromisos, él elige |

### 1.3 Qué es gratis vs qué es pago

**GRATIS:**
- Filtros tiempo real con contador
- Consejos automáticos de búsqueda
- Teasers de inteligencia (parciales)
- 3 TOP matches con razón fiduciaria básica
- 10 alternativas con score y compromiso
- Lista de excluidas (sin detalle profundo)

**PAGO ($29.99):**
- Ficha de coherencia profunda por propiedad
- Análisis detallado de las 10 alternativas
- Explicación completa de por qué se excluyeron las baratas
- Alertas de riesgo específicas
- Perfil fiduciario exportable para broker
- Acceso a CrediCheck

---

## 2. FILTROS BÁSICOS (6 filtros con contador tiempo real)

### 2.1 Lista de filtros

```
┌─────────────────────────────────────────────────────────────┐
│  CONSTRUYENDO TU BÚSQUEDA                                   │
│                                                             │
│  1. ¿Cuánto querés invertir?                               │
│     [Slider: $50k ─────●───── $200k]                       │
│     → 147 propiedades                                       │
│                                                             │
│  2. ¿Dónde en Equipetrol?                                  │
│     [x] Equipetrol (centro)   [ ] Sirari                   │
│     [ ] Equipetrol Norte/Norte (premium)                   │
│     [ ] Equipetrol Norte/Sur  [ ] Villa Brigida            │
│     [ ] Faremafu                                           │
│     → 89 propiedades                                        │
│                                                             │
│  3. ¿Cuántos dormitorios?                                  │
│     [ ] 1  [x] 2  [ ] 3+                                   │
│     → 45 propiedades                                        │
│                                                             │
│  4. ¿Para cuándo lo necesitás?                             │
│     [ ] Ya (lista para entrega)                            │
│     [x] Puedo esperar (preventa ok)                        │
│     [ ] No me importa                                       │
│     → 45 propiedades                                        │
│                                                             │
│  5. ¿Para qué es?                                          │
│     [x] Vivir yo                                           │
│     [ ] Inversión renta                                    │
│     [ ] Inversión plusvalía                                │
│     → 45 propiedades                                        │
│                                                             │
│  6. ¿Cómo vas a pagar?                                     │
│     [ ] Contado                                            │
│     [ ] Crédito bancario                                   │
│     [x] Financiamiento directo (cuotas)                    │
│     [ ] No sé todavía                                      │
│     → 38 propiedades                                        │
│     ⚠️ 7 sin info de financiamiento                        │
│                                                             │
│  ████████████░░░░░░░░░░░░░░░░  38 de 147                   │
│                                                             │
│  [VER MIS 38 OPCIONES →]                                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Lógica del contador tiempo real

**Query base:**
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE precio BETWEEN $min AND $max) as por_precio,
  COUNT(*) FILTER (WHERE precio BETWEEN $min AND $max 
                   AND microzona = ANY($microzonas)) as por_microzona,
  COUNT(*) FILTER (WHERE precio BETWEEN $min AND $max 
                   AND microzona = ANY($microzonas)
                   AND dormitorios = $dorms) as por_dorms
  -- ... continúa acumulativo
FROM propiedades_v2
WHERE activo = true
  AND zona = 'Equipetrol' -- MVP fijo en Equipetrol
```

**Comportamiento:**
- Cada cambio de filtro dispara query instantáneo
- El contador se actualiza en tiempo real
- Mostrar transición animada del número
- Si un filtro deja 0, resaltar en rojo

### 2.3 Consejos automáticos

**Cuándo mostrar:**

| Situación | Mensaje |
|-----------|---------|
| Un filtro elimina >50% de opciones | "⚠️ [Filtro] elimina el 50% de tus opciones" |
| Quedan <5 opciones | "💡 Tenés pocas opciones. ¿Podés flexibilizar algo?" |
| 0 opciones | "🔴 No hay opciones con estos filtros. Te sugerimos:" + opciones de ajuste |
| Muchas sin info de pago | "ℹ️ X propiedades sin info de financiamiento confirmada" |

**Ejemplo de sugerencias cuando hay 0:**
```
┌─────────────────────────────────────────────────────────────┐
│  🔴 0 OPCIONES CON TUS FILTROS ACTUALES                    │
│                                                             │
│  Opciones para encontrar alternativas:                      │
│  • Subir presupuesto a $90k → 8 opciones                   │
│  • Considerar 1 dormitorio → 3 opciones                    │
│  • Incluir preventa → 5 opciones                           │
│  • Ampliar a Sirari → 4 opciones                           │
│                                                             │
│  [AJUSTAR BÚSQUEDA]  [HABLAR CON ASESOR]                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Manejo de data incompleta

**Forma de pago - lógica:**

| Usuario elige | Comportamiento |
|---------------|----------------|
| Contado | Mostrar todas (contado siempre sirve) |
| Crédito bancario | Filtrar las que aceptan + marcar las sin info |
| Financiamiento directo | Solo las que tienen cuotas confirmadas |
| No sé todavía | Mostrar todas + en cada tarjeta indicar opciones |

**En la tarjeta de propiedad:**
```
Torre Vienna - $89,500
✅ Contado
✅ Crédito bancario  
✅ Financiamiento 36 cuotas
```

vs

```
Edificio Sol - $78,000
✅ Contado
⚠️ Sin info de financiamiento (consultar)
```

---

## 3. ROUTER DE FORMULARIOS SEGÚN PERFIL

### 3.1 El filtro 5 como bifurcador

El filtro "¿Para qué es?" determina qué formulario Nivel 2 se muestra:

```
¿Para qué es?
     │
     ├─ "Vivir yo" ──────────────→ Formulario VIVIENDA (completo)
     │
     ├─ "Inversión renta" ───────→ Formulario INVERSOR RENTA (beta)
     │
     └─ "Inversión plusvalía" ───→ Formulario INVERSOR PLUSVALÍA (beta)
```

### 3.2 Formulario VIVIENDA (completo)

**Wireframe Nivel 2:**
```
+-------------------------------------------------------------+
|  CONTANOS SOBRE VOS                                         |
|                                                             |
|  1. Quienes van a vivir?                                    |
|     [Solo] [Pareja] [Familia] [Roommates]                   |
|     -> Si Familia: Hijos? [1] [2] [3+] Edades: [___]        |
|                                                             |
|  2. Mascotas?                                               |
|     [No] [Perro] [Gato] [Otro]                              |
|     -> Si Perro: [Chico] [Mediano] [Grande]                 |
+-------------------------------------------------------------+
|  TU BUSQUEDA                                                |
|                                                             |
|  3. Hace cuanto buscas?                                     |
|     [Recien empiezo] [1-6 meses] [6-12 meses] [+1 ano]      |
|                                                             |
|  4. Como te sentis con la busqueda?                         |
|     [Motivado] [Cansado] [Frustrado] [Presionado]           |
|                                                             |
|  5. Quien mas decide?                                       |
|     [Solo yo] [Mi pareja] [Familia opina]                   |
|     -> Si pareja: Estan alineados? [Si] [Mas o menos] [No]  |
+-------------------------------------------------------------+
|  QUE BUSCAS                                                 |
|                                                             |
|  6. Sin esto NO me interesa (max 3):                        |
|     [Seguridad 24h] [Estacionamiento] [Pet friendly]        |
|     [Ascensor] [Piscina] [Gimnasio]                         |
|                                                             |
|  7. Seria un PLUS tener:                                    |
|     [Balcon] [Vista] [Terraza] [Lavanderia]                 |
|     [Cowork] [SUM] [Parrillero] [Area ninos]                |
+-------------------------------------------------------------+
|  TRADE-OFFS                                                 |
|                                                             |
|  8. Si tuvieras que elegir:                                 |
|     Mejor ubicacion  [----*----]  Mas metros cuadrados      |
|                                                             |
|  9. Y entre:                                                |
|     Mejor calidad    [----*----]  Mejor precio              |
+-------------------------------------------------------------+
```

**Campos y funcion SQL:**

| # | Campo | Funcion SQL |
|---|-------|-------------|
| 1 | Quienes van a vivir? | perfil |
| 2 | Mascotas? | `evaluar_coherencia_innegociables()` pet_friendly |
| 3 | Hace cuanto buscas? | `detectar_senales_alerta()` fatiga |
| 4 | Como te sentis? | `detectar_senales_alerta()` alertas |
| 5 | Quien mas decide? | perfil/alerta |
| 6 | Innegociables (max 3) | `evaluar_coherencia_innegociables()` |
| 7 | Deseables | ranking futuro |
| 8-9 | Trade-offs | ranking futuro |

**Tiempo estimado:** 2-3 minutos

### 3.3 Formulario INVERSIÓN RENTA (beta)

**Disclaimer inicial:**
```
┌─────────────────────────────────────────────────────────────┐
│  📊 INVERSIÓN RENTA - BETA                                  │
│                                                             │
│  Estamos construyendo data de alquileres en Equipetrol.     │
│  Todavía no tenemos histórico de ocupación ni rentas        │
│  reales por propiedad.                                      │
│                                                             │
│  Lo que SÍ podemos darte hoy:                              │
│  ✓ Precio/m² comparado con promedio de zona                │
│  ✓ Stock y competencia en tu tipología                     │
│  ✓ Alertas de precios sospechosos                          │
│  ✓ Desarrolladores con track record                         │
│                                                             │
│  [CONTINUAR CON ANÁLISIS DISPONIBLE]                       │
│  [AVISAME CUANDO ESTÉ COMPLETO]                            │
└─────────────────────────────────────────────────────────────┘
```

**Campos beta:**
- ¿Cuál es tu retorno anual esperado? (%, aproximado)
- ¿Vas a gestionar vos o tercerizar?
- ¿Horizonte de inversión? (corto <3 años / mediano 3-7 / largo >7)
- ¿Primera inversión inmobiliaria o ya tenés otras?
- ¿Tolerancia a vacancia? (necesito ingreso fijo / puedo esperar)

### 3.4 Formulario INVERSIÓN PLUSVALÍA (beta)

**Disclaimer inicial:**
```
┌─────────────────────────────────────────────────────────────┐
│  📈 INVERSIÓN PLUSVALÍA - BETA                              │
│                                                             │
│  Estamos construyendo histórico de precios en Equipetrol.   │
│  Todavía no tenemos data de apreciación por zona ni         │
│  proyecciones validadas.                                    │
│                                                             │
│  Lo que SÍ podemos darte hoy:                              │
│  ✓ Precio actual vs promedio de mercado                    │
│  ✓ Identificar si estás comprando bajo/sobre               │
│  ✓ Evaluar desarrollador y etapa del proyecto              │
│  ✓ Stock disponible (oferta actual)                        │
│                                                             │
│  [CONTINUAR CON ANÁLISIS DISPONIBLE]                       │
│  [AVISAME CUANDO ESTÉ COMPLETO]                            │
└─────────────────────────────────────────────────────────────┘
```

**Campos beta:**
- ¿Horizonte de salida? (3 / 5 / 10+ años)
- ¿Apetito de riesgo? (conservador: construido / moderado: en obra / agresivo: preventa)
- ¿Experiencia previa en real estate?
- ¿Tolerancia a iliquidez? (puedo esperar el momento correcto / necesito poder salir rápido)

### 3.5 Data disponible para inversores HOY

| Data | Disponible | Fuente |
|------|------------|--------|
| Precio/m² por zona | ✅ | v_metricas_mercado |
| Comparación con promedio | ✅ | analisis_mercado_fiduciario() |
| Stock disponible por tipología | ✅ | Query COUNT GROUP BY |
| Desarrollador | ✅ Parcial | proyectos_master |
| Preventa vs entrega | ✅ | propiedades_v2.estado_entrega |
| Amenities | ✅ | propiedades_v2.amenities JSONB |
| Precio sospechosamente bajo | ✅ | detectar_senales_alerta() |
| Histórico de precios | ❌ | Necesita historial_precios |
| Rentas reales | ❌ | No existe todavía |
| Tasa de ocupación | ❌ | No existe todavía |

---

## 4. TEASERS DE INTELIGENCIA (hooks al premium)

### 4.1 Qué son los teasers

Los teasers muestran que Simón tiene MÁS inteligencia sin revelar todo gratis. Generan curiosidad legítima basada en valor real, no clickbait.

**Principios:**
- Siempre basados en data real
- Muestran el "qué" pero no el "detalle"
- El pago desbloquea el análisis profundo

### 4.2 Teasers durante los filtros

Mostrar mientras el usuario ajusta filtros:

```
┌─────────────────────────────────────────────────────────────┐
│  💡 DETECTAMOS EN TU BÚSQUEDA:                             │
│                                                             │
│  • 3 propiedades 12-18% bajo promedio de zona              │
│  • 2 con precio sospechosamente bajo                        │
│  • Tu tipología (2 dorm) tiene 15% más stock que hace 6m   │
│                                                             │
│  [VER ANÁLISIS COMPLETO → INFORME PREMIUM]                 │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Teasers en resultados gratis

Después de mostrar las 3+10+excluidas:

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 TU INFORME PREMIUM INCLUYE:                            │
│                                                             │
│  • Por qué elegimos estas 3 y descartamos 47               │
│  • Las 5 propiedades más baratas que NO te mostramos       │
│    (y por qué fue bueno no mostrártelas)                   │
│  • Ficha de coherencia: ¿realmente encaja con tu vida?     │
│  • 2 alertas de riesgo que detectamos                      │
│  • Tu perfil fiduciario listo para compartir con broker    │
│                                                             │
│  [DESBLOQUEAR INFORME → $29.99]                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Teasers por perfil

**Para VIVIENDA:**
```
"Detectamos que 2 de tus opciones están en calles con alto 
tráfico. Tu informe incluye mapa de ruido y vida real."
```

**Para INVERSIÓN RENTA:**
```
"El precio/m² promedio en tu búsqueda es $1,450. Hay 2 
propiedades a $1,180/m². Tu informe explica por qué."
```

**Para INVERSIÓN PLUSVALÍA:**
```
"3 propiedades son preventa de desarrolladores sin track 
record verificado. Tu informe incluye análisis de riesgo."
```

---

## 5. ESTRUCTURA DE RESULTADOS GRATIS

### 5.1 Los 3 niveles de resultados

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🏆 TUS 3 MEJORES OPCIONES                                 │
│     Match 90%+ | Simón las recomienda                      │
│     [Card 1] [Card 2] [Card 3]                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📋 10 ALTERNATIVAS                                        │
│     Match 70-89% | Buenas, con algún compromiso            │
│     [Card 4] [Card 5] ... [Card 13]                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🚫 EXCLUIDAS MÁS BARATAS                                  │
│     "Hay 5 más baratas que no incluimos"                   │
│     • 2 violan tus innegociables                           │
│     • 2 sin fotos verificadas                              │
│     • 1 precio sospechosamente bajo                        │
│                                                             │
│     [VER DETALLE EN INFORME PREMIUM]                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 TOP 3 Matches - Detalle de tarjeta

```
┌─────────────────────────────────────────────────────────────┐
│  [FOTO PRINCIPAL]                                          │
│                                                             │
│  Torre Vienna - Depto 4B                    94% MATCH 🏆   │
│  $89,500 · 2 dorm · 85m² · Equipetrol Norte                │
│                                                             │
│  ✅ Contado  ✅ Crédito  ✅ 36 cuotas                       │
│  📅 Lista para entrega                                     │
│                                                             │
│  💬 RAZÓN FIDUCIARIA:                                      │
│  "Cumple tus 3 innegociables. Precio 8% bajo promedio      │
│   de zona. Desarrollador con 12 proyectos entregados."     │
│                                                             │
│  [VER DETALLE]  [AGENDAR VISITA]                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 10 Alternativas - Detalle de tarjeta

```
┌─────────────────────────────────────────────────────────────┐
│  [FOTO]                                                     │
│                                                             │
│  Edificio Luna - Depto 7C                   82% MATCH      │
│  $76,000 · 2 dorm · 72m² · Equipetrol Sur                  │
│                                                             │
│  ⚠️ COMPROMISO: Sin balcón (tu deseable)                   │
│                                                             │
│  [VER DETALLE]                                             │
└─────────────────────────────────────────────────────────────┘
```

**Tipos de compromiso a mostrar:**
- "Sin balcón (tu deseable)"
- "Piso 3 (querías alto)"
- "5 min más lejos del trabajo"
- "Sin amenities (gimnasio, piscina)"
- "Preventa 2026 (querías inmediato)"
- "Sin info de financiamiento"

### 5.4 Excluidas más baratas

**Vista colapsada (gratis):**
```
🚫 5 PROPIEDADES EXCLUIDAS (más baratas)
├─ 2 violan innegociables
├─ 2 sin fotos verificadas  
└─ 1 precio sospechosamente bajo

[VER DETALLE EN INFORME PREMIUM]
```

**Vista expandida (premium):**
```
🚫 EXCLUIDAS - DETALLE COMPLETO

1. Torre Sol $68,000 - EXCLUIDA
   ❌ Viola innegociable: Sin seguridad 24h
   
2. Edificio Mar $71,500 - EXCLUIDA
   ❌ Viola innegociable: Sin estacionamiento
   
3. Depto Centro $65,000 - EXCLUIDA
   ⚠️ Sin fotos verificadas - no podemos evaluar estado
   
4. Torre Norte $63,000 - EXCLUIDA
   ⚠️ Sin fotos verificadas
   
5. Oportunidad BC $58,000 - EXCLUIDA
   🔴 Precio 32% bajo promedio - posible problema oculto
      Recomendación: Investigar antes de considerar
```

### 5.5 Información en cada tarjeta de propiedad

**Datos obligatorios:**
- Foto principal (requerida para aparecer)
- Nombre proyecto + identificador
- Precio en USD
- Dormitorios
- Área en m²
- Microzona/ubicación

**Datos de estado:**
- Entrega: "Lista" / "Preventa 2026" / "En construcción"
- Pago: ✅ Contado / ✅ Crédito / ⚠️ Sin info

**Razón fiduciaria (solo top 3):**
- 1-2 oraciones explicando por qué está en el top
- Generada por generar_resumen_fiduciario()

**Compromiso (solo alternativas):**
- 1 línea indicando qué le falta vs perfil ideal

---

## 6. PREMIUM $29.99 - QUÉ DESBLOQUEA

### 6.1 Contenido premium completo

**Sección 1: Tu Perfil Fiduciario**
- Resumen de quién sos como comprador
- Tus innegociables y deseables
- Tu estado emocional detectado
- Señales de alerta (si las hay)

**Sección 2: Análisis TOP 3**
- Ficha de coherencia completa por propiedad
- Por qué cada una está en el top
- Qué cumple y qué compromiso tiene (si alguno)
- Alertas específicas

**Sección 3: Análisis 10 Alternativas**
- Detalle del compromiso de cada una
- Por qué no llegaron al top 3
- Cuáles vale la pena considerar si flexibilizás

**Sección 4: Excluidas Explicadas**
- Lista completa de excluidas más baratas
- Razón específica por cada una
- Cuáles investigar si querés (con advertencias)

**Sección 5: Alertas de Riesgo**
- Precios sospechosos detectados
- Desarrolladores sin track record
- Señales de mercado relevantes

**Sección 6: Escenario Financiero** → PRÓXIMAMENTE
- Liquidez estimada
- Renta estimada (para inversores)
- Proyección a 3-5 años

**Sección 7: Mapa Vida Real** → PRÓXIMAMENTE
- Ruido y tráfico
- Accesos y movilidad
- Vida del barrio

**Sección 8: Tu Perfil para Broker**
- Documento exportable
- Todo lo que el broker necesita saber
- Acelera el proceso de cierre

**Sección 9: Conclusión Fiduciaria**
- Recomendación final de Simón
- Próximos pasos sugeridos
- CTA a WhatsApp/asesor

### 6.2 Secciones "Próximamente"

Mostrar con badge visual, no esconder:

```
┌─────────────────────────────────────────────────────────────┐
│  📊 ESCENARIO FINANCIERO                    🔜 PRÓXIMAMENTE │
│                                                             │
│  Estamos construyendo:                                      │
│  • Estimaciones de liquidez por zona                        │
│  • Proyecciones de renta por tipología                      │
│  • Análisis de apreciación histórica                        │
│                                                             │
│  Te avisaremos cuando esté disponible.                      │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 CTA y momento del pago

**Cuándo mostrar CTA principal:**
- Después de ver resultados gratis (3+10+excluidas)
- En cada teaser de inteligencia
- Al intentar ver detalle de excluidas

**Copy del botón:**
- Principal: "Desbloquear Informe Completo → $29.99"
- Alternativo: "Ver análisis profundo → $29.99"
- Urgencia (opcional): "Precio de lanzamiento"

**Post-pago:**
1. Confirmación inmediata
2. Informe disponible para ver online
3. PDF descargable
4. Opción de enviar a WhatsApp
5. CTA a CrediCheck (gratis incluido)

---

## 7. RESUMEN DE IMPLEMENTACIÓN

### 7.1 Prioridad de construcción

| Prioridad | Feature | Complejidad | Dependencias |
|-----------|---------|-------------|--------------|
| 1 | Filtros tiempo real con contador | Media | Query SQL |
| 2 | Router de formularios por perfil | Baja | UI condicional |
| 3 | Estructura 3+10+excluidas | Media | analisis_mercado_fiduciario() |
| 4 | Tarjetas con compromiso visible | Baja | UI + datos |
| 5 | Teasers de inteligencia | Baja | Lógica condicional |
| 6 | Premium modal actualizado | Media | Ya existe base |
| 7 | Formularios inversión beta | Baja | Campos nuevos |

### 7.2 Queries SQL necesarios

**Contador por filtro (tiempo real):**
```sql
CREATE OR REPLACE FUNCTION contar_opciones_filtradas(
  p_precio_min NUMERIC,
  p_precio_max NUMERIC,
  p_microzonas TEXT[],
  p_dormitorios INTEGER,
  p_entrega TEXT,
  p_forma_pago TEXT
) RETURNS TABLE (
  total INTEGER,
  por_precio INTEGER,
  por_microzona INTEGER,
  por_dormitorios INTEGER,
  por_entrega INTEGER,
  por_pago INTEGER,
  sin_info_pago INTEGER
) AS $$
-- Implementar conteo acumulativo
$$;
```

**Top 3 + Alternativas + Excluidas:**
```sql
-- Ya existe en analisis_mercado_fiduciario()
-- Modificar para retornar 3 categorías:
-- 1. opciones_recomendadas (top 3, score >= 90)
-- 2. opciones_alternativas (10, score 70-89)
-- 3. opciones_excluidas (las más baratas descartadas)
```

**Detectar compromiso por propiedad:**
```sql
CREATE OR REPLACE FUNCTION detectar_compromiso(
  p_propiedad_id UUID,
  p_perfil_usuario JSONB
) RETURNS TEXT AS $$
-- Compara propiedad vs perfil
-- Retorna el compromiso principal en 1 línea
$$;
```

### 7.3 Componentes frontend a crear/modificar

**Nuevos componentes:**

| Componente | Descripción |
|------------|-------------|
| `FilterBar.tsx` | 6 filtros con contador tiempo real |
| `FilterCounter.tsx` | Animación del contador |
| `FilterAdvice.tsx` | Consejos automáticos |
| `ProfileRouter.tsx` | Bifurcación por tipo de usuario |
| `FormInvestorRent.tsx` | Formulario inversión renta beta |
| `FormInvestorGrowth.tsx` | Formulario inversión plusvalía beta |
| `ResultsLayout.tsx` | Layout con 3 secciones |
| `TopMatchCard.tsx` | Tarjeta top 3 con razón fiduciaria |
| `AlternativeCard.tsx` | Tarjeta alternativa con compromiso |
| `ExcludedSection.tsx` | Sección de excluidas colapsable |
| `IntelligenceTeaser.tsx` | Teasers de inteligencia |

**Modificar existentes:**

| Componente | Modificación |
|------------|--------------|
| `PremiumModal.tsx` | Agregar secciones "Próximamente" |
| `PropertyCard.tsx` | Agregar indicador de compromiso |
| `LeadForm.tsx` | Integrar con router de perfiles |

### 7.4 Estados de la aplicación

```typescript
interface SearchState {
  // Filtros básicos
  filters: {
    precioMin: number;
    precioMax: number;
    microzonas: string[];
    dormitorios: number | null;
    entrega: 'lista' | 'preventa' | 'cualquiera';
    paraque: 'vivienda' | 'renta' | 'plusvalia';
    formaPago: 'contado' | 'credito' | 'financiamiento' | 'nosabe';
  };
  
  // Contador tiempo real
  counts: {
    total: number;
    filtered: number;
    sinInfoPago: number;
  };
  
  // Resultados
  results: {
    top3: Property[];
    alternativas: Property[];
    excluidas: Property[];
  };
  
  // Perfil del usuario
  profile: ViviendaProfile | InversorRentaProfile | InversorPlusvaliaProfile;
  
  // Estado de pago
  premium: {
    paid: boolean;
    reportId: string | null;
  };
}
```

---

## APÉNDICE: Wireframes de texto

### A. Pantalla de filtros

```
┌─────────────────────────────────────────────────────────────┐
│  SIMÓN                                    [≡ Menú]          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Encontrá tu lugar ideal                                    │
│  Sin vueltas, con análisis real                            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Presupuesto                                                │
│  $50k ──────────●────────── $200k                          │
│                 $80k - $120k                                │
│                                         → 89 propiedades    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Microzona                                                  │
│  [✓] Equipetrol (centro)  [ ] Sirari                       │
│  [ ] Equipetrol Norte/Norte  [ ] Equipetrol Norte/Sur      │
│  [ ] Villa Brigida  [ ] Faremafu                           │
│                                         → 67 propiedades    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ... (resto de filtros)                                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 💡 En tu búsqueda:                                  │   │
│  │ • 3 propiedades 12-18% bajo promedio                │   │
│  │ • Tu tipología tiene buen stock disponible          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ████████████████░░░░░░░░░░░  38 de 147                    │
│                                                             │
│  [        VER MIS 38 OPCIONES        ]                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### B. Pantalla de resultados

```
┌─────────────────────────────────────────────────────────────┐
│  SIMÓN                           [Modificar filtros]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Analizamos 147 propiedades. Estas son tus mejores:        │
│                                                             │
│  ═══════════════════════════════════════════════════════   │
│  🏆 TUS 3 MEJORES OPCIONES                                 │
│  ═══════════════════════════════════════════════════════   │
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │  FOTO   │ │  FOTO   │ │  FOTO   │                       │
│  │ 94% ⭐  │ │ 91% ⭐  │ │ 90% ⭐  │                       │
│  │ $89,500 │ │ $92,000 │ │ $87,000 │                       │
│  │ Vienna  │ │ Torres  │ │ Green   │                       │
│  └─────────┘ └─────────┘ └─────────┘                       │
│                                                             │
│  ───────────────────────────────────────────────────────   │
│  📋 10 ALTERNATIVAS (buenas, con algún compromiso)         │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  [Card] [Card] [Card] [Card] [Card]                        │
│  [Card] [Card] [Card] [Card] [Card]                        │
│                                                             │
│  ───────────────────────────────────────────────────────   │
│  🚫 5 EXCLUIDAS (más baratas)                              │
│  2 violan innegociables · 2 sin fotos · 1 precio raro      │
│  [Ver detalle en Informe Premium]                          │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔍 Tu informe premium incluye:                     │   │
│  │  • Análisis profundo de las 13 opciones             │   │
│  │  • Por qué excluimos las 5 más baratas              │   │
│  │  • 2 alertas de riesgo detectadas                   │   │
│  │  • Tu perfil listo para el broker                   │   │
│  │                                                     │   │
│  │  [  DESBLOQUEAR INFORME → $29.99  ]                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## FIN DEL DOCUMENTO

**Próximo paso:** Code implementa siguiendo esta especificación, comenzando por los filtros tiempo real y la estructura de resultados 3+10+excluidas.
