# Mesa de Guerra + Informe de Mercado — manual de uso

**Qué es:** el paquete de venta B2B para desarrolladoras (Equipetrol). Un tablero interactivo + un informe imprimible, los dos alimentados por la **misma data** verificada del motor SICI.
**Estado:** prototipo funcional con data REAL congelada al corte **3-ago-2026**. Sirve hoy para presentar y vender; no es todavía producto auto-actualizable (ver §Refrescar).
**Nació en:** sesión del 3-4 ago 2026 (rama `worktree-analisis-data-engine-moat`). Contexto estratégico: `ANALISIS_DATA_ENGINE_MOAT.md` · rigor estadístico: `AUDITORIA_ESTADISTICA_MESA_INFORME.md`.

---

## Los 3 archivos — VIAJAN JUNTOS

| Archivo | Qué es |
|---|---|
| `mesa-de-guerra.html` | El tablero interactivo (5 escenas, 6 capas, modo Presentar) |
| `mockup-informe-mercado.html` | El informe/documento — se llena solo al abrirse |
| `mesa-data.js` | **La fuente única**: data del corte + META + CTX. Los dos HTML la cargan |

🔴 **Si copiás los HTML a otra carpeta (pendrive, escritorio), copiá también `mesa-data.js`** — sin él, las páginas quedan vacías. Los tres en la misma carpeta, siempre.

## Cómo usar la Mesa en una reunión

1. Doble clic en `mesa-de-guerra.html` (se abre en Chrome, no necesita internet).
2. **⛶** (arriba a la derecha) = pantalla completa. Equivale a F11.
3. **🎬 Presentar** = el guion de 12 pasos con subtítulos. Avanzás con **clic, espacio o flecha derecha**; ESC sale. La barra de subtítulos se **arrastra** si tapa algo y se **minimiza** con "▁" (cualquier clic en la píldora la restaura).
4. Fuera del modo presentar, todo es explorable: capas, buscador de edificios, zoom con rueda, clic en edificio = radiografía con libro de unidades (pestañas Venta | Alquiler), simulador con radio 300/500/800 m, pestaña El Canal, Máquina del Tiempo.
5. Todo número con **ⓘ** es tocable: muestra su pedigrí (qué es, método, límite).

## Cómo generar el PDF del informe

1. Abrir `mockup-informe-mercado.html` en Chrome.
2. **Ctrl+P → Guardar como PDF** (activar "Gráficos de fondo" si los colores no salen). El CSS de impresión ya limpia watermark, botones y saltos de página.

## Cómo personalizar el informe para un cliente

Opción rápida: abrirlo con `?cliente=` en la URL, por ejemplo:
```
mockup-informe-mercado.html?cliente=Constructora%20Andina%20SRL
```
Opción permanente: editar el nombre default en el HTML (buscar `cliente-nombre`, está en un solo lugar).

## Refrescar la data (hoy: manual, 1 pedido a Claude)

La data está congelada al 3-ago. Para actualizar el corte o clonar a **Zona Norte**:
- **Todo vive en `mesa-data.js`** — las dos vistas no se tocan nunca.
- El pedido a Claude Code: *"regenerá mesa-data.js con el corte de hoy"* (o *"para Zona Norte"*). Las queries salen de las vistas shadow (`v_mercado_venta_shadow` / `v_mercado_alquiler_shadow` + `proyectos_master` + `market_price_reexpresado`) y la estructura del archivo documenta qué es cada bloque.
- El archivo trae un **self-test en la consola del navegador** (`[CTX self-test]`): compara lo calculado contra valores de referencia — si algo diverge al refrescar, avisa.
- En `META` (arriba del archivo) están los ~10 hechos del corte que no se derivan de la data embebida (total del feed, salidas del mes, entregas vencidas…) — son lo único que se declara a mano, una sola vez.

La productización real (que se refresque solo cada noche desde la BD, con acceso por token) está diseñada pero **gated a que alguien pague el primer informe** — plan comercial en la conversación de la sesión y §10 de `docs/backlog/PRODUCTO_INFORME_MERCADO.md`.

## Modelo comercial (resumen de lo decidido)

- **Puerta:** informe personalizado (el pricing vigente está en `PRODUCTO_INFORME_MERCADO.md` §10: setup USD 1.500 + suscripción 250/mes, sube tras el mes 6).
- **Regla de cobro:** 50% al confirmar, 50% contra entrega (lección Condado). Cobrable en Bs al TC paralelo del día.
- **Regla fiduciaria:** nadie paga por aparecer mejor; si piden "maquillar", la respuesta es no.
- El guion de venta ES el modo 🎬 Presentar (los 12 pasos = el pitch de 20 minutos).

## Relación con el informe viejo de Condado (marzo 2026)

**Ninguna — son cosas distintas y no se pisan.** El de marzo (`docs/reports/INFORME_INTERACTIVO_CONDADO_VI.html`, estudios y PPTX) fue un entregable puntual ya enviado al cliente: queda como histórico, intacto. Este paquete es la **plataforma** de la que saldrán los próximos informes. Cuando Condado vuelva a la mesa, se le genera uno nuevo desde acá (`?cliente=Condado VI`), no se toca el viejo.

## Qué le falta para dejar de ser "mockup"

1. Refresco automático nocturno (leer las vistas shadow en vivo, ISR o script).
2. Acceso controlado (token/magic link — diseño en `PRODUCTO_INFORME_MERCADO.md` §7).
3. Zona Norte (regenerar `mesa-data.js` con esa macrozona — las vistas ya lo soportan).
4. Los datos "en captura" declarados en el informe: plan de pagos del desarrollador, expensas.
