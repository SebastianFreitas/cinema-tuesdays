const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? "–" : Number(n).toFixed(d));
// "+0.23" / "−0.40"; anything that rounds to zero shows as a plain "0.0" (no "−0.0")
const signed = (n, d = 2) => (Number(Math.abs(n).toFixed(d)) === 0 ? (0).toFixed(d) : (n > 0 ? "+" : "−") + Math.abs(n).toFixed(d));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const date = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-GB", opts);
const realDate = (iso) => iso && !iso.startsWith("1970");
// The site's fonts have no Greek, so the fallback α looks like an "a"; .gk draws it in Noto Serif italic instead.
const GROUPS = { alpha: `Group <span class="gk">α</span>`, omega: `Group <span class="gk">ω</span>` };
const personHref = (name) => `#person/${encodeURIComponent(name)}`;
const personLink = (name) => `<a href="${personHref(name)}">${esc(name)}</a>`;
const lastSeen = (m) => m.watched_on.at(-1);
const initials = (name) => [...name.trim()][0]?.toUpperCase() ?? "?";
// Discord avatar when the bot has one, otherwise the first letter.
const avatar = (name, big = false) => {
  const url = memberInfo.get(name)?.avatar, cls = `avatar${big ? " big" : ""}`;
  return url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">` : `<span class="${cls}">${esc(initials(name))}</span>`;
};

let DATA;
const byId = new Map();          // movie id -> movie (watched ones win over Movie List / poll copies)
const memberInfo = new Map();    // name -> {group, benched}

/* ---------------------------------------------------------------- shared bits */

function poster(m, { score, badge, muted } = {}) {
  const img = m.poster
    ? `<img src="${esc(m.poster)}" alt="" loading="lazy">`
    : `<div class="fallback">${esc(m.title)}</div>`;
  return `<div class="poster">${img}
    ${badge ? `<span class="badge${muted ? " muted" : ""}">${esc(badge)}</span>` : ""}
    ${score != null ? `<span class="score">${fmt(score)}</span><div class="meter"><span style="width:${score * 10}%"></span></div>` : ""}
  </div>`;
}

function watchedCard(m) {
  const when = lastSeen(m);
  const sub = [realDate(when) ? date(when) : m.year, m.suggested_by.length ? m.suggested_by.join(", ") : null]
    .filter(Boolean).map(esc).join(" · ");
  return `<button class="card" data-movie="${m.id}">${poster(m, { score: m.avg })}
    <div class="t">${esc(m.title)}</div><div class="s">${sub}</div></button>`;
}

function fillGenres(select, movies, label) {
  const genres = [...new Set(movies.flatMap((m) => m.genres || []))].sort();
  select.innerHTML = `<option value="">${label}</option>` + genres.map((g) => `<option>${esc(g)}</option>`).join("");
}

// Movie night is 21:15 in Portugal. Times are worked out in Lisbon time and shown in the viewer's own,
// with the Portuguese time added when the two differ (people abroad).
const LISBON = "Europe/Lisbon";
const lisbonParts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
  timeZone: LISBON, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short",
}).formatToParts(d).map((x) => [x.type, x.value]));
// The instant when it's `iso` hh:mm in Lisbon.
function lisbonTime(iso, hh = 0, mm = 0) {
  const [y, m, d] = iso.split("-").map(Number), want = Date.UTC(y, m - 1, d, hh, mm);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = lisbonParts(new Date(t));
    t += want - Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return new Date(t);
}
const addDays = (iso, n) => new Date(Date.UTC(...iso.split("-").map((v, i) => +v - (i === 1))) + n * 864e5).toISOString().slice(0, 10);
const lisbonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: LISBON }).format(new Date());
const clock = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const lisbonClock = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LISBON });
const abroad = (d) => clock(d) !== lisbonClock(d);
const ptNote = (d) => (abroad(d) ? ` <span class="ptime">(${lisbonClock(d)} in Portugal)</span>` : "");
// "tonight" / "tomorrow" / "Thu 15 Oct", by the viewer's calendar
function dayName(d, tonight = "tonight") {
  const key = (x) => x.toDateString(), now = new Date();
  if (key(d) === key(now)) return tonight;
  if (key(d) === key(new Date(now.getTime() + 864e5))) return "tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// The next screening: this Tuesday (Lisbon) unless the movie is already over (~2h15 after 21:15), else next week.
function nextScreening() {
  const today = lisbonToday(), dow = new Date(today + "T12:00:00Z").getUTCDay();
  let date = lisbonTime(addDays(today, (2 - dow + 7) % 7), 21, 15);
  if (Date.now() >= date.getTime() + 135 * 6e4) date = lisbonTime(addDays(today, (2 - dow + 7) % 7 + 7), 21, 15);
  const live = Date.now() >= date.getTime();
  const when = live ? "on right now" : `${dayName(date)}, ${clock(date)}`;
  return { date, when, live };
}

// Same rule as the bot: scores are open until midnight (Lisbon) at the end of the day after the screening.
const ratingCloses = (iso) => lisbonTime(addDays(iso, 2));
// "by tonight at 23:59" in the viewer's time, plus the Portuguese time if different
function rateBy(closes) {
  const last = new Date(closes - 6e4), day = dayName(last);
  return `by ${esc(day)}${day === "tonight" ? " at" : ","} ${clock(last)}${ptNote(last)}`;
}

/* ---------------------------------------------------------------- tooltip */

const tip = $("#tip");
function placeTip(e) {
  const pad = 14, r = tip.getBoundingClientRect();
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
function showTip(el, e) {
  // the movie popup sits in the browser's top layer, so the tooltip has to live inside it to show up
  const host = el.closest("dialog") || document.body;
  if (tip.parentElement !== host) host.append(tip);
  if (tip.dataset.for !== el.dataset.tip) { tip.innerHTML = el.dataset.tip; tip.dataset.for = el.dataset.tip; }
  tip.hidden = false;
  placeTip(e);
}
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;   // touch: tooltips open on tap instead (see tapTip)
  const el = e.target.closest?.("[data-tip]");
  if (!el) { tip.hidden = true; return; }
  showTip(el, e);
});
// Phones have no hover: the first tap on something with a tooltip shows it, a second tap acts as a click.
let lastPointer = "mouse";
document.addEventListener("pointerdown", (e) => (lastPointer = e.pointerType), { capture: true });
function tapTip(e) {
  if (lastPointer === "mouse") return false;
  const el = e.target.closest?.("[data-tip]");
  if (!el) { tip.hidden = true; return false; }
  if (!tip.hidden && tip.dataset.for === el.dataset.tip) { tip.hidden = true; return false; }
  showTip(el, e);
  return true;
}
document.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") tip.hidden = true; });
document.addEventListener("scroll", () => (tip.hidden = true), { passive: true });

/* ---------------------------------------------------------------- hero */

function renderHero() {
  const latest = DATA.watched[0];
  const bg = DATA.watched.find((m) => m.backdrop)?.backdrop;
  if (bg) {
    const img = new Image();
    img.onload = () => { $("#hero-bg").style.backgroundImage = `url("${bg}")`; $("#hero-bg").classList.add("on"); };
    img.src = bg;
  }
  const next = nextScreening();
  $("#tagline").innerHTML = `Movie night every ${next.date.toLocaleDateString("en-GB", { weekday: "long" })} at ${clock(next.date)}${ptNote(next.date)}`;

  const dateTile = `<div class="date-tile"><span>${next.date.toLocaleDateString("en-GB", { month: "short" })}</span><b>${next.date.getDate()}</b></div>`;
  const label = `Up next · ${esc(next.when)}${next.live ? "" : ptNote(next.date)}`;
  let up;
  if (DATA.next_up) {
    const m = DATA.next_up;
    up = `<a class="spot" href="#list">${m.poster ? `<img src="${esc(m.poster)}" alt="">` : dateTile}
      <div><div class="label">${label}</div><h3>${esc(m.title)}</h3>
      <p>${[m.year, m.director].filter(Boolean).map(esc).join(" · ")}</p></div></a>`;
  } else if (DATA.poll) {
    const opts = [...DATA.poll.options].sort((a, b) => b.votes - a.votes);
    const total = opts.reduce((s, o) => s + o.votes, 0);
    up = `<a class="spot" href="#list">${dateTile}
      <div><div class="label">${label}</div>
      <h3>Voting now${DATA.poll.group ? ` · ${GROUPS[DATA.poll.group]}` : ""}</h3>
      <p>${opts.length} movies, ${total} vote${total === 1 ? "" : "s"}${total ? ` · leading: ${esc(opts[0].title)}` : ""}</p></div></a>`;
  } else {
    const g = DATA.next_group && GROUPS[DATA.next_group];
    up = `<a class="spot" href="#list">${dateTile}
      <div><div class="label">${label}</div>
      <h3>${g ? `${g}'s turn to pick` : "Movie to be announced"}</h3>
      <p>The movie is announced on Discord · see the Movie List →</p></div></a>`;
  }

  let last = "";
  if (latest) {
    const seen = lastSeen(latest);
    const closes = realDate(seen) ? ratingCloses(seen) : null;
    const open = closes && new Date() < closes;
    const n = latest.ratings.length;
    last = `<button class="spot${open ? " rate" : ""}" data-movie="${latest.id}">${latest.poster ? `<img src="${esc(latest.poster)}" alt="">` : ""}
      <div><div class="label">Last watched${realDate(seen) ? ` · ${date(seen, { day: "numeric", month: "short" })}` : ""}</div>
      <h3>${esc(latest.title)}</h3>
      ${open
        ? `<p class="cta">⭐ Rate it on Discord ${rateBy(closes)}</p><p>${n ? `${n} score${n === 1 ? "" : "s"} so far · average ${fmt(latest.avg, 2)}` : "No scores yet"}</p>`
        : `<p>Group average <b style="color:var(--text)">${fmt(latest.avg, 2)}</b> from ${n} score${n === 1 ? "" : "s"}</p>`}</div></button>`;
  }
  $("#spotlight").innerHTML = up + last;

  const scores = DATA.watched.flatMap((m) => m.ratings.map((r) => r.score));
  const tiles = [
    [DATA.watched.length, "movies watched"],
    [scores.length, "scores given"],
    [fmt(mean(scores), 2), "average score"],
    [DATA.suggestions.length, "on the Movie List"],
  ];
  $("#tiles").innerHTML = tiles.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join("");
  renderFacts();
}

// A line of small headline numbers under the hero tiles. Leaves out a movie whose rating is still open.
function renderFacts() {
  const done = closedMovies(), rated = done.filter((m) => m.avg != null);
  const mins = sum(DATA.watched.map((m) => m.runtime || 0));
  const first = DATA.watched.map(lastSeen).filter(realDate).sort()[0];
  const days = first ? Math.round((new Date(lisbonToday() + "T12:00:00Z") - new Date(first + "T12:00:00Z")) / 864e5) : null;
  const top = rated.filter((m) => m.ratings.length >= 3).sort((a, b) => b.avg - a.avg)[0];
  const lastDone = rated.find((m) => realDate(lastSeen(m)));   // DATA.watched is newest first
  const grpPicks = (g) => mean(rated.filter((m) => m.suggested_by.some((n) => memberInfo.get(n)?.group === g)).map((m) => m.avg));
  const gen = generosity();
  const facts = [
    mins && `<b>${Math.round(mins / 60)}h</b> watched`,
    days != null && `<b>${days}</b> days since the first movie`,
    `<b>${new Set(done.flatMap((m) => m.ratings.map((r) => r.name))).size}</b> people have scored`,
    top && `top: ${movieLink(top)} <b>${fmt(top.avg, 2)}</b>`,
    lastDone && `last result: ${movieLink(lastDone)} <b>${fmt(lastDone.avg, 2)}</b>`,
    gen.length > 1 && `kindest: ${personLink(gen[0].name)} <b>${fmt(gen[0].avg, 2)}</b>`,
    gen.length > 1 && `toughest: ${personLink(gen.at(-1).name)} <b>${fmt(gen.at(-1).avg, 2)}</b>`,
    rated.length && `picks: ${GROUPS.alpha} <b>${fmt(grpPicks("alpha"), 2)}</b> vs ${GROUPS.omega} <b>${fmt(grpPicks("omega"), 2)}</b>`,
  ].filter(Boolean);
  $("#facts").innerHTML = facts.map((f) => `<span>${f}</span>`).join("");
}

/* ---------------------------------------------------------------- watched */

function renderWall() {
  const q = $("#search").value.trim().toLowerCase();
  const genre = $("#genre").value;
  const by = {
    date: (a, b) => lastSeen(b).localeCompare(lastSeen(a)),
    avg: (a, b) => (b.avg ?? -1) - (a.avg ?? -1),
    low: (a, b) => (a.avg ?? 99) - (b.avg ?? 99),
    stdev: (a, b) => (b.stdev ?? -1) - (a.stdev ?? -1),
    count: (a, b) => b.ratings.length - a.ratings.length,
  }[$("#sort").value];
  const list = DATA.watched
    .filter((m) => !q || m.title.toLowerCase().includes(q) || (m.director || "").toLowerCase().includes(q))
    .filter((m) => !genre || (m.genres || []).includes(genre))
    .sort(by);
  $("#wall").innerHTML = list.length ? list.map(watchedCard).join("") : `<p class="empty">Nothing matches.</p>`;
}

/* ---------------------------------------------------------------- detail */

function openDetail(id) {
  const m = byId.get(id);
  if (!m) return;
  const watched = Array.isArray(m.ratings);
  const ratings = m.ratings ?? [];
  const meta = [m.year, m.director, m.runtime && `${Math.floor(m.runtime / 60)}h${String(m.runtime % 60).padStart(2, "0")}`]
    .filter(Boolean).map(esc).join(" · ");
  const seen = (m.watched_on ?? []).filter(realDate).map((d) => date(d)).join(", ");
  const strip = ratings.length
    ? `<div class="strip" aria-hidden="true">
        ${[0, 2, 4, 6, 8, 10].map((t) => `<span class="tick" style="left:${t * 10}%">${t}</span>`).join("")}
        ${m.avg != null ? `<span class="avg" style="left:${m.avg * 10}%" data-tip="Group average <b>${fmt(m.avg, 2)}</b>"></span>` : ""}
        ${ratings.map((r) => `<span class="pt" style="left:${r.score * 10}%" data-tip="<b>${esc(esc(r.name))}</b> ${fmt(r.score)}"></span>`).join("")}
      </div>` : "";
  $("#detail").innerHTML = `<div class="d-actions"><button class="share" aria-label="Copy link to this movie">🔗 Copy link</button>
    <button class="close" aria-label="Close">✕</button></div>
    ${m.backdrop ? `<div class="d-back" style="background-image:url('${esc(m.backdrop)}')"></div>` : ""}
    <div class="d-head">${m.poster ? `<img src="${esc(m.poster)}" alt="">` : ""}
      <div><h3>${esc(m.title)}</h3><div class="meta">${meta}</div>
      ${m.genres?.length ? `<div class="chips">${m.genres.map((g) => `<span>${esc(g)}</span>`).join("")}</div>` : ""}
      ${m.tmdb ? `<div class="meta"><a href="${esc(m.tmdb)}" target="_blank" rel="noopener">TMDB ↗</a></div>` : ""}</div></div>
    ${m.overview ? `<p class="overview">${esc(m.overview)}</p>` : ""}
    <div class="d-stats">
      ${watched ? `<div>Average<b>${fmt(m.avg, 2)}</b></div>
      <div>Spread<b>${m.stdev != null ? "±" + fmt(m.stdev, 2) : "–"}</b></div>
      <div>Scores<b>${ratings.length}</b></div>` : `<div>Status<b class="sm">Not watched yet</b></div>`}
      ${seen ? `<div>Watched<b class="sm">${seen}</b></div>` : ""}
      ${m.suggested_by?.length ? `<div>Suggested by<b class="sm">${m.suggested_by.map(personLink).join(", ")}</b></div>` : ""}
      ${m.tmdb_rating != null && m.tmdb_votes >= MIN_TMDB_VOTES ? `<div>TMDB<b class="sm">${fmt(m.tmdb_rating)} <small style="color:var(--muted)">${m.tmdb_votes.toLocaleString("en-GB")} votes</small></b></div>` : ""}
      ${m.lost_votes ? `<div>Past votes<b class="sm">Lost ${m.lost_votes}</b></div>` : ""}
    </div>
    ${strip}
    <ul class="ratings">${ratings.map((r) => `<li><span class="n">${fmt(r.score)}</span>
      <div>${personLink(r.name)}</div>
      <div class="bar"><span style="width:${r.score * 10}%"></span></div>
      ${r.remark ? `<div class="r">${esc(r.remark)}</div>` : ""}</li>`).join("")}</ul>`;
  if (!$("#detail").open) $("#detail").showModal();
  $("#detail").scrollTop = 0;
}

/* ---------------------------------------------------------------- movie list */

let listView = "person";

function renderPoll() {
  const p = DATA.poll;
  if (!p) { $("#poll").innerHTML = ""; return; }
  const max = Math.max(1, ...p.options.map((o) => o.votes));
  const total = p.options.reduce((s, o) => s + o.votes, 0);
  $("#poll").innerHTML = `<div class="poll"><div class="label">Voting now${p.group ? ` · ${GROUPS[p.group]}'s week` : ""}</div>
    <h2>This week's vote</h2>
    <div class="wall">${p.options.map((o) => `<div class="card" role="button" tabindex="0" data-movie="${o.id}">${poster(o, { badge: o.curated ? "🎩 Curated" : null })}
      <div class="t">${esc(o.title)}</div>
      <div class="s">${o.curated ? "Cultured Snobs' pick" : o.suggested_by.map(personLink).join(", ")}</div>
      <div class="votes"><div class="track"><span style="width:${(o.votes / max) * 100}%"></span></div><b>${o.votes}</b></div>
    </div>`).join("")}</div>
    <p class="hint" style="margin:14px 0 0">${total} vote${total === 1 ? "" : "s"} so far. Vote with the buttons in #movie-night-cartaz.</p></div>`;
}

function listCard(m, showWho) {
  const meta = [m.year, m.runtime && `${m.runtime} min`].filter(Boolean).join(" · ");
  const lost = m.lost_votes ? `Lost ${m.lost_votes} vote${m.lost_votes === 1 ? "" : "s"}` : null;
  return `<div class="card" role="button" tabindex="0" data-movie="${m.id}">${poster(m, { badge: lost, muted: true })}<div class="t">${esc(m.title)}</div>
    <div class="s">${showWho ? m.suggested_by.map(personLink).join(", ") : esc(meta)}</div></div>`;
}

function renderList() {
  const q = $("#lsearch").value.trim().toLowerCase();
  const genre = $("#lgenre").value;
  const maxLen = Number($("#lruntime").value) || Infinity;
  const list = DATA.suggestions
    .filter((m) => !q || m.title.toLowerCase().includes(q) || (m.director || "").toLowerCase().includes(q))
    .filter((m) => !genre || (m.genres || []).includes(genre))
    .filter((m) => maxLen === Infinity || (m.runtime && m.runtime < maxLen));

  if (!DATA.suggestions.length) { $("#suggestions").innerHTML = `<p class="empty">The Movie List is empty.</p>`; return; }
  if (!list.length) { $("#suggestions").innerHTML = `<p class="empty">Nothing matches.</p>`; return; }

  if (listView === "all") {
    $("#suggestions").innerHTML = `<div class="wall small">${list.map((m) => listCard(m, true)).join("")}</div>`;
    return;
  }

  const perPerson = new Map();
  for (const m of list) for (const who of m.suggested_by) {
    if (!perPerson.has(who)) perPerson.set(who, []);
    perPerson.get(who).push(m);
  }
  const totals = new Map();
  for (const m of DATA.suggestions) for (const who of m.suggested_by) totals.set(who, (totals.get(who) || 0) + 1);

  const order = [DATA.next_group, DATA.next_group === "alpha" ? "omega" : "alpha", null];
  const sections = order.map((g) => {
    const names = [...perPerson.keys()].filter((n) => (memberInfo.get(n)?.group ?? null) === g).sort((a, b) => a.localeCompare(b));
    if (!names.length) return "";
    const head = g
      ? `<div class="group-head"><h2>${GROUPS[g]}</h2><span class="sub">${g === DATA.next_group ? "their picks go to the next vote" : "the week after"}</span></div>`
      : (order.slice(0, 2).some((x) => [...perPerson.keys()].some((n) => memberInfo.get(n)?.group === x))
        ? `<div class="group-head"><h2>No group yet</h2></div>` : "");
    return head + names.map((n) => `<div class="who">${avatar(n)}${personLink(n)}
        <span class="n">${totals.get(n)}/10</span>
        ${memberInfo.get(n)?.benched ? `<span class="pill warn" title="Their pick won last time">sits out the next vote</span>` : ""}</div>
      <div class="wall small">${perPerson.get(n).map((m) => listCard(m, false)).join("")}</div>`).join("");
  });
  $("#suggestions").innerHTML = sections.join("");
}

/* ---------------------------------------------------------------- people */

function personStats(name) {
  const rows = [];
  for (const m of DATA.watched) {
    const mine = m.ratings.find((r) => r.name === name);
    if (!mine) continue;
    const others = m.ratings.filter((r) => r.name !== name).map((r) => r.score);
    rows.push({ m, score: mine.score, others: mean(others), nOthers: others.length });
  }
  return rows;
}

function allNames() {
  const names = new Set(DATA.people.map((p) => p.name));
  DATA.members.forEach((m) => m.group && names.add(m.name));   // members with no group and no scores/picks stay hidden
  DATA.suggestions.forEach((s) => s.suggested_by.forEach((n) => names.add(n)));
  const count = new Map(DATA.people.map((p) => [p.name, p.count]));
  return [...names].sort((a, b) => (count.get(b) || 0) - (count.get(a) || 0) || a.localeCompare(b));
}

function renderPeople() {
  const stats = new Map(DATA.people.map((p) => [p.name, p]));
  $("#people").innerHTML = allNames().map((name) => {
    const p = stats.get(name);
    const g = memberInfo.get(name)?.group;
    const sub = [g && GROUPS[g], p ? `${p.count} score${p.count === 1 ? "" : "s"}` : "no scores yet"].filter(Boolean).join(" · ");
    let body = "";
    if (p) {
      const bins = Array(10).fill(0);
      personStats(name).forEach((r) => bins[Math.min(9, Math.floor(r.score))]++);
      const top = Math.max(...bins);
      body = `<div class="spark" role="img" aria-label="How ${esc(name)}'s scores spread from 0 to 10">${bins.map((b) => `<span style="height:${(b / top) * 100}%"></span>`).join("")}</div>
        <div class="kv"><span>Average</span><b>${fmt(p.avg, 2)}</b></div>
        <div class="kv"><span>Bias</span><b class="${p.bias >= 0 ? "pos" : "neg"}">${signed(p.bias)}</b></div>
        <div class="kv"><span>Favourite</span><b>${esc(p.favourite.title)}</b></div>`;
    }
    return `<a class="person-card" href="${personHref(name)}"><div class="top">${avatar(name)}
      <div><h3>${esc(name)}</h3><div class="sub">${sub}</div></div></div>${body}</a>`;
  }).join("");
}

// Extra tiles and boxes for a person page, from closed movies only (see isOpen).
function personMore(name, rows, picks) {
  const done = rows.filter((r) => !isOpen(r.m));
  const closed = closedMovies();
  const tiles = [], hint = (t) => `<p class="hint">${t}</p>`;
  let grid = "", wide = "";

  // turnout and streaks over closed screenings with a known date, oldest first
  const seq = closed.filter((m) => realDate(lastSeen(m))).sort((a, b) => lastSeen(a).localeCompare(lastSeen(b)));
  const scored = new Set(done.map((r) => r.m.id));
  let run = 0, longest = 0;
  seq.forEach((m) => { run = scored.has(m.id) ? run + 1 : 0; longest = Math.max(longest, run); });

  if (done.length) {
    const scores = done.map((r) => r.score);
    const gen = generosity(), place = gen.findIndex((x) => x.name === name);
    const hi = done.reduce((a, b) => (b.score > a.score ? b : a)), lo = done.reduce((a, b) => (b.score < a.score ? b : a));
    const vs = done.filter((r) => r.nOthers > 0).map((r) => ({ ...r, diff: r.score - r.others }));
    const up = vs.filter((r) => r.diff >= 0.05).length, down = vs.filter((r) => r.diff <= -0.05).length;
    const remarks = done.filter((r) => r.m.ratings.find((x) => x.name === name)?.remark).length;
    const firstSeen = seq.find((m) => scored.has(m.id));
    if (place >= 0) tiles.push([ord(place + 1), `most generous of ${gen.length}`, "", "by average score, 3+ scores"]);
    if (scores.length > 1) tiles.push([`±${fmt(stdev(scores), 2)}`, "score spread", "", "how much their scores vary"]);
    tiles.push(
      [fmt(median(scores), 2), "median score", "", "half their scores are above"],
      [fmt(hi.score), "highest score", "", esc(hi.m.title)],
      [fmt(lo.score), "lowest score", "", esc(lo.m.title)],
      [pct(done.length, closed.length), "turnout", "", `${done.length} of ${closed.length} movies scored`],
      [run, "in a row now", "", `movies scored back to back · best ${longest}`],
    );
    if (vs.length) tiles.push([pct(up, vs.length), "higher than the others", "", `lower ${pct(down, vs.length)} · level ${pct(vs.length - up - down, vs.length)}`]);
    tiles.push(
      [pct(scores.filter((s) => s === Math.round(s)).length, scores.length), "whole numbers", "", "scores like 7 rather than 7.5"],
      [remarks, remarks === 1 ? "remark" : "remarks", "", `on ${pct(remarks, scores.length)} of their scores`],
    );
    if (firstSeen) tiles.push([date(lastSeen(firstSeen), { month: "short", year: "numeric" }), "first score", "", esc(firstSeen.title)]);

    // closest to and furthest from everyone else
    if (vs.length >= 2) {
      const byGap = [...vs].sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff)), k = Math.min(3, vs.length >> 1);
      const li = (r) => `<li><button class="tt" data-movie="${r.m.id}">${esc(r.m.title)}</button>
        <span class="pair"><small>others ${fmt(r.others)}</small><b class="${Math.abs(r.diff) < 0.05 ? "" : r.diff > 0 ? "pos" : "neg"}">${signed(r.diff, 1)}</b></span></li>`;
      grid += `<div class="box"><h3>With and against the group</h3>${hint("Their score minus everyone else's average.")}
        <h4 class="sub-h" style="margin:0 0 2px">Most in line</h4><ul class="mini">${byGap.slice(0, k).map(li).join("")}</ul>
        <h4 class="sub-h" style="margin:12px 0 2px">Most at odds</h4><ul class="mini">${byGap.slice(-k).reverse().map(li).join("")}</ul></div>`;
    }

    // average per decade the movie came out
    const dec = new Map();
    done.filter((r) => r.m.year).forEach((r) => { const k = Math.floor(r.m.year / 10) * 10; dec.set(k, [...(dec.get(k) || []), r.score]); });
    if (dec.size) {
      grid += `<div class="box"><h3>By decade</h3>${hint("Their average per decade the movie came out.")}
        <ul class="mini">${[...dec].sort((a, b) => b[0] - a[0]).map(([d, s]) => `<li><span class="tt">${d}s <small style="color:var(--muted)">${s.length}</small></span><b>${fmt(mean(s))}</b></li>`).join("")}</ul></div>`;
    }

    // scores over time: the chart is drawn by renderTrend once the page is showing (it needs the width)
    wide = `<div class="box" style="margin-bottom:28px"><h3>Over time</h3>${hint("Their score and the group average for each movie, oldest first. Blue: above the group, red: below.")}
      <div class="legend"><span><i style="background:var(--accent)"></i>Their score</span><span><i style="background:var(--muted)"></i>Group average (dashed)</span></div>
      <div id="p-trend" class="chart" data-name="${esc(name)}"></div></div>`;
  }

  // how close their scores are to TMDB's
  const agree = tmdbAgreement(), me = agree.findIndex((x) => x.name === name);
  if (me >= 0) tiles.push([`±${fmt(agree[me].gap, 2)}`, "from TMDB", "",
    `${ord(me + 1)} closest of ${agree.length} · usually ${fmt(Math.abs(agree[me].lean), 2)} ${agree[me].lean < 0 ? "below" : "above"}`]);

  // their picks, placed among every closed movie
  const { rank, total } = movieRanks();
  const ranked = picks.filter((m) => rank.has(m.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  if (ranked.length) {
    tiles.push([fmt(mean(ranked.map((m) => rank.get(m.id))), 1), "avg place of picks", "", `among ${total} movies, 1 = best`]);
    const hr = hitRate(name);
    if (hr) tiles.push([pct(hr.hits, hr.n), "pick hit rate", "", `${hr.hits} of ${hr.n} picks above the average movie (${fmt(hr.bar, 2)})`]);
    grid += `<div class="box"><h3>Their picks, ranked</h3>${hint(`Group average, and where it sits among all ${total} movies.`)}
      <ul class="mini">${ranked.map((m) => `<li><button class="tt" data-movie="${m.id}">${esc(m.title)}</button>
        <span class="pair"><small>${ord(rank.get(m.id))} of ${total}</small><b>${fmt(m.avg, 2)}</b></span></li>`).join("")}</ul></div>`;
  }
  return { tiles, grid, wide };
}

// Their score vs the group average per movie, in date order (person page).
function renderTrend() {
  const el = $("#p-trend");
  if (!el || !el.clientWidth) return;
  const name = el.dataset.name;
  const pts = personStats(name).filter((r) => !isOpen(r.m) && realDate(lastSeen(r.m)) && r.m.avg != null)
    .sort((a, b) => lastSeen(a.m).localeCompare(lastSeen(b.m)));
  if (pts.length < 2) { el.innerHTML = `<p class="empty" style="padding:8px 0">Needs a couple of scores first.</p>`; return; }
  const W = el.clientWidth, H = 170, L = 30, R = 10, T = 12, B = 24;
  const vals = pts.flatMap((p) => [p.score, p.m.avg]);
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 0.3)), hi = Math.min(10, Math.ceil(Math.max(...vals) + 0.3));
  const x = (i) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let body = `<g class="grid">`;
  for (let v = lo; v <= hi; v += hi - lo > 5 ? 2 : 1) body += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  body += `</g>`;
  [...new Set([0, pts.length >> 1, pts.length - 1])].forEach((i) => {
    const anchor = i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle";
    body += `<text x="${x(i)}" y="${H - 6}" text-anchor="${anchor}">${date(lastSeen(pts[i].m), { day: "numeric", month: "short" })}</text>`;
  });
  const path = (f) => pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(f(p))}`).join("");
  body += `<path class="gline" d="${path((p) => p.m.avg)}"/><path class="line" d="${path((p) => p.score)}"/>`;
  pts.forEach((p, i) => {
    const d = p.score - p.m.avg;
    body += `<circle class="dot${d >= 0.05 ? " hi" : d <= -0.05 ? " lo" : ""}" cx="${x(i)}" cy="${y(p.score)}" r="4"/>`;
  });
  pts.forEach((p, i) => {
    const a = i ? (x(i - 1) + x(i)) / 2 : L, b = i < pts.length - 1 ? (x(i) + x(i + 1)) / 2 : W - R;
    const t = `<b>${esc(esc(p.m.title))}</b><br>${date(lastSeen(p.m))}<br>${esc(esc(name))}: ${fmt(p.score)} <span class='m'>· group ${fmt(p.m.avg, 2)}</span>`;
    body += `<rect class="hit" data-movie="${p.m.id}" x="${a}" y="${T}" width="${b - a}" height="${H - T - B}" data-tip="${t}"/>`;
  });
  el.innerHTML = svg(W, H, body, `${name}'s scores over ${pts.length} movies next to the group average`);
}

function renderPerson(name) {
  const p = DATA.people.find((x) => x.name === name);
  const info = memberInfo.get(name);
  const rows = personStats(name);
  const open = DATA.suggestions.filter((m) => m.suggested_by.includes(name));
  const picks = DATA.watched.filter((m) => m.suggested_by.includes(name));
  if (!p && !open.length && !picks.length && !info) {
    $("#person").innerHTML = `<a class="back" href="#people">← People</a><p class="empty">No one called ${esc(name)} here.</p>`;
    return;
  }

  const head = `<a class="back" href="#people">← People</a>
    <div class="p-head">${avatar(name, true)}<div><h2>${esc(name)}</h2>
    <div class="sub">${[info?.group && GROUPS[info.group], info?.benched && "sits out the next vote"].filter(Boolean).join(" · ") || "&nbsp;"}</div></div></div>`;

  const pickAvg = mean(picks.map((m) => m.avg).filter((x) => x != null));
  const tiles = [
    p && [fmt(p.avg, 2), "average score"],
    p && [p.count, "movies scored"],
    p && [signed(p.bias), "vs the group", p.bias >= 0 ? "pos" : "neg"],
    [picks.length, "of their picks watched"],
    pickAvg != null && [fmt(pickAvg, 2), "group avg for their picks"],
    [open.length, "on the Movie List", "", open.some((m) => m.lost_votes) ? `lost ${plural(sum(open.map((m) => m.lost_votes || 0)), "vote")} so far` : ""],
  ].filter(Boolean);
  const more = personMore(name, rows, picks);
  tiles.push(...more.tiles);

  let boxes = "";
  if (p) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const item = (r) => `<li><button class="tt" data-movie="${r.m.id}">${esc(r.m.title)}</button>
      <span class="pair">${r.others != null ? `<small data-tip="Everyone else's average">others ${fmt(r.others)}</small>` : ""}<b>${fmt(r.score)}</b></span></li>`;

    const mine = DATA.pairs.filter((x) => x.a === name || x.b === name)
      .map((x) => ({ other: x.a === name ? x.b : x.a, gap: x.mean_gap, shared: x.shared }))
      .sort((a, b) => a.gap - b.gap);
    const mates = mine.length >= 2
      ? `<div class="mate">${avatar(mine[0].other)}<div><div class="label">Taste twin</div>
          ${personLink(mine[0].other)}<div class="sub">${fmt(mine[0].gap, 2)} apart on average over ${mine[0].shared} movies</div></div></div>
         <div class="mate">${avatar(mine.at(-1).other)}<div><div class="label">Nemesis</div>
          ${personLink(mine.at(-1).other)}<div class="sub">${fmt(mine.at(-1).gap, 2)} apart on average over ${mine.at(-1).shared} movies</div></div></div>`
      : "";

    const genres = new Map();
    rows.forEach((r) => (r.m.genres || []).forEach((g) => { if (!genres.has(g)) genres.set(g, []); genres.get(g).push(r.score); }));
    const gl = [...genres].filter(([, s]) => s.length >= 2).map(([g, s]) => ({ g, avg: mean(s), n: s.length }))
      .sort((a, b) => b.avg - a.avg);

    boxes = `<div class="p-grid">
      <div class="box"><h3>Favourites</h3><p class="hint">Their score, and everyone else's average.</p><ul class="mini">${sorted.slice(0, 5).map(item).join("")}</ul></div>
      ${sorted.length > 5 ? `<div class="box"><h3>Least favourite</h3><p class="hint">Their score, and everyone else's average.</p><ul class="mini">${sorted.slice(5).slice(-5).reverse().map(item).join("")}</ul></div>` : ""}
      ${mates ? `<div class="box"><h3>Taste twin &amp; nemesis</h3>${mates}</div>` : ""}
      ${gl.length ? `<div class="box"><h3>Genres</h3><p class="hint">Their average per genre (2+ movies).</p>
        <ul class="mini">${gl.slice(0, 6).map((x) => `<li><span class="tt">${esc(x.g)} <small style="color:var(--muted)">${x.n}</small></span><b>${fmt(x.avg)}</b></li>`).join("")}</ul></div>` : ""}
      ${more.grid}
    </div>${more.wide}`;

    const cmp = rows.filter((r) => r.nOthers > 0).map((r) => ({ ...r, diff: r.score - r.others })).sort((a, b) => b.diff - a.diff);
    if (cmp.length) {
      const span = Math.max(1, ...cmp.map((r) => Math.abs(r.diff)));
      boxes += `<div class="box" style="margin-bottom:28px"><h3>Compared with everyone else</h3>
        <p class="hint">Their score minus the average of everyone else who scored the same movie.</p>
        <div class="legend"><span><i style="background:var(--pos)"></i>Scored it higher</span><span><i style="background:var(--neg)"></i>Scored it lower</span></div>
        <ul class="diverge">${cmp.map((r) => {
          const w = (Math.abs(r.diff) / span) * 50;
          const t = `<b>${esc(esc(r.m.title))}</b><br>${esc(esc(name))}: ${fmt(r.score)}<br><span class='m'>Everyone else: ${fmt(r.others, 2)} (${r.nOthers})</span>`;
          return `<li data-movie="${r.m.id}" data-tip="${t}"><span class="tt">${esc(r.m.title)}</span>
            <span class="axis"><span class="${r.diff >= 0 ? "up" : "down"}" style="width:${w}%"></span></span>
            <span class="v ${Math.abs(r.diff) < 0.05 ? "" : r.diff > 0 ? "pos" : "neg"}">${signed(r.diff, 1)}</span></li>`;
        }).join("")}</ul></div>`;
    }
  } else if (more.grid) boxes = `<div class="p-grid">${more.grid}</div>`;

  // Rating is only open until the end of the day after a screening, so "to rate" is at most the latest movie.
  const latest = DATA.watched[0];
  const unrated = info || p ? DATA.watched.filter((m) => realDate(lastSeen(m)) && !m.ratings.some((r) => r.name === name)) : [];
  let todo = "";
  if (latest && unrated.includes(latest) && new Date() < ratingCloses(lastSeen(latest))) {
    todo = `<button class="spot rate todo" data-movie="${latest.id}">${latest.poster ? `<img src="${esc(latest.poster)}" alt="">` : ""}
      <div><div class="label">Still to rate</div><h3>${esc(latest.title)}</h3>
      <p class="cta">⭐ Rate it on Discord ${rateBy(ratingCloses(lastSeen(latest)))}</p></div></button>`;
  }
  const missed = unrated.filter((m) => m !== latest || !todo);
  const missedHtml = missed.length && p ? `<details class="missed"><summary>Haven't scored ${missed.length} of the movies we watched</summary>
    <div class="wall small" style="margin-top:14px">${missed.map(watchedCard).join("")}</div></details>` : "";

  const picksHtml = picks.length ? `<h2 style="margin-top:8px">Their picks we watched</h2>
    <div class="wall small" style="margin:14px 0 28px">${picks.map(watchedCard).join("")}</div>` : "";
  const openHtml = open.length ? `<h2>On the Movie List</h2>
    <div class="wall small" style="margin-top:14px">${open.map((m) => listCard(m, false)).join("")}</div>` : "";

  $("#person").innerHTML = head + todo + `<div class="p-tiles">${tiles.map(([v, l, c, s]) => `<div class="tile"><b class="${c || ""}">${v}</b><span>${l}</span>${s ? `<small>${s}</small>` : ""}</div>`).join("")}</div>`
    + boxes + picksHtml + openHtml + missedHtml;
}

/* ---------------------------------------------------------------- charts */

const svg = (w, h, body, label) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
const topRounded = (x, y, w, h, r = 4) => {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const niceStep = (max, ticks = 4) => {
  const raw = max / ticks, mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw);
};

function renderHistogram() {
  const el = $("#hist");
  const scores = DATA.watched.flatMap((m) => m.ratings.map((r) => r.score));
  if (!scores.length) { el.innerHTML = `<p class="empty">No scores yet.</p>`; return; }
  const W = el.clientWidth, H = 180, L = 30, R = 8, T = 20, B = 24;
  const bins = Array(20).fill(0);
  scores.forEach((s) => bins[Math.min(19, Math.floor(s * 2))]++);
  const step = niceStep(Math.max(...bins));
  const yMax = Math.ceil(Math.max(...bins) / step) * step;
  const x = (v) => L + (v / 10) * (W - L - R);
  const y = (v) => T + (1 - v / yMax) * (H - T - B);
  const bw = (W - L - R) / 20;
  let body = `<g class="grid">`;
  for (let v = 0; v <= yMax; v += step) body += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  body += `</g>`;
  for (let t = 0; t <= 10; t += 1) body += `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${t}</text>`;
  bins.forEach((n, i) => {
    const lo = i / 2, x0 = x(lo) + 1, w = Math.max(1, bw - 2);
    const tipText = `<b>${fmt(lo)}–${i === 19 ? "10" : fmt(lo + 0.4)}</b><br>${n} score${n === 1 ? "" : "s"} <span class='m'>(${Math.round((n / scores.length) * 100)}%)</span>`;
    body += `<rect class="bar-hit" x="${x(lo)}" y="${T}" width="${bw}" height="${H - T - B}" data-tip="${tipText}"/>`;
    if (n) body += `<path class="bar" d="${topRounded(x0, y(n), w, y(0) - y(n))}" pointer-events="none"/>`;
  });
  const avg = mean(scores);
  body += `<line class="mean" x1="${x(avg)}" x2="${x(avg)}" y1="${T - 6}" y2="${H - B}"/>
    <text x="${x(avg) + 6}" y="${T - 8}" style="fill:var(--text)">all scores ${fmt(avg, 2)}</text>`;
  el.innerHTML = svg(W, H, body, `Histogram of all ${scores.length} scores; average ${fmt(avg, 2)}`);
}

function renderTimeline() {
  const el = $("#timeline");
  const pts = DATA.watched.filter((m) => m.avg != null && realDate(lastSeen(m)))
    .map((m) => ({ m, t: new Date(lastSeen(m) + "T12:00:00").getTime(), v: m.avg }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) { el.innerHTML = `<p class="empty">Needs a couple of Tuesdays first.</p>`; return; }
  const W = el.clientWidth, H = 180, L = 30, R = 14, T = 20, B = 24;
  const lo = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.v)) - 0.5));
  const hi = Math.min(10, Math.ceil(Math.max(...pts.map((p) => p.v)) + 0.3));
  const t0 = pts[0].t, t1 = Math.max(pts.at(-1).t, t0 + 864e5);
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let body = `<g class="grid">`;
  for (let v = lo; v <= hi; v += 1) body += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  body += `</g>`;
  const d0 = new Date(t0); d0.setDate(1); d0.setMonth(d0.getMonth() + 1);
  const months = [];
  for (const d = d0; d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const every = Math.ceil(months.length / Math.max(1, Math.floor((W - L - R) / 60)));
  months.forEach((d, i) => {
    if (i % every) return;
    body += `<text x="${x(d.getTime())}" y="${H - 8}" text-anchor="middle">${d.toLocaleDateString("en-GB", { month: "short" })}</text>`;
  });
  const avg = mean(pts.map((p) => p.v));
  body += `<line class="mean" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>
    <text x="${W - R}" y="${T - 8}" text-anchor="end" style="fill:var(--text)">dashed: per movie ${fmt(avg, 2)}</text>`;
  body += `<path class="line" d="${pts.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.v)}`).join("")}"/>`;
  // rolling average of the last 5 closed movies (the one still being rated is left out)
  const shut = pts.filter((p) => !isOpen(p.m));
  const roll = shut.map((p, i) => ({ p, v: mean(shut.slice(Math.max(0, i - 4), i + 1).map((q) => q.v)) })).slice(4);
  const rollOf = new Map(roll.map((r) => [r.p.m.id, r.v]));
  if (roll.length > 1) {
    body += `<path class="roll" d="${roll.map((r, i) => `${i ? "L" : "M"}${x(r.p.t)},${y(r.v)}`).join("")}"/>`;
    const now = roll.at(-1).v, d = now - avg;
    body += `<text x="${L}" y="${T - 8}" style="fill:var(--text)">last 5: ${fmt(now, 2)} <tspan class="${Math.abs(d) < 0.05 ? "" : d > 0 ? "pos" : "neg"}">${Math.abs(d) < 0.05 ? "(steady)" : d > 0 ? `(kinder, ${signed(d)})` : `(harsher, ${signed(d)})`}</tspan></text>`;
  }
  body += `<line class="cross" id="tl-cross" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  pts.forEach((p, i) => (body += `<circle class="dot" data-i="${i}" cx="${x(p.t)}" cy="${y(p.v)}" r="4"/>`));
  // invisible columns: hovering anywhere near a week picks that week's dot
  pts.forEach((p, i) => {
    const a = i ? (x(pts[i - 1].t) + x(p.t)) / 2 : L, b = i < pts.length - 1 ? (x(p.t) + x(pts[i + 1].t)) / 2 : W - R;
    const tipText = `<b>${esc(esc(p.m.title))}</b><br>${date(lastSeen(p.m))}<br>average ${fmt(p.v, 2)} <span class='m'>· ${p.m.ratings.length} scores</span>${rollOf.has(p.m.id) ? `<br>last 5 movies ${fmt(rollOf.get(p.m.id), 2)}` : ""}`;
    body += `<rect class="hit" data-i="${i}" data-movie="${p.m.id}" x="${a}" y="${T}" width="${b - a}" height="${H - T - B}" data-tip="${tipText}"/>`;
  });
  el.innerHTML = svg(W, H, body, `Group average per Tuesday, ${pts.length} screenings; overall ${fmt(avg, 2)}`);
  const cross = el.querySelector("#tl-cross");
  const hot = (e) => {
    const i = e.target.dataset?.i;
    el.querySelectorAll(".dot.hot").forEach((d) => d.classList.remove("hot"));
    if (i == null) { cross.setAttribute("visibility", "hidden"); return; }
    const dot = el.querySelector(`.dot[data-i="${i}"]`);
    dot.classList.add("hot");
    cross.setAttribute("x1", dot.getAttribute("cx")); cross.setAttribute("x2", dot.getAttribute("cx"));
    cross.setAttribute("visibility", "visible");
  };
  el.querySelector("svg").addEventListener("pointermove", hot);
  el.querySelector("svg").addEventListener("pointerdown", hot);
  el.querySelector("svg").addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse") return;
    cross.setAttribute("visibility", "hidden");
    el.querySelectorAll(".dot.hot").forEach((d) => d.classList.remove("hot"));
  });
}

function renderGrid() {
  const el = $("#grid");
  const paired = new Set(DATA.pairs.flatMap((p) => [p.a, p.b]));
  const names = DATA.people.map((p) => p.name).filter((n) => paired.has(n));
  const pairs = new Map();
  DATA.pairs.forEach((p) => { pairs.set(`${p.a}|${p.b}`, p); pairs.set(`${p.b}|${p.a}`, p); });
  if (!DATA.pairs.length) { el.innerHTML = `<p class="empty">Needs people with 3+ movies in common.</p>`; return; }
  const gaps = DATA.pairs.map((p) => p.mean_gap);
  const gMin = Math.min(...gaps), gMax = Math.max(...gaps);
  const labelW = 92, top = 78;
  const cell = Math.max(22, Math.min(38, Math.floor((el.clientWidth - labelW - 8) / names.length)));
  const W = labelW + cell * names.length + 8, H = top + cell * names.length + 4;
  let body = "";
  names.forEach((n, i) => {
    const short = [...n].length > 13 ? [...n].slice(0, 12).join("") + "…" : n;
    body += `<text x="${labelW - 8}" y="${top + i * cell + cell / 2 + 4}" text-anchor="end">${esc(short)}</text>`;
    const cx = labelW + i * cell + cell / 2;
    body += `<text transform="translate(${cx + 4},${top - 8}) rotate(-50)">${esc(short)}</text>`;
  });
  names.forEach((a, i) => names.forEach((b, j) => {
    const x = labelW + j * cell, y = top + i * cell;
    const p = i === j ? null : pairs.get(`${a}|${b}`);
    if (!p) { body += `<rect class="cell none" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4"/>`; return; }
    const k = gMax > gMin ? (p.mean_gap - gMin) / (gMax - gMin) : 0.5;
    const tipText = `<b>${esc(esc(a))} &amp; ${esc(esc(b))}</b><br>${fmt(p.mean_gap, 2)} apart on average over ${p.shared} movies`
      + `<br><span class='m'>Biggest: ${esc(esc(p.biggest.title))} (${fmt(p.biggest.a)} vs ${fmt(p.biggest.b)})</span>`;
    body += `<rect class="cell" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="rgba(var(--accent-rgb), ${(0.12 + 0.88 * k).toFixed(3)})" data-tip="${tipText}"/>`;
  }));
  el.innerHTML = svg(W, H, body, "Grid of how far apart each pair of people scores")
    + `<div class="scale"><span>agree more · ${fmt(gMin, 1)}</span><span class="ramp"></span><span>${fmt(gMax, 1)} · disagree more</span></div>`;
  // SVG fill attributes can't read CSS variables, so apply them as styles instead.
  el.querySelectorAll("rect.cell[fill]").forEach((r) => { r.style.fill = r.getAttribute("fill"); });
}

function renderRanks() {
  const divisive = DATA.watched.filter((m) => m.stdev != null && m.ratings.length >= 3).sort((a, b) => b.stdev - a.stdev).slice(0, 8);
  $("#divisive").innerHTML = divisive.map((m) => `<li data-movie="${m.id}" style="cursor:pointer"><div>${esc(m.title)}
      <div class="sub">${fmt(m.min)} to ${fmt(m.max)} · average ${fmt(m.avg, 2)}</div></div><span class="v">±${fmt(m.stdev, 2)}</span></li>`).join("")
    || `<p class="empty">Needs at least 3 scores per movie.</p>`;

  const fights = [];
  for (const m of DATA.watched) {
    const rs = m.ratings;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      fights.push({ m, hi: rs[i], lo: rs[j], gap: Math.abs(rs[i].score - rs[j].score) });
    }
  }
  fights.sort((a, b) => b.gap - a.gap);
  const seen = new Set();
  const top = fights.filter((f) => !seen.has(f.m.id) && seen.add(f.m.id)).slice(0, 8);   // one per movie
  $("#fights").innerHTML = top.map((f) => `<li data-movie="${f.m.id}" style="cursor:pointer"><div>${esc(f.m.title)}
      <div class="sub">${esc(f.hi.name)} ${fmt(f.hi.score)} vs ${esc(f.lo.name)} ${fmt(f.lo.score)}</div></div>
      <span class="v">${fmt(f.gap)}</span></li>`).join("") || `<p class="empty">No disagreements yet.</p>`;
}

/* ---------------------------------------------------------------- stats: numbers & tables */

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const stdev = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) : null; };
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const hm = (min) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;
const movieLink = (m) => `<span class="ml" role="button" tabindex="0" data-movie="${m.id}">${esc(m.title)}</span>`;
// a 5–10 bar for averages (nearly every average sits in that range, so 0–10 would flatten them)
const avgBar = (v) => `<span class="abar"><span style="width:${Math.max(2, Math.min(100, ((v - 5) / 5) * 100))}%"></span></span>`;
const picksOf = (name) => DATA.watched.filter((m) => m.suggested_by?.includes(name) && m.avg != null);

// Scores stay private until rating closes, so the newer stats leave out a movie that's still open.
const isOpen = (m) => realDate(lastSeen(m)) && new Date() < ratingCloses(lastSeen(m));
const closedMovies = () => DATA.watched.filter((m) => !isOpen(m));
const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
// movie id -> place by group average among closed movies (1 = best; ties share a place)
function movieRanks() {
  const ms = closedMovies().filter((m) => m.avg != null).sort((a, b) => b.avg - a.avg);
  const rank = new Map();
  ms.forEach((m, i) => rank.set(m.id, i && ms[i - 1].avg === m.avg ? rank.get(ms[i - 1].id) : i + 1));
  return { rank, total: ms.length };
}
// everyone with 3+ closed scores, most generous (highest average) first
function generosity() {
  const by = new Map();
  closedMovies().forEach((m) => m.ratings.forEach((r) => by.set(r.name, [...(by.get(r.name) || []), r.score])));
  return [...by].filter(([, s]) => s.length >= 3).map(([name, s]) => ({ name, avg: mean(s), n: s.length }))
    .sort((a, b) => b.avg - a.avg);
}

// share of a person's closed picks that ended above the average movie (mean of all closed movie averages)
function hitRate(name) {
  const done = closedMovies().filter((m) => m.avg != null), bar = mean(done.map((m) => m.avg));
  const picks = done.filter((m) => m.suggested_by?.includes(name));
  return picks.length ? { rate: picks.filter((m) => m.avg > bar).length / picks.length, hits: picks.filter((m) => m.avg > bar).length, n: picks.length, bar } : null;
}

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
  $("#kpis").innerHTML = tiles.map(([v, l, s]) => `<div class="kpi"><b>${v}</b><span>${l}</span>${s ? `<small>${s}</small>` : ""}</div>`).join("");
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

function renderTopBottom() {
  const rated = DATA.watched.filter((m) => m.avg != null && m.ratings.length >= 3).sort((a, b) => b.avg - a.avg);
  const li = (m) => `<li data-movie="${m.id}"><div>${esc(m.title)}<div class="sub">${m.year ?? ""} · ${m.ratings.length} scores${m.suggested_by?.length ? ` · ${esc(m.suggested_by.join(", "))}` : ""}</div></div><span class="v">${fmt(m.avg, 2)}</span></li>`;
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
  const k = Math.min(5, rows.length >> 1);
  const li = (r) => `<li data-movie="${r.m.id}"><div>${esc(r.m.title)}<div class="sub">us ${fmt(r.m.avg, 2)} · TMDB ${fmt(r.m.tmdb_rating, 2)}</div></div>
    <span class="v"><span class="${r.diff > 0 ? "pos" : "neg"}">${signed(r.diff)}</span></span></li>`;
  $("#w-more").innerHTML = rows.slice(0, k).filter((r) => r.diff > 0).map(li).join("") || `<p class="empty">TMDB liked everything more.</p>`;
  $("#w-less").innerHTML = rows.slice(-k).reverse().filter((r) => r.diff < 0).map(li).join("") || `<p class="empty">We liked everything more.</p>`;
  $("#w-people").innerHTML = tmdbAgreement().slice(0, 5).map((p) => `<li><div>${personLink(p.name)}<div class="sub">${plural(p.n, "movie")} · usually ${fmt(Math.abs(p.lean), 2)} ${p.lean < 0 ? "below" : "above"}</div></div>
    <span class="v">±${fmt(p.gap, 2)}</span></li>`).join("") || `<p class="empty">Needs 3+ scores each.</p>`;
  const tPlace = new Map([...rows].sort((a, b) => b.m.tmdb_rating - a.m.tmdb_rating).map((r, i) => [r.m.id, i + 1]));
  $("#world").innerHTML = `<thead><tr><th style="text-align:left">Movie</th><th data-tip="Our group average">Us</th><th data-tip="TMDB users' average">TMDB</th>
      <th data-tip="Ours minus TMDB's">Diff</th><th data-tip="Place by our average, among the movies in this table">Our place</th><th data-tip="Place by TMDB rating, among the movies in this table">TMDB place</th>
      <th data-tip="How many people rated it on TMDB">TMDB votes</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="clip">${movieLink(r.m)}</td><td><b>${fmt(r.m.avg, 2)}</b></td><td>${fmt(r.m.tmdb_rating, 2)}</td>
      <td><span class="${Math.abs(r.diff) < 0.005 ? "" : r.diff > 0 ? "pos" : "neg"}">${signed(r.diff)}</span></td>
      <td>${[...rows].filter((x) => x.m.avg > r.m.avg).length + 1}</td><td>${tPlace.get(r.m.id)}</td><td>${r.m.tmdb_votes.toLocaleString("en-GB")}</td></tr>`).join("")}</tbody>`;
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
  $("#wolves").innerHTML = all.slice(0, 8).map((w) => `<li data-movie="${w.m.id}"><div>${esc(w.name)} on ${esc(w.m.title)}
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
  $("#oddone").innerHTML = rows.map((r) => `<li><div>${personLink(r.name)}<div class="sub">${r.k} of ${plural(r.n, "movie")}</div></div>
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
  const li = (p) => `<li><div>${esc(p.a)} &amp; ${esc(p.b)}<div class="sub">${p.shared} movies in common</div></div><span class="v">${fmt(p.mean_gap, 2)}</span></li>`;
  $("#alike").innerHTML = ps.slice(0, k).map(li).join("") || `<p class="empty">Not enough overlap yet.</p>`;
  $("#unlike").innerHTML = ps.slice(-k).reverse().map(li).join("") || `<p class="empty">Not enough overlap yet.</p>`;
}

function renderStats() {
  renderKpis(); renderGroups(); renderScorecard(); renderTopBottom(); renderRecords(); renderFair(); renderWorld(); renderGenres(); renderWhen(); renderPairs(); renderRanks(); renderWolves(); renderConsensus(); renderHabits();
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

function renderCharts() { renderHistogram(); renderTimeline(); renderGrid(); }

/* ---------------------------------------------------------------- routing */

let current = "";
let pushedMovie = false;   // true when we opened the popup ourselves, so closing it can go back
const movieHash = () => /^#movie\/(\d+)$/.exec(location.hash)?.[1];

function showMovie(id, push) {
  if (!byId.has(id)) return;
  if (push) { history.pushState({ movie: true }, "", `#movie/${id}`); pushedMovie = true; }
  openDetail(id);
}

function closeMovie() {
  if (!movieHash()) return;
  if (pushedMovie || history.state?.movie) history.back();
  else history.replaceState(null, "", `#${current || "watched"}`);
  pushedMovie = false;
}

function route() {
  const id = movieHash();
  if (id) {
    // a shared movie link: keep whatever tab is showing (Watched on first load) and open the popup
    if (!current) { current = "watched"; showTab("watched"); }
    if (byId.has(Number(id))) openDetail(Number(id));
    else history.replaceState(null, "", `#${current}`);
    return;
  }
  pushedMovie = false;
  let hash = location.hash.slice(1);
  try { hash = decodeURIComponent(hash); } catch { /* malformed link: use it as is */ }
  if ($("#detail").open) $("#detail").close();
  showTab(hash);
}

function showTab(hash) {
  let tab = ["watched", "stats", "people", "list"].includes(hash) ? hash : "watched";
  if (hash.startsWith("person/")) { tab = "person"; renderPerson(hash.slice(7)); }
  $$("[data-panel]").forEach((el) => (el.hidden = el.dataset.panel !== tab));
  if (tab === "person") renderTrend();   // needs the page showing to know its width
  $("#hero").classList.toggle("compact", tab !== "watched");
  $$(".tabs a").forEach((el) => el.classList.toggle("active", el.dataset.tab === (tab === "person" ? "people" : tab)));
  if (tab === "stats") renderCharts();
  if (current && current !== hash) {
    const nav = $(".tabs").getBoundingClientRect();
    if (nav.top < 0 || tab === "person") scrollTo({ top: $(".tabs").offsetTop, behavior: "instant" });
  }
  current = hash;
}

async function init() {
  DATA = await fetch("data/data.json", { cache: "no-cache" }).then((r) => r.json());
  DATA.members ??= [];
  DATA.watched.sort((a, b) => lastSeen(b).localeCompare(lastSeen(a)));
  DATA.watched.forEach((m) => byId.set(m.id, m));
  if (DATA.poll && Array.isArray(DATA.poll)) DATA.poll = null;   // older export format
  [...DATA.suggestions, ...(DATA.poll?.options ?? []), DATA.next_up].forEach((m) => { if (m && !byId.has(m.id)) byId.set(m.id, m); });
  DATA.members.forEach((m) => memberInfo.set(m.name, m));

  $("#updated").textContent = `Updated ${new Date(DATA.generated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`;
  fillGenres($("#genre"), DATA.watched, "All genres");
  fillGenres($("#lgenre"), DATA.suggestions, "All genres");
  renderHero(); renderWall(); renderPoll(); renderList(); renderPeople(); renderStats();

  $("#search").addEventListener("input", renderWall);
  $("#genre").addEventListener("change", renderWall);
  $("#sort").addEventListener("change", renderWall);
  ["#lsearch", "#lgenre", "#lruntime"].forEach((s) => $(s).addEventListener(s === "#lsearch" ? "input" : "change", renderList));
  $$(".seg button").forEach((b) => b.addEventListener("click", () => {
    listView = b.dataset.view;
    $$(".seg button").forEach((x) => x.classList.toggle("on", x === b));
    renderList();
  }));

  document.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    if (tapTip(e)) return;
    const el = e.target.closest("[data-movie]");
    if (el) showMovie(Number(el.dataset.movie), true);
  });
  $("#detail").addEventListener("click", (e) => {
    if (e.target.closest(".close") || e.target === $("#detail")) $("#detail").close();
    const share = e.target.closest(".share");
    if (share) {
      const url = location.href.split("#")[0] + location.hash;
      navigator.clipboard.writeText(url).then(() => {
        share.textContent = "✓ Copied";
        setTimeout(() => (share.textContent = "🔗 Copy link"), 1600);
      }, () => prompt("Copy this link:", url));
    }
  });
  $("#detail").addEventListener("close", closeMovie);
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("a")) return;
    const el = e.target.closest?.('[role="button"][data-movie]');
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showMovie(Number(el.dataset.movie), true); }
  });

  let resizeTimer, lastWidth = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!$('[data-panel="stats"]').hidden) renderCharts();
      if (!$('[data-panel="person"]').hidden) renderTrend();
    }, 150);
  });
  addEventListener("hashchange", route);
  route();
}

init();
