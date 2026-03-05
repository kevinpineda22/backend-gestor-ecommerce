<?php
/**
 * Plugin Name: Merkahorro Banners - EcomManager Integration
 * Description: Renderiza sliders y tiles promocionales desde el Gestor Ecommerce (Supabase API).
 * Version: 1.0
 * Author: Equipo Desarrollo
 *
 * INSTALACIÓN:
 * 1. Subir este archivo a: wp-content/mu-plugins/merkahorro-banners.php
 *    (Si no existe la carpeta mu-plugins, crearla)
 * 2. En la página de inicio (Elementor/WPBakery/editor), reemplazar:
 *    - El shortcode de RevSlider por: [merkahorro_slider]
 *    - Los tiles promocionales por:   [merkahorro_tiles]
 * 3. Listo — los banners se controlan desde EcomManager.
 */

if (!defined('ABSPATH')) exit;

// ═══════════════════════════════════════════════
// CONFIGURACIÓN
// Para cambiar la API key, definir en wp-config.php:
//   define('MERKAHORRO_API_KEY', 'tu_clave_secreta');
// ═══════════════════════════════════════════════
define('MERKAHORRO_API_URL', 'https://backend-gestor-ecommerce.vercel.app/api');
define('MERKAHORRO_CACHE_TTL', 300); // 5 minutos
if (!defined('MERKAHORRO_API_KEY')) {
    define('MERKAHORRO_API_KEY', 'merkahorro2026'); // Fallback — cambiar en wp-config.php
}

// ═══════════════════════════════════════════════
// FUNCIÓN: Obtener banners de la API
// ═══════════════════════════════════════════════
function merkahorro_get_banners($section = 'home_slider') {
    $cache_key = 'merkahorro_banners_' . sanitize_key($section);
    $cached = get_transient($cache_key);

    if ($cached !== false) {
        return $cached;
    }

    $url = MERKAHORRO_API_URL . '/content/banners?section=' . urlencode($section);
    $response = wp_remote_get($url, array(
        'timeout' => 10,
        'sslverify' => false
    ));

    if (is_wp_error($response)) {
        error_log('Merkahorro Banners API error: ' . $response->get_error_message());
        return array();
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);

    if (!isset($body['ok']) || !$body['ok'] || empty($body['data'])) {
        return array();
    }

    // Solo banners activos
    $banners = array_filter($body['data'], function($b) {
        return !empty($b['active']);
    });

    // Ordenar por display_order
    usort($banners, function($a, $b) {
        return ($a['display_order'] ?? 0) - ($b['display_order'] ?? 0);
    });

    set_transient($cache_key, $banners, MERKAHORRO_CACHE_TTL);
    return $banners;
}

// ═══════════════════════════════════════════════
// SHORTCODE: [merkahorro_slider]
// Slider principal tipo hero con autoplay
// ═══════════════════════════════════════════════
function merkahorro_slider_shortcode($atts) {
    $atts = shortcode_atts(array(
        'section' => 'home_slider',
        'height' => '450px',
        'autoplay' => '5000',
    ), $atts);

    $banners = merkahorro_get_banners($atts['section']);

    if (empty($banners)) {
        return '<!-- Merkahorro: No hay banners activos para ' . esc_attr($atts['section']) . ' -->';
    }

    $slider_id = 'mks-' . wp_rand(1000, 9999);
    $height = esc_attr($atts['height']);
    $autoplay = intval($atts['autoplay']);

    ob_start();
    ?>
    <style>
        .mks-slider { position: relative; width: 100%; height: <?php echo $height; ?>; overflow: hidden; border-radius: 12px; }
        .mks-slider .mks-slide { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; transition: opacity 0.6s ease-in-out; }
        .mks-slider .mks-slide.active { opacity: 1; z-index: 2; }
        .mks-slider .mks-slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .mks-slider .mks-slide a { display: block; width: 100%; height: 100%; }
        .mks-slider .mks-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; background: rgba(0,0,0,0.4); color: white; border: none; font-size: 1.5rem; padding: 12px 16px; cursor: pointer; border-radius: 4px; transition: background 0.2s; }
        .mks-slider .mks-nav:hover { background: rgba(0,0,0,0.7); }
        .mks-slider .mks-prev { left: 10px; }
        .mks-slider .mks-next { right: 10px; }
        .mks-dots { text-align: center; margin-top: 10px; }
        .mks-dots .mks-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #d1d5db; margin: 0 4px; cursor: pointer; transition: background 0.2s; border: none; }
        .mks-dots .mks-dot.active { background: #2563eb; }
        @media (max-width: 768px) {
            .mks-slider { height: 220px; border-radius: 8px; }
            .mks-slider .mks-nav { padding: 8px 10px; font-size: 1rem; }
        }
    </style>

    <div class="mks-slider" id="<?php echo $slider_id; ?>">
        <?php foreach ($banners as $i => $banner): ?>
            <div class="mks-slide <?php echo $i === 0 ? 'active' : ''; ?>">
                <?php if (!empty($banner['link_url'])): ?>
                    <a href="<?php echo esc_url($banner['link_url']); ?>">
                        <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="<?php echo $i === 0 ? 'eager' : 'lazy'; ?>">
                    </a>
                <?php else: ?>
                    <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="<?php echo $i === 0 ? 'eager' : 'lazy'; ?>">
                <?php endif; ?>
            </div>
        <?php endforeach; ?>

        <?php if (count($banners) > 1): ?>
            <button class="mks-nav mks-prev" aria-label="Anterior">&#8249;</button>
            <button class="mks-nav mks-next" aria-label="Siguiente">&#8250;</button>
        <?php endif; ?>
    </div>

    <?php if (count($banners) > 1): ?>
        <div class="mks-dots" id="<?php echo $slider_id; ?>-dots">
            <?php foreach ($banners as $i => $banner): ?>
                <button class="mks-dot <?php echo $i === 0 ? 'active' : ''; ?>" data-index="<?php echo $i; ?>" aria-label="Ir al slide <?php echo $i + 1; ?>"></button>
            <?php endforeach; ?>
        </div>

        <script>
        (function() {
            var slider = document.getElementById('<?php echo $slider_id; ?>');
            var dots = document.getElementById('<?php echo $slider_id; ?>-dots');
            if (!slider) return;

            var slides = slider.querySelectorAll('.mks-slide');
            var dotBtns = dots ? dots.querySelectorAll('.mks-dot') : [];
            var current = 0;
            var total = slides.length;
            var autoplayMs = <?php echo $autoplay; ?>;
            var timer;

            function goTo(idx) {
                slides[current].classList.remove('active');
                if (dotBtns[current]) dotBtns[current].classList.remove('active');
                current = (idx + total) % total;
                slides[current].classList.add('active');
                if (dotBtns[current]) dotBtns[current].classList.add('active');
            }

            function startAutoplay() {
                if (autoplayMs > 0 && total > 1) {
                    timer = setInterval(function() { goTo(current + 1); }, autoplayMs);
                }
            }

            function stopAutoplay() { clearInterval(timer); }

            var prevBtn = slider.querySelector('.mks-prev');
            var nextBtn = slider.querySelector('.mks-next');
            if (prevBtn) prevBtn.addEventListener('click', function() { stopAutoplay(); goTo(current - 1); startAutoplay(); });
            if (nextBtn) nextBtn.addEventListener('click', function() { stopAutoplay(); goTo(current + 1); startAutoplay(); });

            dotBtns.forEach(function(dot) {
                dot.addEventListener('click', function() {
                    stopAutoplay(); goTo(parseInt(this.dataset.index)); startAutoplay();
                });
            });

            startAutoplay();
        })();
        </script>
    <?php endif; ?>

    <?php
    return ob_get_clean();
}
add_shortcode('merkahorro_slider', 'merkahorro_slider_shortcode');

// ═══════════════════════════════════════════════
// SHORTCODE: [merkahorro_tiles]
// Grid de tiles promocionales (los cuadritos de abajo)
// ═══════════════════════════════════════════════
function merkahorro_tiles_shortcode($atts) {
    $atts = shortcode_atts(array(
        'section' => 'home_tiles',
        'columns' => '5',
    ), $atts);

    $banners = merkahorro_get_banners($atts['section']);

    if (empty($banners)) {
        return '<!-- Merkahorro: No hay tiles activos para ' . esc_attr($atts['section']) . ' -->';
    }

    $cols = intval($atts['columns']);
    ob_start();
    ?>
    <style>
        .mks-tiles { display: grid; grid-template-columns: repeat(<?php echo $cols; ?>, 1fr); gap: 16px; margin: 20px 0; }
        .mks-tile { border-radius: 12px; overflow: hidden; transition: transform 0.2s; position: relative; }
        .mks-tile:hover { transform: translateY(-4px); }
        .mks-tile img { width: 100%; height: 200px; object-fit: cover; display: block; }
        .mks-tile a { display: block; }
        @media (max-width: 768px) {
            .mks-tiles { grid-template-columns: repeat(2, 1fr); gap: 10px; }
            .mks-tile img { height: 140px; }
        }
        @media (max-width: 480px) {
            .mks-tiles { grid-template-columns: 1fr 1fr; }
            .mks-tile img { height: 120px; }
        }
    </style>

    <div class="mks-tiles">
        <?php foreach ($banners as $banner): ?>
            <div class="mks-tile">
                <?php if (!empty($banner['link_url'])): ?>
                    <a href="<?php echo esc_url($banner['link_url']); ?>">
                        <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="lazy">
                    </a>
                <?php else: ?>
                    <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="lazy">
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
    </div>
    <?php
    return ob_get_clean();
}
add_shortcode('merkahorro_tiles', 'merkahorro_tiles_shortcode');

// ═══════════════════════════════════════════════
// ENDPOINT: Limpiar caché manualmente
// GET /wp-json/merkahorro/v1/clear-cache
// ═══════════════════════════════════════════════
add_action('rest_api_init', function() {
    register_rest_route('merkahorro/v1', '/clear-cache', array(
        'methods' => 'GET',
        'callback' => function() {
            delete_transient('merkahorro_banners_home_slider');
            delete_transient('merkahorro_banners_home_tiles');
            delete_transient('merkahorro_discount_rules');
            return new WP_REST_Response(array('ok' => true, 'message' => 'Cache limpiado'), 200);
        },
        'permission_callback' => function() {
            return current_user_is_logged_in() || (isset($_GET['key']) && $_GET['key'] === MERKAHORRO_API_KEY);
        }
    ));

    // ═══════════════════════════════════════════════
    // GET /wp-json/merkahorro/v1/wp-banners
    // Lee sliders/banners existentes de Slider Revolution + media
    // ═══════════════════════════════════════════════
    register_rest_route('merkahorro/v1', '/wp-banners', array(
        'methods' => 'GET',
        'callback' => function() {
            global $wpdb;
            $results = array();

            // ── 1) Slider Revolution slides ──
            $sliders_table = $wpdb->prefix . 'revslider_sliders';
            $slides_table  = $wpdb->prefix . 'revslider_slides';

            $has_revslider = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $sliders_table));

            if ($has_revslider) {
                $sliders = $wpdb->get_results("SELECT id, title, alias FROM {$sliders_table}", ARRAY_A);

                foreach ($sliders as $slider) {
                    $slides = $wpdb->get_results(
                        $wpdb->prepare(
                            "SELECT id, slide_order, params, layers FROM {$slides_table} WHERE slider_id = %d ORDER BY slide_order ASC",
                            $slider['id']
                        ),
                        ARRAY_A
                    );

                    foreach ($slides as $slide) {
                        $params = json_decode($slide['params'] ?? '{}', true);
                        $layers = json_decode($slide['layers'] ?? '{}', true);

                        // Extraer imagen — RevSlider 6.x guarda en bg.image o image
                        $image_url = '';
                        if (!empty($params['bg']['image'])) {
                            $image_url = $params['bg']['image'];
                        } elseif (!empty($params['image'])) {
                            $image_url = $params['image'];
                        } elseif (!empty($params['bg']['imageUrl'])) {
                            $image_url = $params['bg']['imageUrl'];
                        }

                        // Si la imagen es un ID de attachment, convertir a URL
                        if (is_numeric($image_url)) {
                            $image_url = wp_get_attachment_url((int) $image_url) ?: '';
                        }

                        // Extraer link — puede estar en link.url, link_url, etc.
                        $link_url = '';
                        if (!empty($params['link']['url'])) {
                            $link_url = $params['link']['url'];
                        } elseif (!empty($params['link_url'])) {
                            $link_url = $params['link_url'];
                        }

                        // Extraer título del slide
                        $title = '';
                        if (!empty($params['title'])) {
                            $title = $params['title'];
                        } elseif (!empty($params['bg']['alt'])) {
                            $title = $params['bg']['alt'];
                        }
                        if (empty($title)) {
                            $title = $slider['title'] . ' — Slide ' . ($slide['slide_order'] + 1);
                        }

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

            // ── 2) WooCommerce product_cat thumbnails (tiles) ──
            $terms = get_terms(array(
                'taxonomy'   => 'product_cat',
                'hide_empty' => true,
                'parent'     => 0,
                'number'     => 30,
            ));

            if (!is_wp_error($terms)) {
                $order = 0;
                foreach ($terms as $term) {
                    $thumb_id = get_term_meta($term->term_id, 'thumbnail_id', true);
                    if ($thumb_id) {
                        $img_url = wp_get_attachment_url((int) $thumb_id);
                        if ($img_url) {
                            $cat_link = get_term_link($term);
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

            // ── 3) Imágenes promocionales de la media library con tag/categoría "banner" ──
            $banner_attachments = get_posts(array(
                'post_type'      => 'attachment',
                'post_mime_type' => 'image',
                'posts_per_page' => 50,
                'post_status'    => 'inherit',
                's'              => 'banner promo slider promocion',
            ));

            foreach ($banner_attachments as $att) {
                $img_url = wp_get_attachment_url($att->ID);
                if (!$img_url) continue;
                // Evitar duplicados con RevSlider
                $already = false;
                foreach ($results as $r) {
                    if ($r['image_url'] === $img_url) { $already = true; break; }
                }
                if ($already) continue;

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
                'ok'    => true,
                'data'  => $results,
                'total' => count($results),
                'sources' => array(
                    'revslider' => $has_revslider ? true : false,
                    'woo_categories' => !is_wp_error($terms),
                    'media_library' => true,
                )
            ), 200);
        },
        'permission_callback' => function() {
            return current_user_is_logged_in() || (isset($_GET['key']) && $_GET['key'] === MERKAHORRO_API_KEY);
        }
    ));

    // ═══════════════════════════════════════════════
    // GET /wp-json/merkahorro/v1/woo-discount-rules
    // Lee las reglas existentes del plugin "Discount Rules for WooCommerce"
    // directo de la base de datos de WordPress
    // ═══════════════════════════════════════════════
    register_rest_route('merkahorro/v1', '/woo-discount-rules', array(
        'methods' => 'GET',
        'callback' => function() {
            global $wpdb;

            // El plugin "Discount Rules for WooCommerce" usa la tabla wp_wdr_rules
            $table = $wpdb->prefix . 'wdr_rules';

            // Verificar que la tabla existe
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
                $filters = json_decode($rule['filters'] ?? '{}', true);
                $conditions = json_decode($rule['conditions'] ?? '[]', true);
                $discounts = json_decode($rule['product_adjustments'] ?? '{}', true);
                $additional = json_decode($rule['additional'] ?? '{}', true);

                // Extraer tipo y valor del descuento
                $discount_type = 'percentage';
                $discount_value = 0;
                if (!empty($discounts['type'])) {
                    $discount_type = ($discounts['type'] === 'percentage') ? 'percentage' : 'fixed';
                }
                if (!empty($discounts['value'])) {
                    $discount_value = floatval($discounts['value']);
                }

                // Extraer categorías de los filtros
                $category_ids = array();
                $category_names = array();
                if (!empty($filters)) {
                    foreach ($filters as $filter) {
                        if (isset($filter['type']) && $filter['type'] === 'product_category') {
                            $cat_values = $filter['value'] ?? array();
                            foreach ($cat_values as $cat_id) {
                                $term = get_term((int) $cat_id, 'product_cat');
                                if ($term && !is_wp_error($term)) {
                                    $category_ids[] = (int) $cat_id;
                                    $category_names[] = $term->name;
                                }
                            }
                        }
                    }
                }

                // Extraer días de la semana de las condiciones
                $schedule_days = array();
                $schedule_type = 'always';
                $date_start = null;
                $date_end = null;

                if (!empty($conditions)) {
                    foreach ($conditions as $condition_group) {
                        if (!is_array($condition_group)) continue;
                        foreach ($condition_group as $cond) {
                            $cond_type = $cond['type'] ?? '';
                            if ($cond_type === 'cart_item_product_combination_days') {
                                // Días de la semana (0=Dom...6=Sáb en WP, pero chequear formato)
                                $schedule_type = 'days';
                                $day_values = $cond['value'] ?? array();
                                foreach ($day_values as $d) {
                                    $schedule_days[] = (int) $d;
                                }
                            }
                            if ($cond_type === 'order_date' || $cond_type === 'order_date_and_time') {
                                $schedule_type = 'date_range';
                                $date_start = $cond['from'] ?? null;
                                $date_end = $cond['to'] ?? null;
                            }
                        }
                    }
                }

                $parsed[] = array(
                    'woo_rule_id'     => (int) $rule['id'],
                    'title'           => $rule['title'] ?? '(Sin título)',
                    'discount_type'   => $discount_type,
                    'discount_value'  => $discount_value,
                    'applies_to'      => !empty($category_ids) ? 'categories' : 'all',
                    'applies_to_ids'  => $category_ids,
                    'applies_to_names' => $category_names,
                    'schedule_type'   => $schedule_type,
                    'schedule_days'   => $schedule_days,
                    'date_start'      => $date_start,
                    'date_end'        => $date_end,
                    'active'          => ($rule['enabled'] ?? '1') === '1',
                    'priority'        => (int) ($rule['priority'] ?? 0),
                    'raw_filters'     => $filters,
                    'raw_conditions'  => $conditions,
                    'raw_discounts'   => $discounts,
                    'created_at'      => $rule['created_at'] ?? null,
                    'modified_at'     => $rule['modified_at'] ?? null,
                );
            }

            return new WP_REST_Response(array('ok' => true, 'data' => $parsed, 'total' => count($parsed)), 200);
        },
        'permission_callback' => function() {
            return current_user_is_logged_in() || (isset($_GET['key']) && $_GET['key'] === MERKAHORRO_API_KEY);
        }
    ));
});

// ═══════════════════════════════════════════════
// HELPER: Verificar si el usuario está logueado
// ═══════════════════════════════════════════════
function current_user_is_logged_in() {
    return is_user_logged_in() && current_user_can('manage_options');
}

// ═══════════════════════════════════════════════
// DESCUENTOS AUTOMÁTICOS
// Lee las reglas desde la API del Gestor Ecommerce
// y aplica descuentos al carrito de WooCommerce
// ═══════════════════════════════════════════════

/**
 * Obtener reglas de descuento activas desde la API
 */
function merkahorro_get_discount_rules() {
    $cache_key = 'merkahorro_discount_rules';
    $cached = get_transient($cache_key);

    if ($cached !== false) {
        return $cached;
    }

    $url = MERKAHORRO_API_URL . '/content/discounts';
    $response = wp_remote_get($url, array('timeout' => 10, 'sslverify' => false));

    if (is_wp_error($response)) {
        error_log('Merkahorro Discounts API error: ' . $response->get_error_message());
        return array();
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);

    if (!isset($body['ok']) || !$body['ok'] || empty($body['data'])) {
        return array();
    }

    // Solo reglas activas
    $rules = array_filter($body['data'], function($r) {
        return !empty($r['active']);
    });

    set_transient($cache_key, array_values($rules), MERKAHORRO_CACHE_TTL);
    return array_values($rules);
}

/**
 * Verificar si una regla aplica hoy
 */
function merkahorro_rule_applies_today($rule) {
    $schedule = $rule['schedule_type'] ?? 'days';

    if ($schedule === 'always') {
        return true;
    }

    if ($schedule === 'days') {
        $today = (int) current_time('w'); // 0=Dom, 1=Lun...6=Sáb
        $days = $rule['schedule_days'] ?? array();
        return in_array($today, $days, true);
    }

    if ($schedule === 'date_range') {
        $today = current_time('Y-m-d');
        $start = $rule['date_start'] ?? '';
        $end = $rule['date_end'] ?? '';
        return ($today >= $start && $today <= $end);
    }

    return false;
}

/**
 * Verificar si una regla aplica a un producto
 */
function merkahorro_rule_applies_to_product($rule, $product) {
    $applies_to = $rule['applies_to'] ?? 'all';

    if ($applies_to === 'all') {
        return true;
    }

    if ($applies_to === 'categories') {
        $rule_cat_ids = $rule['applies_to_ids'] ?? array();
        if (empty($rule_cat_ids)) return false;

        $product_cat_ids = $product->get_category_ids();
        return !empty(array_intersect($rule_cat_ids, $product_cat_ids));
    }

    return false;
}

/**
 * Aplicar descuentos al carrito de WooCommerce
 * Se ejecuta cada vez que se calcula el carrito
 */
add_action('woocommerce_cart_calculate_fees', function($cart) {
    if (is_admin() && !defined('DOING_AJAX')) return;

    $rules = merkahorro_get_discount_rules();
    if (empty($rules)) return;

    // Filtrar solo las reglas que aplican hoy
    $active_rules = array_filter($rules, 'merkahorro_rule_applies_today');
    if (empty($active_rules)) return;

    foreach ($cart->get_cart() as $cart_item) {
        $product = $cart_item['data'];
        $product_id = $cart_item['product_id'];
        $quantity = $cart_item['quantity'];
        $price = (float) $product->get_price();

        if ($price <= 0) continue;

        // Buscar la primera regla que aplique a este producto
        foreach ($active_rules as $rule) {
            if (!merkahorro_rule_applies_to_product($rule, wc_get_product($product_id))) {
                continue;
            }

            $discount_type = $rule['discount_type'] ?? 'percentage';
            $discount_value = (float) ($rule['discount_value'] ?? 0);

            if ($discount_value <= 0) continue;

            if ($discount_type === 'percentage') {
                $discount_amount = ($price * $discount_value / 100) * $quantity;
            } else {
                $discount_amount = $discount_value * $quantity;
            }

            // No descontar más que el precio total
            $line_total = $price * $quantity;
            if ($discount_amount > $line_total) {
                $discount_amount = $line_total;
            }

            $fee_name = $rule['title'] ?? 'Descuento';
            $cart->add_fee($fee_name, -$discount_amount, false);

            break; // Solo aplicar 1 regla por producto (la primera que coincida)
        }
    }
});
