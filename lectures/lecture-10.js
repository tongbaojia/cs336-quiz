/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 10,
  "estMinutes": 20,
  "topics": [
    "KV cache",
    "arithmetic intensity",
    "speculative decoding",
    "GQA/MLA",
    "quantization"
  ],
  "overview": "Inference — generating tokens from a <em>fixed</em> model — is where models are actually used, and unlike one-time training it is paid on every token forever. This lecture derives <strong>why generation is memory-bound</strong> from arithmetic intensity, then walks the toolbox: the KV cache and the GQA/MLA family, batching/continuous-batching/paging, lossless speculative decoding, and cheaper models via quantization, pruning, and distillation.",
  "sections": [
    {
      "id": "why-inference",
      "title": "Why inference is the real bill",
      "blocks": [
        {
          "p": "<strong>Inference</strong>: given a fixed model, generate responses to prompts. Training is a one-time cost; inference is paid on every token of every request, so it shows up everywhere:"
        },
        {
          "list": [
            "<strong>Actual use</strong>: chatbots, code completion, batch data processing",
            "<strong>Evaluation</strong>: every benchmark run is inference",
            "<strong>Test-time compute</strong>: reasoning / <em>thinking</em> spends far more inference per query",
            "<strong>RL training</strong>: sample rollouts, then score them — inference sits inside the training loop"
          ]
        },
        {
          "callout": "Aggregated over a deployed model's lifetime, <strong>inference compute exceeds the one-time training compute</strong> (OpenAI has reported ~100B tokens/day-scale serving; Cursor ~1B lines/day). Efficiency here is not a nicety — it is the product.",
          "kind": "key"
        },
        {
          "h": "Metrics that matter"
        },
        {
          "table": {
            "head": [
              "Metric",
              "What it measures",
              "Matters for"
            ],
            "rows": [
              [
                "TTFT (time-to-first-token)",
                "delay before the first generated token; &asymp; prefill time",
                "interactive UX"
              ],
              [
                "Latency (s/token)",
                "how fast tokens stream after the first",
                "interactive UX"
              ],
              [
                "Throughput (tokens/s)",
                "total tokens/s across all requests",
                "batch jobs, cost/token"
              ]
            ]
          }
        },
        {
          "p": "The asymmetry vs training: supervised training sees all target tokens up front and pushes the whole sequence through one big matmul. Generation is autoregressive — token \\(t{+}1\\) needs token \\(t\\) — so you cannot parallelize across time, and keeping the hardware busy is genuinely hard."
        },
        {
          "callout": "Everything below follows from one fact: a single matrix-vector product (decode, batch 1) reads an entire weight matrix to do only \\(O(\\text{params})\\) FLOPs. The accelerator is starved for work — inference is memory-bound, and the whole game is feeding the beast.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "arithmetic-intensity",
      "title": "Arithmetic intensity: the one number",
      "blocks": [
        {
          "p": "<strong>Arithmetic intensity</strong> = FLOPs performed per byte moved from HBM. Compare it to the accelerator's own FLOP/byte ratio (the roofline <em>ridge point</em>): above it you are compute-bound (good), below it memory-bound (bad). Work the canonical matmul \\(X\\,(B{\\times}D) \\cdot W\\,(D{\\times}F)\\):"
        },
        {
          "code": "# Arithmetic intensity of a matmul:  X (B x D) @ W (D x F)\nflops = 2*B*D*F                      # one multiply-add per output element\nbytes = 2*B*D + 2*D*F + 2*B*F        # read X, read W, write Y (bf16 = 2 B/elt)\nintensity = flops / bytes            # FLOPs per byte off HBM\n# B << D, F  =>  intensity -> B\n# H100: 989e12 FLOP/s / 3.35e12 B/s ~= 295  (roofline ridge point)\n# compute-bound iff intensity > 295  =>  need batch B ~> 295",
          "lang": "python"
        },
        {
          "math": "\\text{intensity} = \\frac{2BDF}{2BD + 2DF + 2BF} \\;\\longrightarrow\\; B \\quad (B \\ll D, F)"
        },
        {
          "p": "An H100 does \\(\\approx 989\\) TFLOP/s (bf16) against \\(\\approx 3.35\\) TB/s of HBM bandwidth, so its ridge point is \\(\\approx 295\\) FLOPs/byte. You are compute-bound only when intensity \\(> 295\\), i.e. effective batch \\(B \\gtrsim 295\\). At \\(B{=}1\\) — a matrix-vector product — intensity is \\(1\\): you read a whole \\(D{\\times}F\\) matrix to do \\(2DF\\) FLOPs. <strong>That is exactly what decode does.</strong>"
        },
        {
          "callout": "The ridge point (\\(\\approx 295\\)) is why 'just raise the batch' is the first serving lever: below it you burn HBM bandwidth, not FLOPs. The catch (next sections): attention refuses to cooperate.",
          "kind": "insight"
        },
        {
          "callout": "intensity \\(\\to B\\) holds only while \\(B \\ll D, F\\). Push \\(B\\) too high and the approximation breaks (and you run out of memory long before that) — the throughput win saturates well short of the asymptote.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "prefill-decode",
      "title": "Two phases: prefill vs decode",
      "blocks": [
        {
          "p": "Naive generation re-feeds the full history every step: producing \\(T\\) tokens costs \\(O(T^3)\\) FLOPs (each forward pass is \\(O(T^2)\\)). Storing past keys/values — the <strong>KV cache</strong> — removes that redundant recompute and splits inference into two phases with opposite characteristics."
        },
        {
          "p": "<strong>Prefill</strong> encodes the whole \\(S\\)-token prompt at once, in parallel, like training: one big matmul, compute-bound, and it sets TTFT. <strong>Decode</strong> then generates one token at a time (\\(T{=}1\\)), strictly sequential and memory-bound. Splitting FLOPs/bytes into MLP and attention makes the asymmetry precise."
        },
        {
          "p": "<strong>MLP</strong> intensity \\(\\approx B\\,T\\) (weights are shared across the batch), so decode (\\(T{=}1\\)) gives intensity \\(B\\) — you need many concurrent requests. <strong>Attention</strong> intensity is \\(ST/(S{+}T)\\): prefill (\\(T{=}S\\)) gives \\(S/2\\) (compute-bound, good); decode (\\(T{=}1\\)) gives \\(S/(S{+}1) < 1\\) (hopeless)."
        },
        {
          "math": "I_{\\text{attn}} = \\frac{ST}{S+T} \\;\\Longrightarrow\\; \\underbrace{\\tfrac{S}{2}}_{\\text{prefill: } T=S} \\;\\gg\\; \\underbrace{\\tfrac{S}{S+1} < 1}_{\\text{decode: } T=1}"
        },
        {
          "callout": "Batching raises MLP intensity (to \\(B\\)) but does <strong>nothing</strong> for attention — its intensity stays \\(\\approx 1\\) with no \\(B\\) dependence. Why: every sequence shares the same MLP weights (reused \\(B\\) times), but every sequence owns its KV cache, so \\(Q, K, V\\) all scale with \\(B\\) and there is no reuse to amortize. This is the structural reason decode attention is pinned memory-bound.",
          "kind": "insight"
        },
        {
          "table": {
            "head": [
              "",
              "Prefill",
              "Decode"
            ],
            "rows": [
              [
                "Input per step",
                "whole prompt, S tokens at once",
                "one token (T = 1)"
              ],
              [
                "Parallelism",
                "across the sequence (like training)",
                "sequential / autoregressive"
              ],
              [
                "Bottleneck",
                "compute-bound (good utilization)",
                "memory-bound (HBM bandwidth)"
              ],
              [
                "MLP intensity",
                "B&middot;S (large)",
                "B (needs many concurrent reqs)"
              ],
              [
                "Attention intensity",
                "S/2 (T = S)",
                "&lt; 1 (T = 1), no B dependence"
              ],
              [
                "Batching helps?",
                "yes",
                "MLP yes, attention no"
              ],
              [
                "Sets which metric",
                "TTFT",
                "per-token latency, throughput"
              ]
            ]
          }
        },
        {
          "callout": "A direct consequence: use <em>small</em> batches in prefill (fast TTFT) and <em>large</em> batches in decode (throughput). Modern servers schedule the phases differently — some even run them on separate machines ('disaggregated' prefill/decode).",
          "kind": "note"
        }
      ]
    },
    {
      "id": "kv-cache",
      "title": "The KV cache: what dominates decode memory",
      "blocks": [
        {
          "p": "The KV cache stores, for every layer, every KV head, every past token, and every sequence in the batch, the key and value vectors (\\(d_{\\text{head}}\\) each). Computed once, reused for all future tokens. Its size is the decisive memory term in decode:"
        },
        {
          "math": "\\text{KV bytes} \\;\\approx\\; 2 \\cdot n_{\\text{layers}} \\cdot n_{\\text{kv}} \\cdot d_{\\text{head}} \\cdot S \\cdot B \\cdot \\text{bytes}"
        },
        {
          "code": "# Per-sequence KV cache (bf16 = 2 bytes); leading 2 stores K and V\nkv_cache   = 2 * n_layers * n_kv_heads * head_dim * seq_len * 2\nmemory     = num_params * 2 + B * kv_cache   # weights + a batch of KV caches\nlatency    = memory / mem_bandwidth          # read it ALL every decode step\nthroughput = B / latency                     # B tokens generated in parallel",
          "lang": "python"
        },
        {
          "callout": "Concrete: Llama-2-13B (40 layers, 40 KV heads, \\(d_{\\text{head}}{=}128\\), bf16) costs \\(\\approx 0.8\\) MB per token, \\(\\approx 0.8\\) GB for a 1024-token sequence. At batch 64 that is \\(\\approx 52\\) GB of KV — more than the \\(\\approx 26\\) GB of weights. <strong>KV cache, not parameters, is what blows up decode memory.</strong>",
          "kind": "key"
        },
        {
          "p": "Because latency \\(\\propto\\) bytes read per step, shrinking the KV cache directly buys latency, throughput, and bigger batches. Hence a family of architecture changes that all attack the same byte budget:"
        },
        {
          "table": {
            "head": [
              "Variant",
              "KV heads",
              "KV cache vs MHA",
              "Note"
            ],
            "rows": [
              [
                "MHA",
                "K = N",
                "1&times; (baseline)",
                "best quality, biggest cache"
              ],
              [
                "MQA",
                "K = 1",
                "&divide; N",
                "cheapest, can lose quality"
              ],
              [
                "GQA",
                "1 &lt; K &lt; N (Llama-2-70B: K = 8)",
                "&divide; (N/K)",
                "near-MHA quality, the default"
              ],
              [
                "MLA",
                "low-rank latent (16384&rarr;512, +64 RoPE)",
                "large reduction",
                "DeepSeek-V2: beats MHA, far cheaper"
              ]
            ]
          }
        },
        {
          "callout": "Same idea on other axes: <strong>CLA</strong> shares KV across <em>layers</em>; <strong>sliding-window / local</strong> attention (Mistral, Longformer) makes the cache independent of sequence length; <strong>hybrids</strong> interleave a few global layers among local ones (character.ai: 1 global per 6, plus CLA). All target the bytes in the KV cache.",
          "kind": "connection"
        },
        {
          "callout": "GQA/MQA/local attention are <em>lossy</em> — they move along the accuracy-vs-KV-size Pareto frontier, not off it. Always validate accuracy; MLA is notable precisely because it reportedly improves quality <em>and</em> shrinks the cache.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "batching-serving",
      "title": "Throughput, latency, and dynamic batching",
      "blocks": [
        {
          "p": "From the stats above, \\(\\text{latency} = (\\text{params} + B\\cdot\\text{KV}) / \\text{bandwidth}\\) and \\(\\text{throughput} = B/\\text{latency}\\). Raising \\(B\\) raises throughput but also per-token latency — the central serving tradeoff."
        },
        {
          "math": "\\text{latency} = \\frac{\\text{params} + B \\cdot \\text{KV}}{\\text{mem bandwidth}}, \\qquad \\text{throughput} = \\frac{B}{\\text{latency}}"
        },
        {
          "table": {
            "head": [
              "Batch B",
              "Per-token latency",
              "Throughput",
              "Memory"
            ],
            "rows": [
              [
                "1",
                "best",
                "lowest",
                "weights dominate"
              ],
              [
                "64",
                "worse",
                "~64&times; higher",
                "weights + 64 KV caches"
              ],
              [
                "256",
                "worst",
                "gains diminishing",
                "often does not fit (OOM)"
              ]
            ]
          }
        },
        {
          "callout": "<strong>Easy</strong> parallelism: launch \\(M\\) replicas &rarr; same latency, \\(M\\times\\) throughput. <strong>Hard</strong> parallelism: shard the model <em>and</em> the KV cache across GPUs (tensor / pipeline parallel). Combined with phase-aware scheduling (small batches in prefill, large in decode), this is how you actually hit the batch sizes the roofline wants.",
          "kind": "insight"
        },
        {
          "h": "Continuous (in-flight) batching"
        },
        {
          "p": "Static batching wastes the GPU: requests arrive and finish at different times, lengths differ (padding is wasteful), and one finished sequence stalls the whole batch until the longest one ends. Orca's fix is <strong>iteration-level scheduling</strong> — re-form the batch every decode step, admitting new requests and evicting finished ones immediately."
        },
        {
          "list": [
            "<strong>Attention</strong> is per-sequence and ragged &rarr; compute each sequence separately",
            "<strong>MLP / non-attention</strong> matmuls ignore sequence boundaries &rarr; concatenate all sequences into one [&Sigma;T, H] tensor for a single efficient matmul (selective batching)"
          ]
        },
        {
          "callout": "<strong>PagedAttention</strong> (vLLM) borrows OS virtual-memory paging: store each sequence's KV in non-contiguous fixed-size blocks to kill internal/external fragmentation, and share blocks across sequences — shared system prompts, multiple samples per prompt — with copy-on-write. This is what makes large serving batches reachable in practice.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "speculative-decoding",
      "title": "Speculative decoding: lossless speedup",
      "blocks": [
        {
          "p": "Key asymmetry: <strong>checking is cheaper than generating</strong>. Verifying \\(k\\) proposed tokens is one parallel, compute-bound forward pass; generating them sequentially is \\(k\\) memory-bound steps. Speculative decoding exploits exactly this."
        },
        {
          "p": "A cheap <strong>draft</strong> model \\(p\\) proposes \\(k\\) tokens autoregressively; the <strong>target</strong> \\(q\\) scores all \\(k\\) in a single parallel pass; accept each token \\(x\\) with probability \\(\\min(1, q(x)/p(x))\\), and on the first rejection resample from the normalized residual \\(\\max(q-p, 0)\\). Always emit at least one token."
        },
        {
          "code": "# Speculative decoding, one round: draft p proposes k, target q verifies\ndraft_tokens = p.generate(k)                  # k cheap autoregressive steps\nq_probs = q.forward(draft_tokens)             # ONE parallel pass over all k\nfor x in draft_tokens:\n    if random() < min(1, q[x] / p[x]):\n        accept(x)                             # keep the proposed token\n    else:\n        emit(sample(normalize(relu(q - p))))  # corrected draw, then stop\n        break\n# P[emit x] = q(x) exactly  =>  output is an exact sample from the target",
          "lang": "python"
        },
        {
          "callout": "The output is an <strong>exact</strong> sample from the target \\(q\\) — not an approximation. It is modified rejection sampling; the accept/resample math gives \\(P[\\text{emit } x] = q(x)\\) identically. You trade extra (cheap) draft+verify FLOPs for fewer sequential memory-bound steps, and the speedup grows with the acceptance rate.",
          "kind": "key"
        },
        {
          "p": "In practice: a 70B target with an 8B draft, or 8B with 1B; distill the draft toward the target to raise acceptance. Typical wins are 2-3&times; with no quality change."
        },
        {
          "callout": "<strong>Self-speculation</strong> drops the separate draft model entirely: <strong>Medusa</strong> bolts extra decoding heads onto the target to propose several tokens in parallel; <strong>EAGLE</strong> drafts from the target's own hidden features; layer-skip / early-exit drafts with a prefix of the model's own layers. Same exactness guarantee, no second model to serve.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "cheaper-models",
      "title": "Cheaper models: quantization, pruning, distillation",
      "blocks": [
        {
          "p": "Speculative decoding is lossless. The other lever is to accept a small, validated accuracy hit for a structurally cheaper model. Three routes, all aimed at the memory bottleneck."
        },
        {
          "h": "Quantization"
        },
        {
          "p": "Store weights (and sometimes activations and the KV cache) in fewer bits &rarr; fewer bytes moved &rarr; faster memory-bound decode. QAT (train with quantization) is accurate but does not scale; PTQ (calibrate scales/zero-points on sample data) is the practical default."
        },
        {
          "table": {
            "head": [
              "Format",
              "Bytes/param",
              "Notes"
            ],
            "rows": [
              [
                "fp32",
                "4",
                "training params / optimizer state"
              ],
              [
                "bf16",
                "2",
                "default for inference"
              ],
              [
                "fp8 (e4m3)",
                "1",
                "range ~ [-240, 240]; can train, carefully"
              ],
              [
                "int8",
                "1",
                "[-128, 127]; inference only, cheaper than fp8"
              ],
              [
                "int4",
                "0.5",
                "[-8, 7]; cheapest, least accurate"
              ]
            ]
          }
        },
        {
          "callout": "Naive max-abs quantization dies on the <em>outlier features</em> that emerge in large models. <strong>LLM.int8()</strong> keeps the ~0.1% outlier dimensions in fp16 and the rest in int8 (works, but ~15-23% slower than fp16). <strong>AWQ</strong> keeps the 0.1-1% salient weights (chosen by activation magnitude) in high precision: fp16&rarr;int3, ~4&times; less memory, ~3.2&times; speedup.",
          "kind": "pitfall"
        },
        {
          "h": "Pruning + distillation"
        },
        {
          "p": "Pruning rips out whole layers/heads/hidden-dims — rank importance on a small calibration set (NVIDIA Minitron used ~1024 samples), remove the unimportant ones, then <strong>distill</strong> the original (teacher) into the pruned (student) to repair it. Distillation more broadly: define a faster architecture, initialize from the big model, train the student to match the teacher's outputs."
        },
        {
          "callout": "Beyond tweaking the Transformer: <strong>SSMs</strong> (Mamba) and linear/local-attention hybrids (Jamba, MiniMax-01) replace the \\(O(S)\\) KV cache with an \\(O(1)\\) recurrent state — structurally inference-friendly — and text <strong>diffusion</strong> LMs generate tokens in parallel rather than autoregressively. The Transformer was not designed for inference, so the biggest wins may be architectural.",
          "kind": "connection"
        },
        {
          "callout": "Two philosophies, one goal (cut decode cost): <strong>lossless</strong> shortcuts (speculative decoding, continuous batching, paging) exploit systems ideas and the check-vs-generate asymmetry for free; <strong>lossy</strong> shortcuts (cheaper architectures, quantization, pruning/distillation) must be accuracy-validated.",
          "kind": "key"
        }
      ]
    }
  ],
  "takeaways": [
    "Inference splits into <strong>prefill</strong> (whole prompt in parallel, compute-bound, sets TTFT) and <strong>decode</strong> (one token at a time, memory-bound, sets latency/throughput).",
    "The deciding quantity is <strong>arithmetic intensity</strong> (FLOPs/byte) vs the H100 ridge point &asymp; 295: MLP intensity &rarr; B, but decode-attention intensity stays &asymp; 1 and ignores batch — because every sequence owns its KV cache.",
    "The <strong>KV cache</strong> (&asymp; 2&middot;layers&middot;kv-heads&middot;head-dim&middot;seq&middot;batch&middot;bytes) dominates decode memory; shrinking it (GQA, MQA, MLA, local/CLA) directly buys latency, throughput, and bigger batches.",
    "Bigger batches trade per-token latency for throughput; <strong>continuous batching</strong> and <strong>PagedAttention</strong> are systems tricks to actually reach the batch sizes the roofline wants.",
    "<strong>Speculative decoding</strong> is a free lunch: a cheap draft proposes k tokens, the target verifies them in one parallel pass, and the output is an <em>exact</em> sample from the target (Medusa/EAGLE self-speculation drop the separate draft).",
    "Lossy shortcuts — quantization (watch outliers: LLM.int8, AWQ), pruning, distillation, and post-Transformer architectures (Mamba, diffusion LMs) — cut cost but must be accuracy-validated.",
    "Training is a one-time cost; aggregate inference compute exceeds it — inference efficiency is the product."
  ],
  "references": [
    {
      "label": "CS336 Lecture 10 trace (Percy Liang)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_10"
    },
    {
      "label": "Pope et al. 2022 — Efficiently Scaling Transformer Inference",
      "url": "https://arxiv.org/abs/2211.05102"
    },
    {
      "label": "Ainslie et al. 2023 — GQA",
      "url": "https://arxiv.org/abs/2305.13245"
    },
    {
      "label": "DeepSeek-AI 2024 — DeepSeek-V2 (MLA)",
      "url": "https://arxiv.org/abs/2405.04434"
    },
    {
      "label": "Leviathan et al. 2023 — Speculative decoding",
      "url": "https://arxiv.org/abs/2211.17192"
    },
    {
      "label": "Cai et al. 2024 — Medusa",
      "url": "https://arxiv.org/abs/2401.10774"
    },
    {
      "label": "Kwon et al. 2023 — vLLM / PagedAttention",
      "url": "https://arxiv.org/abs/2309.06180"
    },
    {
      "label": "Dettmers et al. 2022 — LLM.int8()",
      "url": "https://arxiv.org/abs/2208.07339"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Phases",
      "q": "Why is decode memory-bound while prefill is compute-bound?",
      "options": [
        "Prefill processes all S prompt tokens in one parallel matmul (high FLOPs/byte), while decode does a token-at-a-time matrix-vector product (intensity ~1)",
        "Decode uses lower-precision weights than prefill",
        "Decode reads fewer parameters per step than prefill",
        "Prefill skips the attention layers entirely"
      ],
      "answer": 0,
      "explain": "Arithmetic intensity = FLOPs/byte. Prefill amortizes weight reads over S tokens; decode (T=1) reads the full weights to do O(params) FLOPs, so it is bandwidth-starved."
    },
    {
      "id": 2,
      "section": "Intensity",
      "q": "An H100 (~989 TFLOP/s bf16, ~3.35 TB/s HBM) has a roofline ridge point of ~295 FLOPs/byte. For an MLP matmul, being compute-bound therefore requires:",
      "options": [
        "Sequence length to exceed 295",
        "Effective batch B to be at least ~295 (since MLP intensity approaches B)",
        "head_dim to exceed 295",
        "Nothing — MLPs are always compute-bound"
      ],
      "answer": 1,
      "explain": "MLP intensity -> B for B much less than D,F; compute-bound needs intensity > ~295, i.e. ~295+ concurrent tokens."
    },
    {
      "id": 3,
      "section": "Phases",
      "q": "MLP arithmetic intensity scales with batch B, but decode attention intensity stays ~1 regardless of B. Why doesn't batching help attention?",
      "options": [
        "Attention contains no matrix multiplications",
        "Attention is already compute-bound so batching is unnecessary",
        "Each sequence has its own KV cache (Q, K, V all scale with B), so there is no cross-batch weight reuse to amortize — unlike the shared MLP weights",
        "The softmax cannot be batched across sequences"
      ],
      "answer": 2,
      "explain": "MLP weights are shared across the batch (reused B times); KV/Q/V are per-sequence, so batching adds proportional work and reads — intensity stays ~1."
    },
    {
      "id": 4,
      "section": "KV cache",
      "q": "KV-cache size is ~ 2 * n_layers * n_kv_heads * head_dim * seq_len * batch * bytes. Which factor does GQA shrink relative to MHA?",
      "options": [
        "seq_len",
        "n_layers",
        "head_dim",
        "n_kv_heads"
      ],
      "answer": 3,
      "explain": "GQA shares KV across query heads, cutting n_kv_heads from N to K (MQA: K=1), shrinking the cache by a factor N/K."
    },
    {
      "id": 5,
      "section": "KV cache",
      "q": "At serving batch sizes, why does the KV cache — not the parameters — dominate decode memory?",
      "options": [
        "KV grows with batch * seq_len while parameters are fixed; e.g. Llama-2-13B at batch 64, 1k ctx is ~52 GB KV vs ~26 GB weights",
        "Parameters are kept on the CPU during decode",
        "The KV cache is stored in fp32 while weights are int4",
        "Parameters are recomputed each step, so they are not counted as memory"
      ],
      "answer": 0,
      "explain": "Weights are a fixed cost; KV scales with B*S and overtakes parameters once batch*context is large."
    },
    {
      "id": 6,
      "section": "KV cache",
      "q": "How does Multi-head Latent Attention (MLA, DeepSeek-V2) reduce the KV cache, and how does it differ from GQA?",
      "options": [
        "It prunes whole layers; GQA prunes heads",
        "It stores a shared low-rank latent per token (e.g. 16384->512, +64 RoPE dims) instead of dropping KV heads as GQA does",
        "It quantizes the KV to int4; GQA keeps bf16",
        "It caches only values and recomputes keys"
      ],
      "answer": 1,
      "explain": "MLA stores a small latent vector per token (low-rank K/V), reportedly beating MHA quality while being far cheaper; GQA instead reduces the number of KV heads."
    },
    {
      "id": 7,
      "section": "Phases",
      "q": "Naive autoregressive generation (re-feeding the full history each step) costs how many FLOPs to produce T tokens, and what fixes it?",
      "options": [
        "O(T); nothing is needed",
        "O(T^2); fixed by quantization",
        "O(T^3) (each forward pass is O(T^2)); the KV cache removes the redundant recompute of past tokens",
        "O(T log T); fixed by speculative decoding"
      ],
      "answer": 2,
      "explain": "Each step redoes O(T^2) work over the growing prefix -> O(T^3) total; caching past K,V lets each new token reuse prior work."
    },
    {
      "id": 8,
      "section": "Serving",
      "q": "Increasing decode batch size from 1 to 64 (assuming it fits) primarily:",
      "options": [
        "Improves per-token latency and throughput equally",
        "Improves latency while worsening throughput",
        "Has no effect because decode is memory-bound",
        "Worsens per-token latency but greatly increases throughput"
      ],
      "answer": 3,
      "explain": "latency = (params + B*KV)/bandwidth rises with B, but throughput = B/latency rises ~linearly until KV memory / diminishing returns bite."
    },
    {
      "id": 9,
      "section": "Serving",
      "q": "What problem does continuous (in-flight) batching, as in Orca, solve?",
      "options": [
        "Requests arrive/finish at different times and have different lengths; iteration-level scheduling re-forms the batch every decode step, admitting and evicting requests instead of waiting for the whole batch",
        "Quantization outlier features",
        "KV-cache fragmentation in GPU memory",
        "The quadratic cost of the attention matmul"
      ],
      "answer": 0,
      "explain": "Static batching stalls on the longest sequence; continuous batching schedules at the granularity of decode iterations."
    },
    {
      "id": 10,
      "section": "Serving",
      "q": "PagedAttention (vLLM) borrows which OS idea, and why?",
      "options": [
        "Branch prediction, to guess the next token",
        "Virtual-memory paging: store each sequence's KV in non-contiguous fixed-size blocks to eliminate fragmentation and share/copy-on-write blocks across sequences",
        "Spinlocks, to synchronize GPUs",
        "Swapping weights to disk to free HBM"
      ],
      "answer": 1,
      "explain": "Paging removes internal/external KV fragmentation and enables prefix sharing (system prompts, multi-sample decoding), raising the achievable batch size."
    },
    {
      "id": 11,
      "section": "Speculative",
      "q": "What is the output distribution of speculative decoding?",
      "options": [
        "An approximation of the target, trading accuracy for speed",
        "The cheap draft model's distribution",
        "Exactly the target model's distribution (modified rejection sampling)",
        "A temperature-sharpened version of the target"
      ],
      "answer": 2,
      "explain": "Accept with prob min(1, q/p) and resample from normalized max(q-p, 0); this makes P[emit x] = q(x) exactly."
    },
    {
      "id": 12,
      "section": "Speculative",
      "q": "Why does proposing-then-verifying speed up decoding despite invoking the big model?",
      "options": [
        "The big model runs at lower precision during verification",
        "It skips attention for the drafted tokens",
        "The draft model is more accurate than the target",
        "Verifying k draft tokens is a single parallel, compute-bound pass that replaces k sequential memory-bound steps — exploiting that checking is cheaper than generating"
      ],
      "answer": 3,
      "explain": "Decode is memory-bound with spare FLOPs; batching the k candidates into one verify pass converts sequential steps into parallel work. Speedup grows with the acceptance rate."
    },
    {
      "id": 13,
      "section": "Speculative",
      "q": "Medusa and EAGLE are forms of 'self-speculation.' What do they change vs vanilla speculative decoding?",
      "options": [
        "They remove the separate draft model — the target proposes for itself via extra decoding heads (Medusa) or its own hidden features (EAGLE)",
        "They make the output an approximation of the target",
        "They replace rejection sampling with greedy decoding",
        "They only work at batch size 1"
      ],
      "answer": 0,
      "explain": "Self-speculation drafts from the target itself (extra heads / reused features / skipped layers), keeping the exactness guarantee without serving a second model."
    },
    {
      "id": 14,
      "section": "Cheaper",
      "q": "What problem does LLM.int8() address, and how?",
      "options": [
        "KV fragmentation, via paging",
        "Outlier features in large models that wreck naive max-abs quantization; it keeps the ~0.1% outlier dimensions in fp16 and quantizes the rest to int8",
        "Slow attention, via FlashAttention",
        "Long context, via local attention"
      ],
      "answer": 1,
      "explain": "Emergent outlier channels blow up the quantization range; isolating them in fp16 preserves accuracy (at ~15-23% slowdown vs fp16)."
    },
    {
      "id": 15,
      "section": "Cheaper",
      "q": "Why is reducing numeric precision (e.g. bf16 -> int8/int4) a lever for inference specifically?",
      "options": [
        "It increases the model's FLOP count",
        "Lower precision improves model accuracy",
        "Decode is memory-bound, so fewer bytes per weight/KV directly reduces the dominant cost (bytes moved from HBM)",
        "It enables a larger head_dim"
      ],
      "answer": 2,
      "explain": "Latency is proportional to bytes read per step; halving bytes ~halves the memory-bound decode time, accuracy permitting."
    },
    {
      "id": 16,
      "section": "Why",
      "q": "Across a deployed model's lifetime, which is larger — one-time training compute or aggregate inference compute?",
      "options": [
        "Training, always",
        "They are roughly equal by design",
        "Neither — inference compute is negligible",
        "Aggregate inference, since the model is queried enormously many times (e.g. ~100B tokens/day-scale serving)"
      ],
      "answer": 3,
      "explain": "Training is paid once; inference is paid on every token of every request, so summed over deployment it exceeds training — the reason inference efficiency is the product."
    }
  ]
});
