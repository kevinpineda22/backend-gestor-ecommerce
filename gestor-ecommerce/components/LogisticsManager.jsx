import React, { useState, useEffect, useCallback } from "react";
import { SEDE_WP_URLS, fetchLogisticsConfig, saveLogisticsConfig } from "../services";
import "../GestorEcommerce.css";
import "./LogisticsManager.css";

const API_KEY = "merkahorro2026";

const DAYS = [
  { key: "1", label: "Lunes", emoji: "📅" },
  { key: "2", label: "Martes", emoji: "📅" },
  { key: "3", label: "Miércoles", emoji: "📅" },
  { key: "4", label: "Jueves", emoji: "📅" },
  { key: "5", label: "Viernes", emoji: "📅" },
  { key: "6", label: "Sábado", emoji: "🛒" },
  { key: "7", label: "Domingo", emoji: "🛒" },
];

const DAY_SHORT = { "1": "Lun", "2": "Mar", "3": "Mié", "4": "Jue", "5": "Vie", "6": "Sáb", "7": "Dom" };

const SEDE_LABELS = {
  PV001: "Copacabana (Principal)",
  "00301": "Girardota",
  "00701": "Barbosa",
  "00201": "Villahermosa",
};

const DEFAULT_DAY = { enabled: 1, orders_start: "07:00", orders_end: "20:00", service_start: "08:00", service_end: "18:00" };

const DEFAULT_CONFIG = {
  branch_name: "",
  display_format: "j \\d\\e F, Y \\a \\l\\a\\s g:i a",
  delivery_label: "Entrega estimada",
  pickup_label: "Hora estimada de recogida",
  delivery_methods: "flat_rate,free_shipping",
  pickup_methods: "local_pickup,legacy_local_pickup,pickup_location",
  delivery_in_hours_minimum_minutes: 120,
  delivery_in_hours_minutes_per_item: 4,
  delivery_next_cycle_minimum_minutes: 60,
  delivery_next_cycle_minutes_per_item: 4,
  delivery_capacity_enabled: 1,
  delivery_capacity_per_cycle: 100,
  pickup_in_hours_minimum_minutes: 60,
  pickup_in_hours_minutes_per_item: 3,
  pickup_next_cycle_minimum_minutes: 60,
  pickup_next_cycle_minutes_per_item: 3,
  pickup_capacity_enabled: 1,
  pickup_capacity_per_cycle: 100,
  delivery_schedule: Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY }])),
  pickup_schedule: Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY, service_end: "20:00" }])),
};

export default function LogisticsManager({ sedes = [], sedeActual = null, esAdminGlobal = false }) {
  const [selectedSede, setSelectedSede] = useState(null);
  const [config, setConfig] = useState(null);
  const [originalConfig, setOriginalConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [wpSyncStatus, setWpSyncStatus] = useState(null);

  // Determinar sedes disponibles according to role
  const availableSedes = esAdminGlobal
    ? Object.entries(SEDE_WP_URLS).map(([code, url]) => ({ code, url, label: SEDE_LABELS[code] || code }))
    : sedeActual
      ? [{ code: sedeActual.codigo_siesa || sedeActual.slug, url: SEDE_WP_URLS[sedeActual.codigo_siesa || sedeActual.slug], label: sedeActual.nombre }]
      : [];

  useEffect(() => {
    if (availableSedes.length > 0 && !selectedSede) {
      setSelectedSede(availableSedes[0]);
    }
  }, [availableSedes.length]);

  // Load config when sede changes — reads from our API (Supabase)
  const loadConfig = useCallback(async (sede) => {
    if (!sede?.code) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchLogisticsConfig(sede.code);
      if (data.ok && data.data) {
        // Merge with defaults to fill any missing fields
        const merged = { ...DEFAULT_CONFIG, ...data.data };
        // Ensure schedules have all 7 days
        for (const sched of ['delivery_schedule', 'pickup_schedule']) {
          const defaultEnd = sched === 'pickup_schedule' ? "20:00" : "18:00";
          if (!merged[sched] || typeof merged[sched] !== 'object') {
            merged[sched] = Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY, service_end: defaultEnd }]));
          } else {
            for (const d of DAYS) {
              if (!merged[sched][d.key]) {
                merged[sched][d.key] = { ...DEFAULT_DAY, service_end: defaultEnd };
              }
            }
          }
        }
        setConfig(merged);
        setOriginalConfig(JSON.stringify(merged));
        setHasChanges(false);
      } else {
        // No config yet — use defaults with sede name
        const fresh = { ...DEFAULT_CONFIG, branch_name: sede.label };
        fresh.delivery_schedule = Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY }]));
        fresh.pickup_schedule = Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY, service_end: "20:00" }]));
        setConfig(fresh);
        setOriginalConfig(JSON.stringify(fresh));
        setHasChanges(false);
        setLoadError("no_config");
      }
    } catch (err) {
      console.error("Error cargando configuración logística:", err);
      const fresh = { ...DEFAULT_CONFIG, branch_name: sede.label };
      fresh.delivery_schedule = Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY }]));
      fresh.pickup_schedule = Object.fromEntries(DAYS.map(d => [d.key, { ...DEFAULT_DAY, service_end: "20:00" }]));
      setConfig(fresh);
      setOriginalConfig(JSON.stringify(fresh));
      setHasChanges(false);
      setLoadError("connection");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSede) {
      setWpSyncStatus(null);
      loadConfig(selectedSede);
    }
  }, [selectedSede, loadConfig]);

  // Track changes
  useEffect(() => {
    if (!config || !originalConfig) return;
    setHasChanges(JSON.stringify(config) !== originalConfig);
  }, [config, originalConfig]);

  // Update config helper
  const updateField = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const updateScheduleDay = (scheduleType, dayKey, field, value) => {
    setConfig(prev => ({
      ...prev,
      [scheduleType]: {
        ...prev[scheduleType],
        [dayKey]: {
          ...prev[scheduleType][dayKey],
          [field]: value,
        },
      },
    }));
  };

  // Save — dual write: Supabase (for our panel) + WordPress (for the logistics plugin)
  const handleSave = async () => {
    if (!selectedSede?.url || !selectedSede?.code || !config) return;
    setSaving(true);
    try {
      // 1. Save to Supabase (our source of truth for reading)
      const supabaseRes = await saveLogisticsConfig(selectedSede.code, config);
      if (!supabaseRes.ok) {
        alert("Error guardando en base de datos: " + (supabaseRes.message || "Error desconocido"));
        setSaving(false);
        return;
      }

      // 2. Sync to WordPress (for the logistics plugin to use)
      let wpOk = false;
      try {
        const wpRes = await fetch(`${selectedSede.url}/wp-json/merkahorro/v1/sync-logistica-settings?key=${API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(config),
        });
        const wpData = await wpRes.json();
        wpOk = wpData.ok;
        if (!wpOk) {
          const errMsg = wpData.errors
            ? Object.entries(wpData.errors).map(([k, v]) => `${k}: ${v}`).join("\n")
            : wpData.message || "";
          console.warn("WordPress sync warning:", errMsg);
        }
      } catch (wpErr) {
        console.warn("No se pudo sincronizar con WordPress:", wpErr.message);
      }

      setOriginalConfig(JSON.stringify(config));
      setHasChanges(false);
      setLastSaved(new Date());
      setLoadError(null);
      setWpSyncStatus(wpOk ? 'ok' : 'warn');
    } catch (err) {
      alert("Error guardando configuración: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset
  const handleReset = () => {
    if (!originalConfig) return;
    setConfig(JSON.parse(originalConfig));
    setHasChanges(false);
  };

  // Copy from another sede
  const handleCopyFrom = async (sourceSede) => {
    if (!sourceSede?.code) return;
    if (!confirm(`¿Copiar la configuración de ${sourceSede.label} a ${selectedSede.label}?\n\nEsto reemplazará todos los campos actuales (sin guardar aún).`)) return;
    setLoading(true);
    try {
      const data = await fetchLogisticsConfig(sourceSede.code);
      if (data.ok && data.data) {
        const merged = { ...DEFAULT_CONFIG, ...data.data, branch_name: config.branch_name };
        setConfig(merged);
      } else {
        alert("No se pudo obtener la configuración de " + sourceSede.label);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return (
      <div>
        <div className="ge-header">
          <div className="ge-title">
            <h2>Logística por Sede</h2>
            <p>Configuración de entregas y recogidas</p>
          </div>
        </div>
        <div className="ge-card ge-empty">{loading ? "Cargando configuración..." : "Selecciona una sede para comenzar"}</div>
      </div>
    );
  }

  const TABS = [
    { key: "general", label: "📋 General", desc: "Nombre y textos de la sede" },
    { key: "delivery", label: "🚚 Domicilio", desc: "Entregas a casa del cliente" },
    { key: "pickup", label: "🏪 Recogida", desc: "Cliente recoge en tienda" },
  ];

  // Calcular ejemplo de ETA para mostrar al usuario
  const calcExampleETA = (type, items = 5) => {
    const base = config[`${type}_in_hours_minimum_minutes`] || 0;
    const perItem = config[`${type}_in_hours_minutes_per_item`] || 0;
    const total = base + (perItem * items);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
  };

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="ge-header">
        <div className="ge-title">
          <h2>Logística por Sede</h2>
          <p>Configura horarios, tiempos de entrega y capacidad de cada sede</p>
        </div>
        <div className="ge-header-actions">
          {hasChanges && (
            <button className="ge-btn secondary" onClick={handleReset} disabled={saving}>
              ↩ Descartar cambios
            </button>
          )}
          <button className="ge-btn accent" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? "Guardando..." : "💾 Guardar y aplicar"}
          </button>
        </div>
      </div>

      {/* ═══ Cómo funciona ═══ */}
      <div className="lm-explainer-banner">
        <div className="lm-explainer-icon">💡</div>
        <div className="lm-explainer-content">
          <div className="lm-explainer-title">¿Cómo funciona este panel?</div>
          <div className="lm-explainer-text">
            Aquí configuras <strong>cuándo</strong> y <strong>cómo</strong> se procesan los pedidos de cada sede.
            Los cambios se envían directamente al WordPress de la sede seleccionada y se aplican de inmediato.
            Cada sede funciona de forma <strong>independiente</strong>.
          </div>
        </div>
      </div>

      {/* ═══ Sede Selector Bar ═══ */}
      <div className="lm-sede-bar">
        <div className="lm-sede-bar-label">
          <span className="lm-sede-bar-icon">🏪</span>
          <span>Sede activa:</span>
        </div>
        <div className="lm-sede-pills">
          {availableSedes.map(s => (
            <button
              key={s.code}
              className={`ge-pill ${selectedSede?.code === s.code ? 'active' : ''}`}
              onClick={() => setSelectedSede(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {esAdminGlobal && availableSedes.length > 1 && (
          <div className="lm-copy-dropdown">
            <select
              className="ge-input ge-input-sm"
              value=""
              onChange={(e) => {
                const src = availableSedes.find(s => s.code === e.target.value);
                if (src) handleCopyFrom(src);
              }}
            >
              <option value="">📋 Copiar config de otra sede...</option>
              {availableSedes.filter(s => s.code !== selectedSede?.code).map(s => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Status messages */}
      {loadError === "no_config" && (
        <div className="lm-alert info">
          ℹ️ Esta sede aún no tiene configuración guardada. Se muestran valores por defecto. Ajusta lo que necesites y pulsa <strong>"Guardar y aplicar"</strong>.
        </div>
      )}
      {loadError === "connection" && (
        <div className="lm-alert warning">
          ⚠️ No se pudo conectar con el WordPress de esta sede. Verifica que el plugin de logística esté instalado y activo.
        </div>
      )}
      {lastSaved && !hasChanges && (
        <div className={`lm-alert ${wpSyncStatus === 'warn' ? 'warning' : 'success'}`}>
          {wpSyncStatus === 'warn'
            ? <>⚠️ Guardado en base de datos pero <strong>no se pudo sincronizar con WordPress</strong>. Los cambios se aplicarán la próxima vez que WordPress se sincronice.</>
            : <>✅ Configuración guardada y aplicada en <strong>{selectedSede?.label}</strong> — {lastSaved.toLocaleTimeString()}</>}
        </div>
      )}

      {loading ? (
        <div className="ge-card ge-empty">Cargando configuración de {selectedSede?.label}...</div>
      ) : (
        <>
          {/* ═══ Tabs ═══ */}
          <div className="ge-tabs">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`ge-tab ${activeTab === tab.key ? 'active' : ''}`}
              >
                <div className="ge-tab-label">{tab.label}</div>
                <div className="ge-tab-desc">{tab.desc}</div>
              </button>
            ))}
          </div>

          {/* ═══ Tab Content ═══ */}
          {activeTab === "general" && renderGeneralTab()}
          {activeTab === "delivery" && renderLogisticsTab("delivery")}
          {activeTab === "pickup" && renderLogisticsTab("pickup")}
        </>
      )}
    </div>
  );

  // ═══════════════════════════════════════════
  // RENDER: General Tab
  // ═══════════════════════════════════════════
  function renderGeneralTab() {
    return (
      <div className="lm-section">
        {/* Nombre de la sede */}
        <div className="lm-section-card">
          <div className="lm-section-header">
            <div className="lm-section-icon">🏬</div>
            <div>
              <div className="lm-section-title">Nombre de la Sede</div>
              <div className="lm-section-sub">Así se identifica esta sede en toda la tienda online</div>
            </div>
          </div>

          <div className="lm-form-grid">
            <div className="lm-field full">
              <label className="lm-label">Nombre visible para el cliente</label>
              <input className="ge-input" value={config.branch_name} onChange={e => updateField('branch_name', e.target.value)} placeholder="Ej: Merkahorro Copacabana Plaza" />
              <div className="lm-field-example">
                <span className="lm-example-label">👁️ Dónde se ve:</span> En la página de "Gracias por tu compra", en los correos de confirmación, en "Mi Cuenta" del cliente y en el panel administrativo de pedidos.
              </div>
            </div>
          </div>
        </div>

        {/* Textos que ve el cliente */}
        <div className="lm-section-card">
          <div className="lm-section-header">
            <div className="lm-section-icon">💬</div>
            <div>
              <div className="lm-section-title">Textos para el Cliente</div>
              <div className="lm-section-sub">Lo que ve el cliente cuando hace un pedido</div>
            </div>
          </div>

          <div className="lm-form-grid">
            <div className="lm-field">
              <label className="lm-label">Texto para pedidos a domicilio</label>
              <input className="ge-input" value={config.delivery_label} onChange={e => updateField('delivery_label', e.target.value)} placeholder="Entrega estimada" />
              <div className="lm-field-example">
                <span className="lm-example-label">👁️ Ejemplo:</span> El cliente verá: <strong>"{config.delivery_label || 'Entrega estimada'}: 10 de marzo, 2026 a las 2:30 pm"</strong>
              </div>
            </div>

            <div className="lm-field">
              <label className="lm-label">Texto para recogida en tienda</label>
              <input className="ge-input" value={config.pickup_label} onChange={e => updateField('pickup_label', e.target.value)} placeholder="Hora estimada de recogida" />
              <div className="lm-field-example">
                <span className="lm-example-label">👁️ Ejemplo:</span> El cliente verá: <strong>"{config.pickup_label || 'Hora estimada de recogida'}: 10 de marzo, 2026 a las 11:00 am"</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen visual */}
        <div className="lm-summary-card">
          <div className="lm-summary-title">📊 Resumen de configuración actual</div>
          <div className="lm-summary-grid">
            <div className="lm-summary-item">
              <div className="lm-summary-item-icon">🚚</div>
              <div className="lm-summary-item-label">Domicilio</div>
              <div className="lm-summary-item-value">
                ~{calcExampleETA('delivery', 5)} <span className="lm-summary-item-hint">(pedido de 5 productos)</span>
              </div>
            </div>
            <div className="lm-summary-item">
              <div className="lm-summary-item-icon">🏪</div>
              <div className="lm-summary-item-label">Recogida</div>
              <div className="lm-summary-item-value">
                ~{calcExampleETA('pickup', 5)} <span className="lm-summary-item-hint">(pedido de 5 productos)</span>
              </div>
            </div>
            <div className="lm-summary-item">
              <div className="lm-summary-item-icon">📦</div>
              <div className="lm-summary-item-label">Capacidad domicilio</div>
              <div className="lm-summary-item-value">
                {config.delivery_capacity_enabled ? `${config.delivery_capacity_per_cycle} pedidos/ciclo` : 'Sin límite'}
              </div>
            </div>
            <div className="lm-summary-item">
              <div className="lm-summary-item-icon">🧺</div>
              <div className="lm-summary-item-label">Capacidad recogida</div>
              <div className="lm-summary-item-value">
                {config.pickup_capacity_enabled ? `${config.pickup_capacity_per_cycle} pedidos/ciclo` : 'Sin límite'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // RENDER: Delivery / Pickup Tab
  // ═══════════════════════════════════════════
  function renderLogisticsTab(type) {
    const isDelivery = type === "delivery";
    const prefix = isDelivery ? "delivery" : "pickup";
    const icon = isDelivery ? "🚚" : "🏪";
    const title = isDelivery ? "Domicilio" : "Recogida en Tienda";
    const scheduleKey = `${prefix}_schedule`;
    const exampleItems = 5;
    const exampleETA = calcExampleETA(type, exampleItems);

    return (
      <div className="lm-section">
        {/* Explicación contextual */}
        <div className="lm-context-info">
          <div className="lm-context-icon">{icon}</div>
          <div className="lm-context-text">
            {isDelivery
              ? "Configura cuánto tarda un pedido en llegar al domicilio del cliente y en qué horarios se aceptan pedidos para entrega."
              : "Configura cuánto tarda un pedido en estar listo para que el cliente lo recoja en la tienda y en qué horarios se acepta."}
          </div>
        </div>

        {/* Tiempos */}
        <div className="lm-section-card">
          <div className="lm-section-header">
            <div className="lm-section-icon">⏱️</div>
            <div>
              <div className="lm-section-title">Tiempos de Preparación — {title}</div>
              <div className="lm-section-sub">¿Cuánto tarda un pedido en estar listo?</div>
            </div>
          </div>

          <div className="lm-times-grid">
            <div className="lm-times-block">
              <div className="lm-times-block-title">✅ Pedido dentro del horario</div>
              <div className="lm-times-block-desc">
                Cuando el cliente hace un pedido <strong>dentro del horario de atención</strong> y hay capacidad disponible.
              </div>
              <div className="lm-field-row">
                <div className="lm-field compact">
                  <label className="lm-label">Tiempo base (minutos)</label>
                  <input type="number" className="ge-input" min="0" value={config[`${prefix}_in_hours_minimum_minutes`]} onChange={e => updateField(`${prefix}_in_hours_minimum_minutes`, parseInt(e.target.value) || 0)} />
                  <span className="lm-help">Tiempo mínimo para preparar cualquier pedido, sin importar cuántos productos tenga.</span>
                </div>
                <div className="lm-field compact">
                  <label className="lm-label">Minutos extra por producto</label>
                  <input type="number" className="ge-input" min="0" value={config[`${prefix}_in_hours_minutes_per_item`]} onChange={e => updateField(`${prefix}_in_hours_minutes_per_item`, parseInt(e.target.value) || 0)} />
                  <span className="lm-help">Se suman estos minutos por cada producto del pedido.</span>
                </div>
              </div>
              <div className="lm-times-example">
                💡 <strong>Ejemplo:</strong> Un pedido de {exampleItems} productos tardaría aproximadamente <strong>{exampleETA}</strong>
              </div>
            </div>

            <div className="lm-times-block next-cycle">
              <div className="lm-times-block-title">⏭️ Pedido fuera de horario o ciclo lleno</div>
              <div className="lm-times-block-desc">
                Si el pedido llega <strong>fuera del horario</strong> o ya se llenó la capacidad del ciclo actual, se programa para el siguiente horario disponible.
              </div>
              <div className="lm-field-row">
                <div className="lm-field compact">
                  <label className="lm-label">Tiempo base (minutos)</label>
                  <input type="number" className="ge-input" min="0" value={config[`${prefix}_next_cycle_minimum_minutes`]} onChange={e => updateField(`${prefix}_next_cycle_minimum_minutes`, parseInt(e.target.value) || 0)} />
                  <span className="lm-help">Tiempo mínimo desde que abre el siguiente ciclo.</span>
                </div>
                <div className="lm-field compact">
                  <label className="lm-label">Minutos extra por producto</label>
                  <input type="number" className="ge-input" min="0" value={config[`${prefix}_next_cycle_minutes_per_item`]} onChange={e => updateField(`${prefix}_next_cycle_minutes_per_item`, parseInt(e.target.value) || 0)} />
                  <span className="lm-help">Se suman por cada producto del pedido.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Capacidad */}
        <div className="lm-section-card">
          <div className="lm-section-header">
            <div className="lm-section-icon">📊</div>
            <div>
              <div className="lm-section-title">Capacidad por Ciclo</div>
              <div className="lm-section-sub">¿Cuántos pedidos puedes atender al mismo tiempo?</div>
            </div>
          </div>

          <div className="lm-form-grid">
            <div className="lm-field">
              <label className="lm-label lm-toggle-label">
                <input
                  type="checkbox"
                  checked={config[`${prefix}_capacity_enabled`] === 1}
                  onChange={e => updateField(`${prefix}_capacity_enabled`, e.target.checked ? 1 : 0)}
                />
                <span>Limitar cantidad de pedidos por ciclo</span>
              </label>
              <span className="lm-help">
                {config[`${prefix}_capacity_enabled`] === 1
                  ? "Cuando se alcanza el límite, los pedidos nuevos se programan para el siguiente horario disponible."
                  : "Sin límite — se aceptan todos los pedidos sin restricción de cantidad."}
              </span>
            </div>

            {config[`${prefix}_capacity_enabled`] === 1 && (
              <div className="lm-field">
                <label className="lm-label">Máximo de pedidos por ciclo</label>
                <input type="number" className="ge-input" min="1" max="10000" value={config[`${prefix}_capacity_per_cycle`]} onChange={e => updateField(`${prefix}_capacity_per_cycle`, Math.min(10000, Math.max(1, parseInt(e.target.value) || 1)))} />
                <div className="lm-field-example">
                  <span className="lm-example-label">💡 ¿Qué significa?</span> Si llegan más de <strong>{config[`${prefix}_capacity_per_cycle`]}</strong> pedidos en un mismo ciclo, el #{config[`${prefix}_capacity_per_cycle`] + 1} se mueve automáticamente al siguiente horario.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Horarios por día */}
        <div className="lm-section-card">
          <div className="lm-section-header">
            <div className="lm-section-icon">📅</div>
            <div>
              <div className="lm-section-title">Horarios Semanales — {title}</div>
              <div className="lm-section-sub">¿En qué horarios se reciben y procesan pedidos cada día?</div>
            </div>
          </div>

          {/* Explicación de las columnas */}
          <div className="lm-schedule-explain">
            <div className="lm-schedule-explain-item">
              <span className="lm-explain-dot green"></span>
              <strong>Recepción:</strong> Horario en que los clientes pueden hacer pedidos en la tienda online.
            </div>
            <div className="lm-schedule-explain-item">
              <span className="lm-explain-dot blue"></span>
              <strong>Servicio:</strong> Ventana de tiempo en que la sede prepara y despacha/entrega los pedidos.
            </div>
          </div>

          <div className="lm-schedule-grid">
            {/* Header */}
            <div className="lm-schedule-header">
              <span className="lm-sh-day">Día</span>
              <span className="lm-sh-toggle">Activo</span>
              <span className="lm-sh-time lm-sh-recepcion">Recepción desde</span>
              <span className="lm-sh-time lm-sh-recepcion">Recepción hasta</span>
              <span className="lm-sh-time lm-sh-servicio">Servicio desde</span>
              <span className="lm-sh-time lm-sh-servicio">Servicio hasta</span>
            </div>

            {DAYS.map(day => {
              const dayConfig = config[scheduleKey]?.[day.key] || DEFAULT_DAY;
              const enabled = dayConfig.enabled === 1;
              return (
                <div key={day.key} className={`lm-schedule-row ${!enabled ? 'disabled' : ''}`}>
                  <span className="lm-sr-day">
                    <span className="lm-sr-day-short">{DAY_SHORT[day.key]}</span>
                    <span className="lm-sr-day-full">{day.label}</span>
                  </span>
                  <span className="lm-sr-toggle">
                    <label className="lm-switch">
                      <input type="checkbox" checked={enabled}
                        onChange={e => updateScheduleDay(scheduleKey, day.key, 'enabled', e.target.checked ? 1 : 0)} />
                      <span className="lm-switch-slider"></span>
                    </label>
                  </span>
                  <span className="lm-sr-time">
                    <input type="time" className="ge-input ge-input-sm" value={dayConfig.orders_start} disabled={!enabled}
                      onChange={e => updateScheduleDay(scheduleKey, day.key, 'orders_start', e.target.value)} />
                  </span>
                  <span className="lm-sr-time">
                    <input type="time" className="ge-input ge-input-sm" value={dayConfig.orders_end} disabled={!enabled}
                      onChange={e => updateScheduleDay(scheduleKey, day.key, 'orders_end', e.target.value)} />
                  </span>
                  <span className="lm-sr-time">
                    <input type="time" className="ge-input ge-input-sm" value={dayConfig.service_start} disabled={!enabled}
                      onChange={e => updateScheduleDay(scheduleKey, day.key, 'service_start', e.target.value)} />
                  </span>
                  <span className="lm-sr-time">
                    <input type="time" className="ge-input ge-input-sm" value={dayConfig.service_end} disabled={!enabled}
                      onChange={e => updateScheduleDay(scheduleKey, day.key, 'service_end', e.target.value)} />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="lm-schedule-actions">
            <button className="ge-btn sm secondary" onClick={() => {
              const all = {};
              for (const d of DAYS) {
                const existing = config[scheduleKey]?.[d.key] || DEFAULT_DAY;
                all[d.key] = { ...existing, enabled: 1 };
              }
              updateField(scheduleKey, all);
            }}>
              ✅ Habilitar todos los días
            </button>
            <button className="ge-btn sm secondary" onClick={() => {
              const template = config[scheduleKey]?.["1"] || DEFAULT_DAY;
              const all = {};
              for (const d of DAYS) all[d.key] = { ...template };
              updateField(scheduleKey, all);
            }}>
              📋 Copiar Lunes a todos los días
            </button>
          </div>
        </div>
      </div>
    );
  }
}
