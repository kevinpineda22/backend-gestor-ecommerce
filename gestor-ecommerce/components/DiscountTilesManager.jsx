import React, { useState, useEffect, useRef } from "react";
import {
  fetchDiscountCategoryTiles,
  createDiscountCategoryTile,
  updateDiscountCategoryTile,
  deleteDiscountCategoryTile,
  uploadImage,
} from "../services";

const SEDES_STATIC = [
  { code: "PV001", label: "Copacabana (Principal)" },
  { code: "00301", label: "Girardota" },
  { code: "00701", label: "Barbosa" },
  { code: "00201", label: "Villahermosa" },
];

const EMPTY_FORM = {
  title: "",
  image_url: "",
  link_url: "",
  alt_text: "",
  label: "",
  active: true,
  display_order: 0,
  sedes: null,
};

export default function DiscountTilesManager({ sedes = [], sedeActual = null, esAdminGlobal = false }) {
  const [tiles, setTiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTile, setEditingTile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sedeFilter, setSedeFilter] = useState("all");
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const formRef = useRef(null);

  const userSedeCode = sedeActual?.codigo_siesa || sedeActual?.slug || null;

  const sedeList = sedes.length > 0
    ? sedes.map(s => ({ code: s.codigo_siesa || s.slug, label: s.nombre }))
    : SEDES_STATIC;

  const getSedeLabel = (code) =>
    sedeList.find(s => s.code === code)?.label || code;

  useEffect(() => {
    loadTiles();
  }, []);

  const scrollToForm = () => {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const loadTiles = async () => {
    setLoading(true);
    try {
      const res = await fetchDiscountCategoryTiles();
      if (res.ok) setTiles(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  const visibleTiles = tiles.filter(t => {
    if (sedeFilter === "all") return true;
    if (sedeFilter === "global") return !t.sedes || t.sedes.length === 0;
    return !t.sedes || t.sedes.includes(sedeFilter);
  });

  const countAll = tiles.length;
  const countGlobal = tiles.filter(t => !t.sedes || t.sedes.length === 0).length;

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingTile(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setForm({ ...EMPTY_FORM, display_order: tiles.length + 1, sedes: esAdminGlobal ? null : (userSedeCode ? [userSedeCode] : null) });
    setShowForm(true);
    scrollToForm();
  };

  const openEdit = (tile) => {
    setEditingTile(tile);
    setForm({
      title:         tile.title ?? "",
      image_url:     tile.image_url ?? "",
      link_url:      tile.link_url ?? "",
      alt_text:      tile.alt_text ?? "",
      label:         tile.label ?? "",
      active:        tile.active ?? true,
      display_order: tile.display_order ?? 0,
      sedes:         tile.sedes ?? null,
    });
    setShowForm(true);
    scrollToForm();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
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

  const handleSedesToggle = (code) => {
    setForm(f => {
      if (f.sedes === null) return { ...f, sedes: [code] };
      if (f.sedes.includes(code)) {
        const next = f.sedes.filter(s => s !== code);
        return { ...f, sedes: next.length === 0 ? null : next };
      }
      return { ...f, sedes: [...f.sedes, code] };
    });
  };

  const handleSave = async () => {
    if (!form.image_url) { alert("Debes subir una imagen para el tile"); return; }
    setSaving(true);
    try {
      const res = editingTile
        ? await updateDiscountCategoryTile(editingTile.id, form)
        : await createDiscountCategoryTile(form);
      if (res.ok) { resetForm(); loadTiles(); }
      else alert("Error: " + (res.message || "No se pudo guardar"));
    } catch (err) {
      alert("Error guardando tile: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tile) => {
    if (!confirm(`Eliminar el tile "${tile.title}"?`)) return;
    const res = await deleteDiscountCategoryTile(tile.id);
    if (res.ok) setTiles(prev => prev.filter(t => t.id !== tile.id));
    else alert("Error eliminando: " + res.message);
  };

  const handleToggleActive = async (tile) => {
    const res = await updateDiscountCategoryTile(tile.id, { active: !tile.active });
    if (res.ok) setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, active: !t.active } : t));
  };

  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    if (!draggedId || !dragOverId || draggedId === dragOverId) {
      setDraggedId(null); setDragOverId(null); return;
    }
    const fromIdx = visibleTiles.findIndex(t => t.id === draggedId);
    const toIdx   = visibleTiles.findIndex(t => t.id === dragOverId);
    if (fromIdx < 0 || toIdx < 0) { setDraggedId(null); setDragOverId(null); return; }
    const updated = [...visibleTiles];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setTiles(prev => {
      const other = prev.filter(t => !visibleTiles.find(v => v.id === t.id));
      return [...other, ...updated.map((t, i) => ({ ...t, display_order: i + 1 }))];
    });
    setDraggedId(null); setDragOverId(null);
    await Promise.all(updated.map((t, i) => updateDiscountCategoryTile(t.id, { display_order: i + 1 })));
  };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  const handleReorder = async (tileId, direction) => {
    const idx = visibleTiles.findIndex(t => t.id === tileId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= visibleTiles.length) return;
    const updated = [...visibleTiles];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    setTiles(prev => {
      const other = prev.filter(t => !visibleTiles.find(v => v.id === t.id));
      return [...other, ...updated.map((t, i) => ({ ...t, display_order: i + 1 }))];
    });
    await Promise.all(updated.map((t, i) => updateDiscountCategoryTile(t.id, { display_order: i + 1 })));
  };

  return (
    <div>
      {/* Filtro por sede */}
      <div className="bm-filter-bar" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
        {esAdminGlobal && sedeList.length > 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "var(--ge-primary-light)", borderRadius: "var(--ge-radius)", border: "1px solid var(--ge-primary-ring)" }}>
              <span style={{ fontSize: "0.9rem" }}>📍</span>
              <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--ge-primary)" }}>Vista Sede:</span>
            </div>
            {[{ key: "all", label: "Todas", count: countAll }, { key: "global", label: "🌐 Globales", count: countGlobal }].map(f => (
              <button key={f.key} className={`ge-pill ${sedeFilter === f.key ? "active" : ""}`} onClick={() => setSedeFilter(f.key)}>
                {f.label} ({f.count})
              </button>
            ))}
            {sedeList.map(s => {
              const count = tiles.filter(t => t.sedes && t.sedes.includes(s.code)).length;
              return (
                <button key={s.code} className={`ge-pill ${sedeFilter === s.code ? "active-accent" : ""}`} onClick={() => setSedeFilter(s.code)}>
                  {s.label} ({count})
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.85rem" }}>🏪</span>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ge-primary)" }}>{sedeActual?.nombre || "Mi Sede"}</span>
            <span style={{ fontSize: "0.72rem", color: "var(--ge-text-muted)", fontStyle: "italic" }}>(tiles de tu sede + globales)</span>
          </div>
        )}
        <button className="ge-btn" onClick={openCreate}>+ Nuevo Tile</button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bm-form-panel" ref={formRef}>
          <div className="bm-form-header">
            <div className="bm-form-header-icon">{editingTile ? "✏️" : "➕"}</div>
            <div>
              <div className="bm-form-header-title">{editingTile ? "Editar Tile" : "Nuevo Tile"}</div>
              <div className="bm-form-header-sub">🏷️ Tiles Descuentos Especiales</div>
            </div>
          </div>
          <div className="bm-form-body">
            <div className="bm-form-image-section">
              <label className="bm-form-label">Imagen del Tile</label>
              <div className="bm-form-help">📐 Recomendado: 540×720px (cuadrado o vertical)</div>
              {form.image_url ? (
                <div className="bm-form-image-preview">
                  <img src={form.image_url} alt="Preview" />
                  <div className="bm-form-image-overlay">
                    <label className="ge-btn sm">
                      📷 Cambiar imagen
                      <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: "none" }} />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="bm-form-upload-zone">
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: "none" }} />
                  <div className="bm-form-upload-icon">{uploading ? "⏳" : "📁"}</div>
                  <div className="bm-form-upload-text">{uploading ? "Subiendo..." : "Haz clic para seleccionar imagen"}</div>
                  <div className="bm-form-upload-hint">JPG, PNG o WebP</div>
                </label>
              )}
              {form.image_url && (
                <input className="ge-input ge-input-sm" style={{ marginTop: 8 }} value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="O pega URL directamente" />
              )}
            </div>

            <div className="bm-form-fields">
              <div className="bm-form-field">
                <label className="bm-form-label">Título (para el gestor)</label>
                <input className="ge-input" placeholder="Ej: Tiles Bebidas Abril" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="bm-form-field">
                <label className="bm-form-label">Texto sobre la imagen (label)</label>
                <input className="ge-input" placeholder="Ej: Bebidas" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              <div className="bm-form-field">
                <label className="bm-form-label">Enlace al hacer clic</label>
                <input className="ge-input" placeholder="/categoria-producto/bebidas/" value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} />
              </div>
              <div className="bm-form-field" style={{ maxWidth: 100 }}>
                <label className="bm-form-label">Orden</label>
                <input type="number" className="ge-input" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="bm-form-options">
              <label className="bm-form-toggle">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                <span className="bm-form-toggle-slider"></span>
                <span>{form.active ? "Activo" : "Inactivo"}</span>
              </label>
            </div>

            {esAdminGlobal && sedeList.length > 1 && (
              <div className="bm-form-sedes">
                <label className="bm-form-label">Visible en sedes</label>
                <div className="bm-form-sedes-pills">
                  <button type="button" className={`ge-pill ${form.sedes === null ? "active" : ""}`} onClick={() => setForm(f => ({ ...f, sedes: null }))}>
                    🌐 Todas
                  </button>
                  {sedeList.map(s => {
                    const isSelected = Array.isArray(form.sedes) && form.sedes.includes(s.code);
                    return (
                      <button key={s.code} type="button" className={`ge-pill ${isSelected ? "active-accent" : ""}`} onClick={() => handleSedesToggle(s.code)}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <div className="bm-form-help">
                  {form.sedes === null ? "🌐 Se mostrará en todas las sedes" : `📍 Solo en: ${form.sedes.map(c => getSedeLabel(c)).join(", ")}`}
                </div>
              </div>
            )}

            <div className="bm-form-actions">
              <button className="ge-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : editingTile ? "✅ Actualizar Tile" : "✅ Crear Tile"}
              </button>
              <button className="ge-btn secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="ge-card ge-empty">
          <div className="bm-loading-spinner"></div>
          <span>Cargando tiles...</span>
        </div>
      ) : visibleTiles.length === 0 ? (
        <div className="ge-card ge-empty bm-empty-state">
          <div className="bm-empty-icon">🏷️</div>
          <div className="bm-empty-title">No hay tiles en esta sección</div>
          <div className="bm-empty-desc">Crea el primero para personalizar la página de descuentos especiales</div>
          <button className="ge-btn" onClick={openCreate} style={{ marginTop: 12 }}>+ Crear Tile</button>
        </div>
      ) : (
        <div className="bm-banner-list">
          <div className="bm-list-header">
            <span className="bm-list-col-pos">#</span>
            <span className="bm-list-col-img">Imagen</span>
            <span className="bm-list-col-info">Información</span>
            <span className="bm-list-col-status">Estado</span>
            <span className="bm-list-col-actions">Acciones</span>
          </div>
          {visibleTiles.map((tile, idx) => (
            <div
              key={tile.id}
              className={`bm-list-row ${tile.active ? "" : "dimmed"} ${draggedId === tile.id ? "bm-dragging" : ""} ${dragOverId === tile.id && draggedId !== tile.id ? "bm-drag-over" : ""} ${editingTile?.id === tile.id ? "bm-editing" : ""}`}
              draggable
              onDragStart={e => handleDragStart(e, tile.id)}
              onDragOver={e => handleDragOver(e, tile.id)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              <div className="bm-list-position">
                <span className="bm-drag-handle" title="Arrastrar para reordenar">⠿</span>
                <span className="bm-list-pos-number">{idx + 1}</span>
                <div className="bm-list-pos-arrows">
                  <button className="bm-arrow-btn" onClick={() => handleReorder(tile.id, "up")} disabled={idx === 0} title="Subir">▲</button>
                  <button className="bm-arrow-btn" onClick={() => handleReorder(tile.id, "down")} disabled={idx === visibleTiles.length - 1} title="Bajar">▼</button>
                </div>
              </div>
              <div className="bm-list-thumb-wrap">
                {tile.image_url
                  ? <img src={tile.image_url} alt={tile.alt_text || tile.title || "Tile"} className="bm-list-thumb" />
                  : <div className="bm-list-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", fontSize: "0.72rem", color: "#94a3b8" }}>Sin img</div>
                }
              </div>
              <div className="bm-list-info">
                <div className="bm-list-title">{tile.title || "(Sin título)"}</div>
                {tile.label && <div className="bm-list-link">🏷️ {tile.label}</div>}
                {tile.link_url && <div className="bm-list-link">🔗 {tile.link_url}</div>}
                <div className="bm-list-meta">
                  {tile.sedes
                    ? tile.sedes.map((code, i) => <span key={i} className="ge-chip sede">{getSedeLabel(code)}</span>)
                    : <span className="ge-chip global">Todas las sedes</span>
                  }
                </div>
              </div>
              <div className="bm-list-status">
                <span className={`bm-status-dot ${tile.active ? "on" : "off"}`}></span>
                <span className="bm-status-label">{tile.active ? "Activo" : "Inactivo"}</span>
              </div>
              <div className="bm-list-actions">
                <button className="bm-action-btn toggle" onClick={() => handleToggleActive(tile)} title={tile.active ? "Desactivar" : "Activar"}>{tile.active ? "⏸" : "▶"}</button>
                <button className="bm-action-btn edit" onClick={() => openEdit(tile)} title="Editar">✏️</button>
                <button className="bm-action-btn delete" onClick={() => handleDelete(tile)} title="Eliminar">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ge-note">
        <div className="ge-note-title">💡 Integración WordPress</div>
        <div className="ge-note-body">
          Los tiles se muestran automáticamente en <strong>/categoria-producto/descuentos-especiales/</strong>.
          Después de modificar, pulsa <strong>"🚀 Publicar en tienda"</strong> para limpiar el caché de inmediato.
        </div>
      </div>
    </div>
  );
}