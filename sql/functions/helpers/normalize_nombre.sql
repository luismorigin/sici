-- Funciones: normalize_nombre + normalizar_nombre_edificio
-- Última migración: 022
-- Exportado de producción: 27 Feb 2026
-- Dominio: Helper / Normalización nombres para fuzzy matching

-- =============================================
-- normalize_nombre: Versión simple (pg_trgm compatible)
-- =============================================
CREATE OR REPLACE FUNCTION public.normalize_nombre(texto text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
  DECLARE
      v_texto TEXT;
  BEGIN
      IF texto IS NULL THEN
          RETURN NULL;
      END IF;

      -- 1. Lowercase PRIMERO
      v_texto := lower(texto);

      -- 2. Remover prefijos comunes
      v_texto := regexp_replace(v_texto, 'condominio|edificio|torre|residencia|residencial|departamento|depto|dto', '', 'g');

      -- 3. Remover numeros romanos al final
      v_texto := regexp_replace(v_texto, '\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)$', '', 'g');

      -- 4. Remover caracteres no alfanumericos
      v_texto := regexp_replace(v_texto, '[^a-z0-9áéíóúñü]', '', 'g');

      RETURN v_texto;
  END;
  $function$;

-- =============================================
-- normalizar_nombre_edificio: Versión avanzada (matching alquiler)
-- Strip prefijos, sufijos geográficos, acentos, espacios
-- =============================================
CREATE OR REPLACE FUNCTION public.normalizar_nombre_edificio(texto text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_texto TEXT;
BEGIN
    IF texto IS NULL OR TRIM(texto) = '' THEN
        RETURN NULL;
    END IF;

    v_texto := LOWER(TRIM(texto));

    -- Normalizar acentos comunes
    v_texto := REPLACE(v_texto, 'á', 'a');
    v_texto := REPLACE(v_texto, 'é', 'e');
    v_texto := REPLACE(v_texto, 'í', 'i');
    v_texto := REPLACE(v_texto, 'ó', 'o');
    v_texto := REPLACE(v_texto, 'ú', 'u');
    v_texto := REPLACE(v_texto, 'ü', 'u');
    v_texto := REPLACE(v_texto, 'ö', 'o');

    -- Strip prefijos (solo al inicio)
    v_texto := regexp_replace(v_texto,
        '^\s*(condominio|edificio|torre|residencia|residencial|hotel|departamento|depto|dto|cond\.?|edif\.?|multifamiliar)\s+',
        '', 'i');

    -- Strip sufijos geográficos (solo al final)
    v_texto := regexp_replace(v_texto,
        '\s+(equipetrol|sirari|isuto|canal\s+isuto|norte|sur)\s*$',
        '', 'i');

    -- Remover caracteres no alfanuméricos (mantener ñ)
    v_texto := regexp_replace(v_texto, '[^a-z0-9ñ\s]', '', 'g');

    -- Collapse y remover espacios
    v_texto := regexp_replace(v_texto, '\s+', '', 'g');

    v_texto := TRIM(v_texto);

    IF v_texto = '' THEN RETURN NULL; END IF;

    RETURN v_texto;
END;
$function$;
