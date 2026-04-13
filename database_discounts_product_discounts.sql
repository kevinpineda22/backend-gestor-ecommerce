-- Migración: Agregar columna product_discounts a discount_rules
-- Ejecutar en Supabase SQL Editor
-- 
-- Esta columna almacena descuentos individuales por producto para el tipo "value_discount"
-- Formato JSONB: [{ sku, variation, woo_product_id, name, discount_amount }]

ALTER TABLE discount_rules
ADD COLUMN IF NOT EXISTS product_discounts jsonb DEFAULT '[]'::jsonb;

-- Comentario descriptivo
COMMENT ON COLUMN discount_rules.product_discounts IS 
'Descuentos individuales por producto. Usado cuando discount_type = value_discount. Formato: [{sku, variation, woo_product_id, name, discount_amount}]';

-- Nota: discount_type ahora acepta 3 valores:
--   'percentage' - descuento porcentual (valor global)
--   'fixed'      - descuento fijo en pesos (valor global)  
--   'value_discount' - descuento por valor individual (usa product_discounts)
