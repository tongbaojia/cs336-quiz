/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 9,
  "estMinutes": 20,
  "topics": [
    "power laws",
    "Chinchilla",
    "IsoFLOP",
    "compute-optimal",
    "6ND"
  ],
  "overview": "You have 10,000 H100s for a month and must train one good open LM — but <em>which</em> shape, on how much data? Scaling laws turn that bet into a measurement: fit a simple power law on cheap small runs, then extrapolate. Lecture 9 builds the empirical foundations — why loss is a power law, the Kaplan→Chinchilla correction, IsoFLOP profiling, and the compute-optimal allocation that gives the famous <strong>D* ≈ 20N*</strong> rule.",
  "sections": [
    {
      "id": "why-scale",
      "title": "Why scaling laws exist",
      "blocks": [
        {
          "p": "The motivating scenario: someone hands you a 10k-H100 month and asks for a good open LM. Infra (A2) and data (A4) you can build — but the single biggest lever is <em>which model</em> to run. Wide or deep? How many heads? Adam or SGD? The old answer is to tune on big models (unaffordable); the new answer is to <strong>tune on small models and extrapolate</strong>."
        },
        {
          "callout": "A scaling law is a simple, <em>predictive</em> rule for how loss falls as you spend more of a resource. Its value is economic: you fit it from a handful of cheap runs and use it to derisk a single $10M run you can only do once.",
          "kind": "key"
        },
        {
          "h": "The design procedure"
        },
        {
          "p": "Nearly every use of scaling laws in this lecture is the same three-step recipe — it converts an irreversible bet into a regression:"
        },
        {
          "list": [
            "Train a few small models that vary the one knob you care about (optimizer, architecture, N, D).",
            "Fit a scaling law to the resulting loss-vs-resource curve.",
            "Read off the optimal choice at the target scale from the fitted law."
          ],
          "ordered": true
        },
        {
          "callout": "This is how you answer <em>Transformer vs LSTM</em> or <em>Adam vs SGD</em> without spending tens of millions: you don't need to win at scale, you need the scaling <em>curve</em> with the better slope/offset. Hestness 2017 already showed loss is predictable across MT, speech, and LM.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "data-scaling",
      "title": "Data scaling and why it's a power law",
      "blocks": [
        {
          "p": "The empirical observation (Kaplan+ 2020): test loss vs dataset size is <strong>linear on a log–log plot</strong> — i.e. a power law, or “scale-free.” The cleanest functional form adds an irreducible floor:"
        },
        {
          "math": "L(X) = L_{\\infty} + \\left(\\frac{X_0}{X}\\right)^{\\alpha}"
        },
        {
          "p": "Here $X$ is the resource (data $D$, params $N$, or compute $C$), $\\alpha$ is the scaling exponent (the log–log slope), and $L_{\\infty}$ is the <strong>irreducible loss</strong> — the entropy of the data the model can never beat. Ignore $L_{\\infty}$ and you read a too-optimistic slope from the high-resource tail."
        },
        {
          "h": "Why a power law? Estimation error decays polynomially"
        },
        {
          "p": "The conceptual anchor: error from finite samples decays like $1/n^{\\alpha}$. The toy case is estimating a mean from $n$ Gaussian samples:"
        },
        {
          "math": "\\mathbb{E}\\big[(\\hat{\\mu}-\\mu)^2\\big] = \\frac{\\sigma^2}{n} \\quad\\Longrightarrow\\quad \\log \\mathrm{Error} = -\\log n + 2\\log\\sigma"
        },
        {
          "p": "That is already a scaling law with slope $-1$. Most classical estimators (regression, etc.) share this $1/n$ rate, predicting a log–log slope of exactly $-1$. But measured neural exponents are <em>much smaller</em> (slopes like $-0.05$ to $-0.1$) — so something else sets them."
        },
        {
          "p": "The flexibility story: a nonparametric estimator tiling $d$-dimensional input space gives $\\mathrm{Error} \\approx n^{-1/d}$, i.e. slope $-1/d$. Bahri+ 2021 argues the small neural exponent reflects the data's <strong>intrinsic dimension</strong> — though intrinsic-dimension estimators are sketchy, so treat this as intuition, not proof."
        },
        {
          "callout": "Composition shifts the <em>offset</em>, not the slope. Distribution-shift scaling laws (Kaplan+ 2021; Hashimoto 2021) find that changing the data mix moves $L_{\\infty}$ and the intercept while the exponent stays put — which is exactly why diverse data collection matters.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "engineering",
      "title": "Scaling laws for model engineering",
      "blocks": [
        {
          "p": "Before the data-vs-model question, the classic Kaplan paper used scaling laws to settle architecture and optimizer choices — predicting the big-model winner from small-model curves. The surprising payoff: many design decisions are <em>predictable before training</em>."
        },
        {
          "table": {
            "head": [
              "Decision",
              "Scaling-law finding"
            ],
            "rows": [
              [
                "Transformer vs LSTM",
                "Transformers have a better loss-vs-compute curve at every scale; LSTMs fall behind and bend up"
              ],
              [
                "Adam vs SGD",
                "separable as distinct scaling curves (Hestness 2017, pre-Transformer)"
              ],
              [
                "Depth vs width",
                "1→2 layers matters hugely; beyond that, aspect ratio is a weak knob — width/depth are largely interchangeable at fixed N"
              ],
              [
                "Batch size",
                "strong diminishing returns past a critical batch size"
              ]
            ]
          }
        },
        {
          "callout": "Not all parameters scale alike. <strong>Embedding</strong> parameters behave differently from the rest, so count non-embedding params when you fit $L(N)$ — mixing them in distorts the exponent (and matters again for MoE).",
          "kind": "pitfall"
        },
        {
          "h": "Critical batch size"
        },
        {
          "p": "Batch size has strong diminishing returns. The critical batch size is the knee: the smaller your target loss, the larger the batch you can usefully run — good news for data parallelism, since better models tolerate (need) bigger batches. Lecture 11 makes this quantitative via McCandlish's gradient-noise model."
        },
        {
          "callout": "Reframe: scaling laws let you <em>pick the design</em> (optimizer, arch, sizes) on small models and the <em>resource split</em> (more data or bigger model) on the fitted surface — two different uses of the same machinery.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "compute-optimal",
      "title": "Compute-optimal: Kaplan vs Chinchilla",
      "blocks": [
        {
          "p": "The headline question: with a fixed compute budget, do you train a big undertrained model or a small well-trained one? The link that makes this answerable is the training-compute identity — every param sees every token through one forward+backward:"
        },
        {
          "math": "C \\approx 6ND"
        },
        {
          "p": "Joint data–model fits (Rosenfeld+ 2020: $\\mathrm{Error} = N^{-\\alpha} + D^{-\\beta} + C$; Kaplan's variant) describe loss over the $(N, D)$ grid. Substituting $D = C/6N$ and minimizing over $N$ at fixed $C$ gives a compute-optimal frontier:"
        },
        {
          "math": "N^{*} \\propto C^{a}, \\quad D^{*} \\propto C^{b}, \\qquad a \\approx b \\approx 0.5 \\;\\Rightarrow\\; D^{*} \\approx 20\\,N^{*}"
        },
        {
          "p": "Kaplan+ 2020 and Hoffmann+ 2022 (Chinchilla) disagreed on the exponents. Kaplan recommended pouring compute mostly into <strong>model size</strong> ($a\\approx0.73$); Chinchilla showed you should grow $N$ and $D$ <strong>together</strong> ($a\\approx b\\approx0.5$). Kaplan systematically <em>under-weighted data</em> and trained models too big for their token budgets."
        },
        {
          "table": {
            "head": [
              "Quantity",
              "Kaplan 2020",
              "Chinchilla 2022"
            ],
            "rows": [
              [
                "Model-size exponent a",
                "≈ 0.73",
                "≈ 0.50"
              ],
              [
                "Data exponent b",
                "≈ 0.27",
                "≈ 0.50"
              ],
              [
                "Tokens per parameter",
                "grows with compute",
                "≈ 20 (constant)"
              ],
              [
                "Recommendation",
                "mostly bigger models",
                "grow N and D together"
              ]
            ]
          }
        },
        {
          "callout": "The decisive bug was the <strong>learning-rate schedule</strong>. Kaplan used one fixed cosine length for all runs, so models trained for fewer steps were measured before their LR had decayed — making short runs look worse and biasing the fit toward “bigger models.” Chinchilla matched the cosine decay length to each run's token count. Same data, different conclusion.",
          "kind": "pitfall"
        },
        {
          "callout": "Because $C \\approx 6ND$ and both $N^{*}, D^{*} \\propto C^{0.5}$, the optimal tokens-per-parameter ratio is <em>scale-invariant</em> — roughly 20 across three orders of magnitude. That constant is the single most-quoted output of the whole field.",
          "kind": "key"
        }
      ]
    },
    {
      "id": "three-methods",
      "title": "Chinchilla's three estimation methods",
      "blocks": [
        {
          "p": "Chinchilla fits the same compute-optimal frontier three ways. Methods 1 and 2 agree closely; method 3 (as originally published) drifted — a useful lesson in how fragile these fits are."
        },
        {
          "h": "Method 1 — minimum over training curves"
        },
        {
          "p": "Overlay every training run's loss-vs-compute curve; the <strong>lower envelope</strong> (the min over all runs at each FLOP count) is itself a power law. This mirrors Kaplan's FLOPs figure and needs no parametric model — just the frontier of what you've already trained."
        },
        {
          "h": "Method 2 — IsoFLOP profiles"
        },
        {
          "p": "Pick several fixed FLOP budgets (IsoFLOP slices). Within a slice, $C$ is constant, so choosing $N$ fixes $D = C/6N$ — you slide along a parameters-vs-tokens tradeoff. Plot final loss vs $N$ and each slice is a <strong>convex “U”</strong>: too-small $N$ underfits; too-large $N$ starves on tokens. The bottom of each U is the compute-optimal $N$ for that budget; connecting the minima across budgets traces $N^{*}\\propto C^{a}$ and $D^{*}\\propto C^{b}$."
        },
        {
          "callout": "IsoFLOP is the most-replicated method: it's cheap (a grid of short runs), robust (each U-minimum is a direct measurement, not an extrapolation), and has been reproduced for diffusion models (Gulrajani+ 2023) and MoEs. When in doubt, profile IsoFLOPs.",
          "kind": "insight"
        },
        {
          "h": "Method 3 — parametric joint fit"
        },
        {
          "p": "Train a grid over $(N, D)$ and least-squares fit the full surface, e.g."
        },
        {
          "math": "L(N, D) = E + \\frac{A}{N^{\\alpha}} + \\frac{B}{D^{\\beta}}"
        },
        {
          "p": "Chinchilla reported $E\\approx1.69$, $A\\approx406$, $B\\approx410$, $\\alpha\\approx0.34$, $\\beta\\approx0.28$. The optimal split follows from the exponents: $a = \\beta/(\\alpha+\\beta)$, $b = \\alpha/(\\alpha+\\beta)$, both near $0.5$."
        },
        {
          "callout": "Besiroglu+ 2024 reverse-engineered Chinchilla's raw data and found the published method-3 fit was numerically off (bad Huber-loss optimization / over-tight confidence intervals). Their refit lands back near methods 1 and 2 — a reminder that a parametric scaling fit is only as trustworthy as its optimizer.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "pitfalls",
      "title": "Where scaling laws bite back",
      "blocks": [
        {
          "p": "Scaling laws are predictions, and predictions extrapolate. Three failure modes matter in practice."
        },
        {
          "p": "<strong>Train-optimal is not deployment-optimal.</strong> Chinchilla minimizes loss per unit of <em>training</em> compute, but most lifetime compute is <em>inference</em>. So in practice you deliberately over-train small models past 20 tokens/param to get a cheaper-to-serve model — the more usage you expect, the further you push:"
        },
        {
          "table": {
            "head": [
              "Model",
              "Tokens / param"
            ],
            "rows": [
              [
                "GPT-3 (175B)",
                "≈ 2"
              ],
              [
                "Chinchilla (70B)",
                "20"
              ],
              [
                "LLaMA 65B",
                "≈ 22"
              ],
              [
                "Llama 2 70B",
                "≈ 29"
              ],
              [
                "Mistral 7B",
                "≈ 110"
              ],
              [
                "Llama 3 70B",
                "≈ 215"
              ]
            ]
          }
        },
        {
          "callout": "<strong>Extrapolation and single-epoch assumptions.</strong> Standard scaling laws assume fresh tokens every step (one epoch). Under data repetition the curve bends — repeated tokens are worth less, so a law fit on unique data over-predicts. And upstream loss being predictable does <em>not</em> mean downstream task accuracy is: Tay+ 2023 shows downstream metrics can scale very differently from perplexity.",
          "kind": "pitfall"
        },
        {
          "p": "<strong>More is different.</strong> A conclusion drawn at 100M params (which optimizer, which architecture, the FLOP split between attention and MLP) can flip at 100B. The fitted slope is only credible inside — and slightly beyond — the range you actually measured."
        },
        {
          "callout": "Practical hygiene: fit on at least a decade of scale, always include $L_{\\infty}$, hold out the largest run to validate the extrapolation, and re-fit when you change data mix, schedule, or epoch count.",
          "kind": "note"
        }
      ]
    }
  ],
  "takeaways": [
    "Scaling laws convert an irreversible big run into a regression: train small, fit a power law, extrapolate — the core derisking tool of modern pretraining.",
    "Loss follows $L(X)=L_{\\infty}+(X_0/X)^{\\alpha}$; always fit the irreducible floor $L_{\\infty}$ or you misread the slope.",
    "Power laws arise from polynomially-decaying estimation error; small neural exponents likely track the data's intrinsic dimension (Bahri 2021).",
    "Kaplan under-weighted data ($a\\approx0.73$) mainly by mis-handling the LR schedule; Chinchilla's fix gives $a\\approx b\\approx0.5$ and $D^{*}\\approx20N^{*}$.",
    "$C\\approx6ND$ links params, tokens, and compute; with both scaling as $C^{0.5}$ the optimal tokens/param ratio is scale-invariant (≈20).",
    "Three fitting methods — min-over-runs, IsoFLOP, parametric — should agree; IsoFLOP is the most robust, and parametric fits can be numerically fragile (Besiroglu 2024).",
    "Train-optimal ≠ deployment-optimal: over-train small models when inference dominates, and distrust extrapolation beyond your measured range."
  ],
  "references": [
    {
      "label": "CS336 Lecture 9 trace (Tatsu Hashimoto)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_09"
    },
    {
      "label": "Kaplan et al. 2020 — Scaling laws for neural LMs",
      "url": "https://arxiv.org/abs/2001.08361"
    },
    {
      "label": "Hoffmann et al. 2022 — Training compute-optimal LLMs (Chinchilla)",
      "url": "https://arxiv.org/abs/2203.15556"
    },
    {
      "label": "Hestness et al. 2017 — Deep learning scaling is predictable, empirically",
      "url": "https://arxiv.org/abs/1712.00409"
    },
    {
      "label": "Rosenfeld et al. 2020 — A constructive prediction of error across scales",
      "url": "https://arxiv.org/abs/1909.12673"
    },
    {
      "label": "Bahri et al. 2021 — Explaining neural scaling laws",
      "url": "https://arxiv.org/abs/2102.06701"
    },
    {
      "label": "Besiroglu et al. 2024 — Chinchilla scaling: a replication attempt",
      "url": "https://arxiv.org/abs/2404.10102"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Why",
      "q": "The core economic value of a scaling law is that it lets you:",
      "options": [
        "Predict large-model performance from cheap small runs and derisk an irreversible run",
        "Train a single large model faster",
        "Eliminate the need for a validation set",
        "Replace gradient descent with closed-form fitting"
      ],
      "answer": 0,
      "explain": "Scaling laws fit on cheap small runs and extrapolate, turning a one-shot $10M bet into a regression you can derisk."
    },
    {
      "id": 2,
      "section": "Data",
      "q": "Loss is linear on a log–log plot against dataset size. This means loss vs data is:",
      "options": [
        "Exponential",
        "A power law (scale-free)",
        "Logarithmic",
        "Piecewise constant"
      ],
      "answer": 1,
      "explain": "Linear in log–log <=> a power law; the slope is the scaling exponent α."
    },
    {
      "id": 3,
      "section": "Data",
      "q": "In $L(X)=L_{\\infty}+(X_0/X)^{\\alpha}$, the term $L_{\\infty}$ is:",
      "options": [
        "The learning rate floor",
        "The initialization loss before training",
        "The irreducible loss (data entropy) the model can never beat",
        "The variance of the estimator"
      ],
      "answer": 2,
      "explain": "$L_{\\infty}$ is the irreducible floor; omitting it makes the tail slope look better than it is."
    },
    {
      "id": 4,
      "section": "Data",
      "q": "The mean-estimation toy gives error $\\sigma^2/n$, i.e. a log–log slope of $-1$. Why are measured neural exponents much smaller?",
      "options": [
        "Neural nets violate the central limit theorem",
        "Because of floating-point error",
        "Larger batch sizes flatten the curve",
        "Flexible/nonparametric learning has dimension-dependent rates ($n^{-1/d}$), tied to intrinsic dimension"
      ],
      "answer": 3,
      "explain": "Classical estimators scale ~1/n (slope −1); nonparametric rates are $n^{-1/d}$, and Bahri 2021 ties the small exponent to intrinsic data dimension."
    },
    {
      "id": 5,
      "section": "Data",
      "q": "Changing the training data mixture (distribution shift) primarily affects:",
      "options": [
        "The offset / intercept (and $L_{\\infty}$), not the slope",
        "The exponent α (the slope)",
        "Nothing measurable",
        "The batch size only"
      ],
      "answer": 0,
      "explain": "Composition shifts the offset, not the slope (Kaplan+ 2021; Hashimoto 2021) — motivating diverse data collection."
    },
    {
      "id": 6,
      "section": "Compute",
      "q": "The identity $C\\approx 6ND$ counts:",
      "options": [
        "Only inference FLOPs",
        "Forward+backward FLOPs per parameter per token (2 fwd + 4 bwd)",
        "Memory in bytes",
        "Attention FLOPs only"
      ],
      "answer": 1,
      "explain": "6 = 2 (forward) + 4 (backward) FLOPs per weight per token; it links N, D, and C so you can substitute D=C/6N."
    },
    {
      "id": 7,
      "section": "Compute",
      "q": "Chinchilla's compute-optimal exponents in $N^{*}\\propto C^{a}$, $D^{*}\\propto C^{b}$ are approximately:",
      "options": [
        "a≈0.73, b≈0.27",
        "a≈1, b≈0",
        "a≈b≈0.5",
        "a≈0.27, b≈0.73"
      ],
      "answer": 2,
      "explain": "Chinchilla found a≈b≈0.5 (grow N and D together); a≈0.73 was Kaplan's data-underweighting result."
    },
    {
      "id": 8,
      "section": "Compute",
      "q": "The single biggest reason Kaplan and Chinchilla disagreed was:",
      "options": [
        "Different tokenizers",
        "Chinchilla used more GPUs",
        "Kaplan trained on images",
        "Kaplan's fixed cosine LR-schedule length, which under-decayed short runs and biased the fit toward bigger models"
      ],
      "answer": 3,
      "explain": "Kaplan used one cosine length for all runs, so short runs were measured before LR decayed — biasing toward 'bigger models'. Chinchilla matched decay length to token count."
    },
    {
      "id": 9,
      "section": "Compute",
      "q": "The Chinchilla rule of thumb for compute-optimal data is:",
      "options": [
        "$D^{*}\\approx 20N^{*}$",
        "$D^{*}\\approx 2N^{*}$",
        "$N^{*}\\approx 20D^{*}$",
        "$D^{*}\\approx N^{*2}$"
      ],
      "answer": 0,
      "explain": "Both $N^{*},D^{*}\\propto C^{0.5}$ makes tokens/param scale-invariant at ≈20, i.e. $D^{*}\\approx20N^{*}$."
    },
    {
      "id": 10,
      "section": "Methods",
      "q": "Chinchilla's Method 1 (minimum over training curves) estimates the frontier by:",
      "options": [
        "Fitting a parametric surface by least squares",
        "Taking the lower envelope (min over all runs) of loss vs compute",
        "Running one IsoFLOP slice",
        "Averaging all training curves"
      ],
      "answer": 1,
      "explain": "Method 1 reads off the lower envelope of overlaid loss-vs-compute curves, which is itself a power law."
    },
    {
      "id": 11,
      "section": "Methods",
      "q": "In an IsoFLOP profile (Method 2), why is each fixed-budget loss-vs-N curve U-shaped?",
      "options": [
        "Because of numerical noise",
        "Because larger models always overfit",
        "Too-small N underfits; too-large N leaves too few tokens (D=C/6N) — the minimum is compute-optimal N",
        "Because the optimizer diverges at large N"
      ],
      "answer": 2,
      "explain": "At fixed C, choosing N fixes D=C/6N; small N underfits and large N starves on tokens, so loss is convex in N with a compute-optimal minimum."
    },
    {
      "id": 12,
      "section": "Methods",
      "q": "Besiroglu et al. 2024's contribution to the Chinchilla story was:",
      "options": [
        "Proving scaling laws are exponential",
        "Inventing the IsoFLOP method",
        "Showing 6ND is wrong",
        "Recovering Chinchilla's raw data and showing the published Method-3 parametric fit was numerically flawed (refit matches Methods 1 & 2)"
      ],
      "answer": 3,
      "explain": "They did data forensics on Method 3, found the fit was off, and re-fit to results consistent with Methods 1 and 2."
    },
    {
      "id": 13,
      "section": "Pitfalls",
      "q": "Production models like Llama 3 use ~200+ tokens/param, far above 20. Why over-train past compute-optimal?",
      "options": [
        "Train-optimal ignores inference; a smaller well-trained model is cheaper to serve, so heavy inference justifies extra training compute",
        "To overfit the training set",
        "Because Chinchilla's law is wrong",
        "To reduce the vocabulary size"
      ],
      "answer": 0,
      "explain": "Chinchilla minimizes training compute, but lifetime cost is dominated by inference — so you over-train a smaller model to amortize serving cost."
    },
    {
      "id": 14,
      "section": "Pitfalls",
      "q": "Which is a genuine limitation of standard scaling-law extrapolation?",
      "options": [
        "They cannot be plotted",
        "They assume single-epoch fresh tokens and predict upstream loss — downstream accuracy and repeated-data regimes can deviate",
        "They require exactly 6ND FLOPs",
        "They only work for vision models"
      ],
      "answer": 1,
      "explain": "Standard laws assume fresh tokens (one epoch); repetition bends the curve, and downstream metrics (Tay 2023) need not track perplexity."
    },
    {
      "id": 15,
      "section": "Engineering",
      "q": "When fitting $L(N)$, why separate embedding parameters from the rest?",
      "options": [
        "Embeddings have no gradients",
        "They are stored in fp16",
        "Embedding params scale differently from non-embedding params and distort the exponent if mixed in",
        "They double the FLOP count"
      ],
      "answer": 2,
      "explain": "Not all params are equal — embedding parameters behave differently, so fit on non-embedding params to get a clean exponent."
    }
  ]
});
