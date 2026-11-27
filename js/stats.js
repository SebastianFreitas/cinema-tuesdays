// Stats panel: Overview tables, folding long lists, chapter chips, and renderStats/renderCharts.

function renderKpis() {
  const W = DATA.watched, all = W.flatMap((m) => m.ratings.map((r) => r.score));
  if (!all.length) { $("#kpis").innerHTML = ""; return; }
  const rated = W.filter((m) => m.avg != null);
  const runtimes = W.map((m) => m.runtime).filter(Boolean);
  const years = W.map((m) => m.year).filter(Boolean);
  const dates = W.map(lastSeen).filter(realDate).sort();
  const listMin = DATA.suggestions.reduce((t, m) => t + (m.runtime || 0), 0);
  const turnout = W.map((m) => m.ratings.length);
  const grpAvg = (g) => mean(W.flatMap((m) => m.ratings.filter((r) => memberInfo.get(r.name)?.group === g).map((r) => r.score)));
  const weeks = dates.length ? Math.floor((Date.now() - new Date(dates[0] + "T12:00:00")) / 6048e5) + 1 : 0;
  // weeks (counted from the first screening) that had at least one movie; some weeks had two, some none
  const weeksWithMovie = new Set(dates.map((d) => Math.floor((new Date(d + "T12:00:00") - new Date(dates[0] + "T12:00:00")) / 6048e5))).size;
  const tiles = [
    [W.length, "movies watched", dates.length ? `since ${date(dates[0])}` : ""],
    [all.length, "scores given", `by ${DATA.people.length} people`],
    [fmt(mean(all), 2), "average score", `median ${fmt(median(all), 1)}`],
    [fmt(mean(rated.map((m) => m.avg)), 2), "average per movie", `median ${fmt(median(rated.map((m) => m.avg)), 2)}`],
    [fmt(mean(turnout), 1), "scores per movie", `most ${Math.max(...turnout)}`],
    [runtimes.length ? Math.round(runtimes.reduce((a, b) => a + b, 0) / 60) + "h" : "–", "watched together", runtimes.length ? `avg ${hm(mean(runtimes))} a movie` : ""],
    [pct(all.filter((s) => s >= 8).length, all.length), "scores of 8 or more", `${all.filter((s) => s >= 9).length} scores of 9+`],
    [pct(all.filter((s) => s < 6).length, all.length), "scores under 6", `lowest ${fmt(Math.min(...all))}`],
    [years.length ? Math.round(median(years)) : "–", "typical release year", years.length ? `${Math.min(...years)} to ${Math.max(...years)}` : ""],
    [rated.filter((m) => m.avg >= 8).length, "movies averaging 8+", `${rated.filter((m) => m.avg < 6.5).length} under 6.5`],
    [fmt(grpAvg("alpha"), 2), `${GROUPS.alpha} average`, `${GROUPS.omega} ${fmt(grpAvg("omega"), 2)}`],
    [DATA.suggestions.length, "on the Movie List", listMin ? `${Math.round(listMin / 60)}h of movies` : ""],
    [weeks, "weeks running", `a movie in ${weeksWithMovie} of them`],
    [new Set(W.flatMap((m) => (m.director || "").split(", ").filter(Boolean))).size, "directors", `${new Set(W.flatMap((m) => m.genres || [])).size} genres`],
  ];
  // newer tiles: closed movies only (see isOpen)
  const done = closedMovies();
  const dirs = new Map();
  done.forEach((m) => (m.director || "").split(", ").filter(Boolean).forEach((d) => dirs.set(d, (dirs.get(d) || 0) + 1)));
  const topDir = Math.max(0, ...dirs.values()), topDirs = [...dirs].filter(([, n]) => n === topDir).map(([d]) => d);
  // how the person who picked a movie scored it, minus everyone else's average for it
  const bonus = done.flatMap((m) => {
    const others = m.ratings.filter((r) => !m.suggested_by.includes(r.name)).map((r) => r.score);
    return others.length ? m.ratings.filter((r) => m.suggested_by.includes(r.name)).map((r) => r.score - mean(others)) : [];
  });
  const sds = done.filter((m) => m.stdev != null).map((m) => m.stdev);
  const ownBonus = mean(bonus);
  tiles.push(
    [ownBonus == null ? "–" : `<span class="${ownBonus >= 0 ? "pos" : "neg"}">${signed(ownBonus)}</span>`, "own-pick bonus", "how pickers score their pick vs the rest"],
    [sds.length ? "±" + fmt(mean(sds), 2) : "–", "typical spread", "how much we disagree on a movie"],
    [topDir > 1 ? topDir : "–", "most by one director", topDir > 1 ? esc(topDirs.join(", ")) : "no repeats yet"],
  );
  // the four headline numbers lead, big; tiles that are a share get a thin meter
  const HERO = ["movies watched", "average score", "watched together", "weeks running"];
  const meter = {
    "scores of 8 or more": all.filter((s) => s >= 8).length / all.length,
    "scores under 6": all.filter((s) => s < 6).length / all.length,
    "weeks running": weeks ? weeksWithMovie / weeks : null,
  };
  const tile = ([v, l, s], hero) => `<div class="kpi${hero ? " big" : ""}"><b>${v}</b><span>${l}</span>${s ? `<small>${s}</small>` : ""}${meter[l] != null
    ? `<i class="kmeter"><i style="width:${(meter[l] * 100).toFixed(1)}%"></i></i>` : ""}</div>`;
  $("#kpis").innerHTML = `<div class="kpis-hero">${HERO.map((h) => tiles.find((t) => t[1] === h)).filter(Boolean).map((t) => tile(t, true)).join("")}</div>`
    + `<div class="kpis-rest">${tiles.filter((t) => !HERO.includes(t[1])).map((t) => tile(t)).join("")}</div>`;
}

const SCORE_COLS = [
  ["name", "Person"], ["count", "Scores"], ["turnout", "Turnout"], ["avg", "Avg"], ["median", "Median"],
  ["low", "Low"], ["high", "High"], ["spread", "Spread"], ["bias", "Bias"], ["eight", "8+"], ["picks", "Picks"], ["picksAvg", "Picks avg"], ["hit", "Hit rate"],
];
let scoreSort = { key: "count", dir: -1 };
function renderScorecard() {
  const n = DATA.watched.length;
  const rows = DATA.people.map((p) => {
    const mine = personStats(p.name).map((r) => r.score);
    const picks = picksOf(p.name);
    return {
      name: p.name, count: p.count, turnout: n ? p.count / n : null, avg: p.avg, median: median(mine),
      low: mine.length ? Math.min(...mine) : null, high: mine.length ? Math.max(...mine) : null,
      spread: stdev(mine), bias: p.bias, eight: mine.length ? mine.filter((s) => s >= 8).length / mine.length : null,
      picks: picks.length, picksAvg: picks.length ? mean(picks.map((m) => m.avg)) : null,
      hit: hitRate(p.name)?.rate ?? null,
    };
  });
  const { key, dir } = scoreSort;
  rows.sort((a, b) => key === "name" ? dir * a.name.localeCompare(b.name)
    : ((a[key] ?? -Infinity) - (b[key] ?? -Infinity)) * dir || a.name.localeCompare(b.name));
  // highlight the top value in the columns where "more" is notable
  const best = {};
  for (const k of ["count", "turnout", "avg", "median", "high", "eight", "picks", "picksAvg", "hit"]) {
    const vs = rows.filter((r) => r.count >= 5).map((r) => r[k]).filter((v) => v != null);   // one lucky score isn't a record
    best[k] = vs.length ? Math.max(...vs) : null;
  }
  const cell = (r, k) => {
    const v = r[k];
    if (v == null || !Number.isFinite(v)) return "–";
    if (k === "turnout" || k === "eight" || k === "hit") return pct(v, 1);
    if (k === "bias") return `<span class="${v >= 0 ? "pos" : "neg"}">${signed(v)}</span>`;
    if (k === "avg" || k === "picksAvg") return fmt(v, 2);
    if (k === "spread") return "±" + fmt(v, 2);
    if (k === "count" || k === "picks") return v;
    return fmt(v);
  };
  $("#scorecard").innerHTML = `<thead><tr>${SCORE_COLS.map(([k, l]) =>
      `<th data-sort="${k}" class="${k === key ? "on" : ""}" tabindex="0" aria-sort="${k === key ? (dir < 0 ? "descending" : "ascending") : "none"}">${l}${k === key ? (dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="pname">${avatar(r.name)}${personLink(r.name)}</td>${SCORE_COLS.slice(1).map(([k]) =>
      `<td class="${best[k] != null && r[k] === best[k] ? "best" : ""}">${cell(r, k)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

// The whole table of scores: a row per movie, a column per person, like the old spreadsheet. Closed movies only
// (see isOpen). A cell is blue above that movie's average and red below, stronger the further it is.
// `me` puts that person's column first, next to the average.
function scoreTable(ms, me) {
  const names = DATA.people.map((p) => p.name).filter((n) => n !== me);
  const cols = [...(me ? [me] : []), "", ...names];   // "" is the average column
  const cell = (m, n) => {
    const s = m.ratings.find((r) => r.name === n)?.score;
    if (s == null) return `<td class="none${n === me ? " me" : ""}">·</td>`;
    const d = m.avg == null ? 0 : s - m.avg;
    const bg = Math.abs(d) < 0.05 ? "" : ` style="background:rgba(${d > 0 ? "57,135,229" : "230,103,103"},${(0.1 + 0.3 * Math.min(1, Math.abs(d) / 3)).toFixed(2)})"`;
    return `<td class="${n === me ? "me" : ""}"${bg}>${fmt(s)}</td>`;
  };
  return `<div class="tbl-wrap scores"><table class="tbl"><thead><tr><th>Movie</th>${cols.map((n) => (n
      ? `<th class="${n === me ? "me" : ""}">${personLink(n)}</th>` : `<th data-tip="Group average">Avg</th>`)).join("")}</tr></thead>
    <tbody>${ms.map((m) => `<tr><td class="clip">${movieLink(m)}</td>${cols.map((n) => (n ? cell(m, n) : `<td class="gavg">${fmt(m.avg, 2)}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderTopBottom() {
  const rated = DATA.watched.filter((m) => m.avg != null && m.ratings.length >= 3).sort((a, b) => b.avg - a.avg);
  const li = (m) => `<li data-movie="${m.id}"${bw((m.avg - 5) / 5)}><div>${esc(m.title)}<div class="sub">${m.year ?? ""} · ${m.ratings.length} scores${m.suggested_by?.length ? ` · ${esc(m.suggested_by.join(", "))}` : ""}</div></div><span class="v">${fmt(m.avg, 2)}</span></li>`;
  const k = Math.min(8, Math.floor(rated.length / 2));
  $("#top").innerHTML = rated.slice(0, k).map(li).join("") || `<p class="empty">No scores yet.</p>`;
  $("#bottom").innerHTML = rated.slice(-k).reverse().map(li).join("") || `<p class="empty">No scores yet.</p>`;
}

function renderRecords() {
  const W = DATA.watched;
  const all = W.flatMap((m) => m.ratings.map((r) => ({ m, ...r })));
  if (!all.length) { $("#records").innerHTML = `<p class="empty">No scores yet.</p>`; return; }
  // every item sharing the best value, so ties aren't hidden
  const tops = (xs, f) => { const best = Math.max(...xs.map(f)); return xs.filter((x) => Math.abs(f(x) - best) < 1e-9); };
  const three = W.filter((m) => m.stdev != null && m.ratings.length >= 3);
  const timed = W.filter((m) => m.runtime), dated = W.filter((m) => m.year);
  const regulars = DATA.people.filter((p) => p.count >= 5);
  const spreads = regulars.map((p) => ({ p, s: stdev(personStats(p.name).map((r) => r.score)) }));
  const pickers = DATA.people.map((p) => {
    const picks = picksOf(p.name);
    return { p, n: picks.length, v: mean(picks.map((m) => m.avg)) };
  }).filter((x) => x.n >= 2);
  const scoreWho = (r) => `${esc(r.name)} · ${movieLink(r.m)}`;
  // [label, list to search, what to maximise, value shown, how to show one winner]
  const rec = [
    ["Highest score", all, (r) => r.score, (r) => fmt(r.score), scoreWho, (r) => `${r.name}: ${r.m.title}`],
    ["Lowest score", all, (r) => -r.score, (r) => fmt(r.score), scoreWho, (r) => `${r.name}: ${r.m.title}`],
    ["Most unanimous", three, (m) => -m.stdev, (m) => `±${fmt(m.stdev, 2)}`, movieLink],
    ["Most scores", W, (m) => m.ratings.length, (m) => m.ratings.length, movieLink],
    ["Longest", timed, (m) => m.runtime, (m) => hm(m.runtime), movieLink],
    ["Shortest", timed, (m) => -m.runtime, (m) => hm(m.runtime), movieLink],
    ["Oldest", dated, (m) => -m.year, (m) => m.year, movieLink],
    ["Newest", dated, (m) => m.year, (m) => m.year, movieLink],
    ["Most generous", regulars, (p) => p.avg, (p) => fmt(p.avg, 2), (p) => personLink(p.name), (p) => p.name],
    ["Toughest critic", regulars, (p) => -p.avg, (p) => fmt(p.avg, 2), (p) => personLink(p.name), (p) => p.name],
    ["Steadiest scorer", spreads, (x) => -x.s, (x) => "±" + fmt(x.s, 2), (x) => personLink(x.p.name), (x) => x.p.name],
    ["Best picks", pickers, (x) => x.v, (x) => `${fmt(x.v, 2)} over ${x.n}`, (x) => personLink(x.p.name), (x) => x.p.name],
  ].filter(([, xs]) => xs.length).map(([k, xs, f, val, show, plain = (m) => m.title]) => {
    const [first, ...rest] = tops(xs, f);
    const more = rest.length
      ? `<small class="more" data-tip="Tied with ${esc(esc(rest.map(plain).join(", ")))}">+${rest.length}</small>` : "";
    return [k, val(first), show(first), more];
  });
  $("#records").innerHTML = rec.map(([k, v, what, more]) => `<div><dt>${k}</dt><dd><b>${v}</b><span>${what}</span>${more}</dd></div>`).join("");
}

function groupTable(sel, groups, label) {
  const rows = groups.map(([k, ms]) => {
    const rated = ms.filter((m) => m.avg != null);
    return { k, n: ms.length, v: mean(rated.map((m) => m.avg)), best: rated.length ? rated.reduce((a, b) => (b.avg > a.avg ? b : a)) : null };
  }).filter((r) => r.v != null);
  $(sel).innerHTML = `<thead><tr><th>${label}</th><th>Movies</th><th colspan="2">Average</th><th>Best</th></tr></thead><tbody>${rows.map((r) =>
    `<tr><td>${esc(r.k)}</td><td>${r.n}</td><td>${fmt(r.v, 2)}</td><td class="barcell">${avgBar(r.v)}</td><td class="clip">${r.best ? movieLink(r.best) : ""}</td></tr>`).join("")}</tbody>`;
}

function renderGenres() {
  const add = (map, k, m) => map.set(k, [...(map.get(k) || []), m]);
  const g = new Map(), d = new Map();
  DATA.watched.forEach((m) => (m.genres || []).forEach((x) => add(g, x, m)));
  DATA.watched.filter((m) => m.year).forEach((m) => add(d, `${Math.floor(m.year / 10) * 10}s`, m));
  groupTable("#genres", [...g].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])), "Genre");
  groupTable("#decades", [...d].sort((a, b) => b[0].localeCompare(a[0])), "Decade");
}

// Long lists and tables: show the first n rows and a button for the rest.
function fold(sel, n) {
  const box = $(sel);
  if (!box) return;
  const items = [...(box.tBodies?.[0] ?? box).children].filter((el) => el.matches("li, tr, .db-row"));
  const after = box.closest(".tbl-wrap") ?? box;
  if (after.nextElementSibling?.classList.contains("fold-btn")) after.nextElementSibling.remove();
  if (items.length <= n + 2) return;   // not worth a button for one or two more
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "fold-btn";
  const set = (open) => {
    items.forEach((el, i) => (el.hidden = !open && i >= n));
    btn.textContent = open ? "Show fewer" : `Show all ${items.length}`;
    btn.setAttribute("aria-expanded", open);
  };
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    set(open);
    if (!open) box.closest(".chart-card")?.scrollIntoView({ block: "nearest" });
  });
  after.after(btn);
  set(false);
}

// Chapter chips: jump to a chapter, and light up the one being read.
let markChapter = () => {};
function setupChapters() {
  const chips = [...$$(".chap-nav [data-chap]")];
  chips.forEach((b) => b.addEventListener("click", () => $(`#${b.dataset.chap}`).scrollIntoView({ behavior: "smooth", block: "start" })));
  const mark = (id) => chips.forEach((b) => {
    const on = b.dataset.chap === id;
    if (on === b.classList.contains("on")) return;
    b.classList.toggle("on", on);
    if (on) { b.setAttribute("aria-current", "true"); b.parentElement.scrollTo({ left: b.offsetLeft - 16, behavior: "smooth" }); }
    else b.removeAttribute("aria-current");
  });
  // the chapter being read is the last one whose top has passed just under the chips
  const chapters = $$(".chapter");
  let queued = false;
  const update = () => {
    queued = false;
    if ($('[data-panel="stats"]').hidden) return;
    const line = $(".chap-nav").getBoundingClientRect().bottom + 24;
    mark([...chapters].reverse().find((c) => c.getBoundingClientRect().top <= line)?.id ?? chapters[0].id);
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  markChapter = update;
  update();
}

function renderStats() {
  $("#scores").innerHTML = scoreTable(closedMovies());
  renderKpis(); renderGroups(); renderScorecard(); renderTopBottom(); renderRecords(); renderFair(); renderWorld(); renderGenres(); renderAges(); renderOrigins(); renderActors(); renderBudgets(); renderObscurity(); renderWhen(); renderTravel(); renderTitles(); renderPairs(); renderRanks(); renderWolves(); renderConsensus(); renderHabits();
  [["#fair", 10], ["#world", 10], ["#dumbbell .db-rows", 12], ["#liked", 6], ["#unloved", 6], ["#actors-again", 6], ["#actors-list", 6], ["#title-num", 6]]
    .forEach(([sel, n]) => fold(sel, n));
  setupChapters();
  const sortBy = (th) => {
    const k = th.dataset.sort;
    scoreSort = { key: k, dir: scoreSort.key === k ? -scoreSort.dir : (k === "name" ? 1 : -1) };
    renderScorecard();
    $(`#scorecard th[data-sort="${k}"]`).focus();
  };
  $("#scorecard").addEventListener("click", (e) => { const th = e.target.closest("th[data-sort]"); if (th) sortBy(th); });
  $("#scorecard").addEventListener("keydown", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sortBy(th); }
  });
}

function renderCharts() { renderHistogram(); renderTimeline(); renderGrid(); renderScatters(); }
