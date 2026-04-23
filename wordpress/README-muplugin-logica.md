# merkahorro-banners.php — Documentación completa de lógica

> Archivo vivo. Actualizar cuando cambien funciones o comportamientos.  
> Última revisión: 20 de abril 2026

---

## ¿Qué es este archivo?

`merkahorro-banners.php` es el **único mu-plugin** instalado en todos los WordPress de Merkahorro.  
Se ubica en `wp-content/mu-plugins/` y se carga automáticamente — no necesita activación.

Concentra en un solo archivo:
- Banners/sliders/tiles desde Supabase
- Sincronización de reglas de descuento hacia FlyCart (Discount Rules for WooCommerce)
- Página dinámica de promociones `/promo/descuento/{id}/`
- Shortcode `/ofertas-especiales/` con productos de separata
- Badge de oferta personalizado
- Exclusión de productos separata en la página `/ofertas/`

---

## Configuración global

| Constante | Valor por defecto | Descripción |
|---|---|---|
| `MERKAHORRO_API_URL` | `https://backend-gestor-ecommerce.vercel.app/api` | URL del backend (Vercel) |
| `MERKAHORRO_API_KEY` | `merkahorro2026` | API key para endpoints protegidos |
| `MERKAHORRO_CACHE_TTL` | `300` (5 min) | Duración del caché de banners en segundos |
| `MERKAHORRO_SEDE_MAP` | JSON con subdominios | Mapeo subdominio → código de sede |

Para sobrescribir en producción: definir en `wp-config.php`:
```php
define('MERKAHORRO_API_KEY', 'clave-segura');
```

---

## Sedes y subdominios

| Subdominio | Código sede | Nombre |
|---|---|---|
| `supermercadomerkahorro.com` | `PV001` | Copacabana Plaza |
| `girardota.supermercadomerkahorro.com` | `00301` | Girardota |
| `barbosa.supermercadomerkahorro.com` | `00701` | Barbosa |
| `villahermosa.supermercadomerkahorro.com` | `00201` | Villahermosa |

---

## Funciones principales

### `merkahorro_get_sede()`
Detecta la sede activa del WordPress actual.  
**Prioridad**: query param `?sede=` → subdominio → cookie → `PV001` por defecto.

### `merkahorro_is_dev_sede()`
Retorna `true` si la sede es `00201` (Villahermosa).  
Se usa como "feature flag" para funcionalidades que se están validando antes de expandir a todas las sedes (ej. exclusión de separatas en `/ofertas/`).

### `merkahorro_check_api_key($request)`
Valida el header `X-API-Key` o query param `?key=` en los endpoints REST.  
Compara contra `MERKAHORRO_API_KEY`.

---

## Endpoints REST registrados (`/wp-json/merkahorro/v1/`)

### `GET /banners`
Retorna los banners activos para la sede actual.  
Con caché de 5 minutos en `wp_options` (transients).

### `GET /woo-discount-rules`
Retorna las reglas de descuento activas de la sede actual desde Supabase.

### `POST /sync-discount-rules`
**El endpoint más importante del sistema de descuentos.**

Recibe un array de reglas desde el Gestor y las escribe en la tabla `wp_wdr_rules` de FlyCart.

**Flujo:**
1. Obtiene las reglas existentes del Gestor (las que tienen prefijo `[MK-Gestor]`)
2. Por cada regla recibida: si ya existe → UPDATE, si no → INSERT
3. Elimina reglas del Gestor que ya no estén en el listado (borrado lógico)
4. Limpia caché de FlyCart + transients de precios de variaciones de WooCommerce

**Lógica de exclusión para evitar stacking:**  
Antes de procesar, calcula qué IDs de producto están en reglas separata (priority ≤ 5).  
Las reglas semanales (priority > 5) reciben un filtro `not_in_list` con esos IDs — así nunca coinciden con productos ya cubiertos por separata.

### `DELETE /sync-discount-rules`
Elimina todas las reglas `[MK-Gestor]` de FlyCart (limpieza total).

### `POST /content/banners`, `PUT /content/banners/{id}`, etc.
Endpoints de gestión de contenido (banners, separatas). Documentados en el plugin pero de menor relevancia operativa diaria.

---

## Función `merkahorro_build_wdr_rule($rule, $separata_exclude_ids)`

Convierte una regla del Gestor (formato Supabase) al formato de la tabla `wp_wdr_rules` de FlyCart.

### Campos clave del array resultado

| Campo | Valor | Por qué |
|---|---|---|
| `exclusive` | `'1'` si priority ≤ 5, `'0'` si priority > 5 | Las separatas bloquean el semanal en sus productos. Las semanales no bloquean entre sí |
| `apply_as` | `'sale_price'` | Hace visible el descuento en el listado (precio tachado + badge). Si fuera `'first_matched_rule'` solo aplica en carrito |
| `date_from` / `date_to` | timestamp UTC calculado desde zona horaria de WP | Se usa `DateTimeZone` con la zona configurada en WordPress para no desfasar 5h (Colombia = UTC-5) |

### Por qué `apply_as: sale_price` y no `first_matched_rule`

- `first_matched_rule`: FlyCart aplica el descuento solo en el carrito. El precio en el listado de productos NO se ve rebajado. No hay badge "Oferta del X%", no hay precio tachado.
- `sale_price`: FlyCart modifica el precio visible en catálogo. Los clientes ven el precio rebajado y el badge antes de agregar al carrito.

### Por qué `exclusive: 1` solo en separatas

FlyCart evalúa `exclusive` a nivel de **carrito completo** cuando `apply_as = first_matched_rule`.  
Con `apply_as = sale_price`, `exclusive = 1` actúa a nivel de producto: si la regla separata aplica a un producto, bloquea las demás reglas para ESE producto solamente.

Esto significa:
- Aguacate (separata 35%, priority 1, exclusive=1) → la regla semanal no le suma su % ✅
- Flips (separata 25%, priority 2, exclusive=1) → la regla semanal no le suma su % ✅
- Arroz (no en separata) → la regla semanal SÍ aplica su % ✅
- Un cliente con frutas + Flips en el carrito → cada producto aplicó su propia regla exclusiva, sin que una bloquee a la otra ✅

---

## Lógica de prioridades

| Priority | Tipo | `exclusive` | Descripción |
|---|---|---|---|
| 1–5 | **Separata** | `1` | Reglas semanales especiales (separatas físicas). Bloquean semanal en sus productos |
| > 5 | **Semanal** | `0` | Descuentos normales de la semana. Tienen filtro `not_in_list` con IDs de separata |

### Cómo el Gestor marca una regla como separata
En el DiscountManager, el campo `priority` se define al crear la regla. Una regla con `priority ≤ 5` es tratada como separata por todo el sistema.

---

## Shortcode `[merkahorro_separatas]`

Usado en la página `/ofertas-especiales/`.

**Qué muestra:**
1. Hero con título "OFERTAS ESPECIALES"
2. Grilla de productos de reglas separata activas + paginación
3. Carousel de flyers/imágenes de separata

**Función helper: `merkahorro_get_separata_rule_ids()`**  
Consulta `wp_wdr_rules` para obtener qué productos/categorías están en reglas separata activas HOY.

Filtros de la query:
- `title LIKE '[MK-Gestor] %'` → solo reglas del Gestor
- `enabled = 1` → solo activas
- `priority ≤ 5` → solo separatas
- `date_from ≤ NOW` → ya comenzó
- `date_to ≥ NOW` → todavía no ha expirado

**Caché:** 5 minutos en transient `mks_separata_ids_v1`. Al sincronizar reglas, el caché se limpia automáticamente.

> ⚠️ Los timestamps de `date_from`/`date_to` están en UTC. La query usa `time()` (UTC del servidor) para comparar — esto es correcto desde la corrección del 20 abril 2026.

---

## Página dinámica `/promo/descuento/{id}/`

URL de ejemplo: `https://villahermosa.supermercadomerkahorro.com/promo/descuento/5/`

**Cómo funciona:**
1. Un rewrite rule convierte la URL a `?merkahorro_promo_id=5`
2. El hook `template_redirect` intercepta antes de renderizar
3. Consulta la regla con ID 5 en `wp_wdr_rules`
4. Muestra los productos de esa regla con filtros, paginación y sidebar

**Paginación:** Usa `paginate_links()` con `add_query_arg('paged', '%#%')` — NO usa `woocommerce_pagination()` porque el rewrite custom rompe `get_pagenum_link()`.

**Ordenar por:** El `<form>` tiene `action` explícito con `strtok($_SERVER['REQUEST_URI'], '?')` para no perder la URL de rewrite al hacer submit.

**Título de pestaña:** Se inyecta via `document_title_parts` filter, quitando el prefijo `[MK-Gestor]`.

---

## Badge de oferta `.onsale`

WooCommerce muestra un badge `.onsale` en productos con `sale_price` seteado.

**Dos tipos de badge en el sitio:**

| Tipo | Quién lo genera | HTML | Diseño |
|---|---|---|---|
| Porcentaje | FlyCart (AWDR) | `<span class="onsale">Oferta del 35%</span>` | Verde lima sobre azul oscuro (FlyCart) |
| Valor fijo | Nuestro filter | `<span class="onsale mks-fixed-sale">Oferta Separata</span>` | Azul `#160857` con texto `#88dc00` |

**Nuestro filter (`woocommerce_sale_flash`, prioridad 999):**
- Si el HTML ya contiene `%` → FlyCart lo manejó → retornar sin tocar
- Si no tiene `%` → producto con descuento por valor fijo (sale_price directo) → reemplazar con nuestro badge

**CSS:** Solo apuntamos a `.mks-fixed-sale` para no interferir con el badge de FlyCart.

---

## Limpieza de caché al sincronizar

Después de cada sync de reglas, el endpoint limpia:

1. `wdr_transient_version` — versión de caché de FlyCart
2. `_transient_wdr_*` y `_transient_timeout_wdr_*` — transients de FlyCart
3. `_transient_wc_var_prices_*` — caché de precios de variaciones de WooCommerce (crucial para productos variables con sale_price de FlyCart)
4. `wc_products_onsale` — lista de productos en oferta cacheada por WooCommerce
5. `wc_var_prices_version` — incrementar fuerza recálculo de rangos de precio

Sin limpiar el punto 3, los productos variables (con variaciones Kg/Lb) muestran el rango de precio sin descuento aunque la regla FlyCart esté activa.

---

## Estado actual del sistema (20 abril 2026)

### ✅ Funcionando
- Sync de reglas → FlyCart con `apply_as: sale_price`
- Exclusión de stacking: separatas exclusive=1, semanales exclusive=0 + not_in_list
- Paginación en `/promo/descuento/` y `/ofertas-especiales/`
- Badge "Oferta Separata" en productos de valor fijo
- Badge "Oferta del X%" de FlyCart intacto para reglas de porcentaje
- Fechas de expiración con zona horaria correcta (UTC corregido con DateTimeZone)
- Productos desaparecen de `/ofertas-especiales/` cuando vence la fecha de la regla
- Título limpio en pestaña de `/promo/descuento/`
- Ordenar por no redirige al inicio

### ⚠️ Pendiente / A verificar
- Las reglas ya existentes en la BD de FlyCart necesitan re-sincronización cada vez que se actualiza el mu-plugin para heredar los nuevos parámetros (`apply_as`, `exclusive`, timestamps de zona horaria)
- Validar comportamiento en sedes Copacabana, Girardota y Barbosa (actualmente solo Villahermosa tiene el feature flag activo para separatas)

### 🔧 Próximos pasos sugeridos
- Extender `merkahorro_is_dev_sede()` a todas las sedes cuando se valide el diseño de `/ofertas-especiales/`
- Revisar si `database_discounts_upgrade.sql` ya fue ejecutado en Supabase (agrega columnas `priority`, `cart_condition_type`, `cart_condition_value`)

---

## Flujo completo: desde el Gestor hasta el cliente

```
1. Admin crea/edita regla en DiscountManager (React)
        ↓
2. Guarda en Supabase (tabla ecommerce_discount_rules)
        ↓
3. Admin hace "Sincronizar WP" en el Gestor
        ↓
4. POST /wp-json/merkahorro/v1/sync-discount-rules
        ↓
5. merkahorro_build_wdr_rule() convierte al formato FlyCart
   - apply_as: sale_price
   - exclusive: 1 si separata, 0 si semanal
   - date_from/date_to en UTC correcto
   - Reglas semanales con filtro not_in_list de IDs separata
        ↓
6. Upsert en wp_wdr_rules + limpieza de caché
        ↓
7. Cliente carga una página de productos
        ↓
8. FlyCart evalúa reglas por producto:
   - Si está en separata → aplica separata (exclusive bloquea semanal en ese producto)
   - Si no está en separata → aplica semanal (not_in_list lo garantiza)
        ↓
9. WooCommerce muestra precio tachado + badge "Oferta del X%"
```
