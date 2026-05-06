<?php
if (!defined('ABSPATH')) exit;

class Merkahorro_Bridge_Diagnostics {

    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'register_endpoints'));
    }

    public static function register_endpoints() {
        // Diagnóstico: Solo lectura, GET, sin purgar caché
        register_rest_route('merkahorro/v1', '/diagnostico', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'endpoint_diagnostics'),
            'permission_callback' => array('Merkahorro_Bridge_API', 'check_api_key')
        ));
    }

    public static function endpoint_diagnostics($request) {
        // En lugar de vaciar la caché como antes, simplemente leemos lo que hay.
        $current_sede = merkahorro_get_current_sede();
        $host = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '(desconocido)';
        
        $slider_banners = Merkahorro_Bridge_Banners::get_banners('home_slider', $current_sede);
        $tiles_banners  = Merkahorro_Bridge_Banners::get_banners('home_tiles', $current_sede);

        // Test directo a la API externa
        $api_test = wp_remote_get(MERKAHORRO_API_URL . '/content/banners?section=home_tiles', array(
            'timeout' => 10,
            'sslverify' => true // Mejorado de false a true
        ));
        
        $api_status = is_wp_error($api_test) ? $api_test->get_error_message() : wp_remote_retrieve_response_code($api_test);
        $api_body = is_wp_error($api_test) ? null : json_decode(wp_remote_retrieve_body($api_test), true);

        Merkahorro_Bridge_Logger::log_api_call('/diagnostico', array('status' => 'read_only_success'));

        return new WP_REST_Response(array(
            'ok' => true,
            'version' => MERKAHORRO_BRIDGE_VERSION,
            'api_url' => MERKAHORRO_API_URL,
            'host' => $host,
            'sede_detectada' => $current_sede ?: 'ninguna (mostrando todas)',
            'sede_mapa' => json_decode(MERKAHORRO_SEDE_MAP, true),
            'api_tiles_status' => $api_status,
            'api_tiles_response' => $api_body,
            'slider' => array(
                'total_banners' => count($slider_banners),
                'banners' => array_map(function($b) {
                    return array('id' => $b['id'] ?? '', 'title' => $b['title'] ?? '', 'active' => $b['active'] ?? false);
                }, $slider_banners)
            ),
            'tiles' => array(
                'total_tiles' => count($tiles_banners),
                'tiles' => array_map(function($b) {
                    return array('id' => $b['id'] ?? '', 'title' => $b['title'] ?? '', 'active' => $b['active'] ?? false);
                }, $tiles_banners)
            ),
            'shortcodes_registrados' => array(
                'merkahorro_slider' => shortcode_exists('merkahorro_slider'),
                'merkahorro_tiles' => shortcode_exists('merkahorro_tiles'),
            ),
            'nota' => 'Modo seguro: El diagnóstico no limpia la caché. Muestra estado real.',
            'last_sync_hash' => get_option('merkahorro_last_discount_sync_hash')
        ), 200);
    }
}
