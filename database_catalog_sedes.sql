-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Activación de productos POR SEDE + credenciales WC
-- ═══════════════════════════════════════════════════════════════
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columna active_sedes (JSONB) a ecommerce_products
-- Almacena: { "PV001": true, "00301": false, "00701": true, "00201": false }
ALTER TABLE ecommerce_products 
  ADD COLUMN IF NOT EXISTS active_sedes jsonb DEFAULT '{}';

-- 2. Migrar datos existentes: productos activos se asignan a TODAS las sedes
--    (Porque actualmente todas las sedes comparten los mismos productos en WooCommerce)
UPDATE ecommerce_products 
SET active_sedes = '{"PV001": true, "00301": true, "00701": true, "00201": true}'::jsonb 
WHERE ecommerce_active = true;

-- 3. Índice GIN para consultas eficientes sobre el JSONB
CREATE INDEX IF NOT EXISTS idx_ecommerce_active_sedes 
  ON ecommerce_products USING gin (active_sedes);

-- 4. Agregar credenciales WooCommerce por sede a wc_sedes
--    Cada sede tiene su propio WordPress con su propio WooCommerce REST API
ALTER TABLE wc_sedes ADD COLUMN IF NOT EXISTS wc_url text;
ALTER TABLE wc_sedes ADD COLUMN IF NOT EXISTS wc_consumer_key text;
ALTER TABLE wc_sedes ADD COLUMN IF NOT EXISTS wc_consumer_secret text;

-- 5. Poblar las URLs (las credenciales las pone el usuario desde Supabase)
UPDATE wc_sedes SET wc_url = 'https://supermercadomerkahorro.com' WHERE codigo_siesa = 'PV001';
UPDATE wc_sedes SET wc_url = 'https://girardota.supermercadomerkahorro.com' WHERE codigo_siesa = '00301';
UPDATE wc_sedes SET wc_url = 'https://barbosa.supermercadomerkahorro.com' WHERE codigo_siesa = '00701';
UPDATE wc_sedes SET wc_url = 'https://villahermosa.supermercadomerkahorro.com' WHERE codigo_siesa = '00201';
