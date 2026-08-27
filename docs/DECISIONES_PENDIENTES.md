# Decisiones pendientes — 27-ago-2026

> Lo que quedó sin resolver del audit de drift de Equipetrol, agrupado **por quién puede
> decidirlo**. No por importancia: por si depende de vos, de un tercero, o de nadie.
>
> 🔑 Cada bloque dice **qué pasa si no se decide**. Varias de estas pueden esperar meses
> sin costo; dos no.

---

## A · SÓLO EL CAPTADOR PUEDE RESPONDER (4 casos)

Ninguna de estas se resuelve mirando más datos: el dato que falta no existe de nuestro
lado. Las cuatro son de **Century21** y **no tenemos el contacto guardado** — hay que
abrir el aviso.

**Son una sola llamada o un solo mensaje.** Conviene hacerlas juntas.

| id | edificio | qué preguntar |
|---|---|---|
| **8000510** | Nano Tec | ¿sigue en alquiler o pasó a venta? |
| **8001103** | (sin nombre) | ¿los 67.800 son alquiler mensual o precio de venta? |
| **1552** | Madero Residence | ¿es venta de 200.000 USD o alquiler de 7.500 Bs? |
| **3776** | Sky Luxia | ¿el precio es 83.500 o 75.000? |

```
8000510  c21.com.bo/propiedad/112448_departamento-amoblado-y-equipado
8001103  c21.com.bo/propiedad/120564_dpto-1-dormitorio-a-estrenar
1552     c21.com.bo/propiedad/107131_departamento-de-lujo-en-venta
3776     c21.com.bo/propiedad/116402_monoambiente-en-venta-en-equpetrol-sky-
```

### Por qué no las resolvimos nosotros

**8000510** — el portal pasó de Bs 4.500 mensuales a Bs 780.000 (precio de venta). El
aviso ya no tiene renta identificable y lo publicamos a 4.500 sin respaldo. 🔴 Pero su
encabezado sigue diciendo "en Alquiler", y `READER_SPEC_ALQUILER §GATE` cita **esta misma
URL** como el precedente que se congeló mal y lo hizo rechazar 3 noches mientras
producción lo publicaba. Adivinar acá ya salió caro una vez.

**8001103** — el portal manda 67.800 en las **dos monedas a la vez**, firma de un precio
de venta en el campo de alquiler. El texto son dos líneas que no dicen "se vende".

**1552** — el aviso se reescribió: desapareció "200.000 dólares al paralelo" y apareció
**"7500 BS" suelto**, sin decir mensual. Sobre 102 m² eso es magnitud de alquiler.

**3776** — el aviso **se contradice consigo mismo**: el texto (sin un solo cambio) dice
83.500 y el formulario del portal dice 75.000. Los dos dan $/m² plausibles. No hay forma
de desempatarlo sin preguntar.

### Qué pasa si no se decide
Las cuatro siguen en el feed con un dato que **puede** estar mal. No se degradan solas,
pero cada una es un cliente que pregunta por algo que no es. **8000510 es la peor**:
publicamos una renta que el aviso ya no ofrece.

---

## B · DECISIÓN TUYA, SIN CONSULTAR A NADIE (3)

### B1 · Registrar 8 alias  ·  *barato, sin riesgo*

El matcher duda cada noche por variantes de escritura. **Ninguno es un match equivocado**
— los 34 casos de "matching sospechoso" del audit resultaron todos falsas alarmas.

```
"SKY DESING" → Sky Design            "TORRE PLATINIUM I"  → Platinum 1
"Euro Nordic" → Eurodesign Nordic    "TORRE PLATINIUM II" → Platinum 2
"Ónix" → Onix Art By EliTe           "SKY Eclypse"        → Sky Eclipse
"CONDOMINIO NANO-TEC" → NanoTec by Smart Studio
"Edificio Eurodesign" → Eurodesign Residences
```

**Si no se hace:** vuelven a aparecer en cada audit como sospechosos, y alguien vuelve a
gastar tiempo confirmando que están bien. Es ruido recurrente, no un error.

⚠️ **Antes de agregarlos**, mirar el hallazgo de la mig 342: hay **alias intrusos** — un
proyecto con el *nombre oficial de otro* como alias (pm 35 tiene "Uptown NUU", que es el
nombre del pm 54; pm 221 tiene tres alias de Santorini Suites). Agregar alias sin mirar
eso empeora el problema.

### B2 · Los 6 avisos a más de 2 km de su edificio  ·  *un rato de revisión*

Quedaron sin heredar la zona a propósito: si el edificio está bien ubicado —y los 6 tienen
GPS verificado— un aviso a 4 km probablemente **no es de ese edificio**. El audit los
levanta como matches para revisar.

```
8000472 Condominio Zero 3,98 km · 3428 Westgate 3,68 · 3515 Panorama 3,23
8000473 Bizet 3,02 · 2010 Torre Moderna 2,93 · 8000724 Smart Studio Isuto 2,74
```

**Si no se hace:** siguen con la zona del aviso (que puede ser la correcta) y aparecen en
cada audit. No hacen daño visible.

### B3 · Edificio Sirari Deluxe  ·  *mirar el edificio, no el aviso*

Su proyecto dice `Equipetrol Centro` y sus avisos decían `Sirari`. Heredaron la del
proyecto, así que hoy sus unidades están juntas — pero el nombre sugiere lo contrario. Si
el GPS del proyecto está mal, arrastra a todos sus anuncios.

**Si no se hace:** nada se rompe. Es una duda, no un error confirmado.

---

## C · DEL BACKLOG VIEJO, NO SALIÓ DE ESTE AUDIT (4)

| qué | estado | si no se hace |
|---|---|---|
| **Mig 319** · identidad del CRM sin teléfono | escrita, **no aplicada** | cuando Meta saque el teléfono del payload, los contactos nuevos no se identifican |
| **`claude_readonly` con EXECUTE** en 46 de 49 funciones `SECURITY DEFINER` | detectado hoy | el rol "de solo lectura" puede escribir. No está expuesto a internet, pero contradice lo que el proyecto declara |
| **Alias intrusos** (mig 342) | detectado, no corregido | el fuzzy sigue empatando dos edificios distintos en 1.0 |
| **32 avisos sin área** ocultos por un filtro que trata NULL como "chico" | en `CALIDAD_DATOS_BACKLOG.md` | 32 propiedades reales que nadie ve |

---

## Lo que NO hay que decidir

**El drift no necesita correrse semanal.** 24 días sin correrlo dieron 3-4% de drift y
ningún daño. Cada 2-3 semanas alcanza, y `--limit` ahora trae primero lo más viejo.

**Los duplicados ya estaban marcados.** El dedup los agarró; los jueces los reportaron
mirando el aviso sin consultar la base. No hay nada que hacer ahí.

**Los 34 "matching sospechoso" eran falsas alarmas.** Ni un match equivocado en todo el
audit. Es una señal ruidosa, no un problema de datos.
