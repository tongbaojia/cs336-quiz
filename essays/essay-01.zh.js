/* "The Why" essay — 简体中文 (Lecture 1). 信达雅 exemplar: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(1, {
  "read": 2,
  "blocks": [
    {
      "p": "抛开那层神秘，语言模型不过是一场「如何花钱」的赌注。你有一份算力预算，一份数据预算；而准确率，就是你用它们买来的东西。整门课的核心方程只有一行——<strong>accuracy = efficiency × resources</strong>——其后的一切，从 tokenizer 到那唯一的一轮训练 epoch，都是有人在拒绝浪费哪怕一次 FLOP。"
    },
    {
      "p": "在玩具规模上，效率似乎可有可无；到了前沿，它便性命攸关：一次 $100M 的训练若有 2× 的低效，就等于 $50M 付之一炬。这才是对「苦涩的教训」（the bitter lesson）的诚实解读——不是<em>规模就是一切</em>，而是<em>能随规模扩展的算法才是关键</em>。"
    },
    {
      "p": "而在模型见到任何东西之前，你必须先为它选定字母表——每个选项都是陷阱。<strong>字符</strong>：约 15 万个符号的词表，绝大多数是生僻的废料。<strong>字节</strong>：优雅而通用，但压缩比恰好为 1，于是序列长度爆炸——而 attention 的开销随长度的<em>平方</em>增长。<strong>单词</strong>：词表无界，还附带一个 <code>UNK</code> token，在暗处悄悄毒化你的 perplexity。"
    },
    {
      "p": "<strong>BPE</strong> 干脆拒绝预先决定。从原始字节出发，反复把出现最频繁的相邻对粘合为一个新符号。字母表是从语料中<em>学</em>出来的——常见的串坍缩成单个 token，生僻的则继续支离破碎。说白了，这是个 hack；可它也存在于这十年间发布的每一个前沿模型之中。"
    },
    {
      "callout": "tokenizer 是那个人人都想删掉、却谁也删不掉的组件。它正是优雅败给效率的那道接缝——而这门课余下的部分，不过是同一场战斗，在技术栈的每一层里重新上演一遍。",
      "kind": "insight"
    }
  ]
});
