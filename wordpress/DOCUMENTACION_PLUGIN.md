# Documentación del Plugin: Merkahorro EcomManager Bridge

> **Versión actual:** 2.1
> **Última revisión:** 2026-05-20
> **Estado:** Plugin estándar (ya no es MU-plugin)

---

## 1. Propósito general

Este plugin reemplaza al antiguo archivo monolítico `merkahorro-banners.php` (MU-plugin). Su objetivo es conectar WooCommerce con el sistema externo **EcomManager / Gestor Ecommerce** (Supabase + Vercel), permitiendo la sincronización de banners, reglas de descuento y separatas, pero **resolviendo los problemas críticos de rendimiento** del MU-plugin original (borrados masivos de caché, escrituras innecesarias en base de datos, ausencia de validación de cambios).

---

## 2. Estructura de archivos

El plugin vive en `wp-content/plugins/merkahorro-ecommanager-bridge/` y es modular:

```text
merkahorro-ecommanager-bridge/
├── merkahorro-ecommanager-bridge.php   # Bootstrap del plugin
└── includes/
    ├── class-logger.php                # Auditoría y logging condicional WP_DEBUG
    ├── class-cache-manager.php         # Purgas selectivas (no globales)
    ├── class-api.php                   # Endpoint /clear-cache + helper check_api_key
    ├── class-banners.php               # Shortcodes [merkahorro_slider] y [merkahorro_tiles] + /wp-banners
    ├── class-separatas.php             # Shortcode [merkahorro_separatas] + ruta /promo/descuento/{id}/
    ├── class-discount-sync.php         # GET/POST/DELETE de reglas de descuento
    ├── class-diagnostics.php           # /diagnostico solo lectura
    └── wdr-helper.php                  # Helper para construir filas wp_wdr_rules
```

---

## 3. Constantes configurables

Definidas al inicio de `merkahorro-ecommanager-bridge.php`. Pueden sobrescribirse desde `wp-config.php`.

| Constante | Default | Uso |
|-----------|---------|-----|
| `MERKAHORRO_BRIDGE_VERSION` | `2.1` | Reportada en `/diagnostico` |
| `MERKAHORRO_API_URL` | `https://backend-gestor-ecommerce.vercel.app/api` | Backend Vercel que sirve datos al plugin |
| `MERKAHORRO_CACHE_TTL` | `3600` (1 h) | TTL de transients de banners |
| `MERKAHORRO_API_KEY` | `merkahorro2026` | API key compartida — **ver §7 Seguridad pendiente** |
| `MERKAHORRO_SEDE_MAP` | JSON con 4 dominios → códigos SIESA | Resolución de sede por host |

**Mapa de sedes:**

```json
{
  "supermercadomerkahorro.com":              "PV001",
  "girardota.supermercadomerkahorro.com":    "00301",
  "barbosa.supermercadomerkahorro.com":      "00701",
  "villahermosa.supermercadomerkahorro.com": "00201"
}
```

---

## 4. API REST — Namespace `merkahorro/v1`

> ⚠️ **El namespace real es `wp-json/merkahorro/v1/`** (no `ecommanager/v1` como decía la versión anterior de esta doc).

Todos los endpoints requieren autenticación vía:
- Header `X-API-Key: <MERKAHORRO_API_KEY>`, o
- Query string `?key=<MERKAHORRO_API_KEY>`, o
- Usuario WP loggeado con capability `manage_woocommerce`.

| Método | Ruta | Archivo | Función |
|--------|------|---------|---------|
| `POST` | `/clear-cache` | `class-api.php` | Purga selectiva. Params: `force_global=true` para purga global (emergencia), `url=<URL>` para purgar una URL específica. |
| `GET`  | `/diagnostico` | `class-diagnostics.php` | Solo lectura. Devuelve versión, sede detectada, estado de banners, último hash de sync. |
| `GET`  | `/wp-banners` | `class-banners.php` | Inventario de banners disponibles en WP: slides de RevSlider, thumbnails de categorías WooCommerce, attachments con palabras clave. **Cacheado 15 min**. Param `fresh=true` fuerza bypass. |
| `GET`  | `/woo-discount-rules` | `class-discount-sync.php` | Lee `wp_wdr_rules` con prefijo `[MK-Gestor]` y devuelve normalizado. **Cacheado 5 min**. Param `fresh=true` fuerza bypass. |
| `POST` | `/sync-discount-rules` | `class-discount-sync.php` | Crea/actualiza reglas en `wp_wdr_rules`. Validación por hash MD5: si el payload es idéntico al último sync, no escribe. |
| `DELETE` | `/sync-discount-rules` | `class-discount-sync.php` | Elimina reglas. Requiere `title=<X>` para borrar una, o `delete_all=true` explícito para borrar todas. |

**Shortcodes registrados** (no son endpoints REST, se usan en páginas/posts):

| Shortcode | Atributos | Descripción |
|-----------|-----------|-------------|
| `[merkahorro_slider]` | `section="home_slider"`, `autoplay="5000"` | Carrusel de banners de la sección indicada para la sede actual |
| `[merkahorro_tiles]` | `section="home_tiles"` | Grilla de tiles |
| `[merkahorro_separatas]` | `section="promo_separatas"`, `cols="3"` | Carrusel de separatas + grilla de productos en oferta especial |

**Ruta dinámica registrada** (no REST):
- `GET /promo/descuento/{id}/` → renderiza una página de promoción específica con productos filtrados por la regla `id`. Requiere `flush_rewrite_rules` al activar (ya cubierto por el hook de activación).

---

## 5. Detalle de archivos

### A. `merkahorro-ecommanager-bridge.php`

Bootstrap del plugin. Define constantes, carga clases, registra hooks de activación/desactivación.

- **`merkahorro_get_current_sede()`** — Detecta la sede actual con esta prioridad:
  1. `?sede=<CODIGO>` (solo si el código está en `MERKAHORRO_SEDE_MAP`)
  2. Host (`HTTP_HOST`) mapeado en `MERKAHORRO_SEDE_MAP`
  3. Cookie `sede_codigo` o `wc_sede` (solo si el código es válido)
  4. `null` si nada matchea
- **`merkahorro_bridge_activate()`** — Registra la rewrite rule de `/promo/descuento/{id}/` y hace `flush_rewrite_rules()`. Se dispara en activación del plugin.
- **`merkahorro_bridge_deactivate()`** — `flush_rewrite_rules()` al desactivar para limpiar.

### B. `includes/class-api.php`

- **`check_api_key($request)`** — permission_callback compartida. Acepta header `X-API-Key`, query `?key=`, o usuario admin loggeado.
- **`endpoint_clear_cache()`** — POST `/clear-cache`. `force_global=true` ejecuta `Cache_Manager::emergency_global_purge()`. Por defecto solo purga transients propios + URL específica.

### C. `includes/class-cache-manager.php`

- **`clear_local_transients()`** — `DELETE` directo en `wp_options` filtrando por `_transient_merkahorro_*` y `_transient_mks_*`.
- **`purge_url_cache($url)`** — purga selectiva en WP Rocket (`rocket_clean_files`) y LiteSpeed (`do_action('litespeed_purge_url')`). Si no se pasa URL, usa la home.
- **`emergency_global_purge()`** — `wp_cache_flush()` + `rocket_clean_domain()` + `litespeed_purge_all` + Elementor. **Solo se invoca con `force_global=true`**, nunca automáticamente.

### D. `includes/class-discount-sync.php`

El módulo crítico. Conecta el Gestor con la tabla `wp_wdr_rules` del plugin **Flycart Discount Rules (WDR)**.

- **`sync_rules($request)`** — POST. Pasos:
  1. Verifica que `wp_wdr_rules` exista.
  2. Si el payload está vacío y no se envió `sync_empty=true`, **rechaza con 400**.
  3. Calcula MD5 del payload. Si coincide con el último sync, responde "skipped" sin escribir.
  4. Convierte SKUs a IDs locales de WooCommerce (vía `wc_get_product_id_by_sku`).
  5. Identifica reglas P≤5 (separatas) y excluye sus productos de las reglas P=10 (semanales).
  6. INSERT/UPDATE en `wp_wdr_rules` usando `wdr-helper.php`. Borra reglas `[MK-Gestor]` que no estén en el payload.
  7. Guarda el nuevo hash.
  8. Invalida transients de WDR, precios variables variables WC, y nuestras propias cachés.
- **`get_rules($request)`** — GET `/woo-discount-rules`. Cacheado 5 min. Normaliza el JSON de FlyCart al formato del Gestor (`discount_type`, `applies_to`, `schedule_type`, etc.).
- **`delete_rules($request)`** — DELETE. Sin `title` requiere `delete_all=true` explícito (protección contra borrado accidental).

### E. `includes/class-banners.php`

- **`get_banners($section, $sede)`** — fetch a `MERKAHORRO_API_URL/content/banners` con cache de transient por sección+sede. TTL `MERKAHORRO_CACHE_TTL`.
- **`slider_shortcode($atts)`** — renderiza el carrusel. **Precarga solo la primera imagen**; el resto va con `loading="lazy"`.
- **`tiles_shortcode($atts)`** — grilla horizontal con scroll-snap. Botones nav prev/next solo si los tiles desbordan el ancho.
- **`endpoint_wp_banners($request)`** — GET `/wp-banners`. Cacheado 15 min, bypass con `?fresh=true`. Lee RevSlider + thumbnails de `product_cat` (parent=0, máx 30) + media library (máx 50 attachments con keywords promo).

### F. `includes/class-separatas.php`

- **`get_separata_rule_ids()`** — lee `wp_wdr_rules` filtrando `[MK-Gestor]%`, `priority < 5`, `enabled = '1'`, vigencia activa hoy. Devuelve `post_ids` y `cat_ids`. Cache `mks_separata_ids_v1` 5 min.
- **`exclude_separata_from_main_query()`** + **`exclude_separata_from_shortcode()`** — excluyen los productos de separatas de la página `/ofertas/` para no duplicar contenido.
- **`register_promo_rewrite_rule()`** — añade la rule `^promo/descuento/([0-9]+)/?$`. Se invoca en activación del plugin (con flush) y en `init` en cada carga.
- **`handle_promo_template_redirect()`** — intercepta `/promo/descuento/{id}/`, fetch a `MERKAHORRO_API_URL/content/discounts/{id}`, valida sede + estado activo + vigencia. Renderiza con `get_header()` + WP_Query + `wc_get_template_part('content','product')` + `get_footer()`.
- **`separatas_shortcode($atts)`** — carrusel de imágenes + grilla de productos paginada. Lightbox modal para ampliar imagen.

### G. `includes/class-diagnostics.php`

- **`endpoint_diagnostics()`** — GET `/diagnostico`. **Estrictamente solo lectura**. Devuelve:
  - Versión del plugin
  - URL de la API externa
  - Host detectado
  - Sede detectada + mapa completo
  - Test directo a `MERKAHORRO_API_URL/content/banners?section=home_tiles` con status y body
  - Conteo de banners por sección + sus IDs/títulos
  - Estado de shortcodes registrados
  - Último hash de sync (`merkahorro_last_discount_sync_hash`)

### H. `includes/class-logger.php`

- **`log($message, $level)`** — escribe en `debug.log` **solo si `WP_DEBUG === true`**. No genera logs en producción salvo que se active explícitamente.
- **`log_api_call($endpoint, $details)`** — log enriquecido con endpoint, sede actual, IP del cliente y detalles serializados.

### I. `includes/wdr-helper.php`

Función pura `merkahorro_build_wdr_rule($rule, $separata_exclude_ids)`. Traduce una regla del Gestor al esquema de fila de `wp_wdr_rules`:

- `discount_type` del Gestor → `wdr_discount_type` (`percentage` / `flat` / `fixed_price`)
- `schedule_type=days` → `conditions.order_days`
- `schedule_type=date_range` → `date_from` / `date_to` como timestamps en zona horaria de Bogotá
- `schedule_type=cart_condition` → `conditions.cart_subtotal`
- Si la regla aplica "all_products" y `priority > 5`, agrega filtro `not_in_list` con los IDs de separatas (para que las semanales no pisen las separatas)
- `advanced_discount_message` con la configuración del badge (color, texto, fondo)

---

## 6. Flujo end-to-end de una promoción

```text
1. Usuario crea regla en el Gestor (gestor-ecommerce/components/DiscountManager.jsx)
   ↓
2. POST /api/content/discounts → Supabase (tabla discount_rules)
   ↓
3. Usuario clic "Sincronizar con WP"
   ↓
4. Frontend → POST /wp-json/merkahorro/v1/sync-discount-rules en CADA sede seleccionada
   ↓
5. Plugin valida hash MD5. Si no cambió, responde "skipped".
   Si cambió, escribe en wp_wdr_rules con prefijo [MK-Gestor].
   ↓
6. (Solo value_discount con date_range) Backend Vercel también aplica
   sale_price + date_on_sale_from/to nativos en WooCommerce
   vía /api/content/discounts/apply-value-discounts.
   ↓
7. Cron diario Vercel /api/cron/apply-scheduled corre 6:00 UTC (1:00 AM Colombia)
   y activa reglas con date_start = hoy.
   ↓
8. Plugin FlyCart aplica las reglas de wdr_rules en checkout/listings.
   Plugin Merkahorro:
     - Muestra el badge si advanced_discount_message.display=1
     - Sirve /promo/descuento/{id}/ con el listado paginado de la promo
     - Excluye productos de separatas de /ofertas/
```

---

## 7. Puntos críticos para producción

### 7.1. Requisitos indispensables al instalar

1. **Eliminar el MU-plugin antiguo:** `wp-content/mu-plugins/merkahorro-banners.php` **debe ser borrado o renombrado** (ej. `.bak`). Si coexisten, WordPress arroja Fatal Error por redeclaración de `merkahorro_get_current_sede()`.
2. **Limpiar OPcache + LiteSpeed** después de instalar.
3. **Verificar plugins requeridos:**
   - WooCommerce
   - Flycart Discount Rules (WDR) → tabla `wp_wdr_rules`
4. **Permalinks:** el hook de activación ya hace `flush_rewrite_rules()`, así que `/promo/descuento/{id}/` funciona desde el primer momento. Si se modifica manualmente la rule, ir a *Ajustes → Enlaces permanentes → Guardar*.

### 7.2. Fixes aplicados en esta versión (2.1)

Respecto al MU-plugin viejo y a la versión 2.0:

- ✅ `litespeed_purge_all` y `wp_cache_flush` solo viven en `emergency_global_purge` (manual)
- ✅ `/diagnostico` es 100% solo lectura
- ✅ `/clear-cache` es POST y selectivo
- ✅ TTL de banners subido a 1 hora
- ✅ `sslverify => true` en todas las llamadas a la API externa
- ✅ Validación por hash MD5 antes de escribir reglas
- ✅ `merkahorro_get_current_sede()` valida `$_GET['sede']` y cookies contra el mapa
- ✅ `flush_rewrite_rules` automático en activación/desactivación
- ✅ DELETE masivo de reglas requiere `delete_all=true` explícito
- ✅ Payload vacío en sync requiere `sync_empty=true` explícito
- ✅ Cache transient en `/wp-banners` (15 min) y `/woo-discount-rules` (5 min)
- ✅ `get_rules` ya no usa `SELECT *` — solo las columnas necesarias

### 7.3. Deuda técnica pendiente

Estos puntos NO bloquean producción pero deben atacarse:

| Pendiente | Detalle | Prioridad |
|-----------|---------|-----------|
| API key hardcoded en frontend JS | `services.js` línea 251 y `DiscountManager.jsx` línea 172 incluyen `key=merkahorro2026` en URLs. Cualquiera con DevTools la lee. **Migrar a llamadas vía backend Vercel** (con la key en env del servidor). | Alta |
| Rate limit por endpoint | No hay throttling. Si un cliente abusa de `/sync-discount-rules` puede saturar. Implementar transient `merkahorro_ratelimit_<ip>_<endpoint>`. | Media |
| CSS/JS inline en shortcodes | `class-banners.php` y `class-separatas.php` imprimen `<style>` y `<script>` dentro del HTML. Extraer a `assets/css/` y `assets/js/`, cargar con `wp_enqueue_style/script`. | Media |
| Logger sin duración ni resultado | `log_api_call` no mide `microtime` ni guarda resultado final. Útil para detectar endpoints lentos. | Baja |
| Modo pausa | Toggle en wp-admin para pausar sincronizaciones sin desactivar el plugin (útil en mantenimiento). | Baja |

---

## 8. Pruebas en staging

### 8.1. Entornos

| Sede | Staging (servernis.com) | Producción (supermercadomerkahorro.com) |
|------|-------------------------|------------------------------------------|
| Principal (PV001) | `https://servernis.com` | `https://supermercadomerkahorro.com` |
| Girardota (00301) | `https://girardota.servernis.com` | `https://girardota.supermercadomerkahorro.com` |
| Barbosa (00701) | `https://barbosa.servernis.com` | `https://barbosa.supermercadomerkahorro.com` |
| Villahermosa (00201) | `https://villahermosa.servernis.com` | `https://villahermosa.supermercadomerkahorro.com` |

> ⚠️ Si se prueba en `servernis.com`, el `MERKAHORRO_SEDE_MAP` por defecto **no mapea esos dominios**. Opciones:
> - Forzar sede con `?sede=PV001` en la URL (ya válida porque el código está en el mapa de valores)
> - Sobrescribir `MERKAHORRO_SEDE_MAP` en `wp-config.php` para incluir los dominios de staging

### 8.2. Checklist de smoke test

Para cada sede de staging:

```text
[ ] 1. Plugin activado en wp-admin/plugins.php sin errores fatales
[ ] 2. GET /wp-json/merkahorro/v1/diagnostico?key=merkahorro2026
       → 200, version=2.1, sede_detectada con el código correcto
[ ] 3. GET /wp-json/merkahorro/v1/wp-banners?key=merkahorro2026
       → 200, total > 0 (verifica RevSlider, categories, media)
[ ] 4. GET /wp-json/merkahorro/v1/woo-discount-rules?key=merkahorro2026
       → 200, data = []  (si aún no hay reglas sincronizadas)
[ ] 5. Crear una regla de prueba en el Gestor con priority=10, days=hoy
[ ] 6. Click "Sincronizar con WP" en el Gestor
       → Verificar mensaje OK con conteo correcto
[ ] 7. Repetir GET /woo-discount-rules → ahora data tiene la regla
[ ] 8. Verificar en wp-admin/admin.php?page=woo-discount-rules
       que aparece "[MK-Gestor] <título>"
[ ] 9. Visitar un producto que matchee la regla → ver descuento aplicado
[ ] 10. Crear regla value_discount con date_range futuro → verificar
        que en WP el producto tiene date_on_sale_from sin sale_price visible aún
[ ] 11. Visitar /promo/descuento/{id}/ → ver hero + grilla + filtros
[ ] 12. DELETE /sync-discount-rules sin params → debe responder 400
[ ] 13. DELETE /sync-discount-rules?delete_all=true → 200, reglas eliminadas
[ ] 14. POST /sync-discount-rules con array vacío → 400
[ ] 15. POST /sync-discount-rules con array vacío y sync_empty=true → 200, todo borrado
```

### 8.3. Endpoints para diagnóstico rápido (curl)

```bash
# Diagnóstico
curl -s "https://servernis.com/wp-json/merkahorro/v1/diagnostico?key=merkahorro2026" | jq

# Inventario de banners
curl -s "https://servernis.com/wp-json/merkahorro/v1/wp-banners?key=merkahorro2026" | jq '.total'

# Reglas actuales
curl -s "https://servernis.com/wp-json/merkahorro/v1/woo-discount-rules?key=merkahorro2026" | jq '.data | length'

# Forzar bypass de cache
curl -s "https://servernis.com/wp-json/merkahorro/v1/woo-discount-rules?key=merkahorro2026&fresh=true" | jq

# Purga selectiva de transients merkahorro_*
curl -s -X POST "https://servernis.com/wp-json/merkahorro/v1/clear-cache?key=merkahorro2026" | jq
```

---

## 9. Changelog

### 2.1 (2026-05-20)
- Validación de sede contra `MERKAHORRO_SEDE_MAP` en querystring y cookies
- Hook de activación con `flush_rewrite_rules` automático
- DELETE de reglas requiere `delete_all=true` explícito
- POST de reglas con payload vacío requiere `sync_empty=true` explícito
- Cache transient en `/wp-banners` (15 min) y `/woo-discount-rules` (5 min)
- `get_rules` proyecta solo las columnas necesarias en lugar de `SELECT *`
- Invalidación coordinada de cachés propias al sincronizar o borrar
- Documentación corregida: namespace real `merkahorro/v1`, archivos reales (`class-api.php`, `class-logger.php`, `wdr-helper.php`)

### 2.0
- Migración de MU-plugin a plugin estándar
- Modularización en `includes/`
- Logger condicional
- Hash MD5 para evitar escrituras redundantes
