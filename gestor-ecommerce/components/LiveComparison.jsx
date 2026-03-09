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
        stock_quantity: row.stock_disponible // Regresamos al mapeo live
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

        <div className="ge-controls" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', width: '100%', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button
            className="ge-btn"
            onClick={handleAdopt}
            disabled={syncing}
            style={{ backgroundColor: syncing ? '#9ca3af' : '#059669' }}
          >
            {syncing ? "Sincronizando..." : "📥 Importar de Woo"}
          </button>

          {esAdminGlobal && sedes.length > 1 ? (
            <select
              className="ge-select"
              value={sedeInfo?.id || ''}
              onChange={(e) => onSedeChange(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              {sedes.map(s => (
                <option key={s.id} value={s.id}>{s.nombre} ({s.codigo_siesa})</option>
              ))}
            </select>
          ) : (
            <span style={{ padding: '8px 16px', background: '#f3f4f6', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 600 }}>
              {sedeInfo?.nombre || 'Sede'}
            </span>
          )}

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', flex: '1 1 auto', minWidth: '200px' }}>
            <input
              className="ge-input"
              type="text"
              placeholder="Buscar Item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="submit" className="ge-btn secondary">
              Buscar
            </button>
          </form>
        </div>
      </div>

      <div className="ge-stats-grid" style={{ marginBottom: '24px' }}>
        <div className={`ge-stat-card filter-card ${filterType === 'all' ? 'active' : ''}`} onClick={() => handleFilterClick('all')} style={{ cursor: 'pointer' }}>
          <h3>Todos</h3>
          <div className="ge-stat-value" style={{ fontSize: '1.8rem' }}>—</div>
          <div className="ge-stat-desc">Vista sin filtros y datos crudos</div>
        </div>
        <div className={`ge-stat-card filter-card ${filterType === 'diff' ? 'active' : ''}`} onClick={() => handleFilterClick('diff')} style={{ cursor: 'pointer' }}>
          <h3 style={{ color: 'var(--ge-warning)' }}>⚠️ Diferencias</h3>
          <div className="ge-stat-value" style={{ color: 'var(--ge-warning)', fontSize: '1.8rem' }}>!</div>
          <div className="ge-stat-desc">Items que requieren sincronización</div>
        </div>
        <div className={`ge-stat-card filter-card ${filterType === 'ok' ? 'active' : ''}`} onClick={() => handleFilterClick('ok')} style={{ cursor: 'pointer' }}>
          <h3 style={{ color: 'var(--ge-success)' }}>✅ Completados</h3>
          <div className="ge-stat-value" style={{ color: 'var(--ge-success)', fontSize: '1.8rem' }}>✓</div>
          <div className="ge-stat-desc">Items sincronizados correctamente</div>
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
                  <tr key={row.item}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.item}</div>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
          className="ge-btn"
          style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db' }}
        >
          Anterior
        </button>
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Página {page} - {totalItemsDb ? `Total DB: ${totalItemsDb}` : ''}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          className="ge-btn"
          style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db' }}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
