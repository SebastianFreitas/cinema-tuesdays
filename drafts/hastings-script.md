# Everything Caption Hastings says

This file lists all of the bot's text, so you can review it in one place. Mark anything you want changed (cross it out, rewrite it, or leave a note) and I'll update the bot to match.

Example values are shown in place of the real ones: *The Fall (2006)*, *@Ana*, *Tuesday 20 October 2026 21:15*. Discord shows each person the times in their own timezone.

Right now only the one-off announcements (part 1) are in the Hastings voice. Everything else is plain and neutral. Do you want those rewritten as Hastings too?

---

## 1. One-off announcements (posted once)

The full text is in [hastings-messages.md](hastings-messages.md):
- **A.** The new #start-here message
- **B.** The button panel underneath it
- **C.** The announcement in #general

---

## 2. Public messages (the whole channel sees these)

### The button panel (#start-here)
> **🎬 Cinema Tuesdays**
> Movie night is every **Tuesday at 21:15** your time (21:15 in Portugal). Use the buttons below, no commands needed.
>
> ➕ **Suggest a movie**: type a title and pick the right one. Up to 10 each.
> 📋 **My list**: see your suggestions and remove any.
> ⭐ **Rate a movie**: score the latest movie, 0.0 to 10.0, until midnight (Portugal) the day after. Only you see your score.
> 🌐 **Website**: everything we've watched, the stats and the full Movie List.
>
> -# Each week one group's suggestions go to the vote. Only you see your own list.

Buttons: `➕ Suggest a movie` · `📋 My list` · `⭐ Rate a movie` · `🌐 Website`

### The weekly vote (#movie-night-cartaz)
Header card:
> **🎬 Movie night vote · Group α**
> Pick what we watch on **Tuesday 20 October 2026 21:15** (your time).
> One vote each, only if you're coming. Click your vote again to remove it.
> -# Sitting out this week (their pick won last time): Ana, João
>
> Footer: `3 votes so far`

One card per film:
> **1. The Fall (2006)**
> 1h57 · …details…
> Suggested by **Ana**
> `▰▰▰▱▱▱▱▱▱▱` **3** · Ana, João, Rita
>
> (when no one has voted yet: `▱▱▱▱▱▱▱▱▱▱` no votes yet)
> (Cultured Snobs' film: **🎩 The Fall (2006)** · 🎩 Cultured Snobs' pick)

Once the vote is closed:
> Voting is closed for **Tuesday 20 October 2026 21:15**.
> Footer: `7 votes`. The winning card gets a 🏆.

### 15 minutes before movie night (built, not deployed yet)
Posted automatically in **#general** every Tuesday at 21:00 Portuguese time, with a different version each week. Each one shows a still first (from [bot/assets/hastings](../bot/assets/hastings/CATALOG.md)), then the text. "21:15" is a Discord timestamp, so everyone sees it in their own time. Written to the rules in [hastings-voice.md](hastings-voice.md).

| Still | Text |
|---|---|
| `car` (waving from the sports car) | Hop in! **The Fall (2006)** starts in 15 minutes, at 21:15. Don't worry, I won't go over 80. |
| `goodlord` | Good Lord, is that the time? **The Fall (2006)** starts in 15 minutes, at 21:15. |
| `siesta` | Up you get, I've only just finished my siesta myself. **The Fall (2006)** starts in 15 minutes, at 21:15. |
| `oh-well` (in the dinner jacket) | **The Fall (2006)** starts in 15 minutes, at 21:15. What a good night for a film, eh? |
| `psst` (leaning in, pointing) | A word in your ear: **The Fall (2006)** starts in 15 minutes, at 21:15. |
| `golf` | Fifteen minutes to tee off. **The Fall (2006)** at 21:15. |
| `teaspoon` | Kettle on, I'd say. **The Fall (2006)** starts in 15 minutes, at 21:15. |
| `desert-car` | Fifteen minutes, everyone. **The Fall (2006)** at 21:15. Do be punctual; Poirot would never let me hear the end of it. |

### Other moments that could get a still (ideas)
| Moment | Still | Text |
|---|---|---|
| Tie in the vote | `goodlord` | I say, a dead heat! The Fall and Paprika tied, so I tossed a coin: we're watching **The Fall (2006)** this Tuesday. Download link in #link. |
| Every vote for one film | `crocodile` | I say! Every single vote for **The Fall (2006)**. Not much of a contest. Download link in #link. |
| Birthweek | `costume-ball` | I say, it's @Ana's birthweek! I've dressed for the occasion. They've picked **The Fall (2006)** for this Tuesday. Download link in #link. |
| Vote opens | `tenner` | Place your votes, everyone. (then the poll) |
| Rating closes | `siesta` | Rating's closed for **The Fall (2006)**. I'm having my siesta. Scores are on the website. |
| Something broke (private) | `muddle` | Good Lord, I've made a frightful muddle of that. Try again, and if it keeps happening, tell a moderator. |
| Horror film wins | `japp-cell` (that's Japp, not Hastings) | "Vicious-looking character, isn't he?" Japp's having a look at this week's film. |
| Thriller or crime film wins | `suspicious` | I'm keeping my eye on this one. |

### Winner announcement
> 🎬 This Tuesday we're watching **The Fall (2006)** with 4 votes. Download link in #link.

If it's a tie:
> 🎬 This Tuesday we're watching **The Fall (2006)** with 4 votes (tie between The Fall, Paprika, picked at random). Download link in #link.
> -# Ana will sit out their group's next poll.

### Vote cancelled (replaces the poll)
> ~~Vote cancelled.~~
> ~~Vote cancelled: birthweek pick this week.~~

### Birthweek
> 🎂 It's @Ana's birthweek! They picked **The Fall (2006)** for this Tuesday. Download link in #link.

### After movie night (#rate-movies)
> 🍿 We watched **The Fall (2006)**. How was it? Click below to give it a score.
> ⏰ Rating closes Wednesday 21 October 2026 23:59 (in 1 day).
> -# Scores stay private here so nobody's swayed; see them on the website.
>
> Button: `⭐ Rate The Fall`

### The verdict, once everyone has rated (#rate-movies, a moderator runs `/reveal post:True`)
> **🎬 The verdict: The Fall (2006)**
> Average **7.24** from 8 scores · **#4** of the 26 we've watched (our overall average is 7.12)
> Suggested by **Ana**
> `8.6` Ana · `8.0` João · `7.8` Rita · `7.5` Traff · `7.4` Toni · `7.2` Irene · `6.9` Slader · `4.5` Giotara
> > "The colours alone were worth it. I'd watch it again just for the costumes." — Rita
> > "Slow start, but the ending got me." — João
> > "Gorgeous." — Ana
> I say, a bit of a split on this one.
> 🌐 Full scores on the website: https://sebastianfreitas.github.io/cinema-tuesdays/#movie/12

- "Suggested by" is left out if nobody suggested it (e.g. the Cultured Snobs' pick). Several names: **Ana, João**.
- Up to three remarks, the longest ones, cut at about 200 characters. No remarks, no quote lines.
- At most one Hastings line, the first that fits (the top/bottom three only once we've watched 6 or more):

| When | Hastings says |
|---|---|
| In the top three | I say! Straight into our top three. |
| In the bottom three | Good Lord. Well, they can't all be winners. |
| Highest and lowest score within 1.5 | Remarkable agreement, for once. |
| Highest and lowest score 4 or more apart | I say, a bit of a split on this one. |
| Anything else | (no line) |

### When someone rates
> ⭐ @Ana rated **The Fall (2006)**.

### When someone suggests a film (posted next to their suggestion)
> Suggested by @Ana
> Suggested by @Ana (also suggested by João, Rita)

---

## 3. Private replies (only the person who clicked sees these)

### Suggesting
| When | Hastings says |
|---|---|
| Suggest form | Title: **Suggest a movie** · fields: *Movie title* (e.g. The Fall), *Year (optional, helps with remakes)* (e.g. 2006) |
| Picking from results | Which one is it? · dropdown: *Pick the right movie…* |
| Nothing found | Nothing found for **The Fal**. Check the spelling? |
| TMDB is down | Couldn't reach TMDB just now. Try again in a minute. |
| Added | Added **The Fall (2006)**. You now have 4/10 suggestions. |
| Already on their list | **The Fall (2006)** is already on your list. |
| Already watched | We already watched **The Fall (2006)** on 3 March 2025. |
| List is full | You already have 10/10 suggestions. Remove one first (📋 My list, or `/unsuggest`). |
| `/suggest` can't find it | Couldn't find **The Fal** on TMDB. Try picking from the list. |

### My list
| When | Hastings says |
|---|---|
| The list | **Your Movie List · 4/10** · 1. **The Fall (2006)** · Tarsem Singh … · footer: *Pick a movie below to remove it.* |
| Empty | Nothing yet. Add your first one with ➕ Suggest. |
| Dropdown | Remove a movie… |
| Removed | Removed **The Fall (2006)**. |
| Button | ➕ Suggest another |
| `/unsuggest` done | Removed **The Fall (2006)** from your suggestions. |
| `/unsuggest` wrong film | That isn't one of your open suggestions. |

### Voting
| When | Hastings says |
|---|---|
| Voted | Voted for **The Fall**. |
| Took vote back | Removed your vote for **The Fall**. |
| Vote is closed | This vote is closed. |

### Rating
| When | Hastings says |
|---|---|
| Rate a movie button | Which movie do you want to rate? · dropdown: *Which movie?* · each option: *Watched 14 Oct · you gave it 7.8* / *not rated yet* |
| Nothing to rate | Nothing to rate right now. Rating opens after movie night and closes at midnight (Portugal) the next day. |
| Rating form | Title: **Rate The Fall** · *Score from 0.0 to 10.0* (e.g. 7.8) · *Remark (optional)* (What did you think?) |
| Saved | Saved: you gave **The Fall (2006)** **7.8**/10. Only you can see this. Everyone's scores are on the website. |
| Changed | Updated: you gave **The Fall (2006)** **8.0**/10. Only you can see this. Everyone's scores are on the website. |
| Not a number | The score has to be a number from 0.0 to 10.0, like 7.8. |
| Remark too short | Please add a remark of at least 10 characters. |
| Rating closed | Rating for **The Fall (2006)** closed 21 October 2026 23:59. Ask a moderator if you need to fix a score. |
| Film not watched yet | That movie hasn't been marked as watched yet. |
| `/rate` wrong film | Pick a movie we've watched from the list. |

### `/ratings` (everyone's scores for a film)
| When | Hastings says |
|---|---|
| The scores | **The Fall (2006)** · Average **7.45** from 8 scores · spread ±1.20 · then one line each: `7.8` **Ana** — remark |
| Hasn't rated yet | Give **The Fall (2006)** your own score first. The others stay hidden until you've rated or rating closes. |
| No scores | No scores for **The Fall (2006)** yet. |

### `/suggestions`
| When | Hastings says |
|---|---|
| Whole list | **Movie List (42 movies)** · • **The Fall (2006)** — Ana, João |
| One person | **Ana's suggestions (4/10)** · • The Fall (2006) |
| Empty | Nothing here yet. Use `/suggest`. |

### Errors
| When | Hastings says |
|---|---|
| Not a moderator | Only moderators can do that. |
| Anything else breaks | Something went wrong running that command. |

---

## 4. Moderator-only replies

| When | Hastings says |
|---|---|
| `/panel` | Posted. Pin it so people can find it. |
| `/poll open` posted | Vote posted: (link) |
| Vote already open | There's already an open vote. Close it with `/poll close`. |
| Curated pick not found | Couldn't find the curated pick **The Fal** on TMDB. |
| Titles not on list | Not on the Movie List: The Fal, Paprka |
| Empty group | Nobody is in Group α yet. Assign people with `/group set`. |
| Too few films | Not enough movies for a vote (Group α has 1 eligible suggestion). |
| `/poll close` no vote | No open vote. |
| Closed with no votes | Vote closed with no votes. |
| `/poll cancel` | Vote cancelled. Nothing changed in the rotation. |
| `/poll pick` not found | Couldn't find **The Fal** on TMDB. |
| `/group set` | @Ana → **Group α** |
| `/group sitout` on | @Ana sits out Group α's next vote. It clears itself once that vote closes. |
| `/group sitout` off | @Ana is back in their group's next vote. |
| `/group sitout`, no group | @Ana is marked as sitting out, but they're not in a group yet (`/group set`). |
| `/group list` | **Poll rotation** · Group α / Group ω members, *(sitting out next)* · footer: *Next vote: Group ω* |
| `/watched` | Marked **The Fall (2006)** as watched on 14 October. Posted a Rate button in #rate-movies. |
| `/watched` no film | Which movie? Pick one from the list. |
| Bad date | Couldn't read the date '14/14/2026'. Use YYYY-MM-DD or DD/MM/YYYY. |
| `/reveal` (preview) | The verdict as above, shown only to the moderator. |
| `/reveal post:True` | Posted: (link) |
| `/reveal`, not watched | Pick a movie we've watched from the list. |
| `/reveal`, no scores | No scores for **The Fall (2006)** yet. |
| `/admin link` | Linked **Ana**'s history to @Ana. |

### Slash command descriptions (shown in Discord's command menu)
- `/suggest`: Add a movie to the Movie List
- `/unsuggest`: Remove one of your suggestions
- `/suggestions`: Show the Movie List, or one person's suggestions
- `/rate`: Score a movie we watched (0.0 to 10.0)
- `/ratings`: Everyone's scores for a movie
- `/watched`: Mark a movie as watched (moderators)
- `/panel`: Post the Movie List buttons in this channel (moderators)
- `/poll open`: Post this week's vote (rotates between Group α and Group ω)
- `/poll close`: Close the vote and announce the winner
- `/poll cancel`: Delete the open vote without a winner (doesn't use up the group's turn)
- `/poll pick`: Birthweek: the birthday person picks the movie, no vote
- `/group set`: Put a member in Group α or Group ω (moderators)
- `/group sitout`: Make someone sit out (or not) their group's next vote (moderators)
- `/group list`: Show both groups and whose week is next
- `/reveal`: Post a movie's scores in #rate-movies once everyone has rated (moderators)
- `/admin link`: (Data maintenance) link an old spreadsheet name to a Discord member
