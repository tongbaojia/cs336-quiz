/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 12,
  "estMinutes": 20,
  "topics": [
    "perplexity",
    "MMLU",
    "LM-as-judge",
    "Chatbot Arena",
    "contamination"
  ],
  "overview": "Evaluation asks a deceptively simple question: given a <em>fixed</em> model, how good is it? Lecture 12 argues there is <strong>no one true evaluation</strong> — perplexity, multiple-choice benchmarks, generative tasks, LM-judges, and human arenas each measure something different and fail in a different way. The researcher's job is to pick the metric that matches the question and to know exactly how each one can lie to you.",
  "sections": [
    {
      "id": "framing",
      "title": "How to think about evaluation",
      "blocks": [
        {
          "p": "Evaluation looks mechanical — throw prompts at a model, average some numbers — but it is the control signal that steers the entire field: every benchmark that gets optimized becomes a target, and every target distorts. Percy Liang's framing is that there is no one true evaluation; the right one depends on the question you are actually asking."
        },
        {
          "p": "Four distinct goals, each demanding a different concrete eval:"
        },
        {
          "list": [
            "<strong>Purchase decision</strong> — pick model A vs B for a specific use case (e.g., a support chatbot).",
            "<strong>Raw capability</strong> — measure intelligence/skill for research.",
            "<strong>Benefits + harms</strong> — inform business and policy.",
            "<strong>Developer feedback</strong> — signal to improve the next checkpoint."
          ]
        },
        {
          "h": "A four-part framework"
        },
        {
          "list": [
            "<strong>Inputs</strong> — which use cases are covered? Is the difficult tail represented? Are inputs adapted to the model (multi-turn)?",
            "<strong>How you call the LM</strong> — prompt format, chain-of-thought, tools, RAG. Are you testing the model or an agentic <em>system</em>?",
            "<strong>How you score outputs</strong> — reference quality, the metric (pass@k), cost, asymmetric errors (medical hallucination), open-ended generation with no ground truth.",
            "<strong>How you interpret</strong> — is 91% deployable? How do you assess generalization under train-test overlap? Are you crediting the model or the method?"
          ],
          "ordered": true
        },
        {
          "callout": "A recurring fork: are you evaluating the <em>language model</em> or the <em>system</em> (model + scaffolding)? A model developer wants the former; a user wants the latter. SWE-bench, RAG pipelines, and agents all score the system — swap the scaffold and the number moves.",
          "kind": "connection"
        },
        {
          "callout": "Pre-foundation-model evals scored <em>methods</em> on fixed train/test splits (ImageNet, SQuAD): anyone could enter and the data was shared. Today we score <em>models/systems</em> where “anything goes” on the training side. The rare surviving method-evals — nanoGPT speedrun (fixed data + compute, race to a target val-loss) and DataComp-LM (fixed pipeline, optimize the data) — exist precisely to re-enable apples-to-apples comparison.",
          "kind": "insight"
        },
        {
          "quote": "When a measure becomes a target, it ceases to be a good measure.",
          "cite": "Goodhart's law (Strathern's formulation)"
        }
      ]
    },
    {
      "id": "perplexity",
      "title": "Perplexity: the textbook LM metric",
      "blocks": [
        {
          "p": "A language model is just a distribution $p(x)$ over token sequences. The textbook intrinsic metric is <strong>perplexity</strong>: the inverse geometric-mean probability the model assigns to a held-out dataset $D$ — equivalently, the exponentiated average per-token negative log-likelihood."
        },
        {
          "math": "\\text{PPL}(D) = \\left(\\prod_{i=1}^{|D|} \\frac{1}{p(x_i \\mid x_{1:i-1})}\\right)^{1/|D|} = \\exp\\!\\left(-\\frac{1}{|D|}\\sum_{i=1}^{|D|} \\log p(x_i \\mid x_{1:i-1})\\right)"
        },
        {
          "p": "It is the effective branching factor: PPL $=k$ means the model is as uncertain as a uniform choice over $k$ tokens. Pretraining minimizes it on the train split; you report it on a held-out test split. Classic corpora: Penn Treebank, WikiText-103, the One Billion Word Benchmark. GPT-2 reported these <em>zero-shot</em> (trained on WebText, evaluated out-of-distribution) and still beat in-domain models on the smaller sets — transfer helps most when the test set is small."
        },
        {
          "callout": "The maximalist view: if your model $p$ matched the true distribution $t$, perplexity would hit its floor at the entropy of language $H(t)$ (attained iff $p=t$), and a model that <em>is</em> $t$ can solve every task. So relentlessly pushing perplexity down is a path to general capability. The caveat is efficiency — much of the probability mass sits on tokens irrelevant to any task you care about, so per-token likelihood is a blunt capability target.",
          "kind": "key"
        },
        {
          "h": "Why cross-model perplexity comparisons are fraught"
        },
        {
          "p": "Perplexity is <em>per token</em>, and a token is not a fixed unit. A model with a coarser tokenizer segments the same text into fewer, higher-information tokens: its per-token NLL is larger but $|D|$ is smaller. Two models with different vocabularies therefore report perplexities in incomparable units — a bigger vocab can flatter the number without the model being better. The fix is to normalize by a tokenizer-independent denominator, raw UTF-8 <strong>bytes</strong> (or characters):"
        },
        {
          "math": "\\text{bits-per-byte} = \\frac{1}{n_{\\text{bytes}}}\\sum_{i=1}^{|D|} \\bigl(-\\log_2 p(x_i \\mid x_{1:i-1})\\bigr)"
        },
        {
          "code": "import math, torch\nimport torch.nn.functional as F\n\ndef bits_per_byte(logits, targets, n_bytes):\n    # logits (T,V), targets (T,) token ids; n_bytes = raw UTF-8 byte count\n    nll = F.cross_entropy(logits, targets, reduction='sum')   # nats (base e)\n    return (nll / n_bytes) / math.log(2), nll                 # base-2, per raw byte\n\nbpb, nll = bits_per_byte(logits, targets, n_bytes)\nppl = torch.exp(nll / targets.numel())   # per-TOKEN -> tokenizer-dependent\n# bpb normalizes by bytes -> comparable across tokenizers (used by The Pile, Gopher)",
          "lang": "python"
        },
        {
          "callout": "Three ways perplexity lies: (1) different tokenizers ⇒ per-token PPL is apples-to-oranges (report bits-per-byte instead); (2) a perplexity leaderboard must <em>trust</em> the model's probabilities to be normalized (sum to 1), whereas task accuracy needs only the generated text; (3) historically, UNK tokens let models shove mass off-vocabulary and game perplexity.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "multiple-choice",
      "title": "Multiple-choice benchmarks and scoring subtleties",
      "blocks": [
        {
          "p": "Several leaderboard “benchmarks” are spiritually perplexity. <strong>HellaSwag</strong> (adversarial commonsense sentence completion) and <strong>LAMBADA</strong> rank candidate continuations by likelihood; <strong>MMLU</strong> (57 subjects, 4 choices — really a <em>knowledge</em> test, not language understanding) and <strong>ARC</strong> (the AI2 Reasoning Challenge, grade-school science) are multiple-choice. None require generation — you score the options. (Don't confuse ARC with ARC-AGI, Chollet's abstraction puzzles, which are a different beast.)"
        },
        {
          "h": "How do you actually score a multiple-choice question?"
        },
        {
          "list": [
            "<strong>Answer-letter</strong> — format the options as A/B/C/D and compare the probability on each letter token (<code>p('A')</code> vs <code>p('B')</code>). Tests whether the model binds the symbol; brittle to letter/position bias and ignores the answer content.",
            "<strong>Answer-text (cloze)</strong> — compute the likelihood of each full answer <em>string</em> and take the argmax. Tests whether the model finds the answer plausible. The two schemes can disagree by several points on the same model."
          ]
        },
        {
          "p": "Answer-text scoring has a length problem: longer answers have lower joint probability, so raw likelihood is biased toward short options. Normalizations: per-token, per-byte (HellaSwag's <code>acc_norm</code>), or <em>unconditional</em> PMI normalization (GPT-3) — divide the conditional likelihood $p(a \\mid q)$ by the answer's probability under a neutral context $p(a \\mid \\text{ctx}_0)$ to cancel raw surface frequency."
        },
        {
          "code": "def score_choice(model, q, answer):\n    # joint log-prob of the answer tokens given the question/prompt\n    lp = logprob(model, prompt=q, cont=answer)   # sum_t log p(a_t | q, a_<t)\n    return {\n        'raw':        lp,                              # biased toward short answers\n        'token_norm': lp / n_tokens(answer),           # per-token\n        'byte_norm':  lp / n_bytes(answer),            # HellaSwag acc_norm, tokenizer-agnostic\n        'pmi':        lp - logprob(model, 'Answer:', answer),  # GPT-3 unconditional norm\n    }\n\npred = max(choices, key=lambda c: score_choice(model, q, c)['byte_norm'])",
          "lang": "python"
        },
        {
          "table": {
            "head": [
              "Scoring scheme",
              "What it tests",
              "Failure mode"
            ],
            "rows": [
              [
                "Answer-letter <code>p('A')</code>",
                "symbol binding",
                "letter/position bias; ignores answer content"
              ],
              [
                "Cloze, raw likelihood",
                "answer plausibility",
                "length bias toward short answers"
              ],
              [
                "Length-normalized (token/byte)",
                "plausibility, length-fair",
                "still ignores calibration; byte-norm needs raw bytes"
              ],
              [
                "PMI / unconditional",
                "de-biased for surface frequency",
                "needs a sensible neutral baseline prompt"
              ],
              [
                "Generate-then-extract (CoT)",
                "reasoning, not recognition",
                "answer-parsing brittleness; more compute"
              ]
            ]
          }
        },
        {
          "callout": "Scoring choice is a reproducibility hazard: the <em>same</em> model on the <em>same</em> MMLU can swing several points between the Eleuther harness (cloze likelihood) and HELM (answer-letter), and between 0-shot and 5-shot. An MMLU number reported without the harness, normalization, and shot count is nearly meaningless.",
          "kind": "pitfall"
        },
        {
          "p": "Harder variants fight saturation: MMLU-Pro (10 choices, chain-of-thought, noisy items removed) drops accuracies 16–33%; GPQA (PhD-written, “Google-proof”) sits at ~65% for human experts vs ~34% for non-experts with web access."
        },
        {
          "callout": "Multiple-choice over-credits <em>recognition</em>: a model can pick the right option without being able to produce it, and a 4-way item has a 25% guess floor. Generative variants (MMLU-Pro with CoT, GPQA, open-ended) are harder precisely because they remove both the recognition shortcut and the luck floor.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "generative-instruction",
      "title": "Generative and instruction-following evals",
      "blocks": [
        {
          "p": "Multiple-choice hands the model the answer set. <strong>Generative</strong> tasks make it produce the answer. <strong>GSM8K</strong> (8.5K grade-school math problems, ~7.5K train / 1K test) is scored by exact-match on the final numeric answer after a <code>####</code> delimiter; MATH and code (pass@k) are similar — the model writes a chain-of-thought and you parse out the final answer."
        },
        {
          "callout": "Exact-match on free-form generation is brittle: <code>#### 42</code> vs <code>42.0</code> vs “the answer is 42 dollars” can be the right reasoning scored wrong by a regex. A meaningful share of apparent GSM8K/MATH errors are answer-extraction failures, not reasoning failures — flexible matching changes rankings.",
          "kind": "pitfall"
        },
        {
          "p": "Instruction following (popularized by ChatGPT) is harder still — open-ended responses with no ground truth. Three workhorses span the verifiable-to-judged spectrum:"
        },
        {
          "list": [
            "<strong>IFEval</strong> — synthetic, programmatically <em>verifiable</em> constraints (“reply in ≥3 paragraphs”, “use no commas”). Checks form, not semantics or quality.",
            "<strong>AlpacaEval</strong> — 805 instructions; metric = win-rate vs a GPT-4 baseline judged by GPT-4 (a built-in bias; the length-controlled variant regresses out response length).",
            "<strong>WildBench</strong> — 1024 prompts mined from 1M real human-chatbot conversations, judged with a checklist (CoT-for-judging); ~0.95 correlation with Chatbot Arena, the de-facto sanity check."
          ]
        },
        {
          "table": {
            "head": [
              "Eval family",
              "What it measures",
              "Characteristic failure mode"
            ],
            "rows": [
              [
                "Perplexity / bits-per-byte",
                "intrinsic fit to language",
                "tokenizer-dependent; not task-aligned"
              ],
              [
                "MMLU / ARC (multiple-choice)",
                "factual knowledge, recognition",
                "scoring + shot variance; 25% guess floor; contamination"
              ],
              [
                "HellaSwag / LAMBADA",
                "likelihood of a plausible continuation",
                "length-norm sensitivity; saturated"
              ],
              [
                "GSM8K / MATH (generative)",
                "multi-step reasoning",
                "answer-extraction brittleness; contamination"
              ],
              [
                "IFEval",
                "verifiable constraint-following",
                "ignores semantics + overall quality"
              ],
              [
                "AlpacaEval / WildBench (LM-judge)",
                "helpfulness vs a baseline",
                "judge bias: length, position, self-preference"
              ],
              [
                "Chatbot Arena (human Elo)",
                "aggregate human preference",
                "slow; rewards style/vibes over substance"
              ],
              [
                "SWE-bench / agents",
                "end-to-end system task success",
                "scaffold-dependent; scores the system, not the model"
              ]
            ]
          }
        },
        {
          "callout": "Notice how the failure modes ladder up: intrinsic metrics are tokenizer-bound, MC is scoring-bound, generative is extraction-bound, judged evals are bias-bound, and human/agent evals are system-bound. No single row is “the” evaluation.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "judges-arena",
      "title": "LM-as-judge and human preference (Elo)",
      "blocks": [
        {
          "p": "Open-ended quality has no reference answer, so you need a <em>judge</em>. Two options trade cost against fidelity: an LM-judge (cheap, scalable, instant) or human pairwise preference (the gold standard, but slow and expensive)."
        },
        {
          "list": [
            "<strong>Position bias</strong> — the judge favors whichever answer is shown first (or second), independent of content.",
            "<strong>Verbosity / length bias</strong> — longer answers are rated better regardless of substance.",
            "<strong>Self-preference (self-enhancement)</strong> — a judge scores its own family's outputs higher.",
            "Plus formatting and sycophancy biases — the judge rewards confident, well-formatted style."
          ]
        },
        {
          "p": "Mitigations: swap the two answers and average over both orderings (cancels position bias); length-control the metric (length-controlled AlpacaEval regresses out response length, lifting correlation with the Arena from ~0.93 to ~0.98); and <em>calibrate</em> — check the judge's agreement with humans (strong LM-judges reach ~80%, about the human–human rate) rather than trusting raw scores."
        },
        {
          "callout": "Self-preference is a live conflict of interest: AlpacaEval's headline metric is win-rate against GPT-4 <em>as judged by GPT-4</em>. A judge that systematically rewards verbosity and its own style turns a “quality” leaderboard into a style leaderboard. Never let the judge share a family with a ranked contestant without a bias audit.",
          "kind": "pitfall"
        },
        {
          "h": "Chatbot Arena: Elo from human pairwise votes"
        },
        {
          "p": "The Arena shows a random user two anonymized model responses to their own prompt and records which they prefer. Ratings come from a Bradley–Terry / Elo model fit to the pairwise outcomes — live (not static) inputs, model-agnostic, and able to absorb new entrants."
        },
        {
          "math": "P(A \\succ B) = \\sigma(\\beta_A - \\beta_B) = \\frac{1}{1 + e^{-(\\beta_A - \\beta_B)}} \\quad\\Longleftrightarrow\\quad P(A \\text{ beats } B) = \\frac{1}{1 + 10^{-(R_A - R_B)/400}}"
        },
        {
          "callout": "Elo scores are estimates, not truths. The Arena reports <strong>bootstrap confidence intervals</strong> — resample the battles with replacement, refit Bradley–Terry each time, take percentiles — and models whose intervals overlap are statistically tied. Treat the board as a partial order with CI-width ties, not a strict ranking; and remember it rewards style (length, formatting, sycophancy) alongside correctness.",
          "kind": "insight"
        },
        {
          "code": "import numpy as np\n\ndef bootstrap_elo(battles, B=1000):\n    # battles: list of (model_a, model_b, winner)\n    ratings = []\n    for _ in range(B):\n        sample = resample(battles)               # N battles, sampled with replacement\n        ratings.append(fit_bradley_terry(sample))\n    lo, hi = np.percentile(ratings, [2.5, 97.5], axis=0)\n    return lo, hi    # 95% CI per model -> overlapping intervals == statistical tie",
          "lang": "python"
        }
      ]
    },
    {
      "id": "validity-and-compute",
      "title": "Validity: contamination, brittleness, test-time compute",
      "blocks": [
        {
          "p": "A score is only as good as its validity. The dominant threat is <strong>contamination</strong>: ML 101 says don't train on the test set, but frontier models train on undisclosed Internet-scale corpora, so benchmarks routinely leak into pretraining and the score then measures memorization, not generalization."
        },
        {
          "callout": "Contamination inflates scores silently. A freshly-collected GSM8K clone (GSM1k) exposed up to ~13% accuracy drops for some model families — overfitting to the public test set. Cleaned “Platinum” / “Verified” variants (e.g., SWE-bench Verified) exist because the originals were both noisy and leaked.",
          "kind": "pitfall"
        },
        {
          "h": "Detecting leakage and reporting it"
        },
        {
          "list": [
            "<strong>Exchangeability test</strong> (Oren et al. 2023) — absent contamination, the test examples are exchangeable, so the dataset's log-probability is invariant to ordering; if the model saw the data <em>in order</em>, the canonical ordering scores higher than random shuffles, and a permutation test detects it.",
            "<strong>n-gram / substring overlap</strong> and planted <strong>canary strings</strong> for direct leakage checks.",
            "<strong>Reporting norms</strong> — providers should publish train-test overlap and confidence intervals, not just point estimates."
          ]
        },
        {
          "h": "Brittleness: the score is a high-variance function of nuisance factors"
        },
        {
          "list": [
            "Prompt format and wording; the number of few-shot examples; option ordering and the answer-letter mapping; the scoring harness itself.",
            "Each can move results by several points with no change to the model — ablate one factor at a time and report the variance, not a single number."
          ]
        },
        {
          "p": "Finally: what are you even evaluating — the model or the method? <strong>Test-time compute</strong> changes the answer. Chain-of-thought prompting, <strong>self-consistency</strong> (sample $N$ reasoning paths, majority-vote the answer), and best-of-$N$ all trade inference FLOPs for accuracy. <strong>System</strong> evals (RAG, SWE-bench agents) score model + scaffolding together."
        },
        {
          "code": "from collections import Counter\n\n# self-consistency: sample N chains-of-thought, then majority-vote the answer\ndef self_consistency(model, prompt, n=40, temperature=0.7):\n    answers = []\n    for _ in range(n):\n        cot = model.sample(prompt, temperature=temperature)\n        answers.append(extract_final_answer(cot))\n    return Counter(answers).most_common(1)[0][0]   # trades inference FLOPs for accuracy",
          "lang": "python"
        },
        {
          "callout": "This loops back to “state the rules of the game.” Is CoT allowed? How many samples? Tools and retrieval? pass@1 or pass@k? A benchmark number is meaningless until the test-time-compute budget and scaffold are fixed — which is exactly why method-evals pin them down.",
          "kind": "connection"
        }
      ]
    }
  ],
  "takeaways": [
    "No one true evaluation — match the metric to the question; “methods vs models/systems” is the first fork (state the rules of the game).",
    "Perplexity = exp(mean per-token NLL); it is tokenizer-dependent, so compare models in <strong>bits-per-byte</strong>, never raw per-token PPL.",
    "Multiple-choice scoring is underdetermined: answer-letter vs cloze likelihood, and length/PMI normalization, swing the same model by points.",
    "Generative evals are extraction-brittle; instruction-following splits into <em>verifiable</em> (IFEval) vs <em>judged</em> (AlpacaEval / WildBench).",
    "LM-judges are cheap but biased (position, verbosity, self-preference) — swap-and-average, length-control, and calibrate against humans.",
    "Chatbot Arena Elo comes with bootstrap CIs: overlapping intervals are ties, and it rewards style as much as substance.",
    "Contamination and prompt/few-shot brittleness threaten validity; always fix and report the test-time-compute budget and scaffold."
  ],
  "references": [
    {
      "label": "CS336 Lecture 12 trace (Percy Liang)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_12"
    },
    {
      "label": "Hendrycks et al. 2021 — MMLU",
      "url": "https://arxiv.org/abs/2009.03300"
    },
    {
      "label": "Zellers et al. 2019 — HellaSwag",
      "url": "https://arxiv.org/abs/1905.07830"
    },
    {
      "label": "Cobbe et al. 2021 — GSM8K",
      "url": "https://arxiv.org/abs/2110.14168"
    },
    {
      "label": "Zheng et al. 2023 — Judging LLM-as-a-judge (MT-Bench / biases)",
      "url": "https://arxiv.org/abs/2306.05685"
    },
    {
      "label": "Chiang et al. 2024 — Chatbot Arena",
      "url": "https://arxiv.org/abs/2403.04132"
    },
    {
      "label": "Dubois et al. 2024 — Length-Controlled AlpacaEval",
      "url": "https://arxiv.org/abs/2404.04475"
    },
    {
      "label": "Oren et al. 2023 — Proving Test Set Contamination",
      "url": "https://arxiv.org/abs/2310.17623"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Framing",
      "q": "Lecture 12's central claim about evaluation is that:",
      "options": [
        "There is no one true evaluation; the right metric depends on the question being asked",
        "A single well-designed benchmark (e.g., MMLU) suffices for most decisions",
        "Perplexity is the only metric that generalizes across models",
        "Human preference is always the ground truth"
      ],
      "answer": 0,
      "explain": "The organizing claim: no one true evaluation. Inputs, how you call the LM, scoring, and interpretation all depend on the goal (purchase decision, capability, harms, developer feedback)."
    },
    {
      "id": 2,
      "section": "Framing",
      "q": "Why are the nanoGPT speedrun and DataComp-LM described as “method” evaluations rather than “model” evaluations?",
      "options": [
        "They use human judges instead of automatic metrics",
        "They fix the data and compute budget and compare procedures, restoring apples-to-apples comparison",
        "They only evaluate closed-source models",
        "They report perplexity rather than accuracy"
      ],
      "answer": 1,
      "explain": "Pre-foundation evals scored methods on shared train/test splits. These pin the data + compute so the procedure is what's compared — the rare modern method-evals."
    },
    {
      "id": 3,
      "section": "Perplexity",
      "q": "Perplexity on a held-out set $D$ equals:",
      "options": [
        "The average cross-entropy already expressed in bits per byte",
        "The KL divergence between the model and the true distribution",
        "The exponentiated average per-token negative log-likelihood, $\\exp(-\\tfrac{1}{|D|}\\sum_i \\log p(x_i\\mid x_{1:i-1}))$",
        "The fraction of tokens predicted with $p>0.5$"
      ],
      "answer": 2,
      "explain": "Perplexity is the inverse geometric-mean probability = exp of the mean per-token NLL = effective branching factor."
    },
    {
      "id": 4,
      "section": "Perplexity",
      "q": "Under the “perplexity maximalist” view, the floor of achievable perplexity corresponds to:",
      "options": [
        "Zero, for a sufficiently large model",
        "One, since probabilities are normalized",
        "The vocabulary size $V$",
        "The entropy $H(t)$ of the true distribution, attained only when $p=t$"
      ],
      "answer": 3,
      "explain": "Perplexity bottoms out at the entropy of language (attained iff $p=t$); a model equal to $t$ could solve any task. Caveat: most mass is on task-irrelevant tokens, so it's a blunt target."
    },
    {
      "id": 5,
      "section": "Perplexity",
      "q": "Comparing raw perplexity across two models with different tokenizers is unreliable because:",
      "options": [
        "Perplexity is per-token, and a coarser tokenizer changes both the per-token NLL and $|D|$, so the unit differs",
        "Perplexity is undefined for subword tokenizers",
        "Larger vocabularies always have lower entropy",
        "Perplexity ignores the test set entirely"
      ],
      "answer": 0,
      "explain": "A coarser tokenizer yields fewer, higher-information tokens — incomparable per-token units. Normalize to bits-per-byte to compare."
    },
    {
      "id": 6,
      "section": "Perplexity",
      "q": "The standard fix for tokenizer-dependent perplexity is to report:",
      "options": [
        "Per-token perplexity at a fixed sampling temperature",
        "Bits-per-byte: total NLL in bits divided by the raw UTF-8 byte count",
        "Top-1 next-token accuracy on the test set",
        "Perplexity averaged over several tokenizers"
      ],
      "answer": 1,
      "explain": "Because decoding is deterministic, $p(\\text{byte string})$ equals the product over the model's own segmentation; dividing by raw bytes makes it comparable (The Pile, Gopher)."
    },
    {
      "id": 7,
      "section": "Multiple-choice",
      "q": "Scoring an MC item via $p(\\text{'A'})$ on the answer letter vs. via the likelihood of each full answer string can:",
      "options": [
        "Always agree by construction",
        "Only differ for non-English benchmarks",
        "Disagree by several points on the same model and benchmark",
        "Be identical after a softmax"
      ],
      "answer": 2,
      "explain": "Answer-letter and cloze/likelihood scoring measure different things (symbol binding vs plausibility) and routinely diverge — a reproducibility hazard (HELM vs Eleuther harness)."
    },
    {
      "id": 8,
      "section": "Multiple-choice",
      "q": "Why does cloze/likelihood scoring of answer <em>text</em> need length normalization?",
      "options": [
        "Longer answers tokenize to fewer tokens",
        "KaTeX cannot render long answer strings",
        "Normalization increases the random-guess rate",
        "Raw joint probability is biased toward shorter answers, since each extra token multiplies in a factor below 1"
      ],
      "answer": 3,
      "explain": "Joint likelihood shrinks with length, favoring short options. Fixes: per-token/per-byte norm (HellaSwag acc_norm) or PMI/unconditional normalization (GPT-3)."
    },
    {
      "id": 9,
      "section": "Generative",
      "q": "Under exact-match scoring, a meaningful share of apparent GSM8K/MATH errors are actually:",
      "options": [
        "Answer-extraction/formatting failures (e.g., “42.0” vs <code>#### 42</code>), not reasoning failures",
        "Arithmetic mistakes inside the chain-of-thought",
        "Tokenizer encoding errors",
        "Contamination artifacts"
      ],
      "answer": 0,
      "explain": "Free-form generation must be parsed; brittle regex extraction scores correct reasoning as wrong. Flexible matching changes rankings."
    },
    {
      "id": 10,
      "section": "Instruction following",
      "q": "IFEval evaluates instruction-following by:",
      "options": [
        "Asking GPT-4 to rate semantic quality on a 10-point scale",
        "Checking programmatically verifiable constraints (paragraph count, banned words), not the response's semantics",
        "Computing the perplexity of the instruction",
        "Collecting human pairwise votes"
      ],
      "answer": 1,
      "explain": "IFEval adds synthetic constraints that are automatically checkable. It measures form/compliance, not whether the answer is actually good."
    },
    {
      "id": 11,
      "section": "Judges",
      "q": "Which set are well-documented biases of LM-as-judge?",
      "options": [
        "Tokenizer bias, batch-size bias, and seed bias",
        "Label noise, class imbalance, and leakage",
        "Position bias, verbosity/length bias, and self-preference",
        "Temperature bias and top-p bias"
      ],
      "answer": 2,
      "explain": "Zheng et al. 2023 name position, verbosity, and self-enhancement biases. Mitigate by swapping positions and averaging, length-controlling, and calibrating to human agreement."
    },
    {
      "id": 12,
      "section": "Judges",
      "q": "The conflict of interest baked into AlpacaEval's headline metric is that:",
      "options": [
        "It uses only 80 prompts",
        "It requires open weights to run",
        "It scores perplexity instead of preference",
        "Win-rate is computed against a GPT-4 baseline judged by GPT-4 — a self-preference / style bias"
      ],
      "answer": 3,
      "explain": "Judge and baseline share a family. The length-controlled variant removes the verbosity component and raises correlation with the Arena."
    },
    {
      "id": 13,
      "section": "Arena",
      "q": "Chatbot Arena fits a Bradley–Terry/Elo model to pairwise human votes and reports bootstrap CIs so that:",
      "options": [
        "Models whose confidence intervals overlap are treated as statistically tied",
        "Every model receives a unique integer rank",
        "The judge's self-preference is automatically removed",
        "Perplexity becomes comparable across models"
      ],
      "answer": 0,
      "explain": "Resample battles with replacement, refit BT, take percentiles. Overlapping intervals are not distinguishable — read the board as a partial order."
    },
    {
      "id": 14,
      "section": "Validity",
      "q": "The exchangeability-based contamination test (Oren et al. 2023) flags leakage when:",
      "options": [
        "The model's accuracy exceeds that of human experts",
        "The dataset's log-probability is higher under its canonical ordering than under random shuffles",
        "The model refuses to answer contaminated prompts",
        "Test-set perplexity falls below 1"
      ],
      "answer": 1,
      "explain": "Absent contamination, examples are exchangeable so log-prob is order-invariant. Seeing the data in order breaks exchangeability; a permutation test detects the gap."
    },
    {
      "id": 15,
      "section": "Validity",
      "q": "Benchmark scores are high-variance with respect to nuisance factors. Which is an example of that brittleness?",
      "options": [
        "Switching the optimizer's random seed mid-training",
        "Using a physically larger GPU",
        "The few-shot count and prompt format moving accuracy by several points with no change to the model",
        "Casting weights from fp16 to bf16"
      ],
      "answer": 2,
      "explain": "Prompt wording, shot count, option order, and the harness all shift scores without changing the model. Ablate one factor at a time and report variance."
    },
    {
      "id": 16,
      "section": "Test-time compute",
      "q": "Self-consistency raises reasoning-task accuracy by:",
      "options": [
        "Fine-tuning the model on the test set",
        "Lowering the sampling temperature to 0",
        "Increasing the model's parameter count",
        "Sampling multiple chains-of-thought and majority-voting the final answer"
      ],
      "answer": 3,
      "explain": "It trades inference FLOPs for accuracy and shifts the question to model-vs-method: the eval must state whether such test-time compute is allowed."
    }
  ]
});
