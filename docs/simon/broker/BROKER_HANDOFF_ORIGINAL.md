# Dashboard de Brokers - Handoff Original

> **Fuente:** Claude Desktop - Sesión 2026-01-25
> **Proyecto:** Simón - Plataforma B2B2C Inmobiliaria
> **Objetivo:** Diseño del Dashboard de Brokers con sistema de incentivos y sincronización inteligente

---

## Progreso al Momento del Handoff

### Completado
- Definición de estrategia de data curada (calidad > cantidad)
- Lista de inmobiliarias permitidas (Century21, Remax, Bien Inmuebles)
- Sistema de puntos de calidad (0-100 pts)
- Desglose de 10 campos obligatorios
- Programa de incentivos: 5 props 100pts = 1 CMA gratis
- Sistema anti-duplicados (hash fotos + geo-matching)
- Wireframes completos del Dashboard
- Flujos de usuario documentados
- Sistema de sincronización de dos niveles (scraped vs verified)
- Protocolo de baja automática (48 horas)
- Templates de emails de notificación

### Pendiente
- Generador de PDF de propiedad
- Generador de CMA (template básico)
- Analytics simple (vistas por propiedad)
- App móvil simplificada
- Testing con brokers beta

---

## Decisiones Clave

1. **NO verificación OTP de propietario** - Muy restrictivo, eliminado
2. **Verificación por link de inmobiliaria** - Century21/Remax/Bien Inmuebles
3. **Source of Truth:** Broker verificado > Scraping automático
4. **Re-scraping diario NO sobreescribe** propiedades verificadas
5. **Sistema de baja automática:** 48 horas de plazo si propiedad desaparece
6. **Desarrolladoras:** Verificación manual por email
7. **NO se permiten:** InfoCasas, Properati, brokers independientes sin exclusividad
8. **Simón = Data curada, NO portal masivo**

---

## Arquitectura del Sistema

### Estados de Propiedad

| Estado | Descripción |
|--------|-------------|
| `active_scraped` | Scrapeada, no verificada. Re-scraping actualiza todo |
| `active_verified` | Broker verificó. Broker controla datos. Re-scraping solo monitorea existencia |
| `pending_removal` | Desapareció del origen. Alerta enviada. 48hrs para responder |
| `delisted` | Dada de baja (vendida o no respondió en 48hrs). No aparece en búsquedas |

### Campos DB Críticos

```sql
status: ENUM(active_scraped, active_verified, pending_removal, delisted)
broker_id: NULL o UUID
scraped_url: VARCHAR (link original)
last_scraped_at: TIMESTAMP
verified_at: TIMESTAMP
delisted_at_source: TIMESTAMP
removal_deadline: TIMESTAMP (delisted_at_source + 48hrs)
removal_notified: BOOLEAN
```

---

## Sistema de Puntos de Calidad (100 pts)

### Fotos (30 pts)
| Criterio | Puntos |
|----------|--------|
| 8+ fotos sin watermark | 30 pts |
| 8+ fotos con watermark | 20 pts |
| 5-7 fotos | 20 pts |

### Data Completa (40 pts)
Los 10 campos obligatorios:
1. price_usd
2. superficie_m2
3. dormitorios
4. banos
5. zona
6. edificio
7. amenities
8. parqueo_incluido
9. expensas_mensuales
10. antiguedad_edificio

### Fotos Únicas (20 pts)
- Hash de imágenes no duplicadas

### Geolocalización (10 pts)
| Criterio | Puntos |
|----------|--------|
| Pin preciso en mapa | 10 pts |
| Pin aproximado | 5 pts |

**NOTA:** Solo propiedades con 100 pts cuentan para CMAs gratis

---

## Inmobiliarias Permitidas

| Nombre | Dominios | Tipo | Verificación |
|--------|----------|------|--------------|
| Century21 | century21.com.bo, c21.com.bo | Franquicia internacional | Automática con link |
| Remax | remax.com.bo, remax.bo | Franquicia internacional | Automática con link |
| Bien Inmuebles | bieninmuebles.com | Inmobiliaria local | Automática con link |
| Desarrolladoras | - | Desarrolladora | Manual por email |

---

## Flujos Principales

### Subir Propiedad
1. Selecciona inmobiliaria (Century21/Remax/Bien Inmuebles)
2. Pega link de publicación
3. Sistema verifica link y scrapea datos
4. Sistema verifica anti-duplicados (hash fotos + geo-matching)
5. Broker completa 10 campos obligatorios
6. Opcional: Sube fotos adicionales sin watermark
7. Ajusta pin de ubicación en mapa
8. Sistema calcula score de calidad (0-100pts)
9. Publicar (solo 100pts cuentan para CMAs)

### Generar CMA
1. Broker tiene CMAs disponibles (por cada 5 props 100pts)
2. Click 'Generar CMA' en propiedad
3. Elige: Usar CMA gratis o Comprar ($49.99)
4. Sistema genera PDF con comparables automáticos
5. Broker descarga y usa con cliente

### Sincronización
- **Propiedad scraped:** Re-scraping diario actualiza todo. Si desaparece → baja automática
- **Propiedad verified:** Re-scraping solo monitorea existencia. Si desaparece → Alerta 48hrs → Auto-baja si no responde

---

## Protocolo de Baja Automática

**Trigger:** Propiedad verificada desaparece de Century21/Remax/Bien Inmuebles

| Hora | Acción |
|------|--------|
| 0 | Estado: `active_verified` → `pending_removal`. Email: "⚠️ ACCIÓN REQUERIDA - 48 HORAS" |
| 36 | Email recordatorio: "⏰ Última oportunidad (quedan 12hrs)" |
| 48 | Si no responde: Estado → `delisted`. Email: "Propiedad dada de baja" |

### Opciones del Broker
1. **Marcar como vendida** - Baja inmediata
2. **Confirmar que sigue disponible** - Mantiene en Simón, desvincula de origen
3. **No responder** - Baja automática a las 48hrs

---

## Features Adicionales

### PDF de Propiedad
Auto-generado al publicar. Incluye:
- Fotos
- Características
- QR code a simón.bo
- Branding broker

### CMA Premium ($49.99)
Reporte PDF con:
- Comparables automáticos
- Precio sugerido
- Tendencias de mercado
- Recomendaciones

### Comparador Simple (Gratis)
- Precio por m² de propiedad vs promedio de zona
- Disponible en dashboard

### Badges
- Century21 Verificada
- Remax Verificada
- Founding Broker
- etc.

---

## Fases de Implementación

### Fase 1: MVP
- Formulario nueva propiedad con verificación de links
- Sistema anti-duplicados (hash + geo)
- Cálculo de score de calidad
- Dashboard básico (lista propiedades)
- Tracker de CMAs gratis
- Re-scraping diario con sistema de dos niveles

### Fase 2: Post-MVP
- Generador de PDF de propiedad
- Generador de CMA básico
- Analytics simple (vistas)
- Sistema de baja automática con emails

### Fase 3: Refinamiento
- App móvil simplificada
- Notificaciones push
- Comparador de mercado avanzado

---

## Contexto Crítico

### Filosofía
Simón NO es portal masivo. **Data curada > Cantidad**. Solo inmobiliarias con exclusividades.

### Diferenciador Clave
Brokers verificados son source of truth. Re-scraping respeta sus ediciones.

### Incentivo Principal
CMAs gratis ($49.99 valor) por subir propiedades completas (100pts).

### Problema Resuelto
Sincronización broker-origen sin perder control de base de datos.

### Edge Case Importante
Si broker edita precio en Simón pero no en Century21, Simón respeta edición del broker (es más actualizado que la fuente).

---

## Preocupaciones Resueltas

| Preocupación | Solución |
|--------------|----------|
| ¿Perder control de BD si brokers editan? | Sistema de dos niveles: scraped (piloto automático) vs verified (broker manda). Histórico de cambios. Trust score. |
| ¿Desincronización entre C21 y Simón? | Re-scraping diario + Sistema de baja automática con 48hrs de plazo. Props verified no se sobreescriben. |
| ¿Brokers no querrán estar en Simón? | Es gratis + CMAs gratis + más visibilidad. 90% no se quejan. 2% opt-out fácil. |
| ¿Complejidad de sincronización? | Campo 'status' en DB. Regla simple: IF verified THEN skip updates. Solo monitorear existencia. |

---

## Próximos Pasos (al momento del handoff)

1. Continuar implementación técnica con Claude Code
2. Crear templates de emails de notificación
3. Diseñar generador de PDF básico
4. Mockups finales del Dashboard para mostrar a brokers beta
5. Testing del sistema anti-duplicados
6. Documentar API de scraping para Century21/Remax/Bien Inmuebles

---

## Notas Importantes

- Dashboard debe ser TAN útil que brokers lo usen diariamente (no solo por leads)
- Foco en ahorro de tiempo real: importación automática, CMAs gratis, PDFs auto-generados
- Calidad > Cantidad: Mejor 100 propiedades verificadas que 1000 con duplicados
- Re-scraping NO es enemigo del broker verificado, es su asistente de sincronización
- 48 horas es plazo justo: 2 emails, tiempo razonable, pero mantiene base de datos limpia
