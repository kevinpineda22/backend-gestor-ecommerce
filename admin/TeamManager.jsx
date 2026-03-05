import React, { useState, useEffect } from "react";
import { supabase, supabaseQuery } from "../../supabaseClient";
import {
  FaUserTie,
  FaUsersCog,
  FaChartBar,
  FaExclamationTriangle,
} from "react-icons/fa";
import { TeamManagerTable } from "./TeamManagerTable"; // ✅ Componente Nuevo
import { TeamManagerForm } from "./TeamManagerForm"; // ✅ Componente Nuevo
// import "./AdminUsuarios.css"; // ❌ Eliminada referencia a estilos conflictivos
import "./TeamManager.css";

export const TeamManager = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [subordinates, setSubordinates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [error, setError] = useState(null);
  const [userCompany, setUserCompany] = useState(""); // ✅ Para tema dinámico

  useEffect(() => {
    initializeManager();
  }, []);

  const initializeManager = async () => {
    setLoading(true);
    try {
      // 1. Obtener usuario actual
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("No hay sesión activa");

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (!profile) throw new Error("Perfil no encontrado");
      
      console.log("[TeamManager] Usuario cargado:", profile.nombre);
      setCurrentUser(profile);
      setUserCompany(profile.company || "merkahorro"); // ✅ Configurar tema
      
    } catch (err) {
      console.error("Error inicializando TeamManager:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Efecto para cargar subordinados una vez tenemos el usuario actual
  useEffect(() => {
    if (currentUser) {
      loadSubordinates();
    }
  }, [currentUser]);

  const loadSubordinates = async () => {
    if (!currentUser) {
      console.log("[TeamManager] No hay currentUser, abortando carga de subordinados");
      return;
    }
    
    console.log("[TeamManager] Cargando subordinados de:", currentUser.user_id);
    
    let query = supabase
      .from("profiles")
      .select("user_id, nombre, area, correo, company, role, personal_routes, proceso, lider_id")
      .eq("lider_id", currentUser.user_id) // Solo empleados directos
      .neq("role", "super_admin") // Excluir super_admins
      .order("nombre", { ascending: true }); // Ordenar alfabéticamente
      
    const { data, error } = await supabaseQuery(() => query);
    
    if (error) {
      console.error("[TeamManager] Error cargando subordinados:", error);
      setError("Error al cargar tu equipo: " + error.message);
      setSubordinates([]);
    } else {
      console.log(`[TeamManager] ${data?.length || 0} subordinados cargados`);
      setSubordinates(data || []);
    }
  };

  const handleEditUser = async (usuario) => {
    // ✅ Validación de seguridad: Verificar que el usuario a editar sea subordinado directo
    if (usuario.lider_id !== currentUser.user_id) {
      setError(`⚠️ No tienes permiso para editar a ${usuario.nombre}. Solo puedes gestionar a tu equipo directo.`);
      console.warn("[TeamManager] Intento de edición no autorizado:", {
        usuario: usuario.user_id,
        liderEsperado: currentUser.user_id,
        liderReal: usuario.lider_id
      });
      return;
    }
    
    console.log("[TeamManager] Editando usuario autorizado:", usuario.nombre);
    setError(null); // Limpiar errores previos
    setEditingUser(usuario);
  };

  // ✅ Obtener rutas que el líder puede asignar (solo las que él tiene)
  const getRutasAsignables = () => {
    // Retornamos los objetos completos de rutas que tiene asignados el líder
    if (!currentUser?.personal_routes) return [];
    return currentUser.personal_routes;
  };

  // Estadísticas simples para el manager
  const getStats = () => {
    return {
      total: subordinates.length,
      roles: [...new Set(subordinates.map(u => u.role))].length,
      activeRoutes: subordinates.filter(u => u.personal_routes?.length > 0).length
    };
  };

  const stats = getStats();

  if (loading && !currentUser) return <div className="tm-loading-spinner"></div>;
  
  if (!currentUser) return <div className="tm-error"><FaExclamationTriangle /> Error cargando usuario.</div>;

  return (
    <div className={`tm-container theme-${userCompany.toLowerCase()}`}>
      <div className="tm-main-header">
        <h2 className="tm-main-title">
          <FaUserTie className="tm-icon" />
          Mi Equipo
        </h2>
        <button
          onClick={() => {
            setCreatingUser(true);
            setEditingUser(null);
          }}
          className="tm-create-btn"
          disabled={creatingUser}
        >
          + Crear Nuevo Empleado
        </button>
      </div>
      
      {error && (
        <div className="tm-error">
          <FaExclamationTriangle /> {error}
        </div>
      )}

      <div className="tm-stats-section">
        <div className="tm-stats-header">
          <div className="tm-stats-actions">
            <button
              onClick={() => setShowStats(!showStats)}
              className="tm-toggle-stats"
            >
              <FaChartBar /> {showStats ? "Ocultar" : "Mostrar"} Resumen
            </button>
          </div>
        </div>

        {showStats && (
            <div className="tm-stats">
              <div className="tm-stat-card">
                <FaUsersCog className="tm-stat-icon" />
                <div className="tm-stat-content">
                  <span className="tm-stat-number">{stats.total}</span>
                  <span className="tm-stat-label">Mis Colaboradores</span>
                </div>
              </div>
              <div className="tm-stat-card">
                <div className="tm-role-indicator role-admin"></div>
                <div className="tm-stat-content">
                  <span className="tm-stat-number">{stats.activeRoutes}</span>
                  <span className="tm-stat-label">Con Rutas Activadas</span>
                </div>
              </div>
            </div>
        )}
      </div>

      {/* ℹ️ Mensaje informativo sobre asignación manual */}
      <div className="tm-info-box">
        <p style={{ margin: 0, fontSize: "0.95rem" }}>
          <strong>ℹ️ Nota:</strong> Los empleados que crees aquí automáticamente te reportarán a ti. 
          Solo puedes asignarles rutas que tú ya tienes activadas.
        </p>
      </div>

      {/* ✅ Formulario para crear nuevo empleado */}
      {creatingUser && (
        <TeamManagerForm
          onSave={() => {
            loadSubordinates();
            setCreatingUser(false);
          }}
          user={null}
          onCancel={() => setCreatingUser(false)}
          availableRoutes={getRutasAsignables()} // Solo rutas que el líder tiene
          leaderId={currentUser.user_id} // ✅ Auto-asignar como subordinado
        />
      )}

      {/* ✅ Formulario para editar subordinado existente */}
      {editingUser && (
        <TeamManagerForm
          onSave={() => {
            loadSubordinates();
            setEditingUser(null);
          }}
          user={editingUser}
          onCancel={() => setEditingUser(null)}
          availableRoutes={getRutasAsignables()} // Solo rutas que el líder tiene
        />
      )}

      {!loading && subordinates.length === 0 && !creatingUser ? (
        <div className="tm-empty-state">
          <FaUsersCog style={{ fontSize: '64px', color: '#ccc', marginBottom: '20px' }} />
          <h3>No tienes empleados a tu cargo aún</h3>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            Haz clic en "Crear Nuevo Empleado" para agregar tu primer colaborador.
          </p>
          <p style={{ fontSize: '14px', color: '#999' }}>
            Los empleados que crees automáticamente te reportarán a ti.
          </p>
        </div>
      ) : !creatingUser ? (
        <TeamManagerTable
          users={subordinates}
          isLoading={loading}
          onEdit={(user) => {
             // Traer rutas personalizadas completas al editar
             // (Si subordinates ya tiene esa info, la pasamos directo)
             setEditingUser(user);
          }}
          currentUserCompany={userCompany}
        />
      ) : null}
    </div>
  );
};
