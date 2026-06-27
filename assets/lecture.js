/* CS336 Companion — lecture page renderer */
(function () {
  "use strict";
  const C = window.CS336;

  function qp(name) { return new URLSearchParams(location.search).get(name); }

  function navLink(id, dir) {
    const c = C.catalogEntry(id);
    if (!c || c.type === "guest" || !C.hasContent(id)) return `<span></span>`;
    return `<a class="${dir}" href="lecture.html?id=${id}"><div class="dir">${dir === "prev" ? "\u2190 Previous" : "Next \u2192"}</div><div class="ttl">${C.esc(c.title)}</div></a>`;
  }

  function render() {
    const id = parseInt(qp("id"), 10);
    const cat = C.catalogEntry(id);
    const L = window.LECTURES[id];
    const root = document.getElementById("lec");

    if (!cat || !L) {
      root.innerHTML = `<div class="notfound"><h1>Lecture not found</h1><p>This lecture isn't available yet. <a href="index.html">Back to all lectures</a></p></div>`;
      return;
    }
    document.title = `Lecture ${id}: ${cat.title} · CS336 Companion`;

    const sections = L.sections || [];
    const tocItems = sections.map(s => `<a href="#${s.id}" data-sec="${s.id}">${C.esc(s.title)}</a>`).join("")
      + `<a href="#quiz" data-sec="quiz">Check yourself</a>`;

    const sectionsHtml = sections.map(s =>
      `<section class="section" id="${s.id}"><h2>${C.esc(s.title)}</h2>${C.renderBlocks(s.blocks)}</section>`
    ).join("");

    const takeaways = (L.takeaways && L.takeaways.length)
      ? `<div class="takeaways"><h2>Key takeaways</h2><ol>${L.takeaways.map(t => `<li>${t}</li>`).join("")}</ol></div>` : "";
    const refs = (L.references && L.references.length)
      ? `<div class="refs"><h3>References</h3><ul>${L.references.map(r => `<li>\u2022 ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${C.esc(r.label)}</a>` : C.esc(r.label)}</li>`).join("")}</ul></div>` : "";

    root.innerHTML = `
      <aside class="toc">
        <div class="tlabel">On this page</div>
        <nav id="tocnav">${tocItems}</nav>
        <div class="progress-mini">
          <div class="bar"><span id="readbar"></span></div>
          <div class="t" id="readpct">0% read</div>
          <button class="btn" id="readBtn" style="width:100%;margin-top:10px">Mark as read</button>
        </div>
      </aside>
      <article class="article">
        <div class="lechead">
          <div class="crumb"><a href="index.html">All lectures</a> <span>/</span> <span class="tag ${C.UNIT_CLASS[cat.unit]}">${cat.unit}</span> <span>Lecture ${id}</span></div>
          <h1>${C.esc(cat.title)}</h1>
          <div class="submeta">
            <span>${C.esc(cat.by)}</span><span>\u00b7</span>
            <span>${cat.type === "exec" ? "Executable lecture" : "Slides"}</span>
            ${L.estMinutes ? `<span>\u00b7</span><span>${L.estMinutes} min read</span>` : ""}
            ${C.quizTotal(id) ? `<span>\u00b7</span><span>${C.quizTotal(id)}-question quiz</span>` : ""}
          </div>
          ${L.overview ? `<div class="overview">${L.overview}</div>` : ""}
        </div>
        ${sectionsHtml}
        ${takeaways}
        ${refs}
        <div class="quizblock" id="quiz"><div id="quizmount"></div></div>
        <div class="lecnav">${navLink(id - 1, "prev")}${navLink(id + 1, "next")}</div>
      </article>`;

    C.renderMath(root);

    // quiz
    if (L.quiz && L.quiz.length) {
      C.mountQuiz(document.getElementById("quizmount"), id, L.quiz, refreshReadUI);
    } else {
      document.getElementById("quiz").innerHTML = `<div class="qbhead"><h2>Check yourself</h2></div><p class="b-p">No quiz for this lecture yet.</p>`;
    }

    setupReadTracking(id);
    setupScrollSpy();
  }

  // ---- mark-as-read + reading progress ----
  function setupReadTracking(id) {
    const btn = document.getElementById("readBtn");
    function paint() {
      const read = C.getLec(id).read;
      btn.textContent = read ? "\u2713 Read" : "Mark as read";
      btn.classList.toggle("primary", read);
    }
    btn.onclick = () => { const read = !C.getLec(id).read; C.setLec(id, { read }); paint(); };
    paint();

    // auto-mark when user scrolls past ~85% of the article
    let autoMarked = false;
    function onScroll() {
      const doc = document.documentElement;
      const scrolled = (window.scrollY + window.innerHeight) / doc.scrollHeight;
      const pct = Math.min(100, Math.round(scrolled * 100));
      const bar = document.getElementById("readbar");
      const lbl = document.getElementById("readpct");
      if (bar) bar.style.width = pct + "%";
      if (lbl) lbl.textContent = pct + "% scrolled";
      if (!autoMarked && scrolled > 0.85 && !C.getLec(id).read) {
        autoMarked = true; C.setLec(id, { read: true }); paint();
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  function refreshReadUI() { /* hook for quiz->progress; homepage reads on next load */ }

  // ---- TOC scrollspy ----
  function setupScrollSpy() {
    const links = Array.from(document.querySelectorAll("#tocnav a"));
    const map = {};
    links.forEach(a => map[a.dataset.sec] = a);
    const targets = links.map(a => document.getElementById(a.dataset.sec)).filter(Boolean);
    if (!("IntersectionObserver" in window) || !targets.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(a => a.classList.remove("active"));
          if (map[e.target.id]) map[e.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-15% 0px -70% 0px", threshold: 0 });
    targets.forEach(t => obs.observe(t));
  }

  document.addEventListener("DOMContentLoaded", render);
})();
