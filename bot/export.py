"""Turns the database into site/data/data.json, with all stats precomputed for the website."""
import datetime as dt
import itertools
import json
import statistics
import subprocess

from .config import ROOT
from .db import DB, WATCHED
from .tmdb import movie_url, poster_url

OUT = ROOT / "site" / "data" / "data.json"
MIN_RATINGS_DIVISIVE = 3   # a movie needs this many scores to be "divisive"
MIN_SHARED_PAIRS = 3       # two people need this many movies in common to compare them


def _movie(m) -> dict:
    return {
        "id": m["id"], "title": m["title"], "original_title": m["original_title"], "year": m["year"],
        "director": m["director"], "runtime": m["runtime"], "overview": m["overview"],
        "poster": poster_url(m["poster_path"]), "tmdb": movie_url(m["tmdb_id"]),
    }


def build(db: DB) -> dict:
    users = {r["id"]: r["name"] for r in db.q("SELECT id, name FROM users")}
    ratings = db.q("SELECT * FROM ratings")
    by_movie: dict[int, list] = {}
    by_user: dict[int, dict[int, float]] = {}
    for r in ratings:
        by_movie.setdefault(r["movie_id"], []).append(r)
        by_user.setdefault(r["user_id"], {})[r["movie_id"]] = r["score"]

    movie_avg = {mid: statistics.mean(r["score"] for r in rs) for mid, rs in by_movie.items()}

    # -- watched movies ------------------------------------------------------
    watched = []
    for m in db.q(f"SELECT m.* FROM movies m WHERE {WATCHED}"):
        dates = [r["watched_on"] for r in db.q(
            "SELECT watched_on FROM screenings WHERE movie_id = ? ORDER BY watched_on", (m["id"],))]
        rs = sorted(by_movie.get(m["id"], []), key=lambda r: -r["score"])
        scores = [r["score"] for r in rs]
        entry = _movie(m) | {
            "watched_on": dates,
            "suggested_by": db.suggesters(m["id"]),
            "ratings": [{"name": users[r["user_id"]], "score": r["score"], "remark": r["remark"]} for r in rs],
            "avg": round(statistics.mean(scores), 2) if scores else None,
            "stdev": round(statistics.pstdev(scores), 2) if len(scores) > 1 else None,
            "min": min(scores, default=None), "max": max(scores, default=None),
        }
        watched.append(entry)
    watched.sort(key=lambda e: e["watched_on"][-1], reverse=True)

    # -- people --------------------------------------------------------------
    people = []
    for uid, scores in by_user.items():
        values = list(scores.values())
        # How far above/below the group average this person scores, on average.
        bias = statistics.mean(s - movie_avg[mid] for mid, s in scores.items())
        fav = max(scores, key=scores.get)
        least = min(scores, key=scores.get)
        people.append({
            "name": users[uid], "count": len(values), "avg": round(statistics.mean(values), 2),
            "bias": round(bias, 2),
            "favourite": {"title": db.movie(fav)["title"], "score": scores[fav]},
            "least": {"title": db.movie(least)["title"], "score": scores[least]},
        })
    people.sort(key=lambda p: -p["count"])

    # -- pairwise disagreement ----------------------------------------------
    pairs = []
    for a, b in itertools.combinations(by_user, 2):
        shared = by_user[a].keys() & by_user[b].keys()
        if len(shared) < MIN_SHARED_PAIRS:
            continue
        gaps = [(abs(by_user[a][m] - by_user[b][m]), m) for m in shared]
        biggest = max(gaps)
        pairs.append({
            "a": users[a], "b": users[b], "shared": len(shared),
            "mean_gap": round(statistics.mean(g for g, _ in gaps), 2),
            "biggest": {"title": db.movie(biggest[1])["title"], "gap": round(biggest[0], 1),
                        "a": by_user[a][biggest[1]], "b": by_user[b][biggest[1]]},
        })
    pairs.sort(key=lambda p: -p["mean_gap"])

    # -- what's next ---------------------------------------------------------
    by_suggestion: dict[int, dict] = {}
    for s in db.open_suggestions():
        by_suggestion.setdefault(s["id"], _movie(s) | {"suggested_by": []})["suggested_by"].append(s["suggested_by"])
    next_up = db.next_up()
    open_poll = db.open_poll()

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "next_up": _movie(next_up) if next_up else None,
        "poll": [{"title": t["movie"]["title"], "votes": len(t["voters"])} for t in db.poll_tally(open_poll["id"])]
        if open_poll else None,
        "watched": watched,
        "people": people,
        "pairs": pairs,
        "suggestions": sorted(by_suggestion.values(), key=lambda m: m["title"].lower()),
    }


def write(data: dict) -> bool:
    """Write data.json; returns True if the content changed (ignoring the timestamp)."""
    def strip(d):
        return {k: v for k, v in d.items() if k != "generated_at"}

    if OUT.exists():
        try:
            if strip(json.loads(OUT.read_text(encoding="utf-8"))) == strip(data):
                return False
        except json.JSONDecodeError:
            pass
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return True


def write_and_push(data: dict) -> bool:
    if not write(data):
        return False
    rel = OUT.relative_to(ROOT).as_posix()

    def git(*args):
        subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True)

    git("add", rel)
    git("commit", "-m", "Update site data", "--", rel)
    git("push")
    return True
