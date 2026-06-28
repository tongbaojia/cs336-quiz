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

  // Simplified-Chinese strings for the book view (信达雅 translation; technical terms kept in English).
  const BOOK_ZH = {
    titles: {
      1: "概览与分词", 2: "PyTorch 与资源核算", 3: "架构与超参数", 4: "混合专家 (MoE)",
      5: "GPU", 6: "Kernel 与 Triton", 7: "并行 · 基础", 8: "并行 · 实现",
      9: "Scaling Laws · 基础", 10: "推理", 11: "Scaling Laws · 细节", 12: "评估",
      13: "数据 I · 采集", 14: "数据 II · 处理", 15: "对齐 · SFT 与 RLHF",
      16: "对齐 · RL 与可验证奖励", 17: "对齐 · 策略梯度",
    },
    kickers: {
      1: "效率即一切；字母表的难题。", 2: "拿出草稿纸：六倍定律。", 3: "Transformer 的趋同进化。",
      4: "如何不付代价地增加参数。", 5: "仓库与工厂。", 6: "让魔法不再神秘。",
      7: "把数据中心当作一台计算机。", 8: "同样的道理，再用代码写一遍。", 9: "以小见大，预测大模型。",
      10: "一切都关乎内存。", 11: "实验室真正使用的配方。", 12: "没有唯一正确的数字。",
      13: "数据不会从天而降。", 14: "估计、打分、保留。", 15: "从原始潜能到得力助手。",
      16: "当你能验证答案时。", 17: "奖优罚劣。",
    },
    parts: {
      "I":   { name: "基础",            blurb: "为何要分词，以及为何单单一个数字就决定了一切的成本。" },
      "II":  { name: "机器",            blurb: "免费换来更多参数，以及真正运行它们的硬件。" },
      "III": { name: "规模",            blurb: "由千卡汇成的一台计算机，以及让你敢于下注的定律。" },
      "IV":  { name: "如何判断它是否奏效", blurb: "没有唯一正确的数字。" },
      "V":   { name: "数据",            blurb: "荒原，以及如何从中开采。" },
      "VI":  { name: "对齐",            blurb: "把原始的下一词预测潜能，化为真正有用的东西。" },
    },
    ui: {
      eyebrow: "为什么 · 配套精读",
      h1a: "语言模型，", h1b: "讲透",
      intro: "讲义页面讲清楚了「是什么」和「怎么做」；这里是另一半：用简短有力的篇章讲「为什么」——为什么要分词，为什么矩阵乘法是唯一要紧的运算，为什么一个千亿参数的模型本质上是个搬运内存的问题，以及为什么至今没有人能板着脸说清它究竟为何如此有效。公式才是点睛之笔。",
      credit: "本篇在 <a href='https://platers.github.io/cs336-feynman/index.html' target='_blank' rel='noopener'><b>The CS336 Lectures — A Study Book in the Feynman Tradition</b></a>（platers.github.io）基础上改写并致谢。章节脉络借自原书，文字为求凝练而重写——发人深省，绝无废话。内容基于斯坦福 CS336（Hashimoto 与 Liang 主讲）。",
      openLecture: "阅读完整讲义与测验 →",
      tocLabel: "导读", back: "返回", backTtl: "全部讲义与测验",
    },
  };

  window.CS336 = window.CS336 || {};
  window.LECTURES = window.LECTURES || {};
  window.ESSAYS = window.ESSAYS || {};
  window.ESSAYS_ZH = window.ESSAYS_ZH || {};

  function registerLecture(L) {
    if (!L || typeof L.id !== "number") { console.warn("registerLecture: bad lecture", L); return; }
    window.LECTURES[L.id] = L;
  }
  function registerEssay(id, E) {
    if (typeof id !== "number" || !E) { console.warn("registerEssay: bad essay", id); return; }
    window.ESSAYS[id] = E;
  }
  function registerEssayZh(id, E) {
    if (typeof id !== "number" || !E) { console.warn("registerEssayZh: bad essay", id); return; }
    window.ESSAYS_ZH[id] = E;
  }
  function getEssay(id) { return window.ESSAYS[id] || null; }
  function getEssayZh(id) { return window.ESSAYS_ZH[id] || null; }
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
    CATALOG, UNITS, UNIT_CLASS, BOOK_PARTS, BOOK_ZH,
    registerLecture, registerEssay, registerEssayZh, getEssay, getEssayZh, hasEssay, catalogEntry, hasContent,
    loadProgress, saveProgress, getLec, setLec, resetProgress,
    quizBest, quizTotal, esc, renderMath,
  });
  // convenience globals for data files
  window.registerLecture = registerLecture;
  window.registerEssay = registerEssay;
  window.registerEssayZh = registerEssayZh;
})();
