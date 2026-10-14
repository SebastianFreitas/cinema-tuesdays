import asyncio
import sqlite3
import tempfile
import unittest
from pathlib import Path

from bot import export
from bot.db import DB
from bot.tmdb import TMDB

# Trimmed from a real /movie/{id}?append_to_response=credits reply.
REPLY = {
    "id": 603, "title": "The Matrix", "original_title": "The Matrix", "release_date": "1999-03-31",
    "runtime": 136, "poster_path": "/p.jpg", "backdrop_path": "/b.jpg", "overview": "Neo.",
    "genres": [{"id": 28, "name": "Action"}, {"id": 878, "name": "Science Fiction"}],
    "vote_average": 8.2, "vote_count": 26000, "original_language": "en",
    "production_countries": [{"iso_3166_1": "AU", "name": "Australia"},
                             {"iso_3166_1": "US", "name": "United States of America"}],
    "budget": 63000000, "revenue": 463517383,
    "credits": {
        "cast": [{"id": 6384, "name": "Keanu Reeves", "order": 0}, {"id": 1331, "name": "Hugo Weaving", "order": 3},
                 {"id": 2975, "name": "Laurence Fishburne", "order": 1}, {"id": 530, "name": "Carrie-Anne Moss", "order": 2},
                 {"id": 9364, "name": "Gloria Foster", "order": 4}, {"id": 9372, "name": "Joe Pantoliano", "order": 5}],
        "crew": [{"name": "Lana Wachowski", "job": "Director"}, {"name": "Lilly Wachowski", "job": "Director"}],
    },
}


class FakeTMDB(TMDB):
    def __init__(self, reply):
        super().__init__("key")
        self.reply = reply

    async def _get(self, path, **params):
        return self.reply


class ExtrasTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = DB(Path(self.tmp.name) / "test.db")

    def tearDown(self):
        self.db.conn.close()
        self.tmp.cleanup()

    def details(self, reply):
        return asyncio.run(FakeTMDB(reply).details(reply["id"]))

    def test_details_and_export(self):
        mid = self.db.upsert_movie(self.details(REPLY))
        m = export._movie(self.db.movie(mid))
        self.assertEqual(m["tmdb_rating"], 8.2)
        self.assertEqual(m["tmdb_votes"], 26000)
        self.assertEqual(m["release_date"], "1999-03-31")
        self.assertEqual(m["language"], "en")
        self.assertEqual(m["countries"], ["AU", "US"])
        self.assertEqual((m["budget"], m["revenue"]), (63000000, 463517383))
        self.assertEqual([c["name"] for c in m["cast"]],
                         ["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss", "Hugo Weaving", "Gloria Foster"],
                         "top 5 in billing order")
        self.assertEqual(m["cast"][0]["id"], 6384)

    def test_unknown_values(self):
        reply = {"id": 1, "title": "Obscure", "vote_count": 0, "budget": 0, "revenue": 0}
        m = export._movie(self.db.movie(self.db.upsert_movie(self.details(reply))))
        self.assertEqual(m["tmdb_votes"], 0, "0 votes still counts as fetched")
        self.assertIsNone(m["budget"], "TMDB's 0 means unknown")
        self.assertIsNone(m["revenue"])
        self.assertEqual((m["countries"], m["cast"]), ([], []))

    def test_movie_without_extras(self):
        m = export._movie(self.db.movie(self.db.upsert_movie({"title": "Imported"})))
        self.assertIsNone(m["tmdb_votes"])
        self.assertEqual((m["countries"], m["cast"]), ([], []))

    def test_old_database_gets_the_columns(self):
        path = Path(self.tmp.name) / "old.db"
        c = sqlite3.connect(path)
        c.execute("CREATE TABLE movies (id INTEGER PRIMARY KEY, tmdb_id INTEGER UNIQUE, title TEXT NOT NULL, "
                  "original_title TEXT, year INTEGER, director TEXT, runtime INTEGER, poster_path TEXT, overview TEXT, "
                  "created_at TEXT NOT NULL DEFAULT (datetime('now')))")
        c.execute("INSERT INTO movies (tmdb_id, title) VALUES (603, 'The Matrix')")
        c.commit()
        c.close()
        db = DB(path)
        self.assertEqual([r["tmdb_id"] for r in db.movies_missing_details()], [603], "picked up by the backfill")
        db.upsert_movie(self.details(REPLY))
        self.assertEqual(db.one("SELECT tmdb_votes FROM movies WHERE tmdb_id = 603")[0], 26000)
        self.assertEqual(db.movies_missing_details(), [], "and only once")
        db.conn.close()


if __name__ == "__main__":
    unittest.main()
