import React, { useState, useEffect } from "react";
import { fetchCatalog, toggleProduct, adoptWooProducts, updateWooProduct, createWooProduct, uploadImage, fetchCategories, createCategory, fetchTags, createTag, deleteTag, fetchProductDetail } from "./services";
import "./GestorEcommerce.css";
import "./components/CatalogManager.css";
import ProductEditModal from "./components/ProductEditModal";

export default function CatalogManager() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState('all'); // all, active, unlinked, no_image
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [dataError, setDataError] = useState(null);

  // Search Logic
  const [exactSearchTriggered, setExactSearchTriggered] = useState(false);

  // Edit State
  const [editingItem, setEditingItem] = useState(null); 
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Categorías y Etiquetas (Globales para pasar al modal)
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatParent, setNewCatParent] = useState(0); 
  const [creatingCat, setCreatingCat] = useState(false);

  // --- CARGA DE DATOS ---
  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetchCatalog();
      if (res.ok) setData(res.data);
    } catch (error) {
      console.error("Error loading catalog", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetchCategories();
      if (res.ok) {
        setCategories(res.data);
        setDataError(null);
      } else {
        console.error("Error categories:", res.message);
        setDataError("Error conectando con WooCommerce/Categorías. Verifique credenciales.");
      }
    } catch (error) {
      console.error("Error loading categories", error);
    }
  };

  const loadTags = async () => {
    try {
      const res = await fetchTags();
      if (res.ok) {
        setTags(res.data);
      } else {
         if(!dataError) setDataError("Error conectando con WooCommerce/Tags.");
      }
    } catch (error) {
      console.error("Error loading tags", error);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadCategories();
    loadTags();
  }, []);

  // --- ACCIONES ---
  const handleSync = async () => {
    if (!window.confirm("¿Sincronizar estados desde WooCommerce?")) return;
    setSyncing(true);
    try {
      const res = await adoptWooProducts();
      if (res.ok) {
        loadCatalog();
        alert(`Sincronización completada.`);
      } else {
        alert("Hubo un problema con la sincronización");
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión");
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (item, currentStatus) => {
    const newData = [...data];
    const targetIndex = newData.findIndex(d => d.item === item);
    if (targetIndex === -1) return;
    
    // Optimistic
    newData[targetIndex].ecommerce_active = !currentStatus;
    setData(newData);

    try {
      const res = await toggleProduct(item, !currentStatus);
      if (!res.ok) {
        newData[targetIndex].ecommerce_active = currentStatus;
        setData(newData);
        alert("Error al actualizar estado");
      }
    } catch (error) {
       newData[targetIndex].ecommerce_active = currentStatus;
       setData(newData);
    }
  };

  const openEdit = async (row) => {
    // Si no existe en Woo, abrimos en modo "Creación"
    const isNew = !row.exists_in_woo;
    
    // Set initial
    const initialData = {
      ...row,
      name: row.ecommerce_name ? row.ecommerce_name : row.descripcion, // Usar nombre ecommerce si existe
      image_url: row.image_url || "",
      categories: [], tags: [], brands: [],
      isNew // Flag para el modal
    };
    
    setEditingItem(initialData);

    // Si ya existe, traemos detalles frescos
    if (!isNew) {
        try {
            const res = await fetchProductDetail(row.woo_product_id);
            if (res.ok && res.data) {
                const wooCats = res.data.categories ? res.data.categories.map(c => String(c.id)) : [];
                const wooTags = res.data.tags ? res.data.tags.map(t => String(t.id)) : [];
                const wooBrands = res.data.brands ? res.data.brands.map(b => String(b.id)) : [];
                
                // Mapeo de imagenes (Array de URLs)
                const wooImages = res.data.images ? res.data.images.map(img => img.src) : [];

                setEditingItem(prev => ({
                    ...prev,
                    categories: wooCats,
                    tags: wooTags,
                    brands: wooBrands,
                    name: res.data.name || prev.name,
                    image_url: res.data.images?.[0]?.src || prev.image_url, // Mantenemos compatibilidad legacy
                    images: wooImages.length > 0 ? wooImages : (prev.image_url ? [prev.image_url] : []), // Nuevo Array
                    ecommerce_active: res.data.status === 'publish'
                }));
            }
        } catch (error) {
            console.error("Error fetching detail", error);
        }
    }
  };

  // --- HANDLERS PARA EL MODAL NUEVO ---
  const handleSaveProduct = async (modifiedItem) => {
      try {
        let res;
        
        // Preparar payload de imágenes
        // Prioridad: modifiedItem.images (array) > modifiedItem.image_url (string legacy)
        const finalImages = modifiedItem.images && modifiedItem.images.length > 0 
            ? modifiedItem.images 
            : (modifiedItem.image_url ? [modifiedItem.image_url] : []);

        if (modifiedItem.isNew) {
            // CREAR
            res = await createWooProduct({
                name: modifiedItem.name,
                sku: modifiedItem.item, 
                description: modifiedItem.descripcion, 
                price: modifiedItem.precio_1 || 0,
                stock_quantity: modifiedItem.existencia || 0,
                images: finalImages, // Enviamos Array
                // image_url: ... (Ya no es necesario si el backend soporta 'images')
                categories: modifiedItem.categories,
                tags: modifiedItem.tags,
                brands: modifiedItem.brands
            });
        } else {
            // ACTUALIZAR
            res = await updateWooProduct(modifiedItem.woo_product_id, {
                name: modifiedItem.name, 
                images: finalImages, // Enviamos Array
                categories: modifiedItem.categories, 
                tags: modifiedItem.tags,
                brands: modifiedItem.brands 
            });
        }

        if (res.ok) {
            // Actualizar tabla localmente para reflejar cambios (especialmente si se creó)
            alert(modifiedItem.isNew ? "Producto CREADO correctamente en WooCommerce" : "Producto ACTUALIZADO correctamente");
            
            // ACTUALIZACION OPTIMISTA LOCAL
            setData(prevData => prevData.map(d => {
                // Imagen principal para la tabla (la primera del array)
                const mainImage = finalImages.length > 0 ? finalImages[0] : "";

                // Caso: CREACIÓN (Buscamos por item/SKU)
                if (modifiedItem.isNew && d.item === modifiedItem.item) {
                    return {
                        ...d,
                        exists_in_woo: true,
                        woo_product_id: res.data?.id, 
                        ecommerce_active: true,
                        ecommerce_name: modifiedItem.name,
                        image_url: mainImage
                    };
                }
                // Caso: EDICIÓN (Buscamos por Woo ID)
                if (!modifiedItem.isNew && d.woo_product_id === modifiedItem.woo_product_id) {
                    return {
                         ...d,
                         ecommerce_name: modifiedItem.name,
                         image_url: mainImage
                    };
                }
                return d;
            }));

            setEditingItem(null);
        } else {
            alert("Error al guardar: " + res.message);
        }
      } catch (e) {
         console.error(e);
         alert("Error guardando cambios (Red)");
      }
  };

  const handleUploadImage = async (files, updateCallback) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return alert("Solo imágenes");

    try {
        const res = await uploadImage(file);
        if (res.url && updateCallback) {
            updateCallback(res.url);
        }
    } catch (error) {
        alert("Error subiendo imagen");
    }
  };

  const handleCreateTag = async (tagName) => {
      try {
          const res = await createTag({ name: tagName });
          if(res.ok) {
              await loadTags(); // Refresh list
              return true;
          } else {
              alert("Error creando marca: " + res.message);
              return false;
          }
      } catch (e) {
          alert("Error de red");
          return false;
      }
  };

  const handleDeleteTag = async (id) => {
      if(!window.confirm("¿Seguro que deseas eliminar esta MARCA del sistema? Se quitará de todos los productos.")) return false;
      try {
          const res = await deleteTag(id);
          if (res.ok) {
              await loadTags();
              return true;
          } else {
              alert("No se pudo eliminar: " + res.message);
              return false;
          }
      } catch (e) {
          alert("Error eliminando tag");
          return false;
      }
  };

  const handleCreateCategory = async () => {
    if(!newCatName.trim()) return;
    setCreatingCat(true);
    try {
        const res = await createCategory({ name: newCatName, parent: Number(newCatParent) });
        if(res.ok) {
            setNewCatName(""); setNewCatParent(0);
            loadCategories();
            alert("Categoría creada con éxito");
        }
    } catch (e) { alert("Error creando categoría"); }
    finally { setCreatingCat(false); }
  };

  // --- FILTRADO Y PAGINACIÓN ---
  const filteredData = data.filter(row => {
    let matchSearch = false;
    
    // Si se presionó ENTER y hay texto, buscar EXACTAMENTE por Item/SKU
    if (exactSearchTriggered && search.trim() !== "") {
        matchSearch = String(row.item).trim() === search.trim();
    } else {
        // Busqueda parcial (comportamiento default)
        matchSearch = row.descripcion?.toLowerCase().includes(search.toLowerCase()) || row.item?.includes(search);
    }
    
    if (!matchSearch) return false;
    if (filterType === 'active') return row.ecommerce_active;
    if (filterType === 'unlinked') return !row.exists_in_woo;
    if (filterType === 'no_image') return !row.image_url;
    return true;
  });

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

  // --- RENDER ---
  return (
    <div>
      <div className="ge-header">
        <div className="ge-title">
          <h2>Gestor de Catálogo</h2>
          <p>Activa productos y asigna categorías</p>
        </div>

        <div className="ge-controls">
          <button className="ge-button" onClick={() => setShowCategoryModal(true)} style={{backgroundColor: '#8b5cf6', borderColor: '#7c3aed'}}>
            📂 Categorías
          </button>
          
          <button className="ge-button secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? "⏳ Sincronizando..." : "🔄 Sincronizar"}
          </button>

          <input 
            className="ge-input" type="text" placeholder="Buscar..." 
            value={search} 
            onChange={(e) => { 
                setSearch(e.target.value); 
                setPage(1); 
                setExactSearchTriggered(false); // Al escribir, volver a modo "sugerencias"
            }}
            onKeyDown={(e) => {
                if(e.key === 'Enter') {
                    setExactSearchTriggered(true); // Al dar Enter, activar modo "exacto"
                }
            }}
            style={{width: '250px'}}
          />
        </div>
      </div>

      <div style={{display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap'}}>
        <div className={`ge-card ge-stat-card ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>
          <h3>Total Items</h3> <p>{data.length}</p>
        </div>
        <div className={`ge-card ge-stat-card ${filterType === 'active' ? 'active' : ''}`} onClick={() => setFilterType('active')}>
          <h3 style={{color: '#2563eb'}}>Activos Woo</h3> <p>{data.filter(d => d.ecommerce_active).length}</p>
        </div>
        <div className={`ge-card ge-stat-card ${filterType === 'unlinked' ? 'active' : ''}`} onClick={() => setFilterType('unlinked')}>
          <h3 style={{color: '#d97706'}}>⚠️ Sin Vincular</h3> <p>{data.filter(d => !d.exists_in_woo).length}</p>
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
                         <img src={row.image_url} alt="product" style={{width:'50px', height:'50px', objectFit:'contain', borderRadius:'4px', border:'1px solid #eee'}} />
                      ) : ( <div style={{width:'50px', height:'50px', background:'#f3f4f6', borderRadius:'4px', display:'flex', alignItems:'center', justifyContent:'center'}}>📷</div> )}
                    </td>
                    <td>
                      <div style={{fontWeight: 600, color: '#111827'}}>{row.item}</div>
                      {!row.exists_in_woo && <div style={{fontSize:'0.75rem', color:'#d97706', fontWeight: 600}}>⚠️ Sin vincular</div>}
                    </td>
                    <td><div style={{fontWeight: 500}}>{row.ecommerce_name || row.descripcion}</div></td>
                    <td>
                      <div style={{fontSize: '0.85rem', color: '#6b7280'}}>
                        {row.subgrupo} <br/> <span style={{color: '#9ca3af'}}>{row.marca}</span>
                      </div>
                    </td>
                    <td className="text-center">
                       {row.ecommerce_active ? <span className="ge-badge status-OK">Publicado</span> : <span className="ge-badge status-NO_EXISTE_WOO">Inactivo</span>}
                    </td>
                    <td className="text-center">
                       {/* Toggle simple */}
                       <label style={{position: 'relative', display: 'inline-block', width: '44px', height: '24px'}}>
                        <input type="checkbox" checked={row.ecommerce_active} onChange={() => handleToggle(row.item, row.ecommerce_active)} style={{opacity: 0, width: 0, height: 0}} />
                        <span style={{position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: row.ecommerce_active ? '#2563eb' : '#ccc', transition: '.4s', borderRadius: '34px'}}>
                          <span style={{position: 'absolute', content: '""', height: '18px', width: '18px', left: row.ecommerce_active ? '22px' : '4px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%'}}></span>
                        </span>
                      </label>
                      <button className={`ge-button ${!row.exists_in_woo ? 'primary' : 'secondary'}`} style={{marginLeft: '10px', padding: '4px 8px'}} onClick={() => openEdit(row)}>
                        {!row.exists_in_woo ? '➕ Crear' : '✏️'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Paginación simple */}
      <div style={{marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <button disabled={page===1} onClick={() => setPage(p=>p-1)} className="ge-btn">Anterior</button>
          <span>Página {page} de {totalPages || 1}</span>
          <button disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} className="ge-btn">Siguiente</button>
      </div>

      {/* Modal Categorías Rápido (Legacy pero útil) */}
      {showCategoryModal && (
          <div className="ge-modal-overlay">
            <div className="ge-modal">
              <h3>Gestión de Categorías</h3>
              <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
                 <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Nueva Categoría" className="ge-input" />
                 <select value={newCatParent} onChange={(e) => setNewCatParent(e.target.value)} className="ge-select">
                    <option value={0}>Raíz (Grupo)</option>
                    {categories.filter(c=>c.parent===0).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                 </select>
                 <button onClick={handleCreateCategory} disabled={creatingCat} className="ge-button primary">+</button>
              </div>
              <button className="ge-button secondary" onClick={() => setShowCategoryModal(false)}>Cerrar</button>
            </div>
          </div>
      )}

      {/* NUEVO MODAL DE EDICIÓN IMPORTADO */}
      {editingItem && (
          <ProductEditModal 
            product={editingItem}
            categories={categories}
            tags={tags}
            onClose={() => setEditingItem(null)}
            onSave={handleSaveProduct}
            onUploadImage={handleUploadImage}
            onCreateTag={handleCreateTag}
            onDeleteTag={handleDeleteTag}
            dataError={dataError}
          />
      )}

    </div>
  );
}
