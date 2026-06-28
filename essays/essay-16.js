/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(16, {
  "read": 3,
  "blocks": [
    {
      "p": "Every learned reward can be hacked. RLHF optimizes a model's <em>guess</em> at human preference; push it hard enough and the policy finds garbage the guess loves — Goodhart caps how far you can run. But some answers you do not have to guess about. You can <em>check</em> them."
    },
    {
      "p": "<strong>RLVR</strong> — RL with verifiable rewards — throws out the learned reward model and scores correctness directly: does the answer match, do the unit tests pass. The reward is binary, programmatic, ground truth itself — nothing to game. So you can loosen the KL leash and push RL far past where RLHF collapses."
    },
    {
      "p": "The optimizer that made this cheap is <strong>GRPO</strong>. PPO trains a value network — a second model, half your memory, finicky — just to get a baseline. GRPO deletes it: sample a <strong>group</strong> of \\(G\\) answers to one prompt and let the group be its own baseline, each answer's advantage its reward z-scored against its siblings, \\(\\hat{A}_i = (r_i - \\mathrm{mean})/\\mathrm{std}\\). No critic, a few dozen lines."
    },
    {
      "p": "Then the surprise. Run GRPO on <strong>DeepSeek-V3</strong> with two dumb rule-based rewards — is the answer right, did it use the thinking tags — and nothing else: no demonstrations, no process supervision, no MCTS. The chains of thought lengthen on their own; the model learns to check itself and backtrack. The 'aha moment' was not taught — it was latent in the base model, and correctness alone pulled it out."
    },
    {
      "callout": "Verifiability is the whole game. A reward you can <em>check</em> instead of <em>learn</em> has no error to exploit — so you optimize through it as hard as you like, and out comes reasoning nobody wrote down. The hard part just moves: <strong>reward design and rollout infrastructure</strong>. If you can verify it, you can grow it.",
      "kind": "insight"
    }
  ]
});
