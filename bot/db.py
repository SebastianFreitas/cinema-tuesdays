import sqlite3
from pathlib import Path

SCHEMA = Path(__file__).with_name("schema.sql")

# Movies with at least one screening are "watched"; open suggestions are for unwatched movies.
# Movie columns added after the first release, with their types.
MOVIE_EXTRAS = {
    "backdrop_path": "TEXT", "genres": "TEXT", "tmdb_rating": "REAL", "tmdb_votes": "INTEGER",
    "release_date": "TEXT", "language": "TEXT", "countries": "TEXT", "budget": "INTEGER", "revenue": "INTEGER",
    "top_cast": "TEXT",
}

WATCHED = "EXISTS (SELECT 1 FROM screenings s WHERE s.movie_id = m.id)"


class DB:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        # Votes used to be one per person (key: poll_id, user_id); now it's two, so the key includes movie_id.
        if self.one("SELECT 1 FROM pragma_table_info('poll_votes') WHERE name = 'movie_id' AND pk = 0"):
            with self.conn:
                self.conn.execute("ALTER TABLE poll_votes RENAME TO poll_votes_old")
                self.conn.executescript(SCHEMA.read_text(encoding="utf-8"))
                self.conn.execute("INSERT INTO poll_votes SELECT poll_id, user_id, movie_id FROM poll_votes_old")
                self.conn.execute("DROP TABLE poll_votes_old")
        self.conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        # Columns added after the first release.
        have = {r["name"] for r in self.q("PRAGMA table_info(movies)")}
        for col, kind in MOVIE_EXTRAS.items():
            if col not in have:
                self.conn.execute(f"ALTER TABLE movies ADD COLUMN {col} {kind}")
        if "avatar" not in {r["name"] for r in self.q("PRAGMA table_info(users)")}:
            self.conn.execute("ALTER TABLE users ADD COLUMN avatar TEXT")

    # -- low level -----------------------------------------------------------

    def q(self, sql: str, params=()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchall()

    def one(self, sql: str, params=()) -> sqlite3.Row | None:
        return self.conn.execute(sql, params).fetchone()

    def run(self, sql: str, params=()) -> int:
        with self.conn:
            return self.conn.execute(sql, params).lastrowid

    # -- users ---------------------------------------------------------------

    def upsert_user(self, discord_id: int, name: str) -> int:
        row = self.one("SELECT id FROM users WHERE discord_id = ?", (str(discord_id),))
        if row:
            self.run("UPDATE users SET name = ? WHERE id = ?", (name, row["id"]))
            return row["id"]
        return self.run("INSERT INTO users (discord_id, name) VALUES (?, ?)", (str(discord_id), name))

    def set_avatar(self, user_id: int, url: str | None) -> bool:
        """Saves a user's avatar URL. Returns True if it changed."""
        cur = self.conn.execute("UPDATE users SET avatar = ? WHERE id = ? AND avatar IS NOT ?", (url, user_id, url))
        self.conn.commit()
        return cur.rowcount > 0

    def user_by_name(self, name: str, create: bool = False) -> int | None:
        row = self.one("SELECT id FROM users WHERE name = ? COLLATE NOCASE", (name,))
        if row:
            return row["id"]
        return self.run("INSERT INTO users (name) VALUES (?)", (name,)) if create else None

    def merge_users(self, from_id: int, into_id: int) -> None:
        """Move an imported (unlinked) user's history onto a real Discord user."""
        with self.conn:
            for table in ("ratings", "suggestions", "poll_votes"):
                self.conn.execute(f"UPDATE OR IGNORE {table} SET user_id = ? WHERE user_id = ?", (into_id, from_id))
                self.conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (from_id,))
            self.conn.execute("DELETE FROM users WHERE id = ?", (from_id,))

    # -- movies --------------------------------------------------------------

    def upsert_movie(self, m: dict) -> int:
        cols = ("tmdb_id", "title", "original_title", "year", "director", "runtime", "poster_path", "backdrop_path",
                "genres", "overview", "tmdb_rating", "tmdb_votes", "release_date", "language", "countries", "budget",
                "revenue", "top_cast")
        values = tuple(m.get(c) for c in cols)
        if m.get("tmdb_id") is None:
            return self.run(f"INSERT INTO movies ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", values)
        updates = ", ".join(f"{c} = excluded.{c}" for c in cols[1:])
        with self.conn:
            return self.conn.execute(
                f"INSERT INTO movies ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))}) "
                f"ON CONFLICT (tmdb_id) DO UPDATE SET {updates} RETURNING id",
                values,
            ).fetchone()["id"]

    def movies_missing_details(self) -> list[sqlite3.Row]:
        """TMDB movies saved before a version that stores more details (genres, then the TMDB extras)."""
        return self.q("SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL AND (genres IS NULL OR tmdb_votes IS NULL)")

    def movie(self, movie_id: int) -> sqlite3.Row | None:
        return self.one("SELECT * FROM movies WHERE id = ?", (movie_id,))

    def search_movies(self, text: str, *, watched: bool | None = None, suggested_by: int | None = None,
                      limit: int = 25) -> list[sqlite3.Row]:
        where, params = ["m.title LIKE ?"], [f"%{text}%"]
        if watched is True:
            where.append(WATCHED)
        elif watched is False:
            where.append(f"NOT {WATCHED}")
        if suggested_by is not None:
            where.append("EXISTS (SELECT 1 FROM suggestions g WHERE g.movie_id = m.id AND g.user_id = ?)")
            params.append(suggested_by)
        return self.q(
            f"SELECT m.* FROM movies m WHERE {' AND '.join(where)} ORDER BY m.title LIMIT ?",
            (*params, limit),
        )

    def last_screening(self, movie_id: int) -> str | None:
        row = self.one("SELECT MAX(watched_on) AS d FROM screenings WHERE movie_id = ?", (movie_id,))
        return row["d"] if row else None

    def add_screening(self, movie_id: int, watched_on: str) -> None:
        self.run("INSERT OR IGNORE INTO screenings (movie_id, watched_on) VALUES (?, ?)", (movie_id, watched_on))

    # -- suggestions ---------------------------------------------------------

    def open_suggestions(self, user_id: int | None = None) -> list[sqlite3.Row]:
        sql = (
            "SELECT m.*, u.name AS suggested_by, u.id AS user_id, g.created_at AS suggested_at "
            "FROM suggestions g JOIN movies m ON m.id = g.movie_id JOIN users u ON u.id = g.user_id "
            f"WHERE NOT {WATCHED}"
        )
        if user_id is not None:
            return self.q(sql + " AND g.user_id = ? ORDER BY g.created_at", (user_id,))
        return self.q(sql + " ORDER BY g.created_at")

    def add_suggestion(self, movie_id: int, user_id: int) -> bool:
        with self.conn:
            cur = self.conn.execute(
                "INSERT OR IGNORE INTO suggestions (movie_id, user_id) VALUES (?, ?)", (movie_id, user_id)
            )
            return cur.rowcount > 0

    def remove_suggestion(self, movie_id: int, user_id: int) -> bool:
        with self.conn:
            return self.conn.execute(
                "DELETE FROM suggestions WHERE movie_id = ? AND user_id = ?", (movie_id, user_id)
            ).rowcount > 0

    def suggesters(self, movie_id: int) -> list[str]:
        return [r["name"] for r in self.q(
            "SELECT u.name FROM suggestions g JOIN users u ON u.id = g.user_id WHERE g.movie_id = ? "
            "ORDER BY g.created_at", (movie_id,))]

    # -- ratings -------------------------------------------------------------

    def rate(self, movie_id: int, user_id: int, score: float, remark: str | None) -> bool:
        """Insert or update a rating. Returns True if it replaced an existing one."""
        existed = self.one("SELECT 1 FROM ratings WHERE movie_id = ? AND user_id = ?", (movie_id, user_id))
        self.run(
            "INSERT INTO ratings (movie_id, user_id, score, remark) VALUES (?, ?, ?, ?) "
            "ON CONFLICT (movie_id, user_id) DO UPDATE SET score = excluded.score, remark = excluded.remark, "
            "updated_at = datetime('now')",
            (movie_id, user_id, score, remark),
        )
        return existed is not None

    def ratings_for(self, movie_id: int) -> list[sqlite3.Row]:
        return self.q(
            "SELECT r.*, u.name FROM ratings r JOIN users u ON u.id = r.user_id WHERE r.movie_id = ? "
            "ORDER BY r.score DESC", (movie_id,))

    # -- groups (poll rotation) ----------------------------------------------

    def set_group(self, user_id: int, grp: str | None) -> None:
        self.run("UPDATE users SET grp = ? WHERE id = ?", (grp, user_id))

    def group_members(self, grp: str) -> list[sqlite3.Row]:
        return self.q("SELECT * FROM users WHERE grp = ? ORDER BY name COLLATE NOCASE", (grp,))

    def set_benched(self, user_ids, benched: bool) -> None:
        with self.conn:
            self.conn.executemany("UPDATE users SET benched = ? WHERE id = ?", [(int(benched), u) for u in user_ids])

    def next_group(self) -> str:
        """Groups alternate; birthweek picks don't use up a group's turn."""
        last = self.one("SELECT grp FROM polls WHERE kind = 'vote' AND grp IS NOT NULL ORDER BY id DESC LIMIT 1")
        return "omega" if last and last["grp"] == "alpha" else "alpha"

    # -- polls ---------------------------------------------------------------

    def create_poll(self, movie_ids: list[int], grp: str | None, curated_id: int | None = None,
                    note: str | None = None) -> int:
        options = [(mid, 0) for mid in movie_ids if mid != curated_id]
        if curated_id:
            options.append((curated_id, 1))
        with self.conn:
            poll_id = self.conn.execute("INSERT INTO polls (grp, note) VALUES (?, ?)", (grp, note)).lastrowid
            self.conn.executemany(
                "INSERT INTO poll_options (poll_id, movie_id, position, curated) VALUES (?, ?, ?, ?)",
                [(poll_id, mid, i, cur) for i, (mid, cur) in enumerate(options)],
            )
        return poll_id

    def create_pick(self, movie_id: int, picked_by: int | None) -> int:
        """Birthweek override: a closed 'poll' whose winner was chosen directly."""
        return self.run(
            "INSERT INTO polls (status, kind, picked_by, winner_movie_id, closed_at) "
            "VALUES ('closed', 'pick', ?, ?, datetime('now'))", (picked_by, movie_id))

    def cancel_poll(self, poll_id: int) -> None:
        self.run("DELETE FROM polls WHERE id = ?", (poll_id,))

    def set_poll_message(self, poll_id: int, channel_id: int, message_id: int) -> None:
        self.run("UPDATE polls SET channel_id = ?, message_id = ? WHERE id = ?",
                 (str(channel_id), str(message_id), poll_id))

    def open_poll(self) -> sqlite3.Row | None:
        return self.one("SELECT * FROM polls WHERE status = 'open' ORDER BY id DESC LIMIT 1")

    def poll(self, poll_id: int) -> sqlite3.Row | None:
        return self.one("SELECT * FROM polls WHERE id = ?", (poll_id,))

    def poll_tally(self, poll_id: int) -> list[dict]:
        options = self.q(
            "SELECT m.*, o.curated FROM poll_options o JOIN movies m ON m.id = o.movie_id WHERE o.poll_id = ? "
            "ORDER BY o.position", (poll_id,))
        votes = self.q(
            "SELECT v.movie_id, u.name FROM poll_votes v JOIN users u ON u.id = v.user_id WHERE v.poll_id = ?",
            (poll_id,))
        voters: dict[int, list[str]] = {}
        for v in votes:
            voters.setdefault(v["movie_id"], []).append(v["name"])
        return [{"movie": o, "curated": bool(o["curated"]), "voters": sorted(voters.get(o["id"], []))}
                for o in options]

    def toggle_vote(self, poll_id: int, user_id: int, movie_id: int, max_votes: int = 2) -> bool | None:
        """Returns True if the user now votes for movie_id, False if that vote was removed,
        None if they've already used all their votes on other movies."""
        with self.conn:
            removed = self.conn.execute("DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND movie_id = ?",
                                        (poll_id, user_id, movie_id)).rowcount
        if removed:
            return False
        used = self.one("SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id = ? AND user_id = ?", (poll_id, user_id))["n"]
        if used >= max_votes:
            return None
        self.run("INSERT INTO poll_votes (poll_id, user_id, movie_id) VALUES (?, ?, ?)", (poll_id, user_id, movie_id))
        return True

    def close_poll(self, poll_id: int, winner_movie_id: int | None) -> list[str]:
        """Closes the poll. Unless the curated option won, everyone who suggested the winner
        sits out their group's next poll. Returns their names."""
        self.run("UPDATE polls SET status = 'closed', winner_movie_id = ?, closed_at = datetime('now') WHERE id = ?",
                 (winner_movie_id, poll_id))
        # Whoever sat this vote out has served their turn.
        grp = self.one("SELECT grp FROM polls WHERE id = ?", (poll_id,))["grp"]
        if grp:
            self.run("UPDATE users SET benched = 0 WHERE grp = ?", (grp,))
        option = self.one("SELECT curated FROM poll_options WHERE poll_id = ? AND movie_id = ?",
                          (poll_id, winner_movie_id))
        if not option or option["curated"]:
            return []
        rows = self.q("SELECT u.id, u.name FROM suggestions g JOIN users u ON u.id = g.user_id WHERE g.movie_id = ?",
                      (winner_movie_id,))
        self.set_benched([r["id"] for r in rows], True)
        return [r["name"] for r in rows]

    def next_up(self) -> sqlite3.Row | None:
        """Winner of the most recent closed poll, if it hasn't been screened since."""
        return self.one(
            "SELECT m.*, p.closed_at FROM polls p JOIN movies m ON m.id = p.winner_movie_id "
            "WHERE p.status = 'closed' AND NOT EXISTS ("
            "  SELECT 1 FROM screenings s WHERE s.movie_id = m.id AND s.watched_on >= date(p.closed_at)) "
            "ORDER BY p.id DESC LIMIT 1")
