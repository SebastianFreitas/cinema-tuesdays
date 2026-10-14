"""Weekly vote, following the Rotation of the Polls rules:

1. People are split into Group α and Group ω; the groups alternate weekly and only the
   current group's suggestions go into the poll.
2. If a movie you suggested wins, you sit out your group's next poll.
3. Birthweek: the birthday person picks the movie and the poll is skipped (/poll pick).
4. The Cultured Snobs add a curated option, always listed last.
"""
import datetime as dt
import random
import re

import discord
from discord import app_commands
from discord.ext import commands

from ..tmdb import movie_url, poster_url
from ..util import GROUPS, SCREENING_TIME, label, lisbon, movie_from_tmdb, tmdb_choices, ts

MAX_OPTIONS = 9   # + the header card = Discord's 10-embed limit
GROUP_CHOICES = [app_commands.Choice(name=v, value=k) for k, v in GROUPS.items()]


def _tuesday_after(created_at: str) -> dt.date:
    day = dt.date.fromisoformat(created_at[:10])
    return day + dt.timedelta(days=(1 - day.weekday()) % 7)


def _vote_bar(n: int, total: int, width: int = 8) -> str:
    filled = round(width * n / total) if total else 0
    return "▰" * filled + "▱" * (width - filled)


def poll_embeds(db, poll_id: int) -> list[discord.Embed]:
    """A header card plus one card per movie (poster, details, votes). Discord allows 10 embeds."""
    poll = db.poll(poll_id)
    tally = db.poll_tally(poll_id)
    closed = poll["status"] == "closed"
    total = sum(len(t["voters"]) for t in tally)

    when = ts(lisbon(_tuesday_after(poll["created_at"]), SCREENING_TIME), "F")
    title = "🎬 Movie night vote" + (f" · {GROUPS[poll['grp']]}" if poll["grp"] else "")
    if closed:
        desc = f"Voting is closed for **{when}**."
    else:
        desc = (f"Pick what we watch on **{when}** (your time).\n"
                "Two votes each, for different films, only if you're coming. Click a vote again to remove it.")
    if poll["note"]:
        desc += f"\n-# {poll['note']}"
    header = discord.Embed(title=title, description=desc,
                           color=discord.Color.greyple() if closed else discord.Color.gold())
    header.set_footer(text=f"{total} vote{'s' if total != 1 else ''} so far" if not closed
                      else f"{total} vote{'s' if total != 1 else ''}")
    embeds = [header]

    for i, t in enumerate(tally, 1):
        m, voters = t["movie"], t["voters"]
        won = closed and m["id"] == poll["winner_movie_id"]
        details = [m["director"]]
        if m["runtime"]:
            details.append(f"{m['runtime'] // 60}h{m['runtime'] % 60:02d}")
        if m["genres"]:
            details.append(", ".join(m["genres"].split(", ")[:3]))
        lines = []
        if d := " · ".join(x for x in details if x):
            lines.append(f"-# {d}")
        if t["curated"]:
            lines.append("🎩 Cultured Snobs' pick")
        elif suggested := ", ".join(db.suggesters(m["id"])):
            lines.append(f"Suggested by **{suggested}**")
        if voters:
            lines.append(f"`{_vote_bar(len(voters), total)}` **{len(voters)}** · {', '.join(voters)}")
        else:
            lines.append(f"`{_vote_bar(0, total)}` no votes yet")
        color = (discord.Color.green() if won else discord.Color.dark_grey() if closed
                 else discord.Color.purple() if t["curated"] else discord.Color.gold())
        e = discord.Embed(title=f"{'🏆 ' if won else ''}{'🎩' if t['curated'] else f'{i}.'} {label(m)}",
                          url=movie_url(m["tmdb_id"]), description="\n".join(lines), color=color)
        if m["poster_path"]:
            e.set_thumbnail(url=poster_url(m["poster_path"], "w185"))
        embeds.append(e)
    return embeds


def poll_view(db, poll_id: int) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    for i, t in enumerate(db.poll_tally(poll_id), 1):
        prefix = "🎩 " if t["curated"] else f"{i}. "
        view.add_item(VoteButton(poll_id, t["movie"]["id"], prefix + t["movie"]["title"]))
    return view


class VoteButton(discord.ui.DynamicItem[discord.ui.Button], template=r"poll:(?P<poll>\d+):(?P<movie>\d+)"):
    def __init__(self, poll_id: int, movie_id: int, text: str | None = None):
        super().__init__(discord.ui.Button(
            label=(text or "Vote")[:80], style=discord.ButtonStyle.secondary,
            custom_id=f"poll:{poll_id}:{movie_id}"))
        self.poll_id = poll_id
        self.movie_id = movie_id

    @classmethod
    async def from_custom_id(cls, interaction, item, match: re.Match[str], /):
        return cls(int(match["poll"]), int(match["movie"]), item.label)

    async def callback(self, itx: discord.Interaction):
        db = itx.client.db
        poll = db.poll(self.poll_id)
        if not poll or poll["status"] != "open":
            return await itx.response.send_message("This vote is closed.", ephemeral=True)
        user_id = db.upsert_user(itx.user.id, itx.user.display_name)
        voted = db.toggle_vote(self.poll_id, user_id, self.movie_id)
        if voted is None:
            return await itx.response.send_message(
                "You've used both your votes. Click one of them again to take it back.", ephemeral=True)
        itx.client.mark_dirty()
        await itx.response.edit_message(embeds=poll_embeds(db, self.poll_id))
        title = db.movie(self.movie_id)["title"]
        await itx.followup.send(f"Voted for **{title}**." if voted else f"Removed your vote for **{title}**.",
                                ephemeral=True)


@app_commands.default_permissions(manage_messages=True)
class Polls(commands.GroupCog, group_name="poll", group_description="Weekly movie vote (moderators)"):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    def _channel(self, channel_id=None, fallback=None):
        channel_id = channel_id or self.bot.cfg.cartaz_channel_id
        return (self.bot.get_channel(int(channel_id)) if channel_id else None) or fallback

    async def _retire_message(self, poll, fallback) -> None:
        """Re-render a poll message as closed and drop its buttons."""
        channel = self._channel(poll["channel_id"], fallback)
        try:
            msg = await channel.fetch_message(int(poll["message_id"]))
            await msg.edit(embeds=poll_embeds(self.db, poll["id"]), view=None)
        except (discord.HTTPException, TypeError, AttributeError):
            pass

    @app_commands.command(name="open", description="Post this week's vote (rotates between Group α and Group ω)")
    @app_commands.describe(
        curated="The Cultured Snobs' pick, added as the last option",
        group="Override whose week it is (normally alternates automatically)",
        per_person="How many movies each group member gets in the poll (default 1)",
        movies="Skip the rotation and use these Movie List titles, separated by ;")
    @app_commands.choices(group=GROUP_CHOICES)
    async def open(self, itx: discord.Interaction, curated: str | None = None,
                   group: app_commands.Choice[str] | None = None,
                   per_person: app_commands.Range[int, 1, 3] = 1, movies: str | None = None):
        if self.db.open_poll():
            return await itx.response.send_message("There's already an open vote. Close it with `/poll close`.",
                                                   ephemeral=True)
        await itx.response.defer(ephemeral=True, thinking=True)

        curated_row = None
        if curated:
            try:
                curated_row = await movie_from_tmdb(self.bot, curated)
            except LookupError as e:
                return await itx.followup.send(str(e))
            if not curated_row:
                return await itx.followup.send(f"Couldn't find the curated pick **{curated}** on TMDB.")

        grp = group.value if group else self.db.next_group()
        note = None
        if movies:
            pool = {r["id"]: r for r in self.db.open_suggestions()}
            picked, missing = [], []
            for title in (t.strip() for t in movies.split(";") if t.strip()):
                hit = next((m for m in pool.values() if m["title"].lower() == title.lower()), None) \
                    or next((m for m in pool.values() if title.lower() in m["title"].lower()), None)
                (picked.append(hit["id"]) if hit else missing.append(title))
            if missing:
                return await itx.followup.send(f"Not on the Movie List: {', '.join(missing)}")
            movie_ids = list(dict.fromkeys(picked))
            grp = group.value if group else None
        else:
            members = self.db.group_members(grp)
            if not members:
                return await itx.followup.send(
                    f"Nobody is in {GROUPS[grp]} yet. Assign people with `/group set`.")
            benched = [m for m in members if m["benched"]]
            movie_ids = []
            for m in random.sample(members, len(members)):
                if m["benched"]:
                    continue
                own = [s["id"] for s in self.db.open_suggestions(m["id"]) if s["id"] not in movie_ids]
                movie_ids += random.sample(own, min(per_person, len(own)))
            if benched:
                note = f"Sitting out this week (their pick won last time): {', '.join(m['name'] for m in benched)}"

        if curated_row:
            movie_ids = [m for m in movie_ids if m != curated_row["id"]]
        movie_ids = movie_ids[:MAX_OPTIONS - (1 if curated_row else 0)]
        if len(movie_ids) + (1 if curated_row else 0) < 2:
            return await itx.followup.send(
                f"Not enough movies for a vote ({GROUPS.get(grp, 'that selection')} has "
                f"{len(movie_ids)} eligible suggestion{'s' if len(movie_ids) != 1 else ''}).")

        poll_id = self.db.create_poll(movie_ids, grp, curated_row["id"] if curated_row else None, note)
        channel = self._channel(fallback=itx.channel)
        msg = await channel.send(embeds=poll_embeds(self.db, poll_id), view=poll_view(self.db, poll_id))
        self.db.set_poll_message(poll_id, channel.id, msg.id)
        self.bot.mark_dirty()
        await itx.followup.send(f"Vote posted: {msg.jump_url}")

    @open.autocomplete("curated")
    async def curated_autocomplete(self, itx: discord.Interaction, current: str):
        return await tmdb_choices(self.bot, current)

    @app_commands.command(name="close", description="Close the vote and announce the winner")
    async def close(self, itx: discord.Interaction):
        poll = self.db.open_poll()
        if not poll:
            return await itx.response.send_message("No open vote.", ephemeral=True)
        tally = self.db.poll_tally(poll["id"])
        top = max(len(t["voters"]) for t in tally)
        leaders = [t["movie"] for t in tally if len(t["voters"]) == top]
        winner = random.choice(leaders) if top > 0 else None
        benched = self.db.close_poll(poll["id"], winner["id"] if winner else None)
        self.bot.mark_dirty()
        await self._retire_message(poll, itx.channel)

        if not winner:
            return await itx.response.send_message("Vote closed with no votes.", ephemeral=True)
        text = f"🎬 This Tuesday we're watching **{label(winner)}** with {top} vote{'s' if top != 1 else ''}"
        if len(leaders) > 1:
            text += f" (tie between {', '.join(m['title'] for m in leaders)}, picked at random)"
        text += ". Download link in #link."
        if benched:
            text += f"\n-# {', '.join(benched)} will sit out their group's next poll."
        await self._channel(poll["channel_id"], itx.channel).send(text)
        await itx.response.send_message("Closed.", ephemeral=True)

    @app_commands.command(name="cancel", description="Delete the open vote without a winner (doesn't use up the group's turn)")
    async def cancel(self, itx: discord.Interaction):
        poll = self.db.open_poll()
        if not poll:
            return await itx.response.send_message("No open vote.", ephemeral=True)
        try:
            msg = await self._channel(poll["channel_id"], itx.channel).fetch_message(int(poll["message_id"]))
            await msg.edit(content="~~Vote cancelled.~~", embeds=[], view=None)
        except (discord.HTTPException, TypeError, AttributeError):
            pass
        self.db.cancel_poll(poll["id"])
        self.bot.mark_dirty()
        await itx.response.send_message("Vote cancelled. Nothing changed in the rotation.", ephemeral=True)

    @app_commands.command(name="pick", description="Birthweek: the birthday person picks the movie, no vote")
    @app_commands.describe(member="Whose birthweek it is", movie="The movie they picked")
    async def pick(self, itx: discord.Interaction, member: discord.Member, movie: str):
        await itx.response.defer(ephemeral=True, thinking=True)
        try:
            row = await movie_from_tmdb(self.bot, movie)
        except LookupError as e:
            return await itx.followup.send(str(e))
        if not row:
            return await itx.followup.send(f"Couldn't find **{movie}** on TMDB.")

        # A birthweek pick replaces this week's vote, and doesn't use up that group's turn.
        if open_poll := self.db.open_poll():
            channel = self._channel(open_poll["channel_id"], itx.channel)
            try:
                msg = await channel.fetch_message(int(open_poll["message_id"]))
                await msg.edit(content="~~Vote cancelled: birthweek pick this week.~~", embeds=[], view=None)
            except (discord.HTTPException, TypeError, AttributeError):
                pass
            self.db.cancel_poll(open_poll["id"])

        self.db.create_pick(row["id"], self.db.upsert_user(member.id, member.display_name))
        self.bot.mark_dirty()
        await self._channel(fallback=itx.channel).send(
            f"🎂 It's {member.mention}'s birthweek! They picked **{label(row)}** for this Tuesday. "
            "Download link in #link.",
            allowed_mentions=discord.AllowedMentions(users=[member]))
        await itx.followup.send("Done.")

    @pick.autocomplete("movie")
    async def pick_autocomplete(self, itx: discord.Interaction, current: str):
        return await tmdb_choices(self.bot, current)


class Groups(commands.GroupCog, group_name="group", group_description="Poll rotation groups"):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    @app_commands.command(name="set", description="Put a member in Group α or Group ω (moderators)")
    @app_commands.checks.has_permissions(manage_messages=True)
    @app_commands.choices(group=GROUP_CHOICES + [app_commands.Choice(name="No group", value="none")])
    async def set(self, itx: discord.Interaction, member: discord.Member, group: app_commands.Choice[str]):
        user_id = self.db.upsert_user(member.id, member.display_name)
        self.db.set_group(user_id, None if group.value == "none" else group.value)
        self.bot.mark_dirty()
        await itx.response.send_message(f"{member.mention} → **{group.name}**", ephemeral=True)

    @app_commands.command(name="sitout", description="Make someone sit out (or not) their group's next vote (moderators)")
    @app_commands.describe(member="Who", sitting_out="True = skip their group's next vote; False = undo")
    @app_commands.checks.has_permissions(manage_messages=True)
    async def sitout(self, itx: discord.Interaction, member: discord.Member, sitting_out: bool = True):
        user_id = self.db.upsert_user(member.id, member.display_name)
        grp = self.db.one("SELECT grp FROM users WHERE id = ?", (user_id,))["grp"]
        self.db.set_benched([user_id], sitting_out)
        self.bot.mark_dirty()
        if not sitting_out:
            text = f"{member.mention} is back in their group's next vote."
        elif grp:
            text = f"{member.mention} sits out {GROUPS[grp]}'s next vote. It clears itself once that vote closes."
        else:
            text = f"{member.mention} is marked as sitting out, but they're not in a group yet (`/group set`)."
        await itx.response.send_message(text, ephemeral=True)

    @app_commands.command(name="list", description="Show both groups and whose week is next")
    async def list(self, itx: discord.Interaction):
        embed = discord.Embed(title="Poll rotation", color=discord.Color.dark_red())
        for key, name in GROUPS.items():
            members = self.db.group_members(key)
            value = "\n".join(m["name"] + (" *(sitting out next)*" if m["benched"] else "") for m in members)
            embed.add_field(name=name, value=value or "—", inline=True)
        embed.set_footer(text=f"Next vote: {GROUPS[self.db.next_group()]}")
        await itx.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(Polls(bot))
    await bot.add_cog(Groups(bot))
