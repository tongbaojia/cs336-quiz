/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(17, {
  "read": 3,
  "blocks": [
    {
      "p": "Strip the acronyms and every method here is the same gradient: \\(\\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\, R\\). Sample a response and push probability <em>toward</em> it in proportion to its reward — good answers upweighted, bad ones down. That is <strong>REINFORCE</strong>, structurally identical to the SFT loss, except each example is now weighted by how much you liked it."
    },
    {
      "p": "The catch is variance. Verifiable rewards are sparse — early on almost every sample scores zero, so the gradient is mostly noise. The fix is a <strong>baseline</strong>: subtract a state-only \\(b(s)\\) and the estimator stays unbiased while its variance collapses. Subtract the mean and what remains is the <em>advantage</em> — reward relative to expectation. Every method after this is just a different choice of that one number."
    },
    {
      "p": "<strong>PPO</strong> and <strong>GRPO</strong> are bookkeeping on top. PPO reuses expensive rollouts across several steps by tracking an importance ratio \\(\\pi_\\theta/\\pi_{\\theta_{\\mathrm{old}}}\\) and <em>clipping</em> it so no update leaps too far. GRPO throws out PPO's value network entirely: sample a group, use the group mean as the baseline, done. Different variance-reduction tricks, same gradient underneath."
    },
    {
      "p": "<strong>DPO</strong> asks the heretical question: do you need the loop at all? The KL-regularized objective has a <em>closed-form</em> optimum, \\(\\pi^* \\propto \\pi_{\\mathrm{ref}}\\exp(r/\\beta)\\). Invert it and the reward becomes a log-ratio of the policy you are already training; drop that into the Bradley-Terry model and the intractable normalizer cancels. What is left is a classification loss on preference pairs — no reward model, no sampling, no rollouts."
    },
    {
      "callout": "It is all one gradient: upweight the good, downweight the bad. REINFORCE, PPO, and GRPO just argue over how to estimate the weight with less variance; DPO argues that for preference data you never needed to run the loop — the optimal policy was a closed form hiding in the objective. The algorithm zoo is one idea wearing different amounts of bookkeeping.",
      "kind": "insight"
    }
  ]
});
