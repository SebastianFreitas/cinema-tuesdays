# Cinema Tuesdays

Discord bot (Python, discord.py, SQLite) and static website (`site/`, GitHub Pages) for a weekly movie club. README.md has the commands and the weekly flow.

## Discord: never post
- Never send anything to the Discord server by any method: bot token, REST API, webhook, running the bot, or a script. The user clears public messages with the other mods first, and a wrong post can't be taken back.
- A message that needs sending becomes a bot slash command (like `/announce`) that the user runs.
- Never run the bot on this PC. It only runs on the Pi.
- A PreToolUse hook (`~/.claude/hooks/discord_guard.py`) asks before anything that looks like Discord sending. If it fires, stop and rethink. Don't work around it.

## How the user wants to work
- Do only what was asked. When that piece is done, stop and report. Ask before starting the next item.
- The bot speaks as "Caption Hastings" (how Poirot says "Captain"). Never write "Captain" for him, and never suggest renaming him.
- The user approves every piece of Hastings text before any code that sends it is written. All bot wording lives in `drafts/hastings-script.md` (every line) and `drafts/hastings-messages.md` (one-off announcements), written to the rules in `drafts/hastings-voice.md`.

## Git
- Run `git pull` before changing anything: the Pi pushes site data (`site/data/`) to `main` on its own.
- `.env`, `data/` and `*.db` are private and gitignored. Never commit them.

## Raspberry Pi (runs the bot)
- SSH alias `sdr-pi` (user `claude`, restricted). Allowed: `journalctl -u cinema-bot`, `sudo systemctl restart cinema-bot`, and the git pull below. Nothing else in `/home/traff`.
- Deploy only when the user says so, with exactly this command:
  `ssh sdr-pi "sudo -u traff /usr/bin/git -C /home/traff/CinemaTuesdays pull --ff-only && sudo systemctl restart cinema-bot"`
- After deploying, check `journalctl -u cinema-bot` that the bot logged in.

## Python on Windows
- The venv is `.venv` in the main checkout (`C:\Users\Traff\Desktop\CinemaTuesdays\.venv`). From a worktree under `.claude/worktrees/<name>/` it is `../../../.venv/Scripts/python.exe`.
- Windows has no time zone database, so the venv needs `tzdata` or the bot's imports fail.
- Use `python -X utf8` for scripts that print names or emoji.

## Things auto mode blocks (hand these to the user with exact steps)
- Editing `~/.claude/settings.json` or `~/.claude/hooks/*`.
- Committing or pushing files under `.claude/` in this repo.
- Editing files in the main checkout from a worktree session (reading works).
- The `claude` CLI isn't installed (desktop app only).
