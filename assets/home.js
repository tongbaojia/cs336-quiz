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
    const typeChip = guest ? "" : `<span class="tag ${C.UNIT_CLASS[c.unit]}">${c.type === "exec" ? "code lecture" : "slides"}</span>`;

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

    if (has && !guest) return `<a class="lcard" href="lecture.html?id=${c.id}">${inner}</a>`;
    return `<div class="lcard locked">${inner}</div>`;
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

    document.getElementById("dash").innerHTML = `
      <div class="ring" style="--p:${overall}"><div class="inner"><div class="pct">${overall}%</div><div class="lbl">read</div></div></div>
      <div class="stats">
        <div class="s"><b>${readCount}</b> / ${content.length} lectures read</div>
        <div class="s"><b>${attempted.length}</b> quizzes attempted</div>
        <div class="s">avg quiz score <b>${avg == null ? "\u2014" : avg + "%"}</b></div>
        <button class="btn ghost reset" id="resetBtn">Reset progress</button>
      </div>`;

    const main = document.getElementById("units");
    main.innerHTML = C.UNITS.map(u => {
      const cs = C.CATALOG.filter(c => c.unit === u);
      if (!cs.length) return "";
      const cards = cs.map(lectureCard).join("");
      return `<div class="unit"><h2>${u}</h2><div class="rule"></div><span class="ucount">${cs.length} lecture${cs.length > 1 ? "s" : ""}</span></div><div class="grid">${cards}</div>`;
    }).join("");

    const rb = document.getElementById("resetBtn");
    if (rb) rb.onclick = () => { if (confirm("Clear all reading + quiz progress?")) { C.resetProgress(); render(); } };
  }

  document.addEventListener("DOMContentLoaded", render);
})();
