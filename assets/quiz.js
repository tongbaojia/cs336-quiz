/* CS336 Companion — embedded quiz engine.
   mountQuiz(rootEl, lectureId, questions): renders a self-contained quiz that
   persists answers + best score to progress, with Exam/Practice modes. */
(function () {
  "use strict";
  const C = window.CS336;
  const LETTERS = ["A", "B", "C", "D", "E"];

  function mountQuiz(root, lecId, questions, onChange) {
    const TOTAL = questions.length;
    const saved = (C.getLec(lecId).quiz) || {};
    const state = {
      idx: 0,
      answers: saved.answers || {},
      mode: saved.mode || "exam",
      submitted: false,
      view: "quiz",
    };

    function persist(extra) {
      const correct = countCorrect();
      const prev = (C.getLec(lecId).quiz) || {};
      const best = Math.max(prev.best || 0, state.submitted ? correct : (prev.best || 0));
      C.setLec(lecId, { quiz: Object.assign({}, prev, { answers: state.answers, mode: state.mode, best: best, total: TOTAL }, extra) });
      if (onChange) onChange();
    }
    function countAnswered() { return questions.filter(q => state.answers[q.id] !== undefined).length; }
    function countCorrect() { return questions.filter(q => state.answers[q.id] === q.answer).length; }
    function feedbackOn(q) { return state.submitted || (state.mode === "practice" && state.answers[q.id] !== undefined); }
    function statusOf(q) {
      const a = state.answers[q.id];
      if (a === undefined) return "empty";
      if (state.mode === "practice" || state.submitted) return a === q.answer ? "correct" : "incorrect";
      return "answered";
    }

    function render() {
      if (state.view === "results") return renderResults();
      const q = questions[state.idx];
      const fb = feedbackOn(q);
      const chosen = state.answers[q.id];
      const opts = q.options.map((text, i) => {
        let cls = "qopt";
        if (fb) { cls += " locked"; if (i === q.answer) cls += " correct"; else if (i === chosen) cls += " incorrect"; }
        else if (i === chosen) cls += " selected";
        let mark = "";
        if (fb && i === q.answer) mark = '<span class="mark">\u2713</span>';
        else if (fb && i === chosen && chosen !== q.answer) mark = '<span class="mark">\u2717</span>';
        return `<button class="${cls}" data-opt="${i}"><span class="key">${LETTERS[i]}</span><span class="txt">${text}</span>${mark}</button>`;
      }).join("");

      let explain = "";
      if (fb) {
        const right = chosen === q.answer;
        const cls = chosen === undefined ? "" : (right ? "good" : "bad");
        const lbl = chosen === undefined ? "Answer" : (right ? "Correct" : "Not quite");
        explain = `<div class="qexplain ${cls}"><div class="lbl">${lbl} \u00b7 ${LETTERS[q.answer]}</div>${q.explain}</div>`;
      }
      const isLast = state.idx === TOTAL - 1;

      root.innerHTML = shell(`
        ${palette()}
        <div class="qcard">
          <div class="qmeta"><span class="qbadge">${C.esc(q.section || "Quiz")}</span><span class="qnum">Q${state.idx + 1} of ${TOTAL}</span></div>
          <p class="qtext">${q.q}</p>
          <div class="qopts">${opts}</div>
          ${explain}
          <div class="qnav">
            <button class="btn" data-act="prev" ${state.idx === 0 ? "disabled" : ""}>\u2190 Prev</button>
            <span class="hint"><kbd>A</kbd>\u2013<kbd>${LETTERS[q.options.length - 1]}</kbd> answer \u00b7 <kbd>\u2190</kbd><kbd>\u2192</kbd> move</span>
            ${isLast ? `<button class="btn primary" data-act="finish">Finish \u2192</button>` : `<button class="btn" data-act="next">Next \u2192</button>`}
          </div>
        </div>`);
      wire();
      C.renderMath(root);
    }

    function renderResults() {
      const score = countCorrect(), pct = Math.round(score / TOTAL * 100);
      const verdict = pct >= 90 ? "Mastered." : pct >= 75 ? "Solid grasp." : pct >= 50 ? "Getting there." : "Worth a re-read.";
      const wrong = questions.filter(q => state.answers[q.id] !== q.answer);
      const review = wrong.length === 0
        ? `<div class="empty-good">\u2713 Perfect \u2014 every question correct.</div>`
        : wrong.map(q => {
            const a = state.answers[q.id];
            const yourLine = a === undefined
              ? `<div class="line na">Your answer: \u2014 (skipped)</div>`
              : `<div class="line you">You: ${LETTERS[a]}. ${q.options[a]}</div>`;
            return `<div class="rev"><p class="q">${q.q}</p>${yourLine}<div class="line ok">Correct: ${LETTERS[q.answer]}. ${q.options[q.answer]}</div><div class="why">${q.explain}</div></div>`;
          }).join("");
      root.innerHTML = shell(`
        <div class="qcard qresults">
          <div class="qr-hero">
            <div class="ring" style="--p:${pct}"><div class="inner"><div class="pct">${pct}%</div><div class="frac">${score} / ${TOTAL}</div></div></div>
            <div><div class="verdict">${verdict}</div><div class="vsub">Best saved score for this lecture: ${Math.max(score, C.quizBest(lecId) || 0)} / ${TOTAL}</div></div>
          </div>
          <div class="review-list">${review}</div>
          <div class="qnav">
            <button class="btn" data-act="back">\u2190 Review questions</button>
            <button class="btn primary" data-act="retry">Retry quiz</button>
          </div>
        </div>`);
      wire();
      C.renderMath(root);
    }

    function shell(inner) {
      return `<div class="qbhead"><h2>Check yourself</h2>
        <div class="seg" data-seg>
          <button data-mode="exam" class="${state.mode === "exam" ? "active" : ""}">Exam</button>
          <button data-mode="practice" class="${state.mode === "practice" ? "active" : ""}">Practice</button>
        </div></div>${inner}`;
    }
    function palette() {
      const dots = questions.map((q, i) => {
        const cls = "pdot " + statusOf(q) + (i === state.idx ? " current" : "");
        return `<button class="${cls}" data-jump="${i}">${i + 1}</button>`;
      }).join("");
      const ans = countAnswered();
      const sc = (state.mode === "practice" || state.submitted) ? ` \u00b7 ${countCorrect()}/${TOTAL} correct` : "";
      return `<div class="qpalette">${dots}</div><div class="hint" style="margin:-8px 0 4px">answered ${ans}/${TOTAL}${sc}</div>`;
    }

    function wire() {
      root.querySelectorAll("[data-seg] button").forEach(b => b.onclick = () => { state.mode = b.dataset.mode; persist(); render(); });
      root.querySelectorAll("[data-jump]").forEach(b => b.onclick = () => { state.view = "quiz"; state.idx = +b.dataset.jump; render(); });
      root.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => select(+b.dataset.opt));
      root.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
    }
    function select(i) {
      const q = questions[state.idx];
      if (feedbackOn(q) && state.mode !== "practice") return;
      state.answers[q.id] = i;
      persist();
      render();
    }
    function act(a) {
      if (a === "prev") { if (state.idx > 0) { state.idx--; render(); } }
      else if (a === "next") { if (state.idx < TOTAL - 1) { state.idx++; render(); } }
      else if (a === "finish") { state.submitted = true; state.view = "results"; persist(); render(); root.scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (a === "back") { state.view = "quiz"; const fw = questions.findIndex(q => state.answers[q.id] !== q.answer); state.idx = fw >= 0 ? fw : 0; render(); }
      else if (a === "retry") { state.answers = {}; state.submitted = false; state.view = "quiz"; state.idx = 0; persist(); render(); root.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }

    // keyboard (only when this quiz is the active region)
    root.addEventListener("keydown", (e) => {
      if (state.view === "results") return;
      const k = e.key.toLowerCase();
      const li = ["a", "b", "c", "d", "e"].indexOf(k);
      const ni = ["1", "2", "3", "4", "5"].indexOf(k);
      const q = questions[state.idx];
      if (li >= 0 && li < q.options.length) { select(li); e.preventDefault(); }
      else if (ni >= 0 && ni < q.options.length) { select(ni); e.preventDefault(); }
      else if (e.key === "ArrowRight") { act("next"); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { act("prev"); e.preventDefault(); }
    });
    root.tabIndex = 0;

    render();
  }

  window.CS336.mountQuiz = mountQuiz;
})();
