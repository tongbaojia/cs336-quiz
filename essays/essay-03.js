/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(3, {
  "read": 2,
  "blocks": [
    {
      "p": "Line up the model cards from the past two years and something strange jumps out: dozens of teams, training behind closed doors, converged on the <em>same</em> architecture. Pre-norm, RMSNorm, SwiGLU, RoPE, GQA. The 2017 Transformer was quietly rebuilt part by part — and everyone landed on the same answer."
    },
    {
      "p": "Each delta has a reason. <strong>Pre-norm</strong> moves the norm inside the block so the residual path stays a clean identity — gradients flow undistorted, so you raise the LR and skip warmup. <strong>RMSNorm</strong> drops mean-centering and bias: equal quality, fewer ops. <strong>SwiGLU</strong> gates the FFN for a small, steady gain. <strong>RoPE</strong> rotates Q/K so attention sees only the relative offset \\(i-j\\). <strong>GQA</strong> shares KV heads to shrink the cache that throttles decoding."
    },
    {
      "p": "Notice what justifies none of it: theory. The skeleton — attention, residual, FFN — never moved; every delta sits in normalization, positions, or the FFN. Asked <em>why</em> SwiGLU works, Shazeer answered 'divine benevolence.' These choices didn't win arguments. They won by surviving — across scales, teams, and budgets no academic can rerun."
    },
    {
      "p": "But not every survivor is load-bearing. Pre-norm is genuine consensus with a mechanism behind it; GQA is a hard inference win, forced by the KV-cache bottleneck, not quality. RMSNorm and dropping biases are cheap, safe efficiency. SwiGLU and the exact \\(\\tfrac{8}{3}d_{model}\\) ratio are small gains, half of it cargo cult. Copy the first kind with confidence; treat the rest as a wide basin."
    },
    {
      "callout": "Convergence across independent teams is strong evidence — but some of it is imitation, not validation. The lesson cuts deeper than any one block: your intuitions about what <em>should</em> work don't transfer. The survivors do. The frontier architecture isn't a derivation — it's a graveyard of ablations with the winners left standing.",
      "kind": "insight"
    }
  ]
});
