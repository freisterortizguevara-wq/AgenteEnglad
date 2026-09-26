import time
import os
from dotenv import load_dotenv
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

perfil = actualizar_sesion()

system_instruction = f"""
Eres un tutor de inglés experto y también un investigador metodológico.

PERFIL ACTUAL DEL ESTUDIANTE:
- Nivel: {perfil['nivel']}
- Objetivo: {perfil['objetivo'] or 'aún no definido, pregúntale'}
- Temas ya vistos: {', '.join(perfil['temas_vistos']) or 'ninguno aún'}
- Errores frecuentes: {', '.join(perfil['errores_frecuentes']) or 'ninguno registrado aún'}
- Racha de días estudiando: {perfil['racha_dias']}

Tu forma de trabajar:
1. Usa el perfil de arriba para NO repetir preguntas ya respondidas.
2. Cuando el estudiante te diga su objetivo o nivel por primera vez, o si cambia,
   USA las funciones guardar_objetivo / actualizar_nivel para guardarlo. No lo hagas
   sin confirmación clara del usuario.
3. Cuando expliques o practiques un tema nuevo, regístralo con registrar_tema_visto.
4. Cuando el estudiante cometa un error repetido o notable, regístralo con
   registrar_error_frecuente.
5. Sé conciso, práctico y motivador.
6. Responde en español al explicar teoría, pero usa inglés real en ejemplos y ejercicios.
"""

chat = client.chats.create(
    model="gemini-flash-latest",
    config=types.GenerateContentConfig(
        system_instruction=system_instruction,
        tools=[
            guardar_objetivo,
            actualizar_nivel,
            registrar_tema_visto,
            registrar_error_frecuente,
        ],
    ),
)

print(f"🎓 Agente de Inglés listo. (Racha: {perfil['racha_dias']} días) Escribe 'salir' para terminar.\n")

while True:
    user_input = input("Tú: ")
    if user_input.lower() in ["salir", "exit", "quit"]:
        print("¡Hasta luego! Keep practicing 💪")
        break

    intentos = 0
    espera = 5
    while intentos < 4:
        try:
            response = chat.send_message(user_input)
            print(f"\nAgente: {response.text}\n")
            break
        except Exception as e:
            intentos += 1
            if intentos == 4:
                print(f"\n⚠️ Gemini está muy saturado ahora mismo. Espera 1-2 minutos y vuelve a intentar tu mensaje.\n")
            else:
                print(f"(servidor ocupado, reintentando en {espera}s... {intentos}/4)")
                time.sleep(espera)
                espera *= 2  # cada reintento espera el doble