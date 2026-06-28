/* CS336 Companion essay — 简体中文 (Lecture 2). 信达雅 translation: technical terms kept in English;
   math \(..\), <strong>/<em>, numbers and units preserved verbatim. Pure ES5 data. */
registerEssayZh(2, {
  "read": 2,
  "blocks": [
    {
      "p": "一次前沿训练的成本，听上去得靠超级计算机才能预估。其实，一张餐巾纸就够了。区区几个常数，便主宰了一切的开销——而唯一要紧的运算，只有 matmul。与它相比，每一个 elementwise op、每一个 norm，在渐进意义上都是免费的。"
    },
    {
      "p": "用 \\(A_{m\\times k}\\) 乘 \\(B_{k\\times n}\\)，要花 \\(2mnk\\) FLOPs——每个输出元素一次乘、一次加。把它沿网络层层串起来，对 \\(N\\) 个参数、\\(D\\) 个 token 而言，forward pass 就是 \\(2ND\\)。backward 对每个权重要做两次 matmul，而非一次：一次算权重的梯度，一次回传输入的梯度。这就是 \\(4ND\\)。"
    },
    {
      "p": "两者相加，训练成本 \\(\\approx 6ND\\)。这就是 <strong>rule of six</strong>——没有什么神秘常数，只是 forward 一次 matmul、backward 两次。inference 只做 forward，每个 token \\(\\approx 2N\\)；于是生成一个 token 的开销，仅为从一个 token 中学习的三分之一。"
    },
    {
      "p": "显存是第二笔同样固定的税。训练时，每个参数都要拖着 <strong>16 bytes</strong> 走完全程：4 个给它自己，4 个给它的梯度，8 个给 Adam 的两个 moment。mixed precision 只是把这些字节重新洗牌——bf16 的权重，加一份 fp32 的 master copy——最后照样落在 16。低精度换来的是更快的 matmul，而不是更小的占用。"
    },
    {
      "p": "现在，这张餐巾纸开始回本了。训练时间就是一道除法：\\(6ND\\) 除以 \\(n_{\\text{gpu}}\\times\\text{peak}\\times\\text{MFU}\\)，其中 MFU——你真正能持续维持的峰值占比——大约在 0.3 到 0.5 之间。能训练的最大模型，是另一道除法：GPU 总显存除以 16 bytes。八块 H100 大约封顶在 40B 参数——而这还没算进任何一个 activation。"
    },
    {
      "callout": "于是，一个 70B 模型在 15T tokens 上训练，就是 \\(6\\cdot 70\\text{e}9\\cdot 15\\text{e}12 \\approx 6.3\\times10^{24}\\) FLOPs——在 1024 块 H100、半个 MFU 下，约需 144 天。你刚刚就用一张餐巾纸，框定了一次前沿训练的规模。两条定律，两道除法：matmul 是唯一的成本项，其余一切，都是你早已知道的常数。",
      "kind": "insight"
    }
  ]
});
