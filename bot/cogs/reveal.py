"""/reveal: once everyone has rated, Caption Hastings posts a movie's scores in #rate-movies.

/reveal            shows the moderator a private preview
/reveal post:True  posts it in #rate-movies
"""
import statistics

import discord
from discord import app_commands
from discord.ext import commands

from ..db import WATCHED, DB
from ..util import choices, label, resolve_movie

MAX_REMARKS = 3
REMARK_CHARS = 200


def averages(db: DB) -> dict[int, float]:
    """Movie id -> average score for every watched movie with scores, rounded like the website (bot/export.py)."""
    rows = db.q(f"SELECT m.id, AVG(r.score) AS avg FROM movies m JOIN ratings r ON r.movie_id = m.id "
                f"WHERE {WATCHED} GROUP BY m.id")
    return {r["id"]: round(r["avg"], 2) for r in rows}


def hastings_line(rank: int, total: int, scores: list[float]) -> str | None:
    spread = max(scores) - min(scores)
    if total >= 6 and rank <= 3:
        return "I say! Straight into our top three."
    if total >= 6 and rank > total - 3:
        return "Good Lord. Well, they can't all be winners."
    if spread <= 1.5:
        return "Remarkable agreement, for once."
    if spread >= 4:
        return "I say, a bit of a split on this one."
    return None


def verdict(db: DB, movie_id: int, site_url: str) -> str:
    """The /reveal message for a watched movie with scores."""
    movie, rs = db.movie(movie_id), db.ratings_for(movie_id)
    avgs = averages(db)
    avg, total = avgs[movie_id], len(avgs)
    rank = 1 + sum(a > avg for a in avgs.values())   # ties share the better place
    overall = statistics.mean(avgs.values())
    scores = [r["score"] for r in rs]

    lines = [f"**🎬 The verdict: {label(movie)}**",
             f"Average **{avg:.2f}** from {len(rs)} scores · **#{rank}** of the {total} we've watched "
             f"(our overall average is {overall:.2f})"]
    if names := db.suggesters(movie_id):
        lines.append(f"Suggested by **{', '.join(names)}**")
    lines.append(" · ".join(f"`{r['score']:.1f}` {r['name']}" for r in rs))
    remarks = []
    for r in sorted((r for r in rs if r["remark"]), key=lambda r: -len(r["remark"]))[:MAX_REMARKS]:
        text = " ".join(r["remark"].split())
        text = text if len(text) <= REMARK_CHARS else text[:REMARK_CHARS - 1].rstrip() + "…"
        remarks.append(f'> "{text}" — {r["name"]}')
    end = [line] if (line := hastings_line(rank, total, scores)) else []
    end.append(f"🌐 Full scores on the website: {site_url}#movie/{movie_id}")
    while len(text := "\n".join(lines + remarks + end)) > 2000 and remarks:
        remarks.pop()   # Discord's limit; only with a great many scores
    return text


class Reveal(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    async def watched_autocomplete(self, itx: discord.Interaction, current: str):
        return choices(self.db.search_movies(current, watched=True))

    @app_commands.command(name="reveal", description="Post a movie's scores in #rate-movies once everyone has rated (moderators)")
    @app_commands.describe(movie="Defaults to the movie we watched last",
                           post="False = private preview; True = post in #rate-movies")
    @app_commands.default_permissions(manage_messages=True)
    @app_commands.autocomplete(movie=watched_autocomplete)
    async def reveal(self, itx: discord.Interaction, movie: str | None = None, post: bool = False):
        if movie:
            row = resolve_movie(self.db, movie, watched=True)
        else:
            last = self.db.one("SELECT movie_id FROM screenings ORDER BY watched_on DESC, id DESC LIMIT 1")
            row = self.db.movie(last["movie_id"]) if last else None
        if not row or not self.db.last_screening(row["id"]):
            return await itx.response.send_message("Pick a movie we've watched from the list.", ephemeral=True)
        if not self.db.ratings_for(row["id"]):
            return await itx.response.send_message(f"No scores for **{label(row)}** yet.", ephemeral=True)

        text = verdict(self.db, row["id"], self.bot.cfg.site_url)
        if not post:
            return await itx.response.send_message(text, ephemeral=True)
        channel = (self.bot.get_channel(self.bot.cfg.rate_channel_id) if self.bot.cfg.rate_channel_id else None) \
            or itx.channel
        message = await channel.send(text, allowed_mentions=discord.AllowedMentions.none())
        await itx.response.send_message(f"Posted: {message.jump_url}", ephemeral=True)


async def setup(bot):
    await bot.add_cog(Reveal(bot))
