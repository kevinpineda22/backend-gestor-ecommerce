import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaEdit,
  FaTrashAlt,
  FaSortUp,
  FaSortDown,
  FaFilter,
  FaUserShield,
} from "react-icons/fa";
import "./TeamManager.css";

const ROLES = ["empleado", "admin_empleado", "picker"];
const COMPANIES = ["Merkahorro", "Construahorro", "Megamayoristas"];

export const TeamManagerTable = ({
  users,
  onEdit,
  isLoading,
  currentUserCompany,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterCompany, setFilterCompany] = useState(""); // Aunque normalmente verán su propia empresa
  const [sortField, setSortField] = useState("nombre");
  const [sortDirection, setSortDirection] = useState("asc");

  // --- Filtros ---
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.correo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.documento?.includes(searchTerm);

    const matchesRole = filterRole ? user.role === filterRole : true;
    const matchesCompany = filterCompany ? user.company === filterCompany : true;

    return matchesSearch && matchesRole && matchesCompany;
  });

  // --- Ordenamiento ---
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aValue = a[sortField]?.toString().toLowerCase() || "";
    const bValue = b[sortField]?.toString().toLowerCase() || "";

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? <FaSortUp /> : <FaSortDown />;
  };

  if (isLoading) {
    return (
      <div className="tm-table-loading">
        <div className="tm-spinner"></div>
        <p>Cargando equipo...</p>
      </div>
    );
  }

  return (
    <div className="tm-table-container">
      {/* --- Controles de Filtro (Diseño Nuevo) --- */}
      <div className="tm-filters-bar" style={{ display: 'block' }}>
        <div className="tm-search-wrapper" style={{ width: "100%", maxWidth: "100%" }}>
          <FaSearch className="tm-search-icon" />
          <input
            type="text"
            className="tm-search-input"
            placeholder="Buscar por nombre, correo o documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* --- Tabla --- */}
      <div className="tm-table-responsive">
        <table className="tm-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("nombre")}>
                Nombre {getSortIcon("nombre")}
              </th>
              <th onClick={() => handleSort("correo")}>
                Correo {getSortIcon("correo")}
              </th>
               <th>Área / Proceso</th>
              <th>Empresa</th>
              <th>Rol</th>
              <th>Permisos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.length > 0 ? (
              sortedUsers.map((user) => (
                <tr key={user.user_id}>
                  <td>
                    <div className="tm-user-info">
                      <div className="tm-avatar">
                        {user.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="tm-user-details">
                         <span className="tm-user-name">{user.nombre}</span>
                         <span className="tm-user-doc">{user.documento || "Sin ID"}</span>
                      </div>
                    </div>
                  </td>
                  <td>{user.correo}</td>
                  <td>
                     <div className="tm-area-tag">{user.area}</div>
                     <small>{user.proceso}</small>
                  </td>
                  <td>
                    <span className={`tm-company-badge ${user.company?.toLowerCase()}`}>
                       {user.company}
                    </span>
                  </td>
                  <td>
                     <span className="tm-role-badge">{user.role}</span>
                  </td>
                  <td>
                    <span className={`tm-status-badge ${user.personal_routes ? 'custom' : 'default'}`}>
                        {user.personal_routes ? 'Personalizado' : 'Rol Base'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="tm-action-btn edit"
                      onClick={() => onEdit(user)}
                      title="Gestionar Miembro"
                    >
                      <FaUserShield /> Gestionar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="tm-empty-row">
                  No se encontraron miembros del equipo con esos criterios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="tm-table-footer">
          Mostrando {sortedUsers.length} de {users.length} colaboradores
      </div>
    </div>
  );
};
