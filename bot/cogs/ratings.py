import datetime as dt
import statistics

import discord
from discord import app_commands
from discord.ext import commands

from ..util import LISBON, choices, label, lisbon, movie_embed, parse_date, resolve_movie, ts


def is_mod(itx: discord.Interaction) -> bool:
    return isinstance(itx.user, discord.Member) and itx.user.guild_permissions.manage_messages


def rating_closes(watched_on: str) -> dt.datetime:
    """Scores are open until midnight (Portuguese time) at the end of the day after the screening."""
    return lisbon(dt.date.fromisoformat(watched_on) + dt.timedelta(days=2))


def rating_open(bot, movie_id: int) -> bool:
    seen = bot.db.last_screening(movie_id)
    return bool(seen) and dt.datetime.now(LISBON) < rating_closes(seen)


def closed_message(bot, row) -> str:
    closed = rating_closes(bot.db.last_screening(row["id"])) - dt.timedelta(minutes=1)
    return (f"Rating for **{label(row)}** closed {ts(closed, 'f')}. "
            "Ask a moderator if you need to fix a score.")


async def save_rating(bot, itx: discord.Interaction, row, score: float, remark: str | None) -> None:
    """Check and save a score, then answer the interaction.

    The score and remark are only shown to the person rating, so nobody is swayed by the others while voting;
    the channel just gets a line saying who has rated. Everyone's scores are on the website."""
    if not is_mod(itx) and not rating_open(bot, row["id"]):
        return await itx.response.send_message(closed_message(bot, row), ephemeral=True)
    remark = (remark or "").strip() or None
    minimum = bot.cfg.min_remark_chars
    if minimum and len(remark or "") < minimum:
        return await itx.response.send_message(f"Please add a remark of at least {minimum} characters.", ephemeral=True)

    score = round(score, 1)
    updated = bot.db.rate(row["id"], bot.db.upsert_user(itx.user.id, itx.user.display_name), score, remark)
    bot.mark_dirty()

    await itx.response.send_message(
        f"{'Updated' if updated else 'Saved'}: you gave **{label(row)}** **{score:.1f}**/10. "
        "Only you can see this. Everyone's scores are on the website.", ephemeral=True)
    if updated:
        return
    channel = (bot.get_channel(bot.cfg.rate_channel_id) if bot.cfg.rate_channel_id else None) or itx.channel
    if channel:
        await channel.send(f"⭐ {itx.user.mention} rated **{label(row)}**.",
                           allowed_mentions=discord.AllowedMentions.none())


def parse_score(text: str) -> float | None:
    try:
        value = float(text.strip().replace(",", "."))
    except ValueError:
        return None
    return value if 0 <= value <= 10 else None


class RateModal(discord.ui.Modal):
    """The form behind every Rate button: a score and an optional remark, prefilled if you rated before."""

    def __init__(self, bot, row, user_id: int):
        super().__init__(title=f"Rate {row['title']}"[:45])
        self.bot, self.row = bot, row
        mine = bot.db.one("SELECT score, remark FROM ratings WHERE movie_id = ? AND user_id = ?", (row["id"], user_id))
        minimum = bot.cfg.min_remark_chars
        self.score = discord.ui.TextInput(label="Score from 0.0 to 10.0", placeholder="e.g. 7.8", max_length=4,
                                          default=f"{mine['score']:.1f}" if mine else None)
        self.remark = discord.ui.TextInput(label="Remark" + ("" if minimum else " (optional)"),
                                           style=discord.TextStyle.paragraph, placeholder="What did you think?",
                                           required=minimum > 0, min_length=minimum or None, max_length=1000,
                                           default=mine["remark"] if mine and mine["remark"] else None)
        self.add_item(self.score)
        self.add_item(self.remark)

    async def on_submit(self, itx: discord.Interaction):
        score = parse_score(self.score.value)
        if score is None:
            return await itx.response.send_message("The score has to be a number from 0.0 to 10.0, like 7.8.",
                                                   ephemeral=True)
        await save_rating(self.bot, itx, self.row, score, self.remark.value)


async def open_rate_form(itx: discord.Interaction, movie_id: int) -> None:
    bot = itx.client
    row = bot.db.movie(movie_id)
    if not row or not bot.db.last_screening(movie_id):
        return await itx.response.send_message("That movie hasn't been marked as watched yet.", ephemeral=True)
    if not is_mod(itx) and not rating_open(bot, movie_id):
        return await itx.response.send_message(closed_message(bot, row), ephemeral=True)
    await itx.response.send_modal(RateModal(bot, row, bot.db.upsert_user(itx.user.id, itx.user.display_name)))


class RateButton(discord.ui.DynamicItem[discord.ui.Button], template=r"rate:(?P<movie>\d+)"):
    """Posted after each screening; keeps working across restarts."""

    def __init__(self, movie_id: int, text: str | None = None):
        super().__init__(discord.ui.Button(label=(text or "Rate it")[:80], emoji="⭐",
                                           style=discord.ButtonStyle.primary, custom_id=f"rate:{movie_id}"))
        self.movie_id = movie_id

    @classmethod
    async def from_custom_id(cls, interaction, item, match, /):
        return cls(int(match["movie"]), item.label)

    async def callback(self, itx: discord.Interaction):
        await open_rate_form(itx, self.movie_id)


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
        await save_rating(self.bot, itx, row, score, remark)

    @app_commands.command(name="ratings", description="Everyone's scores for a movie")
    @app_commands.autocomplete(movie=watched_autocomplete)
    async def ratings(self, itx: discord.Interaction, movie: str):
        row = resolve_movie(self.db, movie, watched=True)
        if not row:
            return await itx.response.send_message("Pick a movie we've watched from the list.", ephemeral=True)
        rs = self.db.ratings_for(row["id"])
        me = self.db.upsert_user(itx.user.id, itx.user.display_name)
        if rating_open(self.bot, row["id"]) and not is_mod(itx) and all(r["user_id"] != me for r in rs):
            return await itx.response.send_message(
                f"Give **{label(row)}** your own score first. The others stay hidden until you've rated "
                "or rating closes.", ephemeral=True)
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

        # Everyone gets a button to score it, instead of typing /rate.
        view = discord.ui.View(timeout=None)
        view.add_item(RateButton(row["id"], f"Rate {row['title']}"))
        closes = rating_closes(self.db.last_screening(row["id"])) - dt.timedelta(minutes=1)   # shows as 23:59, not 00:00 the next day
        text = (f"🍿 We watched **{label(row)}**. How was it? Click below to give it a score.\n"
                f"⏰ Rating closes {ts(closes, 'F')} ({ts(closes, 'R')}).\n"
                "-# Scores stay private here so nobody's swayed; see them on the website.")
        rate_channel = self.bot.get_channel(self.bot.cfg.rate_channel_id) if self.bot.cfg.rate_channel_id else None
        if rate_channel and rate_channel.id != itx.channel_id:
            await rate_channel.send(text, view=view)
            await itx.response.send_message(f"Marked **{label(row)}** as watched on {day}. "
                                            f"Posted a Rate button in {rate_channel.mention}.", ephemeral=True)
        else:
            await itx.response.send_message(text, view=view)


async def setup(bot):
    bot.add_dynamic_items(RateButton)
    await bot.add_cog(Ratings(bot))
