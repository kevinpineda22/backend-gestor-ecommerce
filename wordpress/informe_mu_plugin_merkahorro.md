# Informe técnico: impacto de rendimiento del MU-plugin `merkahorro-banners.php`

**Sitio:** Red WordPress / WooCommerce Merkahorro  
**Archivo analizado:** `wp-content/mu-plugins/merkahorro-banners.php`  
**Contexto:** Red con varias sedes, WooCommerce, LiteSpeed Cache, ERP/API externa, descuentos, banners, separatas y módulos administrados desde un sistema externo.

---

## 1. Conclusión ejecutiva

El archivo `merkahorro-banners.php` no es solamente un plugin de banners. En la práctica funciona como una **capa de integración administrativa externa** entre el sistema EcomManager/Gestor Ecommerce y WordPress/WooCommerce.

El MU-plugin interviene en:

- banners y sliders;
- tiles promocionales;
- separatas;
- rutas dinámicas tipo página;
- API REST propia;
- reglas de descuento de FlyCart / Discount Rules;
- caché de WordPress;
- caché de objetos;
- LiteSpeed Cache;
- Elementor;
- WP Rocket si existe;
- RevSlider;
- WooCommerce;
- categorías de productos;
- media library;
- transients;
- base de datos.

El problema principal no es solo que sea MU-plugin. El problema real es que mezcla muchas responsabilidades en un solo archivo y ejecuta operaciones agresivas, especialmente:

```text
wp_cache_flush()
do_action('litespeed_purge_all')
DELETE masivos sobre transients
limpieza de caché de Elementor
limpieza de caché de precios variables WooCommerce
escritura directa en tablas de descuentos
consultas directas a tablas de plugins
```

En una tienda WooCommerce con varias sedes, ERP externo y LiteSpeed, este comportamiento puede generar picos altos de CPU, MySQL e I/O, especialmente si el sistema externo llama estos endpoints varias veces al día o varias veces por hora.

**Conclusión principal:**  
Si cada vez que se actualiza este MU-plugin empeora el rendimiento, la sospecha es técnicamente válida. El archivo debe dejar de crecer como MU-plugin y convertirse en un plugin normal, modular, con control de caché selectivo, logs, modo pausa y validación de cambios antes de escribir o purgar.

---

## 2. Explicación para personas no técnicas

Un sitio WordPress usa caché para no tener que calcular todo desde cero en cada visita. WooCommerce también guarda información temporal sobre productos, precios, descuentos, categorías, variaciones y consultas.

Este MU-plugin recibe información de un sistema externo y luego, en varios puntos, borra cachés de forma amplia. Cuando eso pasa, el sitio tiene que volver a construir todo:

```text
Se borra caché
→ WooCommerce recalcula productos/precios/descuentos
→ LiteSpeed vuelve a crear páginas cacheadas
→ Elementor puede regenerar archivos
→ FlyCart recalcula descuentos
→ la base de datos trabaja más
→ el sitio se vuelve lento
```

Si esto ocurre de vez en cuando, puede ser aceptable. Si ocurre constantemente, el sitio puede quedar pesado o innavegable.

---

## 3. Por qué el consumo puede subir aunque haya menos productos

Reducir productos debería ayudar al rendimiento en estado estable. Sin embargo, si al mismo tiempo el sistema externo o el MU-plugin está limpiando caché, sincronizando descuentos y forzando recálculos, el consumo puede subir.

Ejemplo del ciclo problemático:

```text
El gestor externo actualiza banners/descuentos/separatas
→ llama un endpoint del MU-plugin
→ el MU-plugin borra transients
→ vacía object cache
→ purga todo LiteSpeed
→ limpia caché de Elementor
→ WooCommerce recalcula precios/productos
→ FlyCart recalcula descuentos
→ la tienda reconstruye caché
→ el gestor vuelve a consultar o sincronizar
→ el ciclo se repite
```

Por eso, aunque haya menos productos, el sitio puede consumir más recursos si está en un ciclo permanente de borrado y reconstrucción.

---

## 4. Lista de plugins, áreas y sistemas que interviene

| Área / plugin / sistema | Cómo lo toca el MU-plugin | Riesgo de rendimiento |
|---|---|---|
| WordPress Core | Carga como MU-plugin, registra shortcodes, endpoints REST, transients, rewrite rules y hooks | Se carga siempre, no se puede pausar desde el panel |
| REST API de WordPress | Crea endpoints bajo `/wp-json/merkahorro/v1/` | Si el sistema externo los llama mucho, aumenta consumo |
| WooCommerce | Consulta productos, categorías, loops, badges, precios variables y transients de WooCommerce | Puede forzar recálculos de catálogo, descuentos y precios |
| LiteSpeed Cache | Ejecuta `litespeed_purge_all` | Purga global; obliga a reconstruir caché completo |
| Elementor | Ejecuta limpieza de caché de archivos de Elementor | Puede regenerar CSS/archivos y sumar I/O |
| WP Rocket | Llama `rocket_clean_domain()` si existe | Limpieza global de caché de página |
| Object Cache / Redis / Memcached | Ejecuta `wp_cache_flush()` | Borra caché de objetos de todo el sitio |
| FlyCart / Discount Rules / AWDR | Lee y escribe directamente en `wdr_rules` | Recalcula descuentos y limpia cachés relacionados |
| RevSlider | Lee tablas `revslider_sliders` y `revslider_slides` | Consultas directas a base de datos |
| Media Library | Busca attachments/imágenes promocionales | Puede ser pesado si se consulta frecuentemente |
| Categorías WooCommerce | Lee términos, thumbnails y enlaces de categorías | Afecta consultas de taxonomías/productos |
| Base de datos `options` | Borra transients por SQL directo | Puede generar carga fuerte en tablas grandes |
| Sistema externo EcomManager / Gestor | Recibe y responde llamadas de sincronización/diagnóstico/cache | Si no hay control de frecuencia, puede saturar la web |
| HUSKY / filtros de productos | No necesariamente lo toca directo, pero al purgar caché y recalcular catálogo puede afectarlo indirectamente | Puede obligar a recalcular filtros y consultas de productos |
| Action Scheduler / WP-Cron | No necesariamente lo llama directo, pero sus cambios pueden provocar tareas internas de WooCommerce | Puede aumentar colas pendientes tras cambios de productos/descuentos |

---

## 5. Qué hace actualmente y cuál es el problema

### 5.1. Se carga como MU-plugin

**Qué ejecuta:**  
El archivo se instala en:

```text
wp-content/mu-plugins/merkahorro-banners.php
```

Los MU-plugins se cargan automáticamente. No se activan ni desactivan desde el panel normal de WordPress.

**Qué está mal:**  
Un archivo con tanta lógica crítica no debería vivir como MU-plugin permanente. Si una versión nueva sale defectuosa, queda activa de inmediato y no se puede apagar desde el panel.

**Cómo debería estar hecho:**  
Debe convertirse en un plugin normal, por ejemplo:

```text
Merkahorro EcomManager Bridge
```

Así se puede activar, desactivar, pausar, auditar y configurar desde WordPress.

---

### 5.2. Define una caché muy corta de 5 minutos

**Qué ejecuta:**

```php
MERKAHORRO_CACHE_TTL = 300;
```

Eso significa que la caché de banners dura 5 minutos.

**Qué está mal:**  
Para banners, tiles y separatas, 5 minutos puede ser demasiado poco en producción. Si hay tráfico en 4 sedes, el sitio consulta y reconstruye datos constantemente.

**Cómo debería estar hecho:**

```text
TTL recomendado: 1 hora o más.
Invalidar caché solo cuando el gestor realmente cambie contenido.
```

---

### 5.3. Consulta API externa y rompe caché intermedia con `t=time()`

**Qué ejecuta:**  
Cuando pide banners a la API externa, agrega un timestamp:

```text
&t=timestamp
```

**Qué está mal:**  
Esto evita que Vercel, proxies o capas externas puedan cachear correctamente la respuesta. Cada solicitud puede parecer única.

**Cómo debería estar hecho:**

```text
No usar t=time() en producción.
Usarlo solo en modo debug.
Usar caché por sede y sección.
```

---

### 5.4. Usa `sslverify => false`

**Qué ejecuta:**  
Varias llamadas externas usan:

```php
'sslverify' => false
```

**Qué está mal:**  
Desactiva la validación SSL. No es buena práctica de seguridad.

**Cómo debería estar hecho:**

```php
'sslverify' => true
```

Si hay problemas de certificado, se corrige el certificado, no se desactiva la validación.

---

### 5.5. Renderiza shortcodes con CSS y JS inline

**Qué ejecuta:**  
Crea shortcodes como:

```text
[merkahorro_slider]
[merkahorro_tiles]
[merkahorro_separatas]
```

Dentro del HTML imprime `<style>` y `<script>` directamente.

**Qué está mal:**  
No es el problema más grave, pero sí es mala arquitectura si se repite en varias páginas. Puede aumentar HTML, dificultar caché y duplicar código.

**Cómo debería estar hecho:**

```text
CSS en archivo .css.
JS en archivo .js.
Cargar con wp_enqueue_style() y wp_enqueue_script().
Inline solo para configuración mínima.
```

---

### 5.6. Precarga todas las imágenes del slider

**Qué ejecuta:**  
El slider precarga imágenes del carrusel.

**Qué está mal:**  
Precargar todas las imágenes puede subir el peso inicial de la home, especialmente si hay varios banners grandes.

**Cómo debería estar hecho:**

```text
Precargar solo la primera imagen.
Usar lazy loading para las demás.
Optimizar formatos y tamaños.
```

---

### 5.7. Endpoint `/clear-cache` limpia demasiado

**Qué ejecuta:**

```text
GET /wp-json/merkahorro/v1/clear-cache
```

Este endpoint hace:

```text
DELETE de transients propios
wp_cache_flush()
rocket_clean_domain()
litespeed_purge_all
Elementor files_manager->clear_cache()
```

**Qué está mal:**  
Este es uno de los puntos más graves. Una limpieza de caché propia termina haciendo limpieza global de varias capas.

Riesgos:

```text
Borra caché de objetos de todo el sitio.
Purga todo LiteSpeed.
Obliga a reconstruir páginas cacheadas.
Obliga a recalcular partes de WooCommerce.
Puede afectar 4 sedes si se ejecuta en red.
```

También está por método GET. Una acción que modifica o limpia no debería ejecutarse por GET.

**Cómo debería estar hecho:**

```text
Debe ser POST, no GET.
Debe limpiar solo caché propia.
No debe hacer purge all automático.
No debe hacer wp_cache_flush automático.
Debe tener rate limit.
Debe registrar logs.
Debe purgar solo URLs afectadas.
```

Ejemplo correcto:

```text
Si cambia banner de home → purgar solo home.
Si cambia separata → purgar solo página de separatas.
Si cambia descuento → purgar solo páginas/categorías afectadas.
```

---

### 5.8. Endpoint `/diagnostico` también borra caché

**Qué ejecuta:**

```text
GET /wp-json/merkahorro/v1/diagnostico
```

Antes de diagnosticar, borra transients y ejecuta `wp_cache_flush()`.

**Qué está mal:**  
Un diagnóstico no debe modificar el sitio. Si el sistema externo llama este endpoint para comprobar si la conexión funciona, puede estar borrando caché constantemente.

**Cómo debería estar hecho:**

```text
Diagnóstico debe ser solo lectura.
No debe borrar transients.
No debe purgar LiteSpeed.
No debe limpiar object cache.
Debe mostrar estado, no cambiar estado.
```

---

### 5.9. Endpoint `/wp-banners` consulta RevSlider, categorías y medios

**Qué ejecuta:**  
Lee:

```text
revslider_sliders
revslider_slides
product_cat
media library
attachments
```

**Qué está mal:**  
Leer estos datos no es malo por sí solo. El problema aparece si el panel externo lo consulta frecuentemente sin caché o sin paginación.

**Cómo debería estar hecho:**

```text
Cachear respuesta.
Usar TTL amplio.
Paginar resultados.
No escanear media library en cada consulta.
No usarlo como ping constante del panel externo.
```

---

### 5.10. Endpoint `/woo-discount-rules` lee reglas de FlyCart

**Qué ejecuta:**  
Consulta directamente la tabla:

```text
wdr_rules
```

Luego decodifica JSON de filtros, condiciones y descuentos.

**Qué está mal:**  
Puede ser pesado si se llama muchas veces o si hay muchas reglas. Además usa `SELECT *`.

**Cómo debería estar hecho:**

```text
Leer solo columnas necesarias.
Cachear respuesta.
Usar hash de versión.
Responder “sin cambios” si nada cambió.
```

---

### 5.11. Endpoint `/sync-discount-rules` escribe reglas directamente en FlyCart

**Qué ejecuta:**

```text
POST /wp-json/merkahorro/v1/sync-discount-rules
```

Hace:

```text
SELECT reglas existentes
INSERT / UPDATE / DELETE en wdr_rules
DELETE de transients wdr
DELETE de transients wc_var_prices
delete_transient('wc_products_onsale')
delete_option('woocommerce_cache_excluded_uris')
wp_cache_flush()
rocket_clean_domain()
litespeed_purge_all
```

**Qué está mal:**  
Este es otro punto crítico. Si el sistema externo sincroniza reglas aunque no hayan cambiado, el plugin puede escribir en base de datos y limpiar caché global sin necesidad.

Riesgos:

```text
Recalcula descuentos.
Recalcula precios variables.
Borra cachés importantes.
Purga LiteSpeed completo.
Aumenta consultas de WooCommerce.
Puede afectar filtros, categorías y listados.
```

También es delicado borrar:

```text
woocommerce_cache_excluded_uris
```

porque parece una opción real de caché/WooCommerce, no un transient simple.

**Cómo debería estar hecho:**

```text
Comparar hash del payload recibido.
Si no cambió nada, no escribir en DB.
Si no cambió nada, no limpiar caché.
Actualizar solo reglas afectadas.
Purgar solo páginas afectadas.
Nunca usar litespeed_purge_all automáticamente.
No borrar wc_var_prices globalmente salvo emergencia controlada.
No borrar opciones reales como si fueran caché temporal.
```

---

### 5.12. Endpoint DELETE puede eliminar todas las reglas del gestor

**Qué ejecuta:**

```text
DELETE /wp-json/merkahorro/v1/sync-discount-rules
```

Si no recibe título, puede eliminar todas las reglas con prefijo del gestor.

**Qué está mal:**  
Una eliminación masiva no debería depender de que falte un parámetro. Puede ocurrir por error de integración.

**Cómo debería estar hecho:**

```text
Requerir confirmación explícita: delete_all=true.
Registrar auditoría.
Restringir por IP/token.
No permitir eliminación masiva accidental.
```

---

### 5.13. Crea rutas dinámicas tipo página

**Qué ejecuta:**  
El archivo registra una ruta como:

```text
/promo/descuento/{id}
```

También usa `flush_rewrite_rules(false)` si la regla no existe.

**Qué está mal:**  
No está necesariamente mal crear rutas dinámicas. El problema es hacerlo dentro de un MU-plugin que también limpia caché y altera consultas. Además, los flush de rewrite rules deben manejarse con mucho cuidado.

**Cómo debería estar hecho:**

```text
Registrar rutas en activación del plugin normal.
Hacer flush solo al activar/desactivar, no en wp_loaded.
Controlar la plantilla desde un módulo separado.
```

---

### 5.14. Modifica badges de oferta WooCommerce

**Qué ejecuta:**  
Usa filtros como:

```text
woocommerce_sale_flash
wp_head
```

para cambiar el badge de oferta y meter CSS.

**Qué está mal:**  
No es el principal problema de rendimiento, pero sigue sumando lógica visual dentro del mismo archivo.

**Cómo debería estar hecho:**

```text
Separar en módulo frontend.
CSS en archivo propio.
Evitar inline CSS cuando no sea necesario.
```

---

## 6. Problemas de rendimiento que puede generar

### 6.1. Picos de MySQL

Causas probables:

```text
DELETE masivos sobre options/transients.
SELECT/UPDATE/DELETE en wdr_rules.
Consultas a RevSlider.
Consultas a media library.
Consultas a categorías de productos.
Consultas WooCommerce para productos/separatas.
```

### 6.2. Alto I/O de disco

Causas probables:

```text
Purga y regeneración de LiteSpeed.
Regeneración de archivos Elementor.
Escritura de logs.
Reconstrucción de cachés.
Operaciones MySQL grandes.
```

### 6.3. Aumento de CPU PHP

Causas probables:

```text
Render dinámico de shortcodes.
Decodificación de reglas JSON.
WP_Query de productos.
Cálculo de descuentos.
Llamadas externas.
Recreación de cachés.
```

### 6.4. Sitio más lento tras cada actualización del MU-plugin

Causas probables:

```text
El MU-plugin se carga siempre.
Las nuevas versiones entran activas inmediatamente.
No hay modo pausa.
No hay control de módulos.
No hay logs para saber qué endpoint golpea.
No hay rate limit.
No hay purga selectiva.
```

### 6.5. Caché que nunca se estabiliza

Causas probables:

```text
clear-cache borra caché global.
diagnostico borra caché.
sync-discount-rules borra caché global.
TTL de 5 minutos.
Purgas globales de LiteSpeed.
wp_cache_flush.
```

---

## 7. Qué está haciendo bien

No todo está mal. Algunas ideas son correctas:

```text
Detectar sede por subdominio.
Evitar iniciar WC()->session en visitas anónimas.
Usar transients para banners.
Separar datos por sede.
Usar shortcodes para insertar módulos.
Usar API key para proteger endpoints.
```

El problema es la forma en que se mezcló todo y el alcance de las limpiezas.

---

## 8. Qué debe cambiar urgentemente

Prioridad alta:

```text
1. Quitar litespeed_purge_all automático.
2. Quitar wp_cache_flush automático.
3. Hacer /diagnostico solo lectura.
4. Convertir clear-cache a POST y hacerlo selectivo.
5. Agregar rate limit por endpoint.
6. Agregar logs de llamadas externas.
7. Validar si los datos cambiaron antes de escribir.
8. Subir TTL de caché de banners/tiles/separatas.
9. Eliminar API key fallback hardcodeada.
10. Activar sslverify.
```

---

## 9. Cómo debería ser la arquitectura correcta

Nombre sugerido:

```text
Merkahorro EcomManager Bridge
```

Estructura sugerida:

```text
merkahorro-ecommanager-bridge/
├── merkahorro-ecommanager-bridge.php
├── includes/
│   ├── class-plugin.php
│   ├── class-sede-resolver.php
│   ├── class-api-auth.php
│   ├── class-cache-manager.php
│   ├── class-banners.php
│   ├── class-tiles.php
│   ├── class-separatas.php
│   ├── class-discount-sync.php
│   ├── class-diagnostics.php
│   └── class-logger.php
├── assets/
│   ├── css/frontend.css
│   └── js/frontend.js
```

Módulos recomendados:

```text
Módulo 1: Frontend visual
- Slider
- Tiles
- Separatas
- Badges

Módulo 2: API externa
- Endpoints protegidos
- Rate limit
- Registro de IP

Módulo 3: Descuentos
- Sincronización FlyCart
- Comparación por hash
- Escritura solo si hay cambios

Módulo 4: Caché
- Purga selectiva
- Sin purge all automático
- Botón de emergencia manual

Módulo 5: Diagnóstico
- Solo lectura
- Sin borrar caché

Módulo 6: Logs
- Fecha/hora
- Endpoint
- IP
- Sede
- Duración
- Resultado
- Si purgó caché o no
```

---

## 10. Por qué es mejor volverlo plugin normal

### 10.1. Se puede desactivar desde el panel

Ahora, como MU-plugin, si una versión empeora el rendimiento, toca entrar por archivos y renombrar. Como plugin normal se podría desactivar desde:

```text
WordPress → Plugins
```

### 10.2. Permite modo pausa

Se puede crear un ajuste:

```text
Pausar sincronización externa
Pausar purgas de caché
Mantener frontend visible
```

Esto sería útil cuando el sitio está en mantenimiento, importación, limpieza de base de datos o alta carga.

### 10.3. Permite módulos activables

No se debe apagar todo para frenar una sola cosa. Por ejemplo:

```text
Apagar solo sync de descuentos.
Mantener banners activos.
Apagar solo clear-cache.
Mantener separatas visibles.
```

### 10.4. Mejora compatibilidad con LiteSpeed

Un plugin normal puede integrarse correctamente:

```text
Purgar solo home.
Purgar solo página de separatas.
Purgar solo URL de promoción.
No purgar todo el sitio.
```

### 10.5. Permite logs y auditoría

Cada llamada del sistema externo debería quedar registrada. Ejemplo:

```text
2026-04-29 17:30:12 | endpoint: sync-discount-rules | sede: PV001 | IP: x.x.x.x | duración: 2.3s | reglas: 10 | cambios reales: 0 | caché purgada: no
```

Así se puede saber si el panel externo está llamando demasiado.

---

## 11. Recomendación para pruebas

Para confirmar si el MU-plugin es causante o agravante:

```text
1. Renombrar temporalmente el archivo:
   merkahorro-banners.php → merkahorro-banners.php.off

2. Medir durante 30 a 60 minutos:
   - CPU MySQL
   - I/O
   - consumo PHP
   - debug.log
   - error_log
   - navegación frontend
   - administración WordPress

3. Revisar access_log buscando:
   /wp-json/merkahorro/v1/clear-cache
   /wp-json/merkahorro/v1/diagnostico
   /wp-json/merkahorro/v1/sync-discount-rules
   /wp-json/merkahorro/v1/wp-banners
   /wp-json/merkahorro/v1/woo-discount-rules

4. Si al desactivarlo baja el consumo:
   el MU-plugin o el sistema externo que lo llama es factor causante/aggravante.
```

---

## 12. Conclusión final

El archivo actual debe considerarse una integración crítica, no un simple módulo de banners.

El principal riesgo es que el sistema externo pueda activar operaciones pesadas de caché, descuentos y consultas mediante endpoints REST. La combinación de:

```text
MU-plugin siempre activo
API externa
GET destructivos
purgas globales de LiteSpeed
wp_cache_flush
limpieza masiva de transients
sincronización de descuentos
TTL muy corto
sin rate limit
sin logs
```

puede explicar por qué cada actualización del MU-plugin empeora el rendimiento del sitio.

La solución recomendada es convertirlo en un plugin normal, modular y controlable, pero no copiando la misma lógica. Debe rediseñarse para:

```text
No limpiar caché global automáticamente.
No diagnosticar borrando caché.
No sincronizar si no hay cambios.
No hacer purge all de LiteSpeed.
No usar wp_cache_flush salvo emergencia manual.
Registrar todas las llamadas externas.
Permitir pausa desde admin.
Separar frontend, API, descuentos y caché.
```

Solo mover el archivo de `mu-plugins` a `plugins` sin corregir estas prácticas no solucionará el problema. La mejora real está en convertirlo en un plugin normal con arquitectura segura, modular y compatible con LiteSpeed/WooCommerce.
