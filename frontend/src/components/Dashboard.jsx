import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { jsPDF } from "jspdf";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const COLORES = ["#6366f1", "#f59e0b"];

export default function Dashboard() {
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/perfil`)
      .then((r) => r.json())
      .then((data) => {
        setPerfil(data);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, []);

  if (cargando) return <div className="p-6 text-slate-400 text-sm">Cargando tu progreso...</div>;
  if (!perfil) return <div className="p-6 text-red-400 text-sm">No se pudo cargar el perfil.</div>;

  const nivelColor = {
    principiante: "bg-amber-500",
    intermedio: "bg-indigo-500",
    avanzado: "bg-emerald-500",
  }[perfil.nivel] || "bg-slate-500";

  const dataPie = [
    { name: "Temas vistos", value: perfil.temas_vistos.length || 0.001 },
    { name: "Errores a reforzar", value: perfil.errores_frecuentes.length || 0.001 },
  ];

  const dataBarra = perfil.temas_vistos.map((t) => ({ nombre: t, valor: 1 }));

  function exportarPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Reporte de Progreso - Tutor de Inglés IA", 14, 18);

    doc.setFontSize(11);
    doc.text(`Nivel: ${perfil.nivel}`, 14, 32);
    doc.text(`Objetivo: ${perfil.objetivo || "No definido"}`, 14, 40);
    doc.text(`Racha de estudio: ${perfil.racha_dias} días`, 14, 48);

    doc.text("Temas trabajados:", 14, 60);
    perfil.temas_vistos.forEach((t, i) => doc.text(`- ${t}`, 18, 68 + i * 6));

    const offsetErrores = 68 + perfil.temas_vistos.length * 6 + 10;
    doc.text("Errores frecuentes a reforzar:", 14, offsetErrores);
    perfil.errores_frecuentes.forEach((e, i) => doc.text(`- ${e}`, 18, offsetErrores + 8 + i * 6));

    doc.save("progreso-ingles.pdf");
  }

  function exportarCSV() {
    let csv = "tipo,contenido\n";
    perfil.temas_vistos.forEach((t) => (csv += `tema,"${t}"\n`));
    perfil.errores_frecuentes.forEach((e) => (csv += `error,"${e}"\n`));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "progreso-ingles.csv";
    a.click();
  }

  return (
    <div className="p-4 md:p-8 space-y-6 overflow-y-auto h-full">
      {/* Fila superior: racha + acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl px-6 py-4 text-white flex-1">
          <p className="text-sm opacity-80">Racha de estudio</p>
          <p className="text-3xl font-bold mt-0.5">🔥 {perfil.racha_dias} {perfil.racha_dias === 1 ? "día" : "días"}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarPDF}
            className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            📄 PDF
          </button>
          <button
            onClick={exportarCSV}
            className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            📑 CSV
          </button>
        </div>
      </div>

      {/* Grid: info + gráficas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Nivel actual</p>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium text-white ${nivelColor}`}>
            {perfil.nivel}
          </span>
        </div>
        <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4 sm:col-span-2">
          <p className="text-xs text-slate-400 mb-1">Objetivo</p>
          <p className="text-sm text-white">{perfil.objetivo || "Aún no definido"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Gráfica de dona: temas vs errores */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-2">Temas vs. errores</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={dataPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={4}>
                {dataPie.map((_, i) => (
                  <Cell key={i} fill={COLORES[i % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs mt-1">
            <span className="text-indigo-400">● Temas ({perfil.temas_vistos.length})</span>
            <span className="text-amber-400">● Errores ({perfil.errores_frecuentes.length})</span>
          </div>
        </div>

        {/* Gráfica de barras: temas trabajados */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-2">Temas trabajados</p>
          {dataBarra.length === 0 ? (
            <p className="text-sm text-slate-500 italic mt-8 text-center">Aún no hay temas registrados.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dataBarra} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="nombre" type="category" width={100} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="valor" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Errores frecuentes */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4">
        <p className="text-xs text-slate-400 mb-3">Errores a reforzar ({perfil.errores_frecuentes.length})</p>
        {perfil.errores_frecuentes.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Ningún error registrado todavía. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {perfil.errores_frecuentes.map((err, i) => (
              <li key={i} className="text-sm text-amber-300 flex gap-2">
                <span>⚠️</span> {err}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}