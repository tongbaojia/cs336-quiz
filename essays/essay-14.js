/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(14, {
  "read": 2,
  "blocks": [
    {
      "p": "Estimate, score, keep. You cannot read the web — trillions of tokens — so you never decide what's good; you <em>estimate</em> it with something cheap and let the estimate run over everything. Filtering and dedup are where a surprising share of model quality hides, and neither touches the architecture."
    },
    {
      "p": "Filtering is one problem in three disguises. Given a small <strong>target</strong> set \\(T\\) (say, Wikipedia-like text) and a giant <strong>raw</strong> set \\(R\\), find the subset of \\(R\\) that looks like \\(T\\) — language ID, quality, and toxicity alike. The catch: the scorer runs over all of \\(R\\), so it must be a cheap proxy, not a transformer. A linear fastText or a 5-gram KenLM does the heavy lifting; you buy quality with throughput, not parameters."
    },
    {
      "p": "And 'quality' is a treacherous word. A quality classifier has no idea what quality is — it's trained to make raw text <em>look like a chosen reference</em> (Wikipedia, instruction data), so 'quality' is a policy choice that silently imports that set's blind spots. Max the threshold and you over-filter: Nemotron-CC found FineWeb-Edu and DCLM discard ~90% of tokens, erasing whole dialects. GPT-3 keeps documents <em>stochastically</em> to avoid collapsing onto the reference."
    },
    {
      "p": "Then dedup, which Lee et al. proved just makes models better: less train/test leakage, less verbatim memorization, less compute relearning the same string — one product description appears <strong>61,036 times</strong> in C4. Comparing all pairs is quadratic, so the whole game is hashing your way to linear. <strong>MinHash</strong> is the move: a hash whose collision probability <em>equals</em> Jaccard similarity, sharpened by LSH bands into a near-step threshold."
    },
    {
      "callout": "None of this is glamorous, and that's the point. The frontier pours effort here because filtering and dedup move benchmark numbers as much as model changes do — DCLM's classifier beats heuristic pipelines, dedup strictly helps, mixing reweights domains for free. Estimate, score, keep. The model you ship is mostly the data you chose to keep.",
      "kind": "insight"
    }
  ]
});
