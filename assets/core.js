/* CS336 Companion — core: catalog, registry, progress storage */
(function () {
  "use strict";

  // Static catalog: source of truth for the homepage listing and lecture headers.
  // Content (overview/sections/quiz) is registered separately by lectures/lecture-XX.js.
  const CATALOG = [
    { id: 1,  unit: "Basics",       type: "exec",   title: "Overview & Tokenization",            by: "Percy Liang",      topics: ["BPE", "compute = efficiency × resources", "6ND"] },
    { id: 2,  unit: "Basics",       type: "exec",   title: "PyTorch & Resource Accounting",      by: "Percy Liang",      topics: ["FLOPs", "memory", "bf16/fp32", "MFU"] },
    { id: 3,  unit: "Basics",       type: "slides", title: "Architectures & Hyperparameters",    by: "Tatsu Hashimoto",  topics: ["pre-norm", "RoPE", "SwiGLU", "GQA"] },
    { id: 4,  unit: "Basics",       type: "slides", title: "Mixture of Experts",                 by: "Tatsu Hashimoto",  topics: ["routing", "sparsity", "load balancing"] },
    { id: 5,  unit: "Systems",      type: "slides", title: "GPUs",                               by: "Tatsu Hashimoto",  topics: ["memory hierarchy", "roofline", "occupancy"] },
    { id: 6,  unit: "Systems",      type: "exec",   title: "Kernels & Triton",                   by: "Tatsu Hashimoto",  topics: ["fusion", "FlashAttention", "Triton"] },
    { id: 7,  unit: "Systems",      type: "slides", title: "Parallelism (Basics)",               by: "Tatsu Hashimoto",  topics: ["data/tensor/pipeline", "collectives"] },
    { id: 8,  unit: "Systems",      type: "exec",   title: "Parallelism (Implementation)",       by: "Percy Liang",      topics: ["all-reduce", "FSDP", "sharding"] },
    { id: 9,  unit: "Scaling laws", type: "slides", title: "Scaling Laws (Basics)",              by: "Tatsu Hashimoto",  topics: ["power laws", "Chinchilla", "IsoFLOP"] },
    { id: 10, unit: "Systems",      type: "exec",   title: "Inference",                          by: "Percy Liang",      topics: ["prefill/decode", "KV cache", "speculative"] },
    { id: 11, unit: "Scaling laws", type: "slides", title: "Scaling Laws (Details)",             by: "Tatsu Hashimoto",  topics: ["hyperparam transfer", "μP", "data-constrained"] },
    { id: 12, unit: "Data",         type: "exec",   title: "Evaluation",                         by: "Percy Liang",      topics: ["perplexity", "MMLU", "LM-as-judge"] },
    { id: 13, unit: "Data",         type: "exec",   title: "Data I — Curation",                  by: "Percy Liang",      topics: ["Common Crawl", "HTML→text", "filtering"] },
    { id: 14, unit: "Data",         type: "exec",   title: "Data II — Processing",               by: "Percy Liang",      topics: ["dedup", "MinHash", "quality classifiers"] },
    { id: 15, unit: "Alignment",    type: "slides", title: "Alignment — SFT & RLHF",             by: "Tatsu Hashimoto",  topics: ["SFT", "reward models", "PPO"] },
    { id: 16, unit: "Alignment",    type: "slides", title: "Alignment — RL & Verifiable Rewards",by: "Tatsu Hashimoto",  topics: ["RLVR", "GRPO", "reasoning"] },
    { id: 17, unit: "Alignment",    type: "exec",   title: "Alignment — Policy Gradients",       by: "Percy Liang",      topics: ["REINFORCE", "DPO", "GRPO"] },
    { id: 18, unit: "Guest",        type: "guest",  title: "Guest Lecture — Qwen",               by: "Junyang Lin",      topics: ["open models"] },
    { id: 19, unit: "Guest",        type: "guest",  title: "Guest Lecture — Llama",              by: "Mike Lewis",       topics: ["open models"] },
  ];

  const UNITS = ["Basics", "Systems", "Scaling laws", "Data", "Alignment", "Guest"];
  const UNIT_CLASS = { "Basics": "basics", "Systems": "systems", "Scaling laws": "scaling", "Data": "data", "Alignment": "alignment", "Guest": "guest" };

  window.CS336 = window.CS336 || {};
  window.LECTURES = window.LECTURES || {};

  function registerLecture(L) {
    if (!L || typeof L.id !== "number") { console.warn("registerLecture: bad lecture", L); return; }
    window.LECTURES[L.id] = L;
  }

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
        window.renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          throwOnError: false,
        });
      } catch (e) {}
    }
  }

  Object.assign(window.CS336, {
    CATALOG, UNITS, UNIT_CLASS,
    registerLecture, catalogEntry, hasContent,
    loadProgress, saveProgress, getLec, setLec, resetProgress,
    quizBest, quizTotal, esc, renderMath,
  });
  // convenience global for lecture data files
  window.registerLecture = registerLecture;
})();
