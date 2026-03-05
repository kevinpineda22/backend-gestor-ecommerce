import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import "./ReestablecerContraseña.css";
import { getAssetUrl } from "../../config/storage";

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
        <line x1="2" x2="22" y1="2" y2="22" />
      </>
    )}
  </svg>
);

const ReestablecerContraseña = () => {
  const [email, setEmail] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [mostrarConfirmarClave, setMostrarConfirmarClave] = useState(false);

  // 'solicitar', 'cargando', 'establecer', 'listo', 'error', 'correo_enviado'
  const [estado, setEstado] = useState("cargando");
  const [mensaje, setMensaje] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Detecta si el usuario viene de un enlace de correo (tiene un token)
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setEstado("establecer");
      }
    });

    // Si después de un momento no hay evento, asumimos que llegó directo
    const timer = setTimeout(() => {
      if (estado === "cargando") {
        setEstado("solicitar");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [estado]);

  // Maneja la solicitud de envío de correo
  const handleRequestReset = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMensaje("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://merkahorro.com/reestablecer", // URL a la que volverá el usuario
    });

    if (error) {
      setMensaje("Error: " + error.message);
    } else {
      setEstado("correo_enviado");
    }
    setIsSubmitting(false);
  };

  // Maneja la actualización de la contraseña
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMensaje("");

    if (nuevaClave !== confirmarClave) {
      setMensaje("Las contraseñas no coinciden.");
      setIsSubmitting(false);
      return;
    }
    if (nuevaClave.length < 6) {
      setMensaje("La contraseña debe tener al menos 6 caracteres.");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: nuevaClave });

    if (error) {
      setMensaje("Error: " + error.message);
    } else {
      setEstado("listo");
      setTimeout(() => navigate("/login"), 3000);
    }
    setIsSubmitting(false);
  };

  const renderContent = () => {
    switch (estado) {
      case "cargando":
        return <p className="feedback-message loading">Cargando...</p>;

      case "solicitar":
        return (
          <>
            <p className="reset-subtitle">
              Ingresa tu correo para enviarte un enlace de recuperación.
            </p>
            <form onSubmit={handleRequestReset}>
              <div className="input-wrapper">
                <input
                  id="email"
                  className="reset-input"
                  type="email"
                  placeholder="tu-correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {mensaje && (
                <p className="feedback-message error-inline">{mensaje}</p>
              )}
              <button
                type="submit"
                className="reset-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Enviando..." : "Enviar Enlace"}
              </button>
            </form>
          </>
        );

      case "correo_enviado":
        return (
          <p className="feedback-message success">
            ¡Correo enviado! Revisa tu bandeja de entrada (y spam) para
            continuar.
          </p>
        );

      case "establecer":
        return (
          <>
            <p className="reset-subtitle">
              Ingresa tu nueva contraseña a continuación.
            </p>
            <form onSubmit={handleUpdatePassword}>
              {/* Campos de nueva contraseña y confirmar */}
              <div className="input-wrapper">
                <input
                  id="nuevaClave"
                  className="reset-input"
                  type={mostrarClave ? "text" : "password"}
                  placeholder="Nueva contraseña"
                  value={nuevaClave}
                  onChange={(e) => setNuevaClave(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="eye-button"
                  onClick={() => setMostrarClave(!mostrarClave)}
                >
                  <EyeIcon visible={mostrarClave} />
                </button>
              </div>
              <div className="input-wrapper">
                <input
                  id="confirmarClave"
                  className="reset-input"
                  type={mostrarConfirmarClave ? "text" : "password"}
                  placeholder="Confirmar contraseña"
                  value={confirmarClave}
                  onChange={(e) => setConfirmarClave(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="eye-button"
                  onClick={() =>
                    setMostrarConfirmarClave(!mostrarConfirmarClave)
                  }
                >
                  <EyeIcon visible={mostrarConfirmarClave} />
                </button>
              </div>
              {mensaje && (
                <p className="feedback-message error-inline">{mensaje}</p>
              )}
              <button
                type="submit"
                className="reset-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Actualizando..." : "Actualizar Contraseña"}
              </button>
            </form>
          </>
        );

      case "listo":
        return (
          <p className="feedback-message success">
            ¡Contraseña actualizada con éxito! Serás redirigido.
          </p>
        );

      default:
        return (
          <p className="feedback-message error">
            Ha ocurrido un error inesperado.
          </p>
        );
    }
  };

  return (
    <div className="reset-container">
      <div className="reset-card">
        <img src={getAssetUrl("logoMK.webp")} alt="Logo Merkahorro" className="reset-logo" />
        <h2 className="reset-title">Reestablecer Contraseña</h2>
        {renderContent()}
      </div>
    </div>
  );
};

export { ReestablecerContraseña };
