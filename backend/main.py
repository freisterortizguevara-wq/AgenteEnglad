import os
import json
from busqueda import buscar_en_internet
from busqueda import buscar_en_internet, buscar_videos_youtube
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from memoria import (
    inicializar_db,
    cargar_perfil,
    actualizar_sesion,
    guardar_objetivo,
    actualizar_nivel,
    registrar_tema_visto,
    registrar_error_frecuente,
)

load_dotenv()
inicializar_db()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(title="Agente de Inglés API")

# Permitir que el frontend (en otro puerto/dominio) le hable a esta API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # en producción, restringe esto a tu dominio de Vercel
    allow_methods=["*"],
    allow_headers=["*"],
)

# Guardamos una sesión de chat en memoria del proceso (simple por ahora, un solo usuario)
_chat_sessions = {}


def crear_chat():
    perfil = cargar_perfil()
    system_instruction = f"""
Eres un tutor de inglés experto y también un investigador metodológico.

PERFIL ACTUAL DEL ESTUDIANTE:
- Nivel: {perfil['nivel']}
- Objetivo: {perfil['objetivo'] or 'aún no definido, pregúntale'}
- Temas ya vistos: {', '.join(perfil['temas_vistos']) or 'ninguno aún'}
- Errores frecuentes: {', '.join(perfil['errores_frecuentes']) or 'ninguno registrado aún'}
- Racha de días estudiando: {perfil['racha_dias']}

Tu forma de trabajar:
1. Usa el perfil para NO repetir preguntas ya respondidas.
2. Usa guardar_objetivo / actualizar_nivel cuando el estudiante te lo diga claramente.
3. Usa registrar_tema_visto al explicar o practicar un tema.
4. Usa registrar_error_frecuente cuando el estudiante cometa un error notable.
5. Sé conciso, práctico y motivador.
6. Responde en español al explicar teoría, pero usa inglés real en ejemplos y ejercicios.
7. Cuando te pregunten por métodos, técnicas o estudios sobre aprender inglés,
   usa buscar_en_internet para dar información actualizada y real, no inventada.
"""
    return client.chats.create(
        model="gemini-flash-latest",
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=[
                guardar_objetivo,
                actualizar_nivel,
                registrar_tema_visto,
                registrar_error_frecuente,
                buscar_en_internet,
            ],
        ),
    )


class MensajeEntrada(BaseModel):
    mensaje: str


@app.on_event("startup")
def startup():
    actualizar_sesion()
    _chat_sessions["default"] = crear_chat()


@app.get("/api/perfil")
def obtener_perfil():
    return cargar_perfil()


@app.post("/api/chat")
def chat_endpoint(entrada: MensajeEntrada):
    try:
        chat = _chat_sessions["default"]
        response = chat.send_message(entrada.mensaje)
        return {"respuesta": response.text}
    except Exception as e:
        import traceback
        error_completo = traceback.format_exc()
        print(error_completo)  # también lo imprime en la terminal
        return {"error": str(e), "detalle": error_completo}
    
class RespuestaEjercicio(BaseModel):
    pregunta_id: str
    respuesta_usuario: str

@app.get("/api/videos")
def obtener_videos():
    perfil = cargar_perfil()
    tema = perfil["objetivo"] or "english grammar basics"
    try:
        videos = buscar_videos_youtube(tema)
        return {"videos": videos, "tema_usado": tema}
    except Exception as e:
        return {"videos": [], "error": str(e)}
@app.get("/api/ejercicio")
def generar_ejercicio():
    perfil = cargar_perfil()
@app.get("/api/frase-practica")
def generar_frase_practica():
    perfil = cargar_perfil()

    prompt = f"""
Genera UNA frase corta en inglés (6-12 palabras) para practicar pronunciación,
apropiada para un estudiante de nivel {perfil['nivel']} con objetivo: {perfil['objetivo'] or 'general'}.

Responde SOLO con un JSON válido, sin texto adicional, sin markdown:
{{
  "frase": "la frase en inglés",
  "traduccion": "traducción al español",
  "tip_pronunciacion": "un consejo breve sobre qué sonido o palabra cuidar, en español"
}}
"""

    intentos = 0
    while intentos < 3:
        try:
            response = client.models.generate_content(
                model="gemini-flash-lite-latest",
                contents=prompt,
            )
            texto = response.text.strip().replace("```json", "").replace("```", "").strip()
            return json.loads(texto)
        except Exception:
            intentos += 1
            if intentos == 3:
                return {"error": "No se pudo generar la frase."}
            time.sleep(2)    

    prompt = f"""
Genera UN ejercicio de inglés tipo opción múltiple para un estudiante con:
- Nivel: {perfil['nivel']}
- Objetivo: {perfil['objetivo'] or 'general'}
- Temas ya vistos: {', '.join(perfil['temas_vistos']) or 'ninguno'}

Responde SOLO con un JSON válido, sin texto adicional, sin markdown, con este formato exacto:
{{
  "tema": "nombre corto del tema, ej. Presente Perfecto",
  "pregunta": "la pregunta o frase a completar, en inglés",
  "opciones": ["opción A", "opción B", "opción C", "opción D"],
  "respuesta_correcta": "el texto exacto de la opción correcta",
  "explicacion": "por qué es correcta, en español, breve"
}}
"""

    intentos = 0
    while intentos < 3:
        try:
            response = client.models.generate_content(
                model="gemini-flash-lite-latest",
                contents=prompt,
            )
            texto = response.text.strip()
            # Por si Gemini agrega ```json ... ``` alrededor
            texto = texto.replace("```json", "").replace("```", "").strip()
            ejercicio = json.loads(texto)
            return ejercicio
        except Exception as e:
            intentos += 1
            if intentos == 3:
                return {"error": "No se pudo generar el ejercicio, intenta de nuevo."}
            time.sleep(2)    