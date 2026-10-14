-- Cinema Tuesdays database. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    discord_id  TEXT UNIQUE,              -- NULL for people imported from the old spreadsheet until linked
    name        TEXT NOT NULL,
    grp         TEXT CHECK (grp IN ('alpha', 'omega')),   -- poll rotation group
    benched     INTEGER NOT NULL DEFAULT 0                -- 1 = had a winner, skips their group's next poll
);

CREATE TABLE IF NOT EXISTS movies (
    id              INTEGER PRIMARY KEY,
    tmdb_id         INTEGER UNIQUE,
    title           TEXT NOT NULL,
    original_title  TEXT,
    year            INTEGER,
    director        TEXT,
    runtime         INTEGER,
    poster_path     TEXT,
    overview        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suggestions (
    movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (movie_id, user_id)
);

-- A movie counts as "watched" once it has a screening.
CREATE TABLE IF NOT EXISTS screenings (
    id          INTEGER PRIMARY KEY,
    movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    watched_on  TEXT NOT NULL,            -- YYYY-MM-DD
    UNIQUE (movie_id, watched_on)
);

CREATE TABLE IF NOT EXISTS ratings (
    movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score       REAL NOT NULL CHECK (score BETWEEN 0 AND 10),
    remark      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (movie_id, user_id)
);

CREATE TABLE IF NOT EXISTS polls (
    id               INTEGER PRIMARY KEY,
    channel_id       TEXT,
    message_id       TEXT,
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    kind             TEXT NOT NULL DEFAULT 'vote' CHECK (kind IN ('vote', 'pick')),  -- pick = birthweek override
    grp              TEXT CHECK (grp IN ('alpha', 'omega')),                         -- whose week it was
    picked_by        INTEGER REFERENCES users(id),                                   -- birthweek person
    note             TEXT,                                                           -- shown under the poll
    winner_movie_id  INTEGER REFERENCES movies(id),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at        TEXT
);

CREATE TABLE IF NOT EXISTS poll_options (
    poll_id   INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    movie_id  INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    position  INTEGER NOT NULL,
    curated   INTEGER NOT NULL DEFAULT 0,    -- the Cultured Snobs' pick, always listed last
    PRIMARY KEY (poll_id, movie_id)
);

-- One vote per person per poll; changing your vote replaces it, clicking again removes it.
CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id   INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movie_id  INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    PRIMARY KEY (poll_id, user_id)
);
