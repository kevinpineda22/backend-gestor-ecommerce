import React, { useState, useEffect, useRef } from "react";
import { fetchLiveComparison, adoptWooProducts, updateWooProduct, fetchPriceDiffReport, syncVariationPrice } from "../services";
import "../GestorEcommerce.css"; // Usa los estilos globales

const CURRENCY = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default function LiveComparison({ sedeInfo, esAdminGlobal, sedes = [], onSedeChange }) {
  const [rawData, setRawData] = useState([]); // Datos sin filtrar del server
  const [data, setData] = useState([]);        // Datos filtrados para mostrar
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingVarId, setSyncingVarId] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalItemsDb, setTotalItemsDb] = useState(0);
  const [filterType, setFilterType] = useState('diff');

  // Sede actual viene del padre via sedeInfo.codigo_siesa
  const sede = sedeInfo?.codigo_siesa || "PV001";

  // ── Report state ──
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [reportScanning, setReportScanning] = useState(false);
  const [reportProgress, setReportProgress] = useState({ processed: 0, total: 0, diffs: 0 });
  const [reportFilter, setReportFilter] = useState('all'); // 'all' | 'simple' | 'variable'
  const scanAbortRef = useRef(false);

  // Función pura para filtrar (sin llamar al server)
  const applyFilter = (rows, filter) => {
    if (filter === 'diff') return rows.filter(r => r.price_status !== 'OK');
    if (filter === 'no_stock') return rows.filter(r => r.stock_disponible <= 0 || r.price_status === 'NO_STOCK');
    if (filter === 'ok') return rows.filter(r => r.price_status === 'OK');
    return rows;
  };

  const loadData = async (filterOverride) => {
    setLoading(true);
    try {
      const res = await fetchLiveComparison({ sede, page, item: search });
      if (res.ok) {
        setRawData(res.data);
        setData(applyFilter(res.data, filterOverride ?? filterType));
        if (res.total) setTotalItemsDb(res.total);
      }
    } catch (error) {
      console.error("Error loading data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdopt = async () => {
    if (!confirm("Esto leerá todos los productos de Woo y los registrará en la base de datos local. ¿Continuar?")) return;
    setSyncing(true);
    try {
      const res = await adoptWooProducts();
      alert(`Sincronización finalizada. Nuevos: ${res.inserted || 0}, Existentes: ${res.already_existing || 0}`);
      loadData(); // Recargar tabla
    } catch (error) {
      console.error(error);
      alert("Error en la sincronización");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [sede, page]); // Re-fetch cuando cambia sede (via props) o página

  // Filtro local instantáneo (sin llamar al server)
  useEffect(() => {
    setData(applyFilter(rawData, filterType));
  }, [filterType]);

  const handleSearch = (e) => {
    e.preventDefault();
    setFilterType('all');
    setPage(1);
    loadData('all');
  };

  const handleSyncRow = async (row) => {
    if (!row.woo_product_id) {
      alert("Este producto no está vinculado con WooCommerce.");
      return;
    }
    if (!confirm(`¿Actualizar precio de Woo ($${row.woo_price}) a precio Siesa ($${row.siesa_price})?`)) return;

    try {
      const res = await updateWooProduct(row.woo_product_id, {
        price: row.siesa_price,
        stock_quantity: row.stock_disponible,
        sede // Enviar sede para que solo sincronice en esta sede
      });

      if (res.ok) {
        alert("✅ Producto sincronizado correctamente");
        // Actualizar localmente la fila para reflejar que ya no hay diferencia
        const updater = (prev) => prev.map(p => {
          if (p.item === row.item) {
            return { ...p, woo_price: row.siesa_price, price_diff: 0, price_status: 'OK' };
          }
          return p;
        });
        setRawData(updater);
        setData(prev => applyFilter(updater(rawData), filterType));
      } else {
        alert("❌ Error: " + (res.message || "No se pudo actualizar"));
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión");
    }
  };

  // Los filtros se aplican localmente (instantáneo, sin re-fetch)
  const handleFilterClick = (type) => {
    setFilterType(type);
  };

  const handleSyncVariation = async (row, variation) => {
    if (!row.woo_product_id || !variation.siesa_price) return;
    if (!confirm(`¿Actualizar variación "${variation.name}" de ${CURRENCY.format(variation.price)} a ${CURRENCY.format(variation.siesa_price)}?`)) return;

    setSyncingVarId(variation.id);
    try {
      const res = await syncVariationPrice(row.woo_product_id, variation.id, variation.siesa_price);
      if (res.ok) {
        // Actualizar localmente
        const updater = (prev) => prev.map(p => {
          if (p.item !== row.item) return p;
          return {
            ...p,
            variations: p.variations.map(v => {
              if (v.id !== variation.id) return v;
              return { ...v, price: variation.siesa_price, price_diff: 0, price_status: 'OK' };
            })
          };
        });
        setRawData(updater);
        setData(prev => applyFilter(updater(rawData), filterType));
        alert("✅ Variación sincronizada correctamente");
      } else {
        alert("❌ Error: " + (res.message || "No se pudo actualizar"));
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión");
    } finally {
      setSyncingVarId(null);
    }
  };

  // ══════ REPORTE DE DIFERENCIAS ══════
  const CONCURRENT_PAGES = 5; // Páginas en paralelo

  const startReportScan = async () => {
    setReportData([]);
    setReportScanning(true);
    scanAbortRef.current = false;
    let currentPage = 1;
    let allDiffs = [];
    let processed = 0;
    let totalItems = 0;
    let lastKnownTotalPages = Infinity;

    try {
      while (currentPage <= lastKnownTotalPages) {
        if (scanAbortRef.current) break;

        // Calcular cuántas páginas solicitar en paralelo
        const pagesToFetch = [];
        for (let p = currentPage; p <= Math.min(currentPage + CONCURRENT_PAGES - 1, lastKnownTotalPages); p++) {
          pagesToFetch.push(p);
        }

        // Fetch N páginas simultáneamente
        const responses = await Promise.all(
          pagesToFetch.map(p =>
            fetchPriceDiffReport({ sede, page: p, productFilter: reportFilter })
              .catch(() => ({ ok: false, data: [] }))
          )
        );

        if (scanAbortRef.current) break;

        for (const res of responses) {
          if (!res.ok || !res.data || res.data.length === 0) continue;

          if (totalItems === 0 && res.total) totalItems = res.total;
          if (res.totalPages && res.totalPages < lastKnownTotalPages) {
            lastKnownTotalPages = res.totalPages;
          }

          const diffs = res.data.filter(r => r._hasAnyDiff);
          allDiffs = [...allDiffs, ...diffs];
          processed += res.data.length;
        }

        setReportData([...allDiffs]);
        setReportProgress({ processed, total: totalItems, diffs: allDiffs.length });

        currentPage += pagesToFetch.length;

        // Si ninguna respuesta trajo datos, terminar
        if (responses.every(r => !r.ok || !r.data || r.data.length === 0)) break;
      }
    } catch (err) {
      console.error('Report scan error:', err);
    } finally {
      setReportScanning(false);
    }
  };

  const stopReportScan = () => {
    scanAbortRef.current = true;
  };

  // ── Excel download via SheetJS CDN ──
  const downloadReportExcel = async () => {
    if (reportData.length === 0) return;
    // Cargar SheetJS dinámicamente desde CDN
    if (!window.XLSX) {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      document.head.appendChild(script);
      await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
    }
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    if (reportFilter === 'variable') {
      // Hoja con variaciones expandidas
      const rows = [];
      for (const r of reportData) {
        // Fila padre
        rows.push({
          'Item': r.item,
          'Nombre': r.nombre,
          'Tipo': 'VARIABLE',
          'Variación': '',
          'SKU Variación': '',
          'Unidad SIESA': r.unidad || '',
          'Precio SIESA': r.siesa_price,
          'Precio WooCommerce': r.woo_price,
          'Diferencia': r.diff,
          'Estado': r.status,
          'Stock WC': r.woo_stock
        });
        // Filas variación
        for (const v of (r.variations || [])) {
          rows.push({
            'Item': r.item,
            'Nombre': r.nombre,
            'Tipo': 'Variación',
            'Variación': v.name,
            'SKU Variación': v.sku,
            'Unidad SIESA': v.siesa_unit || '',
            'Precio SIESA': v.siesa_price,
            'Precio WooCommerce': v.woo_price,
            'Diferencia': v.diff,
            'Estado': v.status,
            'Stock WC': v.woo_stock
          });
        }
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      // Ancho de columnas
      ws['!cols'] = [
        { wch: 12 }, { wch: 35 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
        { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Variables con Diferencias');
    } else {
      // Hoja simple
      const rows = reportData.map(r => ({
        'Item': r.item,
        'Nombre': r.nombre,
        'Precio SIESA': r.siesa_price,
        'Precio WooCommerce': r.woo_price,
        'Diferencia': r.diff,
        'Estado': r.status,
        'Unidad': r.unidad || '',
        'Stock WC': r.woo_stock
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 35 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
        { wch: 12 }, { wch: 8 }, { wch: 10 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Diferencias de Precios');
    }

    const filterLabel = reportFilter === 'variable' ? 'variables' : reportFilter === 'simple' ? 'simples' : 'todos';
    XLSX.writeFile(wb, `reporte_diferencias_${sede}_${filterLabel}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div>
      <div className="ge-header">
        <div className="ge-title">
          <h2>Auditoría de Precios VR</h2>
          <p>Comparativa en tiempo real SIESA vs WooCommerce</p>
        </div>
      </div>

      {/* ── Toolbar: Sede + Search + Import ── */}
      <div style={{
        background: 'var(--ge-bg-white)',
        borderRadius: 'var(--ge-radius-xl)',
        border: '1px solid var(--ge-border)',
        padding: '20px 24px',
        marginBottom: '20px',
        boxShadow: 'var(--ge-shadow-sm)'
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Sede selector / badge */}
          <div style={{ flex: '0 0 auto' }}>
            {esAdminGlobal && sedes.length > 1 ? (
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', top: '-8px', left: '12px', background: 'var(--ge-bg-white)', padding: '0 6px', fontSize: '0.68rem', fontWeight: 600, color: 'var(--ge-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sede</span>
                <select
                  className="ge-select"
                  value={sedeInfo?.id || ''}
                  onChange={(e) => onSedeChange(e.target.value)}
                  style={{ minWidth: '200px', borderColor: 'var(--ge-primary)', borderWidth: '2px', fontWeight: 600, paddingRight: '32px' }}
                >
                  {sedes.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre} ({s.codigo_siesa})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{
                padding: '10px 18px',
                background: 'var(--ge-primary-light)',
                borderRadius: 'var(--ge-radius)',
                border: '2px solid var(--ge-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '1rem' }}>🏪</span>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--ge-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>Sede</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ge-primary-dark)' }}>{sedeInfo?.nombre || 'Sede'}</div>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '36px', background: 'var(--ge-border)', flexShrink: 0 }} />

          {/* Search */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0', flex: '1 1 300px', minWidth: '200px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', color: 'var(--ge-text-light)', pointerEvents: 'none' }}>🔍</span>
              <input
                className="ge-input"
                type="text"
                placeholder="Buscar por Item o SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '36px', borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
              />
            </div>
            <button type="submit" className="ge-btn" style={{
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              padding: '9px 20px',
              background: 'var(--ge-primary)',
              fontWeight: 600,
              letterSpacing: '0.02em'
            }}>
              Buscar
            </button>
          </form>

          {/* Import button */}
          <button
            className="ge-btn accent"
            onClick={handleAdopt}
            disabled={syncing}
            style={{ padding: '10px 20px', fontWeight: 600, boxShadow: syncing ? 'none' : '0 2px 8px rgba(139, 213, 0, 0.3)' }}
          >
            {syncing ? "⏳ Sincronizando..." : "📥 Importar de Woo"}
          </button>

          {/* Report button */}
          <button
            className="ge-btn"
            onClick={() => { setShowReport(true); setReportData([]); setReportProgress({ processed: 0, total: 0, diffs: 0 }); setReportFilter('all'); }}
            style={{ padding: '10px 20px', fontWeight: 600, background: '#4338ca', boxShadow: '0 2px 8px rgba(67, 56, 202, 0.3)' }}
          >
            📊 Reporte Diferencias
          </button>
        </div>
      </div>

      {/* ── Filter Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Card: Todos */}
        <div
          onClick={() => handleFilterClick('all')}
          style={{
            background: filterType === 'all' ? 'var(--ge-primary)' : 'var(--ge-bg-white)',
            borderRadius: 'var(--ge-radius-lg)',
            border: filterType === 'all' ? '2px solid var(--ge-primary)' : '2px solid var(--ge-border)',
            padding: '20px 24px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: filterType === 'all' ? '0 4px 12px rgba(33, 13, 101, 0.2)' : 'var(--ge-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: filterType === 'all' ? 'rgba(255,255,255,0.2)' : 'var(--ge-primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem', flexShrink: 0
          }}>📋</div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: filterType === 'all' ? 'rgba(255,255,255,0.8)' : 'var(--ge-text-muted)', marginBottom: '2px' }}>Todos</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: filterType === 'all' ? '#fff' : 'var(--ge-text-dark)' }}>{rawData.length}</div>
            <div style={{ fontSize: '0.75rem', color: filterType === 'all' ? 'rgba(255,255,255,0.65)' : 'var(--ge-text-light)' }}>Vista sin filtros</div>
          </div>
        </div>

        {/* Card: Diferencias */}
        <div
          onClick={() => handleFilterClick('diff')}
          style={{
            background: filterType === 'diff' ? 'var(--ge-warning)' : 'var(--ge-bg-white)',
            borderRadius: 'var(--ge-radius-lg)',
            border: filterType === 'diff' ? '2px solid var(--ge-warning)' : '2px solid var(--ge-border)',
            padding: '20px 24px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: filterType === 'diff' ? '0 4px 12px rgba(245, 158, 11, 0.25)' : 'var(--ge-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: filterType === 'diff' ? 'rgba(255,255,255,0.25)' : 'var(--ge-warning-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem', flexShrink: 0
          }}>⚠️</div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: filterType === 'diff' ? 'rgba(255,255,255,0.85)' : 'var(--ge-warning)', marginBottom: '2px' }}>Diferencias</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: filterType === 'diff' ? '#fff' : 'var(--ge-text-dark)' }}>
              {rawData.filter(r => r.price_status !== 'OK').length}
            </div>
            <div style={{ fontSize: '0.75rem', color: filterType === 'diff' ? 'rgba(255,255,255,0.65)' : 'var(--ge-text-light)' }}>Requieren sincronización</div>
          </div>
        </div>

        {/* Card: Completados */}
        <div
          onClick={() => handleFilterClick('ok')}
          style={{
            background: filterType === 'ok' ? 'var(--ge-success)' : 'var(--ge-bg-white)',
            borderRadius: 'var(--ge-radius-lg)',
            border: filterType === 'ok' ? '2px solid var(--ge-success)' : '2px solid var(--ge-border)',
            padding: '20px 24px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: filterType === 'ok' ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'var(--ge-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: filterType === 'ok' ? 'rgba(255,255,255,0.25)' : 'var(--ge-success-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem', flexShrink: 0
          }}>✅</div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: filterType === 'ok' ? 'rgba(255,255,255,0.85)' : 'var(--ge-success)', marginBottom: '2px' }}>Sincronizados</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: filterType === 'ok' ? '#fff' : 'var(--ge-text-dark)' }}>
              {rawData.filter(r => r.price_status === 'OK').length}
            </div>
            <div style={{ fontSize: '0.75rem', color: filterType === 'ok' ? 'rgba(255,255,255,0.65)' : 'var(--ge-text-light)' }}>Items correctos</div>
          </div>
        </div>
      </div>

      <div className="ge-card">
        <div className="ge-table-container">
          <table className="ge-table">
            <thead>
              <tr>
                <th>Item Siesa</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
                <th className="text-center">Precio Siesa</th>
                <th className="text-center">Precio Woo</th>
                <th className="text-center">Diferencia</th>
                <th className="text-center">Stock Siesa</th>
                <th className="text-center">Stock Woo</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="ge-loading">Cargando datos en tiempo real (Paginado)...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="8" className="ge-loading">No se encontraron resultados</td></tr>
              ) : (
                data.map((row) => (
                  <React.Fragment key={row.item}>
                    <tr>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {row.item}
                          {row.product_type === 'variable' && (
                            <span style={{ marginLeft: '6px', fontSize: '0.7rem', background: '#e0e7ff', color: '#4338ca', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>VARIABLE</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Woo: {row.woo_product_id}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`ge-badge status-${row.price_status || 'UNKNOWN'}`}>
                          {(row.price_status || 'UNKNOWN').replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="text-center">
                        <div style={{ fontWeight: 500 }}>{row.siesa_price ? CURRENCY.format(row.siesa_price) : "-"}</div>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{row.unidad}</span>
                      </td>
                      <td className="text-center" style={{ color: '#6b7280' }}>
                        {row.woo_price ? CURRENCY.format(row.woo_price) : "N/A"}
                      </td>
                      <td className="text-center">
                        <span className={row.price_diff !== 0 ? "ge-price-diff-pos" : "ge-price-diff-zero"} style={{ display: 'inline-block', minWidth: '80px' }}>
                          {row.price_diff ? CURRENCY.format(row.price_diff) : "-"}
                        </span>
                      </td>
                      <td className="text-center">
                        <div className={row.stock_disponible > 0 ? "ge-stock-ok" : "ge-stock-low"} style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                          {row.stock_disponible}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                          Físico: {row.stock_existencia}
                        </div>
                      </td>
                      <td className="text-center">
                        <div style={{ fontWeight: 'bold', color: row.woo_stock !== row.stock_disponible ? '#d97706' : '#111827' }}>
                          {row.woo_stock !== null ? row.woo_stock : '-'}
                        </div>
                      </td>
                      <td className="text-center">
                        <button
                          className={`ge-btn ${row.price_status === 'OK' ? 'secondary' : 'info'}`}
                          style={{
                            padding: '6px 16px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            opacity: row.price_status === 'OK' ? 0.6 : 1
                          }}
                          disabled={row.price_status === 'OK'}
                          onClick={() => handleSyncRow(row)}
                        >
                          {row.price_status === 'OK' ? 'OK' : 'Sincronizar'}
                        </button>
                      </td>
                    </tr>
                    {/* Sub-rows for variations */}
                    {row.variations && row.variations.length > 0 && row.variations.map((v) => (
                      <tr key={`${row.item}-var-${v.id}`} style={{ background: '#f8fafc' }}>
                        <td style={{ paddingLeft: '28px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>↳</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#4338ca' }}>{v.name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>SKU: {v.sku || '—'}{v.siesa_unit ? ` · ${v.siesa_unit}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`ge-badge status-${v.price_status || 'UNKNOWN'}`} style={{ fontSize: '0.72rem' }}>
                            {(v.price_status || '—').replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="text-center">
                          <div style={{ fontWeight: 500, fontSize: '0.85rem', color: v.siesa_price ? '#111827' : '#9ca3af' }}>
                            {v.siesa_price ? CURRENCY.format(v.siesa_price) : '—'}
                          </div>
                          {v.siesa_unit && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{v.siesa_unit}</span>}
                        </td>
                        <td className="text-center">
                          <div style={{ fontWeight: 600, color: '#4338ca', fontSize: '0.85rem' }}>
                            {v.price ? CURRENCY.format(v.price) : "N/A"}
                          </div>
                        </td>
                        <td className="text-center">
                          <span className={v.price_diff !== 0 && v.price_diff !== null ? "ge-price-diff-pos" : "ge-price-diff-zero"} style={{ display: 'inline-block', minWidth: '80px', fontSize: '0.85rem' }}>
                            {v.price_diff != null ? CURRENCY.format(v.price_diff) : "—"}
                          </span>
                        </td>
                        <td className="text-center" style={{ color: '#9ca3af', fontSize: '0.82rem' }}>—</td>
                        <td className="text-center">
                          <div style={{ fontWeight: 'bold', color: v.stock !== null && v.stock > 0 ? '#059669' : '#dc2626' }}>
                            {v.stock !== null ? v.stock : '—'}
                          </div>
                        </td>
                        <td className="text-center">
                          {v.price_status === 'DIFERENTE' && v.siesa_price && (
                            <button
                              className="ge-btn info"
                              style={{ padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600 }}
                              disabled={syncingVarId === v.id}
                              onClick={() => handleSyncVariation(row, v)}
                            >
                              {syncingVarId === v.id ? '⏳' : 'Sync'}
                            </button>
                          )}
                          {v.price_status === 'OK' && (
                            <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{
        marginTop: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--ge-bg-white)',
        padding: '12px 20px',
        borderRadius: 'var(--ge-radius-lg)',
        border: '1px solid var(--ge-border)',
        boxShadow: 'var(--ge-shadow-sm)'
      }}>
        <button
          disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
          className="ge-btn secondary"
          style={{ padding: '8px 18px', fontWeight: 600 }}
        >
          ← Anterior
        </button>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ge-text-muted)' }}>
          Página <span style={{ color: 'var(--ge-primary)', fontWeight: 700 }}>{page}</span>
          {totalItemsDb ? <span> · {totalItemsDb} items en DB</span> : ''}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          className="ge-btn"
          style={{ padding: '8px 18px', fontWeight: 600 }}
        >
          Siguiente
        </button>
      </div>

      {/* ══════ MODAL REPORTE DE DIFERENCIAS ══════ */}
      {showReport && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '1100px',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
          }}>
            {/* Header */}
            <div style={{
              padding: '24px 28px 16px', borderBottom: '1px solid #e5e7eb',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#111827' }}>📊 Reporte de Diferencias de Precios</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
                  Sede: <strong>{sedeInfo?.nombre || sede}</strong> — Solo productos activos en ecommerce
                </p>
              </div>
              <button onClick={() => { setShowReport(false); stopReportScan(); }} style={{
                background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af', padding: '4px 8px'
              }}>✕</button>
            </div>

            {/* Filter Tabs */}
            <div style={{ padding: '12px 28px 0', background: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { key: 'all', label: '📋 Todos los productos', desc: 'Simples + Variables' },
                  { key: 'simple', label: '📦 Solo Simples', desc: 'Sin variaciones' },
                  { key: 'variable', label: '🔀 Solo Variables', desc: 'Con variaciones' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { if (!reportScanning) { setReportFilter(tab.key); setReportData([]); setReportProgress({ processed: 0, total: 0, diffs: 0 }); } }}
                    disabled={reportScanning}
                    style={{
                      padding: '10px 18px', border: 'none', borderRadius: '8px 8px 0 0', cursor: reportScanning ? 'not-allowed' : 'pointer',
                      background: reportFilter === tab.key ? '#fff' : 'transparent',
                      borderBottom: reportFilter === tab.key ? '2px solid #4338ca' : '2px solid transparent',
                      fontWeight: reportFilter === tab.key ? 700 : 500,
                      color: reportFilter === tab.key ? '#4338ca' : '#6b7280',
                      fontSize: '0.82rem', transition: 'all 0.15s',
                      opacity: reportScanning && reportFilter !== tab.key ? 0.5 : 1
                    }}
                  >
                    {tab.label}
                    <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '1px' }}>{tab.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Progress + Actions */}
            <div style={{ padding: '14px 28px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {!reportScanning ? (
                  <button onClick={startReportScan} className="ge-btn" style={{
                    padding: '10px 24px', fontWeight: 600, background: '#4338ca',
                    boxShadow: '0 2px 8px rgba(67, 56, 202, 0.3)'
                  }}>
                    🔍 Iniciar Escaneo
                  </button>
                ) : (
                  <button onClick={stopReportScan} style={{
                    padding: '10px 24px', fontWeight: 600, background: '#dc2626', color: '#fff',
                    border: 'none', borderRadius: '8px', cursor: 'pointer'
                  }}>
                    ⏹ Detener
                  </button>
                )}

                {reportData.length > 0 && !reportScanning && (
                  <button onClick={downloadReportExcel} className="ge-btn accent" style={{
                    padding: '10px 24px', fontWeight: 600
                  }}>
                    📥 Descargar Excel ({reportData.length})
                  </button>
                )}

                {reportProgress.total > 0 && (
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#6b7280', marginBottom: '4px' }}>
                      <span>{reportProgress.processed.toLocaleString()} / {reportProgress.total.toLocaleString()} procesados</span>
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{reportProgress.diffs} diferencias</span>
                    </div>
                    <div style={{ background: '#e5e7eb', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.round((reportProgress.processed / reportProgress.total) * 100)}%`,
                        height: '100%',
                        background: reportScanning ? '#4338ca' : '#10b981',
                        borderRadius: '999px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Results Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              {reportData.length === 0 ? (
                <div style={{ padding: '48px 28px', textAlign: 'center', color: '#9ca3af' }}>
                  {reportScanning ? (
                    <div>
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔄</div>
                      <div>Escaneando productos{reportFilter === 'simple' ? ' simples' : reportFilter === 'variable' ? ' variables' : ''}...</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
                      <div>Selecciona un tipo de reporte y haz clic en "Iniciar Escaneo"</div>
                      <div style={{ fontSize: '0.78rem', marginTop: '4px', color: '#9ca3af' }}>
                        {reportFilter === 'simple' ? 'Solo productos simples (sin variaciones)' :
                         reportFilter === 'variable' ? 'Solo productos con variaciones — incluye precio por variación' :
                         'Todos los productos activos en ecommerce'}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <table className="ge-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>Item</th>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>Nombre</th>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1, textAlign: 'center' }}>Tipo</th>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1, textAlign: 'center' }}>Estado</th>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1, textAlign: 'right' }}>Precio SIESA</th>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1, textAlign: 'right' }}>Precio WC</th>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1, textAlign: 'right' }}>Diferencia</th>
                      <th style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1, textAlign: 'center' }}>Stock WC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((r) => (
                      <React.Fragment key={r.item}>
                        <tr>
                          <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {r.item}
                          </td>
                          <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                              background: r.product_type === 'variable' ? '#e0e7ff' : '#f3f4f6',
                              color: r.product_type === 'variable' ? '#4338ca' : '#6b7280'
                            }}>{r.product_type === 'variable' ? 'VARIABLE' : 'SIMPLE'}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                              background: r.status === 'DIFERENTE' ? '#fef3c7' : r.status === 'NO_SIESA' ? '#fee2e2' : r.status === 'NO_WOO' ? '#e0e7ff' : '#d1fae5',
                              color: r.status === 'DIFERENTE' ? '#d97706' : r.status === 'NO_SIESA' ? '#dc2626' : r.status === 'NO_WOO' ? '#4338ca' : '#059669'
                            }}>{r.status}</span>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.siesa_price ? CURRENCY.format(r.siesa_price) : '—'}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.woo_price != null ? CURRENCY.format(r.woo_price) : '—'}</td>
                          <td style={{
                            textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap',
                            color: r.diff > 0 ? '#dc2626' : r.diff < 0 ? '#059669' : '#111827'
                          }}>
                            {r.diff != null ? CURRENCY.format(r.diff) : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: r.woo_stock > 0 ? '#059669' : '#dc2626' }}>
                            {r.woo_stock ?? '—'}
                          </td>
                        </tr>
                        {/* Variation sub-rows */}
                        {r.variations && r.variations.length > 0 && r.variations.map(v => (
                          <tr key={`${r.item}-v-${v.id}`} style={{ background: '#f8fafc' }}>
                            <td style={{ paddingLeft: '24px', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#94a3b8', marginRight: '4px' }}>↳</span>
                              <span style={{ fontSize: '0.82rem', color: '#4338ca', fontWeight: 600 }}>{v.name}</span>
                            </td>
                            <td style={{ fontSize: '0.78rem', color: '#9ca3af' }}>SKU: {v.sku || '—'}{v.siesa_unit ? ` · ${v.siesa_unit}` : ''}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ fontSize: '0.68rem', background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '8px' }}>Variación</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                                background: v.status === 'DIFERENTE' ? '#fef3c7' : v.status === 'NO_SIESA' ? '#fee2e2' : '#d1fae5',
                                color: v.status === 'DIFERENTE' ? '#d97706' : v.status === 'NO_SIESA' ? '#dc2626' : '#059669'
                              }}>{v.status}</span>
                            </td>
                            <td style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: v.siesa_price ? 500 : 400, color: v.siesa_price ? '#111827' : '#9ca3af' }}>
                              {v.siesa_price ? CURRENCY.format(v.siesa_price) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#4338ca', fontSize: '0.82rem' }}>
                              {v.woo_price != null ? CURRENCY.format(v.woo_price) : '—'}
                            </td>
                            <td style={{
                              textAlign: 'right', fontWeight: 600, fontSize: '0.82rem',
                              color: v.diff > 0 ? '#dc2626' : v.diff < 0 ? '#059669' : '#111827'
                            }}>
                              {v.diff != null ? CURRENCY.format(v.diff) : '—'}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.82rem', color: v.woo_stock > 0 ? '#059669' : '#dc2626' }}>
                              {v.woo_stock ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            {reportData.length > 0 && !reportScanning && (
              <div style={{
                padding: '12px 28px', borderTop: '1px solid #e5e7eb', background: '#f9fafb',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', color: '#6b7280',
                borderRadius: '0 0 16px 16px'
              }}>
                <span>
                  Escaneo completado: <strong>{reportProgress.processed.toLocaleString()}</strong> productos —{' '}
                  <strong style={{ color: '#dc2626' }}>{reportData.length}</strong> con diferencias
                  {reportFilter !== 'all' && <span> ({reportFilter === 'variable' ? 'solo variables' : 'solo simples'})</span>}
                </span>
                <span>{new Date().toLocaleString('es-CO')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
