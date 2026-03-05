// src/components/Login/Login.jsx

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";
import { getAssetUrl } from "../../config/storage";
import { supabase } from "../../supabaseClient";

const EyeIcon = ({ visible }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {visible ? (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    )}
  </svg>
);

export const Login = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const SESSION_DURATION_MINUTES = 360;

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const exp = localStorage.getItem("session_expiration");
      if (session && exp && Date.now() < Number(exp)) {
        navigate("/acceso");
      }
    })();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const correo = e.target.email.value.trim().toLowerCase();
    const password = e.target.password.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(correo)) {
      setError("Ingresa un correo válido");
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email: correo, password });

    if (authError || !authData.session) {
      setError("Correo o contraseña incorrectos");
      setLoading(false);
      return;
    }

    const uid = authData.user.id;

    const { data: profileData, error: profileErr } = await supabase
      .from("profiles")
      .select("nombre, area, role, personal_routes, sede_id, ecommerce_rol")
      .eq("user_id", uid)
      .maybeSingle();

    if (profileErr || !profileData) {
      setError("Perfil de usuario no encontrado o incompleto.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    const userRole = profileData.role;

    let { data: roleConfig, error: roleConfigErr } = await supabase
      .from("role_permissions")
      .select("permissions, redirect")
      .eq("role", userRole)
      .maybeSingle();

    // Si no se encuentra configuración para admin_clientes, usar la de admin_proveedores
    if (
      (!roleConfig || !roleConfig.permissions) &&
      userRole === "admin_clientes"
    ) {
      const { data: fallbackConfig } = await supabase
        .from("role_permissions")
        .select("permissions, redirect")
        .eq("role", "admin_proveedores")
        .maybeSingle();

      if (fallbackConfig) {
        roleConfig = fallbackConfig;
      }
    }

    // Si hay error de base de datos (no de "no encontrado"), reportarlo
    if (roleConfigErr) {
      console.error("Error fetching role config:", roleConfigErr);
    }

    let finalRoutes = [];
    let redirectPath = "/acceso"; // Ruta por defecto si no hay config de rol

    if (roleConfig) {
      finalRoutes = roleConfig.permissions || [];
      redirectPath = roleConfig.redirect;
    }

    // Prioridad a rutas personales
    if (profileData.personal_routes && profileData.personal_routes.length > 0) {
      finalRoutes = profileData.personal_routes;
    }

    // Si después de todo no hay rutas, entonces sí es un error
    if (!finalRoutes || finalRoutes.length === 0) {
      setError(
        "No se encontró configuración de rutas para el rol: " + userRole,
      );
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    const config = {
      redirect: redirectPath,
      routes: finalRoutes,
    };

    // Si el usuario es admin_proveedor o admin_cliente, redirigir al panel de acceso
    // para que puedan elegir entre las diferentes opciones disponibles
    if (
      [
        "admin_proveedor",
        "admin_proveedores",
        "admin_cliente",
        "admin_clientes",
      ].includes(userRole)
    ) {
      config.redirect = "/acceso";
    }

    localStorage.setItem("token", authData.session.access_token);
    localStorage.setItem("correo_empleado", correo);
    localStorage.setItem("rutas_permitidas", JSON.stringify(config.routes));
    localStorage.setItem("redirect_usuario", config.redirect);
    localStorage.setItem("empleado_info", JSON.stringify(profileData));

    const expiration = Date.now() + SESSION_DURATION_MINUTES * 60 * 1000;
    localStorage.setItem("session_expiration", expiration.toString());

    navigate(config.redirect, {
      state: { correoUsuario: correo, opciones: config.routes },
    });
    setLoading(false);
  };

  return (
    <div className="login-container">
      <Link to="/" className="login-back-home" title="Volver al inicio">
        <span aria-hidden="true">←</span>
        Regresar al inicio
      </Link>
      <div
        className="login-info-panel"
        style={{ backgroundImage: `url(${getAssetUrl("fondoLogin3.webp")})` }}
      >
        <div className="login-info-content">
          <h1 className="login-info-title">Bienvenido</h1>
          <p className="login-info-subtitle">
            Ingresa para gestionar tus tareas de manera eficiente.
          </p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-logos">
            <img
              src={getAssetUrl("logoMegamayoristas.webp")}
              alt="Logo Megamayoristas"
              className="login-logo"
            />
            <img
              src={getAssetUrl("logoConstruahorro.webp")}
              alt="Logo Construahorro"
              className="login-logo"
            />
            <img
              src={getAssetUrl("logoMK.webp")}
              alt="Logo Merkahorro"
              className="login-logo"
            />
          </div>

          <header className="login-header">
            <h2 className="login-form-title">Inicia sesión</h2>
            <p className="login-form-subtitle">
              Usa tu correo corporativo y contraseña para acceder.
            </p>
          </header>

          <form className="login-form" onSubmit={handleLogin} noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="email">
                Correo electrónico
              </label>
              <div className="login-input-wrapper">
                <input
                  className="login-input"
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="nombre@empresa.com"
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="password">
                Contraseña
              </label>
              <div className="login-input-wrapper">
                <input
                  className="login-input"
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                />
                <button
                  type="button"
                  className="login-toggle-visibility"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  <EyeIcon visible={showPassword} />
                </button>
              </div>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Cargando..." : "Iniciar sesión"}
            </button>
          </form>

          <div className="login-form-footer">
            <Link to="/reestablecer" className="login-forgot-link">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
