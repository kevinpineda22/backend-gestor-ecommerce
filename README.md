# Backend Gestor E-commerce

Backend Node/Express + frontend React para el **Gestor EcomManager** de Merkahorro. Sincroniza catálogo, banners, descuentos y separatas entre el ERP SIESA, una base de datos Supabase y la red de tiendas WooCommerce.

---

## 1. Componentes del repositorio

| Carpeta | Qué es |
|---------|--------|
| `app.js`, `server.js`, `routes/`, `controllers/`, `services/` | API Node/Express desplegada en Vercel (`backend-gestor-ecommerce.vercel.app`). |
| `gestor-ecommerce/` | Frontend React del panel del gestor. Se monta dentro de la app principal en `/acceso → /gestor`. |
| `admin/` | Otros componentes administrativos React (login, equipos, usuarios). |
| `wordpress/merkahorro-ecommanager-bridge/` | **Plugin WordPress** que se instala en cada tienda WooCommerce (4 sedes). Ver §4. |
| `wordpress/DOCUMENTACION_PLUGIN.md` | Documentación funcional del plugin. |
| `wordpress/informe_mu_plugin_merkahorro.md` | Informe técnico que motivó la migración de MU-plugin a plugin estándar. |
| `*.sql` | Migraciones de Supabase (banners, descuentos, sedes, logística). Para histórico y nuevos despliegues. |
| `empleados/` | Importadores CSV/JSON del padrón de empleados. |
| `tools/`, `test_*.js`, `check_*.js`, `fix*.cjs`, `get_awdr*.js`, `inspect_wdr*.php` | Scripts utilitarios y de diagnóstico — ignorados en deploy vía `.gitignore`. |

---

## 2. Stack y dependencias

- **Runtime:** Node 18+ (ES modules, `"type": "module"`)
- **Web:** Express 4
- **DB:** Supabase (`@supabase/supabase-js`)
- **HTTP:** Axios
- **Uploads:** Multer (memory storage)
- **Frontend:** React + Vite (no incluido en este repo; el frontend se sirve desde otro proyecto que consume `services.js`)

Scripts:

```bash
npm run dev    # nodemon server.js
npm start      # node server.js
```

No hay test suite todavía (`npm test` falla a propósito). Ver §6 Deuda técnica.

---

## 3. Variables de entorno

Definir en `.env` (no commiteado):

```dotenv
# Supabase
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_KEY=<service-role-key>

# WooCommerce (sede principal PV001)
WC_URL=https://supermercadomerkahorro.com
WC_CONSUMER_KEY=ck_xxx
WC_CONSUMER_SECRET=cs_xxx

# Las credenciales WC del resto de sedes (00301, 00701, 00201) viven en la tabla
# Supabase `wc_sedes` y se cargan dinámicamente.

# SIESA (vía Connekta)
CONNEKTA_BASE_URL=https://api.siesa.com
CONNEKTA_KEY=...
CONNEKTA_TOKEN=...

# Cron Vercel — header Authorization Bearer
CRON_SECRET=...

# Puerto local
PORT=3000
```

---

## 4. Plugin WordPress: Merkahorro EcomManager Bridge

Vive en `wordpress/merkahorro-ecommanager-bridge/` y se instala en cada tienda WooCommerce de la red.

**Documentación completa:** `wordpress/DOCUMENTACION_PLUGIN.md`.

**Resumen funcional:**

- Conecta WooCommerce con esta API (Vercel + Supabase).
- Expone REST API bajo `wp-json/merkahorro/v1/`.
- Sincroniza reglas de descuento con el plugin Flycart Discount Rules (WDR).
- Renderiza shortcodes `[merkahorro_slider]`, `[merkahorro_tiles]`, `[merkahorro_separatas]`.
- Sirve la ruta dinámica `/promo/descuento/{id}/` para landings de promoción.
- Detecta la sede actual por host con fallback validado a querystring/cookies.

**Versión actual:** 2.1. Cambios en `wordpress/DOCUMENTACION_PLUGIN.md §9`.

---

## 5. Flujo de promociones (alto nivel)

```text
Gestor (React)
   │
   ▼
POST /api/content/discounts (Express → Supabase)
   │
   ▼
Click "Sincronizar con WP" en el Gestor
   │
   ▼
POST /wp-json/merkahorro/v1/sync-discount-rules en CADA sede
   │
   ▼
Plugin valida hash MD5 y escribe en wp_wdr_rules
   │
   ▼
(value_discount con fechas) Backend Vercel aplica sale_price nativo en WooCommerce
   │
   ▼
Cron diario /api/cron/apply-scheduled activa reglas con date_start = hoy
   │
   ▼
FlyCart aplica descuentos en frontend público
```

---

## 6. Deuda técnica conocida

| Item | Detalle | Prioridad |
|------|---------|-----------|
| **API key hardcoded en frontend** | `gestor-ecommerce/services.js:251` y `gestor-ecommerce/components/DiscountManager.jsx:172` contienen `?key=merkahorro2026` en URLs de WordPress. Cualquier usuario con DevTools la lee. **Migración recomendada:** mover esas llamadas a endpoints del backend Vercel (`/api/wp-proxy/...`) con la key en `process.env.MERKAHORRO_API_KEY`. | Alta |
| Sin tests | `npm test` no corre nada. Falta cubrir al menos `services/content.service.js` (lógica de discounts) y `routes/cron.routes.js`. | Alta |
| Componentes React de 1k+ líneas | `DiscountManager.jsx` (1679), `ProductEditModal.jsx` (1023), `LiveComparison.jsx` (917). Dividir en subcomponentes por sección. | Media |
| `alert()`/`confirm()` por todos lados | Reemplazar por toasts/modales no bloqueantes. | Media |
| CSS/JS inline en shortcodes del plugin | Extraer a `assets/css` y `assets/js` con `wp_enqueue_*`. | Media |
| Sin rate limit en endpoints del plugin | Implementar throttling con transients. | Media |
| `fetchSedes`, `fetchCatalog`, etc. sin manejo de error consistente | Solo capturan a consola, sin retry ni feedback estructurado al usuario. | Baja |

---

## 7. Cómo probar en staging (servernis.com)

Ver `wordpress/DOCUMENTACION_PLUGIN.md §8` para el checklist completo. Resumen:

```bash
# Cambiar la sede a probar (PV001 = principal, 00301 = Girardota, etc.)
curl -s "https://servernis.com/wp-json/merkahorro/v1/diagnostico?key=merkahorro2026&sede=PV001" | jq
```

Si el dominio de staging no está en `MERKAHORRO_SEDE_MAP`, forzar la sede con `?sede=<código>` (ya validado contra el mapa de códigos válidos).

---

## 8. Despliegue

- **Backend:** Vercel — autodeploy desde `main` (`vercel.json` define rutas).
- **Plugin:** subir el contenido de `wordpress/merkahorro-ecommanager-bridge/` a `wp-content/plugins/merkahorro-ecommanager-bridge/` en cada sede. Activar desde wp-admin. Eliminar el MU-plugin antiguo (`wp-content/mu-plugins/merkahorro-banners.php`) antes de activar para evitar redeclaración de funciones.
- **Frontend:** se sirve desde el proyecto principal (no en este repo).

---

## 9. Soporte

Documentación interna en `wordpress/`. Cambios en el plugin: actualizar versión en el header del archivo principal y en el changelog de `DOCUMENTACION_PLUGIN.md`.
