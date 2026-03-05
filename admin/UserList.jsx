import React, { useState, useEffect, useMemo } from "react";
import { supabase, supabaseQuery } from "../../supabaseClient";
import {
  FaTrashAlt,
  FaEdit,
  FaSearch,
  FaDownload,
  FaCopy,
  FaUsers,
  FaChartBar,
  FaBriefcase,
  FaTimesCircle,
  FaMapMarkerAlt,
  FaShoppingCart,
} from "react-icons/fa";

const ROLES = [
  "super_admin",
  "admin",
  "empleado",
  "admin_empleado",
  "admin_cliente",
  "admin_proveedor",
];
const COMPANIES = ["Merkahorro", "Construahorro", "Megamayoristas"];
const ECOMMERCE_ROLES_LABELS = {
  ecommerce_admin_global: "Admin Global",
  ecommerce_admin_sede: "Admin Sede",
  ecommerce_picker: "Picker",
  ecommerce_auditor: "Auditor",
};
const API_URL = "https://pitpougbnibmfrjykzet.supabase.co/functions/v1";

export const UserList = ({
  usuarios,
  loading,
  onEditUser,
  onRefreshUsers,
  onAsignarEquipo,
  hideDeleteButton = false,
  hideBulkActions = false,
  sedes = [],
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkSelected, setBulkSelected] = useState([]);
  const [filterRole, setFilterRole] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterProceso, setFilterProceso] = useState(""); // ✅ NUEVO: Filtro por proceso
  const [filterSede, setFilterSede] = useState(""); // ✅ SEDES: Filtro por sede
  const [filterEcommerceRol, setFilterEcommerceRol] = useState(""); // ✅ ECOMMERCE ROL
  const [sortField, setSortField] = useState("nombre");
  const [sortDirection, setSortDirection] = useState("asc");
  const [showStats, setShowStats] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

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

  const filteredAndSortedUsuarios = useMemo(() => {
    let filtered = usuarios.filter((user) => {
      const matchesSearch =
        user.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.correo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.company &&
          user.company.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesArea = !filterArea || user.area === filterArea;
      const matchesProceso = !filterProceso || user.proceso === filterProceso; // ✅ NUEVO
      const matchesCompany = !filterCompany || user.company === filterCompany;
      const matchesRole = !filterRole || user.role === filterRole;
      const matchesSede = !filterSede || user.sede_id === filterSede; // ✅ SEDES
      const matchesEcomRol =
        !filterEcommerceRol || user.ecommerce_rol === filterEcommerceRol; // ✅ ECOMMERCE ROL
      return (
        matchesSearch &&
        matchesArea &&
        matchesProceso &&
        matchesCompany &&
        matchesRole &&
        matchesSede &&
        matchesEcomRol
      );
    });

    filtered.sort((a, b) => {
      let aValue = a[sortField] || "";
      let bValue = b[sortField] || "";

      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [
    usuarios,
    searchTerm,
    filterRole,
    filterCompany,
    filterArea,
    filterProceso,
    filterSede, // ✅ SEDES
    filterEcommerceRol, // ✅ ECOMMERCE ROL
    sortField,
    sortDirection,
  ]);

  const handleDelete = async (uid, nombre) => {
    if (
      !window.confirm(
        `¿Estás seguro de eliminar a ${nombre}? Esta acción es irreversible.`,
      )
    )
      return;

    setError(null);
    setStatus(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    try {
      const response = await fetch(`${API_URL}/delete-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Fallo en la eliminación (Edge Function).",
        );
      }

      setStatus("Usuario eliminado con éxito.");
      if (onRefreshUsers) onRefreshUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkSelect = (userId) => {
    setBulkSelected((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const handleSelectAll = () => {
    if (bulkSelected.length === filteredAndSortedUsuarios.length) {
      setBulkSelected([]);
    } else {
      setBulkSelected(filteredAndSortedUsuarios.map((u) => u.user_id));
    }
  };

  const handleBulkRoleChange = async (newRole) => {
    if (bulkSelected.length === 0) return;

    const confirmMsg = `¿Cambiar el rol a "${newRole}" para ${bulkSelected.length} usuarios?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabaseQuery(() =>
        supabase
          .from("profiles")
          .update({ role: newRole })
          .in("user_id", bulkSelected),
      );

      if (error) throw error;

      setStatus(`Rol actualizado para ${bulkSelected.length} usuarios.`);
      setBulkSelected([]);
      if (onRefreshUsers) onRefreshUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkCompanyChange = async (newCompany) => {
    if (bulkSelected.length === 0) return;

    const confirmMsg = `¿Cambiar la empresa a "${newCompany}" para ${bulkSelected.length} usuarios?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabaseQuery(() =>
        supabase
          .from("profiles")
          .update({ company: newCompany })
          .in("user_id", bulkSelected),
      );

      if (error) throw error;

      setStatus(`Empresa actualizada para ${bulkSelected.length} usuarios.`);
      setBulkSelected([]);
      if (onRefreshUsers) onRefreshUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  // ✅ SEDES: Cambio masivo de sede
  const handleBulkSedeChange = async (newSedeId) => {
    if (bulkSelected.length === 0) return;

    const sedeName = sedes.find((s) => s.id === newSedeId)?.nombre || newSedeId;
    const confirmMsg = `¿Cambiar la sede a "${sedeName}" para ${bulkSelected.length} usuarios?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabaseQuery(() =>
        supabase
          .from("profiles")
          .update({ sede_id: newSedeId })
          .in("user_id", bulkSelected),
      );

      if (error) throw error;

      // También actualizar wc_pickers para los que sean pickers
      const pickerUsers = usuarios.filter(
        (u) => bulkSelected.includes(u.user_id) && u.role === "picker",
      );
      if (pickerUsers.length > 0) {
        const emails = pickerUsers.map((u) => u.correo);
        await supabaseQuery(() =>
          supabase
            .from("wc_pickers")
            .update({ sede_id: newSedeId })
            .in("email", emails),
        );
      }

      setStatus(`Sede actualizada para ${bulkSelected.length} usuarios.`);
      setBulkSelected([]);
      if (onRefreshUsers) onRefreshUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  // ✅ CORRECCIÓN: Agregar proceso a la exportación CSV
  const exportToCSV = () => {
    const headers = [
      "Nombre",
      "Correo",
      "Área",
      "Proceso",
      "Empresa",
      "Rol",
      "Sede",
      "Rol Ecommerce",
      "Última Actividad",
    ];
    const csvData = filteredAndSortedUsuarios.map((user) => [
      user.nombre,
      user.correo,
      user.area,
      user.proceso || "N/A", // ✅ Incluir proceso
      user.company || "N/A",
      user.role,
      sedes.find((s) => s.id === user.sede_id)?.nombre || "Sin Sede", // ✅ SEDES
      ECOMMERCE_ROLES_LABELS[user.ecommerce_rol] || "N/A", // ✅ ECOMMERCE ROL
      lastActivity[user.user_id]?.last_active_at
        ? new Date(lastActivity[user.user_id].last_active_at).toLocaleString()
        : "Nunca",
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

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const stats = getStats();

  // ✅ NUEVO: Obtener lista única de procesos
  const procesosUnicos = [
    ...new Set(usuarios.map((u) => u.proceso).filter(Boolean)),
  ].sort();

  return (
    <div className="admin-ug-list-container">
      {/* Feedback */}
      {status && <p className="admin-ug-success">{status}</p>}
      {error && (
        <p className="admin-ug-error">
          <FaTimesCircle /> {error}
        </p>
      )}

      {/* Filtros avanzados */}
      <div className="admin-ug-advanced-filters">
        <div className="admin-ug-search-section">
          <h3 className="admin-ug-list-title">
            Lista de Usuarios ({filteredAndSortedUsuarios.length} de{" "}
            {usuarios.length})
          </h3>
          <div className="admin-ug-filter-controls">
            <div className="admin-ug-search-container">
              <FaSearch className="admin-ug-search-icon" />
              <input
                type="text"
                placeholder="Buscar por nombre, correo o empresa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="admin-ug-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="admin-ug-clear-search"
                  title="Limpiar búsqueda"
                >
                  &times;
                </button>
              )}
            </div>

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="admin-ug-filter-select"
            >
              <option value="">Todos los roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.toUpperCase()}
                </option>
              ))}
            </select>

            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="admin-ug-filter-select"
            >
              <option value="">Todas las empresas</option>
              {COMPANIES.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>

            {/* ✅ NUEVO: Filtro por Proceso */}
            <select
              value={filterProceso}
              onChange={(e) => setFilterProceso(e.target.value)}
              className="admin-ug-filter-select"
            >
              <option value="">Todos los Procesos</option>
              {procesosUnicos.map((proceso) => (
                <option key={proceso} value={proceso}>
                  {proceso}
                </option>
              ))}
            </select>

            {/* ✅ SEDES: Filtro por Sede */}
            {sedes.length > 0 && (
              <select
                value={filterSede}
                onChange={(e) => setFilterSede(e.target.value)}
                className="admin-ug-filter-select"
              >
                <option value="">Todas las Sedes</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            )}

            {/* ✅ ECOMMERCE ROL: Filtro */}
            <select
              value={filterEcommerceRol}
              onChange={(e) => setFilterEcommerceRol(e.target.value)}
              className="admin-ug-filter-select"
            >
              <option value="">Todos los roles ecommerce</option>
              {Object.entries(ECOMMERCE_ROLES_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Operaciones masivas - Solo para super_admin */}
        {!hideBulkActions && bulkSelected.length > 0 && (
          <div className="admin-ug-bulk-actions">
            <span className="admin-ug-bulk-count">
              {bulkSelected.length} usuarios seleccionados
            </span>
            <div className="admin-ug-bulk-buttons">
              <select
                onChange={(e) =>
                  e.target.value && handleBulkRoleChange(e.target.value)
                }
                defaultValue=""
                className="admin-ug-bulk-role-select"
              >
                <option value="">Cambiar rol masivo...</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.toUpperCase()}
                  </option>
                ))}
              </select>

              <select
                onChange={(e) =>
                  e.target.value && handleBulkCompanyChange(e.target.value)
                }
                defaultValue=""
                className="admin-ug-bulk-role-select"
              >
                <option value="">Cambiar empresa masivo...</option>
                {COMPANIES.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>

              {/* ✅ SEDES: Cambio masivo de sede */}
              {sedes.length > 0 && (
                <select
                  onChange={(e) =>
                    e.target.value && handleBulkSedeChange(e.target.value)
                  }
                  defaultValue=""
                  className="admin-ug-bulk-role-select"
                >
                  <option value="">Cambiar sede masivo...</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={() => setBulkSelected([])}
                className="admin-ug-bulk-clear"
              >
                Limpiar selección
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="admin-ug-table-wrapper">
        <table className="admin-ug-users-table">
          <thead>
            <tr>
              {!hideBulkActions && (
                <th>
                  <input
                    type="checkbox"
                    checked={
                      bulkSelected.length ===
                        filteredAndSortedUsuarios.length &&
                      filteredAndSortedUsuarios.length > 0
                    }
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              <th
                onClick={() => handleSort("nombre")}
                className="admin-ug-sortable"
              >
                Nombre{" "}
                {sortField === "nombre" &&
                  (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => handleSort("correo")}
                className="admin-ug-sortable"
              >
                Correo
              </th>
              <th>Área</th>
              <th>Proceso</th>
              <th>Empresa</th>
              <th>Sede</th>
              <th>Rol</th>
              <th>Rol Ecommerce</th>
              <th>Permisos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedUsuarios.map((user) => {
              return (
                <tr key={user.user_id} className="admin-ug-table-row">
                  {!hideBulkActions && (
                    <td>
                      <input
                        type="checkbox"
                        checked={bulkSelected.includes(user.user_id)}
                        onChange={() => handleBulkSelect(user.user_id)}
                      />
                    </td>
                  )}
                  <td className="admin-ug-user-name">
                    <div className="admin-ug-name-container">
                      <span className="admin-ug-name">{user.nombre}</span>
                    </div>
                  </td>
                  <td>{user.correo}</td>
                  <td>{user.area}</td>
                  <td>{user.proceso || "-"}</td>
                  <td>
                    <span
                      className={`admin-ug-company-tag company-${user.company?.toLowerCase()}`}
                    >
                      {user.company || "N/A"}
                    </span>
                  </td>
                  <td>
                    <span className="admin-ug-sede-tag">
                      <FaMapMarkerAlt
                        style={{ marginRight: 4, fontSize: "0.75rem" }}
                      />
                      {sedes.find((s) => s.id === user.sede_id)?.nombre ||
                        "Sin Sede"}
                    </span>
                  </td>
                  <td
                    className={`admin-ug-role-tag admin-ug-role-${user.role}`}
                  >
                    {user.role.toUpperCase()}
                  </td>
                  <td>
                    {user.ecommerce_rol ? (
                      <span
                        className={`admin-ug-ecommerce-rol-tag rol-${user.ecommerce_rol}`}
                      >
                        <FaShoppingCart className="ecom-icon" />
                        {ECOMMERCE_ROLES_LABELS[user.ecommerce_rol] ||
                          user.ecommerce_rol}
                      </span>
                    ) : (
                      <span className="admin-ug-ecommerce-rol-empty">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`admin-ug-permissions-badge ${
                        user.personal_routes ? "custom" : "default"
                      }`}
                    >
                      {user.personal_routes
                        ? `Personalizado (${user.personal_routes.length})`
                        : "Base de Rol"}
                    </span>
                  </td>
                  <td className="admin-ug-action-cell">
                    <button
                      onClick={() => onEditUser(user)}
                      title="Editar Perfil y Rutas"
                      className="admin-ug-edit-btn"
                    >
                      <FaEdit />
                    </button>

                    {/* ✅ Botón de Asignar Equipo si tiene la ruta de gestion-equipo */}
                    {(() => {
                      // Debug: Ver las rutas del usuario
                      const tieneRutaTeamManager = user.personal_routes?.some(
                        (r) => r.path === "/gestion-equipo",
                      );

                      // Log solo para usuarios con rutas personalizadas
                      if (
                        user.personal_routes &&
                        user.personal_routes.length > 0
                      ) {
                        console.log(`[UserList] ${user.nombre}:`, {
                          rutas: user.personal_routes.map((r) => r.path),
                          tieneTeamManager: tieneRutaTeamManager,
                          onAsignarEquipoExiste: !!onAsignarEquipo,
                        });
                      }

                      return tieneRutaTeamManager && onAsignarEquipo ? (
                        <button
                          onClick={() => onAsignarEquipo(user)}
                          title="Asignar Equipo a Cargo"
                          className="admin-ug-team-btn"
                          style={{
                            background: "#28a745",
                            color: "white",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "none",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "0.9rem",
                            transition: "all 0.2s",
                            marginRight: "5px",
                          }}
                          onMouseOver={(e) =>
                            (e.currentTarget.style.background = "#218838")
                          }
                          onMouseOut={(e) =>
                            (e.currentTarget.style.background = "#28a745")
                          }
                        >
                          <FaUsers /> Equipo
                        </button>
                      ) : null;
                    })()}

                    {!hideDeleteButton && (
                      <button
                        onClick={() => handleDelete(user.user_id, user.nombre)}
                        title="Eliminar Usuario"
                        className="admin-ug-delete-btn"
                      >
                        <FaTrashAlt />
                      </button>
                    )}

                    <button
                      onClick={() => navigator.clipboard.writeText(user.correo)}
                      title="Copiar email"
                      className="admin-ug-copy-btn"
                    >
                      <FaCopy />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredAndSortedUsuarios.length === 0 && searchTerm && (
              <tr>
                <td colSpan="12" className="admin-ug-no-results">
                  No se encontraron usuarios que coincidan con "{searchTerm}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
