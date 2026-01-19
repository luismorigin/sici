# Filtros de Confianza de Datos - SICI/Simón

## Principio MOAT Fiduciario

> Solo mostrar datos en los que confiamos. Nunca inventar. Si no tenemos el dato, decirlo.

Este documento describe los filtros aplicados en `buscar_unidades_reales()` para garantizar calidad de datos.

---

## Filtros Activos

### 1. Días en Mercado (NUEVO - v2.8)

**Problema:** Los portales inmobiliarios en Bolivia no siempre bajan anuncios cuando una propiedad se vende. Esto genera "anuncios zombies" que distorsionan el análisis.

**Solución:** Aplicar cortes máximos según estado de construcción.

| Estado | Corte Máximo | Justificación |
|--------|--------------|---------------|
| `preventa` | 24 meses (730 días) | Proyectos pueden tener retrasos legítimos |
| `entrega_inmediata` | 10 meses (300 días) | Si está listo y no se vendió, hay problema |
| `nuevo_a_estrenar` | 10 meses (300 días) | Igual que entrega inmediata |
| `usado` | 10 meses (300 días) | Igual que entrega inmediata |
| `no_especificado` | 10 meses (300 días) | Dato poco confiable, ser conservador |

**Parámetro para desactivar:** `{"incluir_datos_viejos": true}`

**Caso específico resuelto:** Condominio Las Dalias (7 unidades con 753 días en mercado, entrega_inmediata) - claramente anuncios no actualizados.

---

### 2. Duplicados

**Problema:** Una misma propiedad puede aparecer en múltiples fuentes o con múltiples anuncios.

**Solución:** Campo `duplicado_de` marca propiedades duplicadas. Solo se muestran originales.

**Parámetro:** No hay flag para incluir duplicados (siempre excluidos).

---

### 3. Outliers de Precio

**Problema:** Errores de scraping o precios mal ingresados (ej: precio en bolivianos parseado como dólares).

**Solución:** Excluir propiedades con precio/m² >55% de desviación vs promedio del proyecto o zona.

**Parámetro para desactivar:** `{"incluir_outliers": true}`

---

### 4. Multiproyecto

**Problema:** Algunos anuncios agrupan múltiples proyectos, haciendo difícil comparar.

**Solución:** Excluir propiedades marcadas como `es_multiproyecto = true`.

**Parámetro para desactivar:** `{"incluir_multiproyecto": true}`

---

### 5. Área Mínima

**Problema:** Parqueos y bauleras mal clasificados como departamentos.

**Solución:** Excluir propiedades con `area_total_m2 < 20`.

**Parámetro:** No hay flag (siempre aplicado).

---

### 6. Tipos Excluidos

**Problema:** Algunos tipos de propiedad no son comparables con departamentos.

**Solución:** Excluir `tipo_propiedad_original` en: baulera, parqueo, garaje, deposito.

**Parámetro:** No hay flag (siempre aplicado).

---

## Resumen de Parámetros

```typescript
// Búsqueda por defecto (filtros de confianza activos)
buscarUnidadesReales({
  dormitorios: 2,
  zona: "Equipetrol"
})

// Incluir datos que normalmente excluimos
buscarUnidadesReales({
  dormitorios: 2,
  zona: "Equipetrol",
  incluir_outliers: true,      // Incluir precios atípicos
  incluir_multiproyecto: true, // Incluir anuncios multiproyecto
  incluir_datos_viejos: true   // Incluir anuncios >10/24 meses
})
```

---

## Impacto Actual (19 Enero 2026)

| Filtro | Propiedades Excluidas | % del Total |
|--------|----------------------|-------------|
| Días en mercado | 7 (Las Dalias) | 2.4% |
| Duplicados | 36 | 10.9% |
| Outliers | ~5-10 | ~2-3% |
| Multiproyecto | Variable | Variable |

**Total base activa después de filtros:** ~250-260 propiedades confiables

---

## Historial de Cambios

| Fecha | Cambio | Migración |
|-------|--------|-----------|
| 19 Ene 2026 | Agregar filtro días en mercado (10m/24m) | 062 |
| 19 Ene 2026 | Agregar campo dias_en_mercado | 061 |
| 18 Ene 2026 | Excluir duplicados | 059 |
| 17 Ene 2026 | Marcar duplicados exactos | 051 |

---

## Notas para Desarrolladores

1. **Siempre usar `buscar_unidades_reales()`** - nunca queries directos a `propiedades_v2` para mostrar al usuario

2. **Los filtros son para confianza, no para búsqueda** - dormitorios, zona, precio son filtros de búsqueda; los de este documento son filtros de calidad

3. **Si agregás un nuevo filtro**, documentarlo aquí y agregar parámetro para desactivarlo si tiene sentido

4. **El MOAT fiduciario es sagrado** - preferimos mostrar menos datos confiables que más datos dudosos
