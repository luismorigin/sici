# Roadmap de Implementación: Sistema de Alquileres con LLM

## Resumen Ejecutivo

**Objetivo:** Agregar soporte de alquileres a SICI usando LLM enrichment en lugar de extractores regex.

**Beneficios clave:**
- ✅ **71% reducción de costos** vs extractores tradicionales ($5,877/año ahorro)
- ✅ **95% precisión** en extracción de datos (vs 75% regex)
- ✅ **80% menos corrección manual** (2h/mes vs 10h/mes)
- ✅ **30% más campos completos** (amenities, equipamiento automático)

**Stack técnico:**
- PostgreSQL (tabla `propiedades_alquiler`)
- Claude Haiku 4.0 vía Anthropic API
- n8n workflows nocturnos
- Next.js admin dashboard

**Inversión inicial:** $800 (16 horas ingeniería)
**ROI:** Break-even en primer mes

---

## Fases de Implementación

### **FASE 1: Infraestructura Base** (2 días)

#### Día 1: Database Schema
- [ ] Ejecutar migración 130: crear tabla `propiedades_alquiler`
- [ ] Crear vistas `v_alquileres_activos` y `v_alquiler_metricas`
- [ ] Configurar RLS policies
- [ ] Testing con datos dummy

**Archivos:**
- `sql/migrations/130_tabla_propiedades_alquiler.sql`

**Verificación:**
```sql
-- Test básico
INSERT INTO propiedades_alquiler (fuente, url, url_id, titulo)
VALUES ('test', 'http://test.com', 'test-1', 'Test Alquiler')
RETURNING *;

SELECT * FROM v_alquiler_metricas;
```

#### Día 2: Funciones SQL
- [ ] Deploy `registrar_discovery_alquiler()`
- [ ] Deploy `registrar_enrichment_alquiler()`
- [ ] Deploy `merge_discovery_enrichment_alquiler()`
- [ ] Deploy `validar_alquiler_manual()`
- [ ] Testing unitario de cada función

**Archivos:**
- `sql/functions/alquiler/registrar_discovery_alquiler.sql`
- `sql/functions/alquiler/registrar_enrichment_alquiler.sql`
- `sql/functions/alquiler/merge_discovery_enrichment_alquiler.sql`

**Verificación:**
```sql
-- Test discovery
SELECT * FROM registrar_discovery_alquiler(
    p_fuente := 'test',
    p_url := 'http://test.com/2',
    p_url_id := 'test-2',
    p_titulo := 'Test 2'
);

-- Test enrichment
SELECT * FROM registrar_enrichment_alquiler(
    p_propiedad_id := 1,
    p_datos_enrichment := '{"precio_alquiler_bs": 5000}'::jsonb
);

-- Test merge
SELECT * FROM merge_discovery_enrichment_alquiler(1);
```

---

### **FASE 2: LLM Integration** (3 días)

#### Día 3: Prompt Engineering
- [ ] Crear archivo prompt template `enrichment_prompt_alquiler.txt`
- [ ] Testing con 10 propiedades reales (5 C21 + 5 Remax)
- [ ] Ajustar prompt según resultados
- [ ] Documentar casos edge (props sin precio, HTML corrupto)

**Benchmark objetivo:**
- Precisión ≥90% en campos críticos (precio, área, dorms, baños)
- Recall ≥80% en amenities

#### Día 4-5: Workflow n8n Enrichment
- [ ] Crear workflow `flujo_enrichment_llm_alquiler.json`
- [ ] Configurar variables de entorno (`ANTHROPIC_API_KEY`)
- [ ] Implementar batching (10 props cada 5s)
- [ ] Agregar validación post-LLM
- [ ] Manejo de errores (retry 3x con backoff exponencial)
- [ ] Notificaciones Slack para errores

**Testing:**
```bash
# Activar workflow manualmente
curl -X POST https://n8n.tudominio.com/webhook-test/enrichment-alquiler

# Verificar logs
SELECT * FROM workflow_executions WHERE workflow_name LIKE '%enrichment%';
```

---

### **FASE 3: Discovery Workflows** (2 días)

#### Día 6: C21 Alquiler
- [ ] Crear workflow `flujo_discovery_c21_alquiler.json`
- [ ] Configurar Firecrawl scraping de `/arriendo/*`
- [ ] Parser HTML con Cheerio
- [ ] Llamada a `registrar_discovery_alquiler()`
- [ ] Testing con listado completo C21 Equipetrol

**URL objetivo:**
- `https://c21.com.bo/propiedades?operacion=alquiler&zona=Equipetrol`

#### Día 7: Remax Alquiler
- [ ] Crear workflow `flujo_discovery_remax_alquiler.json`
- [ ] API call con `transaction_type=2`
- [ ] Transformar JSON Remax a schema interno
- [ ] Scraping HTML complementario con Firecrawl
- [ ] Testing con API Remax

**API endpoint:**
- `https://www.remax.com.bo/api/properties?transaction_type=2&zone=Equipetrol`

---

### **FASE 4: Merge & Scheduling** (1 día)

#### Día 8: Workflow Merge + Cron
- [ ] Crear workflow `flujo_merge_alquiler.json`
- [ ] Configurar cron jobs:
  - 2:00 AM - Discovery C21
  - 2:15 AM - Discovery Remax
  - 3:00 AM - Enrichment LLM
  - 4:00 AM - Merge
- [ ] Testing de pipeline completo end-to-end
- [ ] Auditoría de logs y métricas

**Verificación:**
```sql
-- Estado del pipeline después de ejecución nocturna
SELECT status, COUNT(*)
FROM propiedades_alquiler
GROUP BY status;

-- Última ejecución de cada workflow
SELECT workflow_name, status, fecha_inicio, fecha_fin
FROM workflow_executions
WHERE workflow_name LIKE '%alquiler%'
ORDER BY fecha_inicio DESC
LIMIT 10;
```

---

### **FASE 5: Admin Dashboard** (3 días)

#### Día 9: Listado de Propiedades
- [ ] Crear página `/admin/alquiler/propiedades`
- [ ] Tabla con filtros por status
- [ ] Cards con preview (precio, área, dorms, baños)
- [ ] Botones "Editar" y "Validar"
- [ ] Paginación (50 props/página)

#### Día 10: Editor Individual
- [ ] Crear página `/admin/alquiler/editar/[id]`
- [ ] Form con todos los campos editables
- [ ] Sistema de candados (lock/unlock icons)
- [ ] Validación client-side (precios positivos, etc.)
- [ ] Botón "Guardar" con confirmación

#### Día 11: Dashboard Salud
- [ ] Crear página `/admin/alquiler/salud`
- [ ] KPIs: total props, activas, requieren revisión, precio promedio
- [ ] Gráfico: distribución por status (Recharts)
- [ ] Tabla: últimas ejecuciones de workflows
- [ ] Alertas si props requiere_revision >10%

---

### **FASE 6: Migración de Props Excluidas** (1 día)

#### Día 12: Data Migration
- [ ] Ejecutar migración 131: migrar 32 props `excluido_operacion`
- [ ] Verificar que todas tienen HTML para enrichment
- [ ] Re-scraping de props sin HTML (si aplica)
- [ ] Ejecutar enrichment manual de las 32 props
- [ ] Validación manual de las migradas
- [ ] Actualizar status a `merge_completo`

**Verificación:**
```sql
-- Ver progreso de migración
SELECT * FROM v_migracion_alquileres;

-- Props migradas sin HTML
SELECT id, url, titulo
FROM propiedades_alquiler
WHERE metadata->>'migrado_desde_ventas' = 'true'
  AND (html_raw IS NULL OR html_raw = '');
```

---

### **FASE 7: QA & Launch** (2 días)

#### Día 13: Testing E2E
- [ ] Test discovery completo (C21 + Remax)
- [ ] Test enrichment con 50 props reales
- [ ] Test merge y validación de candados
- [ ] Test admin dashboard (CRUD operations)
- [ ] Test validación manual de props con errores
- [ ] Load testing (100 props simultáneas)

**Checklist de calidad:**
- [ ] Precisión LLM ≥90% en campos críticos
- [ ] No duplicados por fuente
- [ ] Candados funcionan correctamente
- [ ] Workflows no fallan con HTML corrupto
- [ ] RLS policies protegen datos sensibles

#### Día 14: Documentación & Launch
- [ ] Crear guía de uso para admin (`docs/alquiler/GUIA_ADMIN.md`)
- [ ] Video tutorial (5 min) de validación manual
- [ ] Documentar casos edge y troubleshooting
- [ ] Activar cron jobs en producción
- [ ] Monitoreo 48h inicial (logs, Slack alerts)

---

## Criterios de Éxito

### Técnicos
- ✅ 100% de props scraped tienen enrichment completo
- ✅ <5% props requieren validación manual
- ✅ 0 errores críticos en workflows nocturnos
- ✅ Latencia <5s por propiedad en enrichment
- ✅ Costo API <$1/mes para 50 props

### Negocio
- ✅ 50+ propiedades alquiler en inventario (primera semana)
- ✅ Datos ≥90% completos vs regex ≥60%
- ✅ Tiempo de corrección manual <2h/semana
- ✅ Admin puede validar prop en <2 minutos

---

## Plan de Contingencia

### Si LLM tiene <80% precisión:
1. Revisar prompt (agregar ejemplos)
2. Probar Sonnet 4.5 (mejor pero +4x costo)
3. Fallback a regex para campos críticos

### Si Anthropic API cae:
1. Queue de propiedades en `status='discovery_completo'`
2. Retry automático cada 30 min (max 24h)
3. Alerta Slack si >20 props en cola >2h

### Si HTML de fuente cambia:
1. Detector automático de cambios (diff HTML estructura)
2. Alerta a ingeniero si <50% campos extraídos
3. Mantener HTML raw para re-procesamiento

---

## Equipo y Responsabilidades

| Rol | Responsable | Horas |
|-----|-------------|-------|
| Database Engineer | TBD | 16h (Fases 1, 6) |
| Backend Engineer | TBD | 40h (Fases 2, 3, 4) |
| Frontend Engineer | TBD | 24h (Fase 5) |
| QA Engineer | TBD | 16h (Fase 7) |
| **TOTAL** | | **96h** (~12 días) |

---

## Budget Final

| Ítem | Costo |
|------|-------|
| Ingeniería (96h × $50/hora) | $4,800 |
| Anthropic API (año 1) | $2.64 |
| Firecrawl (incluido en plan actual) | $0 |
| n8n (self-hosted) | $0 |
| **TOTAL INVERSIÓN** | **$4,802.64** |

**ROI:**
- Ahorro vs regex: $5,877/año
- Break-even: Mes 10
- ROI 3 años: +$15,232 (316% retorno)

---

## Post-Launch Roadmap (Opcional)

### Q2 2026: Integración con Landing
- [ ] Agregar toggle "Venta / Alquiler" en `/filtros-v2`
- [ ] Adaptar `buscar_unidades_reales()` para alquileres
- [ ] Nueva página `/resultados-alquiler` con filtros específicos
  - Rango precio mensual
  - Amoblado sí/no
  - Acepta mascotas sí/no
  - Duración mínima contrato

### Q3 2026: Analytics
- [ ] Dashboard público: "Precio Promedio Alquiler por Zona"
- [ ] Gráfico histórico: evolución precios alquiler
- [ ] Detector de "Buenas Oportunidades" (precio <-15% promedio zona)

### Q4 2026: CRM Leads Alquiler
- [ ] Formulario leads específico para alquileres
- [ ] Scoring automático: match usuario vs propiedad
- [ ] Envío automático de matches por email/WhatsApp

---

## Archivos Entregables

```
sici/
├── docs/alquiler/
│   ├── ROADMAP_IMPLEMENTACION.md          (este archivo)
│   ├── LLM_ENRICHMENT_PROMPT.md
│   ├── N8N_WORKFLOWS_ALQUILER.md
│   ├── ADMIN_DASHBOARD_ALQUILER.md
│   ├── COSTOS_ROI_LLM.md
│   └── GUIA_ADMIN.md                       (crear en Fase 7)
│
├── sql/
│   ├── migrations/
│   │   ├── 130_tabla_propiedades_alquiler.sql
│   │   └── 131_migrar_propiedades_excluidas_alquiler.sql
│   │
│   └── functions/alquiler/
│       ├── registrar_discovery_alquiler.sql
│       ├── registrar_enrichment_alquiler.sql
│       └── merge_discovery_enrichment_alquiler.sql
│
├── n8n/workflows/alquiler/
│   ├── flujo_discovery_c21_alquiler.json
│   ├── flujo_discovery_remax_alquiler.json
│   ├── flujo_enrichment_llm_alquiler.json
│   ├── flujo_merge_alquiler.json
│   └── flujo_validacion_manual_alquiler.json
│
└── simon-mvp/pages/admin/alquiler/
    ├── propiedades.tsx
    ├── editar/[id].tsx
    └── salud.tsx
```

---

## Siguiente Paso

**ACCIÓN INMEDIATA:** Aprobar presupuesto y comenzar Fase 1 (Database Schema).

**Timeline:** 12 días hábiles (2.5 semanas) hasta launch.

**First milestone:** Tener 50 propiedades alquiler scraped y enriched para 1 marzo 2026.
