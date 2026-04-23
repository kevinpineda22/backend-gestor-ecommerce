<?php
/**
 * Plugin Name: Merkahorro EcomManager
 * Description: Gestión de banners, descuentos, separatas y páginas de promoción desde Supabase. Versión modular del plugin original merkahorro-banners.php.
 * Version:     2.0
 * Author:      Equipo Desarrollo Merkahorro
 *
 * INSTALACIÓN EN SERVIDOR
 * ───────────────────────
 * 1. Subir este archivo a: wp-content/mu-plugins/merkahorro-ecommanager.php
 * 2. Subir la carpeta merkahorro-ecommanager/ a: wp-content/mu-plugins/
 * 3. Eliminar el archivo antiguo: wp-content/mu-plugins/merkahorro-banners.php
 * 4. Los mu-plugins se cargan automáticamente — no hay que activar nada.
 * 5. Ir a Ajustes → Permalinks → Guardar cambios (registra la rewrite rule de /promo/descuento/).
 *
 * ESTRUCTURA DE ARCHIVOS
 * ──────────────────────
 * mu-plugins/
 *   merkahorro-ecommanager.php              ← este archivo (loader)
 *   merkahorro-ecommanager/
 *     assets/
 *       merkahorro.css                      ← todo el CSS del plugin
 *     includes/
 *       helpers.php                         ← funciones auxiliares y merkahorro_get_banners()
 *       shortcodes-banners.php              ← [merkahorro_slider] + [merkahorro_tiles]
 *       shortcodes-separatas.php            ← [merkahorro_separatas] + exclusión /ofertas/
 *       discounts-endpoints.php             ← GET /clear-cache /diagnostico /wp-banners /woo-discount-rules
 *       discounts-sync.php                  ← POST/DELETE /sync-discount-rules + merkahorro_build_wdr_rule()
 *       promo-page.php                      ← rewrite + template /promo/descuento/{id}/
 */

if (!defined('ABSPATH')) exit;

// ─── Rutas del plugin ─────────────────────────────────────────────────────────
define('MK_PLUGIN_DIR', __DIR__ . '/merkahorro-ecommanager');
define('MK_PLUGIN_URL', content_url('mu-plugins/merkahorro-ecommanager'));

// ─── Configuración global ─────────────────────────────────────────────────────
if (!defined('MERKAHORRO_API_URL')) {
    define('MERKAHORRO_API_URL', 'https://backend-gestor-ecommerce.vercel.app/api');
}
if (!defined('MERKAHORRO_API_KEY')) {
    define('MERKAHORRO_API_KEY', 'merkahorro2026');
}
define('MERKAHORRO_CACHE_TTL', 300); // segundos

// Mapa de dominio → código de sede
if (!defined('MERKAHORRO_SEDE_MAP')) {
    define('MERKAHORRO_SEDE_MAP', json_encode(array(
        'supermercadomerkahorro.com'             => 'PV001',
        'girardota.supermercadomerkahorro.com'   => '00301',
        'barbosa.supermercadomerkahorro.com'     => '00701',
        'villahermosa.supermercadomerkahorro.com'=> '00201',
    )));
}

// ─── Módulos ──────────────────────────────────────────────────────────────────
require_once MK_PLUGIN_DIR . '/includes/helpers.php';
require_once MK_PLUGIN_DIR . '/includes/shortcodes-banners.php';
require_once MK_PLUGIN_DIR . '/includes/shortcodes-separatas.php';
require_once MK_PLUGIN_DIR . '/includes/discounts-endpoints.php';
require_once MK_PLUGIN_DIR . '/includes/discounts-sync.php';
require_once MK_PLUGIN_DIR . '/includes/promo-page.php';
require_once MK_PLUGIN_DIR . '/includes/discount-category-tiles.php';

// ─── CSS global ───────────────────────────────────────────────────────────────
add_action('wp_head', function() {
    $css_file = MK_PLUGIN_DIR . '/assets/merkahorro.css';
    if (file_exists($css_file)) {
        echo "<style id='merkahorro-ecommanager-css'>\n" . file_get_contents($css_file) . "\n</style>\n";
    }
});

// ─── Badge de oferta Merkahorro ───────────────────────────────────────────────
// Prioridad 999: corre después de FlyCart.
// Lógica: si el HTML ya tiene "%" → FlyCart ya lo manejó → no tocar.
//         si no → es el badge genérico de WooCommerce → aplicar branding.
add_filter('woocommerce_sale_flash', function($html, $post, $product) {
    if (strpos($html, '%') !== false) return $html;
    return '<span class="onsale mks-fixed-sale">Oferta Separata</span>';
}, 999, 3);
