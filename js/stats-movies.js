// Stats panel, The movies / When chapters: age, origins, actors, budget, obscurity, titles, travel, month and day.

// Movie age: years from release date to the night we watched it (last watch). Closed movies with both dates.
const ageYears = (m) => (m.release_date && realDate(lastSeen(m)) ? (new Date(lastSeen(m)) - new Date(m.release_date)) / 31557600000 : null);
const ageText = (y) => (y < 1 / 12 ? plural(Math.max(0, Math.round(y * 52.18)), "week") : y < 1 ? plural(Math.round(y * 12), "month") : plural(Math.floor(y), "year"));
const AGE_BANDS = [["Under 2 years", 2], ["2 to 10 years", 10], ["10 to 25 years", 25], ["25 to 50 years", 50], ["50 years or more", Infinity]];

function renderAges() {
  const aged = closedMovies().map((m) => ({ m, y: ageYears(m) })).filter((x) => x.y != null && x.y >= 0);
  if (!aged.length) {
    $("#ages").innerHTML = `<tbody><tr><td class="empty">No dated movies yet.</td></tr></tbody>`;
    $("#age-sum").textContent = ""; $("#age-old").innerHTML = $("#age-new").innerHTML = ""; return;
  }
  groupTable("#ages", AGE_BANDS.map(([k, hi], i) => [k, aged.filter((x) => x.y >= (i ? AGE_BANDS[i - 1][1] : 0) && x.y < hi).map((x) => x.m)])
    .filter(([, ms]) => ms.length), "Age");
  // older half against newer half, split at the median age
  const mid = median(aged.map((x) => x.y)), rated = aged.filter((x) => x.m.avg != null);
  const older = mean(rated.filter((x) => x.y > mid).map((x) => x.m.avg)), newer = mean(rated.filter((x) => x.y <= mid).map((x) => x.m.avg));
  $("#age-sum").textContent = `Typical age: ${ageText(mid)}.` + (older != null && newer != null
    ? ` Movies older than that average ${fmt(older, 2)}, newer ones ${fmt(newer, 2)}.` : "");
  const li = (x) => `<li data-movie="${x.m.id}"><div>${esc(x.m.title)}<div class="sub">${ageText(x.y)} old · ${x.m.year ?? ""}</div></div>
      <span class="v">${fmt(x.m.avg, 2)}</span></li>`;
  const byAge = [...aged].sort((a, b) => b.y - a.y);
  $("#age-old").innerHTML = byAge.slice(0, 5).map(li).join("");
  $("#age-new").innerHTML = byAge.slice(-5).reverse().map(li).join("");
}

// Country and language codes from TMDB, shown as names by the browser (falls back to the code)
const displayName = (type, code) => { try { return new Intl.DisplayNames(["en-GB"], { type }).of(code) || code; } catch { return code; } };
const countryName = (c) => (c === "KR" ? "South Korea" : displayName("region", c)), langName = (l) => displayName("language", l);

function renderOrigins() {
  const add = (map, k, m) => map.set(k, [...(map.get(k) || []), m]);
  const done = closedMovies(), countries = new Map(), langs = new Map();
  done.forEach((m) => (m.countries || []).forEach((c) => add(countries, countryName(c), m)));
  done.filter((m) => m.language).forEach((m) => add(langs, langName(m.language), m));
  const bySize = (map) => [...map].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  groupTable("#countries", bySize(countries), "Country");
  groupTable("#languages", bySize(langs), "Language");
  const known = done.filter((m) => m.language), other = known.filter((m) => m.language !== "en");
  $("#lang-sum").textContent = known.length ? `${other.length} of ${plural(known.length, "movie")} weren't in English (${pct(other.length, known.length)}).` : "";
}

// Actors (top 5 billed from TMDB) we've seen in more than one movie, and the ones who'd be back with a Movie List pick
function renderActors() {
  const seen = new Map(); // actor id -> { name, movies }
  closedMovies().forEach((m) => (m.cast || []).forEach((a) => {
    if (!seen.has(a.id)) seen.set(a.id, { name: a.name, movies: [] });
    seen.get(a.id).movies.push(m);
  }));
  const again = [...seen.values()].filter((a) => a.movies.length > 1)
    .sort((a, b) => b.movies.length - a.movies.length || a.name.localeCompare(b.name));
  $("#actors-again").innerHTML = again.map((a) => {
    const rated = a.movies.filter((m) => m.avg != null);
    return `<li><div>${esc(a.name)}<div class="sub">${a.movies.map(movieLink).join(", ")}</div></div>
      <span class="v">${rated.length ? fmt(mean(rated.map((m) => m.avg)), 2) : "–"}</span></li>`;
  }).join("") || `<p class="empty">No actor in two of our movies yet.</p>`;
  const back = new Map(); // actor id -> list picks they're in
  DATA.suggestions.forEach((s) => (s.cast || []).forEach((a) => { if (seen.has(a.id)) back.set(a.id, [...(back.get(a.id) || []), s]); }));
  $("#actors-list").innerHTML = [...back].sort((a, b) => seen.get(a[0]).name.localeCompare(seen.get(b[0]).name)).map(([id, picks]) => {
    const a = seen.get(id);
    return `<li><div>${esc(a.name)}<div class="sub">${picks.map(movieLink).join(", ")} · seen in ${a.movies.map(movieLink).join(", ")}</div></div></li>`;
  }).join("") || `<p class="empty">Nobody we've seen is on the Movie List.</p>`;
}

// Budget and box office from TMDB (null = unknown). Closed movies with a known budget.
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);
const BUDGET_BANDS = [["Under $5M", 5e6], ["$5M to $30M", 3e7], ["$30M to $100M", 1e8], ["$100M or more", Infinity]];

function renderBudgets() {
  const ms = closedMovies().filter((m) => m.budget);
  if (!ms.length) {
    $("#budgets").innerHTML = `<tbody><tr><td class="empty">No budgets known yet.</td></tr></tbody>`;
    $("#budget-sum").textContent = ""; $("#budget-hi").innerHTML = $("#budget-lo").innerHTML = ""; return;
  }
  groupTable("#budgets", BUDGET_BANDS.map(([k, hi], i) => [k, ms.filter((m) => m.budget >= (i ? BUDGET_BANDS[i - 1][1] : 0) && m.budget < hi)])
    .filter(([, g]) => g.length), "Budget");
  const box = ms.filter((m) => m.revenue);
  $("#budget-sum").textContent = `${plural(ms.length, "movie")} that cost ${money(sum(ms.map((m) => m.budget)))} together`
    + (box.length ? `; ${box.length === ms.length ? "they" : `the ${box.length} with known box office`} took ${money(sum(box.map((m) => m.revenue)))} in cinemas.` : ".");
  const bMax = Math.max(...ms.map((m) => m.budget));
  const li = (m) => `<li data-movie="${m.id}"${bw(m.budget / bMax)}><div>${esc(m.title)}<div class="sub">cost ${money(m.budget)}${m.revenue ? ` · took ${money(m.revenue)}` : ""}</div></div>
      <span class="v">${fmt(m.avg, 2)}</span></li>`;
  const sorted = [...ms].sort((a, b) => b.budget - a.budget);
  $("#budget-hi").innerHTML = sorted.slice(0, 5).map(li).join("");
  $("#budget-lo").innerHTML = sorted.slice(-5).reverse().map(li).join("");
}

// Obscurity: TMDB vote count as a measure of how well known a movie is
const votes = (n) => `${Number(n).toLocaleString("en-GB")} ${n === 1 ? "vote" : "votes"}`;

function renderObscurity() {
  const ms = closedMovies().filter((m) => m.tmdb_votes != null).sort((a, b) => a.tmdb_votes - b.tmdb_votes);
  const li = (m) => `<li data-movie="${m.id}"><div>${esc(m.title)}<div class="sub">${votes(m.tmdb_votes)}${m.suggested_by?.length ? ` · ${esc(m.suggested_by.join(", "))}` : ""}</div></div>
      <span class="v">${fmt(m.avg, 2)}</span></li>`;
  $("#obscure-lo").innerHTML = ms.slice(0, 5).map(li).join("") || `<p class="empty">No TMDB data yet.</p>`;
  $("#obscure-hi").innerHTML = ms.slice(-5).reverse().map(li).join("");
  $("#obscure-sum").textContent = ms.length ? `Typical movie: ${votes(Math.round(median(ms.map((m) => m.tmdb_votes))))}.` : "";
  // every pick a person made: watched (closed) or still on the Movie List
  const by = new Map();
  [...closedMovies(), ...DATA.suggestions].filter((m) => m.tmdb_votes != null)
    .forEach((m) => (m.suggested_by || []).forEach((p) => by.set(p, [...(by.get(p) || []), m.tmdb_votes])));
  const rows = [...by].filter(([, v]) => v.length >= 3).map(([name, v]) => ({ name, n: v.length, med: median(v) })).sort((a, b) => a.med - b.med);
  $("#diggers").innerHTML = rows.map((r) => `<li><div>${personLink(r.name)}<div class="sub">${plural(r.n, "pick")}</div></div>
      <span class="v">${Math.round(r.med).toLocaleString("en-GB")}</span></li>`).join("") || `<p class="empty">Needs people with 3+ picks.</p>`;
}

// Title stats, closed movies only. Words: whitespace-separated, ignoring lone punctuation.
const titleWords = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const NUM_WORDS = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million".split(" ");
// digits, Roman numerals from II up (a lone "I" is usually the pronoun) and number words
const hasNumber = (t) => /\d/.test(t) || titleWords(t).some((w) => /^(II|III|IV|V|VI|VII|VIII|IX|X)$/.test(w.replace(/\W+$/, "")) || NUM_WORDS.includes(w.toLowerCase().replace(/\W+/g, "")));
function renderTitles() {
  const ms = closedMovies().filter((m) => m.avg != null);
  const n = (m) => titleWords(m.title).length;
  const band = (k) => (k >= 5 ? "5 or more" : plural(k, "word"));
  const bands = new Map();
  ms.forEach((m) => bands.set(band(n(m)), [...(bands.get(band(n(m))) || []), m]));
  groupTable("#title-len", ["1 word", "2 words", "3 words", "4 words", "5 or more"].filter((k) => bands.has(k)).map((k) => [k, bands.get(k)]), "Title");
  const long = ms.length ? ms.reduce((a, b) => (b.title.length > a.title.length ? b : a)) : null;
  const xs = ms.map(n), vs = ms.map((m) => m.avg), mx = mean(xs), mv = mean(vs);
  const sxx = sum(xs.map((a) => (a - mx) ** 2)), svv = sum(vs.map((a) => (a - mv) ** 2));
  const r = sxx && svv ? sum(ms.map((m, i) => (xs[i] - mx) * (vs[i] - mv))) / Math.sqrt(sxx * svv) : 0;
  $("#title-sum").innerHTML = long ? `Longest: ${movieLink(long)} (${plural(n(long), "word")}). ${Math.abs(r) < 0.1 ? "Length makes no real difference" : `Longer titles score ${r > 0 ? "a bit higher" : "a bit lower"}`} (correlation ${signed(r, 2)}).` : "";
  const nums = ms.filter((m) => hasNumber(m.title)).sort((a, b) => b.avg - a.avg), rest = ms.filter((m) => !hasNumber(m.title));
  $("#title-num").innerHTML = nums.map((m) => `<li data-movie="${m.id}"><div>${esc(m.title)}${m.year ? `<div class="sub">${m.year}</div>` : ""}</div><span class="v">${fmt(m.avg, 2)}</span></li>`).join("")
    || `<p class="empty">No numbers in our titles yet.</p>`;
  $("#num-sum").textContent = nums.length && rest.length ? `They average ${fmt(mean(nums.map((m) => m.avg)), 2)}, the rest ${fmt(mean(rest.map((m) => m.avg)), 2)}.` : "";
}

// Total runtime of closed movies, measured in trips. Durations are rough, everyday figures (minutes).
const TRIPS = [
  ["🛰️", "laps round the Earth on the ISS", "of a lap round the Earth on the ISS", "one orbit: about 1h32", 92],
  ["🚆", "Lisbon → Porto trains", "of a Lisbon → Porto train", "Alfa Pendular: about 2h50", 170],
  ["✈️", "Lisbon → New York flights", "of a Lisbon → New York flight", "nonstop: about 8h", 480],
  ["💍", "Lord of the Rings marathons", "of a Lord of the Rings marathon", "the three films, cinema cuts: 9h18", 558],
  ["✈️", "Lisbon → Tokyo trips", "of a Lisbon → Tokyo trip", "no direct flight, so about 17h with a change", 1020],
  ["🚶", "walks from Lisbon to Porto", "of a walk from Lisbon to Porto", "about 310 km at 5 km/h: about 62h", 3720],
];
function renderTravel() {
  const min = sum(closedMovies().map((m) => m.runtime || 0));
  $("#travel-sum").textContent = min ? `${hm(min)} of movies so far, enough for:` : "";
  const times = (k) => (k >= 10 ? `×${Math.round(k)}` : k >= 1 ? `×${fmt(k, 1).replace(/\.0$/, "")}` : pct(k, 1));
  $("#travel").innerHTML = min ? TRIPS.map(([icon, many, part, sub, m]) => `<li${bw(min / m)}><span>${icon}</span><div>${min >= m ? many : part}<div class="sub">${sub}</div></div>
      <span class="v">${times(min / m)}</span></li>`).join("") : `<p class="empty">No runtimes yet.</p>`;
}

// When we watched (month, weekday) and how long the movie is, closed movies only. Reuses groupTable.
function renderWhen() {
  const add = (map, k, m) => map.set(k, [...(map.get(k) || []), m]);
  const months = new Map(), days = new Map(), lengths = new Map();
  const dated = closedMovies().filter((m) => realDate(lastSeen(m))).sort((a, b) => lastSeen(b).localeCompare(lastSeen(a)));
  dated.forEach((m) => add(months, date(lastSeen(m), { month: "short", year: "numeric" }), m));
  // Monday first; dates are calendar days, so read them in UTC to keep the weekday right everywhere
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  dated.forEach((m) => add(days, new Date(lastSeen(m) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), m));
  const band = (r) => (r < 100 ? "Under 1h40" : r < 120 ? "1h40 to 2h" : r < 150 ? "2h to 2h30" : "2h30 or more");
  closedMovies().filter((m) => m.runtime).forEach((m) => add(lengths, band(m.runtime), m));
  groupTable("#months", [...months], "Month");
  groupTable("#weekdays", [...days].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])), "Day");
  groupTable("#lengths", ["Under 1h40", "1h40 to 2h", "2h to 2h30", "2h30 or more"].filter((k) => lengths.has(k)).map((k) => [k, lengths.get(k)]), "Length");
}
