import os
import json
from datetime import date
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()


def conectar():
    return psycopg2.connect(DATABASE_URL)


def inicializar_db():
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS perfil (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            nivel TEXT DEFAULT 'principiante',
            objetivo TEXT DEFAULT '',
            temas_vistos TEXT DEFAULT '[]',
            errores_frecuentes TEXT DEFAULT '[]',
            ultima_sesion TEXT DEFAULT '',
            racha_dias INTEGER DEFAULT 0
        )
    """)
    cursor.execute("SELECT COUNT(*) FROM perfil")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO perfil (id) VALUES (1)")
    conn.commit()
    cursor.close()
    conn.close()


def cargar_perfil():
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT nivel, objetivo, temas_vistos, errores_frecuentes, ultima_sesion, racha_dias
        FROM perfil WHERE id = 1
    """)
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    return {
        "nivel": row[0],
        "objetivo": row[1],
        "temas_vistos": json.loads(row[2]),
        "errores_frecuentes": json.loads(row[3]),
        "ultima_sesion": row[4],
        "racha_dias": row[5],
    }


def guardar_perfil(perfil: dict):
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE perfil SET
            nivel = %s,
            objetivo = %s,
            temas_vistos = %s,
            errores_frecuentes = %s,
            ultima_sesion = %s,
            racha_dias = %s
        WHERE id = 1
    """, (
        perfil["nivel"],
        perfil["objetivo"],
        json.dumps(perfil["temas_vistos"]),
        json.dumps(perfil["errores_frecuentes"]),
        perfil["ultima_sesion"],
        perfil["racha_dias"],
    ))
    conn.commit()
    cursor.close()
    conn.close()


def actualizar_sesion():
    perfil = cargar_perfil()
    hoy = str(date.today())

    if perfil["ultima_sesion"] != hoy:
        perfil["racha_dias"] += 1
        perfil["ultima_sesion"] = hoy
        guardar_perfil(perfil)

    return perfil


def guardar_objetivo(objetivo: str) -> str:
    """Guarda el objetivo de aprendizaje de inglés del estudiante (ej: trabajo, viajes, examen).

    Args:
        objetivo: Descripción breve del objetivo, ej. "trabajo, inglés técnico de programación"
    """
    perfil = cargar_perfil()
    perfil["objetivo"] = objetivo
    guardar_perfil(perfil)
    return f"Objetivo guardado: {objetivo}"


def actualizar_nivel(nivel: str) -> str:
    """Actualiza el nivel de inglés del estudiante.

    Args:
        nivel: Debe ser exactamente "principiante", "intermedio" o "avanzado"
    """
    perfil = cargar_perfil()
    perfil["nivel"] = nivel
    guardar_perfil(perfil)
    return f"Nivel actualizado a: {nivel}"


def registrar_tema_visto(tema: str) -> str:
    """Registra un tema de inglés que ya se explicó o practicó con el estudiante.

    Args:
        tema: Nombre corto del tema, ej. "phrasal verbs", "presente perfecto"
    """
    perfil = cargar_perfil()
    if tema not in perfil["temas_vistos"]:
        perfil["temas_vistos"].append(tema)
        guardar_perfil(perfil)
    return f"Tema registrado: {tema}"


def registrar_error_frecuente(error: str) -> str:
    """Registra un error gramatical o de vocabulario que el estudiante comete, para no olvidarlo.

    Args:
        error: Descripción breve del error, ej. "confunde 'have X years' con 'be X years old'"
    """
    perfil = cargar_perfil()
    if error not in perfil["errores_frecuentes"]:
        perfil["errores_frecuentes"].append(error)
        guardar_perfil(perfil)
    return f"Error registrado: {error}"