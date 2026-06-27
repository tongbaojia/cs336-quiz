/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 15,
  "estMinutes": 19,
  "topics": [
    "SFT",
    "RLHF",
    "Bradley-Terry",
    "PPO",
    "DPO"
  ],
  "overview": "Pretraining gets you a capable next-token predictor (GPT-3); it does <em>not</em> get you a controllable assistant (InstructGPT). Lecture 15 is the alignment recipe: <strong>imitation then reinforcement</strong> — SFT to surface latent behaviors, then RLHF (Bradley-Terry reward model + KL-regularized policy optimization via PPO or its closed-form cousin DPO) to optimize for what humans actually prefer, with reward over-optimization as the ever-present failure mode.",
  "sections": [
    {
      "id": "base-to-instruct",
      "title": "From base model to instruction follower",
      "blocks": [
        {
          "p": "Pretraining maximizes likelihood of web text, giving a model that <em>continues</em> documents — not one that <em>follows instructions</em> or respects safety constraints. The goal of alignment is tighter, more reliable control over outputs. The standard pipeline (InstructGPT, Ouyang et al. 2022) is two stages: <strong>imitation</strong> (supervised finetuning, SFT) followed by <strong>reinforcement</strong> (RLHF)."
        },
        {
          "p": "SFT is just MLE on curated $(x, y)$ demonstration pairs: maximize the log-likelihood of the response $y$ given the prompt $x$, with the loss masked to the response tokens only (the prompt is conditioning, not a target)."
        },
        {
          "math": "\\mathcal{L}_{\\mathrm{SFT}}(\\theta) \\;=\\; -\\,\\mathbb{E}_{(x,y)\\sim\\mathcal{D}}\\!\\left[\\,\\sum_{t=1}^{|y|}\\log \\pi_\\theta\\!\\left(y_t \\mid x,\\, y_{<t}\\right)\\right]"
        },
        {
          "callout": "Mechanically SFT is identical to pretraining — same cross-entropy, just on instruction-formatted data. Conceptually it is closer to <em>format/persona conditioning</em> than to teaching new skills: it puts the base model into 'assistant mode' and surfaces capabilities the pretraining already installed.",
          "kind": "key"
        },
        {
          "h": "LIMA and the superficial alignment hypothesis"
        },
        {
          "p": "LIMA (Zhou et al. 2023) finetunes LLaMA-65B on only <strong>1,000</strong> carefully curated examples and reaches competitive instruction-following. Its <em>superficial alignment hypothesis</em>: a model's knowledge and abilities are learned almost entirely during pretraining; alignment mostly teaches which sub-distribution of formats and styles to use when interacting with users."
        },
        {
          "callout": "If alignment is largely surfacing latent ability, then for SFT <strong>data quality dominates quantity</strong> — a few hundred to a few thousand high-signal examples can outperform hundreds of thousands of noisy ones. This reframes 'collect more data' into 'curate sharper data.'",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "sft-data",
      "title": "What goes into SFT data (and what backfires)",
      "blocks": [
        {
          "p": "Instruction-tuning corpora vary enormously in length, style, structure (bullets, citations), scale, and safety coverage. Three canonical public datasets illustrate the spread:"
        },
        {
          "table": {
            "head": [
              "Dataset",
              "Origin",
              "Character"
            ],
            "rows": [
              [
                "FLAN",
                "academic NLP tasks reformatted as instructions",
                "huge, templated, terse; classification/QA flavor"
              ],
              [
                "Alpaca",
                "self-instruct distilled from a stronger LM",
                "52k synthetic, broad, uneven quality"
              ],
              [
                "OpenAssistant",
                "human volunteers",
                "long, conversational, citations and structure"
              ]
            ]
          }
        },
        {
          "h": "Do not finetune on knowledge the base model lacks"
        },
        {
          "p": "Folklore made rigorous by Schulman (2023) and Gekhman et al. (2023): SFT on facts the base model does not already 'know' teaches it to emit confident, well-formatted answers it cannot actually retrieve — i.e. it trains the <em>behavior</em> of hallucination. The target should be <em>extracting</em> latent knowledge, not injecting new tail knowledge."
        },
        {
          "callout": "Adding factually <strong>correct</strong> data can still hurt. If the model can't retrieve the fact, the gradient only reinforces the surface form of 'answer confidently,' generalizing to fabrication on the next unknown query. This is why benchmark-correct demonstrations sometimes degrade truthfulness.",
          "kind": "pitfall"
        },
        {
          "h": "Safety and style: small data, big shifts"
        },
        {
          "p": "A few hundred safety examples (~500 Alpaca-style refusals) sharply move a model's safety profile (Bianchi et al. 2023) — the hard part is balancing this against <em>over-refusal</em>. Style is even more dominant in evaluation: human and GPT-judge preferences show very strong <strong>length effects</strong> (Dubois et al. 2023), which confound naive preference comparisons."
        },
        {
          "callout": "'Midtraining' (two-phase training): mix instruction data into the <em>pretraining</em> stream, then do a short dedicated SFT round. This scales instruction tuning without catastrophic forgetting and is widely used though rarely documented (publicized via MiniCPM, JetMoE).",
          "kind": "note"
        }
      ]
    },
    {
      "id": "imitation-to-optimization",
      "title": "Why reinforce at all: imitation vs. optimization",
      "blocks": [
        {
          "p": "SFT is pure imitation: fit $\\hat{p}(y\\mid x) \\approx p^{*}(y\\mid x)$ for some reference policy $p^{*}$. That requires <em>samples from</em> $p^{*}$ (expensive expert demonstrations) and faithfully clones its mistakes — you can never exceed the demonstrator. RLHF instead treats the LM as a <strong>policy</strong> and maximizes a measurable reward."
        },
        {
          "table": {
            "head": [
              "Axis",
              "Imitation (SFT)",
              "Optimization (RLHF)"
            ],
            "rows": [
              [
                "Objective",
                "match a reference distribution",
                "maximize $\\mathbb{E}_{\\pi}[R(x,y)]$"
              ],
              [
                "Supervision",
                "gold demonstrations (write the answer)",
                "scalar / pairwise feedback (judge answers)"
              ],
              [
                "Ceiling",
                "the demonstrator",
                "can exceed it (better than any single demo)"
              ],
              [
                "View of the LM",
                "a model of a distribution",
                "a policy to be steered"
              ]
            ]
          }
        },
        {
          "h": "Why bother with the RL machinery"
        },
        {
          "list": [
            "<strong>Cheaper feedback.</strong> A scalar/pairwise judgment is far cheaper to elicit than a gold demonstration, and the cost curve favors it at scale.",
            "<strong>Generation-verification gap.</strong> People recognize a good output more reliably than they can produce one (Zhang et al. 2023 on summarization) — preferences are higher-signal than demonstrations on hard tasks.",
            "<strong>Correctness feedback.</strong> RL-style reward can penalize confident wrong answers, addressing exactly the hallucination failure SFT induces."
          ]
        },
        {
          "callout": "The generation-verification gap is the economic engine of RLHF: when judging is easier than producing, comparisons buy you more aligned signal per dollar than demonstrations — and they let the policy surpass the people who labeled it.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "reward-modeling",
      "title": "Reward modeling: Bradley-Terry + a KL leash",
      "blocks": [
        {
          "p": "Collect pairwise preferences: for a prompt $x$, an annotator marks a winner $y_w$ and loser $y_l$. Fit a reward model $r_\\phi$ under the <strong>Bradley-Terry</strong> choice model, where the probability one response beats another is a sigmoid of their reward difference:"
        },
        {
          "math": "P\\!\\left(y_w \\succ y_l \\mid x\\right) \\;=\\; \\sigma\\!\\left(r(x,y_w)-r(x,y_l)\\right) \\;=\\; \\frac{1}{1+\\exp\\!\\left(-\\left(r(x,y_w)-r(x,y_l)\\right)\\right)}"
        },
        {
          "p": "Maximum likelihood under this model is a logistic loss on preference pairs — a standard binary classifier on reward differences:"
        },
        {
          "math": "\\mathcal{L}_{\\mathrm{RM}}(\\phi) \\;=\\; -\\,\\mathbb{E}_{(x,\\,y_w,\\,y_l)\\sim\\mathcal{D}}\\!\\left[\\log \\sigma\\!\\left(r_\\phi(x,y_w)-r_\\phi(x,y_l)\\right)\\right]"
        },
        {
          "p": "Now optimize the policy against $r_\\phi$. But $r_\\phi$ is only trustworthy near the data it was trained on; unconstrained maximization drifts off-distribution and the reward becomes meaningless. The fix is a <strong>KL penalty</strong> to the (frozen) SFT reference policy, giving the canonical KL-regularized RLHF objective:"
        },
        {
          "math": "\\max_{\\pi_\\theta}\\;\\; \\mathbb{E}_{x\\sim\\mathcal{D},\\; y\\sim\\pi_\\theta(\\cdot\\mid x)}\\!\\left[\\,r_\\phi(x,y)\\,\\right] \\;-\\; \\beta\\,\\mathbb{D}_{\\mathrm{KL}}\\!\\left(\\pi_\\theta(\\cdot\\mid x)\\;\\|\\;\\pi_{\\mathrm{ref}}(\\cdot\\mid x)\\right)"
        },
        {
          "callout": "$\\beta$ is the leash. Too small and the policy reward-hacks and mode-collapses off into nonsense the RM scores highly; too large and it never moves off the SFT policy. The KL term keeps the policy in the region where $r_\\phi$ is still a faithful proxy for human preference.",
          "kind": "key"
        }
      ]
    },
    {
      "id": "ppo",
      "title": "PPO: optimizing the objective on-policy",
      "blocks": [
        {
          "p": "Maximizing $\\mathbb{E}_{\\pi_\\theta}[r_\\phi]$ is on-policy RL. The lineage: vanilla policy gradients are unbiased but high-variance; TRPO linearizes within a trust region; PPO (Schulman et al. 2017) approximates the trust region cheaply by <strong>clipping the importance ratio</strong>."
        },
        {
          "math": "\\nabla_\\theta\\,\\mathbb{E}_{z\\sim\\pi_\\theta}\\!\\left[R(z)\\right] \\;=\\; \\mathbb{E}_{z\\sim\\pi_\\theta}\\!\\left[\\,R(z)\\,\\nabla_\\theta \\log \\pi_\\theta(z)\\,\\right]"
        },
        {
          "math": "\\mathcal{L}_{\\mathrm{PPO}}(\\theta) = \\mathbb{E}_t\\!\\left[\\min\\!\\left(\\rho_t\\,\\hat{A}_t,\\; \\mathrm{clip}\\!\\left(\\rho_t,\\,1-\\epsilon,\\,1+\\epsilon\\right)\\hat{A}_t\\right)\\right], \\quad \\rho_t = \\frac{\\pi_\\theta(a_t\\mid s_t)}{\\pi_{\\theta_{\\mathrm{old}}}(a_t\\mid s_t)}"
        },
        {
          "p": "In the LM setting this is effectively a <em>bandit</em>: a single dense reward at the final token. In practice you add a <strong>per-token KL penalty</strong> to the reward (clipped where the new policy's log-prob falls below the reference, for stability) and estimate advantages with GAE — where $\\gamma=\\lambda=1$ recovers reward-to-go minus a value baseline. InstructGPT stitches this together as SFT $\\rightarrow$ RM $\\rightarrow$ PPO, with the headline result that a <strong>1.3B</strong> InstructGPT was preferred to the <strong>175B</strong> GPT-3."
        },
        {
          "callout": "PPO is notoriously finicky: a separate value network (extra memory + its own tuning), plus reward/KL/clip/advantage knobs that interact. That operational pain is exactly what motivates DPO (next) and, for verifiable domains, GRPO (Lecture 16).",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "dpo",
      "title": "DPO: RLHF without the reward model",
      "blocks": [
        {
          "p": "DPO (Rafailov et al. 2023) removes both the explicit reward model and the on-policy rollouts. The trick: under the nonparametric optimum of the KL-regularized objective, the optimal policy has a closed form — and you can invert it to write the reward as a log-ratio of the policy to the reference."
        },
        {
          "math": "\\pi^{\\star}(y\\mid x) = \\frac{1}{Z(x)}\\,\\pi_{\\mathrm{ref}}(y\\mid x)\\,\\exp\\!\\left(\\tfrac{1}{\\beta}\\,r(x,y)\\right) \\;\\;\\Longrightarrow\\;\\; r(x,y) = \\beta\\log\\frac{\\pi^{\\star}(y\\mid x)}{\\pi_{\\mathrm{ref}}(y\\mid x)} + \\beta\\log Z(x)"
        },
        {
          "p": "Substitute this 'implied reward' into the Bradley-Terry NLL. The intractable partition function $Z(x)$ cancels in the <em>difference</em> $r(x,y_w)-r(x,y_l)$, leaving a purely supervised loss on preference pairs — no sampling, no RM:"
        },
        {
          "math": "\\mathcal{L}_{\\mathrm{DPO}} = -\\,\\mathbb{E}_{(x,y_w,y_l)}\\!\\left[\\log\\sigma\\!\\left(\\beta\\log\\frac{\\pi_\\theta(y_w\\mid x)}{\\pi_{\\mathrm{ref}}(y_w\\mid x)} - \\beta\\log\\frac{\\pi_\\theta(y_l\\mid x)}{\\pi_{\\mathrm{ref}}(y_l\\mid x)}\\right)\\right]"
        },
        {
          "code": "import torch.nn.functional as F\n\n# per-sequence summed log-probs under policy and frozen reference\nlogr_w = policy_logp_w - ref_logp_w   # log [ pi_theta(y_w) / pi_ref(y_w) ]\nlogr_l = policy_logp_l - ref_logp_l   # log [ pi_theta(y_l) / pi_ref(y_l) ]\nmargin = beta * (logr_w - logr_l)     # implied-reward margin\nloss   = -F.logsigmoid(margin).mean() # + gradient on chosen, - on rejected",
          "lang": "python"
        },
        {
          "callout": "DPO is just MLE on the pairwise rewards under the nonparametric reparametrization — 'positive gradient on the chosen, negative on the rejected,' each scaled by how badly the implied reward currently ranks the pair. Most top open-source 'RLHF' models are actually DPO'd; yet a well-tuned PPO can still edge it out, and RL empirics are highly setup-contingent.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "pitfalls",
      "title": "Reward over-optimization and mode collapse",
      "blocks": [
        {
          "p": "RLHF optimizes a <em>proxy</em>, and proxies obey Goodhart's law: once a measure becomes a target, it stops being a good measure. The reward model is a learned, imperfect stand-in for human preference, so pushing it hard eventually decouples reward from true quality."
        },
        {
          "callout": "<strong>Reward hacking / over-optimization.</strong> As you optimize $r_\\phi$, gold human quality rises then <em>falls</em> — the policy finds inputs the RM over-scores. Gao et al. (2023) fit scaling laws for this: the gap grows with optimization (measured in KL) and shrinks with RM size/data. It holds for human and noisy-LM preferences, but not for a noiseless oracle — confirming the culprit is RM <em>error</em>.",
          "kind": "pitfall"
        },
        {
          "p": "A second failure is <strong>mode collapse</strong>: RLHF stops being a probabilistic model of text. It sharpens onto a few high-reward modes, loses output diversity and entropy, and is no longer calibrated by default — a real cost for sampling-based use and for downstream RL."
        },
        {
          "list": [
            "Keep the KL budget tight and <strong>early-stop</strong> on a held-out true metric, not on proxy reward.",
            "<strong>Ensemble</strong> reward models or add uncertainty penalties to resist exploiting any single RM's errors.",
            "Retain some SFT / pretraining loss to preserve coverage and calibration."
          ]
        },
        {
          "callout": "Over-optimization is fundamentally about a <em>learned, hackable</em> reward. Replace it with a <em>verifiable</em> reward — does the math check out, do the unit tests pass — and you can crank RL far harder without the proxy collapsing. That is RLVR, the subject of Lecture 16.",
          "kind": "note"
        }
      ]
    }
  ],
  "takeaways": [
    "Alignment = imitation then reinforcement: SFT surfaces latent abilities (LIMA: ~1k good examples suffice), RLHF optimizes for human preference.",
    "SFT is MLE on (prompt, response) pairs; finetuning on knowledge the base model lacks teaches hallucination, so extract rather than inject.",
    "RL beats pure imitation because judging is cheaper and higher-signal than demonstrating (generation-verification gap), and the policy can exceed its demonstrators.",
    "RLHF core: Bradley-Terry reward model $P(y_w\\succ y_l)=\\sigma(r_w-r_l)$, then maximize $\\mathbb{E}_\\pi[r_\\phi]-\\beta\\,\\mathrm{KL}(\\pi\\,\\|\\,\\pi_{\\mathrm{ref}})$.",
    "PPO clips the policy ratio for a cheap trust region; InstructGPT's 1.3B beat 175B GPT-3 on preference — alignment buys more than scale here.",
    "DPO reparametrizes reward as $\\beta\\log(\\pi_\\theta/\\pi_{\\mathrm{ref}})$ so $Z(x)$ cancels — RLHF as a supervised pairwise loss, no RM or rollouts.",
    "Over-optimizing a learned reward is Goodhart: gold quality eventually drops and the model mode-collapses; the KL leash, early stopping, and RM ensembles are the guards."
  ],
  "references": [
    {
      "label": "CS336 Lecture 15 trace (Hashimoto)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_15"
    },
    {
      "label": "Ouyang et al. 2022 — InstructGPT",
      "url": "https://arxiv.org/abs/2203.02155"
    },
    {
      "label": "Zhou et al. 2023 — LIMA: Less Is More for Alignment",
      "url": "https://arxiv.org/abs/2305.11206"
    },
    {
      "label": "Stiennon et al. 2020 — Learning to summarize from human feedback",
      "url": "https://arxiv.org/abs/2009.01325"
    },
    {
      "label": "Schulman et al. 2017 — Proximal Policy Optimization",
      "url": "https://arxiv.org/abs/1707.06347"
    },
    {
      "label": "Rafailov et al. 2023 — Direct Preference Optimization",
      "url": "https://arxiv.org/abs/2305.18290"
    },
    {
      "label": "Gao et al. 2023 — Scaling laws for reward model overoptimization",
      "url": "https://arxiv.org/abs/2210.10760"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "SFT",
      "q": "The SFT objective on a (prompt $x$, response $y$) pair is:",
      "options": [
        "Maximize $\\log p(y\\mid x)$, with loss masked to the response tokens",
        "Maximize $p(x\\mid y)$ over the prompt tokens",
        "Minimize KL to a reward model",
        "Maximize a Bradley-Terry preference likelihood"
      ],
      "answer": 0,
      "explain": "SFT is MLE of the response given the prompt; the prompt is conditioning and is masked out of the loss."
    },
    {
      "id": 2,
      "section": "SFT",
      "q": "The 'superficial alignment hypothesis' (LIMA) claims:",
      "options": [
        "Alignment must inject large amounts of new factual knowledge",
        "Abilities are learned in pretraining; alignment mainly selects format/style, so few high-quality examples suffice",
        "Only RLHF, never SFT, can align a model",
        "Preference data must exceed 1M pairs to work"
      ],
      "answer": 1,
      "explain": "LIMA reached strong instruction-following with ~1,000 curated examples; alignment surfaces latent ability, so quality beats quantity."
    },
    {
      "id": 3,
      "section": "SFT data",
      "q": "Why can finetuning on facts the base model does NOT know hurt?",
      "options": [
        "It increases tokenizer vocab",
        "It always causes catastrophic forgetting of grammar",
        "It trains the behavior of confidently answering when retrieval fails, generalizing to hallucination",
        "It violates the Bradley-Terry assumption"
      ],
      "answer": 2,
      "explain": "If the model can't retrieve the fact, the gradient only reinforces 'answer confidently,' which generalizes to fabrication (Schulman/Gekhman)."
    },
    {
      "id": 4,
      "section": "SFT data",
      "q": "A robust empirical finding about preference-based evaluation of SFT/RLHF models is:",
      "options": [
        "Length has no effect on judgments",
        "Only factual accuracy drives preferences",
        "Bullet formatting is always penalized",
        "Strong length effects in both human and LM-judge preferences confound comparisons"
      ],
      "answer": 3,
      "explain": "Dubois et al. 2023 show large length biases in human and GPT-judge preferences — a major confounder."
    },
    {
      "id": 5,
      "section": "Why RL",
      "q": "The clearest reason RLHF can surpass pure SFT is:",
      "options": [
        "Imitation is capped at the demonstrator; optimization against feedback can exceed it",
        "RL uses a larger learning rate",
        "SFT cannot use a GPU efficiently",
        "RLHF needs no human labels"
      ],
      "answer": 0,
      "explain": "SFT clones the reference policy (and its mistakes); RLHF maximizes a reward and can beat any single demonstrator."
    },
    {
      "id": 6,
      "section": "Why RL",
      "q": "The 'generation-verification gap' refers to:",
      "options": [
        "Generators run slower than verifiers on GPUs",
        "People judge a good output more reliably than they can produce one, making comparisons higher-signal",
        "The KL gap between policy and reference",
        "The gap between train and test perplexity"
      ],
      "answer": 1,
      "explain": "Judging is easier and higher-signal than demonstrating on hard tasks — the economic basis for preference data."
    },
    {
      "id": 7,
      "section": "Reward model",
      "q": "Under Bradley-Terry, $P(y_w\\succ y_l\\mid x)$ equals:",
      "options": [
        "$r(x,y_w)-r(x,y_l)$",
        "$\\mathrm{softmax}$ over the vocabulary",
        "$\\sigma(r(x,y_w)-r(x,y_l))$",
        "$\\exp(r(x,y_w))$"
      ],
      "answer": 2,
      "explain": "Bradley-Terry models choice as a sigmoid of the reward difference; its MLE is a logistic loss on pairs."
    },
    {
      "id": 8,
      "section": "Reward model",
      "q": "In the KL-regularized RLHF objective, the role of the $\\beta\\,\\mathrm{KL}(\\pi_\\theta\\,\\|\\,\\pi_{\\mathrm{ref}})$ term is to:",
      "options": [
        "Increase reward magnitude",
        "Replace the value network",
        "Anneal the learning rate",
        "Keep the policy near the reference so the reward model stays a valid proxy"
      ],
      "answer": 3,
      "explain": "The RM is only trustworthy on-distribution; the KL leash prevents drift into regions where $r_\\phi$ is meaningless."
    },
    {
      "id": 9,
      "section": "PPO",
      "q": "PPO's clipped objective primarily provides:",
      "options": [
        "A cheap approximate trust region by clipping the importance ratio $\\rho_t$ to $[1-\\epsilon,1+\\epsilon]$",
        "An exact second-order trust region",
        "A reward model",
        "Token-level supervised labels"
      ],
      "answer": 0,
      "explain": "PPO approximates TRPO's trust region by clipping the policy ratio, bounding each update's size cheaply."
    },
    {
      "id": 10,
      "section": "PPO",
      "q": "Vanilla policy gradients are usually replaced by TRPO/PPO because they:",
      "options": [
        "Are biased",
        "Have very high variance and unstable step sizes",
        "Require a reward model",
        "Cannot use minibatches"
      ],
      "answer": 1,
      "explain": "The score-function estimator is unbiased but high-variance; trust regions / clipping stabilize the updates."
    },
    {
      "id": 11,
      "section": "InstructGPT",
      "q": "A headline InstructGPT result was:",
      "options": [
        "175B GPT-3 always beat the aligned model",
        "RLHF reduced accuracy on every benchmark",
        "A 1.3B InstructGPT was preferred over 175B GPT-3 on human evaluations",
        "PPO was unnecessary; SFT matched it exactly"
      ],
      "answer": 2,
      "explain": "Alignment let a 1.3B model be preferred to 175B GPT-3 — preference gains beyond raw scale."
    },
    {
      "id": 12,
      "section": "DPO",
      "q": "What does DPO eliminate relative to PPO-based RLHF?",
      "options": [
        "The reference policy",
        "The preference data",
        "The KL regularization entirely",
        "The explicit reward model and the on-policy rollouts"
      ],
      "answer": 3,
      "explain": "DPO reparametrizes reward via the policy, turning RLHF into a supervised pairwise loss — no RM, no rollouts (KL is implicit via $\\beta$ and $\\pi_{\\mathrm{ref}}$)."
    },
    {
      "id": 13,
      "section": "DPO",
      "q": "In DPO the intractable partition function $Z(x)$ is handled by:",
      "options": [
        "Cancelling in the reward difference $r(x,y_w)-r(x,y_l)$",
        "Estimating it with importance sampling",
        "Setting it to 1",
        "Learning it with a small MLP"
      ],
      "answer": 0,
      "explain": "The implied reward is $\\beta\\log(\\pi/\\pi_{\\mathrm{ref}})+\\beta\\log Z$; the $\\log Z$ term is identical for $y_w,y_l$ and cancels in the pairwise difference."
    },
    {
      "id": 14,
      "section": "DPO",
      "q": "The DPO gradient is best summarized as:",
      "options": [
        "Uniformly upweight all sampled tokens",
        "Positive gradient on the chosen, negative on the rejected, scaled by the implied reward model's error",
        "Pure entropy maximization",
        "Gradient ascent on the value function"
      ],
      "answer": 1,
      "explain": "DPO increases the chosen response's relative log-prob and decreases the rejected's, weighted by how wrongly the implied reward ranks the pair."
    },
    {
      "id": 15,
      "section": "Pitfalls",
      "q": "Reward over-optimization (Gao et al. 2023) is characterized by:",
      "options": [
        "Monotonically rising gold quality with more optimization",
        "No dependence on KL distance",
        "Gold quality rising then falling as proxy reward keeps increasing, worsening with smaller RMs",
        "Occurring only with a noiseless oracle reward"
      ],
      "answer": 2,
      "explain": "Optimizing a learned RM eventually decouples proxy from gold (Goodhart); the gap grows with KL and shrinks with RM size — and vanishes for a noiseless oracle, fingering RM error."
    },
    {
      "id": 16,
      "section": "Pitfalls",
      "q": "Mode collapse from RLHF refers to:",
      "options": [
        "The model losing its tokenizer",
        "The reward model overfitting the validation set",
        "The KL term going to zero",
        "The policy sharpening onto a few high-reward modes, losing diversity and calibration"
      ],
      "answer": 3,
      "explain": "RLHF stops being a probabilistic model of text: it concentrates on high-reward modes, shedding entropy and calibration."
    }
  ]
});
