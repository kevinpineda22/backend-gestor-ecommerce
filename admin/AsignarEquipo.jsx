import React, { useState, useEffect } from "react";
import { supabase, supabaseQuery } from "../../supabaseClient";
import {
  FaUsers,
  FaUserPlus,
  FaUserMinus,
  FaSearch,
  FaTimes,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";
import "./AdminUsuarios.css";

/**
 * Componente para asignar/desasignar empleados a un líder específico
 * 
 * Este modal permite seleccionar qué empleados reportan directamente a un usuario.
 * No hay restricciones de área/empresa - es completamente flexible.
 */
export const AsignarEquipo = ({ lider, onClose, onUpdated }) => {
  const [todosLosUsuarios, setTodosLosUsuarios] = useState([]);
  const [subordinadosActuales, setSubordinadosActuales] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [lider.user_id]);

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Cargar todos los usuarios (excepto super_admin y el líder mismo)
      const { data: allUsers, error: usersError } = await supabaseQuery(() =>
        supabase
          .from("profiles")
          .select("user_id, nombre, correo, area, company, role, proceso, lider_id")
          .neq("role", "super_admin")
          .neq("user_id", lider.user_id)
          .order("nombre")
      );

      if (usersError) throw usersError;

      // 2. Filtrar subordinados actuales
      const subordinados = allUsers.filter(u => u.lider_id === lider.user_id);
      
      setTodosLosUsuarios(allUsers || []);
      setSubordinadosActuales(subordinados);
    } catch (err) {
      console.error("Error cargando datos:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const esSubordinado = (userId) => {
    return subordinadosActuales.some(s => s.user_id === userId);
  };

  const toggleSubordinado = async (usuario) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const esActualmenteSubordinado = esSubordinado(usuario.user_id);
      
      if (esActualmenteSubordinado) {
        // Quitar del equipo (poner lider_id en NULL)
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ lider_id: null })
          .eq("user_id", usuario.user_id);

        if (updateError) throw updateError;

        setSubordinadosActuales(prev => prev.filter(s => s.user_id !== usuario.user_id));
        setSuccess(`${usuario.nombre} removido del equipo`);
      } else {
        // Agregar al equipo
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ lider_id: lider.user_id })
          .eq("user_id", usuario.user_id);

        if (updateError) throw updateError;

        setSubordinadosActuales(prev => [...prev, { ...usuario, lider_id: lider.user_id }]);
        setSuccess(`${usuario.nombre} agregado al equipo`);
      }

      // Notificar al componente padre que hubo cambios
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error("Error actualizando subordinado:", err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtrar usuarios según búsqueda
  const usuariosFiltrados = todosLosUsuarios.filter(u => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      u.nombre?.toLowerCase().includes(search) ||
      u.correo?.toLowerCase().includes(search) ||
      u.area?.toLowerCase().includes(search) ||
      u.proceso?.toLowerCase().includes(search)
    );
  });

  // Separar en dos listas: subordinados y disponibles
  const subordinadosFiltrados = usuariosFiltrados.filter(u => esSubordinado(u.user_id));
  const disponiblesFiltrados = usuariosFiltrados.filter(u => !esSubordinado(u.user_id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-ug-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <FaUsers /> Asignar Equipo a {lider.nombre}
          </h2>
          <button onClick={onClose} className="modal-close-btn">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          {/* Información del líder */}
          <div className="admin-ug-info-box" style={{ marginBottom: '20px' }}>
            <p><strong>Líder:</strong> {lider.nombre}</p>
            <p><strong>Correo:</strong> {lider.correo}</p>
            <p><strong>Área:</strong> {lider.area || 'Sin asignar'}</p>
            <p><strong>Empresa:</strong> {lider.company || 'Sin asignar'}</p>
          </div>

          {/* Feedback */}
          {error && (
            <div className="admin-ug-error" style={{ marginBottom: '15px' }}>
              <FaExclamationTriangle /> {error}
            </div>
          )}
          {success && (
            <div className="admin-ug-success" style={{ marginBottom: '15px' }}>
              <FaCheckCircle /> {success}
            </div>
          )}

          {/* Buscador */}
          <div className="admin-ug-search-container" style={{ marginBottom: '20px' }}>
            <FaSearch className="admin-ug-search-icon" />
            <input
              type="text"
              placeholder="Buscar por nombre, correo, área o proceso..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="admin-ug-search-input"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="admin-ug-clear-search"
              >
                &times;
              </button>
            )}
          </div>

          {loading ? (
            <div className="admin-ug-loading">Cargando empleados...</div>
          ) : (
            <div className="asignar-equipo-container">
              {/* Lista de subordinados actuales */}
              <div className="asignar-equipo-section">
                <h3>
                  <FaUsers /> Equipo Actual ({subordinadosFiltrados.length})
                </h3>
                <div className="asignar-equipo-list">
                  {subordinadosFiltrados.length === 0 ? (
                    <p className="admin-ug-empty-message">
                      {searchTerm 
                        ? "No hay subordinados que coincidan con la búsqueda"
                        : "No hay empleados asignados aún"}
                    </p>
                  ) : (
                    subordinadosFiltrados.map(usuario => (
                      <div key={usuario.user_id} className="asignar-equipo-item">
                        <div className="asignar-equipo-item-info">
                          <strong>{usuario.nombre}</strong>
                          <span className="asignar-equipo-item-details">
                            {usuario.correo}
                            {usuario.area && ` • ${usuario.area}`}
                            {usuario.proceso && ` • ${usuario.proceso}`}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleSubordinado(usuario)}
                          disabled={saving}
                          className="asignar-equipo-btn remove"
                          title="Remover del equipo"
                        >
                          <FaUserMinus /> Remover
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Lista de empleados disponibles */}
              <div className="asignar-equipo-section">
                <h3>
                  <FaUserPlus /> Empleados Disponibles ({disponiblesFiltrados.length})
                </h3>
                <div className="asignar-equipo-list">
                  {disponiblesFiltrados.length === 0 ? (
                    <p className="admin-ug-empty-message">
                      {searchTerm 
                        ? "No hay empleados disponibles que coincidan"
                        : "Todos los empleados ya están asignados"}
                    </p>
                  ) : (
                    disponiblesFiltrados.map(usuario => (
                      <div key={usuario.user_id} className="asignar-equipo-item">
                        <div className="asignar-equipo-item-info">
                          <strong>{usuario.nombre}</strong>
                          <span className="asignar-equipo-item-details">
                            {usuario.correo}
                            {usuario.area && ` • ${usuario.area}`}
                            {usuario.proceso && ` • ${usuario.proceso}`}
                            {usuario.lider_id && " • Ya tiene otro líder"}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleSubordinado(usuario)}
                          disabled={saving}
                          className="asignar-equipo-btn add"
                          title="Agregar al equipo"
                        >
                          <FaUserPlus /> Agregar
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="admin-ug-btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
