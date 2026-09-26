import os
from dotenv import load_dotenv
from google import genai

# Cargar las variables del archivo .env
load_dotenv()

# Crear el cliente de Gemini usando la key del .env
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Hacer una petición simple de prueba
response = client.models.generate_content(
    model="gemini-flash-latest",
    contents="Responde solo con: 'Conexión exitosa, listo para enseñar inglés.'"
)

print(response.text)