/* "The Why" essay — 简体中文 (Lecture 11, scaling laws). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(11, {
  "read": 2,
  "blocks": [
    {
      "p": "Chinchilla 把最优的参数/token 配比递到你手上，随即在真正棘手的部分到来之前抽身离场：该用多宽的 width、多大的 learning rate、多大的 batch——以及如何负担得起那场回答这些问题的 sweep。它是最后一份完全公开的配方（2022）；自那以后的一切，都是各家实验室真正在跑的工程层。"
    },
    {
      "p": "其一，超参数会随规模漂移，而你无法在目标尺寸上直接调参。<strong>μP</strong> 重新缩放 init 与逐层的 LR，使 activations 及其单步更新后的变化在每个 width 下都维持 \\(\\Theta(1)\\)——把最优的 learning rate 牢牢钉在原处。在一个狭窄的 proxy 上调好，再 zero-shot 迁移到宽得多的模型上。它只掌管 width，因此 RMSNorm 的 gain 和过强的 weight decay 仍会让它失效；把它当作先验来信任，但要在大一号的尺寸上加以验证。"
    },
    {
      "p": "其二，Chinchilla 假设新鲜 token 取之不尽；可真实语料终会枯竭。data-constrained 定律告诉我们：重复在 ~4 epochs 以内几乎不费成本，此后迅速衰减，到 ~16 便趋于饱和。所以一旦越过一个 epoch，你就该停止清点原始 token，转而把<em>有效</em>数据喂进公式——否则，你的外推不过是盲目乐观的虚构。"
    },
    {
      "p": "其三，致命一击。Chinchilla 最小化的是<em>训练</em>算力，但一个已上线模型的终身账单，记的却是<em>推理</em>。把 serving 那一项加进去，最优点便滑向更小的 \\(N\\)、更多的 token。于是便有了在 15T token 上训练的 Llama-3 8B——每个参数 ~1875，而 Chinchilla 只要 20，几乎是「超出最优」的 100×。训练起来是浪费；可要服务十亿次，便完全理性。"
    },
    {
      "callout": "20:1 从来就不是什么定律——它只是训练算力的最优解，仅此而已。小规模调参再迁移、把数据回收利用到几个 epoch、刻意 over-train：每一次对教科书式 Chinchilla 的背离，都是某个实验室在优化它真正要付的那笔成本。所以，在你把一个模型称作「最优」之前，先把优化目标说清楚。",
      "kind": "insight"
    }
  ]
});
