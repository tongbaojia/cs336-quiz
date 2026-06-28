/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(15, {
  "read": 3,
  "blocks": [
    {
      "p": "A base model is a vast library with no librarian. Pretraining on the web makes it <em>know</em> everything and <em>do</em> nothing you ask — it continues documents, it does not follow instructions. So alignment is not about pouring in knowledge. It is about surfacing the behavior already inside."
    },
    {
      "p": "<strong>SFT</strong> comes first and is almost embarrassingly plain: maximum likelihood on a few curated (prompt, response) pairs — the same cross-entropy as pretraining, on instruction-shaped data. LIMA aligned a 65B model with <strong>1,000</strong> examples. That is the <em>superficial alignment hypothesis</em>: ability is learned in pretraining; SFT only picks which voice to speak in. Quality beats quantity — and teaching a fact the model never learned just trains it to answer confidently when it has no idea."
    },
    {
      "p": "SFT can only imitate, and imitation is capped at the demonstrator: you clone the expert, mistakes and all, and never exceed them. <strong>RLHF</strong> changes the question — not 'write the ideal answer' but 'which of these two is better?' People judge more reliably than they produce. A <strong>Bradley-Terry</strong> reward model turns those comparisons into a score, \\(P(y_w \\succ y_l) = \\sigma(r_w - r_l)\\), and the policy climbs it."
    },
    {
      "p": "A learned reward is only honest near its data; push too hard and the policy finds nonsense it rates highly — Goodhart, mechanized. So you leash it to the original with a KL penalty, \\(\\max\\, \\mathbb{E}[r] - \\beta\\, \\mathrm{KL}(\\pi \\,\\|\\, \\pi_{\\mathrm{ref}})\\). Too loose and it mode-collapses into reward-hacking; too tight and it never moves. Tuned right, InstructGPT's <strong>1.3B</strong> beat the <strong>175B</strong> GPT-3 on human preference."
    },
    {
      "callout": "Alignment is taste, not knowledge. The capable assistant was already inside the base model; SFT surfaces it with a handful of examples, and RLHF sharpens it not by dictating the right answer but by preferring the better of two. You are not teaching the model what to know — you are teaching it what good looks like.",
      "kind": "insight"
    }
  ]
});
