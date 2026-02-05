import React, { useState, useEffect } from "react";
import { fetchCatalog, toggleProduct, adoptWooProducts, updateWooProduct, uploadImage } from "../services";
import "../GestorEcommerce.css";

export default function CatalogManager() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState('all'); // all, active, unlinked, no_image
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Edit State
  const [editingItem, setEditingItem] = useState(null); // { item, woo_product_id, name, image_url }
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Metricas
  const totalItems = data.length;
  const activeItems = data.filter(d => d.ecommerce_active).length;
  const unlinkedItems = data.filter(d => !d.exists_in_woo).length;
  const noImageItems = data.filter(d => !d.image_url || d.image_url === "").length;

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetchCatalog();
      if (res.ok) {
        setData(res.data);
      }
    } catch (error) {
      console.error("Error loading catalog", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!window.confirm("¿Sincronizar estados desde WooCommerce? Esto puede tardar unos segundos si tienes muchos productos.")) return;
    
    setSyncing(true);
    try {
      const res = await adoptWooProducts();
      if (res.ok) {
        alert(`Sincronización completada.\nProcesados: ${res.processed || res.inserted}`);
        loadCatalog();
      } else {
        alert("Hubo un problema con la sincronización");
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión al sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const handleToggle = async (item, currentStatus, index) => {
    // Optimistic update
    const newData = [...data];
    // Find the item in the filtered/paginated view is tricky if we rely on index derived from map.
    // Better to find by item code
    const targetIndex = newData.findIndex(d => d.item === item);
    if (targetIndex === -1) return;

    const newStatus = !currentStatus;
    newData[targetIndex].ecommerce_active = newStatus;
    setData(newData);

    try {
      const res = await toggleProduct(item, newStatus);
      if (!res.ok) {
        // Revert if error
        newData[targetIndex].ecommerce_active = currentStatus;
        setData(newData);
        alert("Error al actualizar estado en WooCommerce");
      }
    } catch (error) {
      console.error(error);
      newData[targetIndex].ecommerce_active = currentStatus;
      setData(newData);
      alert("Error debconexión");
    }
  };

  const openEdit = (row) => {
    // Si no existe en Woo, no se puede editar (o deberíamos ofrecer crearlo, pero por ahora solo edición)
    if (!row.exists_in_woo) {
      alert("Primero sincroniza o vincula este producto para editarlo.");
      return;
    }
    setEditingItem({
      ...row,
      // Usamos descripción de Siesa si Woo no tiene nombre (aunque debería)
      // Pero si ya editamos el nombre, row.descripcion tiene el nombre de Woo (por la lógica en update)
      // o el nombre de SIESA si nunca se ha editado y no tenemos woo_name.
      name: row.descripcion, 
      image_url: row.image_url || ""
    });
  };

  const handleImageUpload = async (files) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (!file.type.startsWith('image/')) {
        alert("Por favor sube solo archivos de imagen");
        return;
    }

    setUploading(true);
    try {
        const res = await uploadImage(file);
        if (res.url) {
            setEditingItem(prev => ({ ...prev, image_url: res.url }));
        } else {
            alert("Error al obtener la URL de la imagen");
        }
    } catch (error) {
        console.error(error);
        alert("Error subiendo la imagen");
    } finally {
        setUploading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setSavingEdit(true);

    try {
      const res = await updateWooProduct(editingItem.woo_product_id, {
        name: editingItem.name, 
        image_url: editingItem.image_url
      });

      if (res.ok) {
        // Actualizar localmente
        const newData = data.map(d => {
          if (d.item === editingItem.item) {
            return { 
              ...d, 
              image_url: editingItem.image_url,
              descripcion: editingItem.name // Actualizamos visualmente el nombre
            };
          }
          return d;
        });
        setData(newData);
        setEditingItem(null);
        alert("Producto actualizado correctamente");
      } else {
        alert("Error al actualizar: " + res.message);
      }
    } catch (e) {
      console.error(e);
      alert("Error guardando cambios");
    } finally {
      setSavingEdit(false);
    }
  };

  // Filtrado Frontend (ya que el backend devuelve todo)
  const filteredData = data.filter(row => {
    // 1. Buscador
    const matchSearch = row.descripcion?.toLowerCase().includes(search.toLowerCase()) || 
                      row.item?.includes(search);
    
    // 2. Filtros de Estado
    if (!matchSearch) return false;

    if (filterType === 'active') return row.ecommerce_active;
    if (filterType === 'unlinked') return !row.exists_in_woo;
    if (filterType === 'no_image') return !row.image_url;

    return true; // case 'all'
  });

  // Paginación Frontend
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <div className="ge-header">
        <div className="ge-title">
          <h2>Gestor de Catálogo</h2>
          <p>Activa o desactiva productos en tu Ecommerce</p>
        </div>

        <div className="ge-controls">
          <button 
            className="ge-button secondary" 
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "⏳ Sincronizando..." : "🔄 Sincronizar con WooCommerce"}
          </button>

          <input 
            className="ge-input"
            type="text" 
            placeholder="Buscar por nombre o SKU..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{width: '300px'}}
          />
        </div>
      </div>

      {/* Tarjetas de Resumen y Filtros */}
      <div style={{display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap'}}>
        <div className={`ge-card ge-stat-card ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>
          <h3>Total Items</h3>
          <p>{totalItems}</p>
        </div>
        <div className={`ge-card ge-stat-card ${filterType === 'active' ? 'active' : ''}`} onClick={() => setFilterType('active')}>
          <h3 style={{color: '#2563eb'}}>Activos Woo</h3>
          <p>{activeItems}</p>
        </div>
        <div className={`ge-card ge-stat-card ${filterType === 'unlinked' ? 'active' : ''}`} onClick={() => setFilterType('unlinked')}>
          <h3 style={{color: '#d97706'}}>⚠️ Sin Vincular</h3>
          <p>{unlinkedItems}</p>
        </div>
        <div className={`ge-card ge-stat-card ${filterType === 'no_image' ? 'active' : ''}`} onClick={() => setFilterType('no_image')}>
          <h3 style={{color: '#ef4444'}}>🖼️ Sin Imagen</h3>
          <p>{noImageItems}</p>
        </div>
      </div>

      <div className="ge-card">
        <div className="ge-table-container">
          <table className="ge-table">
            <thead>
              <tr>
                <th>Imagen</th>
                <th>SKU / Item</th>
                <th>Descripción</th>
                <th>Grupo / Marca</th>
                <th className="text-center">Estado Woo</th>
                <th className="text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="ge-loading">Cargando catálogo completo...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan="6" className="ge-loading">No se encontraron productos</td></tr>
              ) : (
                paginatedData.map((row) => (
                  <tr key={row.item} className={!row.exists_in_woo ? "ge-row-warning" : ""}>
                    <td>
                      {row.image_url ? (
                        <img 
                          src={row.image_url} 
                          alt="product" 
                          style={{width: '50px', height: '50px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #eee'}}
                        />
                      ) : (
                        <div style={{width: '50px', height: '50px', background: '#f3f4f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'}}>📷</div>
                      )}
                    </td>
                    <td>
                      <div style={{fontWeight: 600, color: '#111827'}}>{row.item}</div>
                      {!row.exists_in_woo && (
                        <div style={{fontSize: '0.75rem', color: '#d97706', marginTop: '4px', fontWeight: 600}}>
                          ⚠️ Sin vincular
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{fontWeight: 500}}>{row.descripcion}</div>
                    </td>
                    <td>
                      <div style={{fontSize: '0.85rem', color: '#6b7280'}}>
                        {row.subgrupo} <br/> 
                        <span style={{color: '#9ca3af'}}>{row.marca}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      {row.ecommerce_active ? (
                        <span className="ge-badge status-OK">Publicado</span>
                      ) : (
                        <span className="ge-badge status-NO_EXISTE_WOO">Inactivo</span>
                      )}
                    </td>
                    <td className="text-center">
                      <label style={{position: 'relative', display: 'inline-block', width: '44px', height: '24px'}}>
                        <input 
                          type="checkbox" 
                          checked={row.ecommerce_active}
                          onChange={() => handleToggle(row.item, row.ecommerce_active)}
                          style={{opacity: 0, width: 0, height: 0}}
                        />
                        <span style={{
                          position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: row.ecommerce_active ? '#2563eb' : '#ccc',
                          transition: '.4s', borderRadius: '34px'
                        }}>
                          <span style={{
                            position: 'absolute', content: '""', height: '18px', width: '18px', 
                            left: row.ecommerce_active ? '22px' : '4px', bottom: '3px',
                            backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                          }}></span>
                        </span>
                      </label>
                      
                      <button 
                        className="ge-button secondary"
                        style={{marginLeft: '10px', padding: '4px 8px', fontSize: '0.8rem'}}
                        onClick={() => openEdit(row)}
                        title="Editar Imagen / Nombre"
                      >
                        ✏️
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
          <span style={{fontSize: '0.9rem', fontWeight: 500}}>
            Página {page} de {totalPages || 1} | Total: {filteredData.length} items
          </span>
          <button 
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="ge-btn"
            style={{background: 'white', color: '#374151', border: '1px solid #d1d5db'}}
          >
            Siguiente
          </button>
      </div>

      {editingItem && (
        <div className="ge-modal-overlay">
          <div className="ge-modal">
            <h3>Editar Producto: <span style={{color: '#2563eb'}}>{editingItem.item}</span></h3>
            
            <div className="ge-form-group">
              <label>Nombre en Ecommerce</label>
              <input 
                type="text" 
                value={editingItem.name} 
                onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
              />
            </div>

            <div className="ge-form-group">
              <label>Imagen del Producto</label>
              
              <div 
                style={{
                  border: '2px dashed #cbd5e1', 
                  borderRadius: '8px', 
                  padding: '20px', 
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                  cursor: 'pointer',
                  marginBottom: '10px',
                  position: 'relative',
                  transition: 'background-color 0.2s'
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.backgroundColor = '#e2e8f0';
                }}
                onDragLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  handleImageUpload(e.dataTransfer.files);
                }}     
                onClick={() => document.getElementById('file-upload').click()}  
              >
                  {uploading ? (
                      <div style={{color: '#2563eb', fontWeight: 600}}>⏳ Subiendo imagen...</div>
                  ) : (
                      <>
                        <div style={{fontSize: '24px', marginBottom: '8px'}}>📂</div>
                        <p style={{margin: 0, fontWeight: 500, color: '#475569'}}>Arrastra una imagen aquí o haz clic para subir</p>
                        <input 
                            id="file-upload"
                            type="file" 
                            accept="image/*" 
                            style={{display: 'none'}} 
                            onChange={(e) => handleImageUpload(e.target.files)}
                            onClick={(e) => e.stopPropagation()} 
                        />
                      </>
                  )}
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <span style={{fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap'}}>O usa una URL:</span>
                  <input 
                    type="text" 
                    value={editingItem.image_url} 
                    onChange={(e) => setEditingItem({...editingItem, image_url: e.target.value})}
                    placeholder="https://ejemplo.com/foto.jpg"
                    style={{flex: 1}}
                  />
              </div>
            </div>

            {editingItem.image_url && (
              <div style={{textAlign: 'center', marginBottom: '16px'}}>
                <img src={editingItem.image_url} style={{maxHeight: '150px', borderRadius: '8px'}} alt="Preview" />
              </div>
            )}

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '12px'}}>
              <button className="ge-button secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
              <button className="ge-button primary" onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
