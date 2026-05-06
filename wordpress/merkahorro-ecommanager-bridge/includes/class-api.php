<?php
if (!defined('ABSPATH')) exit;

class Merkahorro_Bridge_API {

    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'register_endpoints'));
    }

    public static function is_admin() {
        return is_user_logged_in() && current_user_can('manage_woocommerce');
    }

    public static function check_api_key($request) {
        $key = $request->get_header('X-API-Key');
        if (!$key) $key = $request->get_param('key');
        
        $valid = self::is_admin() || ($key && $key === MERKAHORRO_API_KEY);
        
        if (!$valid) {
            Merkahorro_Bridge_Logger::log("Acceso denegado a la API. Key inválida.", "WARNING");
        }
        
        return $valid;
    }

    public static function register_endpoints() {
        // ENDPOINT: Limpiar caché selectiva o manual (POST en lugar de GET)
        register_rest_route('merkahorro/v1', '/clear-cache', array(
            'methods' => 'POST', // CAMBIO IMPORTANTE: Ahora es POST
            'callback' => array(__CLASS__, 'endpoint_clear_cache'),
            'permission_callback' => array(__CLASS__, 'check_api_key')
        ));
    }

    public static function endpoint_clear_cache($request) {
        $force_global = $request->get_param('force_global') === 'true';
        $target_url = $request->get_param('url');
        
        Merkahorro_Bridge_Logger::log_api_call('/clear-cache', array('force_global' => $force_global, 'url' => $target_url));

        if ($force_global) {
            Merkahorro_Bridge_Cache_Manager::emergency_global_purge();
            $msg = 'Caché GLOBAL limpiada';
        } else {
            // Limpieza selectiva (por defecto)
            Merkahorro_Bridge_Cache_Manager::clear_local_transients();
            Merkahorro_Bridge_Cache_Manager::purge_url_cache($target_url); // Purga la home o URL específica
            $msg = 'Caché LOCAL purgada (transients y URLs específicas)';
        }

        return new WP_REST_Response(array('ok' => true, 'message' => $msg), 200);
    }
}
