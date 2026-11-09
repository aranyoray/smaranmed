from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    openai_api_key: str
    langchain_api_key: str = ""
    langchain_tracing_v2: bool = True
    langchain_project: str = "smaran"
    # Shared staff key sent as X-Staff-Key. Every /api route except health needs it.
    staff_key: str = ""
    allowed_origins: str = "http://localhost:8000,http://127.0.0.1:8000,https://smaran.vercel.app"
    scheduler_enabled: bool = True
    clinic_timezone: str = "Asia/Kolkata"

    model_config = {"env_file": ".env", "env_prefix": "", "extra": "ignore"}


settings = Settings()
