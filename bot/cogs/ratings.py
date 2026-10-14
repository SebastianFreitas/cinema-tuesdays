import statistics

import discord
from discord import app_commands
from discord.ext import commands

from ..util import choices, label, movie_embed, parse_date, resolve_movie


class Ratings(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    async def watched_autocomplete(self, itx: discord.Interaction, current: str):
        return choices(self.db.search_movies(current, watched=True))

    async def any_autocomplete(self, itx: discord.Interaction, current: str):
        return choices(self.db.search_movies(current))

    @app_commands.command(name="rate", description="Score a movie we watched (0.0 to 10.0)")
    @app_commands.describe(movie="A movie we've watched", score="0.0 to 10.0", remark="A short comment")
    @app_commands.autocomplete(movie=watched_autocomplete)
    async def rate(self, itx: discord.Interaction, movie: str, score: app_commands.Range[float, 0.0, 10.0],
                   remark: str | None = None):
        row = resolve_movie(self.db, movie, watched=True)
        if not row:
            return await itx.response.send_message("Pick a movie we've watched from the list.", ephemeral=True)
        minimum = self.bot.cfg.min_remark_chars
        if minimum and len((remark or "").strip()) < minimum:
            return await itx.response.send_message(
                f"Please add a remark of at least {minimum} characters.", ephemeral=True)

        score = round(score, 1)
        user_id = self.db.upsert_user(itx.user.id, itx.user.display_name)
        updated = self.db.rate(row["id"], user_id, score, (remark or "").strip() or None)
        self.bot.mark_dirty()

        text = f"**{label(row)}** — **{score:.1f}**/10 · {itx.user.mention}" + (" (updated)" if updated else "")
        if remark:
            text += "\n> " + remark.strip().replace("\n", "\n> ")
        mentions = discord.AllowedMentions.none()

        rate_channel_id = self.bot.cfg.rate_channel_id
        if not rate_channel_id or itx.channel_id == rate_channel_id:
            return await itx.response.send_message(text, allowed_mentions=mentions)
        await self.bot.get_channel(rate_channel_id).send(text, allowed_mentions=mentions)
        await itx.response.send_message(f"Saved and posted in <#{rate_channel_id}>.", ephemeral=True)

    @app_commands.command(name="ratings", description="Everyone's scores for a movie")
    @app_commands.autocomplete(movie=watched_autocomplete)
    async def ratings(self, itx: discord.Interaction, movie: str):
        row = resolve_movie(self.db, movie, watched=True)
        if not row:
            return await itx.response.send_message("Pick a movie we've watched from the list.", ephemeral=True)
        rs = self.db.ratings_for(row["id"])
        if not rs:
            return await itx.response.send_message(f"No scores for **{label(row)}** yet.", ephemeral=True)
        scores = [r["score"] for r in rs]
        lines = [f"`{r['score']:>4.1f}` **{r['name']}**" + (f" — {r['remark']}" if r["remark"] else "") for r in rs]
        summary = f"Average **{statistics.mean(scores):.2f}** from {len(scores)} scores"
        if len(scores) > 1:
            summary += f" · spread ±{statistics.pstdev(scores):.2f}"
        embed = movie_embed(row, description=summary + "\n\n" + "\n".join(lines)[:3800])
        await itx.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="watched", description="Mark a movie as watched (moderators)")
    @app_commands.default_permissions(manage_messages=True)
    @app_commands.describe(movie="Defaults to the latest vote winner", date="YYYY-MM-DD or DD/MM/YYYY, defaults to today")
    @app_commands.autocomplete(movie=any_autocomplete)
    async def watched(self, itx: discord.Interaction, movie: str | None = None, date: str | None = None):
        row = resolve_movie(self.db, movie) if movie else self.db.next_up()
        if not row:
            return await itx.response.send_message("Which movie? Pick one from the list.", ephemeral=True)
        try:
            day = parse_date(date)
        except ValueError as e:
            return await itx.response.send_message(str(e), ephemeral=True)
        self.db.add_screening(row["id"], day)
        self.bot.mark_dirty()
        await itx.response.send_message(f"Marked **{label(row)}** as watched on {day}. "
                                        "Everyone can now `/rate` it.")


async def setup(bot):
    await bot.add_cog(Ratings(bot))
