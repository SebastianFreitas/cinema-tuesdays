// Shared by every panel: small helpers, data maps, posters, Lisbon times, tooltips, chart and stats helpers. Loaded first.

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
    ${score != null ? `<span class="score">${fmt(score)}</span>` : ""}
  </div>`;
}

function watchedCard(m) {
  const when = lastSeen(m);
  const sub = [realDate(when) ? date(when) : m.year, m.suggested_by.length ? m.suggested_by.join(", ") : null]
    .filter(Boolean).map(esc).join(" · ");
  return `<button class="card" data-movie="${m.id}">${poster(m, { score: m.avg })}
    <div class="t" title="${esc(m.title)}">${esc(m.title)}</div><div class="s">${sub}</div></button>`;
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

// The next screening: this Tuesday (Lisbon) unless the movie is already over (~2h15 after it starts), else next week.
// A night moved with /movienight goes first, and replaces the Tuesday of its Mon-Sun week. Same rule as the bot.
function nextScreening() {
  const today = lisbonToday(), dow = new Date(today + "T12:00:00Z").getUTCDay();
  const over = (d) => Date.now() >= d.getTime() + 135 * 6e4;
  let day = addDays(today, (2 - dow + 7) % 7);
  if (over(lisbonTime(day, 21, 15))) day = addDays(day, 7);
  const moved = DATA.moved_night ? new Date(DATA.moved_night) : null;
  if (moved) {
    const iso = DATA.moved_night.slice(0, 10);   // the offset is Lisbon's, so this is the day in Lisbon
    if (day === addDays(iso, 2 - (new Date(iso + "T12:00:00Z").getUTCDay() || 7))) day = addDays(day, 7);
  }
  const tuesday = lisbonTime(day, 21, 15);
  const date = moved && !over(moved) ? moved : tuesday;
  const live = Date.now() >= date.getTime();
  const when = live ? "on right now" : `${dayName(date)}, ${clock(date)}`;
  return { date, when, live, tuesday };
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
// a background bar on a ranked list row (lists with class "bars"): f is 0–1 of the row's width; neg draws it red
const bw = (f, neg = false) => ` style="--w:${(Math.max(0.02, Math.min(1, f || 0)) * 100).toFixed(1)}%"${neg ? ` class="nb"` : ""}`;
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
