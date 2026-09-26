import { useState, useEffect } from "react";

const API_URL = "http://127.0.0.1:8000";

export default function Videos() {
  const [videos, setVideos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [temaUsado, setTemaUsado] = useState("");

  function cargarVideos() {
    setCargando(true);
    fetch(`${API_URL}/api/videos`)
      .then((r) => r.json())
      .then((data) => {
        setVideos(data.videos || []);
        setTemaUsado(data.tema_usado || "");
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }

  useEffect(() => {
    cargarVideos();
  }, []);

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-400">
          Videos recomendados según tu objetivo: <span className="text-indigo-400">{temaUsado}</span>
        </p>
        <button
          onClick={cargarVideos}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          🔄 Actualizar
        </button>
      </div>

      {cargando ? (
        <p className="text-slate-400 text-sm">Buscando videos...</p>
      ) : videos.length === 0 ? (
        <p className="text-slate-500 text-sm italic">No se encontraron videos. Intenta actualizar.</p>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {videos.map((v, i) => (
            <div key={i} className="bg-slate-800 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${v.video_id}`}
                  title={v.titulo}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
              <div className="p-3">
                <p className="text-sm text-white line-clamp-2">{v.titulo}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}