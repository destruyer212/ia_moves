from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env", env_file_encoding="utf-8")

    openai_api_key: str | None = None
    app_name: str = "IA Moves Core"
    backend_port: int = 8765
    simulation_mode: bool = True


settings = Settings()

