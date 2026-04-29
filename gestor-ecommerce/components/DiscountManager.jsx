import React, { useState, useEffect, useRef } from "react";
import { fetchDiscountRules, createDiscountRule, updateDiscountRule, deleteDiscountRule, syncDiscountRulesToWP, applyValueDiscounts, SEDE_WP_URLS } from "../services";
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
  discount_type: "percentage",  // "percentage" | "exact_price" | "value_discount"
  discount_value: 0,
  applies_to: "products",
  applies_to_ids: [],
  applies_to_names: [],
  // Descuento individual por producto (para value_discount):
  // [{ sku: "11422", variation: "P6"|null, woo_product_id: 123, name: "...", discount_amount: 4010 }]
  product_discounts: [],
  schedule_type: "days",
  schedule_days: [],
  date_start: "",
  date_end: "",
  active: true,
  display_order: 0,
  sedes: null, // null = todas, array = específicas
  badge_enabled: false,
  badge_text: "",
  badge_bg_color: "#160857",
  badge_text_color: "#88dc00",
  priority: 50,
  // Condición de carrito para descuentos autoliquidables:
  // cart_condition_type: 'subtotal' | null
  // cart_condition_value: monto mínimo del carrito (ej: 150000)
  cart_condition_type: null,
  cart_condition_value: 0,
};

/**
 * Parsea un SKU para detectar si tiene sufijo de variación.
 * Ej: "11422P6" -> { baseSku: "11422", variation: "P6" }
 * Ej: "11422UND" -> { baseSku: "11422", variation: "UND" }
 * Ej: "1111" -> { baseSku: "1111", variation: null }
 */
function parseSkuVariation(rawSku) {
  const sku = String(rawSku).trim().toUpperCase();
  // Patrones de variación conocidos: P seguido de números, o UND/UN/UNID/UNIDAD
  const variationMatch = sku.match(/^(\d+)(P\d+|UND|UN|UNID|UNIDAD)$/i);
  if (variationMatch) {
    return { baseSku: variationMatch[1], variation: variationMatch[2].toUpperCase() };
  }
  return { baseSku: sku, variation: null };
}

/**
 * Parsea un valor monetario: "$4,010" | "$4.010" | "4010" -> 4010
 */
function parseMoneyValue(val) {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  // Remover símbolo de moneda y espacios
  let clean = str.replace(/[$\s]/g, '');
  // Si tiene formato con coma como separador de miles (ej: "4,010" o "4.010,50")
  // Detectar si la coma es separador decimal o de miles
  if (clean.includes(',') && clean.includes('.')) {
    // Formato: 4.010,50 (punto miles, coma decimal)
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato: 4,010.50 (coma miles, punto decimal)
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    // Solo coma: podría ser "4,010" (miles) o "4,5" (decimal)
    const parts = clean.split(',');
    if (parts[1]?.length === 3) {
      // Es separador de miles: "4,010" -> "4010"
      clean = clean.replace(/,/g, '');
    } else {
      // Es decimal: "4,5" -> "4.5"
      clean = clean.replace(',', '.');
    }
  } else if (clean.includes('.')) {
    // Solo punto: podría ser "4.010" (miles) o "4.5" (decimal)
    const parts = clean.split('.');
    if (parts.length === 2 && parts[1]?.length === 3 && parts[0]?.length >= 1) {
      // Probablemente separador de miles: "4.010" -> "4010"
      clean = clean.replace(/\./g, '');
    }
    // Si no, es decimal normal
  }
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.round(num); // Redondear a entero (pesos colombianos)
}

/**
 * Retorna la prioridad de una regla (menor = más importante).
 * Default 50 para reglas sin prioridad asignada.
 */
function getPriority(rule) {
  return rule.priority ?? 50;
}

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
  const [applyingDiscounts, setApplyingDiscounts] = useState(false);
  const [applyResults, setApplyResults] = useState(null);
  const [savingStep, setSavingStep] = useState(""); // indicador de paso al guardar
  const [deletingId, setDeletingId] = useState(null); // id de regla en proceso de borrado
  const fileInputRef = useRef(null);

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
      applies_to_names: [...f.applies_to_names, prod.name + (prod.sku ? ` (${prod.sku})` : '')],
      product_discounts: [...(f.product_discounts || []), {
        sku: prod.sku || '',
        variation: null,
        woo_product_id: prod.id,
        name: prod.name,
        discount_amount: 0,
      }],
    }));
    setProductSearch("");
    setProductResults([]);
  };

  const removeProduct = (idx) => {
    setForm(f => ({
      ...f,
      applies_to_ids: f.applies_to_ids.filter((_, i) => i !== idx),
      applies_to_names: f.applies_to_names.filter((_, i) => i !== idx),
      product_discounts: (f.product_discounts || []).filter((_, i) => i !== idx),
    }));
  };

  const updateProductDiscount = (idx, amount) => {
    setForm(f => ({
      ...f,
      product_discounts: (f.product_discounts || []).map((pd, i) =>
        i === idx ? { ...pd, discount_amount: amount } : pd
      ),
    }));
  };

  // --- Descargar plantilla CSV de ejemplo ---
  const downloadSkuTemplate = () => {
    const content = form.discount_type === 'value_discount'
      ? 'sku,valor_dscto\n1734,5000\n176149P6,3500\n177422UND,2000\n179394,4010'
      : 'sku\n1734\n176149\n177422\n179394\n179643';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = form.discount_type === 'value_discount' ? 'plantilla_valor_dscto.csv' : 'plantilla_skus.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Carga dinámica de SheetJS para parsear archivos XLS/XLSX
   */
  const loadSheetJS = async () => {
    if (window.XLSX) return window.XLSX;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => reject(new Error('No se pudo cargar la librería para leer archivos Excel'));
      document.head.appendChild(script);
    });
  };

  /**
   * Parsea las filas del archivo (CSV o XLS/XLSX) y retorna
   * array de { sku, valor_dscto? } 
   */
  const parseFileRows = async (file) => {
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xls') || name.endsWith('.xlsx');
    const isCsv = name.endsWith('.csv') || name.endsWith('.txt');

    if (!isExcel && !isCsv) {
      throw new Error('Formato no soportado. Usa archivos .csv, .txt, .xls o .xlsx');
    }

    let headers = [];
    let dataRows = [];

    if (isExcel) {
      const XLSX = await loadSheetJS();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      if (jsonData.length === 0) throw new Error('El archivo está vacío');
      headers = jsonData[0].map(h => String(h).trim().replace(/^["']|["']$/g, '').replace(/[.\s]+$/, '').toLowerCase());
      dataRows = jsonData.slice(1);
    } else {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length === 0) throw new Error('El archivo está vacío');
      const sep = lines[0].includes(';') ? ';' : ',';
      headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').replace(/[.\s]+$/, '').toLowerCase());
      dataRows = lines.slice(1).map(l => l.split(sep).map(c => c.trim().replace(/^["']|["']$/g, '')));
    }

    // Encontrar índice de columnas
    const skuColIdx = headers.findIndex(h => 
      h === 'sku' || h === 'item' || h === 'codigo' || h === 'código' || h === 'item_code'
    );
    const valDsctoIdx = headers.findIndex(h => 
      h === 'valor_dscto' || h === 'valor dscto' || h === 'valor_descuento' || 
      h === 'valor descuento' || h === 'descuento' || h === 'discount' || h === 'dscto' ||
      h === 'valor dsc' || h === 'valor_dsc' || h.includes('valor dscto')
    );
    const maxCantIdx = headers.findIndex(h => 
      h.includes('nt. máxima') || h.includes('nt. maxima') || 
      h.includes('cant. máxima') || h.includes('cant. maxima') || h.includes('maxima')
    );
    
    const colIdx = skuColIdx >= 0 ? skuColIdx : 0;

    const rows = [];
    for (const cols of dataRows) {
      let skuRaw = String(cols[colIdx] || '').trim();
      if (!skuRaw) continue;
      
      const valorDscto = valDsctoIdx >= 0 ? parseMoneyValue(cols[valDsctoIdx]) : 0;

      // Auto-conversión de sufijo P (ej: de 1199 a 1199P25) basado en Cant. máxima
      if (maxCantIdx >= 0) {
        const cantMaxStr = String(cols[maxCantIdx] || '').trim();
        // Siesa puede traer "25,00" o "25.00"
        const cantMaxFloat = parseFloat(cantMaxStr.replace(',', '.'));
        if (!isNaN(cantMaxFloat) && cantMaxFloat > 0) {
          const cantMaxInt = Math.round(cantMaxFloat);
          skuRaw = `${skuRaw}P${cantMaxInt}`;
        }
      }

      rows.push({ sku: skuRaw, valor_dscto: valorDscto });
    }
    return rows;
  };

  // --- Importar SKUs desde archivo CSV/XLS ---
  const handleSKUFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploadingSKUs(true);
    try {
      const rows = await parseFileRows(file);
      if (rows.length === 0) { alert('No se encontraron SKUs en el archivo'); return; }

      const isValueDiscount = form.discount_type === 'value_discount';
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://backend-gestor-ecommerce.vercel.app';
      let added = 0, notFound = [];

      for (const row of rows) {
        try {
          // Parsear si el SKU tiene variación (ej: 11422P6 -> baseSku=11422, variation=P6)
          const { baseSku, variation } = parseSkuVariation(row.sku);

          const res = await fetch(`${apiBase}/api/catalog?search=${encodeURIComponent(baseSku)}&pageSize=5&exactSearch=true&filter=active`);
          const data = await res.json();
          if (data.ok && data.data?.length > 0) {
            const prod = data.data[0];
            const id = prod.woo_product_id || prod.woo_id;
            const name = prod.descripcion || prod.nombre || prod.name || prod.item;
            const prodSku = prod.item || prod.sku || prod.item_code;

            if (id) {
              // Verificar si ya existe este producto+variación
              const alreadyExists = (form.product_discounts || []).some(pd =>
                pd.sku === prodSku && pd.variation === variation
              );
              if (!alreadyExists) {
                const displayName = name + (prodSku ? ` (${prodSku})` : '') + (variation ? ` [${variation}]` : '');
                
                setForm(f => ({
                  ...f,
                  applies_to_ids: f.applies_to_ids.includes(id) ? f.applies_to_ids : [...f.applies_to_ids, id],
                  applies_to_names: f.applies_to_ids.includes(id) ? f.applies_to_names : [...f.applies_to_names, displayName],
                  product_discounts: [...(f.product_discounts || []), {
                    sku: prodSku,
                    variation: variation,
                    woo_product_id: id,
                    name: name,
                    discount_amount: isValueDiscount ? row.valor_dscto : 0,
                  }],
                }));
                added++;
              }
            }
          } else {
            notFound.push(row.sku);
          }
        } catch { notFound.push(row.sku); }
      }

      let msg = `${added} producto(s) agregados de ${rows.length} filas.`;
      if (isValueDiscount && added > 0) msg += `\nCon sus respectivos valores de descuento individual.`;
      if (notFound.length > 0) msg += `\n\n${notFound.length} no encontrados:\n${notFound.slice(0, 20).join(', ')}${notFound.length > 20 ? '...' : ''}`;
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
        // Filtrar reglas que aplican a ESTA sede (sedes=null → todas, o que incluya el code)
        let sedeRules = activeRules
          .filter(r => !r.sedes || r.sedes.includes(code))
          .sort((a, b) => getPriority(a) - getPriority(b)); // mayor prioridad primero

        // IDs bloqueados por separatas activas HOY en ESTA sede específica
        const sedeSeparatas = sedeRules.filter(r =>
          getPriority(r) === 1 && r.discount_type === 'value_discount' && isActiveToday(r)
        );
        const separataProductIds = new Set(
          sedeSeparatas.flatMap(r => (r.applies_to_ids || []).map(id => String(id)))
        );

        // Para reglas semanales (P10), excluir productos cubiertos por separatas de ESTA sede
        if (separataProductIds.size > 0) {
          sedeRules = sedeRules.map(rule => {
            if (getPriority(rule) !== 10 || rule.applies_to !== 'products') return rule;
            const filteredIds = (rule.applies_to_ids || []).filter(id => !separataProductIds.has(String(id)));
            const filteredNames = (rule.applies_to_names || []).filter((_, i) =>
              !separataProductIds.has(String((rule.applies_to_ids || [])[i]))
            );
            return { ...rule, applies_to_ids: filteredIds, applies_to_names: filteredNames };
          });
        }
        try {
          const r = await syncDiscountRulesToWP(url, sedeRules);
          results.push({ code, ok: r.ok, synced: r.synced || 0, total: sedeRules.length, separatasCount: separataProductIds.size });
        } catch {
          results.push({ code, ok: false, synced: 0, total: sedeRules.length, separatasCount: 0 });
        }
      }
      const ok = results.filter(r => r.ok);
      const fail = results.filter(r => !r.ok);
      const detail = ok.map(r =>
        `  ✅ ${SEDE_LABELS[r.code] || r.code}: ${r.total} regla(s)` +
        (r.separatasCount > 0 ? ` (⭐ ${r.separatasCount} prod. excluidos de semanal)` : '')
      ).join('\n');
      if (fail.length === 0) {
        alert(`Sincronización exitosa en ${ok.length} sede(s):\n\n${detail}\n\nEl plugin FlyCart ya las está aplicando.\nColores y texto de las barras de descuento actualizados desde el Gestor.`);
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
        // Importar configuración de barra de descuento desde FlyCart si existía
        badge_enabled: rule.badge_enabled || false,
        badge_text: rule.badge_text || "",
        badge_bg_color: rule.badge_bg_color || "#160857",
        badge_text_color: rule.badge_text_color || "#88dc00",
        cart_condition_type: rule.cart_condition_type || null,
        cart_condition_value: rule.cart_condition_value || 0,
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
      product_discounts: rule.product_discounts || [],
      schedule_type: rule.schedule_type || "days",
      schedule_days: rule.schedule_days || [],
      date_start: rule.date_start || "",
      date_end: rule.date_end || "",
      active: rule.active,
      display_order: rule.display_order || 0,
      sedes: rule.sedes || null,
      badge_enabled: rule.badge_enabled || false,
      badge_text: rule.badge_text || "",
      badge_bg_color: rule.badge_bg_color || "#160857",
      badge_text_color: rule.badge_text_color || "#88dc00",
      priority: rule.priority ?? 50,
      cart_condition_type: rule.cart_condition_type || null,
      cart_condition_value: rule.cart_condition_value || 0,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert("Ingresa un título para la regla"); return; }
    if (form.discount_type !== 'value_discount') {
      if (!form.discount_value || form.discount_value <= 0) { alert("El descuento debe ser mayor a 0"); return; }
    } else {
      // Para value_discount, validar que haya productos con montos
      const productsWithDiscount = (form.product_discounts || []).filter(pd => pd.discount_amount > 0);
      if (productsWithDiscount.length === 0) { alert("Agrega al menos un producto con valor de descuento"); return; }
    }
    if (form.schedule_type === "days" && form.schedule_days.length === 0) { alert("Selecciona al menos un día"); return; }
    if (form.schedule_type === "date_range" && (!form.date_start || !form.date_end)) { alert("Selecciona las fechas de inicio y fin"); return; }

    setSaving(true);
    setSavingStep("Guardando regla...");
    try {
      const payload = { ...form };
      // Limpiar campos innecesarios según schedule_type
      if (payload.schedule_type === "days") { payload.date_start = null; payload.date_end = null; }
      if (payload.schedule_type === "date_range") { payload.schedule_days = []; }
      if (payload.schedule_type === "always") { payload.schedule_days = []; payload.date_start = null; payload.date_end = null; }
      if (payload.schedule_type === "cart_condition") { payload.schedule_days = []; payload.date_start = null; payload.date_end = null; }
      if (payload.schedule_type !== "cart_condition") { payload.cart_condition_type = null; payload.cart_condition_value = 0; }
      if (payload.applies_to === "all") { payload.applies_to_ids = []; payload.applies_to_names = []; payload.product_discounts = []; }
      // Sedes: si están todas seleccionadas o ninguna, guardar null (=todas)
      if (payload.sedes && payload.sedes.length === Object.keys(SEDE_WP_URLS).length) {
        payload.sedes = null;
      }
      // Para value_discount, el discount_value global no aplica
      if (payload.discount_type === 'value_discount') {
        payload.discount_value = 0;
      }

      const res = editingRule
        ? await updateDiscountRule(editingRule.id, payload)
        : await createDiscountRule(payload);

      if (res.ok) {
        resetForm();
        await loadRules();

        // Si es value_discount con rango de fechas, aplicar automáticamente en WooCommerce
        // WooCommerce maneja date_on_sale_from / date_on_sale_to de forma nativa:
        // el tachado aparece solo en date_start y desaparece solo en date_end.
        if (
          payload.discount_type === 'value_discount' &&
          payload.schedule_type === 'date_range' &&
          payload.date_start && payload.date_end
        ) {
          const productsWithDiscount = (payload.product_discounts || []).filter(pd => pd.discount_amount > 0);
          if (productsWithDiscount.length > 0) {
            const targetSedes = payload.sedes || Object.keys(SEDE_WP_URLS);
            setSaving(true);
            setSavingStep(`Aplicando en WooCommerce (${(payload.sedes || Object.keys(SEDE_WP_URLS)).length} sede(s), ${productsWithDiscount.length} producto(s))...`);
            try {
              const applyRes = await applyValueDiscounts({
                product_discounts: productsWithDiscount,
                sedes: targetSedes,
                date_from: payload.date_start,
                date_to: payload.date_end,
              });
              const s = applyRes.summary || {};
              const today = new Date().toISOString().split('T')[0];
              const isFuture = payload.date_start > today;
              if (applyRes.ok) {
                alert(
                  `✅ Regla guardada y programada en WooCommerce.\n\n` +
                  `• ${s.success || 0} producto(s) registrados\n` +
                  `• ${targetSedes.length} sede(s)\n\n` +
                  (isFuture
                    ? `📅 El precio tachado aparecerá automáticamente el ${payload.date_start} y se quitará solo el ${payload.date_end}.\nNo necesitas hacer nada más.`
                    : `✔️ Precio tachado activo desde hoy hasta el ${payload.date_end}.`)
                );
              } else {
                alert(`Regla guardada, pero hubo un error al registrar en WooCommerce:\n${applyRes.message || 'Error desconocido'}\n\nUsa el botón $ en la lista para reintentarlo.`);
              }
            } catch (applyErr) {
              alert(`Regla guardada, pero error al registrar en WooCommerce:\n${applyErr.message}\n\nUsa el botón $ en la lista para reintentarlo.`);
            } finally {
              setSaving(false);
            }
          }
        } else if (payload.discount_type !== 'value_discount') {
          alert('✅ Regla guardada. Usa "Sincronizar con WP" para enviarla al plugin FlyCart.');
        } else {
          alert('✅ Regla guardada.');
        }
      }
      else alert("Error: " + (res.message || "No se pudo guardar"));
    } catch (err) {
      alert("Error guardando regla: " + err.message);
    } finally {
      setSaving(false);
      setSavingStep("");
    }
  };

  // sale_price se aplica/quita MANUALMENTE con los botones $ y x$ del listado.
  // Para reglas con date_range, WooCommerce maneja las fechas automáticamente.

  const handleDelete = async (id) => {
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    const isValueDscto = rule.discount_type === 'value_discount';
    const hasProducts = isValueDscto && (rule.product_discounts || []).length > 0;

    const confirmMsg = hasProducts
      ? `¿Eliminar la regla "${rule.title}"?\n\nSe quitará el precio tachado de ${rule.product_discounts.length} producto(s) en WooCommerce en segundo plano.`
      : `¿Eliminar la regla "${rule.title}"?`;
    if (!confirm(confirmMsg)) return;

    // 1. Quitar del panel inmediatamente (UI optimista)
    setRules(prev => prev.filter(r => r.id !== id));

    // 2. Borrar de la base de datos
    try {
      const res = await deleteDiscountRule(id);
      if (!res.ok) {
        // Si falla BD, revertir
        loadRules();
        alert("Error eliminando de la base de datos: " + (res.message || ""));
        return;
      }
    } catch (err) {
      loadRules();
      alert("Error: " + err.message);
      return;
    }

    // 3. Quitar sale_price de WooCommerce en segundo plano (no bloquea UI)
    if (hasProducts) {
      const targetSedes = rule.sedes || Object.keys(SEDE_WP_URLS);
      applyValueDiscounts({
        product_discounts: rule.product_discounts.map(pd => ({ ...pd, discount_amount: 0 })),
        sedes: targetSedes,
        remove: true,
      }).catch(err => console.error("Error quitando sale_price de WooCommerce (background):", err.message));
    }
  };

  const handleToggleActive = async (rule) => {
    const newActive = !rule.active;
    try {
      const res = await updateDiscountRule(rule.id, { active: newActive });
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: newActive } : r));
      }
    } catch (err) { console.error(err); }
  };

  const handleApplyValueDiscounts = async (rule) => {
    if (!rule.product_discounts?.length) { alert("Esta regla no tiene productos con descuento."); return; }
    const productsWithDiscount = rule.product_discounts.filter(pd => pd.discount_amount > 0);
    if (productsWithDiscount.length === 0) { alert("Ningún producto tiene valor de descuento > 0."); return; }
    const targetSedes = rule.sedes || Object.keys(SEDE_WP_URLS);

    // ── Prioridad: detectar productos bloqueados por reglas de mayor prioridad activas hoy EN LAS MISMAS SEDES
    const higherPriorityActive = rules.filter(r =>
      r.id !== rule.id && r.active &&
      r.discount_type === 'value_discount' &&
      getPriority(r) < getPriority(rule) && isActiveToday(r) &&
      sharesAnySedeWith(r, rule)  // solo bloquea si comparte sede con esta regla
    );
    const lockedKeys = new Set(
      higherPriorityActive.flatMap(r =>
        (r.product_discounts || []).map(pd => `${pd.sku}|${pd.variation || ''}`)
      )
    );
    const toApply = lockedKeys.size > 0
      ? productsWithDiscount.filter(pd => !lockedKeys.has(`${pd.sku}|${pd.variation || ''}`))
      : productsWithDiscount;
    const skipped = lockedKeys.size > 0
      ? productsWithDiscount.filter(pd => lockedKeys.has(`${pd.sku}|${pd.variation || ''}`))
      : [];

    if (toApply.length === 0 && skipped.length > 0) {
      const blockedByRules = [...new Set(higherPriorityActive.map(r => `"${r.title}" (P${getPriority(r)})`))].join(', ');
      alert(
        `⚠️ Todos los productos de esta regla están cubiertos por reglas de mayor prioridad.\n\n` +
        `Bloqueados por: ${blockedByRules}\n\n` +
        `Productos (${skipped.length}):\n` + skipped.slice(0, 10).map(pd => `  • ${pd.sku}${pd.variation ? ` [${pd.variation}]` : ''}`).join('\n') +
        (skipped.length > 10 ? `\n  ...y ${skipped.length - 10} más` : '') +
        `\n\nSi quieres forzar este descuento sobre esos productos, sube la prioridad de esta regla.`
      );
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const hasFutureStart = rule.schedule_type === 'date_range' && rule.date_start && rule.date_start > today;
    const hasDateRange = rule.schedule_type === 'date_range' && rule.date_start && rule.date_end;

    let confirmMsg = `¿Pre-programar sale_price en ${toApply.length} productos × ${targetSedes.length} sedes?`;
    if (skipped.length > 0) {
      confirmMsg += `\n\n⚠️ ${skipped.length} producto(s) omitidos por tener una regla de mayor prioridad activa hoy.`;
    }
    if (hasFutureStart) {
      confirmMsg += `\n\n📅 Inicio programado: ${rule.date_start}\n📅 Fin programado: ${rule.date_end}\n\nWooCommerce respetará estas fechas — el precio tachado aparecerá AUTOMÁTICAMENTE el ${rule.date_start} y desaparecerá el ${rule.date_end}.\n\nPuedes hacer clic en $ hoy y WooCommerce no mostrará el tachado hasta el ${rule.date_start}.`;
    } else if (hasDateRange) {
      confirmMsg += `\n\n📅 Vigente: ${rule.date_start} → ${rule.date_end}\n\nSe aplicará el precio tachado en WooCommerce con las fechas de vigencia configuradas.`;
    } else {
      confirmMsg += `\n\nEsto tachará los precios en WooCommerce inmediatamente.`;
    }

    if (!confirm(confirmMsg)) return;
    try {
      setApplyingDiscounts(true);
      setApplyResults(null);
      const res = await applyValueDiscounts({
        product_discounts: toApply,
        sedes: targetSedes,
        date_from: rule.date_start || null,
        date_to: rule.date_end || null,
      });
      if (res.ok) {
        const s = res.summary || {};
        setApplyResults(res);
        const datesMsg = hasFutureStart
          ? `\n\n🗓️ El precio tachado aparecerá en la tienda el ${rule.date_start}.`
          : '';
        const skippedMsg = skipped.length > 0
          ? `\n\n⏭️ ${skipped.length} omitidos por prioridad (cubiertos por otra regla activa).`
          : '';
        // Mostrar productos fallidos con detalle
        const failedItems = (res.results || []).filter(r => !r.ok);
        const uniqueFailed = [...new Map(failedItems.map(r => [r.sku + (r.variation || ''), r])).values()];
        const failDetail = uniqueFailed.length > 0
          ? `\n\n❌ Fallidos (${uniqueFailed.length}):\n` + uniqueFailed.slice(0, 10).map(r => `  • ${r.sku}${r.variation ? ` [${r.variation}]` : ''}: ${r.message || 'error'}`).join('\n')
            + (uniqueFailed.length > 10 ? `\n  ...y ${uniqueFailed.length - 10} más` : '')
          : '';
        alert(`Descuentos programados en WooCommerce.\n\n✅ ${s.success || 0} exitoso(s)\n❌ ${s.failed || 0} fallido(s)\n📦 ${targetSedes.length} sede(s)${datesMsg}${skippedMsg}${failDetail}`);
      } else {
        alert("Error aplicando descuentos: " + (res.message || "Error desconocido"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setApplyingDiscounts(false);
    }
  };

  // --- Quitar sale_price de WooCommerce (botón x$) ---
  const handleRemoveValueDiscounts = async (rule) => {
    if (!rule.product_discounts?.length) { alert("Esta regla no tiene productos."); return; }
    const targetSedes = rule.sedes || Object.keys(SEDE_WP_URLS);
    if (!confirm(`¿Quitar sale_price de ${rule.product_discounts.length} productos × ${targetSedes.length} sedes?\n\nLos precios volverán a su valor normal.`)) return;
    try {
      setApplyingDiscounts(true);
      setApplyResults(null);
      const res = await applyValueDiscounts({
        product_discounts: rule.product_discounts.map(pd => ({ ...pd, discount_amount: 0 })),
        sedes: targetSedes,
        remove: true,
      });
      if (res.ok) {
        const s = res.summary || {};
        setApplyResults(res);
        alert(`Precios de oferta removidos de WooCommerce.\n\n✅ ${s.success || 0} exitoso(s)\n❌ ${s.failed || 0} fallido(s)\n📦 ${targetSedes.length} sede(s)`);
      } else {
        alert("Error quitando descuentos: " + (res.message || "Error desconocido"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setApplyingDiscounts(false);
    }
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

  // Helper: comprueba si dos reglas comparten al menos una sede
  const sharesAnySedeWith = (ruleA, ruleB) => {
    if (!ruleA.sedes || !ruleB.sedes) return true; // una de las dos aplica a todas
    return ruleA.sedes.some(s => ruleB.sedes.includes(s));
  };

  // Cuenta cuántos productos de una regla están "bloqueados" por reglas de mayor prioridad activas hoy EN LA MISMA SEDE
  const getConflictCount = (rule) => {
    if (rule.discount_type !== 'value_discount') return 0;
    const pds = rule.product_discounts || [];
    if (pds.length === 0) return 0;
    const higherActive = rules.filter(r =>
      r.id !== rule.id && r.active &&
      r.discount_type === 'value_discount' &&
      getPriority(r) < getPriority(rule) && isActiveToday(r) &&
      sharesAnySedeWith(r, rule)  // solo cuenta si aplica a la misma sede
    );
    if (higherActive.length === 0) return 0;
    const lockedKeys = new Set(
      higherActive.flatMap(r => (r.product_discounts || []).map(pd => `${pd.sku}|${pd.variation || ''}`))
    );
    return pds.filter(pd => lockedKeys.has(`${pd.sku}|${pd.variation || ''}`)).length;
  };
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
                <span className="dm-sync-warning">ℹ️ Las reglas existentes se actualizan sin perder configuración de badges</span>
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
                  {rule.discount_type === 'exact_price' ? '$' : ''}{rule.discount_value}{rule.discount_type === 'percentage' ? '%' : (rule.discount_type !== 'exact_price' ? '$' : '')}
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
                {r.title} — {r.discount_type === 'value_discount'
                  ? `${(r.product_discounts || []).length} productos`
                  : (r.discount_type === 'exact_price' ? `$${r.discount_value}` : `${r.discount_value}${r.discount_type === 'percentage' ? '%' : '$'}`)}
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
                {form.discount_type === 'value_discount' ? (
                  <>
                    {(form.product_discounts || []).length > 0 ? (
                      <>{(form.product_discounts || []).filter(pd => pd.discount_amount > 0).length} productos <span>con descuento individual</span></>
                    ) : (
                      <span className="dm-discount-preview-empty">Sube un archivo con los descuentos</span>
                    )}
                  </>
                ) : form.discount_value > 0 ? (
                  <>{form.discount_type === 'exact_price' ? 'Precio final: $' : ''}{form.discount_value}{form.discount_type === 'percentage' ? '%' : (form.discount_type !== 'exact_price' ? '$' : '')} <span>{form.discount_type === 'exact_price' ? '(exacto)' : 'de descuento'}</span></>
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
                      <select className="ge-input" value={form.discount_type} onChange={e => {
                        const newType = e.target.value;
                        setForm(f => ({
                          ...f,
                          discount_type: newType,
                          // Si cambia a value_discount, forzar applies_to = products
                          applies_to: newType === 'value_discount' ? 'products' : f.applies_to,
                          discount_value: newType === 'value_discount' ? 0 : f.discount_value,
                        }));
                      }}>
                        <option value="percentage">Porcentaje (%)</option>
                        <option value="exact_price">Precio Fijo Exacto ($)</option>
                        <option value="value_discount">Valor dscto (individual por producto)</option>
                      </select>
                    </div>
                    {form.discount_type !== 'value_discount' && (
                    <div className="ge-form-group">
                      <label>{form.discount_type === 'exact_price' ? 'Precio Final ($)' : `Valor ${form.discount_type === 'percentage' ? '(%)' : '($)'}`}</label>
                      <input type="number" className="ge-input" placeholder={form.discount_type === 'percentage' ? "Ej: 15" : "Ej: 54990"} value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} min="0" max={form.discount_type === 'percentage' ? 100 : undefined} />
                    </div>
                    )}
                  </div>
                  {form.discount_type === 'value_discount' && (
                    <div className="dm-value-discount-info">
                      <span className="dm-info-icon">i</span>
                      <div>
                        <strong>Descuento por Valor:</strong> Cada producto tendrá un monto de descuento individual
                        que se resta de su precio normal. Sube un archivo CSV/XLS con las columnas <code>sku</code> y <code>valor_dscto</code>.
                        Si un SKU tiene variación (ej: 11422P6), se detecta automáticamente.
                      </div>
                    </div>
                  )}
                  <label className="dm-toggle-check">
                    <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                    <span className="dm-toggle-slider"></span>
                    <span className="dm-toggle-label">Regla activa</span>
                  </label>

                  {/* Prioridad */}
                  <div className="ge-form-group" style={{ marginTop: 16 }}>
                    <label>Tipo de regla <span className="ge-form-help">— define qué descuento prevalece cuando un producto aparece en ambas</span></label>
                    <div className="dm-priority-grid">
                      {[
                        { value: 1,  label: '⭐ Separata',       desc: 'Tiene precedencia sobre el descuento semanal. Úsala para promociones de separata.' },
                        { value: 5,  label: '🛒 Autoliquidable', desc: 'Descuento condicionado al carrito. Se activa cuando el cliente supera el monto mínimo.' },
                        { value: 10, label: '🗓️ Semanal',        desc: 'Descuento recurrente por día de la semana. La separata lo sobrescribe si coincide.' },
                      ].map(opt => (
                        <div
                          key={opt.value}
                          className={`dm-priority-card ${form.priority === opt.value ? 'active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, priority: opt.value }))}
                        >
                          <div className="dm-priority-card-label">{opt.label}</div>
                          <div className="dm-priority-card-desc">{opt.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
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
                      {/* Lista de productos con descuento individual (value_discount) */}
                      {form.discount_type === 'value_discount' && (form.product_discounts || []).length > 0 && (
                        <div className="dm-product-discounts-table">
                          <div className="dm-pd-header">
                            <span className="dm-pd-col-sku">SKU</span>
                            <span className="dm-pd-col-name">Producto</span>
                            <span className="dm-pd-col-var">Variación</span>
                            <span className="dm-pd-col-val">Valor dscto</span>
                            <span className="dm-pd-col-act"></span>
                          </div>
                          {(form.product_discounts || []).map((pd, idx) => (
                            <div key={idx} className="dm-pd-row">
                              <span className="dm-pd-col-sku">{pd.sku}</span>
                              <span className="dm-pd-col-name" title={pd.name}>{pd.name}</span>
                              <span className={`dm-pd-col-var ${pd.variation ? 'has-var' : ''}`}>
                                {pd.variation ? <span className="dm-var-badge">{pd.variation}</span> : <span className="dm-var-none">--</span>}
                              </span>
                              <span className="dm-pd-col-val">
                                <div className="dm-pd-val-input">
                                  <span className="dm-pd-val-prefix">$</span>
                                  <input
                                    type="number"
                                    className="ge-input dm-pd-amount"
                                    value={pd.discount_amount || ''}
                                    onChange={e => updateProductDiscount(idx, Number(e.target.value))}
                                    placeholder="0"
                                    min="0"
                                  />
                                </div>
                              </span>
                              <span className="dm-pd-col-act">
                                <button className="ge-btn icon outline-danger dm-pd-remove" onClick={() => removeProduct(idx)}>x</button>
                              </span>
                            </div>
                          ))}
                          <div className="dm-pd-summary">
                            {(form.product_discounts || []).filter(pd => pd.discount_amount > 0).length} de {(form.product_discounts || []).length} productos con descuento asignado
                            {(form.product_discounts || []).some(pd => pd.variation) && (
                              <span className="dm-pd-var-count"> | {(form.product_discounts || []).filter(pd => pd.variation).length} con variación</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Lista simple de chips (para percentage y fixed) */}
                      {form.discount_type !== 'value_discount' && form.applies_to_names.length > 0 && (
                        <div className="dm-products-list">
                          {form.applies_to_names.map((name, idx) => (
                            <span key={idx} className="ge-chip product">
                              {name}
                              <button className="ge-chip-remove" onClick={() => removeProduct(idx)}>x</button>
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
                            <div className="dm-sku-import-title">Importación masiva {form.discount_type === 'value_discount' ? 'con Valor Dscto' : 'de SKUs'}</div>
                            <div className="dm-sku-import-sub">Sube un archivo CSV, XLS o XLSX con los códigos de producto{form.discount_type === 'value_discount' ? ' y sus descuentos' : ''}</div>
                          </div>
                        </div>
                        <div className="dm-sku-import-body">
                          <div className="dm-sku-template">
                            <div className="dm-sku-template-label">Formato del archivo:</div>
                            <table className="dm-sku-template-table">
                              <thead>
                                <tr>
                                  <th>sku</th>
                                  {form.discount_type === 'value_discount' && <th>valor_dscto</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {form.discount_type === 'value_discount' ? (
                                  <>
                                    <tr><td>1734</td><td>$5,000</td></tr>
                                    <tr><td>176149P6</td><td>$3,500</td></tr>
                                    <tr><td>177422UND</td><td>$2,000</td></tr>
                                    <tr className="dm-sku-template-fade"><td>...</td><td>...</td></tr>
                                  </>
                                ) : (
                                  <>
                                    <tr><td>1734</td></tr>
                                    <tr><td>176149</td></tr>
                                    <tr><td>177422</td></tr>
                                    <tr className="dm-sku-template-fade"><td>...</td></tr>
                                  </>
                                )}
                              </tbody>
                            </table>
                            <div className="dm-sku-template-notes">
                              <span>Primera fila: encabezado(s)</span>
                              {form.discount_type === 'value_discount' && (
                                <>
                                  <span>SKU con sufijo = variación (ej: <strong>11422P6</strong>)</span>
                                  <span>SKU sin sufijo = producto completo</span>
                                </>
                              )}
                              <span>Formatos: .csv, .txt, .xls, .xlsx</span>
                            </div>
                            <button type="button" className="dm-sku-template-download" onClick={downloadSkuTemplate}>
                              Descargar plantilla de ejemplo
                            </button>
                          </div>
                          <div className="dm-sku-upload-action">
                            <label className={`dm-sku-upload-btn ${uploadingSKUs ? 'loading' : ''}`}>
                              <input
                                type="file"
                                ref={fileInputRef}
                                accept=".csv,.txt,.xls,.xlsx"
                                onChange={handleSKUFileUpload}
                                disabled={uploadingSKUs}
                                style={{ display: 'none' }}
                              />
                              {uploadingSKUs ? (
                                <><span className="dm-sku-spinner"></span> Procesando...</>
                              ) : (
                                <>Seleccionar archivo</>
                              )}
                            </label>
                            {(form.product_discounts || []).length > 0 && (
                              <div className="dm-sku-count-badge">
                                {(form.product_discounts || []).length} producto(s) cargados
                                {form.discount_type === 'value_discount' && (
                                  <span> | ${(form.product_discounts || []).reduce((s, pd) => s + (pd.discount_amount || 0), 0).toLocaleString()} en descuentos</span>
                                )}
                              </div>
                            )}
                            {!form.product_discounts?.length && form.applies_to_ids.length > 0 && (
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
                      <option value="cart_condition">Condición de carrito (autoliquidable)</option>
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

                  {form.schedule_type === "cart_condition" && (
                    <div className="ge-form-row" style={{ marginTop: 8 }}>
                      <div className="ge-form-group">
                        <label>Condición</label>
                        <select className="ge-input" value={form.cart_condition_type || 'subtotal'} onChange={e => setForm(f => ({ ...f, cart_condition_type: e.target.value }))}>
                          <option value="subtotal">Subtotal del carrito mayor o igual a</option>
                        </select>
                      </div>
                      <div className="ge-form-group">
                        <label>Monto mínimo ($)</label>
                        <input
                          type="number"
                          className="ge-input"
                          value={form.cart_condition_value || ''}
                          onChange={e => setForm(f => ({ ...f, cart_condition_type: 'subtotal', cart_condition_value: Number(e.target.value) }))}
                          placeholder="Ej: 150000"
                          min="0"
                          step="1000"
                        />
                        <span className="ge-form-help">El descuento se activa cuando el carrito supere este valor</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Sección 4: Barra de Descuento (Badge) ── */}
              <div className="dm-section">
                <div className="dm-section-header">
                  <span className="dm-section-number">4</span>
                  <span className="dm-section-title">Barra de Descuento</span>
                </div>
                <div className="dm-section-content">
                  <p className="dm-section-hint">Muestra una insignia informativa en las páginas de producto afectadas</p>
                  <label className="dm-toggle-check">
                    <input type="checkbox" checked={form.badge_enabled} onChange={e => setForm(f => ({ ...f, badge_enabled: e.target.checked }))} />
                    <span className="dm-toggle-slider"></span>
                    <span className="dm-toggle-label">Mostrar barra de descuento</span>
                  </label>

                  {form.badge_enabled && (
                    <>
                      <div className="ge-form-group" style={{ marginTop: 12 }}>
                        <label>Texto de la insignia</label>
                        <input className="ge-input" placeholder="Ej: Ahorra un {{discount}} en este producto!" value={form.badge_text} onChange={e => setForm(f => ({ ...f, badge_text: e.target.value }))} />
                        <span className="ge-form-help">Usa <code>{"{{discount}}"}</code> para mostrar el valor del descuento</span>
                      </div>
                      <div className="ge-form-row">
                        <div className="ge-form-group">
                          <label>Color de fondo</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="color" value={form.badge_bg_color} onChange={e => setForm(f => ({ ...f, badge_bg_color: e.target.value }))} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }} />
                            <input className="ge-input" value={form.badge_bg_color} onChange={e => setForm(f => ({ ...f, badge_bg_color: e.target.value }))} style={{ flex: 1 }} />
                          </div>
                        </div>
                        <div className="ge-form-group">
                          <label>Color del texto</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="color" value={form.badge_text_color} onChange={e => setForm(f => ({ ...f, badge_text_color: e.target.value }))} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }} />
                            <input className="ge-input" value={form.badge_text_color} onChange={e => setForm(f => ({ ...f, badge_text_color: e.target.value }))} style={{ flex: 1 }} />
                          </div>
                        </div>
                      </div>
                      {/* Vista previa */}
                      <div style={{ marginTop: 12 }}>
                        <label className="ge-form-help">Vista previa:</label>
                        <div style={{
                          marginTop: 4,
                          padding: '10px 16px',
                          borderRadius: 6,
                          backgroundColor: form.badge_bg_color,
                          color: form.badge_text_color,
                          fontWeight: 600,
                          fontSize: 14,
                          display: 'inline-block',
                        }}>
                          {(form.badge_text || 'Ahorra un {{discount}} en este producto!')
                            .replace('{{discount}}', form.discount_value > 0
                              ? (form.discount_type === 'percentage' ? `${form.discount_value}%` : `$${form.discount_value}`)
                              : '...')}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Sección 5: Sedes (solo admin global) ── */}
              {esAdminGlobal && (
              <div className="dm-section">
                <div className="dm-section-header">
                  <span className="dm-section-number">5</span>
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
              <button className="ge-btn secondary" onClick={resetForm} disabled={saving}>Cancelar</button>
              <button className="ge-btn accent" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="dm-sku-spinner"></span>
                    {savingStep || "Guardando..."}
                  </span>
                ) : (editingRule ? "💾 Actualizar Regla" : "💾 Crear Regla")}
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
            const isValueDscto = rule.discount_type === 'value_discount';
            const pdCount = (rule.product_discounts || []).length;
            const pdWithVar = (rule.product_discounts || []).filter(pd => pd.variation).length;
            return (
              <div key={rule.id} className={`ge-rule-row ${rule.active ? '' : 'dimmed'} ${activeNow ? 'running' : ''}`}>
                <div className={`ge-badge discount ${isValueDscto ? 'value-dscto' : ''}`}>
                  {isValueDscto ? (
                    <>
                      <div className="ge-badge-value">{pdCount}</div>
                      <div className="ge-badge-label">items</div>
                    </>
                  ) : (
                    <>
                      <div className="ge-badge-value">{rule.discount_type === 'exact_price' ? '$' : ''}{rule.discount_value}{rule.discount_type === 'percentage' ? '%' : (rule.discount_type !== 'exact_price' ? '$' : '')}</div>
                      <div className="ge-badge-label">{rule.discount_type === 'percentage' ? 'desc.' : 'fijo'}</div>
                    </>
                  )}
                </div>

                <div className="ge-row-info">
                  <div className="ge-row-title">
                    {rule.title}
                    {isValueDscto && <span className="dm-type-badge value">Valor dscto</span>}
                  </div>
                  {isValueDscto && pdCount > 0 && (
                    <div className="ge-row-meta">
                      {(rule.product_discounts || []).slice(0, 4).map((pd, i) => (
                        <span key={i} className="ge-chip product">
                          {pd.sku}{pd.variation ? ` [${pd.variation}]` : ''}: ${pd.discount_amount?.toLocaleString()}
                        </span>
                      ))}
                      {pdCount > 4 && <span className="ge-row-subtitle">+{pdCount - 4} más</span>}
                      {pdWithVar > 0 && <span className="dm-var-info">{pdWithVar} con variación</span>}
                    </div>
                  )}
                  {!isValueDscto && rule.applies_to === "categories" && (rule.applies_to_names || []).length > 0 && (
                    <div className="ge-row-meta">
                      {rule.applies_to_names.map((name, i) => <span key={i} className="ge-chip category">{name}</span>)}
                    </div>
                  )}
                  {!isValueDscto && rule.applies_to === "products" && (rule.applies_to_names || []).length > 0 && (
                    <div className="ge-row-meta">
                      {rule.applies_to_names.slice(0, 5).map((name, i) => <span key={i} className="ge-chip product">{name}</span>)}
                      {rule.applies_to_names.length > 5 && <span className="ge-row-subtitle">+{rule.applies_to_names.length - 5} más</span>}
                    </div>
                  )}
                  {rule.applies_to === "all" && <div className="ge-row-subtitle">Aplica a todos los productos</div>}
                  <div className="ge-row-subtitle">
                    {rule.schedule_type === "days" && <>{(rule.schedule_days || []).map(d => DAY_LABELS[d]).join(', ')}</>}
                    {rule.schedule_type === "date_range" && <>{rule.date_start} - {rule.date_end}</>}
                    {rule.schedule_type === "always" && <>Siempre activo</>}
                    {' | '}
                    {!rule.sedes ? (
                      <span className="dm-sede-badge all">Todas</span>
                    ) : (
                      rule.sedes.map(s => (
                        <span key={s} className="dm-sede-badge">{SEDE_ICONS[s]} {(SEDE_LABELS[s] || s).split(' ')[0]}</span>
                      ))
                    )}
                  </div>
                </div>

                <div className="ge-rule-status">
                  {activeNow && <span className="ge-badge running">Ejecutándose</span>}
                  {(() => {
                    const p = getPriority(rule);
                    const isHigh = p <= 5;
                    return (
                      <span
                        className={`dm-priority-badge ${isHigh ? 'high' : p <= 10 ? 'mid' : 'low'}`}
                        title={`Prioridad ${p} — ${isHigh ? 'Separata/Especial' : p <= 10 ? 'Semanal/Normal' : 'Base'}`}
                      >
                        {isHigh ? '⭐' : p <= 10 ? '🗓️' : ''} P{p}
                      </span>
                    );
                  })()}
                  {(() => {
                    const cc = getConflictCount(rule);
                    return cc > 0 ? (
                      <span
                        className="dm-conflict-badge"
                        title={`${cc} producto(s) de esta regla están cubiertos hoy por reglas de mayor prioridad`}
                      >
                        ⚠️ {cc} conflicto{cc > 1 ? 's' : ''}
                      </span>
                    ) : null;
                  })()}
                  <span className={`ge-badge ${rule.active ? 'active' : 'inactive'}`}>{rule.active ? 'Activa' : 'Inactiva'}</span>
                </div>

                <div className="ge-row-actions">
                  {isValueDscto && (() => {
                    const today = new Date().toISOString().split('T')[0];
                    const isFutureSched = rule.schedule_type === 'date_range' && rule.date_start && rule.date_start > today;
                    const isActiveSched = rule.schedule_type === 'date_range' && rule.date_start && rule.date_start <= today && rule.date_end >= today;
                    const applyTitle = isFutureSched
                      ? `Pre-programar: tachado aparece el ${rule.date_start} en WooCommerce`
                      : isActiveSched
                      ? `Aplicar sale_price (vigente: ${rule.date_start} → ${rule.date_end})`
                      : 'Aplicar sale_price en WooCommerce';
                    return (
                      <>
                        <button className="ge-btn icon outline-success" title={applyTitle} onClick={() => handleApplyValueDiscounts(rule)} disabled={applyingDiscounts}>
                          {isFutureSched ? '📅$' : '$'}
                        </button>
                        <button className="ge-btn icon outline-warning" title="Quitar sale_price de WooCommerce" onClick={() => handleRemoveValueDiscounts(rule)} disabled={applyingDiscounts}>x$</button>
                      </>
                    );
                  })()}
                  <button className="ge-btn icon outline-muted" onClick={() => handleToggleActive(rule)} disabled={applyingDiscounts}>{rule.active ? '||' : '>'}</button>
                  <button className="ge-btn icon outline-primary" onClick={() => openEdit(rule)}>&#9998;</button>
                  <button className="ge-btn icon outline-danger" onClick={() => handleDelete(rule.id)} disabled={applyingDiscounts || deletingId === rule.id}>
                    {deletingId === rule.id ? <span className="dm-sku-spinner" style={{ width: 12, height: 12 }}></span> : 'X'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nota */}
      <div className="ge-note">
        <div className="ge-note-title">Integración con WooCommerce</div>
        <div className="ge-note-body">
          <strong>Porcentaje / Valor fijo:</strong> Usa <strong>"Sincronizar con WP"</strong> para enviar las reglas al plugin FlyCart en WordPress.
          El plugin se encarga de mostrar badges de descuento, precios tachados y toda la presentación visual en la tienda.
          Las reglas se activan/desactivan según el día de la semana o rango de fechas configurado.
          <br /><br />
          <strong>Valor dscto (individual):</strong> Cada producto tiene un monto de descuento que se resta del precio normal.
          <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>
            <li><strong>$</strong> — Pre-programa el <code>sale_price</code> en WooCommerce. Si la regla tiene fechas futuras, el tachado aparece automáticamente en esa fecha. Puedes hacerlo hoy aunque la fecha sea mañana.</li>
            <li><strong>📅$</strong> — Igual que anterior, pero la regla tiene fecha de inicio futura (se programará automáticamente por el cron nocturno de todas formas).</li>
            <li><strong>x$</strong> — Quita el <code>sale_price</code> (los precios vuelven a su valor normal).</li>
            <li>Al guardar una regla con rango de fechas, el sistema preguntará si deseas pre-programarla en WooCommerce de inmediato.</li>
          </ul>
          <strong>Programación automática:</strong> Un cron job se ejecuta cada noche a la 1:00 AM (Colombia) y aplica automáticamente las reglas cuyo <code>date_start</code> sea ese día — sin que debas hacer clic en $.
          <br />
          WooCommerce maneja las fechas <code>date_on_sale_from</code> / <code>date_on_sale_to</code> nativamente: el tachado solo aparece dentro del rango configurado.
          <br /><br />
          Soporta variaciones: si el SKU tiene sufijo (ej: 11422P6), se aplica solo a esa variación.
          Usa batch API para mayor velocidad (hasta 100 productos por lote).
          <br /><br />
          <strong>Sedes:</strong> Cada regla puede asignarse a sedes específicas. Los descuentos se aplican multi-sede automáticamente.
        </div>
      </div>
    </div>
  );
}
