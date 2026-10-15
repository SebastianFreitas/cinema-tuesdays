"""Run with:  python -m bot"""
import asyncio
import logging

import discord
from discord.ext import commands

from . import config
from .cogs.polls import VoteButton
from .db import DB
from .tmdb import TMDB

log = logging.getLogger("cinema")


class CinemaBot(commands.Bot):
    def __init__(self, cfg: config.Config):
        super().__init__(command_prefix=commands.when_mentioned, intents=discord.Intents.default())
        self.cfg = cfg
        self.db = DB(cfg.db_path)
        self.tmdb = TMDB(cfg.tmdb_token)
        self.dirty = True  # export the site once on startup

    def mark_dirty(self) -> None:
        self.dirty = True

    async def setup_hook(self) -> None:
        for ext in ("suggestions", "polls", "ratings", "panel", "admin", "publish", "reminders", "starthere", "announce", "reveal", "thanks"):
            await self.load_extension(f"bot.cogs.{ext}")
        self.add_dynamic_items(VoteButton)  # poll buttons keep working across restarts

        if self.cfg.guild_id:
            guild = discord.Object(id=self.cfg.guild_id)
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
        else:
            synced = await self.tree.sync()
        log.info("Synced %d slash commands", len(synced))
        self.loop.create_task(self.backfill_movies())
        self.loop.create_task(self.refresh_avatars())

    async def refresh_avatars(self) -> None:
        """Keeps everyone's Discord avatar URL current for the website (server avatar if they set one)."""
        await self.wait_until_ready()
        while not self.is_closed():
            guild = self.get_guild(self.cfg.guild_id) if self.cfg.guild_id else None
            changed = 0
            for row in self.db.q("SELECT id, discord_id FROM users WHERE discord_id IS NOT NULL"):
                try:
                    uid = int(row["discord_id"])
                    who = await guild.fetch_member(uid) if guild else await self.fetch_user(uid)
                    changed += self.db.set_avatar(row["id"], who.display_avatar.with_size(128).url)
                except discord.NotFound:
                    pass
                except Exception:
                    log.warning("Couldn't fetch avatar for user %s", row["discord_id"], exc_info=True)
            if changed:
                log.info("Updated %d avatars", changed)
                self.mark_dirty()
            await asyncio.sleep(6 * 3600)

    async def backfill_movies(self) -> None:
        """Fetch details added in later versions (backdrops, genres, TMDB extras) for movies saved before them."""
        if not self.tmdb.enabled:
            return
        rows = self.db.movies_missing_details()
        for row in rows:
            try:
                self.db.upsert_movie(await self.tmdb.details(row["tmdb_id"]))
            except Exception:
                log.warning("Couldn't refresh TMDB movie %s", row["tmdb_id"], exc_info=True)
        if rows:
            log.info("Refreshed %d movies from TMDB", len(rows))
            self.mark_dirty()

    async def on_ready(self) -> None:
        log.info("Logged in as %s", self.user)

    async def close(self) -> None:
        await self.tmdb.close()
        await super().close()


def main() -> None:
    cfg = config.load()
    if not cfg.discord_token:
        raise SystemExit("DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.")
    discord.utils.setup_logging(level=logging.INFO)
    bot = CinemaBot(cfg)

    @bot.tree.error
    async def on_app_command_error(itx: discord.Interaction, error: discord.app_commands.AppCommandError):
        if isinstance(error, discord.app_commands.MissingPermissions):
            message = "Only moderators can do that."
        else:
            log.exception("Command failed", exc_info=error)
            message = "Something went wrong running that command."
        if itx.response.is_done():
            await itx.followup.send(message, ephemeral=True)
        else:
            await itx.response.send_message(message, ephemeral=True)

    bot.run(cfg.discord_token, log_handler=None)


if __name__ == "__main__":
    main()
