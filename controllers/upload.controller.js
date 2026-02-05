import { uploadImageToSupabase } from "../services/storage.service.js";

export async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "No se envió ningún archivo" });
    }

    const publicUrl = await uploadImageToSupabase(req.file);

    return res.json({
      ok: true,
      url: publicUrl
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
}
