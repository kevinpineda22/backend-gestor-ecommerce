import React, { useState, useEffect, useRef } from "react";
import { fetchBanners, createBanner, updateBanner, deleteBanner, uploadImage, SEDE_WP_URLS } from "../services";
import "../GestorEcommerce.css";
import "./BannerManager.css";
const SECTIONS = [
  { key: "home_slider", label: "🖼️ Slider Principal", desc: "Banner grande rotativo del inicio" },
  { key: "home_tiles", label: "🏷️ Tiles Promocionales", desc: "Cuadros pequeños debajo del slider" },
];

const FAKE_CATEGORIES = [
  "ASEO DEL HOGAR", "BEBIDAS", "BELLEZA", "CARNES Y PROTEÍNAS", "CONGELADOS",
  "CUIDADO DEL BEBÉ", "CUIDADO PERSONAL", "FRUTAS Y VERDURAS", "HELADOS",
  "IMPLEMENTOS DEL HOGAR", "LÁCTEOS, HUEVOS Y REFRIGERADOS", "LICORES Y CIGARRILLOS",
  "MASCOTAS", "MERCADO", "SALUDABLE"
];

export default function BannerManager({ sedes = [], sedeActual = null, esAdminGlobal = false }) {
  const [allBanners, setAllBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [activeSection, setActiveSection] = useState("home_slider");
  const [publishing, setPublishing] = useState(false);
  const userSedeCode = sedeActual?.codigo_siesa || sedeActual?.slug || null;
  const [sedeFilter, setSedeFilter] = useState(esAdminGlobal ? 'all' : (userSedeCode || 'all'));
  const [showPreview, setShowPreview] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const formRef = useRef(null);

  // Scroll suave al formulario cuando se abre
  const scrollToForm = () => {
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Form state
  const [form, setForm] = useState({
    title: "", image_url: "", link_url: "", active: true, display_order: 0, section: "home_slider", sedes: null
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

  // Filtrar por sección activa + sede
  const banners = allBanners
    .filter(b => b.section === activeSection)
    .filter(b => {
      // Encargado sede: solo ve banners de su sede + globales
      if (!esAdminGlobal && userSedeCode) {
        return (!b.sedes || b.sedes.length === 0) || (b.sedes && b.sedes.includes(userSedeCode));
      }
      if (sedeFilter === 'all') return true;
      if (sedeFilter === 'global') return !b.sedes || b.sedes.length === 0;
      return b.sedes && b.sedes.includes(sedeFilter);
    })
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  // Para Storefront Preview — si es sede específica, incluir los de esa sede + globales
  const previewFilterFn = (b) => {
    if (!b.active) return false;
    if (sedeFilter === 'all') return true;
    if (sedeFilter === 'global') return !b.sedes || b.sedes.length === 0;
    // Sede específica: mostrar los asignados a esa sede + los globales (sin sedes)
    return (b.sedes && b.sedes.includes(sedeFilter)) || !b.sedes || b.sedes.length === 0;
  };

  const previewSliders = allBanners
    .filter(b => b.section === 'home_slider' && previewFilterFn(b))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const previewTiles = allBanners
    .filter(b => b.section === 'home_tiles' && previewFilterFn(b))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  // Conteos por sede para badges
  const bannersInSection = allBanners.filter(b => b.section === activeSection);
  const sedeCountAll = bannersInSection.length;
  const sedeCountGlobal = bannersInSection.filter(b => !b.sedes || b.sedes.length === 0).length;

  const resetForm = () => {
    setForm({ title: "", image_url: "", link_url: "", active: true, display_order: 0, section: activeSection, sedes: null });
    setEditingBanner(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setForm(f => ({ ...f, section: activeSection, display_order: banners.length, sedes: esAdminGlobal ? null : (userSedeCode ? [userSedeCode] : null) }));
    setShowForm(true);
    scrollToForm();
  };

  const openEdit = (banner) => {
    setEditingBanner(banner);
    setForm({
      title: banner.title || "", image_url: banner.image_url || "", link_url: banner.link_url || "",
      active: banner.active, display_order: banner.display_order || 0, section: banner.section || "home_slider",
      sedes: banner.sedes || null
    });
    setShowForm(true);
    scrollToForm();
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

  // ── Drag & Drop ──
  const handleDragStart = (e, bannerId) => {
    setDraggedId(bannerId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', bannerId);
  };

  const handleDragOver = (e, bannerId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (bannerId !== dragOverId) setDragOverId(bannerId);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    if (draggedId == null || dragOverId == null || draggedId === dragOverId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = banners.findIndex(b => b.id === draggedId);
    const toIdx = banners.findIndex(b => b.id === dragOverId);
    if (fromIdx < 0 || toIdx < 0) { setDraggedId(null); setDragOverId(null); return; }

    const updated = [...banners];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);

    // Optimistic UI update
    setAllBanners(prev => {
      const other = prev.filter(b => b.section !== activeSection);
      return [...other, ...updated.map((b, i) => ({ ...b, display_order: i }))];
    });
    setDraggedId(null);
    setDragOverId(null);

    // Persist
    const promises = updated.map((b, i) => updateBanner(b.id, { display_order: i }));
    await Promise.all(promises);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handlePublish = async () => {
    setPublishing(true);
    // Non-admin: only publish to their sede
    const urls = esAdminGlobal
      ? Object.entries(SEDE_WP_URLS)
      : Object.entries(SEDE_WP_URLS).filter(([code]) => code === userSedeCode);
    const results = [];
    for (const [code, url] of urls) {
      try {
        const res = await fetch(`${url}/wp-json/merkahorro/v1/clear-cache?key=merkahorro2026`);
        results.push({ code, ok: res.ok });
      } catch {
        results.push({ code, ok: false });
      }
    }
    const ok = results.filter(r => r.ok).length;
    const fail = results.filter(r => !r.ok).length;
    if (fail === 0) {
      alert(`✅ Caché limpiado en las ${ok} sedes. Los cambios ya están visibles.`);
    } else {
      alert(`⚠️ Caché limpiado en ${ok} de ${urls.length} sedes. ${fail} fallaron.`);
    }
    setPublishing(false);
  };

  const sectionInfo = SECTIONS.find(s => s.key === activeSection);

  const getSedeLabel = (code) => sedes.find(s => (s.codigo_siesa || s.slug) === code)?.nombre || code;

  return (
    <div>
      {/* Header */}
      <div className="ge-header">
        <div className="ge-title">
          <h2>Gestion de Banners</h2>
          <p>Administra los sliders y promociones de la tienda</p>
        </div>
        <div className="ge-header-actions">
          <button className="ge-btn accent" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Publicando..." : "Publicar en tienda"}
          </button>
          <button className="ge-btn" onClick={openCreate}>+ Nuevo Banner</button>
        </div>
      </div>

      {/* Filtro por sede + preview toggle */}
      <div className="bm-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
        {esAdminGlobal && sedes.length > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', background: 'var(--ge-primary-light)', borderRadius: 'var(--ge-radius)',
              border: '1px solid var(--ge-primary-ring)'
            }}>
              <span style={{ fontSize: '0.9rem' }}>📍</span>
              <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--ge-primary)' }}>Vista Sede:</span>
            </div>
            {[{ key: 'all', label: 'Todas', count: sedeCountAll }, { key: 'global', label: '🌐 Globales', count: sedeCountGlobal }].map(f => (
              <button key={f.key} className={`ge-pill ${sedeFilter === f.key ? 'active' : ''}`} onClick={() => setSedeFilter(f.key)}>
                {f.label} ({f.count})
              </button>
            ))}
            {sedes.map(s => {
              const code = s.codigo_siesa || s.slug;
              const count = bannersInSection.filter(b => b.sedes && b.sedes.includes(code)).length;
              return (
                <button key={code} className={`ge-pill ${sedeFilter === code ? 'active-accent' : ''}`} onClick={() => setSedeFilter(code)}>
                  {s.nombre} ({count})
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem' }}>🏪</span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ge-primary)' }}>
              {sedeActual?.nombre || 'Mi Sede'}
            </span>
            {!esAdminGlobal && (
              <span style={{ fontSize: '0.72rem', color: 'var(--ge-text-muted)', fontStyle: 'italic' }}>
                (banners de tu sede + globales)
              </span>
            )}
          </div>
        )}

        <button
          className="bm-preview-toggle-btn"
          onClick={() => { setShowPreview(true); setCurrentSlide(0); }}
        >
          👁️ Vista Previa Tienda
        </button>
      </div>

      {/* ══════════ MODAL STOREFRONT PREVIEW ══════════ */}
      {showPreview && (
        <div className="bm-preview-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}>
          <div className="bm-preview-modal">
            {/* Modal Header */}
            <div className="bm-preview-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--ge-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: 'white', flexShrink: 0 }}>👁️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ge-text-dark)' }}>Vista Previa — Tienda Virtual</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ge-text-muted)' }}>
                    {previewSliders.length} sliders · {previewTiles.length} tiles activos
                  </div>
                </div>
              </div>
              <button className="bm-preview-close" onClick={() => setShowPreview(false)}>✕</button>
            </div>

            {/* Simulated Store */}
            <div className="bm-store-container">
              {/* Main Content: Sidebar + Slider */}
              <div className="bm-store-body">
                {/* Categories Sidebar */}
                <div className="bm-store-sidebar">
                  <div className="bm-store-sidebar-title">Categorías</div>
                  {FAKE_CATEGORIES.map((cat, i) => (
                    <div key={i} className="bm-store-sidebar-item">
                      <span>{cat}</span>
                      <span style={{ color: '#bbb', fontSize: '0.7rem' }}>›</span>
                    </div>
                  ))}
                </div>

                {/* Slider Area */}
                <div className="bm-store-slider-area">
                  {previewSliders.length > 0 ? (
                    <div className="bm-store-slider">
                      <img
                        src={previewSliders[currentSlide % previewSliders.length]?.image_url}
                        alt="Slider"
                        className="bm-store-slider-img"
                      />
                      {/* Slider Controls */}
                      {previewSliders.length > 1 && (
                        <>
                          <button className="bm-store-slider-arrow left" onClick={() => setCurrentSlide(p => (p - 1 + previewSliders.length) % previewSliders.length)}>‹</button>
                          <button className="bm-store-slider-arrow right" onClick={() => setCurrentSlide(p => (p + 1) % previewSliders.length)}>›</button>
                          <div className="bm-store-slider-dots">
                            {previewSliders.map((_, i) => (
                              <span key={i} className={`bm-store-slider-dot ${i === currentSlide % previewSliders.length ? 'active' : ''}`} onClick={() => setCurrentSlide(i)} />
                            ))}
                          </div>
                        </>
                      )}
                      {/* Slide counter */}
                      <div className="bm-store-slider-counter">
                        {(currentSlide % previewSliders.length) + 1} / {previewSliders.length}
                      </div>
                    </div>
                  ) : (
                    <div className="bm-store-slider-empty">
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🖼️</div>
                      No hay sliders activos para esta sede
                    </div>
                  )}
                </div>
              </div>

              {/* Tiles Row */}
              <div className="bm-store-tiles-row">
                {previewTiles.length > 0 ? (
                  previewTiles.map((tile, i) => (
                    <div key={tile.id} className="bm-store-tile">
                      <img src={tile.image_url} alt={tile.title || `Tile ${i + 1}`} />
                    </div>
                  ))
                ) : (
                  [0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="bm-store-tile empty">
                      <span>Tile {i + 1}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs de sección */}
      <div className="ge-tabs">
        {SECTIONS.map(sec => (
          <button
            key={sec.key}
            onClick={() => { setActiveSection(sec.key); resetForm(); }}
            className={`ge-tab ${activeSection === sec.key ? 'active' : ''}`}
          >
            <div className="ge-tab-label">{sec.label}</div>
            <div className="ge-tab-desc">{sec.desc}</div>
            <div className="ge-tab-count">
              {allBanners.filter(b => b.section === sec.key).length} banners
              · {allBanners.filter(b => b.section === sec.key && b.active).length} activos
            </div>
          </button>
        ))}
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bm-form-panel" ref={formRef}>
          <div className="bm-form-header">
            <div className="bm-form-header-icon">{editingBanner ? '✏️' : '➕'}</div>
            <div>
              <div className="bm-form-header-title">{editingBanner ? 'Editar Banner' : 'Nuevo Banner'}</div>
              <div className="bm-form-header-sub">{sectionInfo?.label || activeSection}</div>
            </div>
          </div>

          <div className="bm-form-body">
            {/* Image Upload — prominent area */}
            <div className="bm-form-image-section">
              <label className="bm-form-label">Imagen del Banner</label>
              <div className="bm-form-help">
                {form.section === 'home_slider'
                  ? '📐 Recomendado: 1200×1000px'
                  : '📐 Recomendado: 540×720px'}
              </div>
              {form.image_url ? (
                <div className="bm-form-image-preview">
                  <img src={form.image_url} alt="Preview" />
                  <div className="bm-form-image-overlay">
                    <label className="ge-btn sm">
                      📷 Cambiar imagen
                      <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="bm-form-upload-zone">
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: 'none' }} />
                  <div className="bm-form-upload-icon">{uploading ? '⏳' : '📁'}</div>
                  <div className="bm-form-upload-text">{uploading ? 'Subiendo...' : 'Haz clic para seleccionar imagen'}</div>
                  <div className="bm-form-upload-hint">JPG, PNG o WebP</div>
                </label>
              )}
              {form.image_url && (
                <input className="ge-input ge-input-sm" style={{ marginTop: 8 }} value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="O pega URL directamente" />
              )}
            </div>

            {/* Fields row */}
            <div className="bm-form-fields">
              <div className="bm-form-field">
                <label className="bm-form-label">Título</label>
                <input className="ge-input" placeholder="Ej: Promo Semana Santa" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="bm-form-field">
                <label className="bm-form-label">URL de destino</label>
                <input className="ge-input" placeholder="https://tienda.com/promo" value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} />
              </div>
              <div className="bm-form-field" style={{ maxWidth: 100 }}>
                <label className="bm-form-label">Orden</label>
                <input type="number" className="ge-input" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Active toggle + Sedes */}
            <div className="bm-form-options">
              <label className="bm-form-toggle">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                <span className="bm-form-toggle-slider"></span>
                <span>{form.active ? 'Activo' : 'Inactivo'}</span>
              </label>
            </div>

            {/* Selector de sedes */}
            {esAdminGlobal && sedes.length > 1 && (
              <div className="bm-form-sedes">
                <label className="bm-form-label">Visible en sedes</label>
                <div className="bm-form-sedes-pills">
                  <button type="button" className={`ge-pill ${form.sedes === null ? 'active' : ''}`} onClick={() => setForm(f => ({ ...f, sedes: null }))}>
                    🌐 Todas
                  </button>
                  {sedes.map(s => {
                    const code = s.codigo_siesa || s.slug;
                    const isSelected = Array.isArray(form.sedes) && form.sedes.includes(code);
                    return (
                      <button key={s.id} type="button" className={`ge-pill ${isSelected ? 'active-accent' : ''}`}
                        onClick={() => {
                          setForm(f => {
                            const cur = Array.isArray(f.sedes) ? [...f.sedes] : [];
                            if (isSelected) { const next = cur.filter(c => c !== code); return { ...f, sedes: next.length === 0 ? null : next }; }
                            return { ...f, sedes: [...cur, code] };
                          });
                        }}
                      >
                        {s.nombre}
                      </button>
                    );
                  })}
                </div>
                <div className="bm-form-help">
                  {form.sedes === null ? '🌐 Se mostrará en todas las sedes' : `📍 Solo en: ${form.sedes.map(c => getSedeLabel(c)).join(', ')}`}
                </div>
              </div>
            )}

            <div className="bm-form-actions">
              <button className="ge-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : (editingBanner ? '✅ Actualizar Banner' : '✅ Crear Banner')}
              </button>
              <button className="ge-btn secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de banners */}
      {loading ? (
        <div className="ge-card ge-empty">
          <div className="bm-loading-spinner"></div>
          <span>Cargando banners...</span>
        </div>
      ) : banners.length === 0 ? (
        <div className="ge-card ge-empty bm-empty-state">
          <div className="bm-empty-icon">{activeSection === 'home_slider' ? '🖼' : '🏷'}</div>
          <div className="bm-empty-title">No hay banners en "{sectionInfo?.label}"</div>
          <div className="bm-empty-desc">Crea el primero para comenzar a personalizar tu tienda</div>
          <button className="ge-btn" onClick={openCreate} style={{ marginTop: 12 }}>+ Crear Banner</button>
        </div>
      ) : (
        <div className="bm-banner-list">
          <div className="bm-list-header">
            <span className="bm-list-col-pos">#</span>
            <span className="bm-list-col-img">Imagen</span>
            <span className="bm-list-col-info">Informacion</span>
            <span className="bm-list-col-status">Estado</span>
            <span className="bm-list-col-actions">Acciones</span>
          </div>
          {banners.map((banner, idx) => (
            <div
              key={banner.id}
              className={`bm-list-row ${banner.active ? '' : 'dimmed'} ${draggedId === banner.id ? 'bm-dragging' : ''} ${dragOverId === banner.id && draggedId !== banner.id ? 'bm-drag-over' : ''} ${editingBanner?.id === banner.id ? 'bm-editing' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, banner.id)}
              onDragOver={(e) => handleDragOver(e, banner.id)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              {/* Position & Reorder */}
              <div className="bm-list-position">
                <span className="bm-drag-handle" title="Arrastrar para reordenar">⠿</span>
                <span className="bm-list-pos-number">{idx + 1}</span>
                <div className="bm-list-pos-arrows">
                  <button className="bm-arrow-btn" onClick={() => handleReorder(banner.id, 'up')} disabled={idx === 0} title="Subir">▲</button>
                  <button className="bm-arrow-btn" onClick={() => handleReorder(banner.id, 'down')} disabled={idx === banners.length - 1} title="Bajar">▼</button>
                </div>
              </div>
              {/* Thumbnail */}
              <div className="bm-list-thumb-wrap">
                <img src={banner.image_url} alt={banner.title || 'Banner'} className="bm-list-thumb" />
              </div>
              {/* Info */}
              <div className="bm-list-info">
                <div className="bm-list-title">{banner.title || '(Sin título)'}</div>
                {banner.link_url && <div className="bm-list-link">🔗 {banner.link_url}</div>}
                <div className="bm-list-meta">
                  {banner.sedes ? (
                    banner.sedes.map((code, i) => <span key={i} className="ge-chip sede">{getSedeLabel(code)}</span>)
                  ) : (
                    <span className="ge-chip global">Todas las sedes</span>
                  )}
                </div>
              </div>
              {/* Status */}
              <div className="bm-list-status">
                <span className={`bm-status-dot ${banner.active ? 'on' : 'off'}`}></span>
                <span className="bm-status-label">{banner.active ? 'Activo' : 'Inactivo'}</span>
              </div>
              {/* Actions */}
              <div className="bm-list-actions">
                <button className="bm-action-btn toggle" onClick={() => handleToggleActive(banner)} title={banner.active ? 'Desactivar' : 'Activar'}>{banner.active ? '⏸' : '▶'}</button>
                <button className="bm-action-btn edit" onClick={() => openEdit(banner)} title="Editar">✏️</button>
                <button className="bm-action-btn delete" onClick={() => handleDelete(banner.id)} title="Eliminar">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nota */}
      <div className="ge-note">
        <div className="ge-note-title">💡 Integración WordPress</div>
        <div className="ge-note-body">
          Después de modificar banners, pulsa <strong>"🚀 Publicar en tienda"</strong> para que los cambios se reflejen inmediatamente en WordPress.
          Sin publicar, los cambios aparecerán automáticamente en máximo 5 minutos.
        </div>
      </div>
    </div>
  );
}
