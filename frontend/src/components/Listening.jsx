import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function getUserId() {
  if (typeof window === "undefined") return "default";
  let uid = localStorage.getItem("uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("uid", uid);
  }
  return uid;
}

const LETRAS = ["A", "B", "C", "D"];

function TTSButton({ texto, rate = 0.9, grande = false }) {
  const [hablando, setHablando] = useState(false);

  const hablar = useCallback(() => {
    if (!window.speechSynthesis || !texto) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "en-US";
    u.rate = rate;

    // Buscar una voz en-US
    const voces = window.speechSynthesis.getVoices();
    const enVoz = voces.find((v) => v.lang.startsWith("en-US")) ||
                  voces.find((v) => v.lang.startsWith("en"));
    if (enVoz) u.voice = enVoz;

    u.onend = () => setHablando(false);
    u.onerror = () => setHablando(false);
    setHablando(true);
    window.speechSynthesis.speak(u);
  }, [texto, rate]);

  if (grande) {
    return (
      <button
        onClick={hablar}
        className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-medium px-5 py-3 rounded-xl transition-all flex items-center gap-2"
      >
        {hablando ? "🔊 Reproduciendo…" : "▶ Escuchar diálogo"}
      </button>
    );
  }

  return (
    <button
      onClick={hablar}
      className="text-slate-400 hover:text-indigo-400 transition-colors p-1 text-sm shrink-0"
      title="Escuchar"
      type="button"
    >
      🔊
    </button>
  );
}

export default function Listening() {
  const userId = useMemo(() => getUserId(), []);

  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarGuion, setMostrarGuion] = useState(false);
  const [respuestas, setRespuestas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [indicePregunta, setIndicePregunta] = useState(0);
  const [enviado, setEnviado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setMostrarGuion(false);
    setRespuestas({});
    setResultado(null);
    setIndicePregunta(0);
    setEnviado(false);

    try {
      const res = await fetch(`${API_URL}/api/listening?user_id=${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError(e.message || "No se pudo cargar el listening.");
    } finally {
      setCargando(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const responder = (valor) => {
    if (enviado) return;
    setRespuestas((r) => ({ ...r, [indicePregunta]: valor }));
  };

  const enviar = async () => {
    if (!data?.preguntas) return;
    const correctas = data.preguntas.filter(
      (p, i) => respuestas[i] === p.respuesta_correcta
    ).length;
    const puntaje = Math.round((correctas / data.preguntas.length) * 100);
    setResultado({ correctas, total: data.preguntas.length, puntaje });
    setEnviado(true);

    try {
      await fetch(`${API_URL}/api/listening/resultado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          titulo: data.titulo,
          puntaje,
        }),
      });
    } catch {}
  };

  // ---------- Estados ----------
  if (cargando) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-10 bg-slate-700/50 rounded-xl w-2/3" />
        <div className="h-20 bg-slate-700/50 rounded-2xl" />
        <div className="h-40 bg-slate-700/50 rounded-2xl" />
        <p className="text-slate-400 text-xs text-center">
          Preparando material de listening…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto text-center">
        <div className="bg-slate-800/60 border border-red-500/30 rounded-2xl p-6">
          <p className="text-3xl mb-2">😕</p>
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={cargar}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2.5 rounded-xl"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const preguntaActual = data.preguntas?.[indicePregunta];
  const totalPreguntas = data.preguntas?.length || 0;
  const respondidas = Object.keys(respuestas).length;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto h-full overflow-y-auto space-y-4">
      {/* Título */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white">
        <p className="text-[10px] uppercase tracking-wider opacity-80 mb-1">
          🎧 Listening
        </p>
        <h2 className="text-xl font-semibold mb-1">{data.titulo}</h2>
        {data.situacion && (
          <p className="text-xs opacity-90">{data.situacion}</p>
        )}
      </div>

      {/* Reproductor */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 uppercase tracking-wider">
            Diálogo
          </p>
          <button
            onClick={() => setMostrarGuion((v) => !v)}
            className="text-xs text-slate-400 hover:text-indigo-400 transition-colors"
          >
            {mostrarGuion ? "🙈 Ocultar guion" : "👁 Mostrar guion"}
          </button>
        </div>

        <TTSButton
          texto={data.guion?.map((g) => g.linea).join(". ")}
          rate={0.85}
          grande
        />

        {/* Guion */}
        {mostrarGuion && (
          <div className="space-y-2 mt-4 pt-4 border-t border-slate-700/50">
            {data.guion?.map((g, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-xs text-indigo-400 font-semibold shrink-0 w-16">
                  {g.hablante}
                </span>
                <div className="flex-1 flex items-start gap-1">
                  <p className="text-sm text-slate-300 italic flex-1">
                    "{g.linea}"
                  </p>
                  <TTSButton texto={g.linea} rate={0.85} />
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-slate-500 text-center">
          💡 Escucha primero sin leer. Intenta entender la idea general.
        </p>
      </div>

      {/* Preguntas */}
      {preguntaActual && !enviado && (
        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-4">
          {/* Progreso */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{
                  width: `${((indicePregunta + 1) / totalPreguntas) * 100}%`,
                }}
              />
            </div>
            <span className="text-xs text-slate-400 tabular-nums">
              {indicePregunta + 1}/{totalPreguntas}
            </span>
          </div>

          <p className="text-white font-medium leading-relaxed">
            {preguntaActual.pregunta}
          </p>

          <div className="space-y-2">
            {preguntaActual.opciones.map((op, i) => {
              const seleccionada = respuestas[indicePregunta] === op;
              return (
                <button
                  key={i}
                  onClick={() => responder(op)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-center gap-3 active:scale-[0.98] ${
                    seleccionada
                      ? "border-indigo-500 bg-indigo-500/10 text-white"
                      : "border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <span
                    className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                      seleccionada
                        ? "bg-indigo-500 text-white"
                        : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {LETRAS[i]}
                  </span>
                  <span className="flex-1 leading-snug">{op}</span>
                </button>
              );
            })}
          </div>

          {/* Navegación */}
          <div className="flex gap-2 pt-2">
            {indicePregunta > 0 && (
              <button
                onClick={() => setIndicePregunta((i) => i - 1)}
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2.5 rounded-xl"
              >
                ← Anterior
              </button>
            )}
            {indicePregunta < totalPreguntas - 1 ? (
              <button
                onClick={() => setIndicePregunta((i) => i + 1)}
                disabled={!respuestas[indicePregunta]}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl"
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={enviar}
                disabled={respondidas < totalPreguntas}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl"
              >
                ✓ Ver resultado
              </button>
            )}
          </div>
        </div>
      )}

      {/* Resultado */}
      {enviado && resultado && (
        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-4">
          <div className="text-center">
            <p className="text-4xl mb-2">
              {resultado.puntaje >= 100
                ? "🏆"
                : resultado.puntaje >= 67
                ? "🎉"
                : "💪"}
            </p>
            <p className="text-lg font-bold text-white mb-1">
              {resultado.correctas} / {resultado.total} correctas
            </p>
            <p
              className={`text-sm font-medium ${
                resultado.puntaje >= 67
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}
            >
              {resultado.puntaje}%
            </p>
          </div>

          {/* Detalle por pregunta */}
          <div className="space-y-3 pt-3 border-t border-slate-700/50">
            {data.preguntas.map((p, i) => {
              const acerto = respuestas[i] === p.respuesta_correcta;
              return (
                <div
                  key={i}
                  className={`rounded-xl p-3 border ${
                    acerto
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-red-500/5 border-red-500/30"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span>{acerto ? "✅" : "❌"}</span>
                    <p className="text-sm text-white flex-1">{p.pregunta}</p>
                  </div>
                  {!acerto && (
                    <p className="text-xs text-slate-400 pl-7">
                      Correcta:{" "}
                      <span className="text-emerald-300">
                        {p.respuesta_correcta}
                      </span>
                    </p>
                  )}
                  {p.explicacion && (
                    <p className="text-xs text-slate-400 pl-7 mt-1">
                      {p.explicacion}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={cargar}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-3 rounded-xl"
            >
              🎧 Otro listening
            </button>
            <button
              onClick={() => {
                setEnviado(false);
                setRespuestas({});
                setResultado(null);
                setIndicePregunta(0);
              }}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-3 rounded-xl"
            >
              🔁 Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}