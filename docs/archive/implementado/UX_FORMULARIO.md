# UX del Formulario de Carga de Propiedades

## Principios de Diseno

### 1. Import Primero
- **80% de casos**: Pegar link de C21/Remax → auto-import
- 20% de casos: Entrada manual (desarrolladoras)
- Minimo esfuerzo para el broker

### 2. Progreso Visible
- Barra de progreso siempre visible
- Indicador de puntos de calidad en tiempo real
- "Paso 3 de 6" claro

### 3. Validacion Inmediata
- Feedback al salir de cada campo
- No esperar al final para mostrar errores
- Colores: verde (ok), amarillo (warning), rojo (error)

### 4. Minimo Friccion
- Autocompletado agresivo
- Defaults inteligentes
- Checkboxes en vez de dropdowns cuando sea posible

### 5. Mobile First
- Funciona perfecto en celular
- Fotos desde camara directamente
- Touch-friendly (botones grandes)

---

## Flujo Completo (7 Pasos)

```
[0. Import] → [1. Basico] → [2. Ubicacion] → [3. Fotos] → [4. Detalles] → [5. Financiero] → [6. Preview]
   AUTO         20pts          15pts          20pts        15pts          15pts           +PDF
```

---

## PASO 0: Import por Link (PRINCIPAL)

### Layout

```
┌─────────────────────────────────────────────┐
│  Nueva Propiedad                    0 de 6  │
│  ○○○○○○○                                    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  ¿De donde viene esta propiedad?   │    │
│  │                                     │    │
│  │  (●) Tengo link de C21/Remax       │    │
│  │  ( ) Es de una desarrolladora      │    │
│  │  ( ) Entrada manual                 │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Pega el link de la propiedad:     │    │
│  │                                     │    │
│  │  [https://c21.com.bo/propiedad/123]│    │
│  │                                     │    │
│  │  ✓ Fuentes aceptadas:              │    │
│  │    c21.com.bo, remax.bo,           │    │
│  │    bieninmuebles.com.bo            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│                       [Verificar Link →]    │
└─────────────────────────────────────────────┘
```

### Comportamiento

**Al pegar link valido**:
```
┌─────────────────────────────────────────────┐
│  ✅ Link verificado - Importando datos...  │
│                                             │
│  ████████████████░░░░ 75%                   │
│                                             │
│  ✓ Precio encontrado: $180,000              │
│  ✓ Area encontrada: 350 m²                  │
│  ✓ Dormitorios: 3                           │
│  ✓ Baños: 2                                 │
│  ✓ Fotos importadas: 6                      │
│  ⏳ Verificando duplicados...               │
└─────────────────────────────────────────────┘
```

**Si es duplicado**:
```
┌─────────────────────────────────────────────┐
│  ❌ Esta propiedad ya existe en Simón       │
│                                             │
│  Publicada por: Juan Pérez (Century21)      │
│  Código: SIM-7K2M9                          │
│  Fecha: Hace 3 días                         │
│                                             │
│  Si crees que es un error:                  │
│  brokers@simon.bo                           │
│                                             │
│  [← Intentar con otro link]                 │
└─────────────────────────────────────────────┘
```

**Si link es invalido**:
```
┌─────────────────────────────────────────────┐
│  ⚠️ Fuente no soportada                     │
│                                             │
│  Solo aceptamos propiedades de:             │
│  • Century21 (c21.com.bo)                   │
│  • Remax (remax.bo)                         │
│  • Bien Inmuebles (bieninmuebles.com.bo)    │
│                                             │
│  ¿Por que? Garantiza exclusividad y         │
│  calidad de datos.                          │
│                                             │
│  [← Corregir link]  [Entrada manual →]      │
└─────────────────────────────────────────────┘
```

**Exito - Continuar a Paso 1**:
```
┌─────────────────────────────────────────────┐
│  ✅ Datos importados correctamente!         │
│                                             │
│  Importamos:                                │
│  • Precio: $180,000                         │
│  • Area: 350 m²                             │
│  • 3 dorms, 2 baños                         │
│  • 6 fotos                                  │
│                                             │
│  Solo falta completar algunos detalles.     │
│                                             │
│              [Continuar →]                  │
└─────────────────────────────────────────────┘
```

---

## PASO 1: Lo Basico (20 pts)

### Layout

```
┌─────────────────────────────────────────────┐
│  Nueva Propiedad                    1 de 6  │
│  ═══════════════════○○○○○                   │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Zona *                          ▼   │    │
│  │ [Equipetrol Centro            ]     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Proyecto/Edificio *                 │    │
│  │ [Vienna                        ]    │    │
│  │  ✓ Vienna - Equipetrol Norte        │    │
│  │    Vienna II - Sirari               │    │
│  │    + Agregar nuevo proyecto         │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌────────────┐  ┌────────────┐             │
│  │ Precio USD │  │ Area m2    │             │
│  │ [$127,000 ]│  │ [85      ] │             │
│  └────────────┘  └────────────┘             │
│                                             │
│  ┌────────────┐  ┌────────────┐             │
│  │ Dormitorios│  │ Banos      │             │
│  │  [2]  ▼    │  │  [2]  ▼    │             │
│  └────────────┘  └────────────┘             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Piso (opcional)                     │    │
│  │ [8                             ]    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Puntos: ████████░░ 16/20                   │
│                                             │
│  [← Cancelar]              [Siguiente →]    │
└─────────────────────────────────────────────┘
```

### Comportamiento

**Autocompletado de Proyecto**:
- Al escribir, buscar en BD de proyectos conocidos
- Si selecciona uno conocido: autocompletar GPS, amenidades, desarrollador
- Si no existe: permitir crear nuevo

**Validacion Precio**:
- Mostrar rango tipico de la zona al escribir
- Warning si esta fuera de P10-P90
- "Precio tipico en Equipetrol: $1,400-$1,800/m2"

**Validacion Area**:
- Warning si area < 30m2 con 2+ dormitorios
- "Un depto de 2 dorms tipicamente tiene 60-90m2"

---

## PASO 2: Ubicacion (15 pts)

### Layout

```
┌─────────────────────────────────────────────┐
│  Ubicacion                          2 de 6  │
│  ═══════════════════○○○○○                   │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Direccion                           │    │
│  │ [Av. San Martin 456, Equipetrol]    │    │
│  │  📍 Autodetectada desde proyecto    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │        [====== MAPA ======]         │    │
│  │        [                  ]         │    │
│  │        [       📍        ]          │    │
│  │        [                  ]         │    │
│  │        [==================]         │    │
│  │                                     │    │
│  │  Arrastra el pin para ajustar       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Microzona                       ▼   │    │
│  │ [Equipetrol Norte             ]     │    │
│  │  ✓ Detectada automaticamente        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Puntos: ████████████░░ 12/15               │
│                                             │
│  [← Atras]                 [Siguiente →]    │
└─────────────────────────────────────────────┘
```

### Comportamiento

**Mapa Interactivo**:
- Leaflet o Google Maps
- Pin draggable
- Zoom en zona seleccionada
- Validar que pin este dentro de zona

**Autodeteccion**:
- Si proyecto conocido: centrar mapa en ubicacion conocida
- Si direccion escrita: geocodificar y mostrar

**Microzona**:
- Detectar automaticamente segun GPS
- Permitir corregir manualmente

---

## PASO 3: Fotos (20 pts)

### Layout

```
┌─────────────────────────────────────────────┐
│  Fotos de la Propiedad              3 de 6  │
│  ═══════════════════○○○○○                   │
│                                             │
│  Minimo 8 fotos para calidad perfecta       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │     ┌─────┐ ┌─────┐ ┌─────┐        │    │
│  │     │ 📷1 │ │ 📷2 │ │ 📷3 │        │    │
│  │     │     │ │     │ │     │        │    │
│  │     └─────┘ └─────┘ └─────┘        │    │
│  │                                     │    │
│  │     ┌─────┐ ┌─────┐ ┌─────┐        │    │
│  │     │ 📷4 │ │ 📷5 │ │  +  │        │    │
│  │     │     │ │     │ │ ADD │        │    │
│  │     └─────┘ └─────┘ └─────┘        │    │
│  │                                     │    │
│  │  Arrastra para reordenar            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Checklist de fotos sugeridas:              │
│  ☑ Fachada edificio                         │
│  ☑ Living/Sala                              │
│  ☑ Cocina                                   │
│  ☐ Dormitorio principal                     │
│  ☐ Bano principal                           │
│  ☐ Vista desde ventana                      │
│  ☐ Amenidades (piscina, gym)                │
│  ☐ Plano/Layout                             │
│                                             │
│  Fotos: 5/8  │  Puntos: ██████░░░░ 15/20    │
│                                             │
│  [← Atras]                 [Siguiente →]    │
└─────────────────────────────────────────────┘
```

### Comportamiento

**Upload**:
- Drag & drop multiple
- Click para seleccionar
- Desde camara en mobile
- Max 5MB por foto

**Validaciones**:
- Hash para detectar duplicados (fotos ya usadas)
- Resolucion minima 800x600
- Formatos: JPG, PNG, WebP
- **Deteccion automatica de watermarks**

**Deteccion de Watermarks**:
```
┌─────────────────────────────────────────────┐
│  ⚠️ 2 fotos tienen watermark detectado      │
│                                             │
│  ┌─────┐ ┌─────┐                           │
│  │ 📷  │ │ 📷  │  ← Marcas de C21          │
│  │ ⚠️  │ │ ⚠️  │                           │
│  └─────┘ └─────┘                           │
│                                             │
│  Esto reduce tu puntuacion en 5 pts.        │
│                                             │
│  💡 Sube versiones sin marca de agua        │
│     para obtener 20/20 pts en fotos.        │
│                                             │
│  [Reemplazar fotos] [Continuar asi →]       │
└─────────────────────────────────────────────┘
```

**Reordenar**:
- Drag & drop para cambiar orden
- Primera foto = foto principal

**Checklist Visual**:
- Sugerencias de que fotos subir
- Se marca automaticamente si detecta tipo de foto (IA futura)

---

## PASO 4: Detalles (15 pts)

### Layout

```
┌─────────────────────────────────────────────┐
│  Detalles del Inmueble              4 de 6  │
│  ═══════════════════○○○○○                   │
│                                             │
│  AMENIDADES DEL EDIFICIO                    │
│  ┌─────────────────────────────────────┐    │
│  │ ☑ Piscina      ☑ Gimnasio          │    │
│  │ ☑ Seguridad    ☑ Ascensor          │    │
│  │ ☐ BBQ          ☑ Pet Friendly      │    │
│  │ ☐ Salon        ☐ Coworking         │    │
│  │ ☐ Juegos ninos ☐ Bicicletero       │    │
│  └─────────────────────────────────────┘    │
│  ✓ Autocompletado desde Vienna              │
│                                             │
│  EQUIPAMIENTO DE LA UNIDAD                  │
│  ┌─────────────────────────────────────┐    │
│  │ ☑ Aire acond.  ☑ Cocina equipada   │    │
│  │ ☑ Closets      ☐ Amoblado          │    │
│  │ ☑ Calefon      ☐ Lavadora          │    │
│  │ ☐ Cortinas     ☐ Horno empotrado   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ESTADO Y ENTREGA                           │
│  ┌────────────────┐  ┌────────────────┐     │
│  │ Estado      ▼  │  │ Disponible  ▼  │     │
│  │ [Terminado   ] │  │ [Inmediata  ]  │     │
│  └────────────────┘  └────────────────┘     │
│                                             │
│  ┌────────────────┐  ┌────────────────┐     │
│  │ Antiguedad     │  │ Estado unidad  │     │
│  │ [2 anos     ]  │  │ [Excelente ▼]  │     │
│  └────────────────┘  └────────────────┘     │
│                                             │
│  Puntos: ██████████░░ 13/15                 │
│                                             │
│  [← Atras]                 [Siguiente →]    │
└─────────────────────────────────────────────┘
```

### Comportamiento

**Checkboxes Rapidos**:
- Grid de 2 columnas
- Touch targets grandes
- Preseleccionar si proyecto conocido

**Autocompletado**:
- Si proyecto conocido, precargar amenidades del edificio
- Permitir corregir/agregar

**Amenidades/Equipamiento Custom**:
```
┌─────────────────────────────────────────────┐
│  EQUIPAMIENTO DE LA UNIDAD                  │
│  ☑ Aire Acond.  ☑ Cocina equipada          │
│  ☑ Closets      ☐ Amoblado: [No ▼]         │
│  ☑ Lavadora     ☐ Secadora                  │
│  ...                                        │
│                                             │
│  + Agregar otro equipamiento                │
│  ┌─────────────────────────────────────┐    │
│  │ [Smart Home                    ] ✓  │    │
│  └─────────────────────────────────────┘    │
│  ✓ Agregado como "Smart Home"               │
└─────────────────────────────────────────────┘
```
- Broker puede escribir equipamiento no listado
- Se guarda con `fuente: "broker_custom"`
- Aparece en la propiedad pero no en filtros automaticos

---

## PASO 5: Financiero (15 pts)

### Layout

```
┌─────────────────────────────────────────────┐
│  Informacion Financiera             5 de 6  │
│  ═══════════════════○○○○○                   │
│                                             │
│  COSTOS MENSUALES                           │
│  ┌─────────────────────────────────────┐    │
│  │ Expensas mensuales (USD)            │    │
│  │ [$85                           ]    │    │
│  │  📊 Promedio zona: $60-$100         │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  PARQUEO                                    │
│  ┌─────────────────────────────────────┐    │
│  │ ¿Incluye parqueo?                   │    │
│  │                                     │    │
│  │  (●) Si, incluido    ( ) No         │    │
│  │                                     │    │
│  │ Cantidad de parqueos: [1] ▼         │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  BAULERA                                    │
│  ┌─────────────────────────────────────┐    │
│  │ ¿Incluye baulera?                   │    │
│  │                                     │    │
│  │  ( ) Si, incluida    (●) No         │    │
│  │                                     │    │
│  │ Precio baulera extra: [$5,000]      │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  FLEXIBILIDAD                               │
│  ┌─────────────────────────────────────┐    │
│  │ ☑ Precio negociable                 │    │
│  │ ☐ Acepta financiamiento bancario    │    │
│  │ ☐ Acepta permuta                    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Puntos: ████████████░░ 14/15               │
│                                             │
│  [← Atras]                 [Siguiente →]    │
└─────────────────────────────────────────────┘
```

### Comportamiento

**Condicionales**:
- Si parqueo = No → mostrar campo "Precio parqueo extra"
- Si baulera = No → mostrar campo "Precio baulera extra"

**Contexto**:
- Mostrar promedio de expensas de la zona
- Warning si muy diferente al promedio

---

## PASO 6: Preview y Publicar

### Layout

```
┌─────────────────────────────────────────────┐
│  Preview de tu Propiedad            6 de 6  │
│  ═══════════════════════════════════════    │
│                                             │
│  PUNTUACION DE CALIDAD                      │
│  ┌─────────────────────────────────────┐    │
│  │         ★ 92 / 100 puntos ★         │    │
│  │                                     │    │
│  │  ████████████████████░░░░           │    │
│  │                                     │    │
│  │  ✓ Datos basicos     20/20         │    │
│  │  ✓ Ubicacion         15/15         │    │
│  │  ⚠ Fotos             15/20 (+5)    │    │
│  │  ✓ Detalles          15/15         │    │
│  │  ✓ Financiero        15/15         │    │
│  │  ⚠ Documentacion     12/15         │    │
│  │                                     │    │
│  │  💡 Sube fotos sin watermark → +5   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ASI SE VERA TU PROPIEDAD                   │
│  ┌─────────────────────────────────────┐    │
│  │  [═══ CARD PREVIEW ═══]             │    │
│  │  │ 📷 Foto principal    │           │    │
│  │  │ Vienna - Equipetrol  │           │    │
│  │  │ $127,000 | 85m2 | 2d │           │    │
│  │  │ ████ Oportunidad     │           │    │
│  │  └──────────────────────┘           │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  CODIGO UNICO                               │
│  ┌─────────────────────────────────────┐    │
│  │         SIM-7K2M9                   │    │
│  │  Comparte este codigo con clientes  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌───────────────┐  ┌───────────────────┐   │
│  │ Guardar       │  │ ✓ PUBLICAR        │   │
│  │ Borrador      │  │   PROPIEDAD       │   │
│  └───────────────┘  └───────────────────┘   │
│                                             │
│  [← Atras]      [Mejorar puntuacion →]      │
└─────────────────────────────────────────────┘
```

### Al Publicar → PDF Auto-Generado

```
┌─────────────────────────────────────────────┐
│  🎉 Propiedad publicada!                    │
│                                             │
│  Código: SIM-7K2M9                          │
│  Score: 92/100 pts                          │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📄 PDF PROFESIONAL LISTO           │    │
│  │                                     │    │
│  │  Se genero automaticamente un PDF   │    │
│  │  profesional para compartir.        │    │
│  │                                     │    │
│  │  [📥 Descargar PDF]                 │    │
│  │  [📱 Compartir WhatsApp]            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🎯 PROGRESO CMAs                   │    │
│  │                                     │    │
│  │  Propiedades 100pts: 4/5            │    │
│  │  [████████░░] 80%                   │    │
│  │                                     │    │
│  │  "1 propiedad mas → +1 CMA gratis!" │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Ver en Dashboard]  [Subir otra →]         │
└─────────────────────────────────────────────┘
```

### Contenido del PDF

```
┌─────────────────────────────────────────────┐
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  │         [FOTO PRINCIPAL]              │  │
│  │                                       │  │
│  │           $127,000 USD                │  │
│  │      Vienna - Equipetrol Norte        │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ─────────────────────────────────────────  │
│  • 85 m²  • 2 dormitorios  • 2 baños       │
│  • Piscina • Gimnasio • Seguridad 24h      │
│  • 1 parqueo incluido                      │
│  • Expensas: $85/mes                       │
│  ─────────────────────────────────────────  │
│                                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │
│  │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │           │
│  └─────┘ └─────┘ └─────┘ └─────┘           │
│                                             │
│  ─────────────────────────────────────────  │
│  [QR]  Ver mas fotos: simon.bo/p/SIM-7K2M9 │
│  ─────────────────────────────────────────  │
│                                             │
│  Juan Pérez | Century21 | 76543210         │
│  Ref: #SIM-7K2M9 | Powered by Simón        │
└─────────────────────────────────────────────┘
```

### Comportamiento

**Score en Tiempo Real**:
- Desglose por categoria
- Indicar que falta para 100 pts
- Tips especificos de mejora (ej: "Sube fotos sin watermark")

**Preview**:
- Mostrar exactamente como se vera en busqueda
- Foto principal + datos clave

**Codigo Unico**:
- Generar al momento de publicar
- Mostrar prominentemente
- Opcion de copiar/compartir

**PDF Auto-Generado**:
- Se genera al publicar
- Descargable inmediatamente
- Boton para compartir por WhatsApp
- Valor: ahorra 15-30 min al broker

**Tracker de CMAs**:
- Mostrar progreso actual hacia CMA gratis
- Motivacion para publicar mas propiedades de calidad

**Acciones**:
- "Guardar Borrador" → guarda sin publicar
- "PUBLICAR" → visible para compradores + genera PDF
- "Mejorar puntuacion" → volver a paso con mejoras pendientes

---

## Estados de la Propiedad

```
[Borrador] → [En Revision] → [Publicada] → [Pausada]
                   ↓              ↓
              [Rechazada]    [Vendida]
```

| Estado | Visible | Editable | Cuenta para CMA |
|--------|---------|----------|-----------------|
| Borrador | No | Si | No |
| En Revision | No | Si | No |
| Publicada | Si | Si | Si (si 100pts) |
| Pausada | No | Si | No |
| Vendida | No | No | No |
| Rechazada | No | Si | No |

---

## Mobile Especifico

### Adaptaciones

1. **Pasos en pantalla completa** - Un paso por pantalla
2. **Fotos desde camara** - Boton directo a camara
3. **Teclado numerico** - Para precio, area, etc
4. **Checkboxes grandes** - Touch-friendly
5. **Mapa fullscreen** - Al seleccionar ubicacion

### Gestos

- Swipe izquierda → siguiente paso
- Swipe derecha → paso anterior
- Pull down → refrescar

---

## Mensajes de Error/Exito

### Errores (Rojo)

| Contexto | Mensaje |
|----------|---------|
| Precio vacio | "Ingresa el precio de venta" |
| Precio muy bajo | "El precio parece muy bajo. Verifica que sea correcto" |
| GPS fuera de zona | "La ubicacion no coincide con la zona seleccionada" |
| Pocas fotos | "Necesitas al menos 3 fotos para publicar" |
| Foto duplicada | "Esta foto ya fue usada en otra propiedad" |
| Link invalido | "Solo aceptamos propiedades de C21, Remax o Bien Inmuebles" |
| Propiedad duplicada | "Esta propiedad ya existe en Simón (SIM-XXXXX)" |
| Fuente no soportada | "Este portal no esta en nuestra lista de fuentes verificadas" |

### Warnings (Amarillo)

| Contexto | Mensaje |
|----------|---------|
| Precio bajo | "Este precio esta por debajo del promedio de la zona" |
| Pocas fotos | "Con 8+ fotos tu propiedad tiene mas visibilidad" |
| Faltan amenidades | "Completa las amenidades para mejor matching" |
| Watermark detectado | "2 fotos tienen marca de agua. Sube versiones limpias → +5 pts" |
| GPS aproximado | "Ajusta el pin para ubicacion precisa → +5 pts" |

### Exito (Verde)

| Contexto | Mensaje |
|----------|---------|
| Link verificado | "✓ Link valido - Importando datos..." |
| Datos importados | "✓ Importamos precio, area, fotos automaticamente" |
| Paso completo | "✓ Datos basicos completos - 20 puntos" |
| Publicada | "🎉 Tu propiedad esta publicada! Codigo: SIM-7K2M9" |
| PDF listo | "📄 PDF profesional generado - Listo para compartir" |
| 100 puntos | "⭐ Calidad perfecta! Esta propiedad cuenta para tu CMA gratis" |
| CMA ganado | "🎁 Ganaste 1 CMA gratis por 5 propiedades perfectas!" |

---

## Estado del Documento

| Version | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 0.1 | 2026-01-23 | Claude + Luis | Borrador inicial |
| 0.2 | 2026-01-23 | Claude + Luis | Paso 0 import por link, deteccion watermarks, PDF auto-generado, tracker CMAs |
