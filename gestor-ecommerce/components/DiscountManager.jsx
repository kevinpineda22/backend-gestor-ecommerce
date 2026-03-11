import React, { useState, useEffect } from "react";
import { fetchDiscountRules, createDiscountRule, updateDiscountRule, deleteDiscountRule, syncDiscountRulesToWP, SEDE_WP_URLS } from "../services";
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

const SEDE_LABELS = {
  'PV001': 'Copacabana (Principal)',
  '00301': 'Girardota',
  '00701': 'Barbosa',
  '00201': 'Villahermosa',
};

const SEDE_ICONS = {
  'PV001': '🏪',
  '00301': '🏬',
  '00701': '🛒',
  '00201': '🏠',
};

const EMPTY_FORM = {
  title: "",
  discount_type: "percentage",
  discount_value: 0,
  applies_to: "products",
  applies_to_ids: [],
  applies_to_names: [],
  schedule_type: "days",
  schedule_days: [],
  date_start: "",
  date_end: "",
  active: true,
  display_order: 0,
  sedes: null, // null = todas, array = específicas
};

export default function DiscountManager({ sedes = [], sedeActual = null, esAdminGlobal = false }) {
  const userSedeCode = sedeActual?.codigo_siesa || sedeActual?.slug || null;
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncSedes, setSyncSedes] = useState(
    esAdminGlobal ? Object.keys(SEDE_WP_URLS) : (userSedeCode ? [userSedeCode] : Object.keys(SEDE_WP_URLS))
  );
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [uploadingSKUs, setUploadingSKUs] = useState(false);

  useEffect(() => {
    loadRules();
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

  // --- Descargar plantilla CSV de ejemplo ---
  const downloadSkuTemplate = () => {
    const content = 'sku\n1734\n176149\n177422\n179394\n179643';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_skus.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Importar SKUs desde archivo CSV ---
  const handleSKUFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploadingSKUs(true);
    try {
      let skus = [];
      const text = await file.text();
      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        // Parse CSV: find SKU column or use first column
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) { alert('El archivo está vacío'); return; }
        const sep = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
        const skuColIdx = headers.findIndex(h => h === 'sku' || h === 'item' || h === 'codigo' || h === 'código' || h === 'item_code');
        const colIdx = skuColIdx >= 0 ? skuColIdx : 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols[colIdx]) skus.push(cols[colIdx]);
        }
      } else {
        alert('Formato no soportado. Usa archivos .csv o .txt\nCada fila debe tener un SKU.');
        return;
      }

      if (skus.length === 0) { alert('No se encontraron SKUs en el archivo'); return; }

      // Search each SKU in the catalog
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://backend-gestor-ecommerce.vercel.app';
      let added = 0, notFound = [];
      for (const sku of skus) {
        try {
          const res = await fetch(`${apiBase}/api/catalog?search=${encodeURIComponent(sku)}&pageSize=5&exactSearch=true&filter=active`);
          const data = await res.json();
          if (data.ok && data.data?.length > 0) {
            const prod = data.data[0];
            const id = prod.woo_product_id || prod.woo_id;
            const name = prod.descripcion || prod.nombre || prod.name || prod.item;
            const prodSku = prod.item || prod.sku || prod.item_code;
            if (id && !form.applies_to_ids.includes(id)) {
              setForm(f => ({
                ...f,
                applies_to_ids: [...f.applies_to_ids, id],
                applies_to_names: [...f.applies_to_names, name + (prodSku ? ` (${prodSku})` : '')]
              }));
              added++;
            }
          } else {
            notFound.push(sku);
          }
        } catch { notFound.push(sku); }
      }

      let msg = `✅ ${added} producto(s) agregados de ${skus.length} SKUs.`;
      if (notFound.length > 0) msg += `\n\n⚠️ ${notFound.length} no encontrados:\n${notFound.slice(0, 20).join(', ')}${notFound.length > 20 ? '...' : ''}`;
      alert(msg);
    } catch (err) {
      alert('Error procesando archivo: ' + err.message);
    } finally {
      setUploadingSKUs(false);
    }
  };


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
        // Filtrar reglas que aplican a esta sede (sedes=null → todas, o que incluya el code)
        const sedeRules = activeRules.filter(r => !r.sedes || r.sedes.includes(code));
        try {
          const r = await syncDiscountRulesToWP(url, sedeRules);
          results.push({ code, ok: r.ok, synced: r.synced || 0, total: sedeRules.length });
        } catch {
          results.push({ code, ok: false, synced: 0, total: sedeRules.length });
        }
      }
      const ok = results.filter(r => r.ok);
      const fail = results.filter(r => !r.ok);
      const detail = ok.map(r => `  ✅ ${SEDE_LABELS[r.code] || r.code}: ${r.total} regla(s)`).join('\n');
      if (fail.length === 0) {
        alert(`Sincronización exitosa en ${ok.length} sede(s):\n\n${detail}\n\nEl plugin FlyCart ya las está aplicando.\n\n⚠️ Las reglas creadas directamente en FlyCart NO se modifican.`);
      } else {
        const failDetail = fail.map(f => `  ❌ ${SEDE_LABELS[f.code] || f.code}`).join('\n');
        alert(`⚠️ Sincronizado en ${ok.length} de ${syncSedes.length} sedes.\n\n${detail}\n\nFallaron:\n${failDetail}`);
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
  };

  const openCreate = () => {
    resetForm();
    setForm(f => ({
      ...f,
      display_order: rules.length,
      sedes: esAdminGlobal ? null : (userSedeCode ? [userSedeCode] : null)
    }));
    setShowForm(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      title: rule.title || "",
      discount_type: rule.discount_type || "percentage",
      discount_value: rule.discount_value || 0,
      applies_to: rule.applies_to || "products",
      applies_to_ids: rule.applies_to_ids || [],
      applies_to_names: rule.applies_to_names || [],
      schedule_type: rule.schedule_type || "days",
      schedule_days: rule.schedule_days || [],
      date_start: rule.date_start || "",
      date_end: rule.date_end || "",
      active: rule.active,
      display_order: rule.display_order || 0,
      sedes: rule.sedes || null,
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
      // Sedes: si están todas seleccionadas o ninguna, guardar null (=todas)
      if (payload.sedes && payload.sedes.length === Object.keys(SEDE_WP_URLS).length) {
        payload.sedes = null;
      }

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

  // Filtrar reglas visibles según rol
  const visibleRules = esAdminGlobal
    ? rules
    : rules.filter(r => !r.sedes || r.sedes.includes(userSedeCode));

  // Helper: toggle form sede
  const toggleFormSede = (code) => {
    setForm(f => {
      const current = f.sedes || [];
      if (current.includes(code)) {
        const next = current.filter(s => s !== code);
        return { ...f, sedes: next.length === 0 ? null : next };
      }
      return { ...f, sedes: [...current, code] };
    });
  };

  const formSedesAll = !form.sedes || form.sedes.length === 0;
  const setFormSedesAll = () => setForm(f => ({ ...f, sedes: null }));

  // Count rules per sede for sync modal
  const getRulesForSede = (code) => {
    return rules.filter(r => r.active && (!r.sedes || r.sedes.includes(code)));
  };

  return (
    <div>
      {/* Header */}
      <div className="ge-header">
        <div className="ge-title">
          <h2>Reglas de Descuento</h2>
          <p>Configura descuentos automáticos por día, categoría o rango de fecha</p>
        </div>
        <div className="ge-header-actions">
          {esAdminGlobal && rules.length === 0 && (
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

      {/* ════════ Modal de sincronización con WP ════════ */}
      {showSyncModal && (
        <div className="dm-modal-overlay" onClick={() => setShowSyncModal(false)}>
          <div className="dm-sync-modal" onClick={e => e.stopPropagation()}>
            <div className="dm-sync-modal-header">
              <div className="dm-sync-modal-icon">🔄</div>
              <div>
                <h3>Sincronizar con WordPress</h3>
                <p>Envía las reglas activas al plugin FlyCart en cada sede</p>
              </div>
              <button className="dm-modal-close" onClick={() => setShowSyncModal(false)}>×</button>
            </div>

            <div className="dm-sync-modal-body">
              <div className="dm-sync-sedes-grid">
                {Object.keys(SEDE_WP_URLS)
                  .filter(code => esAdminGlobal || code === userSedeCode)
                  .map(code => {
                  const rulesCount = getRulesForSede(code).length;
                  const isSelected = syncSedes.includes(code);
                  return (
                    <div
                      key={code}
                      className={`dm-sync-sede-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleSyncSede(code)}
                    >
                      <div className="dm-sync-sede-check">
                        {isSelected ? '✅' : '⬜'}
                      </div>
                      <div className="dm-sync-sede-icon">{SEDE_ICONS[code]}</div>
                      <div className="dm-sync-sede-name">{SEDE_LABELS[code]}</div>
                      <div className="dm-sync-sede-count">{rulesCount} regla{rulesCount !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>

              <div className="dm-sync-summary">
                <span>📋 Se sincronizarán las reglas activas que apliquen a cada sede seleccionada</span>
                <span className="dm-sync-warning">⚠️ Las reglas con prefijo [MK-Gestor] anteriores serán reemplazadas</span>
              </div>
            </div>

            <div className="dm-sync-modal-footer">
              <button className="ge-btn secondary" onClick={() => setShowSyncModal(false)}>Cancelar</button>
              <button className="ge-btn accent" onClick={handleSyncToWP} disabled={syncing || syncSedes.length === 0}>
                {syncing ? "Sincronizando..." : `🔄 Sincronizar en ${syncSedes.length} sede(s)`}
              </button>
            </div>
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
          <div className="ge-stat-value primary">{visibleRules.length}</div>
          <div className="ge-stat-label">{esAdminGlobal ? 'Total reglas' : 'Reglas en tu sede'}</div>
        </div>
        <div className="ge-stat">
          <div className="ge-stat-value success">{visibleRules.filter(r => r.active).length}</div>
          <div className="ge-stat-label">Activas</div>
        </div>
        <div className="ge-stat">
          <div className="ge-stat-value warning">{visibleRules.filter(isActiveToday).length}</div>
          <div className="ge-stat-label">Ejecutándose hoy</div>
        </div>
      </div>

      {/* Reglas activas hoy */}
      {visibleRules.filter(isActiveToday).length > 0 && (
        <div className="ge-active-today">
          <div className="ge-active-today-title">🟢 Descuentos activos hoy:</div>
          <div className="ge-row-meta">
            {visibleRules.filter(isActiveToday).map(r => (
              <span key={r.id} className="ge-pill active-accent">
                {r.title} — {r.discount_value}{r.discount_type === 'percentage' ? '%' : '$'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ════════ Modal crear/editar regla ════════ */}
      {showForm && (
        <div className="dm-modal-overlay" onClick={resetForm}>
          <div className="dm-rule-modal" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="dm-rule-modal-header">
              <div className="dm-rule-modal-header-left">
                <div className="dm-rule-modal-icon">{editingRule ? '✏️' : '➕'}</div>
                <div>
                  <h3>{editingRule ? 'Editar Regla' : 'Nueva Regla de Descuento'}</h3>
                  <p className="dm-rule-modal-subtitle">{editingRule ? 'Modifica los parámetros de la regla' : 'Configura un nuevo descuento automático'}</p>
                </div>
              </div>
              <button className="dm-modal-close" onClick={resetForm}>×</button>
            </div>

            {/* Discount preview strip */}
            <div className="dm-discount-preview-strip">
              <div className="dm-discount-preview-value">
                {form.discount_value > 0 ? (
                  <>{form.discount_value}{form.discount_type === 'percentage' ? '%' : '$'} <span>de descuento</span></>
                ) : (
                  <span className="dm-discount-preview-empty">Configura el descuento</span>
                )}
              </div>
              <div className="dm-discount-preview-status">
                <span className={`dm-status-dot ${form.active ? 'active' : 'inactive'}`}></span>
                {form.active ? 'Activa' : 'Inactiva'}
              </div>
            </div>

            <div className="dm-rule-modal-body">
              {/* ── Sección 1: Información General ── */}
              <div className="dm-section">
                <div className="dm-section-header">
                  <span className="dm-section-number">1</span>
                  <span className="dm-section-title">Información General</span>
                </div>
                <div className="dm-section-content">
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
                  <label className="dm-toggle-check">
                    <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                    <span className="dm-toggle-slider"></span>
                    <span className="dm-toggle-label">Regla activa</span>
                  </label>
                </div>
              </div>

              {/* ── Sección 2: Productos ── */}
              <div className="dm-section">
                <div className="dm-section-header">
                  <span className="dm-section-number">2</span>
                  <span className="dm-section-title">Productos</span>
                </div>
                <div className="dm-section-content">
                  <div className="ge-form-group">
                    <select className="ge-input" value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value, applies_to_ids: [], applies_to_names: [] }))}>
                      <option value="all">Todos los productos</option>
                      <option value="products">Productos específicos (SKU)</option>
                    </select>
                  </div>

                  {form.applies_to === "products" && (
                    <>
                      {form.applies_to_names.length > 0 && (
                        <div className="dm-products-list">
                          {form.applies_to_names.map((name, idx) => (
                            <span key={idx} className="ge-chip product">
                              {name}
                              <button className="ge-chip-remove" onClick={() => removeProduct(idx)}>×</button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="ge-form-group" style={{ marginTop: 8 }}>
                        <input className="ge-input" placeholder="🔍 Buscar producto por nombre o SKU..." value={productSearch} onChange={e => handleProductSearch(e.target.value)} />
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

                      {/* Zona de importación masiva */}
                      <div className="dm-sku-import-zone">
                        <div className="dm-sku-import-header">
                          <span className="dm-sku-import-icon">📋</span>
                          <div>
                            <div className="dm-sku-import-title">Importación masiva de SKUs</div>
                            <div className="dm-sku-import-sub">Sube un archivo CSV con los códigos de producto</div>
                          </div>
                        </div>
                        <div className="dm-sku-import-body">
                          <div className="dm-sku-template">
                            <div className="dm-sku-template-label">📄 Formato del archivo:</div>
                            <table className="dm-sku-template-table">
                              <thead><tr><th>sku</th></tr></thead>
                              <tbody>
                                <tr><td>1734</td></tr>
                                <tr><td>176149</td></tr>
                                <tr><td>177422</td></tr>
                                <tr className="dm-sku-template-fade"><td>...</td></tr>
                              </tbody>
                            </table>
                            <div className="dm-sku-template-notes">
                              <span>✅ Primera fila: encabezado <strong>sku</strong></span>
                              <span>✅ Una columna, un SKU por fila</span>
                              <span>✅ Formatos: .csv o .txt</span>
                            </div>
                            <button type="button" className="dm-sku-template-download" onClick={downloadSkuTemplate}>
                              ⬇️ Descargar plantilla de ejemplo
                            </button>
                          </div>
                          <div className="dm-sku-upload-action">
                            <label className={`dm-sku-upload-btn ${uploadingSKUs ? 'loading' : ''}`}>
                              <input type="file" accept=".csv,.txt" onChange={handleSKUFileUpload} disabled={uploadingSKUs} style={{ display: 'none' }} />
                              {uploadingSKUs ? (
                                <><span className="dm-sku-spinner"></span> Procesando SKUs...</>
                              ) : (
                                <>📁 Seleccionar archivo CSV</>
                              )}
                            </label>
                            {form.applies_to_ids.length > 0 && (
                              <div className="dm-sku-count-badge">
                                {form.applies_to_ids.length} producto(s) seleccionados
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Sección 3: Programación ── */}
              <div className="dm-section">
                <div className="dm-section-header">
                  <span className="dm-section-number">3</span>
                  <span className="dm-section-title">Programación</span>
                </div>
                <div className="dm-section-content">
                  <div className="ge-form-group">
                    <select className="ge-input" value={form.schedule_type} onChange={e => setForm(f => ({ ...f, schedule_type: e.target.value }))}>
                      <option value="days">Días de la semana</option>
                      <option value="date_range">Rango de fechas</option>
                      <option value="always">Siempre activo</option>
                    </select>
                  </div>

                  {form.schedule_type === "days" && (
                    <div className="ge-row-meta" style={{ marginTop: 8 }}>
                      {DAYS.map(day => (
                        <button key={day.value} type="button" onClick={() => toggleDay(day.value)} className={`ge-day-btn ${form.schedule_days.includes(day.value) ? 'active' : ''}`}>
                          {day.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {form.schedule_type === "date_range" && (
                    <div className="ge-form-row" style={{ marginTop: 8 }}>
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
              </div>

              {/* ── Sección 4: Sedes (solo admin global) ── */}
              {esAdminGlobal && (
              <div className="dm-section">
                <div className="dm-section-header">
                  <span className="dm-section-number">4</span>
                  <span className="dm-section-title">Sedes</span>
                </div>
                <div className="dm-section-content">
                  <p className="dm-section-hint">Selecciona en qué sedes aplica esta regla de descuento</p>
                  <div className="dm-sede-selector">
                    <div
                      className={`dm-sede-pill all ${formSedesAll ? 'active' : ''}`}
                      onClick={setFormSedesAll}
                    >
                      🌐 Todas las sedes
                    </div>
                    {Object.keys(SEDE_WP_URLS).map(code => (
                      <div
                        key={code}
                        className={`dm-sede-pill ${!formSedesAll && form.sedes?.includes(code) ? 'active' : ''} ${formSedesAll ? 'dimmed' : ''}`}
                        onClick={() => {
                          if (formSedesAll) {
                            // Switch from "all" to specific: select only this one
                            setForm(f => ({ ...f, sedes: [code] }));
                          } else {
                            toggleFormSede(code);
                          }
                        }}
                      >
                        {SEDE_ICONS[code]} {SEDE_LABELS[code]}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="dm-rule-modal-footer">
              <button className="ge-btn secondary" onClick={resetForm}>Cancelar</button>
              <button className="ge-btn accent" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : (editingRule ? "💾 Actualizar Regla" : "💾 Crear Regla")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de reglas */}
      {loading ? (
        <div className="ge-card ge-empty">Cargando reglas...</div>
      ) : visibleRules.length === 0 ? (
        <div className="ge-card ge-empty">
          {esAdminGlobal
            ? 'No hay reglas de descuento. Crea la primera.'
            : `No hay reglas de descuento para ${sedeActual?.nombre || 'tu sede'}.`}
        </div>
      ) : (
        <div className="ge-card">
          {visibleRules.map(rule => {
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
                    {' · '}
                    {!rule.sedes ? (
                      <span className="dm-sede-badge all">🌐 Todas</span>
                    ) : (
                      rule.sedes.map(s => (
                        <span key={s} className="dm-sede-badge">{SEDE_ICONS[s]} {(SEDE_LABELS[s] || s).split(' ')[0]}</span>
                      ))
                    )}
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
          <strong>💡 Sedes:</strong> Cada regla puede asignarse a sedes específicas. Al sincronizar, solo se envían
          las reglas que correspondan a cada sede.
        </div>
      </div>
    </div>
  );
}
