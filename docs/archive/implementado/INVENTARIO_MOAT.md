# INVENTARIO COMPLETO - MOAT FIDUCIARIO SICI

> Generado: 2026-01-11
> Propósito: Mapear TODO lo que existe antes de conectar el moat al frontend

---

## RESUMEN EJECUTIVO

| Categoría | Estado | Detalle |
|-----------|--------|---------|
| Funciones SQL fiduciarias | 70% | 5 migraciones clave operativas |
| Documentación metodológica | 100% | 2 partes + arquitectura + formularios |
| Código TypeScript | 50% | APIs existen, no usan SQL |
| Features documentados sin código | 30% | CrediCheck, sesiones, modos |
| Contradicciones críticas | 6 | Ver sección 5 |

---

## 1. FUNCIONES SQL FIDUCIARIAS

### 1.1 Migración 025 - Razón Fiduciaria Contextual

**Archivo:** `sql/migrations/025_generar_razon_fiduciaria.sql`

| Función | Parámetros | Output | Estado |
|---------|-----------|--------|--------|
| `generar_razon_fiduciaria(p_propiedad_id)` | INTEGER | JSONB con 8 tipos de razones | **EXISTE** |
| `razon_fiduciaria_texto(p_propiedad_id)` | INTEGER | TEXT - razón principal | **EXISTE** |

**8 Tipos de Razones Generadas:**
1. `escasez` - "1 de solo 7 deptos 2D bajo $120k"
2. `precio_bajo` - "15% bajo promedio zona"
3. `precio_m2_bajo` - "$/m² X% bajo promedio"
4. `mejor_precio_proyecto` - "El más económico de 12 unidades"
5. `top_precio_proyecto` - "Top 3 en precio"
6. `unico` - "Único 2D disponible en zona"
7. `escasez_tipologia` - "Solo 5 opciones 2D en zona"
8. `desarrollador` - "Desarrollador reconocido: X"

---

### 1.2 Migración 026 - Búsqueda Unidades Reales v2

**Archivo:** `sql/migrations/026_buscar_unidades_reales_v2.sql`

| Función | Parámetros | Output |
|---------|-----------|--------|
| `buscar_unidades_reales(p_filtros JSONB)` | dormitorios, precio_max, zona, solo_con_fotos, limite | TABLE 18 columnas incluyendo `razon_fiduciaria` |

**Filtros Hard Aplicados:**
- `es_activa = true`
- `proyecto.activo = true`
- `status = 'completado'`
- `tipo_operacion = 'venta'`
- Excluye: baulera, parqueo, garaje, deposito
- `area_total_m2 >= 20`

---

### 1.3 Migración 028 - Posición de Mercado

**Archivo:** `sql/migrations/028_calcular_posicion_mercado.sql`

| Función | Output |
|---------|--------|
| `calcular_posicion_mercado(p_precio, p_zona, p_dorms)` | JSONB: diferencia_pct, posicion_texto, categoria |
| `posicion_mercado_texto(...)` | TEXT solo |

**Categorías:**
- `oportunidad` (≤-20%)
- `bajo_promedio` (-20% a -10%)
- `promedio` (-10% a +10%)
- `sobre_promedio` (+10% a +20%)
- `premium` (>+20%)

---

### 1.4 Migración 030 - Análisis Mercado Fiduciario

**Archivo:** `sql/migrations/030_analisis_mercado_fiduciario.sql`

| Función | Propósito |
|---------|-----------|
| `detectar_razon_exclusion_v2(p_id, p_filtros)` | 12 razones de exclusión (hard/medium/soft) |
| `explicar_precio(p_id)` | Por qué ese precio |
| `analisis_mercado_fiduciario(p_filtros)` | **4 BLOQUES** completos |

**12 Razones de Exclusión:**

| Severidad | Razón | Descripción |
|-----------|-------|-------------|
| HARD | `es_activa` | Propiedad inactiva |
| HARD | `status` | No completado |
| HARD | `tipo_operacion` | No es venta |
| HARD | `area_minima` | <20m² |
| HARD | `tipo_propiedad` | Baulera/parqueo |
| HARD | `proyecto_activo` | Proyecto inactivo |
| HARD | `dormitorios_cero` | 0 dorms + área chica |
| MEDIUM | `es_multiproyecto` | Listing genérico |
| MEDIUM | `proyecto_asignado` | Sin proyecto |
| SOFT | `precio_max` | Excede presupuesto |
| SOFT | `dormitorios` | No coincide |
| SOFT | `fotos` | Sin fotos |
| ALERT | `precio_m2_sospechoso` | <$800/m² |

**4 Bloques de `analisis_mercado_fiduciario()`:**

```
BLOQUE 1: OPCIONES VÁLIDAS (máx 3)
├─ id, proyecto, zona, dormitorios, precio_usd
├─ ranking, total_opciones
├─ posicion_mercado
├─ explicacion_precio
├─ razon_fiduciaria
└─ amenities, fotos, asesor_wsp

BLOQUE 2: EXCLUIDAS (más baratas)
├─ analisis_exclusion
└─ evaluacion_coherencia

BLOQUE 3: CONTEXTO MERCADO
├─ stock_total, stock_cumple, stock_excluido
├─ metricas_zona
└─ diagnostico (LIMITADO/MODERADO/AMPLIO)

BLOQUE 4: ALERTAS GLOBALES
├─ precio_sospechoso
├─ escasez_relativa
└─ estado_emocional_global
```

---

### 1.5 Migración 031 - Ficha Coherencia Fiduciaria

**Archivo:** `sql/migrations/031_ficha_coherencia_fiduciaria.sql`

| Función | Propósito |
|---------|-----------|
| `evaluar_coherencia_innegociables(p_amenities, p_innegociables, p_mascota)` | Evalúa cumple/viola/sin_datos |
| `detectar_senales_alerta(p_contexto, p_precio, p_precio_max, p_coherencia)` | 6 tipos de alertas |
| `generar_resumen_fiduciario(...)` | Frase 1 línea para tarjeta |

**Innegociables Soportados:**
- `seguridad` → busca "seguridad 24/7"
- `ascensor` → busca "ascensor"
- `balcon` → busca "terraza/balcón"
- `pet_friendly` → valida si tiene mascota
- `estacionamiento` → marca sin_datos
- Otros → marca sin_datos

**6 Señales de Alerta:**

| Tipo | Condición | Severidad |
|------|-----------|-----------|
| `estado_emocional` | cansado/frustrado/presionado | Alta/Media |
| `fatiga_busqueda` | ≥9 meses buscando | Media |
| `presion_externa` | presión = "bastante" | Alta |
| `viola_innegociables` | total_viola > 0 | Alta |
| `precio_al_limite` | precio ≥ 95% presupuesto | Baja |
| `riesgo_expensas` | sensible_expensas = true | Media |

**Lógica Resumen Fiduciario (prioridad):**
1. Violaciones innegociables → "Viola X; precio bajo no compensa"
2. Alertas emocionales → "Señales de decisión emocional"
3. Precio notable → "X% bajo/sobre promedio"
4. Default → "Cumple X innegociables; ..."

---

## 2. DOCUMENTOS METODOLOGÍA FIDUCIARIA

### 2.1 METODOLOGIA_FIDUCIARIA_PARTE_1.md

**Ubicación:** `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_1.md`
**Líneas:** ~813

| Bloque | Contenido |
|--------|-----------|
| 1-2 | Fundamentos éticos + Visión fiduciaria |
| 3 | **Ficha de Coherencia** (5 secciones) |
| 4 | Validación con perfiles sintéticos |
| 5 | Integración SICI (SICI omnisciente, Simón miope) |
| 6-7 | Ejecución + Estados decisión |

**7 Guardrails Estructurales:**

```
G1: Innegociable es Innegociable (sin excepciones)
G2: No relajar filtros duros automáticamente
G3: Fatiga bloquea decisión (>45min, >15 vistas, frases gatillo)
G4: Indeterminado ≠ Cumple
G5: Máximo 3 opciones en modo cierre
G6: No vender futuro ("va a subir", "zona en crecimiento")
G7: Registrar advertencias ignoradas
```

**6 Ejes del Perfil Fiduciario:**
1. Horizonte de uso
2. Rol de propiedad
3. Tolerancia al error
4. Capacidad absorción fricción
5. Estado emocional dominante
6. Riesgo fiduciario principal

---

### 2.2 METODOLOGIA_FIDUCIARIA_PARTE_2.md

**Ubicación:** `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_2.md`
**Líneas:** ~816

| Paso | Contenido |
|------|-----------|
| 8 | Traducción Guía → MBF (Mapa Búsqueda Fiduciaria) |
| 9 | Presentación fiduciaria (5 bloques) |
| 10 | Acompañamiento (4 niveles) |
| 11 | Aprendizaje fiduciario |
| 12 | Cierre asistido |

**Estructura MBF:**

```json
{
  "filtros_duros": {
    "precio_max_usd": 150000,
    "zona": ["Equipetrol"],
    "nivel_ruido": "bajo"
  },
  "filtros_blandos": {
    "amenities": ["pet_friendly", "balcon"]
  },
  "ordenamiento": ["coherencia_fiduciaria", "score_calidad_dato", "precio"],
  "umbrales": {
    "coherencia_min": 0.8,
    "cantidad_max": 5
  },
  "modo_busqueda": "exploración | cierre | validación"
}
```

**Fórmula Coherencia:**
```
Si viola 1 filtro duro → coherencia = 0 → NO EXISTE
Si cumple duros:
  coherencia = 0.8 + (blandos_cumplidos / blandos_total) * 0.2
```

---

### 2.3 SIMON_ARQUITECTURA_COGNITIVA.md

**Ubicación:** `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md`

**Contenido:**
- 7 Guardrails (G1-G7)
- 3 Capas de Prompt (System → Context → Task)
- State Machine
- Separación Intención vs Decisión
- Manejo de errores

---

### 2.4 Formularios Bloque 2 (4 variantes)

| Archivo | Perfil |
|---------|--------|
| `BLOQUE_2_FORM_VIVIENDA.md` | Vivienda propia |
| `BLOQUE_2_FORM_INVERSOR_RENTA.md` | Inversión renta |
| `BLOQUE_2_FORM_INVERSOR_PLUSVALIA.md` | Inversión plusvalía |
| `BLOQUE_2_FORM_TRANSICION.md` | Transición vital |

Cada uno: 9 secciones (A-I) → Output: Perfil + Guía Fiduciaria

---

### 2.5 Fichas de Coherencia - Ejemplos

**Archivo:** `docs/simon/fichas/FICHA_COHERENCIA_EJEMPLO_1.md`

**Estructura (5 secciones):**
1. Encaje con Guía
2. Trade-offs Reales
3. Riesgos Ocultos
4. Señales de Alerta
5. Recomendación: APTO / NO APTO / PAUSA

**Ejemplo:** Casa 3D, 35 min al colegio → **FRENAR** (viola innegociable principal)

---

## 3. CÓDIGO TypeScript FIDUCIARIO

### 3.1 API /api/razon-fiduciaria.ts

**Ubicación:** `simon-mvp/src/pages/api/razon-fiduciaria.ts`

**Qué hace:** Llama Claude API para generar razones personalizadas

**Interfaces:**
```typescript
interface PropiedadInput {
  id: number
  proyecto: string
  razon_sql?: string  // De migración 025
  diff_vs_promedio?: number
}

interface PerfilUsuario {
  composicion: string
  mascota: string
  meses_buscando: number
  estado_emocional: string
  innegociables: string[]
}
```

**PROBLEMA:** No usa `razon_fiduciaria_texto()` del SQL - paga tokens innecesarios

---

### 3.2 API /api/generar-guia.ts

**Ubicación:** `simon-mvp/src/pages/api/generar-guia.ts`

**Qué hace:** Llama Claude para generar guía fiduciaria desde formulario

**PROBLEMA:** Guía NO se persiste en BD

---

### 3.3 Página /resultados.tsx

**Ubicación:** `simon-mvp/src/pages/resultados.tsx`

**Qué usa:**
- `buscarUnidadesReales()` de `lib/supabase.ts`
- NO usa `analisis_mercado_fiduciario()`
- NO usa `evaluar_coherencia_innegociables()`

---

## 4. FEATURES DOCUMENTADOS SIN IMPLEMENTACIÓN

| Feature | Documentado en | Estado |
|---------|---------------|--------|
| **CrediCheck** | FUNNEL_ESPECIFICACION.md | NO existe código |
| **Enriquecimiento IA proyectos** | CLAUDE.md (FASE 3) | NO implementado |
| **Validación GPS Google** | CLAUDE.md (FASE 4) | NO implementado |
| **Perfil fiduciario automático** | METODOLOGIA_PARTE_1 | Se captura, NO se mapea |
| **Guía persistida en BD** | METODOLOGIA_PARTE_2 | API genera, NO guarda |
| **Tabla sesiones_fiduciarias** | METODOLOGIA_PARTE_2 §8.10 | NO existe en BD |
| **Modos búsqueda dinámicos** | METODOLOGIA_PARTE_2 §8.9 | Especificado, NO usado |
| **Protocolo 0 opciones** | METODOLOGIA_PARTE_2 §9.4 | NO hay lógica |
| **buscar_proyecto_fuzzy()** | Mencionado | NO existe |

---

## 5. CONTRADICCIONES DOCS vs CÓDIGO

### 5.1 Razones Fiduciarias: SQL vs Claude

| Documentado | Realidad |
|-------------|----------|
| Migración 025 genera `razon_fiduciaria_texto()` | API llama Claude, ignora SQL |
| SQL tiene data contextual real | Claude genera sin contexto BD |

**Impacto:** Tokens desperdiciados, razones menos precisas

---

### 5.2 Innegociables: Filtros Duros vs Blandos

| Documentado | Realidad |
|-------------|----------|
| METODOLOGIA §8.4: Innegociables = filtros DUROS | `buscar_unidades_reales()` NO filtra por innegociables |
| Propiedad que viola NO debe aparecer | Aparece en BLOQUE 2 (excluidas) con score bajo |

**Impacto:** Operacionalmente correcto, pero no es filtro duro

---

### 5.3 Modos de Búsqueda

| Documentado | Realidad |
|-------------|----------|
| exploración: cantidad_max = 5 | No hay parámetro `modo_busqueda` |
| cierre: cantidad_max = 3 | Siempre modo exploración |
| validación: cantidad_max = 1 | |

---

### 5.4 Protocolo 0 Opciones

| Documentado | Realidad |
|-------------|----------|
| 3 caminos: Esperar / Ajustar / Indeterminadas | No hay lógica específica |
| UI debe guiar al usuario | Frontend muestra vacío |

---

### 5.5 Persistencia Sesiones

| Documentado | Realidad |
|-------------|----------|
| Tabla `sesiones_fiduciarias` especificada | NO existe en BD |
| Guarda: guía, MBF, resultados, decisión | Nada se persiste |

---

### 5.6 Formato Innegociables

| Documentado | Realidad |
|-------------|----------|
| Array de objetos: `{valor, tipo: hard/soft}` | Array simple: `["seguridad", "ascensor"]` |

**Impacto:** Menor - array simple es más limpio

---

## 6. IMPLEMENTACIÓN GUARDRAILS

| Guardrail | Implementado en | Estado |
|-----------|-----------------|--------|
| G1: Innegociable es innegociable | `evaluar_coherencia_innegociables()` | ✅ |
| G2: No relajar filtros duros | Prompt API (no relaja) | 🟡 Frontend permite cambiar |
| G3: Fatiga bloquea decisión | `detectar_senales_alerta()` | 🟡 Registra, no bloquea UI |
| G4: Indeterminado ≠ cumple | `buscar_unidades_reales()` | ✅ |
| G5: Máximo 3 en cierre | `analisis_mercado_fiduciario()` | 🟡 Sin modo dinámico |
| G6: No vender futuro | Prompt system | ✅ |
| G7: Registrar advertencias | `registrar_interes_propiedad()` | 🟡 Existe, no se usa |

---

## 7. FUNCIONES SQL QUE FALTAN

| Función Esperada | Estado |
|------------------|--------|
| `perfil_fiduciario_inferir()` | NO existe |
| `guia_fiduciaria_generar()` | `confirmar_y_generar_guia()` vacía |
| `protocolo_cero_opciones()` | NO existe |
| `sesion_fiduciaria_crear()` | Tabla no existe |
| `credicheck_validar()` | NO existe |
| `buscar_proyecto_fuzzy()` | NO existe |

---

## 8. MAPA DE MIGRACIONES FIDUCIARIAS

| # | Archivo | Funciones | Estado |
|---|---------|-----------|--------|
| 025 | `generar_razon_fiduciaria.sql` | generar_razon_fiduciaria(), razon_fiduciaria_texto() | ✅ Pendiente ejecutar |
| 026 | `buscar_unidades_reales_v2.sql` | buscar_unidades_reales() | ✅ Pendiente ejecutar |
| 028 | `calcular_posicion_mercado.sql` | calcular_posicion_mercado() | ✅ Pendiente ejecutar |
| 030 | `analisis_mercado_fiduciario.sql` | detectar_razon_exclusion_v2(), explicar_precio(), analisis_mercado_fiduciario() | ✅ Pendiente ejecutar |
| 031 | `ficha_coherencia_fiduciaria.sql` | evaluar_coherencia_innegociables(), detectar_senales_alerta(), generar_resumen_fiduciario() | ✅ Pendiente ejecutar |

---

## 9. PRÓXIMOS PASOS RECOMENDADOS

### Fase 1: Ejecutar Migraciones (SQL puro)
1. Ejecutar migraciones 025-031 en orden
2. Verificar que funciones existen
3. Test con datos reales

### Fase 2: Conectar Frontend
1. Reemplazar `buscarUnidadesReales()` → `analisis_mercado_fiduciario()`
2. Usar `razon_fiduciaria` del SQL (no Claude)
3. Mostrar 4 bloques en `/resultados`

### Fase 3: Completar Gaps
1. Crear tabla `sesiones_fiduciarias`
2. Implementar `modo_busqueda` dinámico
3. Agregar protocolo 0 opciones en UI

---

## 10. ARCHIVOS CLAVE PARA CONECTAR MOAT

```
SQL (ejecutar en orden):
├── sql/migrations/025_generar_razon_fiduciaria.sql
├── sql/migrations/026_buscar_unidades_reales_v2.sql
├── sql/migrations/028_calcular_posicion_mercado.sql
├── sql/migrations/030_analisis_mercado_fiduciario.sql
└── sql/migrations/031_ficha_coherencia_fiduciaria.sql

TypeScript (modificar):
├── simon-mvp/src/lib/supabase.ts
├── simon-mvp/src/pages/resultados.tsx
└── simon-mvp/src/pages/api/razon-fiduciaria.ts (eliminar o simplificar)

Docs (referencia):
├── docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_1.md
├── docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_2.md
└── docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md
```
