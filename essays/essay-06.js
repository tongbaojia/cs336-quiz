/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(6, {
  "read": 2,
  "blocks": [
    {
      "p": "Most of a transformer's runtime goes to moving bytes, not multiplying them. Matmul is the lone op with enough reuse to be compute-bound; GeLU, softmax, LayerNorm — everything else — is memory-bound, idling on HBM. So writing a kernel comes down to one discipline: refuse to touch DRAM when you don't have to."
    },
    {
      "p": "Start with fusion. Compute an activation as a chain of PyTorch ops and each one is its own kernel — read input from the warehouse, write result back, a round-trip per operator. Fuse the chain into a single kernel and every intermediate stays on-chip: one read in, one write out. Identical math; the fused version just stops shipping to HBM five times."
    },
    {
      "p": "Triton is what makes that writable. It lifts the abstraction from threads to blocks — you choose the tiles and masks, it handles coalescing, shared memory, and scheduling inside the SM. A fused softmax that keeps each row resident in SRAM cuts the naive five reads per element toward one, and can beat the stock PyTorch op. The magic turns out to be bookkeeping about where the bytes sit."
    },
    {
      "p": "FlashAttention is the whole idea in one kernel. Naive attention builds the full N×N score matrix in HBM, softmaxes it, reads it back — O(N²) memory and traffic, which <em>is</em> the runtime. Instead, tile \\(Q\\), \\(K\\), \\(V\\) and carry the softmax across tiles with a running max and denominator, rescaling the accumulator by \\(e^{m-m'}\\) as each block lands. The N×N matrix is never written. O(N²) memory becomes O(N), and it's <em>exact</em>."
    },
    {
      "callout": "Even the backward pass refuses the warehouse: rather than store the N×N probabilities, FlashAttention recomputes them from \\(Q,K,V\\) — more FLOPs, fewer HBM trips, and since memory is the bottleneck, that trade wins. A fast kernel isn't exotic arithmetic. It's the refusal to move a byte you didn't have to.",
      "kind": "insight"
    }
  ]
});
