/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 16,
  "estMinutes": 20,
  "topics": [
    "RLVR",
    "GRPO",
    "DeepSeek-R1",
    "reasoning",
    "verifiable rewards"
  ],
  "overview": "RLHF hits a wall: a learned reward model is hackable, so you cannot scale RL arbitrarily. The escape is to optimize a reward you can <em>verify</em> — does the math answer match, do the unit tests pass. Lecture 16 covers RL with Verifiable Rewards (RLVR), the algorithm that made it cheap (<strong>GRPO</strong>: group-relative advantages, no value network), and the reasoning models it produced (DeepSeek-R1, o1, Kimi k1.5, Qwen3), where long chain-of-thought and self-reflection <em>emerge</em> from pure RL.",
  "sections": [
    {
      "id": "rlvr-motivation",
      "title": "Why verifiable rewards",
      "blocks": [
        {
          "p": "Lecture 15 ended on over-optimization: a learned reward model is an imperfect proxy, so optimizing it hard eventually decouples reward from true quality (Goodhart). That caps how far you can push RLHF. The way out is to move into domains where the reward is <em>exactly</em> what you want and cannot be gamed."
        },
        {
          "p": "<strong>RLVR</strong> (RL with Verifiable Rewards; Lambert et al. 2024, Tulu 3) replaces the learned RM with a <strong>verifier</strong>: for math, check the final answer against ground truth; for code, run unit tests. The reward is binary, programmatic, and ungameable — there is no learned function to exploit, only correctness."
        },
        {
          "callout": "Verifiable rewards changed the game because the reward <em>is</em> the ground-truth checker — there is no proxy to hack. So the KL leash can be loosened and RL scaled hard without over-optimization. DeepSeek-R1 then showed the elaborate scaffolding people assumed was necessary — process reward models (PRMs) and MCTS — is not: plain RL on a verifiable signal suffices.",
          "kind": "insight"
        },
        {
          "table": {
            "head": [
              "",
              "RLHF (learned RM)",
              "RLVR (verifier)"
            ],
            "rows": [
              [
                "Reward source",
                "Bradley-Terry model fit to preferences",
                "rule / checker: answer match, unit tests"
              ],
              [
                "Hackable?",
                "yes — over-optimizes RM error",
                "essentially no — correctness is ground truth"
              ],
              [
                "Scaling RL",
                "limited by over-optimization",
                "can push much harder"
              ],
              [
                "Domain",
                "open-ended, subjective",
                "verifiable: math, code, logic"
              ]
            ]
          }
        }
      ]
    },
    {
      "id": "ppo-recap",
      "title": "Recap PPO, and why a new algorithm",
      "blocks": [
        {
          "p": "RLVR still needs a policy-gradient optimizer. Recall the PPO lineage: vanilla policy gradients (unbiased, high variance) $\\rightarrow$ TRPO (trust region) $\\rightarrow$ PPO (clip the importance ratio). In the LM setting it is a bandit — one dense reward at the final token — plus a per-token KL penalty to the reference."
        },
        {
          "math": "\\nabla_\\theta\\,\\mathbb{E}_{z\\sim\\pi_\\theta}\\!\\left[R(z)\\right] \\;=\\; \\mathbb{E}_{z\\sim\\pi_\\theta}\\!\\left[\\,R(z)\\,\\nabla_\\theta \\log \\pi_\\theta(z)\\,\\right]"
        },
        {
          "h": "Why not just use PPO or DPO?"
        },
        {
          "list": [
            "<strong>PPO:</strong> complicated to implement, and the <em>value network</em> (critic) doubles model memory and needs its own tuning — painful at LLM scale.",
            "<strong>DPO:</strong> assumes inherently <em>pairwise</em> Bradley-Terry data, and is offline/off-policy (can be iterated online, but awkwardly). Verifiable rewards are scalar per-sample, not pairwise."
          ]
        },
        {
          "callout": "The value network is roughly half your training memory and a second model to babysit. Its main job is variance reduction via a learned baseline — and if you can get a good baseline another way, you can delete it entirely. That is the opening GRPO exploits.",
          "kind": "note"
        }
      ]
    },
    {
      "id": "grpo",
      "title": "GRPO: group-relative advantages, no critic",
      "blocks": [
        {
          "p": "GRPO (Group Relative Policy Optimization; Shao et al. 2024, DeepSeekMath) keeps PPO's clipped ratio but <strong>removes the value network</strong>. For each prompt it samples a <strong>group</strong> of $G$ responses and uses the group itself as the baseline — the advantage is each response's reward, z-scored within its group."
        },
        {
          "math": "\\hat{A}_{i} \\;=\\; \\frac{r_i - \\mathrm{mean}\\!\\left(\\{r_1,\\dots,r_G\\}\\right)}{\\mathrm{std}\\!\\left(\\{r_1,\\dots,r_G\\}\\right)}"
        },
        {
          "p": "Every token of response $i$ inherits the same scalar $\\hat{A}_i$ (a bandit/outcome reward — no per-token credit assignment). With ratio $\\rho_{i,t}=\\pi_\\theta(y_{i,t}\\mid x,y_{i,<t})/\\pi_{\\theta_{\\mathrm{old}}}(\\cdot)$, the objective is PPO's clip averaged over the group, with the KL added directly to the loss:"
        },
        {
          "math": "\\mathcal{J}_{\\mathrm{GRPO}}(\\theta) = \\mathbb{E}\\!\\left[\\frac{1}{G}\\sum_{i=1}^{G}\\frac{1}{|y_i|}\\sum_{t=1}^{|y_i|} \\min\\!\\left(\\rho_{i,t}\\hat{A}_i,\\; \\mathrm{clip}(\\rho_{i,t},1-\\epsilon,1+\\epsilon)\\,\\hat{A}_i\\right)\\right] - \\beta\\,\\mathbb{D}_{\\mathrm{KL}}\\!\\left(\\pi_\\theta\\;\\|\\;\\pi_{\\mathrm{ref}}\\right)"
        },
        {
          "code": "import torch\n\n# one prompt -> G sampled responses; scalar verifier reward per response\nr = torch.tensor([verify(x, y_i) for y_i in group])   # (G,), e.g. 1.0 if correct\nadv = (r - r.mean()) / (r.std() + 1e-4)                # z-score within the group\n# broadcast: every token of response i takes advantage adv[i]; NO value network\n# KL to the reference is added to the loss, not folded into the reward",
          "lang": "python"
        },
        {
          "p": "In the fully online case (rollout then immediate update, so $\\rho_{i,t}\\approx 1$ and no clipping bites), GRPO is simply <em>policy gradient with group-normalized rewards</em>. The whole method fits in a few dozen lines — the practical appeal that made RLVR accessible."
        },
        {
          "table": {
            "head": [
              "",
              "PPO",
              "GRPO"
            ],
            "rows": [
              [
                "Baseline",
                "learned value network (critic)",
                "group mean over $G$ samples"
              ],
              [
                "Extra model",
                "yes (critic, ~same size)",
                "none"
              ],
              [
                "Advantage",
                "GAE from value estimates",
                "z-score within the group"
              ],
              [
                "Memory / tuning",
                "heavy",
                "light"
              ]
            ]
          }
        }
      ]
    },
    {
      "id": "baseline-and-bias",
      "title": "Is GRPO's baseline valid? Length and difficulty bias",
      "blocks": [
        {
          "p": "RL theory (Sutton and Barto) says you may subtract any <em>state-dependent</em> term from the reward without biasing the gradient. Subtracting the group <strong>mean</strong> qualifies — it is a valid baseline. Dividing by the group <strong>std</strong> does not: it rescales each prompt's gradient, so GRPO's standard form is a <em>biased</em> estimator."
        },
        {
          "callout": "Two GRPO biases (Liu et al. 2025, 'Dr. GRPO'): (1) the std term <strong>upweights too-easy and too-hard prompts</strong> — low within-group variance inflates $|\\hat{A}|$; (2) per-response $1/|y_i|$ length normalization induces a <strong>length bias</strong> that can reward longer incorrect answers. Dropping both recovers an unbiased estimator close to REINFORCE-leave-one-out.",
          "kind": "pitfall"
        },
        {
          "math": "\\hat{A}_i^{\\mathrm{RLOO}} \\;=\\; r_i - \\frac{1}{G-1}\\sum_{j\\neq i} r_j"
        },
        {
          "p": "This matters for interpreting the famous results: the dramatic response <em>lengthening</em> during R1-Zero training is partly an artifact of the biased length term, and follow-ups (Dr. GRPO) find base models already exhibit 'reflection' before any RL. So the 'aha moment' is real but somewhat overstated — RL elicits and amplifies a latent behavior rather than conjuring it."
        }
      ]
    },
    {
      "id": "deepseek-r1",
      "title": "DeepSeek-R1: reasoning from pure RL",
      "blocks": [
        {
          "p": "DeepSeek-R1 (2025) matched OpenAI's o1 with an <em>open</em>, surprisingly simple RL recipe, and ended speculation that MCTS or process reward models were required to get strong reasoning."
        },
        {
          "h": "R1-Zero: RL with no SFT"
        },
        {
          "p": "Start from the DeepSeek-V3 base, run GRPO with two <strong>rule-based</strong> rewards only — an <strong>accuracy</strong> reward (is the final answer correct?) and a <strong>format</strong> reward (did it use the <code>&lt;think&gt;</code> tags?). No SFT, no learned RM. Over training, chains of thought get longer and the model starts to self-verify and backtrack — the emergent 'aha moment.'"
        },
        {
          "callout": "R1-Zero's lesson: long chain-of-thought and self-correction can emerge from <em>pure</em> RL on a verifiable signal, with zero reasoning demonstrations. The capability was latent in the base model; RL on correctness elicited it. This is why a tiny, ungameable reward can unlock behavior that elaborate supervised pipelines struggled to install.",
          "kind": "insight"
        },
        {
          "h": "R1: making it usable"
        },
        {
          "p": "R1-Zero's outputs are hard to read (language mixing, messy formatting). R1 adds structure around the same RL core: a small <strong>long-CoT SFT cold start</strong>, a <strong>language-consistency</strong> reward on the CoT, and a multi-stage pipeline — reasoning RL $\\rightarrow$ SFT on ~600k reasoning (V3-judged) + ~200k general examples $\\rightarrow$ a final RLHF stage (still GRPO) for non-verifiable tasks."
        },
        {
          "p": "<strong>Distillation:</strong> R1 generates ~800k CoT traces; SFT-ing these into Qwen2.5 / Llama students makes small models reason — and distillation beats running RLVR directly on the small model, since the small model can't explore its way to the traces on its own."
        }
      ]
    },
    {
      "id": "case-studies",
      "title": "Kimi k1.5 and Qwen3",
      "blocks": [
        {
          "p": "Two contemporaneous recipes confirm and extend the picture."
        },
        {
          "p": "<strong>Kimi k1.5</strong> (2025) also beats o1. It uses a reference-based reward from a DPO-style derivation (nonparametric assumption, solve for $r$, squared-loss surrogate) — a baselined policy gradient with regularization that <em>avoids GRPO's length bias</em>. To further compress CoTs it adds an explicit <strong>length reward</strong>: correct answers are incentivized to be short, incorrect ones to be shorter than the group center — enabled only late in training, since it hurts performance early."
        },
        {
          "p": "Shared RLVR craft: <strong>difficulty filtering and curriculum</strong> — drop problems the model already solves without CoT, keep only those it fails best-of-8, and sample proportional to $(1-\\text{success\\_rate})$ to avoid wasting rollouts on solved items. For code, generate fresh test cases from reference solutions; for math, train a CoT reward model for answer-equivalence checks."
        },
        {
          "p": "<strong>Qwen3</strong> pushes <strong>low-data RLVR</strong>: GRPO on only ~4,000 curated examples (after difficulty + dedup + validation-leakage filtering). It adds <em>thinking-mode fusion</em> — mixing thinking / non-thinking data with tags and an early-stop string to control CoT length. Note: a general-purpose RLHF stage applied <em>after</em> reasoning RL slightly degrades math/STEM — a real alignment tax."
        },
        {
          "table": {
            "head": [
              "Model",
              "Base",
              "RL algo",
              "Notable"
            ],
            "rows": [
              [
                "R1-Zero",
                "DeepSeek-V3",
                "GRPO",
                "pure RL, accuracy+format rewards, emergent CoT"
              ],
              [
                "R1",
                "DeepSeek-V3",
                "GRPO",
                "SFT cold start + language-consistency, multi-stage"
              ],
              [
                "Kimi k1.5",
                "in-house",
                "baselined PG (DPO-style)",
                "explicit length-control reward, curriculum"
              ],
              [
                "Qwen3",
                "Qwen3 base",
                "GRPO",
                "low-data (~4k), thinking-mode fusion"
              ]
            ]
          }
        }
      ]
    },
    {
      "id": "reward-design",
      "title": "Reward design, length, and the RL tax",
      "blocks": [
        {
          "p": "With the algorithm commoditized, <strong>reward design</strong> is the real work in RLVR. Production recipes stack several rule-based components rather than one learned scalar:"
        },
        {
          "list": [
            "<strong>Correctness</strong> (primary): verifier output — answer match or unit tests pass.",
            "<strong>Format</strong>: emit the thinking tags / required structure (cheap to check, stabilizes parsing).",
            "<strong>Language consistency</strong>: penalize CoT language mixing (R1).",
            "<strong>Length shaping</strong>: explicit rewards to compress CoT once accuracy is established (Kimi)."
          ]
        },
        {
          "p": "A <strong>KL to the reference</strong> is still present but can be loose; DeepSeek uses the unbiased k3 estimator, added to the loss rather than folded into the reward:"
        },
        {
          "math": "\\mathbb{D}_{\\mathrm{KL}}\\!\\left[\\pi_\\theta \\,\\|\\, \\pi_{\\mathrm{ref}}\\right] \\;\\approx\\; \\frac{\\pi_{\\mathrm{ref}}(y\\mid x)}{\\pi_\\theta(y\\mid x)} - \\log\\frac{\\pi_{\\mathrm{ref}}(y\\mid x)}{\\pi_\\theta(y\\mid x)} - 1"
        },
        {
          "p": "<strong>Length bias recurs everywhere.</strong> Longer CoT genuinely helps accuracy, but unmanaged RL inflates length for the wrong reasons (GRPO's std and length terms). The fixes are either an unbiased baseline (Dr. GRPO / RLOO) or an explicit length reward (Kimi) — pick one, don't let length run free."
        },
        {
          "callout": "<strong>RL infra is the bottleneck.</strong> On-policy RL interleaves (slow) autoregressive rollouts with training, often across two different frameworks (an inference engine for generation, a training stack for updates), and long CoTs make batch lengths wildly uneven. Utilization, not algorithmic novelty, is frequently the limiting factor.",
          "kind": "note"
        }
      ]
    }
  ],
  "takeaways": [
    "RLVR optimizes a verifiable reward (answer-check, unit tests) instead of a learned RM — essentially unhackable, so RL can be scaled far harder.",
    "GRPO drops PPO's value network: sample $G$ responses per prompt and use the group as the baseline, $\\hat{A}_i=(r_i-\\mathrm{mean})/\\mathrm{std}$.",
    "Online GRPO is just policy gradient with group-normalized rewards; it fits in a few dozen lines, which is why RLVR took off.",
    "Dividing by std is not a valid baseline: GRPO is biased toward easy/hard prompts and long answers — Dr. GRPO / RLOO fix it.",
    "DeepSeek-R1-Zero: long CoT and self-reflection emerge from pure RL on accuracy+format rewards, no SFT and no PRM/MCTS needed.",
    "R1 adds an SFT cold start, language-consistency reward, and multi-stage training; ~800k R1 traces distilled into small models beat small-model RL.",
    "Reward design (correctness + format + language + length) and RL infra (rollouts, uneven long-CoT batches) are where the real engineering lives."
  ],
  "references": [
    {
      "label": "CS336 Lecture 16 trace (Hashimoto)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_16"
    },
    {
      "label": "Shao et al. 2024 — DeepSeekMath (GRPO)",
      "url": "https://arxiv.org/abs/2402.03300"
    },
    {
      "label": "DeepSeek-AI 2025 — DeepSeek-R1",
      "url": "https://arxiv.org/abs/2501.12948"
    },
    {
      "label": "Liu et al. 2025 — Understanding R1-Zero-like training (Dr. GRPO)",
      "url": "https://arxiv.org/abs/2503.20783"
    },
    {
      "label": "Lambert et al. 2024 — Tulu 3 (RLVR)",
      "url": "https://arxiv.org/abs/2411.15124"
    },
    {
      "label": "Kimi Team 2025 — Kimi k1.5",
      "url": "https://arxiv.org/abs/2501.12599"
    },
    {
      "label": "Ahmadian et al. 2024 — Back to Basics: REINFORCE / RLOO",
      "url": "https://arxiv.org/abs/2402.14740"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "RLVR",
      "q": "RLVR differs from RLHF primarily in that the reward comes from:",
      "options": [
        "A verifier (answer-check, unit tests) rather than a learned model",
        "A larger Bradley-Terry reward model",
        "Human annotators rating every rollout live",
        "The value network's predictions"
      ],
      "answer": 0,
      "explain": "RLVR uses a programmatic verifier as the reward — ground-truth correctness, not a learned proxy."
    },
    {
      "id": 2,
      "section": "RLVR",
      "q": "Why is a verifiable reward much less prone to over-optimization than a learned RM?",
      "options": [
        "It is differentiable end-to-end",
        "It is the ground-truth checker, so there is no proxy function to exploit",
        "It uses a larger KL coefficient by definition",
        "It is trained on more preference pairs"
      ],
      "answer": 1,
      "explain": "There is no learned function to game — the reward is correctness itself, so Goodhart-style hacking largely disappears."
    },
    {
      "id": 3,
      "section": "RLVR",
      "q": "A notable claim validated by DeepSeek-R1 about reasoning RL is:",
      "options": [
        "Process reward models (PRMs) and MCTS are required",
        "Only closed models can do it",
        "Plain RL on a verifiable signal suffices; PRMs/MCTS are not necessary",
        "SFT alone matches RL on math"
      ],
      "answer": 2,
      "explain": "R1 showed elaborate scaffolding (PRMs, MCTS) was unnecessary — simple GRPO on verifiable rewards worked."
    },
    {
      "id": 4,
      "section": "GRPO",
      "q": "GRPO's advantage for response $i$ in a group is:",
      "options": [
        "The value-network estimate $V(s_i)$",
        "The discounted reward-to-go",
        "$r_i$ minus the running average across all prompts",
        "$(r_i - \\mathrm{mean}(r))/\\mathrm{std}(r)$ over the group"
      ],
      "answer": 3,
      "explain": "GRPO z-scores each response's reward within its sampled group; the group is the baseline."
    },
    {
      "id": 5,
      "section": "GRPO",
      "q": "The defining structural change of GRPO versus PPO is:",
      "options": [
        "It removes the value network (critic), using the group as the baseline",
        "It removes the policy network",
        "It removes the KL penalty",
        "It removes importance sampling"
      ],
      "answer": 0,
      "explain": "GRPO keeps PPO's clipped ratio but deletes the critic, using group statistics for the baseline — big memory/tuning savings."
    },
    {
      "id": 6,
      "section": "GRPO",
      "q": "In the fully online case (immediate update after rollout), GRPO reduces to:",
      "options": [
        "DPO on pairwise data",
        "Policy gradient with group-normalized rewards",
        "Supervised finetuning",
        "TRPO with a hard trust region"
      ],
      "answer": 1,
      "explain": "With $\\rho\\approx1$ and no clipping active, GRPO is just REINFORCE using group-normalized rewards as advantages."
    },
    {
      "id": 7,
      "section": "Bias",
      "q": "Why is dividing by the group std NOT a valid RL baseline?",
      "options": [
        "It changes the sign of the reward",
        "It requires a value network",
        "A valid baseline may only be a state-dependent additive term; std rescaling biases the gradient",
        "It violates importance sampling"
      ],
      "answer": 2,
      "explain": "Sutton-Barto: subtracting a state-dependent term is unbiased; dividing by std rescales gradients per prompt and biases the estimator."
    },
    {
      "id": 8,
      "section": "Bias",
      "q": "GRPO's std normalization biases optimization by:",
      "options": [
        "Ignoring correct answers",
        "Downweighting all long sequences equally",
        "Removing the KL term",
        "Upweighting too-easy and too-hard prompts (low within-group variance inflates $|\\hat{A}|$)"
      ],
      "answer": 3,
      "explain": "Low-variance groups (nearly all right or all wrong) get amplified advantages — a difficulty bias (Dr. GRPO)."
    },
    {
      "id": 9,
      "section": "Bias",
      "q": "Dr. GRPO's unbiased fix is closest to:",
      "options": [
        "REINFORCE leave-one-out: $r_i - \\frac{1}{G-1}\\sum_{j\\neq i} r_j$",
        "GAE with a learned critic",
        "DPO's pairwise loss",
        "PPO with a tighter clip"
      ],
      "answer": 0,
      "explain": "Removing the std and length-normalization terms recovers an estimator close to REINFORCE-leave-one-out."
    },
    {
      "id": 10,
      "section": "R1",
      "q": "R1-Zero is trained with which rewards?",
      "options": [
        "A learned Bradley-Terry reward model",
        "Rule-based accuracy (correct answer) plus format (thinking tags)",
        "Human pairwise preferences only",
        "Process supervision at every step"
      ],
      "answer": 1,
      "explain": "R1-Zero uses only two rule-based rewards — accuracy and format — with GRPO, no SFT and no learned RM."
    },
    {
      "id": 11,
      "section": "R1",
      "q": "The emergent phenomenon highlighted in R1-Zero training is:",
      "options": [
        "Vocabulary growth",
        "Lower training loss with no reward change",
        "Lengthening chains of thought and self-verification ('aha') from pure RL",
        "Mode collapse to a single answer"
      ],
      "answer": 2,
      "explain": "With pure RL on verifiable rewards, CoT lengthens and the model begins to self-correct — capability elicited, not taught."
    },
    {
      "id": 12,
      "section": "R1",
      "q": "How does R1 differ from R1-Zero?",
      "options": [
        "It removes GRPO entirely",
        "It uses MCTS instead of RL",
        "It drops verifiable rewards for a learned RM",
        "It adds an SFT cold start, a language-consistency reward, and multi-stage training"
      ],
      "answer": 3,
      "explain": "R1 wraps the same RL core with an SFT cold start, language-consistency reward, and SFT/RLHF stages for readability and breadth."
    },
    {
      "id": 13,
      "section": "R1",
      "q": "On getting small models to reason, R1 found that:",
      "options": [
        "Distilling ~800k R1 CoT traces via SFT beats running RL directly on the small model",
        "Small-model RLVR beats distillation",
        "Small models cannot reason at all",
        "Only the value network transfers"
      ],
      "answer": 0,
      "explain": "The small model can't explore to the traces itself; SFT on R1's 800k traces (distillation) outperforms small-model RL."
    },
    {
      "id": 14,
      "section": "Case studies",
      "q": "Kimi k1.5's explicit length reward incentivizes:",
      "options": [
        "All answers to be as long as possible",
        "Correct answers to be short; incorrect ones shorter than the group center",
        "Only format tokens",
        "Maximizing entropy of the CoT"
      ],
      "answer": 1,
      "explain": "Kimi adds a length-control reward (enabled late in training) pushing correct CoTs short and wrong ones below the group center."
    },
    {
      "id": 15,
      "section": "Case studies",
      "q": "Qwen3's headline RLVR result is:",
      "options": [
        "It needs tens of millions of examples",
        "It abandons GRPO for PPO",
        "Strong reasoning from GRPO on only ~4k heavily-filtered examples (low-data RLVR)",
        "It requires no data filtering"
      ],
      "answer": 2,
      "explain": "Qwen3 shows low-data RLVR — GRPO on ~4,000 curated examples after difficulty/dedup/leakage filtering."
    },
    {
      "id": 16,
      "section": "Infra",
      "q": "A core reason RL post-training is hard to make efficient is:",
      "options": [
        "Gradients are non-differentiable",
        "It cannot use GPUs",
        "The KL term has no gradient",
        "On-policy rollouts interleave slow inference with training (often two frameworks) and long CoTs make batches uneven"
      ],
      "answer": 3,
      "explain": "On-policy RL needs autoregressive rollouts plus training, frequently across separate inference/training stacks, with highly uneven long-CoT batch lengths."
    }
  ]
});
