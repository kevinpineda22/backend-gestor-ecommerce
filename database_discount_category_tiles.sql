-- ═══════════════════════════════════════════════════════════════════════════
-- Merkahorro EcomManager — Tabla: discount_category_tiles
-- ═══════════════════════════════════════════════════════════════════════════
-- Propósito: controlar los tiles (cuadros de imagen) que aparecen en la parte
--   superior de la página /categoria-producto/descuentos-especiales/ en cada
--   sede de WooCommerce.
--
-- Cada tile puede asignarse a sedes específicas o a todas (sedes = NULL).
-- El plugin de WordPress los consume vía GET /api/content/discount-tiles?sede=PV001
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS discount_category_tiles (
    id              SERIAL PRIMARY KEY,

    -- Título descriptivo para el gestor (no se muestra en el sitio)
    title           VARCHAR(255)    NOT NULL DEFAULT '',

    -- URL de la imagen del tile (almacenada en Supabase Storage o externa)
    image_url       TEXT            NOT NULL DEFAULT '',

    -- URL de destino al hacer clic (puede ser vacío = sin enlace)
    link_url        TEXT            NOT NULL DEFAULT '',

    -- Alt text para la imagen (accesibilidad)
    alt_text        VARCHAR(255)    NOT NULL DEFAULT '',

    -- Texto encima/debajo de la imagen (opcional — para nombre de categoría)
    label           VARCHAR(100)    NOT NULL DEFAULT '',

    -- Orden de visualización (menor número = primero)
    display_order   INTEGER         NOT NULL DEFAULT 0,

    -- Estado activo/inactivo
    active          BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Sedes que ven este tile.
    -- NULL = todas las sedes.
    -- Array de códigos, ej: '["PV001","00301"]'
    sedes           TEXT[]          NULL,

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Índice para consultas frecuentes (activo + orden)
CREATE INDEX IF NOT EXISTS idx_dct_active_order
    ON discount_category_tiles (active, display_order);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_dct_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dct_updated_at ON discount_category_tiles;

CREATE TRIGGER trg_dct_updated_at
    BEFORE UPDATE ON discount_category_tiles
    FOR EACH ROW EXECUTE FUNCTION update_dct_updated_at();

-- ─── Datos de ejemplo (tiles que se ven en la captura de pantalla) ────────────
-- Ajustar las image_url a las URLs reales almacenadas en Supabase Storage

INSERT INTO discount_category_tiles (title, image_url, link_url, label, alt_text, display_order, active, sedes) VALUES
    ('Próximos Eventos',     '',  '/proximos-eventos',                 'Próximos Eventos',   'Próximos Eventos',    1, FALSE, NULL),
    ('Marca Propia',         '',  '/categoria-producto/marca-propia/', 'Marca Propia',       'Marca Propia',        2, FALSE, NULL),
    ('Días Especiales',      '',  '/categoria-producto/dias-especiales/','Días Especiales',  'Días Especiales',     3, FALSE, NULL),
    ('Conoce nuestras sedes','',  '/sedes',                            'Conoce nuestras sedes','Conoce nuestras sedes',4, FALSE, NULL),
    ('Ofertas Especiales',   '',  '/categoria-producto/descuentos-especiales/','Ofertas Especiales','Ofertas Especiales',5, FALSE, NULL)
ON CONFLICT DO NOTHING;

-- ─── Row Level Security (RLS) — recomendado para Supabase ────────────────────
-- El backend Node.js usa service_role key que omite RLS.
-- El plugin de WordPress usa SOLO lectura vía la clave pública de la API.

ALTER TABLE discount_category_tiles ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (la API pública puede leer tiles activos)
CREATE POLICY "Lectura pública discount_category_tiles"
    ON discount_category_tiles
    FOR SELECT
    USING (TRUE);

-- Escritura solo desde el service role (el backend Node.js)
CREATE POLICY "Escritura service role discount_category_tiles"
    ON discount_category_tiles
    FOR ALL
    USING (auth.role() = 'service_role');
