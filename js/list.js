// Movie List panel: this week's poll and the list.

/* ---------------------------------------------------------------- movie list */

let listView = "person";

function renderPoll() {
  const p = DATA.poll;
  if (!p) { $("#poll").innerHTML = ""; return; }
  const max = Math.max(1, ...p.options.map((o) => o.votes));
  const total = p.options.reduce((s, o) => s + o.votes, 0);
  $("#poll").innerHTML = `<div class="poll"><div class="label">Voting now${p.title ? ` · ${esc(p.title)}` : p.group ? ` · ${GROUPS[p.group]}'s week` : ""}</div>
    <h2>This week's vote</h2>
    <div class="wall">${p.options.map((o) => `<div class="card" role="button" tabindex="0" data-movie="${o.id}">${poster(o, { badge: o.curated ? "🎩 Curated" : null })}
      <div class="t" title="${esc(o.title)}">${esc(o.title)}</div>
      <div class="s">${o.curated ? "Cultured Snobs' pick" : o.suggested_by.map(personLink).join(", ")}</div>
      <div class="votes"><div class="track"><span style="width:${(o.votes / max) * 100}%"></span></div><b>${o.votes}</b></div>
    </div>`).join("")}</div>
    <p class="hint" style="margin:14px 0 0">${total} vote${total === 1 ? "" : "s"} so far. Vote with the buttons in #movie-night-cartaz.</p></div>`;
}

function listCard(m, showWho) {
  const meta = [m.year, m.runtime && `${m.runtime} min`].filter(Boolean).join(" · ");
  const lost = m.lost_votes ? `Lost ${m.lost_votes} vote${m.lost_votes === 1 ? "" : "s"}` : null;
  return `<div class="card" role="button" tabindex="0" data-movie="${m.id}">${poster(m, { badge: lost, muted: true })}<div class="t" title="${esc(m.title)}">${esc(m.title)}</div>
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
