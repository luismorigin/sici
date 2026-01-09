# FORMULARIO VIVIENDA - MVP (2 Niveles)

**Versión:** 2.1
**Fecha:** 9 Enero 2026
**Estructura:** Nivel 1 (8 campos) + Nivel 2 (10 campos)

---

## ARQUITECTURA DE 2 NIVELES

```
┌─────────────────────────────────────────────────────────────┐
│  NIVEL 1: BÚSQUEDA RÁPIDA (8 campos, ~2 min)               │
│  ─────────────────────────────────────────────────────────  │
│  • Presupuesto, zona, dormitorios, área, amenities         │
│  • OUTPUT: Lista de propiedades que cumplen filtros        │
│  • SIN razón fiduciaria personalizada                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  "¿Querés que Simón te explique POR QUÉ cada opción        │
│   encaja con vos? Completá 10 preguntas más (3 min)"       │
│                                                             │
│   [ SOLO VER RESULTADOS ]    [ SÍ, PERSONALIZAR → ]        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  NIVEL 2: CONTEXTO FIDUCIARIO (+10 campos, ~3 min)         │
│  ─────────────────────────────────────────────────────────  │
│  • Composición hogar, historia, trade-offs, alertas        │
│  • OUTPUT: Lista + RAZÓN FIDUCIARIA personalizada          │
│  • "Por qué esta propiedad encaja con TU vida"             │
└─────────────────────────────────────────────────────────────┘
```

---

# NIVEL 1 — BÚSQUEDA RÁPIDA

**Campos:** 8
**Tiempo:** ~2 minutos
**Output:** Lista de propiedades (datos + fotos)

---

## 1.1 PRESUPUESTO

```
¿Cuál es tu presupuesto MÁXIMO?

$[________] USD

💡 Te mostraremos opciones hasta este monto
```

**SQL:** `precio_max`

---

## 1.2 ZONA

```
¿Dónde querés vivir? (elegí hasta 3)

□ Equipetrol
□ Equipetrol Norte
□ Urbari
□ Sirari
□ Las Palmas
□ Otra zona: [____]
```

**SQL:** `zona`

---

## 1.3 DORMITORIOS

```
¿Cuántos dormitorios mínimo?

○ 1
○ 2
○ 3
○ 4+
```

**SQL:** `dormitorios`

---

## 1.4 ÁREA MÍNIMA

```
¿Tamaño mínimo?

○ No importa
○ Al menos 50 m²
○ Al menos 70 m²
○ Al menos 90 m²
○ Al menos 120 m²
```

**SQL:** `area_min`

---

## 1.5 INNEGOCIABLES

```
Sin esto, NO me interesa (máx 3):

□ Pet friendly (acepta mascotas)
□ Estacionamiento incluido
□ Seguridad 24/7
□ Ascensor
□ Balcón o terraza
□ Ninguno es innegociable
```

**Filtro:** Post-query en amenities

---

## 1.6 DESEABLES

```
Me gustaría, pero no es crítico:

□ Piscina
□ Gimnasio
□ Área BBQ/parrilla
□ Edificio nuevo (< 5 años)
```

**Uso:** Ranking de resultados

---

## 1.7 TIPO FINANCIACIÓN

```
¿Cómo financiás la compra?

○ Efectivo / ahorro
○ Crédito hipotecario
○ Venta de otra propiedad
○ Combinación
```

**Uso:** Contexto (no afecta búsqueda)

---

## 1.8 CONTACTO

```
¿Cómo te contactamos con las opciones?

Nombre: [____________]
WhatsApp: [____________]
```

**Uso:** Lead capture

---

## OUTPUT NIVEL 1

```json
{
  "nivel": 1,
  "mbf_filtros": {
    "precio_max": 150000,
    "zona": "Equipetrol",
    "dormitorios": 2,
    "area_min": 70,
    "solo_con_fotos": true
  },
  "innegociables": ["pet_friendly", "estacionamiento"],
  "deseables": ["piscina"],
  "contacto": {
    "nombre": "María",
    "whatsapp": "+591..."
  }
}
```

**Llamada SQL:**
```sql
SELECT * FROM buscar_unidades_reales('{
  "precio_max": 150000,
  "zona": "Equipetrol",
  "dormitorios": 2,
  "area_min": 70,
  "solo_con_fotos": true,
  "limite": 5
}');
```

**Pantalla resultado Nivel 1:**
```
┌─────────────────────────────────────────────────────────────┐
│  ENCONTRAMOS 5 OPCIONES PARA VOS                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [FOTO]  SKY TOWER - 2 dorm                           │  │
│  │         85 m² · $142,000 · $1,670/m²                 │  │
│  │         ✅ Pet Friendly ✅ Estacionamiento            │  │
│  │         📍 Equipetrol                                 │  │
│  │                                                       │  │
│  │  [VER FOTOS]  [VER DETALLES]                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [Propiedad 2...]                                           │
│  [Propiedad 3...]                                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ╔═══════════════════════════════════════════════════════╗ │
│  ║  ¿Querés que Simón te explique POR QUÉ cada opción   ║ │
│  ║  encaja con vos?                                      ║ │
│  ║                                                       ║ │
│  ║  Completá 10 preguntas más (3 min) y recibí:         ║ │
│  ║  • Razón personalizada por cada propiedad            ║ │
│  ║  • Alertas si algo no encaja con tu situación        ║ │
│  ║  • Guía de qué preguntar al visitar                  ║ │
│  ║                                                       ║ │
│  ║  [ SOLO VER ESTAS ]    [ SÍ, PERSONALIZAR → ]        ║ │
│  ╚═══════════════════════════════════════════════════════╝ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# NIVEL 2 — CONTEXTO FIDUCIARIO

**Campos adicionales:** 10
**Tiempo:** ~3 minutos
**Output:** Lista + Razón Fiduciaria + Alertas

---

## 2.1 COMPOSICIÓN HOGAR

```
¿Quiénes van a vivir?

○ Solo yo
○ Pareja sin hijos
○ Pareja con hijos → ¿Cuántos? [1] [2] [3+]
○ Familia extendida
```

**Uso:** Personalizar razón ("ideal para familia de 4")

---

## 2.2 MASCOTAS

```
¿Tenés mascotas?

○ No
○ Sí, perro → □ Chico □ Mediano □ Grande
○ Sí, gato
○ Sí, otro
```

**Uso:** Razón ("tu perro grande va a estar cómodo")

---

## 2.3 TIEMPO BUSCANDO

```
¿Hace cuánto buscás?

○ Recién empiezo (< 1 mes)
○ Algunos meses (1-6)
○ Bastante tiempo (6-12 meses)
○ Más de un año
```

**Uso:** Alerta fatiga, tono de guía

---

## 2.4 ESTADO EMOCIONAL

```
¿Cómo te sentís con la búsqueda?

○ Activo, con energía
○ Cansado pero sigo
○ Frustrado
○ Presionado
```

**Uso:** Alerta, recomendación de pausa

---

## 2.5 HORIZONTE

```
¿Cuánto tiempo pensás vivir ahí?

○ 1-3 años (paso intermedio)
○ 3-7 años (mediano plazo)
○ 7+ años (largo plazo)
```

**Uso:** Razón ("buena inversión a largo plazo")

---

## 2.6 TRADE-OFF: UBICACIÓN vs METROS

```
Si tuvieras que elegir:

○ Mejor ubicación, menos metros
○ Más metros, peor ubicación
```

**Uso:** Priorizar resultados, razón personalizada

---

## 2.7 TRADE-OFF: EXPENSAS

```
Si tuvieras que elegir:

○ Depto perfecto, expensas altas ($300+)
○ Depto bueno, expensas bajas ($150)
```

**Uso:** Alertar sobre expensas altas

---

## 2.8 QUIÉN DECIDE

```
¿Quién más decide?

○ Solo yo
○ Mi pareja → ¿Alineados? ○ Sí ○ Más o menos ○ No
○ Familia opina fuerte
```

**Uso:** Alerta desalineación

---

## 2.9 PRESIÓN EXTERNA

```
¿Sentís presión para cerrar rápido?

○ No, a mi ritmo
○ Un poco
○ Bastante / Mucha
```

**Uso:** Alerta presión, guía de timing

---

## 2.10 CONFIRMAR INNEGOCIABLES

```
Confirmá tus TOP 3 innegociables:

Dijiste que no comprás sin:
1. [Pet friendly] → ○ Confirmo ○ Cambiar
2. [Estacionamiento] → ○ Confirmo ○ Cambiar
3. [___] → ○ Confirmo ○ Cambiar

¿Correcto para buscar?
```

**Uso:** Validar antes de generar razón

---

## OUTPUT NIVEL 2

```json
{
  "nivel": 2,

  "mbf_filtros": {
    "precio_max": 150000,
    "zona": "Equipetrol",
    "dormitorios": 2,
    "area_min": 70
  },

  "contexto_fiduciario": {
    "composicion": "pareja_con_hijos",
    "hijos": 2,
    "mascota": {"tipo": "perro", "tamano": "grande"},
    "meses_buscando": 8,
    "estado_emocional": "cansado",
    "horizonte": "largo_plazo",
    "prioriza": "ubicacion",
    "sensible_expensas": true,
    "decision_compartida": true,
    "alineacion_pareja": "mas_o_menos",
    "presion_externa": "poca"
  },

  "alertas": [
    {"tipo": "fatiga", "severidad": "media", "msg": "Llevas 8 meses buscando"},
    {"tipo": "desalineacion", "severidad": "baja", "msg": "Tu pareja no está 100% alineada"}
  ],

  "innegociables_confirmados": ["pet_friendly", "estacionamiento"]
}
```

---

## PANTALLA RESULTADO NIVEL 2

```
┌─────────────────────────────────────────────────────────────┐
│  TU GUÍA FIDUCIARIA                                         │
│  ─────────────────                                          │
│  "Buscás estabilidad para tu familia de 4 en zona          │
│   tranquila. Llevas 8 meses buscando - no decidas          │
│   por cansancio. Tu perro grande necesita edificio         │
│   que realmente sea pet friendly."                          │
│                                                             │
│  ⚠️ Alertas:                                                │
│  • Fatiga de búsqueda detectada - tomate tu tiempo         │
│  • Asegurate de alinear con tu pareja antes de ofertar     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  OPCIONES COHERENTES CON TU VIDA (3)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [FOTO]  SKY TOWER - 2 dorm                           │  │
│  │         85 m² · $142,000 · $1,670/m²                 │  │
│  │         ✅ Pet Friendly ✅ Estacionamiento            │  │
│  │                                                       │  │
│  │  💡 POR QUÉ ENCAJA CON VOS:                          │  │
│  │  "1 de solo 5 opciones pet friendly bajo $150k       │  │
│  │   en Equipetrol. Edificio permite perros grandes.    │  │
│  │   15% bajo el promedio de zona - buena inversión     │  │
│  │   para los 7+ años que pensás quedarte."             │  │
│  │                                                       │  │
│  │  [VER FOTOS]  [VER DETALLES]                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [Propiedad 2 con razón personalizada...]                  │
│  [Propiedad 3 con razón personalizada...]                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## GENERACIÓN RAZÓN FIDUCIARIA (Nivel 2)

```sql
-- Para cada propiedad del resultado:
SELECT
  p.*,
  generar_razon_fiduciaria(p.id) as razon_data,
  calcular_posicion_mercado(p.precio_usd, p.zona, p.dormitorios) as posicion
FROM buscar_unidades_reales('{...}') p;
```

**Prompt Claude (combina SQL + contexto):**
```
Dado este contexto del usuario:
- Familia de 4 con perro grande
- Busca hace 8 meses, cansado
- Horizonte largo plazo (7+ años)
- Prioriza ubicación sobre metros

Y estos datos de la propiedad:
- Razón SQL: "1 de solo 5 bajo $150k en Equipetrol"
- Posición: "15% bajo promedio zona"
- Amenities: pet_friendly, estacionamiento, piscina

Genera 2-3 oraciones explicando por qué esta
propiedad encaja con SU situación específica.
```

---

## RESUMEN COMPARATIVO

| Aspecto | Nivel 1 | Nivel 2 |
|---------|---------|---------|
| Campos | 8 | 18 (8+10) |
| Tiempo | 2 min | 5 min |
| Output | Lista + datos | Lista + razón personalizada |
| Razón fiduciaria | ❌ Genérica | ✅ Personalizada |
| Alertas | ❌ | ✅ |
| Guía | ❌ | ✅ |
| Llamadas Claude | 0 | 1-2 |

---

## FLUJO TÉCNICO

```
NIVEL 1:
Usuario → 8 campos → SQL directo → Resultados básicos

NIVEL 2:
Usuario → +10 campos → SQL + Claude API → Resultados + Razón
```

**Costo estimado:**
- Nivel 1: $0 (solo SQL)
- Nivel 2: ~$0.02 (Claude API)

---

## MÉTRICAS A TRACKEAR

| Métrica | Qué mide |
|---------|----------|
| % completa Nivel 1 | Fricción básica |
| % elige "Personalizar" | Valor percibido Nivel 2 |
| % completa Nivel 2 | Fricción adicional |
| % deja contacto | Conversión |
| Tiempo por nivel | UX |

---

*Documento v2.1 — 9 Enero 2026*
*Arquitectura 2 niveles: Quick Search + Fiduciario*
