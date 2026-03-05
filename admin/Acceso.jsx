import React, { useEffect, useState, memo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  FaHome,
  FaSignOutAlt,
  FaFolderPlus,
  FaTrashAlt,
  FaEdit,
  FaClipboardList,
  FaMoneyBillWave,
  FaCalendarAlt,
  FaTruck,
  FaUser,
  FaAppleAlt,
  FaDatabase,
  FaWallet,
  FaChartPie,
  FaBriefcaseMedical,
  FaFileArchive,
  FaTools,
  FaFolder,
  FaQuestionCircle,
  FaChevronDown,
  FaUserCog,
  FaSearch,
  FaTimes,
  FaFilter,
  FaChartLine,
  FaCodeBranch,
  FaLaptopCode,
  FaCompass,
  FaShoppingBag,
  FaTags,
  FaBoxes,
  FaMobileAlt,
  FaSync,
  FaUserPlus,
  FaCalendarCheck,
  FaShippingFast,
  FaEye,
  FaRoute,
  FaTshirt,
  FaUserTie,
  FaWpforms,
  FaWarehouse,
  FaDolly,
  FaKey,
  FaCheckDouble,
  FaTruckLoading,
  FaUserTag,
  FaUsers,
  FaMotorcycle,
  FaChartBar,
  FaBrain,
  FaStore,
  FaHardHat,
  FaPeopleCarry,
} from "react-icons/fa";
import { IoPersonAddSharp } from "react-icons/io5";
import { GrUserAdmin } from "react-icons/gr";
import { MdOutlineDateRange } from "react-icons/md";
import { supabase, supabaseQuery } from "../../supabaseClient";
import "./Acceso.css";
import { getAssetUrl } from "../../config/storage";
import masterRoutes from "../../data/masterRoutes"; // ✅ Importar masterRoutes para los grupos

// Mapeo de íconos
const iconMap = {
  "Historial de Gastos": <FaClipboardList />,
  "Historial de Transporte": <FaClipboardList />,
  "Historial Cartera": <FaWallet />,
  "Historial Sociodemográfico": <FaUser />,
  "Historial formulario Perfil": <FaUser />,
  Gastos: <FaMoneyBillWave />,
  "Gestión de Gastos": <FaMoneyBillWave />,
  "Reserva de salones": <FaCalendarAlt />,
  Transporte: <FaTruck />,
  "Perfil gestión humana": <FaUser />,
  "Reposiciones Fruver": <FaAppleAlt />,
  "Base de datos Postulaciones": <FaDatabase />,
  Dashboards: <FaChartPie />,
  "Dashboard Postulaciones": <FaChartPie />,
  "Dashboard Transporte": <FaChartPie />,
  "Dashboard Gastos": <FaChartPie />,
  "Panel Examenes Medicos": <FaBriefcaseMedical />,
  "Panel Documentacion": <FaFileArchive />,
  "Admin Contratación Virtual": <GrUserAdmin />,
  "Formulario Perfil Sociodemográfico": <FaUser />,
  "Solicitud de Personal": <IoPersonAddSharp />,
  Mantenimiento: <FaTools />,
  "Gestión de Entrevistas": <MdOutlineDateRange />,
  "Administración de Usuarios": <FaUserCog />,
  "Inventario Operario": <FaTools />,
  "Administrador Inventario": <FaTools />,
  "Scanner Inventario": <FaTools />,
  "Monitor Actividad": <FaChartPie />,
  "Gestión Documental": <FaFolder />,

  // Nuevos íconos agregados
  "Monitor de Actividades": <FaChartLine />,
  "Solicitud de Desarrollo": <FaCodeBranch />,
  "Administrador Desarrollo": <FaLaptopCode />,
  "Admin Direcciones": <FaCompass />,
  "Desarrollo Compras": <FaShoppingBag />,
  "Admin Promociones": <FaTags />,
  "Desarrollo inventarios-ventas": <FaBoxes />,
  "Surtido Móvil": <FaMobileAlt />,
  "Sincronizar Siesa → Supabase": <FaSync />,
  "Admin Vacantes": <FaUserPlus />,
  "Programador de Horarios": <FaCalendarCheck />,
  "Gestión Pedidos": <FaShippingFast />,
  "Vista Picker": <FaEye />,
  "Admin Trazabilidad": <FaRoute />,
  "Admin Dotación": <FaTshirt />,
  "Empleado Dotación": <FaUserTie />,
  "Formulario Dotación": <FaWpforms />,
  "Admin Inventarios Generales": <FaWarehouse />,
  "Empleado Inventarios Generales": <FaDolly />,
  "Gestión de Tokens": <FaKey />,
  "Panel de Aprobaciones": <FaCheckDouble />,
  "Crear Empleado": <FaUserPlus />,
  "Crear Proveedor": <FaTruckLoading />,
  "Crear Cliente": <FaUserTag />,
  "Gestión de Transporte": <FaTruck />,
  "Dashboards Generales": <FaChartPie />,
  "Mantenimiento General": <FaTools />,
  "Mantenimiento Tareas": <FaTools />,
  "Administrador Dotacion": <FaTshirt />,
  
  // Iconos faltantes agregados
  "Gestión de Equipo (Líderes)": <FaUsers />,
  "Desarrollo Domicilios": <FaMotorcycle />,
  "Dashboard Sociodemográfico": <FaChartBar />,
  "Centro de Inteligencia": <FaBrain />,
  "Gestión Pickers": <FaPeopleCarry />,
  "Gestor E-commerce": <FaStore />,
  "EPP (Equipos de Protección)": <FaHardHat />,
  "Reserva de Salones": <FaCalendarAlt />,
  "Formulario Sociodemográfico": <FaWpforms />,
};

// Mapa de rutas a grupos para el filtrado
const pathToGroupMap = new Map(masterRoutes.map((r) => [r.path, r.group]));
const availableGroups = [
  "Todos",
  ...new Set(masterRoutes.map((r) => r.group).filter(Boolean)),
].sort();

const MemoizedAccessButton = memo(
  ({ item, handleNavigation, provided, snapshot }) => (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      className={`acc-panel-button ${
        snapshot.isDragging ? "is-dragging-item" : ""
      }`}
      onClick={() => handleNavigation(item.path)}
      style={provided.draggableProps.style}
    >
      <span className="acc-button-icon">
        {iconMap[item.label] || <FaClipboardList />}
      </span>
      <span className="acc-button-text">{item.label}</span>
    </div>
  )
);

export const Acceso = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const correoUsuario = localStorage.getItem("correo_empleado");
  const empleado = JSON.parse(localStorage.getItem("empleado_info") || "{}");

  const [estructura, setEstructura] = useState({ sin_carpeta: [] });
  const [nuevaCarpetaNombre, setNuevaCarpetaNombre] = useState("");
  const [editando, setEditando] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [greeting, setGreeting] = useState("");
  const [userName, setUserName] = useState("");
  const [openFolders, setOpenFolders] = useState({});
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userCompany, setUserCompany] = useState("");
  const [userProceso, setUserProceso] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // ✅ Estado para controlar visibilidad de TrashZone
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("Todos"); // ✅ Estado para el filtro de categoría
  const [showFilters, setShowFilters] = useState(false); // ✅ Estado para mostrar/ocultar filtros

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    navigate("/login", { replace: true });
  };

  const getLogoUrl = useCallback((company) => {
    if (!company) return getAssetUrl("logos/logo-default.svg");
    const companyMap = {
      Merkahorro: "logoMK.webp",
      Construahorro: "logoConstruahorro.webp",
      Megamayoristas: "logoMegamayoristas.webp",
    };
    const fileName = companyMap[company] || "logo-default.svg";
    return getAssetUrl(fileName);
  }, []);

  const handleNavigation = useCallback(
    (path) => {
      navigate(path, { state: { correoUsuario } });
    },
    [navigate, correoUsuario]
  );

  useEffect(() => {
    const getUserId = async () => {
      const { data, error } = await supabaseQuery(() =>
        supabase.auth.getUser()
      );
      if (error || !data?.user) {
        handleLogout();
        return;
      }
      setUserId(data.user.id);
    };
    getUserId();
  }, [navigate]);

  useEffect(() => {
    const cargarYSincronizarEstructura = async () => {
      if (!userId) return;
      setIsLoading(true);

      const { data: profileData, error: profileErr } = await supabaseQuery(() =>
        supabase
          .from("profiles")
          .select("role, personal_routes, company, proceso")
          .eq("user_id", userId)
          .maybeSingle()
      );

      if (profileErr || !profileData) {
        console.error("Error al obtener perfil:", profileErr);
        handleLogout();
        return;
      }

      const userRole = profileData.role;
      const companyName = profileData.company || "default";
      const proceso = profileData.proceso || "No definido";
      const isSuperAdminLocal = userRole === "super_admin";

      setUserCompany(companyName);
      setUserProceso(proceso);
      setIsSuperAdmin(isSuperAdminLocal);

      localStorage.setItem("userProceso", proceso);

      let { data: roleConfig } = await supabaseQuery(() =>
        supabase
          .from("role_permissions")
          .select("permissions")
          .eq("role", userRole)
          .maybeSingle()
      );

      if (
        (!roleConfig || !roleConfig.permissions) &&
        userRole === "admin_clientes"
      ) {
        const { data: fallbackConfig } = await supabaseQuery(() =>
          supabase
            .from("role_permissions")
            .select("permissions")
            .eq("role", "admin_proveedores")
            .maybeSingle()
        );
        if (fallbackConfig) {
          roleConfig = fallbackConfig;
        }
      }

      let permisosActuales = roleConfig?.permissions || [];
      if (
        profileData.personal_routes &&
        profileData.personal_routes.length > 0
      ) {
        permisosActuales = profileData.personal_routes;
      }

      const { data, error: structureError } = await supabaseQuery(() =>
        supabase
          .from("user_access_structures")
          .select("structure")
          .eq("user_id", userId)
          .single()
      );

      let estructuraGuardada = data?.structure || {
        sin_carpeta: permisosActuales,
      };

      const permisosActualesMap = new Map(
        permisosActuales.map((p) => [p.path, p])
      );
      const estructuraSincronizada = { sin_carpeta: [] };

      for (const carpeta in estructuraGuardada) {
        const itemsValidos = estructuraGuardada[carpeta].filter((item) =>
          permisosActualesMap.has(item.path)
        );
        if (carpeta !== "sin_carpeta" || itemsValidos.length > 0) {
          estructuraSincronizada[carpeta] = itemsValidos;
        }
      }

      const todosLosItemsEnEstructura = Object.values(
        estructuraSincronizada
      ).flat();
      const itemsEnEstructuraPaths = new Set(
        todosLosItemsEnEstructura.map((i) => i.path)
      );
      const nuevosPermisos = permisosActuales.filter(
        (permiso) => !itemsEnEstructuraPaths.has(permiso.path)
      );

      if (!estructuraSincronizada.sin_carpeta) {
        estructuraSincronizada.sin_carpeta = [];
      }
      estructuraSincronizada.sin_carpeta.push(...nuevosPermisos);

      estructuraGuardada = estructuraSincronizada;

      setEstructura(estructuraGuardada);
      await guardarEstructura(estructuraGuardada, true);

      const hour = new Date().getHours();
      setGreeting(
        hour < 12
          ? "¡Buenos días"
          : hour < 18
          ? "¡Buenas tardes"
          : "¡Buenas noches"
      );
      setUserName(empleado.nombre || "Usuario");

      const initialOpenState = {};
      Object.keys(estructuraGuardada).forEach((folder) => {
        if (folder !== "sin_carpeta") {
          initialOpenState[folder] = true;
        }
      });
      setOpenFolders(initialOpenState);
      setIsLoading(false);
    };

    cargarYSincronizarEstructura();
  }, [userId, navigate]);

  const guardarEstructura = async (nuevaEstructura, silencioso = false) => {
    if (!silencioso) {
      setEstructura(nuevaEstructura);
    }
    localStorage.setItem(
      `estructura_accesos_${correoUsuario}`,
      JSON.stringify(nuevaEstructura)
    );
    if (userId) {
      await supabaseQuery(() =>
        supabase
          .from("user_access_structures")
          .upsert([{ user_id: userId, structure: nuevaEstructura }])
      );
    }
  };

  const eliminarPermisoDePerfil = async (rutaPath) => {
    if (!userId) return;

    const { data: profile, error } = await supabaseQuery(() =>
      supabase
        .from("profiles")
        .select("personal_routes, role")
        .eq("user_id", userId)
        .single()
    );

    if (error || !profile) {
      console.error("Error al obtener perfil para eliminar ruta:", error);
      return;
    }

    let rutasParaFiltrar = profile.personal_routes;

    if (!rutasParaFiltrar || rutasParaFiltrar.length === 0) {
      const { data: roleData } = await supabaseQuery(() =>
        supabase
          .from("role_permissions")
          .select("permissions")
          .eq("role", profile.role)
          .maybeSingle()
      );
      rutasParaFiltrar = roleData?.permissions || [];
    }

    const nuevasRutas = rutasParaFiltrar.filter((r) => r.path !== rutaPath);

    const { error: updateError } = await supabaseQuery(() =>
      supabase
        .from("profiles")
        .update({ personal_routes: nuevasRutas })
        .eq("user_id", userId)
    );

    if (updateError) {
      console.error("Error al actualizar personal_routes:", updateError);
    } else {
      console.log("Ruta eliminada permanentemente del perfil:", rutaPath);
    }
  };

  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      nextBtnText: "Siguiente",
      prevBtnText: "Anterior",
      doneBtnText: "¡Entendido!",
      steps: [
        {
          popover: {
            title: "Bienvenido al Tour de Organización",
            description:
              "Te mostraremos cómo puedes ordenar tus accesos directos en carpetas personalizadas.",
          },
        },
        {
          element: "#main-access-grid .acc-panel-button:first-child",
          popover: {
            title: "Paso 1: Arrastra un Acceso",
            description:
              "Haz clic en cualquier parte de una tarjeta de acceso y, sin soltar, muévela.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#folder-grid",
          popover: {
            title: "Paso 2: Organiza en Carpetas",
            description:
              "Arrastra el acceso sobre una carpeta para organizarlo dentro de ella.",
            side: "top",
          },
        },
        {
          element: "#main-access-grid",
          popover: {
            title: "Paso 3: Devuelve Accesos",
            description:
              "Si quieres sacar un acceso de una carpeta, simplemente arrástralo desde adentro y suéltalo en esta área principal.",
            side: "top",
          },
        },
        {
          popover: {
            title: "¡Todo Listo!",
            description:
              "Ahora tienes el control total para organizar tu panel como más te guste.",
          },
        },
      ],
    });
    driverObj.drive();
  };

  const onDragStart = () => {
    requestAnimationFrame(() => {
      setIsDragging(true);
    });
  };

  const onDragEnd = (result) => {
    setIsDragging(false);
    const { source, destination } = result;
    if (!destination) return;

    const copiaEstructura = { ...estructura };
    const sourceFolderId = source.droppableId;
    const destFolderId = destination.droppableId;

    if (destFolderId === "trash-zone") {
      let itemEliminado = null;
      if (sourceFolderId === "sin_carpeta") {
        const eliminados = copiaEstructura.sin_carpeta.splice(source.index, 1);
        itemEliminado = eliminados[0];
      } else {
        const eliminados = copiaEstructura[sourceFolderId].splice(
          source.index,
          1
        );
        itemEliminado = eliminados[0];
      }

      setEstructura(copiaEstructura);
      guardarEstructura(copiaEstructura);

      if (itemEliminado && itemEliminado.path) {
        eliminarPermisoDePerfil(itemEliminado.path);
      }
      return;
    }

    if (sourceFolderId === destFolderId) {
      const folderItems = Array.from(copiaEstructura[sourceFolderId]);
      const [movedItem] = folderItems.splice(source.index, 1);
      folderItems.splice(destination.index, 0, movedItem);
      copiaEstructura[sourceFolderId] = folderItems;
    } else {
      const sourceFolderItems = Array.from(copiaEstructura[sourceFolderId]);
      const [movedItem] = sourceFolderItems.splice(source.index, 1);
      const destFolderItems = Array.from(copiaEstructura[destFolderId] || []);
      destFolderItems.splice(destination.index, 0, movedItem);
      copiaEstructura[sourceFolderId] = sourceFolderItems;
      copiaEstructura[destFolderId] = destFolderItems;
    }
    guardarEstructura(copiaEstructura);
  };

  const agregarCarpeta = (e) => {
    e.preventDefault();
    const nombre = nuevaCarpetaNombre.trim();
    if (!nombre || estructura[nombre]) return;
    guardarEstructura({ ...estructura, [nombre]: [] });
    setOpenFolders((prev) => ({ ...prev, [nombre]: true }));
    setNuevaCarpetaNombre("");
  };

  const eliminarCarpeta = (e, nombre) => {
    e.stopPropagation();
    if (nombre === "sin_carpeta") return;
    const copia = { ...estructura };
    copia.sin_carpeta = [
      ...(copia.sin_carpeta || []),
      ...(copia[nombre] || []),
    ];
    delete copia[nombre];
    guardarEstructura(copia);
  };

  const renombrarCarpeta = (nombreViejo) => {
    const nombreNuevo = nuevoNombre.trim();
    if (
      !nombreNuevo ||
      (estructura[nombreNuevo] && nombreNuevo !== nombreViejo)
    ) {
      setEditando(null);
      return;
    }
    const copia = { ...estructura };
    copia[nombreNuevo] = copia[nombreViejo];
    if (nombreViejo !== nombreNuevo) delete copia[nombreViejo];
    setOpenFolders((prev) => {
      const newOpenState = { ...prev };
      newOpenState[nombreNuevo] = prev[nombreViejo];
      delete newOpenState[nombreViejo];
      return newOpenState;
    });
    guardarEstructura(copia);
    setEditando(null);
    setNuevoNombre("");
  };

  const toggleFolder = (folderName) => {
    setOpenFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  if (isLoading) {
    return <div className="acc-loading-spinner"></div>;
  }

  return (
    <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
      <div className={`acc-panel theme-${userCompany.toLowerCase()}`}>
        <div className="acc-panel-header">
          <div className="acc-logo-container">
            <img
              src={getLogoUrl(userCompany)}
              alt={`${userCompany} Logo`}
              className="acc-main-logo"
            />
          </div>

          <div className="acc-home-container">
            <div
              className="acc-home-icon-wrapper"
              onClick={() => handleNavigation("/")}
            >
              <FaHome className="acc-home-icon" />
              <span className="acc-home-label">Inicio</span>
            </div>
          </div>
          <div className="acc-logout-container">
            <div className="acc-logout-icon-wrapper" onClick={handleLogout}>
              <FaSignOutAlt className="acc-logout-icon" />
              <span className="acc-logout-label">Cerrar Sesión</span>
            </div>
          </div>

          <h2 className="acc-panel-title">
            <span className="acc-typing-greeting">
              {greeting}, {userName}!
            </span>
          </h2>
          <h4 className="acc-motivational-quote">
            “La unidad nace cuando dejamos de lado el ‘yo’ para construir el
            ‘nosotros’.”
          </h4>
        </div>

        {isSuperAdmin && (
          <>
            {/* Barra de Búsqueda Profesional (Solo SuperAdmin) */}
            <div className="acc-search-container">
              <FaSearch className="acc-search-icon" />
              <input
                type="text"
                placeholder="Buscar ruta o acceso..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="acc-search-input"
              />
              {searchTerm && (
                <FaTimes
                  className="acc-clear-search"
                  onClick={() => setSearchTerm("")}
                  title="Borrar búsqueda"
                />
              )}
              <div className="acc-search-divider"></div>
              <FaFilter
                className={`acc-filter-toggle ${
                  showFilters || selectedFilter !== "Todos" ? "active" : ""
                }`}
                onClick={() => setShowFilters(!showFilters)}
                title="Filtrar por categoría"
              />
            </div>

            {/* Filtros de Categoría (Desplegable) */}
            <div className={`acc-filter-wrapper ${showFilters ? "open" : ""}`}>
              <div className="acc-filter-container">
                {availableGroups.map((group) => (
                  <button
                    key={group}
                    className={`acc-filter-chip ${
                      selectedFilter === group ? "active" : ""
                    }`}
                    onClick={() =>
                      setSelectedFilter(
                        group === selectedFilter ? "Todos" : group
                      )
                    }
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {isSuperAdmin && (searchTerm || selectedFilter !== "Todos") ? (
          <div className="acc-search-results">
            {(() => {
              const term = searchTerm.toLowerCase();
              const allItems = [
                ...(estructura.sin_carpeta || []),
                ...Object.entries(estructura)
                  .filter(([key]) => key !== "sin_carpeta")
                  .flatMap(([, items]) => items),
              ];
              const uniqueItems = Array.from(
                new Map(allItems.map((item) => [item.path, item])).values()
              );

              const filtered = uniqueItems.filter((item) => {
                const matchesSearch = item.label.toLowerCase().includes(term);
                const itemGroup = pathToGroupMap.get(item.path);
                const matchesFilter =
                  selectedFilter === "Todos" || itemGroup === selectedFilter;
                return matchesSearch && matchesFilter;
              });

              if (filtered.length === 0) {
                return (
                  <div className="no-results">
                    No se encontraron rutas que coincidan con los filtros.
                  </div>
                );
              }
              return filtered.map((item) => (
                <div
                  key={item.path}
                  className="acc-panel-button search-result-item"
                  onClick={() => handleNavigation(item.path)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="acc-button-icon">
                    {iconMap[item.label] || <FaClipboardList />}
                  </span>
                  <span className="acc-button-text">{item.label}</span>
                </div>
              ));
            })()}
          </div>
        ) : (
          <>
            <Droppable droppableId="sin_carpeta">
              {(provided, snapshot) => (
                <div
                  id="main-access-grid"
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`acc-panel-links ${
                    snapshot.isDraggingOver ? "is-drop-target" : ""
                  }`}
                >
                  {(estructura.sin_carpeta || []).map((item, index) => (
                    <Draggable
                      key={item.path}
                      draggableId={item.path}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <MemoizedAccessButton
                          item={item}
                          handleNavigation={handleNavigation}
                          provided={provided}
                          snapshot={snapshot}
                        />
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>

            <div className="tour-button-container">
              <button
                onClick={startTour}
                className="tour-button"
                title="Aprende cómo organizar tus accesos"
              >
                <FaQuestionCircle />
                <span className="tour-button-text">Ayuda</span>
              </button>
            </div>

            {/* ✅ Zona de Eliminación (Solo visible al arrastrar y si es Super Admin) */}
            {isSuperAdmin && (
              <div
                className={`trash-zone-container ${
                  isDragging ? "visible" : ""
                }`}
              >
                <Droppable droppableId="trash-zone">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`trash-zone ${
                        snapshot.isDraggingOver ? "active" : ""
                      }`}
                    >
                      <FaTrashAlt className="trash-icon" />
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )}

            <div id="folder-grid" className="unified-grid">
              {Object.keys(estructura)
                .filter((c) => c !== "sin_carpeta")
                .map((carpeta) => (
                  <Droppable
                    key={carpeta}
                    droppableId={carpeta}
                    isDropDisabled={!openFolders[carpeta]}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`folder-card ${
                          snapshot.isDraggingOver ? "is-drop-target" : ""
                        }`}
                      >
                        <div
                          className="folder-card-header"
                          onClick={() => toggleFolder(carpeta)}
                        >
                          <div className="folder-title-group">
                            <FaFolder />
                            {editando === carpeta ? (
                              <input
                                type="text"
                                value={nuevoNombre}
                                onChange={(e) => setNuevoNombre(e.target.value)}
                                onBlur={() => renombrarCarpeta(carpeta)}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && renombrarCarpeta(carpeta)
                                }
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                className="rename-input"
                              />
                            ) : (
                              <h4>{carpeta}</h4>
                            )}
                          </div>
                          <div className="folder-card-actions">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditando(carpeta);
                                setNuevoNombre(carpeta);
                              }}
                              title="Renombrar"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={(e) => eliminarCarpeta(e, carpeta)}
                              title="Eliminar"
                            >
                              <FaTrashAlt />
                            </button>
                            <span
                              className={`folder-toggle-icon ${
                                openFolders[carpeta] ? "open" : ""
                              }`}
                            >
                              <FaChevronDown />
                            </span>
                          </div>
                        </div>
                        <div
                          className={`folder-card-content ${
                            openFolders[carpeta] ? "open" : ""
                          }`}
                        >
                          {(estructura[carpeta] || []).map((item, index) => (
                            <Draggable
                              key={item.path}
                              draggableId={item.path}
                              index={index}
                            >
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="link-item-in-folder"
                                  onClick={() => handleNavigation(item.path)}
                                >
                                  <span className="link-item-icon">
                                    {iconMap[item.label] || <FaClipboardList />}
                                  </span>
                                  <span className="link-item-text">
                                    {item.label}
                                  </span>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                ))}
              <form
                className="create-folder-card"
                onSubmit={agregarCarpeta}
                id="create-folder-card"
              >
                <input
                  type="text"
                  placeholder="Crear nueva carpeta..."
                  value={nuevaCarpetaNombre}
                  onChange={(e) => setNuevaCarpetaNombre(e.target.value)}
                  className="create-folder-input"
                />
                <button
                  type="submit"
                  className="create-folder-button"
                  title="Crear Carpeta"
                >
                  <FaFolderPlus />
                </button>
              </form>
            </div>
          </>
        )}

        <div className="acc-user-info-container">
          <p className="acc-panel-user-info">
            <span className="acc-user-label">Sesión:</span> {correoUsuario} |{" "}
            <span className="acc-user-label">Dirección:</span>{" "}
            {empleado.area || "No definida"} |{" "}
            <span className="acc-user-label">Área:</span> {userProceso}
          </p>
        </div>
      </div>
    </DragDropContext>
  );
};
