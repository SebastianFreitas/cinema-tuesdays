const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? "–" : Number(n).toFixed(d));
const signed = (n, d = 2) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const date = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-GB", opts);
const realDate = (iso) => iso && !iso.startsWith("1970");
const GROUPS = { alpha: "Group α", omega: "Group ω" };
const personHref = (name) => `#person/${encodeURIComponent(name)}`;
const personLink = (name) => `<a href="${personHref(name)}">${esc(name)}</a>`;
const lastSeen = (m) => m.watched_on.at(-1);
const initials = (name) => [...name.trim()][0]?.toUpperCase() ?? "?";

let DATA;
const byId = new Map();          // movie id -> watched movie
const memberInfo = new Map();    // name -> {group, benched}

/* ---------------------------------------------------------------- shared bits */

function poster(m, { score, badge } = {}) {
  const img = m.poster
    ? `<img src="${esc(m.poster)}" alt="" loading="lazy">`
    : `<div class="fallback">${esc(m.title)}</div>`;
  return `<div class="poster">${img}
    ${badge ? `<span class="badge">${esc(badge)}</span>` : ""}
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

// The next screening: today if it's Tuesday and the movie isn't over yet (21:15 + ~2h15), else next Tuesday.
function nextScreening() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 15);
  let days = (2 - now.getDay() + 7) % 7;
  if (days === 0 && now.getHours() * 60 + now.getMinutes() >= 23 * 60 + 30) days = 7;
  d.setDate(d.getDate() + days);
  const live = days === 0 && now >= d;
  const when = days === 0 ? (live ? "on right now" : "tonight, 21:15")
    : days === 1 ? "tomorrow, 21:15"
    : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, 21:15`;
  return { date: d, when, live };
}

// Same rule as the bot: scores are open until midnight at the end of the day after the screening.
function ratingCloses(iso) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 2);
  return d;
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
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest?.("[data-tip]");
  if (!el) { tip.hidden = true; return; }
  if (tip.dataset.for !== el.dataset.tip) { tip.innerHTML = el.dataset.tip; tip.dataset.for = el.dataset.tip; }
  tip.hidden = false;
  placeTip(e);
});
document.addEventListener("pointerleave", () => (tip.hidden = true));
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
  $("#tagline").innerHTML = `Movie night every Tuesday at 21:15`;

  const dateTile = `<div class="date-tile"><span>${next.date.toLocaleDateString("en-GB", { month: "short" })}</span><b>${next.date.getDate()}</b></div>`;
  const label = `Up next · ${esc(next.when)}`;
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
    const lastDay = closes && new Date(closes - 60000);
    const deadline = !lastDay ? ""
      : lastDay.toDateString() === new Date().toDateString() ? "tonight"
      : lastDay.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const n = latest.ratings.length;
    last = `<button class="spot${open ? " rate" : ""}" data-movie="${latest.id}">${latest.poster ? `<img src="${esc(latest.poster)}" alt="">` : ""}
      <div><div class="label">Last watched${realDate(seen) ? ` · ${date(seen, { day: "numeric", month: "short" })}` : ""}</div>
      <h3>${esc(latest.title)}</h3>
      ${open
        ? `<p class="cta">⭐ Rate it on Discord by ${esc(deadline)}${deadline === "tonight" ? " at" : ","} 23:59</p><p>${n ? `${n} score${n === 1 ? "" : "s"} so far · average ${fmt(latest.avg, 2)}` : "No scores yet"}</p>`
        : `<p>Group average <b style="color:var(--text)">${fmt(latest.avg, 2)}</b> from ${n} scores</p>`}</div></button>`;
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
  const meta = [m.year, m.director, m.runtime && `${Math.floor(m.runtime / 60)}h${String(m.runtime % 60).padStart(2, "0")}`]
    .filter(Boolean).map(esc).join(" · ");
  const seen = m.watched_on.filter(realDate).map((d) => date(d)).join(", ");
  const strip = m.ratings.length
    ? `<div class="strip" aria-hidden="true">
        ${[0, 2, 4, 6, 8, 10].map((t) => `<span class="tick" style="left:${t * 10}%">${t}</span>`).join("")}
        ${m.avg != null ? `<span class="avg" style="left:${m.avg * 10}%" data-tip="Group average <b>${fmt(m.avg, 2)}</b>"></span>` : ""}
        ${m.ratings.map((r) => `<span class="pt" style="left:${r.score * 10}%" data-tip="<b>${esc(esc(r.name))}</b> ${fmt(r.score)}"></span>`).join("")}
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
      <div>Average<b>${fmt(m.avg, 2)}</b></div>
      <div>Spread<b>${m.stdev != null ? "±" + fmt(m.stdev, 2) : "–"}</b></div>
      <div>Scores<b>${m.ratings.length}</b></div>
      ${seen ? `<div>Watched<b class="sm">${seen}</b></div>` : ""}
      ${m.suggested_by.length ? `<div>Suggested by<b class="sm">${m.suggested_by.map(personLink).join(", ")}</b></div>` : ""}
    </div>
    ${strip}
    <ul class="ratings">${m.ratings.map((r) => `<li><span class="n">${fmt(r.score)}</span>
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
    <div class="wall">${p.options.map((o) => `<div class="card static">${poster(o, { badge: o.curated ? "🎩 Curated" : null })}
      <div class="t">${esc(o.title)}</div>
      <div class="s">${o.curated ? "Cultured Snobs' pick" : o.suggested_by.map(personLink).join(", ")}</div>
      <div class="votes"><div class="track"><span style="width:${(o.votes / max) * 100}%"></span></div><b>${o.votes}</b></div>
    </div>`).join("")}</div>
    <p class="hint" style="margin:14px 0 0">${total} vote${total === 1 ? "" : "s"} so far. Vote with the buttons in #movie-night-cartaz.</p></div>`;
}

function listCard(m, showWho) {
  const meta = [m.year, m.runtime && `${m.runtime} min`].filter(Boolean).join(" · ");
  return `<div class="card static">${poster(m)}<div class="t">${esc(m.title)}</div>
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
    return head + names.map((n) => `<div class="who"><span class="avatar">${esc(initials(n))}</span>${personLink(n)}
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
  DATA.members.forEach((m) => names.add(m.name));
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
    return `<a class="person-card" href="${personHref(name)}"><div class="top"><span class="avatar">${esc(initials(name))}</span>
      <div><h3>${esc(name)}</h3><div class="sub">${sub}</div></div></div>${body}</a>`;
  }).join("");
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
    <div class="p-head"><span class="avatar big">${esc(initials(name))}</span><div><h2>${esc(name)}</h2>
    <div class="sub">${[info?.group && GROUPS[info.group], info?.benched && "sits out the next vote"].filter(Boolean).join(" · ") || "&nbsp;"}</div></div></div>`;

  const pickAvg = mean(picks.map((m) => m.avg).filter((x) => x != null));
  const tiles = [
    p && [fmt(p.avg, 2), "average score"],
    p && [p.count, "movies scored"],
    p && [signed(p.bias), "vs the group", p.bias >= 0 ? "pos" : "neg"],
    [picks.length, "of their picks watched"],
    pickAvg != null && [fmt(pickAvg, 2), "group avg for their picks"],
    [open.length, "on the Movie List"],
  ].filter(Boolean);

  let boxes = "";
  if (p) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const item = (r) => `<li><button class="tt" data-movie="${r.m.id}">${esc(r.m.title)}</button><b>${fmt(r.score)}</b></li>`;

    const mine = DATA.pairs.filter((x) => x.a === name || x.b === name)
      .map((x) => ({ other: x.a === name ? x.b : x.a, gap: x.mean_gap, shared: x.shared }))
      .sort((a, b) => a.gap - b.gap);
    const mates = mine.length >= 2
      ? `<div class="mate"><span class="avatar">${esc(initials(mine[0].other))}</span><div><div class="label">Taste twin</div>
          ${personLink(mine[0].other)}<div class="sub">${fmt(mine[0].gap, 2)} apart on average over ${mine[0].shared} movies</div></div></div>
         <div class="mate"><span class="avatar">${esc(initials(mine.at(-1).other))}</span><div><div class="label">Nemesis</div>
          ${personLink(mine.at(-1).other)}<div class="sub">${fmt(mine.at(-1).gap, 2)} apart on average over ${mine.at(-1).shared} movies</div></div></div>`
      : `<p class="hint">Needs at least 3 movies in common with two people.</p>`;

    const genres = new Map();
    rows.forEach((r) => (r.m.genres || []).forEach((g) => { if (!genres.has(g)) genres.set(g, []); genres.get(g).push(r.score); }));
    const gl = [...genres].filter(([, s]) => s.length >= 2).map(([g, s]) => ({ g, avg: mean(s), n: s.length }))
      .sort((a, b) => b.avg - a.avg);

    boxes = `<div class="p-grid">
      <div class="box"><h3>Favourites</h3><ul class="mini">${sorted.slice(0, 5).map(item).join("")}</ul></div>
      <div class="box"><h3>Least favourite</h3><ul class="mini">${sorted.slice(-5).reverse().map(item).join("")}</ul></div>
      <div class="box"><h3>Taste twin &amp; nemesis</h3>${mates}</div>
      <div class="box"><h3>Genres</h3><p class="hint">Their average per genre (2+ movies).</p>
        ${gl.length ? `<ul class="mini">${gl.slice(0, 6).map((x) => `<li><span class="tt">${esc(x.g)} <small style="color:var(--muted)">${x.n}</small></span><b>${fmt(x.avg)}</b></li>`).join("")}</ul>` : `<p class="hint">Not enough yet.</p>`}</div>
    </div>`;

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
            <span class="v ${r.diff >= 0 ? "pos" : "neg"}">${signed(r.diff, 1)}</span></li>`;
        }).join("")}</ul></div>`;
    }
  }

  const picksHtml = picks.length ? `<h2 style="margin-top:8px">Their picks we watched</h2>
    <div class="wall small" style="margin:14px 0 28px">${picks.map(watchedCard).join("")}</div>` : "";
  const openHtml = open.length ? `<h2>On the Movie List</h2>
    <div class="wall small" style="margin-top:14px">${open.map((m) => listCard(m, false)).join("")}</div>` : "";

  $("#person").innerHTML = head + `<div class="p-tiles">${tiles.map(([v, l, c]) => `<div class="tile"><b class="${c || ""}">${v}</b><span>${l}</span></div>`).join("")}</div>`
    + boxes + picksHtml + openHtml;
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
  const W = el.clientWidth, H = 230, L = 34, R = 8, T = 22, B = 26;
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
    const tipText = `<b>${fmt(lo)}–${fmt(lo + 0.4)}</b><br>${n} score${n === 1 ? "" : "s"} <span class='m'>(${Math.round((n / scores.length) * 100)}%)</span>`;
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
  const W = el.clientWidth, H = 250, L = 34, R = 14, T = 22, B = 28;
  const lo = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.v)) - 0.5));
  const hi = Math.min(10, Math.ceil(Math.max(...pts.map((p) => p.v)) + 0.3));
  const t0 = pts[0].t, t1 = pts.at(-1).t;
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
    <text x="${W - R}" y="${y(avg) - 6}" text-anchor="end" style="fill:var(--text)">per movie ${fmt(avg, 2)}</text>`;
  body += `<path class="line" d="${pts.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.v)}`).join("")}"/>`;
  body += `<line class="cross" id="tl-cross" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  pts.forEach((p, i) => (body += `<circle class="dot" data-i="${i}" cx="${x(p.t)}" cy="${y(p.v)}" r="5"/>`));
  // invisible columns: hovering anywhere near a week picks that week's dot
  pts.forEach((p, i) => {
    const a = i ? (x(pts[i - 1].t) + x(p.t)) / 2 : L, b = i < pts.length - 1 ? (x(p.t) + x(pts[i + 1].t)) / 2 : W - R;
    const tipText = `<b>${esc(esc(p.m.title))}</b><br>${date(lastSeen(p.m))}<br>average ${fmt(p.v, 2)} <span class='m'>· ${p.m.ratings.length} scores</span>`;
    body += `<rect class="hit" data-i="${i}" data-movie="${p.m.id}" x="${a}" y="${T}" width="${b - a}" height="${H - T - B}" data-tip="${tipText}"/>`;
  });
  el.innerHTML = svg(W, H, body, `Group average per Tuesday, ${pts.length} screenings; overall ${fmt(avg, 2)}`);
  const cross = el.querySelector("#tl-cross");
  el.querySelector("svg").addEventListener("pointermove", (e) => {
    const i = e.target.dataset?.i;
    el.querySelectorAll(".dot.hot").forEach((d) => d.classList.remove("hot"));
    if (i == null) { cross.setAttribute("visibility", "hidden"); return; }
    const dot = el.querySelector(`.dot[data-i="${i}"]`);
    dot.classList.add("hot");
    cross.setAttribute("x1", dot.getAttribute("cx")); cross.setAttribute("x2", dot.getAttribute("cx"));
    cross.setAttribute("visibility", "visible");
  });
  el.querySelector("svg").addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    el.querySelectorAll(".dot.hot").forEach((d) => d.classList.remove("hot"));
  });
}

function renderGrid() {
  const el = $("#grid");
  const names = DATA.people.map((p) => p.name);
  const pairs = new Map();
  DATA.pairs.forEach((p) => { pairs.set(`${p.a}|${p.b}`, p); pairs.set(`${p.b}|${p.a}`, p); });
  if (!DATA.pairs.length) { el.innerHTML = `<p class="empty">Needs people with 3+ movies in common.</p>`; return; }
  const gaps = DATA.pairs.map((p) => p.mean_gap);
  const gMin = Math.min(...gaps), gMax = Math.max(...gaps);
  const labelW = 104, top = 92;
  const cell = Math.max(28, Math.min(56, Math.floor((el.clientWidth - labelW - 8) / names.length)));
  const W = labelW + cell * names.length + 8, H = top + cell * names.length + 4;
  let body = "";
  names.forEach((n, i) => {
    const short = n.length > 13 ? n.slice(0, 12) + "…" : n;
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
  const divisive = DATA.watched.filter((m) => m.stdev != null && m.ratings.length >= 3).sort((a, b) => b.stdev - a.stdev).slice(0, 10);
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
  const top = fights.filter((f) => !seen.has(f.m.id) && seen.add(f.m.id)).slice(0, 10);   // one per movie
  $("#fights").innerHTML = top.map((f) => `<li data-movie="${f.m.id}" style="cursor:pointer"><div>${esc(f.m.title)}
      <div class="sub">${esc(f.hi.name)} ${fmt(f.hi.score)} vs ${esc(f.lo.name)} ${fmt(f.lo.score)}</div></div>
      <span class="v">${fmt(f.gap)}</span></li>`).join("") || `<p class="empty">No disagreements yet.</p>`;
}

function renderCharts() { renderHistogram(); renderTimeline(); renderGrid(); }

/* ---------------------------------------------------------------- routing */

let current = "";
let pushedMovie = false;   // true when we opened the popup ourselves, so closing it can go back
const movieHash = () => /^#movie\/(\d+)$/.exec(location.hash)?.[1];

function showMovie(id, push) {
  if (!byId.has(id)) return;
  if (push) { history.pushState(null, "", `#movie/${id}`); pushedMovie = true; }
  openDetail(id);
}

function closeMovie() {
  if (!movieHash()) return;
  if (pushedMovie) history.back();
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
  const hash = decodeURIComponent(location.hash.slice(1));
  if ($("#detail").open) $("#detail").close();
  showTab(hash);
}

function showTab(hash) {
  let tab = ["watched", "stats", "people", "list"].includes(hash) ? hash : "watched";
  if (hash.startsWith("person/")) { tab = "person"; renderPerson(hash.slice(7)); }
  $$("[data-panel]").forEach((el) => (el.hidden = el.dataset.panel !== tab));
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
  DATA.members.forEach((m) => memberInfo.set(m.name, m));
  if (DATA.poll && Array.isArray(DATA.poll)) DATA.poll = null;   // older export format

  $("#updated").textContent = `Updated ${new Date(DATA.generated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`;
  fillGenres($("#genre"), DATA.watched, "All genres");
  fillGenres($("#lgenre"), DATA.suggestions, "All genres");
  renderHero(); renderWall(); renderPoll(); renderList(); renderPeople(); renderRanks();

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

  let resizeTimer;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!$('[data-panel="stats"]').hidden) renderCharts(); }, 150);
  });
  addEventListener("hashchange", route);
  route();
}

init();
