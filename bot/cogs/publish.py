"""Periodically exports the database to site/data and pushes it, so GitHub Pages rebuilds."""
import asyncio
import logging

from discord.ext import commands, tasks

from .. import export

log = logging.getLogger("cinema.publish")


class Publish(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        if bot.cfg.publish_enabled:
            self.publish_loop.change_interval(minutes=bot.cfg.publish_interval_minutes)
            self.publish_loop.start()

    async def cog_unload(self):
        self.publish_loop.cancel()

    @tasks.loop(minutes=10)
    async def publish_loop(self):
        if not self.bot.dirty:
            return
        self.bot.dirty = False
        try:
            data = export.build(self.bot.db)
            pushed = await asyncio.to_thread(export.write_and_push, data)
            if pushed:
                log.info("Published site data")
        except Exception:
            self.bot.dirty = True
            log.exception("Publishing failed")

    @publish_loop.before_loop
    async def before(self):
        await self.bot.wait_until_ready()


async def setup(bot):
    await bot.add_cog(Publish(bot))
