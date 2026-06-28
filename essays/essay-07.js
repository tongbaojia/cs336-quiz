/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(7, {
  "read": 2,
  "blocks": [
    {
      "p": "A 70B model under mixed-precision Adam needs <strong>~16 bytes per parameter</strong> — over a terabyte for weights, gradients, and optimizer state. An H100 holds 80&nbsp;GB. The model simply does not fit, so the unit of compute stops being the GPU and becomes the <strong>datacenter</strong>. Every parallelism scheme is one answer to a single question: how do you split the work while paying as little communication as possible?"
    },
    {
      "p": "There are only a few cuts. <strong>Data</strong> parallel splits the batch — cheap (one gradient all-reduce, \\(\\approx 2\\times\\) #params per step) — but it replicates all 16 bytes/param on every GPU, buying throughput and <em>zero</em> memory. <strong>Tensor</strong> parallel splits the matmuls along width; <strong>pipeline</strong> splits the layers along depth; <strong>sequence</strong> parallel shards the pointwise leftovers; ZeRO/FSDP shards the optimizer state, then the gradients, then the parameters themselves."
    },
    {
      "p": "Every one of those buys memory with bytes on the wire — and the wire has a cliff. NVLink inside a node is an order of magnitude faster than InfiniBand across nodes. That one fact dictates the whole layout: chatty schemes that hit an all-reduce on the critical path (tensor parallel) stay inside a node; quiet, point-to-point ones (pipeline) span nodes."
    },
    {
      "p": "The art is hiding the communication behind the compute. FSDP all-gathers the <em>next</em> layer's parameters while the current layer's matmul is still running, so the transfer never shows up on the clock. Frontier runs stack every cut — tensor-parallel \\(\\le 8\\) inside a node, pipeline across nodes, data parallel for the rest — into <strong>3D parallelism</strong> that holds per-GPU utilization roughly flat as the machine count grows."
    },
    {
      "callout": "Notice the whole zoo is priced in one unit: <strong>&ldquo;\\(2\\times\\) #params,&rdquo;</strong> the bytes of a single gradient all-reduce. You are never really choosing a parallelism strategy — you are choosing which scarce resource (memory, bandwidth, or batch size) you can most afford to spend.",
      "kind": "insight"
    }
  ]
});
