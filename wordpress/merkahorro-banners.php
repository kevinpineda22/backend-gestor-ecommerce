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
if (!defined('MERKAHORRO_API_URL')) {
    define('MERKAHORRO_API_URL', 'https://backend-gestor-ecommerce.vercel.app/api');
}

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
// Prioridad: 1) query param  2) subdominio  3) cookie
// NOTA: WC()->session se omite intencionalmente — inicializarlo en cada
// visita anónima fuerza la creación de sesiones en BD, saturando consultas.
// La detección por subdominio cubre el 100% de los casos en producción.
// ═══════════════════════════════════════════════
function merkahorro_get_current_sede() {
    // Caché estático: calcular una sola vez por request (evita json_decode repetidos)
    static $sede_cache = null;
    static $sede_map_cache = null;

    if ($sede_cache !== null) {
        return $sede_cache === '' ? null : $sede_cache;
    }

    // 1. Query param (testing: ?sede=PV001)
    if (!empty($_GET['sede'])) {
        $sede_cache = sanitize_text_field($_GET['sede']);
        return $sede_cache;
    }

    // 2. Detectar por subdominio — cubre el 100% de los casos en producción
    if ($sede_map_cache === null) {
        $sede_map_cache = json_decode(MERKAHORRO_SEDE_MAP, true) ?: array();
    }
    $host = isset($_SERVER['HTTP_HOST']) ? strtolower(sanitize_text_field($_SERVER['HTTP_HOST'])) : '';
    $host = preg_replace('/^www\./', '', $host);
    if (isset($sede_map_cache[$host])) {
        $sede_cache = $sede_map_cache[$host];
        return $sede_cache;
    }

    // 3. Cookie (fallback ligero — no requiere inicializar WC)
    if (!empty($_COOKIE['sede_codigo'])) {
        $sede_cache = sanitize_text_field($_COOKIE['sede_codigo']);
        return $sede_cache;
    }
    if (!empty($_COOKIE['wc_sede'])) {
        $sede_cache = sanitize_text_field($_COOKIE['wc_sede']);
        return $sede_cache;
    }

    // Sin sede detectada
    $sede_cache = '';
    return null;
}

// ═══════════════════════════════════════════════
// HELPERS DE AUTENTICACIÓN
// ═══════════════════════════════════════════════
function merkahorro_is_admin() {
    return is_user_logged_in() && current_user_can('manage_woocommerce');
}

// ─── Sniper de desarrollo por sede ───────────────────────────────────────────
// Devuelve true solo en Villahermosa.
// Úsalo para envolver features nuevas antes de desplegarlas a todas las sedes.
// Una vez validado en Villahermosa, quita la condición (o pon return true).
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_is_dev_sede() {
    static $cache = null;
    if ($cache !== null) return $cache;
    $host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : '';
    $cache = (strpos($host, 'villahermosa') !== false);
    return $cache;
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
    <?php /* Precargar TODAS las imágenes del slider para evitar parpadeo */ ?>
    <?php foreach ($banners as $pi => $pb): ?>
        <link rel="preload" as="image" href="<?php echo esc_url($pb['image_url']); ?>"<?php echo $pi === 0 ? ' fetchpriority="high"' : ''; ?>>
    <?php endforeach; ?>
    <style>
        .mks-slider { position: relative; width: 100%; overflow: hidden; border-radius: 12px; }
        .mks-slider .mks-slides-wrap { position: relative; width: 100%; }
        /* Primer slide establece el flujo, los demás se apilan encima */
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
                <?php if (!empty($banner['link_url'])): ?>
                    <a href="<?php echo esc_url($banner['link_url']); ?>">
                        <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="eager" decoding="async">
                    </a>
                <?php else: ?>
                    <img src="<?php echo esc_url($banner['image_url']); ?>" alt="<?php echo esc_attr($banner['title'] ?? ''); ?>" loading="eager" decoding="async">
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
        .mks-tile img { width: 100%; height: auto; display: block; opacity: 0; transition: opacity 0.4s ease; }
        .mks-tile img.mks-loaded { opacity: 1; }
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
                $adv_message = json_decode($rule['advanced_discount_message'] ?? '{}', true);

                // Extraer tipo y valor del descuento
                $discount_type = 'percentage';
                $discount_value = 0;
                if (!empty($discounts['type'])) {
                    $discount_type = ($discounts['type'] === 'percentage') ? 'percentage' : 'fixed';
                }
                if (!empty($discounts['value'])) {
                    $discount_value = floatval($discounts['value']);
                }

                // Extraer categorías Y productos individuales de los filtros
                $category_ids = array();
                $category_names = array();
                $product_ids = array();
                $product_names = array();
                if (!empty($filters)) {
                    foreach ($filters as $filter) {
                        if (!isset($filter['type'])) continue;
                        if ($filter['type'] === 'product_category') {
                            $cat_values = $filter['value'] ?? array();
                            foreach ($cat_values as $cat_id) {
                                $term = get_term((int) $cat_id, 'product_cat');
                                if ($term && !is_wp_error($term)) {
                                    $category_ids[] = (int) $cat_id;
                                    $category_names[] = $term->name;
                                }
                            }
                        } elseif ($filter['type'] === 'products') {
                            $prod_values = $filter['value'] ?? array();
                            foreach ($prod_values as $prod_id) {
                                $pid = (int) $prod_id;
                                if ($pid > 0) {
                                    $product_ids[] = $pid;
                                    $prod_post = get_post($pid);
                                    $product_names[] = $prod_post ? $prod_post->post_title : 'Producto #' . $pid;
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
                $cart_condition_type = null;
                $cart_condition_value = 0;

                if (!empty($conditions)) {
                    // Mapa inverso: nombre de día FlyCart → número JS (0=Dom..6=Sáb)
                    $day_reverse_map = array(
                        'sunday' => 0, 'monday' => 1, 'tuesday' => 2,
                        'wednesday' => 3, 'thursday' => 4, 'friday' => 5,
                        'saturday' => 6,
                    );

                    // Normalizar condiciones: FlyCart usa objeto {"2": {type, options}}
                    // Formato anterior usaba array anidado [[{type, ...}]]
                    $flat_conds = array();
                    foreach ($conditions as $item) {
                        if (is_array($item) && isset($item['type'])) {
                            $flat_conds[] = $item;
                        } elseif (is_array($item)) {
                            foreach ($item as $sub) {
                                if (is_array($sub) && isset($sub['type'])) {
                                    $flat_conds[] = $sub;
                                }
                            }
                        }
                    }

                    foreach ($flat_conds as $cond) {
                        $cond_type = $cond['type'] ?? '';
                        $cond_options = $cond['options'] ?? array();

                        if ($cond_type === 'order_days') {
                            $schedule_type = 'days';
                            $day_names = $cond_options['value'] ?? array();
                            foreach ($day_names as $name) {
                                $lower = strtolower($name);
                                if (isset($day_reverse_map[$lower])) {
                                    $schedule_days[] = $day_reverse_map[$lower];
                                }
                            }
                        }
                        if ($cond_type === 'order_date' || $cond_type === 'order_date_and_time') {
                            $schedule_type = 'date_range';
                            $date_start = $cond['from'] ?? ($cond_options['from'] ?? null);
                            $date_end = $cond['to'] ?? ($cond_options['to'] ?? null);
                        }
                        // Condición de subtotal del carrito (autoliquidables)
                        if ($cond_type === 'subtotal') {
                            $schedule_type = 'cart_condition';
                            $cart_condition_type = 'subtotal';
                            $operator = $cond_options['operator'] ?? ($cond['operator'] ?? '>=')
;
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

            // PASO 1: Obtener reglas existentes del Gestor indexadas por título
            // Esto permite ACTUALIZAR en vez de borrar+crear, preservando el ID y config de badge
            $existing = $wpdb->get_results(
                $wpdb->prepare("SELECT id, title FROM {$table} WHERE title LIKE %s", $prefix . '%'),
                ARRAY_A
            );
            $existing_map = array();
            foreach ($existing as $row) {
                $existing_map[$row['title']] = (int) $row['id'];
            }

            // PASO 1b: Pre-calcular IDs de productos de reglas separata (priority ≤ 5)
            // para pasárselos a las reglas semanales y que las excluyan.
            // Esto elimina la necesidad de exclusive=1: cada producto queda cubierto
            // por UNA sola regla → sin stacking, sin bloqueo entre reglas.
            $separata_product_ids = array();
            foreach ($rules as $_r) {
                $prio = intval($_r['priority'] ?? $_r['display_order'] ?? 50);
                if ($prio <= 5 && !empty($_r['applies_to_ids'])) {
                    foreach ((array)$_r['applies_to_ids'] as $_id) {
                        $separata_product_ids[] = strval($_id);
                    }
                }
            }
            $separata_product_ids = array_values(array_unique($separata_product_ids));

            // PASO 2: Upsert — actualizar si existe, insertar si no
            $synced = 0;
            $updated = 0;
            $created = 0;
            $errors = array();
            $processed_titles = array();

            foreach ($rules as $rule) {
                // Agregar prefijo al título para identificar reglas del Gestor
                $rule['title'] = $prefix . ($rule['title'] ?? 'Descuento');

                $wdr_data = merkahorro_build_wdr_rule($rule, $separata_product_ids);
                if (!$wdr_data) {
                    $errors[] = 'Error construyendo regla: ' . ($rule['title'] ?? '?');
                    continue;
                }

                $processed_titles[] = $rule['title'];

                if (isset($existing_map[$rule['title']])) {
                    // ACTUALIZAR — preservar campos que se gestionan desde FlyCart/WooCommerce
                    // NO sobreescribir: created_on, created_by, advanced_discount_message (barra de descuento)
                    $rule_id = $existing_map[$rule['title']];
                    unset($wdr_data['created_on']);
                    unset($wdr_data['created_by']);
                    unset($wdr_data['advanced_discount_message']); // la barra de descuento se gestiona en WooCommerce
                    $wpdb->update($table, $wdr_data, array('id' => $rule_id));
                    $updated++;
                } else {
                    // INSERTAR — regla nueva
                    $wpdb->insert($table, $wdr_data);
                    $created++;
                }
                $synced++;
            }

            // PASO 3: Eliminar reglas del Gestor que ya no existen en el listado
            foreach ($existing_map as $title => $id) {
                if (!in_array($title, $processed_titles)) {
                    $wpdb->delete($table, array('id' => $id));
                }
            }

            // PASO 4: Limpiar caché del plugin FlyCart
            delete_option('wdr_transient_version');
            // Limpiar transients de FlyCart
            $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                    '_transient_wdr_%',
                    '_transient_timeout_wdr_%'
                )
            );

            // PASO 5: Limpiar caché de precios de WooCommerce para productos variables.
            // Con apply_as='sale_price', Flycart hookea los filtros de precio dinámicamente.
            // WooCommerce cachea los rangos de precio de variaciones en transients wc_var_prices_*.
            // Si ese caché queda viejo, el descuento de Flycart no se ve en el listado aunque
            // la regla esté bien configurada. Forzar recálculo limpiando todos esos transients.
            $wpdb->query(
                "DELETE FROM {$wpdb->options}
                 WHERE option_name LIKE '\_transient\_wc\_var\_prices\_%'
                    OR option_name LIKE '\_transient\_timeout\_wc\_var\_prices\_%'"
            );
            // Limpiar también la versión de caché de variaciones de WooCommerce
            delete_transient('wc_products_onsale');
            delete_option('woocommerce_cache_excluded_uris');
            if (function_exists('wc_delete_product_transients')) {
                // Invalidar transients de productos afectados por las reglas
                foreach ($processed_titles as $ptitle) {
                    // No necesitamos id de producto — solo forzar recálculo global con cache_version
                }
            }
            // Incrementar versión de caché de variaciones para forzar recálculo
            $current_version = (int) get_option('wc_var_prices_version', 0);
            update_option('wc_var_prices_version', $current_version + 1);

            if (function_exists('wp_cache_flush')) wp_cache_flush();

            return new WP_REST_Response(array(
                'ok' => true,
                'synced' => $synced,
                'updated' => $updated,
                'created' => $created,
                'errors' => $errors,
                'message' => "Se sincronizaron {$synced} reglas ({$updated} actualizadas, {$created} nuevas)."
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
function merkahorro_build_wdr_rule($rule, $separata_exclude_ids = array()) {
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
    // Usar el campo 'priority' real (menor número = mayor prioridad en FlyCart).
    // Fallback a display_order si priority no existe.
    $priority = intval($rule['priority'] ?? $rule['display_order'] ?? 50);

    // --- Badge / Barra de descuento ---
    $badge_enabled = isset($rule['badge_enabled']) ? ($rule['badge_enabled'] ? '1' : '0') : '0';
    $badge_text = $rule['badge_text'] ?? '';
    $badge_bg_color = $rule['badge_bg_color'] ?? '#160857';
    $badge_text_color = $rule['badge_text_color'] ?? '#88dc00';

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

    // Para reglas semanales (priority > 5) que aplican a TODOS los productos:
    // excluir los productos ya cubiertos por reglas separata.
    // Así cada producto solo coincide con UNA regla → sin stacking, sin necesidad de exclusive.
    if ($priority > 5 && $wdr_apply_to === 'all_products' && !empty($separata_exclude_ids)) {
        $filters[] = array(
            'type'     => 'products',
            'method'   => 'not_in_list',   // Flycart: 'not_in_list', NO 'nin_list'
            'value'    => $separata_exclude_ids,
            'cartQty'  => 'product',
        );
        $wdr_apply_to = 'specific_products';
    }

    // --- Conditions: cuándo aplica ---
    // Formato nativo de FlyCart: objeto con claves numéricas a partir de 2
    $conditions = array();

    // Mapa de número de día (JS getDay: 0=Dom..6=Sáb) a nombre FlyCart
    $day_name_map = array(
        0 => 'sunday', 1 => 'monday', 2 => 'tuesday',
        3 => 'wednesday', 4 => 'thursday', 5 => 'friday',
        6 => 'saturday',
    );

    if ($schedule_type === 'days' && !empty($schedule_days)) {
        $day_names = array();
        foreach ($schedule_days as $d) {
            if (isset($day_name_map[(int)$d])) {
                $day_names[] = $day_name_map[(int)$d];
            }
        }
        // FlyCart usa type "order_days" con objeto {2: {type, options}}
        $conditions = array(
            2 => array(
                'type' => 'order_days',
                'options' => array(
                    'operator' => 'in_list',
                    'value' => $day_names,
                ),
            ),
        );
    } elseif ($schedule_type === 'date_range' && $date_start && $date_end) {
        $conditions = array(
            2 => array(
                'type' => 'order_date_and_time',
                'options' => array(
                    'operator' => 'custom_date_range',
                    'from' => $date_start,
                    'to' => $date_end,
                ),
            ),
        );
    } elseif ($schedule_type === 'cart_condition') {
        $cart_cond_type  = $rule['cart_condition_type'] ?? 'subtotal';
        $cart_cond_value = floatval($rule['cart_condition_value'] ?? 0);
        if ($cart_cond_type === 'subtotal' && $cart_cond_value > 0) {
            // FlyCart condition type "subtotal" con operator "greater_than_or_equal"
            $conditions = array(
                2 => array(
                    'type' => 'subtotal',
                    'options' => array(
                        'operator' => 'greater_than_or_equal',
                        'value'    => strval($cart_cond_value),
                        'cart_context' => 'cart_total',
                    ),
                ),
            );
        }
    }

    // --- Product adjustments: el descuento ---
    // apply_as = 'sale_price': Flycart evalúa reglas POR PRODUCTO (no por carrito).
    // Con esto, exclusive=1 solo detiene otras reglas para ESE producto específico,
    // sin bloquear reglas de otros productos. La separata 35% bloquea el semanal
    // solo en frutas; la separata 25% bloquea el semanal solo en Flips.
    // Con 'first_matched_rule' el exclusive era cart-wide y una regla bloqueaba a la otra.
    $wdr_discount_type = ($discount_type === 'percentage') ? 'percentage' : 'flat';
    $product_adjustments = array(
        'type' => $wdr_discount_type,
        'value' => strval($discount_value),
        'apply_as' => 'sale_price',
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
        // exclusive='0': No usar exclusividad de Flycart (es cart-level, bloquea TODAS las reglas).
        // En su lugar, las reglas semanales tienen un filtro 'not_in_list' que excluye los productos
        // de separata. Así cada producto solo coincide con una regla → sin stacking, sin bloqueos.
        'exclusive'            => '0',
        'priority'             => $priority,
        'apply_to'             => $wdr_apply_to,
        'filters'              => wp_json_encode($filters ?: new stdClass()),
        'conditions'           => wp_json_encode(!empty($conditions) ? $conditions : new stdClass()),
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
            'display' => $badge_enabled,
            'badge_color_option' => 'custom',
            'badge_color' => $badge_bg_color,
            'badge_text_color' => $badge_text_color,
            'badge_text' => $badge_text,
        )),
        'discount_type'        => 'wdr_simple_discount',
        'used_coupons'         => '',
        'created_by'           => get_current_user_id() ?: 0,
        'created_on'           => $now,
        'modified_by'          => get_current_user_id() ?: 0,
        'modified_on'          => $now,
    );
}

// ═══════════════════════════════════════════════
// SHORTCODE: [merkahorro_separatas]
// Muestra flyers + productos de reglas con prioridad separata (≤5).
// Uso: [merkahorro_separatas] en cualquier página o widget
// Atributo opcional: cols="3" para cambiar columnas de los flyers.
// ═══════════════════════════════════════════════
function merkahorro_separatas_shortcode($atts) {
    $atts = shortcode_atts(array(
        'section' => 'promo_separatas',
        'cols'    => '3',
    ), $atts);

    $banners     = merkahorro_get_banners($atts['section'], merkahorro_get_current_sede());
    $cols        = max(1, min(6, intval($atts['cols'])));
    $grid_id     = 'mks-sep-' . wp_rand(1000, 9999);
    $prod_grid   = 'mks-sep-prod-' . wp_rand(1000, 9999);

    // ─── Productos de reglas separata con paginación ─────────────────────────────
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
    <style>
        /* ─── Hero: solo títulos, sin caja azul ─── */
        .mks-sep-hero {
            padding: 8px 0 24px;
            text-align: left;
            border-bottom: 3px solid #88dc00;
            margin-bottom: 28px;
        }
        .mks-sep-hero h2 {
            margin: 0 0 6px;
            font-size: 1.8rem;
            font-weight: 900;
            color: #160857 !important;
            letter-spacing: -0.02em;
        }
        .mks-sep-hero p {
            margin: 0;
            color: #666;
            font-size: 0.95rem;
        }

        /* ─── Flyers grid ─── */
        .mks-sep-section-label {
            font-size: 0.78rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: #160857;
            margin: 28px 0 14px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .mks-sep-section-label::after {
            content: '';
            flex: 1;
            height: 2px;
            background: #e8e8e8;
        }
        /* ─── Carousel de separatas ─── */
        .mks-sep-carousel-wrap { position: relative; margin-bottom: 36px; }
        #<?php echo esc_attr($grid_id); ?> {
            display: flex;
            gap: 18px;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding: 4px 2px 12px;
        }
        #<?php echo esc_attr($grid_id); ?>::-webkit-scrollbar { display: none; }
        #<?php echo esc_attr($grid_id); ?> .mks-sep-card {
            flex: 0 0 calc(33.333% - 12px);
            scroll-snap-align: start;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 3px 14px rgba(0,0,0,0.09);
            transition: transform .25s ease, box-shadow .25s ease;
            background: #fff;
        }
        #<?php echo esc_attr($grid_id); ?> .mks-sep-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 28px rgba(22,8,87,0.18);
        }
        #<?php echo esc_attr($grid_id); ?> .mks-sep-card img { width: 100%; height: auto; display: block; }
        #<?php echo esc_attr($grid_id); ?> .mks-sep-card a { display: block; cursor: zoom-in; }
        .mks-sep-nav-btn {
            position: absolute; top: 50%; transform: translateY(-55%);
            background: #160857; color: #fff; border: none; border-radius: 50%;
            width: 40px; height: 40px; font-size: 1.5rem; cursor: pointer; z-index: 2;
            line-height: 40px; text-align: center; padding: 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25); transition: background .2s;
            display: none;
        }
        .mks-sep-nav-btn:hover { background: #88dc00; color: #160857; }
        .mks-sep-nav-prev { left: -20px; }
        .mks-sep-nav-next { right: -20px; }

        /* ─── Lightbox modal ─── */
        .mks-sep-modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            z-index: 99999;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .mks-sep-modal-overlay.active { display: flex; }
        .mks-sep-modal-inner {
            position: relative;
            max-width: 90vw;
            max-height: 90vh;
        }
        .mks-sep-modal-inner img {
            max-width: 100%;
            max-height: 90vh;
            border-radius: 10px;
            display: block;
            box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        }
        .mks-sep-modal-close {
            position: absolute;
            top: -14px;
            right: -14px;
            background: #88dc00;
            color: #160857;
            border: none;
            border-radius: 50%;
            width: 34px;
            height: 34px;
            font-size: 1.2rem;
            font-weight: 900;
            cursor: pointer;
            line-height: 34px;
            text-align: center;
            padding: 0;
        }

        /* ─── Productos: dejar que WooCommerce maneje el grid igual que la tienda ─── */
        #<?php echo esc_attr($prod_grid); ?>.woocommerce ul.products {
            margin: 0 !important;
        }

        /* ─── Responsive ─── */
        @media (max-width: 900px) {
            #<?php echo esc_attr($grid_id); ?> .mks-sep-card { flex: 0 0 calc(50% - 9px); }
        }
        @media (max-width: 560px) {
            #<?php echo esc_attr($grid_id); ?> .mks-sep-card { flex: 0 0 83vw; }
            .mks-sep-hero h2 { font-size: 1.5rem; }
        }
    </style>

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
        // Cerrar con botón ✕ o clic sobre el fondo
        overlay.addEventListener('click', function(e){
            if (e.target === overlay || e.target.classList.contains('mks-sep-modal-close')) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
        // Cerrar con Escape
        document.addEventListener('keydown', function(e){
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    })();
    </script>

    <!-- ─── HERO: solo títulos ─── -->
    <div class="mks-sep-hero">
        <h2>OFERTAS ESPECIALES</h2>
        <p>Separatas y promociones exclusivas de nuestra tienda</p>
    </div>

    <?php if (!empty($sep_products)): ?>
    <!-- ─── PRODUCTOS DE SEPARATA ─── -->
    <span id="ofertas-especiales-productos"></span>
    <p class="mks-sep-section-label">🛒 Productos en oferta especial</p>
    <div id="<?php echo esc_attr($prod_grid); ?>" class="woocommerce">
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
    <nav class="woocommerce-pagination" style="margin-top:24px;">
        <?php echo paginate_links(array(
            'base'      => add_query_arg('sep_page', '%#%'),
            'format'    => '',
            'current'   => $sep_paged,
            'total'     => $sep_max_pages,
            'prev_text' => '&laquo;',
            'next_text' => '&raquo;',
            'type'      => 'list',
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
        <button class="mks-sep-nav-btn mks-sep-nav-prev" id="mks-prev-<?php echo esc_attr($grid_id); ?>" aria-label="Anterior">&#8249;</button>
        <div id="<?php echo esc_attr($grid_id); ?>">
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
        <button class="mks-sep-nav-btn mks-sep-nav-next" id="mks-next-<?php echo esc_attr($grid_id); ?>" aria-label="Siguiente">&#8250;</button>
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
            if (cards.length > 3) { btnPrev.style.display = 'block'; btnNext.style.display = 'block'; }
            function cardW() { return cards.length ? cards[0].offsetWidth + 18 : 300; }
            btnPrev.addEventListener('click', function(){ carousel.scrollBy({ left: -cardW(), behavior: 'smooth' }); });
            btnNext.addEventListener('click', function(){ carousel.scrollBy({ left:  cardW(), behavior: 'smooth' }); });
        }

        // Lightbox: clic en cualquier card abre el modal
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
            // Tecla Enter para accesibilidad
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
    <?php endif; ?>

    <?php
    return ob_get_clean();
}
add_shortcode('merkahorro_separatas', 'merkahorro_separatas_shortcode');

// ─── Helper: obtener productos de reglas separata desde wp_wdr_rules ──────────
// Cachea 5 min para no hacer la query en cada pageview.
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

    $now_ts = time();
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

// ═══════════════════════════════════════════════
// HOOK: Excluir productos separata de la página /ofertas/
// En /ofertas/ solo deben aparecer productos de reglas semanales (priority > 5).
// Los de separata (priority ≤ 5) ya tienen su página en /ofertas-especiales/.
// Sniper: activo solo en Villahermosa hasta validar diseño.
// ─────────────────────────────────────────────────────────────────────────────
// Helper interno: obtiene los IDs a excluir (con caché estático por request)
function merkahorro_get_separata_ids_to_exclude() {
    static $ids = null;
    if ($ids !== null) return $ids;
    $sep_data = merkahorro_get_separata_rule_ids();
    $ids = $sep_data['post_ids']; // ya son únicos y absint desde el helper
    return $ids;
}

// Caso A: /ofertas/ usa la query PRINCIPAL de WordPress (página sin shortcode, o con el_content directo)
add_action('pre_get_posts', function($query) {
    if (!merkahorro_is_dev_sede()) return;
    if (!$query->is_main_query() || is_admin()) return;
    if (!$query->is_page('ofertas')) return;

    $exclude_ids = merkahorro_get_separata_ids_to_exclude();
    if (!empty($exclude_ids)) {
        $current = (array) $query->get('post__not_in');
        $query->set('post__not_in', array_unique(array_merge($current, $exclude_ids)));
    }
});

// Caso B: /ofertas/ usa un SHORTCODE de WooCommerce ([sale_products], [products on_sale="true"], etc.)
// woocommerce_shortcode_products_query intercepta los args de CUALQUIER shortcode de productos.
add_filter('woocommerce_shortcode_products_query', function($query_args, $atts, $type) {
    if (!merkahorro_is_dev_sede()) return $query_args;

    // Verificar que estamos en la página /ofertas/ usando la global $post
    global $post;
    if (!$post || $post->post_name !== 'ofertas') return $query_args;

    $exclude_ids = merkahorro_get_separata_ids_to_exclude();
    if (!empty($exclude_ids)) {
        $current = (array) ($query_args['post__not_in'] ?? array());
        $query_args['post__not_in'] = array_unique(array_merge($current, $exclude_ids));
    }
    return $query_args;
}, 10, 3);


// ═══════════════════════════════════════════════
// PÁGINA DE DESCUENTO DINÁMICA: /promo/descuento/{id}/
// Cuando un banner de descuento lleva a esta URL,
// WordPress muestra los productos que aplican para esa regla.
// Requiere: Ajustes → Permalinks → guardar (para registrar la rewrite rule)
// ═══════════════════════════════════════════════
add_action('init', function() {
    // Registrar regla de reescritura: /promo/descuento/123/
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

add_action('template_redirect', function() {
    $promo_id = get_query_var('merkahorro_promo_id');
    if (!$promo_id) return;

    $promo_id = absint($promo_id);

    // Obtener la regla de descuento desde la API del Gestor
    $url      = MERKAHORRO_API_URL . '/content/discounts/' . $promo_id;
    $response = wp_remote_get($url, array('timeout' => 10, 'sslverify' => false));

    $rule = null;
    if (!is_wp_error($response)) {
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!empty($body['ok']) && !empty($body['data'])) {
            $rule = $body['data'];
        }
    }

    // ── Validar que la regla aplica a esta sede ──
    // Cada WordPress es independiente por subdominio, así que verificamos
    // que la regla tenga sedes=null (todas) o incluya la sede actual.
    $current_sede = merkahorro_get_current_sede();
    $rule_sedes   = $rule['sedes'] ?? null;

    if ($rule !== null && !empty($rule_sedes) && is_array($rule_sedes)) {
        if ($current_sede && !in_array($current_sede, $rule_sedes, true)) {
            // Esta promo no aplica para este subdominio — redirigir a la tienda
            wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
            exit;
        }
    }

    // ── Validar que la regla esté activa (habilitada en el gestor) ──
    // Si está marcada como inactiva (deshabilitada manualmente) → redirigir.
    // Si está activa pero hoy no es su día de descuento → mostrar productos con aviso.
    if ($rule !== null && empty($rule['active'])) {
        wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
        exit;
    }

    // ── Detectar si el descuento aplica HOY o cuándo será el próximo día ──
    $discount_active_today = true;
    $next_discount_label   = '';  // ej: "miércoles 22 de abril"

    if ($rule !== null) {
        $schedule_type = $rule['schedule_type'] ?? 'days';
        $schedule_days = $rule['schedule_days'] ?? array();
        $date_start    = $rule['date_start'] ?? '';
        $date_end      = $rule['date_end'] ?? '';

        if ($schedule_type === 'days' && !empty($schedule_days)) {
            // schedule_days usa 0=Dom, 1=Lun … 6=Sáb (igual que JS getDay())
            $today_dow = (int) date('w'); // PHP date('w'): 0=Dom, 6=Sáb
            $discount_active_today = in_array($today_dow, array_map('intval', $schedule_days), true);

            if (!$discount_active_today) {
                // Calcular el próximo día que aparece en schedule_days
                $day_names_es = array('domingo','lunes','martes','miércoles','jueves','viernes','sábado');
                $month_names_es = array('','enero','febrero','marzo','abril','mayo','junio',
                                        'julio','agosto','septiembre','octubre','noviembre','diciembre');
                $sorted_days = array_map('intval', $schedule_days);
                sort($sorted_days);
                $next_dow = null;
                // Buscar el primer día de la semana > hoy
                foreach ($sorted_days as $d) {
                    if ($d > $today_dow) { $next_dow = $d; break; }
                }
                // Si no hay ninguno esta semana, tomar el primero de la próxima
                if ($next_dow === null) { $next_dow = $sorted_days[0]; }
                $days_ahead = ($next_dow - $today_dow + 7) % 7;
                if ($days_ahead === 0) $days_ahead = 7;
                $next_ts = strtotime("+{$days_ahead} days");
                $next_discount_label = $day_names_es[$next_dow] . ' ' . date('j', $next_ts)
                    . ' de ' . $month_names_es[(int) date('n', $next_ts)];
            }
        } elseif ($schedule_type === 'date_range') {
            $today_ts = strtotime(date('Y-m-d'));
            if (!empty($date_start) && $today_ts < strtotime($date_start)) {
                $discount_active_today = false;
                $month_names_es = array('','enero','febrero','marzo','abril','mayo','junio',
                                        'julio','agosto','septiembre','octubre','noviembre','diciembre');
                $ts = strtotime($date_start);
                $next_discount_label = date('j', $ts) . ' de ' . $month_names_es[(int) date('n', $ts)];
            } elseif (!empty($date_end) && $today_ts > strtotime($date_end)) {
                // Rango de fechas ya expiró — redirigir
                wp_redirect(wc_get_page_permalink('shop') ?: home_url('/'));
                exit;
            }
        }
    }

    // Fallback: mostrar página sin regla
    $rule_title      = $rule['title'] ?? 'Productos en Promoción';
    $applies_to      = $rule['applies_to'] ?? 'all';
    $applies_to_ids  = $rule['applies_to_ids'] ?? array();
    $discount_type   = $rule['discount_type'] ?? 'percentage';
    $discount_value  = $rule['discount_value'] ?? 0;

    // Construir badge de descuento para el título
    if ($discount_type === 'percentage') {
        $badge_str = $discount_value . '% OFF';
    } else {
        $badge_str = '$' . number_format($discount_value, 0, ',', '.') . ' de descuento';
    }

    // ── Construir WP_Query (reemplaza el shortcode [products] para soportar filtros nativos) ──
    // Aplicar parámetros de filtro de URL (compatibles con los widgets de WooCommerce en el sidebar).
    $paged     = max(1, intval(get_query_var('paged') ?: ($_GET['paged'] ?? 1)));
    $min_price = isset($_GET['min_price']) ? floatval($_GET['min_price']) : null;
    $max_price = isset($_GET['max_price']) ? floatval($_GET['max_price']) : null;
    $orderby_raw = sanitize_text_field($_GET['orderby'] ?? 'menu_order');

    // Mapear valores orderby de WooCommerce
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
    if (!empty($ob['meta_key'])) {
        $query_args['meta_key'] = $ob['meta_key'];
    }

    // Filtrar por productos o categorías según la regla
    if ($applies_to === 'products' && !empty($applies_to_ids)) {
        $query_args['post__in'] = array_map('absint', $applies_to_ids);
    } elseif ($applies_to === 'categories' && !empty($applies_to_ids)) {
        $query_args['tax_query'] = array(array(
            'taxonomy' => 'product_cat',
            'field'    => 'term_id',
            'terms'    => array_map('absint', $applies_to_ids),
        ));
    } else {
        // all — solo productos con precio de venta activo
        $query_args['meta_query'][] = array(
            'key'     => '_sale_price',
            'value'   => '',
            'compare' => '!=',
        );
    }

    // Filtro de precio (widget WooCommerce Filter by Price)
    if ($min_price !== null || $max_price !== null) {
        $price_meta = array('relation' => 'AND');
        if ($min_price !== null) {
            $price_meta[] = array('key' => '_price', 'value' => $min_price, 'compare' => '>=', 'type' => 'NUMERIC');
        }
        if ($max_price !== null) {
            $price_meta[] = array('key' => '_price', 'value' => $max_price, 'compare' => '<=', 'type' => 'NUMERIC');
        }
        if (!empty($query_args['meta_query'])) {
            $query_args['meta_query'] = array_merge(array('relation' => 'AND'), (array) $query_args['meta_query'], array($price_meta));
        } else {
            $query_args['meta_query'] = $price_meta;
        }
    }

    // Filtro por categoría adicional desde URL (?filter_cat=123)
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

    // Inyectar CSS
    add_action('wp_head', function() { ?>
        <style>
            /* ─── Hero: título limpio sin cajón azul ─── */
            .mks-promo-hero {
                border-bottom: 3px solid #88dc00;
                padding: 32px 20px 26px;
                text-align: center;
                background: #fff;
            }
            .mks-promo-hero h1 {
                margin: 0 0 12px;
                font-size: 2rem;
                color: #160857 !important;
                font-weight: 800;
                line-height: 1.2;
            }
            .mks-promo-badge {
                display: inline-block;
                background: #88dc00;
                color: #160857;
                font-weight: 800;
                font-size: 1.1rem;
                padding: 6px 22px;
                border-radius: 20px;
            }
            .mks-promo-badge-upcoming {
                display: inline-block;
                background: #f5a623;
                color: #fff;
                font-weight: 800;
                font-size: 1.05rem;
                padding: 6px 22px;
                border-radius: 20px;
            }

            /* ─── Aviso próximo descuento: centrado ─── */
            .mks-promo-upcoming {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                background: #fff8e1;
                border-top: 1px solid #ffe082;
                border-bottom: 3px solid #f5a623;
                color: #7a4f00;
                padding: 14px 24px;
                font-size: 0.95rem;
                font-weight: 600;
                text-align: center;
            }
            .mks-promo-upcoming .mks-upcoming-icon { font-size: 1.2rem; flex-shrink: 0; }

            /* ─── Layout principal ─── */
            .mks-promo-wrap {
                display: flex;
                gap: 32px;
                max-width: 1280px;
                margin: 28px auto;
                padding: 0 20px 60px;
                align-items: flex-start;
            }

            /* ─── Sidebar con filtros ─── */
            .mks-promo-sidebar { flex: 0 0 240px; min-width: 0; }
            .mks-filter-widget {
                background: #fff;
                border: 1px solid #e8e8e8;
                border-radius: 10px;
                padding: 18px 16px;
                margin-bottom: 16px;
            }
            .mks-filter-widget-title {
                font-size: 0.82rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: .06em;
                color: #160857;
                margin: 0 0 14px;
                padding-bottom: 8px;
                border-bottom: 2px solid #88dc00;
            }
            .mks-price-inputs { display: flex; align-items: center; gap: 6px; }
            .mks-price-input {
                flex: 1; min-width: 0;
                border: 1px solid #ddd; border-radius: 6px;
                padding: 7px 8px; font-size: 0.85rem; width: 100%;
            }
            .mks-price-sep { color: #999; font-size: 0.85rem; flex-shrink: 0; }
            .mks-price-apply {
                display: block; width: 100%; margin-top: 10px;
                background: #160857; color: #fff; border: none;
                border-radius: 6px; padding: 8px; font-size: 0.85rem;
                font-weight: 600; cursor: pointer; transition: background .2s;
            }
            .mks-price-apply:hover { background: #88dc00; color: #160857; }
            .mks-cat-list { list-style: none; margin: 0; padding: 0; }
            .mks-cat-list li { margin-bottom: 6px; }
            .mks-cat-list a {
                display: flex; align-items: center; justify-content: space-between;
                font-size: 0.88rem; color: #333; text-decoration: none;
                padding: 4px 0; border-bottom: 1px solid #f4f4f4; transition: color .15s;
            }
            .mks-cat-list a:hover, .mks-cat-list a.active { color: #160857; font-weight: 700; }
            .mks-cat-count {
                background: #f0f0f0; border-radius: 10px;
                padding: 1px 7px; font-size: 0.78rem; color: #666;
            }
            .mks-sort-select {
                width: 100%; border: 1px solid #ddd; border-radius: 6px;
                padding: 8px 10px; font-size: 0.88rem; background: #fff; cursor: pointer;
            }
            .mks-active-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
            .mks-filter-chip {
                display: inline-flex; align-items: center; gap: 5px;
                background: #160857; color: #fff; border-radius: 20px;
                padding: 3px 10px; font-size: 0.8rem; font-weight: 600;
            }
            .mks-filter-chip a { color: #88dc00; text-decoration: none; font-weight: 800; }

            /* ─── Contenido principal ─── */
            .mks-promo-main { flex: 1 1 0; min-width: 0; }
            .mks-promo-toolbar {
                display: flex; align-items: center; justify-content: space-between;
                flex-wrap: wrap; gap: 10px; margin-bottom: 20px;
                padding-bottom: 12px; border-bottom: 1px solid #eee;
            }
            .mks-result-count { font-size: 0.85rem; color: #888; }

            @media (max-width: 768px) {
                .mks-promo-wrap { flex-direction: column; }
                .mks-promo-sidebar { flex: none; width: 100%; }
                .mks-promo-hero h1 { font-size: 1.5rem; }
            }
        </style>
    <?php }, 99);

    // Recopilar categorías de los productos de esta promo para el filtro lateral
    $promo_cats = array();
    if ($applies_to === 'products' && !empty($applies_to_ids)) {
        foreach (array_slice($applies_to_ids, 0, 60) as $pid) {
            $terms = get_the_terms($pid, 'product_cat');
            if ($terms && !is_wp_error($terms)) {
                foreach ($terms as $t) {
                    if (!isset($promo_cats[$t->term_id])) {
                        $promo_cats[$t->term_id] = array('name' => $t->name, 'count' => 0);
                    }
                    $promo_cats[$t->term_id]['count']++;
                }
            }
        }
    } elseif ($applies_to === 'categories' && !empty($applies_to_ids)) {
        foreach ($applies_to_ids as $cat_id) {
            $t = get_term($cat_id, 'product_cat');
            if ($t && !is_wp_error($t)) {
                $promo_cats[$t->term_id] = array('name' => $t->name, 'count' => $t->count);
            }
        }
    }

    $active_min = isset($_GET['min_price']) ? floatval($_GET['min_price']) : '';
    $active_max = isset($_GET['max_price']) ? floatval($_GET['max_price']) : '';
    $has_price_filter = ($active_min !== '' || $active_max !== '');

    // Forzar el <title> de la pestaña para esta página custom.
    // Sin esto WordPress usa el título de otra página (la que tenga el query por defecto).
    add_filter('document_title_parts', function($title) use ($rule_title) {
        $title['title'] = preg_replace('/^\[MK-Gestor\]\s*/i', '', $rule_title);
        return $title;
    });

    get_header();
    ?>

        <!-- ─── HERO: título limpio ─── -->
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

        <!-- ─── Aviso próximo descuento (centrado) ─── -->
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

            <!-- ─── SIDEBAR: filtros propios ─── -->
            <aside class="mks-promo-sidebar">

                <?php if ($has_price_filter): ?>
                <div class="mks-active-filters">
                    <span class="mks-filter-chip">
                        $<?php echo number_format((float)$active_min, 0, ',', '.'); ?>
                        – $<?php echo number_format((float)$active_max, 0, ',', '.'); ?>
                        <a href="<?php echo esc_url(add_query_arg(array('min_price'=>false,'max_price'=>false,'paged'=>false))); ?>">✕</a>
                    </span>
                </div>
                <?php endif; ?>

                <!-- Precio -->
                <div class="mks-filter-widget">
                    <p class="mks-filter-widget-title">💰 Filtrar por precio</p>
                    <form method="get">
                        <?php foreach ($_GET as $k => $v):
                            if (in_array($k, array('min_price','max_price','paged'), true)) continue;
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
                               class="<?php echo (isset($_GET['filter_cat']) && (int)$_GET['filter_cat'] === $cat_id) ? 'active' : ''; ?>">
                                <?php echo esc_html($cat['name']); ?>
                                <span class="mks-cat-count"><?php echo esc_html($cat['count']); ?></span>
                            </a>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                </div>
                <?php endif; ?>

                <!-- Ordenar -->
                <div class="mks-filter-widget">
                    <p class="mks-filter-widget-title">↕ Ordenar por</p>
                    <form method="get" action="<?php echo esc_url(strtok($_SERVER['REQUEST_URI'], '?')); ?>">
                        <?php foreach ($_GET as $k => $v):
                            if ($k === 'orderby') continue;
                            echo '<input type="hidden" name="' . esc_attr($k) . '" value="' . esc_attr($v) . '">';
                        endforeach; ?>
                        <select class="mks-sort-select" name="orderby" onchange="this.form.submit()">
                            <option value="menu_order"<?php selected($orderby_raw,'menu_order'); ?>>Orden predeterminado</option>
                            <option value="popularity"<?php selected($orderby_raw,'popularity'); ?>>Popularidad</option>
                            <option value="date"<?php selected($orderby_raw,'date'); ?>>Más recientes</option>
                            <option value="price"<?php selected($orderby_raw,'price'); ?>>Precio: menor a mayor</option>
                            <option value="price-desc"<?php selected($orderby_raw,'price-desc'); ?>>Precio: mayor a menor</option>
                        </select>
                    </form>
                </div>

            </aside>

            <!-- ─── CONTENIDO PRINCIPAL ─── -->
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
                    // Configurar el loop de WooCommerce con los datos de paginación correctos.
                    // woocommerce_pagination() usa wc_get_loop_prop('total_pages') internamente,
                    // por eso hay que llamar wc_setup_loop() — no alcanza con swapear $wp_query.
                    wc_setup_loop(array(
                        'total'       => $promo_loop->found_posts,
                        'total_pages' => $promo_loop->max_num_pages,
                        'current_page'=> $paged,
                        'columns'     => apply_filters('loop_shop_columns', 4),
                    ));
                    ?>
                    <?php woocommerce_product_loop_start(); ?>
                        <?php while ($promo_loop->have_posts()): $promo_loop->the_post(); ?>
                            <?php wc_get_template_part('content', 'product'); ?>
                        <?php endwhile; ?>
                    <?php woocommerce_product_loop_end(); ?>
                    <?php wp_reset_postdata(); wc_reset_loop(); ?>

                    <!-- Paginación con URL explícita — woocommerce_pagination() usa get_pagenum_link()
                         que no funciona con rewrite custom. Usamos paginate_links() directamente
                         con add_query_arg para generar ?paged=X sobre la URL actual. -->
                    <?php if ($promo_loop->max_num_pages > 1): ?>
                    <div class="woocommerce">
                    <nav class="woocommerce-pagination" style="margin-top:24px;">
                        <?php echo paginate_links(array(
                            'base'      => add_query_arg('paged', '%#%'),
                            'format'    => '',
                            'current'   => $paged,
                            'total'     => $promo_loop->max_num_pages,
                            'prev_text' => '&laquo;',
                            'next_text' => '&raquo;',
                            'type'      => 'list',
                            'add_args'  => false,
                        )); ?>
                    </nav>
                    </div>
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

// Registrar la rewrite rule solo si aún no está presente en las reglas activas.
// - get_option('rewrite_rules') es autoloaded por WordPress (costo cero extra).
// - flush_rewrite_rules(false) solo actualiza la BD, NO reescribe .htaccess.
// - Esto evita el race condition de múltiples workers ejecutando el flush
//   simultáneamente al desplegar el plugin por primera vez.
add_action('wp_loaded', function() {
    $rules = get_option('rewrite_rules');
    if (empty($rules) || !array_key_exists('^promo/descuento/([0-9]+)/?$', $rules)) {
        flush_rewrite_rules(false);
    }
});

// ═══════════════════════════════════════════════
// BADGE DE OFERTA: Reemplazo del "¡Oferta!" por defecto de WooCommerce
// Reemplaza el texto genérico por un badge con los colores de Merkahorro
// y muestra el porcentaje de descuento real del producto.
// ═══════════════════════════════════════════════

// Aplicar estilos Merkahorro SOLO a los badges de descuento por valor fijo.
// Prioridad 999 = corre al final, después de que Flycart ya haya modificado el HTML
// de las reglas por porcentaje.
// Lógica: si el $html ya contiene "%" → Flycart lo manejó → no tocar.
//         si no tiene "%" → es el badge genérico de WooCommerce ("¡Oferta!") → reemplazar.
add_filter('woocommerce_sale_flash', function($html, $post, $product) {
    // Flycart/AWDR ya aplicó un badge con porcentaje — no interferir
    if (strpos($html, '%') !== false) {
        return $html;
    }
    // Badge nativo de WooCommerce (descuento por valor fijo) — aplicar branding
    return '<span class="onsale mks-fixed-sale">Oferta Separata</span>';
}, 999, 3);

// Inyectar CSS en el frontend (una sola vez, peso mínimo)
// IMPORTANTE: Solo apuntamos a .mks-fixed-sale (clase que solo nosotros inyectamos).
// El .onsale genérico NO se toca para no interferir con el badge de Flycart en reglas %.
add_action('wp_head', function() { ?>
<style>
/* ─── Badge de oferta Merkahorro (solo descuentos por valor fijo) ─── */
span.mks-fixed-sale,
.woocommerce span.mks-fixed-sale,
.woocommerce-page span.mks-fixed-sale,
ul.products li.product .mks-fixed-sale,
.woocommerce ul.products li.product .mks-fixed-sale {
    /* Posición */
    position: absolute;
    top: 12px;
    left: 12px;
    right: auto;
    z-index: 9;
    /* Forma */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    width: auto;
    height: auto;
    padding: 4px 10px;
    border-radius: 6px;
    /* Colores Merkahorro */
    background: #160857 !important;
    color: #88dc00 !important;
    /* Tipografía */
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: .04em;
    line-height: 1.4;
    text-transform: uppercase;
    /* Reset forma circular del tema */
    border: none;
    box-shadow: 0 2px 8px rgba(22, 8, 87, 0.35);
}
</style>
<?php }, 20);
