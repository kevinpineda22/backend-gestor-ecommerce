import supabase from "../supabaseClient.js";

const BUCKET_NAME = "catalog-images";

export async function uploadImageToSupabase(file) {
  try {
    let fileExt = file.originalname.split(`.`).pop().toLowerCase();
    if (fileExt === `jfif` || fileExt === `jpeg`) fileExt = `jpg`;

    const nameWithoutExt = file.originalname.substring(0, file.originalname.lastIndexOf(`.`));
    const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9_\-]/g, ``).toLowerCase() || `imagen-${Date.now()}`;
    const fileName = `${cleanName}.${fileExt}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        cacheControl: `1`,
        upsert: true
      });

    if (error) throw error;

    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    // Cache-buster para que WooCommerce/browser cargue siempre la versi�n nueva
    return `${publicData.publicUrl}?v=${Date.now()}`;

  } catch (error) {
    console.error("Storage Error:", error);
    throw new Error("No se pudo subir la imagen. Asegurate de tener un bucket publico llamado catalog-images en Supabase.");
  }
}
