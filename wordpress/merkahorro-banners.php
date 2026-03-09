<?php
/**
 * Plugin Name: Merkahorro Banners - EcomManager Integration
 * Description: Renderiza sliders y tiles promocionales desde el Gestor Ecommerce (Supabase API).
 * Version: 1.2
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
// MAPEO DE SUBDOMINIOS → CÓDIGO DE SEDE
// Cada subdominio es un WordPress independiente.
// La sede principal (Copacabana) usa el dominio raíz.
// ═══════════════════════════════════════════════
if (!defined('MERKAHORRO_SEDE_MAP')) {
    define('MERKAHORRO_SEDE_MAP', json_encode(array(
        'supermercadomerkahorro.com'              => 'PV001',  // Copacabana Plaza
        'girardota.supermercadomerkahorro.com'     => '00301',  // Girardota
        'barbosa.supermercadomerkahorro.com'       => '00701',  // Barbosa
        'villahermosa.supermercadomerkahorro.com'   => '00201',  // Villahermosa
    )));
}

// ═══════════════════════════════════════════════
// HELPER: Detectar la sede actual
// Prioridad: 1) query param  2) subdominio  3) cookie  4) WC session
// ═══════════════════════════════════════════════
function merkahorro_get_current_sede() {
    // 1. Query param (testing: ?sede=PV001)
    if (!empty($_GET['sede'])) {
        return sanitize_text_field($_GET['sede']);
    }
    // 2. Detectar por subdominio/dominio del WordPress actual
    $host = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '';
    // Quitar www. si existe
    $host = preg_replace('/^www\./', '', $host);
    $sede_map = json_decode(MERKAHORRO_SEDE_MAP, true);
    if ($sede_map && isset($sede_map[$host])) {
        return $sede_map[$host];
    }
    // 3. Cookie
    if (!empty($_COOKIE['sede_codigo'])) {
        return sanitize_text_field($_COOKIE['sede_codigo']);
    }
    if (!empty($_COOKIE['wc_sede'])) {
        return sanitize_text_field($_COOKIE['wc_sede']);
    }
    // 4. WooCommerce session
    if (function_exists('WC') && WC()->session) {
        $sede = WC()->session->get('sede_actual');
        if ($sede) return $sede;
    }
    return null;
}

// ═══════════════════════════════════════════════
// HELPERS DE AUTENTICACIÓN
// ═══════════════════════════════════════════════
function merkahorro_is_admin() {
    return is_user_logged_in() && current_user_can('manage_woocommerce');
}

function merkahorro_check_api_key($request) {
    // Chequear header X-API-Key, query param ?key=, o usuario admin logueado
    $key = $request->get_header('X-API-Key');
    if (!$key) $key = $request->get_param('key');
    return merkahorro_is_admin() || ($key && $key === MERKAHORRO_API_KEY);
}

// ═══════════════════════════════════════════════
// FUNCIÓN: Obtener banners de la API (con filtro por sede)
// ═══════════════════════════════════════════════
function merkahorro_get_banners($section = 'home_slider', $sede = null) {
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
        'autoplay' => '5000',
    ), $atts);

    $banners = merkahorro_get_banners($atts['section'], merkahorro_get_current_sede());

    if (empty($banners)) {
        return '<!-- Merkahorro: No hay banners activos para ' . esc_attr($atts['section']) . ' -->';
    }

    $slider_id = 'mks-' . wp_rand(1000, 9999);
    $autoplay = intval($atts['autoplay']);

    ob_start();
    ?>
    <style>
        .mks-slider { position: relative; width: 100%; overflow: hidden; border-radius: 12px; }
        .mks-slider .mks-slides-wrap { position: relative; width: 100%; }
        .mks-slider .mks-slide { display: none; width: 100%; }
        .mks-slider .mks-slide.active { display: block; }
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
                <?php if (!empty($banner['link_url'])): ?>
                    <a href="<?php echo esc_url($banner['link_url']); ?>">
                        <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="<?php echo $i === 0 ? 'eager' : 'lazy'; ?>">
                    </a>
                <?php else: ?>
                    <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="<?php echo $i === 0 ? 'eager' : 'lazy'; ?>">
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
      </div><!-- /.mks-slides-wrap -->

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
// Grid de tiles promocionales (portrait, estilo actual Merkahorro)
// ═══════════════════════════════════════════════
function merkahorro_tiles_shortcode($atts) {
    $atts = shortcode_atts(array(
        'section' => 'home_tiles',
    ), $atts);

    $banners = merkahorro_get_banners($atts['section'], merkahorro_get_current_sede());

    if (empty($banners)) {
        return '<!-- Merkahorro: No hay tiles activos para ' . esc_attr($atts['section']) . ' -->';
    }

    $tile_id = 'mkt-' . wp_rand(1000, 9999);
    $total = count($banners);

    ob_start();
    ?>
    <style>
        .mks-tiles-wrap { position: relative; margin: 16px 0 0; }
        .mks-tiles {
            display: flex;
            gap: 14px;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding: 4px 0 12px;
        }
        .mks-tiles::-webkit-scrollbar { display: none; }
        .mks-tile {
            flex: 0 0 calc(20% - 12px);
            scroll-snap-align: start;
            border-radius: 14px;
            overflow: hidden;
            transition: transform 0.25s ease, box-shadow 0.25s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .mks-tile:hover {
            transform: translateY(-4px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }
        .mks-tile img { width: 100%; height: auto; display: block; }
        .mks-tile a { display: block; }
        /* Navegación carrusel */
        .mks-tiles-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; background: rgba(0,0,0,0.4); color: white; border: none; font-size: 1.3rem; padding: 10px 14px; cursor: pointer; border-radius: 6px; transition: background 0.2s; }
        .mks-tiles-nav:hover { background: rgba(0,0,0,0.7); }
        .mks-tiles-prev { left: -6px; }
        .mks-tiles-next { right: -6px; }
        @media (min-width: 1024px) {
            /* Desktop: si caben todos, ocultar flechas */
            .mks-tiles-wrap.fits-all .mks-tiles-nav { display: none; }
        }
        @media (max-width: 1023px) {
            .mks-tile { flex: 0 0 calc(33.333% - 10px); }
        }
        @media (max-width: 600px) {
            .mks-tile { flex: 0 0 calc(50% - 8px); }
            .mks-tiles { gap: 10px; }
            .mks-tiles-nav { padding: 6px 10px; font-size: 1rem; }
        }
    </style>

    <div class="mks-tiles-wrap" id="<?php echo $tile_id; ?>">
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

        function getScrollAmount() {
            return tile.offsetWidth + 14;
        }

        function checkFits() {
            if (track.scrollWidth <= track.clientWidth + 2) {
                wrap.classList.add('fits-all');
            } else {
                wrap.classList.remove('fits-all');
            }
        }

        if (prev) prev.addEventListener('click', function() { track.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' }); });
        if (next) next.addEventListener('click', function() { track.scrollBy({ left: getScrollAmount(), behavior: 'smooth' }); });

        checkFits();
        window.addEventListener('resize', checkFits);
    })();
    </script>
    <?php endif; ?>

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
            global $wpdb;
            // Limpiar todos los transients de merkahorro (banners + descuentos)
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_merkahorro_%',
                    '_transient_timeout_merkahorro_%'
                )
            );
            return new WP_REST_Response(array('ok' => true, 'message' => 'Cache limpiado (todas las sedes)'), 200);
        },
        'permission_callback' => function($request) {
            return merkahorro_check_api_key($request);
        }
    ));

    // ═══════════════════════════════════════════════
    // GET /wp-json/merkahorro/v1/diagnostico
    // Verifica que la API funciona y muestra datos de cada sección
    // ═══════════════════════════════════════════════
    register_rest_route('merkahorro/v1', '/diagnostico', array(
        'methods' => 'GET',
        'callback' => function() {
            // Limpiar cache primero para datos frescos
            global $wpdb;
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_merkahorro_%',
                    '_transient_timeout_merkahorro_%'
                )
            );

            $current_sede = merkahorro_get_current_sede();
            $host = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '(desconocido)';
            $slider_banners = merkahorro_get_banners('home_slider', $current_sede);
            $tiles_banners  = merkahorro_get_banners('home_tiles', $current_sede);

            // Test directo a la API
            $api_test = wp_remote_get(MERKAHORRO_API_URL . '/content/banners?section=home_tiles', array(
                'timeout' => 10,
                'sslverify' => false
            ));
            $api_status = is_wp_error($api_test) ? $api_test->get_error_message() : wp_remote_retrieve_response_code($api_test);
            $api_body = is_wp_error($api_test) ? null : json_decode(wp_remote_retrieve_body($api_test), true);

            return new WP_REST_Response(array(
                'ok' => true,
                'version' => '1.2',
                'api_url' => MERKAHORRO_API_URL,
                'host' => $host,
                'sede_detectada' => $current_sede ?: 'ninguna (mostrando todas)',
                'sede_mapa' => json_decode(MERKAHORRO_SEDE_MAP, true),
                'api_tiles_status' => $api_status,
                'api_tiles_response' => $api_body,
                'slider' => array(
                    'total_banners' => count($slider_banners),
                    'banners' => array_map(function($b) {
                        return array('id' => $b['id'], 'title' => $b['title'], 'active' => $b['active']);
                    }, $slider_banners)
                ),
                'tiles' => array(
                    'total_tiles' => count($tiles_banners),
                    'tiles' => array_map(function($b) {
                        return array('id' => $b['id'], 'title' => $b['title'], 'active' => $b['active']);
                    }, $tiles_banners)
                ),
                'shortcodes_registrados' => array(
                    'merkahorro_slider' => shortcode_exists('merkahorro_slider'),
                    'merkahorro_tiles' => shortcode_exists('merkahorro_tiles'),
                ),
                'nota' => 'Si tiles total es 0, creen tiles en el Gestor Ecommerce -> Banners -> sección home_tiles'
            ), 200);
        },
        'permission_callback' => function($request) {
            return merkahorro_check_api_key($request);
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
        'permission_callback' => function($request) {
            return merkahorro_check_api_key($request);
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
        'permission_callback' => function($request) {
            return merkahorro_check_api_key($request);
        }
    ));
});

// ═══════════════════════════════════════════════
// SINCRONIZACIÓN DE DESCUENTOS CON FLYCART
// Escribe/actualiza reglas directamente en wp_wdr_rules
// para que el plugin "Discount Rules for WooCommerce"
// las procese con todo su frontend (badges, tachados, etc.)
// ═══════════════════════════════════════════════

add_action('rest_api_init', function() {
    // POST /wp-json/merkahorro/v1/sync-discount-rules
    // Recibe un array de reglas desde el Gestor y las escribe en wp_wdr_rules
    register_rest_route('merkahorro/v1', '/sync-discount-rules', array(
        'methods' => 'POST',
        'callback' => function($request) {
            global $wpdb;
            $table = $wpdb->prefix . 'wdr_rules';
            $prefix = '[MK-Gestor] ';

            // Verificar tabla
            $table_exists = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table));
            if (!$table_exists) {
                return new WP_REST_Response(array(
                    'ok' => false,
                    'message' => 'Tabla wdr_rules no encontrada. Instalar plugin "Discount Rules for WooCommerce".'
                ), 200);
            }

            $rules = $request->get_json_params();
            if (empty($rules) || !is_array($rules)) {
                return new WP_REST_Response(array('ok' => false, 'message' => 'No se recibieron reglas'), 200);
            }

            // PASO 1: Eliminar TODAS las reglas previas del Gestor (prefijo [MK-Gestor])
            // Esto garantiza que reglas eliminadas/desactivadas no queden huérfanas
            $wpdb->query($wpdb->prepare(
                "DELETE FROM {$table} WHERE title LIKE %s",
                $prefix . '%'
            ));

            // PASO 2: Insertar todas las reglas activas con el prefijo
            $synced = 0;
            $errors = array();

            foreach ($rules as $rule) {
                // Agregar prefijo al título para identificar reglas del Gestor
                $rule['title'] = $prefix . ($rule['title'] ?? 'Descuento');

                $wdr_data = merkahorro_build_wdr_rule($rule);
                if (!$wdr_data) {
                    $errors[] = 'Error construyendo regla: ' . ($rule['title'] ?? '?');
                    continue;
                }

                $wpdb->insert($table, $wdr_data);
                $synced++;
            }

            // PASO 3: Limpiar caché del plugin FlyCart
            delete_option('wdr_transient_version');
            // Limpiar transients de FlyCart
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_wdr_%',
                    '_transient_timeout_wdr_%'
                )
            );
            if (function_exists('wp_cache_flush')) wp_cache_flush();

            return new WP_REST_Response(array(
                'ok' => true,
                'synced' => $synced,
                'deleted_old' => true,
                'errors' => $errors,
                'message' => "Se sincronizaron {$synced} reglas. Las reglas anteriores del Gestor fueron reemplazadas."
            ), 200);
        },
        'permission_callback' => function($request) {
            return merkahorro_check_api_key($request);
        }
    ));

    // DELETE /wp-json/merkahorro/v1/sync-discount-rules
    // Elimina reglas del Gestor de wp_wdr_rules (por título o todas las del Gestor)
    register_rest_route('merkahorro/v1', '/sync-discount-rules', array(
        'methods' => 'DELETE',
        'callback' => function($request) {
            global $wpdb;
            $table = $wpdb->prefix . 'wdr_rules';
            $prefix = '[MK-Gestor] ';
            $title = $request->get_param('title');

            if (empty($title)) {
                // Sin título = eliminar TODAS las reglas del Gestor
                $deleted = $wpdb->query($wpdb->prepare(
                    "DELETE FROM {$table} WHERE title LIKE %s",
                    $prefix . '%'
                ));
            } else {
                // Con título = eliminar esa regla específica
                $deleted = $wpdb->delete($table, array('title' => $prefix . $title));
            }

            delete_option('wdr_transient_version');
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_wdr_%',
                    '_transient_timeout_wdr_%'
                )
            );

            return new WP_REST_Response(array(
                'ok' => true,
                'deleted' => $deleted !== false,
                'message' => $deleted ? 'Regla eliminada' : 'No se encontró la regla'
            ), 200);
        },
        'permission_callback' => function($request) {
            return merkahorro_check_api_key($request);
        }
    ));
});

/**
 * Construir un registro compatible con wp_wdr_rules del plugin FlyCart
 * a partir de una regla de nuestro Gestor
 */
function merkahorro_build_wdr_rule($rule) {
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
    $priority = intval($rule['display_order'] ?? 0);

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

    // --- Conditions: cuándo aplica ---
    $conditions = array();
    if ($schedule_type === 'days' && !empty($schedule_days)) {
        $conditions[] = array(
            array(
                'type' => 'cart_item_product_combination_days',
                'operator' => 'in_list',
                'value' => array_map('strval', $schedule_days),
            )
        );
    } elseif ($schedule_type === 'date_range' && $date_start && $date_end) {
        $conditions[] = array(
            array(
                'type' => 'order_date_and_time',
                'operator' => 'custom_date_range',
                'from' => $date_start,
                'to' => $date_end,
            )
        );
    }

    // --- Product adjustments: el descuento ---
    $wdr_discount_type = ($discount_type === 'percentage') ? 'percentage' : 'flat';
    $product_adjustments = array(
        'type' => $wdr_discount_type,
        'value' => strval($discount_value),
        'apply_as' => 'first_matched_rule',
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
        'exclusive'            => '0',
        'priority'             => $priority,
        'apply_to'             => $wdr_apply_to,
        'filters'              => wp_json_encode($filters ?: new stdClass()),
        'conditions'           => wp_json_encode($conditions ?: array()),
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
            'display' => '0',
        )),
        'discount_type'        => 'wdr_simple_discount',
        'used_coupons'         => '',
        'created_by'           => get_current_user_id() ?: 0,
        'created_on'           => $now,
        'modified_by'          => get_current_user_id() ?: 0,
        'modified_on'          => $now,
    );
}
