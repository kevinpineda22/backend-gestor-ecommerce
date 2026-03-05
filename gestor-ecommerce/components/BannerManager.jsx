import React, { useState, useEffect } from "react";
import { fetchBanners, createBanner, updateBanner, deleteBanner, uploadImage } from "../services";
import "../GestorEcommerce.css";

const SECTIONS = [
  { key: "home_slider", label: "🖼️ Slider Principal", desc: "Banner grande rotativo del inicio" },
  { key: "home_tiles", label: "🏷️ Tiles Promocionales", desc: "Cuadros pequeños debajo del slider" },
];

export default function BannerManager() {
  const [allBanners, setAllBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [activeSection, setActiveSection] = useState("home_slider");
  const [publishing, setPublishing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importFilter, setImportFilter] = useState('all'); // all | revslider | woo_category | media_library

  // Form state
  const [form, setForm] = useState({
    title: "", image_url: "", link_url: "", active: true, display_order: 0, section: "home_slider"
  });

  useEffect(() => { loadAllBanners(); }, []);

  const loadAllBanners = async () => {
    setLoading(true);
    try {
      // Cargar ambas secciones en paralelo
      const [sliderRes, tilesRes] = await Promise.all([
        fetchBanners("home_slider"),
        fetchBanners("home_tiles")
      ]);
      const combined = [
        ...(sliderRes.ok ? sliderRes.data || [] : []),
        ...(tilesRes.ok ? tilesRes.data || [] : [])
      ];
      setAllBanners(combined);
    } catch (err) {
      console.error("Error cargando banners:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar por sección activa
  const banners = allBanners
    .filter(b => b.section === activeSection)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const resetForm = () => {
    setForm({ title: "", image_url: "", link_url: "", active: true, display_order: 0, section: activeSection });
    setEditingBanner(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setForm(f => ({ ...f, section: activeSection, display_order: banners.length }));
    setShowForm(true);
  };

  const openEdit = (banner) => {
    setEditingBanner(banner);
    setForm({
      title: banner.title || "", image_url: banner.image_url || "", link_url: banner.link_url || "",
      active: banner.active, display_order: banner.display_order || 0, section: banner.section || "home_slider"
    });
    setShowForm(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadImage(file);
      if (res.url) setForm(f => ({ ...f, image_url: res.url }));
      else alert("Error subiendo imagen");
    } catch (err) {
      alert("Error subiendo imagen: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.image_url) { alert("Debes subir una imagen para el banner"); return; }
    setSaving(true);
    try {
      const res = editingBanner
        ? await updateBanner(editingBanner.id, form)
        : await createBanner(form);
      if (res.ok) { resetForm(); loadAllBanners(); }
      else alert("Error: " + (res.message || "No se pudo guardar"));
    } catch (err) {
      alert("Error guardando banner: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este banner permanentemente?")) return;
    try {
      const res = await deleteBanner(id);
      if (res.ok) loadAllBanners();
      else alert("Error eliminando: " + (res.message || ""));
    } catch (err) { alert("Error: " + err.message); }
  };

  const handleToggleActive = async (banner) => {
    try {
      const res = await updateBanner(banner.id, { active: !banner.active });
      if (res.ok) setAllBanners(prev => prev.map(b => b.id === banner.id ? { ...b, active: !b.active } : b));
    } catch (err) { console.error(err); }
  };

  const handleReorder = async (bannerId, direction) => {
    const idx = banners.findIndex(b => b.id === bannerId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= banners.length) return;

    const updated = [...banners];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const promises = updated.map((b, i) => updateBanner(b.id, { display_order: i }));
    await Promise.all(promises);
    setAllBanners(prev => {
      const other = prev.filter(b => b.section !== activeSection);
      return [...other, ...updated.map((b, i) => ({ ...b, display_order: i }))];
    });
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      // Limpiar caché de WordPress para que tome los cambios inmediatamente
      const wpUrl = prompt("URL de tu WordPress (ej: https://merkahorro.com):");
      if (!wpUrl) { setPublishing(false); return; }
      const cleanUrl = wpUrl.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/wp-json/merkahorro/v1/clear-cache?key=merkahorro2026`);
      if (res.ok) {
        alert("✅ Caché de WordPress limpiado. Los cambios ya están visibles en la tienda.");
      } else {
        alert("⚠️ No se pudo limpiar el caché. Verifica que el plugin esté instalado en WordPress.");
      }
    } catch (err) {
      alert("Error conectando con WordPress: " + err.message);
    } finally {
      setPublishing(false);
    }
  };

  // --- Importar banners desde WordPress ---
  const handleFetchWpBanners = async () => {
    const wpUrl = prompt("URL de tu WordPress (ej: https://supermercadomerkahorro.com):");
    if (!wpUrl) return;
    const cleanUrl = wpUrl.replace(/\/+$/, '');

    setImporting(true);
    try {
      const res = await fetch(`${cleanUrl}/wp-json/merkahorro/v1/wp-banners?key=merkahorro2026`);
      const data = await res.json();
      if (data.ok && data.data?.length > 0) {
        setImportPreview(data);
      } else if (data.ok && (!data.data || data.data.length === 0)) {
        alert("No se encontraron banners/imágenes en WordPress.");
        setImportPreview(null);
      } else {
        alert("Error: " + (data.message || "No se pudo conectar"));
        setImportPreview(null);
      }
    } catch (err) {
      alert("Error conectando con WordPress: " + err.message + "\n\nAsegúrate de que el mu-plugin esté instalado.");
      setImportPreview(null);
    } finally {
      setImporting(false);
    }
  };

  const handleImportBanners = async (selectedBanners) => {
    setSaving(true);
    let imported = 0;
    for (const b of selectedBanners) {
      const payload = {
        title: b.title,
        image_url: b.image_url,
        link_url: b.link_url || '',
        section: b.section || 'home_slider',
        active: true,
        display_order: imported,
      };
      const res = await createBanner(payload);
      if (res.ok) imported++;
    }
    alert(`✅ Se importaron ${imported} de ${selectedBanners.length} banners correctamente.`);
    setImportPreview(null);
    loadAllBanners();
    setSaving(false);
  };

  const importBanners = importPreview?.data || [];
  const filteredImport = importFilter === 'all'
    ? importBanners
    : importBanners.filter(b => b.source === importFilter);

  const SOURCE_LABELS = { revslider: '🖼️ Slider Revolution', woo_category: '🏷️ Categorías WooCommerce', media_library: '📁 Media Library' };

  const sectionInfo = SECTIONS.find(s => s.key === activeSection);

  return (
    <div>
      {/* Header con botones */}
      <div className="ge-header">
        <div className="ge-title">
          <h2>Gestión de Banners</h2>
          <p>Administra los sliders y promociones de la tienda</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {allBanners.length === 0 && (
            <button
              className="ge-btn"
              style={{ backgroundColor: '#7c3aed', color: 'white' }}
              onClick={handleFetchWpBanners}
              disabled={importing}
            >
              {importing ? "Consultando..." : "📥 Importar desde WordPress"}
            </button>
          )}
          <button
            className="ge-btn"
            style={{ backgroundColor: '#059669', color: 'white' }}
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? "Publicando..." : "🚀 Publicar en tienda"}
          </button>
          <button className="ge-btn" style={{ backgroundColor: '#2563eb', color: 'white' }} onClick={openCreate}>
            + Nuevo Banner
          </button>
        </div>
      </div>

      {/* Panel de importación desde WordPress */}
      {importPreview && (
        <div className="ge-card" style={{ padding: '24px', marginBottom: '24px', borderLeft: '4px solid #7c3aed' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 600, color: '#7c3aed' }}>
            📥 Imágenes encontradas en WordPress ({importBanners.length})
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px' }}>
            Fuentes detectadas:
            {importPreview.sources?.revslider && ' ✅ Slider Revolution'}
            {importPreview.sources?.woo_categories && ' ✅ Categorías WooCommerce'}
            {importPreview.sources?.media_library && ' ✅ Media Library'}
          </p>

          {/* Filtro por fuente */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {['all', 'revslider', 'woo_category', 'media_library'].map(f => {
              const count = f === 'all' ? importBanners.length : importBanners.filter(b => b.source === f).length;
              if (f !== 'all' && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setImportFilter(f)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
                    border: importFilter === f ? '2px solid #7c3aed' : '2px solid #e5e7eb',
                    background: importFilter === f ? '#f5f3ff' : 'white',
                    color: importFilter === f ? '#7c3aed' : '#6b7280',
                    fontWeight: importFilter === f ? 600 : 400,
                  }}
                >
                  {f === 'all' ? `Todas (${count})` : `${SOURCE_LABELS[f] || f} (${count})`}
                </button>
              );
            })}
          </div>

          {/* Grid de preview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {filteredImport.map((b, idx) => (
              <div key={idx} style={{
                borderRadius: '10px', overflow: 'hidden', border: '1px solid #e9d5ff',
                background: 'white', transition: 'transform 0.15s',
              }}>
                <img
                  src={b.image_url}
                  alt={b.title}
                  style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <div style={{ padding: '10px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.title}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem',
                      background: b.section === 'home_slider' ? '#dbeafe' : '#fef3c7',
                      color: b.section === 'home_slider' ? '#1d4ed8' : '#92400e'
                    }}>
                      {b.section === 'home_slider' ? 'Slider' : 'Tile'}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem',
                      background: '#f3f4f6', color: '#6b7280'
                    }}>
                      {SOURCE_LABELS[b.source] || b.source}
                    </span>
                  </div>
                  {b.slider_name && b.source === 'revslider' && (
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>
                      Slider: {b.slider_name}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredImport.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              No hay imágenes de esta fuente.
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="ge-btn"
              style={{ backgroundColor: '#7c3aed', color: 'white' }}
              onClick={() => handleImportBanners(filteredImport)}
              disabled={saving || filteredImport.length === 0}
            >
              {saving ? "Importando..." : `✅ Importar ${filteredImport.length === importBanners.length ? 'todas' : 'filtradas'} (${filteredImport.length})`}
            </button>
            <button
              className="ge-btn"
              style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db' }}
              onClick={() => setImportPreview(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabs de sección */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        {SECTIONS.map(sec => (
          <button
            key={sec.key}
            onClick={() => { setActiveSection(sec.key); resetForm(); }}
            className="ge-card"
            style={{
              flex: 1, padding: '16px', cursor: 'pointer', textAlign: 'center',
              border: activeSection === sec.key ? '2px solid #2563eb' : '2px solid transparent',
              background: activeSection === sec.key ? '#eff6ff' : 'white',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>{sec.label}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{sec.desc}</div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '6px' }}>
              {allBanners.filter(b => b.section === sec.key).length} banners
              · {allBanners.filter(b => b.section === sec.key && b.active).length} activos
            </div>
          </button>
        ))}
      </div>

      {/* Formulario crear/editar */}
      {showForm && (
        <div className="ge-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 600 }}>
            {editingBanner ? "Editar Banner" : `Nuevo Banner — ${sectionInfo?.label || activeSection}`}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Título</label>
              <input
                className="ge-input"
                style={{ width: '100%' }}
                placeholder="Ej: Promo Semana Santa"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '4px' }}>URL de destino</label>
              <input
                className="ge-input"
                style={{ width: '100%' }}
                placeholder="https://tienda.com/promo"
                value={form.link_url}
                onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
              />
            </div>
          </div>

          {/* Imagen */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '8px' }}>Imagen del Banner</label>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div>
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                {uploading && <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: '8px' }}>Subiendo...</span>}
                {form.image_url && (
                  <input
                    className="ge-input"
                    style={{ width: '100%', marginTop: '8px', fontSize: '0.8rem' }}
                    value={form.image_url}
                    onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                    placeholder="O pega URL directamente"
                  />
                )}
              </div>
              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="Preview"
                  style={{ width: '200px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              />
              Activo
            </label>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, marginRight: '6px' }}>Orden:</label>
              <input
                type="number"
                className="ge-input"
                style={{ width: '60px' }}
                value={form.display_order}
                onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button
              className="ge-btn"
              style={{ backgroundColor: '#2563eb', color: 'white' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Guardando..." : (editingBanner ? "Actualizar" : "Crear Banner")}
            </button>
            <button
              className="ge-btn"
              style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db' }}
              onClick={resetForm}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Grid de banners de la sección activa */}
      {loading ? (
        <div className="ge-card" style={{ padding: '40px', textAlign: 'center' }}>Cargando banners...</div>
      ) : banners.length === 0 ? (
        <div className="ge-card" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          No hay banners en "{sectionInfo?.label}". Crea el primero.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {banners.map((banner, idx) => (
            <div
              key={banner.id}
              className="ge-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                opacity: banner.active ? 1 : 0.5,
                transition: 'opacity 0.2s'
              }}
            >
              {/* Reorder arrows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  onClick={() => handleReorder(banner.id, 'up')}
                  disabled={idx === 0}
                  style={{
                    border: 'none', background: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                    fontSize: '1rem', color: idx === 0 ? '#d1d5db' : '#6b7280', padding: '2px 6px'
                  }}
                >▲</button>
                <button
                  onClick={() => handleReorder(banner.id, 'down')}
                  disabled={idx === banners.length - 1}
                  style={{
                    border: 'none', background: 'none', cursor: idx === banners.length - 1 ? 'default' : 'pointer',
                    fontSize: '1rem', color: idx === banners.length - 1 ? '#d1d5db' : '#6b7280', padding: '2px 6px'
                  }}
                >▼</button>
              </div>

              {/* Thumbnail */}
              <img
                src={banner.image_url}
                alt={banner.title || 'Banner'}
                style={{
                  width: '180px', height: '72px', objectFit: 'cover',
                  borderRadius: '8px', border: '1px solid #e5e7eb', flexShrink: 0
                }}
              />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                  {banner.title || '(Sin título)'}
                </div>
                {banner.link_url && (
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🔗 {banner.link_url}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
                  Orden: {banner.display_order}
                </div>
              </div>

              {/* Status badge */}
              <span
                style={{
                  padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                  background: banner.active ? '#dcfce7' : '#f3f4f6',
                  color: banner.active ? '#166534' : '#9ca3af'
                }}
              >
                {banner.active ? 'Activo' : 'Inactivo'}
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  className="ge-btn"
                  style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'white', border: '1px solid #d1d5db', color: '#374151' }}
                  onClick={() => handleToggleActive(banner)}
                >
                  {banner.active ? '⏸' : '▶'}
                </button>
                <button
                  className="ge-btn"
                  style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'white', border: '1px solid #2563eb', color: '#2563eb' }}
                  onClick={() => openEdit(banner)}
                >
                  ✏️
                </button>
                <button
                  className="ge-btn"
                  style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'white', border: '1px solid #ef4444', color: '#ef4444' }}
                  onClick={() => handleDelete(banner.id)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nota de configuración */}
      <div className="ge-card" style={{ padding: '16px', marginTop: '20px', background: '#fffbeb', borderLeft: '4px solid #f59e0b' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>💡 Integración WordPress</div>
        <div style={{ fontSize: '0.8rem', color: '#78716c', lineHeight: 1.5 }}>
          Después de modificar banners, pulsa <strong>"🚀 Publicar en tienda"</strong> para que los cambios se reflejen inmediatamente en WordPress.
          Sin publicar, los cambios aparecerán automáticamente en máximo 5 minutos.
        </div>
      </div>
    </div>
  );
}
