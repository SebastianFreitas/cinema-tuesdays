# Stats to add to the website

One item at a time, in this order. Tick it off (`[x]`) when it's live, then stop and ask before starting the next.

## Rules
- **Add, never replace.** No existing stat gets removed, merged away or pushed off the page to make room. If a new stat overlaps an old one, it goes next to it and shows something the old one doesn't.
- New stats leave out the movie whose rating is still open (`closedMovies()` in `site/app.js`), like the other newer stats.
- Check new sections at phone width (under 500px) as well as desktop.
- Site-only items (✅) deploy by pushing to `main`. Items that need the bot (🤖 🎬) also need tests and a Pi deploy, and the deploy only happens when the user says so.

Data source:
- ✅ already in `site/data/data.json`, so it's a site-only change
- 🤖 already in the bot's database; `bot/export.py` needs to add it to the site data
- 🎬 needs extra details from TMDB (the bot already calls TMDB). Item 0 does this once for all 🎬 items.
- 🌍 needs some other free source

## Already on the site (don't duplicate)
Stats tiles, α vs ω scoreboard, scorecard table, top/lowest rated, records, by genre/decade/month/day/length, who agrees with whom, twins and rivals, most divisive, biggest fights, home facts strip, histogram, week by week, person pages (tiles, favourites, taste twin and nemesis, genres, with and against the group, by decade, over time, picks ranked).

## The list

### Important
- [x] **1. Fair ranking** ✅: adjusts each score for how harsh or generous that person usually is, so a movie isn't punished because the tough critics rated it. Show the "fair rank" next to the raw rank and flag the biggest movers.
- [x] **2. Fewer scores count less** ✅: pull movies with few scores toward the overall average, so 3 scores of 9 don't beat 10 scores of 8.8. Its own ranking column, next to the raw and fair ones.
- [x] **3. Pick hit rate** ✅: the share of each person's picks that ended up above the club average. Add it to the scorecard as a new column and to the person page.
- [x] **4. Are we getting harsher?** ✅: rolling average of the last 5 movies, drawn over the week-by-week chart or next to it.
- [x] **0. TMDB extras** 🎬 (needed by 5, 12, 13, 14, 15, 25): the bot fetches the TMDB rating and vote count, countries, original language, budget, revenue, top-billed cast, release date and poster colour, and adds them to the site data. Backfill the movies we've already watched. Bot change: needs tests and a Pi deploy. Poster colour isn't stored by the bot: the Pi can't get the image library it would need, and TMDB lets the website read poster pixels directly, so item 25 works it out in the browser.
- [x] **5. Us vs the world** 🎬: our average next to the TMDB rating for every movie. Where we liked something more than everyone else, where we liked it less, and which person agrees with TMDB the most (also shown on the person page).
- [ ] ⏸ *Parked (no polls with the new system yet); come back later.* **6. Vote history** 🤖: how often suggestions win, closest vote, biggest landslide, which movie lost the most votes before winning, who voted for the winner most often ("kingmaker"), and whether vote winners score well. Only covers votes since the bot started; check how many polls the Pi has first.
- [ ] ⏸ *Parked (imported suggestions all share one date, so there's no real waiting time yet); come back later.* **7. Waiting time on the Movie List** 🤖: how long movies wait before being watched, and the oldest one still waiting. Suggestions imported from the spreadsheet all share one date, so leave those out or mark them.

### Relevant
- [x] **8. Lone wolf moments** ✅: the times one person scored furthest from everyone else, club-wide (the person page only shows each person's own).
- [x] **9. Everyone liked it** ✅: movies where nobody gave less than 7 (and the opposite: nobody above 7).
- [x] **10. Score habits per person** ✅: how often each person uses each score (person × score grid). Who never goes below 6, who loves .5 scores.
- [x] **11. Movie age** ✅: how old each movie was when we watched it, and whether older ones score better.
- [x] **12. Countries and languages** 🎬: world map or table of where our movies come from, and how many weren't in English.
- [ ] **13. Actors** 🎬: actors we've seen most often, and actors who connect two of our movies.
- [ ] **14. Budget and box office** 🎬: cheapest and most expensive, total budget watched, and whether bigger budgets get better scores from us.
- [ ] **15. Obscurity** 🎬: how well known each movie is (TMDB vote count). Most obscure pick, and who suggests the most obscure stuff.
- [ ] **16. Rating speed** 🤖: who rates first and who rates last after a movie. Only works from now on (imported scores have no real time); the export needs each rating's `created_at`.
- [ ] **17. Remarks** ✅: who writes the most and the longest remarks, plus the shortest and longest ever.
- [ ] **18. Scatter charts** ✅: score against runtime and score against release year, one dot per movie.

### Silly
- [ ] **19. Runtime as travel** ✅: "we've spent enough time watching to fly Lisbon → Tokyo 4 times."
- [ ] **20. Title stats** ✅: longest title, whether longer titles score better, titles with numbers in them.
- [ ] **21. Days since the last…** ✅: days since the last horror, comedy, etc., one per genre.
- [ ] **22. Full moon nights** ✅: do we score higher under a full moon? Worked out from the dates alone.
- [ ] **23. Movie-night weather** 🌍: Lisbon weather on each movie night against the score (free weather history service, e.g. Open-Meteo, fetched by the bot or once at build).
- [ ] **24. Lucky decimals** ✅: the club's most used ending (.0, .5, .3…). "We are a 7.5 club."
- [ ] **25. Poster colour** 🎬: the main colour of each poster against its score.
- [ ] **26. Alphabet bias** ✅: do movies starting with A–M beat N–Z?

## Notes
- Item 0 is placed before 5 because 5 is the first item that needs it. Items 1–4 don't need it, so they can go live first.
- Ideas came from other movie-club tools (Cinema Circle: "biggest contrarian", how split a vote was; Letterboxd year in review: top actors, countries).
