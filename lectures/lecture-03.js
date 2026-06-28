/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 3,
  "estMinutes": 20,
  "topics": [
    "pre-norm",
    "RMSNorm",
    "SwiGLU",
    "RoPE",
    "GQA"
  ],
  "overview": "Modern LMs look remarkably alike: a decoder-only Transformer that is <strong>pre-norm + RMSNorm + SwiGLU + RoPE + GQA</strong>. Lecture 3 dissects each axis — what the 2017 original did, what changed, and <em>why</em> — separating the load-bearing choices (pre-norm, GQA for serving) from the near-flat basins everyone just copies (the exact FFN ratio).",
  "sections": [
    {
      "id": "recap",
      "title": "The standard Transformer, and what you built",
      "blocks": [
        {
          "p": "The 2017 Transformer (Vaswani et al.) is the common ancestor; the block you implement in the assignment is a stripped, modernized <em>decoder-only</em> version. Tatsu's framing: there is <em>low consensus</em> on most architecture knobs — except pre-norm — and a steady drift toward 'LLaMA-like' designs. Over 19 dense models shipped in the past year, most differing only in minor tweaks."
        },
        {
          "callout": "The theme of the lecture: the best way to learn architecture is to build it; the second best is to mine what everyone else shipped. The real signal isn't any single paper's ablation — it's the <strong>convergence</strong> across dozens of independent teams.",
          "kind": "key"
        },
        {
          "h": "Original (2017) vs. the modern variant"
        },
        {
          "table": {
            "head": [
              "Axis",
              "Original Transformer (2017)",
              "Modern decoder (LLaMA-like)"
            ],
            "rows": [
              [
                "Norm placement",
                "post-norm",
                "pre-norm"
              ],
              [
                "Norm type",
                "LayerNorm",
                "RMSNorm"
              ],
              [
                "Positions",
                "sinusoidal absolute",
                "RoPE (rotary)"
              ],
              [
                "FFN",
                "ReLU, d_ff = 4·d_model",
                "SwiGLU, d_ff ≈ (8/3)·d_model"
              ],
              [
                "Linear / norm bias",
                "present",
                "none"
              ],
              [
                "Topology",
                "encoder–decoder",
                "decoder-only"
              ]
            ]
          }
        },
        {
          "p": "Every row is a separate decision with its own literature, and the rest of the lecture walks them axis by axis. Note what did <em>not</em> change: scaled dot-product attention, residual connections, and the attention-then-FFN block. The skeleton is untouched since 2017."
        },
        {
          "callout": "The deltas concentrate in <strong>position embeddings, activations, and tokenization</strong>; the skeleton (attention + residual + FFN) is fixed. When you read a new model card, scan those three columns first — that's where the real differences hide.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "normalization",
      "title": "Normalization: where it goes, and what kind",
      "blocks": [
        {
          "p": "Two orthogonal choices: <em>where</em> the norm sits relative to the residual, and <em>which</em> norm. Post-norm (original) puts the norm <em>on</em> the residual path, \\(x_{l+1} = \\mathrm{Norm}(x_l + \\mathrm{Sublayer}(x_l))\\); pre-norm moves it <em>inside</em> the block so the residual highway stays a clean identity:"
        },
        {
          "math": "x_{l+1} \\;=\\; x_l \\,+\\, \\mathrm{Sublayer}\\!\\big(\\mathrm{Norm}(x_l)\\big) \\qquad \\text{(pre-norm: unnormalized residual path)}"
        },
        {
          "callout": "Pre-norm is the <em>one</em> near-universal consensus in the architecture (BERT and a lone OPT-350M are the post-norm holdouts). The unnormalized residual lets gradients flow undistorted, so you can crank the LR and skip warmup without the loss diverging — post-norm suffers gradient attenuation/spikes that kill deep models (Xiong 2020). A recent twist is 'double norm' — a second norm <em>outside</em> the residual stream (Grok, Gemma 2; OLMo 2 uses only non-residual post-norm).",
          "kind": "insight"
        },
        {
          "h": "RMSNorm vs. LayerNorm"
        },
        {
          "p": "LayerNorm normalizes both mean and variance across \\(d_{model}\\) and adds a learned gain <em>and</em> bias. RMSNorm (Zhang &amp; Sennrich 2019) drops mean-centering and the bias entirely — just divide by the root-mean-square and rescale:"
        },
        {
          "math": "\\mathrm{LayerNorm}(x) = \\frac{x - \\mu}{\\sqrt{\\sigma^2 + \\epsilon}}\\odot\\gamma + \\beta, \\qquad \\mu = \\tfrac1d\\textstyle\\sum_i x_i,\\;\\; \\sigma^2 = \\tfrac1d\\textstyle\\sum_i (x_i-\\mu)^2"
        },
        {
          "math": "\\mathrm{RMSNorm}(x) = \\frac{x}{\\sqrt{\\tfrac1d\\sum_i x_i^2 + \\epsilon}}\\odot\\gamma \\qquad \\text{(no mean subtraction, no bias)}"
        },
        {
          "p": "RMSNorm is used by LLaMA, PaLM, Chinchilla, T5; LayerNorm by GPT-1/2/3, OPT, GPT-J, BLOOM. The modern justification: <em>faster, and just as good</em> — fewer ops (no mean) and fewer params (no bias). The same logic kills bias terms broadly: most modern linear layers have none, for memory and optimization-stability reasons at a capacity cost that is empirically nil."
        },
        {
          "callout": "Normalization is a rounding error in FLOPs (matmuls dominate) — so why does it move wall-clock? Because <strong>FLOPs ≠ runtime</strong>. Norms are memory-bandwidth-bound (low arithmetic intensity); cutting the mean and bias reduces data movement and kernel work, which shows up in runtime (Ivanov et al. 2023). Narang 2020 even reports small quality gains.",
          "kind": "insight"
        },
        {
          "callout": "Post-norm isn't strictly worse in expressivity — it can yield better-conditioned features — but it demands warmup and careful LR tuning, and the divergence risk grows with depth. At scale that trade simply isn't worth it.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "activations",
      "title": "Activations and the GLU family",
      "blocks": [
        {
          "p": "The FFN is two matmuls with a nonlinearity between; the zoo — ReLU, GeLU, Swish, GLU, ReGLU, GeGLU, SwiGLU — varies only that middle piece and whether it is <em>gated</em>. The original FFN is \\(\\mathrm{FF}(x)=\\max(0,xW_1)W_2\\); GeLU (GPT-1/2/3, GPT-J, BLOOM) swaps the hard gate for a smooth, probabilistic one, \\(\\mathrm{GELU}(x)=x\\,\\Phi(x)\\) with \\(\\Phi\\) the standard-Gaussian CDF."
        },
        {
          "h": "Gated linear units (*GLU)"
        },
        {
          "p": "A GLU augments the first projection with a second linear term that <em>gates</em> it elementwise: \\(\\max(0,xW_1)\\) becomes \\(\\max(0,xW_1)\\otimes(xV)\\), adding a weight matrix \\(V\\) (this is ReGLU). Swap the activation on the gated branch to get the family — <strong>GeGLU</strong> (GeLU gate; T5 v1.1, Gemma 2/3) and <strong>SwiGLU</strong> (Swish gate, \\(\\mathrm{Swish}(z)=z\\,\\sigma(z)\\); LLaMA, PaLM, Mistral, OLMo, most models post-2023):"
        },
        {
          "math": "\\mathrm{FF}_{\\mathrm{SwiGLU}}(x) = \\big(\\mathrm{Swish}(xW_1)\\otimes xV\\big)\\,W_2, \\qquad \\mathrm{Swish}(z) = z\\,\\sigma(z)"
        },
        {
          "code": "def swiglu_ffn(x, W1, V, W2):           # W1, V: d_model -> d_ff ;  W2: d_ff -> d_model\n    g = silu(x @ W1)                   # silu(z) = z * sigmoid(z)  (Swish)\n    return (g * (x @ V)) @ W2           # elementwise gate, then project back down",
          "lang": "python"
        },
        {
          "p": "A GLU FFN has <em>three</em> weight matrices (\\(W_1, V, W_2\\)) instead of two. To hold parameter count fixed against the standard \\(d_{ff}=4d_{model}\\), scale the hidden width down by \\(2/3\\):"
        },
        {
          "math": "d_{ff} \\;=\\; \\tfrac{2}{3}\\cdot 4\\,d_{model} \\;=\\; \\tfrac{8}{3}\\,d_{model} \\;\\approx\\; 2.67\\,d_{model}"
        },
        {
          "callout": "This is exactly why LLaMA's FFN ratio is ~2.67, not 4 — it's a parameter-matching convention, not a different design. Shazeer's own verdict on <em>why</em> SwiGLU helps: 'we offer no explanation… divine benevolence.' The gains are small but consistent (Shazeer 2020, corroborated by Narang 2020).",
          "kind": "insight"
        },
        {
          "callout": "GLU is helpful, not necessary: GPT-3 (plain GeLU) is fine, and outliers like Nemotron-340B (squared ReLU) and Falcon 2 11B (ReLU) work too. The case for SwiGLU is 'consistent, nearly free gain', not 'required'.",
          "kind": "note"
        }
      ]
    },
    {
      "id": "positions",
      "title": "Positional information: from sinusoids to RoPE",
      "blocks": [
        {
          "p": "Self-attention is permutation-invariant, so position must be injected. Four generations: sinusoidal absolute → learned absolute → relative bias → rotary (RoPE), with ALiBi and NoPE as notable alternatives."
        },
        {
          "table": {
            "head": [
              "Scheme",
              "Mechanism",
              "Notable models"
            ],
            "rows": [
              [
                "Sinusoidal absolute",
                "add fixed sines/cosines PE_i to the input",
                "Original Transformer"
              ],
              [
                "Learned absolute",
                "add a learned vector u_i to the input",
                "GPT-1/2/3, OPT"
              ],
              [
                "Relative",
                "add a (learned) bias into the attention logits",
                "T5, Gopher, Chinchilla"
              ],
              [
                "RoPE (rotary)",
                "rotate Q/K by an angle ∝ position, every layer",
                "GPT-J, PaLM, LLaMA, most 2024+"
              ]
            ]
          }
        },
        {
          "h": "RoPE: rotary position embeddings"
        },
        {
          "p": "The design goal (Su et al. 2021): an embedding \\(f(x,i)\\) whose attention inner product depends only on the <em>relative</em> offset, \\(\\langle f(x,i), f(y,j)\\rangle = g(x,\\,y,\\,i-j)\\). Absolute schemes fail this — they leave non-relative cross-terms in the inner product. The trick: inner products are invariant under rotation, so encode position \\(i\\) by <em>rotating</em> the query/key vector by an angle proportional to \\(i\\). Pair up coordinates and rotate each 2-D pair by \\(i\\theta_k\\) with \\(\\theta_k=\\mathrm{base}^{-2k/d}\\) (base \\(=10^4\\)):"
        },
        {
          "math": "R_{i,k} = \\begin{pmatrix}\\cos i\\theta_k & -\\sin i\\theta_k \\\\ \\sin i\\theta_k & \\cos i\\theta_k\\end{pmatrix}, \\qquad (R_i q)^{\\top}(R_j k) = q^{\\top} R_{j-i}\\, k"
        },
        {
          "p": "The dot product depends only on \\(j-i\\) — exactly the relative property. RoPE is multiplicative (no additive cross-terms) and is reapplied at <em>every</em> attention layer to enforce position invariance."
        },
        {
          "code": "# q, k: (B, H, T, d_head);  cos, sin: (T, d_head/2) from theta_k = base ** (-2k/d)\ndef apply_rope(x, cos, sin):\n    x1, x2 = x[..., 0::2], x[..., 1::2]            # pair up coordinates\n    rot = stack([x1 * cos - x2 * sin,\n                 x1 * sin + x2 * cos], dim=-1)      # rotate each 2-D pair\n    return rot.flatten(-2)                          # re-interleave the pairs",
          "lang": "python"
        },
        {
          "callout": "RoPE is now the default (GPT-J/PaLM/LLaMA onward). Low frequencies (small \\(\\theta_k\\)) carry long-range position, high frequencies carry local order. The rotary <strong>base</strong> is the long-context knob: raising it (NTK/YaRN) or interpolating positions extends usable context beyond the training length.",
          "kind": "insight"
        },
        {
          "callout": "RoPE does <em>not</em> extrapolate for free — quality degrades past the trained length because high-frequency rotations hit unseen angles. You must rescale the base or interpolate positions for longer contexts.",
          "kind": "pitfall"
        },
        {
          "p": "<strong>ALiBi</strong> (Press et al. 2022) drops embeddings entirely and adds a head-specific linear penalty \\(-m\\,(i-j)\\) to the attention logits — closer tokens score higher. It was built for <em>length extrapolation</em>: train short, test long. <strong>NoPE</strong> (no positional encoding) leans on the causal mask alone to recover order and is surprisingly competitive — recent models interleave it (long-range info via NoPE) with RoPE + sliding-window for short-range (e.g. Cohere Command A)."
        }
      ]
    },
    {
      "id": "attention",
      "title": "Attention variants and the KV-cache problem",
      "blocks": [
        {
          "p": "Multi-head attention (MHA) is largely unchanged since 2017. What changed is driven by <em>inference</em>, not quality: the KV cache. Training and prefill process all positions in parallel — attention is matmul-heavy with high arithmetic intensity, so the GPU stays busy. Autoregressive <em>decoding</em> cannot parallelize over the sequence: you emit one token at a time and must read the entire cached K, V at every step."
        },
        {
          "math": "\\text{KV cache bytes} \\;=\\; 2 \\cdot b \\cdot n_{\\mathrm{layers}} \\cdot n_{kv} \\cdot d_{head} \\cdot T \\cdot (\\text{bytes/elt})"
        },
        {
          "p": "That read is pure data movement: low arithmetic intensity, memory-bandwidth-bound. The KV cache — not FLOPs — caps the batch size and context length you can serve, and the direct lever is \\(n_{kv}\\), the number of K/V heads."
        },
        {
          "h": "MHA → MQA → GQA"
        },
        {
          "p": "<strong>MQA</strong> (Shazeer 2019): keep all \\(H\\) query heads but share a <em>single</em> K and V head — shrinks the cache by \\(H\\times\\), with a small perplexity hit. <strong>GQA</strong> (Ainslie 2023): interpolate — split \\(H\\) query heads into \\(G\\) groups, each sharing one KV head. \\(G=H\\) is MHA, \\(G=1\\) is MQA; a clean knob trading expressiveness for cache size, with <em>negligible</em> quality loss at e.g. \\(G=8\\) (LLaMA-2 70B)."
        },
        {
          "table": {
            "head": [
              "Variant",
              "Query heads",
              "KV heads",
              "KV cache",
              "Quality"
            ],
            "rows": [
              [
                "MHA",
                "H",
                "H",
                "1× (largest)",
                "baseline"
              ],
              [
                "GQA",
                "H",
                "G (e.g. 8)",
                "H/G smaller",
                "≈ MHA"
              ],
              [
                "MQA",
                "H",
                "1",
                "H× smaller",
                "small PPL hit"
              ]
            ]
          }
        },
        {
          "code": "# H query heads share n_kv KV heads; each KV head serves g = H // n_kv queries\ndef repeat_kv(k, g):                     # k: (B, n_kv, T, d_head)\n    return k.repeat_interleave(g, dim=1)  # -> (B, H, T, d_head), then attend as MHA",
          "lang": "python"
        },
        {
          "callout": "GQA wins because the decode bottleneck is memory bandwidth, not arithmetic. Cutting KV heads 8× barely moves loss but multiplies servable batch/context — pure inference economics. This is why every serving-oriented model (LLaMA-2/3, Mistral, Qwen) ships GQA.",
          "kind": "insight"
        },
        {
          "p": "<strong>QK-norm</strong>: RMS/LayerNorm the queries and keys <em>before</em> the softmax to stop attention logits from blowing up — a stability trick from vision/multimodal (Dehghani 2023, Chameleon), now in DCLM, OLMo 2, Gemma 2. Separately, <strong>sparse / sliding-window</strong> attention (GPT-3's sparse blocks; Mistral's sliding window) caps the quadratic cost; modern models interleave full and local layers (e.g. every 4th layer full in Command A; also LLaMA 4, Gemma)."
        },
        {
          "callout": "Softmaxes are the usual suspects in training blow-ups (exponentials, near-zero denominators). QK-norm, the z-loss (PaLM: penalize \\(\\log^2 Z\\)), and logit soft-capping (Gemma 2's \\(c\\cdot\\tanh(\\cdot/c)\\)) all exist to tame the same failure mode.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "hparams",
      "title": "Hyperparameters that (don't) matter",
      "blocks": [
        {
          "p": "The striking empirical fact: most LMs cluster at the <em>same</em> hyperparameters, and the loss surface around them is a broad basin. The binding constraints are systems, not accuracy."
        },
        {
          "h": "FFN ratio and head dimension"
        },
        {
          "p": "<strong>FFN ratio:</strong> \\(d_{ff}=4\\,d_{model}\\) (ungated) or \\(\\approx\\tfrac{8}{3}d_{model}\\) (GLU) is nearly universal; Kaplan 2020 finds a broad near-optimal basin from ~1–10×. The bold exception is T5-11B at \\(d_{ff}=65536,\\,d_{model}=1024\\) — a 64× multiplier — but T5 v1.1 reverted to ~2.5× GeGLU, implying 64× was suboptimal. <strong>Head dim:</strong> by convention \\(n_{heads}\\times d_{head}\\approx d_{model}\\) (ratio ~1), with \\(d_{head}\\approx128\\) typical (GPT-3, LLaMA-2). It need not hold, and Bhojanapalli 2020 warned of low-rank bottlenecks, but they don't bite in practice."
        },
        {
          "h": "Aspect ratio, vocab, tying, regularization"
        },
        {
          "p": "<strong>Aspect ratio</strong> \\(d_{model}/n_{layers}\\) sits in a wide 100–200 band (GPT-3/OPT/Mistral/Qwen ~128; LLaMA ~102; BLOOM ~205). Loss is flat across it; the real constraint is systems — very deep models are harder to parallelize and have higher latency (Tay 2021)."
        },
        {
          "table": {
            "head": [
              "Hyperparameter",
              "Typical value",
              "What actually drives it"
            ],
            "rows": [
              [
                "d_ff / d_model",
                "4 (ungated), 8/3 (GLU)",
                "parameter budget; flat 1–10× basin"
              ],
              [
                "d_head",
                "≈128, with n_h·d_head ≈ d_model",
                "convention; weak validation"
              ],
              [
                "d_model / n_layers",
                "100–200",
                "parallelism + latency (systems)"
              ],
              [
                "Vocab size",
                "30–50k mono, 100–250k multi",
                "language coverage"
              ]
            ]
          }
        },
        {
          "p": "<strong>Vocab:</strong> monolingual models need only 30–50k (LLaMA 32k, GPT-2/3 50k); multilingual/production systems run 100–250k (PaLM 256k, Qwen 152k, GPT-4 ~100k). <strong>Weight tying</strong> — sharing the input embedding with the output projection (Press &amp; Wolf 2017) — saves \\(|V|\\times d_{model}\\) params; it matters most for small models / large vocab, and many large models now <em>untie</em> because the saving is marginal and untied scores slightly better."
        },
        {
          "p": "<strong>Regularization:</strong> modern pretraining mostly drops dropout (trillions of tokens, single epoch → little memorization risk) but keeps weight decay. Andriushchenko 2023: weight decay here isn't about overfitting — it shapes optimization dynamics and interacts with the cosine LR schedule."
        },
        {
          "callout": "Treat these as near-flat basins, not sharp optima. Models converge on the defaults because the defaults are <em>fine</em> and the binding constraints (parallelism, latency, KV cache, language coverage) live elsewhere. Spend your tuning budget on data and scale, not on the FFN ratio.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "consensus",
      "title": "The 2025 consensus decoder",
      "blocks": [
        {
          "p": "Stack the winners and you get the modern default — a decoder-only Transformer that is <strong>pre-norm + RMSNorm + SwiGLU + RoPE + GQA</strong>, no biases, often with QK-norm / z-loss for stability. LLaMA is the template; DeepSeek, Qwen, Mistral, and OLMo are variations on it."
        },
        {
          "table": {
            "head": [
              "Axis",
              "Old default",
              "2025 consensus",
              "Why it won"
            ],
            "rows": [
              [
                "Norm placement",
                "post-norm",
                "pre-norm",
                "clean residual → stable grads, larger LR, no warmup"
              ],
              [
                "Norm type",
                "LayerNorm",
                "RMSNorm",
                "equal quality, fewer params/ops, less memory movement"
              ],
              [
                "Activation",
                "ReLU",
                "SwiGLU",
                "small consistent gain, ~free at d_ff = (8/3)·d_model"
              ],
              [
                "Positional",
                "sinusoidal / learned absolute",
                "RoPE",
                "relative, decays with distance, context-extendable"
              ],
              [
                "Attention",
                "MHA",
                "GQA",
                "shrinks KV cache → cheaper serving, ≈ no quality loss"
              ],
              [
                "Biases",
                "present",
                "none",
                "memory + optimization stability, nil capacity cost"
              ]
            ]
          }
        },
        {
          "p": "Read the table as a hierarchy of confidence. Pre-norm is a genuine consensus with mechanistic backing. GQA is a hard inference win. RMSNorm and no-bias are cheap, safe efficiency. SwiGLU and the exact FFN ratio are small, partly cargo-culted gains."
        },
        {
          "callout": "Tatsu's meta-point: learn from others' experience, but know <em>which</em> choices are load-bearing. Pre-norm and GQA you should copy with confidence; the precise \\(d_{ff}\\) ratio or aspect ratio you can treat as a wide basin set by systems constraints. Convergence across teams is strong evidence — but some of it is imitation, not independent validation.",
          "kind": "key"
        },
        {
          "p": "What's still genuinely contested — and where the next deltas will come from — is the same short list as in 2017: <strong>position handling</strong> (long-context: RoPE scaling, NoPE interleaving, sliding windows), <strong>activations / sparsity</strong> (MoE, squared-ReLU outliers), and <strong>tokenization</strong>."
        }
      ]
    }
  ],
  "takeaways": [
    "Pre-norm is the one near-universal architecture consensus: a clean (unnormalized) residual path → stable gradients, larger LRs, no warmup.",
    "RMSNorm and dropping biases are efficiency plays — equal quality, fewer params/ops, less memory movement (FLOPs ≠ runtime).",
    "SwiGLU gives small, consistent gains and is ~free once you set \\(d_{ff}=\\tfrac{8}{3}d_{model}\\) to keep parameters constant.",
    "RoPE rotates Q/K by an angle ∝ position so attention depends only on the relative offset; the rotary base is the long-context knob (it doesn't extrapolate for free).",
    "GQA shrinks the KV cache (decode is memory-bound) with negligible quality loss — an inference-economics win, not a quality one.",
    "Most hyperparameters (FFN ratio, head dim, aspect ratio) are wide basins; systems constraints, not loss, pick the value.",
    "The 2025 consensus decoder = pre-norm + RMSNorm + SwiGLU + RoPE + GQA — copy the load-bearing parts, treat the rest as defaults."
  ],
  "references": [
    {
      "label": "CS336 Lecture 3 trace (Tatsu Hashimoto)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_03"
    },
    {
      "label": "Vaswani et al. 2017 — Attention Is All You Need",
      "url": "https://arxiv.org/abs/1706.03762"
    },
    {
      "label": "Xiong et al. 2020 — On Layer Normalization in the Transformer",
      "url": "https://arxiv.org/abs/2002.04745"
    },
    {
      "label": "Zhang & Sennrich 2019 — Root Mean Square Layer Normalization",
      "url": "https://arxiv.org/abs/1910.07467"
    },
    {
      "label": "Shazeer 2020 — GLU Variants Improve Transformer",
      "url": "https://arxiv.org/abs/2002.05202"
    },
    {
      "label": "Su et al. 2021 — RoFormer (RoPE)",
      "url": "https://arxiv.org/abs/2104.09864"
    },
    {
      "label": "Press et al. 2022 — ALiBi (Train Short, Test Long)",
      "url": "https://arxiv.org/abs/2108.12409"
    },
    {
      "label": "Ainslie et al. 2023 — GQA",
      "url": "https://arxiv.org/abs/2305.13245"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Architecture",
      "q": "Across modern dense LMs, which single architecture choice does the lecture flag as the near-universal consensus (vs. 'low consensus' elsewhere)?",
      "options": [
        "Pre-norm placement of the normalization",
        "RMSNorm over LayerNorm",
        "RoPE positional embeddings",
        "SwiGLU feed-forward"
      ],
      "answer": 0,
      "explain": "Pre-norm is 'the one thing everyone agrees on'; BERT and a stray OPT-350M are the post-norm exceptions. The other axes still vary across models."
    },
    {
      "id": 2,
      "section": "Normalization",
      "q": "Why does pre-norm train more stably than post-norm at scale?",
      "options": [
        "It adds parameters that raise capacity",
        "It leaves the residual path a clean identity, so gradients propagate undistorted — enabling larger LRs and removing warmup",
        "It normalizes across the batch instead of the feature dimension",
        "It ties the embedding and output matrices"
      ],
      "answer": 1,
      "explain": "Pre-norm keeps the residual highway unnormalized; post-norm suffers gradient attenuation/spikes. Original stated benefit: no warmup; modern: stability + larger LRs."
    },
    {
      "id": 3,
      "section": "Normalization",
      "q": "RMSNorm differs from LayerNorm precisely by:",
      "options": [
        "Normalizing over the batch dimension",
        "Replacing the L2 norm with an L1 norm",
        "Dropping mean-centering and the bias term — only dividing by the RMS and rescaling by a gain",
        "Adding a learned bias and removing the gain"
      ],
      "answer": 2,
      "explain": "RMSNorm = x / sqrt(mean(x^2)+eps) · gamma. No mean subtraction, no bias — fewer ops and fewer params than LayerNorm."
    },
    {
      "id": 4,
      "section": "Normalization",
      "q": "Normalization is a negligible share of FLOPs, yet RMSNorm still cuts wall-clock training time. Best explanation?",
      "options": [
        "It enables lower-precision matmuls",
        "It reduces the number of transformer layers",
        "It removes the attention softmax",
        "Norms are memory-bandwidth-bound (low arithmetic intensity); FLOPs ≠ runtime, so removing mean/bias cuts data movement and kernel work"
      ],
      "answer": 3,
      "explain": "Matmuls dominate FLOPs, but norms are memory-bound. Data movement, not arithmetic, is what RMSNorm saves (Ivanov 2023); Narang 2020 even sees small quality gains."
    },
    {
      "id": 5,
      "section": "Activations",
      "q": "With a SwiGLU FFN, why set the hidden width to about (8/3)·d_model instead of 4·d_model?",
      "options": [
        "GLUs use three weight matrices instead of two, so shrinking d_ff by 2/3 holds the parameter count constant",
        "SwiGLU requires power-of-two dimensions",
        "It matches the vocabulary size",
        "It raises the effective FFN ratio above 4×"
      ],
      "answer": 0,
      "explain": "ReLU FFN has W1, W2; a GLU adds a gate matrix V (three matrices). Scaling 4·d_model by 2/3 → (8/3)·d_model keeps params fixed."
    },
    {
      "id": 6,
      "section": "Activations",
      "q": "What is the honest researcher takeaway on gated activations like SwiGLU?",
      "options": [
        "They are required for a working LM",
        "Gains are small but consistent and not well understood (Shazeer: 'divine benevolence'); GPT-3 with plain GeLU is still fine",
        "They give large (>2 perplexity) gains",
        "They trade quality for inference speed"
      ],
      "answer": 1,
      "explain": "*GLU isn't necessary (GPT-3, Nemotron squared-ReLU, Falcon ReLU all work) but yields small, consistent gains; Shazeer offers no real mechanism."
    },
    {
      "id": 7,
      "section": "Positions",
      "q": "What property does RoPE enforce that absolute (sinusoidal/learned) embeddings do not?",
      "options": [
        "The embedding is added once at the input layer",
        "Absolute position is linearly decodable from the logits",
        "The attention inner product ⟨f(x,i), f(y,j)⟩ depends only on the relative offset i−j",
        "Positions are learned separately per head"
      ],
      "answer": 2,
      "explain": "RoPE is designed so the QK inner product is a function of i−j only; absolute schemes leave non-relative cross-terms in the product."
    },
    {
      "id": 8,
      "section": "Positions",
      "q": "Mechanically, how does RoPE inject position?",
      "options": [
        "Adds sinusoids to the token embedding",
        "Subtracts a learned scalar from each attention logit",
        "Concatenates a one-hot position vector",
        "Rotates paired query/key coordinates by an angle proportional to position, exploiting rotation-invariance of inner products — reapplied every layer"
      ],
      "answer": 3,
      "explain": "Pair coordinates and rotate each 2-D pair by i·theta_k. (R_i q)·(R_j k) = q·R_{j-i}·k depends only on j−i. Applied at every attention layer."
    },
    {
      "id": 9,
      "section": "Positions",
      "q": "ALiBi adds a head-specific linear penalty −m·(i−j) to the attention logits (no position embeddings). Its headline benefit is:",
      "options": [
        "Strong length extrapolation — train on short contexts, evaluate on much longer ones",
        "Lower KV-cache memory",
        "Eliminating the softmax",
        "Tying input and output embeddings"
      ],
      "answer": 0,
      "explain": "ALiBi (Press 2022) was built for train-short/test-long extrapolation. NoPE (no positions) is also surprisingly viable and now interleaved with RoPE+SWA."
    },
    {
      "id": 10,
      "section": "Attention",
      "q": "Why is autoregressive decoding memory-bound while prefill/training is compute-bound?",
      "options": [
        "Decode matmuls are larger than prefill matmuls",
        "Decoding can't parallelize over the sequence; each step reads the entire KV cache to emit one token (low arithmetic intensity)",
        "The softmax becomes O(n²) per token at decode",
        "The FFN is skipped during prefill"
      ],
      "answer": 1,
      "explain": "Prefill processes all positions in parallel (high intensity). Decode is step-by-step and re-reads the whole KV cache per token → bandwidth-bound."
    },
    {
      "id": 11,
      "section": "Attention",
      "q": "How do MHA, MQA, and GQA relate?",
      "options": [
        "MQA uses per-query KV heads; GQA shares one KV head across all queries",
        "GQA enlarges the KV cache relative to MHA",
        "MHA: H KV heads; MQA: 1 shared KV head; GQA: G groups of query heads share a KV head — a knob between the two",
        "MQA improves quality over MHA"
      ],
      "answer": 2,
      "explain": "GQA interpolates: G=H is MHA, G=1 is MQA. LLaMA-2 70B uses G=8 with ≈ no quality loss; MQA has a small PPL hit (Shazeer 2019, Ainslie 2023)."
    },
    {
      "id": 12,
      "section": "Attention",
      "q": "What does QK-norm do, and why?",
      "options": [
        "Caps output logits with tanh to bound their magnitude",
        "Shares KV heads to shrink the cache",
        "Normalizes the FFN hidden activations",
        "RMS/LayerNorms the queries and keys before the softmax to prevent attention-logit blow-ups (training stability)"
      ],
      "answer": 3,
      "explain": "QK-norm normalizes Q and K pre-softmax (Dehghani 2023 → DCLM, OLMo 2, Gemma 2). Softmaxes are the usual blow-up source; z-loss and logit soft-capping target the same failure mode."
    },
    {
      "id": 13,
      "section": "Hyperparameters",
      "q": "FFN ratios cluster at 4× (ungated) / ~2.67× (GLU). What does T5-11B's 64× multiplier teach?",
      "options": [
        "These ratios are soft basins, not laws — but T5 v1.1 reverting to ~2.5× suggests 64× was suboptimal",
        "64× is the true optimum",
        "A larger FFN ratio always lowers loss",
        "The ratio must equal the number of heads"
      ],
      "answer": 0,
      "explain": "Kaplan 2020 shows a broad 1–10× basin. T5's radical 64× works, but its successor reverts to ~2.5× GeGLU — evidence 64× was suboptimal, not that ratio is free."
    },
    {
      "id": 14,
      "section": "Hyperparameters",
      "q": "The aspect ratio d_model/n_layers sits in a wide 100–200 band. What actually pins the value?",
      "options": [
        "Loss degrades sharply outside the band",
        "Systems constraints — deep models are harder to parallelize and have higher latency — not accuracy",
        "The vocabulary size",
        "The weight-decay coefficient"
      ],
      "answer": 1,
      "explain": "Loss is flat across the band; depth is limited by parallelism and latency (Tay 2021), so systems, not loss, set the aspect ratio."
    },
    {
      "id": 15,
      "section": "Hyperparameters",
      "q": "Weight tying refers to:",
      "options": [
        "Sharing K and V projections across attention heads",
        "Sharing weights across transformer layers",
        "Sharing the input embedding matrix with the output (unembedding) projection, saving |V|·d_model params",
        "Coupling the learning rate to the batch size"
      ],
      "answer": 2,
      "explain": "Tying (Press & Wolf 2017) reuses the embedding as the output projection; it matters most for small models / large vocab. Many large models untie since the saving is marginal."
    },
    {
      "id": 16,
      "section": "Consensus",
      "q": "The '2025 consensus' decoder is best summarized as:",
      "options": [
        "post-norm + LayerNorm + ReLU + sinusoidal + MHA",
        "encoder–decoder + GeGLU + ALiBi + MQA",
        "pre-norm + LayerNorm + GeLU + learned-absolute + MHA",
        "pre-norm + RMSNorm + SwiGLU + RoPE + GQA (no biases)"
      ],
      "answer": 3,
      "explain": "The LLaMA-style stack: pre-norm, RMSNorm, SwiGLU, RoPE, GQA, no biases — pre-norm and GQA are the load-bearing wins; the rest are cheap efficiency or small consistent gains."
    }
  ]
});
