/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 2,
  "estMinutes": 19,
  "topics": [
    "dtypes",
    "FLOPs",
    "6ND",
    "MFU",
    "memory"
  ],
  "overview": "Lecture 2 builds every primitive needed to train a model — tensors, dtypes, FLOPs, gradients, optimizers — through one lens: <strong>resource accounting</strong>. Two budgets govern everything downstream: <em>memory</em> (bytes) and <em>compute</em> (FLOPs). The back-of-envelope rules you derive here — <code>memory = numel × bytes/element</code> and the <strong>6ND</strong> training law — recur for the rest of the course.",
  "sections": [
    {
      "id": "dtypes",
      "title": "Numeric precision: the dtype zoo",
      "blocks": [
        {
          "p": "Everything — parameters, gradients, activations, optimizer state — is stored as floating point, so both memory and speed fall out of the dtype you pick. <code>float32</code> is the scientific-computing default; deep learning tolerates far less precision, and exploiting that is most of the efficiency game."
        },
        {
          "h": "What the bits buy you"
        },
        {
          "p": "A float splits its bits between an <strong>exponent</strong> (dynamic range) and a <strong>mantissa</strong> (precision). fp32 = 1 sign + 8 exponent + 23 mantissa. The two 16-bit formats spend their bits differently, and that single choice is the whole story."
        },
        {
          "table": {
            "head": [
              "dtype",
              "exp / mant",
              "bytes",
              "dynamic range",
              "role"
            ],
            "rows": [
              [
                "float32",
                "8 / 23",
                "4",
                "~1e±38",
                "master copy, default, stable"
              ],
              [
                "float16",
                "5 / 10",
                "2",
                "~6e-5 … 65504",
                "precise but tiny range → underflow"
              ],
              [
                "bfloat16",
                "8 / 7",
                "2",
                "~1e±38 (= fp32)",
                "training default; range over precision"
              ],
              [
                "fp8 E4M3",
                "4 / 3",
                "1",
                "[-448, 448]",
                "weights / activations matmuls"
              ],
              [
                "fp8 E5M2",
                "5 / 2",
                "1",
                "[-57344, 57344]",
                "gradients (needs more range)"
              ]
            ]
          }
        },
        {
          "callout": "bf16 keeps fp32's <strong>8 exponent bits</strong> (identical dynamic range) and sacrifices mantissa (7 vs fp32's 23). fp16 keeps more mantissa (10) but only 5 exponent bits, so its range is tiny. For training, range matters far more than the last few bits of precision — which is exactly why bf16 displaced fp16 as the default (Llama, Qwen, every modern run).",
          "kind": "insight"
        },
        {
          "code": "x = torch.zeros(4, 8)              # default dtype\nassert x.dtype == torch.float32\nassert x.element_size() == 4       # float32 -> 4 bytes\nassert x.numel() == 4 * 8\nmemory_bytes = x.numel() * x.element_size()   # 128 bytes\n\n# fp16 underflows on tiny magnitudes; bf16 keeps fp32's range\nassert torch.tensor([1e-8], dtype=torch.float16) == 0    # underflow!\nassert torch.tensor([1e-8], dtype=torch.bfloat16) != 0   # survives",
          "lang": "python"
        },
        {
          "callout": "fp16's smallest subnormal is ≈6e-8, so a value like 1e-8 silently flushes to 0 → dead gradients and training instability. The classic 2017 mixed-precision recipe fought this with loss scaling; bf16's fp32-like range removes most of that need. The catch: bf16's coarse mantissa means you still keep an fp32 master copy for the optimizer.",
          "kind": "pitfall"
        },
        {
          "p": "<strong>fp8</strong> (standardized 2022) packs into 1 byte in two flavors: E4M3 (range $[-448, 448]$) and E5M2 (range $[-57344, 57344]$). H100-class hardware runs fp8 matmuls natively; DeepSeek-V3 trained most GEMMs in fp8. Lower precision means less memory and faster compute, bought with more instability risk — handled by mixed precision."
        }
      ]
    },
    {
      "id": "memory-views",
      "title": "What a tensor is, and what it costs",
      "blocks": [
        {
          "p": "Memory accounting is mechanical: a tensor's footprint is its element count times its dtype size. Nothing else — shape, name, autograd graph — moves the needle for the big buffers."
        },
        {
          "math": "\\text{bytes} = \\text{numel} \\times \\text{(bytes/element)}"
        },
        {
          "p": "Scale intuition: one feed-forward matrix in GPT-3 is $(4 \\cdot 12288,\\, 12288)$ — about $6.0\\times10^{8}$ params, so ≈2.3 GB in fp32. <em>One</em> matrix. This is why dtype choice and sharding aren't optional at scale."
        },
        {
          "h": "Views are free; copies are not"
        },
        {
          "p": "A PyTorch tensor is a pointer into a flat storage buffer plus metadata — <code>shape</code> and <code>stride</code> — describing how to index it. Many ops (slicing, <code>transpose</code>, <code>view</code>) just hand back a new view over the <em>same</em> storage, so there's no copy and mutations alias. But <code>transpose</code> yields non-contiguous strides, and a later <code>.view()</code> then fails until you call <code>.contiguous()</code> — which finally copies."
        },
        {
          "code": "x = torch.tensor([[1., 2, 3], [4, 5, 6]])\ny = x.transpose(1, 0)            # a VIEW: shares storage, no copy\nx[0, 0] = 100                    # mutating x also mutates y (aliasing)\nassert y[0, 0] == 100\nassert not y.is_contiguous()     # transpose breaks contiguity\ny.view(2, 3)                     # RuntimeError: size / stride incompatible\ny = x.transpose(1, 0).contiguous().view(2, 3)   # force a copy first",
          "lang": "python"
        },
        {
          "callout": "This is why <code>.contiguous()</code>, <code>reshape</code> vs <code>view</code>, and memory-format choices show up in profilers: a stray copy of a big activation tensor is real bytes and real bandwidth. Views cost nothing; copies cost both memory <em>and</em> compute.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "flops",
      "title": "Counting compute: FLOPs",
      "blocks": [
        {
          "p": "<strong>FLOPs</strong> (floating-point operations — a count of work done) and <strong>FLOP/s</strong> (operations per second — hardware speed) are pronounced the same and constantly confused. Anchor your intuition: GPT-3 took ≈$3.14\\times10^{23}$ FLOPs, GPT-4 is speculated at ≈$2\\times10^{25}$, and the (now-revoked) US reporting threshold was $10^{26}$."
        },
        {
          "h": "Matmul dominates"
        },
        {
          "p": "For $A_{m\\times k} B_{k\\times n}$, each of the $m\\cdot n$ outputs is a length-$k$ dot product = $k$ multiplies + $k$ adds. Everything else (elementwise ops, adds, norms) is $O(\\text{numel})$ and asymptotically free next to matmul on large matrices."
        },
        {
          "math": "\\text{FLOPs}\\big(A_{m\\times k}\\,B_{k\\times n}\\big) = 2\\,m\\,n\\,k"
        },
        {
          "code": "B, D, K = 16384, 32768, 8192     # tokens, in-dim, out-dim\nx = torch.ones(B, D, device='cuda')\nw = torch.randn(D, K, device='cuda')\ny = x @ w                        # one multiply + one add per (i, j, k)\nnum_flops = 2 * B * D * K        # = 2 * tokens * params\nmfu = (num_flops / elapsed_s) / promised_flop_per_sec",
          "lang": "python"
        },
        {
          "callout": "For a linear layer $y = xW$ with $x$ of shape (tokens, $D$) and $W$ of shape $(D, K)$: FLOPs $= 2 \\cdot \\text{tokens} \\cdot (D K) = 2 \\cdot (\\#\\text{tokens}) \\cdot (\\#\\text{params})$. So the forward pass is ≈$2ND$ — the seed of the entire 6ND law, and it generalizes to Transformers to first order.",
          "kind": "key"
        },
        {
          "callout": "That first-order story is exactly why $6ND$ omits attention's $QK^\\top$ and (softmax)$\\cdot V$ — those scale with sequence length <em>squared</em>, not with params. Fine for modest context, an undercount for long context (the regime FlashAttention targets).",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "six-nd",
      "title": "Forward, backward, and the 6ND rule",
      "blocks": [
        {
          "p": "The forward pass is one matmul per weight; the backward pass is two. That asymmetry is the whole derivation of $6ND$ — no magic constant."
        },
        {
          "p": "For a hidden layer $h_{\\text{out}} = h_{\\text{in}} W$, backprop needs two matmuls of the same size as the forward: $\\partial L/\\partial W = h_{\\text{in}}^\\top (\\partial L/\\partial h_{\\text{out}})$ to <em>update the weight</em>, and $\\partial L/\\partial h_{\\text{in}} = (\\partial L/\\partial h_{\\text{out}}) W^\\top$ to <em>relay the gradient</em> to the previous layer. Two matmuls vs the forward's one → $4ND$ vs $2ND$."
        },
        {
          "code": "# x --w1--> h1 --w2--> h2 -> loss      (params = D*D + D*K)\nfwd = 2*B*D*D + 2*B*D*K                  # = 2 * tokens * params\n\n# backward needs TWO matmuls per weight matrix:\n#   w2.grad = h1.T @ h2.grad    -> 2*B*D*K   (gradient wrt the weight)\n#   h1.grad = h2.grad @ w2.T    -> 2*B*D*K   (gradient relayed to input)\nbwd = (2+2)*B*D*K + (2+2)*B*D*D           # = 4 * tokens * params\n\ntotal = fwd + bwd                        # = 6 * tokens * params  (6ND)",
          "lang": "python"
        },
        {
          "table": {
            "head": [
              "Pass",
              "matmuls / weight",
              "FLOPs"
            ],
            "rows": [
              [
                "Forward",
                "1",
                "$2ND$"
              ],
              [
                "Backward",
                "2 (weight grad + input grad)",
                "$4ND$"
              ],
              [
                "Total",
                "3",
                "$6ND$"
              ]
            ]
          }
        },
        {
          "math": "C_{\\text{train}} \\approx 6ND \\qquad\\qquad C_{\\text{infer}} \\approx 2N \\;\\text{ per token}"
        },
        {
          "callout": "Inference is forward-only — no backward, no optimizer — so ≈$2N$ FLOPs per token. Training a token (~$6N$) costs ~3× an inference forward. Yet globally, aggregate inference can still dwarf the one-time training cost because it runs forever (the Lecture 1 point).",
          "kind": "insight"
        },
        {
          "callout": "$6ND$ counts parameter matmuls only. It ignores attention's seq² term, embeddings, and norms, and it assumes no recomputation. Full activation checkpointing recomputes the forward inside backward, adding ~$2ND$ and pushing the effective cost toward $8ND$. Treat $6ND$ as a clean lower bound, not a billing statement.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "mfu",
      "title": "MFU and wall-clock estimates",
      "blocks": [
        {
          "p": "Peak FLOP/s depends on both hardware <em>and</em> dtype, and real kernels never reach peak. The ratio of what you actually sustain to that peak is <strong>Model FLOPs Utilization (MFU)</strong> — the single number that converts a FLOP count into a calendar."
        },
        {
          "table": {
            "head": [
              "Hardware",
              "float32",
              "bf16/fp16 (dense)",
              "vendor headline"
            ],
            "rows": [
              [
                "A100 (SXM)",
                "19.5 TFLOP/s",
                "312 TFLOP/s",
                "312 (dense)"
              ],
              [
                "H100 (SXM)",
                "67.5 TFLOP/s",
                "989.5 TFLOP/s",
                "1979 (2:4 sparse)"
              ]
            ]
          }
        },
        {
          "callout": "Vendor headlines often quote the <strong>sparse</strong> (2:4) number: H100's famous 1979 TFLOP/s bf16 is sparse — dense is half (989.5). Divide by the wrong peak and your MFU looks artificially great or terrible. Also note bf16 ≫ fp32 throughput (≈15× on H100), which is half the reason to train in bf16.",
          "kind": "pitfall"
        },
        {
          "p": "MFU = achieved FLOP/s ÷ peak FLOP/s, ignoring communication and overhead. Large-batch, matmul-bound training reaches ~0.4–0.5; >0.5 is excellent. Small models, long context, or comms-heavy parallelism drag it to ~0.2–0.3. MFU cannot exceed 1."
        },
        {
          "math": "\\text{MFU} = \\frac{\\text{achieved FLOP/s}}{\\text{peak FLOP/s}}"
        },
        {
          "math": "T_{\\text{train}} \\approx \\frac{6ND}{n_{\\text{gpu}} \\times \\text{peak FLOP/s} \\times \\text{MFU}}"
        },
        {
          "code": "total_flops = 6 * 70e9 * 15e12           # 6ND = 6.3e24 FLOPs\nh100_bf16   = 1979e12 / 2                # dense; 1979 is the 2:4 sparse number\nthroughput  = 1024 * h100_bf16 * 0.5     # 1024 GPUs, MFU = 0.5\ndays = total_flops / throughput / 86400  # ~144 days (~5 months)",
          "lang": "python"
        },
        {
          "callout": "Worked example: a 70B model on 15T tokens is $6 \\cdot 70\\text{e}9 \\cdot 15\\text{e}12 = 6.3\\times10^{24}$ FLOPs. On 1024 H100s at 989.5 TFLOP/s × 0.5 MFU ≈ $5.1\\times10^{17}$ FLOP/s, that's ≈144 days. Doubling $N$ or $D$ doubles the bill; halving MFU doubles the time. Always run this before requesting a cluster.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "train-memory",
      "title": "The training memory budget",
      "blocks": [
        {
          "p": "Inference needs roughly the weights plus a KV cache. Training needs weights + gradients + optimizer state + every activation retained for the backward pass — which is why training memory <strong>≫</strong> inference memory for the same model."
        },
        {
          "table": {
            "head": [
              "Component",
              "fp32 naive",
              "mixed precision"
            ],
            "rows": [
              [
                "Parameters",
                "4",
                "2 (bf16)"
              ],
              [
                "Gradients",
                "4",
                "2 (bf16)"
              ],
              [
                "Adam m (1st moment)",
                "4",
                "4 (fp32)"
              ],
              [
                "Adam v (2nd moment)",
                "4",
                "4 (fp32)"
              ],
              [
                "fp32 master copy",
                "—",
                "4"
              ],
              [
                "Total (no activations)",
                "16 B/param",
                "16 B/param"
              ]
            ]
          }
        },
        {
          "callout": "Both columns total <strong>16 bytes/param</strong> — mixed precision does <em>not</em> cut steady-state memory; the fp32 master + Adam moments dominate either way (Rajbhandari et al. 2019). What bf16/fp8 buy is faster matmuls, not a smaller footprint. Real memory wins come from <strong>sharding</strong> (ZeRO / FSDP) and <strong>activation checkpointing</strong>.",
          "kind": "insight"
        },
        {
          "code": "num_parameters       = (D*D*num_layers) + D\nnum_gradients        = num_parameters\nnum_optimizer_states = 2 * num_parameters      # Adam: m and v\nnum_activations      = B * D * num_layers       # batch x seq x layers\n\n# naive float32: 4 bytes each\ntotal_bytes = 4 * (num_parameters + num_gradients +\n                   num_optimizer_states + num_activations)",
          "lang": "python"
        },
        {
          "p": "Activations are the wildcard: they scale with <em>batch × seq_len × layers × hidden</em>, independent of parameter count, and they're what makes long-context or large-batch training OOM. Activation checkpointing trades compute (an extra forward) for activation memory — the same $6ND \\to 8ND$ tradeoff from the previous section."
        },
        {
          "callout": "Napkin cap: on 8×H100 (80 GB each = 640 GB) with naive fp32 Adam at 16 bytes/param, the largest trainable model is $640\\text{e}9 / 16 \\approx 40$B params — <em>before</em> activations. That hard ceiling is precisely why FSDP/ZeRO sharding and bf16 storage exist.",
          "kind": "key"
        },
        {
          "p": "The mixed-precision recipe ties it together: keep params/grads in bf16 for fast matmuls, an fp32 master copy + fp32 moments for stable optimizer updates, and fp8 for the linear-layer GEMMs on H100-class hardware. You co-optimize precision, memory, and speed — never trade one silently for another."
        }
      ]
    }
  ],
  "takeaways": [
    "Memory = numel × bytes/element. fp32 = 4 B, fp16/bf16 = 2 B, fp8 = 1 B per element.",
    "bf16 trades mantissa (precision) for exponent (range): it shares fp32's range, so no underflow — why it beat fp16 as the training default.",
    "Matmul $A_{m\\times k}B_{k\\times n}$ costs $2mnk$ FLOPs; a linear layer's forward is $2 \\cdot \\text{tokens} \\cdot \\text{params}$.",
    "Backward = 2 matmuls/weight (weight grad + relayed input grad) = $4ND$; forward = $2ND$; training ≈ $6ND$, inference ≈ $2N$/token.",
    "MFU = achieved ÷ peak FLOP/s; realistic ~0.3–0.5. $T \\approx 6ND / (n_{\\text{gpu}} \\times \\text{peak} \\times \\text{MFU})$.",
    "Training memory ≈ 16 bytes/param (params + grads + Adam m/v + fp32 master) + activations ≫ inference; mixed precision speeds compute but doesn't shrink this — sharding and checkpointing do.",
    "A tensor is a pointer + stride: views share storage (free), copies cost memory + compute; transpose → non-contiguous → <code>.view()</code> fails until <code>.contiguous()</code>."
  ],
  "references": [
    {
      "label": "CS336 Lecture 2 trace (Percy Liang)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_02"
    },
    {
      "label": "Micikevicius et al. 2017 — Mixed Precision Training",
      "url": "https://arxiv.org/abs/1710.03740"
    },
    {
      "label": "Micikevicius et al. 2022 — FP8 Formats for Deep Learning",
      "url": "https://arxiv.org/abs/2209.05433"
    },
    {
      "label": "Rajbhandari et al. 2019 — ZeRO (16 bytes/param)",
      "url": "https://arxiv.org/abs/1910.02054"
    },
    {
      "label": "Kaplan et al. 2020 — Scaling laws (6ND)",
      "url": "https://arxiv.org/abs/2001.08361"
    },
    {
      "label": "Korthikanti et al. 2022 — Reducing Activation Recomputation",
      "url": "https://arxiv.org/abs/2205.05198"
    },
    {
      "label": "Casson 2023 — Transformer FLOPs accounting",
      "url": "https://www.adamcasson.com/posts/transformer-flops"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "dtypes",
      "q": "How many bytes per element do float32, bfloat16, and fp8 use, respectively?",
      "options": [
        "4, 2, 1",
        "8, 4, 2",
        "4, 4, 2",
        "2, 2, 1"
      ],
      "answer": 0,
      "explain": "float32 = 4 B, bfloat16 = 2 B (so is fp16), fp8 = 1 B. Memory = numel × bytes/element."
    },
    {
      "id": 2,
      "section": "dtypes",
      "q": "bfloat16 and float16 both use 16 bits. Relative to fp16, what does bf16 trade?",
      "options": [
        "More mantissa (precision) for fewer exponent bits (range)",
        "More exponent bits (range) for fewer mantissa bits (precision)",
        "Nothing — the two are bit-identical",
        "A sign bit that fp16 lacks"
      ],
      "answer": 1,
      "explain": "bf16 = 8 exponent / 7 mantissa (fp32's range); fp16 = 5 exponent / 10 mantissa. bf16 buys range at the cost of precision."
    },
    {
      "id": 3,
      "section": "dtypes",
      "q": "Why does torch.tensor([1e-8], dtype=torch.float16) round to 0 while bfloat16 keeps it?",
      "options": [
        "fp16 has no subnormal numbers",
        "It is a PyTorch rounding bug",
        "fp16's 5 exponent bits give a far smaller range, so 1e-8 underflows; bf16 shares fp32's range",
        "bf16 allocates more mantissa bits than fp16"
      ],
      "answer": 2,
      "explain": "fp16's smallest subnormal is ≈6e-8, so 1e-8 flushes to 0. bf16's fp32-like range (~1e-38) keeps it. Underflow → dead gradients / instability."
    },
    {
      "id": 4,
      "section": "memory",
      "q": "A GPT-3 feed-forward matrix has shape (4·12288, 12288). Its float32 footprint is closest to:",
      "options": [
        "150 MB",
        "600 MB",
        "19 GB",
        "2.3 GB"
      ],
      "answer": 3,
      "explain": "numel = 49152 × 12288 ≈ 6.0e8; × 4 bytes ≈ 2.3 GB. memory = numel × element_size — for a single matrix."
    },
    {
      "id": 5,
      "section": "compute",
      "q": "FLOPs to multiply A (m×k) by B (k×n)?",
      "options": [
        "2mnk",
        "mnk",
        "m·n·k + n",
        "2(m + n + k)"
      ],
      "answer": 0,
      "explain": "Each of the m·n outputs is a length-k dot product = k multiplies + k adds = 2k; total 2mnk. One multiply-add per (i, j, k) triple."
    },
    {
      "id": 6,
      "section": "compute",
      "q": "For a linear layer y = xW with x of shape (tokens, D) and W of shape (D, K), the forward FLOPs equal:",
      "options": [
        "2 · tokens · D",
        "2 · tokens · D · K (= 2 · tokens · #params)",
        "tokens · D · K",
        "6 · tokens · D · K"
      ],
      "answer": 1,
      "explain": "2 · tokens · (D·K) = 2 · (#tokens) · (#params). Forward ≈ 2ND — the seed of 6ND; generalizes to Transformers to first order."
    },
    {
      "id": 7,
      "section": "6ND",
      "q": "Why is the backward pass ≈2× the forward FLOPs (4ND vs 2ND)?",
      "options": [
        "It recomputes the entire forward pass",
        "Gradients are accumulated in fp64",
        "Each weight needs two matmuls — ∂L/∂W (weight grad) and ∂L/∂input (relay) — vs one in the forward",
        "The optimizer step is counted as backward FLOPs"
      ],
      "answer": 2,
      "explain": "Backprop does the weight-gradient matmul AND the input-gradient (relay) matmul per layer → 2 matmuls vs forward's 1 → 4ND vs 2ND."
    },
    {
      "id": 8,
      "section": "6ND",
      "q": "Total training compute for N params over D tokens ≈",
      "options": [
        "2ND",
        "4ND",
        "8ND",
        "6ND"
      ],
      "answer": 3,
      "explain": "Forward 2ND + backward 4ND = 6ND. (Full activation recomputation adds ~2ND, pushing effective cost toward 8ND.)"
    },
    {
      "id": 9,
      "section": "6ND",
      "q": "Inference (forward-only) costs about how many FLOPs per generated token?",
      "options": [
        "2N",
        "N",
        "6N",
        "N²"
      ],
      "answer": 0,
      "explain": "One forward ≈ 2 · params per token; no backward or optimizer. Training a token (~6N) is ~3× an inference forward."
    },
    {
      "id": 10,
      "section": "MFU",
      "q": "Model FLOPs Utilization (MFU) is defined as:",
      "options": [
        "peak ÷ achieved FLOP/s",
        "achieved ÷ peak (promised) FLOP/s",
        "FLOPs ÷ #parameters",
        "FLOP/s ÷ memory bandwidth"
      ],
      "answer": 1,
      "explain": "MFU = achieved/peak FLOP/s (ignoring comms/overhead). It measures how well kernels exploit the hardware; it cannot exceed 1."
    },
    {
      "id": 11,
      "section": "MFU",
      "q": "A realistic, healthy MFU for large-scale Transformer training is around:",
      "options": [
        "0.02–0.05",
        "0.9–1.0",
        "0.3–0.5",
        "1.5–2.0"
      ],
      "answer": 2,
      "explain": "Matmul-bound training reaches ~0.4–0.5; >0.5 is excellent. Comms, long context, or small models drag it to ~0.2–0.3."
    },
    {
      "id": 12,
      "section": "MFU",
      "q": "Estimated training time is best approximated by:",
      "options": [
        "6ND × n_gpu × peak × MFU",
        "6ND ÷ (n_gpu + peak + MFU)",
        "2ND ÷ (n_gpu × peak)",
        "6ND ÷ (n_gpu × peak_FLOP/s × MFU)"
      ],
      "answer": 3,
      "explain": "time = total FLOPs ÷ effective throughput = 6ND / (n_gpu × peak × MFU). E.g. 70B × 15T on 1024 H100 @ MFU 0.5 ≈ 144 days."
    },
    {
      "id": 13,
      "section": "memory",
      "q": "Training with naive fp32 Adam costs how many bytes per parameter (params + grad + optimizer), ignoring activations?",
      "options": [
        "16",
        "2",
        "4",
        "8"
      ],
      "answer": 0,
      "explain": "4 (param) + 4 (grad) + 4 (Adam m) + 4 (Adam v) = 16. So 8×H100 (640 GB) caps a naive model near 40B params before activations."
    },
    {
      "id": 14,
      "section": "memory",
      "q": "Why is training memory ≫ inference memory for the same model?",
      "options": [
        "Training uses fp64 everywhere",
        "Training adds gradients, optimizer state (m, v, fp32 master), and activations stored for backprop; inference needs ~weights (+ KV cache)",
        "Inference duplicates the model per generated token",
        "Training disables the KV cache"
      ],
      "answer": 1,
      "explain": "Inference ≈ weights (+ KV cache). Training adds grads + Adam states + all retained activations → many× the weight bytes plus activations."
    },
    {
      "id": 15,
      "section": "memory",
      "q": "In mixed-precision training you keep an fp32 master copy of the weights. Its main benefit is:",
      "options": [
        "It halves total training memory",
        "It removes the need to store gradients",
        "It enables fast bf16/fp8 matmuls with stable fp32 optimizer updates — without saving memory",
        "It eliminates activation memory"
      ],
      "answer": 2,
      "explain": "bf16 storage + fp32 master/moments still totals ~16 bytes/param — no memory win. The benefit is throughput; memory wins come from sharding and checkpointing."
    },
    {
      "id": 16,
      "section": "views",
      "q": "After y = x.transpose(1, 0), calling y.view(2, 3) raises an error because:",
      "options": [
        "transpose eagerly copies the data",
        "view() only works on 1-D tensors",
        "x and y stopped sharing storage",
        "The transpose is non-contiguous, so a view with that shape/stride needs .contiguous() first"
      ],
      "answer": 3,
      "explain": "transpose returns a non-contiguous view (shared storage). .view() needs compatible strides; call .contiguous() first (which copies). Views are free; copies cost memory + compute."
    }
  ]
});
