import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const STORAGE_CHAT = "chat_historial_v1";

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

// Render mínimo de markdown: **negrita**, *cursiva*, `código`, listas, saltos
function renderMarkdown(texto) {
  if (!texto) return null;
  const lineas = texto.split("\n");
  return lineas.map((linea, i) => {
    // Listas con - o *
    const esLista = /^\s*[-*]\s+/.test(linea);
    const contenido = esLista ? linea.replace(/^\s*[-*]\s+/, "") : linea;

    // Inline: **bold**, *italic*, `code`
    const partes = [];
    let resto = contenido;
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0, m;
    while ((m = regex.exec(contenido)) !== null) {
      if (m.index > last) partes.push(contenido.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) {
        partes.push(<strong key={partes.length} className="font-semibold">{tok.slice(2, -2)}</strong>);
      } else if (tok.startsWith("`")) {
        partes.push(
          <code key={partes.length} className="bg-slate-700/70 px-1 py-0.5 rounded text-[0.85em]">
            {tok.slice(1, -1)}
          </code>
        );
      } else {
        partes.push(<em key={partes.length}>{tok.slice(1, -1)}</em>);
      }
      last = m.index + tok.length;
    }
    if (last < contenido.length) partes.push(contenido.slice(last));

    if (linea.trim() === "") return <div key={i} className="h-2" />;

    return esLista ? (
      <div key={i} className="flex gap-2 pl-1">
        <span className="text-indigo-400 select-none">•</span>
        <span>{partes}</span>
      </div>
    ) : (
      <div key={i}>{partes}</div>
    );
  });
}

// Sugerencias rápidas iniciales
const SUGERENCIAS = [
  "Quiero inglés para el trabajo",
  "Hazme un ejercicio de past simple",
  "Explícame el presente perfecto",
  "Corrige esta frase: I have 25 years",
];

// ------------------------------------------------------------------
// Componente
// ------------------------------------------------------------------
export default function Chat() {
  const userId = useMemo(() => getUserId(), []);

  const [mensajes, setMensajes] = useState(() => {
    // Recuperar historial si existe
    try {
      const guardado = localStorage.getItem(STORAGE_CHAT);
      if (guardado) return JSON.parse(guardado);
    } catch {}
    return [{
      rol: "agente",
      texto: "🎓 ¡Hola! Soy tu tutor de inglés. ¿En qué quieres trabajar hoy?",
    }];
  });

  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [objetivoCambio, setObjetivoCambio] = useState(false);
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);

  const finRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  // Persistir historial
  useEffect(() => {
    try {
      // Limita a los últimos 50 mensajes para no inflar localStorage
      const recortado = mensajes.slice(-50);
      localStorage.setItem(STORAGE_CHAT, JSON.stringify(recortado));
    } catch {}
  }, [mensajes]);

  // Scroll al final
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, cargando]);

  // Cargar objetivo adaptativo actual al montar
  useEffect(() => {
    fetch(`${API_URL}/api/progreso?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setObjetivo(d.objetivo_adaptativo || ""))
      .catch(() => {});
  }, [userId]);

  // Autoexpandir textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [input]);

  const enviar = useCallback(async (textoForzado) => {
    const texto = (textoForzado ?? input).trim();
    if (!texto || cargando) return;

    setInput("");
    setMensajes((prev) => [...prev, { rol: "usuario", texto }]);
    setCargando(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto, user_id: userId }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setMensajes((prev) => [
        ...prev,
        { rol: "agente", texto: data.respuesta || "⚠️ Hubo un error, intenta de nuevo." },
      ]);

      // Si el objetivo cambió, avisar visualmente
      if (data.objetivo_adaptativo && data.objetivo_adaptativo !== objetivo) {
        setObjetivo(data.objetivo_adaptativo);
        setObjetivoCambio(true);
        setTimeout(() => setObjetivoCambio(false), 4000);
      }
    } catch (e) {
      if (e.name === "AbortError") {
        setMensajes((prev) => [...prev, { rol: "agente", texto: "⏹️ Cancelado." }]);
      } else {
        setMensajes((prev) => [
          ...prev,
          { rol: "agente", texto: "⚠️ No pude conectar con el servidor. Revisa tu conexión." },
        ]);
      }
    } finally {
      setCargando(false);
      abortRef.current = null;
    }
  }, [input, cargando, userId, objetivo]);

  function manejarEnter(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      enviar();
    }
  }

  function cancelar() {
    abortRef.current?.abort();
  }

  function limpiarChat() {
    if (!confirmarLimpiar) {
      setConfirmarLimpiar(true);
      setTimeout(() => setConfirmarLimpiar(false), 3000);
      return;
    }
    setMensajes([{
      rol: "agente",
      texto: "🎓 Chat reiniciado. ¿En qué quieres trabajar ahora?",
    }]);
    setConfirmarLimpiar(false);
    localStorage.removeItem(STORAGE_CHAT);
  }

  const chatVacio = mensajes.length <= 1;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* ============ Header con objetivo adaptativo ============ */}
      {(objetivo || objetivoCambio) && (
        <div
          className={`px-4 py-2.5 border-b text-xs flex items-start gap-2 transition-colors ${
            objetivoCambio
              ? "bg-indigo-600/30 border-indigo-500/50"
              : "bg-slate-800/50 border-slate-700/50"
          }`}
          style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
          <span className="text-base leading-none mt-0.5">🎯</span>
          <div className="flex-1 min-w-0">
            <p className="text-slate-400 uppercase tracking-wide text-[10px] mb-0.5">
              {objetivoCambio ? "Objetivo actualizado" : "Objetivo adaptativo"}
            </p>
            <p className={`text-xs leading-snug ${objetivoCambio ? "text-white font-medium" : "text-slate-300"}`}>
              {objetivo}
            </p>
          </div>
          <button
            onClick={limpiarChat}
            className={`shrink-0 text-xs px-2 py-1 rounded-lg transition-colors ${
              confirmarLimpiar
                ? "bg-red-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            }`}
            title={confirmarLimpiar ? "Confirma para borrar" : "Limpiar chat"}
          >
            {confirmarLimpiar ? "¿Seguro?" : "🗑️"}
          </button>
        </div>
      )}

      {/* ============ Mensajes ============ */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3">
        {mensajes.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.rol === "usuario" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.rol === "usuario"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700/50"
              }`}
            >
              {m.rol === "agente" ? renderMarkdown(m.texto) : (
                <span className="whitespace-pre-wrap">{m.texto}</span>
              )}
            </div>
          </div>
        ))}

        {/* Sugerencias cuando el chat está vacío */}
        {chatVacio && !cargando && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGERENCIAS.map((s, i) => (
              <button
                key={i}
                onClick={() => enviar(s)}
                className="text-xs bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Indicador escribiendo */}
        {cargando && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
              </div>
              <button
                onClick={cancelar}
                className="text-[10px] text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      {/* ============ Input ============ */}
      <div
        className="px-3 sm:px-4 py-3 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={manejarEnter}
            placeholder="Escribe tu mensaje…"
            rows={1}
            enterKeyHint="send"
            className="flex-1 resize-none bg-slate-800 text-white placeholder-slate-500 rounded-xl px-3.5 py-2.5 text-sm leading-relaxed border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-h-36 overflow-y-auto"
          />
          <button
            onClick={() => enviar()}
            disabled={cargando || !input.trim()}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-700 disabled:cursor-not-allowed disabled:active:scale-100 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-all flex items-center gap-1.5"
            aria-label="Enviar mensaje"
          >
            <span className="hidden sm:inline">Enviar</span>
            <span className="sm:hidden text-base">↑</span>
          </button>
        </div>
        <p className="text-[10px] text-slate-500 text-center mt-1.5 hidden sm:block">
          Enter para enviar · Shift+Enter para salto de línea
        </p>
      </div>
    </div>
  );
}