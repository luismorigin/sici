# Campos de Propiedad para Brokers

## Filosofia de Campos

### Objetivo
Capturar TODA la informacion que un comprador necesita para:
1. Filtrar propiedades alineadas a sus necesidades
2. Comparar opciones de forma justa
3. Tomar decision informada SIN sorpresas

### Principio UX
- Campos agrupados por categoria (no un formulario infinito)
- Obligatorios vs opcionales claros
- Autocompletado cuando sea posible
- Validacion en tiempo real

### Fuentes Aceptadas (Import por Link)
Solo se aceptan propiedades de fuentes verificadas:
| Fuente | Dominio | Auto-import |
|--------|---------|-------------|
| ✅ Century21 | c21.com.bo | Si |
| ✅ Remax | remax.bo | Si |
| ✅ Bien Inmuebles | bieninmuebles.com.bo | Si |
| ✅ Desarrolladoras | Manual | No |

---

## CATEGORIA 1: Datos Basicos (20 puntos)

### Campos Obligatorios (20 pts si todos completos)

| Campo | Tipo | Ejemplo | Validacion | Pts |
|-------|------|---------|------------|-----|
| `precio_usd` | number | 127000 | > 10000 | 4 |
| `area_m2` | number | 85.5 | > 20 | 4 |
| `dormitorios` | number | 2 | 0-5 | 4 |
| `banos` | number | 2 | 1-5 | 4 |
| `zona` | select | "equipetrol" | Lista predefinida | 4 |

### Campos Opcionales (mejoran busqueda)

| Campo | Tipo | Ejemplo | Para que sirve |
|-------|------|---------|----------------|
| `piso` | number | 8 | Filtro "piso alto" |
| `orientacion` | select | "norte" | Preferencia de luz |
| `vista` | select | "ciudad" | Diferenciador |

---

## CATEGORIA 2: Ubicacion (15 puntos)

### Microzonas Existentes en BD (tabla `zonas_geograficas`)

| ID | Nombre | Zona General |
|----|--------|--------------|
| 1 | Equipetrol | Equipetrol |
| 2 | Equipetrol Franja | Equipetrol |
| 3 | Equipetrol Norte/Norte | Equipetrol |
| 4 | Equipetrol Norte/Sur | Equipetrol |
| 5 | Faremafu | Equipetrol |
| 6 | Sirari | Equipetrol |
| 7 | Villa Brigida | Equipetrol |

### Campos Obligatorios

| Campo | Tipo | Ejemplo | Validacion | Pts |
|-------|------|---------|------------|-----|
| `proyecto_nombre` | text/autocomplete | "Vienna" | Buscar en `proyectos_master` | 3 |
| `direccion` | text | "Av. San Martin 456" | Min 5 chars | 3 |
| `latitud` | number | -17.7834 | Rango Bolivia (-22 a -9) | 4 |
| `longitud` | number | -63.1821 | Rango Bolivia (-69 a -57) | 4 |
| `microzona` | select | "Equipetrol Norte/Norte" | FK a `zonas_geograficas` | 1 |

### Como facilitar GPS
- Mapa interactivo para seleccionar punto
- Autodetectar por direccion (geocoding)
- Validar que este dentro de zona seleccionada

---

## CATEGORIA 3: Fotos (20 puntos)

### Requisitos por Cantidad

| Cantidad | Sin Watermark | Con Watermark | Estado |
|----------|---------------|---------------|--------|
| 8+ fotos | 20 pts ✅ | 15 pts ⚠️ | Perfecta / Aceptable |
| 5-7 fotos | 15 pts | 12 pts | Aceptable |
| 3-4 fotos | 10 pts | 8 pts | Minima |
| < 3 fotos | 0 pts ❌ | 0 pts ❌ | Rechazada |

### Deteccion de Watermarks

El sistema detecta automaticamente marcas de agua de:
- Century21, Remax, Bien Inmuebles (logos en esquinas)
- Watermarks de texto superpuesto
- Filtros de color/transparencia tipicos

**Penalizacion**: -5 puntos si se detectan watermarks

**Sugerencia al broker**:
```
⚠️ 2 fotos tienen watermark detectado
   Sube versiones sin marca → +5 pts
   [Subir fotos limpias]
```

### Fotos Recomendadas (checklist visual)

| Foto | Obligatoria | Descripcion |
|------|-------------|-------------|
| Fachada edificio | Si | Exterior del edificio |
| Living/Sala | Si | Ambiente principal |
| Cocina | Si | Equipamiento visible |
| Dormitorio principal | Si | Con closet si tiene |
| Bano principal | Si | Estado y equipamiento |
| Vista desde ventana | No | Si es diferenciador |
| Amenidades | No | Piscina, gym, etc |
| Plano/Layout | No | Distribucion |

### Validaciones Tecnicas
- Formato: JPG, PNG, WebP
- Tamano: Max 5MB por foto
- Resolucion minima: 800x600
- Hash para detectar duplicados

### Sistema Anti-Duplicados (20 pts extra implicitos)

Cada foto se hashea al subir. Si el hash coincide con otra propiedad:

| Situacion | Accion |
|-----------|--------|
| Foto ya usada por OTRO broker | ❌ BLOQUEO - "Esta foto pertenece a otra propiedad" |
| Foto ya usada por MISMO broker | ⚠️ Warning - "Ya usaste esta foto en SIM-XXXXX" |
| Todas las fotos son unicas | ✅ OK |

**Mensaje de bloqueo**:
```
❌ Esta propiedad ya existe en Simón

Publicada por: Juan Pérez (Century21)
Código: SIM-7K2M9

Si crees que es error: brokers@simon.bo
```

---

## CATEGORIA 4: Amenidades y Equipamiento (15 puntos)

### Estructura JSONB (compatible con BD existente)

```jsonb
{
    "lista": ["Piscina", "Gimnasio", ...],
    "equipamiento": ["Cocina Equipada", "Aire Acondicionado", ...],
    "estado_amenities": {
        "Piscina": {"valor": true, "fuente": "broker", "confianza": "alta"},
        ...
    }
}
```

### 4.1 Amenidades del Edificio (8 pts)

**Valores EXACTOS de la BD existente** (usar estos nombres):

| Amenidad (nombre exacto BD) | Tipo | Impacto en busqueda |
|----------|------|---------------------|
| `Piscina` | boolean | Alto - filtro comun |
| `Gimnasio` | boolean | Alto - filtro comun |
| `Seguridad 24/7` | boolean | Alto - casi obligatorio |
| `Ascensor` | boolean | Alto - obligatorio >3 pisos |
| `Estacionamiento para Visitas` | boolean | Medio |
| `Churrasquera` | boolean | Medio |
| `Salón de Eventos` | boolean | Bajo |
| `Parque Infantil` | boolean | Medio - familias |
| `Co-working` | boolean | Bajo - nicho |
| `Pet Friendly` | boolean | Alto - filtro importante |
| `Sauna/Jacuzzi` | boolean | Medio |
| `Terraza/Balcón` | boolean | Medio |
| `Jardín` | boolean | Bajo |
| `Área Social` | boolean | Medio |
| `Recepción` | boolean | Bajo |
| `Lavadero` | boolean | Bajo |

**Puntuacion**: 8 pts si >= 6 amenidades marcadas (si/no para todas)

### 4.2 Equipamiento de la Unidad (7 pts)

**Base de BD existente + campos adicionales importantes**:

| Equipamiento | Tipo | Impacto |
|--------------|------|---------|
| `Aire Acondicionado` | boolean | Alto |
| `Cocina Equipada` | boolean | Alto |
| `Roperos Empotrados` | boolean | Alto |
| `Amoblado` | select | Alto (no/parcial/completo) |
| `Lavadora` | boolean | Medio |
| `Secadora` | boolean | Bajo |
| `Campana Extractora` | boolean | Bajo |
| `Lavandería` | boolean | Medio |
| `Microondas` | boolean | Bajo |
| `Balcón` | boolean | Medio |
| `Horno Empotrado` | boolean | Medio |
| `Cortinas` | boolean | Bajo |
| `Calefón/Termotanque` | select | Medio (eléctrico/gas/termotanque) |

**Puntuacion**: 7 pts si >= 5 equipamientos marcados

### 4.3 Amenidades/Equipamiento EXTENSIBLES

**IMPORTANTE**: La estructura JSONB permite agregar nuevos valores sin cambiar schema.

```jsonb
{
    "lista": ["Piscina", "Gimnasio", "Cancha de Tenis", ...],  // ← Se puede agregar cualquiera
    "equipamiento": ["Cocina Equipada", "Smart Home", ...],    // ← Extensible
    "estado_amenities": {
        "Cancha de Tenis": {"valor": true, "fuente": "broker", "confianza": "alta"}
    }
}
```

**Regla para valores nuevos**:
- Si el broker marca una amenidad/equipamiento que NO está en la lista predefinida:
  1. Se guarda en el JSONB normalmente
  2. Se marca con `fuente: "broker_custom"`
  3. Aparece en la propiedad pero NO se usa para filtros automáticos (hasta que se valide)
  4. Se reporta para agregar a lista oficial si es común

**Ejemplos de valores custom válidos**:
- "Cancha de Pádel", "Helipuerto", "Bodega de Vinos", "Smart Home", "Paneles Solares"

---

## CATEGORIA 5: Financiero (15 puntos)

### Campos Obligatorios

| Campo | Tipo | Ejemplo | Validacion | Pts |
|-------|------|---------|------------|-----|
| `expensas_usd` | number | 85 | 0-500 | 4 |
| `parqueo_incluido` | boolean | true | - | 2 |
| `cantidad_parqueos` | number | 1 | 0-3 | 2 |
| `baulera_incluida` | boolean | false | - | 2 |
| `precio_parqueo_extra` | number | 12000 | Si no incluido | 2 |
| `precio_baulera_extra` | number | 5000 | Si no incluida | 1 |
| `acepta_financiamiento` | boolean | true | - | 1 |
| `acepta_permuta` | boolean | false | - | 1 |

### Campos Opcionales

| Campo | Tipo | Ejemplo | Para que sirve |
|-------|------|---------|----------------|
| `precio_negociable` | boolean | true | Expectativa comprador |
| `descuento_contado` | number | 5 | % descuento |
| `reserva_minima` | number | 5000 | Para preventa |

---

## CATEGORIA 6: Estado y Entrega (15 puntos)

### ENUMs Existentes en BD (REUTILIZAR)

```sql
-- estado_construccion_enum (valores exactos de la BD):
entrega_inmediata, preventa, construccion, planos, no_especificado, usado, nuevo_a_estrenar

-- tipo_operacion_enum (valores exactos de la BD):
venta, alquiler, anticretico
```

### Campos Obligatorios

| Campo | Tipo | Ejemplo | Opciones (ENUM BD) | Pts |
|-------|------|---------|----------|-----|
| `estado_construccion` | select | "entrega_inmediata" | entrega_inmediata, preventa, construccion, planos, nuevo_a_estrenar, usado | 3 |
| `fecha_entrega` | date | "2026-06" | Solo si no entrega_inmediata | 3 |
| `antiguedad_anos` | number | 2 | 0-50 | 2 |
| `estado_unidad` | select | "nuevo" | nuevo, excelente, bueno, a_remodelar | 2 |
| `tipo_operacion` | select | "venta" | venta, alquiler, anticretico | 2 |
| `disponibilidad` | select | "inmediata" | inmediata, 30_dias, 60_dias, segun_obra | 2 |
| `escritura_lista` | boolean | true | Solo venta | 1 |

### Campos Opcionales

| Campo | Tipo | Ejemplo | Para que sirve |
|-------|------|---------|----------------|
| `ultima_remodelacion` | number | 2024 | Ano |
| `desarrollador` | text | "Grupo Vienna" | Reputacion |
| `garantia_estructura` | number | 5 | Anos |

---

## CATEGORIA 7: Documentacion y Legal (Bonus)

### Campos Opcionales (no afectan score pero mejoran confianza)

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `tiene_planos` | boolean | Plano disponible |
| `plano_url` | file | PDF o imagen del plano |
| `folio_real` | text | Numero de registro |
| `propietario_verificado` | boolean | OTP enviado (Fase futura) |
| `exclusividad` | boolean | Broker tiene exclusiva |
| `motivo_venta` | select | mudanza, inversion, otro |

---

## CATEGORIA 8: Contacto Broker (Obligatorio)

| Campo | Tipo | Ejemplo | Validacion |
|-------|------|---------|------------|
| `broker_nombre` | text | "Juan Perez" | Min 3 chars |
| `broker_telefono` | text | "76543210" | 8 digitos |
| `broker_email` | email | "juan@remax.bo" | Email valido |
| `broker_empresa` | text | "Remax SCZ" | Opcional |
| `broker_licencia` | text | "CADECO-123" | Opcional |

---

## Resumen de Puntuacion

| Categoria | Puntos Max | Campos Clave |
|-----------|------------|--------------|
| Datos Basicos | 20 | precio, area, dorms, banos, zona |
| Ubicacion | 15 | proyecto, direccion, GPS |
| Fotos | 20 | minimo 8 fotos |
| Amenidades/Equip | 15 | edificio + unidad |
| Financiero | 15 | expensas, parqueo, baulera |
| Estado/Entrega | 15 | construccion, fecha, disponibilidad |
| **TOTAL** | **100** | |

---

## Autocompletado Inteligente

### Por Proyecto Conocido
Si el broker selecciona un proyecto que ya existe en nuestra BD:

```
Autocompletar:
- Direccion
- GPS
- Amenidades del edificio
- Desarrollador
- Antiguedad
- Seguridad 24h (si sabemos)
```

### Por Zona
Si selecciona zona, sugerir:
- Rango de precios tipico
- Expensas promedio
- Amenidades comunes en la zona

---

## Validaciones en Tiempo Real

### Alertas Amarillas (warning)
- Precio muy bajo para la zona (< P10)
- Precio muy alto para la zona (> P90)
- Area muy pequena para dormitorios
- Expensas muy altas vs promedio

### Alertas Rojas (bloqueo)
- GPS fuera de Santa Cruz
- Precio < $10,000 USD
- 0 fotos
- Campos obligatorios vacios

---

## Orden de Llenado Sugerido (UX)

### Paso 1: Lo Basico (30 segundos)
- Zona
- Proyecto (con autocompletado)
- Precio
- Area
- Dormitorios/Banos

### Paso 2: Ubicacion (30 segundos)
- Mapa para confirmar GPS
- Direccion (autocompletada o manual)
- Piso

### Paso 3: Fotos (2 minutos)
- Upload multiple
- Drag & drop
- Reordenar
- Checklist visual de fotos sugeridas

### Paso 4: Detalles (1 minuto)
- Amenidades edificio (checkboxes rapidos)
- Equipamiento unidad (checkboxes rapidos)
- Estado/Entrega

### Paso 5: Financiero (30 segundos)
- Expensas
- Parqueo incluido si/no
- Baulera incluido si/no

### Paso 6: Preview y Publicar
- Ver como queda
- Score de calidad
- Publicar o guardar borrador

**Tiempo total estimado: 5-7 minutos**

---

## Estado del Documento

| Version | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 0.1 | 2026-01-23 | Claude + Luis | Borrador inicial |
| 0.2 | 2026-01-23 | Claude + Luis | Deteccion watermarks, fuentes aceptadas, sistema anti-duplicados |
| 0.3 | 2026-01-23 | Claude + Luis | Alineacion con BD: ENUMs, microzonas, amenidades exactas |
