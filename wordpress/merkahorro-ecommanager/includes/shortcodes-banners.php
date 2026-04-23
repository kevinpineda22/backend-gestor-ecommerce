<?php
/**
 * Merkahorro EcomManager — Shortcodes de Banners
 *
 * Registra:
 *   [merkahorro_slider]  — slider hero con autoplay
 *   [merkahorro_tiles]   — carousel horizontal de tiles promocionales
 *
 * El CSS se carga globalmente desde assets/merkahorro.css.
 */

if (!defined('ABSPATH')) exit;

// ─────────────────────────────────────────────────────────────────────────────
// [merkahorro_slider]
// Atributos:
//   section  (default: home_slider)
//   autoplay (ms entre slides, default: 5000 — poner 0 para desactivar)
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_slider_shortcode($atts) {
    $atts = shortcode_atts(array(
        'section'  => 'home_slider',
        'autoplay' => '5000',
    ), $atts);

    $banners   = merkahorro_get_banners($atts['section'], merkahorro_get_current_sede());
    $autoplay  = intval($atts['autoplay']);

    if (empty($banners)) {
        return '<!-- Merkahorro EcomManager: No hay banners activos para ' . esc_attr($atts['section']) . ' -->';
    }

    $slider_id = 'mks-' . wp_rand(1000, 9999);

    ob_start();
    // Precargar todas las imágenes para evitar parpadeo en el primer frame
    foreach ($banners as $pi => $pb): ?>
        <link rel="preload" as="image" href="<?php echo esc_url($pb['image_url']); ?>"<?php echo $pi === 0 ? ' fetchpriority="high"' : ''; ?>>
    <?php endforeach; ?>

    <div class="mks-slider" id="<?php echo esc_attr($slider_id); ?>">
        <div class="mks-slides-wrap">
            <?php foreach ($banners as $i => $banner): ?>
                <div class="mks-slide <?php echo $i === 0 ? 'active' : ''; ?>">
                    <?php if (!empty($banner['link_url'])): ?>
                        <a href="<?php echo esc_url($banner['link_url']); ?>">
                            <img src="<?php echo esc_url($banner['image_url']); ?>"
                                 alt="<?php echo esc_attr($banner['title'] ?? ''); ?>"
                                 loading="eager" decoding="async">
                        </a>
                    <?php else: ?>
                        <img src="<?php echo esc_url($banner['image_url']); ?>"
                             alt="<?php echo esc_attr($banner['title'] ?? ''); ?>"
                             loading="eager" decoding="async">
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
        <div class="mks-dots" id="<?php echo esc_attr($slider_id); ?>-dots">
            <?php foreach ($banners as $i => $banner): ?>
                <button class="mks-dot <?php echo $i === 0 ? 'active' : ''; ?>"
                        data-index="<?php echo $i; ?>"
                        aria-label="Ir al slide <?php echo $i + 1; ?>"></button>
            <?php endforeach; ?>
        </div>

        <script>
        (function() {
            var slider   = document.getElementById('<?php echo esc_js($slider_id); ?>');
            var dotsWrap = document.getElementById('<?php echo esc_js($slider_id); ?>-dots');
            if (!slider) return;

            var slides   = slider.querySelectorAll('.mks-slide');
            var dotBtns  = dotsWrap ? dotsWrap.querySelectorAll('.mks-dot') : [];
            var current  = 0;
            var total    = slides.length;
            var autoMs   = <?php echo $autoplay; ?>;
            var timer;

            function goTo(idx) {
                slides[current].classList.remove('active');
                if (dotBtns[current]) dotBtns[current].classList.remove('active');
                current = (idx + total) % total;
                slides[current].classList.add('active');
                if (dotBtns[current]) dotBtns[current].classList.add('active');
            }

            function startAutoplay() {
                if (autoMs > 0 && total > 1) {
                    timer = setInterval(function() { goTo(current + 1); }, autoMs);
                }
            }

            function stopAutoplay() { clearInterval(timer); }

            var prevBtn = slider.querySelector('.mks-prev');
            var nextBtn = slider.querySelector('.mks-next');
            if (prevBtn) prevBtn.addEventListener('click', function() { stopAutoplay(); goTo(current - 1); startAutoplay(); });
            if (nextBtn) nextBtn.addEventListener('click', function() { stopAutoplay(); goTo(current + 1); startAutoplay(); });

            dotBtns.forEach(function(dot) {
                dot.addEventListener('click', function() {
                    stopAutoplay();
                    goTo(parseInt(this.dataset.index));
                    startAutoplay();
                });
            });

            startAutoplay();
        })();
        </script>
    <?php endif;

    return ob_get_clean();
}
add_shortcode('merkahorro_slider', 'merkahorro_slider_shortcode');


// ─────────────────────────────────────────────────────────────────────────────
// [merkahorro_tiles]
// Atributo:
//   section (default: home_tiles)
// ─────────────────────────────────────────────────────────────────────────────
function merkahorro_tiles_shortcode($atts) {
    $atts    = shortcode_atts(array('section' => 'home_tiles'), $atts);
    $banners = merkahorro_get_banners($atts['section'], merkahorro_get_current_sede());
    $total   = count($banners);

    if (empty($banners)) {
        return '<!-- Merkahorro EcomManager: No hay tiles activos para ' . esc_attr($atts['section']) . ' -->';
    }

    $tile_id = 'mkt-' . wp_rand(1000, 9999);

    ob_start(); ?>
    <div class="mks-tiles-wrap" id="<?php echo esc_attr($tile_id); ?>">
        <div class="mks-tiles">
            <?php foreach ($banners as $banner): ?>
                <div class="mks-tile">
                    <?php if (!empty($banner['link_url'])): ?>
                        <a href="<?php echo esc_url($banner['link_url']); ?>">
                            <img src="<?php echo esc_url($banner['image_url']); ?>"
                                 alt="<?php echo esc_attr($banner['title'] ?? ''); ?>"
                                 loading="lazy" decoding="async"
                                 onload="this.classList.add('mks-loaded')">
                        </a>
                    <?php else: ?>
                        <img src="<?php echo esc_url($banner['image_url']); ?>"
                             alt="<?php echo esc_attr($banner['title'] ?? ''); ?>"
                             loading="lazy" decoding="async"
                             onload="this.classList.add('mks-loaded')">
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
        var wrap  = document.getElementById('<?php echo esc_js($tile_id); ?>');
        if (!wrap) return;
        var track = wrap.querySelector('.mks-tiles');
        var prev  = wrap.querySelector('.mks-tiles-prev');
        var next  = wrap.querySelector('.mks-tiles-next');
        var tile  = track.querySelector('.mks-tile');
        if (!tile) return;

        function getScrollAmount() { return tile.offsetWidth + 14; }

        function checkFits() {
            if (track.scrollWidth <= track.clientWidth + 2) wrap.classList.add('fits-all');
            else wrap.classList.remove('fits-all');
        }

        if (prev) prev.addEventListener('click', function() { track.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' }); });
        if (next) next.addEventListener('click', function() { track.scrollBy({ left:  getScrollAmount(), behavior: 'smooth' }); });

        checkFits();
        window.addEventListener('resize', checkFits);
    })();
    </script>
    <?php endif;

    return ob_get_clean();
}
add_shortcode('merkahorro_tiles', 'merkahorro_tiles_shortcode');
