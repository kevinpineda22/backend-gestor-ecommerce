# Integración API — AWDR Subtotal Excluding Filter

**Plugin:** `AWDR Subtotal Excluding Filter`  
**Versión documentada:** `1.0.3.8.11.0`  
**PHP mínimo:** `7.4`  
**WordPress / WooCommerce:** entorno multisede por sitio/subdominio  

## 1. Qué capacidad API tiene hoy el plugin

La capacidad API **ya existe dentro del plugin**. No depende de un mu-plugin adicional.

La integración actual sirve para:

- diagnosticar el estado del módulo;
- leer la configuración global de avisos;
- actualizar la configuración global de avisos;
- leer las reglas visibles actuales de Discount Rules (`wdr_rules`) junto con su configuración de avisos.

### Importante
Esta API **no sincroniza ni crea reglas de descuento en Discount Rules**.  
Eso sigue siendo otra responsabilidad.

Esta API se enfoca en:

- **configuración del módulo de avisos**;
- **lectura de reglas visibles** para que el sistema externo pueda mapearlas;
- **lectura/escritura de mensajes, prioridades, disparadores y diseño visual** del sistema de notificaciones.

En otras palabras:

- **descuentos / reglas base:** se administran donde ya los administras hoy;
- **avisos AWDR asociados a esas reglas:** se administran por esta API.

---

## 2. Namespace y rutas REST

El plugin define internamente:

- `MKH_AWDR_API_NAMESPACE = merkahorro/v1`
- `REST_BASE = awdr-notices`

Por tanto, las rutas disponibles son:

### Diagnóstico
`GET /wp-json/merkahorro/v1/awdr-notices/diagnostico`

### Configuración completa del módulo
`GET /wp-json/merkahorro/v1/awdr-notices/settings`

### Guardar configuración completa o parcial del módulo
`POST /wp-json/merkahorro/v1/awdr-notices/settings`

### Reglas visibles actuales + configuración asociada de avisos
`GET /wp-json/merkahorro/v1/awdr-notices/rules`

---

## 3. Autenticación

La autenticación funciona así:

### A. Usuario admin autenticado en WordPress
Se permite acceso si el usuario logueado tiene capacidad:

- `manage_woocommerce`

### B. API Key
También se permite acceso con clave enviada por:

- header `X-API-Key`
- o query param `?key=`

### Orden de resolución de la clave
El plugin busca la clave en este orden:

1. `MKH_AWDR_API_KEY`
2. `MERKAHORRO_API_KEY`


## 4. URL externa opcional

El plugin también contempla una URL externa para diagnóstico/referencia:

Orden de resolución:

1. `MKH_AWDR_API_URL`
2. `MERKAHORRO_API_URL`

Esto **no genera sincronización automática** por sí solo. Solo deja lista la capacidad para convivir con el mismo patrón del proyecto.

---

## 5. Multisite / multisede

El plugin trabaja **por sitio actual**.

Esto significa que cada subdominio / sede guarda su propia configuración en su propia tabla de opciones del sitio actual.

### Consecuencia práctica
Si el sistema externo integra con:

- `https://villahermosa.supermercadomerkahorro.com/wp-json/merkahorro/v1/awdr-notices/...`

entonces trabaja **solo** sobre la configuración de Villahermosa.

Si integra con otra sede/subdominio, trabajará sobre la configuración de esa otra sede.

No usa una tabla central compartida para todas las sedes.

---

## 6. Option key interna

La configuración del módulo se guarda en la opción:

- `mkh_awdr_notice_settings`

La estructura general es:

```json
{
  "globals": { ... },
  "rules": {
    "123": { ... },
    "456": { ... }
  }
}
```

---

## 7. Endpoint de diagnóstico

### Ruta
`GET /wp-json/merkahorro/v1/awdr-notices/diagnostico`

### Qué devuelve
- versión del plugin;
- namespace y base REST;
- datos del sitio actual;
- si hay API key configurada;
- tabla `wdr_rules` usada;
- si la tabla existe;
- número de reglas visibles;
- cuántas reglas tienen configuración de aviso;
- si el módulo global está habilitado;
- URLs REST del propio módulo.

### Uso recomendado
Este endpoint debe ser el primero que consuma el sistema externo para validar:

- que la clave funciona;
- que la sede actual es la correcta;
- que el plugin está activo;
- que la tabla de Discount Rules existe;
- que el módulo está listo para leer/escribir configuración.

### Ejemplo cURL
```bash
curl -H "X-API-Key: TU_CLAVE" \
  "https://tu-sede/wp-json/merkahorro/v1/awdr-notices/diagnostico"
```

---

## 8. Endpoint GET settings

### Ruta
`GET /wp-json/merkahorro/v1/awdr-notices/settings`

### Qué devuelve
Devuelve:

- `version`
- `site`
- `option_key`
- `settings`
- `defaults`

### `settings`
Es el estado actual real guardado en WordPress.

### `defaults`
Es la estructura base esperada por el plugin.

### Uso recomendado
El sistema externo debería:

1. leer `settings`;
2. presentarlos al usuario/admin;
3. editar sobre esa estructura;
4. enviar luego `POST settings`.

---

## 9. Endpoint GET rules

### Ruta
`GET /wp-json/merkahorro/v1/awdr-notices/rules`

### Qué devuelve
Lista las reglas visibles actuales de `wdr_rules` con:

- `rule_id`
- `title`
- `enabled`
- `deleted`
- `priority`
- `apply_to`
- `date_from`
- `date_to`
- `filters`
- `conditions`
- `product_adjustments`
- `additional`
- `notice_config`
- `has_notice_config`

### Importante
Solo devuelve reglas con:

- `deleted = 0`

Es decir: reglas visibles actuales.

### Uso recomendado
Este endpoint es el más importante para el sistema externo porque permite:

- ver qué reglas reales existen hoy en la sede;
- mapearlas por `rule_id`;
- mostrar su título real (`title`);
- inspeccionar filtros y condiciones del descuento;
- y asociarles configuración de aviso.

---

## 10. Endpoint POST settings

### Ruta
`POST /wp-json/merkahorro/v1/awdr-notices/settings`

### Qué permite actualizar
Permite actualizar:

- `globals`
- `rules`

Puede actualizar ambos en una sola petición o solo uno de los dos.

### Estructura general del payload
```json
{
  "globals": { ... },
  "rules": {
    "123": { ... },
    "456": { ... }
  }
}
```

### Reglas de actualización
- si mandas `globals`, actualiza configuración global;
- si mandas `rules`, actualiza configuración por regla;
- si mandas `replace_rules = true`, primero borra las configuraciones actuales de reglas y luego aplica lo enviado;
- si dentro de una regla mandas `delete = true` o `_delete = true`, elimina esa configuración de aviso para esa regla.

---

## 11. Campos globales soportados (`globals`)

Estos son los campos que hoy acepta el plugin:

```json
{
  "enabled": true,
  "header_selector": ".element-sticky-header",
  "blocker_selectors": "#merkahorro-modal-overlay, #verificacion-edad-overlay",
  "duration_seconds": 10,
  "cooldown_minutes": 15,
  "background_color": "#160857",
  "text_color": "#ffffff",
  "button_background_color": "#88DC00",
  "button_text_color": "#160857",
  "button_font_size_px": 15,
  "button_padding_y_px": 10,
  "button_padding_x_px": 14,
  "button_radius_px": 8,
  "title_font_size_px": 20,
  "message_font_size_px": 16,
  "notice_min_height_px": 88,
  "notice_max_width_px": 920,
  "top_gap_px": 8,
  "mobile_top_gap_px": 8,
  "horizontal_align": "center",
  "mobile_horizontal_align": "inherit",
  "content_align": "left",
  "text_align": "left",
  "button_align": "inherit"
}
```

### Notas de validación
El plugin sanea y normaliza estos campos internamente.

Por ejemplo:
- colores: `sanitize_hex_color`
- alineaciones: listas cerradas (`left`, `center`, `right`, etc.)
- tamaños / padding / gaps: enteros positivos

---

## 12. Campos por regla soportados (`rules[rule_id]`)

Cada regla puede guardar esta configuración:

```json
{
  "enabled": true,
  "trigger_mode": "auto",
  "title": "Descuento Mundialista",
  "message": "Mensaje principal del aviso",
  "progress_message": "Te faltan {remaining_amount}...",
  "button_text": "Ver productos",
  "target_url": "https://tu-sede/ofertas/mundial/",
  "unlocked_message": "¡Ya alcanzaste la meta!",
  "notice_priority": 0
}
```

### Significado de cada campo
- `enabled`: activa o desactiva el aviso para esa regla
- `trigger_mode`: comportamiento del aviso
- `title`: título del aviso
- `message`: mensaje principal
- `progress_message`: mensaje de progreso para reglas condicionadas
- `button_text`: texto del CTA
- `target_url`: URL destino (opcional)
- `unlocked_message`: mensaje al cumplir meta
- `notice_priority`: prioridad manual del aviso

### Valores permitidos para `trigger_mode`
- `auto`
- `active`
- `unlocked`
- `progress_unlock`

---

## 13. Placeholders soportados en `progress_message`

Cuando una regla usa mensaje de progreso, hoy el plugin soporta estas llaves:

- `{rule_title}`
- `{remaining_amount}`
- `{current_amount}`
- `{target_amount}`

Ejemplo:

```text
Te faltan {remaining_amount} para desbloquear esta promoción. Ya llevas {current_amount} de {target_amount}.
```

---

## 14. Ejemplo real de flujo de integración recomendado

### Paso 1 — Diagnóstico
El sistema externo consulta:

`GET /awdr-notices/diagnostico`

Objetivo:
- validar API key
- validar sede
- validar que el plugin existe y responde

### Paso 2 — Obtener reglas visibles
El sistema externo consulta:

`GET /awdr-notices/rules`

Objetivo:
- leer reglas reales visibles de Discount Rules
- obtener `rule_id`
- obtener `title`
- identificar qué reglas ya tienen aviso configurado

### Paso 3 — Obtener settings actuales
El sistema externo consulta:

`GET /awdr-notices/settings`

Objetivo:
- obtener `globals` actuales
- obtener reglas configuradas actualmente

### Paso 4 — Guardar cambios
El sistema externo envía:

`POST /awdr-notices/settings`

con cambios en:
- globals
- una o varias reglas

---

## 15. Ejemplo de payload para guardar configuración global + reglas

```json
{
  "globals": {
    "enabled": true,
    "duration_seconds": 10,
    "cooldown_minutes": 15,
    "background_color": "#160857",
    "text_color": "#ffffff",
    "button_background_color": "#88DC00",
    "button_text_color": "#160857",
    "title_font_size_px": 20,
    "message_font_size_px": 16,
    "top_gap_px": 8,
    "mobile_top_gap_px": 8,
    "horizontal_align": "center",
    "mobile_horizontal_align": "inherit",
    "content_align": "left",
    "text_align": "left",
    "button_align": "inherit"
  },
  "rules": {
    "321": {
      "enabled": true,
      "trigger_mode": "progress_unlock",
      "title": "Descuento Mundialista",
      "message": "Ya puedes aprovechar esta promoción especial.",
      "progress_message": "Te faltan {remaining_amount} para desbloquear esta promoción. Ya llevas {current_amount} de {target_amount}.",
      "unlocked_message": "¡Ya alcanzaste la meta! Ahora puedes aprovechar esta promoción.",
      "button_text": "Ver productos",
      "target_url": "https://tu-sede/descuentos-especiales/",
      "notice_priority": 0
    },
    "654": {
      "enabled": true,
      "trigger_mode": "active",
      "title": "Miércoles 10% en Carnes",
      "message": "Hoy tienes una promoción especial en carnes seleccionadas.",
      "button_text": "Ver categoría",
      "target_url": "https://tu-sede/categoria-producto/carnes-y-proteinas/",
      "notice_priority": 3
    }
  }
}
```

---

## 16. Ejemplo cURL — GET settings

```bash
curl -H "X-API-Key: TU_CLAVE" \
  "https://tu-sede/wp-json/merkahorro/v1/awdr-notices/settings"
```

## 17. Ejemplo cURL — GET rules

```bash
curl -H "X-API-Key: TU_CLAVE" \
  "https://tu-sede/wp-json/merkahorro/v1/awdr-notices/rules"
```

## 18. Ejemplo cURL — POST settings

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: TU_CLAVE" \
  -d '{
    "globals": {
      "enabled": true,
      "duration_seconds": 10,
      "cooldown_minutes": 15
    },
    "rules": {
      "321": {
        "enabled": true,
        "trigger_mode": "progress_unlock",
        "title": "Descuento Mundialista",
        "message": "Ya puedes aprovechar esta promoción especial.",
        "progress_message": "Te faltan {remaining_amount} para desbloquear esta promoción. Ya llevas {current_amount} de {target_amount}.",
        "unlocked_message": "¡Ya alcanzaste la meta!",
        "notice_priority": 0
      }
    }
  }' \
  "https://tu-sede/wp-json/merkahorro/v1/awdr-notices/settings"
```

---

## 19. Qué debe tener en cuenta el desarrollador del sistema externo

### A. Este plugin no administra los descuentos base
El desarrollador no debe asumir que esta API crea o sincroniza la tabla `wdr_rules`.

Esta API administra:
- la configuración de avisos;
- y la lectura de reglas visibles para mapearlas.

### B. El `rule_id` es la clave de integración
Todo el enlace entre:
- regla de descuento real
- y configuración del aviso

se hace por `rule_id`.

### C. `notice_priority = 0` es válido
El sistema externo puede enviar `0`, `1`, `2`, `3`, etc.

- menor número = mayor prioridad
- empate = el front resuelve por orden interno / ID

### D. Si el sistema externo quiere reemplazar todas las configuraciones de reglas
Debe enviar:

```json
{ "replace_rules": true }
```

junto con el bloque `rules`.

### E. Si quiere borrar una configuración puntual de regla
Puede enviar:

```json
{
  "rules": {
    "321": {
      "delete": true
    }
  }
}
```

---

## 20. Recomendación arquitectónica para integrarlo con el administrador externo

### Lo más limpio
Separar en el sistema externo dos responsabilidades:

#### 1. Administración de descuentos base
Esto sigue yendo por el flujo que ya tengas para FlyCart / Discount Rules.

#### 2. Administración de avisos AWDR
Esto ya puede ir por estas rutas del plugin:
- `GET rules`
- `GET settings`
- `POST settings`

### Flujo recomendado del panel externo
1. leer reglas visibles desde `GET rules`
2. listar esas reglas al usuario
3. permitir configurar aviso por cada una
4. guardar todo en `POST settings`

---

## 21. Riesgos / límites actuales

### 1. No hay endpoint separado de "guardar una sola regla"
Hoy la escritura entra por `POST settings`, aunque puedes mandar un solo bloque de regla si quieres.

### 2. No hay sincronización push automática
El plugin **expone** API; no empuja datos solo.

### 3. No crea reglas nuevas en Discount Rules
Solo las lee para que el sistema externo las mapee.

### 4. Debe integrarse sede por sede
La integración debe apuntar al subdominio correcto.

---
