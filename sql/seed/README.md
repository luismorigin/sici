# Seed Data - Datos Iniciales

**Versión:** 1.3.0 🔒  
**Archivo:** `seed_data.sql`

---

## Propósito

Datos base para testing y configuración inicial del Módulo 1.

---

## Contenido

### config_global

| Clave | Valor | Tipo |
|-------|-------|------|
| `tipo_cambio_oficial` | 6.96 | numeric |
| `tipo_cambio_paralelo` | 10.50 | numeric |

### Proyecto Master de Test

| Campo | Valor |
|-------|-------|
| `nombre_oficial` | TEST - Edificio Seed Data |
| `zona` | Equipetrol Norte |
| `latitud` | -17.7634500 |
| `longitud` | -63.1821200 |

### Propiedades de Test

| ID | Descripción | depende_de_tc | Moneda |
|----|-------------|---------------|--------|
| TEST-001 | USD puro | FALSE | USD |
| TEST-002 | BOB paralelo | TRUE | BOB |
| TEST-003 | USD multiproyecto | FALSE | USD |

---

## Uso

```bash
# En Supabase SQL Editor
\i seed/seed_data.sql
```

---

## Validación Post-Seed

El script verifica automáticamente:
- TC oficial = 6.96
- TC paralelo = 10.50
- 3 propiedades TEST creadas

---

## Limpieza

El seed incluye cleanup automático:
```sql
DELETE FROM propiedades_v2 WHERE codigo_propiedad IN ('TEST-001', 'TEST-002', 'TEST-003');
DELETE FROM proyectos_master WHERE nombre_oficial = 'TEST - Edificio Seed Data';
```

---

⚠️ **NO MODIFICAR** - Módulo 1 Congelado
