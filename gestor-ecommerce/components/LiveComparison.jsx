import React, { useState, useEffect } from "react";
import { fetchLiveComparison, adoptWooProducts, updateWooProduct } from "../services";
import "../GestorEcommerce.css"; // Usa los estilos globales

const CURRENCY = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default function LiveComparison() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sede, setSede] = useState("PV001");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalItemsDb, setTotalItemsDb] = useState(0); 
  const [filterType, setFilterType] = useState('diff'); 
  
  const loadData = async () => {
    setLoading(true);
    try {
      // 🔄 RETORNO A MODO CLÁSICO: Usamos el endpoint normal que ahora fuerza Live Mode
      // NOTA: 'filter' en el endpoint live es limitado (solo filtra por BD local de ecommerce_products, no compara)
      // Pero si el usuario borró la tabla de snapshot, esto es lo más seguro.
      const res = await fetchLiveComparison({ sede, page, item: search }); // Quitamos filterType que era para SQL snapshot
      if (res.ok) {
        // filtrar "diff" en CLIENTE si estamos en modo live
        let rows = res.data;
        if (filterType === 'diff') rows = rows.filter(r => r.price_status !== 'OK');
        if (filterType === 'no_stock') rows = rows.filter(r => r.stock_disponible <= 0 || r.price_status === 'NO_STOCK');
        if (filterType === 'ok') rows = rows.filter(r => r.price_status === 'OK');
        
        setData(rows);
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
  }, [sede, page, filterType]); // Recargar si cambia filtro, sede o página

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
            setData(prev => prev.map(p => {
                if (p.item === row.item) {
                    return { ...p, woo_price: row.siesa_price, price_diff: 0, price_status: 'OK' }; // Regresamos status live
                }
                return p;
            }));
        } else {
            alert("❌ Error: " + (res.message || "No se pudo actualizar"));
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
  };

  // Los filtros ya se hacen en backend, aquí solo mostramos badges activos
  const handleFilterClick = (type) => { 
      setFilterType(type);
      setPage(1); // Reset page on filter change
  };

  return (
    <div>
      <div className="ge-header">
        <div className="ge-title">
          <h2>Auditoría de Precios VR</h2>
          <p>Comparativa en tiempo real SIESA vs WooCommerce</p>
        </div>

        <div className="ge-controls">
          <button 
            className="ge-btn" 
            onClick={handleAdopt} 
            disabled={syncing}
            style={{ backgroundColor: syncing ? '#9ca3af' : '#059669', marginRight: '12px' }}
          >
            {syncing ? "Sincronizando..." : "📥 Importar de Woo"}
          </button>

          <select 
            className="ge-select"
            value={sede} 
            onChange={(e) => setSede(e.target.value)}
          >
            <option value="PV001">Sede Principal (P01)</option>
            <option value="00201">Sede 00201 (P02)</option>
            <option value="00301">Sede 00301 (P03)</option>
            <option value="00401">Sede 00401 (P04)</option>
            <option value="00601">Sede 00601 (P05)</option>
            <option value="00701">Sede 00701 (P06)</option>
            <option value="00801">Sede 00801 (P07)</option>
          </select>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
            <input 
              className="ge-input"
              type="text" 
              placeholder="Buscar Item..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="ge-btn">
              Buscar
            </button>
          </form>
        </div>
      </div>

      <div style={{display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap'}}>
        <div className={`ge-card ge-stat-card ${filterType === 'all' ? 'active' : ''}`} onClick={() => handleFilterClick('all')}> 
            <h3>Todos</h3>
            <p style={{fontSize: '0.8rem', color: '#6b7280'}}>Sin filtrar</p>
        </div>
        <div className={`ge-card ge-stat-card ${filterType === 'diff' ? 'active' : ''}`} onClick={() => handleFilterClick('diff')}> 
            <h3 style={{color: '#d97706'}}>⚠️ Diferencias</h3>
            <p style={{fontSize: '0.8rem', color: '#6b7280'}}>Requieren Atención</p>
        </div>
        <div className={`ge-card ge-stat-card ${filterType === 'ok' ? 'active' : ''}`} onClick={() => handleFilterClick('ok')}> 
            <h3 style={{color: '#059669'}}>✅ OK</h3>
            <p style={{fontSize: '0.8rem', color: '#6b7280'}}>Sincronizados</p>
        </div>
      </div>

      <div className="ge-card">
        <div className="ge-table-container">
          <table className="ge-table">
            <thead>
              <tr>
                <th>Item Siesa</th>
                <th style={{textAlign: 'center'}}>Estado</th>
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
                      <div style={{fontWeight: 600}}>{row.item}</div>
                      <div style={{fontSize: '0.8rem', color: '#9ca3af'}}>Woo: {row.woo_product_id}</div>
                    </td>
                    <td style={{textAlign: 'center'}}>
                      <span className={`ge-badge status-${row.price_status || 'UNKNOWN'}`}>
                        {(row.price_status || 'UNKNOWN').replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="text-center">
                      <div style={{fontWeight: 500}}>{row.siesa_price ? CURRENCY.format(row.siesa_price) : "-"}</div>
                      <span style={{fontSize: '0.75rem', color: '#9ca3af'}}>{row.unidad}</span>
                    </td>
                    <td className="text-center" style={{color: '#6b7280'}}>
                      {row.woo_price ? CURRENCY.format(row.woo_price) : "N/A"}
                    </td>
                    <td className="text-center">
                        <span className={row.price_diff !== 0 ? "ge-price-diff-pos" : "ge-price-diff-zero"} style={{display: 'inline-block', minWidth: '80px'}}> 
                             {row.price_diff ? CURRENCY.format(row.price_diff) : "-"}
                        </span>
                    </td>
                    <td className="text-center">
                      <div className={row.stock_disponible > 0 ? "ge-stock-ok" : "ge-stock-low"} style={{fontWeight: 'bold', fontSize: '1rem'}}>
                        {row.stock_disponible}
                      </div>
                      <div style={{fontSize: '0.7rem', color: '#9ca3af'}}>
                        Físico: {row.stock_existencia}
                      </div>
                    </td>
                    <td className="text-center">
                        <div style={{fontWeight: 'bold', color: row.woo_stock !== row.stock_disponible ? '#d97706' : '#111827'}}>
                            {row.woo_stock !== null ? row.woo_stock : '-'}
                        </div>
                    </td>
                    <td className="text-center">
                      <button 
                        className="ge-btn" 
                        style={{
                            padding: '4px 8px', 
                            fontSize: '0.75rem', 
                            background: row.price_status === 'OK' ? '#f3f4f6' : 'transparent',
                            border: row.price_status === 'OK' ? '1px solid #d1d5db' : '1px solid #2563eb', 
                            color: row.price_status === 'OK' ? '#9ca3af' : '#2563eb', 
                            cursor: row.price_status === 'OK' ? 'default' : 'pointer'
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

      <div style={{marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
           <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="ge-btn"
              style={{background: 'white', color: '#374151', border: '1px solid #d1d5db'}}
            >
              Anterior
            </button>
            <span style={{fontSize: '0.9rem', fontWeight: 500}}>Página {page} - {totalItemsDb ? `Total DB: ${totalItemsDb}` : ''}</span>
            <button 
              onClick={() => setPage(p => p + 1)}
              className="ge-btn"
              style={{background: 'white', color: '#374151', border: '1px solid #d1d5db'}}
            >
              Siguiente
            </button>
      </div>
    </div>
  );
}
