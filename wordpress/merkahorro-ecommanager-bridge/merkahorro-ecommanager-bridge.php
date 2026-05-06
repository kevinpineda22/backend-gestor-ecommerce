<?php
/**
 * Plugin Name: Merkahorro EcomManager Bridge
 * Description: Integración segura entre el Gestor Ecommerce (Supabase API) y WooCommerce. Gestiona banners, tiles y sincronización de descuentos.
 * Version: 2.1
 * Author: Equipo Desarrollo
 * Text Domain: merkahorro-bridge
 *
 * NOTA: Esta es la versión refactorizada como plugin estándar (antes era mu-plugin).
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

define('MERKAHORRO_BRIDGE_VERSION', '2.1');
define('MERKAHORRO_BRIDGE_PATH', plugin_dir_path(__FILE__));
define('MERKAHORRO_BRIDGE_URL', plugin_dir_url(__FILE__));

// Configuración global (ajustar en wp-config.php en producción)
if (!defined('MERKAHORRO_API_URL')) {
    define('MERKAHORRO_API_URL', 'https://backend-gestor-ecommerce.vercel.app/api');
}
if (!defined('MERKAHORRO_CACHE_TTL')) {
    define('MERKAHORRO_CACHE_TTL', 3600); // Subido a 1 hora (antes 5 mins)
}
if (!defined('MERKAHORRO_API_KEY')) {
    define('MERKAHORRO_API_KEY', 'merkahorro2026');
}

// Mapa de sedes
if (!defined('MERKAHORRO_SEDE_MAP')) {
    define('MERKAHORRO_SEDE_MAP', json_encode(array(
        'supermercadomerkahorro.com'              => 'PV001',
        'girardota.supermercadomerkahorro.com'     => '00301',
        'barbosa.supermercadomerkahorro.com'       => '00701',
        'villahermosa.supermercadomerkahorro.com'   => '00201',
    )));
}

// Cargar dependencias (clases modulares)
require_once MERKAHORRO_BRIDGE_PATH . 'includes/class-logger.php';
require_once MERKAHORRO_BRIDGE_PATH . 'includes/class-cache-manager.php';
require_once MERKAHORRO_BRIDGE_PATH . 'includes/class-api.php';
require_once MERKAHORRO_BRIDGE_PATH . 'includes/class-banners.php';
require_once MERKAHORRO_BRIDGE_PATH . 'includes/class-separatas.php';
require_once MERKAHORRO_BRIDGE_PATH . 'includes/class-discount-sync.php';
require_once MERKAHORRO_BRIDGE_PATH . 'includes/class-diagnostics.php';

// Inicializar el plugin
function merkahorro_bridge_init() {
    // Instanciar clases principales
    Merkahorro_Bridge_Logger::init();
    Merkahorro_Bridge_Cache_Manager::init();
    Merkahorro_Bridge_API::init();
    Merkahorro_Bridge_Banners::init();
    Merkahorro_Bridge_Separatas::init();
    Merkahorro_Bridge_Discount_Sync::init();
    Merkahorro_Bridge_Diagnostics::init();
}
add_action('plugins_loaded', 'merkahorro_bridge_init');

// Helper global: detectar sede actual (mismo código base que antes, pero más limpio)
if (!function_exists('merkahorro_get_current_sede')) {
    function merkahorro_get_current_sede() {
        static $sede_cache = null;
        static $sede_map_cache = null;

        if ($sede_cache !== null) {
            return $sede_cache === '' ? null : $sede_cache;
        }

        if (!empty($_GET['sede'])) {
            $sede_cache = sanitize_text_field($_GET['sede']);
            return $sede_cache;
        }

        if ($sede_map_cache === null) {
            $sede_map_cache = json_decode(MERKAHORRO_SEDE_MAP, true) ?: array();
        }
        
        $host = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '';
        $host = preg_replace('/^www\./', '', $host);
        
        if (isset($sede_map_cache[$host])) {
            $sede_cache = $sede_map_cache[$host];
            return $sede_cache;
        }

        if (!empty($_COOKIE['sede_codigo'])) {
            $sede_cache = sanitize_text_field($_COOKIE['sede_codigo']);
            return $sede_cache;
        }
        if (!empty($_COOKIE['wc_sede'])) {
            $sede_cache = sanitize_text_field($_COOKIE['wc_sede']);
            return $sede_cache;
        }

        $sede_cache = '';
        return null;
    }
}
