/* "The Why" essay — 简体中文 (Lecture 10, inference). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(10, {
  "read": 2,
  "blocks": [
    {
      "p": "一块 H100 能跑出 ~989 TFLOP/s；可一到生成文本，它多半在空转，干等着内存。这——而非算术——才是推理的全部主题：推理分作两个性格相反的阶段，难的却只有一个。"
    },
    {
      "p": "<strong>Prefill</strong> 一次性读入整个 prompt：一个庞大的 matmul，一如训练，compute-bound，一气呵成——它定下了 time-to-first-token。<strong>Decode</strong> 则一次只吐一个 token，而 token \\(t{+}1\\) 依赖 token \\(t\\)，因此你无法跨时间并行。每一步都要把<em>整个</em>模型读一遍，只为做一次矩阵-向量乘积——arithmetic intensity 只有 ~1，而 roofline 要的却是 ~295。加速器被活活饿着。"
    },
    {
      "p": "你真正在搬运的，是 <strong>KV cache</strong>：每一层、每个 head、每个历史 token 的 keys 与 values，统统存下来，省得反复重算。对 Llama-2-13B，在 batch 64、1k context 下，这便是 ~52 GB——比 26 GB 的权重还要多。Decode 的延迟，无非是读取的字节数除以 bandwidth，所以真正买单的是 cache，而非参数量。"
    },
    {
      "p": "于是整套工具箱坍缩成同一个动作。<strong>GQA, MQA, MLA</strong> 缩小 cache。<strong>Batching</strong> 把每一次权重读取分摊到众多请求之上。<strong>Speculative decoding</strong> 花掉廉价的 draft FLOPs，抹去串行的步骤——验证 \\(k\\) 个 token 只是一趟并行，逐个生成它们却要 \\(k\\) 趟。<strong>Quantization</strong> 让每个权重搬运的字节更少。论文各异，敌人只有一个：memory bandwidth。"
    },
    {
      "callout": "训练只需付一次钱；推理却要为每一个 token 付费，永无止境。把一个模型部署生涯里的开销悉数加总，推理算力会让当初造出它的那次 run 相形见绌——前沿实验室每天要服务 ~100B 个 token。那个谁都不觉得优雅的阶段，以美元计，才是真正的产品。说到底，一切都是内存的事。",
      "kind": "insight"
    }
  ]
});
