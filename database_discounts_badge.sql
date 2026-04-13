-- Agregar campos de badge/barra de descuento a discount_rules
-- Ejecutar en Supabase SQL Editor

ALTER TABLE discount_rules
ADD COLUMN IF NOT EXISTS badge_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS badge_text text DEFAULT '',
ADD COLUMN IF NOT EXISTS badge_bg_color text DEFAULT '#160857',
ADD COLUMN IF NOT EXISTS badge_text_color text DEFAULT '#88dc00';

COMMENT ON COLUMN discount_rules.badge_enabled IS 'Mostrar barra de aviso de descuento en páginas de producto';
COMMENT ON COLUMN discount_rules.badge_text IS 'Texto de la insignia. Usa {{discount}} para mostrar el valor del descuento';
COMMENT ON COLUMN discount_rules.badge_bg_color IS 'Color de fondo de la insignia (hex)';
COMMENT ON COLUMN discount_rules.badge_text_color IS 'Color del texto de la insignia (hex)';
