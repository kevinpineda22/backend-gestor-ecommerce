# Documentación del Plugin: Merkahorro EcomManager Bridge

## 1. Propósito General
Este plugin reemplaza al antiguo archivo monolítico `merkahorro-banners.php` (MU-plugin). Su objetivo principal es conectar tu WooCommerce con el sistema externo EcomManager (Supabase), permitiendo la sincronización de banners, reglas de descuento y separatas, pero **resolviendo los problemas críticos de rendimiento** (borrados masivos de caché y escrituras excesivas en la base de datos).

## 2. Estructura de Archivos
El plugin ahora es modular. Se encuentra en la carpeta `wp-content/plugins/merkahorro-ecommanager-bridge/` y tiene la siguiente estructura:

```text
merkahorro-ecommanager-bridge/
├── merkahorro-ecommanager-bridge.php  (Archivo Principal)
└── includes/
    ├── class-api-endpoints.php        (Rutas de la API)
    ├── class-banners.php              (Shortcodes de Banners y Tiles)
    ├── class-cache-manager.php        (Gestión inteligente de caché)
    ├── class-diagnostics.php          (Diagnóstico del sistema)
    ├── class-discount-sync.php        (Sincronización de reglas FlyCart)
    └── class-separatas.php            (Shortcode Separatas y URLs de Promoción)
```

---

## 3. Detalle de Archivos y Funciones Clave

### A. `merkahorro-ecommanager-bridge.php` (Archivo Principal)
Es el motor de arranque del plugin.
*   **Qué hace:** Define las constantes de seguridad (como la API Key `MERKAHORRO_API_KEY`), carga todos los archivos de la carpeta `includes/` y arranca las clases.
*   **Funciones principales:**
    *   `merkahorro_get_current_sede()`: Detecta en qué "sede" (subdominio o entorno) se encuentra el usuario para cargar los datos correctos. Incluye un bloqueador (`function_exists`) para evitar errores fatales si el viejo MU-plugin no se ha borrado correctamente.

### B. `includes/class-api-endpoints.php`
Controla todas las puertas de entrada para que EcomManager se comunique con tu WordPress.
*   **Qué hace:** Registra las rutas REST API personalizadas bajo el prefijo `wp-json/ecommanager/v1/`.
*   **Rutas que maneja:**
    *   `POST /sync-discount-rules`: Recibe reglas de descuento.
    *   `POST /banners`: Recibe datos de sliders y cuadros (tiles).
    *   `POST /banners/separatas`: Recibe datos de las separatas.
    *   `POST /clear-cache`: Petición manual para limpiar caché específica.
    *   `GET /diagnostico`: Muestra el estado del sistema.
*   **Seguridad:** Valida que todas las peticiones POST incluyan el header `X-API-Key`.

### C. `includes/class-cache-manager.php`
El escudo protector del rendimiento de tu servidor.
*   **Qué hace:** Reemplaza los destructivos `wp_cache_flush()` y `litespeed_purge_all()`. Solo borra lo estrictamente necesario.
*   **Funciones principales:**
    *   `purge_banners_cache()`: Borra solo el *transient* (caché temporal de base de datos) de los banners y le dice a LiteSpeed que purgue solo las URLs de la página de inicio o donde estén los shortcodes, sin tocar el resto de la web.
    *   `purge_separatas_cache()`: Purga solo la caché relacionada con las separatas.

### D. `includes/class-discount-sync.php`
El gestor de descuentos de WooCommerce (Integración con FlyCart Discount Rules).
*   **Qué hace:** Recibe el JSON complejo desde EcomManager, lo traduce al formato de la base de datos de FlyCart (`wp_wdr_rules`) y gestiona las variaciones de productos.
*   **El gran cambio de rendimiento:**
    *   Implementa una **Validación por Hash (MD5)**. Antes de procesar nada, convierte los datos entrantes en una firma única (hash) y la compara con la firma de la última sincronización.
    *   **Si es igual:** Responde "Ignorado, no hay cambios" (Costo de CPU y MySQL = casi 0).
    *   **Si es diferente:** Procesa las reglas, borra la caché de productos afectados y actualiza la firma hash.

### E. `includes/class-separatas.php`
El archivo más visual y complejo en el Frontend.
*   **Qué hace:** Maneja el shortcode `[merkahorro_separatas]` y genera las URLs dinámicas de promociones.
*   **Componentes:**
    *   **Shortcode:** Genera el HTML del carrusel de separatas e inyecta el CSS y Javascript (Swiper/Slick) necesario para que se muevan y abran en modo "Lightbox" (ventana modal emergente).
    *   **URLs Dinámicas (`/promo/descuento/{id}/`):** Intercepta estas URLs para que no den error 404. Si alguien entra ahí, genera una página de WooCommerce utilizando el archivo `archive-product.php` de tu tema. Esto asegura que la barra lateral (sidebar) de filtros de WooCommerce siga funcionando perfectamente sin necesidad de usar plantillas de un maquetador como Elementor.

### F. `includes/class-banners.php`
Maneja los elementos visuales básicos.
*   **Qué hace:** Registra los shortcodes `[merkahorro_slider]` (el carrusel principal) y `[merkahorro_tiles]` (la cuadrícula de banners).
*   Lee los datos desde las variables almacenadas en caché (`transients`) para cargar extremadamente rápido sin consultar la base de datos externa en cada visita.

### G. `includes/class-diagnostics.php`
El panel de control técnico.
*   **Qué hace:** Gestiona el endpoint `/diagnostico` (solo lectura). Al visitarlo, devuelve información vital: versión de PHP, estado de WooCommerce, LiteSpeed, si Flycart está activo, y las claves MD5 actuales para saber cuándo fue la última vez que EcomManager se sincronizó con éxito.

---

## 4. Puntos Críticos para el Paso a Producción

Para que todo este sistema funcione perfectamente cuando lo subas, debes asegurarte de cumplir estos **2 requisitos indispensables**:

1.  **Eliminar el código antiguo:** El archivo `wp-content/mu-plugins/merkahorro-banners.php` **debe ser eliminado o renombrado** (ej. a `merkahorro-banners.php.bak`). Si ambos coexisten, WordPress arrojará un "Fatal Error" porque ambos intentarán crear la función `merkahorro_get_current_sede()`.
2.  **Limpiar la RAM del Servidor:** Una vez borrado el archivo viejo y activado el nuevo plugin, **debes limpiar OPcache desde tu servidor/panel de hosting** y vaciar toda la caché de LiteSpeed para que WordPress olvide la estructura antigua.