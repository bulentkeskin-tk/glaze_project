from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    slack_bot_token: str
    slack_signing_secret: str
    slack_app_token: str | None = None
    glaze_default_channel_id: str

    supabase_url: str
    supabase_service_role_key: str

    openai_api_key: str | None = None

    app_base_url: str = 'http://localhost:3000'
    admin_trigger_token: str = 'change-me'
    admin_dashboard_password: str = 'password'

    glaze_default_frequency: str = 'biweekly'
    glaze_cross_department_weight: int = 20
    glaze_repeat_penalty_days: int = 3650


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
