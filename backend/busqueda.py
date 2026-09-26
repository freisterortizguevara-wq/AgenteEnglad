import os
from tavily import TavilyClient


_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))


def buscar_en_internet(consulta: str) -> str:
    """Busca información actualizada en internet. Úsala cuando el estudiante pregunte
    por métodos de aprendizaje, estudios recientes, recursos, o cualquier info que
    requiera datos actuales de la web (no la uses para practicar gramática o vocabulario).

    Args:
        consulta: Qué buscar, ej. "mejor método para aprender inglés según estudios 2026"
    """
    resultado = _client.search(query=consulta, max_results=4)

    resumen = []
    for r in resultado.get("results", []):
        resumen.append(f"- {r['title']}: {r['content'][:200]}... (fuente: {r['url']})")

    return "\n".join(resumen) if resumen else "No se encontraron resultados."

def buscar_videos_youtube(tema: str, cantidad: int = 4) -> list:
    """Busca videos de YouTube relevantes para un tema de inglés."""
    resultado = _client.search(
        query=f"{tema} english lesson",
        include_domains=["youtube.com"],
        max_results=cantidad,
    )

    videos = []
    for r in resultado.get("results", []):
        url = r.get("url", "")
        if "watch?v=" in url:
            video_id = url.split("watch?v=")[1].split("&")[0]
        elif "youtu.be/" in url:
            video_id = url.split("youtu.be/")[1].split("?")[0]
        else:
            continue

        videos.append({
            "titulo": r.get("title", "Video de inglés"),
            "video_id": video_id,
            "url": url,
        })

    return videos