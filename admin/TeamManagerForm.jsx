import React, { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";
import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaBriefcase,
  FaBuilding,
  FaSave,
  FaTimes,
  FaCheck,
  FaKey,
} from "react-icons/fa";
import masterRoutes from "../../data/masterRoutes";

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/functions/v1`
  : "https://pitpougbnibmfrjykzet.supabase.co/functions/v1";

// Procesos simplificados para el líder (o se podrían pasar como props si son dinámicos)
const COMPANIES = ["Merkahorro", "Construahorro", "Megamayoristas"];
const ROLES_PERMITIDOS = ["empleado", "picker", "admin_empleado"];

const PROCESOS_POR_AREA = {
  Comercial: [
    { value: "Comercial", label: "Comercial" },
    { value: "Marketing digital", label: "Marketing digital" },
    { value: "Lider", label: "Lider" },
  ],
  "Gestión humana": [
    { value: "Seguridad y Salud en el Trabajo", label: "Seguridad y Salud en el Trabajo" },
    { value: "Bienestar y Formación", label: "Bienestar y Formación" },
    { value: "Contratación", label: "Contratación" },
    { value: "Proceso de Selección", label: "Proceso de Selección" },
    { value: "Lider", label: "Lider" },
  ],
  Operaciones: [
    { value: "Logística", label: "Logística" },
    { value: "Inventarios", label: "Inventarios" },
    { value: "Sistemas", label: "Sistemas" },
    { value: "Desarrollo", label: "Desarrollo" },
    { value: "Procesos", label: "Procesos" },
    { value: "Fruver", label: "Fruver" },
    { value: "Cárnicos", label: "Cárnicos" },
    { value: "Proyectos", label: "Proyectos" },
    { value: "Operaciones-Comerciales", label: "Operaciones Comerciales" },
    { value: "Mantenimiento", label: "Mantenimiento" },
    { value: "Almacén", label: "Almacén" },
    { value: "Lider", label: "Lider" },
  ],
  Contabilidad: [{ value: "Contabilidad", label: "Contabilidad" }],
  Cartera: [
    { value: "Tesoreria", label: "Tesoreria" },
    { value: "Cartera", label: "Cartera" },
  ],
  Gerencia: [
    { value: "Gerencia", label: "Gerencia General" },
  ],
  "Punto de venta": [
    { value: "Picker", label: "Picker" },
    { value: "Cajera", label: "Cajera" },
    { value: "Surtidor", label: "Surtidor" },
  ],
};

export const TeamManagerForm = ({
  user,
  onSave,
  onCancel,
  availableRoutes = [], // Rutas que el líder PUEDE asignar (intersección)
  leaderId,
}) => {
  const [formData, setFormData] = useState({
    nombre: "",
    correo: "",
    password: "",
    empresa: "Merkahorro",
    area: "",
    proceso: "",
    rol: "empleado",
    personal_routes: [],
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permissionsMap, setPermissionsMap] = useState({});

  // --- HYDRATION: Enriquecer rutas del líder con datos de masterRoutes ---
  // Esto asegura que tengamos los 'groups' y 'labels' actualizados aunque el JSON del perfil esté viejo
  const hydratedAvailableRoutes = availableRoutes.map(route => {
     // Buscamos la definición maestra por path
     const master = masterRoutes.find(m => m.path === route.path);
     if (master) {
         // Retornamos la fusión, priorizando masterRoutes para visualización
         return { ...route, ...master };
     }
     return route;
  });

  // Cargar datos si es edición
  useEffect(() => {
    if (user) {
      setFormData({
        nombre: user.nombre || "",
        correo: user.correo || "",
        password: "", // No mostramos password
        empresa: user.company || "Merkahorro",
        area: user.area || "",
        proceso: user.proceso || "",
        rol: user.role || "empleado",
        personal_routes: user.personal_routes || [], // Array de rutas
      });

      // Mapear rutas asignadas para los checkboes
      const map = {};
      if (user.personal_routes) {
        user.personal_routes.forEach((r) => {
          map[r.path] = true;
        });
      }
      setPermissionsMap(map);
    } else {
        // Valores por defecto
        setFormData(prev => ({
            ...prev,
            area: "Operaciones", // Default común
        }));
    }
  }, [user]);

  const togglePermission = (path) => {
    // Verificar si el LIDER tiene permiso para asignar esta ruta
    // (availableRoutes debe contener las rutas que el líder TIENE)
    const canAssign = availableRoutes.some(r => r.path === path);
    if(!canAssign) return; // No hacer nada si el líder no tiene esa ruta

    setPermissionsMap((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 1. Construir el array de rutas seleccionadas
      // Solo incluimos las rutas que están marcadas como TRUE en permissionsMap
      // Y buscamos su objeto completo en masterRoutes (o availableRoutes)
      const selectedRoutes = availableRoutes.filter(
        (route) => permissionsMap[route.path]
      );

      // 2. Preparar payload
      const payload = {
        ...formData,
        personal_routes: selectedRoutes,
        lider_id: leaderId, // Forzar asignación al líder actual
        role: formData.rol,
        company: formData.empresa
      };

      // Si es crear, password es obligatorio
      if (!user && !formData.password) {
        throw new Error("La contraseña es obligatoria para nuevos usuarios.");
      }

      // Si es editar y password está vacío, lo quitamos del payload para no sobrescribir
      if (user && !formData.password) {
        delete payload.password;
      }
      
      // Obtener token de sesión para Authorization header
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("No hay sesión activa.");

      const functionName = user ? "update-user" : "create-user";
      // NOTA: create-user espera { userData: ... } y update-user espera { updates: ..., user_id: ... }
      // Pero create-user también puede recibir campos sueltos dependiendo de la implementación.
      // Basado en UserForm, el create-user recibe: { email, password, nombre... } directos en el body.
      // Y update-user recibe: { uid, password, nombre... } directos en el body.
      
      // Vamos a ajustar el body para que coincida con lo que espera el Edge Function según UserForm.jsx
      let bodyData = {};
      
      if (user) {
         // Update
         bodyData = {
           uid: user.user_id, // UserForm usa 'uid', TeamManagerForm usaba 'user_id' dentro de 'updates'. Estandarizamos a lo que use la funcion.
           // Viendo UserForm.jsx: body: JSON.stringify({ uid: formData.uid, ... })
           ...payload,
           user_id: undefined, // Quitamos user_id si estaba en payload
           lider_id: payload.lider_id
         };
      } else {
         // Create
         // Viendo UserForm.jsx: body: JSON.stringify({ email, password, nombre ... })
         // TeamManagerForm usaba { userData: payload }
         // Vamos a intentar enviar payload plano como UserForm si la funcion es la misma.
         bodyData = {
            email: payload.correo, // UserForm usa 'email', aqui 'correo'
            password: payload.password,
            nombre: payload.nombre,
            area: payload.area,
            role: payload.rol,
            company: payload.empresa,
            proceso: payload.proceso || null,
            personal_routes: payload.personal_routes,
            lider_id: payload.lider_id
         };
      }

      // Hacemos fetch manual para evitar problemas de CORS con headers extra de supabase-js
      const response = await fetch(`${API_URL}/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(bodyData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();

      onSave(); // Notificar éxito
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "area") {
      setFormData((prev) => ({ ...prev, area: value, proceso: "" }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Agrupar rutas disponibles por "group" o menú para mostrar ordenado
  const groupedRoutes = hydratedAvailableRoutes.reduce((acc, route) => {
    const group = route.group || "Otros";
    if (!acc[group]) acc[group] = [];
    acc[group].push(route);
    return acc;
  }, {});

  return (
    <div className="tm-form-overlay">
      <div className="tm-form-modal">
        <div className="tm-form-header">
          <h3>
            {user ? `Editar a ${user.nombre}` : "Crear Nuevo Miembro"}
          </h3>
          <button className="tm-close-btn" onClick={onCancel}>
            <FaTimes />
          </button>
        </div>

        {error && <div className="tm-form-error">{error}</div>}

        <form onSubmit={handleSubmit} className="tm-form-content">
          <div className="tm-form-grid">
            {/* --- Columna Izquierda: Datos Básicos --- */}
            <div className="tm-form-section">
              <h4>Información Personal</h4>
              
              <div className="tm-input-group">
                <label><FaUser /> Nombre Completo</label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleInputChange}
                  required
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div className="tm-input-group">
                <label><FaEnvelope /> Correo Electrónico</label>
                <input
                  type="email"
                  name="correo"
                  value={formData.correo}
                  onChange={handleInputChange}
                  required
                  placeholder="usuario@empresa.com"
                  disabled={!!user} // Correo no editable una vez creado (si se desea)
                />
              </div>

               <div className="tm-input-group">
                <label><FaKey /> Contraseña {user && "(Dejar en blanco para no cambiar)"}</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="********"
                  required={!user}
                  minLength={6}
                />
              </div>
            </div>

            {/* --- Columna Derecha: Rol y Empresa --- */}
            <div className="tm-form-section">
              <h4>Detalles del Cargo</h4>
              
              <div className="tm-input-group">
                <label><FaBuilding /> Empresa</label>
                <select
                  name="empresa"
                  value={formData.empresa}
                  onChange={handleInputChange}
                >
                  {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="tm-input-group">
                <label><FaBriefcase /> Área / Proceso</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <select
                    name="area"
                    value={formData.area}
                    onChange={handleInputChange}
                    style={{ flex: 1 }}
                    required
                  >
                    <option value="">Seleccione Área</option>
                    {Object.keys(PROCESOS_POR_AREA).map((areaKey) => (
                      <option key={areaKey} value={areaKey}>
                        {areaKey}
                      </option>
                    ))}
                  </select>

                  <select
                    name="proceso"
                    value={formData.proceso}
                    onChange={handleInputChange}
                    style={{ flex: 1 }}
                    required
                    disabled={!formData.area}
                  >
                    <option value="">Seleccione Proceso</option>
                    {formData.area &&
                      PROCESOS_POR_AREA[formData.area]?.map((proc) => (
                        <option key={proc.value} value={proc.value}>
                          {proc.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

               <div className="tm-input-group">
                <label>Rol de Sistema</label>
                <select name="rol" value={formData.rol} onChange={handleInputChange}>
                    {ROLES_PERMITIDOS.map(r => (
                        <option key={r} value={r}>{r.toUpperCase()}</option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* --- Sección Ancha: Permisos y Rutas --- */}
          <div className="tm-form-full-width">
            <h4>Asignar Permisos (Rutas)</h4>
            <p className="tm-hint">Solo puedes asignar rutas a las que tú tienes acceso.</p>
            
            <div className="tm-permissions-grid">
              {Object.keys(groupedRoutes).map(group => (
                <div key={group} className="tm-permission-group">
                  <h5 className="tm-group-title">{group}</h5>
                  <div className="tm-group-items">
                    {groupedRoutes[group].map(route => (
                      <label key={route.path} className={`tm-permission-item ${permissionsMap[route.path] ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!!permissionsMap[route.path]}
                          onChange={() => togglePermission(route.path)}
                        />
                        <span>{route.label || route.path}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              
              {hydratedAvailableRoutes.length === 0 && (
                  <p>No tienes rutas disponibles para asignar.</p>
              )}
            </div>
          </div>

          <div className="tm-form-actions">
            <button type="button" className="tm-btn-cancel" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="tm-btn-save" disabled={loading}>
              {loading ? "Guardando..." : (user ? "Actualizar Empleado" : "Crear Empleado")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
