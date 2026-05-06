<?php
if (!defined('ABSPATH')) exit;

class Merkahorro_Bridge_Cache_Manager {

    public static function init() {
        // Nada en init por ahora
    }

    /**
     * Limpia transients específicos de Merkahorro sin purgar toda la caché del sitio
     * @param string $type Qué tipo de caché limpiar ('banners', 'discounts', 'all')
     */
    public static function clear_local_transients($type = 'all') {
        global $wpdb;
        
        $sql = "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\_transient\_merkahorro\_%' OR option_name LIKE '\_transient\_timeout\_merkahorro\_%' OR option_name LIKE '\_transient\_mks\_%' OR option_name LIKE '\_transient\_timeout\_mks\_%'";
        
        $wpdb->query($sql);
        Merkahorro_Bridge_Logger::log("Transients locales purgados.", "INFO");
    }

    /**
     * Purga selectiva en LiteSpeed/WP Rocket para una URL o tag
     */
    public static function purge_url_cache($url = '') {
        // Si no se especifica URL, purga la home (para sliders/tiles)
        if (empty($url)) {
            $url = home_url('/');
        }
        
        if (function_exists('rocket_clean_files')) {
            rocket_clean_files($url);
        }
        
        if (has_action('litespeed_purge_url')) {
            do_action('litespeed_purge_url', $url);
        }
        
        Merkahorro_Bridge_Logger::log("Caché de página purgada para: " . $url, "INFO");
    }

    /**
     * Peligroso: solo debe llamarse de forma explícita y no en cada sync.
     * Limpia la caché de objetos y toda la página.
     */
    public static function emergency_global_purge() {
        Merkahorro_Bridge_Logger::log("Ejecutando EMERGENCY GLOBAL PURGE", "WARNING");
        
        self::clear_local_transients();
        
        if (function_exists('wp_cache_flush')) {
            wp_cache_flush();
        }
        
        if (function_exists('rocket_clean_domain')) {
            rocket_clean_domain();
        }
        
        if (has_action('litespeed_purge_all')) {
            do_action('litespeed_purge_all');
        }
        
        if (class_exists('\Elementor\Plugin')) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }
    }
}
