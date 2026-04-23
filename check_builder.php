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
    // Usar el campo 'priority' real (menor número = mayor prioridad en FlyCart).
    // Fallback a display_order si priority no existe.
    $priority = intval($rule['priority'] ?? $rule['display_order'] ?? 50);

    // --- Badge / Barra de descuento ---
    $badge_enabled = isset($rule['badge_enabled']) ? ($rule['badge_enabled'] ? '1' : '0') : '0';
    $badge_text = $rule['badge_text'] ?? '';
    $badge_bg_color = $rule['badge_bg_color'] ?? '#160857';
    $badge_text_color = $rule['badge_text_color'] ?? '#88dc00';

    // --- Filters: a qué productos aplica ---
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
    // Si es 'all', $wdr_apply_to queda como 'all_products' y sin filtros

    // Para reglas semanales (priority > 5) que aplican a TODOS los productos:
    // excluir los productos ya cubiertos por reglas separata.
    // Así cada producto solo coincide con UNA regla ? sin stacking, sin necesidad de exclusive.
    if ($priority > 5 && $wdr_apply_to === 'all_products' && !empty($separata_exclude_ids)) {
        $filters[] = array(
            'type'     => 'products',
            'method'   => 'not_in_list',   // Flycart: 'not_in_list', NO 'nin_list'
            'value'    => $separata_exclude_ids,
            'cartQty'  => 'product',
        );
        $wdr_apply_to = 'specific_products';
    }

    // --- Conditions: cuándo aplica ---
    // Formato nativo de FlyCart: objeto con claves numéricas a partir de 2
    $conditions = array();

    // Mapa de número de día (JS getDay: 0=Dom..6=Sáb) a nombre FlyCart
    $day_name_map = array(
        0 => 'sunday', 1 => 'monday', 2 => 'tuesday',
        3 => 'wednesday', 4 => 'thursday', 5 => 'friday',
        6 => 'saturday',
    );

    if ($schedule_type === 'days' && !empty($schedule_days)) {
        $day_names = array();
        foreach ($schedule_days as $d) {
            if (isset($day_name_map[(int)$d])) {
                $day_names[] = $day_name_map[(int)$d];
            }
        }
        // FlyCart usa type "order_days" con objeto {2: {type, options}}
        $conditions = array(
            2 => array(
                'type' => 'order_days',
                'options' => array(
                    'operator' => 'in_list',
                    'value' => $day_names,
                ),
            ),
        );
    } elseif ($schedule_type === 'date_range' && $date_start && $date_end) {
        $conditions = array(
            2 => array(
                'type' => 'order_date_and_time',
                'options' => array(
                    'operator' => 'custom_date_range',
                    'from' => $date_start,
                    'to' => $date_end,
                ),
            ),
        );
    } elseif ($schedule_type === 'cart_condition') {
        $cart_cond_type  = $rule['cart_condition_type'] ?? 'subtotal';
        $cart_cond_value = floatval($rule['cart_condition_value'] ?? 0);
        if ($cart_cond_type === 'subtotal' && $cart_cond_value > 0) {
            // FlyCart condition type "subtotal" con operator "greater_than_or_equal"
            $conditions = array(
                2 => array(
                    'type' => 'subtotal',
                    'options' => array(
                        'operator' => 'greater_than_or_equal',
                        'value'    => strval($cart_cond_value),
                        'cart_context' => 'cart_total',
                    ),
                ),
            );
        }
    }

    // --- Product adjustments: el descuento ---
    // apply_as = 'sale_price': Flycart evalúa reglas POR PRODUCTO (no por carrito).
    // Con esto, exclusive=1 solo detiene otras reglas para ESE producto específico,
    // sin bloquear reglas de otros productos. La separata 35% bloquea el semanal
    // solo en frutas; la separata 25% bloquea el semanal solo en Flips.
    // Con 'first_matched_rule' el exclusive era cart-wide y una regla bloqueaba a la otra.
    $wdr_discount_type = ($discount_type === 'percentage') ? 'percentage' : 'flat';
    $product_adjustments = array(
        'type' => $wdr_discount_type,
        'value' => strval($discount_value),
        'apply_as' => 'sale_price',
        'cart_label' => $title,
    );

    // --- Fechas para las columnas date_from / date_to de FlyCart ---
    $wdr_date_from = null;
    $wdr_date_to = null;
    if ($schedule_type === 'date_range') {
        $wdr_date_from = $date_start ? strtotime($date_start) : null;
        $wdr_date_to = $date_end ? strtotime($date_end . ' 23:59:59') : null;
    }

    $now = current_time('mysql');

    return array(
        'title'                => $title,
        'enabled'              => $active,
        // exclusive='0': No usar exclusividad de Flycart (es cart-level, bloquea TODAS las reglas).
        // En su lugar, las reglas semanales tienen un filtro 'not_in_list' que excluye los productos
        // de separata. Así cada producto solo coincide con una regla ? sin stacking, sin bloqueos.
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

