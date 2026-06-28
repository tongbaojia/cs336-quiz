/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 6,
  "estMinutes": 20,
  "topics": [
    "Triton",
    "kernel fusion",
    "FlashAttention",
    "online softmax",
    "memory-bound"
  ],
  "overview": "Most of a Transformer's wall-clock time is spent <em>moving bytes</em>, not multiplying them: every non-matmul op (GeLU, softmax, LayerNorm) is <strong>memory-bound</strong>. This lecture closes the gap between the programming model and the silicon — benchmark and profile to find the bottleneck, then write <strong>fused kernels</strong> (in CUDA, and especially <strong>Triton</strong>) that keep data in SRAM — culminating in <strong>FlashAttention</strong>, which tiles attention and streams the softmax so the \\(N \\times N\\) score matrix never touches HBM.",
  "sections": [
    {
      "id": "why-kernels",
      "title": "Why write kernels at all",
      "blocks": [
        {
          "p": "A GPU is a warehouse of slow-but-huge memory (HBM/DRAM) feeding a tiny-but-fast factory floor (registers + SRAM). A kernel's cost is dominated by how many times data crosses that gap, not by the arithmetic itself. The diagnostic is <strong>arithmetic intensity</strong>:"
        },
        {
          "p": "\\(\\text{intensity} = \\dfrac{\\#\\text{FLOPs}}{\\#\\text{bytes moved}}\\). High intensity ⇒ the op keeps the ALUs busy per byte fetched (<em>compute-bound</em>, good). Low intensity ⇒ the op starves waiting on bandwidth (<em>memory-bound</em>, bad)."
        },
        {
          "callout": "<strong>The one rule:</strong> matrix multiply is compute-bound (it has \\(O(N)\\) reuse per element and hits the tensor cores); essentially <em>everything else</em> — elementwise activations, softmax, normalization, dropout — is memory-bound. So for non-matmul ops the lever is <strong>data movement</strong>, not FLOP count.",
          "kind": "key"
        },
        {
          "table": {
            "head": [
              "Level",
              "A100 size",
              "Role / speed"
            ],
            "rows": [
              [
                "Registers",
                "per-thread",
                "fastest, private to a thread"
              ],
              [
                "L1 / shared memory",
                "192KB per SM (≈164KB shared)",
                "on-chip SRAM, ~10× faster than DRAM"
              ],
              [
                "L2 cache",
                "40MB",
                "on-chip, shared across the 108 SMs"
              ],
              [
                "DRAM (HBM)",
                "80GB",
                "huge but slow — the usual bottleneck"
              ]
            ]
          }
        },
        {
          "h": "Fusion: read once, compute, write once"
        },
        {
          "p": "If you compute an activation as a chain of PyTorch ops, each op is its own CUDA kernel that reads its input from HBM and writes its output back — one round-trip per op. <strong>Fusing</strong> the chain into a single kernel keeps every intermediate on-chip and pays just one read and one write. (Horace He's warehouse/factory analogy.)"
        },
        {
          "code": "def manual_gelu(x):\n    # 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 x^3)))\n    return 0.5 * x * (1 + torch.tanh(0.79788456 * (x + 0.044715 * x * x * x)))\n\n# Each *, +, tanh is a separate CUDA kernel: ~5 HBM round-trips for one activation.",
          "lang": "python"
        },
        {
          "callout": "Fusion changes <em>zero</em> FLOPs yet wins big: the built-in (fused) <code>F.gelu</code> calls one kernel and is dramatically faster than the hand-written multi-op <code>manual_gelu</code>, which the profiler shows dispatching a separate elementwise kernel for every operator. Same math, a fraction of the memory traffic.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "benchmark-profile",
      "title": "Benchmark, then profile",
      "blocks": [
        {
          "p": "Spec sheets are marketing; real performance depends on your library version, hardware, and workload. There is no substitute for measuring. <strong>Benchmarking</strong> answers <em>how long?</em> (and how it scales); <strong>profiling</strong> answers <em>where did the time go?</em>"
        },
        {
          "h": "Benchmarking"
        },
        {
          "code": "def benchmark(description, run, num_warmups=1, num_trials=3):\n    for _ in range(num_warmups):      # pay one-time JIT / caching / autotune costs\n        run()\n    if torch.cuda.is_available():\n        torch.cuda.synchronize()      # CUDA is async -- wait for the GPU\n    times = []\n    for trial in range(num_trials):   # repeat to capture variance\n        start = time.time()\n        run()\n        if torch.cuda.is_available():\n            torch.cuda.synchronize()  # do NOT time just the kernel launch\n        times.append((time.time() - start) * 1000)\n    return mean(times)",
          "lang": "python"
        },
        {
          "callout": "Kernel launches are <strong>asynchronous</strong>: the CPU enqueues work and returns immediately. Omit <code>torch.cuda.synchronize()</code> and you time the launch, not the execution — getting absurdly fast, meaningless numbers. Always warm up first (the first call pays JIT/caching/autotune costs) and synchronize before reading the clock.",
          "kind": "pitfall"
        },
        {
          "h": "Profiling"
        },
        {
          "p": "PyTorch's profiler shows which CUDA kernels actually fire. The names are informative: <code>cutlass_80_simt_sgemm_256x128_8x4_nn_align1</code> tells you it dispatched a CUTLASS SGEMM with a 256×128 tile. Different input shapes route to different kernels; <code>manual_gelu</code> shows many tiny elementwise kernels while <code>F.gelu</code> shows one."
        },
        {
          "callout": "Compute-bound vs memory-bound is the lens for reading a profile: a matmul that lands on a well-tiled CUTLASS/tensor-core kernel is near peak FLOPs; a fused-vs-unfused activation differs only in kernel <em>count</em> (HBM traffic). Optimize the bound that actually binds.",
          "kind": "note"
        }
      ]
    },
    {
      "id": "options",
      "title": "Five ways to write a kernel",
      "blocks": [
        {
          "p": "There is a spectrum from \"write nothing\" to \"write everything,\" trading control for effort. The same GeLU can be expressed five ways; the right choice depends on whether you need fusion the compiler won't find."
        },
        {
          "table": {
            "head": [
              "Approach",
              "Level",
              "You control",
              "Automated for you"
            ],
            "rows": [
              [
                "PyTorch eager",
                "Python op dispatch",
                "nothing",
                "everything — but unfused"
              ],
              [
                "torch.compile",
                "Python → Triton",
                "graph capture",
                "fusion + codegen"
              ],
              [
                "Triton",
                "Python, block-level JIT",
                "grid, BLOCK, tiles, masks",
                "coalescing, shared mem, intra-SM sched"
              ],
              [
                "CUDA / C++",
                "C++ ext (load_inline)",
                "threads, shared mem, sync — all of it",
                "almost nothing"
              ],
              [
                "CUTLASS",
                "C++ templates",
                "GEMM/conv tiling primitives",
                "tuned tensor-core MMA pipelines"
              ],
              [
                "ThunderKittens",
                "C++/CUDA tile DSL",
                "16×16 tile ops, warp/block",
                "tensor-core pipelining"
              ]
            ]
          }
        },
        {
          "p": "<strong>CUDA</strong> is C/C++ plus GPU APIs; <code>load_inline</code> compiles a kernel string and binds it to Python. You write code for one thread using <code>(blockIdx, blockDim, threadIdx)</code>. Elementwise ops are easy; anything that reads multiple values (matmul, softmax, RMSNorm) forces you to manage shared memory and synchronization by hand."
        },
        {
          "p": "<strong>Triton</strong> (OpenAI, 2021) raises the abstraction from threads to <em>blocks</em>: you think in tiles, write Python, and the compiler can match or even beat PyTorch's hand-tuned kernels — while letting you step through the kernel in a Python interpreter for debugging."
        },
        {
          "table": {
            "head": [
              "Task",
              "CUDA",
              "Triton"
            ],
            "rows": [
              [
                "Memory coalescing (DRAM transfer)",
                "manual",
                "automatic"
              ],
              [
                "Shared-memory management",
                "manual",
                "automatic"
              ],
              [
                "Scheduling within SMs",
                "manual",
                "automatic"
              ],
              [
                "Scheduling across SMs (the grid)",
                "manual",
                "manual"
              ]
            ]
          }
        },
        {
          "callout": "These collapse into each other: <code>torch.compile</code> codegens <em>Triton</em>; CUTLASS is what NVIDIA's GEMM libraries are built from; tile-DSLs like ThunderKittens target the tensor cores directly. Triton sits in the sweet spot — Python ergonomics, block-level control, but you still choose the grid (how blocks map across SMs).",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "triton-model",
      "title": "The Triton programming model",
      "blocks": [
        {
          "p": "A Triton kernel is launched over a <strong>grid</strong> of programs; each program (≈ a thread block) gets its <code>program_id</code>, computes a vector of <code>offsets</code> into the tensor, builds a <code>mask</code> for the ragged tail, then <code>tl.load</code> → compute → <code>tl.store</code>. You never touch individual threads."
        },
        {
          "code": "def triton_gelu(x):\n    y = torch.empty_like(x)\n    n = x.numel()\n    block_size = 1024                                  # threads per block\n    num_blocks = triton.cdiv(n, block_size)            # the GRID\n    triton_gelu_kernel[(num_blocks,)](x, y, n, BLOCK_SIZE=block_size)\n    return y\n\n@triton.jit\ndef triton_gelu_kernel(x_ptr, y_ptr, num_elements, BLOCK_SIZE: tl.constexpr):\n    pid = tl.program_id(axis=0)                        # which block am I?\n    offsets = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)\n    mask = offsets < num_elements                      # guard ragged last block\n    x = tl.load(x_ptr + offsets, mask=mask)            # HBM -> SRAM (once)\n    a = 0.79788456 * (x + 0.044715 * x * x * x)\n    exp = tl.exp(2 * a)\n    tanh = (exp - 1) / (exp + 1)                       # tl.tanh didn't exist\n    y = 0.5 * x * (1 + tanh)\n    tl.store(y_ptr + offsets, y, mask=mask)            # SRAM -> HBM (once)",
          "lang": "python"
        },
        {
          "list": [
            "<strong>grid</strong> <code>(num_blocks,)</code>: how many programs to launch — you size it via <code>triton.cdiv</code>.",
            "<strong>program_id</strong>: this block's index in the grid; the basis for its slice.",
            "<strong>offsets</strong> = <code>pid*BLOCK + tl.arange(0, BLOCK)</code>: the vector of elements this block owns.",
            "<strong>mask</strong>: disables out-of-bounds lanes when size isn't a multiple of <code>BLOCK_SIZE</code>.",
            "<strong>tl.load / tl.store</strong>: the <em>only</em> HBM traffic — everything between them lives on-chip."
          ],
          "ordered": true
        },
        {
          "h": "From elementwise to reductions: fused softmax"
        },
        {
          "p": "Softmax normalizes each row, so it must read the whole row to get the max and the sum. The naive PyTorch version pays for that in memory traffic — count the reads/writes:"
        },
        {
          "code": "def manual_softmax(x):                 # x: (M rows, N cols)\n    M, N = x.shape\n    x_max = x.max(dim=1)[0]            # MN reads,  M writes\n    x = x - x_max[:, None]            # MN+M reads, MN writes\n    numerator = torch.exp(x)          # MN reads,  MN writes\n    denom = numerator.sum(dim=1)      # MN reads,  M writes\n    y = numerator / denom[:, None]    # MN reads,  MN writes\n    return y\n    # total: 5MN+M reads, 3MN+2M writes -- ideal is MN/MN (~4x too much traffic)",
          "lang": "python"
        },
        {
          "p": "The fix: launch <strong>one program per row</strong> with <code>BLOCK_SIZE = next_power_of_2(N)</code> so the entire row fits in SRAM. Max, exponentiate, sum, and normalize all happen on-chip — one HBM read in, one write out."
        },
        {
          "code": "@triton.jit\ndef triton_softmax_kernel(x_ptr, y_ptr, x_row_stride, y_row_stride,\n                          num_cols, BLOCK_SIZE: tl.constexpr):\n    row = tl.program_id(0)                              # one program == one row\n    col = tl.arange(0, BLOCK_SIZE)                      # BLOCK_SIZE >= N\n    x_ptrs = x_ptr + row * x_row_stride + col\n    x_row = tl.load(x_ptrs, mask=col < num_cols, other=float(\"-inf\"))\n    x_row = x_row - tl.max(x_row, axis=0)              # safe softmax (subtract max)\n    num = tl.exp(x_row)\n    y_row = num / tl.sum(num, axis=0)                  # whole row stays in SRAM\n    y_ptrs = y_ptr + row * y_row_stride + col\n    tl.store(y_ptrs, y_row, mask=col < num_cols)",
          "lang": "python"
        },
        {
          "callout": "Keeping the row resident collapses the naive 5MN+M reads / 3MN+2M writes toward the ideal MN/MN — roughly a <strong>4× cut in memory traffic</strong>, which is the whole speedup since softmax is memory-bound. A well-written Triton kernel here can outrun the stock PyTorch op.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "tiling",
      "title": "Tiling and shared memory",
      "blocks": [
        {
          "p": "Softmax worked because a row fits in SRAM. Matmul and attention don't — the operands are too big — so you need <strong>tiling</strong>: chop the problem into blocks small enough to stage in shared memory, reuse them, and accumulate partial results."
        },
        {
          "p": "Shared memory is ~10× faster than DRAM but tiny (≈164KB per block) and shared by all threads in a block. The payoff is <strong>data reuse</strong>: in \\(C = A B\\), output elements \\(C_{i,j}\\) and \\(C_{i,j+1}\\) both need the same row of \\(A\\), so loading it once into SRAM amortizes the cost across the whole tile."
        },
        {
          "h": "Tiled matmul"
        },
        {
          "list": [
            "Partition \\(A\\), \\(B\\), \\(C\\) into blocks.",
            "For each pair of blocks: load the \\(A\\)-block and \\(B\\)-block from HBM into shared memory.",
            "Do the mini matrix-multiply on-chip and accumulate into the running partial sum.",
            "Write the finished \\(C\\)-block out once."
          ],
          "ordered": true
        },
        {
          "p": "Naive matmul costs \\(MKN\\) reads; tiling drops that toward \\(MK + KN\\) by reuse. Going further, the <em>order</em> in which you walk the output blocks affects L2 reuse — a grouped (L2-aware) ordering can load 54 blocks where a row-major sweep loads 90."
        },
        {
          "callout": "<strong>Tiling = stage-in-SRAM-and-reuse.</strong> It is one of the two ingredients (the other is the online softmax in the next section) that combine to give FlashAttention. Hold this idea: never re-read from HBM what you can keep on-chip.",
          "kind": "key"
        }
      ]
    },
    {
      "id": "online-softmax",
      "title": "Online (streaming) softmax",
      "blocks": [
        {
          "p": "Plain softmax needs two passes over the row: one to find the max and total, one to normalize. For attention that row is a length-\\(N\\) score vector you'd rather never store. Can we compute softmax in a <strong>single streaming pass</strong>, updating as each new value arrives?"
        },
        {
          "p": "Yes — the <em>online</em> softmax (Milakov &amp; Gimelshein, 2018) keeps two running scalars per row: the max \\(m\\) and the denominator \\(d = \\sum e^{x - m}\\). As each new \\(x_i\\) arrives:"
        },
        {
          "math": "m_i = \\max\\!\\left(m_{i-1},\\ x_i\\right), \\qquad d_i = d_{i-1}\\, e^{\\,m_{i-1} - m_i} \\,+\\, e^{\\,x_i - m_i}"
        },
        {
          "callout": "<strong>The online softmax is the key trick.</strong> A reduction that normally needs the whole row first can be folded into a single left-to-right pass — which means you can tile the row, process one block at a time, and still get the exact softmax. This is precisely what makes streaming attention possible.",
          "kind": "insight"
        },
        {
          "p": "After the last element the softmax is exact: \\(y_i = e^{\\,x_i - m_N} / d_N\\). No second pass and no materialized row — just two scalars carried along."
        },
        {
          "callout": "The rescaling factor \\(e^{\\,m_{i-1}-m_i}\\) is not optional. Every earlier term was exponentiated against the <em>old</em> max; when a new value raises the max to \\(m_i\\) you must multiply the running denominator (and, in attention, the running output) by \\(e^{\\,m_{i-1}-m_i}\\) to rebase them. Skip it and the normalization is wrong; drop the max-subtraction entirely and large logits overflow \\(e^{x}\\) to inf/NaN in fp16. Softmax is shift-invariant, so subtracting the max is exact — and mandatory for stability.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "flashattention",
      "title": "FlashAttention: attention without the N×N",
      "blocks": [
        {
          "p": "Standard attention computes \\(S = QK^\\top\\) (an \\(N \\times N\\) matrix), softmaxes it, then multiplies by \\(V\\). Materializing \\(S\\) and the probabilities in HBM costs \\(O(N^2)\\) memory and, worse, \\(O(N^2)\\) HBM reads/writes — and since attention is memory-bound, that IO <em>is</em> the runtime."
        },
        {
          "p": "<strong>FlashAttention</strong> (Dao et al., 2022) fuses the whole thing into one kernel. Tile \\(Q\\), \\(K\\), \\(V\\) into blocks; for each \\(Q\\)-block, loop over \\(K/V\\)-blocks, computing one score tile \\(S_j\\) at a time in SRAM and folding it into a running output \\(O\\) via the online softmax stats \\((m, \\ell)\\). The \\(N \\times N\\) matrix is never written to HBM:"
        },
        {
          "math": "m^{\\text{new}} = \\max\\!\\big(m,\\ \\mathrm{rowmax}(S_j)\\big), \\qquad \\ell^{\\text{new}} = e^{\\,m - m^{\\text{new}}}\\,\\ell \\,+\\, \\mathrm{rowsum}\\!\\big(e^{\\,S_j - m^{\\text{new}}}\\big)"
        },
        {
          "math": "O^{\\text{new}} = e^{\\,m - m^{\\text{new}}}\\, O \\;+\\; e^{\\,S_j - m^{\\text{new}}}\\, V_j, \\qquad S_j = Q\\,K_j^{\\top}"
        },
        {
          "table": {
            "head": [
              "",
              "Standard attention",
              "FlashAttention"
            ],
            "rows": [
              [
                "N×N scores in HBM",
                "materialized",
                "never (tiles live in SRAM)"
              ],
              [
                "Extra memory",
                "O(N²)",
                "O(N)"
              ],
              [
                "HBM accesses",
                "Θ(N² + Nd)",
                "Θ(N²d²/M) — far fewer"
              ],
              [
                "Backward pass",
                "reuse stored N×N",
                "recompute from Q,K,V + (m, ℓ)"
              ],
              [
                "Exact?",
                "yes",
                "yes — not an approximation"
              ]
            ]
          }
        },
        {
          "p": "The backward pass would normally need the saved \\(N \\times N\\) probabilities. FlashAttention instead stores only \\(O\\) and the per-row logsumexp, then <strong>recomputes</strong> the score and probability tiles on the fly from \\(Q, K, V\\). That trades extra matmul FLOPs for memory — a good deal because attention is memory-bound, so the recompute is hidden behind the IO it saves."
        },
        {
          "callout": "FlashAttention is both <strong>faster and more memory-efficient</strong> precisely because it is <em>IO-aware</em>: it does <em>more</em> FLOPs (recomputation) yet fewer HBM accesses, and HBM is the bottleneck. FlashAttention-2 (2023) rebalanced the work partitioning for ~2× more throughput (50–73% of A100 fp16 peak); FlashAttention-3 (2024) exploits Hopper async + FP8. This kernel is what makes long-context training/inference (Llama, etc.) practical.",
          "kind": "connection"
        }
      ]
    }
  ],
  "takeaways": [
    "Matmul is compute-bound; nearly everything else (GeLU, softmax, norm) is memory-bound — so the lever is <strong>data movement</strong>, not FLOPs.",
    "Kernel fusion changes no FLOPs but keeps intermediates in registers/SRAM, paying one HBM read + one write instead of a round-trip per op.",
    "Always benchmark with warmup + <code>torch.cuda.synchronize()</code> (CUDA is async), then profile to see which CUDA kernels actually run.",
    "Triton works at the <strong>block</strong> level: you pick grid/BLOCK/masks and call <code>tl.load</code>/<code>tl.store</code>; it automates coalescing, shared memory, and intra-SM scheduling — only cross-SM scheduling stays manual.",
    "Online softmax keeps a running (max, denominator) and rescales by \\(e^{m-m'}\\) — a one-pass, numerically stable reduction that lets you tile the row.",
    "FlashAttention = tiling + online softmax: never materialize the \\(N \\times N\\) scores ⇒ O(N) memory; recompute in the backward pass ⇒ IO-aware and faster despite extra FLOPs.",
    "torch.compile increasingly codegens Triton automatically — write kernels by hand for the fusions it misses."
  ],
  "references": [
    {
      "label": "CS336 Lecture 6 trace — Kernels & Triton (Tatsu Hashimoto)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_06"
    },
    {
      "label": "Tillet et al. 2019 — Triton: an IR & compiler for tiled neural-net kernels",
      "url": "https://www.eecs.harvard.edu/~htk/publication/2019-mapl-tillet-kung-cox.pdf"
    },
    {
      "label": "Triton tutorial — fused softmax",
      "url": "https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html"
    },
    {
      "label": "Dao et al. 2022 — FlashAttention: fast & memory-efficient exact attention",
      "url": "https://arxiv.org/abs/2205.14135"
    },
    {
      "label": "Dao 2023 — FlashAttention-2: better parallelism & work partitioning",
      "url": "https://arxiv.org/abs/2307.08691"
    },
    {
      "label": "Shah et al. 2024 — FlashAttention-3 (Hopper, async, FP8)",
      "url": "https://arxiv.org/abs/2407.08608"
    },
    {
      "label": "Milakov & Gimelshein 2018 — Online normalizer calculation for softmax",
      "url": "https://arxiv.org/abs/1805.02867"
    },
    {
      "label": "Horace He — Making Deep Learning Go Brrrr From First Principles",
      "url": "https://horace.io/brrr_intro.html"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Why kernels",
      "q": "Why are most non-matmul ops (GeLU, softmax, LayerNorm) memory-bound?",
      "options": [
        "They have low arithmetic intensity (few FLOPs per byte), so HBM bandwidth — not compute — is the limit",
        "They execute more FLOPs than a same-size matmul",
        "They cannot be split across thread blocks",
        "They must run in fp64"
      ],
      "answer": 0,
      "explain": "Arithmetic intensity = FLOPs/byte. These ops move a lot of data per FLOP, so bandwidth binds; only matmul has enough reuse to be compute-bound."
    },
    {
      "id": 2,
      "section": "Why kernels",
      "q": "The primary win from kernel fusion is:",
      "options": [
        "It lowers the total number of arithmetic operations",
        "It keeps intermediates in registers/SRAM, avoiding extra HBM reads/writes",
        "It increases the numerical precision of the result",
        "It lets elementwise ops use the tensor cores"
      ],
      "answer": 1,
      "explain": "Fusion doesn't cut FLOPs — it cuts memory traffic. One kernel reads inputs once, computes the chain on-chip, writes once, instead of an HBM round-trip per op."
    },
    {
      "id": 3,
      "section": "Why kernels",
      "q": "Using arithmetic intensity (FLOPs/byte) to classify operations, which statement is correct?",
      "options": [
        "Higher intensity means more memory-bound",
        "Matmul is the canonical memory-bound op; elementwise ops are compute-bound",
        "Matmul is compute-bound (high reuse); softmax/GeLU/norm are memory-bound (low reuse)",
        "Intensity is independent of the operation"
      ],
      "answer": 2,
      "explain": "The lecture's rule of thumb: matrix multiply is compute-bound, essentially everything else is memory-bound."
    },
    {
      "id": 4,
      "section": "Benchmarking",
      "q": "Why must you call <code>torch.cuda.synchronize()</code> before reading the stop time?",
      "options": [
        "It flushes the L2 cache between trials",
        "It reseeds the RNG so trials are comparable",
        "It forces fp32 accumulation for stable timing",
        "CUDA kernel launches are asynchronous; without it you measure only launch overhead, not execution"
      ],
      "answer": 3,
      "explain": "The CPU enqueues kernels and returns immediately. synchronize() blocks until the GPU finishes, so the timer captures real execution."
    },
    {
      "id": 5,
      "section": "Profiling",
      "q": "Profiling <code>manual_gelu</code> against the built-in <code>F.gelu</code> reveals that:",
      "options": [
        "<code>manual_gelu</code> launches many elementwise kernels (an HBM round-trip each), while <code>F.gelu</code> calls one fused kernel",
        "Both bottom out in a single fused CUDA kernel",
        "<code>F.gelu</code> is slower because fusion adds overhead",
        "<code>manual_gelu</code> runs on the tensor cores and <code>F.gelu</code> does not"
      ],
      "answer": 0,
      "explain": "Each Python-level op (mul, add, tanh, …) dispatches its own kernel with its own HBM read+write; the fused op does it in a single pass."
    },
    {
      "id": 6,
      "section": "Options",
      "q": "Where does Triton sit between PyTorch and raw CUDA?",
      "options": [
        "Below PTX — you emit machine code by hand",
        "A Python, block-level JIT DSL: you choose grid/BLOCK/tiles/masks while it auto-handles coalescing, shared memory, and intra-SM scheduling",
        "A thin wrapper that calls cuBLAS with zero user code",
        "A CPU-only autodiff framework"
      ],
      "answer": 1,
      "explain": "Triton raises the abstraction from threads to blocks/tiles, automating the fiddly memory choreography while still expressing fused kernels in Python."
    },
    {
      "id": 7,
      "section": "Options",
      "q": "Which mapping of kernel-authoring tools is correct?",
      "options": [
        "CUTLASS is OpenAI's Python kernel DSL",
        "ThunderKittens compiles Python to PTX just like Triton",
        "CUTLASS = NVIDIA C++ templates for GEMM/conv; ThunderKittens = tile-based C++/CUDA DSL; Triton = Python block-level JIT",
        "CUDA and CUTLASS are the same API"
      ],
      "answer": 2,
      "explain": "They span a spectrum — C++ templates (CUTLASS) → tile DSL (ThunderKittens) → Python JIT (Triton) — all aiming to make high-utilization kernels easier than raw CUDA."
    },
    {
      "id": 8,
      "section": "Options",
      "q": "Compared with CUDA, which task does Triton still leave to you (NOT automated)?",
      "options": [
        "Coalescing DRAM transfers",
        "Shared-memory management",
        "Scheduling within an SM",
        "Scheduling thread blocks across SMs (choosing the grid)"
      ],
      "answer": 3,
      "explain": "Triton automates coalescing, shared memory, and intra-SM scheduling; you still pick the grid — how blocks map across SMs."
    },
    {
      "id": 9,
      "section": "Triton",
      "q": "Inside a Triton kernel, what does <code>tl.program_id(axis=0)</code> return?",
      "options": [
        "The index of this program (block) within the launch grid",
        "The per-thread lane index within the block",
        "The number of SMs on the device",
        "A pointer to the start of the input tensor"
      ],
      "answer": 0,
      "explain": "Triton's unit of execution is the program/block; program_id tells a block which slice of the grid it owns, from which it derives its offsets."
    },
    {
      "id": 10,
      "section": "Triton",
      "q": "What is the role of <code>mask = offsets &lt; num_elements</code> in <code>tl.load</code>/<code>tl.store</code>?",
      "options": [
        "It selects which SM the block runs on",
        "It disables out-of-bounds lanes when the array size isn't a multiple of BLOCK_SIZE",
        "It applies dropout to the activations",
        "It improves memory coalescing"
      ],
      "answer": 1,
      "explain": "The last block is usually ragged; the mask prevents reads/writes past the end (and supplies a safe 'other' value such as -inf)."
    },
    {
      "id": 11,
      "section": "Triton",
      "q": "The fused softmax kernel launches one program per row with <code>BLOCK_SIZE = next_power_of_2(N)</code>. Why one row per block?",
      "options": [
        "Because a block can hold at most 32 threads",
        "To route the reduction through the tensor cores",
        "Rows are independent and a full row fits in SRAM, so max+exp+sum+normalize run on-chip with no cross-block sync and one HBM read/write",
        "Because columns must be reduced sequentially across blocks"
      ],
      "answer": 2,
      "explain": "Keeping the row resident in SRAM collapses the naive 5MN+M reads / 3MN+2M writes toward the ideal MN/MN (~4× less traffic)."
    },
    {
      "id": 12,
      "section": "Tiling",
      "q": "In tiled matrix multiply, staging blocks of \\(A\\) and \\(B\\) in shared memory helps because:",
      "options": [
        "it reduces the number of multiply-adds",
        "shared memory is larger than DRAM",
        "it lets you skip the inner-product loop",
        "each loaded tile is reused across many output elements, cutting redundant DRAM reads (data reuse)"
      ],
      "answer": 3,
      "explain": "C[i,j] and C[i,j+1] share a row of A; staging tiles in fast shared memory amortizes each DRAM load over the whole tile instead of re-reading HBM."
    },
    {
      "id": 13,
      "section": "Online softmax",
      "q": "Streaming (online) softmax tracks a running max \\(m\\) and denominator \\(d\\). When a new value pushes the max to $m'$, you must:",
      "options": [
        "rescale the old denominator by \\(e^{m-m'}\\) before adding the new \\(e^{x-m'}\\) term",
        "reset \\(d\\) to 0 and start over",
        "multiply \\(d\\) by the new value \\(x\\)",
        "leave \\(d\\) unchanged"
      ],
      "answer": 0,
      "explain": "Earlier terms were exponentiated against the old max; shifting the reference to m' requires multiplying the accumulator by e^{m-m'} so every term shares one baseline."
    },
    {
      "id": 14,
      "section": "Online softmax",
      "q": "Why subtract the row max before exponentiating in softmax (and its online form)?",
      "options": [
        "It sharpens the softmax distribution",
        "Numerical stability: large logits overflow \\(e^{x}\\); subtracting the max keeps every exponent \\(\\le 0\\)",
        "It halves the memory footprint",
        "It is what makes softmax differentiable"
      ],
      "answer": 1,
      "explain": "Softmax is shift-invariant, so subtracting the max is exact; it bounds the exponentials in (0,1] and avoids inf/NaN in fp16/fp32."
    },
    {
      "id": 15,
      "section": "FlashAttention",
      "q": "What is FlashAttention's central idea?",
      "options": [
        "Approximate attention with a low-rank factorization of the scores",
        "Keep the full \\(N \\times N\\) attention matrix resident in SRAM",
        "Tile \\(Q,K,V\\) and fold an online softmax into the loop so the \\(N \\times N\\) score matrix is never written to HBM — giving O(N) memory",
        "Replace softmax with ReLU to avoid exponentials"
      ],
      "answer": 2,
      "explain": "It's an exact, IO-aware algorithm: score tiles live only in SRAM and running (m, ℓ) stats carry the softmax across tiles, so HBM never holds an N×N tensor."
    },
    {
      "id": 16,
      "section": "FlashAttention",
      "q": "How does FlashAttention's backward pass avoid storing the forward \\(N \\times N\\) attention matrix?",
      "options": [
        "It approximates gradients with finite differences",
        "It caches the full matrix in DRAM after all",
        "It cannot compute gradients, so attention is frozen",
        "It recomputes the score/probability tiles on the fly from stored \\(Q,K,V\\) and the per-row \\((m,\\ell)\\) stats, trading FLOPs for memory and HBM traffic"
      ],
      "answer": 3,
      "explain": "Recomputation is cheap because attention is memory-bound: the extra matmuls cost less wall-clock than the HBM IO they save, so FlashAttention is both faster and far more memory-efficient."
    }
  ]
});
