"""Caption Hastings thanks everyone for kind words.

/thanks            posts a test copy in the channel you run it in (use #bot-work)
/thanks post:True  posts it in #general

A still, then one message. Written to be reused whenever members say something nice.
"""
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands

from .starthere import _bare

STILL = Path(__file__).resolve().parent.parent / "assets" / "hastings" / "oh-well.jpg"

MESSAGE = """
Thank you, everyone.

The moderators will pretend they aren't pleased, but I've seen them, and they are.

The Cultured Snobs are hard at work making Cinema Tuesdays better still. If you've an idea for how, do tell one of the moderators; they're always glad to hear it.

See you on Tuesday.
Cheerio,
Hastings"""


class Thanks(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="thanks", description="Hastings thanks everyone for the kind words (test copy here by default)")
    @app_commands.describe(post="False = test copy in this channel; True = post in #general")
    @app_commands.default_permissions(manage_guild=True)
    async def thanks(self, itx: discord.Interaction, post: bool = False):
        await itx.response.defer(ephemeral=True, thinking=True)
        if not post:
            target = itx.channel
        else:
            target = next((c for c in itx.guild.text_channels if _bare(c.name) == "general"), None)
            if target is None:
                return await itx.followup.send("Couldn't find #general.")
        await target.send(file=discord.File(STILL))
        await target.send(MESSAGE, allowed_mentions=discord.AllowedMentions.none())
        await itx.followup.send(f"Posted in {target.mention}." + ("" if post else " Run `/thanks post:True` to post it in #general."))


async def setup(bot):
    await bot.add_cog(Thanks(bot))
