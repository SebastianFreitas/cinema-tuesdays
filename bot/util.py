import datetime as dt

import discord
from discord import app_commands

from .db import DB
from .tmdb import movie_url, poster_url


def label(movie) -> str:
    return f"{movie['title']} ({movie['year']})" if movie["year"] else movie["title"]


def movie_embed(movie, *, description: str | None = None, color=discord.Color.dark_red()) -> discord.Embed:
    overview = movie["overview"] or ""
    if description is None:
        description = overview[:300] + ("…" if len(overview) > 300 else "")
    embed = discord.Embed(title=label(movie), url=movie_url(movie["tmdb_id"]), description=description, color=color)
    if movie["poster_path"]:
        embed.set_thumbnail(url=poster_url(movie["poster_path"]))
    details = [d for d in (movie["director"], f"{movie['runtime']} min" if movie["runtime"] else None) if d]
    if details:
        embed.set_footer(text=" · ".join(details))
    return embed


def choices(rows) -> list[app_commands.Choice[str]]:
    return [app_commands.Choice(name=label(r)[:100], value=str(r["id"])) for r in rows[:25]]


def resolve_movie(db: DB, value: str, **filters):
    """Autocomplete values are movie ids; fall back to a title search if the user typed freely."""
    if value.isdigit() and (movie := db.movie(int(value))):
        return movie
    matches = db.search_movies(value, limit=2, **filters)
    return matches[0] if len(matches) == 1 else None


def parse_date(value: str | None) -> str:
    """YYYY-MM-DD or DD/MM/YYYY; defaults to today."""
    if not value:
        return dt.date.today().isoformat()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return dt.datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"Couldn't read the date {value!r}. Use YYYY-MM-DD or DD/MM/YYYY.")


GROUPS = {"alpha": "Group α", "omega": "Group ω"}


async def tmdb_choices(bot, current: str) -> list[app_commands.Choice[str]]:
    """Autocomplete straight from TMDB; values are TMDB ids."""
    if len(current) < 2 or not bot.tmdb.enabled:
        return []
    try:
        results = await bot.tmdb.search(current)
    except Exception:
        return []
    out = []
    for r in results[:25]:
        year = (r.get("release_date") or "")[:4]
        name = f"{r['title']} ({year})" if year else r["title"]
        out.append(app_commands.Choice(name=name[:100], value=str(r["id"])))
    return out


async def movie_from_tmdb(bot, value: str):
    """Turn a TMDB autocomplete value (or free text) into a stored movie row. None if not found."""
    if not bot.tmdb.enabled:
        raise LookupError("TMDB isn't configured on the bot yet (TMDB_TOKEN).")
    tmdb_id = int(value) if value.isdigit() else None
    if tmdb_id is None:
        results = await bot.tmdb.search(value)
        if not results:
            return None
        tmdb_id = results[0]["id"]
    return bot.db.movie(bot.db.upsert_movie(await bot.tmdb.details(tmdb_id)))
