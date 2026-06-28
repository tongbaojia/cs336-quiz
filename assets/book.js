/* CS336 Companion — "The Why" narrative book page */
(function () {
  "use strict";
  const C = window.CS336;

  function chapter(id) {
    const cat = C.catalogEntry(id);
    const E = C.getEssay(id);
    const num = String(id).padStart(2, "0");
    const kicker = cat.kicker ? `<div class="kicker">${C.esc(cat.kicker)}</div>` : "";
    const body = (E && E.blocks && E.blocks.length)
      ? `<div class="essay">${C.renderBlocks(E.blocks)}</div>`
      : `<p class="pending">Essay coming soon.</p>`;
    // book only covers lectures 1-17 (all have a page); lecture data isn't loaded here, so link unconditionally.
    const link = `<div class="cfoot"><a href="lecture.html?id=${id}">Open the full lecture + quiz \u2192</a></div>`;
    return `<div class="chapter" id="l-${id}">
        <div class="chead"><span class="cnum">${num}</span><h3>${C.esc(cat.title)}</h3></div>
        ${kicker}${body}${link}
      </div>`;
  }

  function render() {
    const root = document.getElementById("book");

    const tocParts = C.BOOK_PARTS.map(p =>
      `<div class="tlabel" style="margin-top:14px">Part ${p.part} \u00b7 ${C.esc(p.name)}</div>` +
      p.ids.map(id => `<a href="#l-${id}" data-sec="l-${id}">${String(id).padStart(2, "0")} \u00b7 ${C.esc(C.catalogEntry(id).title)}</a>`).join("")
    ).join("");

    const parts = C.BOOK_PARTS.map(p =>
      `<div class="part" id="part-${p.part}">
        <div class="pnum">Part ${p.part}</div>
        <h2>${C.esc(p.name)}</h2>
        <p class="pblurb">${C.esc(p.blurb)}</p>
        <div class="prule"></div>
      </div>` + p.ids.map(chapter).join("")
    ).join("");

    root.innerHTML = `
      <aside class="toc">
        <div class="tlabel">The Why</div>
        <nav id="tocnav">${tocParts}</nav>
      </aside>
      <article class="article">
        <div class="book-hero">
          <div class="eyebrow">The Why \u00b7 a companion read</div>
          <h1>Language modeling, <span class="grad">explained</span></h1>
          <p>The lecture pages tell you <em>what</em> and <em>how</em>. This is the other half: short, punchy chapters on <em>why</em> a modern language model is built the way it is \u2014 why we tokenize, why the matmul is the only operation that matters, why a 100B-parameter model is mostly a memory-movement problem, and why no one can yet tell you, with a straight face, why any of it works as well as it does. The equations are the punchlines.</p>
          <div class="credit">Adapted with credit from <a href="https://platers.github.io/cs336-feynman/index.html" target="_blank" rel="noopener"><b>The CS336 Lectures \u2014 A Study Book in the Feynman Tradition</b></a> (platers.github.io). The chapter spines are borrowed; the prose here is rewritten for concision \u2014 thought-provoking, no filler. Built on Stanford CS336 (Hashimoto &amp; Liang).</div>
        </div>
        ${parts}
        <div class="lecnav"><a href="index.html"><div class="dir">\u2190 Back</div><div class="ttl">All lectures &amp; quizzes</div></a><span></span></div>
      </article>`;

    C.renderMath(root);
    setupScrollSpy();
    if (location.hash) {
      const t = document.getElementById(location.hash.slice(1));
      if (t) t.scrollIntoView();
    }
  }

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
    }, { rootMargin: "-12% 0px -75% 0px", threshold: 0 });
    targets.forEach(t => obs.observe(t));
  }

  document.addEventListener("DOMContentLoaded", render);
})();
