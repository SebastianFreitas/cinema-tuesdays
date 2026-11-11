// Stats panel, Rankings / People chapters: groups, fair ranking, us vs the world, lone wolves, consensus, habits, pairs.

// Group α vs ω, side by side. Members with no group count for neither; open movies are left out.
function renderGroups() {
  const closed = closedMovies(), { rank, total } = movieRanks();
  const grp = (n) => memberInfo.get(n)?.group ?? null;
  const side = (g) => {
    const names = DATA.members.filter((m) => m.group === g).map((m) => m.name);
    const mine = (n) => grp(n) === g, theirs = (n) => grp(n) != null && grp(n) !== g;
    const picks = closed.filter((m) => m.avg != null && m.suggested_by.some(mine)).sort((a, b) => b.avg - a.avg);
    const given = closed.flatMap((m) => m.ratings.filter((r) => mine(r.name)).map((r) => ({ m, s: r.score })));
    const toOwn = mean(given.filter((x) => x.m.suggested_by.some(mine)).map((x) => x.s));
    const toOther = mean(given.filter((x) => x.m.suggested_by.some(theirs) && !x.m.suggested_by.some(mine)).map((x) => x.s));
    const open = DATA.suggestions.filter((m) => m.suggested_by.some(mine));
    return {
      names, picks, best: picks[0], worst: picks.at(-1),
      avg: mean(picks.map((m) => m.avg)), place: mean(picks.map((m) => rank.get(m.id))),
      top10: picks.filter((m) => rank.get(m.id) <= 10).length,
      given: mean(given.map((x) => x.s)), nGiven: given.length, toOwn, toOther,
      home: toOwn != null && toOther != null ? toOwn - toOther : null,
      turnout: names.length && closed.length ? mean(names.map((n) => closed.filter((m) => m.ratings.some((r) => r.name === n)).length / closed.length)) : null,
      hours: sum(picks.map((m) => m.runtime || 0)) / 60,
      open: open.length, lost: sum(open.map((m) => m.lost_votes || 0)),
    };
  };
  const A = side("alpha"), O = side("omega");
  const pick = (m) => (m ? `<b>${fmt(m.avg, 2)}</b> ${movieLink(m)}` : "–");
  // [label, hint, value for a side, shown, which is better: 1 more, -1 less, 0 neither]
  const rows = [
    ["Members", "People in the group", (s) => s.names.length, (s) => `<span data-tip="${esc(esc(s.names.join(", ") || "nobody yet"))}">${s.names.length}</span>`, 0],
    ["Picks watched", "Their suggestions that won a vote and got watched", (s) => s.picks.length, (s) => s.picks.length, 1],
    ["Pick average", "Group average of their picks", (s) => s.avg, (s) => fmt(s.avg, 2), 1],
    ["Avg place", `Where their picks sit among all ${total} movies, 1 = best`, (s) => s.place, (s) => fmt(s.place, 1), -1],
    ["In the top 10", "Their picks among the 10 best-rated movies", (s) => s.top10, (s) => s.top10, 1],
    ["Best pick", "Their highest-rated pick", (s) => s.best?.avg, (s) => pick(s.best), 1],
    ["Worst pick", "Their lowest-rated pick", (s) => s.worst?.avg, (s) => pick(s.worst), 1],
    ["Hours picked", "Total runtime of their picks", (s) => s.hours, (s) => (s.picks.length ? hm(s.hours * 60) : "–"), 0],
    ["Scores given", "Scores from the group's members", (s) => s.nGiven, (s) => s.nGiven, 0],
    ["Turnout", "Share of our movies the average member scored", (s) => s.turnout, (s) => (s.turnout == null ? "–" : pct(s.turnout, 1)), 1],
    ["Avg score given", "How generous the group is overall", (s) => s.given, (s) => fmt(s.given, 2), 0],
    ["To own picks", "Their average for their own group's picks", (s) => s.toOwn, (s) => fmt(s.toOwn, 2), 0],
    ["To rival picks", "Their average for the other group's picks", (s) => s.toOther, (s) => fmt(s.toOther, 2), 0],
    ["Home bias", "Own picks minus rival picks: + means they favour their own", (s) => s.home, (s) => (s.home == null ? "–" : signed(s.home)), 0],
    ["On the Movie List", "Suggestions waiting for a vote", (s) => s.open, (s) => s.open, 0],
    ["Votes lost", "Past votes lost by the movies still on the list", (s) => s.lost, (s) => s.lost, 0],
  ];
  let wa = 0, wo = 0;
  const body = rows.map(([label, tipText, val, show, dir]) => {
    const a = val(A), o = val(O);
    const win = dir && a != null && o != null && Math.abs(a - o) > 1e-9 ? ((a - o) * dir > 0 ? "a" : "o") : "";
    if (win === "a") wa++; else if (win === "o") wo++;
    return `<tr><td data-tip="${esc(tipText)}">${label}</td><td class="${win === "a" ? "best" : ""}">${show(A)}</td><td class="${win === "o" ? "best" : ""}">${show(O)}</td></tr>`;
  }).join("");
  const kpi = (v, l, s) => `<div class="kpi"><b>${v}</b><span>${l}</span>${s ? `<small>${s}</small>` : ""}</div>`;
  $("#groups").innerHTML = `<div class="kpis" style="margin:0 0 12px">
      ${kpi(fmt(A.avg, 2), `${GROUPS.alpha} picks`, `${plural(A.picks.length, "movie")} · ${plural(A.names.length, "member")}`)}
      ${kpi(fmt(O.avg, 2), `${GROUPS.omega} picks`, `${plural(O.picks.length, "movie")} · ${plural(O.names.length, "member")}`)}
      ${kpi(`${wa}–${wo}`, "rows won", wa === wo ? "all square" : `${wa > wo ? GROUPS.alpha : GROUPS.omega} ahead`)}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>${GROUPS.alpha}</th><th>${GROUPS.omega}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// Fair ranking: each score minus that person's usual lean (how far above or below the others they score on
// the same movies), so a movie isn't helped or hurt by who happened to score it. Closed movies only.
// A lean from only a few scores is trusted less: it's scaled by n / (n + 3).
function fairScores() {
  const done = closedMovies().filter((m) => m.avg != null);
  const gaps = new Map();
  done.forEach((m) => m.ratings.forEach((r) => {
    const others = m.ratings.filter((x) => x !== r).map((x) => x.score);
    if (others.length) gaps.set(r.name, [...(gaps.get(r.name) || []), r.score - mean(others)]);
  }));
  const lean = new Map([...gaps].map(([n, g]) => [n, mean(g) * g.length / (g.length + 3)]));
  return done.map((m) => ({ m, fair: mean(m.ratings.map((r) => r.score - (lean.get(r.name) || 0))) }));
}

// Weighted average: the movie's average pulled toward the overall average as if it had WEIGHT_K extra
// scores at that overall average, so a movie with few scores can't top the table on a handful of 9s.
const WEIGHT_K = 3;

function renderFair() {
  const { rank } = movieRanks();
  const rows = fairScores().sort((a, b) => b.fair - a.fair || b.m.avg - a.m.avg);
  if (!rows.length) { $("#fair").innerHTML = `<tbody><tr><td class="empty">No scores yet.</td></tr></tbody>`; return; }
  const overall = mean(rows.map((r) => r.m.avg));
  rows.forEach((r) => { const n = r.m.ratings.length; r.weighted = (n * r.m.avg + WEIGHT_K * overall) / (n + WEIGHT_K); });
  // place by a value, best first; ties share a place, as in movieRanks
  const places = (f) => {
    const s = [...rows].sort((a, b) => f(b) - f(a)), out = new Map();
    s.forEach((r, i) => out.set(r.m.id, i && Math.abs(f(s[i - 1]) - f(r)) < 1e-9 ? out.get(s[i - 1].m.id) : i + 1));
    return out;
  };
  const place = places((r) => r.fair), wPlace = places((r) => r.weighted);
  const move = (to, r) => {
    const d = rank.get(r.m.id) - to.get(r.m.id);
    return d ? `<span class="${d > 0 ? "pos" : "neg"}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>` : `<span style="color:var(--muted)">=</span>`;
  };
  const diff = (r) => { const d = r.fair - r.m.avg; return `<span class="${Math.abs(d) < 0.005 ? "" : d > 0 ? "pos" : "neg"}">${signed(d)}</span>`; };
  $("#fair").innerHTML = `<thead><tr><th>#</th><th style="text-align:left">Movie</th><th data-tip="Average after taking out each person's usual lean">Fair</th><th data-tip="The plain group average">Avg</th>
      <th data-tip="Fair minus average">Diff</th><th data-tip="Place by the plain average">Was</th><th data-tip="Places gained (▲) or lost (▼) by the fair score">Move</th>
      <th data-tip="How many people scored it">Scores</th><th data-tip="Average pulled toward the overall average (${fmt(overall, 2)}), more for movies with few scores">Weighted</th>
      <th data-tip="Place by the weighted average, and places gained (▲) or lost (▼) against the plain average">W place</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${place.get(r.m.id)}</td><td class="clip">${movieLink(r.m)}</td><td><b>${fmt(r.fair, 2)}</b></td><td>${fmt(r.m.avg, 2)}</td><td>${diff(r)}</td>
      <td>${rank.get(r.m.id)}</td><td>${move(place, r)}</td><td>${r.m.ratings.length}</td><td>${fmt(r.weighted, 2)}</td>
      <td>${wPlace.get(r.m.id)} ${move(wPlace, r)}</td></tr>`).join("")}</tbody>`;
}

// Us vs the world: the group average next to TMDB's user rating. Closed movies only, and only where enough
// people on TMDB have rated it for the number to mean something.
const MIN_TMDB_VOTES = 50;
const vsWorld = () => closedMovies().filter((m) => m.avg != null && m.tmdb_rating != null && m.tmdb_votes >= MIN_TMDB_VOTES)
  .map((m) => ({ m, diff: m.avg - m.tmdb_rating }));

// everyone with 3+ such scores: average distance between their score and TMDB's (closest first), and which way they lean
function tmdbAgreement() {
  const by = new Map();
  vsWorld().forEach(({ m }) => m.ratings.forEach((r) => by.set(r.name, [...(by.get(r.name) || []), r.score - m.tmdb_rating])));
  return [...by].filter(([, g]) => g.length >= 3).map(([name, g]) => ({ name, gap: mean(g.map(Math.abs)), lean: mean(g), n: g.length }))
    .sort((a, b) => a.gap - b.gap);
}

function renderWorld() {
  const rows = vsWorld().sort((a, b) => b.diff - a.diff);
  if (!rows.length) {
    $("#world").innerHTML = "";
    ["#w-more", "#w-less", "#w-people"].forEach((id) => { $(id).innerHTML = `<p class="empty">No TMDB ratings yet.</p>`; });
    return;
  }
  const gap = mean(rows.map((r) => r.diff));
  $("#world-sum").textContent = `Across ${plural(rows.length, "movie")} we score ${fmt(Math.abs(gap), 2)} ${gap < 0 ? "below" : "above"} TMDB on average.`;
  renderDumbbell(rows);
  const k = Math.min(5, rows.length >> 1);
  const dMax = Math.max(...rows.map((r) => Math.abs(r.diff)));
  const li = (r) => `<li data-movie="${r.m.id}"${bw(Math.abs(r.diff) / dMax, r.diff < 0)}><div>${esc(r.m.title)}<div class="sub">us ${fmt(r.m.avg, 2)} · TMDB ${fmt(r.m.tmdb_rating, 2)}</div></div>
    <span class="v"><span class="${r.diff > 0 ? "pos" : "neg"}">${signed(r.diff)}</span></span></li>`;
  $("#w-more").innerHTML = rows.slice(0, k).filter((r) => r.diff > 0).map(li).join("") || `<p class="empty">TMDB liked everything more.</p>`;
  $("#w-less").innerHTML = rows.slice(-k).reverse().filter((r) => r.diff < 0).map(li).join("") || `<p class="empty">We liked everything more.</p>`;
  const agree = tmdbAgreement(), aMax = Math.max(...agree.map((p) => p.gap));
  $("#w-people").innerHTML = agree.slice(0, 5).map((p) => `<li${bw(p.gap / aMax)}><div>${personLink(p.name)}<div class="sub">${plural(p.n, "movie")} · usually ${fmt(Math.abs(p.lean), 2)} ${p.lean < 0 ? "below" : "above"}</div></div>
    <span class="v">±${fmt(p.gap, 2)}</span></li>`).join("") || `<p class="empty">Needs 3+ scores each.</p>`;
  const tPlace = new Map([...rows].sort((a, b) => b.m.tmdb_rating - a.m.tmdb_rating).map((r, i) => [r.m.id, i + 1]));
  $("#world").innerHTML = `<thead><tr><th style="text-align:left">Movie</th><th data-tip="Our group average">Us</th><th data-tip="TMDB users' average">TMDB</th>
      <th data-tip="Ours minus TMDB's">Diff</th><th data-tip="Place by our average, among the movies in this table">Our place</th><th data-tip="Place by TMDB rating, among the movies in this table">TMDB place</th>
      <th data-tip="How many people rated it on TMDB">TMDB votes</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="clip">${movieLink(r.m)}</td><td><b>${fmt(r.m.avg, 2)}</b></td><td>${fmt(r.m.tmdb_rating, 2)}</td>
      <td><span class="${Math.abs(r.diff) < 0.005 ? "" : r.diff > 0 ? "pos" : "neg"}">${signed(r.diff)}</span></td>
      <td>${[...rows].filter((x) => x.m.avg > r.m.avg).length + 1}</td><td>${tPlace.get(r.m.id)}</td><td>${r.m.tmdb_votes.toLocaleString("en-GB")}</td></tr>`).join("")}</tbody>`;
}

// Dumbbell: one row per movie, our average and TMDB's as two dots on a shared scale, joined by a line
// coloured by who liked it more. The axis is cropped to the scores in use so small gaps still show.
function renderDumbbell(rows) {
  const vals = rows.flatMap((r) => [r.m.avg, r.m.tmdb_rating]);
  const lo = Math.max(0, Math.floor(Math.min(...vals))), hi = Math.min(10, Math.ceil(Math.max(...vals)));
  const x = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((t) => `<span style="left:${x(t).toFixed(2)}%">${t}</span>`).join("");
  const row = (r) => {
    const a = Math.min(r.m.avg, r.m.tmdb_rating), b = Math.max(r.m.avg, r.m.tmdb_rating);
    const cls = Math.abs(r.diff) < 0.005 ? "" : r.diff > 0 ? " pos" : " neg";
    const t = `<b>${esc(esc(r.m.title))}</b><br>Us ${fmt(r.m.avg, 2)} · TMDB ${fmt(r.m.tmdb_rating, 2)} <span class='m'>(${signed(r.diff)})</span>`;
    return `<div class="db-row" role="button" tabindex="0" data-movie="${r.m.id}" data-tip="${t}"><span class="db-t">${esc(r.m.title)}</span>
      <span class="db-track"><i class="db-line${cls}" style="left:${x(a).toFixed(2)}%;width:${(x(b) - x(a)).toFixed(2)}%"></i>
        <i class="db-dot w" style="left:${x(r.m.tmdb_rating).toFixed(2)}%"></i><i class="db-dot us" style="left:${x(r.m.avg).toFixed(2)}%"></i></span>
      <span class="db-v${cls}">${signed(r.diff)}</span></div>`;
  };
  $("#dumbbell").innerHTML = `<div class="db-legend"><span><i class="db-dot us"></i>Us</span><span><i class="db-dot w"></i>TMDB</span>
      <span><i class="db-key pos"></i>we liked it more</span><span><i class="db-key neg"></i>we liked it less</span></div>
    <div class="db-axis"><span class="db-t"></span><span class="db-track">${ticks}</span><span class="db-v"></span></div>
    <div class="db-rows">${rows.map(row).join("")}</div>`;
}

// Lone wolves: each score against the average of everyone else on that movie. Closed movies with 3+ scores,
// so "everyone else" is at least two people.
function loneWolves() {
  return closedMovies().filter((m) => m.ratings.length >= 3).map((m) => ({
    m, gaps: m.ratings.map((r) => {
      const others = mean(m.ratings.filter((x) => x !== r).map((x) => x.score));
      return { name: r.name, score: r.score, others, gap: r.score - others };
    }),
  }));
}

function renderWolves() {
  const movies = loneWolves();
  // the loneliest score on each movie, then the biggest of those (one per movie, so a split movie can't fill the list)
  const all = movies.map(({ m, gaps }) => ({ m, ...gaps.reduce((a, b) => (Math.abs(b.gap) > Math.abs(a.gap) ? b : a)) }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  $("#wolves").innerHTML = all.slice(0, 8).map((w) => `<li data-movie="${w.m.id}"${bw(Math.abs(w.gap) / Math.abs(all[0].gap), w.gap < 0)}><div>${esc(w.name)} on ${esc(w.m.title)}
      <div class="sub">${fmt(w.score)} vs the others' ${fmt(w.others, 2)} · ${w.gap > 0 ? "above" : "below"} the rest</div></div>
      <span class="v"><span class="${w.gap > 0 ? "pos" : "neg"}">${signed(w.gap, 1)}</span></span></li>`).join("")
    || `<p class="empty">Needs at least 3 scores per movie.</p>`;

  // the odd one out on each movie: the single furthest score (a tie for furthest counts for nobody)
  const seen = new Map(), odd = new Map();
  movies.forEach(({ gaps }) => {
    gaps.forEach((g) => seen.set(g.name, (seen.get(g.name) || 0) + 1));
    const s = [...gaps].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    if (Math.abs(s[0].gap) - Math.abs(s[1].gap) > 1e-9) odd.set(s[0].name, (odd.get(s[0].name) || 0) + 1);
  });
  const rows = [...seen].filter(([, n]) => n >= 3).map(([name, n]) => ({ name, n, k: odd.get(name) || 0 }))
    .sort((a, b) => b.k / b.n - a.k / a.n || b.k - a.k);
  $("#oddone").innerHTML = rows.map((r) => `<li${bw(r.k / r.n)}><div>${personLink(r.name)}<div class="sub">${r.k} of ${plural(r.n, "movie")}</div></div>
      <span class="v">${pct(r.k, r.n)}</span></li>`).join("") || `<p class="empty">Needs at least 3 scores per movie.</p>`;
}

// Movies the whole room agreed on: nobody under 7, or nobody over 7. Closed movies with 3+ scores.
function renderConsensus() {
  const ms = closedMovies().filter((m) => m.ratings.length >= 3).map((m) => {
    const s = m.ratings.map((r) => r.score);
    return { m, lo: Math.min(...s), hi: Math.max(...s), n: s.length };
  });
  const li = (x, sub) => `<li data-movie="${x.m.id}"><div>${esc(x.m.title)}<div class="sub">${sub(x)} · ${plural(x.n, "score")}</div></div>
      <span class="v">${fmt(x.m.avg, 2)}</span></li>`;
  $("#liked").innerHTML = ms.filter((x) => x.lo >= 7).sort((a, b) => b.lo - a.lo || b.m.avg - a.m.avg)
    .map((x) => li(x, (y) => `lowest ${fmt(y.lo)}`)).join("") || `<p class="empty">No movie yet where everyone gave 7 or more.</p>`;
  $("#unloved").innerHTML = ms.filter((x) => x.hi <= 7).sort((a, b) => a.hi - b.hi || a.m.avg - b.m.avg)
    .map((x) => li(x, (y) => `highest ${fmt(y.hi)}`)).join("") || `<p class="empty">No movie yet where nobody went above 7.</p>`;
}

// Score habits: each person's closed scores counted by whole number (1–4 lumped together), plus their lowest
// score and most used decimal. People with 3+ scores.
function renderHabits() {
  const by = new Map();
  closedMovies().forEach((m) => m.ratings.forEach((r) => by.set(r.name, [...(by.get(r.name) || []), r.score])));
  const cols = [["1–4", (x) => x < 5], ...[5, 6, 7, 8, 9].map((k) => [String(k), (x) => x >= k && x < k + 1]), ["10", (x) => x >= 10]];
  const rows = [...by].filter(([, s]) => s.length >= 3).map(([name, s]) => {
    const ends = new Map();
    s.forEach((x) => { const e = Math.round(x * 10) % 10; ends.set(e, (ends.get(e) || 0) + 1); });
    const [end, k] = [...ends].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return { name, n: s.length, counts: cols.map(([, f]) => s.filter(f).length), lo: Math.min(...s), end, k };
  }).sort((a, b) => b.n - a.n);
  if (!rows.length) { $("#habits").innerHTML = `<tbody><tr><td class="empty">No scores yet.</td></tr></tbody>`; $("#habits-sum").textContent = ""; return; }
  const cell = (c, n) => (c ? `<td style="background:rgba(var(--accent-rgb),${(0.08 + 0.6 * c / n).toFixed(2)})">${c}</td>` : `<td style="color:var(--muted)">·</td>`);
  $("#habits").innerHTML = `<thead><tr><th>Person</th><th data-tip="Scores given">Scores</th>${cols.map(([h]) => `<th>${h}</th>`).join("")}
      <th data-tip="Their lowest score">Lowest</th><th data-tip="The decimal they use most, and how often">Ending</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="pname">${personLink(r.name)}</td><td>${r.n}</td>${r.counts.map((c) => cell(c, r.n)).join("")}
      <td>${fmt(r.lo)}</td><td>.${r.end} <span style="color:var(--muted)">${pct(r.k, r.n)}</span></td></tr>`).join("")}</tbody>`;
  const floor = rows.filter((r) => r.lo >= 6).map((r) => r.name);
  $("#habits-sum").textContent = floor.length ? `Never below 6: ${floor.join(", ")}.` : "";
}

function renderPairs() {
  const ps = [...DATA.pairs].sort((a, b) => a.mean_gap - b.mean_gap);
  const k = Math.min(6, Math.floor(ps.length / 2));
  const gMax = Math.max(...ps.map((p) => p.mean_gap));
  const li = (p) => `<li${bw(p.mean_gap / gMax)}><div>${esc(p.a)} &amp; ${esc(p.b)}<div class="sub">${p.shared} movies in common</div></div><span class="v">${fmt(p.mean_gap, 2)}</span></li>`;
  $("#alike").innerHTML = ps.slice(0, k).map(li).join("") || `<p class="empty">Not enough overlap yet.</p>`;
  $("#unlike").innerHTML = ps.slice(-k).reverse().map(li).join("") || `<p class="empty">Not enough overlap yet.</p>`;
}
