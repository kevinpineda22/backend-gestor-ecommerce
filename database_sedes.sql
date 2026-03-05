-- ==============================================================
-- MIGRACIÓN: Sistema Multi-Sede para Gestor Ecommerce
-- Ejecutar en Supabase SQL Editor
-- ==============================================================

-- 1. Tabla de Sedes Ecommerce
CREATE TABLE IF NOT EXISTS sedes_ecommerce (
  id TEXT PRIMARY KEY,                -- 'copacabana', 'girardota', etc.
  nombre TEXT NOT NULL,               -- 'Sede Copacabana Plaza'
  codigo_siesa TEXT NOT NULL,         -- 'PV001' (bodega Siesa)
  lista_precio TEXT NOT NULL,         -- 'P01' (lista de precios Siesa)
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar las 4 sedes iniciales (ajustar códigos Siesa según corresponda)
INSERT INTO sedes_ecommerce (id, nombre, codigo_siesa, lista_precio) VALUES
  ('copacabana',  'Sede Copacabana Plaza', 'PV001', 'P01'),
  ('girardota',   'Sede Girardota',        '00201', 'P02'),
  ('barbosa',     'Sede Barbosa',          '00301', 'P03'),
  ('villahermosa','Sede Villahermosa',      '00401', 'P04')
ON CONFLICT (id) DO NOTHING;

-- 2. Agregar campo 'sede' a profiles (si no existe)
-- NULL = superadmin_ecommerce (ve todas) 
-- 'copacabana' = admin_ecommerce limitado a esa sede
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sede TEXT;

-- 3. Insertar los nuevos roles en role_permissions
-- (ajusta 'permissions' y 'redirect' según tus rutas reales)
INSERT INTO role_permissions (role, permissions, redirect) VALUES
  ('admin_ecommerce', 
   '[{"path": "/ecommerce", "label": "Gestor E-commerce"}]'::jsonb, 
   '/ecommerce'),
  ('superadmin_ecommerce', 
   '[{"path": "/ecommerce", "label": "Gestor E-commerce"}, {"path": "/admin-usuarios", "label": "Administración de Usuarios"}]'::jsonb, 
   '/ecommerce')
ON CONFLICT (role) DO UPDATE SET 
  permissions = EXCLUDED.permissions,
  redirect = EXCLUDED.redirect;

-- ==============================================================
-- NOTAS:
-- - admin_ecommerce: Accede SOLO al gestor, filtrado a SU sede
-- - superadmin_ecommerce: Accede al gestor, ve TODAS las sedes
--   y tiene acceso a admin de usuarios
-- 
-- Para asignar un usuario como admin_ecommerce de Copacabana:
--   UPDATE profiles SET role = 'admin_ecommerce', sede = 'copacabana' 
--   WHERE correo = 'admin.copa@merkahorro.com';
--
-- Para asignar un superadmin_ecommerce:
--   UPDATE profiles SET role = 'superadmin_ecommerce', sede = NULL 
--   WHERE correo = 'jefe.ecommerce@merkahorro.com';
-- ==============================================================
