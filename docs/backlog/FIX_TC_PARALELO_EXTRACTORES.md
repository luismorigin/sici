# FIX TC Paralelo - Extractores n8n (EN PROGRESO)

**Fecha:** 14 Ene 2026
**Última sesión:** 14 Ene 2026
**Prioridad:** Media (no bloquea, hay vista de monitoreo)
**Repo afectado:** n8n workflows (extractores)

## ESTADO ACTUAL (para continuar)

### Fix 1: PARCIALMENTE APLICADO
- ✅ Se actualizó `testParaleloExplicito` en `flujo_b_processing_v3.0.json`
- ⚠️ Hay 2 patrones inline adicionales que también necesitan actualización
- Buscar: `cambio.*paralelo.*blue` (2 ocurrencias más)

### Fix 2: PENDIENTE
- Lógica de normalización USD→USD paralelo aún no implementada

### Para continuar:
```bash
# Buscar los otros 2 patrones que faltan:
grep -c "cambio.*paralelo.*blue" "n8n/workflows/modulo_1/flujo_b_processing_v3.0.json"
# Resultado esperado: 2

# Después de arreglar, reimportar workflow en n8n
```

---

## Contexto

El 14 Ene 2026 se descubrió un bug donde propiedades publicadas "al paralelo" no se detectaban correctamente. Se corrigió:
- ✅ Fix 3: merge_discovery_enrichment.sql v2.2.0 (escribe columna)
- ✅ Fix 4: 13 propiedades retroactivo (migración 059)
- ✅ Fix 5: Vista monitoreo `v_alerta_tc_paralelo_sin_detectar`

**Quedan pendientes los fixes en extractores n8n:**

---

## Fix 1: Patrones Regex Faltantes

### Problema
Los extractores no detectan todas las variantes de "al paralelo":

```
"$65.000 en dólares o al paralelo"     ❌ No detectado
"t/c paralelo"                          ❌ No detectado
"TC. paralelo"                          ❌ No detectado
"tipo de cambio paralelo"               ❌ No detectado
```

### Solución
Agregar estos patrones regex al extractor de tipo_cambio_detectado:

```javascript
// Patrones actuales (funcionan)
/dolares?\s+paralelo/i
/usd\s+paralelo/i

// AGREGAR estos patrones:
/al\s+paralelo/i                    // "al paralelo"
/t\/c\.?\s*paralelo/i               // "t/c paralelo", "t/c. paralelo"
/tc\.?\s*paralelo/i                 // "tc paralelo", "TC. paralelo"
/cambio\s+paralelo/i                // "cambio paralelo"
/dolares?\s+o\s+(al\s+)?paralelo/i  // "dólares o paralelo", "dólares o al paralelo"
/tipo\s+de\s+cambio\s+paralelo/i    // "tipo de cambio paralelo"
```

### Archivos a modificar
- `n8n/workflows/modulo_1/extractor_*.json` (buscar nodo que detecta moneda/TC)

---

## Fix 2: Lógica Normalización USD "al paralelo"

### Problema
Cuando el precio está en USD pero publicado "al paralelo", debe normalizarse:

```
Precio publicado: $68,000 USD "al paralelo"
Precio real de mercado: $68,000 × (9.72/6.96) = $94,966 USD
```

### Solución
En el extractor, después de detectar `tipo_cambio_detectado = 'paralelo'`:

```javascript
if (moneda === 'USD' && tipo_cambio_detectado === 'paralelo') {
  // Obtener TC actual de Binance (o usar el último conocido)
  const tc_paralelo = 9.72;  // Idealmente desde tc_binance_historial
  const tc_oficial = 6.96;

  precio_usd_original = precio_usd;
  precio_usd = precio_usd * (tc_paralelo / tc_oficial);
  precio_fue_normalizado = true;
}
```

### Consideraciones
- El TC paralelo debe obtenerse dinámicamente (tabla `tc_binance_historial`)
- Guardar `precio_usd_original` para auditoría
- Marcar `precio_fue_normalizado = true`

---

## Cómo verificar que el fix funcionó

Después de implementar, correr en cualquier sesión:

```sql
SELECT COUNT(*) FROM v_alerta_tc_paralelo_sin_detectar;
-- Debe retornar 0
```

Si retorna > 0, hay propiedades que mencionan "paralelo" pero no fueron detectadas.

---

## Referencias

- Postmortem completo: Sesión Claude 14 Ene 2026
- Migración retroactiva: `sql/migrations/059_fix_tc_paralelo_retroactivo.sql`
- Función merge corregida: `sql/functions/merge/merge_discovery_enrichment.sql` v2.2.0
- Vista monitoreo: `v_alerta_tc_paralelo_sin_detectar`
