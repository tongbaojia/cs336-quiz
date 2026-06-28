/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(10, {
  "read": 2,
  "blocks": [
    {
      "p": "An H100 can do ~989 TFLOP/s; while generating text it mostly sits idle, waiting on memory. That — not arithmetic — is the entire subject of inference, which splits into two phases with opposite personalities, and only one is hard."
    },
    {
      "p": "<strong>Prefill</strong> reads the whole prompt at once: one fat matmul, like training, compute-bound, done — it sets time-to-first-token. <strong>Decode</strong> then emits one token at a time, and token \\(t{+}1\\) needs token \\(t\\), so you cannot parallelize across time. Every step reads the <em>entire</em> model to do a single matrix-vector product — arithmetic intensity ~1 against a roofline that wants ~295. The accelerator is starved."
    },
    {
      "p": "What you actually stream is the <strong>KV cache</strong>: keys and values for every layer, head, and past token, kept so you never recompute them. For Llama-2-13B at batch 64 and 1k context that is ~52 GB — more than the 26 GB of weights. Decode latency is just bytes read over bandwidth, so the cache, not the parameter count, sets the bill."
    },
    {
      "p": "Now the whole toolbox collapses into one move. <strong>GQA, MQA, MLA</strong> shrink the cache. <strong>Batching</strong> amortizes each weight read across many requests. <strong>Speculative decoding</strong> spends cheap draft FLOPs to delete sequential steps — verifying \\(k\\) tokens is one parallel pass; generating them is \\(k\\). <strong>Quantization</strong> moves fewer bytes per weight. Different papers, one enemy: memory bandwidth."
    },
    {
      "callout": "Training is paid once; inference is paid on every token, forever. Summed over a model's deployed life, inference compute dwarfs the run that created it — frontier labs serve ~100B tokens a day. The phase nobody finds elegant is, in dollars, the product. It really is all about the memory.",
      "kind": "insight"
    }
  ]
});
