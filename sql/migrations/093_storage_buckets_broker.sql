-- ============================================
-- Migración 093: Buckets Storage para Broker
-- Fecha: 2026-01-31
-- Propósito: Crear buckets para PDFs y fotos de perfil broker
-- ============================================

-- NOTA: Ejecutar con usuario con permisos de storage admin
-- O crear manualmente en Supabase Dashboard > Storage

-- ============================================
-- 1. Bucket para PDFs generados
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdfs-broker',
  'pdfs-broker',
  true,  -- Público para compartir
  10485760, -- 10MB máximo
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Política: Cualquiera puede leer PDFs públicos
CREATE POLICY "PDFs broker públicos"
ON storage.objects FOR SELECT
USING (bucket_id = 'pdfs-broker');

-- Política: Brokers autenticados pueden subir sus PDFs
CREATE POLICY "Brokers suben PDFs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'pdfs-broker'
  AND auth.role() = 'authenticated'
);

-- Política: Brokers pueden actualizar sus PDFs
CREATE POLICY "Brokers actualizan PDFs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'pdfs-broker'
  AND auth.role() = 'authenticated'
);

-- ============================================
-- 2. Bucket para fotos de perfil broker
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'broker-profile',
  'broker-profile',
  true,  -- Público para mostrar en PDFs
  5242880, -- 5MB máximo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Política: Cualquiera puede ver fotos de perfil
CREATE POLICY "Fotos perfil públicas"
ON storage.objects FOR SELECT
USING (bucket_id = 'broker-profile');

-- Política: Brokers suben sus fotos
CREATE POLICY "Brokers suben fotos perfil"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'broker-profile'
  AND auth.role() = 'authenticated'
);

-- Política: Brokers actualizan sus fotos
CREATE POLICY "Brokers actualizan fotos perfil"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'broker-profile'
  AND auth.role() = 'authenticated'
);

-- Política: Brokers eliminan sus fotos
CREATE POLICY "Brokers eliminan fotos perfil"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'broker-profile'
  AND auth.role() = 'authenticated'
);

-- ============================================
-- INSTRUCCIONES MANUALES (si SQL no funciona)
-- ============================================
/*
En Supabase Dashboard > Storage:

1. Crear bucket "pdfs-broker":
   - Name: pdfs-broker
   - Public: Yes
   - File size limit: 10MB
   - Allowed MIME types: application/pdf

2. Crear bucket "broker-profile":
   - Name: broker-profile
   - Public: Yes
   - File size limit: 5MB
   - Allowed MIME types: image/jpeg, image/png, image/webp

3. Policies (para cada bucket):
   - SELECT: Allow for all (public)
   - INSERT: Allow for authenticated
   - UPDATE: Allow for authenticated
   - DELETE: Allow for authenticated (solo broker-profile)
*/

-- ============================================
-- FIN MIGRACIÓN 093
-- ============================================
