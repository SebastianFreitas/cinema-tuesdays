// Routing between panels and startup (init). Loaded last.

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
  if (tab === "stats") { renderCharts(); markChapter(); }
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
