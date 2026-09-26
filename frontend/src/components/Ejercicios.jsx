import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Ejercicios() {
  const [ejercicio, setEjercicio] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [racha, setRacha] = useState(0);

  async function cargarEjercicio() {
    setCargando(true);
    setSeleccion(null);
    setMostrarResultado(false);
    try {
      const res = await fetch(`${API_URL}/api/ejercicio`);
      const data = await res.json();
      setEjercicio(data);
    } catch {
      setEjercicio({ error: "No se pudo conectar con el servidor." });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarEjercicio();
  }, []);

  function seleccionarOpcion(opcion) {
    if (mostrarResultado) return;
    setSeleccion(opcion);
    setMostrarResultado(true);
    if (opcion === ejercicio.respuesta_correcta) {
      setRacha((r) => r + 1);
    } else {
      setRacha(0);
    }
  }

  if (cargando) {
    return <div className="p-4 md:p-6 text-slate-400 text-sm">Generando ejercicio...</div>;
  }

  if (!ejercicio || ejercicio.error) {
    return (
      <div className="p-4 md:p-6 text-center">
        <p className="text-red-400 text-sm mb-4">{ejercicio?.error || "Error al cargar."}</p>
        <button
          onClick={cargarEjercicio}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-xl mx-auto h-full overflow-y-auto">
      {/* Racha de aciertos */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          {ejercicio.tema}
        </span>
        <span className="text-sm text-amber-400">🔥 {racha} seguidas</span>
      </div>

      {/* Pregunta */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 mb-4">
        <p className="text-white text-base leading-relaxed">{ejercicio.pregunta}</p>
      </div>

      {/* Opciones */}
      <div className="space-y-3">
        {ejercicio.opciones.map((op, i) => {
          const esCorrecta = op === ejercicio.respuesta_correcta;
          const esSeleccionada = op === seleccion;

          let estilo = "border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500";
          if (mostrarResultado) {
            if (esCorrecta) estilo = "border-emerald-500 bg-emerald-500/10 text-emerald-300";
            else if (esSeleccionada) estilo = "border-red-500 bg-red-500/10 text-red-300";
            else estilo = "border-slate-700 bg-slate-800/50 text-slate-500";
          }

          return (
            <button
              key={i}
              onClick={() => seleccionarOpcion(op)}
              disabled={mostrarResultado}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${estilo}`}
            >
              {op}
            </button>
          );
        })}
      </div>

      {/* Explicación */}
      {mostrarResultado && (
        <div className="mt-5 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-sm text-slate-300">
            {seleccion === ejercicio.respuesta_correcta ? "✅ ¡Correcto! " : "❌ No era esa. "}
            {ejercicio.explicacion}
          </p>
          <button
            onClick={cargarEjercicio}
            className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Siguiente ejercicio →
          </button>
        </div>
      )}
    </div>
  );
}