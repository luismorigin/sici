# SQL Tests - SICI

Tests SQL para validar funcionalidad de base de datos.

## Archivos

| Test | Propósito | Prerequisitos |
|------|-----------|---------------|
| `test_scoring_moat.sql` | Validar sistema de scoring MOAT fiduciario | `buscar_unidades_reales()` v2.14+, `calcular_posicion_mercado()` |

## Cómo Ejecutar

1. Abrir Supabase SQL Editor
2. Copiar contenido del archivo `.sql`
3. Pegar y ejecutar (F5)
4. Revisar resultados vs "RESULTADO ESPERADO" en cada test

## test_scoring_moat.sql

Valida el ranking MOAT que ordena propiedades según preferencias del usuario.

### Arquitectura del Score (Frontend TypeScript)

```
SCORE_TOTAL = INNEGOCIABLES + OPORTUNIDAD + TRADE_OFFS + DESEABLES
            = Max 175 puntos

Componentes:
- INNEGOCIABLES (0-100): Amenidades obligatorias
  * Confirmado = 100%, Por verificar = 50%, No tiene = 0%
- OPORTUNIDAD (0-40): Posición vs mercado (invertido según slider)
- TRADE_OFFS (0-20): Bonus por área grande o muchas amenidades
- DESEABLES (0-15): Amenidades "nice to have" (5 pts c/u, max 3)
```

### Tests Incluidos

| # | Test | Qué Valida |
|---|------|------------|
| 1 | Top 10 por amenidades | Detección correcta de amenities |
| 2 | Distribución categorías | `calcular_posicion_mercado()` clasifica bien |
| 3 | Búsqueda típica 2D $140k | Simulación de usuario real |
| 4 | Scoring MODO NEUTRAL | slider=3, balance precio/calidad |
| 5 | Scoring MODO PRECIO | slider=5, prioriza baratas |
| 6 | Scoring MODO CALIDAD | slider=1, prioriza premium |
| 7 | Filtro PISCINA | Innegociables confirmados vs por_verificar |
| 8 | Filtro Sin zona | No aparecen propiedades "Sin zona" |
| 9 | Trade-off área | Bonus si área > mediana tipología |

### Resultados Esperados Clave

- **TEST 4 (NEUTRAL)**: TOP 3 deben ser props con piscina + buen precio
- **TEST 5 (PRECIO)**: BLUE BOX, Dunas, Uptown NUU arriba (más baratas)
- **TEST 6 (CALIDAD)**: Stone 3, Avanti, NanoTec arriba (premium)
- **TEST 8**: 0 filas (no debe haber "Sin zona")

## Notas

- Los tests son READ-ONLY, no modifican datos
- Diseñados para ejecutarse en producción (Supabase)
- Actualizar medianas si cambia el mercado significativamente
