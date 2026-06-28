/* CS336 Companion essay — 简体中文 (Lecture 3). 信达雅 translation: technical terms kept in English;
   math \(..\), <strong>/<em>, numbers preserved verbatim. Pure ES5 data. */
registerEssayZh(3, {
  "read": 2,
  "blocks": [
    {
      "p": "把过去两年的 model card 一字排开，一桩怪事便赫然浮现：数十支团队，各自闭门训练，最终却收敛到了<em>同一套</em>架构。Pre-norm、RMSNorm、SwiGLU、RoPE、GQA。2017 年的那个 Transformer，被悄悄地逐个零件重造了一遍——而所有人，都落到了同一个答案上。"
    },
    {
      "p": "每一处改动都有它的理由。<strong>Pre-norm</strong> 把 norm 挪进 block 内部，让 residual 通路保持为一条干净的 identity——梯度无失真地流过，于是你可以调高 LR、跳过 warmup。<strong>RMSNorm</strong> 省去了均值中心化和 bias：质量相当，运算更少。<strong>SwiGLU</strong> 为 FFN 加上门控，换来小而稳定的增益。<strong>RoPE</strong> 旋转 Q/K，让 attention 只看到相对偏移 \\(i-j\\)。<strong>GQA</strong> 让多个 KV heads 共享，以缩小那个拖慢 decoding 的 cache。"
    },
    {
      "p": "请注意，有一样东西没能为这一切提供任何依据：理论。骨架——attention、residual、FFN——从未变过；每一处改动，都落在 normalization、位置编码或 FFN 之上。有人问 SwiGLU 为<em>何</em>有效，Shazeer 答道：'divine benevolence'（神之恩典）。这些选择不是靠辩论赢来的。它们靠的是活下来——跨越各种规模、团队，以及任何学者都无力重跑的预算。"
    },
    {
      "p": "但并非每个幸存者都是承重墙。Pre-norm 是背后有机制支撑的真正共识；GQA 是一场实打实的 inference 胜利——由 KV-cache 瓶颈逼出来，与质量无关。RMSNorm 和去掉 bias，是廉价又安全的效率提升。SwiGLU 以及那个精确的 \\(\\tfrac{8}{3}d_{model}\\) 比例，则只是小幅增益，其中一半不过是 cargo cult 式的盲从。第一类尽可放心照搬；其余的，就当作一片宽阔的盆地来对待。"
    },
    {
      "callout": "独立团队之间的趋同，是强有力的证据——但其中一部分是模仿，而非验证。这个教训比任何单独一个 block 都更深刻：你对什么<em>应该</em>有效的直觉，并不会迁移。会迁移的，是那些幸存者。前沿架构并非一道推导——它是一片 ablation 的墓地，只有赢家仍屹立其中。",
      "kind": "insight"
    }
  ]
});
