/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 4,
  "estMinutes": 19,
  "topics": [
    "MoE",
    "routing",
    "load balancing",
    "expert parallelism",
    "DeepSeek"
  ],
  "overview": "Mixture-of-Experts replaces the transformer's dense feedforward block with many <strong>expert</strong> FFNs plus a <strong>router</strong> that activates only the top-$k$ per token — <em>decoupling parameter count from per-token FLOPs</em>. Lecture 4 walks the routing zoo, the heuristic load-balancing losses that make sparse training actually work, the all-to-all systems cost, and the DeepSeek-MoE recipe that defines today's open frontier.",
  "sections": [
    {
      "id": "why-moe",
      "title": "Sparsity: capacity without compute",
      "blocks": [
        {
          "p": "A standard transformer block spends roughly two-thirds of its parameters in the FFN. A <strong>sparse MoE</strong> replaces that single FFN with $N$ parallel expert FFNs $E_1,\\dots,E_N$ and a router that, per token, selects only $k$ of them (typically $k\\!=\\!1$ or $2$). This is <em>conditional computation</em>: total capacity scales with $N$, but the compute each token pays scales with $k$."
        },
        {
          "math": "\\underbrace{|\\theta|}_{\\text{capacity}\\;\\propto\\;N} \\qquad\\text{decoupled from}\\qquad \\underbrace{\\text{FLOPs}/\\text{token}}_{\\text{compute}\\;\\propto\\;k}, \\qquad k \\ll N"
        },
        {
          "p": "Why this is suddenly everywhere: (1) at fixed FLOPs, more parameters lowers loss — MoEs sit on a better compute-vs-quality frontier (Fedus et al. 2022); (2) they train faster to a target loss (OLMoE); (3) they are competitive with dense peers — Mixtral 8×7B (~47B total, ~13B active) roughly matches Llama-2 70B; (4) experts shard cleanly across devices. The tax is memory, communication, and a heuristic, sometimes-unstable training objective."
        },
        {
          "table": {
            "head": [
              "Axis",
              "Dense FFN",
              "Sparse MoE (top-k of N)"
            ],
            "rows": [
              [
                "Total parameters",
                "1×",
                "≈ N× (every expert stored)"
              ],
              [
                "Active params / token",
                "all",
                "≈ k/N of total"
              ],
              [
                "FLOPs / token",
                "1×",
                "≈ k× one FFN (≪ N×)"
              ],
              [
                "Weight VRAM",
                "1×",
                "≈ N× — <strong>no saving</strong>"
              ],
              [
                "Extra machinery",
                "—",
                "router + all-to-all + balance loss"
              ]
            ]
          }
        },
        {
          "callout": "The bet behind MoE: <strong>capacity is cheap, compute is expensive.</strong> Parameters cost memory (you can buy more GPUs); FLOPs cost wall-clock on the critical path. MoE spends the cheap resource to save the expensive one — adding knowledge a token can <em>look up</em> without making every token pay for it.",
          "kind": "insight"
        },
        {
          "callout": "An MoE does <strong>not</strong> shrink your memory footprint — all $N$ experts must be resident, so weight VRAM scales with <em>total</em> not active params. The win is FLOPs and quality-per-FLOP, never footprint. A '47B' MoE needs ~47B-params worth of HBM even though it computes like a 13B.",
          "kind": "pitfall"
        },
        {
          "list": [
            "<strong>Shazeer et al. 2017</strong> — sparsely-gated MoE between LSTMs; noisy top-k gating + a load-balance loss; up to 137B params.",
            "<strong>GShard</strong> (Lepikhin 2020) — top-2 routing scaled past 600B for translation; formalized capacity factor + auxiliary loss.",
            "<strong>Switch Transformer</strong> (Fedus 2021) — top-<strong>1</strong> routing to 1.6T params; selective-fp32 + init tricks for stability.",
            "<strong>GLaM / ST-MoE</strong> — decoder MoE LMs; ST-MoE (Zoph 2022) adds the router z-loss.",
            "<strong>Mixtral, DBRX, Grok</strong> (2024) — open softmax top-2/top-4 decoder MoEs.",
            "<strong>DeepSeek-MoE, Qwen-MoE</strong> — fine-grained + shared experts; <strong>DeepSeek-V3</strong> (671B total / 37B active) sets the open frontier with aux-loss-free balancing."
          ]
        }
      ]
    },
    {
      "id": "anatomy",
      "title": "Anatomy of an MoE layer",
      "blocks": [
        {
          "p": "Almost always the MoE replaces the MLP; routing attention heads is rare (ModuleFormer, JetMoE). Three things vary across designs: the <strong>routing function</strong>, the <strong>expert size/count</strong>, and the <strong>training objective</strong>. The forward pass is a router-weighted sum over the selected experts:"
        },
        {
          "math": "y(x) \\;=\\; \\sum_{i \\in \\mathcal{T}(x)} g_i(x)\\, E_i(x), \\qquad \\mathcal{T}(x) = \\mathrm{TopK}_k\\big(h(x)\\big), \\qquad h(x) = W_r\\,x"
        },
        {
          "p": "The router $W_r$ is a tiny linear layer ($d_{\\text{model}}\\times N$) — negligible FLOPs. The pipeline per token: compute affinities $h(x)$, take the top-$k$ experts, turn their scores into gate weights $g_i$, dispatch the token to those experts, then combine the outputs weighted by $g_i$. The gate is usually a softmax over affinities:"
        },
        {
          "math": "g_i(x) \\;=\\; \\frac{\\exp\\!\\big(h_i(x)\\big)}{\\sum_{j=1}^{N}\\exp\\!\\big(h_j(x)\\big)}"
        },
        {
          "code": "def moe_layer(x, W_r, experts, k):\n    # x: (T, D);  N experts;  top-k routing\n    h = x @ W_r                      # (T, N) affinities\n    p = softmax(h, dim=-1)\n    gate, idx = p.topk(k, dim=-1)    # token-choice top-k\n    gate = gate / gate.sum(-1, keepdim=True)   # renormalize selected\n    y = zeros_like(x)\n    for j in range(k):                # scatter to chosen experts\n        e = idx[:, j]\n        y += gate[:, j, None] * apply_per_token_expert(experts, e, x)\n    return y",
          "lang": "python"
        },
        {
          "callout": "Where the softmax sits matters. <strong>Gate-then-TopK</strong> (DeepSeek V1-2, Grok, Qwen): softmax over all $N$, then keep the top-$k$ weights as-is. <strong>TopK-then-softmax</strong> (Mixtral, DBRX): select first, renormalize only the chosen $k$ so gates sum to 1. DeepSeek-V3 swaps the softmax for a per-expert <em>sigmoid</em> affinity, then normalizes the selected gates.",
          "kind": "note"
        },
        {
          "callout": "Because only $k$ of $N$ experts run, the layer is a learned, sparse lookup over sub-networks — the same trick as conditional computation in Shazeer 2017, but now cheap enough to dominate the parameter budget of frontier models.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "routing",
      "title": "Routing: who chooses whom",
      "blocks": [
        {
          "p": "Most routing reduces to 'choose top-$k$', but the choice can run in either direction — or be solved globally. This single decision drives load balance, causality, and whether tokens get dropped."
        },
        {
          "table": {
            "head": [
              "Routing",
              "Who selects",
              "Balance",
              "Failure mode"
            ],
            "rows": [
              [
                "Token-choice top-k",
                "token picks k experts",
                "none — needs aux loss",
                "collapse; capacity overflow drops"
              ],
              [
                "Expert-choice",
                "expert picks its top tokens",
                "exact by construction",
                "some tokens get 0 experts; not causal"
              ],
              [
                "Global / linear assignment",
                "solve a matching",
                "balanced",
                "expensive (Sinkhorn / BASE overhead)"
              ]
            ]
          }
        },
        {
          "p": "In practice almost everyone uses <strong>token-choice top-k</strong>. The interesting axis is $k$: Switch runs top-1; GShard, Mixtral, and Grok use 2; Qwen-MoE and DBRX use 4; DeepSeek routes 6-8 fine-grained experts. Top-1 is cheapest and easiest to shard but gives the router a weak learning signal; $k\\!\\ge\\!2$ lets gradients compare experts at the cost of more compute and comm."
        },
        {
          "table": {
            "head": [
              "",
              "Top-1 (Switch)",
              "Top-k, k ≥ 2 (most MoEs)"
            ],
            "rows": [
              [
                "Compute / token",
                "one FFN",
                "k FFNs"
              ],
              [
                "Router signal",
                "weak (single winner)",
                "richer (ranks k experts)"
              ],
              [
                "Balance pressure",
                "high (1 winner/token)",
                "lower"
              ],
              [
                "Examples",
                "Switch Transformer",
                "Mixtral, Qwen, DeepSeek"
              ]
            ]
          }
        },
        {
          "callout": "Alternatives exist but rarely win: <strong>hashing</strong> (fixed random routes) is a stubbornly strong baseline (Roller 2021); <strong>RL</strong> over routes is the 'right' answer in principle (Bengio 2013) but gradient variance kills it; <strong>linear-assignment / BASE layers</strong> (Lewis 2021, Clark 2022) buy balance by solving a matching problem each step.",
          "kind": "connection"
        },
        {
          "callout": "Token-choice gives <em>no</em> balance guarantee, so it leans on an auxiliary loss and still drops overflow tokens. Expert-choice flips the failure: load is perfectly balanced, but a token can be picked by <strong>zero</strong> experts, and because experts look across the whole batch it is awkward to keep autoregressive/causal.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "load-balancing",
      "title": "Load balancing & the training objective",
      "blocks": [
        {
          "p": "Systems efficiency demands experts get used <em>evenly</em> — idle experts waste their device, overloaded ones drop tokens. But left alone, routing collapses onto a few favorites, and the hard top-$k$ decision is non-differentiable. Three historical fixes: RL on the gating policy, stochastic perturbations, and heuristic balancing losses. Practice overwhelmingly picks the last. The Switch Transformer auxiliary loss is the template:"
        },
        {
          "math": "\\mathcal{L}_{\\text{bal}} \\;=\\; \\alpha\\,N \\sum_{i=1}^{N} f_i\\, P_i, \\qquad f_i = \\tfrac{1}{T}\\sum_{x}\\mathbf{1}\\{\\arg\\max_j p_j(x) = i\\}, \\qquad P_i = \\tfrac{1}{T}\\sum_{x} p_i(x)"
        },
        {
          "p": "$f_i$ is the hard fraction of tokens routed to expert $i$; $P_i$ is its mean soft probability. The product is minimized when both are uniform ($f_i=P_i=1/N$). Crucially $f_i$ is an argmax count with no gradient, so the signal flows entirely through $P_i$: $\\;\\partial \\mathcal{L}_{\\text{bal}}/\\partial p_i(x) = \\frac{\\alpha N}{T^2}\\sum_x \\mathbf{1}\\{\\arg\\max p(x)=i\\}$ — proportional to how often expert $i$ already wins, so heavily-used experts get pushed down hardest."
        },
        {
          "callout": "The elegance: the loss multiplies a <strong>non-differentiable</strong> load term $f_i$ by a <strong>differentiable</strong> probability term $P_i$. You can't backprop through the discrete route, so you instead penalize the soft probability of whichever experts are over-chosen — a surrogate that steers routing toward balance without ever differentiating the argmax.",
          "kind": "insight"
        },
        {
          "p": "Even with the loss, instantaneous load is bursty, so each expert has a fixed <strong>capacity</strong>. Tokens past it overflow and are <em>dropped</em> — they skip the FFN and pass through on the residual only. The capacity factor $f_{\\text{cap}}$ trades dropped tokens against wasted compute/memory:"
        },
        {
          "math": "\\text{capacity} \\;=\\; f_{\\text{cap}}\\cdot\\frac{k\\,T}{N}\\ \\text{tokens/expert}, \\qquad \\text{overflow}\\ \\to\\ \\text{dropped (residual only)}"
        },
        {
          "p": "DeepSeek's modern recipe layers three ideas: <strong>fine-grained experts</strong> (split each expert into several smaller ones and route more of them — far more routing combinations per FLOP), <strong>shared experts</strong> (a handful always-on for common knowledge, freeing routed experts to specialize), and <strong>aux-loss-free balancing</strong> — a per-expert bias added to the selection score only, nudged online toward balanced load while the gate value stays untouched:"
        },
        {
          "math": "\\mathcal{T}(x) = \\mathrm{TopK}_k\\big(s(x) + b\\big), \\qquad g_i \\propto s_i(x), \\qquad b_i \\leftarrow b_i + \\gamma\\,\\mathrm{sign}\\big(\\bar c - c_i\\big)"
        },
        {
          "table": {
            "head": [
              "Model",
              "Routed",
              "Active",
              "Shared",
              "Fine-grained"
            ],
            "rows": [
              [
                "GShard",
                "2048",
                "2",
                "0",
                "—"
              ],
              [
                "Switch",
                "64",
                "1",
                "0",
                "—"
              ],
              [
                "Mixtral",
                "8",
                "2",
                "0",
                "—"
              ],
              [
                "DBRX",
                "16",
                "4",
                "0",
                "—"
              ],
              [
                "DeepSeek-V1",
                "64",
                "6",
                "2",
                "1/4"
              ],
              [
                "Qwen1.5-MoE",
                "60",
                "4",
                "4",
                "1/8"
              ],
              [
                "DeepSeek-V3",
                "256",
                "8",
                "1",
                "1/14"
              ],
              [
                "OLMoE",
                "64",
                "8",
                "0",
                "1/8"
              ],
              [
                "Llama 4 Maverick",
                "128",
                "1",
                "1",
                "1/2"
              ]
            ]
          }
        },
        {
          "callout": "The aux loss directly <em>fights</em> the LM loss: too large an $\\alpha$ trades quality for balance, too small and you get collapse and dropped tokens. DeepSeek-V3's bias trick is attractive precisely because it changes <strong>who gets selected</strong> without injecting a competing gradient into the gate — balance without taxing the language objective. (Note OLMoE found gains from fine-grained experts but, unlike DeepSeek, <em>none</em> from shared ones — the recipe is not settled.)",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "systems",
      "title": "Systems: all-to-all, parallelism, instability",
      "blocks": [
        {
          "p": "MoEs parallelize beautifully — each expert FFN can live on its own device — which is exactly why they scale. This is <strong>expert parallelism</strong>, composable with data/tensor/pipeline parallel. But routing tokens to far-away experts is a communication problem, not a compute one."
        },
        {
          "list": [
            "<strong>Expert parallelism (EP):</strong> shard the $N$ experts across devices; each holds $N/\\text{EP}$ of them.",
            "<strong>Two all-to-all per MoE layer:</strong> a <em>dispatch</em> sends each token to its expert's device, then a <em>combine</em> gathers the weighted outputs back.",
            "<strong>MegaBlocks</strong> (Gale 2022): recast the MoE forward as block-sparse matmuls, eliminating capacity-factor token drops and padding waste — now standard in open MoEs."
          ]
        },
        {
          "callout": "All-to-all is the real bottleneck. It is bandwidth-bound, scales with tokens × $d_{\\text{model}}$, and — worse — <strong>stalls on imbalance</strong>: one overloaded expert makes every device wait at the collective. Multi-node MoE only pays off when interconnect (NVLink/InfiniBand) is fast enough that comm hides behind expert compute.",
          "kind": "pitfall"
        },
        {
          "p": "MoEs are also less stable than dense models: router logits can blow up, saturating the softmax and amplifying roundoff. The standard fixes (Zoph 2022) are to compute the <strong>router in fp32</strong> even under bf16 training, and add a <strong>z-loss</strong> that penalizes large logits via the log-partition function:"
        },
        {
          "math": "\\mathcal{L}_{z} \\;=\\; \\frac{1}{T}\\sum_{x}\\Big(\\log\\!\\sum_{j=1}^{N} e^{\\,h_j(x)}\\Big)^{2}"
        },
        {
          "callout": "MoEs add a genuine source of <em>nondeterminism</em>. Token dropping is decided at the <strong>batch</strong> level, so other users' tokens sharing your batch can push yours over an expert's capacity — identical prompts can route, and answer, differently. This was a leading theory for GPT-4's run-to-run variability.",
          "kind": "insight"
        },
        {
          "p": "Finally, sparse MoEs <strong>overfit</strong> small fine-tuning sets — too many specialized parameters for too little data. Two fixes seen in the wild: freeze the experts and fine-tune only the non-MoE MLPs (Zoph 2022), or simply use much more SFT data (DeepSeek's ~1.4M examples)."
        }
      ]
    },
    {
      "id": "deepseek",
      "title": "Case study: DeepSeek-MoE V1 → V3 & upcycling",
      "blocks": [
        {
          "p": "The DeepSeek line is the clearest modern arc — each version keeps fine-grained + shared experts and changes the balancing and gating. By V3 the headline is 671B total parameters but only 37B active per token."
        },
        {
          "table": {
            "head": [
              "",
              "V1 (DeepSeekMoE)",
              "V2",
              "V3"
            ],
            "rows": [
              [
                "Total / active",
                "16B / 2.8B",
                "236B / 21B",
                "671B / 37B"
              ],
              [
                "Routed / active-k",
                "64 / 6",
                "160 / 6",
                "256 / 8"
              ],
              [
                "Shared experts",
                "2",
                "2",
                "1"
              ],
              [
                "Gate",
                "softmax",
                "softmax",
                "sigmoid"
              ],
              [
                "Balancing",
                "expert + device aux",
                "+ comm-balance, device-limited",
                "aux-loss-free bias + seq-wise"
              ],
              [
                "Also ships",
                "fine-grained experts",
                "MLA",
                "MLA + MTP"
              ]
            ]
          }
        },
        {
          "p": "V1 establishes the template: standard top-k with fine-grained (64) + shared (2) experts and a classic expert + device auxiliary loss. V2 scales to 236B and adds device-limited routing plus a <em>communication</em>-balancing loss (balancing tokens in <em>and</em> out of each device). V3 drops the aux loss in favor of the per-expert bias trick, adds a light sequence-wise balance term, and switches to sigmoid gating."
        },
        {
          "p": "<strong>Upcycling</strong> sidesteps training from scratch: clone a dense model's FFN into $N$ experts and continue training (Komatsuzaki 2022). Qwen-MoE was upcycled from Qwen-1.8B (60 experts, top-4, 4 shared); MiniCPM-MoE from MiniCPM with ~520B extra tokens. It is cheap and reliably beats the dense base, though it can inherit the base model's ceiling."
        },
        {
          "callout": "Two non-MoE pieces ship alongside DeepSeek-V3 and are easy to conflate with it: <strong>MLA</strong> (multi-head latent attention — compress K/V into a low-rank latent $c^{KV}_t$ so the KV-cache is tiny) and <strong>MTP</strong> (multi-token prediction heads for a denser training signal / speculative decoding). Orthogonal to MoE, but part of why V3 is efficient end-to-end.",
          "kind": "connection"
        },
        {
          "callout": "The summary: MoEs exploit that <em>not every token needs the full model</em>. Discrete routing is genuinely hard, but top-$k$ heuristics plus balancing losses work in practice, and there is now overwhelming empirical evidence that MoEs are cost-effective — most top open models are sparse.",
          "kind": "key"
        }
      ]
    }
  ],
  "takeaways": [
    "MoE swaps the dense FFN for $N$ experts + a top-$k$ router, decoupling parameter count (∝ N) from per-token FLOPs (∝ k): capacity without compute.",
    "It saves FLOPs, not memory — all experts stay resident, so VRAM scales with total params. The cost is comm + a heuristic objective.",
    "Token-choice top-k dominates; routing is non-differentiable, so training relies on heuristic balancing losses, not RL.",
    "The Switch aux loss $\\alpha N\\sum_i f_i P_i$ steers toward uniform routing; the gradient flows through soft $P_i$ because the hard load $f_i$ is an argmax count.",
    "Capacity factor caps tokens/expert; overflow is dropped (residual only), and batch-level dropping makes MoEs nondeterministic.",
    "Stability needs an fp32 router + z-loss; the dominant systems cost is two all-to-all collectives under expert parallelism.",
    "DeepSeek's recipe — fine-grained + shared experts + aux-loss-free bias balancing — is the modern frontier template (V3: 671B total / 37B active); upcycling reuses a dense checkpoint."
  ],
  "references": [
    {
      "label": "CS336 Lecture 4 — Mixture of Experts (Hashimoto)",
      "url": "https://cs336.stanford.edu/"
    },
    {
      "label": "Shazeer et al. 2017 — Outrageously Large Neural Networks (sparsely-gated MoE)",
      "url": "https://arxiv.org/abs/1701.06538"
    },
    {
      "label": "Lepikhin et al. 2020 — GShard",
      "url": "https://arxiv.org/abs/2006.16668"
    },
    {
      "label": "Fedus et al. 2022 — Switch Transformer",
      "url": "https://arxiv.org/abs/2101.03961"
    },
    {
      "label": "Zoph et al. 2022 — ST-MoE (stable & transferable MoE, z-loss)",
      "url": "https://arxiv.org/abs/2202.08906"
    },
    {
      "label": "Zhou et al. 2022 — Mixture-of-Experts with Expert Choice Routing",
      "url": "https://arxiv.org/abs/2202.09368"
    },
    {
      "label": "Dai et al. 2024 — DeepSeekMoE (fine-grained + shared experts)",
      "url": "https://arxiv.org/abs/2401.06066"
    },
    {
      "label": "DeepSeek-AI 2024 — DeepSeek-V3 (aux-loss-free balancing, MLA, MTP)",
      "url": "https://arxiv.org/abs/2412.19437"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Sparsity",
      "q": "The defining property of a sparse MoE layer is that it decouples:",
      "options": [
        "Parameter count from per-token FLOPs",
        "Model depth from width",
        "Batch size from sequence length",
        "Training cost from inference cost"
      ],
      "answer": 0,
      "explain": "Capacity scales with the number of experts $N$, but compute scales with the number activated $k$. More params at ~constant FLOPs."
    },
    {
      "id": 2,
      "section": "Why MoE",
      "q": "Mixtral 8×7B (~47B total, ~13B active) roughly matches Llama-2 70B because:",
      "options": [
        "It activates all 47B params per token",
        "Top-2 routing activates only ~13B params/token, getting 70B-class quality at a fraction of the FLOPs",
        "Its FFNs are denser than standard MLPs",
        "It removes attention to save compute"
      ],
      "answer": 1,
      "explain": "Only 2 of 8 experts fire per token, so active compute is ~13B even though capacity is ~47B — the core MoE win."
    },
    {
      "id": 3,
      "section": "Why MoE",
      "q": "Versus a dense model with the same active FLOPs, an MoE's main added cost is:",
      "options": [
        "Higher per-token FLOPs",
        "Longer input sequences",
        "All experts must stay resident, so weight VRAM scales with total (not active) params, plus all-to-all comm",
        "More attention heads"
      ],
      "answer": 2,
      "explain": "MoE saves FLOPs, not memory: every expert is stored. You also pay router + all-to-all communication."
    },
    {
      "id": 4,
      "section": "Routing",
      "q": "Hard top-k routing is non-differentiable. The fix that practice overwhelmingly adopts is:",
      "options": [
        "REINFORCE / RL over routing policies",
        "Gumbel-softmax relaxation of the router",
        "Straight-through estimators on the argmax",
        "Heuristic auxiliary load-balancing losses"
      ],
      "answer": 3,
      "explain": "RL is the 'right' answer but gradient variance makes it impractical; everyone ships heuristic balancing losses instead."
    },
    {
      "id": 5,
      "section": "Routing",
      "q": "Switch Transformer's key routing change relative to GShard was:",
      "options": [
        "Top-1 routing (one expert per token), simplifying compute and communication",
        "Expert-choice routing",
        "Dropping the load-balance loss entirely",
        "Replacing softmax gating with sigmoid"
      ],
      "answer": 0,
      "explain": "Switch showed top-1 works, cutting routed-expert compute/comm in half versus GShard's top-2."
    },
    {
      "id": 6,
      "section": "Load balancing",
      "q": "In the Switch balance loss $\\alpha N\\sum_i f_i P_i$, the router learns through:",
      "options": [
        "$f_i$, the hard fraction of tokens routed to expert i",
        "$P_i$, the mean soft routing probability — since $f_i$ is a non-differentiable argmax count",
        "Both terms equally",
        "Neither; it is optimized by RL"
      ],
      "answer": 1,
      "explain": "$f_i$ is an argmax count with zero gradient; the entire learning signal flows through the differentiable soft probability $P_i$."
    },
    {
      "id": 7,
      "section": "Load balancing",
      "q": "The term $\\sum_i f_i P_i$ (with $\\sum_i f_i=\\sum_i P_i=1$) is minimized when:",
      "options": [
        "One expert receives all tokens",
        "Exactly half the experts are unused",
        "Load and probability are uniform across experts ($f_i=P_i=1/N$)",
        "The softmax temperature goes to zero"
      ],
      "answer": 2,
      "explain": "The coupled product is smallest under uniform routing, which is exactly the balanced state the loss is designed to encourage."
    },
    {
      "id": 8,
      "section": "Load balancing",
      "q": "With capacity factor 1.0 and bursty routing, tokens exceeding an expert's capacity are:",
      "options": [
        "Rerouted to the next-best expert",
        "Queued for the next batch",
        "Processed at lower precision",
        "Dropped — they skip the FFN and pass through on the residual only"
      ],
      "answer": 3,
      "explain": "Overflow tokens are dropped: the MoE layer becomes an identity (residual) for them. Higher $f_{cap}$ reduces drops at extra compute/memory."
    },
    {
      "id": 9,
      "section": "Stability",
      "q": "Why can an MoE return different outputs for the same prompt across calls (with greedy decoding)?",
      "options": [
        "Token dropping is computed per-batch, so other queries in the batch can push your token over an expert's capacity",
        "Experts apply dropout at inference",
        "The router samples stochastically at inference",
        "Softmax is non-associative in fp16"
      ],
      "answer": 0,
      "explain": "Capacity overflow is a batch-level decision, so batch composition (other users) can change which of your tokens get dropped — a real MoE nondeterminism source."
    },
    {
      "id": 10,
      "section": "Stability",
      "q": "The router z-loss $\\frac{1}{T}\\sum_x(\\log\\sum_j e^{h_j})^2$ improves stability by:",
      "options": [
        "Balancing expert load",
        "Penalizing large router logits (the log-partition magnitude), preventing softmax blow-up and roundoff",
        "Forcing top-1 routing",
        "Regularizing the expert FFN weights"
      ],
      "answer": 1,
      "explain": "z-loss shrinks the logsumexp, keeping router logits small so the gating softmax stays numerically well-behaved (Zoph 2022)."
    },
    {
      "id": 11,
      "section": "Stability",
      "q": "A standard MoE stability trick from Zoph et al. 2022 is to:",
      "options": [
        "Train experts in fp8",
        "Freeze the router for the first 10k steps",
        "Compute the router/gating in fp32 even when the rest of the model is bf16",
        "Use only top-1 routing"
      ],
      "answer": 2,
      "explain": "The router is tiny but precision-sensitive; running just the gating in fp32 (often with z-loss) tames instability."
    },
    {
      "id": 12,
      "section": "Routing",
      "q": "Expert-choice routing (each expert selects its top tokens) differs from token-choice in that it:",
      "options": [
        "Is fully causal and needs no global batch view",
        "Still requires an auxiliary balance loss to avoid collapse",
        "Always activates every expert",
        "Guarantees perfect load balance by construction, but can leave some tokens routed to zero experts"
      ],
      "answer": 3,
      "explain": "Expert-choice balances perfectly but at the cost of some tokens getting no expert, and it is awkward to keep autoregressive since experts look across the batch."
    },
    {
      "id": 13,
      "section": "DeepSeek",
      "q": "DeepSeek-MoE's 'shared experts' are:",
      "options": [
        "Always-on experts every token uses, capturing common knowledge so routed experts can specialize",
        "Experts shared across layers to save parameters",
        "Experts replicated across devices for load balance",
        "A top-1 fallback used only when routing drops a token"
      ],
      "answer": 0,
      "explain": "Shared experts run for all tokens, absorbing common computation and freeing the routed (fine-grained) experts to specialize."
    },
    {
      "id": 14,
      "section": "Load balancing",
      "q": "DeepSeek-V3's 'aux-loss-free' balancing works by:",
      "options": [
        "Removing all balancing and relying purely on data scale",
        "Adding a per-expert bias to the top-k selection score only (not the gate weight), updated online toward balanced load",
        "Learning routes with an RL policy",
        "Switching to expert-choice routing"
      ],
      "answer": 1,
      "explain": "A per-expert bias shifts who gets selected without adding a competing gradient to the gate, so balance no longer taxes the LM loss."
    },
    {
      "id": 15,
      "section": "Systems",
      "q": "Under expert parallelism, the dominant added systems cost per MoE layer is:",
      "options": [
        "Extra matmul FLOPs inside the router",
        "A gradient all-reduce across experts",
        "Two all-to-all collectives (dispatch + combine) that are bandwidth-bound and stall on load imbalance",
        "Duplicating the KV-cache per expert"
      ],
      "answer": 2,
      "explain": "Routing tokens to remote experts needs all-to-all dispatch and combine; it is comm-bound and one overloaded expert stalls the whole collective."
    },
    {
      "id": 16,
      "section": "Upcycling",
      "q": "'Upcycling' a dense checkpoint into an MoE means:",
      "options": [
        "Distilling the dense model into a smaller MoE",
        "Pruning experts out of a larger MoE",
        "Quantizing the dense FFN into experts",
        "Initializing each expert from the dense model's FFN, then continuing training (e.g. Qwen-MoE from Qwen-1.8B)"
      ],
      "answer": 3,
      "explain": "Upcycling clones the dense FFN into N experts and keeps training — cheaper than from scratch and reliably beats the dense base (Komatsuzaki 2022; Qwen-MoE, MiniCPM)."
    }
  ]
});
