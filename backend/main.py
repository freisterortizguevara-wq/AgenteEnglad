import os
import json
import time
from contextlib import asynccontextmanager
from functools import partial
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types

from memoria import (
    # init / perfil
    inicializar_db,
    cargar_perfil,
    actualizar_sesion,
    # tools
    guardar_objetivo,
    actualizar_nivel,
    registrar_tema_visto,
    registrar_error_frecuente,
    registrar_respuesta,
    agregar_palabra,
    # progreso
    calcular_progreso,
    generar_objetivo_adaptativo,
    # vocabulario
    obtener_palabras_pendientes,
    listar_vocabulario,
    revisar_palabra,
    estadisticas_vocabulario,
    # ejercicios
    guardar_ejercicio,
    ejercicios_recientes,
    estadisticas_dificultad,
    marcar_ejercicio_contestado,
    # listening
    guardar_listening,
    listenings_recientes,
    marcar_listening_completado,
)
from busqueda import buscar_en_internet, buscar_videos_youtube

load_dotenv()
inicializar_db()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", "").strip())
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
_chat_sessions: dict[str, object] = {}


# ------------------------------------------------------------------
# System instruction
# ------------------------------------------------------------------
def construir_system_instruction(user_id: str):
    perfil = actualizar_sesion(user_id)
    progreso = calcular_progreso(user_id)
    objetivo_adaptativo = generar_objetivo_adaptativo(user_id)

    dominados = ", ".join(progreso["dominados"]) or "ninguno aún"
    a_reforzar = ", ".join(progreso["a_reforzar"]) or "ninguno"
    errores_top = ", ".join(
        f"{e['error']} (x{e['veces']})" for e in progreso["errores_top"]
    ) or "ninguno"

    system_instruction = f"""
Eres un tutor de inglés experto y también un investigador metodológico.

PERFIL DEL ESTUDIANTE (user_id={user_id}):
- Nivel declarado: {perfil['nivel']}
- Objetivo declarado: {perfil['objetivo'] or 'aún no definido, pregúntale'}
- Racha de días: {perfil['racha_dias']}
- Días activos (últimos 7): {progreso['dias_activos_7d']}

EVOLUCIÓN REAL (últimos 14 días):
- Temas dominados (≥80% aciertos): {dominados}
- Temas a reforzar (<60% aciertos): {a_reforzar}
- Errores más frecuentes: {errores_top}

🎯 OBJETIVO ADAPTATIVO ACTUAL:
{objetivo_adaptativo}

Guía este objetivo de forma natural en la conversación: propón ejercicios alineados,
felicita cuando avance y sugiere refuerzo cuando retroceda. No lo menciones como
"objetivo adaptativo", intégralo en tu forma de enseñar.

Tu forma de trabajar:
1. Usa el perfil para NO repetir preguntas ya respondidas.
2. Llama a guardar_objetivo / actualizar_nivel SOLO cuando el estudiante lo diga claramente.
3. Llama a registrar_tema_visto al explicar o practicar un tema nuevo.
4. Llama a registrar_error_frecuente cuando detectes un error notable.
5. Llama a registrar_respuesta SIEMPRE que corrijas una respuesta del estudiante.
6. Cuando enseñes vocabulario nuevo útil, guárdalo con agregar_palabra.
7. Sé conciso, práctico y motivador.
8. Responde en español al explicar teoría, pero usa inglés real en ejemplos y ejercicios.
9. Cuando te pregunten por métodos, técnicas o estudios, usa buscar_en_internet.
"""
    return system_instruction, perfil, objetivo_adaptativo


def crear_chat(user_id: str):
    system_instruction, _, _ = construir_system_instruction(user_id)
    tools = [
        partial(guardar_objetivo, user_id),
        partial(actualizar_nivel, user_id),
        partial(registrar_tema_visto, user_id),
        partial(registrar_error_frecuente, user_id),
        partial(registrar_respuesta, user_id),
        partial(agregar_palabra, user_id),
        buscar_en_internet,
    ]
    return client.chats.create(
        model="gemini-flash-latest",
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=tools,
        ),
    )


# ------------------------------------------------------------------
# Lifespan
# ------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _chat_sessions.clear()


app = FastAPI(title="Agente de Inglés API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------
# Modelos
# ------------------------------------------------------------------
class MensajeEntrada(BaseModel):
    mensaje: str
    user_id: str = "default"

class RespuestaEntrada(BaseModel):
    user_id: str = "default"
    tema: str
    correcto: bool
    detalle: str | None = None
    pregunta: str | None = None

class PalabraEntrada(BaseModel):
    user_id: str = "default"
    palabra: str
    traduccion: str = ""
    ejemplo: str = ""
    contexto: str = ""

class RevisionEntrada(BaseModel):
    user_id: str = "default"
    palabra_id: int
    calidad: int

class ListeningResultado(BaseModel):
    user_id: str = "default"
    titulo: str
    puntaje: int


# ------------------------------------------------------------------
# PERFIL Y PROGRESO
# ------------------------------------------------------------------
@app.get("/api/perfil")
def obtener_perfil(user_id: str = "default"):
    try:
        return {"perfil": cargar_perfil(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/progreso")
def obtener_progreso(user_id: str = "default"):
    try:
        return {
            "progreso": calcular_progreso(user_id),
            "objetivo_adaptativo": generar_objetivo_adaptativo(user_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------------
# CHAT
# ------------------------------------------------------------------
@app.post("/api/chat")
def chat_endpoint(entrada: MensajeEntrada):
    user_id = entrada.user_id or "default"
    try:
        chat = _chat_sessions.get(user_id)
        if chat is None:
            chat = crear_chat(user_id)
            _chat_sessions[user_id] = chat

        response = chat.send_message(entrada.mensaje)
        _, perfil_actual, objetivo_actual = construir_system_instruction(user_id)

        return {
            "respuesta": response.text,
            "perfil": perfil_actual,
            "objetivo_adaptativo": objetivo_actual,
        }
    except Exception as e:
        _chat_sessions.pop(user_id, None)
        return {"error": str(e), "respuesta": "⚠️ Hubo un error, intenta de nuevo."}


@app.post("/api/reset")
def reset_chat(user_id: str = "default"):
    _chat_sessions.pop(user_id, None)
    return {"ok": True, "user_id": user_id}


# ------------------------------------------------------------------
# RESPUESTAS
# ------------------------------------------------------------------
@app.post("/api/respuesta")
def registrar_respuesta_endpoint(entrada: RespuestaEntrada):
    try:
        msg = registrar_respuesta(
            entrada.user_id, entrada.tema,
            entrada.correcto, entrada.detalle,
        )
        if entrada.pregunta:
            marcar_ejercicio_contestado(
                entrada.user_id, entrada.pregunta, entrada.correcto
            )
        return {"ok": True, "mensaje": msg}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ------------------------------------------------------------------
# VIDEOS
# ------------------------------------------------------------------
@app.get("/api/videos")
def obtener_videos(user_id: str = "default", tema: str | None = None):
    if tema:
        tema_final = tema
    else:
        perfil = cargar_perfil(user_id)
        tema_final = (
            perfil["objetivo"]
            or generar_objetivo_adaptativo(user_id)
            or "english grammar basics"
        )
    try:
        videos = buscar_videos_youtube(tema_final)
        return {"videos": videos, "tema_usado": tema_final}
    except Exception as e:
        return {"videos": [], "error": str(e)}


# ------------------------------------------------------------------
# EJERCICIO
# ------------------------------------------------------------------
@app.get("/api/ejercicio")
def generar_ejercicio(user_id: str = "default"):
    perfil = cargar_perfil(user_id)
    progreso = calcular_progreso(user_id)
    objetivo_adaptativo = generar_objetivo_adaptativo(user_id)
    recientes = ejercicios_recientes(user_id, limite=15)
    dificultad_stats = estadisticas_dificultad(user_id)

    dificultad = 2
    if dificultad_stats:
        total = sum(s["total"] for s in dificultad_stats.values())
        aciertos = sum(s["aciertos"] for s in dificultad_stats.values())
        ratio = aciertos / max(total, 1)
        if ratio >= 0.8 and total >= 5:
            dificultad = 3
        elif ratio < 0.5 and total >= 5:
            dificultad = 1

    recientes_txt = "\n".join(
        f"- [{r['tema']}] {r['pregunta'][:120]}" for r in recientes
    ) or "(ninguno aún)"

    dificultad_txt = {
        1: "FÁCIL (A1-A2)",
        2: "MEDIA (A2-B1)",
        3: "DIFÍCIL (B1-B2)",
    }[dificultad]

    prompt = f"""Eres un profesor de inglés que diseña ejercicios didácticos y variados.

CONTEXTO DEL ESTUDIANTE:
- Nivel declarado: {perfil['nivel']}
- Objetivo: {perfil['objetivo'] or 'general'}
- Objetivo adaptativo actual: {objetivo_adaptativo}
- Temas dominados: {', '.join(progreso['dominados']) or 'ninguno'}
- Temas a reforzar: {', '.join(progreso['a_reforzar']) or 'ninguno'}
- Errores frecuentes: {', '.join(e['error'] for e in progreso['errores_top']) or 'ninguno'}
- Dificultad objetivo: {dificultad_txt}

EJERCICIOS RECIENTES (NO REPITAS tema ni estructura):
{recientes_txt}

REGLAS:
1. NUNCA repitas una pregunta de la lista.
2. NUNCA uses el mismo tema de los últimos 3 ejercicios.
3. Elige tema priorizando: (a) errores frecuentes, (b) temas a reforzar, (c) objetivo adaptativo.
4. Contextualiza la pregunta en una situación real (entrevista, email, cartel, conversación).
5. Cada opción incorrecta debe ser un error típico de hispanohablantes.
6. La explicación debe ENSEÑAR la regla, no solo decir cuál es correcta.
7. Varía el formato: completar frase, elegir traducción, identificar el error.

Responde SOLO con JSON válido, sin markdown:
{{
  "tema": "nombre corto del tema",
  "dificultad": {dificultad},
  "contexto": "frase breve que sitúe la pregunta",
  "pregunta": "pregunta o frase a completar",
  "opciones": ["A", "B", "C", "D"],
  "respuesta_correcta": "texto exacto",
  "explicacion": "explicación didáctica en español",
  "regla_clave": "frase corta con la regla mnemotécnica"
}}"""

    for intento in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-flash-lite-latest",
                contents=prompt,
            )
            texto = response.text.strip().replace("```json", "").replace("```", "").strip()
            ej = json.loads(texto)
            guardar_ejercicio(user_id, ej, dificultad=dificultad)
            return ej
        except Exception as e:
            if intento >= 2:
                return {"error": f"No se pudo generar el ejercicio: {str(e)}"}
            time.sleep(2)

    return {"error": "No se pudo generar tras varios intentos."}


# ------------------------------------------------------------------
# FRASE PRÁCTICA
# ------------------------------------------------------------------
@app.get("/api/frase-practica")
def generar_frase_practica(user_id: str = "default"):
    perfil = cargar_perfil(user_id)
    progreso = calcular_progreso(user_id)
    objetivo_adaptativo = generar_objetivo_adaptativo(user_id)

    prompt = f"""Genera UNA frase corta en inglés (6-12 palabras) para practicar pronunciación.

CONTEXTO:
- Nivel: {perfil['nivel']}
- Objetivo: {perfil['objetivo'] or 'general'}
- Objetivo adaptativo: {objetivo_adaptativo}
- Temas a reforzar: {', '.join(progreso['a_reforzar']) or 'ninguno'}

Responde SOLO con JSON válido, sin markdown:
{{
  "frase": "la frase en inglés",
  "traduccion": "traducción al español",
  "tip_pronunciacion": "consejo breve en español"
}}"""

    for intento in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-flash-lite-latest",
                contents=prompt,
            )
            texto = response.text.strip().replace("```json", "").replace("```", "").strip()
            return json.loads(texto)
        except Exception as e:
            if intento >= 2:
                return {"error": f"No se pudo generar la frase: {str(e)}"}
            time.sleep(2)

    return {"error": "No se pudo generar tras varios intentos."}


# ------------------------------------------------------------------
# VOCABULARIO
# ------------------------------------------------------------------
@app.get("/api/vocabulario")
def get_vocabulario(user_id: str = "default"):
    try:
        return {
            "palabras": listar_vocabulario(user_id),
            "stats": estadisticas_vocabulario(user_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/vocabulario/pendientes")
def get_pendientes(user_id: str = "default", limite: int = 20):
    try:
        return {"pendientes": obtener_palabras_pendientes(user_id, limite)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/vocabulario")
def post_palabra(entrada: PalabraEntrada):
    try:
        msg = agregar_palabra(
            entrada.user_id, entrada.palabra,
            entrada.traduccion, entrada.ejemplo, entrada.contexto,
        )
        return {"ok": True, "mensaje": msg}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/vocabulario/revisar")
def post_revision(entrada: RevisionEntrada):
    try:
        return revisar_palabra(entrada.user_id, entrada.palabra_id, entrada.calidad)
    except Exception as e:
        return {"error": str(e)}


# ------------------------------------------------------------------
# ACTIVIDAD (heatmap)
# ------------------------------------------------------------------
@app.get("/api/actividad")
def obtener_actividad(user_id: str = "default", dias: int = 56):
    try:
        from memoria import conectar, _asegurar_usuario
        with conectar() as conn, conn.cursor() as cur:
            _asegurar_usuario(cur, user_id)
            conn.commit()
            cur.execute("""
                SELECT DATE(creado_en) AS dia, COUNT(*) AS n
                FROM eventos
                WHERE user_id = %s AND creado_en >= NOW() - (%s || ' days')::interval
                GROUP BY dia ORDER BY dia
            """, (user_id, dias))
            eventos_por_dia = {str(r["dia"]): r["n"] for r in cur.fetchall()}
        return {"eventos_por_dia": eventos_por_dia}
    except Exception as e:
        return {"eventos_por_dia": {}, "error": str(e)}


# ------------------------------------------------------------------
# LISTENING
# ------------------------------------------------------------------
@app.get("/api/listening")
def generar_listening(user_id: str = "default"):
    """Genera un mini-diálogo de listening con 3 preguntas de comprensión."""
    perfil = cargar_perfil(user_id)
    progreso = calcular_progreso(user_id)
    objetivo_adaptativo = generar_objetivo_adaptativo(user_id)
    recientes = listenings_recientes(user_id, limite=3)

    recientes_txt = "\n".join(
        f"- {r['titulo']}" for r in recientes
    ) or "(ninguno aún)"

    prompt = f"""Eres un profesor de inglés que crea material de LISTENING didáctico.

CONTEXTO DEL ESTUDIANTE:
- Nivel: {perfil['nivel']}
- Objetivo: {perfil['objetivo'] or 'general'}
- Objetivo adaptativo: {objetivo_adaptativo}
- Temas a reforzar: {', '.join(progreso['a_reforzar']) or 'ninguno'}

LISTENINGS RECIENTES (NO REPITAS tema ni situación):
{recientes_txt}

INSTRUCCIONES:
1. Crea un diálogo corto (4-6 intercambios) entre 2 personas, en inglés NATURAL.
2. Contextualízalo en una situación real.
3. Vocabulario y velocidad acordes al nivel.
4. Genera 3 preguntas de comprensión con 4 opciones cada una.
5. NUNCA repitas situación de la lista de arriba.

Responde SOLO con JSON válido, sin markdown:
{{
  "titulo": "título corto de la situación",
  "situacion": "descripción breve en español",
  "guion": [
    {{"hablante": "Anna", "linea": "Hi, could you tell me..."}},
    {{"hablante": "Tom",  "linea": "Sure, the gate is..."}}
  ],
  "preguntas": [
    {{
      "pregunta": "What does Anna want to know?",
      "opciones": ["A", "B", "C", "D"],
      "respuesta_correcta": "texto exacto",
      "explicacion": "por qué, en español"
    }}
  ]
}}"""

    for intento in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-flash-lite-latest",
                contents=prompt,
            )
            texto = response.text.strip().replace("```json", "").replace("```", "").strip()
            data = json.loads(texto)
            guardar_listening(user_id, data)
            return data
        except Exception as e:
            if intento >= 2:
                return {"error": f"No se pudo generar el listening: {str(e)}"}
            time.sleep(2)

    return {"error": "No se pudo generar el listening tras varios intentos."}


@app.post("/api/listening/resultado")
def post_listening_resultado(entrada: ListeningResultado):
    try:
        marcar_listening_completado(entrada.user_id, entrada.titulo, entrada.puntaje)
        correcto = entrada.puntaje >= 67
        registrar_respuesta(
            entrada.user_id,
            "listening",
            correcto,
            f"{entrada.titulo} ({entrada.puntaje}%)",
        )
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}