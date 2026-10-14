import discord
from discord import app_commands
from discord.ext import commands

from ..util import choices, label, movie_embed, movie_from_tmdb, resolve_movie, tmdb_choices


def add_for(bot, user: discord.abc.User, row) -> tuple[str, list[str] | None]:
    """Add a movie to someone's suggestions, following the club's rules.
    Returns (message for them, other people who suggested it), or (reason, None) if it wasn't added."""
    db, cap = bot.db, bot.cfg.max_suggestions
    user_id = db.upsert_user(user.id, user.display_name)
    if watched_on := db.last_screening(row["id"]):
        return f"We already watched **{label(row)}** on {watched_on}.", None
    mine = db.open_suggestions(user_id)
    if any(s["id"] == row["id"] for s in mine):
        return f"**{label(row)}** is already on your list.", None
    if len(mine) >= cap:
        return (f"You already have {len(mine)}/{cap} suggestions. "
                "Remove one first (📋 My list, or `/unsuggest`)."), None
    others = db.suggesters(row["id"])
    db.add_suggestion(row["id"], user_id)
    bot.mark_dirty()
    return f"Added **{label(row)}**. You now have {len(mine) + 1}/{cap} suggestions.", others


def announcement(user: discord.abc.User, others: list[str]) -> str:
    note = f"Suggested by {user.mention}"
    if others:
        note += f" (also suggested by {', '.join(others)})"
    return note


class Suggestions(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    @app_commands.command(name="suggest", description="Add a movie to the Movie List")
    @app_commands.describe(movie="Start typing a title and pick it from the list")
    async def suggest(self, itx: discord.Interaction, movie: str):
        await itx.response.defer(ephemeral=True, thinking=True)
        try:
            row = await movie_from_tmdb(self.bot, movie)
        except LookupError as e:
            return await itx.followup.send(str(e))
        if not row:
            return await itx.followup.send(f"Couldn't find **{movie}** on TMDB. Try picking from the list.")

        message, others = add_for(self.bot, itx.user, row)
        await itx.followup.send(message)
        if others is not None:
            await itx.followup.send(announcement(itx.user, others), embed=movie_embed(row), ephemeral=False,
                                    allowed_mentions=discord.AllowedMentions.none())

    @suggest.autocomplete("movie")
    async def suggest_autocomplete(self, itx: discord.Interaction, current: str):
        return await tmdb_choices(self.bot, current)

    @app_commands.command(name="unsuggest", description="Remove one of your suggestions")
    async def unsuggest(self, itx: discord.Interaction, movie: str):
        user_id = self.db.upsert_user(itx.user.id, itx.user.display_name)
        row = resolve_movie(self.db, movie, suggested_by=user_id, watched=False)
        if not row or not self.db.remove_suggestion(row["id"], user_id):
            return await itx.response.send_message("That isn't one of your open suggestions.", ephemeral=True)
        self.bot.mark_dirty()
        await itx.response.send_message(f"Removed **{label(row)}** from your suggestions.", ephemeral=True)

    @unsuggest.autocomplete("movie")
    async def unsuggest_autocomplete(self, itx: discord.Interaction, current: str):
        user_id = self.db.upsert_user(itx.user.id, itx.user.display_name)
        return choices(self.db.search_movies(current, suggested_by=user_id, watched=False))

    @app_commands.command(name="suggestions", description="Show the Movie List, or one person's suggestions")
    @app_commands.describe(member="Only show this person's suggestions")
    async def suggestions(self, itx: discord.Interaction, member: discord.Member | None = None):
        if member:
            rows = self.db.open_suggestions(self.db.upsert_user(member.id, member.display_name))
            title = f"{member.display_name}'s suggestions ({len(rows)}/{self.bot.cfg.max_suggestions})"
            lines = [f"• {label(r)}" for r in rows]
        else:
            rows = self.db.open_suggestions()
            title = f"Movie List ({len({r['id'] for r in rows})} movies)"
            by_movie: dict[int, tuple] = {}
            for r in rows:
                by_movie.setdefault(r["id"], (r, []))[1].append(r["suggested_by"])
            lines = [f"• **{label(r)}** — {', '.join(names)}" for r, names in by_movie.values()]

        text = "\n".join(lines) or "Nothing here yet. Use `/suggest`."
        if len(text) > 4000:
            text = text[:4000].rsplit("\n", 1)[0] + "\n…"
        await itx.response.send_message(embed=discord.Embed(title=title, description=text,
                                                            color=discord.Color.dark_red()), ephemeral=True)


async def setup(bot):
    await bot.add_cog(Suggestions(bot))
