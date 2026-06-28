/* CS336 Companion — core: catalog, registry, progress storage */
(function () {
  "use strict";

  // Static catalog: source of truth for the homepage listing and lecture headers.
  // Content (overview/sections/quiz) is registered separately by lectures/lecture-XX.js.
  const CATALOG = [
    { id: 1,  unit: "Basics",       type: "exec",   title: "Overview & Tokenization",            by: "Percy Liang",      topics: ["BPE", "compute = efficiency × resources", "6ND"], kicker: "Efficiency is the whole game; the problem of the alphabet." },
    { id: 2,  unit: "Basics",       type: "exec",   title: "PyTorch & Resource Accounting",      by: "Percy Liang",      topics: ["FLOPs", "memory", "bf16/fp32", "MFU"], kicker: "Get your napkins out: the rule of six." },
    { id: 3,  unit: "Basics",       type: "slides", title: "Architectures & Hyperparameters",    by: "Tatsu Hashimoto",  topics: ["pre-norm", "RoPE", "SwiGLU", "GQA"], kicker: "The convergent evolution of the Transformer." },
    { id: 4,  unit: "Basics",       type: "slides", title: "Mixture of Experts",                 by: "Tatsu Hashimoto",  topics: ["routing", "sparsity", "load balancing"], kicker: "How to add parameters without paying for them." },
    { id: 5,  unit: "Systems",      type: "slides", title: "GPUs",                               by: "Tatsu Hashimoto",  topics: ["memory hierarchy", "roofline", "occupancy"], kicker: "The warehouse and the factory." },
    { id: 6,  unit: "Systems",      type: "exec",   title: "Kernels & Triton",                   by: "Tatsu Hashimoto",  topics: ["fusion", "FlashAttention", "Triton"], kicker: "Making the magic less magic." },
    { id: 7,  unit: "Systems",      type: "slides", title: "Parallelism (Basics)",               by: "Tatsu Hashimoto",  topics: ["data/tensor/pipeline", "collectives"], kicker: "The datacenter as one computer." },
    { id: 8,  unit: "Systems",      type: "exec",   title: "Parallelism (Implementation)",       by: "Percy Liang",      topics: ["all-reduce", "FSDP", "sharding"], kicker: "The same lessons, written in code." },
    { id: 9,  unit: "Scaling laws", type: "slides", title: "Scaling Laws (Basics)",              by: "Tatsu Hashimoto",  topics: ["power laws", "Chinchilla", "IsoFLOP"], kicker: "Learning small to predict large." },
    { id: 10, unit: "Systems",      type: "exec",   title: "Inference",                          by: "Percy Liang",      topics: ["prefill/decode", "KV cache", "speculative"], kicker: "It's all about the memory." },
    { id: 11, unit: "Scaling laws", type: "slides", title: "Scaling Laws (Details)",             by: "Tatsu Hashimoto",  topics: ["hyperparam transfer", "μP", "data-constrained"], kicker: "The recipes the labs actually use." },
    { id: 12, unit: "Data",         type: "exec",   title: "Evaluation",                         by: "Percy Liang",      topics: ["perplexity", "MMLU", "LM-as-judge"], kicker: "There is no one true number." },
    { id: 13, unit: "Data",         type: "exec",   title: "Data I — Curation",                  by: "Percy Liang",      topics: ["Common Crawl", "HTML→text", "filtering"], kicker: "Data does not fall from the sky." },
    { id: 14, unit: "Data",         type: "exec",   title: "Data II — Processing",               by: "Percy Liang",      topics: ["dedup", "MinHash", "quality classifiers"], kicker: "Estimate, score, keep." },
    { id: 15, unit: "Alignment",    type: "slides", title: "Alignment — SFT & RLHF",             by: "Tatsu Hashimoto",  topics: ["SFT", "reward models", "PPO"], kicker: "From raw potential to a useful assistant." },
    { id: 16, unit: "Alignment",    type: "slides", title: "Alignment — RL & Verifiable Rewards",by: "Tatsu Hashimoto",  topics: ["RLVR", "GRPO", "reasoning"], kicker: "When you can check the answer." },
    { id: 17, unit: "Alignment",    type: "exec",   title: "Alignment — Policy Gradients",       by: "Percy Liang",      topics: ["REINFORCE", "DPO", "GRPO"], kicker: "Upweight the good, downweight the bad." },
    { id: 18, unit: "Guest",        type: "guest",  title: "Guest Lecture — Qwen",               by: "Junyang Lin",      topics: ["open models"] },
    { id: 19, unit: "Guest",        type: "guest",  title: "Guest Lecture — Llama",              by: "Mike Lewis",       topics: ["open models"] },
  ];

  const UNITS = ["Basics", "Systems", "Scaling laws", "Data", "Alignment", "Guest"];
  const UNIT_CLASS = { "Basics": "basics", "Systems": "systems", "Scaling laws": "scaling", "Data": "data", "Alignment": "alignment", "Guest": "guest" };

  // "The Why" narrative companion — parts mirror the source study book.
  const BOOK_PARTS = [
    { part: "I",   name: "Foundations",            blurb: "Why we tokenize, and why one number governs the cost of everything.", ids: [1, 2, 3] },
    { part: "II",  name: "The Machine",            blurb: "More parameters for free, and the hardware that actually runs them.", ids: [4, 5, 6] },
    { part: "III", name: "Scale",                  blurb: "One computer made of thousands, and the laws that let you bet on it.", ids: [7, 8, 9, 10, 11] },
    { part: "IV",  name: "Knowing Whether It Works", blurb: "There is no one true number.", ids: [12] },
    { part: "V",   name: "Data",                   blurb: "The wasteland, and how to mine it.", ids: [13, 14] },
    { part: "VI",  name: "Alignment",              blurb: "Turning raw next-token potential into something useful.", ids: [15, 16, 17] },
  ];

  window.CS336 = window.CS336 || {};
  window.LECTURES = window.LECTURES || {};
  window.ESSAYS = window.ESSAYS || {};

  function registerLecture(L) {
    if (!L || typeof L.id !== "number") { console.warn("registerLecture: bad lecture", L); return; }
    window.LECTURES[L.id] = L;
  }
  function registerEssay(id, E) {
    if (typeof id !== "number" || !E) { console.warn("registerEssay: bad essay", id); return; }
    window.ESSAYS[id] = E;
  }
  function getEssay(id) { return window.ESSAYS[id] || null; }
  function hasEssay(id) { return !!window.ESSAYS[id]; }

  function catalogEntry(id) { return CATALOG.find(c => c.id === id) || null; }
  function hasContent(id) { return !!window.LECTURES[id]; }

  // ---- progress (localStorage) ----
  const PKEY = "cs336_companion_v1";
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PKEY)) || { lectures: {} }; }
    catch (e) { return { lectures: {} }; }
  }
  function saveProgress(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} }
  function getLec(id) {
    const p = loadProgress();
    return p.lectures[id] || { read: false, quiz: null };
  }
  function setLec(id, patch) {
    const p = loadProgress();
    p.lectures[id] = Object.assign({ read: false, quiz: null }, p.lectures[id] || {}, patch);
    saveProgress(p);
    return p.lectures[id];
  }
  function resetProgress() { saveProgress({ lectures: {} }); }

  // quiz best score helpers
  function quizBest(id) {
    const l = getLec(id);
    return l.quiz && typeof l.quiz.best === "number" ? l.quiz.best : null;
  }
  function quizTotal(id) {
    return (window.LECTURES[id] && window.LECTURES[id].quiz) ? window.LECTURES[id].quiz.length : 0;
  }

  // small util: escape + math render hook
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function renderMath(el) {
    if (window.renderMathInElement) {
      try {
        // NOTE: "$" is intentionally NOT a delimiter — literal dollar amounts ($100M) must
        // not be parsed as math. Inline math uses \( \), display uses \[ \].
        window.renderMathInElement(el, {
          delimiters: [
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
          ],
          throwOnError: false,
        });
      } catch (e) {}
    }
  }

  Object.assign(window.CS336, {
    CATALOG, UNITS, UNIT_CLASS, BOOK_PARTS,
    registerLecture, registerEssay, getEssay, hasEssay, catalogEntry, hasContent,
    loadProgress, saveProgress, getLec, setLec, resetProgress,
    quizBest, quizTotal, esc, renderMath,
  });
  // convenience globals for data files
  window.registerLecture = registerLecture;
  window.registerEssay = registerEssay;
})();
