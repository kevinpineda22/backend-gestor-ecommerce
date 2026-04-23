<?php
require_once 'wordpress/wp-load.php';
global $wpdb;
$rules = $wpdb->get_results('SELECT * FROM ' . $wpdb->prefix . 'wd_rules ORDER BY id DESC LIMIT 5', ARRAY_A);
foreach ($rules as $rule) {
    if (strpos($rule['title'], 'Autoliquidable') !== false) {
         = $rule['id'];
        echo "RULE ID: $rule_id\n";
        echo "CONDITIONS: " . $rule['conditions'] . "\n";
        echo "PRODUCT ADJUST: " . $rule['product_adjustments'] . "\n";
    }
}
