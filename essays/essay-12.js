/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(12, {
  "read": 2,
  "blocks": [
    {
      "p": "There is no one true number. Every evaluation is a proxy, and every proxy leaks — the score moves when you change something that has nothing to do with the model. Your job isn't to trust the leaderboard; it's to know exactly how each metric lies."
    },
    {
      "p": "Take perplexity, the textbook intrinsic metric: \\(\\exp\\) of the mean per-token negative log-likelihood. It feels objective; it isn't comparable. Perplexity is <em>per token</em>, and a token is not a fixed unit — a finer tokenizer chops the same text into more, easier pieces, quietly <em>lowering</em> per-token perplexity, while a coarser, bigger vocabulary packs more information per token and <em>inflates</em> it. The number simply isn't comparable across tokenizers. Report <strong>bits-per-byte</strong>, or you're comparing apples to oranges."
    },
    {
      "p": "Multiple-choice looks safer — just check the answer. But how? Score the letter token <code>p('A')</code> and you measure symbol-binding, brittle to position bias. Score the full answer string and you measure plausibility, but longer answers carry lower joint probability, so you must length- or PMI-normalize. The <em>same</em> model on the <em>same</em> MMLU swings several points between harnesses and shot counts. A score without its recipe is noise."
    },
    {
      "p": "No reference answer? Reach for a judge — and the judge has opinions of its own: position bias, verbosity bias, self-preference. AlpacaEval's headline is win-rate against GPT-4 <em>as judged by GPT-4</em>, a quality contest that quietly pays out for length and its own style. Even human Arena Elo ships with bootstrap CIs: overlapping intervals are ties, and it rewards vibes as much as substance."
    },
    {
      "callout": "Underneath all of it sits contamination. ML 101 says don't train on the test set, but frontier models eat undisclosed Internet-scale corpora, so benchmarks leak into pretraining and the score measures memorization, not skill — a freshly-built GSM8K clone exposed accuracy drops up to ~13%. Treat every number as inflated until you've found the leak. Evaluation is adversarial measurement, not a scoreboard.",
      "kind": "insight"
    }
  ]
});
