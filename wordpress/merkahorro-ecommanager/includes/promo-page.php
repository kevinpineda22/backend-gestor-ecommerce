<?php
/**
 * Merkahorro EcomManager — Página de descuento /promo/descuento/{id}/
 *
 * - Registra la rewrite rule /promo/descuento/{id}/
 * - Arregla el título de pestaña con múltiples filtros defensivos
 * - Renderiza la página de productos via template_redirect
 * - Todo el CSS viene de assets/merkahorro.css (ningún <style> inline aquí)
 */

if (!defined('ABSPATH')) exit;

// ─── Rewrite rule ────────────────────────────────────────────────────────────
add_action('init', function() {
    add_rewrite_rule(
        '^promo/descuento/([0-9]+)/?$',
        'index.php?merkahorro_promo_id=$matches[1]',
        'top'
    );
});

add_filter('query_vars', function($vars) {
    $vars[] = 'merkahorro_promo_id';
    return $vars;
});

// ─── Helper: datos de la regla (caché estático — sin segunda llamada a la API) ──
function merkahorro_get_promo_rule($promo_id) {
    static $cache = array();
    $promo_id = absint($promo_id);
    if (!$promo_id) return null;
    if (array_key_exists($promo_id, $cache)) return $cache[$promo_id];

    $url      = MERKAHORRO_API_URL . '/content/discounts/' . $promo_id;
    $response = wp_remote_get($url, array('timeout' => 10, 'sslverify' => false));
    $rule     = null;
    if (!is_wp_error($response)) {
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['ok']) && !empty($body['data'])) {
            $rule = $body['data'];
        }
    }
    $cache[$promo_id] = $rule;
    return $rule;
}

// ─── Título de pestaña + bloqueo de caché ─────────────────────────────────────
// Hook 'wp' priority 1 — corre antes de plugins SEO y de get_header().
// Aplica múltiples filtros en cascada para cubrir todos los casos.
add_action('wp', function() {
    $promo_id = absint(get_query_var('merkahorro_promo_id'));
    if (!$promo_id) return;

    // 1. Prevenir servicio desde caché (LiteSpeed, WP Super Cache, W3TC, WP Rocket…)
    //    Es esto lo que causaba el título incorrecto en la página 1 del historial.
    if (!defined('DONOTCACHEPAGE'))   define('DONOTCACHEPAGE',   true);
    if (!defined('DONOTCACHEOBJECT')) define('DONOTCACHEOBJECT', true);
    if (!defined('LSCACHE_NO_CACHE')) define('LSCACHE_NO_CACHE', true);

    $rule       = merkahorro_get_promo_rule($promo_id);
    $rule_title = $rule ? ($rule['title'] ?? 'Productos en Promoción') : 'Productos en Promoción';
    $clean      = preg_replace('/^\[MK-Gestor\]\s*/i', '', $rule_title);
    $blog_name  = get_bloginfo('name', 'display');
    $full_title = $clean . ' › ' . $blog_name; // ej: "25% en Legumbre › Merkahorro"

    // 2. pre_get_document_title — short-circuit nativo de WordPress
    add_filter('pre_get_document_title', function() use ($full_title) { return $full_title; }, 999);

    // 3. Filtros específicos de plugins SEO (por si bypasean pre_get_document_title)
    $override = function() use ($full_title) { return $full_title; };
    add_filter('wpseo_title',              $override, 999); // Yoast SEO
    add_filter('rank_math/frontend/title', $override, 999); // RankMath
    add_filter('aioseop_title',            $override, 999); // All-in-One SEO
    add_filter('seopress_titles_title',    $override, 999); // SEOPress

    // 4. Fallback para temas que no usen wp_get_document_title()
    add_filter('document_title_parts', function($parts) use ($clean) {
        $parts['title'] = $clean;
        return $parts;
    }, 999);
}, 1);

// ─── Renderizado de la página /promo/descuento/{id}/ ─────────────────────────
add_action('template_redirect', function() {
    $promo_id = absint(get_query_var('merkahorro_promo_id'));
    if (!$promo_id) return;

    $rule = merkahorro_get_promo_rule($promo_id);

    // ── Validar sede ──────────────────────────────────────────────────────────
    $current_sede = merkahorro_get_current_sede();
    $rule_sedes   = $rule['sedes'] ?? null;
    if ($rule !== null && !empty($rule_sedes) && is_array($rule_sedes)) {
        if ($current_sede && !in_array($current_sede, $rule_sedes, true)) {
            wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
            exit;
        }
    }

    // ── Validar que la regla esté activa ──────────────────────────────────────
    if ($rule !== null && empty($rule['active'])) {
        wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
        exit;
    }

    // ── Detectar si el descuento aplica HOY ───────────────────────────────────
    $discount_active_today = true;
    $next_discount_label   = '';

    if ($rule !== null) {
        $schedule_type = $rule['schedule_type'] ?? 'days';
        $schedule_days = $rule['schedule_days'] ?? array();
        $date_start    = $rule['date_start'] ?? '';
        $date_end      = $rule['date_end'] ?? '';

        // Usar la zona horaria de Colombia para calcular TODO lo relacionado con fechas/días.
        // En algunos servidores la zona del servidor puede ser UTC — sin esto, date('w') etc.
        // devolvería el día equivocado para Colombia.
        $col_tz  = new DateTimeZone(get_option('timezone_string') ?: 'America/Bogota');
        $now_col = new DateTime('now', $col_tz);

        if ($schedule_type === 'days' && !empty($schedule_days)) {
            $today_dow = (int) $now_col->format('w'); // 0=Dom … 6=Sáb
            $discount_active_today = in_array($today_dow, array_map('intval', $schedule_days), true);

            if (!$discount_active_today) {
                $day_names_es   = array('domingo','lunes','martes','miércoles','jueves','viernes','sábado');
                $month_names_es = array('','enero','febrero','marzo','abril','mayo','junio',
                                        'julio','agosto','septiembre','octubre','noviembre','diciembre');
                $sorted_days    = array_map('intval', $schedule_days);
                sort($sorted_days);
                $next_dow = null;
                foreach ($sorted_days as $d) { if ($d > $today_dow) { $next_dow = $d; break; } }
                if ($next_dow === null) { $next_dow = $sorted_days[0]; }
                $days_ahead = ($next_dow - $today_dow + 7) % 7;
                if ($days_ahead === 0) $days_ahead = 7;
                // Sumar días al "ahora en Colombia"
                $next_col = clone $now_col;
                $next_col->modify("+{$days_ahead} days");
                $next_discount_label = $day_names_es[$next_dow] . ' ' . $next_col->format('j')
                    . ' de ' . $month_names_es[(int) $next_col->format('n')];
            }
        } elseif ($schedule_type === 'date_range') {
            $today_col_str = $now_col->format('Y-m-d');
            if (!empty($date_start) && $today_col_str < $date_start) {
                $discount_active_today = false;
                $month_names_es = array('','enero','febrero','marzo','abril','mayo','junio',
                                        'julio','agosto','septiembre','octubre','noviembre','diciembre');
                $start_dt = new DateTime($date_start . ' 00:00:00', $col_tz);
                $next_discount_label = $start_dt->format('j') . ' de ' . $month_names_es[(int) $start_dt->format('n')];
            } elseif (!empty($date_end) && $today_col_str > $date_end) {
                wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
                exit;
            }
        }
    }

    // ── Datos de la regla ─────────────────────────────────────────────────────
    $rule_title     = $rule['title']          ?? 'Productos en Promoción';
    $applies_to     = $rule['applies_to']     ?? 'all';
    $applies_to_ids = $rule['applies_to_ids'] ?? array();
    $discount_type  = $rule['discount_type']  ?? 'percentage';
    $discount_value = $rule['discount_value'] ?? 0;

    $badge_str = ($discount_type === 'percentage')
        ? $discount_value . '% OFF'
        : '$' . number_format($discount_value, 0, ',', '.') . ' de descuento';

    // ── WP_Query con filtros de URL ───────────────────────────────────────────
    $paged       = max(1, intval(get_query_var('paged') ?: ($_GET['paged'] ?? 1)));
    $min_price   = isset($_GET['min_price']) ? floatval($_GET['min_price']) : null;
    $max_price   = isset($_GET['max_price']) ? floatval($_GET['max_price']) : null;
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
        $query_args['tax_query'] = array(array(
            'taxonomy' => 'product_cat',
            'field'    => 'term_id',
            'terms'    => array_map('absint', $applies_to_ids),
        ));
    } else {
        $query_args['meta_query'][] = array('key' => '_sale_price', 'value' => '', 'compare' => '!=');
    }

    if ($min_price !== null || $max_price !== null) {
        $price_meta = array('relation' => 'AND');
        if ($min_price !== null) $price_meta[] = array('key' => '_price', 'value' => $min_price, 'compare' => '>=', 'type' => 'NUMERIC');
        if ($max_price !== null) $price_meta[] = array('key' => '_price', 'value' => $max_price, 'compare' => '<=', 'type' => 'NUMERIC');
        if (!empty($query_args['meta_query'])) {
            $query_args['meta_query'] = array_merge(array('relation' => 'AND'), (array) $query_args['meta_query'], array($price_meta));
        } else {
            $query_args['meta_query'] = $price_meta;
        }
    }

    if (!empty($_GET['filter_cat'])) {
        $filter_cat_ids = array_map('absint', explode(',', sanitize_text_field($_GET['filter_cat'])));
        $extra_tax = array('taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $filter_cat_ids);
        if (!empty($query_args['tax_query'])) {
            $query_args['tax_query'] = array('relation' => 'AND', $query_args['tax_query'][0], $extra_tax);
        } else {
            $query_args['tax_query'] = array($extra_tax);
        }
    }

    $promo_loop = new WP_Query($query_args);

    // ── Categorías para el sidebar ────────────────────────────────────────────
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

    $active_min       = isset($_GET['min_price']) ? floatval($_GET['min_price']) : '';
    $active_max       = isset($_GET['max_price']) ? floatval($_GET['max_price']) : '';
    $has_price_filter = ($active_min !== '' || $active_max !== '');

    // Agregar clase woocommerce-page al body (permite que el tema procese la paginación)
    add_filter('body_class', function($classes) { $classes[] = 'woocommerce-page'; return $classes; });

    get_header();
    ?>

    <!-- ─── HERO ─────────────────────────────────────────────────────────── -->
    <div class="mks-promo-hero">
        <h1><?php echo esc_html($rule_title); ?></h1>
        <?php if ($discount_active_today && $discount_value > 0): ?>
            <div class="mks-promo-badge"><?php echo esc_html($badge_str); ?></div>
        <?php elseif (!$discount_active_today): ?>
            <div class="mks-promo-badge-upcoming">
                🕐 Próximo: <?php echo esc_html($next_discount_label ?: 'próximamente'); ?>
            </div>
        <?php endif; ?>
    </div>

    <!-- ─── Aviso próximo descuento ──────────────────────────────────────── -->
    <?php if (!$discount_active_today): ?>
    <div class="mks-promo-upcoming">
        <span class="mks-upcoming-icon">🗓️</span>
        <span>
            Hoy estos productos <strong>no tienen descuento activo</strong>.
            <?php if ($next_discount_label): ?>
                El <strong><?php echo esc_html($badge_str); ?></strong> aplica el
                <strong><?php echo esc_html($next_discount_label); ?></strong>
            <?php endif; ?>
        </span>
    </div>
    <?php endif; ?>

    <div class="mks-promo-wrap woocommerce">

        <!-- ─── SIDEBAR ──────────────────────────────────────────────────── -->
        <aside class="mks-promo-sidebar">

            <?php if ($has_price_filter): ?>
            <div class="mks-active-filters">
                <span class="mks-filter-chip">
                    $<?php echo number_format((float) $active_min, 0, ',', '.'); ?>
                    – $<?php echo number_format((float) $active_max, 0, ',', '.'); ?>
                    <a href="<?php echo esc_url(add_query_arg(array('min_price' => false, 'max_price' => false, 'paged' => false))); ?>">✕</a>
                </span>
            </div>
            <?php endif; ?>

            <!-- Filtro de precio -->
            <div class="mks-filter-widget">
                <p class="mks-filter-widget-title">💰 Filtrar por precio</p>
                <form method="get">
                    <?php foreach ($_GET as $k => $v):
                        if (in_array($k, array('min_price', 'max_price', 'paged'), true)) continue;
                        echo '<input type="hidden" name="' . esc_attr($k) . '" value="' . esc_attr($v) . '">';
                    endforeach; ?>
                    <div class="mks-price-inputs">
                        <span style="font-size:.8rem;color:#888">$</span>
                        <input class="mks-price-input" type="number" name="min_price"
                               value="<?php echo esc_attr($active_min); ?>" placeholder="Mín" min="0" step="500">
                        <span class="mks-price-sep">—</span>
                        <input class="mks-price-input" type="number" name="max_price"
                               value="<?php echo esc_attr($active_max); ?>" placeholder="Máx" min="0" step="500">
                    </div>
                    <button type="submit" class="mks-price-apply">Aplicar filtro</button>
                </form>
            </div>

            <!-- Categorías (si hay más de una) -->
            <?php if (count($promo_cats) > 1): ?>
            <div class="mks-filter-widget">
                <p class="mks-filter-widget-title">📂 Categorías</p>
                <ul class="mks-cat-list">
                    <?php foreach ($promo_cats as $cat_id => $cat): ?>
                    <li>
                        <a href="<?php echo esc_url(add_query_arg(array('filter_cat' => $cat_id, 'paged' => false))); ?>"
                           class="<?php echo (isset($_GET['filter_cat']) && (int) $_GET['filter_cat'] === $cat_id) ? 'active' : ''; ?>">
                            <?php echo esc_html($cat['name']); ?>
                            <span class="mks-cat-count"><?php echo esc_html($cat['count']); ?></span>
                        </a>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <?php endif; ?>

        </aside>

        <!-- ─── CONTENIDO PRINCIPAL ───────────────────────────────────────── -->
        <main class="mks-promo-main">

            <div class="mks-promo-toolbar">
                <span class="mks-result-count">
                    <?php
                    $total = $promo_loop->found_posts;
                    if ($total > 0) {
                        printf(
                            'Mostrando %d–%d de %d resultado%s',
                            ($paged - 1) * 12 + 1,
                            min($paged * 12, $total),
                            $total,
                            $total === 1 ? '' : 's'
                        );
                    }
                    ?>
                </span>
            </div>

            <?php if ($promo_loop->have_posts()): ?>
                <?php
                wc_setup_loop(array(
                    'total'        => $promo_loop->found_posts,
                    'total_pages'  => $promo_loop->max_num_pages,
                    'current_page' => $paged,
                    'columns'      => apply_filters('loop_shop_columns', 4),
                ));
                ?>
                <?php woocommerce_product_loop_start(); ?>
                    <?php while ($promo_loop->have_posts()): $promo_loop->the_post(); ?>
                        <?php wc_get_template_part('content', 'product'); ?>
                    <?php endwhile; ?>
                <?php woocommerce_product_loop_end(); ?>
                <?php wp_reset_postdata(); wc_reset_loop(); ?>

                <!-- Paginación: paginate_links + add_query_arg para URL custom.
                     woocommerce_pagination() no se usa porque get_pagenum_link() rompe el rewrite. -->
                <?php if ($promo_loop->max_num_pages > 1): ?>
                <nav class="woocommerce-pagination">
                    <?php echo paginate_links(array(
                        'base'      => add_query_arg('paged', '%#%'),
                        'format'    => '',
                        'current'   => $paged,
                        'total'     => $promo_loop->max_num_pages,
                        'prev_text' => '&larr;',
                        'next_text' => '&rarr;',
                        'type'      => 'list',
                        'end_size'  => 3,
                        'mid_size'  => 3,
                        'add_args'  => false,
                    )); ?>
                </nav>
                <?php endif; ?>

            <?php else: ?>
                <?php wp_reset_postdata(); ?>
                <p class="woocommerce-info">No hay productos disponibles para esta promoción en este momento.</p>
            <?php endif; ?>

        </main>

    </div><!-- .mks-promo-wrap -->

    <?php
    get_footer();
    exit;
});

// ─── Registrar rewrite rule si aún no está en las reglas activas ──────────────
// Evita el race condition de múltiples workers ejecutando flush al mismo tiempo.
add_action('wp_loaded', function() {
    $rules = get_option('rewrite_rules');
    if (empty($rules) || !array_key_exists('^promo/descuento/([0-9]+)/?$', $rules)) {
        flush_rewrite_rules(false);
    }
});
