import React, { useState, useEffect } from "react";
import "./CatalogManager.css";

export default function ProductEditModal({ 
  product, 
  categories, 
  tags, 
  onClose, 
  onSave, 
  onUploadImage, 
  onCreateTag, // Callback para crear tag
  onDeleteTag, // Callback para eliminar tag
  dataError 
}) {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'classification'
  const [localItem, setLocalItem] = useState(null);
  
  // Estados locales de búsqueda
  const [tagSearch, setTagSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [subGroupSearch, setSubGroupSearch] = useState("");
  
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Para el botón de guardar global

  // Inicializar estado local al abrir
  useEffect(() => {
    if (product) {
      setLocalItem({
        ...product,
        // Asegurar arrays
        categories: product.categories || [],
        tags: product.tags || [],
        brands: product.brands || []
      });
      // Resetear vista
      setActiveTab('general');
    }
  }, [product]);

  if (!localItem) return null;

  // --- Helpers de clasificación ---
  const groupCats = categories.filter(c => c.parent === 0).sort((a,b) => a.name.localeCompare(b.name));
  const subGroupCats = categories.filter(c => c.parent !== 0).sort((a,b) => a.name.localeCompare(b.name));

  const handleInternalSave = async () => {
      setIsSaving(true);
      await onSave(localItem);
      setIsSaving(false);
  };

  const internalCreateTag = async () => {
      if(!newTagName.trim()) return;
      setSavingTag(true);
      const success = await onCreateTag(newTagName);
      if(success) {
          setNewTagName("");
          setShowTagInput(false);
      }
      setSavingTag(false);
  };

  // --- RENDERIZADO ---
  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal cm-modal-fullscreen">
        
        {/* HEADER CON TABS */}
        <div className="cm-modal-header-tabs">
            <div className="cm-modal-title-bar">
                <h3 className="cm-modal-title">
                    {localItem.isNew ? '✨ Creando Nuevo Producto:' : 'Editando:'} 
                    <span style={{color: '#2563eb'}}> {localItem.item}</span>
                </h3>
                <button className="cm-close-btn" onClick={onClose} title="Cerrar">×</button>
            </div>

            <div className="cm-tabs-container">
                <button 
                  className={`cm-tab ${activeTab === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  <span style={{fontSize: '1.2rem'}}>📷</span> General e Imagen
                </button>
                <button 
                  className={`cm-tab ${activeTab === 'classification' ? 'active' : ''}`}
                  onClick={() => setActiveTab('classification')}
                >
                  <span style={{fontSize: '1.2rem'}}>🏷️</span> Clasificación (Categorías)
                </button>
            </div>
        </div>
        
        {/* CUERPO DEL MODAL (SCROLLABLE) */}
        <div className="cm-modal-body">
            
            {dataError && (
              <div className="cm-error-banner">
                  ⚠️ <strong>Problema de Conexión:</strong> {dataError}
              </div>
            )}

            {/* --- PESTAÑA 1: GENERAL --- */}
            {activeTab === 'general' && (
                <div className="cm-tab-content fade-in">
                    <div className="cm-grid-2-col" style={{alignItems: 'start'}}>
                        {/* Columna Izquierda: Datos Básicos */}
                        <div>
                            <div className="cm-form-group">
                                <label className="cm-label">Nombre en Ecommerce</label>
                                <input 
                                    type="text" 
                                    className="cm-input"
                                    value={localItem.name} 
                                    onChange={(e) => setLocalItem({...localItem, name: e.target.value})}
                                    style={{fontSize: '1.1rem', padding: '10px'}}
                                />
                                <p style={{fontSize: '0.8rem', color: '#64748b', marginTop: '4px'}}>
                                    Este es el nombre visible para el cliente en la web.
                                </p>
                            </div>

                            <div className="cm-form-group">
                                <label className="cm-label">Descripción ERP (Referencia)</label>
                                <div style={{background: '#f1f5f9', padding: '10px', borderRadius: '6px', color: '#475569'}}>
                                    {localItem.descripcion || localItem.item}
                                </div>
                            </div>

                             {/* Toggle Activo (Mover aquí tiene sentido) */}
                             <div className="cm-form-group" style={{marginTop: '20px'}}>
                                <label className="cm-label">Estado de Publicación</label>
                                <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                                    <span className={`ge-badge ${localItem.ecommerce_active ? 'status-OK' : 'status-NO_EXISTE_WOO'}`}>
                                        {localItem.ecommerce_active ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                    {/* Aquí podrías agregar un toggle directo si pasas la función, pero por ahora es informativo o parte del guardado */}
                                </div>
                            </div>
                        </div>

                        {/* Columna Derecha: Imagen */}
                        <div>
                             <div className="cm-form-group">
                                <label className="cm-label">Imagen del Producto</label>
                                <div 
                                    className="cm-upload-box large"
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                                    onDragLeave={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.backgroundColor = '#f8fafc';
                                        onUploadImage(e.dataTransfer.files, (url) => setLocalItem({...localItem, image_url: url}));
                                    }}     
                                    onClick={() => document.getElementById('file-upload-modal').click()}  
                                >
                                    {localItem.image_url ? (
                                        <div style={{position: 'relative', width: '100%', height: '100%', display:'flex', justifyContent:'center'}}>
                                            <img src={localItem.image_url} alt="Preview" className="cm-upload-preview-large" />
                                            <div className="cm-upload-overlay">🔄 Cambiar Imagen</div>
                                        </div>
                                    ) : (
                                        <div style={{textAlign: 'center', padding: '40px'}}>
                                            <div style={{fontSize: '48px', marginBottom: '16px'}}>📷</div>
                                            <p style={{margin: 0, fontWeight: 600, color: '#475569'}}>Arrastra una imagen aquí</p>
                                            <p style={{fontSize: '0.8rem', color: '#94a3b8'}}>o haz clic para buscar</p>
                                        </div>
                                    )}
                                    <input 
                                        id="file-upload-modal"
                                        type="file" 
                                        accept="image/*" 
                                        style={{display: 'none'}} 
                                        onChange={(e) => onUploadImage(e.target.files, (url) => setLocalItem({...localItem, image_url: url}))}
                                        onClick={(e) => e.stopPropagation()} 
                                    />
                                </div>
                                
                                <div style={{marginTop: '10px'}}>
                                    <label className="cm-label-small">URL de la imagen:</label>
                                    <input 
                                        type="text" 
                                        className="cm-input"
                                        value={localItem.image_url || ''} 
                                        onChange={(e) => setLocalItem({...localItem, image_url: e.target.value})}
                                        placeholder="https://..."
                                        style={{fontSize: '0.8rem', color: '#64748b'}}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- PESTAÑA 2: CLASIFICACIÓN --- */}
            {activeTab === 'classification' && (
                <div className="cm-tab-content fade-in">
                    
                    {/* 1. SECCIÓN SUPERIOR: SUGERENCIAS Y RESUMEN */}
                    <div className="cm-classification-grid-top">
                        
                        {/* CARD 1: Sugerencia ERP */}
                        <div className="cm-info-card cm-card-erp">
                            <div className="cm-card-header">
                                <span style={{fontSize:'1.2em'}}>💡</span>
                                <span className="cm-card-label">Sugerencia ERP Siesa</span>
                            </div>
                            <div className="cm-card-body">
                                <div className="cm-data-row">
                                    <span className="cm-data-label">Grupo:</span>
                                    <span className="cm-data-value">{localItem.grupo || 'N/A'}</span>
                                </div>
                                <div className="cm-data-row">
                                    <span className="cm-data-label">Subgrupo:</span>
                                    <span className="cm-data-value">{localItem.subgrupo || 'N/A'}</span>
                                </div>
                                <div className="cm-data-row">
                                    <span className="cm-data-label">Marca:</span>
                                    <span className="cm-data-value">{localItem.marca || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {/* CARD 2: Selección Actual */}
                        <div className="cm-info-card cm-card-selection">
                            <div className="cm-card-header">
                                <span style={{fontSize:'1.2em'}}>🛒</span>
                                <span className="cm-card-label">Configuración Actual WooCommerce</span>
                            </div>
                            <div className="cm-card-body cm-badges-wrapper">
                                
                                {/* 1. GRUPOS (Padres) */}
                                {localItem.categories?.map(id => {
                                    const c = categories.find(cat => String(cat.id) === String(id));
                                    if(!c || c.parent !== 0) return null;
                                    return (
                                        <span key={id} className="cm-badge group">
                                            Grupo: {c.name}
                                            <button className="cm-badge-remove" onClick={() => setLocalItem(prev => ({ ...prev, categories: prev.categories.filter(x => String(x) !== String(id)) }))}>×</button>
                                        </span>
                                    );
                                })}

                                {/* 2. SUBGRUPOS (Hijos) */}
                                {localItem.categories?.map(id => {
                                    const c = categories.find(cat => String(cat.id) === String(id));
                                    if(!c || c.parent === 0) return null;
                                    return (
                                        <span key={id} className="cm-badge subgroup">
                                            Sub: {c.name}
                                            <button className="cm-badge-remove" onClick={() => setLocalItem(prev => ({ ...prev, categories: prev.categories.filter(x => String(x) !== String(id)) }))}>×</button>
                                        </span>
                                    );
                                })}

                                {/* 3. MARCAS */}
                                {localItem.brands?.map(id => {
                                    const b = tags.find(t => String(t.id) === String(id));
                                    return (
                                        <span key={id} className="cm-badge brand">
                                            Marca: {b?.name || id}
                                            <button className="cm-badge-remove" onClick={() => setLocalItem(prev => ({ ...prev, brands: prev.brands.filter(x => String(x) !== String(id)) }))}>×</button>
                                        </span>
                                    );
                                })}
                                {/* Tags */}
                                {localItem.tags?.map(id => {
                                    const t = tags.find(tag => String(tag.id) === String(id));
                                    return (
                                        <span key={id} className="cm-badge brand">
                                            Marca: {t?.name || id}
                                            <button className="cm-badge-remove" onClick={() => setLocalItem(prev => ({ ...prev, tags: prev.tags.filter(x => String(x) !== String(id)) }))}>×</button>
                                        </span>
                                    );
                                })}
                                
                                {(!localItem.brands?.length && !localItem.tags?.length && !localItem.categories?.length) && (
                                    <div className="cm-empty-state">
                                        ⚠️ Aún no has seleccionado nada. Usa las columnas de abajo.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. SECCIÓN INFERIOR: SELECTORES ORGANIZADOS */}
                    <div className="cm-grid-3-col">
                        
                        {/* COL 1: GRUPOS */}
                        <div className="cm-column-box">
                            <div className="cm-column-header">
                                <label>1. Grupos (Padres)</label>
                            </div>
                            <div className="cm-input-wrapper">
                                <input 
                                    type="text" className="cm-input search"
                                    placeholder="Buscar grupo..."
                                    value={groupSearch} onChange={e => setGroupSearch(e.target.value)}
                                />
                            </div>
                            <div className="cm-scroll-list large">
                                {groupCats
                                   .filter(c => c.name.toLowerCase().includes(groupSearch.toLowerCase()))
                                   .map(cat => (
                                    <label key={cat.id} className={`cm-list-item ${localItem.categories?.map(String).includes(String(cat.id)) ? 'selected' : ''}`}>
                                        <input 
                                          type="checkbox" value={cat.id}
                                          checked={localItem.categories?.map(String).includes(String(cat.id))}
                                          onChange={(e) => {
                                              const isChecked = e.target.checked;
                                              const catId = String(cat.id);
                                              setLocalItem(prev => {
                                                  const currentCats = prev.categories ? prev.categories.map(String) : [];
                                                  return { 
                                                      ...prev, 
                                                      categories: isChecked ? [...currentCats, catId] : currentCats.filter(id => id !== catId) 
                                                  };
                                              });
                                          }}
                                        />
                                        <div className="cm-list-item-content">
                                            <span className="cm-list-item-text">{cat.name}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* COL 2: SUBGRUPOS (AGRUPADOS) */}
                        <div className="cm-column-box">
                             <div className="cm-column-header">
                                <label>2. Subgrupos (Hijos)</label>
                            </div>
                            <div className="cm-input-wrapper">
                                <input 
                                    type="text" className="cm-input search"
                                    placeholder="Buscar subgrupo..."
                                    value={subGroupSearch} onChange={e => setSubGroupSearch(e.target.value)}
                                />
                            </div>
                            <div className="cm-scroll-list large">
                                {(() => {
                                    // Lógica de Agrupación Inline
                                    const filtered = subGroupCats.filter(c => c.name.toLowerCase().includes(subGroupSearch.toLowerCase()));
                                    const groups = {};
                                    filtered.forEach(cat => {
                                        const pid = cat.parent || 0;
                                        if(!groups[pid]) groups[pid] = [];
                                        groups[pid].push(cat);
                                    });
                                    
                                    const sortedGroupIds = Object.keys(groups).sort((a,b) => {
                                        const nameA = groupCats.find(g => String(g.id) === String(a))?.name || 'zz';
                                        const nameB = groupCats.find(g => String(g.id) === String(b))?.name || 'zz';
                                        return nameA.localeCompare(nameB);
                                    });

                                    if(sortedGroupIds.length === 0) return <div style={{padding:'20px', textAlign:'center', color:'#94a3b8'}}>No encontrados</div>;

                                    return sortedGroupIds.map(parentId => {
                                        const parentName = groupCats.find(p => String(p.id) === String(parentId))?.name || 'Otros';
                                        return (
                                            <div key={parentId}>
                                                <div className="cm-group-header">{parentName}</div>
                                                {groups[parentId].map(cat => (
                                                    <label key={cat.id} className={`cm-list-item ${localItem.categories?.map(String).includes(String(cat.id)) ? 'selected' : ''}`}>
                                                        <input 
                                                            type="checkbox" value={cat.id}
                                                            checked={localItem.categories?.map(String).includes(String(cat.id))}
                                                            onChange={(e) => {
                                                                const isChecked = e.target.checked;
                                                                const catId = String(cat.id);
                                                                setLocalItem(prev => {
                                                                    const currentCats = prev.categories ? prev.categories.map(String) : [];
                                                                    return { 
                                                                        ...prev, 
                                                                        categories: isChecked ? [...currentCats, catId] : currentCats.filter(id => id !== catId) 
                                                                    };
                                                                });
                                                            }}
                                                        />
                                                        <div className="cm-list-item-content">
                                                            <span className="cm-list-item-text">{cat.name}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>

                        {/* COL 3: MARCAS */}
                        <div className="cm-column-box">
                            <div className="cm-column-header">
                                <label>3. Marcas</label>
                                <button className="cm-link-btn" onClick={() => setShowTagInput(!showTagInput)}>
                                    {showTagInput ? 'Cancelar' : '+ Crear'}
                                </button>
                            </div>
                            
                            <div className="cm-input-wrapper">
                                {showTagInput ? (
                                <div className="cm-inline-create">
                                    <input 
                                        type="text" className="cm-input" autoFocus
                                        value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
                                        placeholder="Nombre nueva marca"
                                    />
                                    <button className="cm-btn cm-btn-primary small" onClick={internalCreateTag} disabled={savingTag}>OK</button>
                                </div>
                                ) : (
                                <input 
                                    type="text" className="cm-input search"
                                    placeholder="Buscar marca..."
                                    value={tagSearch} onChange={e => setTagSearch(e.target.value)}
                                />
                                )}
                            </div>

                            <div className="cm-scroll-list large">
                                {tags
                                  .filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                                  .sort((a,b) => a.name.localeCompare(b.name))
                                  .map(t => {
                                     const isBrand = t.taxonomy === 'brand';
                                     const isChecked = isBrand 
                                        ? (localItem.brands?.map(String).includes(String(t.id)))
                                        : (localItem.tags?.map(String).includes(String(t.id)));

                                     return (
                                    <div key={`${t.taxonomy}-${t.id}`} className={`cm-list-item-row ${isChecked ? 'selected' : ''}`}>
                                        <label className="cm-list-item-clickable">
                                            <input 
                                              type="radio" name="brand_tag" value={t.id}
                                              checked={!!isChecked}
                                              onChange={() => {
                                                  const val = String(t.id);
                                                  if (isBrand) {
                                                      setLocalItem(prev => ({...prev, brands: [val], tags: []}));
                                                  } else {
                                                      setLocalItem(prev => ({...prev, tags: [val], brands: []}));
                                                  }
                                              }}
                                            />
                                            <span className="cm-list-item-text">{t.name}</span>
                                        </label>
                                        <button className="cm-delete-icon-btn" onClick={(e) => { e.stopPropagation(); onDeleteTag(t.id); }} title="Eliminar del sistema">🗑️</button>
                                    </div>
                                  )})}
                            </div>
                        </div>

                    </div>
                </div>
            )}

        </div>

        {/* FOOTER */}
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose}>Cancelar / Cerrar</button>
          <button className="cm-btn cm-btn-primary large-btn" onClick={handleInternalSave} disabled={isSaving}>
            {isSaving ? '💾 Guardando...' : (localItem.isNew ? '✨ Crear Producto' : '💾 Guardar Cambios')}
          </button>
        </div>
      </div>
    </div>
  );
}
