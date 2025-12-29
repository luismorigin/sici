# n8n Workflows - SICI Modulo 2

**Sistema:** SICI - Sistema Inteligente de Captura Inmobiliaria
**Modulo:** Modulo 2 - Matching Propiedad-Proyecto
**Version:** 1.0
**Fecha:** 29 Diciembre 2025

---

## Workflows Disponibles

### 1. Matching Nocturno v1.0
**Archivo:** `matching_nocturno.json`
**Schedule:** Diario a las 4:00 AM

**Funcion:**
- Ejecuta `matching_completo_automatizado()` para generar matches
- Extrae pendientes 70-84% confidence para revision humana
- Llena Google Sheet con pendientes
- Envia notificacion Slack

**Google Sheet:** [Matching Bandeja](https://docs.google.com/spreadsheets/d/1Ra3-MWhSiaI6ixRg-YX2KlB3rZE_LHzttPdPhzER4Xw/edit)

---

### 2. Matching Supervisor v1.0
**Archivo:** `matching_supervisor.json`
**Schedule:** Diario a las 8:00 PM

**Funcion:**
- Lee decisiones del supervisor desde Google Sheet
- Aplica matches aprobados (SYNC) y rechazados (BLOQUEAR)
- Limpia registros procesados del Sheet
- Envia resumen a Slack

**Dependencia:** Requiere que Matching Nocturno haya ejecutado primero

**Funcionalidad Proyecto Alternativo:**
- Detecta cuando humano rechaza con PROYECTO_ALTERNATIVO
- Crea proyecto nuevo en proyectos_master (fuente='humano_propuesto')
- Crea nueva sugerencia con 95% confianza para revisión

---

### 3. Radar Mensual v1.0
**Archivo:** `SICI - Radar Mensual v1.0.json`
**Schedule:** Dia 1 de cada mes a las 3:00 AM

**Funcion:**
- Escanea zonas de barrido via Google Places API
- Detecta edificios nuevos (apartment_complex, condominium_complex, etc.)
- Filtra duplicados por google_place_id y proximidad GPS (<50m)
- Inserta descubrimientos en `proyectos_pendientes_google`
- Llena Google Sheet para revision humana
- Actualiza estadisticas de zonas

**Google Sheet:** [Radar Bandeja](https://docs.google.com/spreadsheets/d/1suj5WymvgyjO6hDfbKXSGwF9jopH2uBCxcIDhiSDbsE/edit)

---

## Importacion a n8n

1. Abrir n8n: http://localhost:5678
2. Click en "..." > "Import from file"
3. Seleccionar el archivo JSON
4. Verificar que las credenciales esten vinculadas:
   - Postgres: `zd5IroT7BxnpW5U6`
   - Google Sheets: `DbMNipx0RBpm2Hhu`
   - Google Places API: `Mhl3Ef3vxc89rpQi` (solo Radar)
5. Probar con "Manual Trigger" antes de activar Schedule

---

## Credenciales Requeridas

| Credencial | ID n8n | Uso |
|------------|--------|-----|
| Postgres (Supabase) | `zd5IroT7BxnpW5U6` | Todos los workflows |
| Google Sheets | `DbMNipx0RBpm2Hhu` | Matching y Radar |
| Google Places API | `Mhl3Ef3vxc89rpQi` | Solo Radar |

---

## Arquitectura Human-in-the-Loop

```
┌─────────────────────┐     ┌──────────────┐     ┌────────────────────┐
│  Workflow Nocturno  │────>│ Google Sheet │────>│ Workflow Supervisor│
│  (4:00 AM)          │     │ (Pendientes) │     │ (8:00 PM)          │
└─────────────────────┘     └──────────────┘     └────────────────────┘
         │                         │                       │
         │                         │                       │
         v                         v                       v
   Genera matches           Humano revisa           Aplica decisiones
   Llena Sheet              SYNC/BLOQUEAR          Limpia Sheet
   Notifica Slack           durante el dia         Notifica Slack
```

---

## Documentacion Relacionada

- **Plan Matching:** `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md`
- **Spec Nocturno:** `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md`
- **Funciones RPC:** `sql/functions/matching/funciones_rpc_matching.sql`
- **Config Local:** `config.local.json` (credenciales y IDs)

---

**Ultima actualizacion:** 29 Diciembre 2025
