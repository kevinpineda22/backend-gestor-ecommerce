import supabase from "../supabaseClient.js";

// --- SERVICIO DE BANNERS ---

export async function getBanners(section = 'home_slider', sede = null) {
    try {
        let query = supabase
            .from('content_banners')
            .select('*')
            .eq('section', section)
            .order('display_order', { ascending: true });
            
        const { data, error } = await query;
        if(error) throw error;

        // Filtrar por sede: mostrar banners donde sedes=null (todas) o que incluyan la sede
        let filtered = data;
        if (sede) {
            filtered = data.filter(b => !b.sedes || b.sedes.includes(sede));
        }

        return { ok: true, data: filtered };
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

// --- SERVICIO DE REGLAS DE DESCUENTO ---

export async function getDiscountRules() {
    try {
        const { data, error } = await supabase
            .from('discount_rules')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) throw error;
        return { ok: true, data };
    } catch (e) {
        console.error("Error getDiscountRules:", e);
        return { ok: false, message: e.message };
    }
}

export async function createDiscountRule(ruleData) {
    try {
        const { data, error } = await supabase
            .from('discount_rules')
            .insert([ruleData])
            .select();

        if (error) throw error;
        return { ok: true, data };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function updateDiscountRule(id, updates) {
    try {
        const { error } = await supabase
            .from('discount_rules')
            .update(updates)
            .eq('id', id);

        if (error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function deleteDiscountRule(id) {
    try {
        const { error } = await supabase
            .from('discount_rules')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}
