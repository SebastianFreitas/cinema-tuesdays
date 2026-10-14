"""Movie night reminder: 15 minutes before the screening, Caption Hastings posts a still and a line in #general.

Runs by itself every Tuesday. The film is this week's vote winner (or birthweek pick); if there isn't one,
nothing is posted. The version rotates weekly so the same one doesn't come round twice in a row.
"""
import datetime as dt
import logging
from pathlib import Path

import discord
from discord.ext import commands, tasks

from ..util import LISBON, SCREENING_TIME, label, lisbon, ts

log = logging.getLogger("cinema.reminders")

STILLS = Path(__file__).resolve().parent.parent / "assets" / "hastings"
REMIND_AT = dt.time(21, 0, tzinfo=LISBON)  # 15 minutes before SCREENING_TIME

# (still, text). {movie} = the winning film, {time} = 21:15 as a Discord timestamp (shown in each reader's own time).
REMINDERS = [
    ("car.jpg", "Hop in! **{movie}** starts in 15 minutes, at {time}. Don't worry, I won't go over 80."),
    ("goodlord.jpg", "Good Lord, is that the time? **{movie}** starts in 15 minutes, at {time}."),
    ("siesta.jpg", "Up you get, I've only just finished my siesta myself. **{movie}** starts in 15 minutes, at {time}."),
    ("oh-well.jpg", "**{movie}** starts in 15 minutes, at {time}. What a good night for a film, eh?"),
    ("psst.jpg", "A word in your ear: **{movie}** starts in 15 minutes, at {time}."),
    ("golf.jpg", "Fifteen minutes to tee off. **{movie}** at {time}."),
    ("teaspoon.jpg", "Kettle on, I'd say. **{movie}** starts in 15 minutes, at {time}."),
    ("desert-car.jpg", "Fifteen minutes, everyone. **{movie}** at {time}. "
                       "Do be punctual; Poirot would never let me hear the end of it."),
]


def tonights_movie(db):
    """This week's winner: the latest vote winner or birthweek pick, not yet watched, decided in the last week."""
    movie = db.next_up()
    if not movie or not movie["closed_at"]:
        return None
    closed = dt.datetime.fromisoformat(movie["closed_at"]).replace(tzinfo=dt.timezone.utc)
    return movie if dt.datetime.now(dt.timezone.utc) - closed < dt.timedelta(days=7) else None


def reminder_for(day: dt.date, movie) -> tuple[Path, str]:
    still, text = REMINDERS[day.toordinal() // 7 % len(REMINDERS)]
    return STILLS / still, text.format(movie=label(movie), time=ts(lisbon(day, SCREENING_TIME), "t"))


class Reminders(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        if bot.cfg.general_channel_id:
            self.remind.start()
        else:
            log.info("GENERAL_CHANNEL_ID not set; movie night reminders are off")

    async def cog_unload(self):
        self.remind.cancel()

    @tasks.loop(time=REMIND_AT)
    async def remind(self):
        today = dt.datetime.now(LISBON).date()
        if today.weekday() != 1:  # Tuesdays only
            return
        movie = tonights_movie(self.bot.db)
        if not movie:
            log.info("No winner for tonight; skipping the reminder")
            return
        channel = self.bot.get_channel(self.bot.cfg.general_channel_id)
        if channel is None:
            log.warning("Reminder channel %s not found", self.bot.cfg.general_channel_id)
            return
        still, text = reminder_for(today, movie)
        await channel.send(file=discord.File(still))  # the picture first, then Hastings speaks
        await channel.send(text)

    @remind.before_loop
    async def before(self):
        await self.bot.wait_until_ready()


async def setup(bot):
    await bot.add_cog(Reminders(bot))
