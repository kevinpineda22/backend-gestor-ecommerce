<?php
if (!defined('ABSPATH')) exit;

class Merkahorro_Bridge_Discount_Sync {

    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'register_endpoints'));
    }

    public static function register_endpoints() {
        register_rest_route('merkahorro/v1', '/sync-discount-rules', array(
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'sync_rules'),
                'permission_callback' => array('Merkahorro_Bridge_API', 'check_api_key')
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array(__CLASS__, 'delete_rules'),
                'permission_callback' => array('Merkahorro_Bridge_API', 'check_api_key')
            )
        ));

        register_rest_route('merkahorro/v1', '/woo-discount-rules', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_rules'),
            'permission_callback' => array('Merkahorro_Bridge_API', 'check_api_key')
        ));
    }

    public static function delete_rules($request) {
        global $wpdb;
        $table = $wpdb->prefix . 'wdr_rules';
        $prefix = '[MK-Gestor] ';
        $title = $request->get_param('title');
        $delete_all = $request->get_param('delete_all') === 'true' || $request->get_param('delete_all') === true;

        // Borrado masivo requiere flag explícito — protege contra errores de integración.
        if (empty($title) && !$delete_all) {
            Merkahorro_Bridge_Logger::log_api_call('/sync-discount-rules (DELETE)', array('status' => 'rejected', 'reason' => 'missing title or delete_all=true'));
            return new WP_REST_Response(array(
                'ok' => false,
                'message' => 'Para borrar todas las reglas envía delete_all=true explícitamente.'
            ), 400);
        }

        if (empty($title)) {
            $deleted = $wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE title LIKE %s", $prefix . '%'));
        } else {
            $deleted = $wpdb->delete($table, array('title' => $prefix . $title));
        }

        delete_option('wdr_transient_version');
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", '_transient_wdr_%', '_transient_timeout_wdr_%'));

        // Invalidar caché propia de los listados
        delete_transient('merkahorro_woo_discount_rules');
        delete_transient('mks_separata_ids_v1');

        Merkahorro_Bridge_Logger::log_api_call('/sync-discount-rules (DELETE)', array(
            'title' => $title,
            'delete_all' => $delete_all,
            'deleted' => $deleted,
        ));

        return new WP_REST_Response(array('ok' => true, 'deleted' => $deleted !== false, 'message' => $deleted ? 'Regla(s) eliminada(s)' : 'No se encontró'), 200);
    }

    public static function get_rules($request = null) {
        global $wpdb;
        $table = $wpdb->prefix . 'wdr_rules';

        if (!$wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table))) {
            return new WP_REST_Response(array('ok' => false, 'message' => 'Tabla wdr_rules no encontrada', 'data' => array()), 200);
        }

        // Cache de respuesta — invalidada en sync_rules() y delete_rules().
        // Permitir bypass con ?fresh=true para diagnóstico.
        $fresh = $request && ($request->get_param('fresh') === 'true' || $request->get_param('fresh') === true);
        $cache_key = 'merkahorro_woo_discount_rules';

        if (!$fresh) {
            $cached = get_transient($cache_key);
            if ($cached !== false) {
                return new WP_REST_Response($cached, 200);
            }
        }

        // Solo leemos las columnas que vamos a procesar.
        $rules = $wpdb->get_results(
            "SELECT id, title, enabled, priority, filters, conditions, product_adjustments, advanced_discount_message, date_from, date_to
             FROM {$table} ORDER BY priority ASC",
            ARRAY_A
        );
        if (empty($rules)) {
            $empty_payload = array('ok' => true, 'data' => array(), 'total' => 0);
            set_transient($cache_key, $empty_payload, 5 * MINUTE_IN_SECONDS);
            return new WP_REST_Response($empty_payload, 200);
        }

        $parsed = array();
        foreach ($rules as $rule) {
            $filters = json_decode($rule['filters'] ?? '{}', true);
            $conditions = json_decode($rule['conditions'] ?? '[]', true);
            $discounts = json_decode($rule['product_adjustments'] ?? '{}', true);
            $adv_message = json_decode($rule['advanced_discount_message'] ?? '{}', true);

            $discount_type = ($discounts['type'] ?? '') === 'percentage' ? 'percentage' : 'fixed';
            $discount_value = floatval($discounts['value'] ?? 0);

            $category_ids = array(); $category_names = array(); $product_ids = array(); $product_names = array();
            foreach ($filters as $filter) {
                if (($filter['type'] ?? '') === 'product_category') {
                    foreach ($filter['value'] ?? array() as $cat_id) {
                        if ($term = get_term((int)$cat_id, 'product_cat')) { $category_ids[] = (int)$cat_id; $category_names[] = $term->name; }
                    }
                } elseif (($filter['type'] ?? '') === 'products') {
                    foreach ($filter['value'] ?? array() as $prod_id) {
                        if ($prod_post = get_post((int)$prod_id)) { $product_ids[] = (int)$prod_id; $product_names[] = $prod_post->post_title; }
                    }
                }
            }

            $schedule_type = 'always'; $schedule_days = array(); $date_start = null; $date_end = null; $cart_condition_type = null; $cart_condition_value = 0;
            $day_reverse_map = array('sunday' => 0, 'monday' => 1, 'tuesday' => 2, 'wednesday' => 3, 'thursday' => 4, 'friday' => 5, 'saturday' => 6);
            
            $flat_conds = array();
            foreach ($conditions as $item) {
                if (is_array($item) && isset($item['type'])) $flat_conds[] = $item;
                elseif (is_array($item)) foreach ($item as $sub) if (is_array($sub) && isset($sub['type'])) $flat_conds[] = $sub;
            }

            foreach ($flat_conds as $cond) {
                $cond_type = $cond['type'] ?? ''; $cond_options = $cond['options'] ?? array();
                if ($cond_type === 'order_days') {
                    $schedule_type = 'days';
                    foreach ($cond_options['value'] ?? array() as $name) if (isset($day_reverse_map[strtolower($name)])) $schedule_days[] = $day_reverse_map[strtolower($name)];
                }
                if ($cond_type === 'order_date' || $cond_type === 'order_date_and_time') {
                    $schedule_type = 'date_range'; $date_start = $cond['from'] ?? ($cond_options['from'] ?? null); $date_end = $cond['to'] ?? ($cond_options['to'] ?? null);
                }
                if ($cond_type === 'subtotal' || $cond_type === 'cart_subtotal') {
                    $schedule_type = 'cart_condition'; $cart_condition_type = 'subtotal'; $cart_condition_value = floatval($cond_options['value'] ?? $cond['value'] ?? 0);
                }
            }

            $parsed[] = array(
                'woo_rule_id' => (int)$rule['id'], 'title' => $rule['title'] ?? '(Sin título)',
                'discount_type' => $discount_type, 'discount_value' => $discount_value,
                'applies_to' => !empty($product_ids) ? 'products' : (!empty($category_ids) ? 'categories' : 'all'),
                'applies_to_ids' => !empty($product_ids) ? $product_ids : $category_ids,
                'applies_to_names' => !empty($product_ids) ? $product_names : $category_names,
                'schedule_type' => $schedule_type, 'schedule_days' => $schedule_days,
                'date_start' => $date_start, 'date_end' => $date_end,
                'cart_condition_type' => $cart_condition_type, 'cart_condition_value' => $cart_condition_value,
                'active' => ($rule['enabled'] ?? '1') === '1', 'priority' => (int)($rule['priority'] ?? 0),
                'badge_enabled' => ($adv_message['display'] ?? '0') === '1', 'badge_text' => $adv_message['badge_text'] ?? '',
                'badge_bg_color' => $adv_message['badge_color'] ?? '#160857', 'badge_text_color' => $adv_message['badge_text_color'] ?? '#88dc00',
            );
        }

        $payload = array('ok' => true, 'data' => $parsed, 'total' => count($parsed));
        set_transient($cache_key, $payload, 5 * MINUTE_IN_SECONDS);
        return new WP_REST_Response($payload, 200);
    }

    public static function sync_rules($request) {
        global $wpdb;
        $table = $wpdb->prefix . 'wdr_rules';
        $prefix = '[MK-Gestor] ';

        $table_exists = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table));
        if (!$table_exists) {
            return new WP_REST_Response(array('ok' => false, 'message' => 'Tabla wdr_rules no encontrada.'), 200);
        }

        $rules = $request->get_json_params();
        if (!is_array($rules)) {
            return new WP_REST_Response(array('ok' => false, 'message' => 'Payload inválido: se esperaba un array de reglas'), 400);
        }

        // Payload vacío puede ser legítimo (limpiar todo) o un bug del cliente.
        // Lo permitimos solo con el flag explícito sync_empty=true para evitar borrados accidentales.
        if (empty($rules)) {
            $allow_empty = $request->get_param('sync_empty') === 'true' || $request->get_param('sync_empty') === true;
            if (!$allow_empty) {
                Merkahorro_Bridge_Logger::log_api_call('/sync-discount-rules', array('status' => 'rejected', 'reason' => 'empty payload without sync_empty=true'));
                return new WP_REST_Response(array(
                    'ok' => false,
                    'message' => 'Payload vacío. Para borrar todas las reglas envía sync_empty=true explícitamente.'
                ), 400);
            }
        }

        // Generar un hash del payload para ver si cambió respecto a la última vez
        $payload_hash = md5(json_encode($rules));
        $last_hash = get_option('merkahorro_last_discount_sync_hash');

        if ($payload_hash === $last_hash) {
            Merkahorro_Bridge_Logger::log_api_call('/sync-discount-rules', array('status' => 'skipped', 'reason' => 'No hay cambios en el payload (Hash idéntico)'));
            return new WP_REST_Response(array(
                'ok' => true,
                'synced' => 0,
                'message' => 'Sincronización omitida: Las reglas enviadas no han cambiado.'
            ), 200);
        }

        // El payload cambió, procesar...
        
        // --- NUEVA LÓGICA: Convertir SKUs a IDs locales de WooCommerce ---
        foreach ($rules as &$r) {
            if (($r['applies_to'] ?? '') === 'products' && !empty($r['applies_to_ids'])) {
                $local_ids = array();
                foreach ((array)$r['applies_to_ids'] as $sku_or_id) {
                    $sku_or_id = strval($sku_or_id);
                    // 1. Intentar buscar por SKU
                    if (function_exists('wc_get_product_id_by_sku')) {
                        $local_id = wc_get_product_id_by_sku($sku_or_id);
                        if ($local_id) {
                            $local_ids[] = $local_id;
                            continue; // Encontrado por SKU, pasar al siguiente
                        }
                    }
                    // 2. Fallback: Si no se encontró por SKU, verificar si es un ID válido en esta sede
                    if (is_numeric($sku_or_id)) {
                        $post_type = get_post_type((int)$sku_or_id);
                        if ($post_type === 'product' || $post_type === 'product_variation') {
                            $local_ids[] = (int)$sku_or_id;
                        }
                    }
                }
                // Reemplazamos los SKUs/IDs originales por los IDs locales válidos de esta sede
                $r['applies_to_ids'] = $local_ids;
            }
        }
        unset($r); // Romper la referencia
        // -----------------------------------------------------------------

        $existing = $wpdb->get_results($wpdb->prepare("SELECT id, title FROM {$table} WHERE title LIKE %s", $prefix . '%'), ARRAY_A);
        $existing_map = array();
        foreach ($existing as $row) {
            $existing_map[$row['title']] = (int) $row['id'];
        }

        $separata_product_ids = array();
        foreach ($rules as $_r) {
            $prio = intval($_r['priority'] ?? $_r['display_order'] ?? 50);
            if ($prio <= 5 && !empty($_r['applies_to_ids'])) {
                foreach ((array)$_r['applies_to_ids'] as $_id) {
                    $separata_product_ids[] = strval($_id);
                }
            }
        }
        $separata_product_ids = array_values(array_unique($separata_product_ids));

        $synced = 0; $updated = 0; $created = 0; $errors = array();
        $processed_titles = array();

        // Necesitamos la función helper para construir la regla wdr
        if (!function_exists('merkahorro_build_wdr_rule')) {
            require_once MERKAHORRO_BRIDGE_PATH . 'includes/wdr-helper.php';
        }

        foreach ($rules as $rule) {
            $rule['title'] = $prefix . ($rule['title'] ?? 'Descuento');
            
            $wdr_data = merkahorro_build_wdr_rule($rule, $separata_product_ids);
            if (!$wdr_data) {
                $errors[] = 'Error construyendo regla: ' . ($rule['title'] ?? '?');
                continue;
            }

            $processed_titles[] = $rule['title'];

            if (isset($existing_map[$rule['title']])) {
                $rule_id = $existing_map[$rule['title']];
                unset($wdr_data['created_on']);
                unset($wdr_data['created_by']);
                unset($wdr_data['advanced_discount_message']);
                $wpdb->update($table, $wdr_data, array('id' => $rule_id));
                $updated++;
            } else {
                $wpdb->insert($table, $wdr_data);
                $created++;
            }
            $synced++;
        }

        // Eliminar las que ya no están
        foreach ($existing_map as $title => $id) {
            if (!in_array($title, $processed_titles)) {
                $wpdb->delete($table, array('id' => $id));
            }
        }

        // Guardar el hash nuevo
        update_option('merkahorro_last_discount_sync_hash', $payload_hash);

        // Limpieza de caché FlyCart (Selectiva y localizada)
        delete_option('wdr_transient_version');
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", '_transient_wdr_%', '_transient_timeout_wdr_%'));

        // Limpiar caché de WooCommerce de precios variables solo para evitar problemas visuales de precios cacheados
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '\_transient\_wc\_var\_prices\_%' OR option_name LIKE '\_transient\_timeout\_wc\_var\_prices\_%'");
        delete_transient('wc_products_onsale');

        // Invalidar nuestras cachés propias (listado de reglas + separatas)
        delete_transient('merkahorro_woo_discount_rules');
        delete_transient('mks_separata_ids_v1');

        // Log de la operación
        Merkahorro_Bridge_Logger::log_api_call('/sync-discount-rules', array('synced' => $synced, 'updated' => $updated, 'created' => $created));

        return new WP_REST_Response(array(
            'ok' => true,
            'synced' => $synced,
            'updated' => $updated,
            'created' => $created,
            'errors' => $errors,
            'message' => "Se sincronizaron {$synced} reglas ({$updated} actualizadas, {$created} nuevas)."
        ), 200);
    }
}
