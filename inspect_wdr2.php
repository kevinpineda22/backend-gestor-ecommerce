<?php
require_once 'wordpress/wp-load.php';
global $wpdb;
$rules = $wpdb->get_results('SELECT * FROM ' . $wpdb->prefix . 'wd_rules ORDER BY id DESC LIMIT 15', ARRAY_A);
foreach ($rules as $rule) {
    if (strpos($rule['conditions'], 'subtotal') !== false) {
         = $rule['id'];
         = $rule['title'];
        echo "RULE ID: $rule_id | TITLE: $title\n";
        echo "CONDITIONS: " . $rule['conditions'] . "\n";
        echo "---------------------------\n";
    }
}
