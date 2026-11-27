// People panel.

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
      body = `<div class="spark" role="img" aria-label="How ${esc(name)}'s scores spread from 0 to 10">${bins.map((b, i) => `<span style="height:${(b / top) * 100}%" data-tip="${plural(b, "score")} from ${i} to ${i === 9 ? "10" : `${i}.9`}"></span>`).join("")}</div>
        <div class="spark-axis" aria-hidden="true"><span>0</span><span>5</span><span>10</span></div>
        <div class="kv"><span>Average</span><b>${fmt(p.avg, 2)}</b></div>
        <div class="kv"><span>Bias</span><b class="${p.bias >= 0 ? "pos" : "neg"}">${signed(p.bias)}</b></div>
        <div class="kv fav"><span>Favourite</span><b title="${esc(p.favourite.title)}">${esc(p.favourite.title)}</b></div>`;
    }
    return `<a class="person-card" href="${personHref(name)}"><div class="top">${avatar(name)}
      <div><h3>${esc(name)}</h3><div class="sub">${sub}</div></div></div>${body}</a>`;
  }).join("");
}
