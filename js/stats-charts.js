// Stats panel charts: histogram, week by week, scatters, who agrees with whom, divisive and fights.

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

// One dot per closed movie: group average (y) against something about the movie (x), with a straight-line fit.
function renderScatter(sel, sumSel, getX, tickText, what, label, [more, less]) {
  const el = $(sel);
  const pts = closedMovies().filter((m) => m.avg != null && getX(m) != null).map((m) => ({ m, x: getX(m), v: m.avg }));
  if (pts.length < 3) { el.innerHTML = `<p class="empty">Needs a few more movies.</p>`; $(sumSel).textContent = ""; return; }
  const W = el.clientWidth, H = 200, L = 30, R = 18, T = 12, B = 24;
  const xs = pts.map((p) => p.x), vs = pts.map((p) => p.v);
  const step = niceStep(Math.max(...xs) - Math.min(...xs) || 1, Math.max(2, Math.floor((W - L - R) / 70)));
  const pad = (Math.max(...xs) - Math.min(...xs) || step) * 0.04, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const lo = Math.max(0, Math.floor(Math.min(...vs) - 0.3)), hi = Math.min(10, Math.ceil(Math.max(...vs) + 0.2));
  const x = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let body = `<g class="grid">`;
  for (let v = lo; v <= hi; v += 1) body += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  body += `</g>`;
  for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) body += `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${tickText(t)}</text>`;
  // least-squares line and correlation
  const mx = mean(xs), mv = mean(vs);
  const sxy = sum(pts.map((p) => (p.x - mx) * (p.v - mv))), sxx = sum(xs.map((a) => (a - mx) ** 2)), svv = sum(vs.map((a) => (a - mv) ** 2));
  const slope = sxx ? sxy / sxx : 0, r = sxx && svv ? sxy / Math.sqrt(sxx * svv) : 0;
  const fit = (a) => mv + slope * (a - mx);
  body += `<line class="mean" x1="${x(x0)}" x2="${x(x1)}" y1="${y(fit(x0))}" y2="${y(fit(x1))}"/>`;
  pts.sort((a, b) => b.v - a.v).forEach((p) => {
    const tipText = `<b>${esc(esc(p.m.title))}</b><br>${esc(label(p.m))}<br>average ${fmt(p.v, 2)}`;
    body += `<circle class="dot" cx="${x(p.x)}" cy="${y(p.v)}" r="5" data-movie="${p.m.id}" data-tip="${tipText}" style="cursor:pointer"/>`;
  });
  el.innerHTML = svg(W, H, body, `Group average against ${what}, ${pts.length} movies`);
  const strength = Math.abs(r) < 0.1 ? "no real link" : Math.abs(r) < 0.3 ? "a weak link" : Math.abs(r) < 0.5 ? "a clear link" : "a strong link";
  $(sumSel).textContent = `${strength[0].toUpperCase() + strength.slice(1)}${Math.abs(r) < 0.1 ? "" : `: ${r > 0 ? more : less} tend to score higher`} (correlation ${signed(r, 2)}).`;
}
const runTick = (t) => `${Math.floor(t / 60)}h${t % 60 ? String(t % 60).padStart(2, "0") : ""}`;
function renderScatters() {
  renderScatter("#sc-run", "#sc-run-sum", (m) => m.runtime || null, runTick, "runtime", (m) => `${runTick(m.runtime)} · ${m.runtime} min`, ["longer movies", "shorter movies"]);
  renderScatter("#sc-year", "#sc-year-sum", (m) => m.year || null, String, "release year", (m) => String(m.year), ["newer movies", "older movies"]);
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
  $("#divisive").innerHTML = divisive.map((m) => `<li data-movie="${m.id}"${bw(m.stdev / divisive[0].stdev)}><div>${esc(m.title)}
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
  $("#fights").innerHTML = top.map((f) => `<li data-movie="${f.m.id}"${bw(f.gap / top[0].gap)}><div>${esc(f.m.title)}
      <div class="sub">${esc(f.hi.name)} ${fmt(f.hi.score)} vs ${esc(f.lo.name)} ${fmt(f.lo.score)}</div></div>
      <span class="v">${fmt(f.gap)}</span></li>`).join("") || `<p class="empty">No disagreements yet.</p>`;
}
