import 'dotenv/config';
import axios from 'axios';
import https from 'https';

// Permitir certificados autofirmados por si acaso es entorno dev local
const agent = new https.Agent({  
  rejectUnauthorized: false
});

const WC_URL = process.env.WC_URL ? process.env.WC_URL.replace(/\/$/, "") : null;
const WC_KEY = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;

async function investigate() {
    if(!WC_URL) {
        console.error("❌ No WC_URL in .env");
        process.exit(1);
    }

    console.log(`🔍 Investigando sitio: ${WC_URL}`);

    // 1. Obtener HTML Público (Buscando plugins en el código fuente)
    try {
        console.log("--- Paso 1: Escaneo de HTML ---");
        const { data: html } = await axios.get(WC_URL, { httpsAgent: agent });
        
        const hints = [];
        if(html.includes('elementor')) hints.push('Elementor');
        if(html.includes('revslider')) hints.push('Slider Revolution (RevSlider)');
        if(html.includes('smart-slider-3')) hints.push('Smart Slider 3');
        if(html.includes('wp-content/themes/flatsome')) hints.push('Theme: Flatsome');
        if(html.includes('wp-content/themes/divi')) hints.push('Theme: Divi');
        if(html.includes('wp-content/themes/astra')) hints.push('Theme: Astra');

        if(hints.length > 0) {
            console.log("✅ Tecnologías detectadas:", hints.join(", "));
        } else {
            console.log("⚠️ No se detectaron firmas obvias de sliders/builders conocidos.");
        }
    } catch (e) {
        console.error("❌ Error leyendo HTML:", e.message);
    }

    // 2. Intentar leer páginas vía API REST (Check de permisos)
    try {
        console.log("\n--- Paso 2: Check API WordPress (Pages) ---");
        const wpApiUrl = `${WC_URL}/wp-json/wp/v2/pages`;
        console.log(`📡 Consultando: ${wpApiUrl}`);
        
        // Autenticación Basic para la API de WordPress estándar (usando las mismas credenciales de Woo)
        // A veces funciona, a veces requiere plugin de auth.
        const authHeader = 'Basic ' + Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');
        
        const { data: pages } = await axios.get(wpApiUrl, {
            headers: { 'Authorization': authHeader },
            httpsAgent: agent,
            params: { search: 'Inicio', per_page: 1 } // Intentamos buscar "Inicio"
        });

        if(pages && pages.length > 0) {
            const home = pages[0];
            console.log(`✅ Página encontrada: ID=${home.id}, Título="${home.title.rendered}"`);
            console.log("--- Fragmento de Contenido Raw ---");
            console.log(home.content.rendered.substring(0, 500) + "...");
            
            // Analizar contenido en busca de Shortcodes
            if(home.content.rendered.includes('[rev_slider')) console.log("🔥 DETECTADO: Usan Shortcode de RevSlider");
            if(home.content.rendered.includes('elementor-section')) console.log("🔥 DETECTADO: Estructura interna de Elementor");
        } else {
            console.log("⚠️ No se encontró la página 'Inicio' o la búsqueda falló.");
        }

    } catch (e) {
        console.error("❌ Error consultando API Pages:", e.response ? e.response.status : e.message);
        if(e.response && e.response.status === 401) {
            console.log("🔒 La API requiere autenticación diferente o permisos.");
        }
    }
}

investigate();
