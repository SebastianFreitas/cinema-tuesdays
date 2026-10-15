# Cinema Tuesdays

Discord bot + website for our Tuesday movie nights. It replaces the Movie List doc and the Movie Ratings sheet.

```
bot/        Discord bot (Python, discord.py) and SQLite database
scripts/    export_site.py (DB -> site JSON), import_sheet.py (old spreadsheet -> DB)
site/       Static website, deployed to GitHub Pages from site/
data/       cinema.db lives here (not committed)
```

## Commands

| Command | Who | What |
|---|---|---|
| `/panel` | mods | Posts the button panel (➕ Suggest a movie, 📋 My list, ⭐ Rate a movie, 🌐 Website) in the current channel. Pin it. Everyone can use the buttons instead of commands. |
| `/suggest movie` | everyone | Adds a movie to the Movie List (TMDB search as you type). Max 10 open suggestions each. |
| `/unsuggest movie` | everyone | Removes one of your suggestions. |
| `/suggestions [member]` | everyone | Shows the Movie List, or one person's picks. |
| `/rate movie score [remark]` | everyone | Scores a watched movie 0.0–10.0, posts it in #rate-movies. Run again to change it. |
| `/ratings movie` | everyone | Everyone's scores and remarks for a movie. |
| `/poll open [curated] [group] [per_person] [movies]` | mods | Posts the vote in #movie-night-cartaz for whichever group's week it is: one random suggestion per group member, plus the Cultured Snobs' `curated` pick as the last option. One vote per person; click again to remove it. |
| `/poll close` | mods | Closes the vote and announces the winner (ties picked at random). Whoever suggested the winner sits out their group's next poll. |
| `/poll cancel` | mods | Deletes the open vote without a winner. Doesn't use up the group's turn. |
| `/poll pick member movie` | mods | Birthweek: the birthday person's pick replaces the vote. Doesn't use up a group's turn. |
| `/group set member group` | mods | Puts someone in Group α or Group ω. |
| `/group sitout member [sitting_out]` | mods | Makes someone sit out their group's next vote (e.g. their pick won a vote held outside the bot). `sitting_out:False` undoes it. Clears itself when that vote closes. |
| `/group list` | everyone | Shows both groups, who's sitting out, and whose week is next. |
| `/watched [movie] [date]` | mods | Marks a movie as watched (defaults to the vote winner, today). Unlocks `/rate`. |
| `/reveal [movie] [post]` | mods | Once everyone has rated, posts a movie's scores in #rate-movies: average, place among everything we've watched, every score and up to three remarks (defaults to the last movie watched). Without `post:True` it only shows you a private preview. |
| `/thanks [post]` | admins | Posts Hastings' thank-you (a still and one line) as a test copy in the channel you run it in; `post:True` posts it in #general. For when members say something nice. |
| `/admin link name member` | admins | Attaches imported spreadsheet history to a Discord member. |

Mod commands are hidden from people without *Manage Messages* (or *Manage Server* for `/admin`). Change that under Server Settings > Integrations > Cinema bot.

## Weekly flow (Rotation of the Polls)

People are split into **Group α** and **Group ω**, which take turns each week.

1. People `/suggest` whenever they like (max 10 each).
2. A mod runs `/poll open curated:<movie>`. The bot works out whose week it is, picks one movie from each member of that group (skipping anyone whose pick won last time), and adds the curated option last.
3. A mod runs `/poll close` before Tuesday. Birthweek? Use `/poll pick` instead.
   - Tuesday 21:00 (Portugal), the bot posts a Caption Hastings reminder for the winner in #general by itself (set `GENERAL_CHANNEL_ID` in `.env`). The texts and pictures are in `bot/cogs/reminders.py` and `bot/assets/hastings/`.
4. After the screening a mod runs `/watched`; everyone runs `/rate`.

First-time setup: assign everyone with `/group set` (α: João, Giotara, Miguelbnz, Irene_TC, Shaggy; ω: Traff, Toni, Malhas, Slader, Fili).

## Setup

### 1. Discord bot
1. https://discord.com/developers/applications > New Application ("Cinema Tuesdays").
2. **Bot** tab: Reset Token, copy it into `.env` as `DISCORD_TOKEN`. No privileged intents are needed.
3. **OAuth2 > URL Generator**: scopes `bot` + `applications.commands`; permissions *Send Messages*, *Embed Links*, *Read Message History*. Open the URL and add it to the server.
4. In Discord, enable Developer Mode (User Settings > Advanced) and copy the server ID and the channel IDs for #movie-night-cartaz and #rate-movies into `.env`.
5. The bot's role needs permission to post in #movie-night-cartaz and #rate-movies (they're moderator-only).

### 2. TMDB
Free account at themoviedb.org > Settings > API. Copy the "API Read Access Token" into `TMDB_TOKEN`.

### 3. Run
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/Pi: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env            # then fill it in
python -m bot
```

Tests: `python -m unittest` from the repo root.

### 4. Website
Push this repo to GitHub, then Settings > Pages > Source: **GitHub Actions**. The workflow deploys `site/` on every push.

To update the site data by hand: `python scripts/export_site.py --push`.
To let the bot do it automatically, set `PUBLISH_ENABLED=true` in `.env` on the machine running it (that machine needs `git push` access).

Preview locally: `python -m http.server -d site 8000` and open http://localhost:8000.

### 5. Import the old spreadsheet
Download the sheet's *Vistos* and *Fila* tabs as CSV (File > Download > CSV), then:
```bash
python scripts/import_sheet.py --vistos Vistos.csv --fila Fila.csv --dry-run   # check it reads correctly
python scripts/import_sheet.py --vistos Vistos.csv --fila Fila.csv
```
Then link each spreadsheet name to a Discord member with `/admin link`.

## Running 24/7
The Raspberry Pi works well: clone the repo, set up `.env`, and run it as a systemd service:

```ini
# /etc/systemd/system/cinema-bot.service
[Unit]
Description=Cinema Tuesdays bot
After=network-online.target

[Service]
WorkingDirectory=/home/pi/CinemaTuesdays
ExecStart=/home/pi/CinemaTuesdays/.venv/bin/python -m bot
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now cinema-bot`, logs with `journalctl -u cinema-bot -f`.

Back up `data/cinema.db`: it's the only copy of the data (the site JSON is a full export, so it doubles as a backup).
