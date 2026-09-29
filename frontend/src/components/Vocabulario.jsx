import { useState, useEffect, useCallback, useMemo } from "react";

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

const CALIDADES = [
  { valor: 0, etiqueta: "Otra vez", emoji: "🔁", color: "bg-red-600 hover:bg-red-500",         atajo: "1" },
  { valor: 1, etiqueta: "Difícil",  emoji: "😅", color: "bg-amber-600 hover:bg-amber-500",     atajo: "2" },
  { valor: 2, etiqueta: "Bien",     emoji: "👍", color: "bg-indigo-600 hover:bg-indigo-500",   atajo: "3" },
  { valor: 3, etiqueta: "Fácil",    emoji: "🚀", color: "bg-emerald-600 hover:bg-emerald-500", atajo: "4" },
];

function TTSButton({ texto }) {
  const hablar = useCallback(
    (e) => {
      e.stopPropagation();
      if (!window.speechSynthesis || !texto) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "en-US";
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    },
    [texto]
  );

  return (
    <button
      onClick={hablar}
      className="text-slate-400 hover:text-indigo-400 transition-colors p-1 text-sm shrink-0"
      title="Escuchar"
      aria-label="Escuchar"
      type="button"
    >
      🔊
    </button>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2.5 text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// ------------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------------
export default function Vocabulario() {
  const userId = useMemo(() => getUserId(), []);

  const [vista, setVista] = useState("estudio");
  const [stats, setStats] = useState({ total: 0, pendientes_hoy: 0, consolidadas: 0, nuevas: 0 });
  const [pendientes, setPendientes] = useState([]);
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [indice, setIndice] = useState(0);
  const [volteada, setVolteada] = useState(false);
  const [sesion, setSesion] = useState({ revisadas: 0, correctas: 0 });
  const [terminado, setTerminado] = useState(false);

  const [nueva, setNueva] = useState({ palabra: "", traduccion: "", ejemplo: "" });
  const [mostrarForm, setMostrarForm] = useState(false);

  // ---------- Cargar ----------
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [rLista, rPend] = await Promise.all([
        fetch(`${API_URL}/api/vocabulario?user_id=${userId}`).then((r) => r.json()),
        fetch(`${API_URL}/api/vocabulario/pendientes?user_id=${userId}&limite=30`).then((r) => r.json()),
      ]);
      setLista(rLista.palabras || []);
      setStats(rLista.stats || { total: 0, pendientes_hoy: 0, consolidadas: 0, nuevas: 0 });
      setPendientes(rPend.pendientes || []);
      setIndice(0);
      setVolteada(false);
      setTerminado(false);
      setSesion({ revisadas: 0, correctas: 0 });
    } catch (e) {
      setError(e.message || "Error al cargar vocabulario.");
    } finally {
      setCargando(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ---------- Calificar ----------
  const calificar = useCallback(
    async (calidad) => {
      const actual = pendientes[indice];
      if (!actual) return;

      setSesion((s) => ({
        revisadas: s.revisadas + 1,
        correctas: s.correctas + (calidad >= 2 ? 1 : 0),
      }));

      try {
        await fetch(`${API_URL}/api/vocabulario/revisar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, palabra_id: actual.id, calidad }),
        });
      } catch (e) {
        console.warn("No se pudo guardar la revisión:", e);
      }

      setVolteada(false);
      if (indice + 1 >= pendientes.length) {
        setTerminado(true);
      } else {
        setIndice((i) => i + 1);
      }
    },
    [pendientes, indice, userId]
  );

  // ---------- Atajos de teclado ----------
  useEffect(() => {
    function onKey(e) {
      if (vista !== "estudio" || terminado || cargando) return;
      if (!volteada && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setVolteada(true);
        return;
      }
      if (volteada && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        calificar(parseInt(e.key, 10) - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vista, volteada, terminado, cargando, calificar]);

  // ---------- Añadir manual ----------
  async function agregarManual(e) {
    e.preventDefault();
    if (!nueva.palabra.trim()) return;
    try {
      await fetch(`${API_URL}/api/vocabulario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...nueva }),
      });
      setNueva({ palabra: "", traduccion: "", ejemplo: "" });
      setMostrarForm(false);
      cargar();
    } catch (err) {
      console.warn("Error al guardar palabra:", err);
    }
  }

  // ---------- Render: cargando ----------
  if (cargando) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3 animate-pulse">
        <div className="h-10 bg-slate-700/50 rounded-xl" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-700/50 rounded-xl" />
          ))}
        </div>
        <div className="h-56 bg-slate-700/50 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto text-center">
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

  const actual = pendientes[indice];
  const total = pendientes.length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto h-full overflow-y-auto">
      {/* ============ Tabs ============ */}
      <div className="inline-flex bg-slate-800 border border-slate-700/50 rounded-xl p-1 mb-5">
        <button
          onClick={() => setVista("estudio")}
          className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            vista === "estudio"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🎴 Estudiar
          {stats.pendientes_hoy > 0 && (
            <span className="ml-1.5 bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
              {stats.pendientes_hoy}
            </span>
          )}
        </button>
        <button
          onClick={() => setVista("lista")}
          className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
            vista === "lista"
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📚 Mi vocabulario
          <span className="ml-1.5 bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
            {stats.total}
          </span>
        </button>
      </div>

      {vista === "estudio" ? (
        <div className="space-y-4">
          {/* ============ Stats ============ */}
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Hoy" value={stats.pendientes_hoy} color="text-white" />
            <StatBox label="Consolidadas" value={stats.consolidadas} color="text-emerald-400" />
            <StatBox label="Nuevas" value={stats.nuevas} color="text-indigo-400" />
          </div>

          {/* ============ Contenido ============ */}
          {total === 0 ? (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl py-12 px-6 text-center">
              <p className="text-5xl mb-3">🎉</p>
              <p className="text-white text-sm font-medium mb-1">
                ¡Sin tarjetas pendientes hoy!
              </p>
              <p className="text-slate-400 text-xs">
                Vuelve mañana o añade palabras nuevas desde el chat.
              </p>
            </div>
          ) : terminado ? (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl py-12 px-6 text-center">
              <p className="text-5xl mb-3">🏆</p>
              <p className="text-white text-sm font-medium mb-2">
                ¡Sesión completada!
              </p>
              <p className="text-slate-400 text-xs mb-4">
                Revisaste {sesion.revisadas}{" "}
                {sesion.revisadas === 1 ? "tarjeta" : "tarjetas"}
                {sesion.revisadas > 0 && (
                  <>
                    {" · "}
                    <span className="text-emerald-400">
                      {Math.round((sesion.correctas / sesion.revisadas) * 100)}% aciertos
                    </span>
                  </>
                )}
              </p>
              <button
                onClick={cargar}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2 rounded-lg"
              >
                Recargar pendientes
              </button>
            </div>
          ) : (
            <>
              {/* Progreso */}
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                    style={{ width: `${((indice + 1) / total) * 100}%` }}
                  />
                </div>
                <span className="tabular-nums font-medium">
                  {indice + 1}/{total}
                </span>
              </div>

              {/* Tarjeta */}
              <div
                onClick={() => !volteada && setVolteada(true)}
                className={`bg-gradient-to-br from-slate-800 to-slate-850 border border-slate-700/50 rounded-2xl p-8 min-h-[220px] flex flex-col items-center justify-center text-center transition-all ${
                  !volteada
                    ? "cursor-pointer hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/10"
                    : ""
                }`}
              >
                {!volteada ? (
                  <>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">
                      ¿Cómo se dice?
                    </p>
                    <p className="text-3xl font-bold text-white mb-3 break-all">
                      {actual.palabra}
                    </p>
                    <TTSButton texto={actual.palabra} />
                    <p className="text-[10px] text-slate-600 mt-4">
                      Toca para ver la respuesta
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-500 mb-2">{actual.palabra}</p>
                    <p className="text-2xl font-semibold text-indigo-300 mb-4">
                      {actual.traduccion || "—"}
                    </p>
                    {actual.ejemplo && (
                      <div className="bg-slate-900/60 rounded-xl px-4 py-2.5 max-w-md w-full">
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-slate-300 italic flex-1 text-left">
                            {actual.ejemplo}
                          </p>
                          <TTSButton texto={actual.ejemplo} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Botones de calificación */}
              {volteada && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CALIDADES.map((c) => (
                    <button
                      key={c.valor}
                      onClick={() => calificar(c.valor)}
                      className={`${c.color} active:scale-95 text-white text-xs font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2`}
                    >
                      <span>{c.emoji}</span>
                      <span>{c.etiqueta}</span>
                      <span className="hidden sm:inline text-[10px] opacity-60">
                        {c.atajo}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Info SRS */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                <span>
                  Reps: {actual.repeticiones} · Intervalo: {actual.intervalo_dias}d
                </span>
                <span>
                  Facilidad:{" "}
                  {typeof actual.facilidad === "number"
                    ? actual.facilidad.toFixed(2)
                    : actual.facilidad}
                </span>
              </div>
            </>
          )}

          {/* Botón añadir */}
          <div className="pt-2">
            {!mostrarForm ? (
              <button
                onClick={() => setMostrarForm(true)}
                className="w-full bg-slate-800/60 hover:bg-slate-800 border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 text-sm py-2.5 rounded-xl transition-colors"
              >
                ➕ Añadir palabra manualmente
              </button>
            ) : (
              <form
                onSubmit={agregarManual}
                className="bg-slate-800 border border-slate-700/50 rounded-2xl p-4 space-y-3"
              >
                <p className="text-xs text-slate-400 uppercase tracking-wide">
                  Nueva palabra
                </p>
                <input
                  type="text"
                  placeholder="Palabra en inglés *"
                  value={nueva.palabra}
                  onChange={(e) => setNueva((n) => ({ ...n, palabra: e.target.value }))}
                  required
                  autoFocus
                  className="w-full bg-slate-900 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Traducción"
                  value={nueva.traduccion}
                  onChange={(e) => setNueva((n) => ({ ...n, traduccion: e.target.value }))}
                  className="w-full bg-slate-900 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Frase de ejemplo"
                  value={nueva.ejemplo}
                  onChange={(e) => setNueva((n) => ({ ...n, ejemplo: e.target.value }))}
                  className="w-full bg-slate-900 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 rounded-lg"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarForm(false);
                      setNueva({ palabra: "", traduccion: "", ejemplo: "" });
                    }}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        // ============ Vista lista ============
        <div className="space-y-2">
          {lista.length === 0 ? (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl py-12 px-6 text-center">
              <p className="text-5xl mb-3">📚</p>
              <p className="text-slate-400 text-sm">
                Aún no tienes palabras guardadas.
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Pídele al tutor que te guarde vocabulario nuevo en el chat.
              </p>
            </div>
          ) : (
            lista.map((p) => {
              const vencida = new Date(p.proxima_revision) <= new Date();
              return (
                <div
                  key={p.id}
                  className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-3 flex items-start gap-3 hover:border-slate-600 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium text-white truncate">
                        {p.palabra}
                      </p>
                      <TTSButton texto={p.palabra} />
                    </div>
                    {p.traduccion && (
                      <p className="text-xs text-slate-400 truncate">
                        {p.traduccion}
                      </p>
                    )}
                    {p.ejemplo && (
                      <p className="text-[11px] text-slate-500 italic mt-1 truncate">
                        {p.ejemplo}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        vencida
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-700/60 text-slate-400"
                      }`}
                    >
                      {vencida ? "Hoy" : `En ${p.intervalo_dias}d`}
                    </span>
                    <p className="text-[9px] text-slate-500 mt-1">
                      {p.repeticiones} reps
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}