"""One-off: Caption Hastings announces the switch from the spreadsheets in #general.

/announce            posts a test copy in the channel you run it in (use #bot-work)
/announce post:True  posts it in #general, or edits the copy already there

Pings @everyone with a still, then two messages (too long for one); the second shows the website's preview card.
Emotes and channels are looked up by name, like /starthere. Can be deleted once it's been posted.
"""
import json
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands

from .starthere import _bare, fill

STILL = Path(__file__).resolve().parent.parent / "assets" / "hastings" / "car.jpg"

MESSAGE_1 = """\
# Goodbye, spreadsheets
Good evening, everyone. :hastings_hello: Caption Arthur Hastings here. I'm new, so do forgive me if I fumble a little.

The moderators asked if I'd lend a hand with the chores that used to live in those spreadsheets, and I was only too glad to. I'm no Poirot, I'm afraid, but I can just about manage a list or two, and I've promised not to lose any of them. Here's how things work from now on.

## Suggesting a film
No more Movie List document. Press **Suggest a movie** on the panel in #start-here, type the title and pick the right one. **My list** shows what you've suggested and lets you take any off.
Still up to **10 each**, mind. I did ask whether we might stretch to eleven, and was told quite firmly that we might not.

## Voting
Same as ever in #movie-night-cartaz, only now I put up the vote.
- You have **2 votes**, for two different films. Press the button for each one you fancy, and press it again if something comes up and you can't make it.
- Only vote if you plan to attend, please; it's only fair.
- Group α and Group ω still take turns, and the Cultured Snobs' pick is still the last option. I've learnt not to argue with the Cultured Snobs."""

MESSAGE_2 = """\
## Scores
No more Movie Ratings sheet. After movie night, press **Rate a movie**, give a score from 0.0 to 10.0 and a remark if you like.
- You have until **23:59 (Portugal) the day after**, and you can change it until then.
- I won't post your score in #rate-movies, only that you've rated. Peeking at other people's scores before they're all in would hardly be cricket.

## [The website]({site})
Every film we've watched, everybody's scores, the full Movie List, and more statistics than I can make head or tail of. :hastings_hmm: Poirot would adore it. It keeps itself up to date.

Everything from the old sheets has been carried over, so nothing is lost. And if I make a muddle of anything, as I daresay I might, do tell one of the moderators.

Right then. See you on Tuesday.

Cheerio,
Hastings"""


class Announce(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.saved = bot.cfg.db_path.parent / "announce.json"  # ids of the messages in #general, for editing

    @app_commands.command(name="announce", description="Post Hastings' announcement (test copy here by default)")
    @app_commands.describe(post="False = test copy in this channel; True = post in #general (edits it if already there)")
    @app_commands.default_permissions(manage_guild=True)
    async def announce(self, itx: discord.Interaction, post: bool = False):
        guild = itx.guild
        await itx.response.defer(ephemeral=True, thinking=True)
        missing: set[str] = set()
        texts = [fill(MESSAGE_1, guild, missing), fill(MESSAGE_2.format(site=self.bot.cfg.site_url), guild, missing)]

        # Pings @everyone in #general; the test copy shows "@everyone" without pinging anybody.
        ping = discord.AllowedMentions(everyone=post, users=False, roles=False)
        if not post:
            target = itx.channel
        else:
            target = next((c for c in guild.text_channels if _bare(c.name) == "general"), None)
            if target is None:
                return await itx.followup.send("Couldn't find #general.")

        if post and (msgs := await self._existing(target)):
            await msgs[1].edit(content=texts[0])
            await msgs[2].edit(content=texts[1])
            done = f"Edited the messages in {target.mention}."
        else:
            sent = [await target.send("@everyone", file=discord.File(STILL), allowed_mentions=ping),
                    await target.send(texts[0], allowed_mentions=discord.AllowedMentions.none()),
                    await target.send(texts[1], allowed_mentions=discord.AllowedMentions.none())]  # the website preview card shows under it
            if post:
                self.saved.write_text(json.dumps({"channel": target.id, "messages": [m.id for m in sent]}))
            done = f"Posted in {target.mention}." + ("" if post else " Run `/announce post:True` to post it in #general.")
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
    await bot.add_cog(Announce(bot))
