<?php
/**
 * Merkahorro EcomManager — Shortcode Separatas y exclusiones /ofertas/
 *
 * Registra:
 *   [merkahorro_separatas]  — productos de separata + carousel de flyers
 *
 * También excluye productos de separata de la página /ofertas/ (sniper Villahermosa).
 * El CSS se carga globalmente desde assets/merkahorro.css.
 */

if (!defined('ABSPATH')) exit;

// ─────────────────────────────────────────────────────────────────────────────
// [merkahorro_separatas]
// Atributo opcional: cols (default: 3) — columnas del carousel de flyers
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_separatas_shortcode($atts) {
    $atts    = shortcode_atts(array('section' => 'promo_separatas', 'cols' => '3'), $atts);
    $banners = merkahorro_get_banners($atts['section'], merkahorro_get_current_sede());
    $cols    = max(1, min(6, intval($atts['cols'])));

    // ID único por instancia (necesario para JS — lightbox, carousel)
    $grid_id = 'mks-sep-' . wp_rand(1000, 9999);

    // ── Productos de reglas separata con paginación ───────────────────────────
    $sep_products  = array();
    $sep_total     = 0;
    $sep_max_pages = 1;
    $sep_paged     = max(1, intval($_GET['sep_page'] ?? 1));
    $per_page_sep  = 12;

    if (merkahorro_is_dev_sede()) {
        $sep_ids_data = merkahorro_get_separata_rule_ids();
        $sep_post_ids = $sep_ids_data['post_ids'];
        $sep_cat_ids  = $sep_ids_data['cat_ids'];

        if (!empty($sep_post_ids) || !empty($sep_cat_ids)) {
            $sep_args = array(
                'post_type'      => 'product',
                'post_status'    => 'publish',
                'posts_per_page' => $per_page_sep,
                'paged'          => $sep_paged,
                'orderby'        => 'menu_order title',
                'order'          => 'ASC',
            );
            if (!empty($sep_post_ids)) {
                $sep_args['post__in'] = $sep_post_ids;
            } elseif (!empty($sep_cat_ids)) {
                $sep_args['tax_query'] = array(array(
                    'taxonomy' => 'product_cat',
                    'field'    => 'term_id',
                    'terms'    => $sep_cat_ids,
                ));
            }
            $sep_query     = new WP_Query($sep_args);
            $sep_total     = $sep_query->found_posts;
            $sep_max_pages = $sep_query->max_num_pages;
            while ($sep_query->have_posts()) {
                $sep_query->the_post();
                $sep_products[] = wc_get_product(get_the_ID());
            }
            wp_reset_postdata();
        }
    }

    ob_start();
    ?>

    <!-- ─── Lightbox overlay ─── -->
    <div class="mks-sep-modal-overlay" id="mks-sep-modal-<?php echo esc_attr($grid_id); ?>">
        <div class="mks-sep-modal-inner">
            <button class="mks-sep-modal-close" aria-label="Cerrar">✕</button>
            <img src="" alt="Separata" id="mks-sep-modal-img-<?php echo esc_attr($grid_id); ?>">
        </div>
    </div>
    <script>
    (function(){
        var overlay = document.getElementById('mks-sep-modal-<?php echo esc_js($grid_id); ?>');
        if (!overlay) return;
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.classList.contains('mks-sep-modal-close')) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    })();
    </script>

    <!-- ─── HERO ─── -->
    <div class="mks-sep-hero">
        <h2>OFERTAS ESPECIALES</h2>
        <p>Separatas y promociones exclusivas de nuestra tienda</p>
    </div>

    <?php if (!empty($sep_products)): ?>
    <!-- ─── PRODUCTOS DE SEPARATA ─── -->
    <span id="ofertas-especiales-productos"></span>
    <p class="mks-sep-section-label">🛒 Productos en oferta especial</p>
    <div class="woocommerce mks-sep-prod-grid">
        <?php
        wc_setup_loop(array(
            'columns'      => apply_filters('loop_shop_columns', 4),
            'total'        => $sep_total,
            'total_pages'  => $sep_max_pages,
            'current_page' => $sep_paged,
        ));
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
        ?>
    </div>

    <?php if ($sep_max_pages > 1): ?>
    <div class="woocommerce">
        <nav class="woocommerce-pagination">
            <?php echo paginate_links(array(
                'base'      => add_query_arg('sep_page', '%#%'),
                'format'    => '',
                'current'   => $sep_paged,
                'total'     => $sep_max_pages,
                'prev_text' => '&larr;',
                'next_text' => '&rarr;',
                'type'      => 'list',
                'end_size'  => 3,
                'mid_size'  => 3,
                'add_args'  => false,
            )); ?>
        </nav>
    </div>
    <?php endif; ?>
    <?php endif; ?>

    <?php if (!empty($banners)): ?>
    <!-- ─── FLYERS / SEPARATAS: Carousel ─── -->
    <p class="mks-sep-section-label" style="margin-top:36px;">🗞️ Separatas de la semana</p>
    <div class="mks-sep-carousel-wrap">
        <button class="mks-sep-nav-btn mks-sep-nav-prev"
                id="mks-prev-<?php echo esc_attr($grid_id); ?>"
                aria-label="Anterior">&#8249;</button>

        <div id="<?php echo esc_attr($grid_id); ?>" class="mks-sep-carousel">
            <?php foreach ($banners as $sep): ?>
                <div class="mks-sep-card" role="button" tabindex="0"
                     data-img="<?php echo esc_url($sep['image_url']); ?>"
                     data-alt="<?php echo esc_attr($sep['title'] ?? ''); ?>"
                     style="cursor:zoom-in;">
                    <img src="<?php echo esc_url($sep['image_url']); ?>"
                         alt="<?php echo esc_attr($sep['title'] ?? ''); ?>"
                         loading="lazy" decoding="async">
                </div>
            <?php endforeach; ?>
        </div>

        <button class="mks-sep-nav-btn mks-sep-nav-next"
                id="mks-next-<?php echo esc_attr($grid_id); ?>"
                aria-label="Siguiente">&#8250;</button>
    </div>

    <script>
    (function(){
        var carousel = document.getElementById('<?php echo esc_js($grid_id); ?>');
        var btnPrev  = document.getElementById('mks-prev-<?php echo esc_js($grid_id); ?>');
        var btnNext  = document.getElementById('mks-next-<?php echo esc_js($grid_id); ?>');
        var overlay  = document.getElementById('mks-sep-modal-<?php echo esc_js($grid_id); ?>');
        var modalImg = document.getElementById('mks-sep-modal-img-<?php echo esc_js($grid_id); ?>');
        if (!carousel) return;

        // Navegación carousel
        if (btnPrev && btnNext) {
            var cards = carousel.querySelectorAll('.mks-sep-card');
            if (cards.length > 3) {
                btnPrev.style.display = 'block';
                btnNext.style.display = 'block';
            }
            function cardW() { return cards.length ? cards[0].offsetWidth + 18 : 300; }
            btnPrev.addEventListener('click', function() { carousel.scrollBy({ left: -cardW(), behavior: 'smooth' }); });
            btnNext.addEventListener('click', function() { carousel.scrollBy({ left:  cardW(), behavior: 'smooth' }); });
        }

        // Lightbox: clic en cualquier card
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
            // Accesibilidad: Enter abre el modal
            carousel.addEventListener('keydown', function(e) {
                if (e.key !== 'Enter') return;
                var card = e.target.closest('.mks-sep-card');
                if (!card) return;
                modalImg.src = card.dataset.img || '';
                modalImg.alt = card.dataset.alt || '';
                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        }
    })();
    </script>
    <?php endif; ?>

    <?php if (empty($banners) && empty($sep_products)): ?>
        <p style="text-align:center;padding:40px;color:#999;">
            No hay ofertas especiales disponibles en este momento.
        </p>
    <?php endif;

    return ob_get_clean();
}
add_shortcode('merkahorro_separatas', 'merkahorro_separatas_shortcode');


// ─────────────────────────────────────────────────────────────────────────────
// Helper: productos de reglas separata activas HOY (caché 5 min).
// Consulta wp_wdr_rules con filtros de fecha UTC.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_get_separata_rule_ids() {
    static $cache = null;
    if ($cache !== null) return $cache;

    $transient_key = 'mks_separata_ids_v1';
    $cached = get_transient($transient_key);
    if ($cached !== false) { $cache = $cached; return $cache; }

    global $wpdb;
    $table  = $wpdb->prefix . 'wdr_rules';
    $prefix = '[MK-Gestor] ';
    $now_ts = time(); // UTC — consistente con los timestamps guardados en date_from/date_to

    $rules = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT title, filters FROM {$table}
              WHERE title LIKE %s
                AND enabled = '1'
                AND CAST(priority AS UNSIGNED) <= 5
                AND (date_from IS NULL OR date_from = 0 OR date_from <= %d)
                AND (date_to   IS NULL OR date_to   = 0 OR date_to   >= %d)
              ORDER BY CAST(priority AS UNSIGNED) ASC",
            $wpdb->esc_like($prefix) . '%',
            $now_ts,
            $now_ts
        ),
        ARRAY_A
    );

    $post_ids   = array();
    $cat_ids    = array();
    $rule_names = array();

    foreach ($rules as $rule) {
        $label   = str_replace($prefix, '', $rule['title']);
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


// ─────────────────────────────────────────────────────────────────────────────
// HOOK: Excluir productos separata de /ofertas/
// En /ofertas/ solo aparecen reglas semanales (priority > 5).
// Sniper: activo solo en Villahermosa hasta validar diseño en todas las sedes.
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_get_separata_ids_to_exclude() {
    static $ids = null;
    if ($ids !== null) return $ids;
    $sep_data = merkahorro_get_separata_rule_ids();
    $ids      = $sep_data['post_ids'];
    return $ids;
}

// Caso A: /ofertas/ usa la query principal de WordPress
add_action('pre_get_posts', function($query) {
    if (!merkahorro_is_dev_sede()) return;
    if (!$query->is_main_query() || is_admin()) return;
    if (!$query->is_page('ofertas')) return;

    $exclude = merkahorro_get_separata_ids_to_exclude();
    if (!empty($exclude)) {
        $current = (array) $query->get('post__not_in');
        $query->set('post__not_in', array_unique(array_merge($current, $exclude)));
    }
});

// Caso B: /ofertas/ usa un shortcode de WooCommerce ([sale_products], etc.)
add_filter('woocommerce_shortcode_products_query', function($query_args, $atts, $type) {
    if (!merkahorro_is_dev_sede()) return $query_args;
    global $post;
    if (!$post || $post->post_name !== 'ofertas') return $query_args;

    $exclude = merkahorro_get_separata_ids_to_exclude();
    if (!empty($exclude)) {
        $current = (array) ($query_args['post__not_in'] ?? array());
        $query_args['post__not_in'] = array_unique(array_merge($current, $exclude));
    }
    return $query_args;
}, 10, 3);
