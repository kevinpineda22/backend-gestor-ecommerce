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
  const [sedeActual, setSedeActual] = useState(null); // objeto { id, nombre, slug, codigo_siesa, lista_precio }
  const [loadingSedes, setLoadingSedes] = useState(true);

  // Leer rol y sede_id del usuario desde localStorage
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
        // Si admin_sede o picker/auditor → buscar su sede asignada
        if (!esAdminGlobal && userSedeId) {
          const miSede = res.sedes.find(s => s.id === userSedeId);
          setSedeActual(miSede || res.sedes[0]);
        } else {
          // admin_global → default primera sede
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

  const renderContent = () => {
    if (loadingSedes || !sedeActual) {
      return <div className="ge-card" style={{padding: '40px', textAlign: 'center'}}>Cargando sedes...</div>;
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardGestorEcommerce setActiveTab={setActiveTab} sedeInfo={sedeActual} />;
      case 'catalog':
        return <CatalogManager sedeInfo={sedeActual} />;
      case 'audit':
        return <LiveComparison sedeInfo={sedeActual} esAdminGlobal={esAdminGlobal} sedes={sedes} onSedeChange={handleSedeChange} />;
      case 'banners':
        return <BannerManager />;
      case 'discounts':
        return <DiscountManager />;
      case 'settings':
        return <div className="ge-card" style={{padding: '40px', textAlign: 'center'}}>Configuración en construcción...</div>;
      default:
        return <DashboardGestorEcommerce setActiveTab={setActiveTab} sedeInfo={sedeActual} />;
    }
  };

  return (
    <div className="ge-container">
      {/* Sidebar Navigation */}
      <aside className="ge-sidebar">
        <div className="ge-brand">
          <h1>EcomManager</h1>
        </div>

        {/* Selector de Sede (solo admin_global) */}
        {esAdminGlobal && sedes.length > 1 && (
          <div className="ge-sidebar-section">
            <label className="ge-sidebar-label">Sede</label>
            <select
              className="ge-select"
              style={{width: '100%', marginTop: '4px', fontSize: '0.85rem'}}
              value={sedeActual?.id || ''}
              onChange={(e) => handleSedeChange(e.target.value)}
            >
              {sedes.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {/* Sede fija para admin_sede */}
        {!esAdminGlobal && sedeActual && (
          <div className="ge-sidebar-section">
            <label className="ge-sidebar-label">Sede</label>
            <div className="ge-sidebar-sede-name">{sedeActual.nombre}</div>
          </div>
        )}
        
        <nav className="ge-nav">
          <div 
            className={`ge-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span>📊</span> Dashboard
          </div>
          
          <div 
            className={`ge-nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            <span>📦</span> Catálogo
          </div>

          <div 
            className={`ge-nav-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <span>💰</span> Auditoría Precios
          </div>

          <div 
            className={`ge-nav-item ${activeTab === 'banners' ? 'active' : ''}`}
            onClick={() => setActiveTab('banners')}
          >
            <span>🖼️</span> Banners
          </div>

          <div 
            className={`ge-nav-item ${activeTab === 'discounts' ? 'active' : ''}`}
            onClick={() => setActiveTab('discounts')}
          >
            <span>🏷️</span> Descuentos
          </div>

          <div 
            className={`ge-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span>⚙️</span> Configuración
          </div>
        </nav>

        <div className="ge-sidebar-footer">
          {empleado.nombre || 'Usuario'} {sedeActual ? `- ${sedeActual.nombre}` : ''}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ge-main">
        {renderContent()}
      </main>
    </div>
  );
};

export default GestorEcommerce;
