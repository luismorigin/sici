# Documentos para integrar al repo

**Fecha:** 6 Enero 2026 (actualizado 7 Enero 2026)  
**Origen:** Sesión Claude.ai (arquitectura conceptual + metodología Simón)  
**Para:** Claude Code

---

## Archivos en esta carpeta (8 total)

### Arquitectura y Planning

| Archivo | Descripción | Ubicación sugerida |
|---------|-------------|-------------------|
| `SICI_ARQUITECTURA_MAESTRA.md` | Visión completa v2.2 | `docs/arquitectura/` |
| `SICI_MVP_SPEC.md` | Especificación 30 días | `docs/planning/` |

### Simón - Arquitectura Cognitiva

| Archivo | Descripción | Ubicación sugerida |
|---------|-------------|-------------------|
| `SIMON_ARQUITECTURA_COGNITIVA.md` | Guardrails, state machine, capas de prompt | `docs/simon/` |

### Simón - Formularios Fiduciarios (Bloque 2)

| Archivo | Descripción | Ubicación sugerida |
|---------|-------------|-------------------|
| `BLOQUE_2_FORM_VIVIENDA.md` | Formulario para comprador de vivienda propia | `docs/simon/formularios/` |
| `BLOQUE_2_FORM_INVERSOR_RENTA.md` | Formulario para inversor que busca renta | `docs/simon/formularios/` |
| `BLOQUE_2_FORM_INVERSOR_PLUSVALIA.md` | Formulario para inversor que busca apreciación | `docs/simon/formularios/` |
| `BLOQUE_2_FORM_TRANSICION.md` | Formulario para comprador en transición | `docs/simon/formularios/` |

---

## Descripción de cada documento

### SICI_ARQUITECTURA_MAESTRA.md (v2.2)

**Qué es:** Documento fuente de verdad del sistema SICI/Simón.

**Novedades v2.2:**
- Sección A-BIS: Actores del Sistema (RES definido como verificador fiduciario)
- Paso 5 conectado con `buscar_unidades_reales()` del Knowledge Graph
- Sección I: Infraestructura de Datos (estructura datos_json, 16 amenities)
- Audiencia incluye Claude Code

**Para quién:** Fundador, inversores, equipo técnico, Claude Code

---

### SICI_MVP_SPEC.md

**Qué es:** Contrato de lo que se construye en 30 días. Si no está aquí, no se hace.

**Contenido:**
- Flujo único: Landing → Formulario → Resultados → Lead
- 4 pantallas
- Stack: React/Webflow + n8n + Supabase + Claude API
- Criterios de éxito: 10 usuarios, NPS >40

**Relación con Knowledge Graph:**
- Usa `buscar_unidades_reales()` ✓ (ya implementado)
- Usa `v_amenities_proyecto` ✓ (ya implementado)
- Necesita tabla `leads_mvp` (por crear)

---

### SIMON_ARQUITECTURA_COGNITIVA.md

**Qué es:** Cómo funciona la mente de Simón.

**Contenido:**
- 7 Guardrails (G1-G7): Comportamiento fiduciario, innegociables, fatiga
- Arquitectura de 3 capas de prompt (sistema, sesión, turno)
- State machine con 6 estados
- Clasificación de inputs (5 tipos)
- Manejo de errores (E1-E5)
- Implementación técnica

---

### Formularios Fiduciarios (4 archivos)

**Qué son:** Captura estructurada del perfil del usuario según su objetivo.

| Formulario | Usuario | Foco principal | Riesgo clave |
|------------|---------|----------------|--------------|
| VIVIENDA | Comprador para vivir | Vida diaria, familia | Comprar por cansancio |
| INVERSOR_RENTA | Inversor para alquilar | ROI, cashflow mensual | Expectativas irrealistas |
| INVERSOR_PLUSVALIA | Inversor para revender | Timing, zona emergente | Iliquidez |
| TRANSICION | Comprador temporal | Liquidez, flexibilidad | Quedar atrapado |

**Estructura común (9 secciones A-I):**
- Secciones A-F: Datos estructurados
- Secciones G-H: Trade-offs y riesgos
- Sección I: Validación final

**Output de cada formulario:**
```json
{
  "tipo_formulario": "vivienda|renta|plusvalia|transicion",
  "perfil_fiduciario": { ... },
  "guia_fiduciaria": { ... },
  "alertas": [ ... ],
  "mbf_ready": { ... }  // Filtros para Paso 8
}
```

---

## Instrucciones para Code

1. **Mover archivos** a ubicación sugerida (crear carpetas si no existen)
2. **Actualizar CLAUDE.md** para referenciar estos docs
3. **Crear tabla `leads_mvp`** (SQL en MVP_SPEC sección 4.2)
4. **Para implementar Simón:**
   - Leer SIMON_ARQUITECTURA_COGNITIVA.md primero
   - Los formularios definen la lógica de captura del Bloque 2
   - El output `mbf_ready` alimenta el Paso 8 (búsqueda)

---

## Relación entre documentos

```
SICI_ARQUITECTURA_MAESTRA.md
    └── Define el sistema completo (12 pasos)
    
SICI_MVP_SPEC.md
    └── Define qué se construye en 30 días
    
SIMON_ARQUITECTURA_COGNITIVA.md
    └── Define cómo piensa Simón (guardrails + states)
    
BLOQUE_2_FORM_*.md (4 archivos)
    └── Definen captura estructurada por perfil
    └── Generan perfil_fiduciario + guia_fiduciaria
    └── Alimentan Paso 8 vía mbf_ready
```

---

## Contexto de las sesiones

**Sesión 1 (6 Enero 2026):**
- Actualizó ARQUITECTURA_MAESTRA de v2.0 a v2.2
- Creó MVP_SPEC desde cero
- Aprobó Knowledge Graph plan (migración 019)

**Sesión 2 (7 Enero 2026):**
- Agregó SIMON_ARQUITECTURA_COGNITIVA.md
- Agregó 4 formularios fiduciarios (BLOQUE_2_FORM_*.md)
- Regeneró todos con encoding UTF-8 correcto

---

*Última actualización: 7 Enero 2026*
