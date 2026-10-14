const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n, d = 1) => (n == null ? "–" : Number(n).toFixed(d));
const date = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const realDate = (iso) => iso && !iso.startsWith("1970");

let DATA;

function poster(m, score) {
  const img = m.poster
    ? `<img src="${esc(m.poster)}" alt="" loading="lazy">`
    : `<div class="fallback">${esc(m.title)}</div>`;
  return `<div class="poster">${img}${score != null ? `<span class="score">${fmt(score)}</span>` : ""}</div>`;
}

function renderWall() {
  const q = $("#search").value.trim().toLowerCase();
  const sort = $("#sort").value;
  let list = DATA.watched.filter((m) => !q || m.title.toLowerCase().includes(q) || (m.director || "").toLowerCase().includes(q));
  const by = {
    date: (a, b) => b.watched_on.at(-1).localeCompare(a.watched_on.at(-1)),
    avg: (a, b) => (b.avg ?? -1) - (a.avg ?? -1),
    low: (a, b) => (a.avg ?? 99) - (b.avg ?? 99),
    stdev: (a, b) => (b.stdev ?? -1) - (a.stdev ?? -1),
  }[sort];
  list = [...list].sort(by);
  $("#wall").innerHTML = list.length
    ? list.map((m) => {
        const when = m.watched_on.at(-1);
        return `<button class="card" data-id="${m.id}">${poster(m, m.avg)}
          <div class="t">${esc(m.title)}</div>
          <div class="s">${realDate(when) ? date(when) : m.year ?? ""}</div></button>`;
      }).join("")
    : `<p class="empty">Nothing here yet.</p>`;
}

function renderNext() {
  const m = DATA.next_up;
  if (m) {
    $("#next").innerHTML = `<div class="next">${m.poster ? `<img src="${esc(m.poster)}" alt="">` : ""}
      <div><div class="label">Up next</div><h3>${esc(m.title)}</h3>
      <p>${[m.year, m.director].filter(Boolean).map(esc).join(" · ")}</p></div></div>`;
  } else if (DATA.poll) {
    const lead = [...DATA.poll].sort((a, b) => b.votes - a.votes);
    $("#next").innerHTML = `<div class="next"><div><div class="label">Voting now</div>
      <p>${lead.map((o) => `${esc(o.title)} <b>${o.votes}</b>`).join(" · ")}</p></div></div>`;
  }
}

function renderStats() {
  $("#people").innerHTML = DATA.people.length
    ? DATA.people.map((p) => `<div class="person"><h3>${esc(p.name)}</h3>
        <div class="big">${fmt(p.avg, 2)}</div>
        <div class="row"><span>Scores given</span><b>${p.count}</b></div>
        <div class="row"><span>Bias</span><b class="${p.bias >= 0 ? "pos" : "neg"}">${p.bias >= 0 ? "+" : ""}${fmt(p.bias, 2)}</b></div>
        <div class="row"><span>Favourite</span><b>${esc(p.favourite.title)} (${fmt(p.favourite.score)})</b></div>
        <div class="row"><span>Least liked</span><b>${esc(p.least.title)} (${fmt(p.least.score)})</b></div></div>`).join("")
    : `<p class="empty">No scores yet.</p>`;

  const divisive = DATA.watched.filter((m) => m.stdev != null && m.ratings.length >= 3).sort((a, b) => b.stdev - a.stdev).slice(0, 10);
  $("#divisive").innerHTML = divisive.map((m) => `<li><div>${esc(m.title)}
      <div class="sub">${fmt(m.min)} to ${fmt(m.max)} · avg ${fmt(m.avg, 2)}</div></div><span class="v">±${fmt(m.stdev, 2)}</span></li>`).join("")
    || `<p class="empty">Needs at least 3 scores per movie.</p>`;

  $("#pairs").innerHTML = DATA.pairs.slice(0, 10).map((p) => `<li><div>${esc(p.a)} &amp; ${esc(p.b)}
      <div class="sub">${p.shared} movies · biggest: ${esc(p.biggest.title)} (${fmt(p.biggest.a)} vs ${fmt(p.biggest.b)})</div></div>
      <span class="v">${fmt(p.mean_gap, 2)}</span></li>`).join("")
    || `<p class="empty">Needs at least 3 movies in common.</p>`;
}

function renderList() {
  $("#suggestions").innerHTML = DATA.suggestions.length
    ? DATA.suggestions.map((m) => `<div class="card" style="cursor:default">${poster(m)}
        <div class="t">${esc(m.title)}${m.year ? ` <span class="s">${m.year}</span>` : ""}</div>
        <div class="s">${m.suggested_by.map(esc).join(", ")}</div></div>`).join("")
    : `<p class="empty">The Movie List is empty.</p>`;
}

function openDetail(id) {
  const m = DATA.watched.find((x) => x.id === id);
  if (!m) return;
  const meta = [m.year, m.director, m.runtime && `${m.runtime} min`].filter(Boolean).map(esc).join(" · ");
  const seen = m.watched_on.filter(realDate).map(date).join(", ");
  $("#detail").innerHTML = `<button class="close" aria-label="Close">✕</button>
    <div class="d-head">${m.poster ? `<img src="${esc(m.poster)}" alt="">` : ""}
      <div><h3>${esc(m.title)}</h3><div class="meta">${meta}</div>
      ${m.overview ? `<p class="overview">${esc(m.overview)}</p>` : ""}
      ${m.tmdb ? `<p class="meta"><a href="${esc(m.tmdb)}" target="_blank" rel="noopener">TMDB ↗</a></p>` : ""}</div></div>
    <div class="d-stats">
      <div>Average<b>${fmt(m.avg, 2)}</b></div>
      <div>Spread<b>${m.stdev != null ? "±" + fmt(m.stdev, 2) : "–"}</b></div>
      <div>Scores<b>${m.ratings.length}</b></div>
      ${seen ? `<div>Watched<b style="font-size:1rem">${seen}</b></div>` : ""}
      ${m.suggested_by.length ? `<div>Suggested by<b style="font-size:1rem">${m.suggested_by.map(esc).join(", ")}</b></div>` : ""}
    </div>
    <ul class="ratings">${m.ratings.map((r) => `<li><span class="n">${fmt(r.score)}</span>
      <div><b>${esc(r.name)}</b></div>
      <div class="bar"><span style="width:${r.score * 10}%"></span></div>
      ${r.remark ? `<div class="r">${esc(r.remark)}</div>` : ""}</li>`).join("")}</ul>`;
  $("#detail").showModal();
}

function showTab(name) {
  document.querySelectorAll("[data-panel]").forEach((el) => (el.hidden = el.dataset.panel !== name));
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === name));
}

async function init() {
  DATA = await fetch("data/data.json", { cache: "no-cache" }).then((r) => r.json());
  $("#count").textContent = `${DATA.watched.length} movies watched`;
  $("#updated").textContent = `Updated ${new Date(DATA.generated_at).toLocaleString("en-GB")}`;
  renderNext(); renderWall(); renderStats(); renderList();

  $("#search").addEventListener("input", renderWall);
  $("#sort").addEventListener("change", renderWall);
  $("#wall").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) openDetail(Number(card.dataset.id));
  });
  $("#detail").addEventListener("click", (e) => {
    if (e.target.closest(".close") || e.target === $("#detail")) $("#detail").close();
  });
  const route = () => showTab(["watched", "stats", "list"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "watched");
  window.addEventListener("hashchange", route);
  route();
}

init();
