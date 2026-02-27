# REPORTE COMPLETO DE AUDITORIA SICI - DISENO

**Fecha:** 11 Enero 2026
**Fuentes:** Documentacion del repo (specs, arquitectura, formularios, MVP, funnel)

---

## RESUMEN EJECUTIVO

| Categoria | Contradicciones |
|-----------|-----------------|
| Campos del formulario | 3 |
| Estructura de resultados | 4 |
| Perfiles de usuario | 2 |
| Tiempo estimado | 3 |
| Monetizacion | 2 |
| Flujo de pantallas | 2 |
| Estados del sistema | 2 |
| **TOTAL** | **18 contradicciones de diseno** |

---

## 1. CAMPOS DEL FORMULARIO (CRITICO)

### Documentos comparados

| Documento | Campos | Secciones | Tiempo |
|-----------|--------|-----------|--------|
| **BLOQUE_2_FORM_VIVIENDA.md** | **~33+ campos** | **9 (A-I)** | Implicito ~8-12 min |
| **FORM_VIVIENDA_MVP.md** | **18 campos** | **2 niveles** | **5 min total** |
| **SICI_MVP_SPEC.md** | ~33 campos | 9 secciones | 8-12 min |
| **FUNNEL_ESPECIFICACION.md** | 6 filtros basicos | 1 pantalla | ~2 min |

### Contradiccion 1: Cuantos campos tiene el formulario MVP?

```
BLOQUE_2_FORM_VIVIENDA:  33+ campos (documento canonico completo)
FORM_VIVIENDA_MVP:       18 campos (2 niveles: 8 + 10)
MVP_SPEC:                Referencia a BLOQUE_2 (33 campos)
FUNNEL:                  6 filtros basicos
```

**Problema:** El MVP spec dice usar BLOQUE_2 (33 campos) pero existe FORM_VIVIENDA_MVP con solo 18 campos. No esta claro cual implementar.

### Contradiccion 2: Estructura de secciones

```
BLOQUE_2:        9 secciones (A-I) con preguntas detalladas
FORM_MVP:        2 niveles (rapido + contexto fiduciario)
MVP_SPEC:        Tabla con 9 secciones, ~33 campos
```

**Problema:** MVP_SPEC lista 9 secciones pero FORM_VIVIENDA_MVP define 2 niveles. Son arquitecturas diferentes.

### Contradiccion 3: Version del formulario

```
BLOQUE_2_FORM_VIVIENDA.md:  Version 1.0 (6 Enero 2026)
FORM_VIVIENDA_MVP.md:       Version 2.1 (9 Enero 2026) - MAS RECIENTE
MVP_SPEC:                   Referencias a BLOQUE_2 (version anterior)
```

**Problema:** FORM_VIVIENDA_MVP es 3 dias mas nuevo pero MVP_SPEC no lo referencia.

---

## 2. ESTRUCTURA DE RESULTADOS (CRITICO)

### Documentos comparados

| Documento | Cantidad resultados | Modo |
|-----------|---------------------|------|
| **ARQUITECTURA_COGNITIVA G5** | **Maximo 3** | Cierre |
| **METODOLOGIA_FIDUCIARIA** | 5 (exploracion) / 3 (cierre) / 1 (validacion) | Por modo |
| **MVP_SPEC.md** | 3-5 propiedades | Unico |
| **FUNNEL_ESPECIFICACION** | 3 TOP + 10 alternativas + excluidas | Unico |

### Contradiccion 4: Cuantas propiedades mostrar?

```
ARQUITECTURA_COGNITIVA:  "G5 - Maximo 3 en Cierre, SIN EXCEPCIONES"
METODOLOGIA:             "5 en exploracion, 3 en cierre, 1 en validacion"
MVP_SPEC:                "3-5 propiedades"
FUNNEL:                  "3 TOP + 10 alternativas + excluidas"
```

**Problema:** El guardrail G5 dice "maximo 3 sin excepciones" pero MVP dice "3-5" y FUNNEL dice "3+10+excluidas".

### Contradiccion 5: Modos de operacion

```
ARQUITECTURA_COGNITIVA:  6 estados (inicial, explorando, cierre, pausa, redefinir, cerrado)
METODOLOGIA:             3 modos (exploracion, cierre, validacion)
MVP_SPEC:                Sin modos (flujo lineal)
FUNNEL:                  Sin modos explicitos
```

**Problema:** La arquitectura define 6 estados pero MVP y FUNNEL asumen flujo lineal sin estados.

### Contradiccion 6: Alternativas

```
FUNNEL:          "10 alternativas" despues de TOP 3
METODOLOGIA:     Sin concepto de "alternativas"
MVP_SPEC:        Sin alternativas
ARQUITECTURA:    Sin alternativas
```

**Problema:** Solo FUNNEL menciona "10 alternativas". Los demas docs no lo contemplan.

### Contradiccion 7: Propiedades excluidas

```
FUNNEL:          Muestra "excluidas con razon"
MVP_SPEC:        Sin excluidas visibles
METODOLOGIA:     Sin excluidas visibles
ARQUITECTURA:    Sin excluidas visibles
```

**Problema:** FUNNEL es el unico que muestra excluidas. No esta en otros docs.

---

## 3. PERFILES DE USUARIO

### Documentos comparados

| Documento | Perfiles definidos |
|-----------|-------------------|
| **BLOQUE_2_FORM_VIVIENDA** | 4: Vivienda, Inversor Renta, Inversor Plusvalia, Transicion |
| **FUNNEL_ESPECIFICACION** | 3: Vivienda, Inversion Renta, Inversion Plusvalia |
| **MVP_SPEC** | 1: Solo Vivienda |
| **ARQUITECTURA_COGNITIVA** | Sin perfiles especificos |

### Contradiccion 8: Cuantos perfiles existen?

```
BLOQUE_2:        4 perfiles (incluye TRANSICION)
FUNNEL:          3 perfiles (SIN Transicion)
MVP:             1 perfil (Solo Vivienda)
```

**Problema:** BLOQUE_2 define 4 perfiles pero FUNNEL solo tiene 3. Transicion desaparecio.

### Contradiccion 9: Pregunta de activacion

```
BLOQUE_2_FORM_VIVIENDA:  "Es para vivir? Si → Este formulario"
BLOQUE_2_FORM_TRANSICION: "Es solucion temporal? Si → Este formulario"
FUNNEL:                   Solo muestra 3 opciones de perfil
```

**Problema:** La logica de activacion de perfil en BLOQUE_2 incluye Transicion, pero FUNNEL no lo tiene.

---

## 4. TIEMPO ESTIMADO

### Documentos comparados

| Documento | Tiempo estimado |
|-----------|-----------------|
| **MVP_SPEC** | 8-12 minutos |
| **MVP_SPEC criterio exito** | < 15 minutos |
| **FORM_VIVIENDA_MVP** | 5 minutos (2 + 3) |
| **Landing copy** | 10 minutos |
| **BLOQUE_2** | Implicito ~8-12 minutos |

### Contradiccion 10: Cuanto tiempo toma?

```
MVP_SPEC:           "8-12 minutos" / "< 15 min target"
FORM_VIVIENDA_MVP:  "2 min (Nivel 1) + 3 min (Nivel 2) = 5 min total"
Landing:            "10 minutos"
```

**Problema:** MVP dice 8-12 min pero FORM_MVP dice 5 min total. Diferencia de 2x.

### Contradiccion 11: Target vs realidad

```
MVP_SPEC criterio:  "Tiempo promedio < 15 min"
FORM_VIVIENDA_MVP:  "5 min total"
```

**Problema:** El target de exito (15 min) es 3x el tiempo del form MVP (5 min).

### Contradiccion 12: Copy de landing

```
Landing MVP_SPEC:  "10 minutos"
FORM_MVP real:     "5 minutos"
```

**Problema:** Landing promete 10 min pero form dice 5 min. Usuario espera mas.

---

## 5. MONETIZACION

### Documentos comparados

| Documento | Modelo |
|-----------|--------|
| **MVP_SPEC** | "Sin pagos" / "Primero validar valor" |
| **FUNNEL_ESPECIFICACION** | $29.99 Premium + 0.4% broker fee |

### Contradiccion 13: Hay pagos o no?

```
MVP_SPEC:  "NO Pagos/Premium - Primero validar valor"
FUNNEL:    "$29.99 desbloquea Seccion Premium"
FUNNEL:    "0.4% fee si broker de Simon cierra"
```

**Problema:** MVP dice explicitamente "sin pagos" pero FUNNEL tiene modelo de monetizacion completo.

### Contradiccion 14: Premium features

```
MVP_SPEC:  Sin Premium features
FUNNEL:    "Seccion Premium: Comparador, CMA, Alertas, Asesor Virtual"
```

**Problema:** FUNNEL define features premium que MVP excluye explicitamente.

---

## 6. FLUJO DE PANTALLAS

### Documentos comparados

| Documento | Pantallas |
|-----------|-----------|
| **MVP_SPEC** | 4: Landing → Formulario → Resultados → Confirmacion |
| **FUNNEL_ESPECIFICACION** | Mas complejo: Filtros → Resultados → Premium → CTA |
| **ARQUITECTURA_COGNITIVA** | State machine con 6 estados |

### Contradiccion 15: Cuantas pantallas?

```
MVP_SPEC:        4 pantallas (flujo lineal simple)
FUNNEL:          Multiples secciones (filtros, resultados, TOP3, alternativas, excluidas, premium)
ARQUITECTURA:    6 estados de sesion (no son pantallas pero afectan UX)
```

**Problema:** MVP define 4 pantallas pero FUNNEL tiene estructura mas compleja.

### Contradiccion 16: Captura de lead

```
MVP_SPEC:        Captura al final (post-resultados)
FUNNEL:          No menciona captura de lead explicitamente
ARQUITECTURA:    Sin mencion de leads
```

**Problema:** MVP centra flujo en captura de lead. FUNNEL no lo menciona.

---

## 7. ESTADOS DEL SISTEMA

### Documentos comparados

| Documento | Estados |
|-----------|---------|
| **ARQUITECTURA_COGNITIVA** | 6: inicial, explorando, cierre, pausa, redefinir, cerrado |
| **METODOLOGIA_FIDUCIARIA** | 3 modos: exploracion, cierre, validacion |
| **MVP_SPEC** | Sin estados (flujo lineal) |
| **FUNNEL** | Sin estados |

### Contradiccion 17: El sistema tiene estados o no?

```
ARQUITECTURA:    6 estados con transiciones controladas
METODOLOGIA:     3 modos operativos
MVP:             Flujo lineal sin estados
```

**Problema:** Arquitectura define state machine compleja pero MVP asume flujo lineal.

### Contradiccion 18: Pausa obligatoria

```
ARQUITECTURA G3: "Fatiga bloquea decision - PAUSA_OBLIGATORIA"
MVP_SPEC:        Sin mencion de pausas
FUNNEL:          Sin mencion de pausas
```

**Problema:** El guardrail G3 (fatiga→pausa) no aparece en MVP ni FUNNEL.

---

## MATRIZ DE DOCUMENTOS EN CONFLICTO

| Tema | BLOQUE_2 | FORM_MVP | MVP_SPEC | FUNNEL | ARQUITECTURA | METODOLOGIA |
|------|----------|----------|----------|--------|--------------|-------------|
| **Campos form** | 33+ | 18 | 33 | 6 | - | - |
| **Tiempo** | ~10min | 5min | 8-12min | ~2min | - | - |
| **Resultados** | - | - | 3-5 | 3+10 | Max 3 | 5/3/1 |
| **Perfiles** | 4 | - | 1 | 3 | - | 4 |
| **Estados** | - | - | 0 | 0 | 6 | 3 |
| **Pagos** | - | - | No | Si | - | - |
| **Lead capture** | - | - | Si | No | - | - |

---

## PREGUNTAS DE DISENO SIN RESPUESTA

1. **Formulario:** Usar BLOQUE_2 (33 campos) o FORM_MVP (18 campos)?
2. **Perfiles:** Implementar 4, 3, o 1 perfil?
3. **Resultados:** Mostrar 3, 3-5, o 3+10+excluidas?
4. **Estados:** Implementar state machine o flujo lineal?
5. **Tiempo:** Prometer 5 min, 10 min, o 8-12 min?
6. **Monetizacion:** MVP sin pagos o incluir Premium $29.99?
7. **Transicion:** El perfil Transicion existe o se elimino?
8. **Pausa:** Implementar deteccion de fatiga o no?
9. **Alternativas:** Mostrar 10 alternativas o solo TOP?
10. **Excluidas:** Mostrar propiedades excluidas o no?

---

## RECOMENDACIONES

### Inmediatas (Prioridad Alta)

1. **Definir formulario canonico** - Elegir BLOQUE_2 o FORM_MVP, no ambos
2. **Unificar cantidad de resultados** - Decidir: 3 / 3-5 / 3+10
3. **Clarificar perfiles para MVP** - Documentar que Transicion queda fuera

### Corto Plazo

4. **Alinear tiempos** - Actualizar landing con tiempo real
5. **Decidir state machine** - Si MVP es lineal, documentar que estados son post-MVP
6. **Clarificar monetizacion** - FUNNEL es vision futura, MVP es sin pagos

### Documentacion

7. **Crear documento SINGLE SOURCE OF TRUTH** para:
   - Campos del formulario MVP
   - Estructura de resultados MVP
   - Flujo de pantallas MVP
8. **Marcar documentos como VISION FUTURA** vs **MVP ACTUAL**
9. **Versionar documentos** con estado: DRAFT / MVP / FUTURE

---

## DOCUMENTOS POR ESTADO RECOMENDADO

### MVP ACTUAL (implementar ahora)

- MVP_SPEC.md (con actualizaciones)
- FORM_VIVIENDA_MVP.md (si se elige 18 campos)
- Flujo: Landing → Formulario → Resultados → Lead

### VISION FUTURA (post-validacion)

- SIMON_FUNNEL_ESPECIFICACION.md (Premium, alternativas)
- SIMON_ARQUITECTURA_COGNITIVA.md (state machine completa)
- BLOQUE_2_FORM_*.md (formularios completos)
- Perfiles: Inversor Renta, Plusvalia, Transicion

---

*Auditoria generada - 11 Enero 2026*
