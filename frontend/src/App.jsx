import { useState } from "react";
import Chat from "./components/Chat";
import Dashboard from "./components/Dashboard";
import Ejercicios from "./components/Ejercicios";
import Videos from "./components/Videos";
import Microfono from "./components/Microfono";

const TABS = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "ejercicios", label: "Ejercicios", icon: "✏️" },
  { id: "videos", label: "Videos", icon: "🎥" },
  { id: "microfono", label: "Voz", icon: "🎤" },
];

export default function App() {
  const [tabActiva, setTabActiva] = useState("chat");
  const tabInfo = TABS.find((t) => t.id === tabActiva);

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar - solo visible en md+ */}
      <aside className="hidden md:flex md:w-60 bg-slate-900 border-r border-slate-800 flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-800">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            🎓 Tutor IA
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Inglés personalizado</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTabActiva(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tabActiva === tab.id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-600">
          Hecho por ti 🚀
        </div>
      </aside>

      {/* Header móvil - solo visible en móvil */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
        <h1 className="text-base font-semibold text-white flex items-center gap-2">
          🎓 Tutor IA
        </h1>
        <span className="text-sm text-slate-400">{tabInfo.icon} {tabInfo.label}</span>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header desktop */}
        <header className="hidden md:block px-8 py-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <h2 className="text-lg font-semibold text-white">{tabInfo.icon} {tabInfo.label}</h2>
        </header>

        <div className="flex-1 overflow-hidden min-h-0">
          {tabActiva === "chat" && <Chat />}
          {tabActiva === "dashboard" && <Dashboard />}
          {tabActiva === "ejercicios" && <Ejercicios />}
          {tabActiva === "videos" && <Videos />}
          {tabActiva === "microfono" && <Microfono />}
        </div>
      </main>

      {/* Barra de navegación inferior - solo visible en móvil */}
      <nav className="md:hidden flex border-t border-slate-800 bg-slate-900 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTabActiva(tab.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              tabActiva === tab.id ? "text-indigo-400" : "text-slate-500"
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}