# Plan de Mejoras UX Formularios - Filosofía MOAT Fiduciaria

> **Versión:** 1.0
> **Fecha:** 14 Enero 2026
> **Autor:** Claude Code
> **Estado:** En implementación

---

## 1. ESTADO ACTUAL

### Arquitectura de Formularios

```
Landing (/) → Filtros Nivel 1 (/filtros) → Formulario Nivel 2 (/formulario-vivienda) → Resultados
```

| Archivo | Propósito | Campos |
|---------|-----------|--------|
| `FilterBar.tsx` | Nivel 1: Filtros básicos | Presupuesto, zona, dorms, entrega, propósito, pago |
| `formulario-vivienda.tsx` | Nivel 2: Perfil personal | Quiénes viven, mascotas, tiempo buscando, estado emocional, innegociables, trade-offs |
| `ProgressBar.tsx` | Barra de progreso | Solo muestra X/N preguntas |
| `QuestionCard.tsx` | Tarjetas de pregunta | Animaciones, tipos de input |

### Flujo de Usuario Actual

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEL 1: FilterBar (/filtros)                                  │
│  ─────────────────────────────────────────────────────────────  │
│  1. Presupuesto (slider $50k-$300k)                             │
│  2. Zona (checkboxes)                                           │
│  3. Dormitorios (botones)                                       │
│  4. Estado entrega (radio)                                      │
│  5. Para qué es (radio)                                         │
│  6. Forma de pago (radio)                                       │
│  [Contador: "45 propiedades"]                                   │
│  [BTN: VER MIS 45 OPCIONES]                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  NIVEL 2: FormularioVivienda                                    │
│  ─────────────────────────────────────────────────────────────  │
│  CONTANOS SOBRE VOS                                             │
│  1. Quiénes van a vivir?                                        │
│  2. Mascotas?                                                   │
│                                                                 │
│  TU BÚSQUEDA                                                    │
│  3. Hace cuánto buscas?                                         │
│  4. Cómo te sentís? (emocional)                                 │
│  5. Quién más decide?                                           │
│                                                                 │
│  QUÉ BUSCAS                                                     │
│  6. Innegociables (max 3)                                       │
│  7. Deseables                                                   │
│                                                                 │
│  TRADE-OFFS                                                     │
│  8. Ubicación vs Metros (slider)                                │
│  9. Calidad vs Precio (slider)                                  │
│                                                                 │
│  [BTN: VER MIS 45 OPCIONES PERSONALIZADAS]                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. PROBLEMAS DETECTADOS

### 2.1 Problemas de Comunicación Fiduciaria

| Problema | Impacto | Ejemplo |
|----------|---------|---------|
| **No explica POR QUÉ pregunta** | Usuario no entiende el valor | "Mascotas?" sin contexto |
| **Labels genéricos** | Se siente como cualquier portal | "CONTANOS SOBRE VOS" |
| **Sin micro-copy educativo** | Pierde oportunidad de generar confianza | "Innegociables (max 3)" sin explicar qué pasa si elige |
| **Progress bar vacío** | No transmite "estoy entendiendo tu situación" | Solo muestra "3/9" |
| **Sin credibilidad visible** | No hay diferenciación | Falta "Por qué confiar" |

### 2.2 Problemas de UX

| Problema | Ubicación | Impacto |
|----------|-----------|---------|
| **Formulario muy largo** | Nivel 2 tiene 9 preguntas | Abandono |
| **Sliders sin feedback visual** | Trade-offs | Usuario no sabe qué significa elegir 2 vs 4 |
| **Sin validaciones educativas** | Todo el form | Errores se sienten como regaño |
| **Botón genérico** | "VER MIS 45 OPCIONES" | No comunica valor |
| **Sin estado de progreso emocional** | Header | No dice "Casi listo" o "Ya te entendemos" |

### 2.3 Problemas de Diseño

| Problema | Evidencia |
|----------|-----------|
| **Colores genéricos** | Blue-600 = igual que cualquier SaaS |
| **Sin personalidad** | Tipografía system default |
| **Sin elementos de confianza** | No hay logos, certificaciones, testimonios |
| **Falta "asesor" visual** | No hay avatar/personaje de Simón |

---

## 3. PROPUESTAS CON PRIORIDADES

### 3.1 ALTA PRIORIDAD (Implementar primero)

#### P1: Micro-copy explicativo en cada pregunta
**Tiempo estimado:** 1 hora
**Archivo:** `formulario-vivienda.tsx`

| Pregunta | Micro-copy Fiduciario |
|----------|----------------------|
| **Quiénes viven** | "Esto nos ayuda a calcular el espacio real que necesitás" |
| **Mascotas** | "Muchos edificios no son pet-friendly. Así evitamos mostrarte opciones incompatibles" |
| **Tiempo buscando** | "Si llevás mucho tiempo, podemos priorizar opciones que otros pasaron por alto" |
| **Estado emocional** | "Si estás cansado, te mostraremos menos opciones para no abrumarte" |
| **Quién decide** | "Si decide otro también, preparamos info para compartir fácil" |
| **Innegociables** | "Las opciones sin esto quedan al fondo del ranking (pero no desaparecen)" |
| **Deseables** | "Esto suma puntos pero no descarta" |
| **Ubicación vs Metros** | "Izq: Zona premium aunque chico. Der: Más espacio aunque menos céntrico" |
| **Calidad vs Precio** | "Izq: Mejor terminaciones. Der: Ahorro aunque más básico" |

#### P2: Progress bar con texto dinámico
**Tiempo estimado:** 30 minutos
**Archivo:** `formulario-vivienda.tsx` (inline, no usa ProgressBar.tsx)

```
ANTES: [Header genérico sin progreso]

DESPUÉS:
┌─────────────────────────────────────────────────────────────────┐
│  Entendiendo tu situación...                                    │
│  [━━━━━━━━━━━━━━━░░░░░]                                         │
│  ✓ Tu perfil familiar  → Tu búsqueda  ○ Prioridades  ○ Balance │
└─────────────────────────────────────────────────────────────────┘
```

**Copy dinámico:**
- Sección 1: "Conociendo a quienes vivirán..."
- Sección 2: "Entendiendo tu contexto..."
- Sección 3: "Identificando tus prioridades..."
- Sección 4: "Calibrando tus preferencias..."

#### P3: Feedback visual en sliders
**Tiempo estimado:** 1 hora
**Archivo:** `formulario-vivienda.tsx`

```
ANTES:
Mejor ubicación [──●────────] Más metros

DESPUÉS:
Mejor ubicación [──────●────] Más metros
📍 "Balance - Consideraré ambas opciones por igual"
```

| Slider | 1-2 | 3 | 4-5 |
|--------|-----|---|-----|
| **Ubicación vs Metros** | "Priorizando zona premium" | "Balance" | "Priorizando espacio" |
| **Calidad vs Precio** | "Buscando calidad premium" | "Balance" | "Buscando mejor precio" |

#### P4: Badge de confianza en header
**Tiempo estimado:** 15 minutos
**Archivo:** `formulario-vivienda.tsx`

```tsx
<div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 flex items-center gap-2">
  <span className="text-slate-400">🔒</span>
  <span className="text-sm text-slate-600">
    Tus datos están protegidos. No compartimos tu información.
  </span>
</div>
```

#### P5: CTA con valor comunicado
**Tiempo estimado:** 30 minutos
**Archivo:** `formulario-vivienda.tsx`

```
ANTES:
[VER MIS 45 OPCIONES PERSONALIZADAS]

DESPUÉS:
┌─────────────────────────────────────────────────────────────────┐
│  De 45 opciones, Simón va a:                                    │
│  ✓ Ordenar por compatibilidad con tu perfil                    │
│  ✓ Detectar oportunidades de precio                            │
│  ✓ Alertar sobre posibles riesgos                              │
│                                                                 │
│  [ENCONTRAR MIS MEJORES OPCIONES]                               │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3.2 MEDIA PRIORIDAD (Post-MVP)

#### P6: Sección "Por qué Simón" en footer
**Tiempo estimado:** 1 hora
**Archivo:** `formulario-vivienda.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│  ¿Por qué confiar en Simón?                                     │
│                                                                 │
│  📊 Analizamos 438 propiedades en tiempo real                  │
│  🎯 Ranking basado en TUS prioridades, no en quién paga más    │
│  🔍 Detectamos precios sospechosos automáticamente              │
│  💬 Sin compromiso - Solo info útil                             │
└─────────────────────────────────────────────────────────────────┘
```

#### P7: Validaciones educativas (no regaños)
**Tiempo estimado:** 1 hora
**Archivo:** `formulario-vivienda.tsx`

```
ANTES:
❌ "Completa las preguntas 1, 3 y 5 para continuar"

DESPUÉS:
ℹ️ Nos falta saber:
• Quiénes van a vivir → Para calcular espacio necesario
• Hace cuánto buscás → Para ajustar recomendaciones
• Quién más decide → Para preparar info compartible
```

#### P8: Paleta de colores profesional
**Tiempo estimado:** 2 horas
**Archivo:** `globals.css`, `tailwind.config.js`

| Actual | Propuesto | Uso |
|--------|-----------|-----|
| `blue-600` | `#1E3A5F` | Primario |
| `blue-50` | `#F0F7FF` | Backgrounds |
| `green-500` | `#2D9D78` | Éxito |
| `amber-500` | `#D97706` | Alertas |

---

### 3.3 BAJA PRIORIDAD (Nice to have)

| # | Cambio | Archivo | Tiempo |
|---|--------|---------|--------|
| P9 | Avatar/personaje Simón | Nuevo componente | 3h |
| P10 | Animaciones de "analizando" | `resultados.tsx` | 2h |
| P11 | Tipografía custom (Inter) | `_document.tsx` | 30min |

---

## 4. ESTIMACIONES DE TIEMPO

### Fase 1: Alta Prioridad
| Tarea | Tiempo |
|-------|--------|
| P1: Micro-copy | 1h |
| P2: Progress bar dinámico | 30min |
| P3: Feedback sliders | 1h |
| P4: Badge confianza | 15min |
| P5: CTA con valor | 30min |
| **TOTAL FASE 1** | **3h 15min** |

### Fase 2: Media Prioridad
| Tarea | Tiempo |
|-------|--------|
| P6: Sección "Por qué Simón" | 1h |
| P7: Validaciones educativas | 1h |
| P8: Paleta colores | 2h |
| **TOTAL FASE 2** | **4h** |

### Fase 3: Baja Prioridad
| Tarea | Tiempo |
|-------|--------|
| P9-P11 | 5h 30min |
| **TOTAL FASE 3** | **5h 30min** |

**TOTAL COMPLETO:** ~13 horas

---

## 5. FILOSOFÍA MOAT APLICADA

### Principio Core

> **Portal genérico:** "Completá el formulario"
>
> **Simón fiduciario:** "Contame sobre vos para poder ayudarte mejor"

### Las 3 Reglas del Formulario Fiduciario

1. **Cada pregunta explica POR QUÉ la hacemos**
   - No solo "Mascotas?" sino "Mascotas? (así evitamos mostrarte edificios incompatibles)"

2. **Cada respuesta comunica CÓMO afecta el resultado**
   - El slider no solo se mueve, muestra "Priorizando zona premium"

3. **El usuario entiende QUÉ gana al responder**
   - No solo "Continuar" sino "Encontrar mis mejores opciones"

### Diferenciación vs Portales

| Aspecto | Portal Genérico | Simón Fiduciario |
|---------|-----------------|------------------|
| Propósito visible | "Filtrar propiedades" | "Entender tu situación" |
| Tono | Transaccional | Conversacional |
| Preguntas | Solo datos | Datos + contexto |
| Feedback | Ninguno | Explicativo |
| Confianza | Asumida | Demostrada |

### El Test del "¿Por Qué?"

Antes de mostrar cualquier pregunta, debe pasar este test:
- ¿El usuario entiende POR QUÉ le preguntamos esto?
- ¿Sabe CÓMO afecta su resultado?
- ¿Confía en que usamos bien esta información?

Si alguna respuesta es NO, agregar micro-copy explicativo.

---

## 6. CHECKLIST DE IMPLEMENTACIÓN

### Nivel 2 (FormularioVivienda) ✅ COMPLETADO 14-Ene-2026
- [x] P1: Agregar micro-copy a las 9 preguntas
- [x] P2: Implementar progress bar con texto dinámico
- [x] P3: Agregar feedback visual a los 2 sliders
- [x] P4: Agregar badge de confianza en header
- [x] P5: Rediseñar CTA con valor comunicado

### Nivel 1 (FilterBar) ✅ COMPLETADO 14-Ene-2026
- [x] P1: Badge de confianza
- [x] P2: Header fiduciario ("ENCONTREMOS TU DEPARTAMENTO")
- [x] P3: Micro-copy en preguntas 1, 2, 3 y 5
- [x] P4: Progress bar (Paso 1 de 2)
- [x] P5: CTA mejorado ("PERSONALIZAR MI BÚSQUEDA")

### Fase 2 (Media Prioridad)
- [ ] P6: Agregar sección "Por qué Simón"
- [ ] P7: Cambiar validaciones a educativas
- [ ] P8: Actualizar paleta de colores

### Fase 3 (Baja Prioridad)
- [ ] P9: Crear avatar Simón
- [ ] P10: Animaciones de análisis
- [ ] P11: Tipografía Inter

---

## CHANGELOG

| Fecha | Cambio |
|-------|--------|
| 2026-01-14 | v1.0 - Documento creado |
| 2026-01-14 | Análisis completo de estado actual |
| 2026-01-14 | Propuestas priorizadas definidas |
| 2026-01-14 | **Nivel 2 COMPLETADO** - 5 mejoras alta prioridad en formulario-vivienda |
| 2026-01-14 | **Nivel 1 COMPLETADO** - 5 mejoras alta prioridad en FilterBar |
