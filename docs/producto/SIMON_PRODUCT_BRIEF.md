# Simón — Product Brief (Técnico)

> Documento de referencia para equipos no-técnicos.
> Describe qué existe hoy, qué hace cada parte, y qué limitaciones tiene.
> No incluye posicionamiento, branding ni estrategia comercial — eso corresponde a marketing.

---

## 1. Qué es Simón (definición técnica)

Simón es una plataforma web que recopila, procesa y presenta información del mercado inmobiliario de la zona Equipetrol (Santa Cruz, Bolivia).

Todas las noches, un pipeline automatizado visita los portales inmobiliarios, extrae las publicaciones activas, las enriquece con inteligencia artificial, y las consolida en una base de datos única. El resultado se expone a través de páginas web, APIs, y dashboards internos.

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 + React 18 + TypeScript + Tailwind CSS |
| Base de datos | PostgreSQL (Supabase) |
| Automatización | n8n (pipelines nocturnos) |
| IA | Claude API (enriquecimiento de datos, análisis fiduciario) |
| Mapas | Leaflet + PostGIS |
| Visualización | Recharts |
| PDFs | @react-pdf/renderer |

---

## 2. Fuentes de datos

| Portal | Venta | Alquiler | Frecuencia |
|--------|:-----:|:--------:|-----------|
| Century 21 | Si | Si | Diaria (nocturna) |
| RE/MAX | Si | Si | Diaria (nocturna) |
| Bien Inmuebles | No | Si | Diaria (nocturna) |

Cada noche el sistema:
1. **Descubre** publicaciones nuevas y actualiza las existentes
2. **Enriquece** con IA (extrae dormitorios, amenidades, estado de construcción, fotos, etc.)
3. **Consolida** datos de múltiples fuentes en un registro único por propiedad
4. **Vincula** cada propiedad a su proyecto/edificio (matching)
5. **Verifica** que las publicaciones sigan activas

---

## 3. Superficies de producto

### 3.1 Páginas públicas

| Ruta | Qué hace | Estado |
|------|----------|--------|
| `/` | Página principal — entrada al sistema | Live |
| `/ventas` | Feed de propiedades en venta con filtros (zona, dormitorios, precio, estado de obra), fotos, mapa | Live |
| `/alquileres` | Feed de alquileres con filtros (zona, dormitorios, precio, amoblado, mascotas), fotos, mapa | Live |
| `/mercado/equipetrol` | Índice de reportes de mercado (venta + alquiler) | Live |
| `/mercado/equipetrol/ventas` | Datos de mercado ventas: precios/m2, distribución por zona, tipologías | Live |
| `/mercado/equipetrol/alquileres` | Datos de mercado alquileres: rentas, zonas, yield estimado | Live |
| `/condado-vi` | Landing dedicada para un cliente (proyecto Condado VI) | Live |
| `/filtros-v2` → `/formulario-v2` → `/resultados-v2` | Funnel premium: filtros avanzados → cuestionario personalizado → resultados con análisis fiduciario | Live (accesible por URL) |

### 3.2 Servicios internos del sitio

Estas son las funciones que el sitio usa internamente para operar. No son accesibles para usuarios externos — las consume el propio frontend.

**Activos (en uso hoy):**

| Servicio | Qué hace |
|----------|----------|
| Búsqueda ventas | Procesa los filtros del feed de ventas y devuelve resultados |
| Búsqueda alquileres | Procesa los filtros del feed de alquileres y devuelve resultados |
| Contacto broker | Registra el lead, arma mensaje WhatsApp personalizado, notifica por Slack |
| Redirección WhatsApp | Abre WhatsApp con mensaje pre-armado sobre la propiedad que el usuario estaba viendo |
| Captura de lead | Registra datos del usuario antes de mostrar el link original del portal |
| Notificaciones Slack | Avisa internamente cuando hay un lead nuevo o un formulario completado |

**Construidos pero no activos (parte del funnel fiduciario desconectado):**

| Servicio | Qué hace |
|----------|----------|
| Guía fiduciaria | Genera guía personalizada usando IA a partir del perfil del comprador |
| Análisis comparativo | Evalúa propiedades con IA (scoring por escasez, precio, contexto del usuario) |
| Informe PDF | Genera informe premium con 9 secciones + mapa |

### 3.3 Panel de administración

| Ruta | Qué hace |
|------|----------|
| `/admin/salud` | Dashboard de salud del sistema: calidad de datos, workflows, colas de revisión |
| `/admin/propiedades` | Listado y edición de propiedades (venta/alquiler), candados de campos, galería |
| `/admin/proyectos` | Gestión de proyectos/edificios: datos, inferencia automática, propagación |
| `/admin/alquileres` | Gestión de alquileres: cards, edición inline, tracking WhatsApp |
| `/admin/market` | Dashboard de mercado ventas: KPIs, absorción por zona, tendencias |
| `/admin/market-alquileres` | Dashboard de mercado alquileres: KPIs, yield, tendencias |
| `/admin/supervisor/*` | Revisión humana (HITL): aprobar matches, asignar proyectos, gestionar excluidas |
| `/admin/brokers` | Gestión de brokers registrados |

### 3.4 Panel de broker (B2B)

| Ruta | Qué hace |
|------|----------|
| `/broker/dashboard` | Panel del broker: sus propiedades, stats, generación de PDF y CMA |
| `/broker/nueva-propiedad` | Publicar propiedad nueva (hereda datos del proyecto si existe) |
| `/broker/editar/[id]` | Editar propiedad existente |
| `/broker/fotos/[id]` | Gestión de fotos (subir, eliminar, reordenar) |
| `/broker/leads` | Bandeja de leads recibidos |
| `/broker/perfil` | Perfil del broker (datos, foto, logo) |

El panel broker también tiene servicios internos para: crear/editar/eliminar propiedades, gestionar fotos, generar PDF profesional, y generar CMA (análisis comparativo de mercado).

---

## 4. Capacidades del sistema

### Qué puede hacer hoy

- **Buscar propiedades** por zona, dormitorios, rango de precio, estado de obra, amoblado, mascotas
- **Mostrar fotos** de los portales originales (Century21, RE/MAX, Bien Inmuebles)
- **Ubicar en mapa** propiedades con GPS (99%+ de proyectos tienen coordenadas)
- **Normalizar precios** — convierte entre USD billete (mercado paralelo) y USD oficial para hacer comparaciones justas
- **Vincular a proyectos** — asocia cada publicación individual a su edificio/proyecto
- **Generar informes PDF** personalizados con análisis fiduciario (IA)
- **Comparar propiedades** lado a lado (CompareSheet en ventas y alquileres)
- **Calcular posición de mercado** — dónde cae una propiedad vs. la mediana de su zona
- **Trackear absorción** — cuántas propiedades entran y salen del mercado por período
- **Capturar leads** con contexto (qué buscaba, qué vio, cuándo) — la fuente confiable de leads es la tabla `leads_alquiler` en BD, no GA4
- **Notificar en tiempo real** vía Slack cuando hay un lead nuevo
- **Generar CMA** (análisis comparativo de mercado) para brokers

### Qué NO puede hacer

- **Precio de cierre** — solo tiene precio de publicación (la brecha típica es 5-15%)
- **Yield/ROI real** — requeriría rentas efectivas y precios de cierre verificados
- **Tasa de vacancia** — no existe dato local; si se menciona, es estimación con rango (8-15%)
- **Valorización/plusvalía** — no hay serie histórica suficiente (menos de 3 meses longitudinales)
- **Flujo de caja proyectado** — depende de variables no medidas (vacancia, gastos, impuestos)
- **Distinguir amoblado/no amoblado confiablemente** — 26% de alquileres no declaran
- **Cobertura fuera de Equipetrol** — el sistema solo cubre la zona Equipetrol y alrededores

---

## 5. Zonas cubiertas

| Zona | Descripción corta |
|------|------------------|
| Equipetrol Centro | Zona principal, mayor volumen de publicaciones |
| Equipetrol Norte | Zona financiera, rentas altas, inventario chico |
| Sirari | Premium, venta directa de desarrolladoras |
| Villa Brigida | Emergente, entry-level |
| Equipetrol Oeste | Mixto premium + universitario |
| Eq. 3er Anillo | Periferia, volumen muy bajo |

Las zonas se asignan automáticamente por GPS usando polígonos geográficos (PostGIS).

---

## 6. Flujos de usuario implementados

### Comprador / Inversor (flujo activo)
```
Llega a simonbo.com → Elige ventas o alquileres → Filtra por zona/precio/dormitorios →
Ve resultados (cards + mapa) → Abre fotos → Compara favoritos →
Contacta por WhatsApp (deja lead automáticamente)
```

### Visitante mercado (flujo activo)
```
Llega a /mercado/equipetrol → Ve KPIs generales →
Entra a ventas o alquileres → Consulta precios, zonas, tipologías
```

### Administrador (flujo activo)
```
Revisa /admin/salud → Aprueba matches pendientes →
Corrige datos en propiedades/proyectos → Monitorea mercado
```

### Broker (construido, adopción mínima)
```
Se registra → El sistema vincula sus propiedades existentes por teléfono →
Publica/edita propiedades → Genera PDF profesional → Recibe leads
```

### Cliente B2B (1 caso activo)
```
Recibe landing dedicada (ej: /condado-vi) →
Landing muestra su proyecto con datos estáticos
```

---

## 7. Integraciones activas

| Sistema | Para qué se usa |
|---------|----------------|
| WhatsApp | Canal de contacto usuario → broker/asesor (mensajes pre-armados) |
| Slack | Notificaciones internas: leads nuevos, formularios, alertas |
| Google Analytics 4 | Tracking de comportamiento de usuarios en el sitio. **Datos de `click_whatsapp` confiables solo desde 27 feb 2026** (bug pre-fix inflaba eventos en cada render). Para leads reales históricos usar la tabla `leads_alquiler` en BD |
| Claude API (Anthropic) | Enriquecimiento de datos + análisis fiduciario + CMA |

---

## 8. Resumen de estado

### En producción (lo que un usuario real puede usar hoy)

| Componente | Estado | Notas |
|-----------|--------|-------|
| Pipeline nocturno (venta) | Operativo | Corre todas las noches, 3 fuentes |
| Pipeline nocturno (alquiler) | Operativo | Corre todas las noches, 3 fuentes |
| Landing principal (`/`) | Live | Dirige a alquileres, ventas y mercado |
| Feed ventas (`/ventas`) | Live | Filtros, fotos, mapa, contacto WhatsApp, lead gate |
| Feed alquileres (`/alquileres`) | Live | Filtros, fotos, mapa, comparador, contacto WhatsApp, lead gate |
| Mercado hub (`/mercado/equipetrol`) | Live | KPIs ventas + alquileres, links a reportes |
| Mercado ventas (`/mercado/equipetrol/ventas`) | Live | Precios/m2, zonas, tipologías, tendencias históricas |
| Mercado alquileres (`/mercado/equipetrol/alquileres`) | Live parcial | Rentas, zonas, yield — historial de precios y absorción pendientes (requieren 60+ días de datos) |
| Landing Condado VI (`/condado-vi`) | Live | Página estática de un proyecto específico (datos hardcodeados, no conecta a BD) |
| Panel admin | Live | Uso interno: salud, propiedades, proyectos, mercado, HITL |
| Slack (notificaciones) | Live | Avisa en tiempo real cuando entra un lead |
| WhatsApp (contacto) | Live | Mensaje pre-armado con datos de la propiedad |
| Google Analytics 4 | Live | Tracking de comportamiento |

### Construido pero NO en producción

| Componente | Estado | Por qué no está en producción |
|-----------|--------|-------------------------------|
| Funnel fiduciario (`/filtros-v2` → `/formulario-v2` → `/resultados-v2`) | Accesible por URL directa, no linkeado desde ningún lado | Fue el MVP original. La landing actual dirige a `/ventas` y `/alquileres` en vez de al funnel premium. El código funciona pero no es parte del flujo de usuario actual |
| Guía fiduciaria (IA) | Código existe | Solo se activa desde el funnel fiduciario que no está en producción |
| Análisis comparativo con IA (razón fiduciaria) | Código existe | Idem — parte del funnel premium desconectado |
| Informe PDF premium | Código existe | Idem — se genera desde resultados-v2 |
| MOAT scoring (ranking inteligente de propiedades) | Código existe | Lógica de scoring implementada en resultados-v2 pero no validada ni expuesta |
| Panel broker | Código completo y funcional | Login, dashboard, publicar propiedades, PDF, CMA — todo funciona pero con adopción mínima |
| CMA broker (análisis comparativo de mercado) | Código existe | Funcional dentro del panel broker, requiere créditos |
| Informe automatizado por proyecto | Diseñado | No implementado — solo existe el diseño conceptual |

### Resumen simple

**Lo que el usuario ve hoy:** Landing → feeds de ventas/alquileres (buscar, filtrar, ver fotos, comparar, contactar por WhatsApp) + datos de mercado públicos.

**Lo que existe pero nadie usa:** Todo el sistema fiduciario (funnel premium, guía IA, scoring inteligente, informe PDF) y el panel de brokers.
