# SIMÓN — METODOLOGÍA FIDUCIARIA (PARTE 2)
## Pasos 8-12: Ejecución Técnica

**Documento Canónico Consolidado**  
**Versión:** 1.0  
**Fecha:** 6 Enero 2026  
**Estado:** Cerrado

> **⚠️ Filosofía vigente, implementación parcialmente legacy.** Los **principios** (pasos 10-12: acompañamiento, aprendizaje, cierre sin presión) siguen rigiendo. Pero la **implementación técnica** de los pasos 8-9 describe el funnel premium dormido: el **MBF (Mapa de Búsqueda Fiduciaria)** y la tabla **`sesiones_fiduciarias` nunca se implementaron** (no existen en el schema), y la "Presentación TOP 3 / Alternativas" corre solo en `/resultados-v2`. El feed de producción (`/ventas`, `/alquileres`) usa filtros inline + mini estudio de mercado, sin MBF formal. Leé los pasos 8-9 como diseño del funnel premium (que podría retomarse), no como el flujo actual.

---

## ÍNDICE PARTE 2

- [PASO 8 — Traducción Fiduciaria → Búsqueda Ejecutable](#paso-8--traducción-fiduciaria--búsqueda-ejecutable)
- [MAPPING — Perfil Fiduciario → MBF](#mapping--perfil-fiduciario--mbf)
- [PASO 9 — Presentación Fiduciaria de Opciones](#paso-9--presentación-fiduciaria-de-opciones)
- [PASO 10 — Acompañamiento Fiduciario](#paso-10--acompañamiento-fiduciario)
- [PASO 11 — Aprendizaje Fiduciario](#paso-11--aprendizaje-fiduciario)
- [PASO 12 — Cierre Asistido sin Presión](#paso-12--cierre-asistido-sin-presión)
- [DIAGRAMA DE FLUJO COMPLETO](#diagrama-de-flujo-completo)

**Ver PARTE 1:** Bloques 1-7 (Fundamentos hasta Decisión)

---

# PASO 8 — TRADUCCIÓN FIDUCIARIA → BÚSQUEDA EJECUTABLE

## 8.1 Rol del Paso 8

El Paso 8 **NO decide**, **NO recomienda**, **NO interpreta emociones**.

> **Traduce una decisión consciente en una búsqueda que NO la contradiga.**

Pregunta que responde:

> "Dado lo que esta persona dijo que quiere y lo que NO está dispuesta a aceptar, ¿qué está permitido buscar y qué está prohibido?"

---

## 8.2 Inputs

### A. Guía Fiduciaria (Bloque 2)
- Innegociables (hard)
- Prioridades (orden)
- Trade-offs aceptados
- Horizonte temporal

**Ya decidido, no se discute acá.**

### B. Estado Fiduciario (Bloque 7)
- ¿Cansado? ¿Bajo presión?
- ¿Explorando o cerrando?

**No cambia filtros, cambia el modo.**

### C. Contexto SICI
- Densidad de oferta
- Calidad de listings
- Disponibilidad real

**El mercado no redefine criterios.**

---

## 8.3 Output: Mapa de Búsqueda Fiduciaria (MBF)

```json
{
  "filtros_duros": {},
  "filtros_blandos": {},
  "ordenamiento": [],
  "umbrales": {},
  "modo_busqueda": "",
  "razon_fiduciaria": ""
}
```

Es: Ejecutable, Auditable, Persistible, Reusable, Comparable.

---

## 8.4 Filtros Duros

### Qué son
**Límites éticos del sistema.** Si no cumple:
- ❌ No existe
- ❌ No se muestra
- ❌ No se "compensa"

### De dónde salen
- Innegociables explícitos
- Restricciones objetivas

### Ejemplo
```json
"filtros_duros": {
  "precio_max_usd": 150000,
  "zona": ["Equipetrol", "Urbari"],
  "nivel_ruido": "bajo",
  "expensas_max_usd": 800
}
```

### Regla inviolable
> Los filtros duros **nunca se relajan solos**. Solo cambian con autorización explícita.

### Proxies sin data
```json
"silencio": {
  "requerido": true,
  "estado": "indeterminado",
  "accion": "validacion_usuario"
}
```
- No aparece en lista principal
- Solo si usuario acepta validar

---

## 8.5 Filtros Blandos

Criterios de **preferencia**, no exclusión.

```json
"filtros_blandos": {
  "amenities": ["pet_friendly", "balcon"],
  "orientacion": "norte",
  "piso_preferido": "intermedio"
}
```

**Regla:** Un blando **jamás** anula un duro.

---

## 8.6 Fórmula de Coherencia

```
Si viola 1 filtro duro → coherencia = 0 → NO EXISTE

Si cumple duros:
coherencia = 0.8 + (blandos_cumplidos / blandos_total) * 0.2
```

| Situación | Coherencia |
|-----------|------------|
| Viola duro | 0 |
| Cumple duros, 0 blandos | 0.80 |
| Cumple duros, 50% blandos | 0.90 |
| Cumple duros, 100% blandos | 1.00 |

**Gate:** coherencia_min = 0.8

---

## 8.7 Ordenamiento Fiduciario

```json
"ordenamiento": [
  "coherencia_fiduciaria",
  "score_calidad_dato",
  "precio"
]
```

> El usuario ve primero lo que **debería** ver, no lo más barato.

---

## 8.8 Umbrales

```json
"umbrales": {
  "coherencia_min": 0.8,
  "score_dato_min": 70,
  "cantidad_min": 1,
  "cantidad_max": 5
}
```

Si no hay cantidad_min → Protocolo "0 opciones" (NO relajar).

---

## 8.9 Modos de Búsqueda

| Modo | Cantidad máx | Comportamiento |
|------|--------------|----------------|
| exploración | 5 | Blandos flexibles |
| cierre | 3 | Máximo foco |
| validación | 1 | Una propiedad puntual |

---

## 8.10 Persistencia

```sql
CREATE TABLE sesiones_fiduciarias (
  id_sesion UUID PRIMARY KEY,
  guia_fiduciaria JSONB NOT NULL,
  mbf JSONB NOT NULL,
  modo_busqueda TEXT,
  estado TEXT DEFAULT 'activa',
  resultados_mostrados JSONB,
  decision_final JSONB,
  feedback_usuario JSONB,
  duracion_sesion_min INTEGER,
  eventos JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# MAPPING — PERFIL FIDUCIARIO → MBF

## Propósito

Traducir output del **Bloque 2** al input del **Paso 8**.

```
Perfil Fiduciario → Mapping → MBF (JSON ejecutable)
```

---

## Filtros Duros

| Perfil dice | MBF genera |
|-------------|------------|
| Presupuesto max $150k | `precio_max_usd: 150000` |
| Dormitorios min 2 | `dormitorios_min: 2` |
| Zona: Equipetrol | `zonas: ["Equipetrol"]` |
| Zona rechazada: Plan 3000 | `zonas_excluidas: ["Plan 3000"]` |
| Mascota (innegociable) | `amenities_requeridos: ["pet_friendly"]` |
| Silencio (innegociable) | `nivel_ruido: "bajo"` (proxy) |
| Expensas max $200 | `expensas_max_usd: 200` |

---

## Filtros Blandos

| Perfil dice | MBF genera |
|-------------|------------|
| Deseable: piscina, gym | `amenities_preferidos: [...]` |
| Piso alto con vista | `piso_preferido: "alto"` |
| Orientación norte | `orientacion_preferida: "norte"` |
| Edificio boutique | `max_unidades_edificio: 20` |

---

## Proxies (datos indirectos)

| Criterio | Proxy | Estado SICI |
|----------|-------|-------------|
| Silencio | Piso + contrafrente + calle | Parcial |
| Calidad construcción | Desarrollador conocido | 55% |
| Liquidez | Días promedio mercado | Calculable |
| Plusvalía | Microzona | Disponible |

---

## Horizonte → Ajustes

| Horizonte | Ajuste |
|-----------|--------|
| Definitivo (15+) | Penalizar emergentes |
| Inversión (5-10) | Priorizar liquidez |
| Paso intermedio | Priorizar reventa |

---

## Reglas de Traducción

| Regla | Aplicación |
|-------|------------|
| Innegociable → Duro | Siempre |
| Deseable → Blando | Siempre |
| Proxy sin data → Indeterminado | Nunca asumir |
| Zona rechazada → Excluir | Duro |

---

# PASO 9 — PRESENTACIÓN FIDUCIARIA DE OPCIONES

## 9.1 Objetivo

Convertir MBF ejecutado en respuesta que:
- ✅ No traicione la guía
- ✅ Sea accionable
- ✅ Mantenga calma + claridad

---

## 9.2 Reglas de Oro

### 1. Lista principal = "Simón pone la firma"
Solo propiedades que cumplen **TODOS** los duros.

### 2. Indeterminadas separadas
Solo si usuario lo pide.

### 3. Cantidad por modo
| Modo | Máx |
|------|-----|
| Exploración | 5 |
| Cierre | 3 |
| Validación | 1 |

### 4. Orden fiduciario
1° coherencia → 2° score_dato → 3° precio

### 5. Transparencia sin drama
1-2 líneas explicando por qué estas opciones.

### 6. Sin fotos
- No excluir
- Placeholder + badge
- Penalizar score (-15)

---

## 9.3 Estructura de Respuesta

### Bloque A — Apertura fiduciaria
> "Te muestro opciones donde Simón pone la firma: cumplen tus no negociables."

### Bloque B — Lista principal
```
1) Sky Moon — 2D — $145,000 — 85m²
   ✅ Silencio ✔ | Pet friendly ✔
   📍 Equipetrol (Sirari)
   📱 María (Remax) — WhatsApp
```

### Bloque C — Proyectos (opcional)
Para explorar más.

### Bloque D — Indeterminadas (discreta)
> "Si querés, puedo mostrarte opciones que requieren validación manual."

### Bloque E — Pregunta de avance (1 sola)
| Modo | Pregunta |
|------|----------|
| Exploración | "¿Qué querés priorizar?" |
| Cierre | "¿Dejamos 1 finalista?" |
| Validación | "¿Armamos la Ficha?" |

---

## 9.4 Protocolo 0 Opciones

> "Con tus no negociables, hoy no encontré opciones. Eso es bueno: tu filtro funciona."

**3 caminos:**
1. **Esperar** - Refrescar en X días
2. **Ajustar** - Usuario decide cuál duro tocar
3. **Ver indeterminadas** - Validación manual

---

## 9.5 Usuario ignora recomendación

1. No castigar
2. Activar **Modo mitigación**
3. Registrar: `decision_con_advertencia: true`

---

# PASO 10 — ACOMPAÑAMIENTO FIDUCIARIO

## 10.1 Objetivo

Evitar que el usuario:
- Se fatigue
- Se contradiga
- "Derrape" sin darse cuenta

> **Simón actúa como memoria externa del criterio.**

---

## 10.2 Qué es (y qué NO)

**NO es:** Persuadir, vender, empujar al cierre

**SÍ es:** Señalar patrones, advertir incoherencias, sostener criterio

---

## 10.3 Niveles de Intervención

### A) Confirmación (todo bien)
> "Estas opciones están alineadas con lo que definiste."

### B) Señalamiento suave
> "Esta opción cumple lo principal, pero resigna X. Tenelo presente."

### C) Advertencia fiduciaria
> "Esto contradice [no negociable]. Puedo mostrarla, pero no la recomiendo."

### D) Fatiga detectada
> "Te noto cansado. Pausemos antes de decidir."

---

## 10.4 Umbrales de Fatiga

```
fatiga = true SI:
  - duracion > 45 min, O
  - vistas > 15, O
  - frases: ["ya fue", "cualquiera", "da igual"]
```

---

## 10.5 Registro

```json
{
  "evento": "advertencia_fiduciaria",
  "nivel": "C",
  "motivo": "violacion_filtro_duro",
  "reaccion_usuario": "ignora | acepta | ajusta"
}
```

---

## 10.6 Estados de Salida

| Estado | Siguiente |
|--------|-----------|
| Explorando con criterio | Continúa Paso 10 |
| Listo para cierre | Paso 11/12 |
| Necesita pausa | Volver a Bloque 2 |

---

# PASO 11 — APRENDIZAJE FIDUCIARIO

## 11.1 Idea Central

> **Simón aprende del proceso, no del resultado.**

Evita:
- Sesgos de supervivencia
- Reforzar malas decisiones

---

## 11.2 Lo que NO aprende

- ❌ "Si compró ruidoso → ruido no importa"
- ❌ Relajar duros porque usuario violó
- ❌ Optimizar por cierre/conversión

---

## 11.3 Lo que SÍ aprende

- ✅ Dónde se tensó
- ✅ Qué filtros generan fricción
- ✅ Qué proxies generan incertidumbre
- ✅ Cuándo aparece fatiga

> **Aprende sobre el humano, no sobre el mercado.**

---

## 11.4 Tipos de Aprendizaje Permitidos

### A. Fricción
Qué filtros limitan más (informa, no cambia).

### B. Tolerancia declarada
Solo si usuario dice explícitamente.
> "¿Querés que actualicemos tu guía?"

### C. Patrones de cansancio
Ajustar pacing, sugerir pausas.

### D. Proxies problemáticos
Para roadmap SICI (sistémico).

---

## 11.5 Línea Roja

> **Nada aprendido modifica filtros duros automáticamente.**

El sistema protege al usuario **incluso de sí mismo**.

---

## 11.6 Output

```json
{
  "aprendizajes": {
    "criterios_mas_tensionados": ["silencio", "expensas"],
    "fatiga_detectada": true,
    "advertencias_ignoradas": 1
  }
}
```

Solo se verbaliza si usuario lo pide.

---

## 11.7 Resumen

> **Paso 11 no hace que Simón recomiende mejor propiedades. Hace que acompañe mejor personas.**

---

# PASO 12 — CIERRE ASISTIDO SIN PRESIÓN

## 12.1 Principio Rector

> **Simón no empuja decisiones. Crea condiciones para decisión tranquila.**

El cierre no es evento. Es estado mental.

---

## 12.2 Señales de Activación (TODAS requeridas)

- ✅ Modo = cierre
- ✅ 1-2 opciones coherentes
- ✅ Ningún duro violado
- ✅ Ningún proxy pendiente sin aceptar
- ✅ No hay fatiga activa

> **Si falta una → NO hay cierre.**

---

## 12.3 Qué hace (y qué NO)

**NO hace:**
- Decir "esta es la mejor"
- Usar urgencia
- Empujar contacto

**SÍ hace:**
- Reflejar coherencia
- Reducir ruido mental
- Devolver control

---

## 12.4 Estructura del Cierre

### A. Reflejo fiduciario
> "Según tus innegociables —silencio, expensas— esta opción cumple todo."

No halaga propiedad. **Valida coherencia.**

### B. Checklist de tranquilidad
- ✅ Cumple lo clave
- ✅ No justifica excepciones
- ✅ No elige por cansancio
- ✅ Podría vivir 10-15 años sin resentimiento
- ✅ Si se frena, no se siente mal

**Si falla uno → no cerrar.**

### C. Externalización del riesgo
> "El riesgo que queda no es el departamento. Es si estás listo hoy."

---

## 12.5 Las 3 Salidas Legítimas

### A) Avanzar ahora
> "¿Te conecto con el asesor?"

Sin presión.

### B) Pausar conscientemente
> "Podemos pausar 48h. Si seguís sintiendo lo mismo, avanzamos."

Pausa es válida, no fracaso.

### C) Reabrir criterios
> "Podemos revisar tu guía. No es retroceder, es afinar."

---

## 12.6 Usuario insiste en cerrar incoherente

> "Puedo ayudarte, pero esta opción contradice tu innegociable. ¿Avanzás igual?"

Si dice sí:
- Registrar `decision_con_advertencia: true`
- No usar para aprendizaje

---

## 12.7 Persistencia

```json
{
  "estado_final": "cerrado | pausado | redefinido",
  "motivo_de_salida": "avanza_coherente | pausa_48h | reabre_criterios",
  "decision_con_advertencia": false,
  "nivel_tranquilidad": "alto | medio | bajo"
}
```

---

## 12.8 Frase Fundacional

> **"Si esto no te da paz, no es el momento —aunque sea el lugar."**

---

## 12.9 Resultado Real

No es venta. Es **decisión que no pesa**.

**Si compra:** Duerme tranquilo, no se arrepiente.
**Si no compra:** No siente culpa, vuelve con claridad.

---

## 12.10 Cierre del Sistema

Con Paso 12, Simón:
- ❌ Deja de ser buscador
- ❌ Deja de ser recomendador
- ❌ Deja de ser chatbot

Se vuelve:

> **Un acompañante fiduciario en decisiones irreversibles.**

---

# DIAGRAMA DE FLUJO COMPLETO

```
┌─────────────────────────────────────────────────────────────────┐
│                    METODOLOGÍA FIDUCIARIA                        │
│                         SIMÓN v1.0                               │
└─────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │   USUARIO    │
                         │   LLEGA      │
                         └──────┬───────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  BLOQUES 1-2: FUNDAMENTOS + PERFIL                              │
│                                                                  │
│  • Visión original + Posicionamiento ético                      │
│  • Perfil Fiduciario (6 ejes)                                   │
│  • Guía Fiduciaria (8 componentes)                              │
│                                                                  │
│  Output: GUÍA FIDUCIARIA CONGELADA                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BLOQUE 3-4: FICHA + VALIDACIÓN                                 │
│                                                                  │
│  • Ficha de Coherencia (5 secciones)                            │
│  • Validación con perfiles sintéticos                           │
│                                                                  │
│  Output: SISTEMA VALIDADO                                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BLOQUE 5: INTEGRACIÓN SICI                                     │
│                                                                  │
│  • SICI omnisciente, Simón miope                                │
│  • Firewall ético entre usuario y mercado                       │
│                                                                  │
│  Output: CONEXIÓN CONTROLADA A DATA                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BLOQUE 6-7: EJECUCIÓN + DECISIÓN                               │
│                                                                  │
│  • Ficha como producto operativo                                │
│  • Estados: APTO / NO APTO / PAUSA                              │
│                                                                  │
│  Output: DECISIÓN FIDUCIARIA                                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PASO 8: TRADUCCIÓN → MBF                                       │
│                                                                  │
│  • Guía → Filtros duros + blandos                               │
│  • Fórmula coherencia                                           │
│  • Modos: exploración / cierre / validación                     │
│                                                                  │
│  Output: MAPA DE BÚSQUEDA FIDUCIARIA (JSON)                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PASO 9: PRESENTACIÓN                                           │
│                                                                  │
│  • Lista principal (Simón pone firma)                           │
│  • Proyectos exploración                                        │
│  • Indeterminadas (solo si pide)                                │
│  • Protocolo 0 opciones                                         │
│                                                                  │
│  Output: OPCIONES ACCIONABLES + CONTACTO                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PASO 10: ACOMPAÑAMIENTO                                        │
│                                                                  │
│  Niveles:                                                       │
│  A) Confirmación (todo bien)                                    │
│  B) Señalamiento suave (deriva leve)                            │
│  C) Advertencia fiduciaria (riesgo)                             │
│  D) Fatiga detectada (pausa)                                    │
│                                                                  │
│  Output: USUARIO ACOMPAÑADO                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PASO 11: APRENDIZAJE                                           │
│                                                                  │
│  • Aprende del PROCESO, no del resultado                        │
│  • Nunca relaja duros automáticamente                           │
│  • Informa, no modifica                                         │
│                                                                  │
│  Output: INSIGHTS FIDUCIARIOS                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PASO 12: CIERRE ASISTIDO                                       │
│                                                                  │
│  • Reflejo fiduciario                                           │
│  • Checklist tranquilidad                                       │
│  • 3 salidas: Avanzar / Pausar / Reabrir                        │
│                                                                  │
│  Output: DECISIÓN QUE NO PESA                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   FIN CICLO     │
                    │   FIDUCIARIO    │
                    └─────────────────┘

═══════════════════════════════════════════════════════════════════

                     PRINCIPIO CENTRAL

  "Si esto no te da paz, no es el momento —aunque sea el lugar."

═══════════════════════════════════════════════════════════════════
```

---

# RESUMEN EJECUTIVO

## Los 12 Pasos en 1 Línea

| Paso | Función |
|------|---------|
| 1-2 | Establecer ética + construir perfil |
| 3 | Definir ficha de coherencia |
| 4 | Validar con perfiles sintéticos |
| 5 | Integrar SICI sin contaminar |
| 6 | Ficha como producto operativo |
| 7 | Decidir: APTO / NO APTO / PAUSA |
| 8 | Traducir guía a búsqueda ejecutable |
| 9 | Presentar opciones accionables |
| 10 | Acompañar sin empujar |
| 11 | Aprender sin contaminar |
| 12 | Cerrar sin presión |

---

## La Diferencia de Simón

| Sistema tradicional | Simón |
|---------------------|-------|
| Busca propiedades | Filtra por coherencia |
| Empuja al cierre | Permite pausar |
| Optimiza conversión | Minimiza arrepentimiento |
| Vende futuro | Evalúa presente |
| Cierre = éxito | Tranquilidad = éxito |

---

## Frase Final

> **Simón no vende casas. Simón protege decisiones patrimoniales.**

---

# FIN PARTE 2

**Ver PARTE 1:** `METODOLOGIA_FIDUCIARIA_PARTE_1.md`

---

*Documento canónico v1.0 — 6 Enero 2026*
