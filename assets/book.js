/* CS336 Companion — "The Why" narrative book page (EN / 简体中文) */
(function () {
  "use strict";
  const C = window.CS336;
  const ZH = C.BOOK_ZH;
  const LKEY = "cs336_book_lang";

  function curLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "zh" || q === "en") return q;
    try { const s = localStorage.getItem(LKEY); if (s === "zh" || s === "en") return s; } catch (e) {}
    return "en";
  }
  function setLang(lang) {
    try { localStorage.setItem(LKEY, lang); } catch (e) {}
    const u = new URL(location.href);
    u.searchParams.set("lang", lang);
    history.replaceState(null, "", u);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    render();
    window.scrollTo({ top: 0 });
  }

  function chapter(id, zh) {
    const cat = C.catalogEntry(id);
    const num = String(id).padStart(2, "0");
    const title = zh ? (ZH.titles[id] || cat.title) : cat.title;
    const kickText = zh ? ZH.kickers[id] : cat.kicker;
    const kicker = kickText ? `<div class="kicker">${C.esc(kickText)}</div>` : "";
    const E = zh ? C.getEssayZh(id) : C.getEssay(id);
    const pending = zh ? "中文版即将上线。" : "Essay coming soon.";
    const body = (E && E.blocks && E.blocks.length)
      ? `<div class="essay">${C.renderBlocks(E.blocks)}</div>`
      : `<p class="pending">${pending}</p>`;
    const linkText = zh ? ZH.ui.openLecture : "Open the full lecture + quiz \u2192";
    const link = `<div class="cfoot"><a href="lecture.html?id=${id}">${linkText}</a></div>`;
    return `<div class="chapter" id="l-${id}">
        <div class="chead"><span class="cnum">${num}</span><h3>${C.esc(title)}</h3></div>
        ${kicker}${body}${link}
      </div>`;
  }

  function render() {
    const root = document.getElementById("book");
    const lang = curLang();
    const zh = lang === "zh";
    const partName = p => zh ? (ZH.parts[p.part] ? ZH.parts[p.part].name : p.name) : p.name;
    const partBlurb = p => zh ? (ZH.parts[p.part] ? ZH.parts[p.part].blurb : p.blurb) : p.blurb;
    const chTitle = id => zh ? (ZH.titles[id] || C.catalogEntry(id).title) : C.catalogEntry(id).title;
    const cnNum = { "I": "一", "II": "二", "III": "三", "IV": "四", "V": "五", "VI": "六" };
    const partLabel = p => zh ? ("第" + (cnNum[p.part] || p.part) + "部分") : ("Part " + p.part);

    const tocParts = C.BOOK_PARTS.map(p =>
      `<div class="tlabel" style="margin-top:14px">${partLabel(p)} \u00b7 ${C.esc(partName(p))}</div>` +
      p.ids.map(id => `<a href="#l-${id}" data-sec="l-${id}">${String(id).padStart(2, "0")} \u00b7 ${C.esc(chTitle(id))}</a>`).join("")
    ).join("");

    const parts = C.BOOK_PARTS.map(p =>
      `<div class="part" id="part-${p.part}">
        <div class="pnum">${partLabel(p)}</div>
        <h2>${C.esc(partName(p))}</h2>
        <p class="pblurb">${C.esc(partBlurb(p))}</p>
        <div class="prule"></div>
      </div>` + p.ids.map(id => chapter(id, zh)).join("")
    ).join("");

    const hero = zh ? {
      eyebrow: ZH.ui.eyebrow,
      h1: `${C.esc(ZH.ui.h1a)}<span class="grad">${C.esc(ZH.ui.h1b)}</span>`,
      intro: ZH.ui.intro, credit: ZH.ui.credit,
    } : {
      eyebrow: "The Why \u00b7 a companion read",
      h1: `Language modeling, <span class="grad">explained</span>`,
      intro: "The lecture pages tell you <em>what</em> and <em>how</em>. This is the other half: short, punchy chapters on <em>why</em> a modern language model is built the way it is \u2014 why we tokenize, why the matmul is the only operation that matters, why a 100B-parameter model is mostly a memory-movement problem, and why no one can yet tell you, with a straight face, why any of it works as well as it does. The equations are the punchlines.",
      credit: "Adapted with credit from <a href='https://platers.github.io/cs336-feynman/index.html' target='_blank' rel='noopener'><b>The CS336 Lectures \u2014 A Study Book in the Feynman Tradition</b></a> (platers.github.io). The chapter spines are borrowed; the prose here is rewritten for concision \u2014 thought-provoking, no filler. Built on Stanford CS336 (Hashimoto &amp; Liang).",
    };

    const backText = zh ? ZH.ui.back : "Back";
    const backTtl = zh ? ZH.ui.backTtl : "All lectures & quizzes";
    const tocLabel = zh ? ZH.ui.tocLabel : "The Why";

    root.innerHTML = `
      <aside class="toc">
        <div class="tlabel">${tocLabel}</div>
        <nav id="tocnav">${tocParts}</nav>
      </aside>
      <article class="article">
        <div class="book-hero">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div class="eyebrow">${hero.eyebrow}</div>
            <div class="segmented" id="langToggle">
              <button data-lang="en" class="${zh ? "" : "active"}">EN</button>
              <button data-lang="zh" class="${zh ? "active" : ""}">中文</button>
            </div>
          </div>
          <h1>${hero.h1}</h1>
          <p>${hero.intro}</p>
          <div class="credit">${hero.credit}</div>
        </div>
        ${parts}
        <div class="lecnav"><a href="index.html"><div class="dir">\u2190 ${backText}</div><div class="ttl">${backTtl}</div></a><span></span></div>
      </article>`;

    document.querySelectorAll("#langToggle button").forEach(b =>
      b.onclick = () => { if (b.dataset.lang !== lang) setLang(b.dataset.lang); });

    C.renderMath(root);
    if (C.enhanceCode) C.enhanceCode(root);
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

  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.lang = curLang() === "zh" ? "zh-CN" : "en";
    render();
  });
})();
