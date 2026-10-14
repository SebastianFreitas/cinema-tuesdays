import discord
from discord import app_commands
from discord.ext import commands


@app_commands.default_permissions(manage_guild=True)
class Admin(commands.GroupCog, group_name="admin", group_description="Data maintenance (moderators)"):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    @app_commands.command(name="link", description="Attach imported spreadsheet history to a member")
    @app_commands.describe(name="The name used in the old spreadsheet", member="The Discord member it belongs to")
    async def link(self, itx: discord.Interaction, name: str, member: discord.Member):
        row = self.db.one("SELECT id FROM users WHERE name = ? COLLATE NOCASE AND discord_id IS NULL", (name,))
        if not row:
            return await itx.response.send_message(f"No unlinked imported person called {name!r}.", ephemeral=True)
        target = self.db.upsert_user(member.id, member.display_name)
        self.db.merge_users(row["id"], target)
        self.bot.mark_dirty()
        await itx.response.send_message(f"Linked **{name}**'s history to {member.mention}.", ephemeral=True)

    @link.autocomplete("name")
    async def link_autocomplete(self, itx: discord.Interaction, current: str):
        rows = self.db.q("SELECT name FROM users WHERE discord_id IS NULL AND name LIKE ? ORDER BY name LIMIT 25",
                         (f"%{current}%",))
        return [app_commands.Choice(name=r["name"], value=r["name"]) for r in rows]


async def setup(bot):
    await bot.add_cog(Admin(bot))
