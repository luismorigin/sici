# /cron-casas — Captura de casas ZN en una sesión (bajo Max, $0)

> **Fuente de verdad** de este comando. Copialo a `.claude/commands/cron-casas.md` para usarlo
> como `/cron-casas` (las skills viven gitignored en `.claude/commands/`; el repo guarda el `.command.md`).
>
> **Qué es:** corre el cron de casas ZN COMPLETO dentro de la sesión. El único paso que necesita
> "modelo" (el MOAT) lo hacés VOS (el agente) leyendo las descripciones → **$0, bajo la suscripción
> Max, sin API, sin servidor**. Pensado para correr cada 1-3 días (casas es bajo volumen, no tiempo real).

## Pasos (ejecutá en orden, todo desde `scripts/casas-zn/`)

> Primera vez en una máquina nueva: `cd scripts/casas-zn && npm install`.

### 1. Discovery + diff + detalle (read-only, no escribe)
```
node cron-casas-zn.mjs
```
Mirá el resumen: `NUEVAS`, `desaparecidas`, y `detalle OK`. Si NUEVAS=0 y no hay desaparecidas nuevas,
podés saltar al paso 5 (igual conviene correr el verificador).

### 2. Preparar input del MOAT
```
node -e 'const fs=require("fs");const f=fs.readdirSync("output").filter(x=>x.startsWith("cron-casas-dryrun")).sort().pop();const j=JSON.parse(fs.readFileSync("output/"+f,"utf8"));const slug=(u)=>u.match(/\/propiedad\/([^?]+)/)?.[1]||u;fs.writeFileSync("output/moat-input.json",JSON.stringify(j.detalladas.filter(d=>d.fetch_ok).map((d,i)=>({n:i+1,fuente:d.fuente,slug:slug(d.url),m2_const:d.area_const_m2,m2_terreno:d.area_terreno_m2,precio_fuente_usd:d.precio_fuente_usd,desc:(d.descripcion||"").replace(/\s+/g," ").trim()})),null,1));console.log("nuevas a MOAT:",j.detalladas.filter(d=>d.fetch_ok).length)'
```

### 3. MOAT (lo hacés VOS leyendo `output/moat-input.json`) → `output/moat-output.json`
Para cada casa, aplicá el prompt `scripts/llm-enrichment/prompt-casas-vivienda-v4.md` y el GATE:
- **GATE (rechazar, `gate.acepta=false`):** anticrético, alquiler, o departamento (no casa). Es lo más
  importante — un error acá mete basura al feed.
- **Precio:** la descripción manda. `precio_billete_usd` + `precio_en_texto`. Si el texto no da precio →
  `precio_en_texto=false` (el loader cae a metadata coherente).
- **TC:** `"tc 7"`/6.96 = **oficial**; `"tc 9"`/`"TCP"`/`"dólares físicos"`/`"paralelo"` = **paralelo**; resto `no_especificado`.
- **Resto:** `es_condominio_cerrado` (estricto), `nombre_condominio_mencionado`, `estado`, `amenidades`
  (canónicas: piscina/jardin/churrasquera/dependencia_servicio/garage), `amenidades_condominio`, `caracteristicas_extra`.
Escribí `output/moat-output.json` con el MISMO formato que el existente (campo `resultados[]` con
`n, slug, fuente, gate{acepta,razon}` + los campos MOAT). El archivo actual es el **gold standard** de referencia.

### 4. Cargar las nuevas (dry-run → revisás el resumen → --apply)
```
node cargar-casas-nuevas.mjs            # dry-run: muestra qué cargaría (legible)
node cargar-casas-nuevas.mjs --apply    # escribe (INSERT-only) + verifica feed/aislamiento
```

### 5. Verificador (baja con contador + gracia 2d)
```
node verificador-casas.mjs              # dry-run
node verificador-casas.mjs --apply      # marca pending / baja confirmada / revive
```

### 6. Registrar en el log
Agregá UNA línea a `scripts/casas-zn/cron-casas-log.md` con la fecha y los números
(nuevas, cargadas, retenidas, pending, baja, feed antes→después). Formato: ver el archivo.

### 7. Commit del log (para que el historial sea durable/versionado)
El log está trackeado; commiteá la línea nueva para que perdure (no se pierda en un reset, se vea en GitHub):
```
git add scripts/casas-zn/cron-casas-log.md scripts/casas-zn/output/moat-output.json
git commit -m "chore(cron-casas): log <fecha> (N nuevas, M cargadas)"
```
(Push opcional, con OK del usuario.)

### 8. Reportar al usuario
Resumen corto: cuántas nuevas, cargadas, retenidas (con motivo), bajas, y el estado del feed.

## Reglas
- **$0:** todo corre bajo Max en la sesión. NO usar API ni `--apply` automático fuera de sesión.
- **Seguridad:** los `.mjs` son INSERT-only / candado-safe / con verificación. El MOAT es el único
  juicio — sé estricto con el GATE.
- Contexto completo: `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md` §11 + `docs/proyectos/zona-norte/BACKLOG.md`.
