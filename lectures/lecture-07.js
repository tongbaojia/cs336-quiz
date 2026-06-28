/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 7,
  "estMinutes": 20,
  "topics": [
    "data parallel",
    "tensor parallel",
    "pipeline",
    "ZeRO/FSDP",
    "3D parallelism"
  ],
  "overview": "Once a model or its optimizer state stops fitting on one GPU, training becomes a <strong>communication</strong> problem. This lecture builds the parallelism taxonomy &mdash; <em>data</em>, <em>tensor</em>, <em>pipeline</em>, and <em>sequence</em> parallelism &mdash; from the collective-communication primitives up, prices each one in bytes moved, and shows how frontier runs stack all of them into <em>3D parallelism</em>.",
  "sections": [
    {
      "id": "why-parallel",
      "title": "Why go multi-GPU at all",
      "blocks": [
        {
          "p": "Single-GPU scaling hits two walls. <strong>Compute</strong>: even at hundreds of TFLOP/s, a trillion-param run would take lifetimes on one device. <strong>Memory</strong>: an H100 holds 80&nbsp;GB, but a 70B model in mixed-precision Adam needs <em>~16 bytes/param</em> &mdash; over 1&nbsp;TB just for weights, gradients, and optimizer state. The model literally does not fit."
        },
        {
          "p": "So the unit of compute becomes the <strong>datacenter</strong>, and we split memory and compute across many GPUs and machines. The whole game is doing that split while paying as little communication as possible."
        },
        {
          "h": "What we want from multi-machine scaling"
        },
        {
          "list": [
            "<strong>Linear memory scaling</strong> &mdash; max model size should grow with the number of GPUs.",
            "<strong>Linear compute scaling</strong> &mdash; aggregate FLOP/s should grow with the number of GPUs.",
            "<strong>Simple primitives</strong> &mdash; express it all with a handful of collective communication ops."
          ]
        },
        {
          "callout": "The recurring tension: <strong>compute (ALUs) is far from data</strong>. On one GPU that means HBM round-trips (Lecture 6); across GPUs it means cross-device transfers. Every parallelism scheme is a different answer to <em>recompute vs. store-locally vs. communicate</em>.",
          "kind": "key"
        },
        {
          "h": "The communication hierarchy (fast &rarr; slow)"
        },
        {
          "list": [
            "On-chip SRAM / shared memory &mdash; tiny, blazing fast.",
            "HBM &mdash; the GPU's own DRAM (single device).",
            "<strong>NVLink</strong> &mdash; direct GPU&harr;GPU <em>within</em> a node, bypassing the CPU.",
            "<strong>NVSwitch / InfiniBand</strong> &mdash; <em>across</em> nodes; an order of magnitude slower than NVLink."
          ]
        },
        {
          "callout": "The bandwidth cliff between intra-node (NVLink) and inter-node (Ethernet/IB) is the single most important fact for choosing a parallelism layout: chatty schemes go inside a node, quiet ones span nodes.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "collectives",
      "title": "Collective communication & its cost",
      "blocks": [
        {
          "p": "<strong>Collective operations</strong> are the 1980s-vintage primitives of parallel programming: you declare a communication <em>pattern</em> over all devices instead of hand-rolling point-to-point sends. Two terms: <strong>world size</strong> (number of devices) and <strong>rank</strong> (a device's id, \\(0 \\ldots n-1\\))."
        },
        {
          "table": {
            "head": [
              "Primitive",
              "What it does"
            ],
            "rows": [
              [
                "Broadcast",
                "one rank's tensor copied to all ranks"
              ],
              [
                "Reduce",
                "sum/min/max across ranks &rarr; result on one rank"
              ],
              [
                "All-gather",
                "each rank's shard collected so all ranks hold the full tensor"
              ],
              [
                "Reduce-scatter",
                "reduce across ranks, but each rank keeps only its slice of the result"
              ],
              [
                "All-reduce",
                "reduce across ranks &rarr; result on <em>all</em> ranks"
              ]
            ]
          }
        },
        {
          "p": "Mnemonic: <em>reduce</em> = an associative/commutative op (sum, min, max); <em>broadcast/scatter</em> is the inverse of <em>gather</em>; the <em>all-</em> prefix means the result lands on every device."
        },
        {
          "h": "All-reduce = reduce-scatter + all-gather"
        },
        {
          "p": "The key identity for cost accounting: an all-reduce decomposes into a reduce-scatter followed by an all-gather. The <strong>ring</strong> implementation makes each of those two phases move \\(\\frac{n-1}{n}\\) of the message past each GPU, so total bytes crossing any link per GPU is:"
        },
        {
          "math": "\\text{bytes per GPU} \\;\\approx\\; \\frac{2(n-1)}{n}\\,\\cdot\\,(\\text{message bytes}) \\;\\xrightarrow{\\;n\\,\\text{large}\\;}\\; 2 \\times \\text{message bytes}"
        },
        {
          "callout": "In the <strong>bandwidth-limited regime this is optimal</strong> &mdash; you cannot all-reduce in fewer bytes. That is why every later cost is quoted in units of &ldquo;\\(2\\times\\) #params&rdquo;: one all-reduce of the gradients. Latency (the \\(\\frac{n-1}{n}\\) hop count) is a separate, small-message concern.",
          "kind": "insight"
        },
        {
          "callout": "Topology matters: GPUs use all-to-all switched fabric (NVSwitch, up to 256 endpoints), whereas TPUs wire a toroidal mesh. Same collectives, very different constants &mdash; don't port a TPU sharding layout to GPUs unchanged.",
          "kind": "note"
        }
      ]
    },
    {
      "id": "data-parallel",
      "title": "Data parallelism (and its memory tax)",
      "blocks": [
        {
          "p": "Start with plain SGD on a batch of size \\(B\\), then split the batch across \\(M\\) machines and synchronize gradients each step:"
        },
        {
          "math": "\\theta_{t+1} \\;=\\; \\theta_t \\;-\\; \\eta \\sum_{i=1}^{B} \\nabla f(x_i)"
        },
        {
          "p": "Each GPU runs forward/backward on \\(B/M\\) local examples, then an <strong>all-reduce</strong> averages the gradients so every replica steps identically."
        },
        {
          "list": [
            "<strong>Compute</strong>: scales &mdash; each GPU does \\(B/M\\) examples' worth of work.",
            "<strong>Communication</strong>: \\(\\approx 2\\times\\) #params per step (one gradient all-reduce), independent of batch size &mdash; cheap if batches are large.",
            "<strong>Memory</strong>: <em>no</em> scaling &mdash; every GPU still stores the full model, gradients, and optimizer state."
          ]
        },
        {
          "h": "Why the memory is actually terrible"
        },
        {
          "p": "Mixed-precision Adam keeps ~5 copies of each weight, totaling <strong>~16 bytes/param</strong>:"
        },
        {
          "list": [
            "2 bytes &mdash; BF16 parameters",
            "2 bytes &mdash; BF16 gradients",
            "4 bytes &mdash; FP32 master weights",
            "4 bytes &mdash; FP32 Adam first moment (\\(m\\))",
            "4 bytes &mdash; FP32 Adam second moment (\\(v\\))"
          ],
          "ordered": false
        },
        {
          "callout": "Naive data parallel <em>replicates</em> all 16 bytes/param on every GPU, so adding GPUs buys throughput but <strong>zero</strong> memory headroom. Worse, you need #machines&nbsp;&le;&nbsp;batch size, and batch size has diminishing returns &mdash; so you can't just scale data parallel forever. Memory, not compute, is the wall.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "zero-fsdp",
      "title": "ZeRO & FSDP: shard the redundant state",
      "blocks": [
        {
          "p": "<strong>ZeRO</strong> (Rajbhandari et al. 2020) attacks the replication: shard the expensive state across data-parallel ranks and reconstruct it on demand using the reduce-scatter / all-gather equivalence. Three progressively aggressive stages:"
        },
        {
          "table": {
            "head": [
              "Stage",
              "Sharded",
              "Communication",
              "Cost"
            ],
            "rows": [
              [
                "ZeRO-1",
                "optimizer state",
                "reduce-scatter grads + all-gather params",
                "2&times; #params"
              ],
              [
                "ZeRO-2",
                "+ gradients",
                "incremental reduce during backward + all-gather",
                "2&times; #params"
              ],
              [
                "ZeRO-3 / FSDP",
                "+ parameters",
                "2 all-gather (params) + 1 reduce-scatter (grads)",
                "3&times; #params"
              ]
            ]
          }
        },
        {
          "callout": "ZeRO-1 is essentially <strong>free</strong>: same \\(2\\times\\) #params traffic as plain DDP, but optimizer memory drops by a factor of \\(N\\). There is almost never a reason <em>not</em> to turn it on. ZeRO-2 is nearly free too.",
          "kind": "insight"
        },
        {
          "p": "<strong>FSDP</strong> (Fully Sharded Data Parallel = ZeRO-3) shards <em>everything</em>, including parameters. The trick that makes it fast is <strong>incremental, overlapped</strong> communication: all-gather a layer's params just before you need them, free them right after, and reduce-scatter its gradients in the backward pass &mdash; while the all-gather of the <em>next</em> layer runs concurrently with the current layer's compute, hiding the comm cost behind the matmul."
        },
        {
          "h": "Will it fit? (8&times;A100-80G, ~12 bytes/param)"
        },
        {
          "table": {
            "head": [
              "Scheme",
              "Max model size"
            ],
            "rows": [
              [
                "Baseline DDP",
                "~6.7B params"
              ],
              [
                "ZeRO-1",
                "~16B"
              ],
              [
                "ZeRO-2",
                "~24.6B"
              ],
              [
                "ZeRO-3 / FSDP",
                "~53.3B"
              ]
            ]
          }
        },
        {
          "callout": "ZeRO-3 costs \\(3\\times\\) #params (1.5&times; DDP) and &mdash; crucially &mdash; <strong>does not reduce activation memory</strong>, only parameter/optimizer memory. It can also become latency-bound from many small all-gathers. Sharding state is not the same as sharding the <em>model</em>.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "model-parallel",
      "title": "Model parallelism: cut along depth & width",
      "blocks": [
        {
          "p": "Data parallel can't shrink a too-big <em>model</em>. <strong>Model parallelism</strong> splits the parameters across GPUs (like ZeRO-3) but, instead of communicating params, it <strong>communicates activations</strong>. Two ways to cut a Transformer: along depth (pipeline) or along width (tensor)."
        },
        {
          "h": "Pipeline parallel (depth, GPipe)"
        },
        {
          "p": "Assign contiguous layers to each GPU. Naively, a GPU is busy only \\(1/n\\) of the time &mdash; the rest is the &ldquo;<strong>bubble</strong>&rdquo; waiting on neighbors. Split the batch into \\(n_{\\text{micro}}\\) microbatches and stream them so stages overlap. The wasted fraction is:"
        },
        {
          "math": "\\text{bubble fraction} \\;=\\; \\frac{n_{\\text{stages}} - 1}{n_{\\text{micro}}}"
        },
        {
          "callout": "Pipeline's payoff: communication is <strong>point-to-point</strong> and depends only on activation size (\\(b\\,s\\,h\\)), not params &mdash; cheap enough to run <em>across nodes</em>. Its cost: you need a large batch (many microbatches) to shrink the bubble, so it degrades badly at small batch size.",
          "kind": "key"
        },
        {
          "h": "Tensor parallel (width, Megatron)"
        },
        {
          "p": "Decompose a single matmul into column/row submatrices on different GPUs and add the partial sums. In a Megatron block, the forward pass has \\(f =\\) identity and \\(g =\\) <strong>all-reduce</strong>; in the backward pass they swap (\\(f =\\) all-reduce, \\(g =\\) identity). That is one all-reduce per block of attention and per block of MLP."
        },
        {
          "callout": "Tensor parallel issues a large all-reduce (\\(\\sim\\!8\\,b\\,s\\,h\\) per layer) on the <em>critical path</em>, so it only pays off over NVLink: keep it <strong>within a node (\\(\\le 8\\) GPUs)</strong>. Cross-node tensor parallel drowns in communication. Upside: no bubble, no large-batch requirement, easy to wrap.",
          "kind": "pitfall"
        },
        {
          "h": "Sequence parallel (the activation leftovers)"
        },
        {
          "p": "Tensor parallel shards the matmuls but leaves ~\\(10\\,b\\,s\\,h\\) of LayerNorm/Dropout/IO activations replicated. Those ops are <em>pointwise over the sequence</em>, so shard them along the sequence axis too (\\(g =\\) all-gather, \\(\\bar g =\\) reduce-scatter; reversed in backward). Combined, this finally makes activation memory scale linearly with device count."
        }
      ]
    },
    {
      "id": "putting-together",
      "title": "3D parallelism & what real models do",
      "blocks": [
        {
          "p": "There is no single winner &mdash; frontier runs <strong>compose</strong> all of these into <em>3D parallelism</em> (data &times; pipeline &times; tensor, plus sequence/expert). Each axis spends a different limited resource: memory, bandwidth, or batch size."
        },
        {
          "table": {
            "head": [
              "Type",
              "What's split",
              "Comm pattern",
              "When to use"
            ],
            "rows": [
              [
                "Data (DDP / ZeRO-1)",
                "the batch",
                "grad all-reduce, 2&times; #params/step",
                "always &mdash; scale throughput; model already fits"
              ],
              [
                "FSDP (ZeRO-3)",
                "batch + params + state",
                "all-gather + reduce-scatter, 3&times; #params",
                "model barely fits; decent bandwidth, no infra change"
              ],
              [
                "Pipeline",
                "layers (depth)",
                "point-to-point activations (b&middot;s&middot;h)",
                "span slow inter-node links; large batch available"
              ],
              [
                "Tensor (+sequence)",
                "matmuls (width)",
                "all-reduce per block (~8&middot;b&middot;s&middot;h)",
                "inside a node over NVLink; small batches OK"
              ]
            ]
          }
        },
        {
          "h": "Rules of thumb (Narayanan et al. 2021)"
        },
        {
          "list": [
            "Tensor-parallel <em>up to</em> the GPUs in a node (typically 8) &mdash; this stays on NVLink.",
            "Pipeline-parallel <em>across</em> nodes to make the model fit (or use ZeRO-3 if bandwidth allows).",
            "Spend remaining GPUs on data parallel.",
            "If the batch is small, gradient-accumulate to trade batch size for communication efficiency."
          ],
          "ordered": true
        },
        {
          "callout": "\\(\\text{TP}=8\\) (exactly one node) is usually optimal; e.g., 64 GPUs &rarr; an \\(8\\times 8\\) tensor&times;pipeline grid. Done carefully, 3D parallelism keeps per-GPU utilization roughly <em>flat</em> as you add machines &mdash; the linear-scaling goal from Part 1.",
          "kind": "insight"
        },
        {
          "h": "Production configs"
        },
        {
          "table": {
            "head": [
              "Model",
              "Parallelism stack"
            ],
            "rows": [
              [
                "OLMo / Dolma 7B",
                "FSDP only (fits intra-node)"
              ],
              [
                "DeepSeek-V3",
                "ZeRO-1 + pipeline (16) + expert (64-way) + tensor/sequence"
              ],
              [
                "Llama 3 405B",
                "staged tensor + pipeline + data (+ context parallel for long ctx)"
              ],
              [
                "Gemma 2 (2/9/27B)",
                "ZeRO-3 + model parallel (TP+SP) + data"
              ]
            ]
          }
        },
        {
          "callout": "At 405B scale, hardware <strong>failures are routine</strong> &mdash; Llama 3's run logged frequent GPU faults. Beyond a point, fault tolerance and checkpointing are as much a part of &ldquo;parallelism&rdquo; as the collectives themselves.",
          "kind": "note"
        }
      ]
    }
  ],
  "takeaways": [
    "Multi-GPU training is a communication problem: every scheme trades recompute vs. store-locally vs. communicate, governed by the NVLink&ndash;vs&ndash;inter-node bandwidth cliff.",
    "All-reduce = reduce-scatter + all-gather; a ring moves \\(\\approx 2(n-1)/n\\) &times; bytes per GPU, optimal in the bandwidth-limited regime &mdash; hence costs quoted as &ldquo;2&times; #params&rdquo;.",
    "Naive data parallel costs 2&times; #params/step but replicates ~16 bytes/param everywhere &mdash; zero memory scaling.",
    "ZeRO-1/2 shard optimizer state/gradients essentially for free (still 2&times;); ZeRO-3 / FSDP shards params too at 3&times;, but does not touch activation memory.",
    "Pipeline cuts depth (cheap point-to-point, but needs big batch to hide the (p-1)/n_micro bubble); tensor cuts width (all-reduce per block &mdash; keep it on NVLink within a node).",
    "Sequence parallel shards the leftover pointwise activations to make activation memory linear.",
    "Frontier runs stack data &times; pipeline &times; tensor (+sequence/expert) into 3D parallelism: TP&le;8 in-node, PP across nodes, DP for the rest."
  ],
  "references": [
    {
      "label": "CS336 Lecture 7 — Parallelism Basics (Hashimoto)",
      "url": "https://cs336.stanford.edu/"
    },
    {
      "label": "Rajbhandari et al. 2020 — ZeRO",
      "url": "https://arxiv.org/abs/1910.02054"
    },
    {
      "label": "Shoeybi et al. 2019 — Megatron-LM (tensor parallel)",
      "url": "https://arxiv.org/abs/1909.08053"
    },
    {
      "label": "Huang et al. 2019 — GPipe (pipeline)",
      "url": "https://arxiv.org/abs/1811.06965"
    },
    {
      "label": "Narayanan et al. 2021 — Efficient large-scale training (PTD-P)",
      "url": "https://arxiv.org/abs/2104.04473"
    },
    {
      "label": "Korthikanti et al. 2022 — Sequence parallelism & activation recomputation",
      "url": "https://arxiv.org/abs/2205.05198"
    },
    {
      "label": "Zhao et al. 2023 — PyTorch FSDP",
      "url": "https://arxiv.org/abs/2304.11277"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Collectives",
      "q": "An all-reduce is exactly equivalent to which two-phase composition?",
      "options": [
        "reduce-scatter then all-gather",
        "broadcast then reduce",
        "scatter then gather",
        "gather then broadcast"
      ],
      "answer": 0,
      "explain": "All-reduce = reduce-scatter + all-gather; in the bandwidth-limited regime this decomposition is provably optimal."
    },
    {
      "id": 2,
      "section": "Collectives",
      "q": "For a ring all-reduce over \\(n\\) GPUs, the bytes crossing each link per GPU scale as:",
      "options": [
        "\\(n \\times\\) message bytes",
        "\\(\\frac{2(n-1)}{n} \\times\\) message bytes, approaching \\(2\\times\\) for large \\(n\\)",
        "\\((n-1) \\times\\) message bytes",
        "\\(\\frac{1}{n} \\times\\) message bytes"
      ],
      "answer": 1,
      "explain": "Reduce-scatter and all-gather each move \\((n-1)/n\\) of the message; together \\(2(n-1)/n \\to 2\\) as \\(n\\) grows."
    },
    {
      "id": 3,
      "section": "Collectives",
      "q": "The &ldquo;all-&rdquo; prefix in all-reduce / all-gather signifies that:",
      "options": [
        "the op is associative",
        "all devices send to rank 0",
        "the result ends up on every device",
        "it consumes all available bandwidth"
      ],
      "answer": 2,
      "explain": "&ldquo;All&rdquo; = destination is all ranks. Reduce/gather alone leave the result on a single rank."
    },
    {
      "id": 4,
      "section": "Data parallel",
      "q": "Per-step communication cost of naive data parallelism is:",
      "options": [
        "proportional to the batch size",
        "zero, since parameters are local",
        "#params &times; #layers",
        "about 2&times; #params (one gradient all-reduce), independent of batch size"
      ],
      "answer": 3,
      "explain": "One gradient all-reduce per step ~ 2&times; #params; it is independent of batch size, so big batches amortize it."
    },
    {
      "id": 5,
      "section": "Data parallel",
      "q": "How does naive data parallelism scale memory across GPUs?",
      "options": [
        "it does not &mdash; every GPU stores full params + grads + optimizer state",
        "linearly &mdash; the model is split",
        "sublinearly via gradient sharding",
        "only the optimizer state is replicated"
      ],
      "answer": 0,
      "explain": "Naive DP replicates everything; adding GPUs adds throughput but no memory headroom."
    },
    {
      "id": 6,
      "section": "Data parallel",
      "q": "Mixed-precision Adam costs roughly how many bytes per parameter?",
      "options": [
        "2 bytes",
        "~16 bytes (BF16 weight + BF16 grad + FP32 master + FP32 m + FP32 v)",
        "4 bytes",
        "8 bytes"
      ],
      "answer": 1,
      "explain": "2+2+4+4+4 = 16 bytes/param across ~5 copies; the FP32 master + moments dominate."
    },
    {
      "id": 7,
      "section": "ZeRO",
      "q": "ZeRO-1 shards what, at what communication cost relative to DDP?",
      "options": [
        "parameters; 3&times; #params",
        "gradients; 1&times; #params",
        "optimizer states only; still 2&times; #params &mdash; an essentially free memory win",
        "activations; 0.5&times; #params"
      ],
      "answer": 2,
      "explain": "ZeRO-1 shards optimizer state with the same 2&times; traffic as DDP but \\(N\\times\\) less optimizer memory &mdash; nearly always worth it."
    },
    {
      "id": 8,
      "section": "ZeRO",
      "q": "ZeRO-3 / FSDP communication cost is:",
      "options": [
        "2&times; #params, identical to DDP",
        "6&times; #params",
        "proportional to batch size",
        "3&times; #params (2 all-gather + 1 reduce-scatter), about 1.5&times; DDP"
      ],
      "answer": 3,
      "explain": "FSDP all-gathers params twice (fwd+bwd) and reduce-scatters grads once: ~3&times; #params."
    },
    {
      "id": 9,
      "section": "ZeRO",
      "q": "Which memory does ZeRO-3 / FSDP NOT reduce?",
      "options": [
        "activation memory",
        "optimizer-state memory",
        "parameter memory",
        "gradient memory"
      ],
      "answer": 0,
      "explain": "FSDP shards params/grads/optimizer state but leaves activation memory untouched &mdash; that needs tensor/sequence parallel or recomputation."
    },
    {
      "id": 10,
      "section": "Pipeline",
      "q": "With \\(p\\) pipeline stages and \\(m\\) microbatches, the bubble (idle) fraction is:",
      "options": [
        "\\(p/m\\)",
        "\\((p-1)/m\\)",
        "\\(m/(p-1)\\)",
        "\\((p-1)/(p\\,m)\\)"
      ],
      "answer": 1,
      "explain": "Fill+drain wastes \\(p-1\\) slots out of \\(m\\) microbatches; many microbatches shrink the bubble."
    },
    {
      "id": 11,
      "section": "Pipeline",
      "q": "Why is pipeline parallel preferred for slow inter-node links?",
      "options": [
        "it requires no batching",
        "it has exactly zero bubble",
        "its communication is point-to-point and only activation-sized (\\(b\\,s\\,h\\)), so it tolerates low bandwidth",
        "it removes optimizer state"
      ],
      "answer": 2,
      "explain": "Pipeline transfers only activations between adjacent stages, point-to-point &mdash; cheap enough to span nodes."
    },
    {
      "id": 12,
      "section": "Tensor",
      "q": "In a Megatron tensor-parallel block, the forward-pass operator \\(g\\) is:",
      "options": [
        "the identity",
        "a broadcast",
        "a reduce-scatter",
        "an all-reduce (and in the backward pass \\(f\\) is the all-reduce, \\(g\\) the identity)"
      ],
      "answer": 3,
      "explain": "Forward: \\(f\\)=identity, \\(g\\)=all-reduce to sum partial outputs; backward swaps them."
    },
    {
      "id": 13,
      "section": "Tensor",
      "q": "Why is tensor parallelism kept within a single node?",
      "options": [
        "it puts a large all-reduce (~8 b s h) on the critical path each layer, so it needs NVLink; cross-node TP collapses throughput",
        "it requires large batches",
        "it cannot be combined with data parallel",
        "NCCL cannot do it across nodes"
      ],
      "answer": 0,
      "explain": "TP communicates per layer on the critical path; only intra-node NVLink bandwidth keeps it efficient (TP &le; 8)."
    },
    {
      "id": 14,
      "section": "Sequence",
      "q": "Sequence parallelism is introduced to shard which cost?",
      "options": [
        "optimizer state",
        "the leftover pointwise activations (LayerNorm/Dropout/IO, ~10 b s h) that tensor parallel leaves replicated",
        "parameter memory",
        "the KV cache at inference"
      ],
      "answer": 1,
      "explain": "Those ops are pointwise over the sequence, so sharding along the sequence axis makes activation memory scale linearly."
    },
    {
      "id": 15,
      "section": "3D",
      "q": "The standard 3D-parallelism rule of thumb is:",
      "options": [
        "data parallel within a node, tensor across nodes, pipeline to fill",
        "pipeline within a node, data across nodes, tensor last",
        "tensor parallel within a node (&le;8, NVLink), pipeline across nodes, data parallel for the rest",
        "always equal-sized splits on all three axes"
      ],
      "answer": 2,
      "explain": "TP&le;8 in-node on NVLink; PP across nodes to fit the model; DP spends remaining GPUs."
    },
    {
      "id": 16,
      "section": "3D",
      "q": "Large frontier runs (DeepSeek-V3, Llama 3, Gemma 2) typically use:",
      "options": [
        "pure data parallelism only",
        "tensor parallelism only, with TP=64",
        "pipeline parallelism only",
        "a stack of sharded-DP/ZeRO + tensor/sequence + pipeline (+ expert) &mdash; i.e. 3D+ parallelism"
      ],
      "answer": 3,
      "explain": "Each reported config combines several axes; no single scheme suffices at frontier scale."
    }
  ]
});
