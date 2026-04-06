<?php
/**
 * Plugin Name: Merkahorro Discount Rules Sync
 * Description: Sincroniza reglas de descuento desde el Gestor Ecommerce hacia FlyCart (Discount Rules for WooCommerce).
 * Version: 1.0
 * Author: Equipo Desarrollo
 *

 *
 * REQUIERE: Plugin "Discount Rules for WooCommerce" (FlyCart) instalado y activo.
 *
 * ENDPOINTS REST:
 *   GET    /wp-json/merkahorro/v1/woo-discount-rules     → Lee las reglas existentes
 *   POST   /wp-json/merkahorro/v1/sync-discount-rules    → Sincroniza reglas desde el Gestor
 *   DELETE /wp-json/merkahorro/v1/sync-discount-rules    → Elimina reglas del Gestor
 *
 * CAMBIO PRINCIPAL (v1.0):
 *   Se corrigió la condición de "días de la semana" para usar el tipo nativo
 *   de FlyCart "order_days" con nombres de día en inglés (monday, tuesday, etc.)
 *   en lugar del tipo inexistente "cart_item_product_combination_days".
 *   Esto garantiza que las reglas con horario por día solo apliquen los días configurados.
 */

if (!defined('ABSPATH')) exit;

// ═══════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════
if (!defined('MERKAHORRO_API_KEY')) {
    define('MERKAHORRO_API_KEY', 'merkahorro2026');
}

/**
 * Verificar API key en headers o query params
 */
function merkahorro_discount_check_api_key($request) {
    $key = $request->get_header('x-api-key');
    if (!$key) $key = $request->get_param('api_key');
    return $key === MERKAHORRO_API_KEY;
}

// ═══════════════════════════════════════════════
// REGISTRO DE ENDPOINTS REST
// ═══════════════════════════════════════════════
add_action('rest_api_init', function() {

    // ─── GET: Leer reglas existentes ───
    register_rest_route('merkahorro/v1', '/woo-discount-rules', array(
        'methods' => 'GET',
        'callback' => function() {
            global $wpdb;
            $table = $wpdb->prefix . 'wdr_rules';

            $table_exists = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table));
            if (!$table_exists) {
                return new WP_REST_Response(array(
                    'ok' => false,
                    'message' => 'Tabla wdr_rules no encontrada. El plugin Discount Rules puede no estar instalado.',
                    'data' => array()
                ), 200);
            }

            $rules = $wpdb->get_results("SELECT * FROM {$table} ORDER BY priority ASC", ARRAY_A);
            if (empty($rules)) {
                return new WP_REST_Response(array('ok' => true, 'data' => array()), 200);
            }

            $parsed = array();
            foreach ($rules as $rule) {
                $filters    = json_decode($rule['filters'] ?? '{}', true);
                $conditions = json_decode($rule['conditions'] ?? '[]', true);
                $discounts  = json_decode($rule['product_adjustments'] ?? '{}', true);

                // Tipo y valor del descuento
                $discount_type  = 'percentage';
                $discount_value = 0;
                if (!empty($discounts['type'])) {
                    $discount_type = ($discounts['type'] === 'percentage') ? 'percentage' : 'fixed';
                }
                if (!empty($discounts['value'])) {
                    $discount_value = floatval($discounts['value']);
                }

                // Categorías de los filtros
                $category_ids   = array();
                $category_names = array();
                if (!empty($filters)) {
                    foreach ($filters as $filter) {
                        if (isset($filter['type']) && $filter['type'] === 'product_category') {
                            foreach (($filter['value'] ?? array()) as $cat_id) {
                                $term = get_term((int) $cat_id, 'product_cat');
                                if ($term && !is_wp_error($term)) {
                                    $category_ids[]   = (int) $cat_id;
                                    $category_names[] = $term->name;
                                }
                            }
                        }
                    }
                }

                // Días y fechas de las condiciones
                $schedule_days = array();
                $schedule_type = 'always';
                $date_start    = null;
                $date_end      = null;

                if (!empty($conditions)) {
                    $day_reverse_map = array(
                        'sunday' => 0, 'monday' => 1, 'tuesday' => 2,
                        'wednesday' => 3, 'thursday' => 4, 'friday' => 5,
                        'saturday' => 6,
                    );

                    // Normalizar: FlyCart usa objeto {2: {type, options}}, formato anterior usa array anidado
                    $flat_conds = array();
                    foreach ($conditions as $item) {
                        if (is_array($item) && isset($item['type'])) {
                            $flat_conds[] = $item;
                        } elseif (is_array($item)) {
                            foreach ($item as $sub) {
                                if (is_array($sub) && isset($sub['type'])) {
                                    $flat_conds[] = $sub;
                                }
                            }
                        }
                    }

                    foreach ($flat_conds as $cond) {
                        $cond_type    = $cond['type'] ?? '';
                        $cond_options = $cond['options'] ?? array();

                        if ($cond_type === 'order_days') {
                            $schedule_type = 'days';
                            foreach (($cond_options['value'] ?? array()) as $name) {
                                $lower = strtolower($name);
                                if (isset($day_reverse_map[$lower])) {
                                    $schedule_days[] = $day_reverse_map[$lower];
                                }
                            }
                        }
                        if ($cond_type === 'order_date' || $cond_type === 'order_date_and_time') {
                            $schedule_type = 'date_range';
                            $date_start = $cond['from'] ?? ($cond_options['from'] ?? null);
                            $date_end   = $cond['to']   ?? ($cond_options['to']   ?? null);
                        }
                    }
                }

                $parsed[] = array(
                    'woo_rule_id'      => (int) $rule['id'],
                    'title'            => $rule['title'] ?? '(Sin título)',
                    'discount_type'    => $discount_type,
                    'discount_value'   => $discount_value,
                    'applies_to'       => !empty($category_ids) ? 'categories' : 'all',
                    'applies_to_ids'   => $category_ids,
                    'applies_to_names' => $category_names,
                    'schedule_type'    => $schedule_type,
                    'schedule_days'    => $schedule_days,
                    'date_start'       => $date_start,
                    'date_end'         => $date_end,
                    'active'           => ($rule['enabled'] ?? '1') === '1',
                    'priority'         => (int) ($rule['priority'] ?? 0),
                    'raw_filters'      => $filters,
                    'raw_conditions'   => $conditions,
                    'raw_discounts'    => $discounts,
                    'created_at'       => $rule['created_at'] ?? null,
                    'modified_at'      => $rule['modified_at'] ?? null,
                );
            }

            return new WP_REST_Response(array('ok' => true, 'data' => $parsed, 'total' => count($parsed)), 200);
        },
        'permission_callback' => function($request) {
            return merkahorro_discount_check_api_key($request);
        }
    ));

    // ─── POST: Sincronizar reglas desde el Gestor ───
    register_rest_route('merkahorro/v1', '/sync-discount-rules', array(
        'methods' => 'POST',
        'callback' => function($request) {
            global $wpdb;
            $table  = $wpdb->prefix . 'wdr_rules';
            $prefix = '[MK-Gestor] ';

            $table_exists = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table));
            if (!$table_exists) {
                return new WP_REST_Response(array(
                    'ok' => false,
                    'message' => 'Tabla wdr_rules no encontrada. Instalar plugin "Discount Rules for WooCommerce".'
                ), 200);
            }

            $rules = $request->get_json_params();
            if (empty($rules) || !is_array($rules)) {
                return new WP_REST_Response(array('ok' => false, 'message' => 'No se recibieron reglas'), 200);
            }

            // Eliminar reglas previas del Gestor
            $wpdb->query($wpdb->prepare(
                "DELETE FROM {$table} WHERE title LIKE %s",
                $prefix . '%'
            ));

            // Insertar nuevas
            $synced = 0;
            $errors = array();

            foreach ($rules as $rule) {
                $rule['title'] = $prefix . ($rule['title'] ?? 'Descuento');

                $wdr_data = merkahorro_discount_build_wdr_rule($rule);
                if (!$wdr_data) {
                    $errors[] = 'Error construyendo regla: ' . ($rule['title'] ?? '?');
                    continue;
                }

                $wpdb->insert($table, $wdr_data);
                $synced++;
            }

            // Limpiar caché FlyCart
            delete_option('wdr_transient_version');
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_wdr_%',
                    '_transient_timeout_wdr_%'
                )
            );
            if (function_exists('wp_cache_flush')) wp_cache_flush();

            return new WP_REST_Response(array(
                'ok'          => true,
                'synced'      => $synced,
                'deleted_old' => true,
                'errors'      => $errors,
                'message'     => "Se sincronizaron {$synced} reglas."
            ), 200);
        },
        'permission_callback' => function($request) {
            return merkahorro_discount_check_api_key($request);
        }
    ));

    // ─── DELETE: Eliminar reglas del Gestor ───
    register_rest_route('merkahorro/v1', '/sync-discount-rules', array(
        'methods' => 'DELETE',
        'callback' => function($request) {
            global $wpdb;
            $table  = $wpdb->prefix . 'wdr_rules';
            $prefix = '[MK-Gestor] ';
            $title  = $request->get_param('title');

            if (empty($title)) {
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
                'message' => $deleted ? 'Regla(s) eliminada(s)' : 'No se encontró la regla'
            ), 200);
        },
        'permission_callback' => function($request) {
            return merkahorro_discount_check_api_key($request);
        }
    ));
});

// ═══════════════════════════════════════════════
// CONSTRUCTOR DE REGLA FlyCart (wp_wdr_rules)
// ═══════════════════════════════════════════════
/**
 * Convierte una regla del Gestor al formato de la tabla wp_wdr_rules de FlyCart.
 *
 * CORRECCIÓN CLAVE: Para días de la semana se usa el tipo "order_days" de FlyCart
 * con nombres en inglés (monday, tuesday, etc.) — antes se usaba un tipo inexistente
 * que hacía que el descuento aplicara TODOS los días en lugar de solo los configurados.
 */
function merkahorro_discount_build_wdr_rule($rule) {
    $title          = $rule['title'] ?? 'Descuento';
    $discount_type  = $rule['discount_type'] ?? 'percentage';
    $discount_value = floatval($rule['discount_value'] ?? 0);
    $applies_to     = $rule['applies_to'] ?? 'all';
    $applies_to_ids = $rule['applies_to_ids'] ?? array();
    $schedule_type  = $rule['schedule_type'] ?? 'always';
    $schedule_days  = $rule['schedule_days'] ?? array();
    $date_start     = $rule['date_start'] ?? null;
    $date_end       = $rule['date_end'] ?? null;
    $active         = !empty($rule['active']) ? '1' : '0';
    $priority       = intval($rule['display_order'] ?? 0);

    // --- Filtros: a qué productos aplica ---
    $filters     = array();
    $wdr_apply_to = 'all_products';

    if ($applies_to === 'categories' && !empty($applies_to_ids)) {
        $wdr_apply_to = 'specific_products';
        $filters[] = array(
            'type'    => 'product_category',
            'method'  => 'in_list',
            'value'   => array_map('strval', $applies_to_ids),
            'cartQty' => 'product',
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

    // --- Condiciones: cuándo aplica ---
    $conditions = array();

    // Mapa: número de día JS (0=Dom..6=Sáb) → nombre FlyCart en inglés
    $day_name_map = array(
        0 => 'sunday',    1 => 'monday',   2 => 'tuesday',
        3 => 'wednesday', 4 => 'thursday', 5 => 'friday',
        6 => 'saturday',
    );

    if ($schedule_type === 'days' && !empty($schedule_days)) {
        // Convertir números de día a nombres en inglés
        $day_names = array();
        foreach ($schedule_days as $d) {
            if (isset($day_name_map[(int)$d])) {
                $day_names[] = $day_name_map[(int)$d];
            }
        }
        // Formato nativo FlyCart: objeto con clave numérica desde 2
        $conditions = array(
            2 => array(
                'type'    => 'order_days',
                'options' => array(
                    'operator' => 'in_list',
                    'value'    => $day_names,
                ),
            ),
        );
    } elseif ($schedule_type === 'date_range' && $date_start && $date_end) {
        $conditions = array(
            2 => array(
                'type'    => 'order_date_and_time',
                'options' => array(
                    'operator' => 'custom_date_range',
                    'from'     => $date_start,
                    'to'       => $date_end,
                ),
            ),
        );
    }

    // --- Descuento ---
    $wdr_discount_type = ($discount_type === 'percentage') ? 'percentage' : 'flat';
    $product_adjustments = array(
        'type'     => $wdr_discount_type,
        'value'    => strval($discount_value),
        'apply_as' => 'first_matched_rule',
        'cart_label' => $title,
    );

    // --- Fechas columna date_from / date_to ---
    $wdr_date_from = null;
    $wdr_date_to   = null;
    if ($schedule_type === 'date_range') {
        $wdr_date_from = $date_start ? strtotime($date_start) : null;
        $wdr_date_to   = $date_end   ? strtotime($date_end . ' 23:59:59') : null;
    }

    $now = current_time('mysql');

    return array(
        'title'                     => $title,
        'enabled'                   => $active,
        'exclusive'                 => '0',
        'priority'                  => $priority,
        'apply_to'                  => $wdr_apply_to,
        'filters'                   => wp_json_encode($filters ?: new stdClass()),
        'conditions'                => wp_json_encode(!empty($conditions) ? $conditions : new stdClass()),
        'product_adjustments'       => wp_json_encode($product_adjustments),
        'cart_adjustments'          => '',
        'buy_x_get_x_adjustments'   => '',
        'buy_x_get_y_adjustments'   => '',
        'bulk_adjustments'          => '',
        'set_adjustments'           => '',
        'other_discounts'           => '',
        'date_from'                 => $wdr_date_from,
        'date_to'                   => $wdr_date_to,
        'usage_limits'              => '',
        'rule_language'             => wp_json_encode(array()),
        'additional'                => wp_json_encode(array(
            'condition_relationship' => 'and',
        )),
        'max_discount_sum'          => '',
        'advanced_discount_message' => wp_json_encode(array(
            'display' => '0',
        )),
        'discount_type'             => 'wdr_simple_discount',
        'used_coupons'              => '',
        'created_by'                => get_current_user_id() ?: 0,
        'created_on'                => $now,
        'modified_by'               => get_current_user_id() ?: 0,
        'modified_on'               => $now,
    );
}
