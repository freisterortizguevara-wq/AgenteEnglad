"""
memoria.py — Persistencia en Neon Postgres para el agente de inglés.

Diseño:
  - Multi-usuario (user_id TEXT).
  - Histórico de eventos, objetivos, vocabulario SRS, ejercicios y listening.
  - Cálculo de progreso y generación de objetivos adaptativos.

Requiere: psycopg[binary] (v3), python-dotenv.
"""
import os
import json
from datetime import date, datetime, timedelta
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if DATABASE_URL and "sslmode=" not in DATABASE_URL:
    sep = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{sep}sslmode=require"


# ==================================================================
# CONEXIÓN
# ==================================================================
def conectar():
    """Abre una conexión nueva con row_factory de dict."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no configurada.")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


# ==================================================================
# ESQUEMA
# ==================================================================
def inicializar_db():
    """Crea todas las tablas si no existen. Idempotente."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                user_id       TEXT PRIMARY KEY,
                nivel         TEXT DEFAULT 'principiante',
                objetivo      TEXT DEFAULT '',
                racha_dias    INT  DEFAULT 0,
                ultima_sesion DATE,
                creado_en     TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS eventos (
                id         BIGSERIAL PRIMARY KEY,
                user_id    TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
                tipo       TEXT NOT NULL,
                tema       TEXT,
                detalle    TEXT,
                correcto   BOOLEAN,
                creado_en  TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_eventos_user_fecha
                ON eventos(user_id, creado_en DESC);

            CREATE TABLE IF NOT EXISTS objetivos (
                id           BIGSERIAL PRIMARY KEY,
                user_id      TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
                descripcion  TEXT NOT NULL,
                metrica      TEXT,
                estado       TEXT DEFAULT 'activo',
                creado_en    TIMESTAMPTZ DEFAULT NOW(),
                logrado_en   TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS errores (
                user_id     TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
                error       TEXT,
                veces       INT DEFAULT 1,
                ultima_vez  TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (user_id, error)
            );

            CREATE TABLE IF NOT EXISTS temas (
                user_id     TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
                tema        TEXT,
                veces       INT DEFAULT 1,
                ultima_vez  TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (user_id, tema)
            );

            CREATE TABLE IF NOT EXISTS vocabulario (
                id               BIGSERIAL PRIMARY KEY,
                user_id          TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
                palabra          TEXT NOT NULL,
                traduccion       TEXT,
                ejemplo          TEXT,
                contexto         TEXT,
                facilidad        REAL DEFAULT 2.5,
                repeticiones     INT  DEFAULT 0,
                intervalo_dias   INT  DEFAULT 0,
                proxima_revision DATE DEFAULT CURRENT_DATE,
                ultima_revision  TIMESTAMPTZ,
                creado_en        TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (user_id, palabra)
            );
            CREATE INDEX IF NOT EXISTS idx_vocab_prox_rev
                ON vocabulario(user_id, proxima_revision);
        """)
        conn.commit()

    inicializar_ejercicios()


def inicializar_ejercicios():
    """Crea las tablas de ejercicios y listening."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ejercicios (
                id                 BIGSERIAL PRIMARY KEY,
                user_id            TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
                tema               TEXT NOT NULL,
                pregunta           TEXT NOT NULL,
                opciones           JSONB,
                respuesta_correcta TEXT,
                explicacion        TEXT,
                dificultad         INT DEFAULT 2,
                contestado         BOOLEAN DEFAULT FALSE,
                correcto           BOOLEAN,
                creado_en          TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_ejercicios_user_fecha
                ON ejercicios(user_id, creado_en DESC);

            CREATE TABLE IF NOT EXISTS listening (
                id          BIGSERIAL PRIMARY KEY,
                user_id     TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
                titulo      TEXT,
                guion       TEXT NOT NULL,
                preguntas   JSONB,
                dificultad  INT DEFAULT 2,
                completado  BOOLEAN DEFAULT FALSE,
                puntaje     INT,
                creado_en   TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_listening_user_fecha
                ON listening(user_id, creado_en DESC);
        """)
        conn.commit()


# ==================================================================
# HELPERS INTERNOS
# ==================================================================
def _asegurar_usuario(cur, user_id: str):
    """Inserta el usuario si no existe. Silencioso."""
    cur.execute("""
        INSERT INTO usuarios (user_id) VALUES (%s)
        ON CONFLICT (user_id) DO NOTHING
    """, (user_id,))


# ==================================================================
# EVENTOS
# ==================================================================
def registrar_evento(user_id: str, tipo: str, tema: str = None,
                     detalle: str = None, correcto: bool = None):
    """Inserta un evento crudo."""
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        cur.execute("""
            INSERT INTO eventos (user_id, tipo, tema, detalle, correcto)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, tipo, tema, detalle, correcto))
        conn.commit()


# ==================================================================
# PERFIL
# ==================================================================
def cargar_perfil(user_id: str = "default") -> dict:
    """Devuelve el perfil completo con temas y errores agregados."""
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        conn.commit()

        cur.execute("SELECT * FROM usuarios WHERE user_id = %s", (user_id,))
        u = cur.fetchone()
        if not u:
            return {
                "user_id": user_id, "nivel": "principiante", "objetivo": "",
                "racha_dias": 0, "ultima_sesion": "",
                "temas_vistos": [], "errores_frecuentes": [],
            }

        cur.execute("SELECT tema FROM temas WHERE user_id = %s", (user_id,))
        temas = [r["tema"] for r in cur.fetchall()]

        cur.execute("""
            SELECT error, veces FROM errores
            WHERE user_id = %s ORDER BY veces DESC LIMIT 10
        """, (user_id,))
        errores = [f"{r['error']} (x{r['veces']})" for r in cur.fetchall()]

        u["temas_vistos"] = temas
        u["errores_frecuentes"] = errores
        u["ultima_sesion"] = str(u["ultima_sesion"]) if u["ultima_sesion"] else ""
        return u


def actualizar_sesion(user_id: str = "default") -> dict:
    """Actualiza la racha diaria si es la primera vez del día."""
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        conn.commit()

        cur.execute("""
            SELECT ultima_sesion, racha_dias FROM usuarios WHERE user_id = %s
        """, (user_id,))
        row = cur.fetchone()
        hoy = date.today()
        ultima = row["ultima_sesion"]
        racha = row["racha_dias"] or 0

        if ultima != hoy:
            racha = racha + 1 if ultima == hoy - timedelta(days=1) else 1
            cur.execute("""
                UPDATE usuarios SET racha_dias = %s, ultima_sesion = %s
                WHERE user_id = %s
            """, (racha, hoy, user_id))
            conn.commit()

    return cargar_perfil(user_id)


# ==================================================================
# TOOLS PARA GEMINI
# ==================================================================
def guardar_objetivo(user_id: str, objetivo: str) -> str:
    """Guarda el objetivo de aprendizaje del estudiante.

    Args:
        user_id: id del usuario.
        objetivo: descripción breve (ej: "trabajo, inglés técnico").
    """
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        cur.execute("UPDATE usuarios SET objetivo = %s WHERE user_id = %s",
                    (objetivo, user_id))
        cur.execute("""
            UPDATE objetivos SET estado = 'abandonado'
            WHERE user_id = %s AND estado = 'activo'
        """, (user_id,))
        cur.execute("""
            INSERT INTO objetivos (user_id, descripcion) VALUES (%s, %s)
        """, (user_id, objetivo))
        conn.commit()
    registrar_evento(user_id, "sesion", detalle=f"objetivo: {objetivo}")
    return f"Objetivo guardado: {objetivo}"


def actualizar_nivel(user_id: str, nivel: str) -> str:
    """Actualiza el nivel declarado del estudiante.

    Args:
        user_id: id del usuario.
        nivel: "principiante", "intermedio" o "avanzado".
    """
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        cur.execute("UPDATE usuarios SET nivel = %s WHERE user_id = %s",
                    (nivel, user_id))
        conn.commit()
    return f"Nivel actualizado a: {nivel}"


def registrar_tema_visto(user_id: str, tema: str) -> str:
    """Registra un tema que se explicó o practicó.

    Args:
        user_id: id del usuario.
        tema: nombre corto (ej: "phrasal verbs").
    """
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        cur.execute("""
            INSERT INTO temas (user_id, tema, veces) VALUES (%s, %s, 1)
            ON CONFLICT (user_id, tema)
            DO UPDATE SET veces = temas.veces + 1, ultima_vez = NOW()
        """, (user_id, tema))
        conn.commit()
    registrar_evento(user_id, "tema", tema=tema)
    return f"Tema registrado: {tema}"


def registrar_error_frecuente(user_id: str, error: str) -> str:
    """Registra un error gramatical o de vocabulario recurrente.

    Args:
        user_id: id del usuario.
        error: descripción breve.
    """
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        cur.execute("""
            INSERT INTO errores (user_id, error, veces) VALUES (%s, %s, 1)
            ON CONFLICT (user_id, error)
            DO UPDATE SET veces = errores.veces + 1, ultima_vez = NOW()
        """, (user_id, error))
        conn.commit()
    registrar_evento(user_id, "error", detalle=error, correcto=False)
    return f"Error registrado: {error}"


def registrar_respuesta(user_id: str, tema: str, correcto: bool,
                        detalle: str = None) -> str:
    """Registra un acierto o error concreto del estudiante sobre un tema.

    Args:
        user_id: id del usuario.
        tema: tema evaluado.
        correcto: True si acertó, False si falló.
        detalle: opcional.
    """
    registrar_evento(
        user_id,
        "acierto" if correcto else "error",
        tema=tema,
        detalle=detalle,
        correcto=correcto,
    )
    return f"Respuesta registrada ({'acierto' if correcto else 'error'}) en {tema}."


def agregar_palabra(user_id: str, palabra: str, traduccion: str = "",
                    ejemplo: str = "", contexto: str = "") -> str:
    """Añade una palabra nueva al vocabulario del usuario.

    Args:
        user_id: id del usuario.
        palabra: palabra o expresión en inglés.
        traduccion: traducción al español.
        ejemplo: frase de ejemplo.
        contexto: frase original donde apareció.
    """
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        cur.execute("""
            INSERT INTO vocabulario
                (user_id, palabra, traduccion, ejemplo, contexto)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id, palabra) DO NOTHING
        """, (user_id, palabra.strip().lower(), traduccion, ejemplo, contexto))
        conn.commit()
    registrar_evento(user_id, "vocab_add", detalle=palabra)
    return f"Palabra guardada: {palabra}"


# ==================================================================
# EJERCICIOS
# ==================================================================
def guardar_ejercicio(user_id: str, ej: dict, dificultad: int = 2) -> int:
    """Guarda un ejercicio generado para no repetirlo."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO ejercicios
                (user_id, tema, pregunta, opciones, respuesta_correcta, explicacion, dificultad)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            user_id,
            ej.get("tema", "general"),
            ej.get("pregunta", ""),
            json.dumps(ej.get("opciones", [])),
            ej.get("respuesta_correcta", ""),
            ej.get("explicacion", ""),
            dificultad,
        ))
        nuevo_id = cur.fetchone()["id"]
        conn.commit()
    return nuevo_id


def ejercicios_recientes(user_id: str, limite: int = 15) -> list:
    """Devuelve los últimos ejercicios para evitar repetir."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT tema, pregunta FROM ejercicios
            WHERE user_id = %s
            ORDER BY creado_en DESC
            LIMIT %s
        """, (user_id, limite))
        return [dict(r) for r in cur.fetchall()]


def estadisticas_dificultad(user_id: str) -> dict:
    """Cuántos ejercicios ha acertado por dificultad."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT dificultad,
                   COUNT(*) FILTER (WHERE correcto) AS aciertos,
                   COUNT(*) FILTER (WHERE contestado) AS total
            FROM ejercicios
            WHERE user_id = %s
            GROUP BY dificultad
        """, (user_id,))
        return {r["dificultad"]: {"aciertos": r["aciertos"], "total": r["total"]}
                for r in cur.fetchall()}


def marcar_ejercicio_contestado(user_id: str, pregunta: str, correcto: bool):
    """Marca el ejercicio más reciente que coincida con la pregunta."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE ejercicios
            SET contestado = TRUE, correcto = %s
            WHERE id = (
                SELECT id FROM ejercicios
                WHERE user_id = %s AND pregunta = %s AND contestado = FALSE
                ORDER BY creado_en DESC LIMIT 1
            )
        """, (correcto, user_id, pregunta))
        conn.commit()


# ==================================================================
# LISTENING
# ==================================================================
def guardar_listening(user_id: str, data: dict, dificultad: int = 2) -> int:
    """Guarda un listening generado."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO listening (user_id, titulo, guion, preguntas, dificultad)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (
            user_id,
            data.get("titulo", ""),
            json.dumps(data.get("guion", [])),
            json.dumps(data.get("preguntas", [])),
            dificultad,
        ))
        nuevo_id = cur.fetchone()["id"]
        conn.commit()
    return nuevo_id


def listenings_recientes(user_id: str, limite: int = 5) -> list:
    """Lista los últimos listenings para no repetir."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT titulo FROM listening
            WHERE user_id = %s
            ORDER BY creado_en DESC
            LIMIT %s
        """, (user_id, limite))
        return [dict(r) for r in cur.fetchall()]


def marcar_listening_completado(user_id: str, titulo: str, puntaje: int):
    """Marca un listening como completado."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE listening
            SET completado = TRUE, puntaje = %s
            WHERE id = (
                SELECT id FROM listening
                WHERE user_id = %s AND titulo = %s AND completado = FALSE
                ORDER BY creado_en DESC LIMIT 1
            )
        """, (puntaje, user_id, titulo))
        conn.commit()


# ==================================================================
# CÁLCULO DE PROGRESO
# ==================================================================
def calcular_progreso(user_id: str = "default", dias: int = 14) -> dict:
    """Analiza los eventos de los últimos N días y devuelve métricas."""
    desde = datetime.now() - timedelta(days=dias)
    with conectar() as conn, conn.cursor() as cur:
        _asegurar_usuario(cur, user_id)
        conn.commit()

        cur.execute("""
            SELECT tema,
                   COUNT(*) FILTER (WHERE correcto) AS aciertos,
                   COUNT(*)                          AS total
            FROM eventos
            WHERE user_id = %s AND creado_en >= %s AND tema IS NOT NULL
              AND correcto IS NOT NULL
            GROUP BY tema
        """, (user_id, desde))
        por_tema = {}
        for r in cur.fetchall():
            total = r["total"] or 1
            por_tema[r["tema"]] = {
                "aciertos": r["aciertos"],
                "total": r["total"],
                "ratio": round(r["aciertos"] / total, 2),
            }

        cur.execute("""
            SELECT error, veces FROM errores
            WHERE user_id = %s ORDER BY veces DESC LIMIT 3
        """, (user_id,))
        errores_top = [{"error": r["error"], "veces": r["veces"]} for r in cur.fetchall()]

        cur.execute("""
            SELECT COUNT(DISTINCT DATE(creado_en)) AS dias
            FROM eventos
            WHERE user_id = %s AND creado_en >= NOW() - INTERVAL '7 days'
        """, (user_id,))
        dias_activos_7d = cur.fetchone()["dias"] or 0

        cur.execute("SELECT COUNT(*) AS n FROM eventos WHERE user_id = %s", (user_id,))
        total_eventos = cur.fetchone()["n"] or 0

    dominados = [t for t, v in por_tema.items()
                 if v["total"] >= 5 and v["ratio"] >= 0.8]
    a_reforzar = [t for t, v in por_tema.items()
                  if v["total"] >= 3 and v["ratio"] < 0.6]

    return {
        "por_tema": por_tema,
        "dominados": dominados,
        "a_reforzar": a_reforzar,
        "errores_top": errores_top,
        "dias_activos_7d": dias_activos_7d,
        "total_eventos": total_eventos,
    }


def generar_objetivo_adaptativo(user_id: str = "default") -> str:
    """Devuelve el objetivo sugerido según la evolución real."""
    perfil = cargar_perfil(user_id)
    p = calcular_progreso(user_id)

    if p["total_eventos"] < 5:
        return "Realiza 5 ejercicios para empezar a medir tu evolución."

    if perfil["racha_dias"] < 3:
        return "Estudiar 3 días seguidos para crear el hábito."

    if p["errores_top"] and p["errores_top"][0]["veces"] >= 3:
        return (f"Reforzar error frecuente: '{p['errores_top'][0]['error']}' "
                f"con 8 ejercicios.")

    if p["a_reforzar"]:
        return f"Reforzar '{p['a_reforzar'][0]}' hasta superar el 70% de aciertos."

    if len(p["dominados"]) >= 3:
        return (f"Has dominado {len(p['dominados'])} temas. "
                f"Introduce un tema nuevo para seguir avanzando.")

    return "Mantén el ritmo: 1 sesión diaria de 10 minutos."


# ==================================================================
# VOCABULARIO (SRS - SM-2)
# ==================================================================
def obtener_palabras_pendientes(user_id: str, limite: int = 20) -> list:
    """Devuelve las tarjetas cuya próxima revisión es hoy o antes."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, palabra, traduccion, ejemplo, contexto,
                   facilidad, repeticiones, intervalo_dias, proxima_revision
            FROM vocabulario
            WHERE user_id = %s AND proxima_revision <= CURRENT_DATE
            ORDER BY proxima_revision ASC, id ASC
            LIMIT %s
        """, (user_id, limite))
        return [dict(r) for r in cur.fetchall()]


def listar_vocabulario(user_id: str, limite: int = 200) -> list:
    """Lista todo el vocabulario del usuario."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, palabra, traduccion, ejemplo, contexto,
                   facilidad, repeticiones, intervalo_dias, proxima_revision,
                   creado_en
            FROM vocabulario
            WHERE user_id = %s
            ORDER BY proxima_revision ASC
            LIMIT %s
        """, (user_id, limite))
        return [dict(r) for r in cur.fetchall()]


def revisar_palabra(user_id: str, palabra_id: int, calidad: int) -> dict:
    """Aplica SM-2 a una tarjeta tras calificarla.

    Args:
        user_id: id del usuario.
        palabra_id: id de la tarjeta.
        calidad: 0=Otra vez, 1=Difícil, 2=Bien, 3=Fácil.
    """
    calidad = max(0, min(3, calidad))
    q_sm2 = {0: 1, 1: 3, 2: 4, 3: 5}[calidad]

    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT facilidad, repeticiones, intervalo_dias
            FROM vocabulario
            WHERE id = %s AND user_id = %s
        """, (palabra_id, user_id))
        row = cur.fetchone()
        if not row:
            return {"error": "Palabra no encontrada"}

        ef = row["facilidad"] or 2.5
        reps = row["repeticiones"] or 0
        interval = row["intervalo_dias"] or 0

        if q_sm2 < 3:
            reps = 0
            interval = 1
        else:
            if reps == 0:
                interval = 1
            elif reps == 1:
                interval = 6
            else:
                interval = round(interval * ef)
            reps += 1
            ef = ef + (0.1 - (5 - q_sm2) * (0.08 + (5 - q_sm2) * 0.02))
            ef = max(1.3, ef)

        cur.execute("""
            UPDATE vocabulario
            SET facilidad = %s,
                repeticiones = %s,
                intervalo_dias = %s,
                proxima_revision = CURRENT_DATE + %s::int,
                ultima_revision = NOW()
            WHERE id = %s AND user_id = %s
            RETURNING id, palabra, traduccion, ejemplo, contexto,
                      facilidad, repeticiones, intervalo_dias, proxima_revision
        """, (ef, reps, interval, interval, palabra_id, user_id))
        actualizada = dict(cur.fetchone())
        conn.commit()

    registrar_evento(
        user_id,
        "vocab_review",
        tema="vocabulario",
        detalle=f"{actualizada['palabra']} (q={calidad})",
        correcto=calidad >= 2,
    )
    return actualizada


def estadisticas_vocabulario(user_id: str) -> dict:
    """Resumen para el dashboard de vocabulario."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE proxima_revision <= CURRENT_DATE) AS pendientes,
                COUNT(*) FILTER (WHERE repeticiones >= 3) AS consolidadas,
                COUNT(*) FILTER (WHERE repeticiones = 0) AS nuevas
            FROM vocabulario WHERE user_id = %s
        """, (user_id,))
        r = cur.fetchone()
        return {
            "total": r["total"] or 0,
            "pendientes_hoy": r["pendientes"] or 0,
            "consolidadas": r["consolidadas"] or 0,
            "nuevas": r["nuevas"] or 0,
        }


# ==================================================================
# UTILIDADES
# ==================================================================
def marcar_objetivo_logrado(user_id: str, objetivo_id: int) -> str:
    """Marca un objetivo como logrado."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE objetivos SET estado = 'logrado', logrado_en = NOW()
            WHERE id = %s AND user_id = %s
        """, (objetivo_id, user_id))
        conn.commit()
    return "Objetivo marcado como logrado."


def obtener_objetivos(user_id: str = "default") -> list:
    """Lista los objetivos del usuario."""
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, descripcion, estado, creado_en, logrado_en
            FROM objetivos WHERE user_id = %s
            ORDER BY creado_en DESC
        """, (user_id,))
        return [dict(r) for r in cur.fetchall()]