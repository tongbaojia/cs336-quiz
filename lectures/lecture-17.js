/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 17,
  "estMinutes": 21,
  "topics": [
    "policy gradient",
    "PPO",
    "GRPO",
    "DPO",
    "RLHF"
  ],
  "overview": "Alignment as optimization: once you can <em>score</em> a response, you can push a policy toward higher reward. This lecture builds the policy-gradient stack from <strong>REINFORCE</strong> (the log-derivative trick) through variance-reducing <strong>baselines/advantages</strong>, the <strong>PPO</strong> clipped surrogate, and <strong>GRPO</strong>'s critic-free group baseline — then derives <strong>DPO</strong>, which collapses the entire RLHF reward-model-plus-RL loop into a single supervised classification loss.",
  "sections": [
    {
      "id": "rl-setup",
      "title": "RL for language models: the setup",
      "blocks": [
        {
          "p": "Frame post-training as a tiny MDP over tokens. The <strong>state</strong> \\(s\\) is the prompt plus the response generated so far; an <strong>action</strong> \\(a\\) is the next token; the <strong>transition</strong> is deterministic, \\(s' = s + a\\); and the <strong>policy</strong> \\(\\pi_\\theta(a \\mid s)\\) is just a (fine-tuned) language model. For notation we let \\(a\\) denote the entire response and \\(R(s, a)\\) the terminal reward."
        },
        {
          "list": [
            "<strong>Outcome reward</strong>: scores the whole response, not per token — e.g. whether the final answer is correct.",
            "<strong>Verifiable reward</strong>: deterministic to compute (unit tests, exact-match), so no learned reward model and no reward-hacking surface at the reward itself.",
            "Discounting and bootstrapping barely matter here: one terminal reward, deterministic dynamics.",
            "States are 'made up' (unlike robotics), so planning and test-time compute are essentially free."
          ]
        },
        {
          "math": "J(\\theta) = \\mathbb{E}_{\\,s \\sim p(\\cdot),\\; a \\sim \\pi_\\theta(\\cdot \\mid s)}\\big[\\, R(s, a) \\,\\big]"
        },
        {
          "callout": "<strong>Objective:</strong> maximize expected reward \\(J(\\theta) = \\mathbb{E}[R]\\), the expectation taken over prompts \\(s\\) and sampled response tokens \\(a \\sim \\pi_\\theta\\). Everything below is a way to estimate \\(\\nabla_\\theta J\\) with low enough variance to actually learn.",
          "kind": "key"
        },
        {
          "callout": "The whole pitch of RL over SFT: <em>if you can measure it, you can optimize it.</em> SFT can only imitate demonstrations; RL on a verifiable reward can surpass them — this is how DeepSeek-R1 elicited long chain-of-thought reasoning from nothing but correctness signals.",
          "kind": "insight"
        },
        {
          "quote": "If you can measure it, you can optimize it.",
          "cite": "Percy Liang, CS336 Lecture 17"
        }
      ]
    },
    {
      "id": "policy-gradient",
      "title": "Policy gradient / REINFORCE",
      "blocks": [
        {
          "p": "We want \\(\\nabla_\\theta J\\), but \\(a\\) is sampled <em>from</em> \\(\\pi_\\theta\\), so the parameter appears in the sampling distribution. The <strong>log-derivative (REINFORCE) trick</strong> moves the gradient inside the expectation using \\(\\nabla_\\theta \\pi = \\pi\\, \\nabla_\\theta \\log \\pi\\):"
        },
        {
          "math": "\\begin{aligned} \\nabla_\\theta J &= \\int p(s)\\, \\nabla_\\theta \\pi_\\theta(a \\mid s)\\, R(s,a) \\\\ &= \\int p(s)\\, \\pi_\\theta(a \\mid s)\\, \\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\, R(s,a) \\\\ &= \\mathbb{E}\\big[\\, \\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\, R(s,a) \\,\\big] \\end{aligned}"
        },
        {
          "p": "This is <strong>REINFORCE</strong>: sample a prompt \\(s\\), sample a response \\(a \\sim \\pi_\\theta\\), and ascend \\(\\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\, R(s,a)\\). Structurally it is identical to the SFT cross-entropy gradient — only now each example is <em>weighted</em> by its reward."
        },
        {
          "callout": "With a binary verifiable reward \\(R \\in \\{0, 1\\}\\), REINFORCE updates only on correct responses: it is SFT on the model's own successes (à la STaR / rejection sampling), except the dataset is <strong>on-policy</strong> — it shifts every time \\(\\pi_\\theta\\) moves.",
          "kind": "connection"
        },
        {
          "code": "def sort_inclusion_ordering_reward(prompt, response):\n    # 1 point per prompt token that appears in the response\n    inclusion = sum(1 for x in prompt if x in response)\n    # 1 point per adjacent pair in the response that is in order\n    ordering = sum(1 for x, y in zip(response, response[1:]) if x <= y)\n    return inclusion + ordering",
          "lang": "python"
        },
        {
          "callout": "<strong>High variance.</strong> Verifiable rewards are sparse — early in training almost every sample gets \\(R = 0\\), so the gradient is mostly zeros punctuated by rare spikes. (Learned RLHF reward models are smoother, but hackable.) Taming this variance is the rest of the lecture.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "variance-reduction",
      "title": "Baselines, advantage, and variance reduction",
      "blocks": [
        {
          "p": "Subtract a <strong>baseline</strong> \\(b(s)\\) that depends on the state but not the action. The estimator stays unbiased, but its variance can drop dramatically:"
        },
        {
          "math": "\\nabla_\\theta J = \\mathbb{E}\\big[\\, \\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\,\\big(R(s,a) - b(s)\\big) \\,\\big]"
        },
        {
          "callout": "Unbiased because \\(\\mathbb{E}_a[\\nabla_\\theta \\log \\pi_\\theta] = \\sum_a \\nabla_\\theta \\pi_\\theta = \\nabla_\\theta \\sum_a \\pi_\\theta = \\nabla_\\theta 1 = 0\\). Since \\(b(s)\\) is constant in \\(a\\), the extra term \\(\\mathbb{E}[\\nabla_\\theta \\log \\pi_\\theta\\, b(s)] = 0\\) — the baseline moves the mean of nothing, only the variance.",
          "kind": "key"
        },
        {
          "p": "Why it matters — two states, uniform sampling: \\(s_1\\) with rewards \\(\\{11, 9\\}\\) and \\(s_2\\) with \\(\\{0, 2\\}\\). Raw rewards reinforce \\(s_1 \\to a_2\\) (reward 9) far more than \\(s_2 \\to a_2\\) (reward 2), even though \\(a_2\\) is the <em>worse</em> action in \\(s_1\\) and the <em>better</em> action in \\(s_2\\). Centering with \\(b(s_1)=10,\\ b(s_2)=1\\) cuts the std of the update weights from \\(\\approx 5.32\\) to \\(\\approx 1.15\\)."
        },
        {
          "math": "b^*(s) = \\frac{\\mathbb{E}\\big[\\, \\lVert \\nabla_\\theta \\log \\pi_\\theta \\rVert^2\\, R \\mid s \\,\\big]}{\\mathbb{E}\\big[\\, \\lVert \\nabla_\\theta \\log \\pi_\\theta \\rVert^2 \\mid s \\,\\big]} \\quad\\Longrightarrow\\quad b(s) = \\mathbb{E}[R \\mid s] = V(s)"
        },
        {
          "math": "A(s,a) = Q(s,a) - V(s), \\qquad Q(s,a) = \\mathbb{E}[R \\mid s, a], \\qquad V(s) = \\mathbb{E}[R \\mid s]"
        },
        {
          "p": "The exact optimal baseline is awkward to compute, so the heuristic is the mean reward \\(b(s)=V(s)\\). With that choice the baselined reward <em>is</em> the advantage \\(A(s,a)\\) (here \\(Q = R\\), since \\(a\\) is the whole response with an outcome reward). In general we ascend \\(\\nabla_\\theta \\log \\pi_\\theta(a \\mid s)\\,\\delta\\) for some advantage-like \\(\\delta\\)."
        },
        {
          "callout": "Every method below is just a different \\(\\delta\\): raw reward, centered reward (subtract group mean), normalized reward (divide by group std), GAE, max-reward. Lower-variance \\(\\delta\\) ⇒ faster, more stable learning. The choice of \\(\\delta\\) is the main design axis.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "ppo",
      "title": "PPO: clipped surrogate + KL control",
      "blocks": [
        {
          "p": "REINFORCE is strictly on-policy: each batch of rollouts buys exactly one gradient step, wasteful when generation is the expensive part. <strong>PPO</strong> reuses a batch for several steps via an importance ratio against the snapshot \\(\\pi_{\\theta_{\\mathrm{old}}}\\) that produced the samples:"
        },
        {
          "math": "r_t(\\theta) = \\frac{\\pi_\\theta(a_t \\mid s_t)}{\\pi_{\\theta_{\\mathrm{old}}}(a_t \\mid s_t)}"
        },
        {
          "p": "Uncorrected, a large ratio can take a catastrophic step off-distribution. PPO's <strong>clipped surrogate</strong> bounds it:"
        },
        {
          "math": "L^{\\mathrm{CLIP}}(\\theta) = \\mathbb{E}_t\\Big[\\, \\min\\big(\\, r_t(\\theta)\\,\\hat{A}_t,\\;\\; \\mathrm{clip}\\big(r_t(\\theta),\\, 1-\\epsilon,\\, 1+\\epsilon\\big)\\,\\hat{A}_t \\,\\big) \\,\\Big]"
        },
        {
          "p": "The \\(\\min\\) makes the clip one-sided: it caps the upside of moving \\(r\\) past \\(1 \\pm \\epsilon\\) but keeps the full penalty when the advantage is negative — a pessimistic lower bound on the true objective. The toy uses \\(\\epsilon = 0.01\\); production PPO uses \\(\\epsilon \\approx 0.1\\)–\\(0.3\\)."
        },
        {
          "code": "def compute_loss(log_probs, old_log_probs, advantages, epsilon=0.2):\n    # PPO clipped surrogate; ratios r = pi / pi_old (per token)\n    ratios    = torch.exp(log_probs - old_log_probs)\n    unclipped = ratios * advantages\n    clipped   = torch.clamp(ratios, 1 - epsilon, 1 + epsilon) * advantages\n    return -torch.minimum(unclipped, clipped).mean()",
          "lang": "python"
        },
        {
          "callout": "<strong>Freeze \\(\\pi_{\\theta_{\\mathrm{old}}}\\).</strong> The ratio's denominator must be a constant. If gradients flow through it, at \\(r = 1\\) the numerator and denominator gradients cancel and you learn ~nothing — wrap the old/reference forward pass in <code>torch.no_grad()</code>.",
          "kind": "pitfall"
        },
        {
          "code": "w = torch.tensor(2.0, requires_grad=True)\np = torch.sigmoid(w)\nwith torch.no_grad():            # treat pi_old as a CONSTANT\n    p_old = torch.sigmoid(w)\nratio = p / p_old\nratio.backward()                 # without no_grad, grad wrongly cancels to 0",
          "lang": "python"
        }
      ]
    },
    {
      "id": "grpo",
      "title": "GRPO: group-relative advantage",
      "blocks": [
        {
          "p": "To form the advantage, PPO trains a <strong>critic</strong> (value network \\(V(s)\\)) — a second large model that is finicky to fit. <strong>GRPO</strong> exploits structure unique to LMs: cheaply sample a <em>group</em> of \\(G\\) responses per prompt, and their mean reward is an unbiased baseline. No critic at all."
        },
        {
          "math": "\\hat{A}_i = \\frac{r_i - \\operatorname{mean}(r_1, \\dots, r_G)}{\\operatorname{std}(r_1, \\dots, r_G)}, \\qquad i = 1, \\dots, G"
        },
        {
          "code": "def compute_deltas(rewards, mode):          # rewards: [batch, trial]\n    if mode == \"centered_rewards\":          # subtract the group baseline\n        return rewards - rewards.mean(dim=-1, keepdim=True)\n    if mode == \"normalized_rewards\":        # GRPO advantage\n        mean = rewards.mean(dim=-1, keepdim=True)\n        std  = rewards.std(dim=-1, keepdim=True)\n        return (rewards - mean) / (std + 1e-5)",
          "lang": "python"
        },
        {
          "p": "This maps onto the lecture's sorting experiments: raw rewards barely learn; <strong>centered</strong> rewards (subtract the group mean) give below-average samples a negative push and produce zero update when all \\(G\\) responses tie; dividing by the group std changes little here since all responses share a length."
        },
        {
          "callout": "<strong>Dr. GRPO:</strong> dividing by per-group std up-weights easy/low-variance prompts, and per-token length normalization favors longer outputs — both inject bias. Dropping them removes a length bias that otherwise rewards verbosity (arXiv 2503.20783).",
          "kind": "pitfall"
        },
        {
          "p": "GRPO also adds an <em>explicit</em> KL term \\(\\beta\\, \\mathbb{D}_{\\mathrm{KL}}[\\pi_\\theta \\Vert \\pi_{\\mathrm{ref}}]\\) to the loss (vs InstructGPT-PPO, which shapes the per-token reward), estimated with the low-variance, always-non-negative k3 form:"
        },
        {
          "math": "\\mathbb{D}_{\\mathrm{KL}}\\!\\big[\\pi_\\theta \\,\\Vert\\, \\pi_{\\mathrm{ref}}\\big] \\;\\approx\\; \\frac{\\pi_{\\mathrm{ref}}}{\\pi_\\theta} - \\log\\frac{\\pi_{\\mathrm{ref}}}{\\pi_\\theta} - 1 \\;\\ge\\; 0"
        },
        {
          "code": "def compute_kl_penalty(log_probs, ref_log_probs):\n    # k3 estimator of KL(pi || ref): unbiased, low-variance, always >= 0\n    diff = ref_log_probs - log_probs\n    return (torch.exp(diff) - diff - 1).sum(dim=-1).mean()",
          "lang": "python"
        },
        {
          "callout": "Critic-free is a major memory win at scale: DeepSeekMath and DeepSeek-R1 used GRPO to bootstrap long-CoT reasoning from purely verifiable rewards, holding only policy + reference instead of policy + reference + reward + value in memory.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "dpo",
      "title": "DPO: RLHF without the RL",
      "blocks": [
        {
          "p": "Classic RLHF is a four-model, multi-stage pipeline: fit a reward model on preference pairs, then run PPO (policy + reference + reward + critic) with an online sampling loop. <strong>DPO</strong> asks whether the RL is necessary at all — and starts from the <em>same</em> KL-regularized objective PPO optimizes:"
        },
        {
          "math": "\\max_{\\pi_\\theta}\\; \\mathbb{E}_{\\,x \\sim \\mathcal{D},\\; y \\sim \\pi_\\theta(\\cdot \\mid x)}\\big[\\, r(x, y) \\,\\big] \\;-\\; \\beta\\, \\mathbb{D}_{\\mathrm{KL}}\\!\\big[\\pi_\\theta(y \\mid x) \\,\\Vert\\, \\pi_{\\mathrm{ref}}(y \\mid x)\\big]"
        },
        {
          "p": "This objective is not a black box — it has a known closed-form optimum, a reverse-KL projection of \\(\\pi_{\\mathrm{ref}}\\) tilted by the exponentiated reward:"
        },
        {
          "math": "\\pi^*(y \\mid x) = \\frac{1}{Z(x)}\\, \\pi_{\\mathrm{ref}}(y \\mid x)\\, \\exp\\!\\Big(\\tfrac{1}{\\beta}\\, r(x, y)\\Big), \\qquad Z(x) = \\sum_y \\pi_{\\mathrm{ref}}(y \\mid x)\\, \\exp\\!\\Big(\\tfrac{1}{\\beta}\\, r(x, y)\\Big)"
        },
        {
          "p": "The trick: <em>invert</em> this to write the reward as a function of its own optimal policy — an <strong>implicit reward</strong>. The intractable partition function \\(Z(x)\\) survives only as an additive, prompt-only term:"
        },
        {
          "math": "r(x, y) = \\beta\\, \\log\\frac{\\pi^*(y \\mid x)}{\\pi_{\\mathrm{ref}}(y \\mid x)} \\;+\\; \\beta\\, \\log Z(x)"
        },
        {
          "p": "Now plug into the <strong>Bradley–Terry</strong> preference model \\(p(y_w \\succ y_l \\mid x) = \\sigma\\big(r(x,y_w) - r(x,y_l)\\big)\\). Because \\(Z(x)\\) depends only on \\(x\\), it cancels in the difference — the explicit reward model vanishes, leaving a maximum-likelihood loss in \\(\\pi_\\theta\\) alone (with \\(\\pi_{\\mathrm{ref}}\\) frozen):"
        },
        {
          "math": "\\mathcal{L}_{\\mathrm{DPO}} = -\\,\\mathbb{E}_{(x, y_w, y_l) \\sim \\mathcal{D}}\\bigg[\\, \\log \\sigma\\!\\Big(\\, \\beta \\log\\frac{\\pi_\\theta(y_w \\mid x)}{\\pi_{\\mathrm{ref}}(y_w \\mid x)} \\;-\\; \\beta \\log\\frac{\\pi_\\theta(y_l \\mid x)}{\\pi_{\\mathrm{ref}}(y_l \\mid x)} \\,\\Big) \\,\\bigg]"
        },
        {
          "code": "def dpo_loss(pi_w, pi_l, ref_w, ref_l, beta=0.1):\n    # pi_*, ref_* are sequence log-probs of the (w)inning / (l)osing response\n    pi_logratio  = pi_w  - pi_l\n    ref_logratio = ref_w - ref_l\n    margin = beta * (pi_logratio - ref_logratio)   # implicit-reward margin\n    return -F.logsigmoid(margin).mean()",
          "lang": "python"
        },
        {
          "callout": "DPO is a classifier on preference pairs. Its gradient scales by \\(\\sigma(\\hat r_l - \\hat r_w)\\) — large exactly when the implicit reward currently ranks the loser above the winner — so hard, mis-ranked pairs dominate, unlike plain SFT-on-winners. No reward model, no sampling, no RL loop: just two forward passes per pair (policy and frozen reference).",
          "kind": "insight"
        },
        {
          "callout": "<strong>Over-optimization.</strong> The implicit-reward margin is unbounded, so DPO can keep widening it by driving \\(P(y_l)\\) down faster than it lifts \\(P(y_w)\\) — sometimes lowering the winner's absolute likelihood. With \\(\\beta\\) too small it drifts far from \\(\\pi_{\\mathrm{ref}}\\) and degrades; variants (IPO, cDPO, anchored/SLiC) bound the margin.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "tradeoffs",
      "title": "Tradeoffs: DPO vs PPO/GRPO",
      "blocks": [
        {
          "p": "So when do you reach for DPO vs PPO/GRPO? The split is mostly <strong>off-policy vs on-policy</strong> and how much infrastructure you can afford."
        },
        {
          "table": {
            "head": [
              "Axis",
              "DPO",
              "PPO / GRPO"
            ],
            "rows": [
              [
                "Reward signal",
                "implicit (no model trained)",
                "explicit RM (PPO) or rule/verifier (GRPO)"
              ],
              [
                "Data",
                "fixed off-policy preference pairs",
                "fresh on-policy rollouts each step"
              ],
              [
                "Models in memory",
                "policy + frozen reference",
                "policy + reference + reward (+ critic for PPO)"
              ],
              [
                "Compute / step",
                "2 forward passes, no generation",
                "generate \\(G\\) samples + score + update"
              ],
              [
                "Stability knobs",
                "β (and variant choice)",
                "clip ε, KL coeff, critic/GAE tuning"
              ],
              [
                "Typical failure",
                "over-optimization, off-policy drift",
                "reward hacking, critic/value error"
              ]
            ]
          }
        },
        {
          "callout": "On-policy is the crux. PPO/GRPO sample <em>fresh</em> rollouts each step, so the reward signal always reflects the current policy. DPO trains on a <strong>fixed</strong> preference set; as \\(\\pi_\\theta\\) moves away from the data distribution, the gradient is increasingly off-policy and stale — 'off-policy drift'. Iterative/online DPO (regenerate pairs, relabel, repeat) recovers much of the gap.",
          "kind": "insight"
        },
        {
          "p": "Empirically it is contested: well-tuned PPO has beaten DPO on hard reasoning/code benchmarks (Xu et al. 2024), while Llama-3 post-training leaned on rejection sampling + DPO for simplicity, and reasoning models (DeepSeek-R1, Qwen) use GRPO. There is no universal winner — it tracks task verifiability and compute budget."
        },
        {
          "callout": "<strong>Goodhart for both.</strong> Reward over-optimization (Gao et al. 2023): pushing any proxy reward too far diverges from true quality. In PPO the proxy is the learned RM (reward hacking); in DPO it is the implicit reward (margin blow-up). KL control, early stopping, and a conservative \\(\\beta\\) are the standard guards.",
          "kind": "pitfall"
        }
      ]
    }
  ],
  "takeaways": [
    "Policy gradient (REINFORCE) is the log-derivative trick: ∇J = E[∇ log π · R] — reward-weighted SFT, on-policy, and high-variance under sparse verifiable rewards.",
    "A state-only baseline b(s) is free variance reduction (still unbiased); b(s)=V(s) turns the update weight into the advantage A = Q − V.",
    "PPO reuses rollouts via the ratio r = π/π_old and clips it to 1±ε for a pessimistic, stable surrogate — and you must stop-gradient through π_old.",
    "GRPO removes the value network: a group of G samples per prompt is the baseline, advantage = (r − mean)/std; Dr. GRPO drops std/length normalization to kill verbosity bias.",
    "DPO's seed identity: the KL-regularized RLHF objective has closed-form optimum π* ∝ π_ref·exp(r/β), so reward is the implicit r = β·log(π/π_ref) + β·log Z.",
    "Substituting that implicit reward into Bradley–Terry cancels Z and collapses RLHF into one supervised classification loss in π — no reward model, no sampling, no RL loop.",
    "Tradeoff: DPO is simple and off-policy but over-optimizes/drifts; PPO/GRPO are on-policy and costlier but always track a fresh reward signal."
  ],
  "references": [
    {
      "label": "CS336 Lecture 17 trace (Percy Liang)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_17"
    },
    {
      "label": "Williams 1992 — REINFORCE (policy gradient)",
      "url": "https://link.springer.com/article/10.1007/BF00992696"
    },
    {
      "label": "Schulman et al. 2017 — PPO",
      "url": "https://arxiv.org/abs/1707.06347"
    },
    {
      "label": "Shao et al. 2024 — DeepSeekMath (GRPO)",
      "url": "https://arxiv.org/abs/2402.03300"
    },
    {
      "label": "Rafailov et al. 2023 — Direct Preference Optimization",
      "url": "https://arxiv.org/abs/2305.18290"
    },
    {
      "label": "Liu et al. 2025 — Dr. GRPO (R1-Zero-like training)",
      "url": "https://arxiv.org/abs/2503.20783"
    },
    {
      "label": "Ouyang et al. 2022 — InstructGPT (RLHF)",
      "url": "https://arxiv.org/abs/2203.02155"
    },
    {
      "label": "Gao et al. 2023 — Reward model over-optimization",
      "url": "https://arxiv.org/abs/2210.10760"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Policy gradient",
      "q": "REINFORCE rewrites ∇θ E[R] as an expectation you can sample. Which identity makes that step valid?",
      "options": [
        "∇θ π = π ∇θ log π, so the action integral becomes an expectation under π (R treated as a constant)",
        "∇θ log π = π ∇θ π, which removes the policy from the integrand",
        "R(s,a) can be moved outside the gradient because it depends on θ",
        "the transition T(s'|s,a) must be differentiable for the gradient to exist"
      ],
      "answer": 0,
      "explain": "∇π = π∇log π converts ∫∇π·R into E_π[∇log π·R]; the reward is not differentiated, and the (deterministic) dynamics need not be differentiable."
    },
    {
      "id": 2,
      "section": "Policy gradient",
      "q": "With a binary verifiable reward R ∈ {0,1}, naive REINFORCE most resembles:",
      "options": [
        "value iteration with bootstrapped targets",
        "SFT on the model's own correct samples, on a dataset that shifts as π updates",
        "a contrastive loss over winner/loser pairs",
        "supervised learning on a fixed human-labeled corpus"
      ],
      "answer": 1,
      "explain": "∇log π·R only updates on R=1 — reward-weighted SFT / rejection sampling — but on-policy, so the data distribution moves with π. No bootstrapping, not pairwise, not a fixed dataset."
    },
    {
      "id": 3,
      "section": "Variance reduction",
      "q": "Subtracting a state-only baseline b(s) keeps the policy gradient unbiased because:",
      "options": [
        "b(s) is chosen to equal R(s,a) on average for each action",
        "the clip operation cancels the bias it introduces",
        "E_a[∇θ log π(a|s)] = 0, so the added term E[∇log π · b(s)] vanishes",
        "b(s) is differentiated through, contributing an offsetting gradient"
      ],
      "answer": 2,
      "explain": "Σπ∇log π = ∇Σπ = ∇1 = 0; since b(s) is constant in a it factors out and the baseline term is zero in expectation — only the variance changes."
    },
    {
      "id": 4,
      "section": "Variance reduction",
      "q": "In the toy with s1:{11,9} and s2:{0,2}, why is a per-state baseline needed?",
      "options": [
        "because rewards can go negative after centering",
        "because both states share the same optimal action",
        "because the update variance is already zero without it",
        "raw magnitudes reinforce s1→a2 (R=9) more than s2→a2 (R=2), though a2 is worse in s1 and better in s2"
      ],
      "answer": 3,
      "explain": "What matters is reward relative to the state mean, not absolute magnitude. Baselines b(s1)=10, b(s2)=1 recenter, cutting the weight std from ≈5.32 to ≈1.15."
    },
    {
      "id": 5,
      "section": "Variance reduction",
      "q": "Choosing b(s) = V(s) = E[R|s] makes the policy-gradient weight (R − b) equal to:",
      "options": [
        "the advantage A(s,a) = Q(s,a) − V(s)",
        "the state value V(s)",
        "the raw return Q(s,a)",
        "the KL penalty to the reference policy"
      ],
      "answer": 0,
      "explain": "Here Q=R (outcome reward over the full response), so R−V = Q−V = A. The advantage is the canonical low-variance δ."
    },
    {
      "id": 6,
      "section": "PPO",
      "q": "PPO maximizes min(r·A, clip(r,1±ε)·A). The min term primarily:",
      "options": [
        "guarantees KL(π‖π_ref) equals ε",
        "forms a pessimistic lower bound that removes the incentive to push r past 1±ε",
        "makes the gradient estimator unbiased",
        "removes the need to estimate the advantage"
      ],
      "answer": 1,
      "explain": "The min keeps clipping from ever helping the objective, bounding how far π moves from π_old per step. It does not set the π_ref KL, nor eliminate the advantage."
    },
    {
      "id": 7,
      "section": "PPO",
      "q": "In r = πθ/π_old you must stop gradients through π_old. If you don't:",
      "options": [
        "memory use rises but the gradient is unchanged",
        "π_old is forced to track πθ exactly",
        "at r=1 the numerator and denominator gradients cancel, so you learn ~nothing",
        "π_old receives the negative of the policy gradient"
      ],
      "answer": 2,
      "explain": "If both depend on θ, ∂(p/p_old)/∂θ at p=p_old cancels to 0 (the freezing example). Wrap the old/reference pass in no_grad so only the numerator carries gradient."
    },
    {
      "id": 8,
      "section": "PPO",
      "q": "The toy used ε=0.01; canonical PPO uses ε≈0.1–0.3. A larger ε means:",
      "options": [
        "a tighter trust region on the ratio",
        "a stronger KL penalty toward π_ref",
        "more frequent critic updates",
        "a wider trust region — larger per-step deviation of π from π_old before clipping"
      ],
      "answer": 3,
      "explain": "ε is the half-width of the ratio's trust region; bigger ε permits bigger off-policy steps. It is unrelated to the π_ref KL coefficient or the critic."
    },
    {
      "id": 9,
      "section": "GRPO",
      "q": "GRPO's main simplification relative to PPO is that it:",
      "options": [
        "drops the value/critic network, using the group's mean reward as the baseline",
        "removes the reference model and the KL term",
        "eliminates importance sampling and clipping",
        "replaces the rule/verifier reward with a learned reward model"
      ],
      "answer": 0,
      "explain": "G samples per prompt give a free Monte-Carlo baseline (mean), so no critic is trained — a big memory/stability win. It keeps the reference/KL, ratios, and clipping."
    },
    {
      "id": 10,
      "section": "GRPO",
      "q": "GRPO uses Â = (r − group mean)/group std. Dr. GRPO argues you should:",
      "options": [
        "additionally divide by sequence length for fairness",
        "drop the std (and length) normalization, which injects difficulty/length bias",
        "normalize across the whole batch rather than the group",
        "replace the group mean with the group max reward"
      ],
      "answer": 1,
      "explain": "Per-group std up-weights low-variance (easy/hard) prompts and length normalization favors long outputs; removing both avoids a verbosity bias (arXiv 2503.20783)."
    },
    {
      "id": 11,
      "section": "GRPO",
      "q": "The k3 KL estimator π_ref/πθ − log(π_ref/πθ) − 1 is preferred because it is:",
      "options": [
        "exactly the forward KL with zero variance",
        "an upper bound that ignores π_ref",
        "unbiased, low-variance, and always ≥ 0",
        "differentiable only through π_ref"
      ],
      "answer": 2,
      "explain": "The naive single-sample log(p/q) estimator can go negative and is high-variance; k3 is unbiased, non-negative, and far lower variance (Schulman)."
    },
    {
      "id": 12,
      "section": "DPO",
      "q": "The KL-regularized RLHF objective max E[r] − β·KL(π‖π_ref) has closed-form optimum:",
      "options": [
        "π*(y|x) = π_ref(y|x) for all y",
        "π*(y|x) ∝ exp(r/β), independent of π_ref",
        "π*(y|x) = softmax over reward-model logits",
        "π*(y|x) ∝ π_ref(y|x)·exp(r(x,y)/β)"
      ],
      "answer": 3,
      "explain": "It is a reverse-KL projection: the optimum reweights the reference by the exponentiated reward, normalized by Z(x). This identity is the seed of DPO."
    },
    {
      "id": 13,
      "section": "DPO",
      "q": "DPO's implicit reward is r = β·log(π/π_ref) + β·log Z(x). The reward model disappears from the loss because:",
      "options": [
        "Z(x) depends only on x, so it cancels in the Bradley–Terry difference r(y_w) − r(y_l)",
        "Z(x) = 1 by construction",
        "β·log Z is dropped as negligibly small",
        "the reward model is first distilled into π_ref"
      ],
      "answer": 0,
      "explain": "Inverting the optimal policy writes reward via π; in BT, p(y_w≻y_l)=σ(r_w−r_l) and the prompt-only β·log Z(x) cancels, leaving a loss purely in πθ (with π_ref frozen)."
    },
    {
      "id": 14,
      "section": "DPO",
      "q": "The DPO gradient is scaled by σ(implicit_reward_loser − implicit_reward_winner). This means it:",
      "options": [
        "is constant, making DPO equivalent to weighted SFT on winners",
        "up-weights pairs the model currently ranks wrong (loser above winner)",
        "decays to zero uniformly across all pairs as training proceeds",
        "forces P(y_w) to increase monotonically every step"
      ],
      "answer": 1,
      "explain": "When mis-ranked (r_l > r_w), σ(·) is large → bigger update; once correct, the gradient shrinks. This adaptive hard-pair weighting is exactly what SFT-on-winners lacks."
    },
    {
      "id": 15,
      "section": "Tradeoffs",
      "q": "A failure mode specific to DPO (vs on-policy PPO/GRPO) is:",
      "options": [
        "critic divergence from bootstrapped value targets",
        "reward-model inference dominating step compute",
        "off-policy drift: a fixed preference set goes stale as π moves, and the unbounded margin can push P(y_w) and P(y_l) both down",
        "needing fresh rollouts every single step"
      ],
      "answer": 2,
      "explain": "DPO optimizes a static off-policy dataset and can widen the margin by suppressing y_l faster than y_w, sometimes lowering the winner's absolute likelihood. Critic issues and rollout cost are PPO/GRPO traits."
    },
    {
      "id": 16,
      "section": "DPO",
      "q": "In DPO / the KL-regularized objective, the coefficient β controls:",
      "options": [
        "the learning rate of the value network",
        "the clip width of the importance ratio",
        "the number of responses sampled per prompt",
        "how far π may deviate from π_ref — larger β keeps π closer to the reference"
      ],
      "answer": 3,
      "explain": "π* ∝ π_ref·exp(r/β): as β→∞ the exponent →0 and π*→π_ref (strong KL constraint); small β lets the policy exploit the reward and drift further."
    }
  ]
});
