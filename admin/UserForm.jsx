import React, { useState, useRef, useCallback } from "react";
import { supabase, supabaseQuery } from "../../supabaseClient";
import {
  FaUserPlus,
  FaEdit,
  FaCheckCircle,
  FaTimesCircle,
  FaChevronDown,
  FaFolderOpen,
  FaEye,
  FaEyeSlash,
  FaShoppingCart,
} from "react-icons/fa";
import masterRoutes from "../../data/masterRoutes";

const ROLES = [
  "super_admin",
  "admin",
  "empleado",
  "admin_empleado",
  "admin_cliente",
  "admin_proveedor",
  "admin_tesoreria",
  "picker",
];

// ✅ ECOMMERCE ROLES: Roles específicos para el módulo ecommerce (no afectan el rol global)
const ECOMMERCE_ROLES = [
  { value: "", label: "Sin rol ecommerce" },
  { value: "ecommerce_admin_global", label: "Admin Global (todas las sedes)" },
  { value: "ecommerce_admin_sede", label: "Admin de Sede" },
  { value: "ecommerce_picker", label: "Picker" },
  { value: "ecommerce_auditor", label: "Auditor" },
];
const COMPANIES = ["Merkahorro", "Construahorro", "Megamayoristas"];
const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/functions/v1`
  : "https://pitpougbnibmfrjykzet.supabase.co/functions/v1";

// ✅ Definir los procesos por área
const procesosPorArea = {
  Comercial: [
    { value: "Comercial", label: "Comercial" },
    { value: "Marketing digital", label: "Marketing digital" },
    { value: "Lider", label: "Lider" },
  ],
  "Gestión humana": [
    {
      value: "Seguridad y Salud en el Trabajo",
      label: "Seguridad y Salud en el Trabajo",
    },
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
  Gerencia: [{ value: "Gerencia", label: "Gerencia General" }],
  "Punto de venta": [
    { value: "Picker", label: "Picker" },
    { value: "Cajera", label: "Cajera" },
    { value: "Surtidor", label: "Surtidor" },
  ],
};

export const UserForm = ({
  onUserSaved,
  editingUser,
  onCancelEdit,
  fixedRole = null,
  fixedArea = null, // ✅ Nueva prop
  fixedCompany = null, // ✅ Nueva prop
  allowedRoutes = null, // ✅ Nueva prop: Filtrar rutas asignables
  allowedRoles = null, // ✅ Nueva prop: Restringir roles disponibles
  autoAssignLiderId = null, // ✅ Nueva prop: Asignar ID de jefe automáticamente
  sedes = [], // ✅ SEDES: Lista de sedes activas
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isEditingPermissions, setIsEditingPermissions] = useState(false);
  const [allRoutes] = useState(masterRoutes);
  const [routePermissions, setRoutePermissions] = useState({}); // ✅ Estado para permisos por ruta

  const [formData, setFormData] = useState(
    editingUser
      ? {
          nombre: editingUser.nombre || "",
          area: editingUser.area || "",
          email: editingUser.correo || "",
          password: "",
          role: editingUser.role || "empleado",
          company: editingUser.company || "",
          proceso: editingUser.proceso || "", // ✅ Cargar proceso desde editingUser
          sede_id: editingUser.sede_id || "", // ✅ SEDES: Cargar sede desde editingUser
          ecommerce_rol: editingUser.ecommerce_rol || "", // ✅ ECOMMERCE ROL
          isNew: false,
          uid: editingUser.user_id,
          selectedRoutes: editingUser.personal_routes?.map((r) => r.path) || [],
        }
      : {
          nombre: "",
          area: fixedArea || "",
          email: "",
          password: "",
          role: fixedRole || "empleado",
          company: fixedCompany || "",
          proceso: "",
          sede_id: "", // ✅ SEDES
          ecommerce_rol: "", // ✅ ECOMMERCE ROL
          isNew: true,
          uid: null,
          selectedRoutes: [],
        },
  );

  // ✅ Efecto para manejar el rol fijo de picker y restricciones de área/empresa
  React.useEffect(() => {
    // Aplicar restricciones fijas
    if (fixedArea || fixedCompany) {
      setFormData((prev) => {
        const updates = {};
        if (fixedArea && prev.area !== fixedArea) updates.area = fixedArea;
        if (fixedCompany && prev.company !== fixedCompany)
          updates.company = fixedCompany;

        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    }

    if (fixedRole === "picker" && formData.isNew) {
      setFormData((prev) => ({
        ...prev,
        role: "picker",
        area: "Punto de venta", // Área fija
        proceso: "Picker", // Proceso fijo
        company: "Merkahorro", // Empresa fija
        selectedRoutes: ["/ecommerce/picker"], // Ruta automática
      }));
      setRoutePermissions((prev) => ({
        ...prev,
        "/ecommerce/picker": "full_access",
      }));
    }
  }, [fixedRole, fixedArea, fixedCompany, formData.isNew]);

  const formRef = useRef(null);

  // ✅ Obtener procesos disponibles según el área seleccionada
  const procesosDisponibles = formData.area
    ? procesosPorArea[formData.area] || []
    : [];

  const getRoutesByGroup = useCallback(() => {
    // ✅ Filtrar rutas disponibles si se proporcionan allowedRoutes
    const routesToUse = allowedRoutes
      ? allRoutes.filter((r) => allowedRoutes.includes(r.path))
      : allRoutes;

    return routesToUse.reduce((acc, route) => {
      const group = route.group || "Otras";
      if (!acc[group]) acc[group] = [];
      acc[group].push(route);
      return acc;
    }, {});
  }, [allRoutes, allowedRoutes]);

  const resetForm = useCallback(() => {
    setFormData({
      nombre: "",
      area: "",
      email: "",
      password: "",
      role: "empleado",
      company: "",
      proceso: "",
      sede_id: "", // ✅ SEDES
      ecommerce_rol: "", // ✅ ECOMMERCE ROL
      isNew: true,
      uid: null,
      selectedRoutes: [], // ✅ Incluir proceso
    });
    setIsEditingPermissions(false);
    setError(null);
    setStatus(null);
    if (onCancelEdit) onCancelEdit();
  }, [onCancelEdit]);

  const handleRouteToggle = (path) => {
    setFormData((prev) => {
      const isSelected = prev.selectedRoutes.includes(path);
      const newRoutes = isSelected
        ? prev.selectedRoutes.filter((p) => p !== path)
        : [...prev.selectedRoutes, path];
      return { ...prev, selectedRoutes: newRoutes };
    });
  };

  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    let newRoutes = [...formData.selectedRoutes];

    // Definir rutas sugeridas para los nuevos roles
    const suggestedRoutes = {
      admin_empleado: [
        "/trazabilidad/panel",
        "/trazabilidad/gestion-tokens",
        "/trazabilidad/aprobaciones",
        "/trazabilidad/crear-empleado",
      ],
      admin_cliente: [
        "/trazabilidad/panel",
        "/trazabilidad/gestion-tokens",
        "/trazabilidad/aprobaciones",
        "/trazabilidad/crear-cliente",
        "/trazabilidad/crear-proveedor",
      ],
      admin_proveedor: [
        "/trazabilidad/panel",
        "/trazabilidad/gestion-tokens",
        "/trazabilidad/aprobaciones",
        "/trazabilidad/crear-proveedor",
        "/trazabilidad/crear-cliente",
      ],
    };

    if (suggestedRoutes[newRole]) {
      // Agregar rutas sugeridas si no están ya seleccionadas
      const routesToAdd = suggestedRoutes[newRole].filter(
        (r) => !newRoutes.includes(r),
      );
      newRoutes = [...newRoutes, ...routesToAdd];
    }

    setFormData({
      ...formData,
      role: newRole,
      selectedRoutes: newRoutes,
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sesión requerida.");
      setLoading(false);
      return;
    }

    try {
      // ✅ PREPARAR RUTAS: Calculamos esto ANTES para usarlo tanto en Crear como en Editar
      const routesToSave =
        formData.selectedRoutes.length > 0
          ? formData.selectedRoutes.map((path) => {
              const routeDef = allRoutes.find((r) => r.path === path);
              return {
                path,
                label: routeDef?.label || "Ruta Desconocida",
                permission: routePermissions[path] || "read_only", // ✅ Guardar permiso seleccionado
              };
            })
          : null;

      if (formData.isNew) {
        if (!formData.password)
          throw new Error("La contraseña es obligatoria.");

        const response = await fetch(`${API_URL}/create-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            nombre: formData.nombre,
            area: formData.area,
            role: formData.role,
            company: formData.company,
            proceso: formData.proceso || null,
            sede_id: formData.sede_id || null, // ✅ SEDES
            ecommerce_rol: formData.ecommerce_rol || null, // ✅ ECOMMERCE ROL
            personal_routes: routesToSave, // ✅ AHORA SÍ enviamos las rutas al crear

            // ✅ NUEVO: Asignar jefe automáticamente si aplica
            lider_id: autoAssignLiderId || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || "Fallo en la creación (Edge Function).",
          );
        }

        // === 🚀 SINCRONIZACIÓN AUTOMÁTICA WC_PICKERS (CREACIÓN) ===
        if (formData.role === "picker") {
          try {
            // Verificamos si ya existe para evitar duplicados (aunque es isNew, mejor prevenir)
            const { data: existing } = await supabase
              .from("wc_pickers")
              .select("id")
              .eq("email", formData.email)
              .maybeSingle();

            if (!existing) {
              await supabase.from("wc_pickers").insert([
                {
                  nombre_completo: formData.nombre,
                  email: formData.email,
                  estado_picker: "disponible",
                  total_items_recolectados: 0,
                  sede_id: formData.sede_id || null, // ✅ SEDES: Propagar sede al picker
                },
              ]);
              console.log("✅ Picker sincronizado en wc_pickers (INSERT)");
            }
          } catch (syncErr) {
            console.warn("Error sincronizando wc_pickers al crear:", syncErr);
            // No bloqueamos el flujo principal, el usuario ya se creó en Auth
          }
        }
        // ============================================================

        setStatus("Usuario creado con éxito. Rutas personalizadas asignadas.");

        // ✅ SEDES + ECOMMERCE ROL: Actualizar directamente en profiles (Edge Function no maneja estos campos)
        if (formData.sede_id || formData.ecommerce_rol) {
          try {
            // Necesitamos obtener el uid del usuario recién creado
            const { data: newProfile } = await supabase
              .from("profiles")
              .select("user_id")
              .eq("correo", formData.email)
              .maybeSingle();

            if (newProfile?.user_id) {
              const profileUpdate = {};
              if (formData.sede_id) profileUpdate.sede_id = formData.sede_id;
              if (formData.ecommerce_rol)
                profileUpdate.ecommerce_rol = formData.ecommerce_rol;

              await supabase
                .from("profiles")
                .update(profileUpdate)
                .eq("user_id", newProfile.user_id);
              console.log(
                "✅ sede_id y ecommerce_rol sincronizados en profiles (CREATE)",
              );
            }
          } catch (syncErr) {
            console.warn(
              "Error sincronizando sede/ecommerce_rol al crear:",
              syncErr,
            );
          }
        }
      } else {
        // ✅ CAMBIO: Usar Edge Function 'update-user' para evitar error 403 en cambio de contraseña
        const response = await fetch(`${API_URL}/update-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uid: formData.uid,
            password: formData.password || undefined,
            nombre: formData.nombre,
            area: formData.area,
            role: formData.role,
            company: formData.company,
            proceso: formData.proceso || null,
            sede_id: formData.sede_id || null, // ✅ SEDES
            ecommerce_rol: formData.ecommerce_rol || null, // ✅ ECOMMERCE ROL
            personal_routes: routesToSave, // Usamos la variable calculada arriba
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || "Fallo en la actualización (Edge Function).",
          );
        }

        // ✅ SEDES + ECOMMERCE ROL: Actualizar directamente en profiles (Edge Function no maneja estos campos)
        {
          const profileUpdate = {};
          if (formData.sede_id) profileUpdate.sede_id = formData.sede_id;
          else profileUpdate.sede_id = null;
          if (formData.ecommerce_rol)
            profileUpdate.ecommerce_rol = formData.ecommerce_rol;
          else profileUpdate.ecommerce_rol = null;

          const { error: sedeError } = await supabase
            .from("profiles")
            .update(profileUpdate)
            .eq("user_id", formData.uid);
          if (sedeError)
            console.warn("Error actualizando sede/ecommerce_rol:", sedeError);
          else
            console.log(
              "✅ sede_id y ecommerce_rol sincronizados en profiles (UPDATE)",
            );
        }

        // === 🚀 SINCRONIZACIÓN AUTOMÁTICA WC_PICKERS (EDICIÓN ROBUSTA) ===
        if (formData.role === "picker" && editingUser) {
          try {
            const originalEmail = editingUser.correo || editingUser.email; // El correo antigüo para localizar el registro

            // Actualizamos nombre Y el email (por si cambió) usando el email original como llave
            const { error: upError } = await supabase
              .from("wc_pickers")
              .update({
                nombre_completo: formData.nombre,
                email: formData.email,
                sede_id: formData.sede_id || null, // ✅ SEDES: Actualizar sede del picker
              })
              .eq("email", originalEmail);

            if (!upError)
              console.log("✅ Picker sincronizado en wc_pickers (UPDATE)");
            else console.warn("Error DB wc_pickers update:", upError);
          } catch (syncErr) {
            console.warn("Error sincronizando wc_pickers al editar:", syncErr);
          }
        }
        // ============================================================

        setStatus("Usuario actualizado con éxito.");
      }

      resetForm();
      if (onUserSaved) onUserSaved(formData);
    } catch (err) {
      console.error("Error en operación de usuario:", err);
      if (err.message === "Failed to fetch") {
        setError(
          "Error de conexión o CORS. Verifica los permisos de la Edge Function.",
        );
      } else {
        setError(err.message);
      }
    }
    setLoading(false);
  };

  // Actualizar formData cuando cambie editingUser
  React.useEffect(() => {
    if (editingUser) {
      setFormData({
        nombre: editingUser.nombre || "",
        area: editingUser.area || "", // ✅ IMPORTANTE: Cargar área primero
        email: editingUser.correo || "",
        password: "",
        role: editingUser.role || "empleado",
        company: editingUser.company || "",
        proceso: editingUser.proceso || "", // ✅ Cargar proceso después del área
        sede_id: editingUser.sede_id || "", // ✅ SEDES: Cargar sede
        ecommerce_rol: editingUser.ecommerce_rol || "", // ✅ ECOMMERCE ROL
        isNew: false,
        uid: editingUser.user_id,
        selectedRoutes: editingUser.personal_routes?.map((r) => r.path) || [],
      });

      // ✅ Cargar permisos de rutas existentes
      const permissions = {};
      if (editingUser.personal_routes) {
        editingUser.personal_routes.forEach((r) => {
          permissions[r.path] = r.permission || "read_only"; // Default a lectura si no existe
        });
      }
      setRoutePermissions(permissions);

      setIsEditingPermissions(true);
      setError(null);
      setStatus(null);

      // Scroll al formulario
      setTimeout(() => {
        if (formRef.current) {
          formRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }, 100);
    }
  }, [editingUser]);

  return (
    <div ref={formRef} className="admin-ug-card">
      <h3 className="admin-ug-card-title">
        {formData.isNew
          ? "Crear Nuevo Usuario"
          : `Editando: ${formData.nombre}`}
      </h3>

      {/* Feedback */}
      {status && (
        <p className="admin-ug-success">
          <FaCheckCircle /> {status}
        </p>
      )}
      {error && (
        <p className="admin-ug-error">
          <FaTimesCircle /> {error}
        </p>
      )}

      <form onSubmit={handleSave} className="admin-ug-form">
        <div className="admin-ug-form-grid">
          <div className="admin-ug-input-group">
            <input
              name="nombre"
              value={formData.nombre}
              onChange={(e) =>
                setFormData({ ...formData, nombre: e.target.value })
              }
              placeholder="Nombre Completo"
              required
            />
          </div>

          {/* ✅ CAMBIO: Usar select en lugar de input libre */}
          <div className="admin-ug-input-group">
            {fixedRole === "picker" || formData.role === "picker" ? (
              <input
                value="Punto de venta"
                disabled
                className="admin-ug-input-disabled"
              />
            ) : (
              <select
                name="area"
                value={formData.area}
                disabled={!!fixedArea}
                onChange={(e) => {
                  const newArea = e.target.value;
                  setFormData({
                    ...formData,
                    area: newArea,
                    proceso: "", // Limpiar proceso cuando cambia el área
                  });
                }}
                required
              >
                <option value="">Selecciona un Área...</option>
                {Object.keys(procesosPorArea).map((areaKey) => (
                  <option key={areaKey} value={areaKey}>
                    {areaKey}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ✅ Campo Proceso - Se muestra cuando hay área seleccionada */}
          {(fixedRole === "picker" ||
            formData.role === "picker" ||
            (formData.area && procesosDisponibles.length > 0)) && (
            <div className="admin-ug-input-group">
              {fixedRole === "picker" || formData.role === "picker" ? (
                <input
                  value="Picker"
                  disabled
                  className="admin-ug-input-disabled"
                />
              ) : (
                <select
                  name="proceso"
                  value={formData.proceso}
                  onChange={(e) =>
                    setFormData({ ...formData, proceso: e.target.value })
                  }
                >
                  <option value="">Selecciona un Proceso...</option>
                  {procesosDisponibles.map((proceso) => (
                    <option key={proceso.value} value={proceso.value}>
                      {proceso.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="admin-ug-input-group">
            {fixedRole === "picker" ? (
              <input
                value="Merkahorro"
                disabled
                className="admin-ug-input-disabled"
              />
            ) : (
              <select
                name="company"
                value={formData.company}
                disabled={!!fixedCompany}
                onChange={(e) =>
                  setFormData({ ...formData, company: e.target.value })
                }
              >
                <option value="">Seleccionar Empresa</option>
                {COMPANIES.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Sección Ecommerce (Sede + Rol) ── */}
          {sedes.length > 0 && (
            <div className="admin-ug-ecommerce-section">
              <div className="admin-ug-ecommerce-section-header">
                <FaShoppingCart /> Configuración Ecommerce
              </div>
              <p className="admin-ug-ecommerce-section-hint">
                Asigna sede y rol solo si este usuario participará en el módulo
                de picking/ecommerce. Las rutas se asignan automáticamente.
              </p>

              <div className="admin-ug-ecom-fields-grid">
                {/* Sede */}
                <div className="admin-ug-input-group">
                  <select
                    name="sede_id"
                    value={formData.sede_id}
                    onChange={(e) =>
                      setFormData({ ...formData, sede_id: e.target.value })
                    }
                    required={
                      formData.ecommerce_rol &&
                      formData.ecommerce_rol !== "ecommerce_admin_global"
                    }
                  >
                    <option value="">Seleccionar Sede...</option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={sede.id}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rol Ecommerce */}
                <div className="admin-ug-input-group">
                  <select
                    name="ecommerce_rol"
                    value={formData.ecommerce_rol}
                    onChange={(e) => {
                      const newEcomRol = e.target.value;
                      const updates = { ecommerce_rol: newEcomRol };
                      // Auto-asignar rutas ecommerce según el rol seleccionado
                      if (
                        newEcomRol === "ecommerce_admin_global" ||
                        newEcomRol === "ecommerce_admin_sede"
                      ) {
                        const ecomRoutes = [
                          "/ecommerce/pedidos",
                          "/ecommerce/analitica",
                          "/ecommerce/gestion-pickers",
                          "/gestor-ecommerce",
                        ];
                        updates.selectedRoutes = [
                          ...new Set([
                            ...formData.selectedRoutes,
                            ...ecomRoutes,
                          ]),
                        ];
                      } else if (newEcomRol === "ecommerce_picker") {
                        const pickerRoutes = ["/ecommerce/picker"];
                        updates.selectedRoutes = [
                          ...new Set([
                            ...formData.selectedRoutes,
                            ...pickerRoutes,
                          ]),
                        ];
                      } else if (newEcomRol === "ecommerce_auditor") {
                        const auditorRoutes = ["/ecommerce/auditor"];
                        updates.selectedRoutes = [
                          ...new Set([
                            ...formData.selectedRoutes,
                            ...auditorRoutes,
                          ]),
                        ];
                      }
                      setFormData({ ...formData, ...updates });
                    }}
                  >
                    {ECOMMERCE_ROLES.map((er) => (
                      <option key={er.value} value={er.value}>
                        {er.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* cierre admin-ug-ecom-fields-grid */}
            </div>
          )}

          <div className="admin-ug-input-group">
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="Correo Electrónico"
              required
              disabled={!formData.isNew}
              autoComplete="email" // ✅ Agregar autocomplete
            />
          </div>

          <div className="admin-ug-input-group admin-ug-password-group">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              placeholder={
                formData.isNew
                  ? "Contraseña (obligatoria)"
                  : "Nueva Contraseña (opcional)"
              }
              autoComplete={
                formData.isNew ? "new-password" : "current-password"
              } // ✅ Agregar autocomplete
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="admin-ug-password-toggle"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          <div className="admin-ug-input-group">
            {fixedRole ? (
              <input
                value={fixedRole.toUpperCase()}
                disabled
                className="admin-ug-input-disabled"
                title="Rol predefinido"
              />
            ) : (
              <select
                name="role"
                value={formData.role}
                onChange={(e) => {
                  // Si seleccionan 'picker', auto-llenar el area y proceso
                  const newRole = e.target.value;
                  if (newRole === "picker") {
                    setFormData((prev) => ({
                      ...prev,
                      role: newRole,
                      area: "Punto de venta",
                      proceso: "Picker",
                    }));
                  } else {
                    setFormData((prev) => ({ ...prev, role: newRole }));
                  }
                }}
                required
              >
                {(allowedRoles || ROLES).map(
                  (
                    role, // ✅ Usar allowedRoles si existe, si no, usa todos los ROLES
                  ) => (
                    <option key={role} value={role}>
                      {role.replace("_", " ").toUpperCase()}
                    </option>
                  ),
                )}
              </select>
            )}
          </div>
        </div>

        {fixedRole !== "picker" && (
          <div className="admin-ug-permission-toggle">
            <button
              type="button"
              className="admin-ug-toggle-btn"
              onClick={() => setIsEditingPermissions((p) => !p)}
            >
              {isEditingPermissions ? (
                <>
                  <FaChevronDown /> Ocultar Rutas
                </>
              ) : (
                <>
                  <FaFolderOpen />{" "}
                  {formData.isNew
                    ? "Personalizar Rutas (Opcional)"
                    : "Modificar Rutas Personalizadas"}
                </>
              )}
            </button>
          </div>
        )}

        {isEditingPermissions && fixedRole !== "picker" && (
          <div className="admin-ug-permissions-section">
            {/* ℹ️ Mensaje informativo cuando hay restricción de rutas */}
            {allowedRoutes && allowedRoutes.length > 0 && (
              <div
                className="admin-ug-info-box"
                style={{
                  background: "#fff3cd",
                  border: "1px solid #ffc107",
                  borderRadius: "6px",
                  padding: "12px",
                  marginBottom: "15px",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#856404" }}>
                  <strong>ℹ️ Nota:</strong> Solo puedes asignar rutas que tú
                  tienes en tu perfil ({allowedRoutes.length} disponibles).
                </p>
              </div>
            )}

            <h4 className="admin-ug-permissions-title">
              Rutas Personalizadas (Anulan el Rol Base)
            </h4>
            <div className="admin-ug-route-groups-container">
              {Object.entries(getRoutesByGroup()).map(([group, routes]) => (
                <div key={group} className="admin-ug-route-group-card">
                  <div className="admin-ug-group-header">
                    <h5 className="admin-ug-group-title">{group}</h5>
                    <button
                      type="button"
                      className="admin-ug-group-select-all"
                      onClick={() => {
                        const groupPaths = routes.map((r) => r.path);
                        const allSelected = groupPaths.every((p) =>
                          formData.selectedRoutes.includes(p),
                        );
                        setFormData((prev) => ({
                          ...prev,
                          selectedRoutes: allSelected
                            ? prev.selectedRoutes.filter(
                                (p) => !groupPaths.includes(p),
                              )
                            : [
                                ...new Set([
                                  ...prev.selectedRoutes,
                                  ...groupPaths,
                                ]),
                              ],
                        }));
                      }}
                    >
                      {routes.every((r) =>
                        formData.selectedRoutes.includes(r.path),
                      )
                        ? "Deseleccionar Todo"
                        : "Seleccionar Todo"}
                    </button>
                  </div>
                  <div className="admin-ug-route-checkboxes">
                    {routes.map((route, idx) => (
                      <div
                        key={`${group}-${route.path}-${idx}`}
                        className="admin-ug-route-item"
                      >
                        <label className="admin-ug-checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.selectedRoutes.includes(
                              route.path,
                            )}
                            onChange={() => handleRouteToggle(route.path)}
                          />
                          <span className="admin-ug-checkbox-text">
                            {route.label}
                          </span>
                        </label>

                        {/* ✅ Selector de Permisos ELIMINADO por ser obsoleto */}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="admin-ug-clear-btn"
              onClick={() => setFormData({ ...formData, selectedRoutes: [] })}
            >
              Limpiar Rutas (Usar Rol Base)
            </button>
          </div>
        )}

        <div className="admin-ug-form-actions">
          <button
            type="submit"
            disabled={loading}
            className="admin-ug-submit-btn"
          >
            {loading ? (
              "Procesando..."
            ) : formData.isNew ? (
              <>
                <FaUserPlus /> Crear Usuario
              </>
            ) : (
              <>
                <FaEdit /> Guardar Cambios
              </>
            )}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={loading}
            className="admin-ug-cancel-btn"
          >
            {formData.isNew ? "Limpiar" : "Cancelar Edición"}
          </button>
        </div>
      </form>
    </div>
  );
};
