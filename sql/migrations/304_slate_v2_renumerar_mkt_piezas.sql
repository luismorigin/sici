-- =============================================================================
-- 304 · Slate v2 — renumerar mkt_piezas y archivar el v1
-- =============================================================================
-- DECISIÓN DEL FOUNDER (25-jul-2026, opción A): el slate v1 quedó OBSOLETO. Las 32
-- piezas de marzo-abril no se vuelven a publicar; todo el sistema de marketing
-- (piezas, captions, UTM, cronograma, panel) está sobre el slate v2.
--
-- EL PROBLEMA QUE RESUELVE: `mkt_piezas` tenía el slate v1 y el CSV de marketing el
-- v2. **Los mismos números apuntaban a piezas DISTINTAS** — se compararon las 20
-- coincidentes y dieron **0 de 20 iguales** (num 3 = "Los 5 barrios de Equipetrol"
-- en la base vs "¿Barato comparado con qué?" en el slate v2). Con la numeración v1
-- activa, un clic en `/ir/f03` habría precargado en WhatsApp el nombre de OTRA pieza:
-- peor que no atribuir, porque atribuye MAL.
--
-- POR QUÉ ES SEGURO RENUMERAR (verificado en la BD, no asumido):
--   · `mkt_clicks_puente` = **0 filas** → ningún link `/ir` circuló jamás.
--   · `v_atribucion_contactos` con `atribuido=true` = **0** → nada que romper.
--   · Los posts del v1 salieron con `wa.me` directo, no con `/ir`.
--   · Los captions de marketing YA usan la numeración v2 (`f06`, `f42`, `m23`…) →
--     tras esta migración resuelven al nombre correcto sin rehacer nada de su lado.
--
-- 🔴 HALLAZGO NO CONTEMPLADO EN EL PEDIDO: `mkt_assets` (48 filas, los archivos
-- visuales de cada pieza) tiene FK a `mkt_piezas(id)` **ON DELETE CASCADE**. Vaciar
-- `mkt_piezas` se los habría llevado puestos en silencio. Se archivan TAMBIÉN, para
-- cumplir el "no lo borres". (Los archivos en storage no se tocan: acá solo vive el
-- índice de qué asset es de qué pieza.)
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ARCHIVO del slate v1 (no se borra nada: se saca de la numeración activa)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.mkt_piezas_v1_archivo;
CREATE TABLE public.mkt_piezas_v1_archivo AS SELECT * FROM public.mkt_piezas;

DROP TABLE IF EXISTS public.mkt_assets_v1_archivo;
CREATE TABLE public.mkt_assets_v1_archivo AS SELECT * FROM public.mkt_assets;

COMMENT ON TABLE public.mkt_piezas_v1_archivo IS
  'Slate v1 (32 piezas, marzo-abril 2026) con sus captions, fechas y post ids. Obsoleto '
  'desde el 25-jul-2026 (decisión founder): se conserva por valor histórico. La numeración '
  'ACTIVA es el slate v2 en mkt_piezas. Mig 304.';
COMMENT ON TABLE public.mkt_assets_v1_archivo IS
  'Assets visuales de las piezas del slate v1. Se archivan porque mkt_assets tenía FK '
  'ON DELETE CASCADE a mkt_piezas y el vaciado se los habría llevado. Mig 304.';

REVOKE ALL   ON public.mkt_piezas_v1_archivo, public.mkt_assets_v1_archivo FROM anon, authenticated;
GRANT SELECT ON public.mkt_piezas_v1_archivo, public.mkt_assets_v1_archivo TO service_role, claude_readonly;

-- -----------------------------------------------------------------------------
-- 2. Vaciar y cargar el slate v2 (45 piezas: num + nombre)
-- -----------------------------------------------------------------------------
-- No se hace UPDATE de los nombres a propósito: las filas v1 traen captions, fechas
-- de publicación y post ids que pertenecen a OTRAS piezas. Renombrarlas dejaría cada
-- fila con el nombre de una pieza y el historial de otra. Se reemplaza el catálogo.
-- El DELETE cascadea a mkt_assets — ya archivado arriba.
DELETE FROM public.mkt_piezas;

-- El ROL de la tabla cambió: era el planificador detallado del v1 (semana, ángulo,
-- formato, captions por red…). Con el v2 marketing planifica en SU repo y acá solo se
-- necesita el catálogo `num → nombre` que `/ir` usa para precargar el texto de WhatsApp.
-- Esas 4 columnas eran NOT NULL sin default → el INSERT fallaría. Se vuelven opcionales
-- en vez de rellenarlas con valores inventados, que parecerían datos reales.
ALTER TABLE public.mkt_piezas
  ALTER COLUMN semana    DROP NOT NULL,
  ALTER COLUMN angulo    DROP NOT NULL,
  ALTER COLUMN angulo_id DROP NOT NULL,
  ALTER COLUMN formato   DROP NOT NULL;

INSERT INTO public.mkt_piezas (num, nombre) VALUES
  (1, 'Estás viendo medio Equipetrol'),
  (2, 'No te digo si está caro, te muestro cuánto vale'),
  (3, '¿Barato comparado con qué?'),
  (5, 'Llegás a Santa Cruz, te ubico'),
  (6, 'El mapa de precios de Equipetrol'),
  (7, 'Acá nadie te apura'),
  (9, 'Todo el mercado de Equipetrol de un vistazo'),
  (10, '¿Cuántas entran en tu rango?'),
  (11, 'Qué preguntar antes de alquilar'),
  (12, 'Qué preguntar antes de comprar'),
  (14, 'El mapa de Equipetrol por zonas'),
  (15, 'El rango de precios por zona'),
  (17, 'El metro no cuesta lo mismo en todo Equipetrol'),
  (19, 'La mejor la elegís vos'),
  (20, 'Cuántos deptos hay en venta en Equipetrol'),
  (22, 'Llegás sin conocer, te abro Equipetrol'),
  (23, 'Cuánto sale alquilar en Equipetrol'),
  (24, '3 cosas que comparar antes de comprar'),
  (26, '40 pestañas o un solo lugar'),
  (28, 'El aviso te da un número, yo te digo dónde caés'),
  (42, 'Encontrar depto en Equipetrol nunca fue tan fácil'),
  (43, 'Siempre ves los mismos deptos'),
  (44, 'No cometas mi error buscando depto'),
  (45, 'Casi pagamos de más por el depto'),
  (46, 'Pará si estás buscando depto en Equipetrol'),
  (47, 'Yo uso Simón para buscar'),
  (48, 'No busques a ciegas'),
  (49, 'Antes horas, ahora minutos'),
  (50, 'Elegir dónde vivir no debería dar miedo'),
  (51, 'Antes me pasaba horas buscando depto'),
  (52, 'Semanas preguntando uno por uno'),
  (53, 'Comparé como una experta'),
  (54, 'No sabés lo perdida que estaba'),
  (55, 'Tu Excel de deptos ya tiene nombre'),
  (56, 'Visitaste diez, ¿podés compararlos?'),
  (57, 'La mala pregunta antes de una preventa'),
  (58, 'Nunca estuve buscando departamento'),
  (59, 'Cuidé mi plata toda la vida'),
  (60, 'Fatiga inmobiliaria (el comercial)'),
  (61, 'Diagnóstico: fatiga inmobiliaria'),
  (62, 'Expediente: fatiga inmobiliaria'),
  (63, '¿Tenés fatiga inmobiliaria?'),
  (64, 'Cómo prevenir la fatiga inmobiliaria'),
  (65, 'Tres semanas con fatiga inmobiliaria'),
  (66, 'La fatiga inmobiliaria tiene explicación')
ON CONFLICT (num) DO UPDATE SET nombre = EXCLUDED.nombre;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación (correr aparte)
-- -----------------------------------------------------------------------------
--   SELECT COUNT(*) FROM public.mkt_piezas;              -- 45
--   SELECT COUNT(*) FROM public.mkt_piezas_v1_archivo;   -- 32 (histórico intacto)
--   SELECT COUNT(*) FROM public.mkt_assets_v1_archivo;   -- 48 (histórico intacto)
--   SELECT num, nombre FROM public.mkt_piezas ORDER BY num LIMIT 5;
-- Prueba end-to-end: abrir https://simonbo.com/ir/f06 y verificar que el texto
-- precargado en WhatsApp diga el nombre de la pieza 6 del slate v2.
-- -----------------------------------------------------------------------------
-- ROLLBACK: DELETE FROM mkt_piezas;
--           INSERT INTO mkt_piezas SELECT * FROM mkt_piezas_v1_archivo;
--           INSERT INTO mkt_assets SELECT * FROM mkt_assets_v1_archivo;
-- =============================================================================
