import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, RadialBarChart, RadialBar,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, Legend,
} from "recharts";
import { jsPDF } from "jspdf";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const COLOR_OK = "#10b981";
const COLOR_MEDIO = "#f59e0b";
const COLOR_BAJO = "#ef4444";
const COLOR_PROG = "#6366f1";
const COLOR_PURPLE = "#a855f7";
const COLOR_CYAN = "#06b6d4";

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

function colorPorRatio(ratio) {
  if (ratio >= 0.8) return COLOR_OK;
  if (ratio >= 0.6) return COLOR_MEDIO;
  return COLOR_BAJO;
}

function claseBadgeNivel(nivel) {
  return {
    principiante: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    intermedio: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    avanzado: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  }[nivel] || "bg-slate-500/20 text-slate-300 border-slate-500/40";
}

// Hook: contador animado
function useAnimatedNumber(target, duration = 900) {
  const [value, setValue] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    let raf;
    const animate = (t) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    startRef.current = null;
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// Hook: detectar cambios para notificar
function useDelta(actual, anterior) {
  if (anterior === null || anterior === undefined) return null;
  const delta = actual - anterior;
  if (delta === 0) return { delta: 0, dir: "same" };
  return { delta, dir: delta > 0 ? "up" : "down" };
}

// Siguiente nivel CEFR
function siguienteNivel(nivel) {
  return {
    principiante: { siguiente: "intermedio", meta: "A2-B1", progreso: 40 },
    intermedio: { siguiente: "avanzado", meta: "B2-C1", progreso: 70 },
    avanzado: { siguiente: "maestría", meta: "C2", progreso: 90 },
  }[nivel] || { siguiente: "intermedio", meta: "A2-B1", progreso: 40 };
}

// ------------------------------------------------------------------
// Subcomponentes
// ------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-slate-700/40 rounded-xl ${className}`} />;
}

function StatCard({ label, value, icon, color = "text-white", sublabel, delta }) {
  const animated = useAnimatedNumber(value);
  const dir = delta?.dir;
  return (
    <div className="relative overflow-hidden bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_40px_rgba(0,0,0,0.16)] hover:border-indigo-400/25 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
        <span className="text-base opacity-60">{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`text-2xl sm:text-3xl lg:text-4xl font-extrabold tabular-nums tracking-tight ${color}`}>
          {animated}
        </p>
        {dir === "up" && <span className="text-emerald-400 text-xs font-bold">↑</span>}
        {dir === "down" && <span className="text-red-400 text-xs font-bold">↓</span>}
      </div>
      {sublabel && (
        <p className="text-[10px] text-slate-500 mt-0.5">{sublabel}</p>
      )}
    </div>
  );
}

// Heatmap estilo GitHub
function Heatmap({ eventosPorDia = {} }) {
  const hoy = new Date();
  const dias = [];
  for (let i = 55; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dias.push({ fecha: key, count: eventosPorDia[key] || 0 });
  }
  const max = Math.max(...dias.map((d) => d.count), 1);
  const intensidad = (n) => {
    if (n === 0) return "bg-slate-800/60";
    const r = n / max;
    if (r < 0.25) return "bg-emerald-900/60";
    if (r < 0.5) return "bg-emerald-700/70";
    if (r < 0.75) return "bg-emerald-500/80";
    return "bg-emerald-400";
  };
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex gap-1 min-w-max sm:min-w-0">
        {semanas.map((sem, si) => (
          <div key={si} className="flex flex-col gap-1">
            {sem.map((d) => (
              <div
                key={d.fecha}
                title={`${d.fecha}: ${d.count} eventos`}
                aria-label={`${d.fecha}: ${d.count} eventos`}
                className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-[3px] ${intensidad(d.count)} transition-transform hover:scale-125`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500">
        <span>Menos</span>
        <div className="w-2.5 h-2.5 rounded-sm bg-slate-800/60" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-900/60" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-700/70" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />
        <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
        <span>Más</span>
      </div>
    </div>
  );
}

// Anillo radial
function ProgresoAnillo({ valor, meta, label }) {
  const pct = Math.min(Math.round((valor / Math.max(meta, 1)) * 100), 100);
  const data = [{ name: label, value: pct, fill: pct >= 80 ? COLOR_OK : COLOR_PROG }];
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={130}>
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <RadialBar background={{ fill: "#1e293b" }} dataKey="value" cornerRadius={20} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">{pct}%</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

// Barra de nivel CEFR
function NivelProgreso({ nivel }) {
  const info = siguienteNivel(nivel);
  const niveles = [
    { code: "A1", x: 0 },
    { code: "A2", x: 25 },
    { code: "B1", x: 50 },
    { code: "B2", x: 75 },
    { code: "C1", x: 100 },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
        <span>Camino al {info.siguiente}</span>
        <span className="text-indigo-300">{info.meta}</span>
      </div>
      <div className="relative h-2 bg-slate-800/80 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-1000"
          style={{ width: `${info.progreso}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-600">
        {niveles.map((n) => (
          <span key={n.code} className={n.x <= info.progreso ? "text-indigo-400 font-semibold" : ""}>
            {n.code}
          </span>
        ))}
      </div>
    </div>
  );
}

// Radar de destrezas
function RadarDestrezas({ progreso, vocabStats }) {
  const data = useMemo(() => {
    const porTema = progreso?.por_tema || {};
    const total = Object.keys(porTema).length;
    const dominados = progreso?.dominados?.length || 0;
    const reforzar = progreso?.a_reforzar?.length || 0;
    const actividad = progreso?.dias_activos_7d || 0;

    const gramatica = total > 0 ? Math.round(((dominados + reforzar * 0.5) / Math.max(total, 1)) * 100) : 0;
    const vocabulario = Math.min((vocabStats?.total || 0) * 5, 100);
    const listening = Math.min(actividad * 14, 100);
    const consistencia = Math.min(((progreso?.dias_activos_7d || 0) / 7) * 100, 100);
    const escritura = Math.min(gramatica * 0.8, 100);

    return [
      { destreza: "Gramática", valor: Math.max(gramatica, 5) },
      { destreza: "Vocabulario", valor: Math.max(vocabulario, 5) },
      { destreza: "Listening", valor: Math.max(listening, 5) },
      { destreza: "Consistencia", valor: Math.max(consistencia, 5) },
      { destreza: "Escritura", valor: Math.max(escritura, 5) },
    ];
  }, [progreso, vocabStats]);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis dataKey="destreza" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          name="Nivel"
          dataKey="valor"
          stroke={COLOR_PURPLE}
          fill={COLOR_PURPLE}
          fillOpacity={0.4}
        />
        <Tooltip
          contentStyle={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v) => [`${v}%`, "Nivel"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// Logros
function Logros({ perfil, progreso, vocabStats }) {
  const racha = perfil?.racha_dias || 0;
  const dominados = progreso?.dominados?.length || 0;
  const eventos = progreso?.total_eventos || 0;
  const vocab = vocabStats?.total || 0;
  const diasActivos = progreso?.dias_activos_7d || 0;

  const logros = [
    { id: "first_step", icon: "🌱", titulo: "Primer paso", desc: "1 día de estudio", ok: racha >= 1 },
    { id: "week", icon: "🔥", titulo: "En racha", desc: "7 días seguidos", ok: racha >= 7 },
    { id: "month", icon: "💎", titulo: "Imparable", desc: "30 días seguidos", ok: racha >= 30 },
    { id: "consistent", icon: "📅", titulo: "Constante", desc: "5 días activos en 7", ok: diasActivos >= 5 },
    { id: "master", icon: "🧠", titulo: "Maestro", desc: "3 temas dominados", ok: dominados >= 3 },
    { id: "explorer", icon: "🚀", titulo: "Explorador", desc: "50 eventos", ok: eventos >= 50 },
    { id: "wordy", icon: "📚", titulo: "Vocabulista", desc: "20 palabras guardadas", ok: vocab >= 20 },
    { id: "centurion", icon: "🏆", titulo: "Centurión", desc: "100 eventos", ok: eventos >= 100 },
  ];

  const desbloqueados = logros.filter((l) => l.ok).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs sm:text-sm text-slate-300 font-semibold">
          🏅 Logros ({desbloqueados}/{logros.length})
        </p>
        <div className="h-1 w-24 sm:w-32 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-1000"
            style={{ width: `${(desbloqueados / logros.length) * 100}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {logros.map((l) => (
          <div
            key={l.id}
            title={`${l.titulo} — ${l.desc}`}
            className={`relative aspect-square rounded-2xl border transition-all flex flex-col items-center justify-center p-1 text-center ${
              l.ok
                ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/40 shadow-[0_0_20px_rgba(251,191,36,0.15)]"
                : "bg-white/[0.03] border-white/5 opacity-40 grayscale"
            }`}
          >
            <span className="text-xl sm:text-2xl mb-0.5">{l.icon}</span>
            <p className={`text-[8px] sm:text-[9px] font-medium leading-tight ${l.ok ? "text-amber-200" : "text-slate-500"}`}>
              {l.titulo}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Timeline de actividad reciente
function Timeline({ actividad }) {
  const items = useMemo(() => {
    const arr = Object.entries(actividad || {})
      .map(([fecha, count]) => ({ fecha, count }))
      .filter((i) => i.count > 0)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      .slice(0, 7);
    return arr;
  }, [actividad]);

  const formatearFecha = (iso) => {
    const d = new Date(iso);
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    const isoHoy = hoy.toISOString().slice(0, 10);
    const isoAyer = ayer.toISOString().slice(0, 10);
    if (iso === isoHoy) return "Hoy";
    if (iso === isoAyer) return "Ayer";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  if (items.length === 0) {
    return (
      <p className="text-xs text-slate-500 italic text-center py-4">
        Sin actividad reciente. ¡Empieza a practicar!
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.fecha} className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
            {i < items.length - 1 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[1px] h-6 bg-slate-700/50" />
            )}
          </div>
          <p className="text-xs text-slate-400 w-14 shrink-0">{formatearFecha(it.fecha)}</p>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                style={{ width: `${Math.min((it.count / 20) * 100, 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 tabular-nums shrink-0">
              {it.count} ev
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------------
export default function Dashboard() {
  const userId = useMemo(() => getUserId(), []);
  const [perfil, setPerfil] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [vocabStats, setVocabStats] = useState(null);
  const [objetivo, setObjetivo] = useState("");
  const [actividad, setActividad] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [previos, setPrevios] = useState({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const [rPerfil, rProgreso, rVocab, rAct] = await Promise.all([
        fetch(`${API_URL}/api/perfil?user_id=${userId}`),
        fetch(`${API_URL}/api/progreso?user_id=${userId}`),
        fetch(`${API_URL}/api/vocabulario?user_id=${userId}`).catch(() => null),
        fetch(`${API_URL}/api/actividad?user_id=${userId}&dias=56`).catch(() => null),
      ]);

      if (!rPerfil.ok) throw new Error(`HTTP ${rPerfil.status} en /api/perfil`);

      const dPerfil = await rPerfil.json();
      const perfilData = dPerfil.perfil ?? dPerfil;

      // Guardar valores previos para deltas
      setPrevios({
        racha: perfil?.racha_dias,
        eventos: progreso?.total_eventos,
        dominados: progreso?.dominados?.length,
        vocab: vocabStats?.total,
      });

      setPerfil(perfilData);

      if (rProgreso.ok) {
        const dProgreso = await rProgreso.json();
        setProgreso(dProgreso.progreso ?? dProgreso);
        setObjetivo(dProgreso.objetivo_adaptativo || "");
      }

      if (rVocab?.ok) {
        const dVocab = await rVocab.json();
        setVocabStats(dVocab.stats || null);
      }

      if (rAct?.ok) {
        const dAct = await rAct.json();
        setActividad(dAct.eventos_por_dia || {});
      }
    } catch (e) {
      setError(e.message || "Error de conexión");
    } finally {
      setCargando(false);
    }
  }, [userId, perfil, progreso, vocabStats]);

  useEffect(() => {
    cargar();
    const id = setInterval(() => cargar(), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Datos derivados
  const dataPie = useMemo(() => {
    if (!progreso) return [];
    const dominados = progreso.dominados?.length || 0;
    const reforzar = progreso.a_reforzar?.length || 0;
    const total = Object.keys(progreso.por_tema || {}).length;
    const enProgreso = Math.max(total - dominados - reforzar, 0);
    return [
      { name: "Dominados", value: dominados || 0.001, color: COLOR_OK },
      { name: "En progreso", value: enProgreso || 0.001, color: COLOR_PROG },
      { name: "A reforzar", value: reforzar || 0.001, color: COLOR_BAJO },
    ];
  }, [progreso]);

  const dataBarra = useMemo(() => {
    if (!progreso?.por_tema) return [];
    return Object.entries(progreso.por_tema)
      .map(([tema, d]) => ({
        tema: tema.length > 14 ? tema.slice(0, 12) + "…" : tema,
        aciertos: d.aciertos,
        total: d.total,
        ratio: Math.round(d.ratio * 100),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [progreso]);

  // Serie temporal de actividad por día (últimos 14 días)
  const dataTimeline = useMemo(() => {
    const arr = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      arr.push({
        dia: `${d.getDate()}/${d.getMonth() + 1}`,
        eventos: actividad[key] || 0,
      });
    }
    return arr;
  }, [actividad]);

  const totalEventos = progreso?.total_eventos || 0;
  const hayDatos = totalEventos >= 5;

  const deltaRacha = useDelta(perfil?.racha_dias || 0, previos.racha);
  const deltaEventos = useDelta(totalEventos, previos.eventos);
  const deltaDominados = useDelta(progreso?.dominados?.length || 0, previos.dominados);

  // Exportaciones
  function exportarPDF() {
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString("es-ES");
    doc.setFontSize(18);
    doc.text("Reporte de Progreso — Tutor IA", 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generado: ${fecha}`, 14, 24);
    doc.setTextColor(0);

    doc.setFontSize(11);
    let y = 34;
    doc.text(`Nivel: ${perfil?.nivel || "-"}`, 14, y); y += 7;
    doc.text(`Objetivo: ${perfil?.objetivo || "No definido"}`, 14, y); y += 7;
    doc.text(`Racha: ${perfil?.racha_dias || 0} días`, 14, y); y += 7;
    doc.text(`Días activos (7d): ${progreso?.dias_activos_7d || 0}`, 14, y); y += 7;
    doc.text(`Palabras guardadas: ${vocabStats?.total || 0}`, 14, y); y += 10;

    doc.setFontSize(12);
    doc.text("Objetivo adaptativo:", 14, y); y += 7;
    doc.setFontSize(10);
    const objLines = doc.splitTextToSize(objetivo || "-", 180);
    doc.text(objLines, 14, y); y += objLines.length * 5 + 6;

    doc.setFontSize(12);
    doc.text("Detalle por tema:", 14, y); y += 6;
    doc.setFontSize(10);
    dataBarra.forEach((d) => {
      doc.text(`- ${d.tema}: ${d.aciertos}/${d.total} (${d.ratio}%)`, 18, y); y += 5;
      if (y > 280) { doc.addPage(); y = 20; }
    });

    doc.save(`progreso-${fecha.replace(/\//g, "-")}.pdf`);
  }

  function exportarCSV() {
    const filas = [["tipo", "contenido", "valor"]];
    filas.push(["nivel", perfil?.nivel || "", ""]);
    filas.push(["objetivo", perfil?.objetivo || "", ""]);
    filas.push(["racha", "", perfil?.racha_dias || 0]);
    filas.push(["objetivo_adaptativo", objetivo, ""]);
    filas.push(["vocabulario_total", "", vocabStats?.total || 0]);
    dataBarra.forEach((d) =>
      filas.push(["tema", d.tema, `${d.aciertos}/${d.total} (${d.ratio}%)`])
    );
    const csv = filas
      .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "progreso.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Render
  if (cargando && !perfil) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto">
        <div className="bg-slate-800/60 border border-red-500/40 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <p className="text-slate-500 text-xs mb-5">
            Backend: <code className="bg-slate-900 px-1.5 py-0.5 rounded">{API_URL}</code>
          </p>
          <button
            onClick={cargar}
            className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg shadow-indigo-950/40"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[#070b16] text-slate-100 relative">
      {/* Fondo decorativo */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-fuchsia-600/[0.07] blur-3xl" />
        <div className="absolute bottom-0 -left-32 h-80 w-80 rounded-full bg-cyan-500/[0.06] blur-3xl" />
      </div>

      <div className="relative z-10 px-3 py-4 sm:px-6 sm:py-7 lg:px-8 max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-7 pb-10">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-xl shadow-lg shadow-indigo-950/50 ring-1 ring-white/20">✦</div>
            <div>
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-indigo-300 font-bold">LEARNING INTELLIGENCE</p>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Tu centro de progreso</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-xs text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
            </span>
            Panel actualizado automáticamente
          </div>
        </header>

        {/* HERO objetivo */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 sm:p-8 lg:p-10 shadow-2xl shadow-indigo-950/50 ring-1 ring-white/15">
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-pink-400/20 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-widest text-white/80 font-medium">
                🎯 Objetivo adaptativo
              </span>
              <span className="ml-auto text-[10px] bg-white/20 backdrop-blur px-2 py-0.5 rounded-full text-white/90">
                {totalEventos} eventos
              </span>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-white leading-snug tracking-tight drop-shadow-sm max-w-4xl">
              {hayDatos ? objetivo : "Realiza unos ejercicios para medir tu evolución."}
            </p>
            {hayDatos && (
              <div className="mt-5">
                <div className="flex justify-between text-[10px] text-white/70 mb-1.5">
                  <span>Progreso general</span>
                  <span>
                    {progreso?.dominados?.length || 0} dominados ·{" "}
                    {progreso?.a_reforzar?.length || 0} a reforzar
                  </span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/90 transition-all duration-700"
                    style={{
                      width: `${Math.min(
                        ((progreso?.dominados?.length || 0) /
                          Math.max(
                            (progreso?.dominados?.length || 0) +
                              (progreso?.a_reforzar?.length || 0),
                            1
                          )) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Racha"
            value={perfil?.racha_dias || 0}
            icon="🔥"
            color="text-orange-400"
            sublabel={perfil?.racha_dias === 1 ? "día" : "días"}
            delta={deltaRacha}
          />
          <StatCard
            label="Días activos"
            value={progreso?.dias_activos_7d || 0}
            icon="📅"
            color="text-indigo-400"
            sublabel="últimos 7"
          />
          <StatCard
            label="Dominados"
            value={progreso?.dominados?.length || 0}
            icon="✅"
            color="text-emerald-400"
            sublabel="temas"
            delta={deltaDominados}
          />
          <StatCard
            label="Palabras"
            value={vocabStats?.total || 0}
            icon="📚"
            color="text-fuchsia-400"
            sublabel="guardadas"
          />
        </div>

        {/* NIVEL + OBJETIVO */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Nivel actual</p>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${claseBadgeNivel(perfil?.nivel)}`}>
              {perfil?.nivel || "sin definir"}
            </span>
          </div>
          <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 md:col-span-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Objetivo declarado</p>
            <p className="text-sm text-white">{perfil?.objetivo || "Aún no definido"}</p>
          </div>
        </div>

        {/* Camino al siguiente nivel */}
        <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 sm:p-5">
          <NivelProgreso nivel={perfil?.nivel} />
        </div>

        {/* Evolución temporal */}
        {hayDatos && dataTimeline.length > 0 && (
          <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs sm:text-sm text-slate-300 font-semibold">📈 Evolución (últimos 14 días)</p>
              <span className="text-[10px] text-slate-500">
                {dataTimeline.reduce((a, b) => a + b.eventos, 0)} eventos
              </span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={dataTimeline} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradEventos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_CYAN} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={COLOR_CYAN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Area
                  type="monotone"
                  dataKey="eventos"
                  stroke={COLOR_CYAN}
                  strokeWidth={2}
                  fill="url(#gradEventos)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Logros */}
        <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 sm:p-5">
          <Logros perfil={perfil} progreso={progreso} vocabStats={vocabStats} />
        </div>

        {/* Exportar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={exportarPDF}
            className="flex-1 sm:flex-none bg-white/[0.06] hover:bg-white/[0.11] active:scale-[0.98] border border-white/10 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-all"
          >
            📄 Exportar PDF
          </button>
          <button
            onClick={exportarCSV}
            className="flex-1 sm:flex-none bg-white/[0.06] hover:bg-white/[0.11] active:scale-[0.98] border border-white/10 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-all"
          >
            📑 Exportar CSV
          </button>
        </div>

        {!hayDatos ? (
          <div className="bg-white/[0.035] border border-dashed border-white/15 rounded-3xl py-12 px-6 text-center">
            <p className="text-5xl mb-3">🌱</p>
            <p className="text-slate-300 text-sm font-medium mb-1">Aún no hay suficientes datos</p>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">
              Completa al menos 5 ejercicios en el chat, ejercicios o micrófono y este panel cobrará vida.
            </p>
          </div>
        ) : (
          <>
            {/* HEATMAP */}
            <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs sm:text-sm text-slate-300 font-semibold">
                  📊 Actividad (últimas 8 semanas)
                </p>
                <span className="text-[10px] text-slate-500">
                  {Object.values(actividad).reduce((a, b) => a + b, 0) || 0} eventos
                </span>
              </div>
              <Heatmap eventosPorDia={actividad} />
            </div>

            {/* RADAR + ANILLO */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4">
                <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-2">
                  🎯 Destrezas
                </p>
                <RadarDestrezas progreso={progreso} vocabStats={vocabStats} />
              </div>

              <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4">
                <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-1">
                  Tasa de dominio
                </p>
                <ProgresoAnillo
                  valor={progreso?.dominados?.length || 0}
                  meta={
                    (progreso?.dominados?.length || 0) +
                    (progreso?.a_reforzar?.length || 0) || 1
                  }
                  label="dominados"
                />
                <div className="mt-2 pt-3 border-t border-white/5">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                    Distribución
                  </p>
                  <ResponsiveContainer width="100%" height={110}>
                    <PieChart>
                      <Pie
                        data={dataPie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={3}
                      >
                        {dataPie.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-2 text-[9px] mt-1">
                    <span className="text-emerald-400">● Dom. ({progreso?.dominados?.length || 0})</span>
                    <span className="text-indigo-400">● Prog.</span>
                    <span className="text-red-400">● Refor. ({progreso?.a_reforzar?.length || 0})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TIMELINE + ACIERTOS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-3">
                  🕐 Actividad reciente
                </p>
                <Timeline actividad={actividad} />
              </div>

              <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-3">
                  🎯 Aciertos por tema (%)
                </p>
                {dataBarra.length === 0 ? (
                  <p className="text-sm text-slate-500 italic text-center py-6">
                    Sin datos todavía.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dataBarra} layout="vertical" margin={{ left: 4, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis
                        dataKey="tema"
                        type="category"
                        width={90}
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v, n, p) => [
                          `${v}% (${p.payload.aciertos}/${p.payload.total})`,
                          "Aciertos",
                        ]}
                      />
                      <Bar dataKey="ratio" radius={[0, 6, 6, 0]}>
                        {dataBarra.map((d, i) => (
                          <Cell key={i} fill={colorPorRatio(d.ratio / 100)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* LISTAS: dominados + reforzar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4">
                <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-3">
                  ✅ Temas dominados ({progreso?.dominados?.length || 0})
                </p>
                {progreso?.dominados?.length ? (
                  <ul className="space-y-1.5">
                    {progreso.dominados.map((t, i) => (
                      <li key={i} className="text-sm text-emerald-300 flex gap-2">
                        <span>✓</span> {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Sigue practicando para dominar temas.
                  </p>
                )}
              </div>

              <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4">
                <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-3">
                  🎯 Temas a reforzar ({progreso?.a_reforzar?.length || 0})
                </p>
                {progreso?.a_reforzar?.length ? (
                  <ul className="space-y-1.5">
                    {progreso.a_reforzar.map((t, i) => (
                      <li key={i} className="text-sm text-amber-300 flex gap-2">
                        <span>⚠️</span> {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Ningún tema flojo. ¡Bien! 🎉
                  </p>
                )}
              </div>
            </div>

            {/* ERRORES */}
            <div className="bg-white/[0.045] backdrop-blur-xl border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.16)] p-4 sm:p-5">
              <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-3">
                🔁 Errores frecuentes ({progreso?.errores_top?.length || 0})
              </p>
              {progreso?.errores_top?.length ? (
                <ul className="space-y-2">
                  {progreso.errores_top.map((e, i) => (
                    <li key={i} className="text-sm text-red-300 flex gap-2 items-start">
                      <span className="shrink-0">⚠️</span>
                      <span>
                        {e.error}{" "}
                        <span className="text-slate-500 text-xs">(x{e.veces})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Ningún error registrado todavía. 🎉
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}