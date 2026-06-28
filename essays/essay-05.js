/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(5, {
  "read": 2,
  "blocks": [
    {
      "p": "A GPU is a blazing-fast factory bolted to a slow, enormous warehouse. The factory is the tensor cores; the warehouse is HBM — 80GB of it, with a narrow road between. An H100 runs about 1e15 bf16 FLOPs per second and reads 3.35 TB/s from memory. Divide the two: <strong>roughly 300 FLOPs for every byte you haul in</strong>, just to keep the factory busy."
    },
    {
      "p": "That ratio is the whole game. Arithmetic intensity is FLOPs done per byte moved, and the roofline says you run at whichever is smaller — peak compute, or intensity times bandwidth. Above the ridge (~300 on an H100) you're compute-bound and the silicon earns its keep. Below it you're memory-bound: the factory idles while the road is jammed."
    },
    {
      "p": "Almost everything lives below the line. A ReLU does one FLOP per element and moves four bytes — intensity 0.25, a thousandfold under the ridge. Softmax, LayerNorm, every activation: same story. Only big matmuls clear it, because their intensity climbs with size, about \\(n/3\\) for an n×n. The headline TFLOPs are a number your data movement rarely lets you reach."
    },
    {
      "p": "So the optimizations that matter don't do less math — they move less data. Fuse a chain of ops so intermediates never leave the chip. Tile a matmul so each value pulled from HBM feeds many more multiplies. Recompute cheap activations instead of storing them. Identical FLOPs, a fraction of the trips to the warehouse."
    },
    {
      "callout": "When a kernel is slow, don't count FLOPs — count bytes. Compute has outrun bandwidth for decades and the gap widens every GPU generation, so more of your workload slips below the line each year, not less. The job was never to do less math. It's to stop walking to the warehouse.",
      "kind": "key"
    }
  ]
});
