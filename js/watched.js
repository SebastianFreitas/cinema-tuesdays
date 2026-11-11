// Watched panel: the hero tiles, headline facts and the poster wall.

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
  $("#tagline").innerHTML = `Movie night every ${next.tuesday.toLocaleDateString("en-GB", { weekday: "long" })} at ${clock(next.tuesday)}${ptNote(next.tuesday)}`;

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
      <h3>Voting now${DATA.poll.title ? ` · ${esc(DATA.poll.title)}` : DATA.poll.group ? ` · ${GROUPS[DATA.poll.group]}` : ""}</h3>
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
  if (!list.length) { $("#wall").innerHTML = `<p class="empty">Nothing matches.</p>`; return; }
  if ($("#sort").value !== "date") { $("#wall").innerHTML = list.map(watchedCard).join(""); return; }
  // most recent first: a heading for each month
  const month = (m) => (realDate(lastSeen(m)) ? lastSeen(m).slice(0, 7) : "");
  const counts = new Map();
  list.forEach((m) => counts.set(month(m), (counts.get(month(m)) || 0) + 1));
  let html = "", prev = null;
  for (const m of list) {
    const k = month(m);
    if (k !== prev) {
      const name = k ? date(k + "-15", { month: "long", year: "numeric" }) : "Date unknown";
      html += `<h3 class="wall-month">${name}<small>${plural(counts.get(k), "movie")}</small></h3>`;
      prev = k;
    }
    html += watchedCard(m);
  }
  $("#wall").innerHTML = html;
}
