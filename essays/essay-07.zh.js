/* "The Why" essay — 简体中文 (Lecture 7). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(7, {
  "read": 2,
  "blocks": [
    {
      "p": "在混合精度 Adam 下，一个 70B 模型 <strong>每个参数约需 16 bytes</strong>——光是权重、梯度和优化器状态加起来，就超过一个 terabyte。一块 H100 才 80&nbsp;GB，模型根本塞不下；于是算力的基本单位不再是 GPU，而是整座<strong>数据中心</strong>。每一种并行方案，都是在回答同一个问题：如何切分工作，同时把通信的代价压到最低？"
    },
    {
      "p": "切法其实就那么几种。<strong>数据</strong>并行切的是 batch——很便宜（每步一次梯度 all-reduce，\\(\\approx 2\\times\\) #params）——但它会在每块 GPU 上把全部 16 bytes/param 复制一遍，换来的是吞吐，省下的显存却是<em>零</em>。<strong>张量</strong>并行把 matmul 沿宽度切开；<strong>流水线</strong>并行把层沿深度切开；<strong>序列</strong>并行把剩下的逐点运算分片；ZeRO/FSDP 则先分片优化器状态，再分片梯度，最后连参数本身也一并分片。"
    },
    {
      "p": "而这些做法，每一种都是用网络上传输的字节去换显存——可这根『线』上偏偏有一道悬崖。节点内的 NVLink，比跨节点的 InfiniBand 快上整整一个数量级。仅凭这一个事实，就定下了整个布局：那些话痨似的、会在关键路径上撞上 all-reduce 的方案（如张量并行），只能憋在单个节点之内；而安静的、点对点的方案（如流水线并行），才能横跨多个节点。"
    },
    {
      "p": "真正的功夫，在于把通信藏到计算背后。当前层的 matmul 还在跑，FSDP 就已经在 all-gather <em>下一</em>层的参数了，于是这次传输根本不会出现在计时器上。前沿的大模型训练会把每一种切法都叠起来——节点内张量并行 \\(\\le 8\\)、跨节点流水线并行、剩下的全交给数据并行——拼成 <strong>3D parallelism</strong>，让每块 GPU 的利用率在机器数量增长时几乎纹丝不动。"
    },
    {
      "callout": "注意：这一整座『动物园』般的花样，都用同一个单位标价——<strong>&ldquo;\\(2\\times\\) #params,&rdquo;</strong>，也就是一次梯度 all-reduce 所搬运的字节数。你从来都不是在挑选某种并行策略——你真正在挑的是：显存、带宽、batch size 这几样稀缺资源里，哪一样你最花得起。",
      "kind": "insight"
    }
  ]
});
