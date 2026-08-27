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
-- 🔑 ALCANCE: **80 de 86**. Se corrigen las de baja también (una prop dada de baja
-- puede reactivarse y volvería con la zona mal); sólo `status='completado'` y sólo
-- cuando hay proyecto asignado.
--
-- 🔴 LAS 6 QUE QUEDAN AFUERA, Y POR QUÉ. Un pin del portal se corre unos metros o un
-- par de cuadras; no se va a 4 km. Distribución de las 86:
--
--        39  a menos de 500 m      ← el pin corrido, el caso normal
--        25  entre 500 m y 1 km
--        16  entre 1 y 2 km
--         6  entre 2,7 y 4,0 km    ← NO se tocan
--
-- Las 6 lejanas son **todas de Zona Norte** y todas con el GPS del edificio
-- **verificado visualmente** (`gps_verificado_visual = confirmed`). O sea: el
-- edificio está bien ubicado y el aviso queda a 4 km. Lo que falla ahí no es el pin,
-- es el MATCH — esa propiedad probablemente no es de ese edificio. Heredar la zona
-- no arreglaría nada: le pondría la etiqueta de un edificio ajeno y encima haría
-- parecer coherente un match dudoso. Van al audit, que tiene la superficie de
-- "avisos lejos de su edificio" justamente para esto.
--
--     8000472 Condominio Zero 3,98 · 3428 Westgate 3,68 · 3515 Panorama 3,23
--     8000473 Bizet 3,02 · 2010 Torre Moderna 2,93 · 8000724 Smart Studio Isuto 2,74
--
-- El cargador aplica el mismo corte (`KM_MAX_PARA_HEREDAR = 2` en
-- `lib/zona-del-proyecto.mjs`), así que esto y la captura nocturna deciden igual.
--
-- ⚠️ ESTO CONFÍA EN EL GPS DEL PROYECTO. Si un PM tiene mal su ubicación, el UPDATE
-- propaga ese error a todos sus anuncios. Es el comportamiento correcto —el edificio
-- es la fuente de verdad— pero significa que un PM mal ubicado ahora se nota más.
-- Caso a mirar: **Edificio Sirari Deluxe**, cuyo proyecto dice `Equipetrol Centro`
-- mientras sus avisos dicen `Sirari`. El nombre sugiere Sirari; el GPS del PM dice
-- otra cosa. Está a 0,6 km, así que entra en el UPDATE — pero conviene revisarlo.
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
       round((ST_Distance(
         ST_SetSRID(ST_MakePoint(p.longitud,p.latitud),4326)::geography,
         ST_SetSRID(ST_MakePoint(pm.longitud,pm.latitud),4326)::geography)/1000)::numeric,2) AS km_al_edificio,
       CASE WHEN ST_Distance(
         ST_SetSRID(ST_MakePoint(p.longitud,p.latitud),4326)::geography,
         ST_SetSRID(ST_MakePoint(pm.longitud,pm.latitud),4326)::geography) > 2000
         THEN 'NO se toca -> revisar el match' ELSE 'se corrige' END AS que_pasa
FROM propiedades_v2 p
JOIN proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
WHERE pm.zona IS NOT NULL AND pm.zona <> 'Sin zona'
  AND p.zona IS DISTINCT FROM pm.zona
  AND p.status = 'completado'
  AND NOT _is_campo_bloqueado(p.campos_bloqueados, 'zona')
ORDER BY km_al_edificio DESC, pm.nombre_oficial, p.id;
-- Esperado: 86 filas -> 80 "se corrige" + 6 "NO se toca" (medido el 27-ago 11:00).


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
   AND NOT _is_campo_bloqueado(p.campos_bloqueados, 'zona')
   -- El corte por DISTANCIA (ver cabecera): a mas de 2 km lo que falla es el match,
   -- no el pin. Mismo umbral que el cargador. Sin GPS no se puede medir -> se hereda,
   -- que es lo que hacia antes de existir este control.
   AND (p.latitud IS NULL OR pm.latitud IS NULL
        OR ST_Distance(ST_SetSRID(ST_MakePoint(p.longitud,p.latitud),4326)::geography,
                       ST_SetSRID(ST_MakePoint(pm.longitud,pm.latitud),4326)::geography) <= 2000);

-- 🔴 MIRAR EL CONTEO ANTES DE COMMIT. Debe decir **80** (86 menos las 6 lejanas).
-- Si dice 86, el filtro de distancia no se aplicó → ROLLBACK. Si dice mucho más,
-- algo se movió entre la foto previa y el UPDATE → ROLLBACK y volver a mirar.
COMMIT;


-- ── 3 · VERIFICACIÓN (después) ──────────────────────────────────────────────
-- a) Deben quedar EXACTAMENTE 6, las lejanas, y a propósito. Si da 0, se corrigieron
--    de más; si da 86, no se corrigió nada.
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
