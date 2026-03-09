import React, { useState, useEffect, useCallback } from "react";
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

const FAKE_NAV = ["INICIO", "PRODUCTOS", "CARNES Y PROTEÍNAS", "FRUTAS Y VERDURAS", "LÁCTEOS"];

export default function BannerManager({ sedes = [], sedeActual = null, esAdminGlobal = false }) {
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
  const [importFilter, setImportFilter] = useState('all');
  const [sedeFilter, setSedeFilter] = useState('all');
  const [importSede, setImportSede] = useState(sedeActual || 'PV001');
  const [showPreview, setShowPreview] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

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
      if (sedeFilter === 'all') return true;
      if (sedeFilter === 'global') return !b.sedes || b.sedes.length === 0;
      return b.sedes && b.sedes.includes(sedeFilter);
    })
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  // Para Storefront Preview
  const previewSliders = allBanners
    .filter(b => b.section === 'home_slider' && b.active && (sedeFilter === 'all' || (sedeFilter === 'global' ? (!b.sedes || b.sedes.length === 0) : b.sedes?.includes(sedeFilter))))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const previewTiles = allBanners
    .filter(b => b.section === 'home_tiles' && b.active && (sedeFilter === 'all' || (sedeFilter === 'global' ? (!b.sedes || b.sedes.length === 0) : b.sedes?.includes(sedeFilter))))
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
    setForm(f => ({ ...f, section: activeSection, display_order: banners.length, sedes: null }));
    setShowForm(true);
  };

  const openEdit = (banner) => {
    setEditingBanner(banner);
    setForm({
      title: banner.title || "", image_url: banner.image_url || "", link_url: banner.link_url || "",
      active: banner.active, display_order: banner.display_order || 0, section: banner.section || "home_slider",
      sedes: banner.sedes || null
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
    const urls = Object.entries(SEDE_WP_URLS);
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

  // --- Importar banners desde WordPress ---
  const handleFetchWpBanners = async () => {
    setImporting(true);
    try {
      const wpUrl = SEDE_WP_URLS[importSede] || SEDE_WP_URLS['PV001'];
      const res = await fetch(`${wpUrl}/wp-json/merkahorro/v1/wp-banners?key=merkahorro2026`);
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

  const getSedeLabel = (code) => sedes.find(s => (s.codigo_siesa || s.slug) === code)?.nombre || code;

  return (
    <div>
      {/* Header */}
      <div className="ge-header">
        <div className="ge-title">
          <h2>Gestión de Banners</h2>
          <p>Administra los sliders y promociones de la tienda</p>
        </div>
        <div className="ge-header-actions">
          <select className="ge-input ge-input-sm" value={importSede} onChange={e => setImportSede(e.target.value)} style={{ width: 'auto' }}>
            {Object.entries(SEDE_WP_URLS).map(([code]) => (
              <option key={code} value={code}>{getSedeLabel(code)}</option>
            ))}
          </select>
          <button className="ge-btn info" onClick={handleFetchWpBanners} disabled={importing}>
            {importing ? "Consultando..." : "📥 Importar desde WP"}
          </button>
          <button className="ge-btn accent" onClick={handlePublish} disabled={publishing}>
            {publishing ? "Publicando..." : "🚀 Publicar en tienda"}
          </button>
          <button className="ge-btn" onClick={openCreate}>+ Nuevo Banner</button>
        </div>
      </div>

      {/* Panel de importación */}
      {importPreview && (
        <div className="ge-card ge-import-panel">
          <h3 className="ge-import-title">📥 Imágenes encontradas en WordPress ({importBanners.length})</h3>
          <p className="ge-import-subtitle">
            Fuentes detectadas:
            {importPreview.sources?.revslider && ' ✅ Slider Revolution'}
            {importPreview.sources?.woo_categories && ' ✅ Categorías WooCommerce'}
            {importPreview.sources?.media_library && ' ✅ Media Library'}
          </p>

          <div className="ge-row-meta" style={{ marginBottom: 16 }}>
            {['all', 'revslider', 'woo_category', 'media_library'].map(f => {
              const count = f === 'all' ? importBanners.length : importBanners.filter(b => b.source === f).length;
              if (f !== 'all' && count === 0) return null;
              return (
                <button key={f} className={`ge-pill ${importFilter === f ? 'active' : ''}`} onClick={() => setImportFilter(f)}>
                  {f === 'all' ? `Todas (${count})` : `${SOURCE_LABELS[f] || f} (${count})`}
                </button>
              );
            })}
          </div>

          <div className="ge-import-grid">
            {filteredImport.map((b, idx) => (
              <div key={idx} className="ge-import-item">
                <img src={b.image_url} alt={b.title} onError={e => { e.target.style.display = 'none'; }} />
                <div className="ge-import-item-body">
                  <div className="ge-import-item-title">{b.title}</div>
                  <div className="ge-row-meta">
                    <span className={`ge-chip ${b.section === 'home_slider' ? 'global' : 'product'}`}>
                      {b.section === 'home_slider' ? 'Slider' : 'Tile'}
                    </span>
                    <span className="ge-chip source">{SOURCE_LABELS[b.source] || b.source}</span>
                  </div>
                  {b.slider_name && b.source === 'revslider' && (
                    <div className="ge-form-help">Slider: {b.slider_name}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredImport.length === 0 && <div className="ge-empty">No hay imágenes de esta fuente.</div>}

          <div className="ge-form-actions">
            <button className="ge-btn info" onClick={() => handleImportBanners(filteredImport)} disabled={saving || filteredImport.length === 0}>
              {saving ? "Importando..." : `✅ Importar ${filteredImport.length === importBanners.length ? 'todas' : 'filtradas'} (${filteredImport.length})`}
            </button>
            <button className="ge-btn secondary" onClick={() => setImportPreview(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Filtro por sede + preview toggle */}
      <div className="bm-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
        {sedes.length > 1 ? (
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
        ) : <div />}

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
                    {sedeFilter === 'all' ? 'Todas las sedes' : sedeFilter === 'global' ? '🌐 Globales' : getSedeLabel(sedeFilter)}
                    {' · '}{previewSliders.length} sliders · {previewTiles.length} tiles activos
                  </div>
                </div>
              </div>
              <button className="bm-preview-close" onClick={() => setShowPreview(false)}>✕</button>
            </div>

            {/* Simulated Store */}
            <div className="bm-store-container">
              {/* Top Nav Bar */}
              <div className="bm-store-topnav">
                <div className="bm-store-topnav-inner">
                  {FAKE_NAV.map((item, i) => (
                    <span key={i} className={`bm-store-topnav-item ${i === 0 ? 'active' : ''}`}>{item}</span>
                  ))}
                  <span className="bm-store-topnav-item muted">Vistos recientemente ▾</span>
                </div>
              </div>

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
        <div className="ge-card pad" style={{ marginBottom: 24 }}>
          <h3 className="ge-import-title" style={{ color: 'var(--ge-text-dark)' }}>
            {editingBanner ? "Editar Banner" : `Nuevo Banner — ${sectionInfo?.label || activeSection}`}
          </h3>

          <div className="ge-form">
            <div className="ge-form-row">
              <div className="ge-form-group">
                <label>Título</label>
                <input className="ge-input" placeholder="Ej: Promo Semana Santa" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="ge-form-group">
                <label>URL de destino</label>
                <input className="ge-input" placeholder="https://tienda.com/promo" value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} />
              </div>
            </div>

            <div className="ge-form-group">
              <label>Imagen del Banner</label>
              <div className="ge-form-help" style={{ marginBottom: 8 }}>
                {form.section === 'home_slider'
                  ? '📐 Tamaño recomendado: 1200×800px (proporción 3:2). Mínimo 1200px de ancho.'
                  : '📐 Tamaño recomendado: 600×800px (proporción 3:4, vertical). Mínimo 450px de ancho.'}
              </div>
              <div className="ge-upload-area">
                <div>
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                  {uploading && <span className="ge-form-help">Subiendo...</span>}
                  {form.image_url && (
                    <input className="ge-input ge-input-sm" style={{ marginTop: 8 }} value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="O pega URL directamente" />
                  )}
                </div>
                {form.image_url && <img src={form.image_url} alt="Preview" className="ge-upload-preview" />}
              </div>
            </div>

            <div className="ge-row-meta">
              <label className="ge-form-check">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Activo
              </label>
              <div className="ge-form-check">
                <span>Orden:</span>
                <input type="number" className="ge-input ge-input-sm" style={{ width: 60 }} value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Selector de sedes */}
            {sedes.length > 1 && (
              <div className="ge-form-group">
                <label>Visible en sedes</label>
                <div className="ge-row-meta">
                  <button type="button" className={`ge-pill ${form.sedes === null ? 'active' : ''}`} onClick={() => setForm(f => ({ ...f, sedes: null }))}>
                    Todas las sedes
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
                <div className="ge-form-help">
                  {form.sedes === null ? '🌐 Se mostrará en todas las sedes' : `📍 Solo en: ${form.sedes.map(c => getSedeLabel(c)).join(', ')}`}
                </div>
              </div>
            )}

            <div className="ge-form-actions">
              <button className="ge-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : (editingBanner ? "Actualizar" : "Crear Banner")}
              </button>
              <button className="ge-btn secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de banners */}
      {loading ? (
        <div className="ge-card ge-empty">Cargando banners...</div>
      ) : banners.length === 0 ? (
        <div className="ge-card ge-empty">No hay banners en "{sectionInfo?.label}". Crea el primero.</div>
      ) : (
        <div className="ge-card">
          {banners.map((banner, idx) => (
            <div key={banner.id} className={`ge-row ${banner.active ? '' : 'dimmed'}`}>
              <div className="ge-row-reorder">
                <button onClick={() => handleReorder(banner.id, 'up')} disabled={idx === 0}>▲</button>
                <button onClick={() => handleReorder(banner.id, 'down')} disabled={idx === banners.length - 1}>▼</button>
              </div>
              <img src={banner.image_url} alt={banner.title || 'Banner'} className="ge-row-thumb" />
              <div className="ge-row-info">
                <div className="ge-row-title">{banner.title || '(Sin título)'}</div>
                {banner.link_url && <div className="ge-row-subtitle">🔗 {banner.link_url}</div>}
                <div className="ge-row-meta">
                  <span className="order">Orden: {banner.display_order}</span>
                  {banner.sedes ? (
                    banner.sedes.map((code, i) => <span key={i} className="ge-chip sede">{getSedeLabel(code)}</span>)
                  ) : (
                    <span className="ge-chip global">Todas las sedes</span>
                  )}
                </div>
              </div>
              <span className={`ge-badge ${banner.active ? 'active' : 'inactive'}`}>
                {banner.active ? 'Activo' : 'Inactivo'}
              </span>
              <div className="ge-row-actions">
                <button className="ge-btn icon outline-muted" onClick={() => handleToggleActive(banner)}>{banner.active ? '⏸' : '▶'}</button>
                <button className="ge-btn icon outline-primary" onClick={() => openEdit(banner)}>✏️</button>
                <button className="ge-btn icon outline-danger" onClick={() => handleDelete(banner.id)}>🗑️</button>
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
