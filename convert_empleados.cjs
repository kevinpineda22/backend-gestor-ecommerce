const fs = require('fs');

const raw = fs.readFileSync('wordpress/empleaods.json', 'utf8');
const data = JSON.parse(raw);

const header = ['user_login', 'user_pass', 'user_nicename', 'user_email', 'display_name', 'first_name', 'last_name', 'roles', 'nickname'];
const rows = [];
rows.push(header.join(','));

data.forEach(emp => {
    const nombre = (emp.nombre || '').trim();
    const apellidos = (emp.apellidos || '').trim();
    // Reemplazamos cualquier caracter que NO sea número (puntos, letras, espacios intermedios)
    const doc = (emp.numero_documento || '').replace(/\D/g, '');
    
    // Validar el correo electrónico
    let email = (emp.correo || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
        // En WooCommerce el correo es obligatorio, si no tienen le creamos uno por defecto.
        email = `empleado_${doc}@merkahorro.com`; 
    }

    const user_login = doc; // Usaremos la cédula como nombre de usuario
    const user_pass = doc;  // La contraseña por defecto será la misma cédula
    const user_nicename = doc;
    const display_name = `${nombre} ${apellidos}`;
    const roles = 'empleados'; // <- CUIDADO: En la plantilla el rol es "empleados" (en plural)
    const nickname = nombre;

    const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;

    rows.push([
        escapeCsv(user_login),
        escapeCsv(user_pass),
        escapeCsv(user_nicename),
        escapeCsv(email),
        escapeCsv(display_name),
        escapeCsv(nombre),
        escapeCsv(apellidos),
        escapeCsv(roles),
        escapeCsv(nickname)
    ].join(','));
});

// Escribimos un CSV (Con BOM utf-8 para que Excel lea las tildes bien)
fs.writeFileSync('wordpress/empleados_woo_import_v2.csv', '\uFEFF' + rows.join('\n'), 'utf8');
console.log('¡CSV creado con exito en wordpress/empleados_woo_import.csv!');
