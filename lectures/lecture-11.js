/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 11,
  "estMinutes": 21,
  "topics": [
    "muP",
    "critical batch",
    "WSD",
    "data repetition",
    "over-training"
  ],
  "overview": "Chinchilla tells you the optimal $(N, D)$ in principle — but in practice you still have to set widths, learning rates, batch sizes, and afford the sweep. Lecture 11 is the engineering layer: <strong>μP</strong> for width-invariant hyperparameter transfer, critical batch size, <strong>WSD</strong> schedules that make the Chinchilla sweep cheap, data-constrained scaling under repetition, and why frontier labs deliberately <strong>over-train</strong> small models for inference.",
  "sections": [
    {
      "id": "practice",
      "title": "Scaling in the wild: the three problems",
      "blocks": [
        {
          "p": "Chinchilla (2022) was the last model with a fully public scaling recipe; everything after solves the same three practical problems differently. The recurring obstacles when you actually scale a model are concrete."
        },
        {
          "list": [
            "Architecture hyperparameters — width, depth, aspect ratio at the target size.",
            "Optimizer hyperparameters — learning rate and batch size, which drift with scale.",
            "Compute to fit the sweep — a naive Chinchilla fit needs full from-scratch runs, an $O(n^2)$ tax."
          ],
          "ordered": true
        },
        {
          "p": "Three recent recipes stake out the design space — assume invariance, or enforce it with μP, and make the sweep cheap with a WSD schedule:"
        },
        {
          "table": {
            "head": [
              "Recipe",
              "HP transfer",
              "Sweep trick"
            ],
            "rows": [
              [
                "Cerebras-GPT",
                "μP makes HPs width-invariant",
                "direct Chinchilla formula"
              ],
              [
                "MiniCPM",
                "μP for transformer + LR",
                "WSD → cheap Method-3 joint fit"
              ],
              [
                "DeepSeek",
                "assume hypers ~invariant; fit batch/LR directly",
                "WSD-style + IsoFLOP (Method 2)"
              ]
            ]
          }
        },
        {
          "callout": "There is no consensus on μP. Cerebras and MiniCPM buy stability with μP; DeepSeek skips it, assumes most transformer hypers are scale-stable, and just fits batch/LR at small scale. Both ship strong models — μP is a convenience, not a requirement.",
          "kind": "note"
        }
      ]
    },
    {
      "id": "mup",
      "title": "μP: hyperparameter transfer across width",
      "blocks": [
        {
          "p": "The dream is <strong>scale-invariant tuning</strong>: sweep the learning rate on a cheap narrow model, then copy it to the wide one. The maximal update parameterization (μP; Yang+ 2022) makes this work by demanding that two quantities stay $\\Theta(1)$ as width $n$ grows."
        },
        {
          "list": [
            "A1 — activations at initialization stay $\\Theta(1)$ per coordinate (so the activation norm is $\\Theta(\\sqrt{n})$).",
            "A2 — after one gradient step, the change in each activation is also $\\Theta(1)$ (real feature learning at every width)."
          ]
        },
        {
          "p": "Enforcing A1 and A2 on a deep linear net pins the init scale and the per-layer learning rate as functions of fan-in $n_{l-1}$ and fan-out $n_l$:"
        },
        {
          "math": "W_l \\sim \\mathcal{N}\\!\\left(0,\\; \\frac{1}{n_{l-1}}\\,\\min\\!\\left(1, \\frac{n_l}{n_{l-1}}\\right)\\right), \\qquad \\eta_l \\;\\propto\\; \\frac{1}{n_{l-1}} \\;\\;(\\text{hidden, Adam})"
        },
        {
          "p": "Standard parameterization (SP) keeps the hidden-layer LR $\\Theta(1)$ across width. That's exactly why it breaks: as width grows, the feature-learning update and the forward activations can't both stay $\\Theta(1)$, so the optimal LR <strong>drifts</strong> and a value tuned at small width is wrong at large width."
        },
        {
          "table": {
            "head": [
              "Component",
              "Standard (SP)",
              "μP"
            ],
            "rows": [
              [
                "Hidden init variance",
                "1 / fan-in",
                "1 / fan-in"
              ],
              [
                "Hidden LR (Adam)",
                "Θ(1)",
                "Θ(1 / width)"
              ],
              [
                "Readout (unembed) init",
                "1 / fan-in",
                "1 / fan-in² (scaled down)"
              ],
              [
                "Logit / output multiplier",
                "1",
                "1 / width"
              ],
              [
                "Optimal LR vs width",
                "drifts → must retune",
                "≈ constant → transfers"
              ]
            ]
          }
        },
        {
          "callout": "<strong>μTransfer</strong> is the payoff: under μP the optimal LR (and other HPs) is ~width-invariant, so you tune once on a small-width proxy and transfer zero-shot to a model orders of magnitude wider. Cerebras-GPT and MiniCPM both report markedly more predictable scaling with μP than SP.",
          "kind": "insight"
        },
        {
          "p": "But μP's clean theory only covers <em>width</em> scaling, and real architectures add components it never modeled. What survives?"
        },
        {
          "table": {
            "head": [
              "Component",
              "Transfers under μP?"
            ],
            "rows": [
              [
                "SwiGLU / squared-ReLU nonlinearities",
                "Yes — same optimal LR"
              ],
              [
                "Large vs small batch sizes",
                "Yes — robust (though not in the original derivation)"
              ],
              [
                "Zero-query / SP-unembedding init tweaks",
                "Mostly yes"
              ],
              [
                "RMSNorm learnable gains",
                "No — breaks μP (removable with little loss)"
              ],
              [
                "Strong (0.1) weight decay",
                "No — the main genuine failure"
              ]
            ]
          }
        },
        {
          "callout": "μP only scales width — depth, RMSNorm gains, and strong weight decay are outside its guarantees. Treat μTransfer as a strong prior to validate at one larger width, not a law to trust blindly.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "lr-batch",
      "title": "Learning rate and batch size scaling",
      "blocks": [
        {
          "p": "Even without μP, batch and LR have their own scaling structure. DeepSeek and MiniCPM both fit them directly: run small models across batch/LR, collect the near-optimal points (within ~0.25% of the min loss), and extrapolate."
        },
        {
          "h": "Critical batch size (McCandlish 2018)"
        },
        {
          "p": "Larger batches reduce gradient noise — until they don't. The critical batch size is the knee of that tradeoff, set by the gradient noise scale. McCandlish models the steps-vs-examples tradeoff as a hyperbola:"
        },
        {
          "math": "\\left(\\frac{S}{S_{\\min}} - 1\\right)\\!\\left(\\frac{E}{E_{\\min}} - 1\\right) = 1, \\qquad B_{\\mathrm{crit}} = \\frac{E_{\\min}}{S_{\\min}}"
        },
        {
          "p": "$S$ is optimizer steps (wall-clock at fixed hardware) and $E$ is examples processed (compute). Below $B_{\\mathrm{crit}}$ you spend near-minimal compute but many steps; above it you spend near-minimal steps but waste compute. $B_{\\mathrm{crit}}$ is the efficient frontier's knee."
        },
        {
          "callout": "Critical batch size <em>grows as the target loss falls</em> — better-trained models tolerate (and need) bigger batches. This is why batch-size warmup schedules help, and it's good news for data parallelism: the more you scale, the more parallel batch you can usefully consume.",
          "kind": "insight"
        },
        {
          "p": "Empirically the optimal batch size increases polynomially as loss decreases — a clean, fittable trend (Kaplan 2020; MiniCPM). So you measure the batch-vs-loss law at small scale and read off the batch for the big run."
        }
      ]
    },
    {
      "id": "wsd",
      "title": "WSD schedules: cheap Chinchilla sweeps",
      "blocks": [
        {
          "p": "Here's the hidden cost of Chinchilla: to fit a scaling law honestly you must train each grid point <em>from scratch</em> — you can't just early-stop one long run, because a cosine schedule's loss at step $t$ isn't the loss of a model <em>scheduled</em> to stop at $t$. That turns an $O(n)$ sweep into $O(n^2)$."
        },
        {
          "p": "The <strong>WSD</strong> (warmup–stable–decay) schedule, from MiniCPM, fixes this. Replace cosine with three phases: a short warmup, a long <em>stable</em> phase at high constant LR, and a short <em>decay</em> phase (~10% of steps) where LR drops and loss falls rapidly."
        },
        {
          "code": "def wsd_lr(step, warmup, stable_end, total, peak):\n    if step < warmup:\n        return peak * step / warmup\n    if step < stable_end:\n        return peak                      # long stable phase, constant LR\n    # decay phase (~last 10% of steps): rapid loss drop\n    frac = (step - stable_end) / (total - stable_end)\n    return peak * (1.0 - frac)",
          "lang": "python"
        },
        {
          "callout": "Because the stable phase holds LR constant, you can <strong>branch</strong> a single backbone run at many points and only pay the short decay to materialize each scaling-law data point. One long run + cheap decays replaces dozens of from-scratch runs — the $O(n^2)$ sweep collapses toward $O(n)$.",
          "kind": "insight"
        },
        {
          "p": "WSD matches cosine's final loss (DeepSeek uses a WSD-style schedule with two 10% decay steps and reports parity), and the over-training “penalty” from extending the stable phase stays stable enough to model (Gadre+ 2024). MiniCPM uses the resulting cheap samples to fit Chinchilla Method 3."
        },
        {
          "callout": "A WSD decay is also a natural place to anneal in higher-quality or longer-context data: the stable phase does the bulk learning on cheap tokens, and the short, sharp decay imprints the premium tokens. Schedule and data curriculum co-design here.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "data-constrained",
      "title": "Data-constrained scaling",
      "blocks": [
        {
          "p": "Chinchilla assumes infinite fresh tokens. Real corpora are finite, so the live question is: when you run out of unique data, is repeating it worth anything? Muennighoff+ 2023 answer with a data-constrained scaling law."
        },
        {
          "p": "The empirical result is sharply actionable: repeating data for up to <strong>~4 epochs is nearly as good as the same volume of fresh tokens</strong>. Past that, returns decay fast; by ~16+ epochs additional passes add almost nothing."
        },
        {
          "math": "D' = U_D + U_D\\,R_D^{*}\\left(1 - e^{-R_D / R_D^{*}}\\right), \\qquad R_D^{*} \\approx 15"
        },
        {
          "p": "Here $U_D$ is unique tokens, $R_D$ the number of repetitions, and $D'$ the <em>effective</em> data that goes into the Chinchilla formula. As $R_D \\to \\infty$, $D'$ saturates at $U_D(1+R_D^{*})$ — a hard ceiling on what a fixed corpus can buy, no matter how long you train."
        },
        {
          "table": {
            "head": [
              "Repetition",
              "Value of repeated tokens"
            ],
            "rows": [
              [
                "Up to ~4 epochs",
                "≈ fresh tokens (negligible penalty)"
              ],
              [
                "~4–16 epochs",
                "decaying returns"
              ],
              [
                "> ~16 epochs",
                "≈ worthless (D' saturates)"
              ]
            ]
          }
        },
        {
          "callout": "Repeated tokens are worth less, so <strong>data selection should be scale-aware</strong>: at small scale aggressively filter for quality; at large scale you can't afford to throw tokens away, so the quality–quantity tradeoff tips toward keeping more. The optimal mixture is itself a function of compute.",
          "kind": "connection"
        },
        {
          "callout": "Standard Chinchilla over-predicts in the data-constrained regime because it counts every repeated token as fresh. Always swap in effective data $D'$ once you cross ~1 epoch — otherwise your scaling extrapolation is optimistic.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "over-training",
      "title": "Inference-aware over-training",
      "blocks": [
        {
          "p": "Chinchilla minimizes <em>training</em> compute, but a deployed model's lifetime cost is dominated by <em>inference</em>. The right objective is total cost, which over-training a smaller model can minimize:"
        },
        {
          "math": "C_{\\text{total}} \\approx \\underbrace{6 N D}_{\\text{train}} + \\underbrace{2 N D_{\\text{inf}}}_{\\text{inference}}"
        },
        {
          "p": "As expected inference volume $D_{\\text{inf}}$ grows, the cost-optimal point shifts to <strong>smaller $N$, larger $D$</strong> — you accept a worse training-compute deal to get a cheaper-to-serve model at the same quality (Sardana &amp; Frankle 2023). That is exactly the trend across frontier releases:"
        },
        {
          "table": {
            "head": [
              "Model",
              "Tokens / param",
              "Note"
            ],
            "rows": [
              [
                "Chinchilla 70B",
                "20",
                "compute-optimal baseline"
              ],
              [
                "Llama 2 70B",
                "≈ 29",
                "mild over-train"
              ],
              [
                "Llama 3 70B",
                "≈ 215",
                "15T tokens"
              ],
              [
                "Llama 3 8B",
                "≈ 1875",
                "15T tokens — ~94× past optimal"
              ]
            ]
          }
        },
        {
          "callout": "<strong>Llama-3 8B on 15T tokens is the canonical over-train</strong>: ~1875 tokens/param vs Chinchilla's 20. It's “wasteful” for training compute and entirely rational for deployment — a small model served billions of times amortizes the extra pretraining many times over. The more usage you expect, the further past 20 you push.",
          "kind": "insight"
        },
        {
          "p": "MiniCPM pushes the same logic: tiny models (1–2.5B) at ~192 tokens/param that match older 7Bs, arguing LLaMA-style architectures support far higher ratios than 20. The 20:1 rule is a <em>training</em>-compute optimum, not a deployment one."
        },
        {
          "callout": "When you report a model as “Chinchilla-optimal” or “over-trained,” state the objective. 20:1 minimizes training FLOPs for a target loss; if you care about serving cost or on-device size, the optimum is a much higher ratio and depends on your inference forecast.",
          "kind": "note"
        }
      ]
    }
  ],
  "takeaways": [
    "μP enforces $\\Theta(1)$ activations and updates across width, so the optimal LR is width-invariant — tune on a narrow proxy and μTransfer to the wide model.",
    "SP breaks because its $\\Theta(1)$ hidden LR lets activations/updates drift with width; μP rescales init and LR ($\\eta\\propto 1/\\text{width}$ for Adam) to fix it.",
    "μP only covers width: SwiGLU and batch size transfer, but RMSNorm learnable gains and strong weight decay break it.",
    "Critical batch size (McCandlish 2018) = $E_{\\min}/S_{\\min}$; it grows as loss falls, so larger, better-trained models usefully absorb bigger batches.",
    "WSD (warmup–stable–decay) lets you branch one stable backbone and pay only short decays per scaling point — collapsing the $O(n^2)$ Chinchilla sweep.",
    "Data-constrained scaling (Muennighoff 2023): repeating up to ~4 epochs ≈ fresh tokens; effective data $D'$ saturates, so use $D'$ not raw tokens past one epoch.",
    "Over-train small models when inference dominates — Llama-3 8B at ~1875 tokens/param is rational once you minimize total (train + inference) cost."
  ],
  "references": [
    {
      "label": "CS336 Lecture 11 trace (Tatsu Hashimoto)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_11"
    },
    {
      "label": "Yang et al. 2022 — Tensor Programs V: μTransfer (zero-shot HP transfer)",
      "url": "https://arxiv.org/abs/2203.03466"
    },
    {
      "label": "McCandlish et al. 2018 — An empirical model of large-batch training",
      "url": "https://arxiv.org/abs/1812.06162"
    },
    {
      "label": "Muennighoff et al. 2023 — Scaling data-constrained language models",
      "url": "https://arxiv.org/abs/2305.16264"
    },
    {
      "label": "Hu et al. 2024 — MiniCPM (WSD + μP scaling)",
      "url": "https://arxiv.org/abs/2404.06395"
    },
    {
      "label": "DeepSeek LLM 2024 — Scaling open LMs with longtermism",
      "url": "https://arxiv.org/abs/2401.02954"
    },
    {
      "label": "Dey et al. 2023 — Cerebras-GPT (μP at scale)",
      "url": "https://arxiv.org/abs/2304.03208"
    },
    {
      "label": "Sardana & Frankle 2023 — Beyond Chinchilla-optimal: accounting for inference",
      "url": "https://arxiv.org/abs/2401.00448"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "muP",
      "q": "The central practical promise of μP / μTransfer is:",
      "options": [
        "The optimal LR (and other HPs) becomes ~width-invariant, so you tune on a small-width proxy and transfer",
        "Faster matrix multiplies at large width",
        "It removes the need for a learning rate entirely",
        "It guarantees Chinchilla-optimal data ratios"
      ],
      "answer": 0,
      "explain": "μP makes HPs ~invariant to width, enabling zero-shot transfer from a cheap narrow model to a wide one."
    },
    {
      "id": 2,
      "section": "muP",
      "q": "Why does standard parameterization (SP) break as width grows?",
      "options": [
        "It uses too little memory",
        "Its $\\Theta(1)$ hidden LR can't keep activations and the feature-learning update both $\\Theta(1)$, so the optimal LR drifts with width",
        "It can only train shallow nets",
        "It forbids the Adam optimizer"
      ],
      "answer": 1,
      "explain": "Under SP the optimal LR drifts with width because forward activations and the update can't both stay $\\Theta(1)$ — so a small-width LR is wrong at large width."
    },
    {
      "id": 3,
      "section": "muP",
      "q": "μP's two design conditions ('baby μP') are:",
      "options": [
        "Loss is convex; gradients are bounded",
        "Weights are orthogonal; biases are zero",
        "Activations are $\\Theta(1)$ at init (A1) and the change in activation after one step is $\\Theta(1)$ (A2)",
        "Batch size equals width; depth is fixed"
      ],
      "answer": 2,
      "explain": "A1: activations $\\Theta(1)$ at init; A2: post-step activation change $\\Theta(1)$ — real feature learning at every width."
    },
    {
      "id": 4,
      "section": "muP",
      "q": "Under μP with Adam, the hidden-layer learning rate scales with width $n$ as:",
      "options": [
        "$\\Theta(1)$ (constant, like SP)",
        "$\\Theta(n)$",
        "$\\Theta(\\sqrt{n})$",
        "$\\Theta(1/n)$"
      ],
      "answer": 3,
      "explain": "μP sets hidden-layer LR $\\propto 1/\\text{width}$ for Adam, versus $\\Theta(1)$ in SP."
    },
    {
      "id": 5,
      "section": "muP",
      "q": "Which component is known to BREAK μP transfer?",
      "options": [
        "RMSNorm learnable gains (and strong weight decay)",
        "SwiGLU nonlinearity",
        "Large batch sizes",
        "Zero-query initialization"
      ],
      "answer": 0,
      "explain": "SwiGLU and batch size transfer fine; RMSNorm learnable gains and strong (0.1) weight decay are the genuine μP failures."
    },
    {
      "id": 6,
      "section": "Batch",
      "q": "The critical batch size (McCandlish 2018) is defined as:",
      "options": [
        "The largest batch that fits in GPU memory",
        "$E_{\\min}/S_{\\min}$ — the knee of the steps-vs-examples tradeoff set by gradient noise",
        "The batch that maximizes throughput",
        "Exactly the model width"
      ],
      "answer": 1,
      "explain": "$B_{\\mathrm{crit}}=E_{\\min}/S_{\\min}$: below it you minimize compute (many steps), above it you minimize steps (wasted compute)."
    },
    {
      "id": 7,
      "section": "Batch",
      "q": "As the target training loss decreases, the critical batch size:",
      "options": [
        "Decreases",
        "Stays fixed",
        "Increases — better-trained models usefully absorb larger batches",
        "Becomes undefined"
      ],
      "answer": 2,
      "explain": "Critical batch grows as loss falls, so larger/better models tolerate bigger batches — good for data parallelism."
    },
    {
      "id": 8,
      "section": "WSD",
      "q": "Why can't you just early-stop one cosine run to get many Chinchilla data points?",
      "options": [
        "Cosine schedules are non-differentiable",
        "Early stopping deletes the checkpoint",
        "Cosine forbids warmup",
        "Loss at step t of a long cosine run isn't the loss of a model scheduled to stop at t — honest fitting needs from-scratch runs, making the sweep $O(n^2)$"
      ],
      "answer": 3,
      "explain": "A scaling point requires a model whose LR schedule was sized to that horizon; cosine ties decay to a fixed length, so you'd need a fresh run per point — the $O(n^2)$ cost WSD avoids."
    },
    {
      "id": 9,
      "section": "WSD",
      "q": "What makes WSD (warmup–stable–decay) cheap for scaling sweeps?",
      "options": [
        "The constant-LR stable phase lets you branch one backbone and pay only a short (~10%) decay per data point",
        "It uses a larger learning rate everywhere",
        "It skips warmup",
        "It trains in fp8"
      ],
      "answer": 0,
      "explain": "The stable phase holds LR constant, so you branch at many points and only run the short decay to materialize each scaling-law sample."
    },
    {
      "id": 10,
      "section": "Data",
      "q": "Muennighoff et al. 2023 find that repeating training data is roughly as good as fresh tokens for up to about:",
      "options": [
        "1 epoch",
        "4 epochs",
        "40 epochs",
        "400 epochs"
      ],
      "answer": 1,
      "explain": "Up to ~4 epochs ≈ fresh tokens; past that returns decay, and by ~16+ epochs extra passes add almost nothing."
    },
    {
      "id": 11,
      "section": "Data",
      "q": "In the data-constrained law, effective data $D'$ as repetitions $R_D \\to \\infty$:",
      "options": [
        "Grows without bound",
        "Goes to zero",
        "Saturates at a finite ceiling $U_D(1+R_D^{*})$",
        "Equals the parameter count"
      ],
      "answer": 2,
      "explain": "$D'$ saturates: repeated tokens are worth progressively less, capping what a fixed corpus can buy no matter how long you train."
    },
    {
      "id": 12,
      "section": "Data",
      "q": "A practical consequence of repeated tokens being worth less is that data selection should be:",
      "options": [
        "Identical at all scales",
        "Random at all scales",
        "Done only after training",
        "Scale-aware — filter aggressively for quality at small scale, keep more tokens at large scale"
      ],
      "answer": 3,
      "explain": "The quality–quantity tradeoff tips with compute: at large scale you can't afford to discard tokens, so the optimal mixture is itself a function of scale."
    },
    {
      "id": 13,
      "section": "Over-train",
      "q": "Why deliberately over-train a small model far past 20 tokens/param (e.g. Llama-3 8B on 15T)?",
      "options": [
        "Total cost is dominated by inference; a smaller model is cheaper to serve, so heavy expected usage amortizes the extra training compute",
        "To overfit the validation set",
        "Because μP requires it",
        "To shrink the vocabulary"
      ],
      "answer": 0,
      "explain": "Minimizing total (train + inference) cost shifts the optimum to smaller N / more tokens when inference volume is large — a small model served at scale repays the over-training."
    },
    {
      "id": 14,
      "section": "Over-train",
      "q": "In $C_{\\text{total}} \\approx 6ND + 2N D_{\\text{inf}}$, increasing expected inference volume $D_{\\text{inf}}$ moves the cost-optimal model toward:",
      "options": [
        "Larger N, fewer tokens",
        "Smaller N, more tokens (over-trained)",
        "No change — N and D are fixed by Chinchilla",
        "Larger N and more tokens equally"
      ],
      "answer": 1,
      "explain": "Adding the inference term penalizes large N, so the optimum shifts to a smaller, more heavily-trained model (Sardana & Frankle 2023)."
    },
    {
      "id": 15,
      "section": "Practice",
      "q": "How does DeepSeek's scaling recipe differ from Cerebras-GPT / MiniCPM?",
      "options": [
        "It uses no scaling laws at all",
        "It only trains a single model size",
        "It skips μP, assumes most transformer hypers are scale-stable, and fits batch/LR directly plus IsoFLOP, with a WSD-style schedule",
        "It uses SGD instead of Adam"
      ],
      "answer": 2,
      "explain": "DeepSeek assumes invariance and fits batch/LR + IsoFLOP directly (no μP), while Cerebras and MiniCPM enforce invariance with μP."
    }
  ]
});
