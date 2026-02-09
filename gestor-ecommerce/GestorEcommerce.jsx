import React, { useState } from 'react';
import LiveComparison from './components/LiveComparison';
import DashboardGestorEcommerce from './components/DashboardGestorEcommerce';
import CatalogManager from './CatalogManager';
import './GestorEcommerce.css';

const GestorEcommerce = () => {
  const [activeTab, setActiveTab] = useState('audit');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardGestorEcommerce setActiveTab={setActiveTab} />;
      case 'catalog':
        return <CatalogManager />;
      case 'audit':
        return <LiveComparison />;
      case 'settings':
        return <div className="ge-card" style={{padding: '40px', textAlign: 'center'}}>Configuración en construcción...</div>;
      default:
        return <LiveComparison />;
    }
  };

  return (
    <div className="ge-container">
      {/* Sidebar Navigation */}
      <aside className="ge-sidebar">
        <div className="ge-brand">
          <h1>EcomManager</h1>
        </div>
        
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
            className={`ge-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span>⚙️</span> Configuración
          </div>
        </nav>

        <div style={{padding: '20px', fontSize: '0.8rem', color: '#9ca3af', borderTop: '1px solid #f3f4f6'}}>
          Usuario Admin
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
