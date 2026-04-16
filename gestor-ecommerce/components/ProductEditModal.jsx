import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  dataError,
  onFetchVariations,
  onUpdateVariationImage
}) {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'classification' | 'variations'
  const [localItem, setLocalItem] = useState(null);
  
  // Estados locales de búsqueda
  const [tagSearch, setTagSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [subGroupSearch, setSubGroupSearch] = useState("");
  
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Para el botón de guardar global

  // Estados para el panel de redimensionado
  const [pendingFile, setPendingFile] = useState(null);
  const [showResizePanel, setShowResizePanel] = useState(false);
  const [resizeEnabled, setResizeEnabled] = useState(true);
  const [resizeWidth, setResizeWidth] = useState(800);
  const [resizeHeight, setResizeHeight] = useState(800);
  const [resizeQuality, setResizeQuality] = useState(0.85);
  const [resizeFormat, setResizeFormat] = useState('webp');
  const [resizeBgColor, setResizeBgColor] = useState('#FFFFFF');
  const [resizePreviewUrl, setResizePreviewUrl] = useState(null);
  const [resizeName, setResizeName] = useState('');

  // Estado para URL Manual (Input controlado)
  const [manualUrl, setManualUrl] = useState("");

  // Estado para variaciones
  const [variations, setVariations] = useState([]);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variationsLoaded, setVariationsLoaded] = useState(false);

  // Ref para saber si es la primera vez que se abre (evita reset de tab al enriquecer con Woo)
  const prevProductId = useRef(null);
  const pendingCallbackRef = useRef(null);

  // Inicializar estado local al abrir
  useEffect(() => {
    if (product) {
      const productKey = product.woo_product_id || product.item;
      const isNewProduct = prevProductId.current !== productKey;

      setLocalItem(prev => {
        const base = isNewProduct ? product : { ...prev, ...product };
        return {
          ...base,
          categories: product.categories || prev?.categories || [],
          tags: product.tags || prev?.tags || [],
          brands: product.brands || prev?.brands || [],
          images: product.images && product.images.length > 0 
              ? product.images 
              : (prev?.images && prev.images.length > 0 ? prev.images : (product.image_url ? [product.image_url] : []))
        };
      });

      // Solo resetear tab cuando se abre un producto diferente
      if (isNewProduct) {
        setActiveTab('general');
        setVariations([]);
        setVariationsLoaded(false);
        prevProductId.current = productKey;
      }
    } else {
      prevProductId.current = null;
    }
  }, [product]);

  // Auto-cargar variaciones al detectar producto variable (DEBE estar antes del early return)
  const isVariable = localItem?.productType === 'variable';
  useEffect(() => {
    if (isVariable && localItem?.woo_product_id && onFetchVariations && !variationsLoaded) {
      // Inline load para evitar dependencia de función mutable
      setVariationsLoading(true);
      onFetchVariations(localItem.woo_product_id).then(res => {
        if (res.ok) {
          setVariations(res.data.map(v => ({
            id: v.id,
            attributes: v.attributes || [],
            image: v.image || null,
            price: v.regular_price || v.price || '',
            sku: v.sku || ''
          })));
        }
      }).catch(err => console.error('Error loading variations', err))
        .finally(() => { setVariationsLoading(false); setVariationsLoaded(true); });
    }
  }, [isVariable, localItem?.woo_product_id]);

  // ── UTILIDAD: redimensionar imagen con canvas (lógica igual a ConversorImagenes) ──
  const resizeImageFile = (file, w, h, q, fmt, bg) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        const scale = Math.min(w / img.width, h / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh);
        const mime = fmt === 'webp' ? 'image/webp' : fmt === 'png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob(blob => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('Error al convertir'));
        }, mime, q);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Error cargando imagen')); };
      img.src = objectUrl;
    });
  };

  // Intercepta cualquier selección de archivo y abre el panel de resize
  // suggestedName (opcional): nombre base pre-llenado en lugar del nombre del archivo
  const handleFileSelected = (file, callback, suggestedName) => {
    if (!file.type.startsWith('image/')) return alert("Solo imágenes");
    setPendingFile(file);
    pendingCallbackRef.current = callback;
    const url = URL.createObjectURL(file);
    setResizePreviewUrl(url);
    setResizeName(suggestedName || file.name.replace(/\.[^.]+$/, ''));
    setShowResizePanel(true);
  };

  const closeResizePanel = () => {
    setShowResizePanel(false);
    setPendingFile(null);
    if (resizePreviewUrl) { URL.revokeObjectURL(resizePreviewUrl); }
    setResizePreviewUrl(null);
    setResizeName('');
    pendingCallbackRef.current = null;
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    const finalName = (resizeName.trim().replace(/\s+/g, '-') || pendingFile.name.replace(/\.[^.]+$/, ''));
    let fileToUpload = pendingFile;
    if (resizeEnabled) {
      try {
        const blob = await resizeImageFile(pendingFile, resizeWidth, resizeHeight, resizeQuality, resizeFormat, resizeBgColor);
        fileToUpload = new File([blob], `${finalName}.${resizeFormat}`, { type: blob.type });
      } catch (err) {
        alert("Error al redimensionar: " + err.message);
        return;
      }
    } else {
      const ext = pendingFile.name.match(/\.[^.]+$/)?.[0] || '';
      if (finalName + ext !== pendingFile.name) {
        fileToUpload = new File([pendingFile], `${finalName}${ext}`, { type: pendingFile.type });
      }
    }
    onUploadImage([fileToUpload], pendingCallbackRef.current);
    closeResizePanel();
  };

  // ── Mapas O(1) para lookup instantáneo de categorías y tags ──
  const categoryMap = useMemo(() => {
    const m = new Map();
    categories.forEach(c => m.set(String(c.id), c));
    return m;
  }, [categories]);

  const tagMap = useMemo(() => {
    const m = new Map();
    tags.forEach(t => m.set(String(t.id), t));
    return m;
  }, [tags]);

  // ── Listas base (se recomputan solo cuando cambia `categories`) ──
  const groupCats = useMemo(
    () => categories.filter(c => c.parent === 0).sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );
  const subGroupCats = useMemo(
    () => categories.filter(c => c.parent !== 0).sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  // ── Grupos filtrados por búsqueda (se recomputan solo al escribir en el buscador) ──
  const filteredGroupCats = useMemo(
    () => groupCats.filter(c => c.name.toLowerCase().includes(groupSearch.toLowerCase())),
    [groupCats, groupSearch]
  );

  // ── Subgrupos agrupados por padre (se recomputan solo cuando cambia la búsqueda) ──
  const groupedSubCats = useMemo(() => {
    const filtered = subGroupCats.filter(c => c.name.toLowerCase().includes(subGroupSearch.toLowerCase()));
    const groups = {};
    filtered.forEach(cat => {
      const pid = String(cat.parent || 0);
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push(cat);
    });
    return Object.keys(groups)
      .sort((a, b) => {
        const nameA = categoryMap.get(a)?.name || 'zz';
        const nameB = categoryMap.get(b)?.name || 'zz';
        return nameA.localeCompare(nameB);
      })
      .map(parentId => ({
        parentId,
        parentName: categoryMap.get(parentId)?.name || 'Otros',
        items: groups[parentId],
      }));
  }, [subGroupCats, subGroupSearch, categoryMap]);

  // ── Tags filtrados por búsqueda ──
  const filteredTags = useMemo(
    () => tags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [tags, tagSearch]
  );

  // ── Helper toggle de categoría (estable entre renders) ──
  const toggleCategory = useCallback((catId) => {
    const id = String(catId);
    setLocalItem(prev => {
      const current = prev.categories ? prev.categories.map(String) : [];
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      return { ...prev, categories: next };
    });
  }, []);

  if (!localItem) return null;

  // Helper: obtener src de imagen (puede ser string o {id, src})
  const getImgSrc = (img) => typeof img === 'string' ? img : img?.src || '';

  const handleInternalSave = async () => {
      // 1. Si hay una URL escrita en el input manual y no se ha agregado, agregarla ahora.
      let itemToSave = { ...localItem };
      
      if (manualUrl && manualUrl.trim() !== "") {
          const urlToAdd = manualUrl.trim();
          // Evitar duplicados si ya está
          const currentImages = itemToSave.images || [];
          if (!currentImages.includes(urlToAdd)) {
              itemToSave.images = [...currentImages, urlToAdd];
          }
           // Limpiar input (opcional, pero buena práctica por si falla el save)
           setManualUrl("");
      }

      // Adjuntar variaciones pendientes para que CatalogManager las guarde
      const pendingVars = variations.filter(v => v._pendingUrl);
      if (pendingVars.length > 0) {
        itemToSave._pendingVariations = pendingVars.map(v => ({ id: v.id, src: v._pendingUrl }));
      }

      setIsSaving(true);
      await onSave(itemToSave);
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

  // --- VARIACIONES ---
  const handleVariationTab = () => {
    setActiveTab('variations');
  };

  const handleVarImageUpload = (varId, files) => {
    if (!files?.length) return;
    const file = files[0];
    // Usar el SKU propio de la variación como nombre sugerido
    const variation = variations.find(v => v.id === varId);
    const suggestedName = (variation?.sku || '').toLowerCase().replace(/\s+/g, '-') || String(varId);
    handleFileSelected(file, (url) => {
      setVariations(prev => prev.map(v => v.id === varId ? { ...v, image: { src: url }, _pendingUrl: url } : v));
    }, suggestedName);
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
                {isVariable && (
                  <button 
                    className={`cm-tab ${activeTab === 'variations' ? 'active' : ''}`}
                    onClick={handleVariationTab}
                  >
                    <span style={{fontSize: '1.2rem'}}>🔀</span> Variaciones
                  </button>
                )}
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
                <div key="tab-general" className="cm-tab-content fade-in">
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

                            {/* PUM (Precio por Unidad de Medida) */}
                            <div className="cm-form-group" style={{marginTop: '16px'}}>
                                <label className="cm-label">📐 PUM (Precio por Unidad de Medida)</label>
                                <p style={{fontSize: '0.78rem', color: '#64748b', marginBottom: '8px'}}>
                                    Se calcula automáticamente: Precio ÷ Cantidad = PUM por unidad.
                                </p>
                                <div style={{display: 'flex', gap: '10px', alignItems: 'flex-end'}}>
                                    <div style={{flex: 1}}>
                                        <label className="cm-label-small">Cantidad</label>
                                        <input 
                                            type="number"
                                            className="cm-input"
                                            value={localItem.pum_qty || ""}
                                            onChange={(e) => setLocalItem({...localItem, pum_qty: e.target.value})}
                                            placeholder="Ej: 250"
                                            min="0"
                                            step="any"
                                        />
                                    </div>
                                    <div style={{flex: 1}}>
                                        <label className="cm-label-small">Unidad</label>
                                        <select
                                            className="cm-input"
                                            value={localItem.pum_unit || ""}
                                            onChange={(e) => setLocalItem({...localItem, pum_unit: e.target.value})}
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            <option value="g">g (gramos)</option>
                                            <option value="kg">kg (kilogramos)</option>
                                            <option value="ml">ml (mililitros)</option>
                                            <option value="l">l (litros)</option>
                                            <option value="und">und (unidades)</option>
                                            <option value="m">m (metros)</option>
                                            <option value="cm">cm (centímetros)</option>
                                        </select>
                                    </div>
                                </div>
                                {localItem.pum_qty && localItem.pum_unit && (
                                    <div style={{
                                        marginTop: '8px', padding: '10px 14px', 
                                        background: '#f0fdf4', border: '1px solid #bbf7d0', 
                                        borderRadius: '8px', fontSize: '0.85rem', color: '#166534'
                                    }}>
                                        <div>✅ PUM activo: se mostrará el precio por <strong>{localItem.pum_unit}</strong> en la tienda.</div>
                                        {localItem.woo_price > 0 && Number(localItem.pum_qty) > 0 && (
                                            <div style={{
                                                marginTop: '8px', padding: '8px 12px',
                                                background: '#ecfdf5', borderRadius: '6px',
                                                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'
                                            }}>
                                                <span style={{fontSize: '0.8rem', color: '#6b7280'}}>Cálculo:</span>
                                                <span style={{fontWeight: 600}}>
                                                    ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(localItem.woo_price)}
                                                </span>
                                                <span style={{color: '#9ca3af'}}>÷</span>
                                                <span style={{fontWeight: 600}}>
                                                    {localItem.pum_qty} {localItem.pum_unit}
                                                </span>
                                                <span style={{color: '#9ca3af'}}>=</span>
                                                <span style={{
                                                    fontWeight: 700, fontSize: '1rem', color: '#059669',
                                                    background: '#d1fae5', padding: '2px 8px', borderRadius: '4px'
                                                }}>
                                                    ${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(localItem.woo_price / Number(localItem.pum_qty))}
                                                    /{localItem.pum_unit}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
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
                                <label className="cm-label">Galería de Imágenes ({localItem.images?.length || 0})</label>
                                
                                <div 
                                    className="cm-upload-box large"
                                    style={{ height: '100px', minHeight: '100px', padding: '10px', borderStyle: 'dashed' }}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                                    onDragLeave={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.backgroundColor = '#f8fafc';
                                        const file = e.dataTransfer.files?.[0];
                                        if (file) handleFileSelected(file, (url) => {
                                            setLocalItem(prev => ({...prev, images: [...(prev.images || []), url] }));
                                        }, (localItem?.item || '').toLowerCase());
                                    }}     
                                    onClick={() => document.getElementById('file-upload-modal').click()}  
                                >
                                    <div style={{textAlign: 'center', color: '#64748b'}}>
                                        <div style={{fontSize: '24px'}}>📷</div>
                                        <p style={{margin: '4px 0', fontSize: '0.9rem'}}>Click o Arrastra para AGREGAR</p>
                                    </div>
                                    <input 
                                        id="file-upload-modal"
                                        type="file" 
                                        accept="image/*" 
                                        style={{display: 'none'}} 
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) {
                                                const file = e.target.files[0];
                                                e.target.value = null;
                                                handleFileSelected(file, (url) => {
                                                    setLocalItem(prev => ({...prev, images: [...(prev.images || []), url] }));
                                                }, (localItem?.item || '').toLowerCase());
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()} 
                                    />
                                </div>
                                
                                {/* Tira de Miniaturas */}
                                {localItem.images && localItem.images.length > 0 && (
                                    <div style={{
                                        display: 'flex', gap: '8px', flexWrap: 'wrap', 
                                        marginTop: '12px', padding: '8px', 
                                        background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0'
                                    }}>
                                        {localItem.images.map((img, idx) => (
                                            <div key={idx} style={{position: 'relative', width: '70px', height: '70px', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
                                                <img src={getImgSrc(img)} alt={`img-${idx}`} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                                <button 
                                                    style={{
                                                        position: 'absolute', top: 0, right: 0, 
                                                        background: 'rgba(239, 68, 68, 0.9)', color: 'white', 
                                                        border: 'none', cursor: 'pointer', width: '20px', height: '20px',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                                                        lineHeight: '1px'
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLocalItem(prev => ({
                                                            ...prev, 
                                                            images: prev.images.filter((_, i) => i !== idx)
                                                        }));
                                                    }}
                                                    title="Eliminar"
                                                >
                                                    ×
                                                </button>
                                                {idx === 0 && (
                                                    <span style={{
                                                        position: 'absolute', bottom: 0, left: 0, right: 0, 
                                                        background: 'rgba(37, 99, 235, 0.85)', color: 'white', 
                                                        fontSize: '9px', textAlign: 'center', padding: '2px 0'
                                                    }}>
                                                        PORTADA
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div style={{marginTop: '10px'}}>
                                    <label className="cm-label-small">Agregar URL manual:</label>
                                    <div style={{display: 'flex', gap: '8px'}}>
                                        <input 
                                            type="text" 
                                            className="cm-input"
                                            value={manualUrl}
                                            onChange={(e) => setManualUrl(e.target.value)}
                                            placeholder="Pegar https://... y Enter"
                                            style={{fontSize: '0.8rem', color: '#64748b', flex: 1}}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && manualUrl) {
                                                    e.preventDefault();
                                                    setLocalItem(prev => ({...prev, images: [...(prev.images || []), manualUrl] }));
                                                    setManualUrl("");
                                                }
                                            }}
                                        />
                                        <button 
                                            className="cm-btn cm-btn-secondary small"
                                            onClick={() => {
                                                if(manualUrl) {
                                                    setLocalItem(prev => ({...prev, images: [...(prev.images || []), manualUrl] }));
                                                    setManualUrl("");
                                                }
                                            }}
                                            type="button"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- PESTAÑA 2: CLASIFICACIÓN --- */}
            {activeTab === 'classification' && (
                <div key="tab-classification" className="cm-tab-content fade-in">
                    
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
                                
                                {/* 1. GRUPOS (Padres) — lookup O(1) con categoryMap */}
                                {localItem.categories?.map(id => {
                                    const c = categoryMap.get(String(id));
                                    if (!c || c.parent !== 0) return null;
                                    return (
                                        <span key={id} className="cm-badge group">
                                            Grupo: {c.name}
                                            <button className="cm-badge-remove" onClick={() => toggleCategory(id)}>×</button>
                                        </span>
                                    );
                                })}

                                {/* 2. SUBGRUPOS (Hijos) — lookup O(1) */}
                                {localItem.categories?.map(id => {
                                    const c = categoryMap.get(String(id));
                                    if (!c || c.parent === 0) return null;
                                    return (
                                        <span key={id} className="cm-badge subgroup">
                                            Sub: {c.name}
                                            <button className="cm-badge-remove" onClick={() => toggleCategory(id)}>×</button>
                                        </span>
                                    );
                                })}

                                {/* 3. MARCAS — lookup O(1) con tagMap */}
                                {localItem.brands?.map(id => {
                                    const b = tagMap.get(String(id));
                                    return (
                                        <span key={id} className="cm-badge brand">
                                            Marca: {b?.name || id}
                                            <button className="cm-badge-remove" onClick={() => setLocalItem(prev => ({ ...prev, brands: prev.brands.filter(x => String(x) !== String(id)) }))}>×</button>
                                        </span>
                                    );
                                })}
                                {localItem.tags?.map(id => {
                                    const t = tagMap.get(String(id));
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
                        
                        {/* COL 1: GRUPOS — usa filteredGroupCats (ya memoizado) */}
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
                                {filteredGroupCats.map(cat => {
                                    const catId = String(cat.id);
                                    const isSelected = localItem.categories?.map(String).includes(catId);
                                    return (
                                        <label key={cat.id} className={`cm-list-item ${isSelected ? 'selected' : ''}`}>
                                            <input 
                                              type="checkbox" value={cat.id}
                                              checked={!!isSelected}
                                              onChange={() => toggleCategory(cat.id)}
                                            />
                                            <div className="cm-list-item-content">
                                                <span className="cm-list-item-text">{cat.name}</span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* COL 2: SUBGRUPOS — usa groupedSubCats (ya memoizado) */}
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
                                {groupedSubCats.length === 0
                                    ? <div style={{padding:'20px', textAlign:'center', color:'#94a3b8'}}>No encontrados</div>
                                    : groupedSubCats.map(({ parentId, parentName, items }) => (
                                        <div key={parentId}>
                                            <div className="cm-group-header">{parentName}</div>
                                            {items.map(cat => {
                                                const catId = String(cat.id);
                                                const isSelected = localItem.categories?.map(String).includes(catId);
                                                return (
                                                    <label key={cat.id} className={`cm-list-item ${isSelected ? 'selected' : ''}`}>
                                                        <input 
                                                            type="checkbox" value={cat.id}
                                                            checked={!!isSelected}
                                                            onChange={() => toggleCategory(cat.id)}
                                                        />
                                                        <div className="cm-list-item-content">
                                                            <span className="cm-list-item-text">{cat.name}</span>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        {/* COL 3: MARCAS — usa filteredTags (ya memoizado) */}
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
                                {filteredTags.map(t => {
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

            {/* --- PESTAÑA 3: VARIACIONES --- */}
            {activeTab === 'variations' && (
                <div key="tab-variations" className="cm-tab-content fade-in">
                    {variationsLoading ? (
                        <div style={{padding: '40px', textAlign: 'center', color: '#64748b'}}>
                            <div style={{fontSize: '2rem', marginBottom: '10px'}}>⏳</div>
                            Cargando variaciones...
                        </div>
                    ) : variations.length === 0 ? (
                        <div style={{padding: '40px', textAlign: 'center', color: '#94a3b8'}}>
                            <div style={{fontSize: '2rem', marginBottom: '10px'}}>📦</div>
                            No se encontraron variaciones para este producto.
                        </div>
                    ) : (
                        <div>
                            <p style={{fontSize: '0.85rem', color: '#64748b', marginBottom: '16px'}}>
                                Click en la imagen, en "📷 Cambiar" o <strong>arrastra una imagen</strong> encima de la variación.
                                Al presionar <strong>"Guardar Cambios"</strong> se sincronizará en todas las sedes.
                            </p>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                                {variations.map(v => {
                                    const attrLabel = v.attributes.map(a => a.option).join(' / ') || `Variación #${v.id}`;
                                    const imgSrc = v.image?.src || '';
                                    const hasPending = !!v._pendingUrl;

                                    return (
                                        <div key={v.id}
                                            className={`cm-var-row${hasPending ? ' pending' : ''}`}
                                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                                            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.classList.remove('drag-over');
                                                const file = e.dataTransfer.files?.[0];
                                                if (file) handleVarImageUpload(v.id, [file]);
                                            }}
                                        >
                                            {/* Imagen */}
                                            <div className="cm-var-img-wrap"
                                                onClick={() => document.getElementById(`var-upload-${v.id}`).click()}
                                            >
                                                {imgSrc ? (
                                                    <img src={imgSrc} alt={attrLabel} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                                ) : (
                                                    <div className="cm-var-img-empty">📷</div>
                                                )}
                                                <input
                                                    id={`var-upload-${v.id}`}
                                                    type="file" accept="image/*" style={{display: 'none'}}
                                                    onChange={(e) => {
                                                        if (e.target.files?.length) handleVarImageUpload(v.id, e.target.files);
                                                        e.target.value = null;
                                                    }}
                                                />
                                            </div>

                                            {/* Info */}
                                            <div style={{flex: 1, minWidth: 0}}>
                                                <div style={{fontWeight: 600, fontSize: '0.95rem', color: '#1e293b'}}>
                                                    {attrLabel}
                                                </div>
                                                <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginTop: '3px'}}>
                                                    {v.sku && <span style={{fontSize: '0.75rem', color: '#94a3b8'}}>SKU: {v.sku}</span>}
                                                    {v.price && <span style={{fontSize: '0.82rem', color: '#059669', fontWeight: 500}}>
                                                        ${Number(v.price).toLocaleString('es-CO')}
                                                    </span>}
                                                </div>
                                                {hasPending && (
                                                    <div style={{fontSize: '0.75rem', color: '#d97706', marginTop: '3px', fontWeight: 500}}>
                                                        ● Imagen nueva — se guardará con "Guardar Cambios"
                                                    </div>
                                                )}
                                                <div style={{fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px'}}>
                                                    🖱 Click o arrastra aquí
                                                </div>
                                            </div>

                                            {/* Botón cambiar */}
                                            <button
                                                className="cm-btn cm-btn-secondary small"
                                                onClick={() => document.getElementById(`var-upload-${v.id}`).click()}
                                                style={{fontSize: '0.78rem', whiteSpace: 'nowrap', flexShrink: 0}}
                                            >
                                                📷 Cambiar
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            {variations.some(v => v._pendingUrl) && (
                                <div style={{
                                    marginTop: '14px', padding: '10px 14px', background: '#fef3c7',
                                    borderRadius: '8px', fontSize: '0.82rem', color: '#92400e',
                                    border: '1px solid #fde68a'
                                }}>
                                    ⚠️ Tienes {variations.filter(v => v._pendingUrl).length} imagen(es) pendiente(s). Presiona <strong>"Guardar Cambios"</strong> para aplicar.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

        </div>

        {/* PANEL DE REDIMENSIONADO */}
        {showResizePanel && (
          <div className="cm-resize-overlay">
            <div className="cm-resize-panel">
              <div className="cm-resize-panel-header">
                <h4>📐 Ajustar imagen antes de subir</h4>
                <button className="cm-close-btn" onClick={closeResizePanel}>×</button>
              </div>
              <div className="cm-resize-panel-body">
                <div className="cm-resize-preview-col">
                  {resizePreviewUrl && (
                    <img src={resizePreviewUrl} alt="preview" className="cm-resize-preview-img" />
                  )}
                  <p className="cm-resize-preview-size">
                    {pendingFile
                      ? pendingFile.size < 1048576
                        ? `${(pendingFile.size / 1024).toFixed(1)} KB`
                        : `${(pendingFile.size / 1048576).toFixed(1)} MB`
                      : ''}
                  </p>
                  <div className="cm-resize-name-group">
                    <label>Nombre del archivo</label>
                    <div className="cm-resize-name-row">
                      <input
                        type="text"
                        className="cm-input"
                        value={resizeName}
                        onChange={(e) => setResizeName(e.target.value)}
                        placeholder="nombre-imagen"
                        style={{fontSize: '0.8rem'}}
                      />
                      <span className="cm-resize-ext">.{resizeEnabled ? resizeFormat : (pendingFile?.name.match(/\.[^.]+$/)?.[0]?.slice(1) || 'img')}</span>
                    </div>
                  </div>
                </div>
                <div className="cm-resize-options-col">
                  <div className="cm-resize-toggle-row">
                    <label className="cm-resize-radio">
                      <input type="radio" checked={resizeEnabled} onChange={() => setResizeEnabled(true)} />
                      Redimensionar imagen
                    </label>
                    <label className="cm-resize-radio">
                      <input type="radio" checked={!resizeEnabled} onChange={() => setResizeEnabled(false)} />
                      Subir sin cambios
                    </label>
                  </div>
                  {resizeEnabled && (
                    <div className="cm-resize-fields">
                      <div className="cm-resize-row">
                        <div className="cm-resize-field">
                          <label>Ancho (px)</label>
                          <input type="number" value={resizeWidth} min={1} max={4096}
                            className="cm-input" onChange={(e) => setResizeWidth(+e.target.value || 800)} />
                        </div>
                        <div className="cm-resize-field">
                          <label>Alto (px)</label>
                          <input type="number" value={resizeHeight} min={1} max={4096}
                            className="cm-input" onChange={(e) => setResizeHeight(+e.target.value || 800)} />
                        </div>
                      </div>
                      <div className="cm-resize-row">
                        <div className="cm-resize-field">
                          <label>Formato</label>
                          <select value={resizeFormat} onChange={(e) => setResizeFormat(e.target.value)} className="cm-input">
                            <option value="webp">WebP</option>
                            <option value="jpeg">JPEG</option>
                            <option value="png">PNG</option>
                          </select>
                        </div>
                        <div className="cm-resize-field">
                          <label>Calidad ({Math.round(resizeQuality * 100)}%)</label>
                          <input type="range" min={0.1} max={1} step={0.05} value={resizeQuality}
                            onChange={(e) => setResizeQuality(+e.target.value)} />
                        </div>
                      </div>
                      <div className="cm-resize-row">
                        <div className="cm-resize-field">
                          <label>Color de fondo</label>
                          <input type="color" value={resizeBgColor} onChange={(e) => setResizeBgColor(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="cm-resize-panel-footer">
                <button className="cm-btn cm-btn-secondary" onClick={closeResizePanel}>Cancelar</button>
                <button className="cm-btn cm-btn-primary" onClick={confirmUpload}>
                  {resizeEnabled
                    ? `⬆ Redimensionar y subir (${resizeWidth}×${resizeHeight} ${resizeFormat.toUpperCase()})`
                    : '⬆ Subir imagen original'}
                </button>
              </div>
            </div>
          </div>
        )}

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
