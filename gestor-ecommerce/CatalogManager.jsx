import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { fetchCatalog, toggleProduct, adoptWooProducts, updateWooProduct, createWooProduct, uploadImage, fetchCategories, fetchTags, createTag, deleteTag, fetchProductDetail, fetchVariations, updateVariationImage } from "./services";
import "./GestorEcommerce.css";
import "./components/CatalogManager.css";
import ProductEditModal from "./components/ProductEditModal";

// ══════════════════════════════════════════════
// SUB-COMPONENTES MEMOIZADOS (evitan re-renders)
// ══════════════════════════════════════════════

const ProductImage = memo(({ src }) => {
  if (src) return <img src={src} alt="" loading="lazy" className="cm-product-img" />;
  return <div className="cm-product-img-placeholder">📷</div>;
});

const SedeBadges = memo(({ sedes, activeSedes, sedeShortNames }) => {
  const hasActive = activeSedes && Object.values(activeSedes).some(v => v === true);
  if (!hasActive) return <span className="cm-text-muted">—</span>;
  return (
    <div className="cm-sede-badges">
      {sedes.map(s => {
        const isOn = activeSedes?.[s.codigo_siesa] === true;
        return (
          <span key={s.codigo_siesa} title={s.nombre}
            className={`cm-sede-badge ${isOn ? 'on' : 'off'}`}>
            {sedeShortNames[s.codigo_siesa] || s.codigo_siesa}
          </span>
        );
      })}
    </div>
  );
});

const ToggleSwitch = memo(({ checked, disabled, onChange }) => (
  <label className={`cm-toggle ${disabled ? 'disabled' : ''}`}>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    <span className={`cm-toggle-track ${checked ? 'on' : ''}`}>
      <span className="cm-toggle-thumb" />
    </span>
  </label>
));

const ProductRow = memo(({ row, currentSede, sedes, sedeShortNames, onToggle, onEdit }) => {
  const isActiveInSede = row.active_sedes?.[currentSede] === true;
  return (
    <tr className={!row.exists_in_woo ? "ge-row-warning" : ""}>
      <td><ProductImage src={row.image_url} /></td>
      <td>
        <div className="cm-sku">{row.item}</div>
        {!row.exists_in_woo && <div className="cm-unlinked-badge">⚠️ Sin vincular</div>}
      </td>
      <td><div className="cm-desc">{row.ecommerce_name || row.descripcion}</div></td>
      <td>
        {row.exists_in_woo && (row.woo_category_names || row.woo_tag_names) ? (
          <div className="cm-cat-info">
            {row.woo_category_names || 'Sin categoría'}
            {row.woo_tag_names && <span className="cm-tag-info">{row.woo_tag_names}</span>}
          </div>
        ) : (
          <div className="cm-cat-info-siesa">
            {row.subgrupo}
            {row.marca && <span className="cm-tag-info">{row.marca}</span>}
          </div>
        )}
      </td>
      <td className="text-center">
        <span className={`ge-badge ${isActiveInSede ? 'status-OK' : 'status-NO_EXISTE_WOO'}`}>
          {isActiveInSede ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="text-center">
        <SedeBadges sedes={sedes} activeSedes={row.active_sedes} sedeShortNames={sedeShortNames} />
      </td>
      <td className="text-center cm-actions-cell">
        <ToggleSwitch
          checked={isActiveInSede}
          disabled={!row.exists_in_woo}
          onChange={() => onToggle(row.item, isActiveInSede)}
        />
        <button
          className={`ge-btn ${!row.exists_in_woo ? 'primary' : 'secondary'} cm-edit-btn`}
          onClick={() => onEdit(row)}
        >
          {!row.exists_in_woo ? '➕' : '✏️'}
        </button>
      </td>
    </tr>
  );
});

// ══════════════════════════════════════════════
// COMPONENTE PRINCIPAL OPTIMIZADO
// ══════════════════════════════════════════════

export default function CatalogManager({ sedeInfo, sedes = [] }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({ total: 0, active: 0, unlinked: 0, no_image: 0 });
  const [dataError, setDataError] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);

  // Refs para evitar cascadas y race conditions
  const searchTimer = useRef(null);
  const loadId = useRef(0);
  const sedeCache = useRef(new Map()); // Caché por sede+filtro+search+page
  const metaLoaded = useRef(false);

  const currentSede = sedeInfo?.codigo_siesa || "PV001";

  const sedeShortNames = useMemo(() => {
    const map = {};
    sedes.forEach(s => {
      const parts = s.nombre.split(' ');
      map[s.codigo_siesa] = parts[parts.length - 1];
    });
    return map;
  }, [sedes]);

  // ── Clave de caché ──
  const makeCacheKey = useCallback((p, s, f) => `${currentSede}|${f}|${s}|${p}`, [currentSede]);

  // ── CARGA PRINCIPAL (con caché por sede) ──
  const loadCatalog = useCallback(async (p, s, f, exact = false) => {
    const key = makeCacheKey(p, s, f);

    // Si hay hit de caché y no es búsqueda exacta → render instantáneo
    if (!exact && sedeCache.current.has(key)) {
      const cached = sedeCache.current.get(key);
      setData(cached.data);
      setTotalPages(cached.totalPages);
      if (cached.counts) setCounts(cached.counts);
      return;
    }

    const thisLoadId = ++loadId.current;
    setLoading(true);

    try {
      const res = await fetchCatalog({ page: p, pageSize, search: s, filter: f, exactSearch: exact, sede: currentSede });
      if (thisLoadId !== loadId.current) return; // Descartar respuesta vieja

      if (res.ok) {
        setData(res.data);
        setTotalPages(res.totalPages || 1);
        if (res.counts) setCounts(res.counts);

        // Guardar en caché (máx 50 entradas)
        if (sedeCache.current.size > 50) {
          const firstKey = sedeCache.current.keys().next().value;
          sedeCache.current.delete(firstKey);
        }
        sedeCache.current.set(key, { data: res.data, totalPages: res.totalPages || 1, counts: res.counts });
      }
    } catch (error) {
      if (thisLoadId === loadId.current) console.error("Error loading catalog", error);
    } finally {
      if (thisLoadId === loadId.current) setLoading(false);
    }
  }, [currentSede, pageSize, makeCacheKey]);

  // ── Metadata: categorías + tags (una sola vez) ──
  const loadMeta = useCallback(async () => {
    if (metaLoaded.current) return;
    metaLoaded.current = true;
    try {
      const [catRes, tagRes] = await Promise.all([fetchCategories(), fetchTags()]);
      if (catRes.ok) setCategories(catRes.data);
      else setDataError("Error conectando con WooCommerce/Categorías.");
      if (tagRes.ok) setTags(tagRes.data);
    } catch (e) {
      console.error("Error loading meta", e);
    }
  }, []);

  // ── Mount ──
  useEffect(() => {
    loadCatalog(1, "", "all");
    loadMeta();
  }, []);

  // ── Cambio de sede → reset + cargar (instantáneo si está en caché) ──
  useEffect(() => {
    setPage(1);
    setFilterType('all');
    setSearch("");
    loadCatalog(1, "", "all");
  }, [currentSede]);

  // ── Invalidar caché al hacer cambios ──
  const invalidateCache = useCallback(() => { sedeCache.current.clear(); }, []);

  // ── Handlers directos (sin useEffects encadenados) ──
  const handleFilterClick = useCallback((f) => {
    if (f === filterType) return;
    setFilterType(f);
    setPage(1);
    loadCatalog(1, search, f);
  }, [filterType, search, loadCatalog]);

  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    loadCatalog(newPage, search, filterType);
  }, [search, filterType, loadCatalog]);

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadCatalog(1, val, filterType);
    }, 400);
  }, [filterType, loadCatalog]);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      setPage(1);
      loadCatalog(1, search, filterType);
    }
  }, [search, filterType, loadCatalog]);

  // ── ACCIONES ──
  const handleSync = useCallback(async () => {
    if (!window.confirm("¿Sincronizar estados desde WooCommerce?")) return;
    setSyncing(true);
    try {
      const res = await adoptWooProducts();
      if (res.ok) {
        invalidateCache();
        setPage(1);
        await loadCatalog(1, search, filterType);
        alert("Sincronización completada.");
      } else {
        alert("Hubo un problema con la sincronización");
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión");
    } finally {
      setSyncing(false);
    }
  }, [search, filterType, loadCatalog, invalidateCache]);

  const handleToggle = useCallback(async (item, currentStatus) => {
    // Optimistic update inmutable
    setData(prev => {
      const idx = prev.findIndex(d => d.item === item);
      if (idx === -1) return prev;
      const updated = [...prev];
      const row = { ...updated[idx] };
      row.active_sedes = { ...(row.active_sedes || {}), [currentSede]: !currentStatus };
      row.ecommerce_active = Object.values(row.active_sedes).some(v => v === true);
      updated[idx] = row;
      return updated;
    });
    // Actualizar contador optimistamente
    setCounts(prev => ({
      ...prev,
      active: prev.active + (!currentStatus ? 1 : -1)
    }));

    try {
      const res = await toggleProduct(item, !currentStatus, currentSede);
      if (!res.ok) {
        setData(prev => {
          const idx = prev.findIndex(d => d.item === item);
          if (idx === -1) return prev;
          const updated = [...prev];
          const row = { ...updated[idx] };
          row.active_sedes = { ...(row.active_sedes || {}), [currentSede]: currentStatus };
          row.ecommerce_active = Object.values(row.active_sedes).some(v => v === true);
          updated[idx] = row;
          return updated;
        });
        alert("Error al actualizar estado");
        // Revertir contador
        setCounts(prev => ({ ...prev, active: prev.active + (currentStatus ? 1 : -1) }));
      } else {
        if (res.active_sedes) {
          setData(prev => prev.map(d => d.item === item ? { ...d, active_sedes: res.active_sedes, ecommerce_active: Object.values(res.active_sedes).some(v => v === true) } : d));
        }
        invalidateCache();
      }
    } catch {
      setData(prev => {
        const idx = prev.findIndex(d => d.item === item);
        if (idx === -1) return prev;
        const updated = [...prev];
        const row = { ...updated[idx] };
        row.active_sedes = { ...(row.active_sedes || {}), [currentSede]: currentStatus };
        row.ecommerce_active = Object.values(row.active_sedes).some(v => v === true);
        updated[idx] = row;
        return updated;
      });
      // Revertir contador
      setCounts(prev => ({ ...prev, active: prev.active + (currentStatus ? 1 : -1) }));
    }
  }, [currentSede, invalidateCache]);

  const openEdit = useCallback(async (row) => {
    const isNew = !row.exists_in_woo;
    const initialData = {
      ...row,
      name: row.ecommerce_name || row.descripcion,
      image_url: row.image_url || "",
      categories: [], tags: [], brands: [],
      isNew
    };

    // Mostrar modal inmediatamente con datos locales
    setEditingItem(initialData);

    // Cargar detalles WC en background
    if (!isNew) {
      try {
        const res = await fetchProductDetail(row.woo_product_id);
        if (res.ok && res.data) {
          const wooCats = res.data.categories?.map(c => String(c.id)) || [];
          const wooTags = res.data.tags?.map(t => String(t.id)) || [];
          const wooBrands = res.data.brands?.map(b => String(b.id)) || [];
          // Guardar imágenes como objetos {id, src} para evitar re-uploads
          const wooImages = res.data.images?.map(img => ({ id: img.id, src: img.src })) || [];

          setEditingItem(prev => prev && ({
            ...prev,
            categories: wooCats, tags: wooTags, brands: wooBrands,
            name: res.data.name || prev.name,
            image_url: res.data.images?.[0]?.src || prev.image_url,
            images: wooImages.length > 0 ? wooImages : (prev.image_url ? [prev.image_url] : []),
            ecommerce_active: res.data.status === 'publish',
            woo_price: parseFloat(res.data.price) || parseFloat(res.data.regular_price) || 0,
            pum_qty: res.data.meta_data?.find(m => m.key === 'pum_qty')?.value || "",
            pum_unit: res.data.meta_data?.find(m => m.key === 'pum_unit')?.value || "",
            productType: res.data.type || 'simple'
          }));
        }
      } catch (error) {
        console.error("Error fetching detail", error);
      }
    }
  }, []);

  const handleSaveProduct = useCallback(async (modifiedItem) => {
    try {
      const finalImages = modifiedItem.images?.length > 0
        ? modifiedItem.images
        : (modifiedItem.image_url ? [modifiedItem.image_url] : []);

      let res;
      if (modifiedItem.isNew) {
        res = await createWooProduct({
          name: modifiedItem.name, sku: modifiedItem.item,
          description: modifiedItem.descripcion,
          price: modifiedItem.precio_1 || 0,
          stock_quantity: modifiedItem.existencia || 0,
          images: finalImages, categories: modifiedItem.categories,
          tags: modifiedItem.tags, brands: modifiedItem.brands,
          pum_qty: modifiedItem.pum_qty || "", pum_unit: modifiedItem.pum_unit || "",
          sede: sedeInfo?.codigo_siesa || "PV001",
          lista: sedeInfo?.lista_precio || "P01"
        });
      } else {
        res = await updateWooProduct(modifiedItem.woo_product_id, {
          name: modifiedItem.name, images: finalImages,
          categories: modifiedItem.categories, tags: modifiedItem.tags,
          brands: modifiedItem.brands,
          pum_qty: modifiedItem.pum_qty || "", pum_unit: modifiedItem.pum_unit || ""
        });
      }

      if (res.ok) {
        // Guardar imágenes de variaciones pendientes (en paralelo)
        const pendingVars = modifiedItem._pendingVariations || [];
        if (pendingVars.length > 0 && modifiedItem.woo_product_id) {
          const varResults = await Promise.allSettled(
            pendingVars.map(v => updateVariationImage(modifiedItem.woo_product_id, v.id, v.src))
          );
          const failed = varResults.filter(r => r.status === 'rejected' || !r.value?.ok);
          if (failed.length > 0) {
            console.warn("Algunas variaciones no se actualizaron:", failed);
          }
        }

        // Extraer URL de la primera imagen (puede ser string o {id, src})
        const firstImg = finalImages[0];
        const mainImage = typeof firstImg === 'string' ? firstImg : (firstImg?.src || "");
        // Actualización optimista local
        setData(prev => prev.map(d => {
          if (modifiedItem.isNew && d.item === modifiedItem.item) {
            return { ...d, exists_in_woo: true, woo_product_id: res.data?.id, ecommerce_active: true, active_sedes: { ...(d.active_sedes || {}), [currentSede]: true }, ecommerce_name: modifiedItem.name, image_url: mainImage };
          }
          if (!modifiedItem.isNew && d.woo_product_id === modifiedItem.woo_product_id) {
            return { ...d, ecommerce_name: modifiedItem.name, image_url: mainImage };
          }
          return d;
        }));
        invalidateCache();
        setEditingItem(null);
        const varMsg = pendingVars.length > 0 ? ` (+ ${pendingVars.length} variación(es) actualizadas)` : '';
        alert(modifiedItem.isNew ? "Producto CREADO correctamente en WooCommerce" : `Producto ACTUALIZADO correctamente${varMsg}`);
      } else {
        alert("Error al guardar: " + res.message);
      }
    } catch (e) {
      console.error(e);
      alert("Error guardando cambios (Red)");
    }
  }, [currentSede, sedeInfo, invalidateCache]);

  const handleUploadImage = useCallback(async (files, updateCallback) => {
    if (!files?.length) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return alert("Solo imágenes");
    try {
      const res = await uploadImage(file);
      if (res.url && updateCallback) updateCallback(res.url);
    } catch {
      alert("Error subiendo imagen");
    }
  }, []);

  const handleCreateTag = useCallback(async (tagName) => {
    try {
      const res = await createTag({ name: tagName });
      if (res.ok) {
        const tagRes = await fetchTags();
        if (tagRes.ok) setTags(tagRes.data);
        return true;
      }
      alert("Error creando marca: " + res.message);
      return false;
    } catch {
      alert("Error de red");
      return false;
    }
  }, []);

  const handleDeleteTag = useCallback(async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta MARCA del sistema?")) return false;
    try {
      const res = await deleteTag(id);
      if (res.ok) {
        const tagRes = await fetchTags();
        if (tagRes.ok) setTags(tagRes.data);
        return true;
      }
      alert("No se pudo eliminar: " + res.message);
      return false;
    } catch {
      alert("Error eliminando tag");
      return false;
    }
  }, []);

  const sedeDisplayName = useMemo(() => sedeInfo?.nombre?.split(' ').pop() || 'Sede', [sedeInfo]);
  const closeModal = useCallback(() => setEditingItem(null), []);

  // ── RENDER ──
  return (
    <div>
      <div className="ge-header">
        <div className="ge-title">
          <h2>Gestor de Catálogo</h2>
          <p>Configurando: <strong>{sedeInfo?.nombre || 'Sede'}</strong> — Activa productos y asigna categorías</p>
        </div>
        <div className="ge-controls">
          <button className="ge-btn secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? "⏳ Sincronizando..." : "🔄 Sincronizar"}
          </button>
          <input
            className="ge-input cm-search-input" type="text" placeholder="Buscar..."
            value={search} onChange={handleSearchChange} onKeyDown={handleSearchKeyDown}
          />
        </div>
      </div>

      {/* Stats Cards (clickeables como filtros) */}
      <div className="ge-stats-grid cm-stats">
        <div className={`ge-stat-card filter-card ${filterType === 'all' ? 'active' : ''}`} onClick={() => handleFilterClick('all')}>
          <h3>Total Siesa</h3>
          <div className="ge-stat-value">{counts.total}</div>
          <div className="ge-stat-desc">Productos encontrados en el ERP</div>
        </div>
        <div className={`ge-stat-card filter-card ${filterType === 'active' ? 'active' : ''}`} onClick={() => handleFilterClick('active')}>
          <h3 className="cm-stat-active">Activos en {sedeDisplayName}</h3>
          <div className="ge-stat-value cm-stat-active">{counts.active}</div>
          <div className="ge-stat-desc">Publicados para esta sede</div>
        </div>
        <div className={`ge-stat-card filter-card ${filterType === 'unlinked' ? 'active' : ''}`} onClick={() => handleFilterClick('unlinked')}>
          <h3 className="cm-stat-warning">⚠️ Pendientes Sincronizar</h3>
          <div className="ge-stat-value cm-stat-warning">{counts.unlinked}</div>
          <div className="ge-stat-desc">Existen en Siesa pero NO en WooCommerce</div>
        </div>
      </div>

      {/* Tabla */}
      <div className="ge-card">
        <div className="ge-table-container">
          <table className="ge-table">
            <thead>
              <tr>
                <th>Imagen</th>
                <th>SKU / Item</th>
                <th>Descripción</th>
                <th>Grupo / Marca</th>
                <th className="text-center">Estado Sede</th>
                <th className="text-center">Sedes</th>
                <th className="text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="ge-loading">Cargando catálogo...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="7" className="ge-loading">No se encontraron productos</td></tr>
              ) : (
                data.map(row => (
                  <ProductRow key={row.item} row={row} currentSede={currentSede}
                    sedes={sedes} sedeShortNames={sedeShortNames}
                    onToggle={handleToggle} onEdit={openEdit} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div className="cm-pagination">
        <button disabled={page === 1} onClick={() => handlePageChange(page - 1)} className="ge-btn">Anterior</button>
        <span>Página {page} de {totalPages || 1}</span>
        <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="ge-btn">Siguiente</button>
      </div>

      {/* Modal de edición */}
      {editingItem && (
        <ProductEditModal
          product={editingItem} categories={categories} tags={tags}
          onClose={closeModal} onSave={handleSaveProduct}
          onUploadImage={handleUploadImage} onCreateTag={handleCreateTag}
          onDeleteTag={handleDeleteTag} dataError={dataError}
          onFetchVariations={fetchVariations}
          onUpdateVariationImage={updateVariationImage}
        />
      )}
    </div>
  );
}
