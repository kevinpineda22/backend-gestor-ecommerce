import React, { useState, useEffect } from "react";
import { fetchDiscountRules, createDiscountRule, updateDiscountRule, deleteDiscountRule, fetchCategories } from "../services";
import "../GestorEcommerce.css";

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

export default function DiscountManager() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [categorySearch, setCategorySearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // reglas leídas de WP antes de importar

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

  // --- Importar reglas desde WordPress ---
  const handleFetchWooRules = async () => {
    const wpUrl = prompt("URL de tu WordPress (ej: https://supermercadomerkahorro.com):");
    if (!wpUrl) return;
    const cleanUrl = wpUrl.replace(/\/+$/, '');

    setImporting(true);
    try {
      const res = await fetch(`${cleanUrl}/wp-json/merkahorro/v1/woo-discount-rules?key=merkahorro2026`);
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
        <div style={{ display: 'flex', gap: '8px' }}>
          {rules.length === 0 && (
            <button
              className="ge-btn"
              style={{ backgroundColor: '#7c3aed', color: 'white' }}
              onClick={handleFetchWooRules}
              disabled={importing}
            >
              {importing ? "Consultando..." : "📥 Importar desde WooCommerce"}
            </button>
          )}
          <button className="ge-btn" style={{ backgroundColor: '#2563eb', color: 'white' }} onClick={openCreate}>
            + Nueva Regla
          </button>
        </div>
      </div>

      {/* Panel de importación desde WooCommerce */}
      {importPreview && (
        <div className="ge-card" style={{ padding: '24px', marginBottom: '24px', borderLeft: '4px solid #7c3aed' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 600, color: '#7c3aed' }}>
            📥 Reglas encontradas en WooCommerce ({importPreview.length})
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 16px' }}>
            Estas son las reglas actuales del plugin "Discount Rules". Importalas para manejarlas desde aquí.
          </p>

          <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
            {importPreview.map((rule, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff'
              }}>
                <div style={{
                  minWidth: '60px', textAlign: 'center', padding: '6px 10px',
                  borderRadius: '8px', background: '#fef3c7', color: '#92400e', fontWeight: 700
                }}>
                  {rule.discount_value}{rule.discount_type === 'percentage' ? '%' : '$'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rule.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {rule.applies_to === 'categories' && rule.applies_to_names?.length > 0
                      ? `Categorías: ${rule.applies_to_names.join(', ')}`
                      : 'Todos los productos'}
                    {rule.schedule_type === 'days' && rule.schedule_days?.length > 0 &&
                      ` · Días: ${rule.schedule_days.map(d => DAY_LABELS[d] || d).join(', ')}`}
                    {rule.schedule_type === 'always' && ' · Siempre'}
                  </div>
                </div>
                <span style={{
                  padding: '3px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600,
                  background: rule.active ? '#dcfce7' : '#f3f4f6',
                  color: rule.active ? '#166534' : '#9ca3af'
                }}>
                  {rule.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="ge-btn"
              style={{ backgroundColor: '#7c3aed', color: 'white' }}
              onClick={() => handleImportRules(importPreview)}
              disabled={saving}
            >
              {saving ? "Importando..." : `✅ Importar todas (${importPreview.length})`}
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

      {/* Stats rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="ge-card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#2563eb' }}>{rules.length}</div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total reglas</div>
        </div>
        <div className="ge-card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#059669' }}>{activeCount}</div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Activas</div>
        </div>
        <div className="ge-card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f59e0b' }}>{activeToday.length}</div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Ejecutándose hoy</div>
        </div>
      </div>

      {/* Reglas activas hoy */}
      {activeToday.length > 0 && (
        <div className="ge-card" style={{ padding: '16px', marginBottom: '20px', background: '#f0fdf4', borderLeft: '4px solid #22c55e' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534', marginBottom: '8px' }}>🟢 Descuentos activos hoy:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {activeToday.map(r => (
              <span key={r.id} style={{
                padding: '4px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 600,
                background: '#dcfce7', color: '#166534'
              }}>
                {r.title} — {r.discount_value}{r.discount_type === 'percentage' ? '%' : '$'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Formulario crear/editar */}
      {showForm && (
        <div className="ge-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 600 }}>
            {editingRule ? "Editar Regla" : "Nueva Regla de Descuento"}
          </h3>

          {/* Título */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Título de la regla</label>
            <input
              className="ge-input"
              style={{ width: '100%' }}
              placeholder="Ej: LUNES 15% EN POLLO"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Tipo y valor del descuento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Tipo de descuento</label>
              <select
                className="ge-input"
                style={{ width: '100%' }}
                value={form.discount_type}
                onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
              >
                <option value="percentage">Porcentaje (%)</option>
                <option value="fixed">Valor fijo ($)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                Valor {form.discount_type === 'percentage' ? '(%)' : '($)'}
              </label>
              <input
                type="number"
                className="ge-input"
                style={{ width: '100%' }}
                placeholder={form.discount_type === 'percentage' ? "Ej: 15" : "Ej: 5000"}
                value={form.discount_value}
                onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))}
                min="0"
                max={form.discount_type === 'percentage' ? 100 : undefined}
              />
            </div>
          </div>

          {/* Aplica a */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Aplica a</label>
            <select
              className="ge-input"
              style={{ width: '100%', marginBottom: '8px' }}
              value={form.applies_to}
              onChange={e => setForm(f => ({ ...f, applies_to: e.target.value, applies_to_ids: [], applies_to_names: [] }))}
            >
              <option value="all">Todos los productos</option>
              <option value="categories">Categorías específicas</option>
            </select>

            {form.applies_to === "categories" && (
              <div>
                {/* Chips de categorías seleccionadas */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {form.applies_to_names.map((name, idx) => (
                    <span key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', borderRadius: '16px', fontSize: '0.8rem',
                      background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe'
                    }}>
                      {name}
                      <button
                        onClick={() => removeCategory(idx)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: '0.85rem', padding: '0 2px' }}
                      >×</button>
                    </span>
                  ))}
                </div>
                {/* Buscador de categorías */}
                <input
                  className="ge-input"
                  style={{ width: '100%' }}
                  placeholder="Buscar categoría..."
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                />
                {categorySearch && (
                  <div style={{
                    maxHeight: '150px', overflow: 'auto', border: '1px solid #e5e7eb',
                    borderRadius: '8px', marginTop: '4px', background: 'white'
                  }}>
                    {filteredCategories.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#9ca3af' }}>No se encontraron categorías</div>
                    ) : (
                      filteredCategories.slice(0, 10).map(cat => (
                        <div
                          key={cat.id}
                          onClick={() => addCategory(cat)}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem',
                            borderBottom: '1px solid #f3f4f6', transition: 'background 0.1s'
                          }}
                          onMouseEnter={e => e.target.style.background = '#f9fafb'}
                          onMouseLeave={e => e.target.style.background = 'white'}
                        >
                          {cat.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Programación */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Programación</label>
            <select
              className="ge-input"
              style={{ width: '100%', marginBottom: '12px' }}
              value={form.schedule_type}
              onChange={e => setForm(f => ({ ...f, schedule_type: e.target.value }))}
            >
              <option value="days">Días de la semana</option>
              <option value="date_range">Rango de fechas</option>
              <option value="always">Siempre activo</option>
            </select>

            {form.schedule_type === "days" && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {DAYS.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                      border: form.schedule_days.includes(day.value) ? '2px solid #2563eb' : '2px solid #e5e7eb',
                      background: form.schedule_days.includes(day.value) ? '#eff6ff' : 'white',
                      color: form.schedule_days.includes(day.value) ? '#1d4ed8' : '#6b7280',
                      fontWeight: form.schedule_days.includes(day.value) ? 600 : 400,
                      fontSize: '0.85rem', transition: 'all 0.15s'
                    }}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            )}

            {form.schedule_type === "date_range" && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Fecha inicio</label>
                  <input
                    type="date"
                    className="ge-input"
                    style={{ width: '100%' }}
                    value={form.date_start}
                    onChange={e => setForm(f => ({ ...f, date_start: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Fecha fin</label>
                  <input
                    type="date"
                    className="ge-input"
                    style={{ width: '100%' }}
                    value={form.date_end}
                    onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Active + Order */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              />
              Activa
            </label>
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="ge-btn"
              style={{ backgroundColor: '#2563eb', color: 'white' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Guardando..." : (editingRule ? "Actualizar Regla" : "Crear Regla")}
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

      {/* Lista de reglas */}
      {loading ? (
        <div className="ge-card" style={{ padding: '40px', textAlign: 'center' }}>Cargando reglas...</div>
      ) : rules.length === 0 ? (
        <div className="ge-card" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
          No hay reglas de descuento. Crea la primera.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {rules.map(rule => {
            const activeNow = isActiveToday(rule);
            return (
              <div
                key={rule.id}
                className="ge-card"
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px', padding: '16px',
                  opacity: rule.active ? 1 : 0.5, transition: 'opacity 0.2s',
                  borderLeft: activeNow ? '4px solid #22c55e' : '4px solid transparent'
                }}
              >
                {/* Discount badge */}
                <div style={{
                  minWidth: '70px', textAlign: 'center', padding: '8px 12px',
                  borderRadius: '10px', background: '#fef3c7', color: '#92400e', fontWeight: 700
                }}>
                  <div style={{ fontSize: '1.3rem' }}>
                    {rule.discount_value}{rule.discount_type === 'percentage' ? '%' : '$'}
                  </div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    {rule.discount_type === 'percentage' ? 'desc.' : 'fijo'}
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                    {rule.title}
                  </div>
                  {/* Categorías */}
                  {rule.applies_to === "categories" && (rule.applies_to_names || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                      {rule.applies_to_names.map((name, i) => (
                        <span key={i} style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem',
                          background: '#eff6ff', color: '#2563eb'
                        }}>{name}</span>
                      ))}
                    </div>
                  )}
                  {rule.applies_to === "all" && (
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Aplica a todos los productos</span>
                  )}
                  {/* Schedule */}
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
                    {rule.schedule_type === "days" && (
                      <>📅 {(rule.schedule_days || []).map(d => DAY_LABELS[d]).join(', ')}</>
                    )}
                    {rule.schedule_type === "date_range" && (
                      <>📆 {rule.date_start} → {rule.date_end}</>
                    )}
                    {rule.schedule_type === "always" && <>🔄 Siempre activo</>}
                  </div>
                </div>

                {/* Status */}
                <div style={{ textAlign: 'center' }}>
                  {activeNow && (
                    <div style={{
                      padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                      background: '#dcfce7', color: '#166534', marginBottom: '4px'
                    }}>
                      Ejecutándose
                    </div>
                  )}
                  <span style={{
                    padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                    background: rule.active ? '#dbeafe' : '#f3f4f6',
                    color: rule.active ? '#1d4ed8' : '#9ca3af'
                  }}>
                    {rule.active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    className="ge-btn"
                    style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'white', border: '1px solid #d1d5db', color: '#374151' }}
                    onClick={() => handleToggleActive(rule)}
                  >
                    {rule.active ? '⏸' : '▶'}
                  </button>
                  <button
                    className="ge-btn"
                    style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'white', border: '1px solid #2563eb', color: '#2563eb' }}
                    onClick={() => openEdit(rule)}
                  >
                    ✏️
                  </button>
                  <button
                    className="ge-btn"
                    style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'white', border: '1px solid #ef4444', color: '#ef4444' }}
                    onClick={() => handleDelete(rule.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nota */}
      <div className="ge-card" style={{ padding: '16px', marginTop: '20px', background: '#fffbeb', borderLeft: '4px solid #f59e0b' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>💡 Integración WordPress</div>
        <div style={{ fontSize: '0.8rem', color: '#78716c', lineHeight: 1.5 }}>
          Las reglas se aplicarán automáticamente en la tienda cuando el plugin de WordPress esté instalado.
          Los descuentos se activan/desactivan según el día de la semana o rango de fechas configurado.
        </div>
      </div>
    </div>
  );
}
