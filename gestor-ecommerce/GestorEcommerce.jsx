import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaChartBar, FaBoxOpen, FaSearchDollar, FaImages, FaTags, FaCog, FaTruck } from 'react-icons/fa';
import LiveComparison from './components/LiveComparison';
import DashboardGestorEcommerce from './components/DashboardGestorEcommerce';
import CatalogManager from './CatalogManager';
import BannerManager from './components/BannerManager';
import DiscountManager from './components/DiscountManager';
import LogisticsManager from './components/LogisticsManager';
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
        return <CatalogManager sedeInfo={sedeActual} sedes={sedes} />;
      case 'audit':
        return <LiveComparison sedeInfo={sedeActual} esAdminGlobal={esAdminGlobal} sedes={sedes} onSedeChange={handleSedeChange} />;
      case 'banners':
        return <BannerManager sedes={sedes} sedeActual={sedeActual} esAdminGlobal={esAdminGlobal} />;
      case 'discounts':
        return <DiscountManager sedes={sedes} sedeActual={sedeActual} esAdminGlobal={esAdminGlobal} />;
      case 'logistics':
        return <LogisticsManager sedes={sedes} sedeActual={sedeActual} esAdminGlobal={esAdminGlobal} />;
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
        <div className="ge-sidebar-header">
          <Link to="/acceso" className="ge-back-button"><FaArrowLeft /></Link>
          <div className="ge-sidebar-logo">EM</div>
          <h2 className="ge-sidebar-title">EcomManager</h2>
        </div>

        {/* Sede Selector */}
        <div className="ge-sede-selector">
          <div className="ge-sede-selector-label">
            {esAdminGlobal ? '👑 Admin Global' : '🏪 Encargado'}
          </div>
          {esAdminGlobal && sedes.length > 1 ? (
            <select
              className="ge-sede-select"
              value={sedeActual?.id || ''}
              onChange={(e) => handleSedeChange(e.target.value)}
            >
              {sedes.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          ) : sedeActual ? (
            <div className="ge-sede-current">
              <span className="ge-sede-current-dot"></span>
              <span className="ge-sede-current-name">{sedeActual.nombre}</span>
            </div>
          ) : null}
        </div>

        <nav className="ge-sidebar-nav">
          <div className="ge-nav-label">GENERAL</div>
          <button className={`ge-nav-button ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => navigate('dashboard')}>
            <FaChartBar /> <span>Dashboard</span>
          </button>
          <button className={`ge-nav-button ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => navigate('catalog')}>
            <FaBoxOpen /> <span>Catálogo</span>
          </button>

          <div className="ge-nav-label spacer">AUDITORÍA</div>
          <button className={`ge-nav-button ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => navigate('audit')}>
            <FaSearchDollar /> <span>Auditoría Precios</span>
          </button>

          <div className="ge-nav-label spacer">CONTENIDO</div>
          <button className={`ge-nav-button ${activeTab === 'banners' ? 'active' : ''}`} onClick={() => navigate('banners')}>
            <FaImages /> <span>Banners</span>
          </button>
          <button className={`ge-nav-button ${activeTab === 'discounts' ? 'active' : ''}`} onClick={() => navigate('discounts')}>
            <FaTags /> <span>Descuentos</span>
          </button>

          <div className="ge-nav-label spacer">OPERACIONES</div>
          <button className={`ge-nav-button ${activeTab === 'logistics' ? 'active' : ''}`} onClick={() => navigate('logistics')}>
            <FaTruck /> <span>Logística</span>
          </button>

          <div className="ge-nav-label spacer">SISTEMA</div>
          <button className={`ge-nav-button ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}>
            <FaCog /> <span>Configuración</span>
          </button>
        </nav>

        <div className="ge-sidebar-footer">
          <div className="ge-footer-name">{empleado.nombre || 'Usuario'}</div>
          <div className="ge-footer-role">{esAdminGlobal ? '👑 Admin Global' : sedeActual?.nombre || ''}</div>
        </div>
      </aside>

      <main className="ge-main">
        {renderContent()}
      </main>
    </div>
  );
};

export default GestorEcommerce;
