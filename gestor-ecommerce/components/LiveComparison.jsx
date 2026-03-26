import React, { useState, useEffect } from "react";
import { fetchLiveComparison, adoptWooProducts, updateWooProduct } from "../services";
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalItemsDb, setTotalItemsDb] = useState(0);
  const [filterType, setFilterType] = useState('diff');

  // Sede actual viene del padre via sedeInfo.codigo_siesa
  const sede = sedeInfo?.codigo_siesa || "PV001";

  // Función pura para filtrar (sin llamar al server)
  const applyFilter = (rows, filter) => {
    if (filter === 'diff') return rows.filter(r => r.price_status !== 'OK');
    if (filter === 'no_stock') return rows.filter(r => r.stock_disponible <= 0 || r.price_status === 'NO_STOCK');
    if (filter === 'ok') return rows.filter(r => r.price_status === 'OK');
    return rows;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchLiveComparison({ sede, page, item: search });
      if (res.ok) {
        setRawData(res.data);
        setData(applyFilter(res.data, filterType));
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
    setPage(1);
    loadData();
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
                              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>SKU: {v.sku || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '10px', fontWeight: 500 }}>
                            Variación
                          </span>
                        </td>
                        <td className="text-center" style={{ color: '#9ca3af', fontSize: '0.82rem' }}>—</td>
                        <td className="text-center">
                          <div style={{ fontWeight: 600, color: '#4338ca' }}>
                            {v.price ? CURRENCY.format(v.price) : "N/A"}
                          </div>
                        </td>
                        <td className="text-center" style={{ color: '#9ca3af' }}>—</td>
                        <td className="text-center" style={{ color: '#9ca3af', fontSize: '0.82rem' }}>—</td>
                        <td className="text-center">
                          <div style={{ fontWeight: 'bold', color: v.stock !== null && v.stock > 0 ? '#059669' : '#dc2626' }}>
                            {v.stock !== null ? v.stock : '—'}
                          </div>
                        </td>
                        <td className="text-center" />
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
    </div>
  );
}
