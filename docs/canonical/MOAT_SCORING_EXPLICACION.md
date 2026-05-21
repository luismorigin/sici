# MOAT SCORING: Cómo Funciona el Ranking `[LEGACY]`

> **⚠️ LEGACY (funnel premium dormido):** este algoritmo de ranking (175 pts, innegociables/deseables/trade-offs) corre **solo en `/resultados-v2`** — el funnel premium accesible por URL directa, hoy fuera del flujo principal. El feed de producción (`/ventas`, `/alquileres`) **NO usa este scoring**: ordena por fecha/zona y muestra un mini estudio de mercado inline (mediana + % vs mediana). El producto podría retomar este funnel; mientras tanto, esto documenta cómo funcionaría, no el flujo actual. La **filosofía** detrás vive en `MOAT_FIDUCIARIO_INTERPRETACION.md`.
>
> **Versión:** 1.0
> **Fecha:** 14 Enero 2026
> **Propósito:** Explicación didáctica del algoritmo de scoring MOAT
> **Relacionado:** `MOAT_FIDUCIARIO_INTERPRETACION.md` (filosofía), `sql/tests/test_scoring_moat.sql` (validación)

---

## El Problema que Resuelve

**Portales tradicionales (InfoCasas, Zillow):**
- Ordenan por precio más bajo primero
- No consideran las preferencias del usuario
- Ignoran el contexto de mercado

**Simón con MOAT:**
- Ordena por compatibilidad personal + oportunidad de mercado
- Combina lo mejor de Tinder (match personal) y Zillow (data de mercado)
- El usuario ve primero lo que realmente le conviene

---

## La Fórmula

```
SCORE_MOAT = INNEGOCIABLES + OPORTUNIDAD + TRADE_OFFS + DESEABLES
           = (0-100)      + (0-40)      + (0-20)     + (0-15)
           = Máximo 175 puntos
```

### Componentes Visuales

```
┌─────────────────────────────────────────────────────────────┐
│                    SCORE MOAT (175 pts max)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ████████████████████████████████████████  INNEGOCIABLES    │
│  ████████████████████████████████████████  (0-100 pts)      │
│                                                             │
│  ████████████████████          OPORTUNIDAD (0-40 pts)       │
│                                                             │
│  ████████████         TRADE-OFFS (0-20 pts)                 │
│                                                             │
│  ██████       DESEABLES (0-15 pts)                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. INNEGOCIABLES (0-100 puntos)

### Qué Son
Amenidades que el usuario marcó como obligatorias (máximo 3).

### Scoring Gradual (Mejora v2)

| Estado de la Amenidad | Puntos | Razón |
|----------------------|--------|-------|
| **Confirmado** (en fotos/specs) | 100% | Certeza alta |
| **Por verificar** (en descripción) | 50% | Metodología G4: Indeterminado ≠ Falla |
| **No tiene** | 0% | No cumple el requisito |

### Ejemplo con 2 Innegociables

**Usuario pide:** Piscina + Pet Friendly

| Propiedad | Piscina | Pet Friendly | Cálculo | Score |
|-----------|---------|--------------|---------|-------|
| Las Dalias | ✓ Confirmado | ✓ Confirmado | 50 + 50 | **100** |
| Stone Tower | ✓ Confirmado | ~ Por verificar | 50 + 25 | **75** |
| Impera | ~ Por verificar | ✗ No tiene | 25 + 0 | **25** |
| NanoTec | ✗ No tiene | ✗ No tiene | 0 + 0 | **0** |

### Por Qué Importa

```
ANTES (binario):
- Confirmado = 100, Cualquier otra cosa = 0
- Stone Tower con Pet Friendly "por verificar" → 0 puntos (¡injusto!)

AHORA (gradual):
- Confirmado = 100%, Por verificar = 50%, No tiene = 0%
- Stone Tower → 75 puntos (posición intermedia razonable)
```

---

## 2. OPORTUNIDAD (0-40 puntos)

### Qué Es
Qué tan bueno es el precio comparado con el mercado de la zona.

### La Magia: Se Invierte Según el Slider

El usuario tiene un slider `calidad_vs_precio` (1 a 5):

| Valor | Significado | Cómo Puntúa |
|-------|-------------|-------------|
| 1-2 | **Prioriza calidad** | Premium/caro = más puntos |
| 3 | **Neutral** | Balance |
| 4-5 | **Prioriza precio** | Barato = más puntos |

### MODO PRECIO (slider = 4-5)
*"Quiero ahorrar plata"*

| diferencia_pct | Interpretación | Puntos |
|----------------|----------------|--------|
| ≤ -20% | Oportunidad clara | **40** |
| -20% a -10% | Bajo promedio | **30** |
| -10% a +5% | Precio justo | **20** |
| +5% a +15% | Sobre promedio | **10** |
| > +15% | Premium | **0** |

### MODO CALIDAD (slider = 1-2)
*"Prefiero pagar más por mejor calidad"*

| diferencia_pct | Interpretación | Puntos |
|----------------|----------------|--------|
| ≥ +15% | Premium | **40** |
| +5% a +15% | Sobre promedio | **30** |
| -10% a +5% | Precio justo | **20** |
| -20% a -10% | Bajo promedio | **10** |
| < -20% | Muy barato (sospechoso) | **0** |

### Ejemplo Real

**Propiedad:** BLUE BOX, Equipetrol, $2,100/m² (zona promedia $2,300/m²)
**diferencia_pct:** -8.7%

| Slider | Modo | Puntos Oportunidad |
|--------|------|-------------------|
| 5 | PRECIO | **30** (está barato = bueno) |
| 3 | NEUTRAL | **25** |
| 1 | CALIDAD | **20** (está barato = no tan bueno) |

---

## 3. TRADE-OFFS (0-20 puntos)

### Trade-Off 1: ubicacion_vs_metros

| Slider | Significado | Bonus |
|--------|-------------|-------|
| 1-2 | Prioriza ubicación | (Sin bonus en MVP) |
| 4-5 | Prioriza metros | **+10** si área > mediana tipología |

**Medianas por tipología (Enero 2026):**

| Dormitorios | Mediana m² |
|-------------|------------|
| 0 (mono) | 36 m² |
| 1 dorm | 52 m² |
| 2 dorm | 88 m² |
| 3 dorm | 165 m² |

**Ejemplo:**
- OMNIA PRIME tiene 114 m² (2 dorm)
- Mediana 2 dorm = 88 m²
- Si slider ubicacion_vs_metros ≥ 4 → **+10 puntos**

### Trade-Off 2: calidad_vs_precio (bonus adicional)

| Slider | Significado | Bonus |
|--------|-------------|-------|
| 1-2 | Prioriza calidad | **+10** si ≥5 amenidades O precio/m² > mediana zona |
| 4-5 | Prioriza precio | **+10** si precio/m² < mediana zona |

---

## 4. DESEABLES (0-15 puntos)

### Qué Son
Amenidades "nice to have" que el usuario seleccionó (sin límite).

### Scoring
- **5 puntos** por cada deseable confirmado
- Máximo **3** deseables contados = **15 puntos máximo**

### Deseables Disponibles (MVP Ene 2026)

| ID | Amenidad BD | Frecuencia |
|----|-------------|------------|
| terraza_balcon | Terraza/Balcón | ~52% |
| churrasquera | Churrasquera | ~56% |
| sauna_jacuzzi | Sauna/Jacuzzi | ~42% |
| cowork | Co-working | ~14% |
| sum | Salón de Eventos | común |
| area_ninos | Parque Infantil | ~4% |

---

## Ejemplo Completo: 3 Propiedades

### Datos del Usuario

```typescript
{
  innegociables: ['piscina', 'pet_friendly'],
  deseables: ['gimnasio', 'churrasquera'],
  ubicacion_vs_metros: 4,  // Prioriza metros
  calidad_vs_precio: 3     // Neutral
}
```

### Propiedad A: OMNIA PRIME

| Campo | Valor |
|-------|-------|
| Precio | $130,000 |
| Área | 114 m² (2 dorm) |
| diferencia_pct | -22% |
| Piscina | ✓ Confirmado |
| Pet Friendly | ✓ Confirmado |
| Gimnasio | ✓ Confirmado |
| Churrasquera | ✗ No tiene |
| Amenidades totales | 8 |

**Cálculo:**
```
INNEGOCIABLES: 50 + 50 = 100 pts (ambos confirmados)
OPORTUNIDAD:   35 pts (NEUTRAL, -22% = muy barato)
TRADE-OFFS:    10 pts (114m² > 88m² mediana) + 10 pts (≥5 amenidades)
DESEABLES:     5 pts (gimnasio)
────────────────────────────────
TOTAL:         160 pts
```

### Propiedad B: Stone 3

| Campo | Valor |
|-------|-------|
| Precio | $142,000 |
| Área | 85 m² (2 dorm) |
| diferencia_pct | +22% |
| Piscina | ✓ Confirmado |
| Pet Friendly | ~ Por verificar |
| Gimnasio | ✓ Confirmado |
| Churrasquera | ✓ Confirmado |
| Amenidades totales | 10 |

**Cálculo:**
```
INNEGOCIABLES: 50 + 25 = 75 pts (piscina confirmado, pet por verificar)
OPORTUNIDAD:   10 pts (NEUTRAL, +22% = caro)
TRADE-OFFS:    0 pts (85m² < 88m² mediana) + 10 pts (≥5 amenidades)
DESEABLES:     10 pts (gimnasio + churrasquera)
────────────────────────────────
TOTAL:         105 pts
```

### Propiedad C: Dunas

| Campo | Valor |
|-------|-------|
| Precio | $89,000 |
| Área | 65 m² (2 dorm) |
| diferencia_pct | -35% |
| Piscina | ✓ Confirmado |
| Pet Friendly | ✗ No tiene |
| Gimnasio | ✗ No tiene |
| Churrasquera | ✗ No tiene |
| Amenidades totales | 3 |

**Cálculo:**
```
INNEGOCIABLES: 50 + 0 = 50 pts (solo piscina)
OPORTUNIDAD:   35 pts (NEUTRAL, -35% = muy barato)
TRADE-OFFS:    0 pts (65m² < 88m²) + 0 pts (<5 amenidades)
DESEABLES:     0 pts
────────────────────────────────
TOTAL:         85 pts
```

### Ranking Final

| Posición | Propiedad | Score | Por Qué |
|----------|-----------|-------|---------|
| 1 | OMNIA PRIME | **160** | Cumple todo + área grande + oportunidad |
| 2 | Stone 3 | **105** | Pet por verificar penaliza, pero muchas amenidades |
| 3 | Dunas | **85** | Muy barata pero falta Pet Friendly |

---

## Cómo Cambia con Diferentes Sliders

### Mismo Usuario, Diferente Preferencia

**Escenario:** Mismas 3 propiedades, pero slider `calidad_vs_precio = 1` (prioriza calidad)

| Propiedad | Score NEUTRAL | Score CALIDAD | Cambio |
|-----------|---------------|---------------|--------|
| OMNIA PRIME | 160 | 130 | ↓30 (muy barata penaliza) |
| Stone 3 | 105 | 145 | ↑40 (premium sube) |
| Dunas | 85 | 50 | ↓35 (demasiado barata) |

**Nuevo Ranking (Modo CALIDAD):**
1. Stone 3 (145)
2. OMNIA PRIME (130)
3. Dunas (50)

---

## Desempate

Si dos propiedades tienen el mismo score:
1. **Primer criterio:** Score MOAT descendente
2. **Segundo criterio:** Mejor oportunidad de precio (diferencia_pct más bajo)

```typescript
propiedades.sort((a, b) => {
  if (b.score_moat !== a.score_moat) {
    return b.score_moat - a.score_moat
  }
  return (a.diferencia_pct || 0) - (b.diferencia_pct || 0)
})
```

---

## Separación en Grupos (UX)

El ranking separa propiedades en grupos visuales:

### TOP 3 - Cumplen Innegociables
```
┌─────────────────────────────────────────────┐
│ 🏆 TOP 3 - CUMPLEN TUS INNEGOCIABLES        │
│                                             │
│ 1. OMNIA PRIME [160 pts]                    │
│    ✓ Piscina ✓ Pet Friendly                │
│    22% bajo mercado · 114m² (más que típico)│
│                                             │
│ 2. Stone 3 [105 pts]                        │
│    ✓ Piscina ~ Pet Friendly (por verificar)│
│    22% sobre mercado · Premium              │
└─────────────────────────────────────────────┘
```

### ALTERNATIVAS - Cumplen Parcialmente
```
┌─────────────────────────────────────────────┐
│ ⚠️ ALTERNATIVAS - CUMPLEN PARCIALMENTE      │
│                                             │
│ 3. Dunas [85 pts]                           │
│    ✓ Piscina ✗ Pet Friendly                │
│    35% bajo mercado (muy barato)            │
│                                             │
│    [Falta: Pet Friendly]                    │
└─────────────────────────────────────────────┘
```

---

## Validación: Tests SQL

Para verificar que el scoring funciona correctamente, ejecutar:

```sql
-- Ver archivo completo en: sql/tests/test_scoring_moat.sql

-- Test rápido: Distribución de categorías de mercado
SELECT
  posicion_mercado->>'categoria' as categoria,
  COUNT(*) as cantidad,
  ROUND(AVG((posicion_mercado->>'diferencia_pct')::numeric), 1) as dif_pct_promedio
FROM buscar_unidades_reales('{\"limite\": 300}'::jsonb)
GROUP BY 1
ORDER BY dif_pct_promedio;
```

**Resultado esperado:**
- `oportunidad`: ~40 props, dif_pct ~ -30%
- `bajo_promedio`: ~40 props, dif_pct ~ -15%
- `promedio`: ~40 props, dif_pct ~ 0%
- `sobre_promedio`: ~25 props, dif_pct ~ +15%
- `premium`: ~40 props, dif_pct ~ +35%

---

## Código de Referencia

**Función principal:** `simon-mvp/src/pages/resultados.tsx` líneas ~358-470

```typescript
function calcularScoreMOAT(
  prop: UnidadReal,
  datosUsuario: DatosUsuarioMOAT
): { score: number; debug: Record<string, number> }
```

**Mapeo de amenidades:** `simon-mvp/src/config/amenidades-mercado.ts`

```typescript
export function innegociablesToAmenidades(ids: string[]): string[]
// Ejemplo: ['piscina', 'pet_friendly'] → ['Piscina', 'Pet Friendly']
```

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-01-14 | v1.0 - Documento creado |
| 2026-01-14 | Documentado scoring gradual innegociables |
| 2026-01-14 | Agregados ejemplos reales con cálculos |
| 2026-01-14 | Explicación de inversión slider calidad_vs_precio |
