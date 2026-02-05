import supabase from "../supabaseClient.js";

const BUCKET_NAME = "catalog-images";

export async function uploadImageToSupabase(file) {
  try {
    // Sanitize filename: remove special chars, keep extension
    let fileExt = file.originalname.split('.').pop().toLowerCase();
    
    // Fix: WordPress suele rechazar .jfif, lo normalizamos a .jpg
    if (fileExt === 'jfif' || fileExt === 'jpeg') {
        fileExt = 'jpg';
    }

    const nameWithoutExt = file.originalname.substring(0, file.originalname.lastIndexOf('.'));
    const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `${Date.now()}_${cleanName}.${fileExt}`;
    
    // 1. Intentar subir
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    // Si error es "Bucket not found", intentar crearlo (aunque RLS puede impedirlo)
    if (error && error.message.includes("bucket not found")) {
      console.log("⚠️ Bucket no encontrado, intentando crear...");
      /* 
         Nota: Crear buckets requiere permisos de Service Role o Admin. 
         Si falla, el usuario debe crearlo manualmente en Supabase Dashboard.
      */
    }

    if (error) throw error;

    // 2. Obtener URL Pública
    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return publicData.publicUrl;

  } catch (error) {
    console.error("Storage Error:", error);
    throw new Error("No se pudo subir la imagen. Asegúrate de tener un bucket público llamado 'catalog-images' en Supabase.");
  }
}
