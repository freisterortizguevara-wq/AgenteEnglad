import { useState, useEffect, useCallback, useMemo } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const CACHE_KEY = "videos_cache_v1";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

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

function leerCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, videos, tema } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return { videos, tema };
  } catch {
    return null;
  }
}

function guardarCache(videos, tema) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), videos, tema })
    );
  } catch {}
}

// ------------------------------------------------------------------
// Subcomponentes
// ------------------------------------------------------------------
function SkeletonVideo() {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-video bg-slate-700/50" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-slate-700/50 rounded w-11/12" />
        <div className="h-3 bg-slate-700/50 rounded w-2/3" />
      </div>
    </div>
  );
}

function TarjetaVideo({ video }) {
  const [reproducir, setReproducir] = useState(false);

  const thumb = `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`;

  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden transition-colors hover:border-slate-600">
      <div className="aspect-video relative bg-slate-900">
        {reproducir ? (
          <iframe
            src={`https://www.youtube.com/embed/${video.video_id}?autoplay=1&rel=0`}
            title={video.titulo}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            onClick={() => setReproducir(true)}
            className="w-full h-full relative group"
            aria-label={`Reproducir ${video.titulo}`}
          >
            <img
              src={thumb}
              alt={video.titulo}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback si la thumb falla
                e.currentTarget.style.display = "none";
              }}
            />
            {/* Overlay play */}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-red-600 group-hover:scale-110 transition-transform flex items-center justify-center shadow-lg">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white translate-x-0.5" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-sm text-white line-clamp-2 leading-snug">
          {video.titulo}
        </p>
        <div className="flex items-center justify-between gap-2">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-indigo-400 transition-colors"
          >
            Abrir en YouTube ↗
          </a>
          {!reproducir && (
            <button
              onClick={() => setReproducir(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              ▶ Reproducir aquí
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------------
export default function Videos() {
  const userId = useMemo(() => getUserId(), []);

  const [videos, setVideos] = useState([]);
  const [temaUsado, setTemaUsado] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busquedaManual, setBusquedaManual] = useState("");
  const [modoManual, setModoManual] = useState(false);

  // ---------- Cargar objetivo adaptativo ----------
  const cargarObjetivo = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/progreso?user_id=${userId}`).then((r) => r.json());
      setObjetivo(r.objetivo_adaptativo || "");
    } catch {}
  }, [userId]);

  // ---------- Cargar videos ----------
  const cargarVideos = useCallback(
    async (tema = null, { usarCache = true } = {}) => {
      setCargando(true);
      setError(null);

      // Cache solo para la carga automática (no para búsquedas manuales)
      if (usarCache && !tema) {
        const cache = leerCache();
        if (cache) {
          setVideos(cache.videos);
          setTemaUsado(cache.tema);
          setCargando(false);
          cargarObjetivo();
          return;
        }
      }

      try {
        const qs = new URLSearchParams({ user_id: userId });
        if (tema) qs.set("tema", tema);

        const res = await fetch(`${API_URL}/api/videos?${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        const lista = data.videos || [];
        const temaFinal = data.tema_usado || tema || "";
        setVideos(lista);
        setTemaUsado(temaFinal);

        // Cache solo si fue carga automática
        if (!tema) guardarCache(lista, temaFinal);
      } catch (e) {
        setError(e.message || "No se pudieron cargar los videos.");
        setVideos([]);
      } finally {
        setCargando(false);
        cargarObjetivo();
      }
    },
    [userId, cargarObjetivo]
  );

  useEffect(() => {
    cargarVideos();
  }, [cargarVideos]);

  // ---------- Búsqueda manual ----------
  function buscar(e) {
    e.preventDefault();
    const tema = busquedaManual.trim();
    if (!tema) return;
    setModoManual(true);
    cargarVideos(tema, { usarCache: false });
  }

  function volverAuto() {
    setModoManual(false);
    setBusquedaManual("");
    cargarVideos();
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 overflow-y-auto h-full">
      {/* ============ Objetivo adaptativo ============ */}
      {objetivo && !modoManual && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">🎯</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-indigo-300 uppercase tracking-wide">
              Recomendado según tu objetivo
            </p>
            <p className="text-xs text-slate-200 leading-snug">{objetivo}</p>
          </div>
        </div>
      )}

      {/* ============ Header: buscador + actualizar ============ */}
      <div className="flex flex-col gap-3 mb-5">
        <form onSubmit={buscar} className="flex gap-2">
          <input
            type="text"
            value={busquedaManual}
            onChange={(e) => setBusquedaManual(e.target.value)}
            placeholder="Buscar tema: phrasal verbs, past simple…"
            className="flex-1 bg-slate-800 text-white placeholder-slate-500 rounded-xl px-3.5 py-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!busquedaManual.trim() || cargando}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all"
          >
            🔍
          </button>
        </form>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-slate-400 truncate">
            {modoManual ? (
              <>
                Búsqueda manual: <span className="text-indigo-400">{temaUsado}</span>
              </>
            ) : (
              <>
                Según tu objetivo: <span className="text-indigo-400">{temaUsado || "cargando…"}</span>
              </>
            )}
          </p>
          <div className="flex gap-2 shrink-0">
            {modoManual && (
              <button
                onClick={volverAuto}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                ↩ Auto
              </button>
            )}
            <button
              onClick={() => cargarVideos(modoManual ? temaUsado : null, { usarCache: false })}
              disabled={cargando}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* ============ Contenido ============ */}
      {cargando ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonVideo key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="bg-slate-800/60 border border-red-500/30 rounded-2xl p-6 text-center">
          <p className="text-3xl mb-2">😕</p>
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={() => cargarVideos()}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all"
          >
            Reintentar
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-8 text-center">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-slate-400 text-sm mb-1">
            No encontré videos para {modoManual ? `"${temaUsado}"` : "tu objetivo actual"}.
          </p>
          <p className="text-slate-500 text-xs mb-4">
            Prueba con otra búsqueda o pulsa actualizar.
          </p>
          {modoManual && (
            <button
              onClick={volverAuto}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg"
            >
              Volver a recomendaciones
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v, i) => (
            <TarjetaVideo key={v.video_id || i} video={v} />
          ))}
        </div>
      )}

      {/* Footer info */}
      {!cargando && videos.length > 0 && (
        <p className="text-[10px] text-slate-500 text-center mt-6">
          {videos.length} {videos.length === 1 ? "video" : "videos"} · Fuente: YouTube vía Tavily
        </p>
      )}
    </div>
  );
}