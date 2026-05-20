<?php
if (!defined('ABSPATH')) exit;

class Merkahorro_Bridge_Banners {

    public static function init() {
        add_shortcode('merkahorro_slider', array(__CLASS__, 'slider_shortcode'));
        add_shortcode('merkahorro_tiles', array(__CLASS__, 'tiles_shortcode'));
        add_action('rest_api_init', array(__CLASS__, 'register_endpoints'));
    }

    public static function register_endpoints() {
        register_rest_route('merkahorro/v1', '/wp-banners', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'endpoint_wp_banners'),
            'permission_callback' => array('Merkahorro_Bridge_API', 'check_api_key')
        ));
    }

    public static function endpoint_wp_banners($request = null) {
        // Cache de la respuesta — esta consulta lee RevSlider + WooCommerce categories + media library.
        // Sin cache, cada llamada del Gestor escanea hasta 80 attachments + N categorías + todos los slides.
        $fresh = $request && ($request->get_param('fresh') === 'true' || $request->get_param('fresh') === true);
        $cache_key = 'merkahorro_wp_banners_inventory';

        if (!$fresh) {
            $cached = get_transient($cache_key);
            if ($cached !== false) {
                return new WP_REST_Response($cached, 200);
            }
        }

        global $wpdb;
        $results = array();

        // 1) Slider Revolution slides
        $sliders_table = $wpdb->prefix . 'revslider_sliders';
        $slides_table  = $wpdb->prefix . 'revslider_slides';
        $has_revslider = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $sliders_table));

        if ($has_revslider) {
            $sliders = $wpdb->get_results("SELECT id, title, alias FROM {$sliders_table}", ARRAY_A);
            foreach ($sliders as $slider) {
                $slides = $wpdb->get_results($wpdb->prepare("SELECT id, slide_order, params, layers FROM {$slides_table} WHERE slider_id = %d ORDER BY slide_order ASC", $slider['id']), ARRAY_A);
                foreach ($slides as $slide) {
                    $params = json_decode($slide['params'] ?? '{}', true);
                    $image_url = $params['bg']['image'] ?? $params['image'] ?? $params['bg']['imageUrl'] ?? '';
                    if (is_numeric($image_url)) $image_url = wp_get_attachment_url((int) $image_url) ?: '';
                    $link_url = $params['link']['url'] ?? $params['link_url'] ?? '';
                    $title = $params['title'] ?? $params['bg']['alt'] ?? ($slider['title'] . ' — Slide ' . ($slide['slide_order'] + 1));
                    if (!empty($image_url)) {
                        $results[] = array(
                            'source' => 'revslider', 'source_id' => 'revslider_' . $slider['id'] . '_' . $slide['id'],
                            'slider_name' => $slider['title'], 'slider_alias' => $slider['alias'],
                            'title' => $title, 'image_url' => $image_url, 'link_url' => $link_url,
                            'display_order' => (int) $slide['slide_order'], 'section' => 'home_slider',
                        );
                    }
                }
            }
        }

        // 2) WooCommerce product_cat thumbnails
        $terms = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => true, 'parent' => 0, 'number' => 30));
        if (!is_wp_error($terms)) {
            $order = 0;
            foreach ($terms as $term) {
                $thumb_id = get_term_meta($term->term_id, 'thumbnail_id', true);
                if ($thumb_id && $img_url = wp_get_attachment_url((int) $thumb_id)) {
                    $cat_link = get_term_link($term);
                    $results[] = array(
                        'source' => 'woo_category', 'source_id' => 'woocat_' . $term->term_id,
                        'slider_name' => 'Categorías WooCommerce', 'slider_alias' => 'woo-categories',
                        'title' => $term->name, 'image_url' => $img_url, 'link_url' => is_string($cat_link) ? $cat_link : '',
                        'display_order' => $order++, 'section' => 'home_tiles',
                    );
                }
            }
        }

        // 3) Media library
        $banner_attachments = get_posts(array('post_type' => 'attachment', 'post_mime_type' => 'image', 'posts_per_page' => 50, 'post_status' => 'inherit', 's' => 'banner promo slider promocion'));
        foreach ($banner_attachments as $att) {
            $img_url = wp_get_attachment_url($att->ID);
            if (!$img_url) continue;
            $already = false; foreach ($results as $r) { if ($r['image_url'] === $img_url) { $already = true; break; } }
            if ($already) continue;
            $results[] = array(
                'source' => 'media_library', 'source_id' => 'media_' . $att->ID,
                'slider_name' => 'Media Library', 'slider_alias' => 'media',
                'title' => $att->post_title ?: '(Imagen ' . $att->ID . ')',
                'image_url' => $img_url, 'link_url' => '',
                'display_order' => 0, 'section' => 'home_slider',
            );
        }

        $payload = array(
            'ok' => true,
            'data' => $results,
            'total' => count($results),
            'sources' => array(
                'revslider' => (bool)$has_revslider,
                'woo_categories' => !is_wp_error($terms),
                'media_library' => true,
            ),
        );
        // TTL 15 min — inventario de banners no cambia minuto a minuto.
        set_transient($cache_key, $payload, 15 * MINUTE_IN_SECONDS);
        return new WP_REST_Response($payload, 200);
    }

    public static function get_banners($section = 'home_slider', $sede = null) {
        $sede_key = $sede ? sanitize_key($sede) : 'all';
        $cache_key = 'merkahorro_banners_' . sanitize_key($section) . '_' . $sede_key;
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            return $cached;
        }

        $url = MERKAHORRO_API_URL . '/content/banners?section=' . urlencode($section);
        if ($sede) {
            $url .= '&sede=' . urlencode($sede);
        }
        
        // NO agregamos el timestamp en producción por defecto para permitir caché externa.
        // Solo en un modo "debug" explícito.

        $response = wp_remote_get($url, array(
            'timeout' => 10,
            'sslverify' => true // CAMBIO IMPORTANTE: sslverify en true
        ));

        if (is_wp_error($response)) {
            Merkahorro_Bridge_Logger::log('API error: ' . $response->get_error_message(), 'ERROR');
            return array();
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (!isset($body['ok']) || !$body['ok'] || empty($body['data'])) {
            return array();
        }

        // Solo activos
        $banners = array_filter($body['data'], function($b) {
            return !empty($b['active']);
        });

        // Ordenar
        usort($banners, function($a, $b) {
            return ($a['display_order'] ?? 0) - ($b['display_order'] ?? 0);
        });

        set_transient($cache_key, $banners, MERKAHORRO_CACHE_TTL);
        return $banners;
    }

    public static function slider_shortcode($atts) {
        $atts = shortcode_atts(array(
            'section' => 'home_slider',
            'autoplay' => '5000',
        ), $atts);

        $banners = self::get_banners($atts['section'], merkahorro_get_current_sede());

        if (empty($banners)) {
            return '<!-- Merkahorro: No hay banners activos para ' . esc_attr($atts['section']) . ' -->';
        }

        $slider_id = 'mks-' . wp_rand(1000, 9999);
        $autoplay = intval($atts['autoplay']);

        ob_start();
        ?>
        <?php /* Precargar SOLO la primera imagen */ ?>
        <?php if (isset($banners[0])): ?>
            <link rel="preload" as="image" href="<?php echo esc_url($banners[0]['image_url']); ?>" fetchpriority="high">
        <?php endif; ?>
        
        <style>
            .mks-slider { position: relative; width: 100%; overflow: hidden; border-radius: 12px; }
            .mks-slider .mks-slides-wrap { position: relative; width: 100%; }
            .mks-slider .mks-slide { position: absolute; top: 0; left: 0; width: 100%; opacity: 0; transition: opacity 0.6s ease; pointer-events: none; }
            .mks-slider .mks-slide:first-child { position: relative; }
            .mks-slider .mks-slide.active { opacity: 1; z-index: 2; pointer-events: auto; }
            .mks-slider .mks-slide img { width: 100%; height: auto; display: block; }
            .mks-slider .mks-slide a { display: block; width: 100%; }
            .mks-slider .mks-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; background: rgba(0,0,0,0.35); color: white; border: none; font-size: 1.5rem; padding: 12px 16px; cursor: pointer; border-radius: 4px; transition: background 0.2s; }
            .mks-slider .mks-nav:hover { background: rgba(0,0,0,0.7); }
            .mks-slider .mks-prev { left: 10px; }
            .mks-slider .mks-next { right: 10px; }
            .mks-dots { text-align: center; margin-top: 10px; }
            .mks-dots .mks-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #d1d5db; margin: 0 4px; cursor: pointer; transition: background 0.2s; border: none; }
            .mks-dots .mks-dot.active { background: #2563eb; }
            @media (max-width: 768px) {
                .mks-slider { border-radius: 8px; }
                .mks-slider .mks-nav { padding: 8px 10px; font-size: 1rem; }
            }
        </style>

        <div class="mks-slider" id="<?php echo $slider_id; ?>">
          <div class="mks-slides-wrap">
            <?php foreach ($banners as $i => $banner): ?>
                <div class="mks-slide <?php echo $i === 0 ? 'active' : ''; ?>">
                    <?php 
                    // Usar lazy load en las siguientes imágenes
                    $loading = $i === 0 ? 'eager' : 'lazy'; 
                    ?>
                    <?php if (!empty($banner['link_url'])): ?>
                        <a href="<?php echo esc_url($banner['link_url']); ?>">
                            <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="<?php echo $loading; ?>" decoding="async">
                        </a>
                    <?php else: ?>
                        <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="<?php echo $loading; ?>" decoding="async">
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
          </div>
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
                var current = 0, total = slides.length, autoplayMs = <?php echo $autoplay; ?>, timer;
                function goTo(idx) {
                    slides[current].classList.remove('active');
                    if (dotBtns[current]) dotBtns[current].classList.remove('active');
                    current = (idx + total) % total;
                    slides[current].classList.add('active');
                    if (dotBtns[current]) dotBtns[current].classList.add('active');
                }
                function startAutoplay() { if (autoplayMs > 0 && total > 1) timer = setInterval(function() { goTo(current + 1); }, autoplayMs); }
                function stopAutoplay() { clearInterval(timer); }
                var prevBtn = slider.querySelector('.mks-prev');
                var nextBtn = slider.querySelector('.mks-next');
                if (prevBtn) prevBtn.addEventListener('click', function() { stopAutoplay(); goTo(current - 1); startAutoplay(); });
                if (nextBtn) nextBtn.addEventListener('click', function() { stopAutoplay(); goTo(current + 1); startAutoplay(); });
                dotBtns.forEach(function(dot) { dot.addEventListener('click', function() { stopAutoplay(); goTo(parseInt(this.dataset.index)); startAutoplay(); }); });
                startAutoplay();
            })();
            </script>
        <?php endif; ?>
        <?php
        return ob_get_clean();
    }

    public static function tiles_shortcode($atts) {
        $atts = shortcode_atts(array(
            'section' => 'home_tiles',
        ), $atts);

        $banners = self::get_banners($atts['section'], merkahorro_get_current_sede());

        if (empty($banners)) {
            return '<!-- Merkahorro: No hay tiles activos para ' . esc_attr($atts['section']) . ' -->';
        }

        $tile_id = 'mkt-' . wp_rand(1000, 9999);
        $total = count($banners);

        ob_start();
        ?>
        <style>
            .mks-tiles-wrap { position: relative; margin: 16px 0 0; }
            .mks-tiles { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 4px 0 12px; }
            .mks-tiles::-webkit-scrollbar { display: none; }
            .mks-tile { flex: 0 0 calc(20% - 12px); scroll-snap-align: start; border-radius: 14px; overflow: hidden; transition: transform 0.25s ease, box-shadow 0.25s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
            .mks-tile:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
            .mks-tile img { width: 100%; height: auto; display: block; opacity: 0; transition: opacity 0.4s ease; }
            .mks-tile img.mks-loaded { opacity: 1; }
            .mks-tile a { display: block; }
            .mks-tiles-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; background: rgba(0,0,0,0.4); color: white; border: none; font-size: 1.3rem; padding: 10px 14px; cursor: pointer; border-radius: 6px; transition: background 0.2s; }
            .mks-tiles-nav:hover { background: rgba(0,0,0,0.7); }
            .mks-tiles-prev { left: -6px; }
            .mks-tiles-next { right: -6px; }
            @media (min-width: 1024px) { .mks-tiles-wrap.fits-all .mks-tiles-nav { display: none; } }
            @media (max-width: 1023px) { .mks-tile { flex: 0 0 calc(33.333% - 10px); } }
            @media (max-width: 600px) { .mks-tile { flex: 0 0 calc(50% - 8px); } .mks-tiles { gap: 10px; } .mks-tiles-nav { padding: 6px 10px; font-size: 1rem; } }
        </style>

        <div class="mks-tiles-wrap" id="<?php echo $tile_id; ?>">
            <div class="mks-tiles">
                <?php foreach ($banners as $banner): ?>
                    <div class="mks-tile">
                        <?php if (!empty($banner['link_url'])): ?>
                            <a href="<?php echo esc_url($banner['link_url']); ?>">
                                <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="lazy" decoding="async" onload="this.classList.add('mks-loaded')">
                            </a>
                        <?php else: ?>
                            <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="lazy" decoding="async" onload="this.classList.add('mks-loaded')">
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
            </div>
            <?php if ($total > 1): ?>
                <button class="mks-tiles-nav mks-tiles-prev" aria-label="Anterior">&#8249;</button>
                <button class="mks-tiles-nav mks-tiles-next" aria-label="Siguiente">&#8250;</button>
            <?php endif; ?>
        </div>
        <?php if ($total > 1): ?>
        <script>
        (function() {
            var wrap = document.getElementById('<?php echo $tile_id; ?>');
            if (!wrap) return;
            var track = wrap.querySelector('.mks-tiles');
            var prev = wrap.querySelector('.mks-tiles-prev');
            var next = wrap.querySelector('.mks-tiles-next');
            var tile = track.querySelector('.mks-tile');
            if (!tile) return;
            function getScrollAmount() { return tile.offsetWidth + 14; }
            function checkFits() { if (track.scrollWidth <= track.clientWidth + 2) wrap.classList.add('fits-all'); else wrap.classList.remove('fits-all'); }
            if (prev) prev.addEventListener('click', function() { track.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' }); });
            if (next) next.addEventListener('click', function() { track.scrollBy({ left: getScrollAmount(), behavior: 'smooth' }); });
            checkFits(); window.addEventListener('resize', checkFits);
        })();
        </script>
        <?php endif; ?>
        <?php
        return ob_get_clean();
    }
}
