// Person page.

// A person-page tile: value, label, and options c (class), s (hint line), m (meter, 0-1), k (headline order), g (group)
const T = (v, l, o = {}) => ({ v, l, ...o });

// Extra tiles and boxes for a person page, from closed movies only (see isOpen).
function personMore(name, rows, picks) {
  const done = rows.filter((r) => !isOpen(r.m));
  const closed = closedMovies();
  const tiles = [], hint = (t) => `<p class="hint">${t}</p>`;
  let grid = "", wide = "", turnout = null;

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
    if (place >= 0) tiles.push(T(ord(place + 1), "most generous", { k: 4, s: `of ${gen.length}, by average score (3+ scores)` }));
    if (closed.length) turnout = [done.length, closed.length];
    if (scores.length > 1) tiles.push(T(`±${fmt(stdev(scores), 2)}`, "score spread", { s: "how much their scores vary" }));
    tiles.push(
      T(fmt(median(scores), 2), "median score", { s: "half their scores are above" }),
      T(fmt(hi.score), "highest score", { s: esc(hi.m.title) }),
      T(fmt(lo.score), "lowest score", { s: esc(lo.m.title) }),
      T(run, "in a row now", { s: `movies scored back to back · best ${longest}` }),
    );
    if (vs.length) tiles.push(T(pct(up, vs.length), "higher than the others", { m: up / vs.length, s: `lower ${pct(down, vs.length)} · level ${pct(vs.length - up - down, vs.length)}` }));
    const whole = scores.filter((s) => s === Math.round(s)).length;
    tiles.push(
      T(pct(whole, scores.length), "whole numbers", { m: whole / scores.length, s: "scores like 7 rather than 7.5" }),
      T(remarks, remarks === 1 ? "remark" : "remarks", { m: remarks / scores.length, s: `on ${pct(remarks, scores.length)} of their scores` }),
    );
    if (firstSeen) tiles.push(T(date(lastSeen(firstSeen), { month: "short", year: "numeric" }), "first score", { s: esc(firstSeen.title) }));

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
  if (me >= 0) tiles.push(T(`±${fmt(agree[me].gap, 2)}`, "from TMDB",
    { s: `${ord(me + 1)} closest of ${agree.length} · usually ${fmt(Math.abs(agree[me].lean), 2)} ${agree[me].lean < 0 ? "below" : "above"}` }));

  // their picks, placed among every closed movie
  const { rank, total } = movieRanks();
  const ranked = picks.filter((m) => rank.has(m.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  if (ranked.length) {
    const hr = hitRate(name);
    if (hr) tiles.push(T(pct(hr.hits, hr.n), "pick hit rate", { g: "picks", m: hr.hits / hr.n, s: `${hr.hits} of ${hr.n} picks above the average movie (${fmt(hr.bar, 2)})` }));
    tiles.push(T(fmt(mean(ranked.map((m) => rank.get(m.id))), 1), "avg place of picks", { g: "picks", s: `among ${total} movies, 1 = best` }));
    grid += `<div class="box"><h3>Their picks, ranked</h3>${hint(`Group average, and where it sits among all ${total} movies.`)}
      <ul class="mini">${ranked.map((m) => `<li><button class="tt" data-movie="${m.id}">${esc(m.title)}</button>
        <span class="pair"><small>${ord(rank.get(m.id))} of ${total}</small><b>${fmt(m.avg, 2)}</b></span></li>`).join("")}</ul></div>`;
  }
  return { tiles, grid, wide, turnout };
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
  const more = personMore(name, rows, picks), [tDone, tAll] = more.turnout || [];
  const tiles = [
    p && T(fmt(p.avg, 2), "average score", { k: 1, m: p.avg / 10, s: "out of 10" }),
    p && T(signed(p.bias), "vs the group", { k: 2, c: p.bias >= 0 ? "pos" : "neg", s: `${p.bias >= 0 ? "above" : "below"} the others on the same movies` }),
    p && T(p.count, "movies scored", { k: 3, ...(tAll ? { m: tDone / tAll, s: `${pct(tDone, tAll)} turnout · ${tDone} of ${tAll} movies` } : {}) }),
    T(picks.length, "of their picks watched", { g: "picks" }),
    pickAvg != null && T(fmt(pickAvg, 2), "group avg for their picks", { g: "picks" }),
    T(open.length, "on the Movie List", { g: "picks", s: open.some((m) => m.lost_votes) ? `lost ${plural(sum(open.map((m) => m.lost_votes || 0)), "vote")} so far` : "" }),
    ...more.tiles,
  ].filter(Boolean);

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

  // every closed movie, newest first like on Stats, or their favourite first and the ones they didn't score last
  const mine = (m) => m.ratings.find((r) => r.name === name)?.score ?? -1;
  const scoreOrders = { date: closedMovies(), score: closedMovies().sort((a, b) => mine(b) - mine(a) || (b.avg ?? -1) - (a.avg ?? -1)) };
  const scoresHtml = p ? `<div class="box" style="margin-bottom:28px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h3>Every score</h3>
      <div class="seg" id="score-order" role="group" aria-label="Order"><button class="on" data-order="date">Newest first</button><button data-order="score">Their highest</button></div></div>
    <p class="hint">Their scores next to everyone else's. Blue: above the movie's average, red: below.</p>
    <div id="my-scores">${scoreTable(scoreOrders.date, name)}</div></div>` : "";

  // four headline tiles, then the rest in two smaller groups
  const kpi = (t, big) => `<div class="kpi${big ? " big" : ""}"><b class="${t.c || ""}">${t.v}</b><span>${t.l}</span>
    ${t.m != null ? `<span class="kmeter"><i style="width:${(Math.max(0, Math.min(1, t.m)) * 100).toFixed(1)}%"></i></span>` : ""}${t.s ? `<small>${t.s}</small>` : ""}</div>`;
  const hero = tiles.filter((t) => t.k).sort((a, b) => a.k - b.k);
  const group = (g, title) => {
    const ts = tiles.filter((t) => !t.k && (t.g || "score") === g);
    return ts.length ? `<h3 class="sub-h">${title}</h3><div class="p-rest">${ts.map((t) => kpi(t)).join("")}</div>` : "";
  };
  const tilesHtml = `<div class="p-tiles">${hero.length ? `<div class="p-hero">${hero.map((t) => kpi(t, true)).join("")}</div>` : ""}
    ${group("score", "How they score")}${group("picks", "Their picks")}</div>`;
  $("#person").innerHTML = head + todo + scoresHtml + tilesHtml
    + boxes + picksHtml + openHtml + missedHtml;
  $$("#score-order button").forEach((b) => b.addEventListener("click", () => {
    $$("#score-order button").forEach((x) => x.classList.toggle("on", x === b));
    $("#my-scores").innerHTML = scoreTable(scoreOrders[b.dataset.order], name);
  }));
}
