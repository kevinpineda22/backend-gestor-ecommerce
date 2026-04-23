<?php
/**
 * Merkahorro EcomManager — Endpoints REST de consulta
 *
 * Registra:
 *   GET /wp-json/merkahorro/v1/clear-cache         — limpia todos los transients de merkahorro
 *   GET /wp-json/merkahorro/v1/diagnostico          — verifica API y banners activos
 *   GET /wp-json/merkahorro/v1/wp-banners           — lee sliders/banners desde RevSlider + media
 *   GET /wp-json/merkahorro/v1/woo-discount-rules   — lee reglas de FlyCart desde wp_wdr_rules
 */

if (!defined('ABSPATH')) exit;

add_action('rest_api_init', function() {

    // ─────────────────────────────────────────────────────────────────────────
    // GET /clear-cache — limpia transients de banners y descuentos de merkahorro
    // ─────────────────────────────────────────────────────────────────────────
    register_rest_route('merkahorro/v1', '/clear-cache', array(
        'methods'             => 'GET',
        'callback'            => function() {
            global $wpdb;
            // Limpiar todos los prefijos de caché del plugin
            $wpdb->query(
                "DELETE FROM {$wpdb->options}
                 WHERE option_name LIKE '\_transient\_merkahorro\_%'
                    OR option_name LIKE '\_transient\_timeout\_merkahorro\_%'
                    OR option_name LIKE '\_transient\_mks\_%'
                    OR option_name LIKE '\_transient\_timeout\_mks\_%'"
            );
            return new WP_REST_Response(array('ok' => true, 'message' => 'Cache limpiado (todas las sedes)'), 200);
        },
        'permission_callback' => function($request) { return merkahorro_check_api_key($request); },
    ));

    // ─────────────────────────────────────────────────────────────────────────
    // GET /diagnostico — verifica conexión a la API y muestra conteo de banners
    // ─────────────────────────────────────────────────────────────────────────
    register_rest_route('merkahorro/v1', '/diagnostico', array(
        'methods'             => 'GET',
        'callback'            => function() {
            global $wpdb;
            // Limpiar caché primero para obtener datos frescos
            $wpdb->query(
                "DELETE FROM {$wpdb->options}
                 WHERE option_name LIKE '\_transient\_merkahorro\_%'
                    OR option_name LIKE '\_transient\_timeout\_merkahorro\_%'
                    OR option_name LIKE '\_transient\_mks\_%'
                    OR option_name LIKE '\_transient\_timeout\_mks\_%'"
            );

            $current_sede   = merkahorro_get_current_sede();
            $host           = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '(desconocido)';
            $slider_banners = merkahorro_get_banners('home_slider', $current_sede);
            $tiles_banners  = merkahorro_get_banners('home_tiles',  $current_sede);

            $api_test   = wp_remote_get(MERKAHORRO_API_URL . '/content/banners?section=home_tiles', array('timeout' => 10, 'sslverify' => false));
            $api_status = is_wp_error($api_test) ? $api_test->get_error_message() : wp_remote_retrieve_response_code($api_test);
            $api_body   = is_wp_error($api_test) ? null : json_decode(wp_remote_retrieve_body($api_test), true);

            return new WP_REST_Response(array(
                'ok'                  => true,
                'version'             => '2.0',
                'api_url'             => MERKAHORRO_API_URL,
                'host'                => $host,
                'sede_detectada'      => $current_sede ?: 'ninguna (mostrando todas)',
                'sede_mapa'           => json_decode(MERKAHORRO_SEDE_MAP, true),
                'api_tiles_status'    => $api_status,
                'api_tiles_response'  => $api_body,
                'slider'              => array(
                    'total_banners' => count($slider_banners),
                    'banners'       => array_map(function($b) {
                        return array('id' => $b['id'], 'title' => $b['title'], 'active' => $b['active']);
                    }, $slider_banners),
                ),
                'tiles'               => array(
                    'total_tiles' => count($tiles_banners),
                    'tiles'       => array_map(function($b) {
                        return array('id' => $b['id'], 'title' => $b['title'], 'active' => $b['active']);
                    }, $tiles_banners),
                ),
                'shortcodes_registrados' => array(
                    'merkahorro_slider'    => shortcode_exists('merkahorro_slider'),
                    'merkahorro_tiles'     => shortcode_exists('merkahorro_tiles'),
                    'merkahorro_separatas' => shortcode_exists('merkahorro_separatas'),
                ),
                'nota' => 'Si tiles total es 0, creen tiles en Gestor Ecommerce → Banners → sección home_tiles',
            ), 200);
        },
        'permission_callback' => function($request) { return merkahorro_check_api_key($request); },
    ));

    // ─────────────────────────────────────────────────────────────────────────
    // GET /wp-banners — lee slides de RevSlider + thumbnails de categorías WC + media
    // ─────────────────────────────────────────────────────────────────────────
    register_rest_route('merkahorro/v1', '/wp-banners', array(
        'methods'             => 'GET',
        'callback'            => function() {
            global $wpdb;
            $results = array();

            // 1) Slider Revolution
            $sliders_table = $wpdb->prefix . 'revslider_sliders';
            $slides_table  = $wpdb->prefix . 'revslider_slides';
            $has_revslider = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $sliders_table));

            if ($has_revslider) {
                $sliders = $wpdb->get_results("SELECT id, title, alias FROM {$sliders_table}", ARRAY_A);
                foreach ($sliders as $slider) {
                    $slides = $wpdb->get_results(
                        $wpdb->prepare(
                            "SELECT id, slide_order, params FROM {$slides_table} WHERE slider_id = %d ORDER BY slide_order ASC",
                            $slider['id']
                        ),
                        ARRAY_A
                    );
                    foreach ($slides as $slide) {
                        $params    = json_decode($slide['params'] ?? '{}', true);
                        $image_url = $params['bg']['image'] ?? $params['image'] ?? $params['bg']['imageUrl'] ?? '';
                        if (is_numeric($image_url)) $image_url = wp_get_attachment_url((int) $image_url) ?: '';
                        $link_url = $params['link']['url'] ?? $params['link_url'] ?? '';
                        $title    = $params['title'] ?? $params['bg']['alt'] ?? ($slider['title'] . ' — Slide ' . ($slide['slide_order'] + 1));
                        if (!empty($image_url)) {
                            $results[] = array(
                                'source'        => 'revslider',
                                'source_id'     => 'revslider_' . $slider['id'] . '_' . $slide['id'],
                                'slider_name'   => $slider['title'],
                                'slider_alias'  => $slider['alias'],
                                'title'         => $title,
                                'image_url'     => $image_url,
                                'link_url'      => $link_url,
                                'display_order' => (int) $slide['slide_order'],
                                'section'       => 'home_slider',
                            );
                        }
                    }
                }
            }

            // 2) WooCommerce product_cat thumbnails (tiles)
            $terms = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => true, 'parent' => 0, 'number' => 30));
            if (!is_wp_error($terms)) {
                $order = 0;
                foreach ($terms as $term) {
                    $thumb_id = get_term_meta($term->term_id, 'thumbnail_id', true);
                    if ($thumb_id) {
                        $img_url  = wp_get_attachment_url((int) $thumb_id);
                        $cat_link = get_term_link($term);
                        if ($img_url) {
                            $results[] = array(
                                'source'        => 'woo_category',
                                'source_id'     => 'woocat_' . $term->term_id,
                                'slider_name'   => 'Categorías WooCommerce',
                                'slider_alias'  => 'woo-categories',
                                'title'         => $term->name,
                                'image_url'     => $img_url,
                                'link_url'      => is_string($cat_link) ? $cat_link : '',
                                'display_order' => $order++,
                                'section'       => 'home_tiles',
                            );
                        }
                    }
                }
            }

            // 3) Imágenes de la media library con palabras clave de banner
            $attachments = get_posts(array(
                'post_type'      => 'attachment',
                'post_mime_type' => 'image',
                'posts_per_page' => 50,
                'post_status'    => 'inherit',
                's'              => 'banner promo slider promocion',
            ));
            foreach ($attachments as $att) {
                $img_url = wp_get_attachment_url($att->ID);
                if (!$img_url) continue;
                // Evitar duplicados con RevSlider
                $dup = false;
                foreach ($results as $r) { if ($r['image_url'] === $img_url) { $dup = true; break; } }
                if ($dup) continue;
                $results[] = array(
                    'source'        => 'media_library',
                    'source_id'     => 'media_' . $att->ID,
                    'slider_name'   => 'Media Library',
                    'slider_alias'  => 'media',
                    'title'         => $att->post_title ?: '(Imagen ' . $att->ID . ')',
                    'image_url'     => $img_url,
                    'link_url'      => '',
                    'display_order' => 0,
                    'section'       => 'home_slider',
                );
            }

            return new WP_REST_Response(array(
                'ok'      => true,
                'data'    => $results,
                'total'   => count($results),
                'sources' => array(
                    'revslider'      => (bool) $has_revslider,
                    'woo_categories' => !is_wp_error($terms),
                    'media_library'  => true,
                ),
            ), 200);
        },
        'permission_callback' => function($request) { return merkahorro_check_api_key($request); },
    ));

    // ─────────────────────────────────────────────────────────────────────────
    // GET /woo-discount-rules — lee y parsea reglas de FlyCart desde wp_wdr_rules
    // ─────────────────────────────────────────────────────────────────────────
    register_rest_route('merkahorro/v1', '/woo-discount-rules', array(
        'methods'             => 'GET',
        'callback'            => function() {
            global $wpdb;
            $table = $wpdb->prefix . 'wdr_rules';

            $table_exists = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table));
            if (!$table_exists) {
                return new WP_REST_Response(array(
                    'ok'      => false,
                    'message' => 'Tabla wdr_rules no encontrada. El plugin Discount Rules puede no estar instalado.',
                    'data'    => array(),
                ), 200);
            }

            $rules = $wpdb->get_results("SELECT * FROM {$table} ORDER BY priority ASC", ARRAY_A);
            if (empty($rules)) {
                return new WP_REST_Response(array('ok' => true, 'data' => array()), 200);
            }

            $parsed = array();
            foreach ($rules as $rule) {
                $filters     = json_decode($rule['filters']                ?? '{}', true);
                $conditions  = json_decode($rule['conditions']             ?? '[]', true);
                $discounts   = json_decode($rule['product_adjustments']    ?? '{}', true);
                $adv_message = json_decode($rule['advanced_discount_message'] ?? '{}', true);

                $discount_type  = isset($discounts['type']) && $discounts['type'] === 'percentage' ? 'percentage' : 'fixed';
                $discount_value = floatval($discounts['value'] ?? 0);

                $category_ids   = array();
                $category_names = array();
                $product_ids    = array();
                $product_names  = array();

                if (!empty($filters)) {
                    foreach ($filters as $filter) {
                        if (!isset($filter['type'])) continue;
                        if ($filter['type'] === 'product_category') {
                            foreach ((array)($filter['value'] ?? array()) as $cat_id) {
                                $term = get_term((int) $cat_id, 'product_cat');
                                if ($term && !is_wp_error($term)) {
                                    $category_ids[]   = (int) $cat_id;
                                    $category_names[] = $term->name;
                                }
                            }
                        } elseif ($filter['type'] === 'products') {
                            foreach ((array)($filter['value'] ?? array()) as $prod_id) {
                                $pid = (int) $prod_id;
                                if ($pid > 0) {
                                    $product_ids[]   = $pid;
                                    $prod_post       = get_post($pid);
                                    $product_names[] = $prod_post ? $prod_post->post_title : 'Producto #' . $pid;
                                }
                            }
                        }
                    }
                }

                $schedule_days       = array();
                $schedule_type       = 'always';
                $date_start          = null;
                $date_end            = null;
                $cart_condition_type  = null;
                $cart_condition_value = 0;

                if (!empty($conditions)) {
                    $day_reverse_map = array(
                        'sunday' => 0, 'monday' => 1, 'tuesday' => 2,
                        'wednesday' => 3, 'thursday' => 4, 'friday' => 5, 'saturday' => 6,
                    );

                    // Normalizar: FlyCart usa objeto {2: {type, options}}, formato anterior usaba arrays anidados
                    $flat_conds = array();
                    foreach ($conditions as $item) {
                        if (is_array($item) && isset($item['type'])) {
                            $flat_conds[] = $item;
                        } elseif (is_array($item)) {
                            foreach ($item as $sub) {
                                if (is_array($sub) && isset($sub['type'])) $flat_conds[] = $sub;
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
                                if (isset($day_reverse_map[$lower])) $schedule_days[] = $day_reverse_map[$lower];
                            }
                        }
                        if ($cond_type === 'order_date' || $cond_type === 'order_date_and_time') {
                            $schedule_type = 'date_range';
                            $date_start    = $cond['from'] ?? ($cond_options['from'] ?? null);
                            $date_end      = $cond['to']   ?? ($cond_options['to']   ?? null);
                        }
                        if ($cond_type === 'subtotal') {
                            $schedule_type        = 'cart_condition';
                            $cart_condition_type  = 'subtotal';
                            $cart_condition_value = floatval($cond_options['value'] ?? ($cond['value'] ?? 0));
                        }
                    }
                }

                $parsed[] = array(
                    'woo_rule_id'          => (int) $rule['id'],
                    'title'                => $rule['title'] ?? '(Sin título)',
                    'discount_type'        => $discount_type,
                    'discount_value'       => $discount_value,
                    'applies_to'           => !empty($product_ids) ? 'products' : (!empty($category_ids) ? 'categories' : 'all'),
                    'applies_to_ids'       => !empty($product_ids) ? $product_ids : $category_ids,
                    'applies_to_names'     => !empty($product_ids) ? $product_names : $category_names,
                    'schedule_type'        => $schedule_type,
                    'schedule_days'        => $schedule_days,
                    'date_start'           => $date_start,
                    'date_end'             => $date_end,
                    'cart_condition_type'  => $cart_condition_type,
                    'cart_condition_value' => $cart_condition_value,
                    'active'               => ($rule['enabled'] ?? '1') === '1',
                    'priority'             => (int) ($rule['priority'] ?? 0),
                    'raw_filters'          => $filters,
                    'raw_conditions'       => $conditions,
                    'raw_discounts'        => $discounts,
                    'badge_enabled'        => ($adv_message['display'] ?? '0') === '1',
                    'badge_text'           => $adv_message['badge_text'] ?? '',
                    'badge_bg_color'       => $adv_message['badge_color'] ?? '#160857',
                    'badge_text_color'     => $adv_message['badge_text_color'] ?? '#88dc00',
                    'created_at'           => $rule['created_at'] ?? null,
                    'modified_at'          => $rule['modified_at'] ?? null,
                );
            }

            return new WP_REST_Response(array('ok' => true, 'data' => $parsed, 'total' => count($parsed)), 200);
        },
        'permission_callback' => function($request) { return merkahorro_check_api_key($request); },
    ));

});
