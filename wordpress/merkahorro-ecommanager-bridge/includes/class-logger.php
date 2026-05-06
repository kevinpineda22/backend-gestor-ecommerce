<?php
if (!defined('ABSPATH')) exit;

class Merkahorro_Bridge_Logger {

    public static function init() {
        // Inicialización, si es necesaria
    }

    /**
     * Escribe un mensaje en el debug.log de WordPress
     */
    public static function log($message, $level = 'INFO') {
        if (WP_DEBUG === true) {
            $date = current_time('Y-m-d H:i:s');
            $formatted_message = "[Merkahorro Bridge][$level] $message";
            error_log($formatted_message);
        }
    }

    /**
     * Log de acceso a la API (Auditoría)
     */
    public static function log_api_call($endpoint, $details = array()) {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field($_SERVER['REMOTE_ADDR']) : 'Unknown IP';
        $sede = merkahorro_get_current_sede() ?: 'General';
        
        $log_entry = sprintf(
            "API CALL | Endpoint: %s | Sede: %s | IP: %s | Detalles: %s",
            $endpoint,
            $sede,
            $ip,
            json_encode($details)
        );
        
        self::log($log_entry, 'AUDIT');
    }
}
