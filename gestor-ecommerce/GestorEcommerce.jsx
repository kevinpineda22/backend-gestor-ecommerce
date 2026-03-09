import React, { useState, useEffect } from 'react';
import LiveComparison from './components/LiveComparison';
import DashboardGestorEcommerce from './components/DashboardGestorEcommerce';
import CatalogManager from './CatalogManager';
import BannerManager from './components/BannerManager';
import DiscountManager from './components/DiscountManager';
import { fetchSedes } from './services';
import './GestorEcommerce.css';

const GestorEcommerce = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sedes, setSedes] = useState([]);
  const [sedeActual, setSedeActual] = useState(null);
  const [loadingSedes, setLoadingSedes] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const empleado = JSON.parse(localStorage.getItem('empleado_info') || '{}');
  const ecommerceRol = empleado.ecommerce_rol || '';
  const userSedeId = empleado.sede_id || null;
  const esAdminGlobal = ecommerceRol === 'ecommerce_admin_global';

  useEffect(() => {
    loadSedes();
  }, []);

  const loadSedes = async () => {
    try {
      const res = await fetchSedes();
      if (res.ok && res.sedes?.length) {
        setSedes(res.sedes);
        if (!esAdminGlobal && userSedeId) {
          const miSede = res.sedes.find(s => s.id === userSedeId);
          setSedeActual(miSede || res.sedes[0]);
        } else {
          setSedeActual(res.sedes[0]);
        }
      }
    } catch (err) {
      console.error("Error cargando sedes:", err);
    } finally {
      setLoadingSedes(false);
    }
  };

  const handleSedeChange = (sedeId) => {
    const nueva = sedes.find(s => s.id === sedeId);
    if (nueva) setSedeActual(nueva);
  };

  const navigate = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const renderContent = () => {
    if (loadingSedes || !sedeActual) {
      return <div className="ge-card ge-empty">Cargando sedes...</div>;
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardGestorEcommerce setActiveTab={setActiveTab} sedeInfo={sedeActual} />;
      case 'catalog':
        return <CatalogManager sedeInfo={sedeActual} />;
      case 'audit':
        return <LiveComparison sedeInfo={sedeActual} esAdminGlobal={esAdminGlobal} sedes={sedes} onSedeChange={handleSedeChange} />;
      case 'banners':
        return <BannerManager sedes={sedes} sedeActual={sedeActual} esAdminGlobal={esAdminGlobal} />;
      case 'discounts':
        return <DiscountManager sedes={sedes} sedeActual={sedeActual} esAdminGlobal={esAdminGlobal} />;
      case 'settings':
        return <div className="ge-card ge-empty">Configuración en construcción...</div>;
      default:
        return <DashboardGestorEcommerce setActiveTab={setActiveTab} sedeInfo={sedeActual} />;
    }
  };

  return (
    <div className="ge-container">
      <button className="ge-mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>

      {sidebarOpen && <div className="ge-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`ge-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="ge-brand">
          <h1>Ecom<span>Manager</span></h1>
        </div>

        {esAdminGlobal && sedes.length > 1 && (
          <div className="ge-sidebar-section">
            <label className="ge-sidebar-label">Sede</label>
            <select className="ge-select" value={sedeActual?.id || ''} onChange={(e) => handleSedeChange(e.target.value)}>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}

        {!esAdminGlobal && sedeActual && (
          <div className="ge-sidebar-section">
            <label className="ge-sidebar-label">Sede</label>
            <div className="ge-sidebar-sede-name">{sedeActual.nombre}</div>
          </div>
        )}

        <nav className="ge-nav">
          {[
            { key: 'dashboard', icon: '📊', label: 'Dashboard' },
            { key: 'catalog', icon: '📦', label: 'Catálogo' },
            { key: 'audit', icon: '💰', label: 'Auditoría Precios' },
            { key: 'banners', icon: '🖼️', label: 'Banners' },
            { key: 'discounts', icon: '🏷️', label: 'Descuentos' },
            { key: 'settings', icon: '⚙️', label: 'Configuración' },
          ].map(item => (
            <div key={item.key} className={`ge-nav-item ${activeTab === item.key ? 'active' : ''}`} onClick={() => navigate(item.key)}>
              <span>{item.icon}</span> {item.label}
            </div>
          ))}
        </nav>

        <div className="ge-sidebar-footer">
          {empleado.nombre || 'Usuario'} {sedeActual ? `— ${sedeActual.nombre}` : ''}
        </div>
      </aside>

      <main className="ge-main">
        {renderContent()}
      </main>
    </div>
  );
};

export default GestorEcommerce;
