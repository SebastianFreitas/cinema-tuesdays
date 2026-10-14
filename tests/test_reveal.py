import tempfile
import unittest
from pathlib import Path

from bot.cogs.reveal import hastings_line, verdict
from bot.db import DB

SITE = "https://example.org/"


class RevealTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = DB(Path(self.tmp.name) / "test.db")
        self.users = [self.db.upsert_user(i, n) for i, n in enumerate(["Ana", "João", "Rita"], 1)]

    def tearDown(self):
        self.db.conn.close()
        self.tmp.cleanup()

    def watched(self, title, scores, remarks=(), year=None):
        """A watched movie scored by Ana, João, Rita in that order."""
        mid = self.db.upsert_movie({"tmdb_id": len(self.db.q("SELECT id FROM movies")) + 1, "title": title, "year": year})
        self.db.add_screening(mid, "2026-01-06")
        for user, score, remark in zip(self.users, scores, list(remarks) + [None] * 3):
            self.db.rate(mid, user, score, remark)
        return mid

    def test_line_rules(self):
        self.assertEqual(hastings_line(3, 6, [5, 9]), "I say! Straight into our top three.")
        self.assertEqual(hastings_line(4, 6, [5, 9]), "Good Lord. Well, they can't all be winners.")
        self.assertEqual(hastings_line(1, 5, [7, 8]), "Remarkable agreement, for once.", "top three needs 6 movies")
        self.assertEqual(hastings_line(2, 5, [3, 7]), "I say, a bit of a split on this one.")
        self.assertIsNone(hastings_line(2, 5, [5, 7]))
        self.assertIsNone(hastings_line(4, 7, [5, 7]), "4th of 7 is neither top nor bottom three")

    def test_message(self):
        mid = self.watched("The Fall", [8, 7.5, 6], ["Gorgeous.", "Too long, but " + "lovely " * 40, None], 2006)
        self.db.add_suggestion(mid, self.users[0])
        self.db.add_suggestion(mid, self.users[2])
        self.watched("Paprika", [9, 9, 8.6])
        lines = verdict(self.db, mid, SITE).split("\n")
        self.assertEqual(lines[0], "**🎬 The verdict: The Fall (2006)**")
        self.assertEqual(lines[1], "Average **7.17** from 3 scores · **#2** of the 2 we've watched "
                                   "(our overall average is 8.02)")
        self.assertEqual(lines[2], "Suggested by **Ana, Rita**")
        self.assertEqual(lines[3], "`8.0` Ana · `7.5` João · `6.0` Rita")
        self.assertTrue(lines[4].startswith('> "Too long, but lovely') and lines[4].endswith('…" — João'))
        self.assertLess(len(lines[4]), 220)
        self.assertEqual(lines[5], '> "Gorgeous." — Ana')
        self.assertEqual(len(lines), 7, "a spread of 2 and only 2 movies: no Hastings line")
        self.assertEqual(lines[-1], f"🌐 Full scores on the website: {SITE}#movie/{mid}")

    def test_no_suggester_no_remarks_no_line(self):
        mid = self.watched("Curated", [5, 7, 7.5])
        lines = verdict(self.db, mid, SITE).split("\n")
        self.assertEqual(len(lines), 4)
        self.assertFalse(any(l.startswith("Suggested by") or l.startswith(">") for l in lines))

    def test_rank_ties_share_the_better_place(self):
        for title in ("A", "B", "C", "D", "E"):
            self.watched(title, [9 if title == "A" else 4] * 3)
        mid = self.watched("F", [4, 4, 4])
        text = verdict(self.db, mid, SITE)
        self.assertIn("**#2** of the 6", text)
        self.assertIn("I say! Straight into our top three.", text)


if __name__ == "__main__":
    unittest.main()
