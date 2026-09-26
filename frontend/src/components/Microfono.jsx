import { useState, useEffect, useRef } from "react";

const API_URL = "http://127.0.0.1:8000";

function calcularSimilitud(objetivo, dicho) {
  const limpiar = (s) => s.toLowerCase().replace(/[^\w\s]/g, "").trim().split(/\s+/);
  const palabrasObjetivo = limpiar(objetivo);
  const palabrasDichas = limpiar(dicho);

  let aciertos = 0;
  palabrasObjetivo.forEach((p) => {
    if (palabrasDichas.includes(p)) aciertos++;
  });

  return Math.round((aciertos / palabrasObjetivo.length) * 100);
}

export default function Microfono() {
  const [frase, setFrase] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [grabando, setGrabando] = useState(false);
  const [transcripcion, setTranscripcion] = useState("");
  const [puntaje, setPuntaje] = useState(null);
  const [soportado, setSoportado] = useState(true);
  const reconocimientoRef = useRef(null);

  function cargarFrase() {
    setCargando(true);
    setTranscripcion("");
    setPuntaje(null);
    fetch(`${API_URL}/api/frase-practica`)
      .then((r) => r.json())
      .then((data) => {
        setFrase(data);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSoportado(false);
      return;
    }

    const reconocimiento = new SpeechRecognition();
    reconocimiento.lang = "en-US";
    reconocimiento.interimResults = false;
    reconocimiento.maxAlternatives = 1;

    reconocimiento.onresult = (event) => {
      const texto = event.results[0][0].transcript;
      setTranscripcion(texto);
      if (frase?.frase) {
        setPuntaje(calcularSimilitud(frase.frase, texto));
      }
    };

    reconocimiento.onend = () => setGrabando(false);
    reconocimiento.onerror = () => setGrabando(false);

    reconocimientoRef.current = reconocimiento;
    cargarFrase();
  }, []);

  function iniciarGrabacion() {
    if (!reconocimientoRef.current) return;
    setTranscripcion("");
    setPuntaje(null);
    setGrabando(true);
    reconocimientoRef.current.start();
  }

  if (!soportado) {
    return (
      <div className="p-8 text-center">
        <p className="text-amber-400 text-sm">
          ⚠️ Tu navegador no soporta reconocimiento de voz. Usa Google Chrome o Microsoft Edge para esta función.
        </p>
      </div>
    );
  }

  if (cargando) {
    return <div className="p-6 text-slate-400 text-sm">Generando frase de práctica...</div>;
  }

  if (!frase || frase.error) {
    return <div className="p-6 text-red-400 text-sm">{frase?.error || "Error al cargar la frase."}</div>;
  }

  return (
    <div className="p-8 max-w-xl mx-auto h-full overflow-y-auto">
      {/* Frase objetivo */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 mb-4 text-center">
        <p className="text-2xl text-white font-semibold mb-2">{frase.frase}</p>
        <p className="text-sm text-slate-400">{frase.traduccion}</p>
      </div>

      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 mb-6">
        <p className="text-xs text-indigo-300">💡 {frase.tip_pronunciacion}</p>
      </div>

      {/* Botón de grabar */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={iniciarGrabacion}
          disabled={grabando}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all ${
            grabando
              ? "bg-red-500 animate-pulse scale-110"
              : "bg-indigo-600 hover:bg-indigo-500 hover:scale-105"
          }`}
        >
          🎤
        </button>
        <p className="text-sm text-slate-400">
          {grabando ? "Escuchando... habla ahora" : "Toca para grabar tu pronunciación"}
        </p>
      </div>

      {/* Resultado */}
      {transcripcion && (
        <div className="mt-6 bg-slate-800 border border-slate-700/50 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">Lo que dijiste:</p>
          <p className="text-white text-sm mb-4">"{transcripcion}"</p>

          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  puntaje >= 80 ? "bg-emerald-500" : puntaje >= 50 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${puntaje}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-white">{puntaje}%</span>
          </div>

          <p className="text-xs text-slate-400 mt-2">
            {puntaje >= 80 ? "🎉 ¡Excelente pronunciación!" : puntaje >= 50 ? "👍 Bien, sigue practicando" : "🔁 Intenta de nuevo, tómalo con calma"}
          </p>
        </div>
      )}

      <button
        onClick={cargarFrase}
        className="mt-6 w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        Siguiente frase →
      </button>
    </div>
  );
}