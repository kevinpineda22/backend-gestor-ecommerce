-- MIGRACIÓN: Agregar soporte multi-sede a banners
-- Ejecutar en Supabase SQL Editor
-- La columna sedes = null significa "aplica a TODAS las sedes"
-- La columna sedes = ["PV001", "00201"] significa "solo esas sedes"

-- Agregar columna sedes a content_banners
ALTER TABLE content_banners 
  ADD COLUMN IF NOT EXISTS sedes jsonb DEFAULT NULL;

COMMENT ON COLUMN content_banners.sedes IS 
  'null = todas las sedes. Array de códigos Siesa: ["PV001","00201","00301","00701"]';

-- NOTA: Los descuentos (discount_rules) NO usan sedes porque FlyCart 
-- aplica las reglas globalmente a toda la tienda sin filtro por sede.
