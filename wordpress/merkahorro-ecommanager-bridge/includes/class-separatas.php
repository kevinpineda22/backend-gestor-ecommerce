<?php
if (!defined('ABSPATH')) exit;

class Merkahorro_Bridge_Separatas {

    public static function init() {
        add_shortcode('merkahorro_separatas', array(__CLASS__, 'separatas_shortcode'));
        
        // Hooks para excluir productos en /ofertas/
        add_action('pre_get_posts', array(__CLASS__, 'exclude_separata_from_main_query'));
        add_filter('woocommerce_shortcode_products_query', array(__CLASS__, 'exclude_separata_from_shortcode'), 10, 3);
        
        // Ruta dinámica para promos específicas
        add_action('init', array(__CLASS__, 'register_promo_rewrite_rule'));
        add_filter('query_vars', array(__CLASS__, 'register_promo_query_vars'));
        add_action('template_redirect', array(__CLASS__, 'handle_promo_template_redirect'));
    }

    public static function get_separata_rule_ids() {
        static $cache = null;
        if ($cache !== null) return $cache;

        $transient_key = 'mks_separata_ids_v1';
        $cached = get_transient($transient_key);
        if ($cached !== false) { $cache = $cached; return $cache; }

        global $wpdb;
        $table  = $wpdb->prefix . 'wdr_rules';
        $prefix = '[MK-Gestor] ';
        $now_ts = time();

        $rules = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT title, filters FROM {$table}
                  WHERE title LIKE %s
                    AND enabled = '1'
                    AND CAST(priority AS UNSIGNED) < 5
                    AND (date_from IS NULL OR date_from = 0 OR date_from <= %d)
                    AND (date_to   IS NULL OR date_to   = 0 OR date_to   >= %d)
                  ORDER BY CAST(priority AS UNSIGNED) ASC",
                $wpdb->esc_like($prefix) . '%', $now_ts, $now_ts
            ),
            ARRAY_A
        );

        $post_ids = array(); $cat_ids = array(); $rule_names = array();

        foreach ($rules as $rule) {
            $label = str_replace($prefix, '', $rule['title']);
            $filters = json_decode($rule['filters'], true);
            if (!is_array($filters)) continue;
            foreach ($filters as $f) {
                if (empty($f['type'])) continue;
                if ($f['type'] === 'products') {
                    foreach ((array)($f['value'] ?? array()) as $id) {
                        $int_id = absint($id);
                        if ($int_id) { $post_ids[] = $int_id; $rule_names[$int_id] = $label; }
                    }
                } elseif ($f['type'] === 'product_category') {
                    foreach ((array)($f['value'] ?? array()) as $id) { $cat_ids[] = absint($id); }
                    $rule_names['cat_' . implode('_', $f['value'] ?? array())] = $label;
                }
            }
        }

        $cache = array(
            'post_ids'   => array_values(array_unique($post_ids)),
            'cat_ids'    => array_values(array_unique($cat_ids)),
            'rule_names' => $rule_names,
        );
        set_transient($transient_key, $cache, 300);
        return $cache;
    }

    public static function get_separata_ids_to_exclude() {
        static $ids = null;
        if ($ids !== null) return $ids;
        $sep_data = self::get_separata_rule_ids();
        $ids = $sep_data['post_ids'];
        return $ids;
    }

    public static function exclude_separata_from_main_query($query) {
        if (!$query->is_main_query() || is_admin()) return;
        if (!$query->is_page('ofertas')) return;

        $exclude_ids = self::get_separata_ids_to_exclude();
        if (!empty($exclude_ids)) {
            $current = (array) $query->get('post__not_in');
            $query->set('post__not_in', array_unique(array_merge($current, $exclude_ids)));
        }
    }

    public static function exclude_separata_from_shortcode($query_args, $atts, $type) {
        global $post;
        if (!$post || $post->post_name !== 'ofertas') return $query_args;

        $exclude_ids = self::get_separata_ids_to_exclude();
        if (!empty($exclude_ids)) {
            $current = (array) ($query_args['post__not_in'] ?? array());
            $query_args['post__not_in'] = array_unique(array_merge($current, $exclude_ids));
        }
        return $query_args;
    }

    public static function register_promo_rewrite_rule() {
        add_rewrite_rule('^promo/descuento/([0-9]+)/?$', 'index.php?merkahorro_promo_id=$matches[1]', 'top');
    }

    public static function register_promo_query_vars($vars) {
        $vars[] = 'merkahorro_promo_id';
        return $vars;
    }

    public static function handle_promo_template_redirect() {
        $promo_id = get_query_var('merkahorro_promo_id');
        if (!$promo_id) return;
        $promo_id = absint($promo_id);

        $url = MERKAHORRO_API_URL . '/content/discounts/' . $promo_id . '?t=' . time();
        $response = wp_remote_get($url, array('timeout' => 10, 'sslverify' => true));

        $rule = null;
        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (!empty($body['ok']) && !empty($body['data'])) $rule = $body['data'];
        }

        $current_sede = merkahorro_get_current_sede();
        $rule_sedes = $rule['sedes'] ?? null;

        if ($rule !== null && !empty($rule_sedes) && is_array($rule_sedes)) {
            if ($current_sede && !in_array($current_sede, $rule_sedes, true)) {
                wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
                exit;
            }
        }

        if ($rule !== null && empty($rule['active'])) {
            wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
            exit;
        }

        $discount_active_today = true;
        $next_discount_label = '';

        if ($rule !== null) {
            $schedule_type = $rule['schedule_type'] ?? 'days';
            $schedule_days = $rule['schedule_days'] ?? array();
            $date_start = $rule['date_start'] ?? '';
            $date_end = $rule['date_end'] ?? '';

            if ($schedule_type === 'days' && !empty($schedule_days)) {
                $today_dow = (int) date('w');
                $discount_active_today = in_array($today_dow, array_map('intval', $schedule_days), true);

                if (!$discount_active_today) {
                    $day_names_es = array('domingo','lunes','martes','miércoles','jueves','viernes','sábado');
                    $month_names_es = array('','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre');
                    $sorted_days = array_map('intval', $schedule_days);
                    sort($sorted_days);
                    $next_dow = null;
                    foreach ($sorted_days as $d) { if ($d > $today_dow) { $next_dow = $d; break; } }
                    if ($next_dow === null) { $next_dow = $sorted_days[0]; }
                    $days_ahead = ($next_dow - $today_dow + 7) % 7;
                    if ($days_ahead === 0) $days_ahead = 7;
                    $next_ts = strtotime("+{$days_ahead} days");
                    $next_discount_label = $day_names_es[$next_dow] . ' ' . date('j', $next_ts) . ' de ' . $month_names_es[(int) date('n', $next_ts)];
                }
            } elseif ($schedule_type === 'date_range') {
                $today_ts = strtotime(date('Y-m-d'));
                if (!empty($date_start) && $today_ts < strtotime($date_start)) {
                    $discount_active_today = false;
                    $month_names_es = array('','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre');
                    $ts = strtotime($date_start);
                    $next_discount_label = date('j', $ts) . ' de ' . $month_names_es[(int) date('n', $ts)];
                } elseif (!empty($date_end) && $today_ts > strtotime($date_end)) {
                    wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
                    exit;
                }
            }
        }

        $rule_title = $rule['title'] ?? 'Productos en Promoción';
        $applies_to = $rule['applies_to'] ?? 'all';
        $applies_to_ids = $rule['applies_to_ids'] ?? array();
        $discount_type = $rule['discount_type'] ?? 'percentage';
        $discount_value = $rule['discount_value'] ?? 0;

        if ($discount_type === 'percentage') {
            $badge_str = $discount_value . '% OFF';
        } else {
            $badge_str = '$' . number_format((float)$discount_value, 0, ',', '.') . ' de descuento';
        }

        $paged = max(1, intval(get_query_var('paged') ?: ($_GET['paged'] ?? 1)));
        $min_price = isset($_GET['min_price']) ? floatval($_GET['min_price']) : null;
        $max_price = isset($_GET['max_price']) ? floatval($_GET['max_price']) : null;
        $orderby_raw = sanitize_text_field($_GET['orderby'] ?? 'menu_order');

        $orderby_map = array(
            'menu_order' => array('orderby' => 'menu_order title', 'order' => 'ASC'),
            'popularity' => array('orderby' => 'meta_value_num', 'meta_key' => 'total_sales', 'order' => 'DESC'),
            'rating'     => array('orderby' => 'meta_value_num', 'meta_key' => '_wc_average_rating', 'order' => 'DESC'),
            'date'       => array('orderby' => 'date', 'order' => 'DESC'),
            'price'      => array('orderby' => 'meta_value_num', 'meta_key' => '_price', 'order' => 'ASC'),
            'price-desc' => array('orderby' => 'meta_value_num', 'meta_key' => '_price', 'order' => 'DESC'),
        );
        $ob = $orderby_map[$orderby_raw] ?? $orderby_map['menu_order'];

        $query_args = array(
            'post_type'      => 'product',
            'post_status'    => 'publish',
            'posts_per_page' => 12,
            'paged'          => $paged,
            'orderby'        => $ob['orderby'],
            'order'          => $ob['order'],
        );
        if (!empty($ob['meta_key'])) $query_args['meta_key'] = $ob['meta_key'];

        if ($applies_to === 'products' && !empty($applies_to_ids)) {
            $query_args['post__in'] = array_map('absint', $applies_to_ids);
        } elseif ($applies_to === 'categories' && !empty($applies_to_ids)) {
            $query_args['tax_query'] = array(array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => array_map('absint', $applies_to_ids)));
        } else {
            $query_args['meta_query'][] = array('key' => '_sale_price', 'value' => '', 'compare' => '!=');
        }

        if ($min_price !== null || $max_price !== null) {
            $price_meta = array('relation' => 'AND');
            if ($min_price !== null) $price_meta[] = array('key' => '_price', 'value' => $min_price, 'compare' => '>=', 'type' => 'NUMERIC');
            if ($max_price !== null) $price_meta[] = array('key' => '_price', 'value' => $max_price, 'compare' => '<=', 'type' => 'NUMERIC');
            if (!empty($query_args['meta_query'])) $query_args['meta_query'] = array_merge(array('relation' => 'AND'), (array) $query_args['meta_query'], array($price_meta));
            else $query_args['meta_query'] = $price_meta;
        }

        if (!empty($_GET['filter_cat'])) {
            $filter_cat_ids = array_map('absint', explode(',', sanitize_text_field($_GET['filter_cat'])));
            $extra_tax = array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $filter_cat_ids);
            if (!empty($query_args['tax_query'])) $query_args['tax_query'] = array('relation' => 'AND', $query_args['tax_query'][0], $extra_tax);
            else $query_args['tax_query'] = array($extra_tax);
        }

        $promo_loop = new WP_Query($query_args);

        add_action('wp_head', function() { ?>
            <style>
                .mks-promo-hero { border-bottom: 3px solid #88dc00; padding: 32px 20px 26px; text-align: center; background: #fff; }
                .mks-promo-hero h1 { margin: 0 0 12px; font-size: 2rem; color: #160857 !important; font-weight: 800; line-height: 1.2; }
                .mks-promo-badge { display: inline-block; background: #88dc00; color: #160857; font-weight: 800; font-size: 1.1rem; padding: 6px 22px; border-radius: 20px; }
                .mks-promo-badge-upcoming { display: inline-block; background: #f5a623; color: #fff; font-weight: 800; font-size: 1.05rem; padding: 6px 22px; border-radius: 20px; }
                .mks-promo-upcoming { display: flex; align-items: center; justify-content: center; gap: 10px; background: #fff8e1; border-top: 1px solid #ffe082; border-bottom: 3px solid #f5a623; color: #7a4f00; padding: 14px 24px; font-size: 0.95rem; font-weight: 600; text-align: center; }
                .mks-promo-wrap { display: flex; gap: 32px; max-width: 1280px; margin: 28px auto; padding: 0 20px 60px; align-items: flex-start; }
                .mks-promo-sidebar { flex: 0 0 240px; min-width: 0; }
                .mks-filter-widget { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 18px 16px; margin-bottom: 16px; }
                .mks-filter-widget-title { font-size: 0.82rem; font-weight: 700; text-transform: uppercase; color: #160857; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2px solid #88dc00; }
                .mks-price-inputs { display: flex; align-items: center; gap: 6px; }
                .mks-price-input { flex: 1; min-width: 0; border: 1px solid #ddd; border-radius: 6px; padding: 7px 8px; font-size: 0.85rem; width: 100%; }
                .mks-price-apply { display: block; width: 100%; margin-top: 10px; background: #160857; color: #fff; border: none; border-radius: 6px; padding: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
                .mks-price-apply:hover { background: #88dc00; color: #160857; }
                .mks-cat-list { list-style: none; margin: 0; padding: 0; }
                .mks-cat-list a { display: flex; align-items: center; justify-content: space-between; font-size: 0.88rem; color: #333; text-decoration: none; padding: 4px 0; border-bottom: 1px solid #f4f4f4; }
                .mks-cat-list a:hover, .mks-cat-list a.active { color: #160857; font-weight: 700; }
                .mks-cat-count { background: #f0f0f0; border-radius: 10px; padding: 1px 7px; font-size: 0.78rem; color: #666; }
                .mks-sort-select { width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; font-size: 0.88rem; background: #fff; cursor: pointer; }
                .mks-active-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
                .mks-filter-chip { display: inline-flex; align-items: center; gap: 5px; background: #160857; color: #fff; border-radius: 20px; padding: 3px 10px; font-size: 0.8rem; font-weight: 600; }
                .mks-filter-chip a { color: #88dc00; text-decoration: none; font-weight: 800; }
                .mks-promo-main { flex: 1 1 0; min-width: 0; }
                .mks-promo-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
                .mks-result-count { font-size: 0.85rem; color: #888; }
                @media (max-width: 768px) { .mks-promo-wrap { flex-direction: column; } .mks-promo-sidebar { flex: none; width: 100%; } .mks-promo-hero h1 { font-size: 1.5rem; } }
            </style>
        <?php }, 99);

        $promo_cats = array();
        if ($applies_to === 'products' && !empty($applies_to_ids)) {
            foreach (array_slice($applies_to_ids, 0, 60) as $pid) {
                $terms = get_the_terms($pid, 'product_cat');
                if ($terms && !is_wp_error($terms)) {
                    foreach ($terms as $t) {
                        if (!isset($promo_cats[$t->term_id])) $promo_cats[$t->term_id] = array('name' => $t->name, 'count' => 0);
                        $promo_cats[$t->term_id]['count']++;
                    }
                }
            }
        } elseif ($applies_to === 'categories' && !empty($applies_to_ids)) {
            foreach ($applies_to_ids as $cat_id) {
                $t = get_term($cat_id, 'product_cat');
                if ($t && !is_wp_error($t)) $promo_cats[$t->term_id] = array('name' => $t->name, 'count' => $t->count);
            }
        }

        $active_min = isset($_GET['min_price']) ? floatval($_GET['min_price']) : '';
        $active_max = isset($_GET['max_price']) ? floatval($_GET['max_price']) : '';
        $has_price_filter = ($active_min !== '' || $active_max !== '');

        add_filter('document_title_parts', function($title) use ($rule_title) {
            $title['title'] = preg_replace('/^\[MK-Gestor\]\s*/i', '', $rule_title);
            return $title;
        });

        get_header();
        ?>
        <div class="mks-promo-hero">
            <h1><?php echo esc_html($rule_title); ?></h1>
            <?php if ($discount_active_today && $discount_value > 0): ?>
                <div class="mks-promo-badge"><?php echo esc_html($badge_str); ?></div>
            <?php elseif (!$discount_active_today): ?>
                <div class="mks-promo-badge-upcoming">🕐 Próximo: <?php echo esc_html($next_discount_label ?: 'próximamente'); ?></div>
            <?php endif; ?>
        </div>

        <?php if (!$discount_active_today): ?>
        <div class="mks-promo-upcoming">
            <span class="mks-upcoming-icon">🗓️</span>
            <span>Hoy estos productos <strong>no tienen descuento activo</strong>. <?php if ($next_discount_label): ?>El <strong><?php echo esc_html($badge_str); ?></strong> aplica el <strong><?php echo esc_html($next_discount_label); ?></strong><?php endif; ?></span>
        </div>
        <?php endif; ?>

        <div class="mks-promo-wrap woocommerce">
            <aside class="mks-promo-sidebar">
                <?php if ($has_price_filter): ?>
                <div class="mks-active-filters">
                    <span class="mks-filter-chip">
                        $<?php echo number_format((float)$active_min, 0, ',', '.'); ?> – $<?php echo number_format((float)$active_max, 0, ',', '.'); ?>
                        <a href="<?php echo esc_url(add_query_arg(array('min_price'=>false,'max_price'=>false,'paged'=>false))); ?>">✕</a>
                    </span>
                </div>
                <?php endif; ?>

                <div class="mks-filter-widget">
                    <p class="mks-filter-widget-title">💰 Filtrar por precio</p>
                    <form method="get">
                        <?php foreach ($_GET as $k => $v): if (in_array($k, array('min_price','max_price','paged'), true)) continue; echo '<input type="hidden" name="' . esc_attr($k) . '" value="' . esc_attr($v) . '">'; endforeach; ?>
                        <div class="mks-price-inputs">
                            <span style="font-size:.8rem;color:#888">$</span>
                            <input class="mks-price-input" type="number" name="min_price" value="<?php echo esc_attr($active_min); ?>" placeholder="Mín" min="0" step="500">
                            <span class="mks-price-sep">—</span>
                            <input class="mks-price-input" type="number" name="max_price" value="<?php echo esc_attr($active_max); ?>" placeholder="Máx" min="0" step="500">
                        </div>
                        <button type="submit" class="mks-price-apply">Aplicar filtro</button>
                    </form>
                </div>

                <?php if (!empty($promo_cats) && count($promo_cats) > 1): ?>
                <div class="mks-filter-widget">
                    <p class="mks-filter-widget-title">📁 Categorías en oferta</p>
                    <ul class="mks-cat-list">
                        <?php foreach ($promo_cats as $cid => $cdata): 
                            $is_active = (isset($_GET['filter_cat']) && $_GET['filter_cat'] == $cid);
                            $url = $is_active ? remove_query_arg('filter_cat') : add_query_arg('filter_cat', $cid);
                        ?>
                        <li>
                            <a href="<?php echo esc_url($url); ?>" class="<?php echo $is_active ? 'active' : ''; ?>">
                                <?php echo esc_html($cdata['name']); ?> <span class="mks-cat-count"><?php echo $cdata['count']; ?></span>
                            </a>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                </div>
                <?php endif; ?>
            </aside>

            <main class="mks-promo-main">
                <div class="mks-promo-toolbar">
                    <div class="mks-result-count">Mostrando <?php echo $promo_loop->post_count; ?> de <?php echo $promo_loop->found_posts; ?> productos</div>
                    <form method="get" class="woocommerce-ordering">
                        <?php foreach ($_GET as $k => $v): if (in_array($k, array('orderby', 'paged'), true)) continue; echo '<input type="hidden" name="' . esc_attr($k) . '" value="' . esc_attr($v) . '">'; endforeach; ?>
                        <select name="orderby" class="mks-sort-select" onchange="this.form.submit()">
                            <option value="menu_order" <?php selected($orderby_raw, 'menu_order'); ?>>Orden predeterminado</option>
                            <option value="popularity" <?php selected($orderby_raw, 'popularity'); ?>>Ordenar por popularidad</option>
                            <option value="rating" <?php selected($orderby_raw, 'rating'); ?>>Ordenar por calificación media</option>
                            <option value="date" <?php selected($orderby_raw, 'date'); ?>>Ordenar por los últimos</option>
                            <option value="price" <?php selected($orderby_raw, 'price'); ?>>Ordenar por precio: bajo a alto</option>
                            <option value="price-desc" <?php selected($orderby_raw, 'price-desc'); ?>>Ordenar por precio: alto a bajo</option>
                        </select>
                    </form>
                </div>

                <?php
                if ($promo_loop->have_posts()) {
                    woocommerce_product_loop_start();
                    while ($promo_loop->have_posts()) {
                        $promo_loop->the_post();
                        wc_get_template_part('content', 'product');
                    }
                    woocommerce_product_loop_end();

                    $total_pages = $promo_loop->max_num_pages;
                    if ($total_pages > 1) {
                        echo '<nav class="woocommerce-pagination" style="margin-top:24px;">';
                        echo paginate_links(array('base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $paged, 'total' => $total_pages, 'prev_text' => '&laquo;', 'next_text' => '&raquo;', 'type' => 'list'));
                        echo '</nav>';
                    }
                } else {
                    echo '<p class="woocommerce-info">No se encontraron productos que coincidan con tu selección.</p>';
                }
                wp_reset_postdata();
                ?>
            </main>
        </div>
        <?php
        get_footer();
        exit;
    }

    public static function separatas_shortcode($atts) {
        $atts = shortcode_atts(array(
            'section' => 'promo_separatas',
            'cols'    => '3',
        ), $atts);

        $banners = Merkahorro_Bridge_Banners::get_banners($atts['section'], merkahorro_get_current_sede());
        
        $grid_id = 'mks-sep-' . wp_rand(1000, 9999);
        $prod_grid = 'mks-sep-prod-' . wp_rand(1000, 9999);

        $sep_products = array(); $sep_total = 0; $sep_max_pages = 1;
        $sep_paged = max(1, intval($_GET['sep_page'] ?? 1));
        $sep_filter_cat = isset($_GET['sep_cat']) ? absint($_GET['sep_cat']) : 0;
        $per_page_sep = 12;

        $sep_ids_data = self::get_separata_rule_ids();
        $sep_post_ids = $sep_ids_data['post_ids'];
        $sep_cat_ids = $sep_ids_data['cat_ids'];
        $available_cats = array();

        if (!empty($sep_post_ids) || !empty($sep_cat_ids)) {
            $sep_args = array('post_type' => 'product', 'post_status' => 'publish', 'posts_per_page' => $per_page_sep, 'paged' => $sep_paged, 'orderby' => 'menu_order title', 'order' => 'ASC');
            if (!empty($sep_post_ids)) $sep_args['post__in'] = $sep_post_ids;
            elseif (!empty($sep_cat_ids)) $sep_args['tax_query'] = array(array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $sep_cat_ids));
            
            if ($sep_filter_cat > 0) {
                if (!isset($sep_args['tax_query'])) $sep_args['tax_query'] = array('relation' => 'AND');
                else $sep_args['tax_query']['relation'] = 'AND';
                $sep_args['tax_query'][] = array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $sep_filter_cat);
            }
            
            $sep_query = new WP_Query($sep_args);
            $sep_total = $sep_query->found_posts;
            $sep_max_pages = $sep_query->max_num_pages;
            while ($sep_query->have_posts()) { $sep_query->the_post(); $sep_products[] = wc_get_product(get_the_ID()); }
            wp_reset_postdata();

            if (!empty($sep_post_ids)) {
                $cat_terms = wp_get_object_terms($sep_post_ids, 'product_cat');
                if (!is_wp_error($cat_terms)) $available_cats = $cat_terms;
            } elseif (!empty($sep_cat_ids)) {
                foreach ($sep_cat_ids as $cid) { $term = get_term($cid, 'product_cat'); if ($term && !is_wp_error($term)) $available_cats[] = $term; }
            }
        }

        ob_start();
        ?>
        <style>
            /* Hero */
            .mks-sep-hero { padding: 8px 0 24px; text-align: left; border-bottom: 3px solid #88dc00; margin-bottom: 28px; }
            .mks-sep-hero h2 { margin: 0 0 6px; font-size: 1.8rem; font-weight: 900; color: #160857 !important; }
            .mks-sep-section-label { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: #160857; margin: 28px 0 14px; display: flex; align-items: center; gap: 10px; }
            .mks-sep-section-label::after { content: ''; flex: 1; height: 2px; background: #e8e8e8; }
            
            /* Carousel */
            .mks-sep-carousel-wrap { position: relative; margin-bottom: 36px; }
            #<?php echo esc_attr($grid_id); ?> { display: flex; gap: 18px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 2px 12px; scrollbar-width: none; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
            #<?php echo esc_attr($grid_id); ?>::-webkit-scrollbar { display: none; }
            .mks-sep-card { flex: 0 0 calc(33.333% - 12px); scroll-snap-align: start; border-radius: 14px; box-shadow: 0 3px 14px rgba(0,0,0,0.09); background: #fff; cursor: zoom-in; transition: transform .25s ease, box-shadow .25s ease; }
            .mks-sep-card:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(22,8,87,0.18); }
            .mks-sep-card img { width: 100%; height: auto; border-radius: 14px; display: block; }
            .mks-sep-nav-btn { position: absolute; top: 50%; transform: translateY(-55%); background: #160857; color: #fff; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 1.5rem; cursor: pointer; z-index: 2; line-height: 40px; text-align: center; padding: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.25); transition: background .2s; display: none; }
            .mks-sep-nav-btn:hover { background: #88dc00; color: #160857; }
            .mks-sep-nav-prev { left: -20px; }
            .mks-sep-nav-next { right: -20px; }

            /* Lightbox Modal */
            .mks-sep-modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 99999; align-items: center; justify-content: center; padding: 20px; }
            .mks-sep-modal-overlay.active { display: flex; }
            .mks-sep-modal-inner { position: relative; max-width: 90vw; max-height: 90vh; }
            .mks-sep-modal-inner img { max-width: 100%; max-height: 90vh; border-radius: 10px; display: block; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }
            .mks-sep-modal-close { position: absolute; top: -14px; right: -14px; background: #88dc00; color: #160857; border: none; border-radius: 50%; width: 34px; height: 34px; font-size: 1.2rem; font-weight: 900; cursor: pointer; line-height: 34px; text-align: center; padding: 0; }

            /* Filtros - CORREGIDO */
            .mks-sep-filters { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 24px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
            .mks-sep-filters::-webkit-scrollbar { display: none; }
            .mks-sep-filter-btn { background: #f1f1f1; color: #444; border: 1px solid #e1e1e1; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; white-space: nowrap; text-decoration: none; transition: all 0.2s; display: inline-block; }
            .mks-sep-filter-btn.active, .mks-sep-filter-btn:hover { background: #160857; color: #fff; border-color: #160857; }

            @media (max-width: 900px) { .mks-sep-card { flex: 0 0 calc(50% - 9px); } }
            @media (max-width: 560px) { .mks-sep-card { flex: 0 0 83vw; } .mks-sep-hero h2 { font-size: 1.5rem; } }
        </style>

        <!-- Lightbox overlay HTML -->
        <div class="mks-sep-modal-overlay" id="mks-sep-modal-<?php echo esc_attr($grid_id); ?>">
            <div class="mks-sep-modal-inner">
                <button class="mks-sep-modal-close" aria-label="Cerrar">✕</button>
                <img src="" alt="Separata" id="mks-sep-modal-img-<?php echo esc_attr($grid_id); ?>">
            </div>
        </div>
        
        <div class="mks-sep-hero">
            <h2>OFERTAS ESPECIALES</h2>
            <p>Separatas y promociones exclusivas de nuestra tienda</p>
        </div>

        <?php if (!empty($banners)): ?>
        <p class="mks-sep-section-label">🗞️ Separatas de la semana</p>
        <div class="mks-sep-carousel-wrap">
            <button class="mks-sep-nav-btn mks-sep-nav-prev" id="mks-prev-<?php echo esc_attr($grid_id); ?>" aria-label="Anterior">&#8249;</button>
            <div id="<?php echo esc_attr($grid_id); ?>">
                <?php foreach ($banners as $sep): ?>
                    <div class="mks-sep-card" role="button" tabindex="0" data-img="<?php echo esc_url($sep['image_url']); ?>" data-alt="<?php echo esc_attr($sep['title'] ?? ''); ?>">
                        <img src="<?php echo esc_url($sep['image_url']); ?>" alt="<?php echo esc_attr($sep['title'] ?? ''); ?>" loading="lazy">
                    </div>
                <?php endforeach; ?>
            </div>
            <button class="mks-sep-nav-btn mks-sep-nav-next" id="mks-next-<?php echo esc_attr($grid_id); ?>" aria-label="Siguiente">&#8250;</button>
        </div>

        <script>
        (function(){
            // Lightbox
            var overlay = document.getElementById('mks-sep-modal-<?php echo esc_js($grid_id); ?>');
            if (overlay) {
                overlay.addEventListener('click', function(e){
                    if (e.target === overlay || e.target.classList.contains('mks-sep-modal-close')) {
                        overlay.classList.remove('active');
                        document.body.style.overflow = '';
                    }
                });
                document.addEventListener('keydown', function(e){
                    if (e.key === 'Escape' && overlay.classList.contains('active')) {
                        overlay.classList.remove('active');
                        document.body.style.overflow = '';
                    }
                });
            }

            // Carousel y Modal triggers
            var carousel = document.getElementById('<?php echo esc_js($grid_id); ?>');
            var btnPrev  = document.getElementById('mks-prev-<?php echo esc_js($grid_id); ?>');
            var btnNext  = document.getElementById('mks-next-<?php echo esc_js($grid_id); ?>');
            var modalImg = document.getElementById('mks-sep-modal-img-<?php echo esc_js($grid_id); ?>');
            
            if (carousel) {
                var cards = carousel.querySelectorAll('.mks-sep-card');
                if (btnPrev && btnNext && cards.length > 3) {
                    btnPrev.style.display = 'block'; btnNext.style.display = 'block';
                    function cardW() { return cards.length ? cards[0].offsetWidth + 18 : 300; }
                    btnPrev.addEventListener('click', function(){ carousel.scrollBy({ left: -cardW(), behavior: 'smooth' }); });
                    btnNext.addEventListener('click', function(){ carousel.scrollBy({ left:  cardW(), behavior: 'smooth' }); });
                }

                if (overlay && modalImg) {
                    carousel.addEventListener('click', function(e) {
                        var card = e.target.closest('.mks-sep-card');
                        if (!card) return;
                        e.preventDefault();
                        modalImg.src = card.dataset.img || '';
                        modalImg.alt = card.dataset.alt || '';
                        overlay.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    });
                }
            }
        })();
        </script>
        <?php endif; ?>

        <?php if (!empty($sep_products) || $sep_filter_cat > 0): ?>
        <p class="mks-sep-section-label" style="margin-top:36px;">🛒 Productos en oferta especial</p>
        
        <?php if (!empty($available_cats) && count($available_cats) > 1): ?>
            <div class="mks-sep-filters">
                <a href="?sep_cat=0" class="mks-sep-filter-btn <?php echo ($sep_filter_cat === 0) ? 'active' : ''; ?>">Todos</a>
                <?php foreach ($available_cats as $cat): ?>
                    <a href="?sep_cat=<?php echo esc_attr($cat->term_id); ?>" class="mks-sep-filter-btn <?php echo ($sep_filter_cat === $cat->term_id) ? 'active' : ''; ?>"><?php echo esc_html($cat->name); ?></a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <div id="<?php echo esc_attr($prod_grid); ?>" class="woocommerce">
            <?php
            if (empty($sep_products)) echo '<p style="text-align:center;padding:20px;color:#999;">No se encontraron productos en esta categoría.</p>';
            else {
                wc_setup_loop(array('columns' => 4, 'total' => $sep_total, 'total_pages' => $sep_max_pages, 'current_page' => $sep_paged));
                woocommerce_product_loop_start();
                foreach ($sep_products as $product):
                    if (!$product || !$product->is_visible()) continue;
                    $GLOBALS['post'] = get_post($product->get_id());
                    setup_postdata($GLOBALS['post']);
                    wc_get_template_part('content', 'product');
                endforeach;
                wp_reset_postdata();
                woocommerce_product_loop_end();
                wc_reset_loop();
            }
            ?>
        </div>

        <!-- Paginación RESTAURADA -->
        <?php if ($sep_max_pages > 1): ?>
        <div class="woocommerce">
            <nav class="woocommerce-pagination" style="margin-top:24px;">
                <?php echo paginate_links(array(
                    'base'      => add_query_arg('sep_page', '%#%'),
                    'format'    => '',
                    'current'   => $sep_paged,
                    'total'     => $sep_max_pages,
                    'prev_text' => '&laquo;',
                    'next_text' => '&raquo;',
                    'type'      => 'list',
                    'add_args'  => $sep_filter_cat > 0 ? array('sep_cat' => $sep_filter_cat) : false,
                )); ?>
            </nav>
        </div>
        <?php endif; ?>

        <?php endif; ?>
        <?php
        return ob_get_clean();
    }
}