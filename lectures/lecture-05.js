/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 5,
  "estMinutes": 20,
  "topics": [
    "roofline",
    "memory hierarchy",
    "tensor cores",
    "tiling",
    "FlashAttention"
  ],
  "overview": "There is no LLM scaling without GPU scaling. This lecture demystifies the GPU: the <strong>execution model</strong> (SMs, warps, the CUDA hierarchy), the <strong>memory hierarchy</strong> (registers → SRAM → L2 → HBM), and the one number that governs kernel design — <em>arithmetic intensity</em> against the <strong>roofline</strong>. The payoff is understanding why fusion, tiling, and FlashAttention are fast.",
  "sections": [
    {
      "id": "why-gpus",
      "title": "Why GPUs run the show",
      "blocks": [
        {
          "p": "Compute buys predictable capability gains (Kaplan et al. scaling laws), so the cheapest path to a better model is often more/better-utilized FLOPs. The catch: classic single-thread <em>Dennard scaling</em> (frequency × density at constant power) tapped out in the mid-2000s. What kept compute doubling is <strong>parallel</strong> scaling — GPU throughput has grown &gt;1000× in ~10 years (Dally, HotChips). The course's blunt framing: <strong>no LLM scaling without GPU scaling</strong>."
        },
        {
          "p": "The goal of this lecture is to make CUDA less magical: know <em>when</em> a GPU goes slow and <em>how</em> to write algorithms that don't. That requires understanding two things the GPU is built around — massive thread parallelism and a steep memory hierarchy."
        },
        {
          "h": "CPU vs GPU: latency vs throughput"
        },
        {
          "p": "A CPU spends its transistor budget making a <em>few</em> threads finish fast: deep caches, branch predictors, out-of-order execution. A GPU spends the same budget on <em>many</em> tiny ALUs and almost no per-lane control, hiding latency not with caches but by having thousands of threads ready to swap in. CPUs optimize <strong>latency</strong>; GPUs optimize <strong>throughput</strong>."
        },
        {
          "table": {
            "head": [
              "",
              "CPU",
              "GPU"
            ],
            "rows": [
              [
                "Optimize for",
                "latency — finish one thread fast",
                "throughput — total work per second"
              ],
              [
                "Cores",
                "few, fat (OoO, big caches, branch pred.)",
                "thousands of tiny ALUs (SPs) + tensor cores"
              ],
              [
                "Hides latency by",
                "caches + speculation",
                "swapping among many resident warps"
              ],
              [
                "Best at",
                "branchy serial code",
                "regular, data-parallel matmul"
              ]
            ]
          }
        },
        {
          "callout": "The whole lecture in one sentence: <strong>compute (especially matmul) has scaled far faster than memory bandwidth</strong>, so making GPUs fast is mostly about respecting the memory hierarchy and <em>minimizing data movement</em>.",
          "kind": "key"
        }
      ]
    },
    {
      "id": "execution-model",
      "title": "Execution model: SMs, warps, threads",
      "blocks": [
        {
          "p": "A GPU is an array of <strong>Streaming Multiprocessors</strong> (SMs) — an H100 SXM has 132 — that execute independently. Each SM packs many CUDA cores / streaming processors (SPs), tensor cores, a large register file, and on-chip shared memory / L1. Programming is <strong>SIMT</strong> (single-instruction, multiple-thread): all threads in a group run the same instruction on different data."
        },
        {
          "h": "The CUDA hierarchy"
        },
        {
          "table": {
            "head": [
              "Software",
              "Hardware",
              "Memory it sees"
            ],
            "rows": [
              [
                "thread",
                "one lane / SP",
                "private registers"
              ],
              [
                "warp (32 threads)",
                "executes in lockstep on an SM",
                "registers (+ warp shuffles)"
              ],
              [
                "block (group of warps)",
                "pinned entirely to one SM",
                "that SM's shared memory; can sync"
              ],
              [
                "grid (all blocks)",
                "spread across all SMs",
                "global memory (HBM)"
              ]
            ]
          }
        },
        {
          "p": "Two facts drive everything downstream. (1) A <strong>warp</strong> is 32 consecutively-numbered threads that issue the <em>same</em> instruction together. (2) A <strong>block</strong> is scheduled as a unit onto one SM, so its threads share that SM's fast shared memory and can synchronize cheaply — but anything that must cross blocks has to round-trip through slow global memory."
        },
        {
          "callout": "<strong>Control divergence.</strong> Because a warp is SIMT, an <code>if/else</code> whose threads disagree doesn't branch — the warp executes <em>both</em> paths with inactive lanes masked off, serializing the work (up to #paths slowdown). Conditionals are legal but cost throughput; keep branches warp-aligned.",
          "kind": "pitfall"
        },
        {
          "p": "<strong>Occupancy</strong> = resident warps ÷ the SM's max warps, capped by registers/thread, shared-memory/block, and block size. More resident warps means more latency to hide behind (something to run while others wait on HBM). But occupancy is <em>not</em> a target to maximize: register- and shared-memory-hungry kernels (FlashAttention, CUTLASS GEMMs) often run faster at <em>low</em> occupancy because data reuse beats latency hiding."
        },
        {
          "callout": "TPUs and most accelerators share the GPU's shape — lightweight control, a big fast matmul unit, fast on-chip memory — but drop the warp abstraction (everything is block/tile granularity). The differences that matter at scale are mostly <em>networking</em> (the parallelism lecture), not the core compute model.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "memory-hierarchy",
      "title": "The memory hierarchy: registers → SRAM → L2 → HBM",
      "blocks": [
        {
          "p": "Closer to the SM means faster, smaller, and far more expensive per byte. Registers and L1/shared memory live <em>inside</em> the SM; the L2 cache is shared on-die across SMs; HBM/DRAM is the stack of memory chips next to the die. Representative H100-class numbers (orders of magnitude matter more than exact digits):"
        },
        {
          "table": {
            "head": [
              "Level",
              "Scope",
              "Size",
              "Bandwidth",
              "Latency"
            ],
            "rows": [
              [
                "Registers",
                "per-thread",
                "256 KB / SM",
                "~100s TB/s (aggregate)",
                "~1 cycle"
              ],
              [
                "Shared mem / L1 (SRAM)",
                "per-block",
                "up to 228 KB / SM",
                "~19 TB/s (A100; H100 higher)",
                "~20–30 cyc"
              ],
              [
                "L2 cache",
                "whole GPU",
                "~50 MB",
                "~5–10 TB/s",
                "~150–250 cyc"
              ],
              [
                "HBM / DRAM (global)",
                "whole GPU",
                "80 GB",
                "3.35 TB/s",
                "~400–800 cyc"
              ]
            ]
          }
        },
        {
          "callout": "Think of it as <strong>warehouse : DRAM :: factory : SRAM</strong>. The warehouse (HBM) holds everything but is far and slow; the factory floor (SRAM) is blazing fast but tiny. SRAM is ~100× more expensive per byte yet ~8× faster (and an order of magnitude more bandwidth) than DRAM. <em>Fast kernels minimize trips to the warehouse</em> — stage data into SRAM, do all the work there, write back once.",
          "kind": "insight"
        },
        {
          "p": "The memory <em>model</em> mirrors the hardware: a thread's registers are private, a block's shared memory is shared among its warps, and anything global lives in HBM. The art of a GPU kernel is choosing what to hoist into registers/SRAM and how long to keep it there."
        },
        {
          "h": "Coalescing and DRAM bursts"
        },
        {
          "p": "DRAM is read in <strong>bursts</strong>: a whole row is copied to the sense amplifiers, so each access returns a fixed-size chunk (a 32-/128-byte transaction). A warp's 32 loads are <em>coalesced</em> if their addresses fall in the same burst → one transaction serves all 32. If threads stride apart (e.g. walking down columns of a row-major matrix), you pay up to 32 separate transactions and waste ~32× of your bandwidth."
        },
        {
          "callout": "Same FLOPs, wrong layout, very different speed. An uncoalesced access pattern can turn a compute-bound matmul into a memory-bound crawl. The fix — tiling — happens to also <em>coalesce</em> the loads, which is part of why it wins twice.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "roofline",
      "title": "Compute-bound vs memory-bound: the roofline",
      "blocks": [
        {
          "p": "Every kernel is limited by either compute (peak FLOP/s) or memory (peak bytes/s) — never both at once. Which one is set by <strong>arithmetic intensity</strong> $I = \\text{FLOPs} / \\text{bytes moved}$ (bytes to/from HBM). The roofline model makes this exact:"
        },
        {
          "math": "\\text{attainable FLOP/s} \\;=\\; \\min\\!\\big(\\pi_{\\text{peak}},\\; I \\cdot \\beta\\big), \\qquad I_{\\text{ridge}} \\;=\\; \\frac{\\pi_{\\text{peak}}}{\\beta}"
        },
        {
          "p": "Below the <strong>ridge point</strong> $I_{\\text{ridge}}$ you are memory-bound (the $I\\cdot\\beta$ slope); above it, compute-bound (the flat $\\pi_{\\text{peak}}$ roof). Plug in an H100: $\\pi_{\\text{peak}} \\approx 990\\,\\text{TFLOP/s}$ (dense bf16), $\\beta = 3.35\\,\\text{TB/s}$, so $I_{\\text{ridge}} \\approx 295$ FLOP/byte. (A100 bf16: $312/2.0 \\approx 156$.)"
        },
        {
          "callout": "On an H100 you must do <strong>~300 bf16 FLOPs for every byte you pull from HBM</strong> just to keep the tensor cores busy. Anything less and the matmul units idle, waiting on memory. That single ratio — compute ÷ bandwidth — is the design constraint behind fusion, tiling, and FlashAttention.",
          "kind": "insight"
        },
        {
          "h": "Do the arithmetic"
        },
        {
          "p": "<strong>Elementwise ReLU</strong> (read $x$, write $x$, 1 FLOP): in fp32 you move 8 bytes/element → $I = 1/8 = 0.125$; in fp16, 4 bytes → $I = 0.25$ FLOP/byte. Both are ~1000× below the ridge → hopelessly <em>memory-bound</em>. Runtime is set by bytes moved, so halving precision ~halves the time. Normalization, softmax, and activations all live here."
        },
        {
          "math": "I_{\\text{matmul}}(n) \\;=\\; \\frac{2n^3}{2\\,(3n^2)} \\;=\\; \\frac{n}{3}\\ \\text{FLOP/byte} \\quad(\\text{square } n\\times n,\\ \\text{fp16, no reuse})"
        },
        {
          "p": "<strong>Matmul</strong> is the opposite: intensity grows with $n$ (read/write $3n^2$ elements but do $2n^3$ FLOPs). A big square matmul clears the ridge easily ($n/3 &gt; 300$ once $n \\gtrsim 900$) and is compute-bound; a skinny GEMV — batch-1 decode, $n=1$ on one side — is all memory and badly memory-bound. Same op, different regime, decided by shape."
        },
        {
          "callout": "Compute has outrun bandwidth for decades — the <em>AI memory wall</em> (Gholami et al.). Each GPU generation pushes $I_{\\text{ridge}}$ higher, so more workloads slide onto the memory-bound side and data-movement tricks matter <em>more</em> every year, not less.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "tensor-cores",
      "title": "Tensor cores, precision, and throughput",
      "blocks": [
        {
          "p": "Since Volta, GPUs have <strong>tensor cores</strong> — dedicated matrix-multiply-accumulate units that do a small tile MMA (e.g. a 16×16 block) per instruction. They make matmul <strong>&gt;10× faster</strong> than generic floating-point ops on the same chip, which is why the single most important move in GPU programming is casting your computation as matmul."
        },
        {
          "table": {
            "head": [
              "dtype",
              "H100 dense throughput",
              "vs FP32"
            ],
            "rows": [
              [
                "FP32 (CUDA cores)",
                "~67 TFLOP/s",
                "1×"
              ],
              [
                "TF32 (tensor core)",
                "~495 TFLOP/s",
                "~7×"
              ],
              [
                "BF16 / FP16 (tensor core)",
                "~990 TFLOP/s ≈ 1e15",
                "~15×"
              ],
              [
                "FP8 (tensor core)",
                "~1,979 TFLOP/s ≈ 2e15",
                "~30×"
              ]
            ]
          }
        },
        {
          "p": "Low precision wins twice. (1) Tensor-core throughput roughly <em>doubles</em> each time you halve the bits (bf16 → fp8). (2) Fewer bits = fewer bytes to move = higher arithmetic intensity and less memory pressure. Mixed precision keeps a higher-precision accumulator (fp32) so the matmul stays numerically stable while inputs ride in bf16/fp8."
        },
        {
          "callout": "Watch the asterisk. NVIDIA's headline <strong>1,979 bf16 TFLOP/s</strong> for the H100 is <em>with 2:4 structured sparsity</em>; the <strong>dense</strong> figure is ~990 TFLOP/s ≈ 1e15 FLOP/s. Always check dense-vs-sparse and the accumulation dtype before quoting a peak.",
          "kind": "key"
        },
        {
          "p": "Occupancy interacts here: low-precision tiles use fewer registers and less shared memory, so you can fit larger tiles. But tensor cores are so fast that matmul kernels are usually bound by <em>feeding</em> them (shared-memory bandwidth, async copies), not by occupancy. The job is keeping the matmul unit fed, not maximizing resident warps."
        }
      ]
    },
    {
      "id": "kernel-tricks",
      "title": "Making kernels fast: fusion, recomputation, tiling",
      "blocks": [
        {
          "p": "Given the roofline, the playbook is mechanical: <strong>cut bytes moved</strong> and <strong>reuse data in SRAM</strong>. The lecture lists six levers (control divergence, low precision, fusion, recomputation, coalescing, tiling); the three that dominate ML kernels are fusion, recomputation, and tiling."
        },
        {
          "h": "Fusion — stop shipping to the warehouse"
        },
        {
          "p": "Treat the GPU as a factory and HBM as a warehouse. Each unfused op ships its inputs in from the warehouse and writes results back out — pure overhead if the next op needs them immediately. Computing $\\sin^2 x + \\cos^2 x$ naively launches <strong>5 kernels</strong> (5 HBM round-trips); fused, it is <strong>one</strong> kernel that reads $x$ once and writes the result once. <code>torch.compile</code> finds these pointwise fusions automatically."
        },
        {
          "code": "import torch\n\ndef f(x):\n    return torch.sin(x) ** 2 + torch.cos(x) ** 2\n\ny = f(x)                 # eager: ~5 pointwise kernels, 5 HBM round-trips\n\nfast = torch.compile(f)  # fused: ONE kernel, read x once, write y once\ny = fast(x)",
          "lang": "python"
        },
        {
          "h": "Recomputation — trade FLOPs for bytes"
        },
        {
          "p": "Backprop must keep activations around for the backward Jacobians. Stacking three sigmoids and saving every activation costs ~8 HBM read/writes at terrible intensity. <strong>Throw the activations away and recompute</strong> them in the backward pass: ~5/8 of the memory traffic, spending cheap FLOPs to save scarce bandwidth — a clear win on memory-bound ops. This is activation checkpointing (min-cut recomputation), and it is exactly what FlashAttention does in its backward pass."
        },
        {
          "h": "Tiling — the big one"
        },
        {
          "p": "Split the matmul into tiles: load an $A$-tile and $B$-tile into shared memory, compute every partial product that uses them, then advance. Each input is read from HBM $N/T$ times instead of $N$ times (and $T$ times from fast SRAM) — a factor-$T$ cut in global reads, and the tile loads come out coalesced."
        },
        {
          "math": "\\text{global reads per element:}\\quad N \\;\\longrightarrow\\; N/T \\qquad(\\text{a } T\\times \\text{ reduction})"
        },
        {
          "callout": "Tiling has two quantization cliffs. <strong>Tile quantization:</strong> if a matrix dim isn't a multiple of the tile, edge tiles are padded → wasted compute. <strong>Wave quantization:</strong> a 256×128 tile on a 1792² matmul makes $7\\times14 = 98$ tiles ≤ 108 SMs → one clean wave; bump to 1793² and it's $8\\times15 = 120$ tiles &gt; 108, so a <em>second</em> wave runs just 12 tiles while 96 SMs sit idle. A 0.06% bigger matrix ≈ 2× slower. \"Bigger is faster\" is really \"aligned to the hardware is faster.\"",
          "kind": "pitfall"
        },
        {
          "callout": "All three tricks are the same idea read through the roofline: the ~300 FLOP/byte compute:bandwidth ratio is the enemy. Fusion and recomputation <em>cut the bytes</em>; tiling <em>raises reuse</em> so each HBM byte feeds ~$T\\times$ more FLOPs. Kernel design is bandwidth accounting.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "flashattention",
      "title": "Putting it together: FlashAttention",
      "blocks": [
        {
          "p": "Attention is $\\text{softmax}(QK^\\top/\\sqrt{d})\\,V$ — three matmuls with a softmax in between. The naive kernel materializes the full $N\\times N$ score matrix $S$ in HBM (write it, read it back for softmax, read again for the $V$ matmul). That is $O(N^2)$ memory and $O(N^2)$ HBM traffic — memory-bound, and the reason long context is expensive."
        },
        {
          "p": "<strong>FlashAttention</strong> (Dao et al. 2022) is this entire lecture applied to attention: <em>tile</em> the $Q/K/V$ matmuls so blocks of $S$ live only in SRAM, <em>fuse</em> the exponential/softmax into the same kernel, and never write the full $S$ to HBM. The result is $O(N)$ HBM traffic instead of $O(N^2)$ — a big wall-clock and memory win — and it is <strong>exact</strong>, not an approximation."
        },
        {
          "h": "The one hard part — online softmax"
        },
        {
          "p": "Softmax needs a row max and a row sum, but tiling only ever sees one block of the row at a time. <strong>Online softmax</strong> (Milakov &amp; Gimelshein 2018) keeps a running max $m$ and running denominator $\\ell$, and on each new tile rescales the accumulator by $e^{\\,m_{\\text{old}} - m_{\\text{new}}}$ — a telescoping update that produces the <em>exact</em> softmax tile-by-tile, never needing the whole row in memory."
        },
        {
          "math": "m_i = \\max\\!\\big(m_{i-1},\\, \\tilde m_i\\big), \\qquad \\ell_i = e^{\\,m_{i-1}-m_i}\\,\\ell_{i-1} \\;+\\; \\textstyle\\sum_j e^{\\,x_{ij}-m_i}"
        },
        {
          "code": "m, l, acc = -inf, 0.0, 0.0          # running max, denom, output accumulator\nfor S_blk, V_blk in tiles_of_the_row:   # one K/V tile at a time, kept in SRAM\n    m_new = max(m, S_blk.max())\n    scale = exp(m - m_new)              # rescale the old partial results\n    p     = exp(S_blk - m_new)\n    l     = l * scale + p.sum()\n    acc   = acc * scale + p @ V_blk\n    m     = m_new\nout = acc / l                           # == exact softmax(S) @ V",
          "lang": "python"
        },
        {
          "callout": "FlashAttention is the canonical proof that <strong>GPU performance = matmul + data movement</strong>: tiling, fusion, online recurrence, and backward recomputation, all aimed at the memory hierarchy. Lecture 6 generalizes this to writing your own CUDA/Triton kernels — the same four tricks are the whole toolkit.",
          "kind": "connection"
        }
      ]
    }
  ],
  "takeaways": [
    "GPUs trade latency for throughput: thousands of tiny ALUs across SMs, threads grouped into 32-wide SIMT warps, blocks pinned to an SM with shared memory.",
    "The memory hierarchy (registers → SRAM → L2 → HBM) spans orders of magnitude in size, bandwidth, and latency; fast kernels stage data in SRAM and minimize HBM round-trips.",
    "Arithmetic intensity (FLOP/byte) vs the ridge point (~300 on H100 bf16) decides compute- vs memory-bound: elementwise ops are always memory-bound, big matmuls compute-bound.",
    "Tensor cores make matmul &gt;10× faster and reward low precision — dense bf16 ~990 TFLOP/s ≈ 1e15, fp8 ~2e15; cast work as matmul, and check dense-vs-sparse before quoting peaks.",
    "Fusion and recomputation cut bytes moved; tiling raises SRAM reuse for ~T× fewer global reads — mind tile/wave quantization against the SM count.",
    "FlashAttention = tiling + online softmax + fusion + recomputation → O(N) HBM traffic and exact attention; it's the template for the Lecture 6 kernels."
  ],
  "references": [
    {
      "label": "CS336 Lecture 5 trace (Tatsu Hashimoto)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_05"
    },
    {
      "label": "Dao et al. 2022 — FlashAttention",
      "url": "https://arxiv.org/abs/2205.14135"
    },
    {
      "label": "Milakov & Gimelshein 2018 — Online softmax",
      "url": "https://arxiv.org/abs/1805.02867"
    },
    {
      "label": "Horace He — Making Deep Learning Go Brrrr",
      "url": "https://horace.io/brrr_intro.html"
    },
    {
      "label": "What Shapes Do Matrix Multiplications Like? (thonking.ai)",
      "url": "https://www.thonking.ai/p/what-shapes-do-matrix-multiplications-like"
    },
    {
      "label": "Gholami et al. 2024 — AI and Memory Wall",
      "url": "https://arxiv.org/abs/2403.14123"
    },
    {
      "label": "NVIDIA H100 Tensor Core GPU datasheet",
      "url": "https://www.nvidia.com/en-us/data-center/h100/"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Execution model",
      "q": "A warp is:",
      "options": [
        "32 consecutively-numbered threads that issue the same instruction in lockstep (SIMT)",
        "A block assigned to a single SM",
        "The unit of shared memory inside an SM",
        "A group of SMs sharing the L2 cache"
      ],
      "answer": 0,
      "explain": "A warp = 32 threads executing one instruction together. It is the granularity of SIMT execution and of coalesced memory access."
    },
    {
      "id": 2,
      "section": "Execution model",
      "q": "Threads in the same block can share data cheaply because:",
      "options": [
        "They all reside in the same registers",
        "The block is scheduled entirely on one SM and shares that SM's shared memory (and can sync)",
        "Blocks automatically communicate through L2",
        "Warps broadcast registers across SMs"
      ],
      "answer": 1,
      "explain": "A block runs on a single SM, so its threads share that SM's fast shared memory and can synchronize. Cross-block communication must go through global memory."
    },
    {
      "id": 3,
      "section": "Memory hierarchy",
      "q": "Ordered fastest/smallest → slowest/largest, the hierarchy is:",
      "options": [
        "HBM → L2 → shared/SRAM → registers",
        "L2 → registers → HBM → shared memory",
        "registers → shared memory/SRAM → L2 → HBM/DRAM",
        "shared memory → registers → HBM → L2"
      ],
      "answer": 2,
      "explain": "Registers (in-SM) are fastest/smallest; shared/L1 SRAM next; on-die L2; then off-die HBM/DRAM is largest and slowest."
    },
    {
      "id": 4,
      "section": "Memory hierarchy",
      "q": "Relative to HBM/DRAM, on-chip SRAM (shared memory) is:",
      "options": [
        "Cheaper per byte and slower",
        "The same speed but larger",
        "Slower but much larger",
        "Far more expensive per byte but much faster and higher-bandwidth (the 'factory' to DRAM's 'warehouse')"
      ],
      "answer": 3,
      "explain": "SRAM is ~100× costlier per byte yet ~8× faster with far more bandwidth — hence 'minimize trips to the warehouse (DRAM).'"
    },
    {
      "id": 5,
      "section": "Memory hierarchy",
      "q": "A warp's memory accesses are 'coalesced' when:",
      "options": [
        "The 32 threads' addresses fall within the same DRAM burst, so one transaction serves them all",
        "Each thread reads a random address",
        "Threads stride down columns of a row-major matrix",
        "All 32 threads read the same single byte"
      ],
      "answer": 0,
      "explain": "DRAM is read in bursts; coalesced accesses pack a warp into one transaction. Strided/misaligned access can cost up to 32× the transactions."
    },
    {
      "id": 6,
      "section": "Roofline",
      "q": "Arithmetic intensity is:",
      "options": [
        "FLOPs per second",
        "FLOPs performed per byte moved to/from memory",
        "Bytes per second of bandwidth",
        "Resident warps per SM"
      ],
      "answer": 1,
      "explain": "I = FLOPs / bytes moved. It places a kernel on the roofline relative to the ridge point."
    },
    {
      "id": 7,
      "section": "Roofline",
      "q": "On an H100 (~990 dense bf16 TFLOP/s, 3.35 TB/s HBM), a kernel is compute-bound only if its arithmetic intensity exceeds roughly:",
      "options": [
        "3 FLOP/byte",
        "30 FLOP/byte",
        "300 FLOP/byte",
        "3000 FLOP/byte"
      ],
      "answer": 2,
      "explain": "Ridge = peak FLOP/s ÷ bandwidth = 990e12 / 3.35e12 ≈ 295 ≈ 300 FLOP/byte. Below it you're memory-bound."
    },
    {
      "id": 8,
      "section": "Roofline",
      "q": "An elementwise ReLU (read x, write x, 1 FLOP) is:",
      "options": [
        "Compute-bound, since it does a FLOP per element",
        "Free; it touches no memory",
        "Compute-bound only in fp16",
        "Memory-bound — intensity ~0.125 (fp32) to 0.25 (fp16) FLOP/byte, far below the ridge"
      ],
      "answer": 3,
      "explain": "Moving 8 (fp32) or 4 (fp16) bytes per FLOP gives I ≈ 0.125–0.25, ~1000× under the ridge. Runtime is set by bytes, so lower precision ≈ proportional speedup."
    },
    {
      "id": 9,
      "section": "Roofline",
      "q": "For a square n×n matmul (fp16, no cache reuse), arithmetic intensity scales like:",
      "options": [
        "∝ n, so bigger matmuls are more compute-bound",
        "Constant in n",
        "∝ 1/n",
        "∝ n³"
      ],
      "answer": 0,
      "explain": "2n³ FLOPs over ~6n² bytes gives I ≈ n/3. Big matmuls clear the ridge; skinny GEMVs (batch-1 decode) stay memory-bound."
    },
    {
      "id": 10,
      "section": "Tensor cores",
      "q": "NVIDIA lists 1,979 bf16 TFLOP/s for the H100. The dense (no structured sparsity) figure is closer to:",
      "options": [
        "~1,979 TFLOP/s",
        "~990 TFLOP/s ≈ 1e15 FLOP/s",
        "~3,958 TFLOP/s",
        "~67 TFLOP/s"
      ],
      "answer": 1,
      "explain": "1,979 is the 2:4-sparse number; dense bf16 is ~990 TFLOP/s ≈ 1e15. Tensor cores also run matmul >10× faster than generic FP ops."
    },
    {
      "id": 11,
      "section": "Kernel tricks",
      "q": "Operator fusion speeds up a chain of pointwise ops by:",
      "options": [
        "Switching to higher precision",
        "Increasing the FLOPs of each op",
        "Reading inputs once and writing once instead of an HBM round-trip per op (e.g. 5 kernels → 1)",
        "Offloading the work to the CPU"
      ],
      "answer": 2,
      "explain": "Pointwise ops are memory-bound; fusing them keeps intermediates in registers/SRAM, eliminating per-op HBM traffic. torch.compile does this automatically."
    },
    {
      "id": 12,
      "section": "Kernel tricks",
      "q": "Activation recomputation (checkpointing) trades:",
      "options": [
        "Accuracy for speed",
        "Memory for accuracy",
        "Bandwidth for latency",
        "Extra recompute FLOPs for fewer activation read/writes to HBM (e.g. ~5/8 the memory traffic)"
      ],
      "answer": 3,
      "explain": "Throw activations away and recompute them in backward: cheap FLOPs to save scarce bandwidth — a win on memory-bound ops, and how FlashAttention's backward works."
    },
    {
      "id": 13,
      "section": "Tiling",
      "q": "Tiling a matmul with tile size T reduces global-memory reads per input element from N to:",
      "options": [
        "N/T (a factor-T reduction), with the T reuses served from shared memory",
        "N·T",
        "N²",
        "Unchanged"
      ],
      "answer": 0,
      "explain": "Loading tiles into SRAM and reusing them T times cuts HBM reads by T and makes the loads coalesced."
    },
    {
      "id": 14,
      "section": "Tiling",
      "q": "A 256×128 tiling gives 7×14=98 tiles for 1792² but 8×15=120 tiles for 1793² on a 108-SM A100. The consequence:",
      "options": [
        "1793² is faster — more tiles means more parallelism",
        "1793² needs a 2nd wave (120 > 108) with ~96 SMs idle → ~2× slower despite being +0.06% larger",
        "No difference; the scheduler rebalances SMs",
        "The kernel fails to launch"
      ],
      "answer": 1,
      "explain": "Wave quantization: 98 tiles fit in one wave (≤108 SMs); 120 needs two, the second nearly empty. Aligning shapes to the SM count, not just growing them, is what's fast."
    },
    {
      "id": 15,
      "section": "FlashAttention",
      "q": "FlashAttention's main win over naive attention is that it:",
      "options": [
        "Approximates softmax to save compute",
        "Uses fp8 to halve the memory",
        "Tiles QKV and fuses softmax so the N×N score matrix never hits HBM → O(N) instead of O(N²) HBM traffic, exactly",
        "Replaces attention with a single matmul"
      ],
      "answer": 2,
      "explain": "Naive attention materializes S in HBM (O(N²) traffic). FlashAttention keeps tiles in SRAM and fuses the softmax, giving O(N) traffic with an exact result."
    },
    {
      "id": 16,
      "section": "FlashAttention",
      "q": "Online (incremental) softmax is what lets attention be tiled, by:",
      "options": [
        "Dropping the max subtraction for stability",
        "Computing the softmax on the CPU",
        "Storing the entire score row in registers",
        "Keeping a running max and denominator and rescaling the accumulator by exp(m_old − m_new) so tiles telescope to the exact softmax"
      ],
      "answer": 3,
      "explain": "Milakov & Gimelshein's recurrence updates a running max/sum per tile, so you get the exact softmax without ever holding the full row — the trick that makes FlashAttention's tiling possible."
    }
  ]
});
