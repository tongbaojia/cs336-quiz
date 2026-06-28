/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 8,
  "estMinutes": 21,
  "topics": [
    "torch.distributed",
    "NCCL",
    "DDP",
    "tensor parallel",
    "FSDP"
  ],
  "overview": "Lecture 7 priced the parallelism strategies; this one <strong>builds them</strong>. We wire up <code>torch.distributed</code> collectives, benchmark real NCCL bandwidth, then implement data, tensor, and pipeline parallelism as ~10-line loops over deep MLPs &mdash; the compute bottleneck of a Transformer &mdash; tying every line back to the theory.",
  "sections": [
    {
      "id": "setup",
      "title": "Across-GPU: the hardware & the stack",
      "blocks": [
        {
          "p": "Last week was parallelism <em>within</em> a GPU (fusion, tiling to cut HBM traffic). This week is <em>across</em> GPUs, and the unifying theme is identical: <strong>compute is far from data</strong>, so orchestrate the work to avoid transfer bottlenecks &mdash; here by replication and sharding instead of recompute."
        },
        {
          "p": "The bandwidth hierarchy sets every design constraint. Concretely, on an H100:"
        },
        {
          "table": {
            "head": [
              "Link",
              "Scope",
              "Bandwidth"
            ],
            "rows": [
              [
                "HBM",
                "single GPU's own memory",
                "~3.9 TB/s"
              ],
              [
                "NVLink 4.0",
                "GPU&harr;GPU within a node (18 links)",
                "~900 GB/s"
              ],
              [
                "PCIe (gen)",
                "GPU&harr;GPU, older nodes",
                "~hundreds of GB/s"
              ],
              [
                "Ethernet",
                "across older nodes",
                "~200 MB/s"
              ]
            ]
          }
        },
        {
          "callout": "NVLink (~900 GB/s) is already ~4&times; slower than local HBM (~3.9 TB/s), and inter-node Ethernet is ~4 <em>orders of magnitude</em> below that. Cross-GPU communication is the resource to minimize and overlap &mdash; this is the whole reason the Lecture-7 layout rules exist.",
          "kind": "key"
        },
        {
          "h": "NCCL + torch.distributed"
        },
        {
          "p": "<strong>NCCL</strong> detects the hardware topology, picks optimal GPU-to-GPU paths, and launches CUDA kernels that turn collective ops into low-level packets. <code>torch.distributed</code> is the clean Python interface over it: pick a backend (<code>nccl</code> for GPU, <code>gloo</code> for CPU), then call collectives like <code>all_reduce</code> / <code>all_gather_into_tensor</code>."
        },
        {
          "code": "import os\nimport torch.distributed as dist\n\ndef setup(rank, world_size):\n    # rank 0 hosts the rendezvous; actual data still flows over NCCL\n    os.environ['MASTER_ADDR'] = 'localhost'\n    os.environ['MASTER_PORT'] = '15623'\n    backend = 'nccl' if torch.cuda.is_available() else 'gloo'\n    dist.init_process_group(backend, rank=rank, world_size=world_size)\n\ndef cleanup():\n    dist.destroy_process_group()",
          "lang": "python"
        },
        {
          "callout": "<strong>World size</strong> = number of devices; <strong>rank</strong> = this process's device id (\\(0 \\ldots n-1\\)). Every collective is collective &mdash; <em>all</em> ranks must call it, or you deadlock. This is the #1 distributed-bug source.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "collectives-code",
      "title": "Collectives, in code",
      "blocks": [
        {
          "p": "Each rank runs the same function asynchronously. The three workhorses &mdash; all-reduce, reduce-scatter, all-gather &mdash; and the identity tying them together, demonstrated on tiny tensors:"
        },
        {
          "code": "def collective_operations_main(rank, world_size):\n    setup(rank, world_size)\n\n    # --- All-reduce: result lands on every rank, modifies tensor IN PLACE ---\n    tensor = torch.tensor([0., 1, 2, 3], device=get_device(rank)) + rank\n    dist.all_reduce(tensor=tensor, op=dist.ReduceOp.SUM, async_op=False)\n\n    # --- Reduce-scatter: sum across ranks, keep only this rank's slice ---\n    input = torch.arange(world_size, dtype=torch.float32, device=get_device(rank)) + rank\n    output = torch.empty(1, device=get_device(rank))\n    dist.reduce_scatter_tensor(output=output, input=input, op=dist.ReduceOp.SUM, async_op=False)\n\n    # --- All-gather: collect slices so every rank holds the whole tensor ---\n    input = output  # feed reduce-scatter's output back in\n    output = torch.empty(world_size, device=get_device(rank))\n    dist.all_gather_into_tensor(output_tensor=output, input_tensor=input, async_op=False)\n    # ==> reduce-scatter THEN all-gather reproduces all-reduce, exactly as in Lecture 7\n\n    cleanup()",
          "lang": "python"
        },
        {
          "list": [
            "<code>all_reduce</code> aliases input and output &mdash; the tensor is overwritten in place; there is no separate result buffer.",
            "<code>op=dist.ReduceOp.SUM</code> (also <code>AVG</code>, <code>MIN</code>, <code>MAX</code>) is the associative reduction.",
            "<code>reduce_scatter_tensor</code> takes a length-\\(n\\) input per rank and returns a length-1 slice &mdash; the reduce, scattered.",
            "<code>async_op=False</code> blocks; <code>True</code> returns a handle you can <code>.wait()</code> on &mdash; the hook for overlapping communication with compute."
          ]
        },
        {
          "callout": "Running this prints the same final tensor on every rank from reduce-scatter + all-gather as from a single all-reduce &mdash; the Lecture-7 identity, executed. Reduce-scatter and all-gather are the atoms; all-reduce, DDP, and FSDP are all built from them.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "benchmarking",
      "title": "Benchmarking real bandwidth",
      "blocks": [
        {
          "p": "Theory says all-reduce moves ~\\(2\\times\\) the message; let's measure the achieved bandwidth. Warm up once (NCCL lazily builds rings), <code>cuda.synchronize()</code> + <code>barrier()</code> to fence the timing, then time a single call on ~100M floats:"
        },
        {
          "code": "def all_reduce(rank, world_size, num_elements):\n    setup(rank, world_size)\n    tensor = torch.randn(num_elements, device=get_device(rank))\n\n    dist.all_reduce(tensor=tensor, op=dist.ReduceOp.SUM, async_op=False)  # warmup\n    torch.cuda.synchronize(); dist.barrier()\n\n    start = time.time()\n    dist.all_reduce(tensor=tensor, op=dist.ReduceOp.SUM, async_op=False)\n    torch.cuda.synchronize(); dist.barrier()\n    duration = time.time() - start\n\n    # Effective bandwidth: each rank sends its input AND receives the result\n    size_bytes = tensor.element_size() * tensor.numel()\n    sent_bytes = size_bytes * 2 * (world_size - 1)   # the 2(n-1) of ring all-reduce\n    bandwidth = sent_bytes / (world_size * duration)\n    cleanup()",
          "lang": "python"
        },
        {
          "p": "The accounting is the ring formula made literal: <code>2 * (world_size - 1)</code> bytes move per element of message. Reduce-scatter is the same minus the return leg, so it drops the factor of 2:"
        },
        {
          "code": "# reduce-scatter: data only needs to be SENT, not returned\ndata_bytes = input.element_size() * input.numel()\nsent_bytes = data_bytes * (world_size - 1)   # no 2x here\nbandwidth = sent_bytes / (world_size * duration)",
          "lang": "python"
        },
        {
          "callout": "This is why Lecture 7 quotes all-reduce as &ldquo;\\(2\\times\\) #params&rdquo; but a lone reduce-scatter (or all-gather) as &ldquo;\\(1\\times\\)&rdquo;. FSDP's \\(3\\times\\) is literally two all-gathers + one reduce-scatter = \\(1+1+1\\). The cost model is not a metaphor &mdash; it falls straight out of the byte counts.",
          "kind": "insight"
        },
        {
          "callout": "Measure intra-node first (<code>world_size=4</code> on one box). A &ldquo;slow all-reduce&rdquo; is usually a topology problem &mdash; traffic crossing PCIe or Ethernet instead of NVLink. Always sanity-check achieved GB/s against the NVLink ceiling before blaming your model.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "data-parallel-impl",
      "title": "Data parallel: DDP from scratch",
      "blocks": [
        {
          "p": "Split the batch across ranks; each holds a <em>full</em> copy of the MLP. The forward/backward is ordinary single-GPU code &mdash; the <strong>only</strong> distributed line is a gradient all-reduce before the optimizer step:"
        },
        {
          "code": "def data_parallelism_main(rank, world_size, data, num_layers, num_steps):\n    setup(rank, world_size)\n\n    # Each rank takes its slice of the batch\n    local_batch_size = int_divide(data.size(0), world_size)\n    start = rank * local_batch_size\n    data = data[start:start + local_batch_size].to(get_device(rank))\n\n    params = [get_init_params(num_dim, num_dim, rank) for i in range(num_layers)]\n    optimizer = torch.optim.AdamW(params, lr=1e-3)   # each rank: own optimizer state\n\n    for step in range(num_steps):\n        # Forward (MLP = the Transformer compute bottleneck, so representative)\n        x = data\n        for param in params:\n            x = x @ param\n            x = F.gelu(x)\n        loss = x.square().mean()\n\n        loss.backward()\n\n        # The ONLY difference from single-GPU training:\n        for param in params:\n            dist.all_reduce(tensor=param.grad, op=dist.ReduceOp.AVG, async_op=False)\n\n        optimizer.step()\n    cleanup()",
          "lang": "python"
        },
        {
          "list": [
            "Losses differ across ranks (computed on local data); <strong>gradients</strong> are all-reduced to match, so parameters stay identical across ranks every step.",
            "<code>ReduceOp.AVG</code>, not <code>SUM</code>: each rank's grad comes from a \\(1/N\\) batch shard, and averaging reconstructs the full-batch gradient.",
            "Optimizer state is replicated &mdash; exactly the 16-bytes/param waste ZeRO-1 removes."
          ]
        },
        {
          "callout": "This loop all-reduces each parameter <em>separately and synchronously</em> &mdash; correct but slow. Production DDP <strong>buckets</strong> gradients into ~25&nbsp;MB groups and fires each bucket's all-reduce from a backward hook the moment its grads are ready, so communication of early layers <em>overlaps</em> the backward compute of later ones. The math is unchanged; the wall-clock is far better.",
          "kind": "key"
        },
        {
          "callout": "Overlap depends on bucket ordering matching backward order. A parameter that's always unused (no grad) stalls its bucket forever &mdash; the classic <code>find_unused_parameters</code> hang. Comm/compute overlap is a scheduling problem, not just a collective call.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "tensor-parallel-impl",
      "title": "Tensor parallel: a sharded matmul",
      "blocks": [
        {
          "p": "Now cut the model along <em>width</em>. Each rank owns a \\(1/N\\) column-slice of every layer's weight, computes a partial activation, then <strong>all-gathers</strong> the slices and concatenates to reconstruct the full activation for the next layer:"
        },
        {
          "code": "def tensor_parallelism_main(rank, world_size, data, num_layers):\n    setup(rank, world_size)\n    data = data.to(get_device(rank))\n    batch_size, num_dim = data.size(0), data.size(1)\n    local_num_dim = int_divide(num_dim, world_size)   # shard the width\n\n    # Each rank gets 1/world_size of every layer's parameters\n    params = [get_init_params(num_dim, local_num_dim, rank) for i in range(num_layers)]\n\n    x = data\n    for i in range(num_layers):\n        x = x @ params[i]      # (batch_size x local_num_dim): a partial activation\n        x = F.gelu(x)\n\n        # Gather the column-shards from all ranks ...\n        activations = [torch.empty(batch_size, local_num_dim, device=get_device(rank))\n                       for _ in range(world_size)]\n        dist.all_gather(tensor_list=activations, tensor=x, async_op=False)\n        x = torch.cat(activations, dim=1)   # ... -> (batch_size x num_dim)\n    cleanup()",
          "lang": "python"
        },
        {
          "callout": "Contrast with data parallel: DP keeps the model whole and communicates <strong>gradients</strong> once per step; TP shards the model and communicates <strong>activations</strong> every layer. That per-layer, on-critical-path traffic is why Lecture 7 insists TP stays intra-node on NVLink.",
          "kind": "connection"
        },
        {
          "p": "This toy uses GELU(non-linearity) after the gather for clarity; real Megatron places the collective so \\(f\\)=identity / \\(g\\)=all-reduce on the forward and the reverse on the backward, fusing the partial-sum reduction into the block. The backward pass here is left as the homework exercise."
        },
        {
          "callout": "Notice TP needs no large batch and has no bubble &mdash; the activation gather is the entire tax. The deep-MLP target is deliberate: MLP blocks dominate Transformer FLOPs, so a sharded-MLP microbenchmark predicts the real model's behavior.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "pipeline-fsdp",
      "title": "Pipeline parallel & FSDP mechanics",
      "blocks": [
        {
          "p": "The third cut is <em>depth</em>: each rank owns a contiguous block of layers and passes activations downstream with point-to-point <code>send</code>/<code>recv</code>. Splitting the batch into microbatches keeps later stages from idling:"
        },
        {
          "code": "def pipeline_parallelism_main(rank, world_size, data, num_layers, num_micro_batches):\n    setup(rank, world_size)\n    data = data.to(get_device(rank))\n    local_num_layers = int_divide(num_layers, world_size)\n    local_params = [get_init_params(num_dim, num_dim, rank) for i in range(local_num_layers)]\n\n    # Microbatch to minimize the bubble (rank 0 splits the data; others allocate buffers)\n    micro_batch_size = int_divide(data.size(0), num_micro_batches)\n    if rank == 0:\n        micro_batches = data.chunk(chunks=num_micro_batches, dim=0)\n    else:\n        micro_batches = [torch.empty(micro_batch_size, num_dim, device=get_device(rank))\n                         for _ in range(num_micro_batches)]\n\n    for x in micro_batches:\n        if rank - 1 >= 0:\n            dist.recv(tensor=x, src=rank - 1)        # receive from previous stage\n        for param in local_params:\n            x = x @ param\n            x = F.gelu(x)\n        if rank + 1 < world_size:\n            dist.send(tensor=x, dst=rank + 1)        # send to next stage\n    cleanup()",
          "lang": "python"
        },
        {
          "callout": "<code>send</code>/<code>recv</code> are point-to-point, not collectives &mdash; the cheap, inter-node-friendly comm pattern from Lecture 7. More microbatches shrink the \\((p-1)/n_{\\text{micro}}\\) bubble, but this toy doesn't yet overlap the send/recv with compute to fully eliminate it.",
          "kind": "connection"
        },
        {
          "h": "FSDP: the missing fourth strategy"
        },
        {
          "p": "Data parallel above replicates the model; <strong>FSDP</strong> (ZeRO-3) shards it across the data-parallel ranks and reconstructs each layer just-in-time. The mechanics are pure reduce-scatter / all-gather:"
        },
        {
          "list": [
            "<strong>Forward</strong>: before a layer runs, <code>all_gather</code> its parameter shards into the full weight; run the layer; immediately free the gathered params.",
            "<strong>Backward</strong>: <code>all_gather</code> the params again for the grad computation, then <code>reduce_scatter</code> the gradients so each rank keeps only its shard.",
            "<strong>Overlap</strong>: prefetch the next layer's all-gather during the current layer's compute &mdash; this hides the comm and is what makes FSDP's \\(3\\times\\) traffic affordable."
          ]
        },
        {
          "code": "# FSDP layer step (conceptual): build from the same primitives\nfull_w = all_gather(local_w_shard)        # reconstruct params for this layer\ny = layer(x, full_w)\nfree(full_w)                              # drop the full copy right away\n# ... backward ...\nfull_w = all_gather(local_w_shard)        # gather again for grads\ngrad_shard = reduce_scatter(full_grad)    # keep only my slice of the gradient",
          "lang": "python"
        },
        {
          "callout": "Two all-gathers + one reduce-scatter = \\(3\\times\\) #params, exactly the Lecture-7 number. PyTorch ships this as <code>FullyShardedDataParallel</code>; on Jax/TPU you'd just declare the sharding and let the compiler emit these collectives. Building it from primitives is how you understand what those one-liners actually cost.",
          "kind": "key"
        }
      ]
    }
  ],
  "takeaways": [
    "Cross-GPU bandwidth (NVLink ~900 GB/s) is ~4&times; below local HBM (~3.9 TB/s) and inter-node is far worse &mdash; communication is the thing to minimize and overlap.",
    "NCCL + torch.distributed: pick nccl (GPU) / gloo (CPU); collectives are in-place and must be called by every rank or you deadlock.",
    "reduce-scatter + all-gather reproduces all-reduce in code; benchmarking confirms all-reduce moves 2(n-1)&times; bytes, reduce-scatter (n-1)&times; &mdash; the source of the 2&times;/3&times; cost models.",
    "DDP = ordinary training + one ReduceOp.AVG gradient all-reduce; production speedups come from bucketing grads and overlapping the all-reduce with the backward pass.",
    "Tensor parallel shards width and all-gathers activations every layer (intra-node); pipeline shards depth and uses point-to-point send/recv with microbatches (inter-node).",
    "FSDP/ZeRO-3 shards params and reconstructs them just-in-time: all-gather for forward, all-gather + reduce-scatter for backward, prefetched to overlap compute &mdash; 3&times; #params total."
  ],
  "references": [
    {
      "label": "CS336 Lecture 8 — Parallelism Implementation (Liang)",
      "url": "https://cs336.stanford.edu/"
    },
    {
      "label": "PyTorch torch.distributed documentation",
      "url": "https://pytorch.org/docs/stable/distributed.html"
    },
    {
      "label": "Li et al. 2020 — PyTorch Distributed (DDP, gradient bucketing)",
      "url": "https://arxiv.org/abs/2006.15704"
    },
    {
      "label": "Zhao et al. 2023 — PyTorch FSDP",
      "url": "https://arxiv.org/abs/2304.11277"
    },
    {
      "label": "NCCL performance / how to reason about collectives",
      "url": "https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md"
    },
    {
      "label": "stas00 — all_reduce bandwidth benchmark",
      "url": "https://github.com/stas00/ml-engineering/blob/master/network/benchmarks/all_reduce_bench.py"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Setup",
      "q": "In <code>setup()</code>, which backend is chosen?",
      "options": [
        "nccl when CUDA is available, gloo otherwise",
        "always gloo",
        "nccl on CPU, gloo on GPU",
        "mpi in all cases"
      ],
      "answer": 0,
      "explain": "GPU collectives go through NCCL; gloo is the CPU fallback."
    },
    {
      "id": 2,
      "section": "Setup",
      "q": "What do world_size and rank denote?",
      "options": [
        "rank = total devices, world_size = this device",
        "world_size = total number of devices; rank = this process's device id",
        "they are interchangeable",
        "rank = number of nodes"
      ],
      "answer": 1,
      "explain": "World size is the device count; rank in 0..world_size-1 identifies the calling process."
    },
    {
      "id": 3,
      "section": "Collectives",
      "q": "What does <code>dist.all_reduce(tensor, op=SUM)</code> do to <code>tensor</code>?",
      "options": [
        "returns a new reduced tensor, leaving the input intact",
        "reduces only on rank 0",
        "overwrites it in place &mdash; input and output are aliased",
        "requires a separate output buffer"
      ],
      "answer": 2,
      "explain": "all_reduce is in-place; the tensor is both the input and the destination on every rank."
    },
    {
      "id": 4,
      "section": "Collectives",
      "q": "The code demonstrates which equivalence?",
      "options": [
        "all-gather = broadcast + reduce",
        "reduce = scatter + gather",
        "all-reduce = a single broadcast",
        "all-reduce = reduce-scatter followed by all-gather"
      ],
      "answer": 3,
      "explain": "Feeding reduce-scatter's output into all-gather yields the same per-rank result as all-reduce."
    },
    {
      "id": 5,
      "section": "Collectives",
      "q": "<code>async_op=True</code> on a collective is the hook for:",
      "options": [
        "overlapping communication with compute (returns a handle to .wait() on)",
        "lower memory use",
        "switching to gloo",
        "disabling NCCL"
      ],
      "answer": 0,
      "explain": "Async collectives return immediately; you wait later, letting compute proceed concurrently."
    },
    {
      "id": 6,
      "section": "Benchmarking",
      "q": "The all-reduce effective-bandwidth code sets <code>sent_bytes</code> to:",
      "options": [
        "size_bytes",
        "size_bytes * 2 * (world_size - 1)",
        "size_bytes * world_size",
        "size_bytes / world_size"
      ],
      "answer": 1,
      "explain": "Ring all-reduce moves 2(n-1) bytes per message element &mdash; each rank both sends input and receives the result."
    },
    {
      "id": 7,
      "section": "Benchmarking",
      "q": "Why does the reduce-scatter benchmark drop the factor of 2?",
      "options": [
        "it runs on CPU",
        "it uses fp16",
        "data only needs to be sent (scattered), with no return all-gather leg",
        "it is point-to-point"
      ],
      "answer": 2,
      "explain": "Reduce-scatter is half of all-reduce: send the reduced data once, no gather-back, so sent_bytes = data_bytes * (n-1)."
    },
    {
      "id": 8,
      "section": "DDP",
      "q": "In the DDP loop, the ONLY change from single-GPU training is:",
      "options": [
        "sharding the optimizer state",
        "moving data to CPU",
        "switching to the gloo backend",
        "all-reducing each <code>param.grad</code> (AVG) before <code>optimizer.step()</code>"
      ],
      "answer": 3,
      "explain": "Forward/backward are unchanged; one gradient all-reduce keeps replicas in sync."
    },
    {
      "id": 9,
      "section": "DDP",
      "q": "Why <code>ReduceOp.AVG</code> rather than <code>SUM</code> for the gradients?",
      "options": [
        "each rank's grad is from a 1/N batch shard, so averaging reconstructs the full-batch gradient",
        "SUM overflows in BF16",
        "AVG is faster than SUM",
        "SUM is unsupported by NCCL"
      ],
      "answer": 0,
      "explain": "Averaging the per-shard gradients equals the gradient of the full batch; SUM would scale the LR by N."
    },
    {
      "id": 10,
      "section": "DDP",
      "q": "How does production DDP beat the naive per-parameter all-reduce loop?",
      "options": [
        "one giant all-reduce after the entire backward finishes",
        "bucket gradients and fire each bucket's all-reduce from a backward hook, overlapping comm with compute",
        "skip the all-reduce entirely",
        "convert to pipeline parallel"
      ],
      "answer": 1,
      "explain": "Bucketed, hook-driven all-reduces overlap early-layer communication with later-layer backward compute."
    },
    {
      "id": 11,
      "section": "Tensor parallel",
      "q": "After the local sharded matmul, the tensor-parallel code does what to rebuild the full activation?",
      "options": [
        "reduce-scatter then split",
        "broadcast from rank 0",
        "<code>all_gather</code> the per-rank column-shards and <code>torch.cat</code> them along the feature dim",
        "nothing &mdash; the output is already complete"
      ],
      "answer": 2,
      "explain": "Each rank computes a (batch x local_num_dim) slice; all_gather + concat reconstructs (batch x num_dim)."
    },
    {
      "id": 12,
      "section": "Tensor parallel",
      "q": "Why benchmark these strategies on deep MLPs?",
      "options": [
        "attention is computationally free",
        "MLPs have no parameters to shard",
        "Transformers contain no MLPs",
        "MLP blocks are the compute bottleneck of a Transformer, so MLP results are representative"
      ],
      "answer": 3,
      "explain": "The lecture notes MLPs dominate Transformer compute, making the sharded-MLP microbenchmark predictive."
    },
    {
      "id": 13,
      "section": "Pipeline",
      "q": "Inter-stage communication in the pipeline implementation uses:",
      "options": [
        "<code>dist.send</code> / <code>dist.recv</code> &mdash; point-to-point between adjacent ranks",
        "<code>dist.all_reduce</code>",
        "<code>dist.broadcast</code>",
        "<code>dist.reduce_scatter</code>"
      ],
      "answer": 0,
      "explain": "Pipeline passes activations downstream with point-to-point send/recv, the inter-node-friendly pattern."
    },
    {
      "id": 14,
      "section": "Pipeline",
      "q": "Splitting the batch with <code>data.chunk</code> into microbatches reduces:",
      "options": [
        "parameter memory",
        "the pipeline bubble (stage idle time), at the cost of needing a larger batch",
        "communication volume",
        "optimizer state size"
      ],
      "answer": 1,
      "explain": "More microbatches shrink the (p-1)/n_micro bubble; the tradeoff is requiring a big enough batch."
    },
    {
      "id": 15,
      "section": "FSDP",
      "q": "FSDP's forward/backward communication pattern is:",
      "options": [
        "all-reduce params, then all-reduce grads",
        "broadcast params once, no gradient communication",
        "all-gather params just-in-time for forward; all-gather again + reduce-scatter grads in backward",
        "scatter params, gather grads"
      ],
      "answer": 2,
      "explain": "Two all-gathers (fwd + bwd) plus one reduce-scatter of grads = 3x #params, prefetched to overlap compute."
    },
    {
      "id": 16,
      "section": "Hardware",
      "q": "Given NVLink ~900 GB/s vs HBM ~3.9 TB/s on an H100, the implication is:",
      "options": [
        "cross-GPU communication is faster than local memory",
        "they are equal",
        "HBM is the inter-node network",
        "cross-GPU NVLink is ~4&times; slower than local HBM, so communication must be minimized and overlapped"
      ],
      "answer": 3,
      "explain": "Even the fastest GPU-to-GPU link is several times slower than local memory; comm dominates and must be hidden."
    }
  ]
});
