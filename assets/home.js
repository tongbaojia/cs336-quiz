/* CS336 Companion — homepage */
(function () {
  "use strict";
  const C = window.CS336;

  function scoreClass(best, total) {
    if (best == null) return "";
    const p = best / total;
    return p >= 0.8 ? "good" : p >= 0.5 ? "mid" : "low";
  }

  function lectureCard(c) {
    const has = C.hasContent(c.id);
    const guest = c.type === "guest";
    const prog = C.getLec(c.id);
    const best = C.quizBest(c.id), total = C.quizTotal(c.id);
    const done = prog.read && best != null;
    const statusCls = done ? "done" : prog.read ? "read" : "";
    const statusTxt = done ? "Completed" : prog.read ? "Read" : "Not started";
    const topics = (c.topics || []).slice(0, 4).map(t => `<span class="chip">${C.esc(t)}</span>`).join("");
    const est = has && window.LECTURES[c.id].estMinutes ? `${window.LECTURES[c.id].estMinutes} min read` : (guest ? "No materials" : "");
    const scoreBadge = best != null ? `<span class="scorebadge ${scoreClass(best, total)}">Quiz ${best}/${total}</span>` : "";
    const typeLabel = c.type === "exec" ? "code lecture" : c.type === "slides" ? "slides" : "guest";
    const typeChip = guest ? "" : `<span class="tag ${C.UNIT_CLASS[c.unit]}">${typeLabel}</span>`;
    const hay = [c.title, c.by, c.unit, typeLabel].concat(c.topics || []).join(" ").toLowerCase();

    const inner = `
      <div class="top">
        <div>
          <div class="num">Lecture ${c.id}</div>
          <h3>${C.esc(c.title)}</h3>
        </div>
        ${typeChip}
      </div>
      <div class="by">${C.esc(c.by)}</div>
      <div class="topics">${topics}</div>
      <div class="foot">
        <span class="est">${est}</span>
        ${has ? `<span class="statusdot ${statusCls}"><span class="d"></span>${statusTxt}</span>` : (guest ? "" : `<span class="statusdot"><span class="d"></span>Coming soon</span>`)}
      </div>
      ${scoreBadge ? `<div style="position:absolute;top:16px;right:16px">${scoreBadge}</div>` : ""}`;

    if (has && !guest) return `<a class="lcard" data-search="${C.esc(hay)}" href="lecture.html?id=${c.id}">${inner}</a>`;
    return `<div class="lcard locked" data-search="${C.esc(hay)}">${inner}</div>`;
  }

  function render() {
    const content = C.CATALOG.filter(c => c.type !== "guest");
    const readCount = content.filter(c => C.getLec(c.id).read).length;
    const attempted = content.filter(c => C.quizBest(c.id) != null);
    let avg = null;
    if (attempted.length) {
      const fracs = attempted.map(c => C.quizBest(c.id) / C.quizTotal(c.id));
      avg = Math.round(fracs.reduce((a, b) => a + b, 0) / fracs.length * 100);
    }
    const overall = Math.round(readCount / content.length * 100);

    // continue target: first unread content lecture, else first content lecture
    const next = content.find(c => C.hasContent(c.id) && !C.getLec(c.id).read) || content.find(c => C.hasContent(c.id));
    const allRead = readCount === content.length;
    const continueBtn = next
      ? `<a class="btn primary continue" href="lecture.html?id=${next.id}">${allRead ? "Revisit" : (readCount ? "Continue" : "Start")} \u2192 Lecture ${next.id}</a>`
      : "";

    document.getElementById("dash").innerHTML = `
      <div class="ring" style="--p:${overall}"><div class="inner"><div class="pct">${overall}%</div><div class="lbl">read</div></div></div>
      <div class="stats">
        <div class="s"><b>${readCount}</b> / ${content.length} lectures read</div>
        <div class="s"><b>${attempted.length}</b> quizzes attempted</div>
        <div class="s">avg quiz score <b>${avg == null ? "\u2014" : avg + "%"}</b></div>
        ${continueBtn}
        <button class="btn ghost reset" id="resetBtn">Reset progress</button>
      </div>`;

    const unitsHtml = C.UNITS.map(u => {
      const cs = C.CATALOG.filter(c => c.unit === u);
      if (!cs.length) return "";
      const cards = cs.map(lectureCard).join("");
      return `<section class="unit-block"><div class="unit"><h2>${u}</h2><div class="rule"></div><span class="ucount">${cs.length} lecture${cs.length > 1 ? "s" : ""}</span></div><div class="grid">${cards}</div></section>`;
    }).join("");

    document.getElementById("units").innerHTML = `
      <div class="home-controls">
        <input class="home-search" id="lecSearch" type="search" placeholder="Search lectures \u2014 title, topic, instructor\u2026" aria-label="Search lectures" />
      </div>
      ${unitsHtml}
      <div class="no-results" id="noResults" style="display:none">No lectures match that search.</div>`;

    const rb = document.getElementById("resetBtn");
    if (rb) rb.onclick = () => { if (confirm("Clear all reading + quiz progress?")) { C.resetProgress(); render(); } };

    const search = document.getElementById("lecSearch");
    if (search) search.oninput = () => filter(search.value.trim().toLowerCase());
  }

  function filter(q) {
    let visible = 0;
    document.querySelectorAll(".lcard").forEach(card => {
      const match = !q || (card.getAttribute("data-search") || "").indexOf(q) !== -1;
      card.style.display = match ? "" : "none";
      if (match) visible++;
    });
    document.querySelectorAll(".unit-block").forEach(block => {
      const any = Array.from(block.querySelectorAll(".lcard")).some(c => c.style.display !== "none");
      block.style.display = any ? "" : "none";
    });
    const nr = document.getElementById("noResults");
    if (nr) nr.style.display = visible ? "none" : "block";
  }

  document.addEventListener("DOMContentLoaded", render);
})();
