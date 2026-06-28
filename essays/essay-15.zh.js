/* "The Why" essay — 简体中文 (Lecture 15). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers preserved verbatim. Pure ES5 data. */
registerEssayZh(15, {
  "read": 3,
  "blocks": [
    {
      "p": "base model 是一座没有图书管理员的庞大图书馆。在网络上做 pretraining，让它<em>知道</em>一切，却<em>做</em>不到你要求的任何事——它只会续写文档，而非遵循指令。所以 alignment 不是往里灌注知识，而是让早已蕴藏其中的行为浮出水面。"
    },
    {
      "p": "<strong>SFT</strong> 打头阵，朴素得近乎令人难堪：在少量精挑细选的 (prompt, response) 对上做 maximum likelihood——与 pretraining 一模一样的 cross-entropy，只是数据换成了指令的形状。LIMA 仅用 <strong>1,000</strong> 条样本就 align 了一个 65B 模型。这就是<em>superficial alignment hypothesis</em>（表层对齐假说）：能力是在 pretraining 中习得的，SFT 只是挑选用哪一种嗓音说话。质胜于量——而去教模型一个它从未学过的事实，只会训练它在一无所知时也答得信誓旦旦。"
    },
    {
      "p": "SFT 只能模仿，而模仿的上限就是示范者本身：你克隆专家，连同其错误一并照单全收，永远无法超越。<strong>RLHF</strong> 换了个问法——不问「写出理想答案」，而问「这两个里哪个更好？」人做评判，远比亲手创作更可靠。一个 <strong>Bradley-Terry</strong> reward model 把这些比较转化为分数，\\(P(y_w \\succ y_l) = \\sigma(r_w - r_l)\\)，而 policy 则沿着它向上攀爬。"
    },
    {
      "p": "一个学出来的 reward 只在它的数据附近才诚实；逼得太狠，policy 就会找到些它给高分的胡言乱语——这是 Goodhart 定律的机械化重演。所以你用一道 KL penalty 把它拴在原模型上，\\(\\max\\, \\mathbb{E}[r] - \\beta\\, \\mathrm{KL}(\\pi \\,\\|\\, \\pi_{\\mathrm{ref}})\\)。拴得太松，它就 mode-collapse 成 reward-hacking；拴得太紧，它就寸步不移。调得恰到好处时，InstructGPT 那个 <strong>1.3B</strong> 的模型，在人类偏好上击败了 <strong>175B</strong> 的 GPT-3。"
    },
    {
      "callout": "alignment 是品味，而非知识。那个得力的助手早已住在 base model 之中；SFT 用一小撮样本把它请到台前，RLHF 则不靠规定标准答案、而靠在两者中偏好更优者来打磨它。你不是在教模型该知道什么——你是在教它，什么才算好。",
      "kind": "insight"
    }
  ]
});
