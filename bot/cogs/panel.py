"""A pinned message with buttons, so nobody has to type slash commands:
Suggest a movie, My list (see / remove your suggestions), Rate a movie, and a link to the website."""
import datetime as dt

import discord
from discord import app_commands
from discord.ext import commands

from ..util import LISBON, label, movie_embed, movie_from_tmdb, next_screening, ts
from .ratings import is_mod, open_rate_form, rating_closes
from .suggestions import add_for, announcement


def short_date(iso: str) -> str:
    return dt.date.fromisoformat(iso).strftime("%d %b").lstrip("0")


# -- suggest ---------------------------------------------------------------------

class SuggestModal(discord.ui.Modal, title="Suggest a movie"):
    query = discord.ui.TextInput(label="Movie title", placeholder="e.g. The Fall", max_length=100)
    year = discord.ui.TextInput(label="Year (optional, helps with remakes)", placeholder="e.g. 2006",
                                required=False, max_length=4)

    async def on_submit(self, itx: discord.Interaction):
        bot = itx.client
        await itx.response.defer(ephemeral=True, thinking=True)
        year = int(self.year.value) if self.year.value.strip().isdigit() else None
        try:
            results = await bot.tmdb.search(self.query.value.strip(), year)
            if not results and year:
                results = await bot.tmdb.search(self.query.value.strip())
        except Exception:
            return await itx.followup.send("Couldn't reach TMDB just now. Try again in a minute.")
        if not results:
            return await itx.followup.send(f"Nothing found for **{self.query.value}**. Check the spelling?")
        await itx.followup.send("Which one is it?", view=PickMovie(results[:10]))


class PickMovie(discord.ui.View):
    def __init__(self, results: list[dict]):
        super().__init__(timeout=600)
        options = []
        for r in results:
            year = (r.get("release_date") or "")[:4]
            name = f"{r['title']} ({year})" if year else r["title"]
            about = r.get("overview") or r.get("original_title") or ""
            options.append(discord.SelectOption(label=name[:100], value=str(r["id"]),
                                                description=(about[:97] + "…") if len(about) > 100 else about or None))
        self.pick.options = options

    @discord.ui.select(placeholder="Pick the right movie…")
    async def pick(self, itx: discord.Interaction, select: discord.ui.Select):
        bot = itx.client
        await itx.response.defer()
        row = await movie_from_tmdb(bot, select.values[0])
        message, others = add_for(bot, itx.user, row)
        await itx.edit_original_response(content=message, embed=movie_embed(row), view=None)
        if others is not None and itx.channel:
            await itx.channel.send(announcement(itx.user, others), embed=movie_embed(row),
                                   allowed_mentions=discord.AllowedMentions.none())


# -- my list ---------------------------------------------------------------------

def my_list(bot, user: discord.abc.User) -> tuple[discord.Embed, discord.ui.View]:
    user_id = bot.db.upsert_user(user.id, user.display_name)
    rows = bot.db.open_suggestions(user_id)
    cap = bot.cfg.max_suggestions
    lines = [f"{i}. **{label(r)}**" + (f" · {r['director']}" if r["director"] else "") for i, r in enumerate(rows, 1)]
    embed = discord.Embed(title=f"Your Movie List · {len(rows)}/{cap}",
                          description="\n".join(lines) or "Nothing yet. Add your first one with ➕ Suggest.",
                          color=discord.Color.gold())
    if rows:
        embed.set_footer(text="Pick a movie below to remove it.")
    return embed, MyListView(user_id, rows, full=len(rows) >= cap)


class MyListView(discord.ui.View):
    def __init__(self, user_id: int, rows, full: bool):
        super().__init__(timeout=600)
        self.user_id = user_id
        if rows:
            self.remove.options = [discord.SelectOption(label=label(r)[:100], value=str(r["id"])) for r in rows[:25]]
        else:
            self.remove_item(self.remove)
        self.add_more.disabled = full

    @discord.ui.select(placeholder="Remove a movie…")
    async def remove(self, itx: discord.Interaction, select: discord.ui.Select):
        bot = itx.client
        bot.db.remove_suggestion(int(select.values[0]), self.user_id)
        bot.mark_dirty()
        embed, view = my_list(bot, itx.user)
        title = bot.db.movie(int(select.values[0]))["title"]
        await itx.response.edit_message(content=f"Removed **{title}**.", embed=embed, view=view)

    @discord.ui.button(label="Suggest another", emoji="➕", style=discord.ButtonStyle.secondary)
    async def add_more(self, itx: discord.Interaction, button: discord.ui.Button):
        await itx.response.send_modal(SuggestModal())


# -- rate ------------------------------------------------------------------------

class PickWatched(discord.ui.View):
    def __init__(self, bot, user_id: int, mod: bool):
        super().__init__(timeout=600)
        now = dt.datetime.now(LISBON)
        rows = bot.db.q(
            "SELECT m.id, m.title, m.year, MAX(s.watched_on) AS seen, r.score FROM movies m "
            "JOIN screenings s ON s.movie_id = m.id "
            "LEFT JOIN ratings r ON r.movie_id = m.id AND r.user_id = ? "
            "GROUP BY m.id ORDER BY seen DESC LIMIT 25", (user_id,))
        self.pick.options = [discord.SelectOption(
            label=label(r)[:100], value=str(r["id"]),
            description=f"Watched {short_date(r['seen'])} · "
                        + (f"you gave it {r['score']:.1f}" if r["score"] is not None else "not rated yet"))
            for r in rows if not r["seen"].startswith("1970") and (mod or now < rating_closes(r["seen"]))]

    @discord.ui.select(placeholder="Which movie?")
    async def pick(self, itx: discord.Interaction, select: discord.ui.Select):
        await open_rate_form(itx, int(select.values[0]))


# -- the panel -------------------------------------------------------------------

class PanelView(discord.ui.View):
    """Persistent: the buttons keep working after restarts because their custom_ids are fixed."""

    def __init__(self, site_url: str, emoji: dict | None = None):
        """emoji: optional icons by button name (suggest, mine, rate, website); None leaves the defaults,
        a missing name means no icon."""
        super().__init__(timeout=None)
        if emoji is not None:
            self.suggest.emoji, self.mine.emoji, self.rate.emoji = emoji.get("suggest"), emoji.get("mine"), emoji.get("rate")
        self.add_item(discord.ui.Button(label="Website", emoji="🌐" if emoji is None else emoji.get("website"),
                                        url=site_url))

    @discord.ui.button(label="Suggest a movie", emoji="➕", style=discord.ButtonStyle.success, custom_id="panel:suggest")
    async def suggest(self, itx: discord.Interaction, button: discord.ui.Button):
        await itx.response.send_modal(SuggestModal())

    @discord.ui.button(label="My list", emoji="📋", style=discord.ButtonStyle.secondary, custom_id="panel:mine")
    async def mine(self, itx: discord.Interaction, button: discord.ui.Button):
        embed, view = my_list(itx.client, itx.user)
        await itx.response.send_message(embed=embed, view=view, ephemeral=True)

    @discord.ui.button(label="Rate a movie", emoji="⭐", style=discord.ButtonStyle.primary, custom_id="panel:rate")
    async def rate(self, itx: discord.Interaction, button: discord.ui.Button):
        bot = itx.client
        view = PickWatched(bot, bot.db.upsert_user(itx.user.id, itx.user.display_name), is_mod(itx))
        if not view.pick.options:
            return await itx.response.send_message(
                "Nothing to rate right now. Rating opens after movie night and closes at midnight (Portugal) the next day.",
                ephemeral=True)
        await itx.response.send_message("Which movie do you want to rate?", view=view, ephemeral=True)


def panel_embed(bot) -> discord.Embed:
    cap = bot.cfg.max_suggestions
    return discord.Embed(
        title="🎬 Cinema Tuesdays",
        description=(
            f"Movie night is every **Tuesday at {ts(next_screening(), 't')}** your time "
            "(21:15 in Portugal). Use the buttons below, no commands needed.\n\n"
            f"➕ **Suggest a movie**: type a title and pick the right one. Up to {cap} each.\n"
            "📋 **My list**: see your suggestions and remove any.\n"
            "⭐ **Rate a movie**: score the latest movie, 0.0 to 10.0, until midnight (Portugal) the day after. "
            "Only you see your score.\n"
            "🌐 **Website**: everything we've watched, the stats and the full Movie List.\n\n"
            "-# Each week one group's suggestions go to the vote. Only you see your own list."),
        color=discord.Color.gold())


class Panel(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="panel", description="Post the Movie List buttons in this channel (moderators)")
    @app_commands.default_permissions(manage_messages=True)
    async def panel(self, itx: discord.Interaction):
        await itx.channel.send(embed=panel_embed(self.bot), view=PanelView(self.bot.cfg.site_url))
        await itx.response.send_message("Posted. Pin it so people can find it.", ephemeral=True)


async def setup(bot):
    bot.add_view(PanelView(bot.cfg.site_url))
    await bot.add_cog(Panel(bot))
