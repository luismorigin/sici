# Producto: Informe de Mercado Automatizado

> Fecha: 13 de marzo de 2026
> Estado: Backlog — diseño conceptual completo, sin implementación

---

## 1. Visión del Producto

### Qué es

Un informe de mercado inmobiliario interactivo, parametrizable por proyecto, que se genera automáticamente con datos de la BD de SICI y se enriquece con datos de primera fuente del desarrollador.

### Doble intención

1. **Para el desarrollador** — Recibe un informe de inteligencia competitiva de su zona con su proyecto destacado. Para obtenerlo, completa un formulario con datos reales de inventario, precios, equipamiento y amenidades.
2. **Para SICI** — Captura data verificada de primera fuente que no existe en ningún portal: inventario real unidad por unidad, precios billete del desarrollador, equipamiento verificado, unidades vendidas. Cada campo es un activo que habilita productos futuros cobrables.

### Por qué funciona

El desarrollador tiene incentivo para dar data completa y precisa — quiere que su informe sea bueno. SICI obtiene la ficha técnica del proyecto sin costo de captura.

### Datos de contexto (BD al 13 Mar 2026)

- 310 listings activos en `v_mercado_venta`, 152 en `v_mercado_alquiler`
- 36 proyectos con 3+ listings (suficiente para estadísticas por proyecto)
- 98.7% match rate venta, 86.2% alquiler
- 30 días de snapshots de absorción continuos
- 100% de listings en vista con score calidad 7+
- 99.4% de listings dependen de TC para normalización

---

## 2. Secciones Automatizables HOY (13)

Parámetros de entrada: `zona` (text) + `id_proyecto_master` (int).
Fuentes: `v_mercado_venta`, `v_mercado_alquiler`, `market_absorption_snapshots`, `proyectos_master`.

### 2.1 Hero

Nombre del proyecto, desarrollador, zona, fecha de generación, conteo de listings, TC actual.

```sql
SELECT pm.nombre_oficial, pm.desarrollador, pm.zona, pm.estado_construccion,
       COUNT(v.id) as uds_en_portales
FROM proyectos_master pm
LEFT JOIN v_mercado_venta v ON v.id_proyecto_master = pm.id_proyecto_master
WHERE pm.id_proyecto_master = $1
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona, pm.estado_construccion
```

### 2.2 Panorama de Zona — KPIs agregados

7 KPIs: total uds, avg $/m², mediana $/m², ticket promedio, área promedio, zonas, TC actual.

```sql
SELECT
  COUNT(*) as total_uds,
  ROUND(AVG(precio_m2)) as avg_m2,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2)) as mediana_m2,
  ROUND(AVG(precio_norm)) as ticket_promedio,
  ROUND(AVG(area_total_m2)) as area_promedio,
  COUNT(DISTINCT zona) as zonas
FROM v_mercado_venta
-- Sin filtro = todas las zonas. Con WHERE zona = $1 = zona del proyecto.
```

### 2.3 Precios por Zona — Barras horizontales

Barras ordenadas por mediana $/m². Zona del proyecto destacada en caramelo. Hover con min, max, ticket avg, área avg.

```sql
SELECT
  zona,
  COUNT(*) as uds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2)) as mediana_m2,
  ROUND(MIN(precio_m2)) as min_m2,
  ROUND(MAX(precio_m2)) as max_m2,
  ROUND(AVG(precio_norm)) as ticket_avg,
  ROUND(AVG(area_total_m2)) as area_avg
FROM v_mercado_venta
GROUP BY zona ORDER BY mediana_m2 DESC
```

### 2.4 Precios por Tipología — Barras verticales

Barras por dormitorios en la zona. Línea de referencia horizontal con el $/m² del proyecto.

```sql
SELECT
  dormitorios,
  COUNT(*) as uds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2)) as mediana_m2,
  ROUND(AVG(precio_m2)) as avg_m2,
  ROUND(AVG(precio_norm)) as ticket_avg,
  ROUND(AVG(area_total_m2)) as area_avg
FROM v_mercado_venta
WHERE zona = $1
GROUP BY dormitorios ORDER BY dormitorios
```

### 2.5 Evolución Temporal — Deltas 30d

3 cards delta: oferta, $/m², TC. Desde snapshots diarios.

```sql
WITH ultimo AS (
  SELECT * FROM market_absorption_snapshots WHERE fecha = CURRENT_DATE AND zona = 'global'
),
anterior AS (
  SELECT * FROM market_absorption_snapshots WHERE fecha = CURRENT_DATE - 30 AND zona = 'global'
)
SELECT
  u.dormitorios,
  u.venta_activas as uds_hoy,
  a.venta_activas as uds_antes,
  ROUND(100.0 * (u.venta_activas - a.venta_activas) / NULLIF(a.venta_activas, 0), 1) as delta_oferta_pct,
  u.venta_usd_m2 as m2_hoy,
  a.venta_usd_m2 as m2_antes,
  ROUND(100.0 * (u.venta_usd_m2 - a.venta_usd_m2) / NULLIF(a.venta_usd_m2, 0), 1) as delta_m2_pct
FROM ultimo u
JOIN anterior a USING (dormitorios)
ORDER BY u.dormitorios
```

### 2.6 Estado Construcción por Zona — Barras apiladas

Entregado vs preventa por zona, con porcentajes.

```sql
SELECT
  zona,
  COUNT(*) FILTER (WHERE estado_construccion IN ('entrega_inmediata','nuevo_a_estrenar')) as entregado,
  COUNT(*) FILTER (WHERE estado_construccion = 'preventa') as preventa
FROM v_mercado_venta
GROUP BY zona ORDER BY entregado + preventa DESC
```

### 2.7 Ranking Competitivo en Zona — Tabla de proyectos

Todos los proyectos con 3+ listings. Proyecto del informe destacado.

```sql
SELECT
  pm.nombre_oficial,
  pm.estado_construccion,
  pm.desarrollador,
  COUNT(*) as uds,
  ROUND(AVG(v.precio_m2)) as avg_m2,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_m2)) as mediana_m2,
  ROUND(MIN(v.precio_norm)) as ticket_min,
  ROUND(MAX(v.precio_norm)) as ticket_max,
  ROUND(AVG(v.dias_en_mercado)) as dias_avg,
  STRING_AGG(DISTINCT v.dormitorios::text, ', ' ORDER BY v.dormitorios::text) as tipologias
FROM v_mercado_venta v
JOIN proyectos_master pm ON v.id_proyecto_master = pm.id_proyecto_master
WHERE v.zona = $1
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.estado_construccion, pm.desarrollador
HAVING COUNT(*) >= 3
ORDER BY mediana_m2 DESC
```

### 2.8 Absorción por Tipología — Tasas + meses inventario

Barras de fill horizontal por tipología. Proyectos más lentos debajo.

```sql
-- Tasas globales
SELECT
  dormitorios,
  venta_activas,
  venta_absorbidas_30d,
  ROUND(venta_tasa_absorcion * 100, 1) as tasa_pct,
  ROUND(venta_meses_inventario, 1) as meses_inv
FROM market_absorption_snapshots
WHERE fecha = (SELECT MAX(fecha) FROM market_absorption_snapshots WHERE zona = 'global')
  AND zona = 'global'
ORDER BY dormitorios;

-- Proyectos más lentos en la zona
SELECT
  pm.nombre_oficial,
  COUNT(*) as uds,
  ROUND(AVG(v.dias_en_mercado)) as dias_avg,
  MAX(v.dias_en_mercado) as dias_max
FROM v_mercado_venta v
JOIN proyectos_master pm ON v.id_proyecto_master = pm.id_proyecto_master
WHERE v.zona = $1
GROUP BY pm.id_proyecto_master, pm.nombre_oficial
HAVING COUNT(*) >= 2
ORDER BY dias_avg DESC
LIMIT 10
```

### 2.9 Scatter Competidores Entregados — $/m² vs días en mercado

Burbujas: X = mediana $/m², Y = días promedio, tamaño = uds. Proyecto en caramelo, resto en arena.

```sql
SELECT
  pm.nombre_oficial,
  COUNT(*) as uds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_m2)) as mediana_m2,
  ROUND(AVG(v.dias_en_mercado)) as dias_avg
FROM v_mercado_venta v
JOIN proyectos_master pm ON v.id_proyecto_master = pm.id_proyecto_master
WHERE v.zona = $1
  AND pm.estado_construccion IN ('entrega_inmediata', 'nuevo_a_estrenar')
GROUP BY pm.id_proyecto_master, pm.nombre_oficial
HAVING COUNT(*) >= 2
ORDER BY mediana_m2 DESC
```

### 2.10 Sensibilidad TC — Slider + distribución

Distribución por tipo de cambio en la zona. Slider con simulación dinámica del posicionamiento del proyecto.

```sql
-- Distribución TC en la zona
SELECT
  COALESCE(tipo_cambio_detectado, 'no_detectado') as tc_tipo,
  COUNT(*) as uds,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
FROM v_mercado_venta
WHERE zona = $1
GROUP BY 1 ORDER BY 2 DESC;

-- Competidores para el slider (necesita % paralelo por proyecto)
SELECT
  pm.nombre_oficial,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_m2)) as mediana_m2,
  COUNT(*) as uds,
  ROUND(100.0 * COUNT(*) FILTER (WHERE v.tipo_cambio_detectado = 'paralelo') / COUNT(*), 0) as pct_paralelo
FROM v_mercado_venta v
JOIN proyectos_master pm ON v.id_proyecto_master = pm.id_proyecto_master
WHERE v.zona = $1
GROUP BY pm.id_proyecto_master, pm.nombre_oficial
HAVING COUNT(*) >= 2
ORDER BY mediana_m2 DESC
```

El slider es JS puro del lado del cliente — recalcula posiciones con la fórmula: `nuevo_norm = mediana * (pct_par * nuevo_tc/tc_base + (1 - pct_par))`.

### 2.11 Alquiler + Yields

Precios de renta por tipología y rendimiento bruto.

```sql
-- Alquiler por tipología
SELECT
  dormitorios,
  COUNT(*) as uds,
  ROUND(AVG(precio_mensual)) as renta_avg,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)) as renta_mediana
FROM v_mercado_alquiler
WHERE zona = $1
GROUP BY dormitorios ORDER BY dormitorios;

-- Yield (del snapshot, ya calculado)
SELECT
  dormitorios,
  roi_bruto_anual,
  anos_retorno,
  venta_ticket_promedio as ticket_venta,
  alquiler_mensual_promedio as renta_mensual
FROM market_absorption_snapshots
WHERE fecha = (SELECT MAX(fecha) FROM market_absorption_snapshots WHERE zona = 'global')
  AND zona = 'global'
ORDER BY dormitorios;
```

### 2.12 Posicionamiento del Proyecto vs Mercado

En qué cuartil cae el proyecto respecto a su zona.

```sql
WITH zona_stats AS (
  SELECT
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_m2) as p25,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2) as mediana,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_m2) as p75
  FROM v_mercado_venta WHERE zona = $1
),
proyecto_stats AS (
  SELECT
    ROUND(AVG(precio_m2)) as proyecto_m2,
    ROUND(AVG(dias_en_mercado)) as proyecto_dias,
    COUNT(*) as proyecto_uds
  FROM v_mercado_venta WHERE id_proyecto_master = $2
)
SELECT
  p.proyecto_m2, p.proyecto_dias, p.proyecto_uds,
  ROUND(z.p25) as zona_p25, ROUND(z.mediana) as zona_mediana, ROUND(z.p75) as zona_p75,
  CASE
    WHEN p.proyecto_m2 > z.p75 THEN 'Premium'
    WHEN p.proyecto_m2 > z.mediana THEN 'Above median'
    WHEN p.proyecto_m2 > z.p25 THEN 'Below median'
    ELSE 'Entry'
  END as segmento
FROM proyecto_stats p, zona_stats z
```

### 2.13 Footer — Calidad de datos

Fecha de generación, total listings, match rate, cobertura GPS, versión de filtros.

---

## 3. Secciones NO Automatizables y Por Qué

| Sección | Razón | Cobertura actual en BD |
|---------|-------|----------------------|
| Comparativa equipamiento (ej. CVI vs Terrazzo) | `equipamiento_base` en `proyectos_master` | **25.8%** (61 de 236 proyectos) |
| Comparativa amenidades proyecto vs proyecto | `amenidades_edificio` en `proyectos_master` | **47.5%** (112 de 236 proyectos) |
| Scorecard equipamiento (tabla de items por competidor) | Requiere que todos los competidores tengan datos | Mismo 25.8% |
| Tiers curados (Premium / Segmento / Entry) | El corte es editorial, no derivable solo de la data | Automatizable con heurística p75/p25, pero pierde matiz |
| Recomendaciones | 100% editorial, juicio cualitativo | No automatizable |
| Resumen ejecutivo (fortalezas/debilidades) | Juicio cualitativo | ~20% derivable de data |
| Ficha head-to-head completa | Mezcla data + curación manual | Datos de desarrollador no están en BD |
| Inventario real (unidades vendidas/disponibles) | Viene del desarrollador, no de portales | `total_unidades` en **1.7%** de proyectos |
| Forma de pago detallada | Viene del desarrollador | No sistematizado |

**Estrategia**: el formulario del desarrollador (sección 4) llena los gaps de las secciones no automatizables. A medida que más desarrolladores completan formularios, las secciones "no automatizables" se vuelven automatizables progresivamente.

---

## 4. Formulario del Desarrollador

### Bloque 1 — Datos del Proyecto

| Campo | Tipo | Obligatorio | Destino BD |
|-------|------|:-----------:|------------|
| Nombre oficial | text | Si | `proyectos_master.nombre_oficial` |
| Desarrolladora | text | Si | `proyectos_master.desarrollador` |
| Ubicacion GPS | lat/lon (pin en mapa o pegar coords) | Si | `proyectos_master.latitud/longitud` |
| Estado construccion | select: entrega_inmediata/preventa/en_obra | Si | `proyectos_master.estado_construccion` |
| Fecha entrega estimada | date (si preventa) | Condicional | `proyectos_master.fecha_entrega` |
| Pisos totales | int | Si | `proyectos_master.cantidad_pisos` |
| Total unidades del edificio | int | Si | `proyectos_master.total_unidades` |

### Bloque 2 — Inventario Unidad por Unidad

Tabla editable con boton "agregar fila" + **import desde Excel/CSV** (SheetJS).

| Campo | Tipo | Obligatorio |
|-------|------|:-----------:|
| Numero/nombre unidad | text | Si |
| Piso | int | Si |
| Dormitorios | select: 0/1/2/3/4 | Si |
| Banos | int | Si |
| Area m2 | decimal | Si |
| Precio USD | decimal | Si |
| Estado | select: disponible/vendido/reservado | Si |

Destino: tabla nueva `inventario_desarrollador`.

### Bloque 3 — Pricing y TC

| Campo | Tipo | Obligatorio |
|-------|------|:-----------:|
| Moneda de lista de precios | select: USD/BOB | Si |
| TC que usan para publicar | select: paralelo/oficial/fijo | Si |
| TC fijo (si aplica) | decimal | Condicional |
| Precio negociable | boolean | No |
| Descuento por contado | % | No |
| Acepta permuta | boolean | No |

### Bloque 4 — Forma de Pago

| Campo | Tipo | Obligatorio |
|-------|------|:-----------:|
| Reserva (monto USD) | decimal | No |
| Cuota inicial (% del precio) | decimal | No |
| Plazo cuota inicial (meses) | int | No |
| Financiamiento propio (cuotas) | int | No |
| Plazo financiamiento (meses) | int | No |
| Acepta credito bancario | boolean | No |

### Bloque 5 — Equipamiento de Unidad (checkboxes)

**Cocina:** Cocina equipada, Horno, Microondas, Campana extractora, Mesones granito/cuarzo

**Linea blanca:** Heladera, Lavavajillas, Lavadora, Secadora

**Confort:** Aire acondicionado, Calefon/Termotanque, Closets/roperos empotrados, Box bano vidrio

**Tecnologia:** Cerradura digital, Intercomunicador, Aislamiento acustico

**Adicionales:** Campo de texto libre para items no listados

Destino: `proyectos_master.equipamiento_base` (jsonb array de strings).

### Bloque 6 — Amenidades de Edificio (checkboxes)

**Recreacion:** Piscina, Gimnasio, Sauna/Jacuzzi, Churrasquera, Cocina verano, Fogatero

**Social:** Salon de eventos, Co-working, Parque infantil, Pet center

**Servicios:** Seguridad 24/7, Ascensor, Lavanderia comun

**Exterior:** Terraza/balcon comun, Jardin/area verde

**Adicionales:** Campo de texto libre

Destino: `proyectos_master.amenidades_edificio` (jsonb array de strings).

### Bloque 7 — Contacto (opcional)

| Campo | Tipo | Obligatorio |
|-------|------|:-----------:|
| Nombre comercial de contacto | text | No |
| Telefono / WhatsApp | text | No |
| Email | text | No |

---

## 5. Tabla `inventario_desarrollador`

### Estructura

```sql
CREATE TABLE inventario_desarrollador (
  id SERIAL PRIMARY KEY,
  id_proyecto_master INT NOT NULL REFERENCES proyectos_master(id_proyecto_master),
  numero_unidad VARCHAR(20) NOT NULL,
  piso INT,
  dormitorios INT NOT NULL,
  banos INT,
  area_m2 NUMERIC(8,2) NOT NULL,
  precio_usd NUMERIC(12,2) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'disponible',  -- disponible/vendido/reservado
  fecha_carga TIMESTAMPTZ DEFAULT NOW(),
  fecha_actualizacion TIMESTAMPTZ DEFAULT NOW(),
  cargado_por VARCHAR(100),  -- email o identificador del desarrollador
  UNIQUE (id_proyecto_master, numero_unidad)
);

CREATE INDEX idx_inv_dev_proyecto ON inventario_desarrollador(id_proyecto_master);
```

### Query de cruce: unidades sin visibilidad online

```sql
-- Unidades del desarrollador que NO aparecen publicadas en portales
SELECT
  d.numero_unidad,
  d.piso,
  d.dormitorios,
  d.area_m2,
  d.precio_usd,
  d.estado
FROM inventario_desarrollador d
LEFT JOIN v_mercado_venta v
  ON v.id_proyecto_master = d.id_proyecto_master
  AND v.dormitorios = d.dormitorios
  AND ABS(v.area_total_m2 - d.area_m2) < 5
WHERE d.id_proyecto_master = $1
  AND d.estado = 'disponible'
  AND v.id IS NULL
-- Resultado: unidades disponibles que ningun broker esta publicando
```

### Query complementario: discrepancia de precios

```sql
-- Comparar precio del desarrollador vs lo que publican los brokers
SELECT
  d.numero_unidad,
  d.dormitorios,
  d.area_m2,
  d.precio_usd as precio_desarrollador,
  ROUND(d.precio_usd / d.area_m2) as m2_desarrollador,
  ROUND(v.precio_norm) as precio_portal_norm,
  ROUND(v.precio_m2) as m2_portal,
  ROUND(v.precio_m2 - d.precio_usd / d.area_m2) as diferencia_m2
FROM inventario_desarrollador d
JOIN v_mercado_venta v
  ON v.id_proyecto_master = d.id_proyecto_master
  AND v.dormitorios = d.dormitorios
  AND ABS(v.area_total_m2 - d.area_m2) < 5
WHERE d.id_proyecto_master = $1
ORDER BY ABS(v.precio_m2 - d.precio_usd / d.area_m2) DESC
-- Resultado: donde el broker publica distinto al precio real
```

---

## 6. Productos Futuros que Habilita

| Producto | Data que usa del formulario | Modelo de cobro |
|----------|---------------------------|----------------|
| **Informe de mercado** (el gancho) | Precio billete, inventario, tipologias | Gratis o bajo costo |
| **Alerta competitiva** ("tu competidor bajo precio") | Precio para comparar, zona | Suscripcion mensual |
| **Diagnostico de visibilidad** ("8 uds sin publicar") | Inventario real vs BD portales | Consultoria |
| **Recomendacion de pricing** por tipologia | Inventario + precios + mercado zona | Premium one-shot |
| **Absorcion estimada personalizada** | Uds disponibles + tasas zona + tipologias | Premium one-shot |
| **Publicacion en simonbo.com** | Inventario + fotos + contacto | Comision o listing fee |
| **CMA para compradores** del proyecto | Ficha completa alimenta el CMA existente | Ya existe (api/informe) |
| **Dashboard live del proyecto** | Todo: inventario, precios, absorcion, competidores | SaaS mensual |
| **Benchmark de equipamiento** | Equipamiento + amenidades vs zona | Incluido en premium |
| **Reporte de yield para inversores** | Inventario + alquileres zona | Premium o investor pack |

Cada campo del formulario es un activo reutilizable. El desarrollador llena una vez, SICI monetiza N veces.

---

## 7. Control de Acceso

El informe NO debe ser descargable como archivo estatico. Vive en una URL controlada.

### Opcion A — Magic link por email (recomendada para arrancar)

1. Desarrollador completa formulario con su email
2. SICI genera informe y envia magic link por email
3. Link valido por X dias (configurable, ej. 30 dias)
4. Sin password, sin cuenta — minima friccion

**Implementacion:** Token UUID en tabla `informe_accesos`, verificacion en middleware.

### Opcion B — Token con expiracion

1. URL tipo `/informe/condado-vi?token=abc123`
2. Token con fecha de expiracion en BD
3. Mas simple de implementar, menos seguro

### Opcion C — Auth de desarrollador (futuro)

1. Login similar al sistema broker existente (`useBrokerAuth`)
2. Dashboard propio con historial de informes
3. Apropiado cuando haya multiples productos cobrables

**Recomendacion:** Arrancar con magic link (A). Migrar a auth completo (C) cuando haya SaaS mensual.

---

## 8. Tres Enfoques Tecnicos

### Enfoque 1 — Script nocturno

Un script Node.js que corre en n8n (scheduler existente). Queries a Supabase, inyecta en template HTML, sube a Supabase Storage o bucket.

| Aspecto | Detalle |
|---------|---------|
| Pro | Minima complejidad, sin nueva infra |
| Pro | Genera HTML estatico — rapido de servir |
| Contra | No interactivo con datos live |
| Contra | Regenerar = esperar al proximo ciclo nocturno |
| Esfuerzo | ~2-3 dias |
| Costo infra | $0 (n8n + Supabase existentes) |

### Enfoque 2 — Pagina SSR en simon-mvp (recomendado fase 1)

Pagina Next.js tipo `/admin/informe/[proyecto]` con ISR (`revalidate: 86400`). Queries en tiempo real a Supabase. Protegida con auth.

| Aspecto | Detalle |
|---------|---------|
| Pro | Se integra al admin dashboard existente |
| Pro | Datos siempre frescos (1x/dia con ISR) |
| Pro | Reutiliza auth, Supabase client, componentes |
| Contra | Acoplado a simon-mvp |
| Esfuerzo | ~3-4 dias |
| Costo infra | $0 (dentro del tier Vercel existente) |

### Enfoque 3 — API multi-proyecto (recomendado fase 2)

API route `/api/informe-mercado?proyecto=X` que genera HTML on-demand. Template parametrizable para cualquier proyecto.

| Aspecto | Detalle |
|---------|---------|
| Pro | Escalable a todos los proyectos |
| Pro | Desacoplado — puede servirse desde cualquier dominio |
| Pro | Base para productos SaaS |
| Contra | Mas complejo de mantener |
| Contra | Generacion PDF requiere Puppeteer (mas RAM) |
| Esfuerzo | ~5-7 dias |
| Costo infra | $0-5/mes (Puppeteer en serverless = mas memoria) |

**Recomendacion:** Enfoque 2 (SSR) para validar el producto. Migrar a enfoque 3 cuando haya multiples clientes.

---

## 9. Estimado de Implementacion por Fase

### Fase 1 — Informe SSR + selector de proyecto (~3-4 dias)

- Pagina Next.js con selector de proyecto (36 con data)
- 13 secciones automatizadas con queries en vivo
- Chart.js para graficos, IntersectionObserver para scroll
- Estilo editorial del informe Condado VI como base
- ISR 24h, protegido con admin auth

**Entregable:** `/admin/informe/[proyecto]` funcional para cualquiera de los 36 proyectos.

### Fase 2 — Comparador head-to-head (~1-2 dias)

- Segundo selector "Comparar con:"
- Tabla lado a lado con metricas de BD ($/m², uds, dias, tipologias, ticket rango)
- Comparativa de amenidades/equipamiento SI ambos proyectos tienen datos en BD
- Degradacion elegante: si no hay datos, la seccion no aparece

**Entregable:** Comparacion automatica entre dos proyectos de la misma zona.

### Fase 3 — Formulario + inventario_desarrollador (~5-6 dias)

- Formulario multi-step (7 bloques) en Next.js
- Tabla `inventario_desarrollador` + migracion
- Import CSV/Excel con SheetJS
- Cruce automatico: unidades sin visibilidad online
- Datos del formulario enriquecen el informe (precio real, inventario real)
- Magic link para acceso del desarrollador

**Entregable:** Formulario funcional que captura data y genera informe enriquecido.

### Fase 4 — Productizacion (~3-4 dias, futuro)

- Auth de desarrollador (basado en broker auth existente)
- Dashboard del desarrollador con historial
- Alertas competitivas automaticas
- Exportacion PDF del informe
- Pagina de pricing para productos premium

**Total estimado Fases 1-3:** ~10-12 dias de desarrollo, $0 de infraestructura adicional.

---

## 10. Modelo de Negocio

### Mercado objetivo

~7 desarrolladoras grandes en Equipetrol con capacidad de pago. Empresas con multiples proyectos activos y volumen de inventario suficiente para justificar inteligencia de mercado recurrente.

### Pricing

| Concepto | Precio |
|----------|--------|
| Setup + primer informe personalizado | **$1,500 USD** |
| Suscripcion mensual (minimo 6 meses) | **$250 USD/mes** |
| Despues del mes 6 | **$350-400 USD/mes** |

El setup incluye onboarding, ficha manual del proyecto, analisis editorial personalizado y recomendaciones. El precio de la suscripcion sube despues del mes 6 porque el producto vale mas con historial acumulado — tendencias, alertas calibradas, absorcion real medida en el tiempo.

### Ingresos proyectados ano 1

| Clientes | Setup | Suscripcion (12 meses avg) | Total ano 1 |
|:--------:|------:|---------------------------:|------------:|
| 3 | $4,500 | $6,000 | **$10,500 USD** |
| 5 | $7,500 | $10,000 | **$17,500 USD** |
| 7 | $10,500 | $14,000 | **$24,500 USD** |

### Caso de demostracion

**Condado VI / Proinco** — primer cliente al precio de introduccion. El informe interactivo ya existe (`INFORME_INTERACTIVO_CONDADO_VI.html`). Sirve como referencia tangible para presentar a las siguientes desarrolladoras: "esto es lo que recibirias, actualizado diariamente, con tu proyecto destacado".

### Proteccion del acceso

El informe no es descargable. Vive en una URL controlada con magic link por email y expiracion configurable. Sin login ni cuenta inicial — minima friccion para el cliente, maxima retencion del activo para SICI.
