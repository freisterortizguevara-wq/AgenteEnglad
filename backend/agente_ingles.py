"""
CLI de pruebas local para el agente de inglés.
Úsalo para probar rápido sin levantar FastAPI ni el frontend.

Uso:
    python agente.py                  # usa user_id="cli-test"
    python agente.py mi_user_id       # usa un user_id concreto
"""
import os
import sys
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types
from functools import partial

from memoria import (
    inicializar_db,
    cargar_perfil,
    actualizar_sesion,
    guardar_objetivo,
    actualizar_nivel,
    registrar_tema_visto,
    registrar_error_frecuente,
    registrar_respuesta,
    calcular_progreso,
    generar_objetivo_adaptativo,
)

load_dotenv()
inicializar_db()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", "").strip())

# El user_id viene por argumento o por defecto
USER_ID = sys.argv[1] if len(sys.argv) > 1 else "cli-test"


def construir_system_instruction(user_id: str) -> str:
    perfil = actualizar_sesion(user_id)
    progreso = calcular_progreso(user_id)
    objetivo = generar_objetivo_adaptativo(user_id)

    return f"""
Eres un tutor de inglés experto y también un investigador metodológico.

PERFIL DEL ESTUDIANTE (user_id={user_id}):
- Nivel: {perfil['nivel']}
- Objetivo: {perfil['objetivo'] or 'aún no definido, pregúntale'}
- Racha de días: {perfil['racha_dias']}
- Días activos (últimos 7): {progreso['dias_activos_7d']}

EVOLUCIÓN REAL:
- Temas dominados: {', '.join(progreso['dominados']) or 'ninguno aún'}
- Temas a reforzar: {', '.join(progreso['a_reforzar']) or 'ninguno'}
- Errores frecuentes: {', '.join(f"{e['error']} (x{e['veces']})" for e in progreso['errores_top']) or 'ninguno'}

🎯 OBJETIVO ADAPTATIVO ACTUAL:
{objetivo}

Tu forma de trabajar:
1. No repitas preguntas ya respondidas (mira temas vistos).
2. Usa guardar_objetivo / actualizar_nivel solo con confirmación clara.
3. Registra temas nuevos con registrar_tema_visto.
4. Registra errores notables con registrar_error_frecuente.
5. Llama a registrar_respuesta SIEMPRE que corrijas una respuesta del estudiante.
6. Sé conciso, práctico y motivador.
7. Explica teoría en español, pero usa inglés real en ejemplos y ejercicios.
"""


def crear_chat(user_id: str):
    tools = [
        partial(guardar_objetivo, user_id),
        partial(actualizar_nivel, user_id),
        partial(registrar_tema_visto, user_id),
        partial(registrar_error_frecuente, user_id),
        partial(registrar_respuesta, user_id),
    ]
    return client.chats.create(
        model="gemini-flash-latest",
        config=types.GenerateContentConfig(
            system_instruction=construir_system_instruction(user_id),
            tools=tools,
        ),
    )


def main():
    perfil = cargar_perfil(USER_ID)
    print(f"🎓 Agente listo. user_id={USER_ID} | Racha: {perfil['racha_dias']} días")
    print("   Escribe 'salir' para terminar, 'progreso' para ver métricas, 'reset' para reiniciar chat.\n")

    chat = crear_chat(USER_ID)

    while True:
        try:
            user_input = input("Tú: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n¡Hasta luego! Keep practicing 💪")
            break

        if not user_input:
            continue

        if user_input.lower() in ["salir", "exit", "quit"]:
            print("¡Hasta luego! Keep practicing 💪")
            break

        if user_input.lower() == "progreso":
            p = calcular_progreso(USER_ID)
            print(f"\n📊 Progreso: {p}")
            print(f"🎯 Objetivo adaptativo: {generar_objetivo_adaptativo(USER_ID)}\n")
            continue

        if user_input.lower() == "reset":
            chat = crear_chat(USER_ID)
            print("🔄 Chat reiniciado con el perfil actualizado.\n")
            continue

        # Reintentos con backoff exponencial
        intentos, espera = 0, 5
        while intentos < 4:
            try:
                response = chat.send_message(user_input)
                print(f"\nAgente: {response.text}\n")
                break
            except Exception as e:
                intentos += 1
                if intentos == 4:
                    print(f"\n⚠️ Gemini saturado: {e}\n   Espera 1-2 min y reintenta.\n")
                else:
                    print(f"(ocupado, reintentando en {espera}s... {intentos}/4)")
                    time.sleep(espera)
                    espera *= 2


if __name__ == "__main__":
    main()