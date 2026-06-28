/* "The Why" essay — 简体中文 (Lecture 6). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(6, {
  "read": 2,
  "blocks": [
    {
      "p": "一个 transformer 的运行时间，大半都花在搬运 byte，而非把它们相乘。Matmul 是唯一一个复用率高到足以成为 compute-bound 的 op；GeLU、softmax、LayerNorm——其余的一切——全都是 memory-bound，困在 HBM 上空转。所以写一个 kernel，归根结底只有一条纪律：能不碰 DRAM，就绝不碰。"
    },
    {
      "p": "先从 fusion（融合）说起。把一个 activation 写成一串 PyTorch op，每一个都自成一个 kernel——从仓库读入输入，再把结果写回，每个算子一趟往返。把这串 op fuse 进单个 kernel，每个中间结果便都留在片上：进来读一次，出去写一次。计算分毫不差，融合后的版本只是不再向 HBM 发五趟货而已。"
    },
    {
      "p": "Triton 让这件事写得出来。它把抽象从 thread 抬升到 block——你来挑 tile 和 mask，它替你打理 coalescing、shared memory，以及 SM 内部的调度。一个让每一行都常驻 SRAM 的 fused softmax，能把朴素写法里每元素 5 次的读取压到接近 1 次，甚至跑赢 PyTorch 自带的 op。所谓魔法，到头来不过是一笔关于「byte 究竟待在哪里」的明白账。"
    },
    {
      "p": "FlashAttention 把整个思想浓缩进一个 kernel。朴素的 attention 在 HBM 里建起完整的 N×N 分数矩阵，对它做 softmax，再读回来——O(N²) 的显存与流量，而这<em>正是</em>运行时间本身。换种做法：把 \\(Q\\)、\\(K\\)、\\(V\\) 切成 tile，借一个滚动的最大值与分母，让 softmax 跨 tile 接力，每落下一个 block，就用 \\(e^{m-m'}\\) 把累加器重新缩放。那张 N×N 矩阵自始至终不曾被写出。O(N²) 的显存就此变成 O(N)，而且<em>精确无误</em>。"
    },
    {
      "callout": "连 backward pass 也拒绝走仓库这一趟：与其存下那张 N×N 的概率矩阵，FlashAttention 索性从 \\(Q,K,V\\) 把它们重新算出来——更多 FLOPs，更少的 HBM 往返；既然瓶颈在显存，这笔交易就稳赚。一个快的 kernel，不靠什么奇异的算术，而靠那份「本不必搬的 byte，一个都不搬」的执拗。",
      "kind": "insight"
    }
  ]
});
