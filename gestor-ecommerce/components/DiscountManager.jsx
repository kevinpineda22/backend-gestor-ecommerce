import React, { useState, useEffect } from "react";
import { fetchDiscountRules, createDiscountRule, updateDiscountRule, deleteDiscountRule, fetchCategories, syncDiscountRulesToWP, SEDE_WP_URLS } from "../services";
import "../GestorEcommerce.css";
import "./DiscountManager.css";
const DAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const DAY_LABELS = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" };

const EMPTY_FORM = {
  title: "",
  discount_type: "percentage",
  discount_value: 0,
  applies_to: "categories",
  applies_to_ids: [],
  applies_to_names: [],
  schedule_type: "days",
  schedule_days: [],
  date_start: "",
  date_end: "",
  active: true,
  display_order: 0,
};

export default function DiscountManager({ sedes = [], sedeActual = null, esAdminGlobal = false }) {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [categorySearch, setCategorySearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncSedes, setSyncSedes] = useState(Object.keys(SEDE_WP_URLS));
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  useEffect(() => {
    loadRules();
    loadCategories();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetchDiscountRules();
      if (res.ok) setRules(res.data || []);
    } catch (err) {
      console.error("Error cargando reglas:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetchCategories();
      if (res.ok) setCategories(res.data || []);
    } catch (err) {
      console.error("Error cargando categorías:", err);
    }
  };

  const WP_MAIN = SEDE_WP_URLS['PV001'];

  // --- Importar reglas desde WordPress ---
  const handleFetchWooRules = async () => {
    setImporting(true);
    try {
      const res = await fetch(`${WP_MAIN}/wp-json/merkahorro/v1/woo-discount-rules?key=merkahorro2026`);
      const data = await res.json();
      if (data.ok && data.data?.length > 0) {
        setImportPreview(data.data);
      } else if (data.ok && (!data.data || data.data.length === 0)) {
        alert("No se encontraron reglas en WordPress. Verifica que el plugin 'Discount Rules' esté instalado.");
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

  // --- Buscar productos por SKU/nombre ---
  const handleProductSearch = async (query) => {
    setProductSearch(query);
    if (query.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    try {
      const res = await fetch(`${window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://backend-gestor-ecommerce.vercel.app'}/api/catalog?search=${encodeURIComponent(query)}&pageSize=10&exactSearch=false&filter=active`);
      const data = await res.json();
      if (data.ok) {
        setProductResults((data.data || []).map(p => ({
          id: p.woo_product_id || p.woo_id,
          name: p.descripcion || p.nombre || p.name || p.item,
          sku: p.item || p.sku || p.item_code,
        })).filter(p => p.id && !form.applies_to_ids.includes(p.id)));
      }
    } catch (err) { console.error(err); }
    finally { setSearchingProducts(false); }
  };

  const addProduct = (prod) => {
    if (form.applies_to_ids.includes(prod.id)) return;
    setForm(f => ({
      ...f,
      applies_to_ids: [...f.applies_to_ids, prod.id],
      applies_to_names: [...f.applies_to_names, prod.name + (prod.sku ? ` (${prod.sku})` : '')]
    }));
    setProductSearch("");
    setProductResults([]);
  };

  const removeProduct = (idx) => {
    setForm(f => ({
      ...f,
      applies_to_ids: f.applies_to_ids.filter((_, i) => i !== idx),
      applies_to_names: f.applies_to_names.filter((_, i) => i !== idx)
    }));
  };

  const SEDE_LABELS = { 'PV001': 'Copacabana (Principal)', '00301': 'Girardota', '00701': 'Barbosa', '00201': 'Villahermosa' };

  const toggleSyncSede = (code) => {
    setSyncSedes(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]);
  };

  // --- Sincronizar reglas a WordPress (FlyCart) ---
  const handleSyncToWP = async () => {
    const activeRules = rules.filter(r => r.active);
    if (activeRules.length === 0) {
      alert("No hay reglas activas para sincronizar.");
      return;
    }
    if (syncSedes.length === 0) {
      alert("Selecciona al menos una sede.");
      return;
    }

    setSyncing(true);
    setShowSyncModal(false);
    try {
      const results = [];
      for (const code of syncSedes) {
        const url = SEDE_WP_URLS[code];
        try {
          const r = await syncDiscountRulesToWP(url, activeRules);
          results.push({ code, ok: r.ok, synced: r.synced || 0 });
        } catch {
          results.push({ code, ok: false, synced: 0 });
        }
      }
      const ok = results.filter(r => r.ok);
      const fail = results.filter(r => !r.ok);
      const sedeNames = ok.map(r => SEDE_LABELS[r.code] || r.code).join(', ');
      if (fail.length === 0) {
        alert(`✅ ${activeRules.length} reglas sincronizadas en ${ok.length} sede(s):\n${sedeNames}\n\nEl plugin FlyCart ya las está aplicando.\n\n⚠️ Las reglas creadas directamente en FlyCart NO se modifican.`);
      } else {
        alert(`⚠️ Sincronizado en ${ok.length} de ${syncSedes.length} sedes.\n${fail.length} fallaron: ${fail.map(f => SEDE_LABELS[f.code] || f.code).join(', ')}`);
      }
    } catch (err) {
      alert("Error sincronizando: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleImportRules = async (selectedRules) => {
    setSaving(true);
    let imported = 0;
    for (const rule of selectedRules) {
      const payload = {
        title: rule.title,
        discount_type: rule.discount_type,
        discount_value: rule.discount_value,
        applies_to: rule.applies_to,
        applies_to_ids: rule.applies_to_ids,
        applies_to_names: rule.applies_to_names,
        schedule_type: rule.schedule_type,
        schedule_days: rule.schedule_days,
        date_start: rule.date_start,
        date_end: rule.date_end,
        active: rule.active,
        display_order: imported,
      };
      const res = await createDiscountRule(payload);
      if (res.ok) imported++;
    }
    alert(`✅ Se importaron ${imported} de ${selectedRules.length} reglas correctamente.`);
    setImportPreview(null);
    loadRules();
    setSaving(false);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingRule(null);
    setShowForm(false);
    setCategorySearch("");
  };

  const openCreate = () => {
    resetForm();
    setForm(f => ({ ...f, display_order: rules.length }));
    setShowForm(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      title: rule.title || "",
      discount_type: rule.discount_type || "percentage",
      discount_value: rule.discount_value || 0,
      applies_to: rule.applies_to || "categories",
      applies_to_ids: rule.applies_to_ids || [],
      applies_to_names: rule.applies_to_names || [],
      schedule_type: rule.schedule_type || "days",
      schedule_days: rule.schedule_days || [],
      date_start: rule.date_start || "",
      date_end: rule.date_end || "",
      active: rule.active,
      display_order: rule.display_order || 0,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert("Ingresa un título para la regla"); return; }
    if (!form.discount_value || form.discount_value <= 0) { alert("El descuento debe ser mayor a 0"); return; }
    if (form.schedule_type === "days" && form.schedule_days.length === 0) { alert("Selecciona al menos un día"); return; }
    if (form.schedule_type === "date_range" && (!form.date_start || !form.date_end)) { alert("Selecciona las fechas de inicio y fin"); return; }

    setSaving(true);
    try {
      const payload = { ...form };
      // Limpiar campos innecesarios según schedule_type
      if (payload.schedule_type === "days") { payload.date_start = null; payload.date_end = null; }
      if (payload.schedule_type === "date_range") { payload.schedule_days = []; }
      if (payload.schedule_type === "always") { payload.schedule_days = []; payload.date_start = null; payload.date_end = null; }
      if (payload.applies_to === "all") { payload.applies_to_ids = []; payload.applies_to_names = []; }

      const res = editingRule
        ? await updateDiscountRule(editingRule.id, payload)
        : await createDiscountRule(payload);

      if (res.ok) { resetForm(); loadRules(); }
      else alert("Error: " + (res.message || "No se pudo guardar"));
    } catch (err) {
      alert("Error guardando regla: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar esta regla de descuento?")) return;
    try {
      const res = await deleteDiscountRule(id);
      if (res.ok) setRules(prev => prev.filter(r => r.id !== id));
      else alert("Error eliminando: " + (res.message || ""));
    } catch (err) { alert("Error: " + err.message); }
  };

  const handleToggleActive = async (rule) => {
    try {
      const res = await updateDiscountRule(rule.id, { active: !rule.active });
      if (res.ok) setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
    } catch (err) { console.error(err); }
  };

  const toggleDay = (dayValue) => {
    setForm(f => ({
      ...f,
      schedule_days: f.schedule_days.includes(dayValue)
        ? f.schedule_days.filter(d => d !== dayValue)
        : [...f.schedule_days, dayValue]
    }));
  };

  const addCategory = (cat) => {
    if (form.applies_to_ids.includes(cat.id)) return;
    setForm(f => ({
      ...f,
      applies_to_ids: [...f.applies_to_ids, cat.id],
      applies_to_names: [...f.applies_to_names, cat.name]
    }));
    setCategorySearch("");
  };

  const removeCategory = (idx) => {
    setForm(f => ({
      ...f,
      applies_to_ids: f.applies_to_ids.filter((_, i) => i !== idx),
      applies_to_names: f.applies_to_names.filter((_, i) => i !== idx)
    }));
  };

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase()) &&
    !form.applies_to_ids.includes(c.id)
  );

  // Determinar si una regla está activa HOY
  const isActiveToday = (rule) => {
    if (!rule.active) return false;
    const today = new Date().getDay(); // 0=Dom, 1=Lun...
    if (rule.schedule_type === "always") return true;
    if (rule.schedule_type === "days") return (rule.schedule_days || []).includes(today);
    if (rule.schedule_type === "date_range") {
      const now = new Date().toISOString().split('T')[0];
      return now >= rule.date_start && now <= rule.date_end;
    }
    return false;
  };

  const activeToday = rules.filter(isActiveToday);
  const activeCount = rules.filter(r => r.active).length;

  return (
    <div>
      {/* Header */}
      <div className="ge-header">
        <div className="ge-title">
          <h2>Reglas de Descuento</h2>
          <p>Configura descuentos automáticos por día, categoría o rango de fecha</p>
        </div>
        <div className="ge-header-actions">
          {rules.length === 0 && (
            <button className="ge-btn info" onClick={handleFetchWooRules} disabled={importing}>
              {importing ? "Consultando..." : "📥 Importar desde WooCommerce"}
            </button>
          )}
          {rules.length > 0 && (
            <button className="ge-btn accent" onClick={() => setShowSyncModal(true)} disabled={syncing}>
              {syncing ? "Sincronizando..." : "🔄 Sincronizar con WP"}
            </button>
          )}
          <button className="ge-btn" onClick={openCreate}>+ Nueva Regla</button>
        </div>
      </div>

      {/* Modal de sincronización - Seleccionar sedes */}
      {showSyncModal && (
        <div className="ge-card pad" style={{ marginBottom: 16, borderLeft: '4px solid var(--ge-accent)' }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--ge-text-dark)' }}>🔄 Sincronizar con WordPress</h3>
          <p className="ge-row-subtitle" style={{ marginBottom: 12 }}>
            Selecciona las sedes donde quieres enviar las {rules.filter(r => r.active).length} reglas activas.
            Las reglas con prefijo [MK-Gestor] anteriores serán reemplazadas.
          </p>
          <div className="ge-row-meta" style={{ marginBottom: 12, gap: 8 }}>
            {Object.keys(SEDE_WP_URLS).map(code => (
              <label key={code} className="ge-form-check" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={syncSedes.includes(code)} onChange={() => toggleSyncSede(code)} />
                {SEDE_LABELS[code] || code}
              </label>
            ))}
          </div>
          <div className="ge-form-actions">
            <button className="ge-btn accent" onClick={handleSyncToWP} disabled={syncing || syncSedes.length === 0}>
              {syncing ? "Sincronizando..." : `🔄 Sincronizar en ${syncSedes.length} sede(s)`}
            </button>
            <button className="ge-btn secondary" onClick={() => setShowSyncModal(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Panel de importación desde WooCommerce */}
      {importPreview && (
        <div className="ge-card ge-import-panel">
          <h3 className="ge-import-title">📥 Reglas encontradas en WooCommerce ({importPreview.length})</h3>
          <p className="ge-import-subtitle">
            Estas son las reglas actuales del plugin "Discount Rules". Importalas para manejarlas desde aquí.
          </p>

          <div className="ge-rule-import-list">
            {importPreview.map((rule, idx) => (
              <div key={idx} className="ge-rule-row preview">
                <div className="ge-badge discount">
                  {rule.discount_value}{rule.discount_type === 'percentage' ? '%' : '$'}
                </div>
                <div className="ge-row-info">
                  <div className="ge-row-title">{rule.title}</div>
                  <div className="ge-row-subtitle">
                    {rule.applies_to === 'categories' && rule.applies_to_names?.length > 0
                      ? `Categorías: ${rule.applies_to_names.join(', ')}`
                      : 'Todos los productos'}
                    {rule.schedule_type === 'days' && rule.schedule_days?.length > 0 &&
                      ` · Días: ${rule.schedule_days.map(d => DAY_LABELS[d] || d).join(', ')}`}
                    {rule.schedule_type === 'always' && ' · Siempre'}
                  </div>
                </div>
                <span className={`ge-badge ${rule.active ? 'active' : 'inactive'}`}>
                  {rule.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            ))}
          </div>

          <div className="ge-form-actions">
            <button className="ge-btn info" onClick={() => handleImportRules(importPreview)} disabled={saving}>
              {saving ? "Importando..." : `✅ Importar todas (${importPreview.length})`}
            </button>
            <button className="ge-btn secondary" onClick={() => setImportPreview(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Stats rápidas */}
      <div className="ge-stats">
        <div className="ge-stat">
          <div className="ge-stat-value primary">{rules.length}</div>
          <div className="ge-stat-label">Total reglas</div>
        </div>
        <div className="ge-stat">
          <div className="ge-stat-value success">{activeCount}</div>
          <div className="ge-stat-label">Activas</div>
        </div>
        <div className="ge-stat">
          <div className="ge-stat-value warning">{activeToday.length}</div>
          <div className="ge-stat-label">Ejecutándose hoy</div>
        </div>
      </div>

      {/* Reglas activas hoy */}
      {activeToday.length > 0 && (
        <div className="ge-active-today">
          <div className="ge-active-today-title">🟢 Descuentos activos hoy:</div>
          <div className="ge-row-meta">
            {activeToday.map(r => (
              <span key={r.id} className="ge-pill active-accent">
                {r.title} — {r.discount_value}{r.discount_type === 'percentage' ? '%' : '$'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Formulario crear/editar */}
      {showForm && (
        <div className="ge-card pad" style={{ marginBottom: 24 }}>
          <h3 className="ge-import-title" style={{ color: 'var(--ge-text-dark)' }}>
            {editingRule ? "Editar Regla" : "Nueva Regla de Descuento"}
          </h3>

          <div className="ge-form">
            <div className="ge-form-group">
              <label>Título de la regla</label>
              <input className="ge-input" placeholder="Ej: LUNES 15% EN POLLO" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>

            <div className="ge-form-row">
              <div className="ge-form-group">
                <label>Tipo de descuento</label>
                <select className="ge-input" value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}>
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="fixed">Valor fijo ($)</option>
                </select>
              </div>
              <div className="ge-form-group">
                <label>Valor {form.discount_type === 'percentage' ? '(%)' : '($)'}</label>
                <input type="number" className="ge-input" placeholder={form.discount_type === 'percentage' ? "Ej: 15" : "Ej: 5000"} value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} min="0" max={form.discount_type === 'percentage' ? 100 : undefined} />
              </div>
            </div>

            {/* Aplica a */}
            <div className="ge-form-group">
              <label>Aplica a</label>
              <select className="ge-input" value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value, applies_to_ids: [], applies_to_names: [] }))}>
                <option value="all">Todos los productos</option>
                <option value="categories">Categorías específicas</option>
                <option value="products">Productos específicos (SKU)</option>
              </select>

              {form.applies_to === "categories" && (
                <div style={{ marginTop: 8 }}>
                  <div className="ge-row-meta" style={{ marginBottom: 8 }}>
                    {form.applies_to_names.map((name, idx) => (
                      <span key={idx} className="ge-chip category">
                        {name}
                        <button className="ge-chip-remove" onClick={() => removeCategory(idx)}>×</button>
                      </span>
                    ))}
                  </div>
                  <input className="ge-input" placeholder="Buscar categoría..." value={categorySearch} onChange={e => setCategorySearch(e.target.value)} />
                  {categorySearch && (
                    <div className="ge-dropdown">
                      {filteredCategories.length === 0 ? (
                        <div className="ge-dropdown-empty">No se encontraron categorías</div>
                      ) : (
                        filteredCategories.slice(0, 10).map(cat => (
                          <div key={cat.id} className="ge-dropdown-item" onClick={() => addCategory(cat)}>{cat.name}</div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {form.applies_to === "products" && (
                <div style={{ marginTop: 8 }}>
                  <div className="ge-row-meta" style={{ marginBottom: 8 }}>
                    {form.applies_to_names.map((name, idx) => (
                      <span key={idx} className="ge-chip product">
                        {name}
                        <button className="ge-chip-remove" onClick={() => removeProduct(idx)}>×</button>
                      </span>
                    ))}
                  </div>
                  <input className="ge-input" placeholder="Buscar producto por nombre o SKU..." value={productSearch} onChange={e => handleProductSearch(e.target.value)} />
                  {searchingProducts && <div className="ge-form-help">Buscando...</div>}
                  {productResults.length > 0 && (
                    <div className="ge-dropdown">
                      {productResults.map(prod => (
                        <div key={prod.id} className="ge-dropdown-item" onClick={() => addProduct(prod)}>
                          <span className="ge-dropdown-item-main">{prod.name}</span>
                          {prod.sku && <span className="ge-dropdown-item-sub">SKU: {prod.sku}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Programación */}
            <div className="ge-form-group">
              <label>Programación</label>
              <select className="ge-input" value={form.schedule_type} onChange={e => setForm(f => ({ ...f, schedule_type: e.target.value }))}>
                <option value="days">Días de la semana</option>
                <option value="date_range">Rango de fechas</option>
                <option value="always">Siempre activo</option>
              </select>

              {form.schedule_type === "days" && (
                <div className="ge-row-meta" style={{ marginTop: 12 }}>
                  {DAYS.map(day => (
                    <button key={day.value} type="button" onClick={() => toggleDay(day.value)} className={`ge-day-btn ${form.schedule_days.includes(day.value) ? 'active' : ''}`}>
                      {day.label}
                    </button>
                  ))}
                </div>
              )}

              {form.schedule_type === "date_range" && (
                <div className="ge-form-row" style={{ marginTop: 12 }}>
                  <div className="ge-form-group">
                    <label className="ge-form-help">Fecha inicio</label>
                    <input type="date" className="ge-input" value={form.date_start} onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))} />
                  </div>
                  <div className="ge-form-group">
                    <label className="ge-form-help">Fecha fin</label>
                    <input type="date" className="ge-input" value={form.date_end} onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            <div className="ge-row-meta">
              <label className="ge-form-check">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Activa
              </label>
            </div>

            <div className="ge-form-actions">
              <button className="ge-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : (editingRule ? "Actualizar Regla" : "Crear Regla")}
              </button>
              <button className="ge-btn secondary" onClick={resetForm}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de reglas */}
      {loading ? (
        <div className="ge-card ge-empty">Cargando reglas...</div>
      ) : rules.length === 0 ? (
        <div className="ge-card ge-empty">No hay reglas de descuento. Crea la primera.</div>
      ) : (
        <div className="ge-card">
          {rules.map(rule => {
            const activeNow = isActiveToday(rule);
            return (
              <div key={rule.id} className={`ge-rule-row ${rule.active ? '' : 'dimmed'} ${activeNow ? 'running' : ''}`}>
                <div className="ge-badge discount">
                  <div className="ge-badge-value">{rule.discount_value}{rule.discount_type === 'percentage' ? '%' : '$'}</div>
                  <div className="ge-badge-label">{rule.discount_type === 'percentage' ? 'desc.' : 'fijo'}</div>
                </div>

                <div className="ge-row-info">
                  <div className="ge-row-title">{rule.title}</div>
                  {rule.applies_to === "categories" && (rule.applies_to_names || []).length > 0 && (
                    <div className="ge-row-meta">
                      {rule.applies_to_names.map((name, i) => <span key={i} className="ge-chip category">{name}</span>)}
                    </div>
                  )}
                  {rule.applies_to === "products" && (rule.applies_to_names || []).length > 0 && (
                    <div className="ge-row-meta">
                      {rule.applies_to_names.slice(0, 5).map((name, i) => <span key={i} className="ge-chip product">{name}</span>)}
                      {rule.applies_to_names.length > 5 && <span className="ge-row-subtitle">+{rule.applies_to_names.length - 5} más</span>}
                    </div>
                  )}
                  {rule.applies_to === "all" && <div className="ge-row-subtitle">Aplica a todos los productos</div>}
                  <div className="ge-row-subtitle">
                    {rule.schedule_type === "days" && <>📅 {(rule.schedule_days || []).map(d => DAY_LABELS[d]).join(', ')}</>}
                    {rule.schedule_type === "date_range" && <>📆 {rule.date_start} → {rule.date_end}</>}
                    {rule.schedule_type === "always" && <>🔄 Siempre activo</>}
                    {' '}🌐 Todas las sedes
                  </div>
                </div>

                <div className="ge-rule-status">
                  {activeNow && <span className="ge-badge running">Ejecutándose</span>}
                  <span className={`ge-badge ${rule.active ? 'active' : 'inactive'}`}>{rule.active ? 'Activa' : 'Inactiva'}</span>
                </div>

                <div className="ge-row-actions">
                  <button className="ge-btn icon outline-muted" onClick={() => handleToggleActive(rule)}>{rule.active ? '⏸' : '▶'}</button>
                  <button className="ge-btn icon outline-primary" onClick={() => openEdit(rule)}>✏️</button>
                  <button className="ge-btn icon outline-danger" onClick={() => handleDelete(rule.id)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nota */}
      <div className="ge-note">
        <div className="ge-note-title">💡 Integración con FlyCart (Discount Rules)</div>
        <div className="ge-note-body">
          Pulsa <strong>"🔄 Sincronizar con WP"</strong> para enviar las reglas al plugin FlyCart en WordPress.
          El plugin se encarga de mostrar badges de descuento, precios tachados y toda la presentación visual en la tienda.
          Las reglas se activan/desactivan según el día de la semana o rango de fechas configurado.
          <br /><br />
          <strong>⚠️ Nota:</strong> Los descuentos aplican a <strong>todas las sedes por igual</strong> porque el plugin FlyCart
          no soporta descuentos por sede. Para diferenciar por sede, usa categorías o productos específicos de cada sede.
        </div>
      </div>
    </div>
  );
}
