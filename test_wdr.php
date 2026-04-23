<?php
// Mock
function get_option($opt) { return 'America/Bogota'; }
function current_time($type) { return date('Y-m-d H:i:s'); }
function wp_json_encode($data) { return json_encode($data); }

$rule = array(
    'title' => '[MK-Gestor] Autoliquidable a 69.990',
    'discount_type' => 'exact_price',
    'discount_value' => '69990',
    'schedule_type' => 'cart_condition',
    'cart_condition_type' => 'subtotal',
    'cart_condition_value' => '150000',
    'priority' => 50
);

// Copiado de tu PHP para testearlo aislado
\ = \['title'] ?? 'Descuento';
\ = \['discount_type'] ?? 'percentage';
\ = floatval(\['discount_value'] ?? 0);
\ = \['schedule_type'] ?? 'always';

\ = array();
if (\ === 'cart_condition') {
    \  = \['cart_condition_type'] ?? 'subtotal';
    \ = floatval(\['cart_condition_value'] ?? 0);
    if (\ === 'subtotal' && \ > 0) {
        \ = array(
            2 => array(
                'type' => 'subtotal',
                'options' => array(
                    'operator' => '>=',
                    'value'    => strval(\),
                    'cart_context' => 'non_matched_products',
                ),
            ),
        );
    }
}
// Vemos a conditions
echo "Conditions object:\n";
print_r(\json_encode(!empty(\) ? \ : new stdClass(), JSON_PRETTY_PRINT));

