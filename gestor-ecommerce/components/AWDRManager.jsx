import React, { useState, useEffect, useCallback } from "react";
import { awdrDiagnostic, awdrGetSettings, awdrGetRules, awdrPostSettings } from "../services";
import "./AWDRManager.css";

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

const TRIGGER_MODES = [
  { value: "auto",             label: "Auto",             desc: "El plugin decide cuándo mostrar el aviso" },
  { value: "active",           label: "Activo",           desc: "Muestra el aviso cuando el descuento está activo" },
  { value: "unlocked",         label: "Desbloqueado",     desc: "Muestra solo cuando se cumple la condición" },
  { value: "progress_unlock",  label: "Progreso → Meta",  desc: "Muestra progreso y cambia al desbloquear" },
];

const DEFAULT_GLOBALS = {
  enabled: true,
  header_selector: ".element-sticky-header",
  blocker_selectors: "#merkahorro-modal-overlay, #verificacion-edad-overlay",
  duration_seconds: 10,
  cooldown_minutes: 15,
  background_color: "#160857",
  text_color: "#ffffff",
  button_background_color: "#88DC00",
  button_text_color: "#160857",
  button_font_size_px: 15,
  button_padding_y_px: 10,
  button_padding_x_px: 14,
  button_radius_px: 8,
  title_font_size_px: 20,
  message_font_size_px: 16,
  notice_min_height_px: 88,
  notice_max_width_px: 920,
  top_gap_px: 8,
  mobile_top_gap_px: 8,
  horizontal_align: "center",
  mobile_horizontal_align: "inherit",
  content_align: "left",
  text_align: "left",
  button_align: "inherit",
};

const EMPTY_RULE_CFG = {
  enabled: true,
  trigger_mode: "active",
  title: "",
  message: "",
  progress_message: "",
  button_text: "Ver productos",
  target_url: "",
  unlocked_message: "",
  notice_priority: 0,
};

export default function AWDRManager({ sedes = [], sedeActual = null, esAdminGlobal = false }) {
  const [selectedSede, setSelectedSede] = useState(null);
  const [activeSection, setActiveSection] = useState("rules"); // "rules" | "globals" | "diagnostico"

  const [diagData, setDiagData] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState(null);

  const [wpRules, setWpRules] = useState([]);           // reglas visibles de WP
  const [settings, setSettings] = useState(null);       // globals + rules config
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState(null);

  const [globals, setGlobals] = useState({ ...DEFAULT_GLOBALS });
  const [ruleConfigs, setRuleConfigs] = useState({});   // { rule_id: { ...EMPTY_RULE_CFG } }
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [savingGlobals, setSavingGlobals] = useState(false);
  const [savingRule, setSavingRule] = useState(null);    // rule_id saving

  // Inicializar sede seleccionada
  useEffect(() => {
    if (!selectedSede && sedeActual) {
      const code = sedeActual.codigo_siesa || sedeActual.slug;
      setSelectedSede(code || 'PV001');
    }
  }, [sedeActual]);

  const wpUrl = selectedSede || null;

  // Diagnóstico + datos al cambiar sede
  const loadAll = useCallback(async () => {
    if (!wpUrl) return;
    setLoadingData(true);
    setDataError(null);
    try {
      const [rulesRes, settingsRes] = await Promise.all([
        awdrGetRules(wpUrl),
        awdrGetSettings(wpUrl),
      ]);

      if (rulesRes.data) {
        setWpRules(Array.isArray(rulesRes.data) ? rulesRes.data : []);
      } else {
        setWpRules([]);
      }

      if (settingsRes.settings) {
        const s = settingsRes.settings;
        setGlobals({ ...DEFAULT_GLOBALS, ...(s.globals || {}) });
        // Merge rule configs from WP
        const rcs = {};
        for (const [rid, rc] of Object.entries(s.rules || {})) {
          rcs[rid] = { ...EMPTY_RULE_CFG, ...rc };
        }
        setRuleConfigs(rcs);
        setSettings(settingsRes.settings);
      }
    } catch (err) {
      setDataError("Error cargando datos: " + err.message);
    } finally {
      setLoadingData(false);
    }
  }, [wpUrl]);

  useEffect(() => {
    if (wpUrl) loadAll();
  }, [wpUrl]);

  const runDiagnostic = async () => {
    if (!wpUrl) return;
    setDiagLoading(true);
    setDiagError(null);
    setDiagData(null);
    try {
      const res = await awdrDiagnostic(wpUrl);
      setDiagData(res);
    } catch (err) {
      setDiagError(err.message);
    } finally {
      setDiagLoading(false);
    }
  };

  // ─── Globals ─────────────────────────────────────
  const handleSaveGlobals = async () => {
    if (!wpUrl) return;
    setSavingGlobals(true);
    try {
      const res = await awdrPostSettings(wpUrl, { globals });
      if (res.success || res.ok || res.updated) {
        alert("✅ Configuración global guardada en " + (SEDE_LABELS[selectedSede] || selectedSede));
      } else {
        alert("Error: " + (res.message || JSON.stringify(res)));
      }
    } catch (err) {
      alert("Error guardando: " + err.message);
    } finally {
      setSavingGlobals(false);
    }
  };

  // ─── Rule config ─────────────────────────────────
  const getRuleCfg = (ruleId) => ruleConfigs[ruleId] || { ...EMPTY_RULE_CFG };

  const setRuleCfg = (ruleId, updates) => {
    setRuleConfigs(prev => ({
      ...prev,
      [ruleId]: { ...getRuleCfg(ruleId), ...updates },
    }));
  };

  const handleSaveRule = async (ruleId) => {
    if (!wpUrl) return;
    setSavingRule(ruleId);
    try {
      const res = await awdrPostSettings(wpUrl, {
        rules: { [ruleId]: getRuleCfg(ruleId) },
      });
      if (res.success || res.ok || res.updated) {
        alert(`✅ Aviso de regla #${ruleId} guardado.`);
        setEditingRuleId(null);
      } else {
        alert("Error: " + (res.message || JSON.stringify(res)));
      }
    } catch (err) {
      alert("Error guardando: " + err.message);
    } finally {
      setSavingRule(null);
    }
  };

  const handleDeleteRuleNotice = async (ruleId) => {
    if (!confirm(`¿Eliminar la configuración de aviso para la regla #${ruleId}?`)) return;
    setSavingRule(ruleId);
    try {
      await awdrPostSettings(wpUrl, { rules: { [ruleId]: { delete: true } } });
      setRuleConfigs(prev => {
        const next = { ...prev };
        delete next[ruleId];
        return next;
      });
      if (editingRuleId === ruleId) setEditingRuleId(null);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSavingRule(null);
    }
  };

  const handleSaveAllRules = async () => {
    if (!wpUrl) return;
    if (!confirm("¿Guardar la configuración de avisos de TODAS las reglas en esta sede?")) return;
    setSavingGlobals(true);
    try {
      const res = await awdrPostSettings(wpUrl, { rules: ruleConfigs });
      if (res.success || res.ok || res.updated) {
        alert("✅ Todos los avisos guardados.");
      } else {
        alert("Error: " + (res.message || JSON.stringify(res)));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSavingGlobals(false);
    }
  };

  // ─── Vista previa del aviso ───────────────────────
  const renderPreview = (cfg, g) => {
    const bg = g?.background_color || "#160857";
    const tc = g?.text_color || "#ffffff";
    const btnBg = g?.button_background_color || "#88DC00";
    const btnTc = g?.button_text_color || "#160857";
    return (
      <div className="awdr-preview-notice" style={{ background: bg, color: tc }}>
        {cfg.title && <div className="awdr-preview-title" style={{ fontSize: (g?.title_font_size_px || 20) + "px" }}>{cfg.title}</div>}
        {cfg.message && <div className="awdr-preview-msg" style={{ fontSize: (g?.message_font_size_px || 16) + "px" }}>{cfg.message}</div>}
        {cfg.trigger_mode === "progress_unlock" && cfg.progress_message && (
          <div className="awdr-preview-progress">{cfg.progress_message.replace("{remaining_amount}", "$5.000").replace("{current_amount}", "$45.000").replace("{target_amount}", "$50.000").replace("{rule_title}", cfg.title || "Descuento")}</div>
        )}
        {cfg.button_text && (
          <button className="awdr-preview-btn" style={{ background: btnBg, color: btnTc, fontSize: (g?.button_font_size_px || 15) + "px", borderRadius: (g?.button_radius_px || 8) + "px", padding: `${g?.button_padding_y_px || 10}px ${g?.button_padding_x_px || 14}px` }}>
            {cfg.button_text}
          </button>
        )}
      </div>
    );
  };

  const ALL_SEDES = Object.keys(SEDE_LABELS);
  const sedeOptions = esAdminGlobal
    ? ALL_SEDES
    : (sedeActual ? [sedeActual.codigo_siesa || sedeActual.slug] : ALL_SEDES);

  return (
    <div>
      {/* Header */}
      <div className="ge-header">
        <div className="ge-title">
          <h2>Avisos AWDR</h2>
          <p>Gestiona los avisos de descuento del plugin AWDR por sede</p>
        </div>
        <div className="ge-header-actions">
          <button className="ge-btn info" onClick={runDiagnostic} disabled={diagLoading || !wpUrl}>
            {diagLoading ? "Probando..." : "🔌 Probar Conexión"}
          </button>
          <button className="ge-btn" onClick={loadAll} disabled={loadingData || !wpUrl}>
            {loadingData ? "Cargando..." : "↺ Recargar"}
          </button>
        </div>
      </div>

      {/* Sede selector */}
      <div className="awdr-sede-bar">
        {sedeOptions.map(code => (
          <button
            key={code}
            className={`awdr-sede-btn ${selectedSede === code ? 'active' : ''}`}
            onClick={() => setSelectedSede(code)}
          >
            {SEDE_ICONS[code]} {SEDE_LABELS[code] || code}
          </button>
        ))}
      </div>

      {/* Diagnostic result */}
      {diagData && (
        <div className={`awdr-diag-banner ${diagData.data?.plugin_active || diagData.rules_count >= 0 ? 'ok' : 'error'}`}>
          <div className="awdr-diag-row">
            <span className="awdr-diag-icon">{diagData.data?.plugin_active !== false ? '✅' : '❌'}</span>
            <strong>Conexión AWDR — {SEDE_LABELS[selectedSede]}</strong>
            <button className="awdr-diag-close" onClick={() => setDiagData(null)}>×</button>
          </div>
          {diagData.data && (
            <div className="awdr-diag-grid">
              <span>Plugin activo</span><span>{diagData.data.plugin_active ? '✅ Sí' : '❌ No'}</span>
              <span>Tabla wdr_rules</span><span>{diagData.data.table_exists ? '✅ Existe' : '❌ No existe'}</span>
              <span>Reglas visibles</span><span>{diagData.data.rules_count ?? '–'}</span>
              <span>Módulo global activo</span><span>{diagData.data.module_enabled ? '✅' : '⚠️ Desactivado'}</span>
              <span>API Key configurada</span><span>{diagData.data.api_key_set ? '✅' : '⚠️ Sin clave'}</span>
            </div>
          )}
          {!diagData.data && <pre className="awdr-diag-raw">{JSON.stringify(diagData, null, 2)}</pre>}
        </div>
      )}
      {diagError && (
        <div className="awdr-diag-banner error">
          ❌ Error de conexión: {diagError}
        </div>
      )}

      {/* Section tabs */}
      <div className="awdr-section-tabs">
        <button className={`awdr-tab ${activeSection === 'rules' ? 'active' : ''}`} onClick={() => setActiveSection('rules')}>
          📋 Reglas y Avisos
        </button>
        <button className={`awdr-tab ${activeSection === 'globals' ? 'active' : ''}`} onClick={() => setActiveSection('globals')}>
          🎨 Configuración Global
        </button>
      </div>

      {dataError && <div className="awdr-diag-banner error">{dataError}</div>}

      {loadingData && <div className="ge-card ge-empty">Cargando datos desde WordPress...</div>}

      {/* ══ SECCIÓN: REGLAS ══ */}
      {!loadingData && activeSection === 'rules' && (
        <div>
          {wpRules.length === 0 ? (
            <div className="ge-card ge-empty">
              No se encontraron reglas visibles en esta sede. Verifica que el plugin Discount Rules esté activo y tenga reglas creadas.
            </div>
          ) : (
            <>
              <div className="awdr-rules-header">
                <span>{wpRules.length} regla(s) visible(s) en {SEDE_LABELS[selectedSede]}</span>
                <button className="ge-btn accent" onClick={handleSaveAllRules} disabled={savingGlobals}>
                  {savingGlobals ? "Guardando..." : "💾 Guardar todos los avisos"}
                </button>
              </div>
              <div className="ge-card awdr-rules-list">
                {wpRules.map(rule => {
                  const rid = String(rule.rule_id);
                  const cfg = getRuleCfg(rid);
                  const hasConfig = !!ruleConfigs[rid];
                  const isEditing = editingRuleId === rid;
                  const isSaving = savingRule === rid;

                  return (
                    <div key={rid} className={`awdr-rule-row ${isEditing ? 'expanded' : ''}`}>
                      {/* Row summary */}
                      <div className="awdr-rule-summary" onClick={() => setEditingRuleId(isEditing ? null : rid)}>
                        <div className="awdr-rule-id">#{rid}</div>
                        <div className="awdr-rule-info">
                          <div className="awdr-rule-title">{rule.title || `Regla #${rid}`}</div>
                          <div className="awdr-rule-meta">
                            {rule.date_from && <span>📅 {rule.date_from} → {rule.date_to || '∞'}</span>}
                            {rule.enabled ? <span className="awdr-badge enabled">Activa</span> : <span className="awdr-badge disabled">Inactiva</span>}
                          </div>
                        </div>
                        <div className="awdr-rule-notice-status">
                          {hasConfig && cfg.enabled
                            ? <span className="awdr-badge notice-on">🔔 Aviso ON</span>
                            : hasConfig
                            ? <span className="awdr-badge notice-off">🔕 Aviso OFF</span>
                            : <span className="awdr-badge notice-none">Sin aviso</span>
                          }
                        </div>
                        <div className="awdr-rule-chevron">{isEditing ? '▲' : '▼'}</div>
                      </div>

                      {/* Expanded editor */}
                      {isEditing && (
                        <div className="awdr-rule-editor">
                          <div className="awdr-editor-cols">
                            {/* Left: form */}
                            <div className="awdr-editor-form">
                              {/* Enable toggle */}
                              <label className="dm-toggle-check">
                                <input type="checkbox" checked={cfg.enabled} onChange={e => setRuleCfg(rid, { enabled: e.target.checked })} />
                                <span className="dm-toggle-slider"></span>
                                <span className="dm-toggle-label">Mostrar aviso para esta regla</span>
                              </label>

                              {/* Trigger mode */}
                              <div className="ge-form-group" style={{ marginTop: 12 }}>
                                <label>Modo de disparo</label>
                                <div className="awdr-trigger-grid">
                                  {TRIGGER_MODES.map(tm => (
                                    <div
                                      key={tm.value}
                                      className={`awdr-trigger-card ${cfg.trigger_mode === tm.value ? 'active' : ''}`}
                                      onClick={() => setRuleCfg(rid, { trigger_mode: tm.value })}
                                    >
                                      <div className="awdr-trigger-label">{tm.label}</div>
                                      <div className="awdr-trigger-desc">{tm.desc}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Título */}
                              <div className="ge-form-group">
                                <label>Título del aviso</label>
                                <input className="ge-input" placeholder="Ej: Descuento del 15% en Carnes" value={cfg.title} onChange={e => setRuleCfg(rid, { title: e.target.value })} />
                              </div>

                              {/* Mensaje */}
                              <div className="ge-form-group">
                                <label>Mensaje principal</label>
                                <textarea className="ge-input awdr-textarea" rows={2} placeholder="Ej: Hoy tienes un 15% de descuento en carnes seleccionadas." value={cfg.message} onChange={e => setRuleCfg(rid, { message: e.target.value })} />
                              </div>

                              {/* Mensaje progreso (solo progress_unlock) */}
                              {cfg.trigger_mode === "progress_unlock" && (
                                <div className="ge-form-group">
                                  <label>Mensaje de progreso</label>
                                  <textarea className="ge-input awdr-textarea" rows={2} placeholder="Te faltan {remaining_amount} para desbloquear." value={cfg.progress_message} onChange={e => setRuleCfg(rid, { progress_message: e.target.value })} />
                                  <span className="ge-form-help">Usa: <code>{"{remaining_amount}"}</code> <code>{"{current_amount}"}</code> <code>{"{target_amount}"}</code> <code>{"{rule_title}"}</code></span>
                                </div>
                              )}

                              {/* Mensaje desbloqueado */}
                              {(cfg.trigger_mode === "progress_unlock" || cfg.trigger_mode === "unlocked") && (
                                <div className="ge-form-group">
                                  <label>Mensaje al desbloquear</label>
                                  <input className="ge-input" placeholder="¡Ya alcanzaste la meta!" value={cfg.unlocked_message} onChange={e => setRuleCfg(rid, { unlocked_message: e.target.value })} />
                                </div>
                              )}

                              <div className="ge-form-row">
                                {/* Botón CTA */}
                                <div className="ge-form-group">
                                  <label>Texto del botón</label>
                                  <input className="ge-input" placeholder="Ver productos" value={cfg.button_text} onChange={e => setRuleCfg(rid, { button_text: e.target.value })} />
                                </div>
                                {/* Prioridad */}
                                <div className="ge-form-group" style={{ maxWidth: 110 }}>
                                  <label>Prioridad</label>
                                  <input type="number" className="ge-input" min={0} value={cfg.notice_priority} onChange={e => setRuleCfg(rid, { notice_priority: Number(e.target.value) })} />
                                  <span className="ge-form-help">0 = mayor prioridad</span>
                                </div>
                              </div>

                              {/* URL destino */}
                              <div className="ge-form-group">
                                <label>URL destino del botón (opcional)</label>
                                <input className="ge-input" placeholder="https://..." value={cfg.target_url} onChange={e => setRuleCfg(rid, { target_url: e.target.value })} />
                              </div>
                            </div>

                            {/* Right: preview */}
                            <div className="awdr-editor-preview">
                              <div className="awdr-preview-label">Vista previa del aviso</div>
                              {renderPreview(cfg, globals)}
                              <div className="awdr-preview-note">El diseño y colores usan la configuración global de esta sede.</div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="awdr-rule-editor-actions">
                            {hasConfig && (
                              <button className="ge-btn outline-danger" onClick={() => handleDeleteRuleNotice(rid)} disabled={!!savingRule}>
                                🗑 Eliminar aviso
                              </button>
                            )}
                            <button className="ge-btn secondary" onClick={() => setEditingRuleId(null)}>Cancelar</button>
                            <button className="ge-btn accent" onClick={() => handleSaveRule(rid)} disabled={!!savingRule}>
                              {isSaving ? "Guardando..." : "💾 Guardar aviso"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ SECCIÓN: GLOBALS ══ */}
      {!loadingData && activeSection === 'globals' && (
        <div className="ge-card">
          <div className="awdr-globals-header">
            <div>
              <h3 style={{ margin: 0 }}>Configuración Global de Avisos</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--ge-text-muted)', fontSize: '0.85rem' }}>
                Afecta el diseño de TODOS los avisos en {SEDE_LABELS[selectedSede]}
              </p>
            </div>
            <button className="ge-btn accent" onClick={handleSaveGlobals} disabled={savingGlobals}>
              {savingGlobals ? "Guardando..." : "💾 Guardar configuración global"}
            </button>
          </div>

          {/* Enable / disable module */}
          <div className="awdr-globals-section">
            <div className="awdr-globals-section-title">Estado del módulo</div>
            <label className="dm-toggle-check">
              <input type="checkbox" checked={globals.enabled} onChange={e => setGlobals(g => ({ ...g, enabled: e.target.checked }))} />
              <span className="dm-toggle-slider"></span>
              <span className="dm-toggle-label">Módulo de avisos habilitado</span>
            </label>
          </div>

          {/* Timing */}
          <div className="awdr-globals-section">
            <div className="awdr-globals-section-title">Temporización</div>
            <div className="ge-form-row">
              <div className="ge-form-group">
                <label>Duración del aviso (seg)</label>
                <input type="number" className="ge-input" min={1} value={globals.duration_seconds} onChange={e => setGlobals(g => ({ ...g, duration_seconds: Number(e.target.value) }))} />
              </div>
              <div className="ge-form-group">
                <label>Cooldown entre avisos (min)</label>
                <input type="number" className="ge-input" min={0} value={globals.cooldown_minutes} onChange={e => setGlobals(g => ({ ...g, cooldown_minutes: Number(e.target.value) }))} />
              </div>
            </div>
          </div>

          {/* Colores */}
          <div className="awdr-globals-section">
            <div className="awdr-globals-section-title">Colores</div>
            <div className="awdr-color-grid">
              {[
                { key: "background_color",        label: "Fondo del aviso" },
                { key: "text_color",              label: "Texto del aviso" },
                { key: "button_background_color", label: "Fondo del botón" },
                { key: "button_text_color",       label: "Texto del botón" },
              ].map(({ key, label }) => (
                <div key={key} className="awdr-color-row">
                  <input type="color" value={globals[key] || "#000000"} onChange={e => setGlobals(g => ({ ...g, [key]: e.target.value }))} className="awdr-color-picker" />
                  <div>
                    <div className="awdr-color-label">{label}</div>
                    <input className="ge-input awdr-color-hex" value={globals[key] || ""} onChange={e => setGlobals(g => ({ ...g, [key]: e.target.value }))} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tamaños */}
          <div className="awdr-globals-section">
            <div className="awdr-globals-section-title">Tamaños (px)</div>
            <div className="ge-form-row" style={{ flexWrap: 'wrap' }}>
              {[
                { key: "title_font_size_px",    label: "Título" },
                { key: "message_font_size_px",  label: "Mensaje" },
                { key: "button_font_size_px",   label: "Botón" },
                { key: "button_radius_px",      label: "Radio botón" },
                { key: "notice_min_height_px",  label: "Alto mínimo aviso" },
                { key: "notice_max_width_px",   label: "Ancho máximo aviso" },
                { key: "top_gap_px",            label: "Margen superior" },
                { key: "mobile_top_gap_px",     label: "Margen superior móvil" },
              ].map(({ key, label }) => (
                <div key={key} className="ge-form-group" style={{ minWidth: 140, flex: '1 1 140px' }}>
                  <label>{label}</label>
                  <input type="number" className="ge-input" min={0} value={globals[key] ?? 0} onChange={e => setGlobals(g => ({ ...g, [key]: Number(e.target.value) }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Alineaciones */}
          <div className="awdr-globals-section">
            <div className="awdr-globals-section-title">Alineaciones</div>
            <div className="ge-form-row" style={{ flexWrap: 'wrap' }}>
              {[
                { key: "horizontal_align",        label: "Alinear aviso (desktop)" },
                { key: "mobile_horizontal_align", label: "Alinear aviso (móvil)" },
                { key: "content_align",           label: "Contenido" },
                { key: "text_align",              label: "Texto" },
                { key: "button_align",            label: "Botón" },
              ].map(({ key, label }) => (
                <div key={key} className="ge-form-group" style={{ minWidth: 160, flex: '1 1 160px' }}>
                  <label>{label}</label>
                  <select className="ge-input" value={globals[key] || "inherit"} onChange={e => setGlobals(g => ({ ...g, [key]: e.target.value }))}>
                    <option value="inherit">inherit</option>
                    <option value="left">left</option>
                    <option value="center">center</option>
                    <option value="right">right</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Selectores avanzados */}
          <div className="awdr-globals-section">
            <div className="awdr-globals-section-title">Selectores CSS (avanzado)</div>
            <div className="ge-form-group">
              <label>Selector del header sticky</label>
              <input className="ge-input" value={globals.header_selector || ""} onChange={e => setGlobals(g => ({ ...g, header_selector: e.target.value }))} placeholder=".element-sticky-header" />
            </div>
            <div className="ge-form-group">
              <label>Selectores bloqueadores (separados por coma)</label>
              <input className="ge-input" value={globals.blocker_selectors || ""} onChange={e => setGlobals(g => ({ ...g, blocker_selectors: e.target.value }))} placeholder="#merkahorro-modal-overlay, #verificacion-edad-overlay" />
            </div>
          </div>

          {/* Preview global */}
          <div className="awdr-globals-section">
            <div className="awdr-globals-section-title">Vista previa con diseño actual</div>
            {renderPreview({
              title: "Ejemplo: Martes 10% en Carnes",
              message: "Hoy tienes descuento especial en carnes seleccionadas.",
              button_text: "Ver categoría",
            }, globals)}
          </div>
        </div>
      )}

      {/* Nota informativa */}
      <div className="ge-note">
        <div className="ge-note-title">Sobre el plugin AWDR</div>
        <div className="ge-note-body">
          <strong>Este panel administra los avisos visuales</strong> del plugin <em>AWDR Subtotal Excluding Filter</em> instalado en WordPress.<br />
          Cada sede tiene su propia configuración independiente. Los cambios afectan solo a la sede seleccionada.<br /><br />
          <strong>Las reglas mostradas</strong> vienen directamente de Discount Rules (WooCommerce). Aquí puedes asignarle un aviso a cada regla.<br />
          Los descuentos base se siguen administrando desde el panel de <strong>Descuentos</strong>.
        </div>
      </div>
    </div>
  );
}
