<?php
if (!defined('ABSPATH')) exit;

/**
 * Construir un registro compatible con wp_wdr_rules del plugin FlyCart
 * a partir de una regla de nuestro Gestor
 */
function merkahorro_build_wdr_rule($rule, $separata_exclude_ids = array()) {
    $title = $rule['title'] ?? 'Descuento';
    $discount_type = $rule['discount_type'] ?? 'percentage';
    $discount_value = floatval($rule['discount_value'] ?? 0);
    $applies_to = $rule['applies_to'] ?? 'all';
    $applies_to_ids = $rule['applies_to_ids'] ?? array();
    $schedule_type = $rule['schedule_type'] ?? 'always';
    $schedule_days = $rule['schedule_days'] ?? array();
    $date_start = $rule['date_start'] ?? null;
    $date_end = $rule['date_end'] ?? null;
    $active = !empty($rule['active']) ? '1' : '0';
    $priority = intval($rule['priority'] ?? $rule['display_order'] ?? 50);

    $badge_enabled = isset($rule['badge_enabled']) ? ($rule['badge_enabled'] ? '1' : '0') : '0';
    $badge_text = $rule['badge_text'] ?? '';
    $badge_bg_color = $rule['badge_bg_color'] ?? '#160857';
    $badge_text_color = $rule['badge_text_color'] ?? '#88dc00';

    $filters = array();
    $wdr_apply_to = 'all_products';

    if ($applies_to === 'categories' && !empty($applies_to_ids)) {
        $wdr_apply_to = 'specific_products';
        $filters[] = array(
            'type' => 'product_category',
            'method' => 'in_list',
            'value' => array_map('strval', $applies_to_ids),
            'cartQty' => 'product',
        );
    } elseif ($applies_to === 'products' && !empty($applies_to_ids)) {
        $wdr_apply_to = 'specific_products';
        $filters[] = array(
            'type' => 'products',
            'method' => 'in_list',
            'value' => array_map('strval', $applies_to_ids),
            'cartQty' => 'product',
        );
    }

    if ($priority > 5 && $wdr_apply_to === 'all_products' && !empty($separata_exclude_ids)) {
        $filters[] = array(
            'type'     => 'products',
            'method'   => 'not_in_list',
            'value'    => $separata_exclude_ids,
            'cartQty'  => 'product',
        );
        $wdr_apply_to = 'specific_products';
    }

    $conditions = array();
    $day_name_map = array(0 => 'sunday', 1 => 'monday', 2 => 'tuesday', 3 => 'wednesday', 4 => 'thursday', 5 => 'friday', 6 => 'saturday');

    if ($schedule_type === 'days' && !empty($schedule_days)) {
        $day_names = array();
        foreach ($schedule_days as $d) {
            if (isset($day_name_map[(int)$d])) $day_names[] = $day_name_map[(int)$d];
        }
        $conditions = array(
            2 => array(
                'type' => 'order_days',
                'options' => array(
                    'operator' => 'in_list',
                    'value' => $day_names,
                ),
            ),
        );
    } elseif ($schedule_type === 'cart_condition') {
        $cart_cond_type  = $rule['cart_condition_type'] ?? 'subtotal';
        $cart_cond_value = floatval($rule['cart_condition_value'] ?? 0);
        if ($cart_cond_type === 'subtotal' && $cart_cond_value > 0) {
            $conditions = array(
                2 => array(
                    'type' => 'cart_subtotal',
                    'options' => array(
                        'operator' => 'greater_than_or_equal',
                        'value'    => strval($cart_cond_value),
                        'calculate_from' => 'from_cart_excluding_filter',
                    ),
                ),
            );
        }
    }

    $wdr_discount_type = 'flat';
    if ($discount_type === 'percentage') {
        $wdr_discount_type = 'percentage';
    } elseif ($discount_type === 'exact_price') {
        $wdr_discount_type = 'fixed_price';
    }

    $product_adjustments = array(
        'type' => $wdr_discount_type,
        'value' => strval($discount_value),
        'apply_as' => 'sale_price',
        'cart_label' => $title,
    );

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
        'title'                => $title,
        'enabled'              => $active,
        'exclusive'            => '0',
        'priority'             => $priority,
        'apply_to'             => $wdr_apply_to,
        'filters'              => wp_json_encode($filters ?: new stdClass()),
        'conditions'           => wp_json_encode(!empty($conditions) ? $conditions : new stdClass()),
        'product_adjustments'  => wp_json_encode($product_adjustments),
        'cart_adjustments'     => '',
        'buy_x_get_x_adjustments' => '',
        'buy_x_get_y_adjustments' => '',
        'bulk_adjustments'     => '',
        'set_adjustments'      => '',
        'other_discounts'      => '',
        'date_from'            => $wdr_date_from,
        'date_to'              => $wdr_date_to,
        'usage_limits'         => '',
        'rule_language'        => wp_json_encode(array()),
        'additional'           => wp_json_encode(array(
            'condition_relationship' => 'and',
        )),
        'max_discount_sum'     => '',
        'advanced_discount_message' => wp_json_encode(array(
            'display' => $badge_enabled,
            'badge_color_option' => 'custom',
            'badge_color' => $badge_bg_color,
            'badge_text_color' => $badge_text_color,
            'badge_text' => $badge_text,
        )),
        'discount_type'        => 'wdr_simple_discount',
        'used_coupons'         => '',
        'created_by'           => get_current_user_id() ?: 0,
        'created_on'           => $now,
        'modified_by'          => get_current_user_id() ?: 0,
        'modified_on'          => $now,
    );
}
