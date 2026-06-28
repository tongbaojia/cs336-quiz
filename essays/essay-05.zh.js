/* "The Why" essay — 简体中文 (Lecture 5). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(5, {
  "read": 2,
  "blocks": [
    {
      "p": "一块 GPU，是一座飞快的工厂，硬拴在一座缓慢而庞大的仓库上。工厂是 tensor cores，仓库是 HBM——足足 80GB，中间只有一条窄路相连。一块 H100 每秒约跑 1e15 次 bf16 FLOPs，从显存读取的速度是 3.35 TB/s。两者一除：<strong>你每搬进 1 个 byte，就得配上大约 300 次 FLOPs</strong>，仅仅是为了不让工厂闲下来。"
    },
    {
      "p": "这个比值，就是整场游戏的全部。Arithmetic intensity（算术强度）是每搬运 1 个 byte 所完成的 FLOPs；而 roofline 说，你的实际速度只取决于两者中更小的那个——峰值算力，或是 intensity 乘以带宽。在脊点（H100 上约 ~300）之上，你处在 compute-bound 一侧，硅片才算物尽其用；在它之下，你处在 memory-bound 一侧：路被堵死，工厂只能空转。"
    },
    {
      "p": "几乎一切都活在这条线之下。一个 ReLU 对每个元素只做 1 次 FLOP，却要搬动 4 个 byte——intensity 0.25，比脊点低了足足上千倍。Softmax、LayerNorm、每一种 activation：都是同一个故事。只有大块的 matmul 越得过去，因为它们的 intensity 随尺寸攀升——一个 n×n 大约是 \\(n/3\\)。那些印在宣传页头条上的 TFLOPs，是一个你的数据搬运几乎从不让你够到的数字。"
    },
    {
      "p": "所以，真正要紧的优化，并不是少算——而是少搬。把一连串 op fuse 起来，让中间结果永不离开芯片。把一个 matmul 切成 tile，让每个从 HBM 拉出的值喂给多得多的乘法。与其把廉价的 activation 存下来，不如重新算一遍。FLOPs 一模一样，往返仓库的次数却只剩零头。"
    },
    {
      "callout": "当一个 kernel 慢下来，别去数 FLOPs——去数 byte。几十年来，算力一路把带宽甩在身后，而且每过一代 GPU，差距就拉得更大，所以你的工作负载只会逐年更多地滑到线下，而非更少。这活儿从来不是要少算——而是要停下你那一趟趟奔向仓库的脚步。",
      "kind": "key"
    }
  ]
});
