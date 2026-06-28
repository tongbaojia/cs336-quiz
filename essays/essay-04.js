/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(4, {
  "read": 2,
  "blocks": [
    {
      "p": "Every parameter in a dense transformer is a parameter every token pays for. Mixture-of-Experts tears up that contract. Swap the single feedforward block for \\(N\\) experts plus a tiny router that fires only the top \\(k\\) per token, and capacity scales with \\(N\\) while per-token FLOPs scale with \\(k\\). Mixtral stores 47B parameters and bills each token for 13B — roughly Llama-2-70B quality at a fifth of the active compute."
    },
    {
      "p": "The bet is simple: <strong>capacity is cheap, compute is expensive</strong>. Parameters cost memory, and memory you buy by the rack. FLOPs cost wall-clock on the critical path of every forward pass. MoE spends the cheap resource to spare the expensive one — knowledge a token can look up without every token paying to run it."
    },
    {
      "p": "Nothing is free. The top-\\(k\\) choice is non-differentiable, and left alone the router collapses onto a few favorite experts while the rest starve. So you bolt on a heuristic: an auxiliary loss that multiplies each expert's hard load by its soft probability and pushes the over-chosen down. RL is the principled fix; gradient variance kills it. The frontier runs on a load-balancing hack, the same way it runs on a tokenizer hack."
    },
    {
      "p": "And the experts scatter across GPUs. Every layer now ships each token to its expert's device and gathers the output back — two all-to-all collectives, bandwidth-bound, that stall the instant one expert is overloaded. Memory never shrinks either: all \\(N\\) experts stay resident, so a '47B' MoE still demands 47B-worth of HBM. You save FLOPs, never footprint."
    },
    {
      "callout": "MoE is a free lunch with a systems bill. The FLOPs you stop paying come back as communication, memory, and a training objective that fights your loss for balance. Frontier labs pay it anyway — DeepSeek-V3 carries 671B parameters and computes like 37B. The cheapest parameter is the one you never have to run.",
      "kind": "insight"
    }
  ]
});
