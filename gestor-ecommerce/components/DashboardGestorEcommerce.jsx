import React, { useEffect, useState } from 'react';
import { fetchDashboardStats, adoptWooProducts } from '../services'; // Updated service import
import './DashboardGestorEcommerce.css';

const CURRENCY = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const DashboardGestorEcommerce = ({ setActiveTab, sedeInfo }) => {
  const [data, setData] = useState({
    catalog: { total_products: 0, active_products: 0, draft_products: 0, missing_images: 0 },
    sales: { total_sales: 0, total_orders: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const res = await fetchDashboardStats();
      if (res.ok) {
        setData(res);
      }
    } catch (error) {
      console.error("Dashboard load failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!window.confirm("¿Deseas escanear WooCommerce para importar nuevos productos?")) return;

    setSyncing(true);
    try {
      const res = await adoptWooProducts();
      alert(`Sincronización completada.\nProcesados: ${res.processed}`);
      loadDashboardData();
    } catch (e) {
      alert("Error en sincronización: " + e.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="ge-dashboard">
      <h2>Panel de Control{sedeInfo ? ` - ${sedeInfo.nombre}` : ''}</h2>

      {/* --- SECCIÓN 1: KPI COMERCIALES --- */}
      <div className="ge-section-title">Resumen Comercial (Mes Actual)</div>
      <div className="ge-stats-grid">
        <div className="ge-stat-card primary-card">
          <h3>Ventas Totales</h3>
          <div className="ge-stat-value">
            {loading ? '...' : CURRENCY.format(data.sales.total_sales)}
          </div>
          <div className="ge-stat-desc">Ingresos brutos en WooCommerce</div>
        </div>

        <div className="ge-stat-card">
          <h3>Pedidos</h3>
          <div className="ge-stat-value">
            {loading ? '...' : data.sales.total_orders}
          </div>
          <div className="ge-stat-desc">Órdenes procesadas este mes</div>
        </div>

        <div className="ge-stat-card">
          <h3>Ticket Promedio</h3>
          <div className="ge-stat-value">
            {loading ? '...' : CURRENCY.format(data.sales.total_orders > 0 ? data.sales.total_sales / data.sales.total_orders : 0)}
          </div>
          <div className="ge-stat-desc">Promedio por pedido</div>
        </div>
      </div>

      {/* --- SECCIÓN 2: KPI CATÁLOGO --- */}
      <div className="ge-section-title" style={{ marginTop: '30px' }}>Estado del Catálogo</div>
      <div className="ge-stats-grid">
        <div className="ge-stat-card">
          <h3>Total Productos</h3>
          <div className="ge-stat-value">
            {loading ? '...' : data.catalog.total_products}
          </div>
          <div className="ge-stat-desc">Mapeados en Base de Datos</div>
        </div>

        <div className="ge-stat-card">
          <h3>Publicados</h3>
          <div className="ge-stat-value" style={{ color: '#10b981' }}>
            {loading ? '...' : data.catalog.active_products}
          </div>
          <div className="ge-stat-desc">Visibles en tienda</div>
        </div>

        <div className="ge-stat-card">
          <h3>Borradores</h3>
          <div className="ge-stat-value" style={{ color: '#f59e0b' }}>
            {loading ? '...' : data.catalog.draft_products}
          </div>
          <div className="ge-stat-desc">Ocultos / En revisión</div>
        </div>

        <div className="ge-stat-card">
          <h3>Sin Imagen</h3>
          <div className="ge-stat-value" style={{ color: data.catalog.missing_images > 0 ? '#ef4444' : '#6b7280' }}>
            {loading ? '...' : data.catalog.missing_images}
          </div>
          <div className="ge-stat-desc">Requieren atención</div>
        </div>
      </div>


      {/* Quick Actions Grid */}
      <div className="ge-dashboard-actions">

        {/* Card: Sync */}
        <div className="ge-action-card">
          <h3>1. Sincronización</h3>
          <p>
            Importa nuevos productos desde WooCommerce para gestionarlos en el sistema.
          </p>
          <button
            className="ge-action-btn"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? 'Sincronizando...' : '📥 Traer productos de Woo'}
          </button>
        </div>

        {/* Card: Audit */}
        <div className="ge-action-card">
          <h3>2. Auditoría de Precios</h3>
          <p>
            Compara precios y stock en tiempo real entre Siesa y WooCommerce.
          </p>
          <button
            className="ge-action-btn secondary"
            onClick={() => setActiveTab('audit')}
          >
            🔍 Ir a Auditoría
          </button>
        </div>

        {/* Card: Catalog */}
        <div className="ge-action-card">
          <h3>3. Gestor de Catálogo</h3>
          <p>
            Administra tags, categorías y detalles de productos.
          </p>
          <button
            className="ge-action-btn secondary"
            onClick={() => setActiveTab('catalog')}
          >
            📦 Ver Catálogo
          </button>
        </div>

      </div>
    </div>
  );
};

export default DashboardGestorEcommerce;

