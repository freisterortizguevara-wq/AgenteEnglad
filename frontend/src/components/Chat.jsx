import { useState, useRef, useEffect } from "react";

const API_URL = "http://127.0.0.1:8000";

export default function Chat() {
  const [mensajes, setMensajes] = useState([
    { rol: "agente", texto: "🎓 ¡Hola! Soy tu tutor de inglés. ¿En qué quieres trabajar hoy?" },
  ]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  async function enviarMensaje() {
    if (!input.trim() || cargando) return;
    const texto = input;
    setInput("");
    setMensajes((prev) => [...prev, { rol: "usuario", texto }]);
    setCargando(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto }),
      });
      const data = await res.json();
      setMensajes((prev) => [
        ...prev,
        { rol: "agente", texto: data.respuesta || "⚠️ Hubo un error, intenta de nuevo." },
      ]);
    } catch (e) {
      setMensajes((prev) => [
        ...prev,
        { rol: "agente", texto: "⚠️ No pude conectar con el servidor." },
      ]);
    } finally {
      setCargando(false);
    }
  }

  function manejarEnter(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.rol === "usuario" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.rol === "usuario"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700/50"
              }`}
            >
              {m.texto}
            </div>
          </div>
        ))}
        {cargando && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="px-4 py-4 border-t border-slate-700/50 bg-slate-900/80">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={manejarEnter}
            placeholder="Escribe tu mensaje..."
            rows={1}
            className="flex-1 resize-none bg-slate-800 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={enviarMensaje}
            disabled={cargando || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}