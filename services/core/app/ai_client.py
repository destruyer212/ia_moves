from openai import OpenAI

from .config import settings


class AiClient:
    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def chat(self, message: str, context: str | None = None) -> str:
        if self._client is None:
            return (
                "IA local en modo espera. Agrega OPENAI_API_KEY en .env para activar respuestas reales. "
                f"Tu mensaje fue: {message}"
            )

        prompt = "Eres IA Moves, un asistente local para programar y controlar una app por gestos."
        if context:
            prompt += f"\nContexto del proyecto:\n{context}"

        response = self._client.responses.create(
            model="gpt-5.2",
            input=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": message},
            ],
        )
        return response.output_text


ai_client = AiClient()

