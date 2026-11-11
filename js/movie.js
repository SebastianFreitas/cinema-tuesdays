// Movie popup (#detail).

/* ---------------------------------------------------------------- detail */

function openDetail(id) {
  const m = byId.get(id);
  if (!m) return;
  const watched = Array.isArray(m.ratings);
  const ratings = m.ratings ?? [];
  const meta = [m.year, m.director, m.runtime && `${Math.floor(m.runtime / 60)}h${String(m.runtime % 60).padStart(2, "0")}`]
    .filter(Boolean).map(esc).join(" · ");
  const seen = (m.watched_on ?? []).filter(realDate).map((d) => date(d)).join(", ");
  // blue above the group average, red below, gold when level with it
  const side = (v) => (m.avg == null || Math.abs(v - m.avg) < 0.05 ? "" : v > m.avg ? " hi" : " lo");
  const strip = ratings.length
    ? `<div class="strip" aria-hidden="true">
        ${[0, 2, 4, 6, 8, 10].map((t) => `<span class="tick" style="left:${t * 10}%">${t}</span>`).join("")}
        ${m.avg != null ? `<span class="avg" style="left:${m.avg * 10}%" data-tip="Group average <b>${fmt(m.avg, 2)}</b>"></span>` : ""}
        ${ratings.map((r) => `<span class="pt${side(r.score)}" style="left:${r.score * 10}%" data-tip="<b>${esc(esc(r.name))}</b> ${fmt(r.score)}"></span>`).join("")}
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
      ${watched && ageYears(m) != null && ageYears(m) >= 0 ? `<div>Age when watched<b class="sm">${ageText(ageYears(m))}</b></div>` : ""}
      ${m.countries?.length || m.language ? `<div>From<b class="sm">${esc([(m.countries || []).map(countryName).join(", "), m.language && langName(m.language)].filter(Boolean).join(" · "))}</b></div>` : ""}
      ${m.lost_votes ? `<div>Past votes<b class="sm">Lost ${m.lost_votes}</b></div>` : ""}
    </div>
    ${strip}
    ${ratings.length && m.avg != null ? `<div class="legend r-legend"><span><i style="background:var(--pos)"></i>Above the group average</span>
      <span><i style="background:var(--neg)"></i>Below</span><span><i class="avg-key"></i>Group average</span></div>` : ""}
    <ul class="ratings">${ratings.map((r) => `<li><span class="n">${fmt(r.score)}</span>
      <div class="nm">${personLink(r.name)}</div>
      <div class="bar${side(r.score)}"><span style="width:${r.score * 10}%"></span>${m.avg != null ? `<i style="left:${m.avg * 10}%"></i>` : ""}</div>
      ${r.remark ? `<div class="r">${esc(r.remark)}</div>` : ""}</li>`).join("")}</ul>`;
  if (!$("#detail").open) $("#detail").showModal();
  $("#detail").scrollTop = 0;
}
