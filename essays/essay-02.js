/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(2, {
  "read": 2,
  "blocks": [
    {
      "p": "A frontier training run sounds like it needs a supercomputer to forecast. It needs a napkin. A handful of constants govern the cost of everything — and the only operation that matters is the matmul. Every elementwise op, every norm, is asymptotically free beside it."
    },
    {
      "p": "Multiplying \\(A_{m\\times k}\\) by \\(B_{k\\times n}\\) costs \\(2mnk\\) FLOPs — one multiply, one add per output. Chain it through a network and the forward pass is \\(2ND\\) for \\(N\\) parameters over \\(D\\) tokens. Backward is two matmuls per weight, not one: the weight gradient and the relayed input gradient. That is \\(4ND\\)."
    },
    {
      "p": "Add them and training costs \\(\\approx 6ND\\). That is the <strong>rule of six</strong> — no mystery constant, just one matmul forward and two back. Inference is forward-only, \\(\\approx 2N\\) per token, so serving a token runs a third the cost of learning from one."
    },
    {
      "p": "Memory is a second, equally fixed tax. Every parameter drags <strong>16 bytes</strong> through training: 4 for itself, 4 for its gradient, 8 for Adam's two moments. Mixed precision only reshuffles them — bf16 weights, an fp32 master copy — and still lands at 16. Low precision buys faster matmuls, not a smaller footprint."
    },
    {
      "p": "Now the napkin pays off. Training time is one division: \\(6ND\\) over \\(n_{\\text{gpu}}\\times\\text{peak}\\times\\text{MFU}\\), where MFU — the fraction of peak you actually sustain — runs 0.3 to 0.5. The largest trainable model is another: total GPU memory over 16 bytes. Eight H100s cap out near 40B parameters, before a single activation."
    },
    {
      "callout": "So a 70B model on 15T tokens is \\(6\\cdot 70\\text{e}9\\cdot 15\\text{e}12 \\approx 6.3\\times10^{24}\\) FLOPs — about 144 days on 1024 H100s at half MFU. You just scoped a frontier run on a napkin. Two laws and two divisions: the matmul is the only line item, and everything else is a constant you already know.",
      "kind": "insight"
    }
  ]
});
