-- =============================================================================
-- 27-ago-2026 · La zona de un aviso matcheado la manda su EDIFICIO
-- =============================================================================
-- Lo levantó lab-kapso auditando una incoherencia del bot: el mismo edificio
-- figuraba en zonas distintas. Onix Art By EliTe, 12 anuncios — 10 en Sirari, uno
-- en Eq. 3er Anillo, uno en Equipetrol Centro. Un edificio, una dirección, tres
-- zonas.
--
-- CAUSA: el cargador escribía la zona calculada desde el GPS **del aviso**, y el
-- pin que publican los portales suele estar corrido. Ya está arreglado para lo que
-- venga (commit c804353, `lib/zona-del-proyecto.mjs`); esto corrige lo ya cargado.
--
-- 🔑 ALCANCE: 86 filas en 46 edificios — 57 activas y 29 de baja. Se corrigen las
-- de baja también: una prop dada de baja puede reactivarse, y volvería con la zona
-- mal. Sólo `status='completado'` y sólo cuando hay proyecto asignado.
--
-- ⚠️ ESTO CONFÍA EN EL GPS DEL PROYECTO. Si un proyecto master tiene mal su
-- ubicación, este UPDATE propaga ese error a todos sus anuncios. Es el
-- comportamiento correcto —el edificio es la fuente de verdad— pero significa que
-- un PM mal ubicado ahora se nota más. Caso a mirar: **Edificio Sirari Deluxe**,
-- cuyo proyecto dice `Equipetrol Centro` mientras sus avisos dicen `Sirari`. El
-- nombre sugiere Sirari; el GPS del PM dice otra cosa. No se resuelve acá.
--
-- 🔴 `'Sin zona'` NO se hereda. Ese valor significa dos cosas distintas — "no se
-- pudo calcular" y "el edificio está fuera de todos los polígonos, correctamente"
-- — y de los proyectos que lo tienen, 18 de 19 son del segundo caso. Heredarlo
-- sacaría al aviso del feed sin que nada falle.
--
-- 🔴 NO se toca el GPS del aviso. Sigue siendo el del aviso, y está bien: de ahí
-- depende el pin del mapa y la alarma de "avisos lejos de su PM". Sólo cambia la
-- ZONA, que es una etiqueta de pertenencia y no una coordenada.
-- =============================================================================

-- ── 1 · FOTO PREVIA (correr ANTES, guardar el resultado) ────────────────────
SELECT p.id, p.zona AS zona_antes, pm.zona AS zona_despues, pm.nombre_oficial,
       p.es_activa, p.tipo_operacion,
       CASE WHEN p.id >= 8000000 THEN 'hibrido' ELSE 'n8n viejo' END AS origen
FROM propiedades_v2 p
JOIN proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
WHERE pm.zona IS NOT NULL AND pm.zona <> 'Sin zona'
  AND p.zona IS DISTINCT FROM pm.zona
  AND p.status = 'completado'
  AND NOT _is_campo_bloqueado(p.campos_bloqueados, 'zona')
ORDER BY pm.nombre_oficial, p.id;
-- Esperado: 86 filas / 46 edificios (medido el 27-ago 11:00).


-- ── 2 · EL UPDATE ───────────────────────────────────────────────────────────
BEGIN;

UPDATE propiedades_v2 p
   SET zona = pm.zona,
       -- Queda registrado en el crudo POR QUÉ cambió: dentro de un mes, "¿quién le
       -- cambió la zona a esta prop?" no debería ser una pregunta sin respuesta.
       datos_json = jsonb_set(
         coalesce(p.datos_json, '{}'::jsonb),
         '{trazabilidad,zona_heredada_del_pm}',
         to_jsonb(format('%s → %s el 2026-08-27 (pin del aviso corrido)', p.zona, pm.zona)),
         true)
  FROM proyectos_master pm
 WHERE pm.id_proyecto_master = p.id_proyecto_master
   AND pm.zona IS NOT NULL
   AND pm.zona <> 'Sin zona'
   AND p.zona IS DISTINCT FROM pm.zona
   AND p.status = 'completado'
   -- Regla #1: los candados se respetan SIEMPRE. Hoy no hay ninguno con la zona
   -- bloqueada (verificado), pero el filtro va igual — mañana puede haberlo, y la
   -- función es la del proyecto, no un `? 'zona'` improvisado que no distingue
   -- el formato objeto con `bloqueado: true`.
   AND NOT _is_campo_bloqueado(p.campos_bloqueados, 'zona');

-- 🔴 MIRAR EL CONTEO ANTES DE COMMIT. Debe decir 86. Si dice mucho más, algo se
-- movió entre la foto previa y el UPDATE → ROLLBACK y volver a mirar.
COMMIT;


-- ── 3 · VERIFICACIÓN (después) ──────────────────────────────────────────────
-- a) No debe quedar ninguna:
--    SELECT count(*) FROM propiedades_v2 p
--      JOIN proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
--     WHERE pm.zona IS NOT NULL AND pm.zona <> 'Sin zona'
--       AND p.zona IS DISTINCT FROM pm.zona AND p.status='completado'
--       AND NOT _is_campo_bloqueado(p.campos_bloqueados,'zona');
--
-- b) Ningún edificio del feed debe quedar en dos zonas (era 13, debe dar 0):
--    WITH feed AS (
--      SELECT id_proyecto_master AS pm, zona FROM v_mercado_venta_shadow WHERE id_proyecto_master IS NOT NULL
--      UNION ALL SELECT id_proyecto_master, zona FROM v_mercado_alquiler_shadow WHERE id_proyecto_master IS NOT NULL)
--    SELECT count(*) FROM (SELECT pm FROM feed GROUP BY pm HAVING count(DISTINCT zona) > 1) x;
--
-- c) Onix Art queda entero en Sirari:
--    SELECT p.zona, count(*) FROM propiedades_v2 p
--      JOIN proyectos_master pm ON pm.id_proyecto_master=p.id_proyecto_master
--     WHERE pm.nombre_oficial = 'Onix Art By EliTe' GROUP BY 1;
--
-- d) Eq. 3er Anillo baja de 3 a 1 (queda sólo el hotel Casa Blanca):
--    SELECT count(*) FROM v_mercado_venta_shadow WHERE zona='Eq. 3er Anillo';
--    SELECT count(*) FROM v_mercado_alquiler_shadow WHERE zona='Eq. 3er Anillo';


-- ── 4 · CÓMO VOLVER ATRÁS ───────────────────────────────────────────────────
-- La zona anterior queda escrita en el crudo de cada fila, así que se reconstruye:
--    SELECT id, datos_json #>> '{trazabilidad,zona_heredada_del_pm}' AS cambio
--      FROM propiedades_v2
--     WHERE datos_json #>> '{trazabilidad,zona_heredada_del_pm}' IS NOT NULL;
--
-- ⚠️ Y OJO: revertir sin revertir también el cargador (c804353) no sirve de nada —
-- la próxima captura vuelve a heredar la zona del edificio, que es lo correcto.
