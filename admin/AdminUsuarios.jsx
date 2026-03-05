import React, { useState, useEffect } from "react";
import { supabase, supabaseQuery } from "../../supabaseClient";
import {
  FaUserCog,
  FaUsers,
  FaChartBar,
  FaBriefcase,
  FaDownload,
} from "react-icons/fa";
import { UserForm } from "./UserForm";
import { UserList } from "./UserList";
import { AsignarEquipo } from "./AsignarEquipo";
import "./AdminUsuarios.css";

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
const COMPANIES = ["Merkahorro", "Construahorro", "Megamayoristas"];

export const AdminUsuarios = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [showStats, setShowStats] = useState(true);
  const [asignandoEquipo, setAsignandoEquipo] = useState(null); // ✅ NUEVO: Modal de asignar equipo
  const [sedes, setSedes] = useState([]); // ✅ SEDES: Lista de sedes activas

  useEffect(() => {
    cargarUsuarios();
    cargarSedes();
  }, []);

  // ✅ SEDES: Cargar lista de sedes activas
  const cargarSedes = async () => {
    const { data, error } = await supabaseQuery(() =>
      supabase
        .from("wc_sedes")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre"),
    );
    if (!error && data) {
      setSedes(data);
    } else {
      console.error("Error al cargar sedes:", error?.message);
    }
  };

  const cargarUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabaseQuery(
      () =>
        supabase
          .from("profiles")
          .select(
            "user_id, nombre, area, correo, company, role, personal_routes, proceso, sede_id, ecommerce_rol",
          ), // ✅ AGREGAR proceso + sede_id + ecommerce_rol
    );

    if (error) {
      console.error("Error al cargar usuarios:", error.message);
    } else {
      setUsuarios(data || []);
    }
    setLoading(false);
  };

  const handleEditUser = async (usuario) => {
    // Cargar configuración de rol para rutas iniciales
    const { data: roleConfig } = await supabaseQuery(() =>
      supabase
        .from("role_permissions")
        .select("permissions")
        .eq("role", usuario.role)
        .maybeSingle(),
    );

    let initialRoutes = [];
    if (usuario.personal_routes && usuario.personal_routes.length > 0) {
      initialRoutes = usuario.personal_routes;
    } else if (roleConfig?.permissions) {
      initialRoutes = roleConfig.permissions;
    }

    // Incluir las rutas iniciales en el usuario a editar
    setEditingUser({
      ...usuario,
      personal_routes: initialRoutes,
    });
  };

  const handleUserSaved = () => {
    cargarUsuarios();
    setEditingUser(null);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
  };

  // Cálculo de estadísticas
  const getStats = () => {
    const total = usuarios.length;
    const byRole = ROLES.reduce((acc, role) => {
      acc[role] = usuarios.filter((u) => u.role === role).length;
      return acc;
    }, {});
    const byCompany = COMPANIES.reduce((acc, company) => {
      acc[company] = usuarios.filter((u) => u.company === company).length;
      return acc;
    }, {});
    const withPersonalRoutes = usuarios.filter(
      (u) => u.personal_routes?.length > 0,
    ).length;

    return { total, byRole, byCompany, withPersonalRoutes };
  };

  // Exportar a CSV
  const exportToCSV = () => {
    const headers = [
      "Nombre",
      "Correo",
      "Área",
      "Empresa",
      "Rol",
      "Sede",
      "Rol Ecommerce",
    ];
    const csvData = usuarios.map((user) => [
      user.nombre,
      user.correo,
      user.area,
      user.company || "N/A",
      user.role,
      sedes.find((s) => s.id === user.sede_id)?.nombre || "Sin Sede",
      user.ecommerce_rol || "N/A",
    ]);

    const csvContent = [headers, ...csvData]
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usuarios_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // ✅ NUEVO: Estadísticas por proceso
  const getUsersByProceso = () => {
    const procesos = {};
    usuarios.forEach((user) => {
      const proceso = user.proceso || "Sin Proceso";
      procesos[proceso] = (procesos[proceso] || 0) + 1;
    });
    return procesos;
  };

  const stats = getStats();

  return (
    <div className="admin-ug-container">
      <div className="admin-ug-main-header">
        <h2 className="admin-ug-main-title">
          <FaUserCog className="admin-ug-icon" />
          Gestión Centralizada de Usuarios
        </h2>
      </div>

      {/* Estadísticas justo debajo del título */}
      <div className="admin-ug-stats-section">
        <div className="admin-ug-stats-header">
          <div className="admin-ug-stats-actions">
            <button
              onClick={() => setShowStats(!showStats)}
              className="admin-ug-toggle-stats"
            >
              <FaChartBar /> {showStats ? "Ocultar" : "Mostrar"} Estadísticas
            </button>
            <button onClick={exportToCSV} className="admin-ug-export-btn">
              <FaDownload /> Exportar CSV
            </button>
          </div>
        </div>

        {showStats && (
          <div className="admin-ug-stats">
            <div className="admin-ug-stat-card">
              <FaUsers className="admin-ug-stat-icon" />
              <div className="admin-ug-stat-content">
                <span className="admin-ug-stat-number">{stats.total}</span>
                <span className="admin-ug-stat-label">Total Usuarios</span>
              </div>
            </div>
            <div className="admin-ug-stat-card">
              <FaBriefcase className="admin-ug-stat-icon" />
              <div className="admin-ug-stat-content">
                <span className="admin-ug-stat-number">
                  {stats.withPersonalRoutes}
                </span>
                <span className="admin-ug-stat-label">
                  Con Rutas Personalizadas
                </span>
              </div>
            </div>
            {Object.entries(stats.byRole).map(([role, count]) => (
              <div key={role} className="admin-ug-stat-card">
                <div className={`admin-ug-role-indicator role-${role}`}></div>
                <div className="admin-ug-stat-content">
                  <span className="admin-ug-stat-number">{count}</span>
                  <span className="admin-ug-stat-label">
                    {role.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UserForm
        onUserSaved={handleUserSaved}
        editingUser={editingUser}
        onCancelEdit={handleCancelEdit}
        sedes={sedes}
      />

      <UserList
        usuarios={usuarios}
        loading={loading}
        onEditUser={handleEditUser}
        onRefreshUsers={cargarUsuarios}
        onAsignarEquipo={(usuario) => setAsignandoEquipo(usuario)} // ✅ NUEVO
        sedes={sedes}
      />

      {/* ✅ NUEVO: Modal de asignar equipo */}
      {asignandoEquipo && (
        <AsignarEquipo
          lider={asignandoEquipo}
          onClose={() => setAsignandoEquipo(null)}
          onUpdated={cargarUsuarios}
        />
      )}
    </div>
  );
};
