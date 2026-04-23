<?php
/**
 * Tiles de la página de categoría Descuentos Especiales
 *
 * Registra el shortcode [merkahorro_discount_tiles] y
 * lo inyecta automáticamente en /categoria-producto/descuentos-especiales/
 */

defined('ABSPATH') || exit;

// -----------------------------------------------------------------------
// Auto-inject antes del loop en la categoría descuentos-especiales
// -----------------------------------------------------------------------
add_action('woocommerce_before_shop_loop', function () {
    if (! is_product_category('descuentos-especiales')) return;
    echo do_shortcode('[merkahorro_discount_tiles]');
}, 5);

// -----------------------------------------------------------------------
// Shortcode [merkahorro_discount_tiles]
// Para uso manual: [merkahorro_discount_tiles sede="PV001"]
// -----------------------------------------------------------------------
add_shortcode('merkahorro_discount_tiles', 'merkahorro_discount_tiles_shortcode');

function merkahorro_discount_tiles_shortcode($atts) {
    $atts = shortcode_atts(['sede' => null], $atts, 'merkahorro_discount_tiles');

    $sede = $atts['sede'] ?: merkahorro_get_current_sede();
    $cache_key = 'mks_discount_tiles_' . sanitize_key($sede ?: 'all');

    // Intentar desde caché
    $tiles = get_transient($cache_key);

    if (false === $tiles) {
        $api_url = MERKAHORRO_API_URL . '/content/discount-tiles';
        if ($sede) {
            $api_url = add_query_arg('sede', $sede, $api_url);
        }

        $response = wp_remote_get($api_url, [
            'timeout' => 10,
            'headers' => ['x-api-key' => MERKAHORRO_API_KEY],
        ]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return '<!-- merkahorro_discount_tiles: error al cargar -->';
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        $tiles = $body['data'] ?? [];
        set_transient($cache_key, $tiles, MERKAHORRO_CACHE_TTL);
    }

    // Solo tiles activos
    $tiles = array_values(array_filter($tiles, fn($t) => !empty($t['active'])));

    if (empty($tiles)) return '';

    // Ordenar por display_order
    usort($tiles, fn($a, $b) => ($a['display_order'] ?? 0) - ($b['display_order'] ?? 0));

    // Render: misma estructura que merkahorro_tiles_shortcode en shortcodes-banners.php
    $uid = 'mks-dtiles-' . substr(md5($sede . time()), 0, 6);

    ob_start();
    ?>
    <div class="mks-tiles-wrap" id="<?php echo esc_attr($uid); ?>">
      <div class="mks-tiles">
        <?php foreach ($tiles as $tile) :
          $href    = esc_url($tile['link_url'] ?? '#');
          $img     = esc_url($tile['image_url'] ?? '');
          $alt     = esc_attr($tile['alt_text'] ?? $tile['title'] ?? '');
          $label   = esc_html($tile['label'] ?? '');
        ?>
        <div class="mks-tile">
          <a href="<?php echo $href; ?>">
            <?php if ($img) : ?>
              <img src="<?php echo $img; ?>" alt="<?php echo $alt; ?>" loading="lazy" class="mks-loaded" />
            <?php endif; ?>
            <?php if ($label) : ?>
              <span class="mks-tile-label" style="display:block;text-align:center;font-size:0.85rem;font-weight:700;color:#160857;padding:5px 0;"><?php echo $label; ?></span>
            <?php endif; ?>
          </a>
        </div>
        <?php endforeach; ?>
      </div>
      <button class="mks-tiles-nav mks-tiles-prev" aria-label="Anterior">&#8249;</button>
      <button class="mks-tiles-nav mks-tiles-next" aria-label="Siguiente">&#8250;</button>
    </div>

    <script>
    (function() {
        var wrap  = document.getElementById('<?php echo esc_js($uid); ?>');
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
    <?php
    return ob_get_clean();
}

// -----------------------------------------------------------------------
// Clear cache al guardar desde el gestor (via REST: POST /clear-cache ya
// borra todos los transients con prefijo mks_, incluye mks_discount_tiles_*)
// -----------------------------------------------------------------------
