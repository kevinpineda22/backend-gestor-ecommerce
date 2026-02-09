import supabase from "../supabaseClient.js";

// --- SERVICIO DE BANNERS ---

export async function getBanners(section = 'home_slider') {
    try {
        const { data, error } = await supabase
            .from('content_banners')
            .select('*')
            .eq('section', section)
            .order('display_order', { ascending: true });
            
        if(error) throw error;
        return { ok: true, data };
    } catch (e) {
        console.error("Error getBanners:", e);
        return { ok: false, message: e.message };
    }
}

export async function createBanner(bannerData) {
    try {
        const { data, error } = await supabase
            .from('content_banners')
            .insert([bannerData]);
            
        if(error) throw error;
        return { ok: true, data };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function updateBanner(id, updates) {
    try {
        const { error } = await supabase
            .from('content_banners')
            .update(updates)
            .eq('id', id);
            
        if(error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function deleteBanner(id) {
    try {
        const { error } = await supabase
            .from('content_banners')
            .delete()
            .eq('id', id);
            
        if(error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}
