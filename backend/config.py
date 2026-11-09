from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    openai_api_key: str
    langchain_api_key: str = ""
    langchain_tracing_v2: bool = True
    langchain_project: str = "smaran"

    model_config = {"env_file": ".env"}


settings = Settings()
