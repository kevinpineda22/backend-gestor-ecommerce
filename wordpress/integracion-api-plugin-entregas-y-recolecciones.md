# Integración API — Merkahorro Logística por Sede

La integración permite **leer y actualizar la configuración logística de cada sede**.


# 1. URL oficial de la API
La integración debe usar la **misma API del sistema actual**.

## URL base oficial
```text
https://backend-gestor-ecommerce.vercel.app/api
```

## Nota importante
No usar otra URL base distinta.

se realizo modificacion del mu plugin para fallback y se definio en el config el api_url y el api_key:

```php
define('MERKAHORRO_API_URL', 'https://backend-gestor-ecommerce.vercel.app/api');
define('MERKAHORRO_API_KEY', 'merkahorro2026');
```

Esto permite que:
- el mu-plugin existente
- y el plugin Merkahorro Logística

usen la **misma API real**.

---

# 2. Endpoint principal a usar
## Endpoint
```text
POST /wp-json/merkahorro/v1/sync-logistica-settings
```

## Ejemplo completo por sede
```text
https://supermercadomerkahorro.com/wp-json/merkahorro/v1/sync-logistica-settings?key=merkahorro2026
```

También aplica para cualquier otra sede activa:
- `https://villahermosa.supermercadomerkahorro.com/wp-json/merkahorro/v1/sync-logistica-settings?key=...`
- `https://barbosa.supermercadomerkahorro.com/wp-json/merkahorro/v1/sync-logistica-settings?key=...`
- `https://girardota.supermercadomerkahorro.com/wp-json/merkahorro/v1/sync-logistica-settings?key=...`

---

# 3. Autenticación
## Método oficial
La autenticación sigue el patrón del sistema actual.

Se debe enviar la clave por query string:

```text
?key=TU_API_KEY
```

## Ejemplo
```text
POST https://supermercadomerkahorro.com/wp-json/merkahorro/v1/sync-logistica-settings?key=merkahorro2026
```

## Compatibilidad adicional
El plugin también acepta:
- `X-API-Key`
- usuario administrador logueado

Pero para integración externa, el método base esperado es:

```text
?key=TU_API_KEY
```

---

# 4. Headers requeridos
```http
Content-Type: application/json
Accept: application/json
```

---

# 5. Payload oficial de configuración
## JSON oficial
```json
{
  "branch_name": "Sede Villa Hermosa",
  "display_format": "j \\d\\e F, Y \\a \\l\\a\\s g:i a",

  "delivery_label": "Entrega estimada",
  "pickup_label": "Hora estimada de recogida",

  "delivery_methods": "flat_rate,free_shipping",
  "pickup_methods": "local_pickup,legacy_local_pickup,pickup_location",

  "delivery_in_hours_minimum_minutes": 120,
  "delivery_in_hours_minutes_per_item": 4,
  "delivery_next_cycle_minimum_minutes": 60,
  "delivery_next_cycle_minutes_per_item": 4,
  "delivery_capacity_enabled": 1,
  "delivery_capacity_per_cycle": 100,

  "pickup_in_hours_minimum_minutes": 60,
  "pickup_in_hours_minutes_per_item": 3,
  "pickup_next_cycle_minimum_minutes": 60,
  "pickup_next_cycle_minutes_per_item": 3,
  "pickup_capacity_enabled": 1,
  "pickup_capacity_per_cycle": 100,

  "delivery_schedule": {
    "1": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" },
    "2": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" },
    "3": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" },
    "4": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" },
    "5": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" },
    "6": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" },
    "7": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" }
  },

  "pickup_schedule": {
    "1": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" },
    "2": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" },
    "3": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" },
    "4": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" },
    "5": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" },
    "6": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" },
    "7": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" }
  }
}
```

---

# 6. Explicación 
## `branch_name`
Nombre visible de la sede.

Ejemplo:
- `Sede Villa Hermosa`
- `Merkahorro Copacabana Plaza`

## `display_format`
Formato de fecha/hora que usa WordPress para mostrar la hora estimada.

No cambiarlo salvo que realmente quieran cambiar cómo se ve el texto final.

## `delivery_label`
Texto visible para pedidos con envío a domicilio.

Ejemplo:
- `Entrega estimada`

## `pickup_label`
Texto visible para pedidos con recogida en local.

Ejemplo:
- `Hora estimada de recogida`

## `delivery_methods`
Lista de métodos de envío que deben considerarse como **domicilio**.

Se envían separados por coma.

Ejemplo:
```text
flat_rate,free_shipping
```

## `pickup_methods`
Lista de métodos de envío que deben considerarse como **recogida en local**.

Ejemplo:
```text
local_pickup,legacy_local_pickup,pickup_location
```

## Bloques de tiempos
Hay dos grupos:
- `delivery_*` = domicilio
- `pickup_*` = recogida

Y cada grupo tiene dos escenarios:
- `in_hours` = pedido dentro del horario de recepción
- `next_cycle` = pedido fuera de horario o movido al siguiente ciclo

## Capacidades
Permiten limitar cuántos pedidos soporta un ciclo operativo.

Si se llena el ciclo, los siguientes pedidos pasan al próximo ciclo disponible.

## Horarios
Cada horario se manda por día.

- `orders_start` = inicio de recepción de pedidos
- `orders_end` = fin de recepción de pedidos
- `service_start` = inicio del servicio real
- `service_end` = fin del servicio real

Esto permite separar correctamente:
- recepción de pedidos
- ventana real de entrega o recogida

---

# 7. Reglas de validación
## Campos de texto
Todos estos campos deben enviarse como texto:
- `branch_name`
- `display_format`
- `delivery_label`
- `pickup_label`
- `delivery_methods`
- `pickup_methods`

## Campos enteros
Todos deben enviarse como enteros `>= 0`:
- `delivery_in_hours_minimum_minutes`
- `delivery_in_hours_minutes_per_item`
- `delivery_next_cycle_minimum_minutes`
- `delivery_next_cycle_minutes_per_item`
- `pickup_in_hours_minimum_minutes`
- `pickup_in_hours_minutes_per_item`
- `pickup_next_cycle_minimum_minutes`
- `pickup_next_cycle_minutes_per_item`

## Capacidades
- `delivery_capacity_enabled`: `0` o `1`
- `pickup_capacity_enabled`: `0` o `1`
- `delivery_capacity_per_cycle`: mínimo `1`, máximo `10000`
- `pickup_capacity_per_cycle`: mínimo `1`, máximo `10000`

## Horarios
Formato obligatorio:
```text
HH:MM
```

Ejemplos válidos:
- `07:00`
- `18:30`
- `20:00`

## Días
Los horarios se envían por índice:
- `1` = lunes
- `2` = martes
- `3` = miércoles
- `4` = jueves
- `5` = viernes
- `6` = sábado
- `7` = domingo

Cada día debe incluir:
- `enabled`
- `orders_start`
- `orders_end`
- `service_start`
- `service_end`

---

# 8. Respuestas esperadas
## Éxito
```json
{
  "ok": true,
  "message": "Configuración logística actualizada correctamente.",
  "site_url": "https://villahermosa.supermercadomerkahorro.com"
}
```

## Error de autenticación
```json
{
  "ok": false,
  "message": "No autorizado."
}
```

## Error de validación
```json
{
  "ok": false,
  "message": "Payload inválido.",
  "errors": {
    "delivery_capacity_per_cycle": "Debe estar entre 1 y 10000"
  }
}
```

---

# 9. Ejemplo práctico de llamada
```bash
curl -X POST "https://supermercadomerkahorro.com/wp-json/merkahorro/v1/sync-logistica-settings?key=merkahorro2026" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "branch_name": "Sede Villa Hermosa",
    "delivery_label": "Entrega estimada",
    "pickup_label": "Hora estimada de recogida",
    "delivery_methods": "flat_rate,free_shipping",
    "pickup_methods": "local_pickup,legacy_local_pickup,pickup_location",
    "delivery_in_hours_minimum_minutes": 120,
    "delivery_in_hours_minutes_per_item": 4,
    "delivery_next_cycle_minimum_minutes": 60,
    "delivery_next_cycle_minutes_per_item": 4,
    "delivery_capacity_enabled": 1,
    "delivery_capacity_per_cycle": 100,
    "pickup_in_hours_minimum_minutes": 60,
    "pickup_in_hours_minutes_per_item": 3,
    "pickup_next_cycle_minimum_minutes": 60,
    "pickup_next_cycle_minutes_per_item": 3,
    "pickup_capacity_enabled": 1,
    "pickup_capacity_per_cycle": 100,
    "delivery_schedule": {
      "1": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "18:00" }
    },
    "pickup_schedule": {
      "1": { "enabled": 1, "orders_start": "07:00", "orders_end": "20:00", "service_start": "08:00", "service_end": "20:00" }
    }
  }'
```

---

# 10. Consideración operativa importante
Esta integración es **por sede**, no global.

# 11. Resumen corto para el desarrollador
El módulo externo solo necesita hacer esto:

1. Tomar la URL de la sede
2. Llamar el endpoint:
   ```text
   POST /wp-json/merkahorro/v1/sync-logistica-settings?key=TU_API_KEY
   ```
3. Enviar el JSON completo de configuración
4. Validar la respuesta `ok: true`

Eso es todo lo necesario para administrar remotamente la configuración logística de la sede.
