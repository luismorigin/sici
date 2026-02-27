# MVP SIMÓN - SPRINT PLAN

**Fecha:** 9 Enero 2026
**Duración estimada:** 2-2.5 horas
**Objetivo:** Output fiduciario con DATA contextual

---

## CONTEXTO ESTRATÉGICO (Thiel)

### 1. RECORTAR: 33 campos → 15-20 máximo
- Solo lo que afecta el matching SQL
- El resto es ruido/fricción

### 2. EL MVP ES EL OUTPUT, NO EL FORMULARIO
- El formulario es fricción necesaria
- El output es el valor
- **80% del esfuerzo va al output**

### 3. LA RAZÓN FIDUCIARIA ES EL MOAT
- ❌ No: "cumple tus innegociables"
- ✅ Sí: "1 de 7 disponibles bajo $120k en esta zona"
- **Esto es DATA que nadie más tiene**

---

## PLAN DE EJECUCIÓN

### FASE 1: Actualizar buscar_unidades_reales() [30 min]
**Prioridad:** Alta

Agregar columnas faltantes:
```sql
+ fotos_urls TEXT[]      -- datos_json->'contenido'->'fotos_urls'
+ precio_m2 NUMERIC      -- ROUND(precio_usd / NULLIF(area_m2, 0), 0)
+ score_calidad INTEGER  -- score_calidad_dato
+ desarrollador VARCHAR  -- FROM proyectos_master
```

### FASE 2: Crear generar_razon_fiduciaria() [45 min]
**Prioridad:** CRÍTICA - ES EL MOAT

```sql
-- Input: propiedad_id
-- Output: "1 de solo 7 deptos 2D bajo $120k en Equipetrol Norte"
```

Tipos de razones a generar:
1. **Escasez:** "1 de solo X disponibles con estas características"
2. **Precio vs mercado:** "15% bajo el promedio de la zona"
3. **Posición única:** "El más económico de X unidades en este proyecto"
4. **Oportunidad:** "Único 2D bajo $100k en Equipetrol Norte"

Fuentes de datos:
- `v_metricas_mercado` - promedios por zona/dorms
- `propiedades_v2` - stock actual
- `proyectos_master` - info del proyecto

### FASE 3: Crear calcular_posicion_mercado() [20 min]
**Prioridad:** Media

```sql
-- Input: precio_usd, zona, dormitorios
-- Output: { diferencia_pct, posicion_texto }
```

Ejemplo output:
```json
{
  "diferencia_pct": -15,
  "posicion_texto": "15% bajo promedio"
}
```

### FASE 4: Actualizar SICI_MVP_SPEC.md [15 min]
**Prioridad:** Baja

- Alinear spec con funciones reales
- Documentar campos de output
- Actualizar diagrama de flujo

### FASE 5: Analizar formulario [30 min]
**Prioridad:** Media

Objetivo: **33 campos → máximo 20**

Proceso:
1. Mapear cada campo vs parámetros de `buscar_unidades_reales()`
2. Si el campo NO afecta ningún filtro SQL → candidato a eliminar
3. Documentar decisiones

Criterios de eliminación:
- Campo no usado en WHERE/filtros
- Campo duplicado o derivable
- Campo que agrega fricción sin valor

---

## GAPS IDENTIFICADOS (Análisis previo)

| # | Requisito | Estado | Gap |
|---|-----------|--------|-----|
| 1 | Foto real | ⚠️ PARCIAL | Agregar `fotos_urls[]` |
| 2 | Precio + $/m² | ⚠️ PARCIAL | Calcular `precio_m2` |
| 3 | Comparación vs zona | ✅ EXISTE | Integrar en búsqueda |
| 4 | Score calidad | ❌ FALTA | Agregar a función |
| 5 | Razón fiduciaria | ❌ FALTA | **Crear función** |
| 6 | Info desarrollador | ⚠️ PARCIAL | Agregar JOIN |
| 7 | Separar reales/multi | ✅ EXISTE | Ya implementado |

---

## ORDEN DE PRIORIDAD

```
1. generar_razon_fiduciaria()  ← EL MOAT
2. buscar_unidades_reales() v2 ← Datos completos
3. Recortar formulario         ← Reducir fricción
4. calcular_posicion_mercado() ← Nice to have
5. Actualizar spec             ← Documentación
```

---

## CRITERIOS DE ÉXITO

- [ ] Output incluye razón fiduciaria con DATA real
- [ ] Formulario reducido a ≤20 campos
- [ ] Función búsqueda retorna todos los campos necesarios
- [ ] Spec actualizado y alineado con implementación

---

## NOTAS

- **No optimizar prematuramente** - Primero que funcione, después optimizar
- **Testear con datos reales** - Usar propiedades existentes para validar
- **La razón fiduciaria debe ser específica** - No genérica, siempre con números
