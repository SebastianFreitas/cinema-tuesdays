"""One-off: the #start-here messages, in Caption Hastings' voice (text approved in drafts/hastings-messages.md).

/starthere            posts a test copy in the channel you run it in (use #bot-work)
/starthere post:True  posts it in #start-here, or edits the copy already there

Posts a still, then two messages; the second carries the panel buttons. Emotes (:hastings_hello:) and channels
(#link) are looked up by name when it posts, and anything not found on the server is listed back to you.
Can be deleted once #start-here is settled.
"""
import json
import re
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands

from .panel import PanelView

STILL = Path(__file__).resolve().parent.parent / "assets" / "hastings" / "portrait-bw.jpg"
BUTTON_EMOTES = {"suggest": "hastings_psst", "mine": "hastings_hmm", "rate": "hastings_quite", "website": "hastings_look"}

MESSAGE_1 = """\
# Welcome to Cinema Tuesdays
Good evening, and welcome. :hastings_hello: Caption Hastings here, just a good chap lending a hand. I'm hardly the cleverest fellow in the room, but I've offered to help keep our little film club in order, and I shall do my very best.

## Movie night
- **Every Tuesday at 21:15**, Portuguese time (Lisbon). The reminders I post show the time in your own timezone.
- We each watch on our own computer, kept in step with **Syncplay** (it works with **VLC**). Installing it is a must: [Syncplay](https://syncplay.pl/download/) · [VLC](https://www.videolan.org/vlc/)
- The download link for the week's film goes up in #link.

## How to use Syncplay
Server: `syncplay.pl:8995` · Username: your nickname · Room: `MovieTuesday`
1. Open Syncplay: a VLC window and a Syncplay window appear.
2. Load the film in VLC (drag it into the window, or Media > Open File).
3. Click **Ready** in Syncplay when you're set.

## Channels
- #start-here, #movie-night-cartaz and #link are notice boards: only the moderators (and I) post there.
- #general: talk about anything.
- #rate-movies: I note down who has rated each film. Longer discussions belong in #general."""

MESSAGE_2 = """\
## Suggesting films
Press **Suggest a movie** below, type a title and pick the right one. **Up to 10 suggestions each.** **My list** shows your suggestions and lets you remove any. The whole Movie List is on the website.

## The weekly vote
- Our regular members are split into **Group α** and **Group ω**, and the two take turns. On your group's week, one film from each member goes into the vote in #movie-night-cartaz. If yours isn't in this week's vote, it will be in the next one.
- The Cultured Snobs add a curated pick, always the **last option**.
- **Only vote if you plan to attend.** You have **2 votes**, for two different films. Press a button to vote; press it again to take that vote back.
- If your suggestion wins, you sit out your group's next vote, so everyone gets a turn. The same goes for the Cultured Snobs: if their pick wins, there's no curated pick for about a month.
- **Birthweek:** in the week of your birthday you may choose the film and skip the vote. Do tell the Cultured Snobs.

## Scores
After movie night, press **Rate a movie** and give the film a score from 0.0 to 10.0, with a remark if you like. Rating stays open until **23:59 (Portugal) the day after** movie night. I don't post your score in the channel, only that you've rated. Everyone's scores go on the website.

## [The website]({site})
Every film we've watched, all the scores, the Movie List, who agrees with whom, and a great many statistics."""


def _bare(name: str) -> str:
    """Channel name without any decoration in front, e.g. '📌┃start-here' -> 'start-here'."""
    return re.sub(r"^[^a-z0-9]+", "", name.lower())


def fill(text: str, guild: discord.Guild, missing: set[str]) -> str:
    """Swaps :emote: and #channel for the real ones on the server; notes any it can't find."""
    def emote(m):
        e = discord.utils.get(guild.emojis, name=m[1])
        if e:
            return str(e)
        missing.add(f":{m[1]}:")
        return m[0]

    def channel(m):
        c = next((c for c in guild.text_channels if _bare(c.name) == m[1]), None)
        if c:
            return c.mention
        missing.add(f"#{m[1]}")
        return m[0]

    text = re.sub(r":(hastings_\w+):", emote, text)
    return re.sub(r"(?<![\w(])#([a-z][a-z-]*)", channel, text)


class StartHere(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.saved = bot.cfg.db_path.parent / "starthere.json"  # ids of the messages in #start-here, for editing

    @app_commands.command(name="starthere", description="Post the #start-here messages (test copy here by default)")
    @app_commands.describe(post="False = test copy in this channel; True = post in #start-here (edits it if already there)")
    @app_commands.default_permissions(manage_guild=True)
    async def starthere(self, itx: discord.Interaction, post: bool = False):
        guild = itx.guild
        await itx.response.defer(ephemeral=True, thinking=True)
        missing: set[str] = set()
        texts = [fill(MESSAGE_1, guild, missing), fill(MESSAGE_2.format(site=self.bot.cfg.site_url), guild, missing)]
        emoji = {k: discord.utils.get(guild.emojis, name=v) for k, v in BUTTON_EMOTES.items()}
        missing |= {f":{BUTTON_EMOTES[k]}:" for k, e in emoji.items() if e is None}
        view = PanelView(self.bot.cfg.site_url, emoji)

        if not post:
            target = itx.channel
        else:
            target = next((c for c in guild.text_channels if _bare(c.name) == "start-here"), None)
            if target is None:
                return await itx.followup.send("Couldn't find #start-here.")

        if post and (msgs := await self._existing(target)):
            await msgs[1].edit(content=texts[0], suppress=True)
            await msgs[2].edit(content=texts[1], view=view, suppress=False)  # keeps the website preview card
            done = f"Edited the messages in {target.mention}."
        else:
            sent = [await target.send(file=discord.File(STILL)),
                    await target.send(texts[0], suppress_embeds=True),
                    await target.send(texts[1], view=view)]  # the website preview card shows under it
            if post:
                self.saved.write_text(json.dumps({"channel": target.id, "messages": [m.id for m in sent]}))
            done = f"Posted in {target.mention}." + ("" if post else " Run `/starthere post:True` to post it in #start-here.")
        if missing:
            done += "\nNot found on the server (shown as plain text): " + ", ".join(sorted(missing))
        await itx.followup.send(done)

    async def _existing(self, channel) -> list[discord.Message] | None:
        """The still and two messages from an earlier post:True, if they're all still there."""
        try:
            saved = json.loads(self.saved.read_text())
            if saved["channel"] != channel.id:
                return None
            return [await channel.fetch_message(i) for i in saved["messages"]]
        except (OSError, ValueError, KeyError, discord.HTTPException):
            return None


async def setup(bot):
    await bot.add_cog(StartHere(bot))
