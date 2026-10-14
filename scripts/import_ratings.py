"""One-time import of the old Movie Ratings spreadsheet.

Export the sheet as CSV (File > Download > CSV) with one row per movie and one column per person:

    Movie,Year,Date,Traff,Giotara,Molhos,...
    Perfect Days,2023,2026-03-10,8.4,7.5,,...

"Year" and "Date" are optional (dates may be YYYY-MM-DD or DD/MM/YYYY). Scores may use a comma
(8,4). Empty cells are skipped. Every person column becomes an unlinked user; once they're on
Discord, a moderator runs  /admin link name:<column name> member:@them  to attach the history.

    python scripts/import_ratings.py ratings.csv [--tmdb] [--dry-run]

--tmdb looks every title up on TMDB for posters/directors (needs TMDB_TOKEN in .env).
"""
import argparse
import asyncio
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import config  # noqa: E402
from bot.db import DB  # noqa: E402
from bot.tmdb import TMDB  # noqa: E402
from bot.util import parse_date  # noqa: E402

TITLE_COLS = {"movie", "title", "filme", "film"}
YEAR_COLS = {"year", "ano"}
DATE_COLS = {"date", "data", "watched", "watched on"}


def score(cell: str) -> float | None:
    cell = cell.strip().replace(",", ".")
    try:
        value = float(cell)
    except ValueError:
        return None
    return value if 0 <= value <= 10 else None


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", type=Path)
    ap.add_argument("--tmdb", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg = config.load()
    db = DB(cfg.db_path)
    tmdb = TMDB(cfg.tmdb_token) if args.tmdb else None

    with args.csv.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit("Empty CSV")
    headers = list(rows[0].keys())
    title_col = next((h for h in headers if h.strip().lower() in TITLE_COLS), headers[0])
    year_col = next((h for h in headers if h.strip().lower() in YEAR_COLS), None)
    date_col = next((h for h in headers if h.strip().lower() in DATE_COLS), None)
    people = [h for h in headers if h not in (title_col, year_col, date_col) and h.strip()]
    print(f"Title column: {title_col!r}; people: {', '.join(people)}")

    imported = 0
    for row in rows:
        title = (row.get(title_col) or "").strip()
        if not title:
            continue
        year = int(row[year_col]) if year_col and (row.get(year_col) or "").strip().isdigit() else None
        movie = {"title": title, "year": year}
        if tmdb:
            results = await tmdb.search(title, year)
            if results:
                movie = await tmdb.details(results[0]["id"])
            else:
                print(f"  ! not found on TMDB: {title}")
        scores = {p: s for p in people if (s := score(row.get(p) or "")) is not None}
        when = parse_date(row[date_col]) if date_col and (row.get(date_col) or "").strip() else "1970-01-01"
        print(f"  {movie['title']} ({movie.get('year') or '?'}) {when}: {len(scores)} scores")
        if args.dry_run:
            continue

        existing = db.one("SELECT id FROM movies WHERE tmdb_id = ?", (movie["tmdb_id"],)) if movie.get("tmdb_id") \
            else db.one("SELECT id FROM movies WHERE title = ? COLLATE NOCASE", (title,))
        movie_id = existing["id"] if existing else db.upsert_movie(movie)
        db.add_screening(movie_id, when)
        for person, s in scores.items():
            db.rate(movie_id, db.user_by_name(person.strip(), create=True), s, None)
        imported += 1

    if tmdb:
        await tmdb.close()
    print(f"Imported {imported} movies." if not args.dry_run else "Dry run, nothing written.")


if __name__ == "__main__":
    asyncio.run(main())
