"""
Búsqueda web con Tavily: para que el agente no invente datos actuales.
"""
import os
from functools import lru_cache
from tavily import TavilyClient


@lru_cache(maxsize=1)
def _client() -> TavilyClient:
    """Cliente perezoso: se crea la primera vez que se usa, no al importar.
    Así load_dotenv() ya se habrá ejecutado."""
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY no está configurada en el entorno.")
    return TavilyClient(api_key=api_key)


def buscar_en_internet(consulta: str) -> str:
    """Busca información actualizada en internet. Úsala cuando el estudiante pregunte
    por métodos de aprendizaje, estudios recientes, recursos, o cualquier info que
    requiera datos actuales de la web (no la uses para practicar gramática o vocabulario).

    Args:
        consulta: Qué buscar, ej. "mejor método para aprender inglés según estudios 2026"
    """
    try:
        resultado = _client().search(
            query=consulta,
            max_results=4,
            search_depth="basic",          # "advanced" = más lento pero mejor
            include_answer=False,
        )
    except Exception as e:
        return f"No se pudo buscar en internet ahora mismo ({type(e).__name__}). Responde con tu conocimiento."

    resultados = resultado.get("results") or []
    if not resultados:
        return "No se encontraron resultados relevantes."

    lineas = []
    for r in resultados:
        titulo = (r.get("title") or "Sin título").strip()
        contenido = (r.get("content") or "").strip()
        url = r.get("url") or ""
        # Limpia saltos de línea y limita longitud
        contenido = " ".join(contenido.split())[:200]
        lineas.append(f"- {titulo}: {contenido}... (fuente: {url})")

    return "\n".join(lineas)


def buscar_videos_youtube(tema: str, cantidad: int = 4) -> list:
    """Busca videos de YouTube relevantes para un tema de inglés.

    Args:
        tema: Tema sobre el que buscar, ej. "present perfect"
        cantidad: Número máximo de videos a devolver.
    """
    try:
        resultado = _client().search(
            query=f"{tema} english lesson",
            include_domains=["youtube.com", "youtu.be", "m.youtube.com"],
            max_results=max(cantidad * 2, 6),  # pide de más porque filtraremos
            search_depth="basic",
        )
    except Exception as e:
        # Para el endpoint /api/videos, mejor no romper la app
        print(f"[buscar_videos_youtube] error: {e}")
        return []

    videos = []
    vistos = set()

    for r in resultado.get("results") or []:
        url = r.get("url", "") or ""
        video_id = _extraer_video_id(url)
        if not video_id or video_id in vistos:
            continue
        vistos.add(video_id)
        videos.append({
            "titulo": (r.get("title") or "Video de inglés").strip(),
            "video_id": video_id,
            "url": url,
        })
        if len(videos) >= cantidad:
            break

    return videos


def _extraer_video_id(url: str) -> str | None:
    """Saca el ID de un video de YouTube desde distintos formatos de URL."""
    import re
    # formatos: watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID
    patrones = [
        r"[?&]v=([A-Za-z0-9_-]{11})",
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"/embed/([A-Za-z0-9_-]{11})",
        r"/shorts/([A-Za-z0-9_-]{11})",
    ]
    for p in patrones:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None