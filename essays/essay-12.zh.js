/* "The Why" essay — 简体中文 (Lecture 12, evaluation). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(12, {
  "read": 2,
  "blocks": [
    {
      "p": "并不存在唯一为真的那个数字。每一次评测都是一个 proxy，而每个 proxy 都会漏——你改动某个与模型毫不相干的东西，分数就跟着变了。你的任务不是去信任排行榜，而是精确地搞清楚：每个指标究竟在怎样撒谎。"
    },
    {
      "p": "就拿 perplexity 说事吧——教科书里那个 intrinsic 指标：对每 token 的平均负对数似然取 \\(\\exp\\)。它感觉上很客观，实则并不可比。perplexity 是<em>按 token 计</em>的，而 token 又不是一个固定的单位——更细的 tokenizer 把同一段文本切成更多、更好预测的碎片，悄悄<em>压低</em>了每 token 的 perplexity；而更粗、词表更大的方案把更多信息塞进每个 token，反倒把它<em>抬高</em>。这个数字在不同 tokenizer 之间根本没法比。请改报 <strong>bits-per-byte</strong>，否则你就是在拿苹果比橘子。"
    },
    {
      "p": "选择题看起来更稳妥——把答案一对不就完了？可问题恰恰是怎么对。给字母 token 算 <code>p('A')</code>，你量的是 symbol-binding，对 position bias 极其脆弱；给完整答案串打分，你量的则是合理性（plausibility），可越长的答案联合概率越低，于是你又必须做长度归一化、或 PMI 归一化。<em>同一个</em>模型、<em>同一套</em> MMLU，光是换 harness、换 shot 数，分数就能晃出好几分。一个不附带配方的分数，就是噪声。"
    },
    {
      "p": "没有参考答案怎么办？那就请出一个 judge（裁判模型）——可这位裁判自己也满是成见：position bias、verbosity bias、self-preference。AlpacaEval 的招牌，是<em>由 GPT-4 来评判</em>的、相对 GPT-4 的胜率——一场质量比拼，却悄悄地为长度、为它自家的风格派发回报。哪怕是人类投票的 Arena Elo，也得附上 bootstrap 置信区间：区间一旦重叠便是平局，更何况它对「氛围」的奖赏，丝毫不亚于对「实质」的奖赏。"
    },
    {
      "callout": "这一切的底层，盘踞着 contamination（数据污染）。ML 101 教你别在 test set 上训练，可前沿模型吞下的是来源不公开、互联网规模的语料，于是 benchmark 悄悄渗进 pretraining，分数衡量的便成了记忆、而非真本事——一个全新搭出来的 GSM8K 克隆，就让准确率暴露出最高 ~13% 的跌幅。在你揪出那道泄漏之前，把每一个数字都当成注了水的。评测是一场对抗性的测量，而不是一块记分牌。",
      "kind": "insight"
    }
  ]
});
