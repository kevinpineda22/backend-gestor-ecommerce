<?php
/**
 * Merkahorro EcomManager — Sincronización de descuentos con FlyCart
 *
 * Registra:
 *   POST   /wp-json/merkahorro/v1/sync-discount-rules — upsert de reglas desde el Gestor
 *   DELETE /wp-json/merkahorro/v1/sync-discount-rules — eliminar reglas del Gestor
 *
 * También define merkahorro_build_wdr_rule() que construye un registro
 * compatible con la tabla wp_wdr_rules de Discount Rules for WooCommerce (FlyCart).
 */

if (!defined('ABSPATH')) exit;

add_action('rest_api_init', function() {

    // ─────────────────────────────────────────────────────────────────────────
    // POST /sync-discount-rules — upsert de reglas
    // ─────────────────────────────────────────────────────────────────────────
    register_rest_route('merkahorro/v1', '/sync-discount-rules', array(
        'methods'             => 'POST',
        'callback'            => function($request) {
            global $wpdb;
            $table  = $wpdb->prefix . 'wdr_rules';
            $prefix = '[MK-Gestor] ';

            $table_exists = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table));
            if (!$table_exists) {
                return new WP_REST_Response(array(
                    'ok'      => false,
                    'message' => 'Tabla wdr_rules no encontrada. Instalar plugin "Discount Rules for WooCommerce".',
                ), 200);
            }

            $rules = $request->get_json_params();
            if (empty($rules) || !is_array($rules)) {
                return new WP_REST_Response(array('ok' => false, 'message' => 'No se recibieron reglas'), 200);
            }

            // PASO 1: reglas existentes del Gestor indexadas por título
            $existing = $wpdb->get_results(
                $wpdb->prepare("SELECT id, title FROM {$table} WHERE title LIKE %s", $prefix . '%'),
                ARRAY_A
            );
            $existing_map = array();
            foreach ($existing as $row) {
                $existing_map[$row['title']] = (int) $row['id'];
            }

            // PASO 1b: Pre-calcular IDs de productos de reglas separata (priority ≤ 5)
            // Las reglas semanales (priority > 5) excluyen estos IDs con not_in_list.
            $separata_product_ids = array();
            foreach ($rules as $_r) {
                $prio = intval($_r['priority'] ?? $_r['display_order'] ?? 50);
                if ($prio <= 5 && !empty($_r['applies_to_ids'])) {
                    foreach ((array) $_r['applies_to_ids'] as $_id) {
                        $separata_product_ids[] = strval($_id);
                    }
                }
            }
            $separata_product_ids = array_values(array_unique($separata_product_ids));

            // PASO 2: Upsert
            $synced   = 0;
            $updated  = 0;
            $created  = 0;
            $errors   = array();
            $processed_titles = array();

            foreach ($rules as $rule) {
                $rule['title'] = $prefix . ($rule['title'] ?? 'Descuento');
                $wdr_data      = merkahorro_build_wdr_rule($rule, $separata_product_ids);

                if (!$wdr_data) {
                    $errors[] = 'Error construyendo regla: ' . ($rule['title'] ?? '?');
                    continue;
                }

                $processed_titles[] = $rule['title'];

                if (isset($existing_map[$rule['title']])) {
                    // Actualizar — NO sobreescribir campos gestionados en FlyCart
                    $rule_id = $existing_map[$rule['title']];
                    unset($wdr_data['created_on'], $wdr_data['created_by'], $wdr_data['advanced_discount_message']);
                    $wpdb->update($table, $wdr_data, array('id' => $rule_id));
                    $updated++;
                } else {
                    $wpdb->insert($table, $wdr_data);
                    $created++;
                }
                $synced++;
            }

            // PASO 3: Eliminar reglas del Gestor que ya no existen en el listado
            foreach ($existing_map as $title => $id) {
                if (!in_array($title, $processed_titles)) {
                    $wpdb->delete($table, array('id' => $id));
                }
            }

            // PASO 4: Limpiar caché del plugin FlyCart
            delete_option('wdr_transient_version');
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_wdr_%',
                    '_transient_timeout_wdr_%'
                )
            );

            // PASO 5: Invalidar caché de precios de WooCommerce (aplica_as = sale_price)
            // Con apply_as='sale_price', FlyCart hookea filtros de precio dinámicamente.
            // WooCommerce cachea rangos de precio de variaciones en wc_var_prices_*.
            // Si ese caché queda viejo, el descuento no se ve en el listado de productos.
            $wpdb->query(
                "DELETE FROM {$wpdb->options}
                 WHERE option_name LIKE '\_transient\_wc\_var\_prices\_%'
                    OR option_name LIKE '\_transient\_timeout\_wc\_var\_prices\_%'"
            );
            delete_transient('wc_products_onsale');
            delete_option('woocommerce_cache_excluded_uris');

            // Incrementar versión de caché de variaciones para forzar recálculo
            $current_version = (int) get_option('wc_var_prices_version', 0);
            update_option('wc_var_prices_version', $current_version + 1);

            if (function_exists('wp_cache_flush')) wp_cache_flush();

            return new WP_REST_Response(array(
                'ok'      => true,
                'synced'  => $synced,
                'updated' => $updated,
                'created' => $created,
                'errors'  => $errors,
                'message' => "Se sincronizaron {$synced} reglas ({$updated} actualizadas, {$created} nuevas).",
            ), 200);
        },
        'permission_callback' => function($request) { return merkahorro_check_api_key($request); },
    ));

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE /sync-discount-rules — eliminar reglas (por título o todas)
    // ─────────────────────────────────────────────────────────────────────────
    register_rest_route('merkahorro/v1', '/sync-discount-rules', array(
        'methods'             => 'DELETE',
        'callback'            => function($request) {
            global $wpdb;
            $table  = $wpdb->prefix . 'wdr_rules';
            $prefix = '[MK-Gestor] ';
            $title  = $request->get_param('title');

            if (empty($title)) {
                // Sin título → eliminar TODAS las reglas del Gestor
                $deleted = $wpdb->query($wpdb->prepare(
                    "DELETE FROM {$table} WHERE title LIKE %s",
                    $prefix . '%'
                ));
            } else {
                $deleted = $wpdb->delete($table, array('title' => $prefix . $title));
            }

            delete_option('wdr_transient_version');
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_wdr_%',
                    '_transient_timeout_wdr_%'
                )
            );

            return new WP_REST_Response(array(
                'ok'      => true,
                'deleted' => $deleted !== false,
                'message' => $deleted ? 'Regla(s) eliminada(s)' : 'No se encontró la regla',
            ), 200);
        },
        'permission_callback' => function($request) { return merkahorro_check_api_key($request); },
    ));

});

// ─────────────────────────────────────────────────────────────────────────────
// merkahorro_build_wdr_rule()
// Construye un registro compatible con wp_wdr_rules a partir de una regla del Gestor.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_build_wdr_rule($rule, $separata_exclude_ids = array()) {
    $title          = $rule['title']          ?? 'Descuento';
    $discount_type  = $rule['discount_type']  ?? 'percentage';
    $discount_value = floatval($rule['discount_value'] ?? 0);
    $applies_to     = $rule['applies_to']     ?? 'all';
    $applies_to_ids = $rule['applies_to_ids'] ?? array();
    $schedule_type  = $rule['schedule_type']  ?? 'always';
    $schedule_days  = $rule['schedule_days']  ?? array();
    $date_start     = $rule['date_start']     ?? null;
    $date_end       = $rule['date_end']       ?? null;
    $active         = !empty($rule['active']) ? '1' : '0';
    $priority       = intval($rule['priority'] ?? $rule['display_order'] ?? 50);

    // Badge / barra de descuento
    $badge_enabled    = isset($rule['badge_enabled'])    ? ($rule['badge_enabled']    ? '1' : '0') : '0';
    $badge_text       = $rule['badge_text']       ?? '';
    $badge_bg_color   = $rule['badge_bg_color']   ?? '#160857';
    $badge_text_color = $rule['badge_text_color'] ?? '#88dc00';

    // ── Filters: a qué productos aplica ──────────────────────────────────────
    $filters      = array();
    $wdr_apply_to = 'all_products';

    if ($applies_to === 'categories' && !empty($applies_to_ids)) {
        $wdr_apply_to = 'specific_products';
        $filters[] = array(
            'type'     => 'product_category',
            'method'   => 'in_list',
            'value'    => array_map('strval', $applies_to_ids),
            'cartQty'  => 'product',
        );
    } elseif ($applies_to === 'products' && !empty($applies_to_ids)) {
        $wdr_apply_to = 'specific_products';
        $filters[] = array(
            'type'    => 'products',
            'method'  => 'in_list',
            'value'   => array_map('strval', $applies_to_ids),
            'cartQty' => 'product',
        );
    }

    // Reglas semanales (priority > 5) sobre todos los productos: excluir los que
    // ya tiene una separata activa → sin stacking, sin necesidad de exclusive global.
    if ($priority > 5 && $wdr_apply_to === 'all_products' && !empty($separata_exclude_ids)) {
        $filters[] = array(
            'type'    => 'products',
            'method'  => 'not_in_list',
            'value'   => $separata_exclude_ids,
            'cartQty' => 'product',
        );
        $wdr_apply_to = 'specific_products';
    }

    // ── Conditions: cuándo aplica ─────────────────────────────────────────────
    $conditions  = array();
    $day_name_map = array(
        0 => 'sunday',    1 => 'monday',  2 => 'tuesday',
        3 => 'wednesday', 4 => 'thursday', 5 => 'friday', 6 => 'saturday',
    );

    if ($schedule_type === 'days' && !empty($schedule_days)) {
        $day_names = array();
        foreach ($schedule_days as $d) {
            if (isset($day_name_map[(int) $d])) $day_names[] = $day_name_map[(int) $d];
        }
        $conditions = array(
            2 => array(
                'type'    => 'order_days',
                'options' => array('operator' => 'in_list', 'value' => $day_names),
            ),
        );
    } elseif ($schedule_type === 'date_range') {
        // Para date_range NO usamos la condición 'order_date_and_time'.
        // El control se hace exclusivamente via date_from/date_to (columnas de la tabla),
        // que son timestamps UTC calculados correctamente desde la zona horaria de Colombia.
        // Usar la condición además causaría un error de ±5h porque FlyCart interpreta las
        // cadenas de fecha como UTC midnight, no como medianoche Colombia.
        // → $conditions queda vacío; FlyCart usará solo las columnas date_from/date_to.
    } elseif ($schedule_type === 'cart_condition') {
        $cart_cond_type  = $rule['cart_condition_type']  ?? 'subtotal';
        $cart_cond_value = floatval($rule['cart_condition_value'] ?? 0);
        if ($cart_cond_type === 'subtotal' && $cart_cond_value > 0) {
            $conditions = array(
                2 => array(
                    'type'    => 'subtotal',
                    'options' => array(
                        'operator'     => 'greater_than_or_equal',
                        'value'        => strval($cart_cond_value),
                        'cart_context' => 'cart_total',
                    ),
                ),
            );
        }
    }

    // ── Product adjustments: el descuento ─────────────────────────────────────
    // apply_as = 'sale_price': FlyCart evalúa la regla por producto.
    // exclusive = 1 en separatas (priority ≤ 5): si aplica, bloquea la regla semanal
    // para ESE producto. Combinado con not_in_list en semanales → sin stacking.
    $product_adjustments = array(
        'type'       => ($discount_type === 'percentage') ? 'percentage' : 'flat',
        'value'      => strval($discount_value),
        'apply_as'   => 'sale_price',
        'cart_label' => $title,
    );

    // ── Fechas para columnas date_from / date_to ──────────────────────────────
    // FlyCart compara date_from/date_to contra time() del servidor (UTC).
    // Convertir zona local configurada en WordPress → timestamp UTC.
    $wdr_date_from = null;
    $wdr_date_to   = null;
    if ($schedule_type === 'date_range') {
        $tz = get_option('timezone_string') ?: 'America/Bogota';
        try { $dtz = new DateTimeZone($tz); } catch (Exception $e) { $dtz = new DateTimeZone('America/Bogota'); }
        if ($date_start) {
            $dt = new DateTime($date_start . ' 00:00:00', $dtz);
            $wdr_date_from = $dt->getTimestamp();
        }
        if ($date_end) {
            $dt = new DateTime($date_end . ' 23:59:59', $dtz);
            $wdr_date_to = $dt->getTimestamp();
        }
    }

    $now = current_time('mysql');

    return array(
        'title'                       => $title,
        'enabled'                     => $active,
        // Separatas (priority ≤ 5) → exclusive=1 para bloquear la regla semanal en esos productos.
        // Semanales (priority > 5) → exclusive=0 para no bloquearse entre sí.
        'exclusive'                   => ($priority <= 5) ? '1' : '0',
        'priority'                    => $priority,
        'apply_to'                    => $wdr_apply_to,
        'filters'                     => wp_json_encode($filters ?: new stdClass()),
        'conditions'                  => wp_json_encode(!empty($conditions) ? $conditions : new stdClass()),
        'product_adjustments'         => wp_json_encode($product_adjustments),
        'cart_adjustments'            => '',
        'buy_x_get_x_adjustments'     => '',
        'buy_x_get_y_adjustments'     => '',
        'bulk_adjustments'            => '',
        'set_adjustments'             => '',
        'other_discounts'             => '',
        'date_from'                   => $wdr_date_from,
        'date_to'                     => $wdr_date_to,
        'usage_limits'                => '',
        'rule_language'               => wp_json_encode(array()),
        'additional'                  => wp_json_encode(array('condition_relationship' => 'and')),
        'max_discount_sum'            => '',
        'advanced_discount_message'   => wp_json_encode(array(
            'display'            => $badge_enabled,
            'badge_color_option' => 'custom',
            'badge_color'        => $badge_bg_color,
            'badge_text_color'   => $badge_text_color,
            'badge_text'         => $badge_text,
        )),
        'discount_type'               => 'wdr_simple_discount',
        'used_coupons'                => '',
        'created_by'                  => get_current_user_id() ?: 0,
        'created_on'                  => $now,
        'modified_by'                 => get_current_user_id() ?: 0,
        'modified_on'                 => $now,
    );
}
