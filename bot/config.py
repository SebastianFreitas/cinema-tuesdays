import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _int(name: str, default: int | None = None) -> int | None:
    value = os.getenv(name, "").strip()
    return int(value) if value else default


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name, "").strip().lower()
    return value in ("1", "true", "yes", "on") if value else default


@dataclass(frozen=True)
class Config:
    discord_token: str
    guild_id: int | None
    tmdb_token: str
    db_path: Path
    cartaz_channel_id: int | None
    rate_channel_id: int | None
    general_channel_id: int | None
    max_suggestions: int
    min_remark_chars: int
    publish_enabled: bool
    publish_interval_minutes: int
    site_url: str


def load() -> Config:
    return Config(
        discord_token=os.getenv("DISCORD_TOKEN", ""),
        guild_id=_int("GUILD_ID"),
        tmdb_token=os.getenv("TMDB_TOKEN", ""),
        db_path=ROOT / os.getenv("DB_PATH", "data/cinema.db"),
        cartaz_channel_id=_int("CARTAZ_CHANNEL_ID"),
        rate_channel_id=_int("RATE_CHANNEL_ID"),
        general_channel_id=_int("GENERAL_CHANNEL_ID"),
        max_suggestions=_int("MAX_SUGGESTIONS", 10),
        min_remark_chars=_int("MIN_REMARK_CHARS", 0),
        publish_enabled=_bool("PUBLISH_ENABLED"),
        publish_interval_minutes=_int("PUBLISH_INTERVAL_MINUTES", 10),
        site_url=os.getenv("SITE_URL", "").strip() or "https://sebastianfreitas.github.io/cinema-tuesdays/",
    )
