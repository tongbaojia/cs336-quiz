/* "The Why" essay — 简体中文 (Lecture 14, data processing). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(14, {
  "read": 2,
  "blocks": [
    {
      "p": "估计、打分、保留。你不可能把整个网络读一遍——那是数以万亿计的 token——所以你从不真正去「判定」什么是好的；你用某种廉价的手段去<em>估计</em>它，再让这个估计跑遍所有数据。Filtering（过滤）与 dedup（去重），藏着模型质量里大得出奇的一块，而二者谁都没碰一下架构。"
    },
    {
      "p": "Filtering 是同一个问题的三副面孔。给定一个很小的<strong>目标</strong>集 \\(T\\)（比方说类似 Wikipedia 的文本）和一个庞大的<strong>原始</strong>集 \\(R\\)，要从 \\(R\\) 中找出那个长得像 \\(T\\) 的子集——无论是 language ID、质量还是 toxicity，本质上都是这同一道题。麻烦在于：打分器得跑遍整个 \\(R\\)，所以它只能是个廉价的 proxy，而不能是个 transformer。一个线性的 fastText、或一个 5-gram 的 KenLM 就挑起了重担；你拿来换质量的是 throughput，而不是参数。"
    },
    {
      "p": "而「质量」是个危险的词。一个 quality classifier 压根不知道质量为何物——它被训练去把原始文本<em>修得像某个选定的参照</em>（Wikipedia、instruction data），所以「质量」其实是一种政策选择，它悄无声息地把那个参照集的盲点也一并进口了进来。把阈值开到最大，你便会过度过滤：Nemotron-CC 发现，FineWeb-Edu 和 DCLM 丢掉了 ~90% 的 token，把整片整片的方言尽数抹去。GPT-3 则<em>带着随机性</em>地保留文档，以免整体坍缩到那个参照之上。"
    },
    {
      "p": "接着是 dedup——Lee et al. 早已证明，它就是能让模型更好：更少的 train/test 泄漏，更少的逐字记忆，更少的算力被耗在重新学同一个字符串上——在 C4 里，某一条商品描述竟出现了 <strong>61,036 次</strong>。两两都比是平方级的开销，于是整盘游戏的要义，就是用 hash 把复杂度一路压到线性。<strong>MinHash</strong> 正是那一手：一种 hash，其碰撞概率<em>恰好等于</em> Jaccard 相似度，再经 LSH 的分带（band）锐化成一道近乎阶跃的阈值。"
    },
    {
      "callout": "这些事没有一件是光鲜的，而这恰恰是要点。前沿之所以把力气倾注于此，是因为 filtering 和 dedup 对 benchmark 数字的撬动，丝毫不亚于改动模型本身——DCLM 的 classifier 击败了启发式的 pipeline，dedup 是只赚不赔的，mixing 还能不花一分钱地为各个 domain 重新配权。估计、打分、保留。你最终交付的那个模型，大半就是你当初选择留下的那些数据。",
      "kind": "insight"
    }
  ]
});
