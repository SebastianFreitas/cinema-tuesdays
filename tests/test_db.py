import sqlite3
import tempfile
import unittest
from pathlib import Path

from bot.db import DB, SCHEMA


class PollTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = DB(Path(self.tmp.name) / "test.db")
        self.u1, self.u2 = self.db.upsert_user(1, "A"), self.db.upsert_user(2, "B")
        self.db.set_group(self.u1, "alpha")
        self.db.set_group(self.u2, "alpha")
        self.m = [self.db.upsert_movie({"tmdb_id": i, "title": f"M{i}"}) for i in range(1, 5)]
        self.db.add_suggestion(self.m[0], self.u1)
        self.poll = self.db.create_poll(self.m[:3], "alpha", curated_id=self.m[2])

    def tearDown(self):
        self.db.conn.close()
        self.tmp.cleanup()

    def benched(self, user_id):
        return self.db.one("SELECT benched FROM users WHERE id = ?", (user_id,))[0]

    def test_two_votes_each_and_toggling(self):
        db, p, m, u = self.db, self.poll, self.m, self.u1
        self.assertIs(db.toggle_vote(p, u, m[0]), True)
        self.assertIs(db.toggle_vote(p, u, m[1]), True)
        self.assertIsNone(db.toggle_vote(p, u, m[2]), "a third vote is refused")
        self.assertIs(db.toggle_vote(p, u, m[1]), False, "clicking again removes the vote")
        self.assertIs(db.toggle_vote(p, u, m[2]), True, "the freed slot can be used")

    def test_curated_option_is_last(self):
        last = self.db.poll_tally(self.poll)[-1]
        self.assertTrue(last["curated"])
        self.assertEqual(last["movie"]["id"], self.m[2])

    def test_groups_alternate(self):
        self.assertEqual(self.db.next_group(), "omega")

    def test_winner_suggester_sits_out_once(self):
        db = self.db
        self.assertEqual(db.close_poll(self.poll, self.m[0]), ["A"])
        self.assertEqual(self.benched(self.u1), 1)
        self.assertEqual(db.next_up()["id"], self.m[0])
        db.add_screening(self.m[0], "2099-01-01")
        self.assertIsNone(db.next_up(), "next_up clears after the screening")
        p2 = db.create_poll(self.m[1:3], "alpha", curated_id=self.m[2])
        self.assertEqual(db.close_poll(p2, self.m[2]), [], "a curated win benches nobody")
        self.assertEqual(self.benched(self.u1), 0, "sitting out ends after the group's next poll")


class MigrationTests(unittest.TestCase):
    def test_old_one_vote_table_is_migrated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "old.db"
            c = sqlite3.connect(path)
            c.executescript(SCHEMA.read_text(encoding="utf-8").replace(
                "PRIMARY KEY (poll_id, user_id, movie_id)", "PRIMARY KEY (poll_id, user_id)"))
            c.execute("INSERT INTO users (id, name) VALUES (1, 'x')")
            c.execute("INSERT INTO movies (id, title) VALUES (1, 't')")
            c.execute("INSERT INTO polls (id) VALUES (1)")
            c.execute("INSERT INTO poll_votes VALUES (1, 1, 1)")
            c.commit()
            c.close()
            db = DB(path)
            self.assertEqual(db.one("SELECT COUNT(*) FROM poll_votes")[0], 1, "votes are kept")
            self.assertIs(db.toggle_vote(1, 1, 1), False)
            db.conn.close()


if __name__ == "__main__":
    unittest.main()
