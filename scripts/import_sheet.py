"""One-time import of the old "Movie Tuesdays sheet" (Google Sheets > File > Download > CSV, per tab).

    python scripts/import_sheet.py --vistos "Vistos.csv" --fila "Fila.csv" [--dry-run]

Vistos: Data,Filme,Ano,Recomendado por,IMDb,<one column per person>,Media,N notas,Amplitude
        -> a screening per row, every score as a rating, "Recomendado por" as the suggester.
Fila:   Filme,Ano,Sugerido por,IMDb,Estado,Adicionado em
        -> open suggestions.

Movies are matched on TMDB by their IMDb link (falling back to a title search), so TMDB_TOKEN must be
set in .env. Every person becomes an unlinked user; once they're on Discord a moderator runs
/admin link name:<sheet name> member:@them to attach the history.
"""
import argparse
import asyncio
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import config  # noqa: E402
from bot.db import DB  # noqa: E402
from bot.tmdb import TMDB  # noqa: E402
from bot.util import parse_date  # noqa: E402

VISTOS_FIXED = {"Data", "Filme", "Ano", "Recomendado por", "IMDb", "Media", "N notas", "Amplitude"}
NOT_PEOPLE = {"cultured snob pick"}   # "Recomendado por" values that aren't a person


def score(cell: str) -> float | None:
    cell = cell.strip().replace(",", ".")
    try:
        value = float(cell)
    except ValueError:
        return None
    return value if 0 <= value <= 10 else None


def read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(f)]


class Resolver:
    def __init__(self, tmdb: TMDB):
        self.tmdb = tmdb
        self.missing: list[str] = []

    async def movie(self, title: str, year: str, imdb: str) -> dict:
        tmdb_id = None
        if m := re.search(r"tt\d+", imdb):
            found = await self.tmdb._get(f"/find/{m.group()}", external_source="imdb_id")
            if found.get("movie_results"):
                tmdb_id = found["movie_results"][0]["id"]
        if tmdb_id is None:
            results = await self.tmdb.search(title, int(year) if year.isdigit() else None)
            if results:
                tmdb_id = results[0]["id"]
        if tmdb_id is None:
            self.missing.append(title)
            return {"title": title, "year": int(year) if year.isdigit() else None}
        return await self.tmdb.details(tmdb_id)


def save_movie(db: DB, movie: dict) -> int:
    if movie.get("tmdb_id"):
        return db.upsert_movie(movie)
    row = db.one("SELECT id FROM movies WHERE title = ? COLLATE NOCASE", (movie["title"],))
    return row["id"] if row else db.upsert_movie(movie)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vistos", type=Path)
    ap.add_argument("--fila", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg = config.load()
    if not cfg.tmdb_token:
        raise SystemExit("TMDB_TOKEN is not set in .env")
    db = DB(cfg.db_path)
    resolver = Resolver(TMDB(cfg.tmdb_token))

    if args.vistos:
        rows = read(args.vistos)
        people = [h for h in rows[0] if h not in VISTOS_FIXED]
        print(f"Vistos: {len(rows)} movies, people: {', '.join(people)}")
        for row in rows:
            if not row.get("Filme"):
                continue
            movie = await resolver.movie(row["Filme"], row.get("Ano", ""), row.get("IMDb", ""))
            when = parse_date(row["Data"])
            scores = {p: s for p in people if (s := score(row.get(p, ""))) is not None}
            by = row.get("Recomendado por", "")
            print(f"  {when}  {movie['title']} ({movie.get('year')})  by {by or '-'}: {len(scores)} scores")
            if args.dry_run:
                continue
            movie_id = save_movie(db, movie)
            db.add_screening(movie_id, when)
            if by and by.lower() not in NOT_PEOPLE:
                db.add_suggestion(movie_id, db.user_by_name(by, create=True))
            for person, s in scores.items():
                db.rate(movie_id, db.user_by_name(person, create=True), s, None)

    if args.fila:
        rows = [r for r in read(args.fila) if r.get("Filme")]
        print(f"Fila: {len(rows)} suggestions")
        for row in rows:
            movie = await resolver.movie(row["Filme"], row.get("Ano", ""), row.get("IMDb", ""))
            by = row["Sugerido por"]
            print(f"  {movie['title']} ({movie.get('year')})  by {by}")
            if args.dry_run:
                continue
            db.add_suggestion(save_movie(db, movie), db.user_by_name(by, create=True))

    await resolver.tmdb.close()
    if resolver.missing:
        print("Not found on TMDB (imported without poster):", ", ".join(resolver.missing))
    print("Dry run, nothing written." if args.dry_run else "Done.")


if __name__ == "__main__":
    asyncio.run(main())
