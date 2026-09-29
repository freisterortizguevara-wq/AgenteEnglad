import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const STORAGE_EJ = "ejercicio_actual_v1";

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
function getUserId() {
  if (typeof window === "undefined") return "default";
  let uid = localStorage.getItem("uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("uid", uid);
  }
  return uid;
}

const LETRAS = ["A", "B", "C", "D", "E"];

// ------------------------------------------------------------------
// Componente
// ------------------------------------------------------------------
export default function Ejercicios() {
  const userId = useMemo(() => getUserId(), []);

  const [ejercicio, setEjercicio] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [objetivo, setObjetivo] = useState("");
  const [racha, setRacha] = useState(0);        // racha desde el backend
  const [rachaSesion, setRachaSesion] = useState(0); // aciertos seguidos en esta sesión
  const [stats, setStats] = useState({ aciertos: 0, fallos: 0 });
  const [autoAvance, setAutoAvance] = useState(false);

  const temporizadorRef = useRef(null);
  const siguienteRef = useRef(null);

  // ---------- Cargar perfil (para racha y objetivo) ----------
  const cargarPerfil = useCallback(async () => {
    try {
      const [rPerfil, rProgreso] = await Promise.all([
        fetch(`${API_URL}/api/perfil?user_id=${userId}`).then((r) => r.json()),
        fetch(`${API_URL}/api/progreso?user_id=${userId}`).then((r) => r.json()),
      ]);
      const perfil = rPerfil.perfil ?? rPerfil;
      setRacha(perfil.racha_dias || 0);
      setObjetivo(rProgreso.objetivo_adaptativo || "");
    } catch {}
  }, [userId]);

  // ---------- Cargar ejercicio ----------
  const cargarEjercicio = useCallback(async () => {
    setCargando(true);
    setError(null);
    setSeleccion(null);
    setMostrarResultado(false);
    clearTimeout(temporizadorRef.current);

    try {
      // Pasa user_id para que el backend genere un ejercicio alineado con la evolución
      const res = await fetch(`${API_URL}/api/ejercicio?user_id=${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setEjercicio(data);
      localStorage.setItem(STORAGE_EJ, JSON.stringify(data));
    } catch (e) {
      setError(e.message || "No se pudo generar el ejercicio.");
      setEjercicio(null);
    } finally {
      setCargando(false);
    }
  }, [userId]);

  // ---------- Inicialización ----------
  useEffect(() => {
    cargarPerfil();

    // Si hay un ejercicio guardado, muéstralo (no regeneres hasta que el usuario avance)
    try {
      const guardado = localStorage.getItem(STORAGE_EJ);
      if (guardado) {
        setEjercicio(JSON.parse(guardado));
        setCargando(false);
        return;
      }
    } catch {}

    cargarEjercicio();
  }, [cargarEjercicio, cargarPerfil]);

  // ---------- Registrar respuesta en el backend ----------
 const registrar = useCallback(
  async (correcto, detalle) => {
    try {
      await fetch(`${API_URL}/api/respuesta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          tema: ejercicio?.tema || "general",
          correcto,
          detalle,
          pregunta: ejercicio?.pregunta || null,   // ← AÑADE ESTA LÍNEA
        }),
      });
    } catch (e) {
      console.warn("No se pudo registrar la respuesta:", e);
    }
  },
  [userId, ejercicio]
);

  // ---------- Seleccionar opción ----------
  const seleccionarOpcion = useCallback(
    (opcion) => {
      if (mostrarResultado || !ejercicio) return;

      setSeleccion(opcion);
      setMostrarResultado(true);

      const correcto = opcion === ejercicio.respuesta_correcta;

      // Racha local
      if (correcto) {
        setRachaSesion((r) => r + 1);
        setStats((s) => ({ ...s, aciertos: s.aciertos + 1 }));
      } else {
        setRachaSesion(0);
        setStats((s) => ({ ...s, fallos: s.fallos + 1 }));
      }

      // Registrar en backend (alimenta el objetivo adaptativo)
      registrar(
        correcto,
        correcto ? null : `Eligió "${opcion}", correcto: "${ejercicio.respuesta_correcta}"`
      );

      // Auto-avance si acierta
      if (autoAvance && correcto) {
        temporizadorRef.current = setTimeout(() => {
          siguienteRef.current?.();
        }, 1800);
      }
    },
    [ejercicio, mostrarResultado, autoAvance, registrar]
  );

  // ---------- Siguiente ----------
  const siguiente = useCallback(() => {
    localStorage.removeItem(STORAGE_EJ);
    cargarEjercicio();
    cargarPerfil();
  }, [cargarEjercicio, cargarPerfil]);

  // Guardar referencia para poder llamarla desde timeout
  siguienteRef.current = siguiente;

  // ---------- Atajos de teclado ----------
  useEffect(() => {
    function onKey(e) {
      if (cargando) return;

      // 1-4 para elegir opción
      if (!mostrarResultado && ejercicio && /^[1-4]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const op = ejercicio.opciones?.[idx];
        if (op) seleccionarOpcion(op);
        return;
      }

      // Enter / Space para siguiente
      if (mostrarResultado && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        siguiente();
      }

      // R para regenerar (por si el ejercicio está mal)
      if (!mostrarResultado && e.key.toLowerCase() === "r") {
        cargarEjercicio();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cargando, mostrarResultado, ejercicio, seleccionarOpcion, siguiente, cargarEjercicio]);

  // ---------- Limpieza ----------
  useEffect(() => {
    return () => clearTimeout(temporizadorRef.current);
  }, []);

  // ---------- Estados ----------
  if (cargando) {
    return (
      <div className="p-4 md:p-8 max-w-xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-slate-700/50 rounded-full" />
          <div className="h-24 bg-slate-700/50 rounded-2xl" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-slate-700/50 rounded-xl" />
            ))}
          </div>
        </div>
        <p className="text-slate-400 text-xs text-center mt-6">
          Generando ejercicio adaptado a tu nivel…
        </p>
      </div>
    );
  }

  if (error || !ejercicio) {
    return (
      <div className="p-4 md:p-8 max-w-xl mx-auto text-center">
        <div className="bg-slate-800/60 border border-red-500/30 rounded-2xl p-6">
          <p className="text-3xl mb-2">😕</p>
          <p className="text-red-400 text-sm mb-4">
            {error || "No se pudo cargar el ejercicio."}
          </p>
          <button
            onClick={cargarEjercicio}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const correcto = seleccion === ejercicio.respuesta_correcta;
  const totalSesion = stats.aciertos + stats.fallos;
  const porcentajeSesion = totalSesion ? Math.round((stats.aciertos / totalSesion) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-xl mx-auto h-full overflow-y-auto">
      {/* ============ Objetivo adaptativo ============ */}
      {objetivo && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">🎯</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-indigo-300 uppercase tracking-wide">
              Objetivo adaptativo
            </p>
            <p className="text-xs text-slate-200 leading-snug">{objetivo}</p>
          </div>
        </div>
      )}

      {/* ============ Header: tema + racha ============ */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <span className="text-xs px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 truncate max-w-[60%]">
          {ejercicio.tema || "Ejercicio"}
        </span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-amber-400" title="Racha de días">
            🔥 {racha}d
          </span>
          {rachaSesion > 0 && (
            <span className="text-emerald-400" title="Aciertos seguidos">
              ⚡ {rachaSesion}
            </span>
          )}
        </div>
      </div>

      {/* ============ Progreso de la sesión ============ */}
      {totalSesion > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>
              Sesión: {stats.aciertos}✓ {stats.fallos}✗
            </span>
            <span>{porcentajeSesion}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${porcentajeSesion}%` }}
            />
          </div>
        </div>
      )}

      {/* ============ Pregunta ============ */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 sm:p-6 mb-4">
        <p className="text-white text-base sm:text-lg leading-relaxed">
          {ejercicio.pregunta}
        </p>
      </div>

      {/* ============ Opciones ============ */}
      <div className="space-y-2.5 sm:space-y-3">
        {ejercicio.opciones.map((op, i) => {
          const esCorrecta = op === ejercicio.respuesta_correcta;
          const esSeleccionada = op === seleccion;

          let estilo =
            "border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500 hover:bg-slate-750 active:scale-[0.98]";
          let icono = null;

          if (mostrarResultado) {
            if (esCorrecta) {
              estilo = "border-emerald-500 bg-emerald-500/10 text-emerald-200 animate-[pulse_0.6s_ease-out]";
              icono = "✅";
            } else if (esSeleccionada) {
              estilo = "border-red-500 bg-red-500/10 text-red-200 animate-[shake_0.4s_ease-out]";
              icono = "❌";
            } else {
              estilo = "border-slate-700 bg-slate-800/50 text-slate-500";
            }
          }

          return (
            <button
              key={i}
              onClick={() => seleccionarOpcion(op)}
              disabled={mostrarResultado}
              className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-3 ${estilo} ${
                mostrarResultado ? "cursor-default" : ""
              }`}
            >
              <span
                className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                  mostrarResultado && esCorrecta
                    ? "bg-emerald-500/30 text-emerald-200"
                    : mostrarResultado && esSeleccionada
                    ? "bg-red-500/30 text-red-200"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                {icono || LETRAS[i]}
              </span>
              <span className="flex-1 leading-snug">{op}</span>
            </button>
          );
        })}
      </div>

      {/* ============ Explicación + siguiente ============ */}
      {mostrarResultado && (
        <div className="mt-5 bg-slate-800/70 border border-slate-700/50 rounded-2xl p-4 sm:p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl leading-none">{correcto ? "🎉" : "💡"}</span>
            <div className="flex-1">
              <p
                className={`text-sm font-semibold mb-1 ${
                  correcto ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {correcto ? "¡Correcto!" : "Casi…"}
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                {ejercicio.explicacion}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button
              onClick={siguiente}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-medium px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              Siguiente <span className="text-lg leading-none">→</span>
            </button>
            <button
              onClick={cargarEjercicio}
              className="sm:w-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm px-4 py-3 rounded-xl transition-colors"
              title="Genera otro ejercicio (o pulsa R)"
            >
              🔄 Otro
            </button>
          </div>

          <label className="flex items-center gap-2 mt-3 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoAvance}
              onChange={(e) => setAutoAvance(e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-500"
            />
            Avanzar solo cuando acierte
          </label>
        </div>
      )}

      {/* ============ Atajos (solo desktop) ============ */}
      <p className="hidden sm:block text-[10px] text-slate-500 text-center mt-6">
        Atajos: <kbd className="px-1 bg-slate-800 rounded">1-4</kbd> elegir ·{" "}
        <kbd className="px-1 bg-slate-800 rounded">Enter</kbd> siguiente ·{" "}
        <kbd className="px-1 bg-slate-800 rounded">R</kbd> regenerar
      </p>
    </div>
  );
}