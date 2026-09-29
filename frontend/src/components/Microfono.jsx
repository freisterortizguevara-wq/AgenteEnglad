import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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

function normalizar(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function calcularSimilitud(objetivo, dicho) {
  const o = normalizar(objetivo);
  const d = normalizar(dicho);
  if (!o.length) return 0;

  let aciertos = 0;
  o.forEach((p) => {
    if (d.includes(p)) aciertos++;
  });
  return Math.round((aciertos / o.length) * 100);
}

// Devuelve array de { palabra, acertada } para colorear
function compararPalabras(objetivo, dicho) {
  const o = normalizar(objetivo);
  const d = normalizar(dicho);
  return o.map((p) => ({ palabra: p, acertada: d.includes(p) }));
}

function colorPuntaje(p) {
  if (p >= 80) return { texto: "text-emerald-400", barra: "bg-emerald-500" };
  if (p >= 50) return { texto: "text-amber-400", barra: "bg-amber-500" };
  return { texto: "text-red-400", barra: "bg-red-500" };
}

// ------------------------------------------------------------------
// Componente
// ------------------------------------------------------------------
export default function Microfono() {
  const userId = useMemo(() => getUserId(), []);

  const [frase, setFrase] = useState(null);
  const [objetivo, setObjetivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [grabando, setGrabando] = useState(false);
  const [transcripcion, setTranscripcion] = useState("");
  const [puntaje, setPuntaje] = useState(null);
  const [soportado, setSoportado] = useState(true);
  const [error, setError] = useState(null);
  const [tiempoGrabacion, setTiempoGrabacion] = useState(0);
  const [historial, setHistorial] = useState([]); // { puntaje, frase }
  const [autoSiguiente, setAutoSiguiente] = useState(false);

  const reconocimientoRef = useRef(null);
  const intervaloRef = useRef(null);
  const fraseRef = useRef(null);

  // Mantener una ref con la frase actual para los callbacks de reconocimiento
  fraseRef.current = frase;

  // ---------- Cargar objetivo adaptativo ----------
  const cargarObjetivo = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/progreso?user_id=${userId}`).then((r) => r.json());
      setObjetivo(r.objetivo_adaptativo || "");
    } catch {}
  }, [userId]);

  // ---------- Cargar frase ----------
  const cargarFrase = useCallback(async () => {
    setCargando(true);
    setError(null);
    setTranscripcion("");
    setPuntaje(null);
    setTiempoGrabacion(0);

    try {
      const res = await fetch(`${API_URL}/api/frase-practica?user_id=${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFrase(data);
    } catch (e) {
      setError(e.message || "No se pudo cargar la frase.");
      setFrase(null);
    } finally {
      setCargando(false);
      cargarObjetivo();
    }
  }, [userId, cargarObjetivo]);

  // ---------- Registrar intento ----------
  const registrarIntento = useCallback(
    async (puntajeFinal, textoDicho) => {
      if (!fraseRef.current) return;
      try {
        await fetch(`${API_URL}/api/respuesta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            tema: `pronunciación: ${fraseRef.current.frase?.split(" ").slice(0, 3).join(" ")}`,
            correcto: puntajeFinal >= 70,
            detalle: `Dijo: "${textoDicho}" (${puntajeFinal}%)`,
          }),
        });
      } catch {}
    },
    [userId]
  );

  // ---------- Inicializar reconocimiento ----------
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSoportado(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (event) => {
      const texto = event.results[0][0].transcript;
      setTranscripcion(texto);

      const p = calcularSimilitud(fraseRef.current?.frase || "", texto);
      setPuntaje(p);
      setHistorial((h) => [...h, { puntaje: p, frase: fraseRef.current?.frase || "" }]);
      registrarIntento(p, texto);

      if (autoSiguiente && p >= 80) {
        setTimeout(cargarFrase, 1500);
      }
    };

    rec.onerror = (e) => {
      setGrabando(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Permiso de micrófono denegado. Habilítalo en tu navegador.");
      } else if (e.error === "no-speech") {
        setError("No escuché nada. Intenta de nuevo más cerca del micro.");
      } else if (e.error === "network") {
        setError("Error de red. Revisa tu conexión.");
      } else {
        setError(`Error de reconocimiento: ${e.error}`);
      }
    };

    rec.onend = () => {
      setGrabando(false);
      clearInterval(intervaloRef.current);
    };

    reconocimientoRef.current = rec;
    cargarFrase();

    return () => {
      try { rec.abort(); } catch {}
      clearInterval(intervaloRef.current);
    };
  }, [cargarFrase, autoSiguiente, registrarIntento]);

  // ---------- Grabar ----------
  const iniciarGrabacion = useCallback(() => {
    if (!reconocimientoRef.current || grabando) return;
    setError(null);
    setTranscripcion("");
    setPuntaje(null);
    setTiempoGrabacion(0);

    try {
      reconocimientoRef.current.start();
      setGrabando(true);
      intervaloRef.current = setInterval(
        () => setTiempoGrabacion((t) => t + 1),
        1000
      );
    } catch (e) {
      // Sucede si ya estaba activo
      setGrabando(false);
    }
  }, [grabando]);

  const detenerGrabacion = useCallback(() => {
    try { reconocimientoRef.current?.stop(); } catch {}
    setGrabando(false);
    clearInterval(intervaloRef.current);
  }, []);

  // ---------- TTS: escuchar la frase ----------
  const escucharFrase = useCallback(() => {
    if (!frase?.frase || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(frase.frase);
    u.lang = "en-US";
    u.rate = 0.9;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }, [frase]);

  // ---------- Cálculos ----------
  const promedio =
    historial.length > 0
      ? Math.round(historial.reduce((a, b) => a + b.puntaje, 0) / historial.length)
      : 0;

  const palabrasComparadas = transcripcion
    ? compararPalabras(frase?.frase || "", transcripcion)
    : [];

  // ---------- Render: no soportado ----------
  if (!soportado) {
    return (
      <div className="p-4 md:p-8 max-w-xl mx-auto text-center">
        <div className="bg-slate-800/60 border border-amber-500/30 rounded-2xl p-6">
          <p className="text-3xl mb-2">🎙️</p>
          <p className="text-amber-400 text-sm mb-2">
            Tu navegador no soporta reconocimiento de voz.
          </p>
          <p className="text-slate-400 text-xs">
            Prueba con Chrome, Edge o Safari (iOS 14.5+) en HTTPS.
          </p>
        </div>
      </div>
    );
  }

  // ---------- Render: cargando ----------
  if (cargando) {
    return (
      <div className="p-4 md:p-8 max-w-xl mx-auto space-y-4 animate-pulse">
        <div className="h-24 bg-slate-700/50 rounded-2xl" />
        <div className="h-12 bg-slate-700/50 rounded-xl" />
        <div className="h-20 w-20 bg-slate-700/50 rounded-full mx-auto" />
        <p className="text-slate-400 text-xs text-center">
          Generando frase para practicar…
        </p>
      </div>
    );
  }

  // ---------- Render: error inicial ----------
  if (!frase || frase.error) {
    return (
      <div className="p-4 md:p-8 max-w-xl mx-auto text-center">
        <div className="bg-slate-800/60 border border-red-500/30 rounded-2xl p-6">
          <p className="text-3xl mb-2">😕</p>
          <p className="text-red-400 text-sm mb-4">
            {error || frase?.error || "Error al cargar la frase."}
          </p>
          <button
            onClick={cargarFrase}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2.5 rounded-xl"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const cp = puntaje !== null ? colorPuntaje(puntaje) : null;

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

      {/* ============ Frase objetivo ============ */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 sm:p-6 mb-4 text-center relative">
        <p className="text-lg sm:text-xl text-white font-semibold mb-2 leading-snug">
          {frase.frase}
        </p>
        <p className="text-sm text-slate-400 mb-3">{frase.traduccion}</p>
        <button
          onClick={escucharFrase}
          className="inline-flex items-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
          title="Escuchar pronunciación"
        >
          🔊 Escuchar
        </button>
      </div>

      {/* ============ Tip de pronunciación ============ */}
      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 mb-6">
        <p className="text-xs text-indigo-300">💡 {frase.tip_pronunciacion}</p>
      </div>

      {/* ============ Botón grabar ============ */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={grabando ? detenerGrabacion : iniciarGrabacion}
          className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center text-4xl sm:text-5xl transition-all shadow-lg ${
            grabando
              ? "bg-red-500 hover:bg-red-600 scale-110"
              : "bg-indigo-600 hover:bg-indigo-500 hover:scale-105 active:scale-95"
          }`}
          aria-label={grabando ? "Detener grabación" : "Iniciar grabación"}
        >
          {/* Anillo pulsante al grabar */}
          {grabando && (
            <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />
          )}
          <span className="relative">{grabando ? "⏹" : "🎤"}</span>
        </button>

        <div className="text-center">
          {grabando ? (
            <>
              <p className="text-sm text-red-400 font-medium">
                ● Grabando · {tiempoGrabacion}s
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Toca el botón para detener
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Toca para grabar tu pronunciación
            </p>
          )}
        </div>
      </div>

      {/* ============ Error en vivo ============ */}
      {error && !transcripcion && (
        <div className="mt-5 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-xs text-red-300">⚠️ {error}</p>
        </div>
      )}

      {/* ============ Resultado ============ */}
      {transcripcion && (
        <div className="mt-6 bg-slate-800 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-xs text-slate-400 mb-1.5">Lo que dijiste:</p>
          <p className="text-white text-sm mb-4 italic">"{transcripcion}"</p>

          {/* Barra + puntaje */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${cp?.barra}`}
                style={{ width: `${puntaje}%` }}
              />
            </div>
            <span className={`text-sm font-bold tabular-nums ${cp?.texto}`}>
              {puntaje}%
            </span>
          </div>

          <p className={`text-xs ${cp?.texto} mb-3`}>
            {puntaje >= 80
              ? "🎉 ¡Excelente pronunciación!"
              : puntaje >= 50
              ? "👍 Bien, sigue practicando"
              : "🔁 Intenta de nuevo, tómalo con calma"}
          </p>

          {/* Comparación palabra por palabra */}
          <div className="bg-slate-900/60 rounded-xl p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
              Palabra por palabra
            </p>
            <div className="flex flex-wrap gap-1.5">
              {palabrasComparadas.map((p, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-0.5 rounded-md ${
                    p.acertada
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300 line-through"
                  }`}
                >
                  {p.palabra}
                </span>
              ))}
            </div>
          </div>

          {/* Botón reintentar */}
          <button
            onClick={iniciarGrabacion}
            className="mt-4 w-full bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-white text-sm font-medium py-2.5 rounded-xl transition-all"
          >
            🔁 Reintentar la misma frase
          </button>
        </div>
      )}

      {/* ============ Historial de sesión ============ */}
      {historial.length > 0 && (
        <div className="mt-5 bg-slate-800/60 border border-slate-700/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400">
              Sesión: {historial.length}{" "}
              {historial.length === 1 ? "intento" : "intentos"}
            </p>
            <span className={`text-xs font-semibold ${colorPuntaje(promedio).texto}`}>
              Promedio: {promedio}%
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {historial.slice(-12).map((h, i) => (
              <div
                key={i}
                className="shrink-0 text-center"
                title={`${h.frase}: ${h.puntaje}%`}
              >
                <div
                  className={`w-8 h-1.5 rounded-full ${colorPuntaje(h.puntaje).barra}`}
                />
                <p className="text-[9px] text-slate-500 mt-1">{h.puntaje}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ Siguiente frase ============ */}
      <button
        onClick={cargarFrase}
        className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-sm font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
      >
        Siguiente frase <span className="text-lg leading-none">→</span>
      </button>

      <label className="flex items-center justify-center gap-2 mt-3 text-xs text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoSiguiente}
          onChange={(e) => setAutoSiguiente(e.target.checked)}
          className="w-3.5 h-3.5 accent-indigo-500"
        />
        Avanzar solo si acierto ≥80%
      </label>

      {/* Espacio para safe-area iOS */}
      <div style={{ height: "env(safe-area-inset-bottom)" }} />
    </div>
  );
}