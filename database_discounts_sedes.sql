-- Agregar columna 'sedes' a discount_rules
-- null = aplica a TODAS las sedes
-- jsonb array = sedes específicas, ej: ["PV001", "00301"]
-- Ejecutar en Supabase SQL Editor

ALTER TABLE discount_rules
ADD COLUMN IF NOT EXISTS sedes jsonb DEFAULT NULL;

COMMENT ON COLUMN discount_rules.sedes IS 'null = todas las sedes, array de códigos = sedes específicas';
