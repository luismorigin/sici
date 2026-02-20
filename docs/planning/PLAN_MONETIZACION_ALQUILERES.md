# Plan de Monetizacion — Plataforma de Alquileres Simon

**Fecha:** 19 Feb 2026
**Estado:** Fase 1 implementada, Fases 2-5 planificadas

---

## Vision General

Monetizar la plataforma de alquileres de Simon a traves de un modelo freemium para brokers, donde el valor se demuestra ANTES de cobrar. El flujo es:

1. **Gratis:** El broker aparece en la plataforma, recibe leads rastreados
2. **Demostrar valor:** Simon genera reportes mensuales de leads por broker
3. **Cobrar:** Una vez demostrado el valor, ofrecer planes premium

---

## Fase 1: Intercepcion de Leads (IMPLEMENTADO)

### Que es
Cada click de WhatsApp en la plataforma pasa por `/api/lead-alquiler` que registra el contacto en la tabla `leads_alquiler` antes de redirigir al broker. El usuario no nota nada — la experiencia es transparente.

### Tabla `leads_alquiler`
```sql
- id (SERIAL PK)
- propiedad_id (FK → propiedades_v2)
- nombre_propiedad (TEXT)
- zona (TEXT)
- precio_bob (NUMERIC)
- dormitorios (INTEGER)
- broker_telefono (TEXT NOT NULL)
- broker_nombre (TEXT)
- fuente (TEXT) — 'card_desktop', 'card_mobile', 'bottom_sheet', 'comparativo'
- preguntas_enviadas (TEXT[]) — preguntas seleccionadas del comparativo
- created_at (TIMESTAMPTZ)
```

### Fuentes de leads rastreadas
| Fuente | Ubicacion | Descripcion |
|--------|-----------|-------------|
| `card_desktop` | Card de propiedad (desktop sidebar) | Boton WhatsApp en card desktop |
| `card_mobile` | Card de propiedad (mobile feed) | Boton "Consultar por WhatsApp" en feed |
| `bottom_sheet` | Modal de detalles | Link WhatsApp en seccion contacto |
| `comparativo` | CompareSheet (comparacion de favoritos) | CTA WhatsApp con preguntas seleccionadas |

### Metricas que se pueden generar
- Leads totales por broker por mes
- Leads por propiedad (demanda relativa)
- Leads por zona y rango de precio
- Tasa de uso del comparativo vs contacto directo
- Preguntas mas frecuentes de los usuarios

### Archivos
- `sql/migrations/154_leads_alquiler.sql`
- `simon-mvp/src/pages/api/lead-alquiler.ts`
- Links actualizados en `alquileres.tsx` y `CompareSheet.tsx`

---

## Fase 2: Propiedades Destacadas (PLANIFICADO)

### Concepto
El broker paga para que su propiedad aparezca primero en el feed, con un badge visual "Destacado" dorado.

### Modelo
- **Precio:** $5-15 USD/propiedad/mes (adaptar al mercado boliviano, ~Bs 35-100)
- **Beneficio:** Aparece en las primeras 3-5 posiciones del feed, badge dorado, prioridad en filtros
- **Limite:** Maximo 3-5 destacados para no saturar

### Implementacion tecnica
- Columna `destacado_hasta DATE` en propiedades_v2
- Modificar `buscar_unidades_alquiler()` para ordenar destacados primero
- Badge visual "Destacado" en la card
- Panel admin para gestionar destacados

### Requisitos previos
- Fase 1 operando 2-3 meses con datos de leads
- Al menos 20+ brokers recibiendo leads regularmente

---

## Fase 3: Reportes Mensuales para Brokers (PLANIFICADO)

### Concepto
Enviar a cada broker un reporte mensual automatico via WhatsApp/email:
- "Tu propiedad en Edificio X recibio 12 consultas este mes"
- "Tu zona (Equipetrol Centro) tuvo 45 consultas totales"
- "Tip: propiedades amobladas reciben 2.3x mas consultas"

### Valor
- Demuestra el volumen de demanda que Simon genera
- Crea dependencia — el broker quiere seguir apareciendo
- Prepara el terreno para cobrar

### Implementacion
- Cron mensual que agrupa leads por broker_telefono
- Template de mensaje WhatsApp con metricas
- Tabla `reportes_broker_alquiler` para tracking de envios

---

## Fase 4: Suscripcion Broker Premium (PLANIFICADO)

### Concepto
Plan mensual para brokers que quieren maximizar su presencia.

### Tiers propuestos

| Tier | Precio/mes | Beneficios |
|------|------------|------------|
| **Gratis** | $0 | Aparece en feed, leads rastreados |
| **Visible** | Bs 50 (~$7) | 1 propiedad destacada, reporte semanal, badge verificado |
| **Pro** | Bs 150 (~$22) | 3 propiedades destacadas, reporte semanal, fotos priority, analytics dashboard |
| **Premium** | Bs 350 (~$50) | Todas las propiedades destacadas, reporte diario, contacto directo sin WhatsApp, landing propia |

### Metricas para pricing
- Costo de adquisicion de un lead para el broker (sin Simon): ~Bs 15-30 en Facebook/Instagram
- Si Simon genera 10 leads/mes a un broker, el valor es Bs 150-300
- Precio debe ser <50% del valor generado para ser atractivo

---

## Fase 5: Marketplace de Servicios (FUTURO)

### Ideas adicionales a largo plazo
1. **Verificacion de propiedad** ($5/verificacion) — Simon visita y certifica que la propiedad es real
2. **Tour virtual** ($15/propiedad) — Fotos 360 o video profesional
3. **Contratos digitales** (% transaccion) — Facilitar firma de contrato de alquiler
4. **Seguro de deposito** (% deposito) — Garantizar devolucion de deposito al inquilino
5. **Score de inquilino** (futuro) — Verificacion crediticia basica

---

## Metricas de Exito por Fase

| Fase | Metrica clave | Objetivo |
|------|---------------|----------|
| 1 - Leads | Leads registrados/mes | >50/mes en 3 meses |
| 2 - Destacados | Brokers pagando | >5 brokers activos |
| 3 - Reportes | Tasa de apertura | >60% de brokers leen el reporte |
| 4 - Suscripcion | MRR (Monthly Recurring Revenue) | >Bs 1,000/mes |
| 5 - Servicios | Revenue diversificado | >30% revenue de servicios |

---

## Timeline Estimado

```
Feb 2026     ████████  Fase 1: Intercepcion de leads (HECHO)
Mar-Abr 2026 ████████  Acumular datos, analizar patrones
May 2026     ████████  Fase 2: Propiedades destacadas
Jun 2026     ████████  Fase 3: Reportes mensuales
Jul-Ago 2026 ████████  Fase 4: Suscripcion broker
2026 H2      ████████  Fase 5: Servicios adicionales
```

---

## Principios

1. **Demostrar antes de cobrar.** Nunca pedir dinero sin haber entregado valor medible.
2. **El broker es el cliente, no el enemigo.** Simon ayuda al broker a vender/alquilar mas rapido.
3. **Data > Opinion.** Todas las decisiones de pricing se basan en datos reales de leads.
4. **Simple > Complejo.** Empezar con el modelo mas simple (lead tracking) y complejizar solo cuando los datos lo justifiquen.
5. **No romper la experiencia del usuario.** La monetizacion nunca debe degradar la UX del inquilino buscando alquiler.
