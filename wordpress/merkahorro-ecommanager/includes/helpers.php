<?php
/**
 * Merkahorro EcomManager — Helpers globales
 *
 * Contiene: detección de sede, autenticación de API key y
 * obtención de banners desde Supabase con caché.
 */

if (!defined('ABSPATH')) exit;

// ─────────────────────────────────────────────────────────────────────────────
// Detectar la sede activa del WordPress actual.
// Prioridad: 1) query param ?sede=  2) subdominio  3) cookie
// WC()->session se omite intencionalmente — inicializarlo en visitas anónimas
// fuerza creación de sesiones en BD, saturando consultas.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_get_current_sede() {
    static $sede_cache     = null;
    static $sede_map_cache = null;

    if ($sede_cache !== null) {
        return $sede_cache === '' ? null : $sede_cache;
    }

    // 1. Query param (testing: ?sede=PV001)
    if (!empty($_GET['sede'])) {
        $sede_cache = sanitize_text_field($_GET['sede']);
        return $sede_cache;
    }

    // 2. Subdominio
    if ($sede_map_cache === null) {
        $sede_map_cache = json_decode(MERKAHORRO_SEDE_MAP, true) ?: array();
    }
    $host = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '';
    $host = preg_replace('/^www\./', '', $host);
    if (isset($sede_map_cache[$host])) {
        $sede_cache = $sede_map_cache[$host];
        return $sede_cache;
    }

    // 3. Cookie
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

// ─────────────────────────────────────────────────────────────────────────────
// Devuelve true si el usuario logueado tiene rol de administrador WooCommerce.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_is_admin() {
    return is_user_logged_in() && current_user_can('manage_woocommerce');
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature flag: devuelve true solo en Villahermosa.
// Úsalo para envolver funcionalidades en validación antes de desplegar a
// todas las sedes. Una vez validado, reemplaza por return true.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_is_dev_sede() {
    static $cache = null;
    if ($cache !== null) return $cache;
    $host  = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : '';
    $cache = (strpos($host, 'villahermosa') !== false);
    return $cache;
}

// ─────────────────────────────────────────────────────────────────────────────
// Valida la API key en solicitudes REST.
// Acepta: header X-API-Key, query param ?key=, o admin logueado.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_check_api_key($request) {
    $key = $request->get_header('X-API-Key');
    if (!$key) $key = $request->get_param('key');
    return merkahorro_is_admin() || ($key && $key === MERKAHORRO_API_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Obtiene banners/tiles desde el backend (Supabase) con caché de 5 min.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_get_banners($section = 'home_slider', $sede = null) {
    $sede_key  = $sede ? sanitize_key($sede) : 'all';
    $cache_key = 'merkahorro_banners_' . sanitize_key($section) . '_' . $sede_key;
    $cached    = get_transient($cache_key);

    if ($cached !== false) {
        return $cached;
    }

    $url = MERKAHORRO_API_URL . '/content/banners?section=' . urlencode($section);
    if ($sede) {
        $url .= '&sede=' . urlencode($sede);
    }

    $response = wp_remote_get($url, array('timeout' => 10, 'sslverify' => false));

    if (is_wp_error($response)) {
        error_log('Merkahorro EcomManager — API error: ' . $response->get_error_message());
        return array();
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);

    if (!isset($body['ok']) || !$body['ok'] || empty($body['data'])) {
        return array();
    }

    $banners = array_filter($body['data'], function($b) { return !empty($b['active']); });
    usort($banners, function($a, $b) { return ($a['display_order'] ?? 0) - ($b['display_order'] ?? 0); });

    set_transient($cache_key, $banners, MERKAHORRO_CACHE_TTL);
    return $banners;
}
