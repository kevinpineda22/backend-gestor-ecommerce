import axios from "axios";

// 🔒 Validaciones críticas
if (!process.env.CONNEKTA_BASE_URL) {
  throw new Error("❌ CONNEKTA_BASE_URL no está definido en el entorno");
}
if (!process.env.CONNEKTA_KEY) {
  throw new Error("❌ CONNEKTA_KEY no está definido en el entorno");
}
if (!process.env.CONNEKTA_TOKEN) {
  throw new Error("❌ CONNEKTA_TOKEN no está definido en el entorno");
}

// ⚠️ IMPORTANTE: baseURL DEBE ser ABSOLUTA
// Ejemplo correcto: https://api.siesa.com
export const siesaApi = axios.create({
  baseURL: process.env.CONNEKTA_BASE_URL.replace(/\/$/, ""), // sin slash final
  timeout: 45000, // Aumentado a 45s para evitar timeouts bajo carga
  headers: {
    conniKey: process.env.CONNEKTA_KEY,
    conniToken: process.env.CONNEKTA_TOKEN,
    "Content-Type": "application/json"
  }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeSiesaQuery({ descripcion, parametros }, page = 1) {
  let attempt = 0;
  // Aumentamos intentos para sobrevivir al bloqueo 429
  const maxAttempts = 5;
  
  while (attempt < maxAttempts) {
    try {
      const res = await siesaApi.get("/api/siesa/v3/ejecutarconsultaestandar", {
        params: {
          idCompania: "7375",
          descripcion,
          parametros,
          paginacion: `numPag=${page}|tamPag=100`
        }
      });

      // 🆕 Fix: Si devuelve array directo, usarlo
      if (Array.isArray(res.data)) {
        return res.data;
      }

      // Caso normal OK
      if (res.data?.codigo === 0) {
        return res.data.detalle?.Datos || res.data.detalle?.Table || [];
      }
      
      return []; // Si no hay datos pero no es error

    } catch (error) {
      // Si es timeout o 429, reintentar
      if (error.code === 'ECONNABORTED' || error.response?.status === 429) {
        attempt++;
        console.warn(`⚠️ Intento ${attempt} fallido para Siesa (${descripcion}):`, error.message);
        if (attempt >= maxAttempts) throw error;
        
        // Random Jitter para evitar "thundering herd" (que todos golpeen a la vez al reintentar)
        const jitter = Math.floor(Math.random() * 500); 
        const backoffTime = (2000 * attempt) + jitter; // 2s, 4s, 6s... + jitter
        
        await wait(backoffTime);
        continue; // Retry
      }
      // Otros errores (404, 500, etc) lanzar directo
      // 🆕 Fix: Si es 400 con "No se encontraron registros", devolver vacío
      if (error.response?.status === 400 && error.response?.data?.detalle?.includes("No se encontraron registros")) {
          // console.warn(`⚠️ Siesa reports Not Found (400) for ${descripcion} => Returning []`);
          return [];
      }

      throw error;
    }
  }
}
