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

// Activación: registra la regla de rewrite /promo/descuento/{id}/ y hace flush.
// Sin esto, la URL devuelve 404 hasta que un admin entre a Permalinks y guarde.
function merkahorro_bridge_activate() {
    if (class_exists('Merkahorro_Bridge_Separatas')) {
        Merkahorro_Bridge_Separatas::register_promo_rewrite_rule();
    } else {
        // Fallback si por algún motivo la clase aún no está cargada
        add_rewrite_rule('^promo/descuento/([0-9]+)/?$', 'index.php?merkahorro_promo_id=$matches[1]', 'top');
    }
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'merkahorro_bridge_activate');

// Desactivación: limpia las reglas de rewrite para no dejar URLs colgadas.
function merkahorro_bridge_deactivate() {
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'merkahorro_bridge_deactivate');

// Helper global: detectar sede actual.
// Acepta valores externos SOLO si están dentro de MERKAHORRO_SEDE_MAP.
// Esto cierra el agujero por el que un atacante podía forzar una sede arbitraria vía ?sede= o cookies.
if (!function_exists('merkahorro_get_current_sede')) {
    function merkahorro_get_current_sede() {
        static $sede_cache = null;
        static $valid_codes = null;
        static $sede_map_cache = null;

        if ($sede_cache !== null) {
            return $sede_cache === '' ? null : $sede_cache;
        }

        if ($sede_map_cache === null) {
            $sede_map_cache = json_decode(MERKAHORRO_SEDE_MAP, true) ?: array();
            $valid_codes = array_values($sede_map_cache);
        }

        // 1. Override por querystring — solo si el código es válido
        if (!empty($_GET['sede'])) {
            $candidate = sanitize_text_field($_GET['sede']);
            if (in_array($candidate, $valid_codes, true)) {
                $sede_cache = $candidate;
                return $sede_cache;
            }
        }

        // 2. Por host (fuente de verdad)
        $host = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '';
        $host = preg_replace('/^www\./', '', $host);

        if (isset($sede_map_cache[$host])) {
            $sede_cache = $sede_map_cache[$host];
            return $sede_cache;
        }

        // 3. Cookies como último recurso — también validadas contra el mapa
        foreach (array('sede_codigo', 'wc_sede') as $cookie_name) {
            if (!empty($_COOKIE[$cookie_name])) {
                $candidate = sanitize_text_field($_COOKIE[$cookie_name]);
                if (in_array($candidate, $valid_codes, true)) {
                    $sede_cache = $candidate;
                    return $sede_cache;
                }
            }
        }

        $sede_cache = '';
        return null;
    }
}
