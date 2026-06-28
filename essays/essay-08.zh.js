/* "The Why" essay — 简体中文 (Lecture 8). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(8, {
  "read": 2,
  "blocks": [
    {
      "p": "第 7 讲给各种并行策略标好了价，这一讲则把它们真正搭出来——而妙就妙在，所需的代码少得惊人。剥掉框架，分布式训练不过是三个 collective——<code>all_reduce</code>、<code>all_gather</code>、<code>reduce_scatter</code>——外加一条纪律：在每个 rank 上都把它们调用一遍，而且不能死锁。"
    },
    {
      "p": "数据并行是最干净的示范。拿来普通的单 GPU 训练，只加恰好一行：在优化器更新之前，对每个梯度做一次 all-reduce（<code>ReduceOp.AVG</code>）。forward 和 backward 丝毫不动；仅靠这一个 collective，就能让每个 replica 的权重保持完全一致。是 AVG，不是 SUM——每个 rank 的梯度都只来自 batch 的一个 \\(1/N\\) 分片，取平均恰好重建出整个 batch 的梯度。"
    },
    {
      "p": "第 7 讲里那个恒等式不再只是代数，而成了一个单元测试：把 reduce-scatter 的输出喂给 all-gather，你会在每个 rank 上得到与单次 all-reduce 完全相同的 tensor。代价模型于是直接从字节数里掉了出来——all-reduce 每个元素搬运 \\(2(n-1)\\) bytes，reduce-scatter 只要一半。FSDP 的 \\(3\\times\\) #params 说穿了，就是两次 all-gather 加一次 reduce-scatter。"
    },
    {
      "p": "但正确并不等于快。朴素的循环会同步地对每个参数做 all-reduce；而生产级的 DDP 会把梯度<strong>分桶</strong>，某个桶的梯度一就绪，就立刻从一个 backward hook 里把它发出去——这样靠前各层的通信，便与靠后各层的 backward 计算重叠了起来。数学丝毫未变，wall-clock 时间却短得多。重叠是个调度问题，而不是某一次 collective 调用。"
    },
    {
      "callout": "FSDP 就是把整堂课压进一条指令：<strong>一切皆分片，用时才即时 gather。</strong>在用到某一层的参数前一刻，把它们 all-gather 进来，用完立刻释放，再用 reduce-scatter 处理它的梯度——同时在当前 matmul 的掩护下，预取下一层的 gather。<code>FullyShardedDataParallel</code> 把这一切都藏了起来；而亲手用这些原语把它搭出来，你才会真正明白那行一句话的 API 到底要花多少代价。",
      "kind": "key"
    }
  ]
});
