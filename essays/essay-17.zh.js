/* "The Why" essay — 简体中文 (Lecture 17). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers preserved verbatim. Pure ES5 data. */
registerEssayZh(17, {
  "read": 3,
  "blocks": [
    {
      "p": "剥掉那些缩写，这里的每个方法都是同一个梯度：\\(\\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\, R\\)。采样一条 response，再按它的 reward 成比例地把概率<em>推向</em>它——好答案加权抬升，坏答案压低。这就是 <strong>REINFORCE</strong>，与 SFT loss 在结构上别无二致，只不过如今每条样本都按你喜欢它的程度被加了权。"
    },
    {
      "p": "问题出在 variance 上。可验证的 reward 是稀疏的——训练早期几乎每条样本都得零分，于是梯度大半是噪声。解法是一个 <strong>baseline</strong>：减去一个只依赖状态的 \\(b(s)\\)，estimator 仍保持无偏，方差却随之坍缩。减去均值，剩下的就是 <em>advantage</em>——相对于期望的 reward。此后的每个方法，都不过是对这一个数字的不同选法。"
    },
    {
      "p": "<strong>PPO</strong> 和 <strong>GRPO</strong> 不过是在这之上记账。PPO 通过追踪一个 importance ratio \\(\\pi_\\theta/\\pi_{\\theta_{\\mathrm{old}}}\\) 来跨多个 step 复用昂贵的 rollout，并对它做 <em>clipping</em>，使任何一次更新都不会迈得太远。GRPO 干脆把 PPO 的 value network 整个扔掉：采样一组，用组均值当 baseline，收工。不同的 variance 削减花招，底下是同一个梯度。"
    },
    {
      "p": "<strong>DPO</strong> 抛出了一个离经叛道的问题：你到底需不需要这整个循环？那个带 KL 正则的目标，有一个<em>闭式</em>最优解，\\(\\pi^* \\propto \\pi_{\\mathrm{ref}}\\exp(r/\\beta)\\)。把它反解出来，reward 就变成了你正在训练的 policy 的一个 log-ratio；将其代入 Bradley-Terry model，那个难以处理的 normalizer 便相互抵消。剩下的，是一个在 preference pairs 上的 classification loss——没有 reward model，没有采样，没有 rollout。"
    },
    {
      "callout": "归根结底只是一个梯度：抬升好的，压低坏的。REINFORCE、PPO、GRPO 不过是在争论该如何以更小的 variance 去估计那个权重；DPO 则主张，对 preference data 而言，你压根无需跑那个循环——最优 policy 本就是藏在目标函数里的一个闭式解。这座算法动物园，不过是同一个想法，披着多寡不一的记账外衣罢了。",
      "kind": "insight"
    }
  ]
});
