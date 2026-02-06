-- Migración 130: Sistema de autenticación admin
-- Tabla admin_users con roles y RLS

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('super_admin', 'supervisor', 'viewer')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);

-- RLS: solo usuarios autenticados pueden leer su propia fila
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users_self_read" ON admin_users
  FOR SELECT USING (auth.email() = email);

-- Permitir UPDATE de last_login para el propio usuario
CREATE POLICY "admin_users_self_update_login" ON admin_users
  FOR UPDATE USING (auth.email() = email)
  WITH CHECK (auth.email() = email);

-- Insertar primer super_admin
INSERT INTO admin_users (email, nombre, rol) VALUES
  ('directorcasapatio@gmail.com', 'Admin Principal', 'super_admin');
