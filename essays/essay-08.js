/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(8, {
  "read": 2,
  "blocks": [
    {
      "p": "Lecture 7 priced the parallelism strategies; this one builds them — and the punchline is how little code it takes. Strip away the framework and distributed training is three collectives — <code>all_reduce</code>, <code>all_gather</code>, <code>reduce_scatter</code> — plus the discipline of calling them on every rank without deadlocking."
    },
    {
      "p": "Data parallel is the cleanest demonstration. Take ordinary single-GPU training and add exactly one line: an all-reduce (<code>ReduceOp.AVG</code>) of each gradient before the optimizer step. Forward and backward are untouched; one collective keeps every replica's weights identical. AVG, not SUM — each rank's gradient came from a \\(1/N\\) shard of the batch, and averaging reconstructs the full-batch gradient."
    },
    {
      "p": "The Lecture 7 identity stops being algebra and becomes a unit test: feed reduce-scatter's output into all-gather and you get the same tensor as a single all-reduce, on every rank. The cost model then falls straight out of the byte counts — all-reduce moves \\(2(n-1)\\) bytes per element, reduce-scatter half that. FSDP's \\(3\\times\\) #params is literally two all-gathers plus one reduce-scatter."
    },
    {
      "p": "But correct is not fast. The naive loop all-reduces each parameter synchronously; production DDP <strong>buckets</strong> gradients and fires each bucket from a backward hook the instant its grads are ready, so the communication of early layers overlaps the backward compute of later ones. The math is unchanged; the wall-clock is far better. Overlap is a scheduling problem, not a collective call."
    },
    {
      "callout": "FSDP is the whole lecture in one instruction: <strong>shard everything, gather just-in-time.</strong> All-gather a layer's params right before you need them, free them right after, reduce-scatter its gradients — and prefetch the next layer's gather under the current matmul. <code>FullyShardedDataParallel</code> hides all of it; building it from primitives is how you learn what that one-liner actually costs.",
      "kind": "key"
    }
  ]
});
