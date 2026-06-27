/* CS336 Companion lecture data. Auto-formatted; quiz answer positions
   round-robin-balanced across A/B/C/D. Edit content here; keep it pure data. */
registerLecture({
  "id": 1,
  "estMinutes": 18,
  "topics": [
    "BPE",
    "bitter lesson",
    "compression ratio",
    "6ND"
  ],
  "overview": "CS336's thesis is <em>understanding via building</em>: you only really know a language model once you've built every layer of the stack. Lecture 1 frames the whole course as an <strong>efficiency problem</strong> — best model per unit of compute and data — then builds the first real component, the tokenizer, ending at Byte-Pair Encoding.",
  "sections": [
    {
      "id": "why",
      "title": "Why build from scratch",
      "blocks": [
        {
          "p": "Researchers have drifted up the abstraction stack: implement-and-train (≈2017) → download-and-finetune BERT (≈2019) → prompt a proprietary API (today). Productivity rose, but the abstractions are <em>leaky</em>, and frontier research still requires tearing up the stack."
        },
        {
          "callout": "Frontier models are out of reach (GPT-4 ≈ 1.8T params, ~$100M; xAI's 200k-H100 cluster), and there are no public build details. The bet of this course is that the <strong>mechanics</strong> and <strong>mindset</strong> still transfer down to the &lt;1B-param models you can actually train.",
          "kind": "key"
        },
        {
          "h": "What actually transfers across scale"
        },
        {
          "p": "Lecture 1 splits knowledge into three kinds and is honest about which survive a 1000× scale gap:"
        },
        {
          "table": {
            "head": [
              "Type",
              "Example",
              "Transfers?"
            ],
            "rows": [
              [
                "Mechanics",
                "what a Transformer is; how model parallelism uses GPUs",
                "Yes"
              ],
              [
                "Mindset",
                "take scale seriously; squeeze the hardware",
                "Yes"
              ],
              [
                "Intuitions",
                "which data/architecture choices help accuracy",
                "Only partially"
              ]
            ]
          }
        },
        {
          "callout": "<strong>More is different.</strong> Small models can mislead: the fraction of FLOPs spent in attention vs. MLP shifts with scale, and some capabilities only <em>emerge</em> at scale (Wei et al. 2022). Don't over-trust a conclusion drawn at 100M params.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "bitter-lesson",
      "title": "The bitter lesson, re-read",
      "blocks": [
        {
          "p": "The common reading — <em>“scale is all that matters, algorithms don't”</em> — is wrong. The lecture's reading: <strong>algorithms that scale are what matter.</strong> The organizing equation for the course is:"
        },
        {
          "math": "\\text{accuracy} \\;=\\; \\text{efficiency} \\,\\times\\, \\text{resources}"
        },
        {
          "p": "Resources are data + hardware (compute, memory, bandwidth). Efficiency is how much accuracy you extract per resource — and it matters <em>more</em> at scale, because waste is unaffordable. One cited result: ~44× algorithmic efficiency gain on ImageNet between 2012–2019, independent of hardware."
        },
        {
          "callout": "Reframe every design decision as: <em>given a fixed compute + data budget, what's the best model I can build?</em> That single question motivates tokenization choices, architecture tweaks, the single-epoch training regime, and scaling-law-guided hyperparameter search.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "landscape",
      "title": "How we got here — and what “open” means",
      "blocks": [
        {
          "p": "A compressed history: n-gram models (Shannon's entropy of English) → first neural LM (Bengio 2003) → seq2seq + attention → the Transformer (2017) → ELMo/BERT/T5 (pretrain-then-finetune) → GPT-2/3 (scaling + in-context learning) → Chinchilla (compute-optimal) → the open wave (Pile/GPT-J, OPT, BLOOM, Llama, Qwen, DeepSeek, OLMo)."
        },
        {
          "h": "Three levels of openness"
        },
        {
          "table": {
            "head": [
              "Level",
              "Example",
              "What you get"
            ],
            "rows": [
              [
                "Closed",
                "GPT-4o",
                "API access only"
              ],
              [
                "Open-weight",
                "DeepSeek",
                "weights + architecture + some training detail; <strong>no data</strong>"
              ],
              [
                "Open-source",
                "OLMo",
                "weights + <strong>data</strong> + most details (rarely the failed experiments)"
              ]
            ]
          }
        },
        {
          "callout": "Pair model with contribution when you study this list: GPT-3 = in-context learning; Chinchilla = compute-optimal scaling; T5 = text-to-text; GPT-2 = zero-shot + staged release. These attributions show up constantly downstream.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "efficiency",
      "title": "The whole course is an efficiency story",
      "blocks": [
        {
          "p": "The five units each exist to spend compute well. The lecture states the design driver explicitly for each:"
        },
        {
          "table": {
            "head": [
              "Unit",
              "Efficiency lever"
            ],
            "rows": [
              [
                "Basics (tokenize, architecture, train)",
                "get a correct full pipeline; single epoch is enough"
              ],
              [
                "Systems (kernels, parallelism, inference)",
                "minimize data movement; maximize hardware utilization"
              ],
              [
                "Scaling laws",
                "tune cheaply on small models, predict the large one"
              ],
              [
                "Data",
                "don't waste compute updating on bad/irrelevant tokens"
              ],
              [
                "Alignment",
                "tune toward use-cases so a smaller base suffices"
              ]
            ]
          }
        },
        {
          "callout": "Working with raw bytes is elegant but <em>compute</em>-inefficient with today's architectures — which is exactly why tokenization exists. Efficiency, not aesthetics, wins.",
          "kind": "key"
        }
      ]
    },
    {
      "id": "tokenization",
      "title": "Tokenization: strings ↔ integers",
      "blocks": [
        {
          "p": "A <strong>tokenizer</strong> reversibly maps a string to a sequence of integer tokens via <code>encode</code> / <code>decode</code>. The LM places a distribution over token sequences, so the tokenizer fixes the alphabet the model ever sees. Quality metric: the <strong>compression ratio</strong> = bytes / tokens (higher = each token covers more text = shorter sequences = cheaper)."
        },
        {
          "h": "Three naive schemes and why they fail"
        },
        {
          "table": {
            "head": [
              "Scheme",
              "Vocab",
              "Problem"
            ],
            "rows": [
              [
                "Character (Unicode code points)",
                "~150K",
                "huge vocab; rare glyphs (🌍) waste capacity"
              ],
              [
                "Byte (UTF-8)",
                "256",
                "compression ratio = 1 → sequences far too long"
              ],
              [
                "Word (+ regex split)",
                "unbounded",
                "OOV → UNK (ugly, corrupts perplexity); no fixed size"
              ]
            ]
          }
        },
        {
          "callout": "Byte-level looks great (tiny 256 vocab) until you realize ratio = 1 means one token per byte. Attention is <em>quadratic</em> in sequence length, so long byte sequences are brutal. The vocab-vs-sequence-length tension is the whole game.",
          "kind": "pitfall"
        },
        {
          "h": "Byte-Pair Encoding (BPE)"
        },
        {
          "p": "BPE (Gage 1994 for compression → Sennrich 2016 for NMT → GPT-2) <em>trains</em> the vocabulary from corpus statistics: start from bytes, then repeatedly merge the most frequent adjacent pair into a new token. Common sequences collapse to one token; rare ones stay split."
        },
        {
          "code": "indices = list(map(int, string.encode('utf-8')))   # start: raw bytes\nfor i in range(num_merges):\n    counts = count_adjacent_pairs(indices)\n    pair = max(counts, key=counts.get)        # most frequent adjacent pair\n    new_index = 256 + i\n    merges[pair] = new_index                  # record the merge\n    indices = merge(indices, pair, new_index) # apply it",
          "lang": "python"
        },
        {
          "callout": "GPT-2 first splits text with a regex (so merges never cross word/space boundaries), then runs BPE per chunk. Hence the famous quirks: a leading space is bundled into the next token (<code>\" world\"</code>), and numbers split into few-digit chunks.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "accounting",
      "title": "Bridge to Lecture 2: the 6ND rule",
      "blocks": [
        {
          "p": "Lecture 1 ends pointing at resource accounting. The headline you'll use constantly: training a model with $N$ parameters on $D$ tokens costs about"
        },
        {
          "math": "C_{\\text{train}} \\;\\approx\\; 6ND \\;\\text{FLOPs}"
        },
        {
          "p": "Counting per weight per token: the forward pass is one multiply-add ($2$ FLOPs); the backward pass is two ($4$ FLOPs) — once for the weight's own gradient, once to relay the gradient to the previous layer. So $2 + 4 = 6$. Inference (forward only) is $\\approx 2N$ per token. Lecture 2 makes this rigorous and adds memory accounting."
        },
        {
          "callout": "This $6ND$ estimate counts only parameter matmuls. It ignores the non-parameter attention FLOPs ($QK^\\top$, attention·$V$), which scale with sequence length squared — fine for modest context, an undercount for long context.",
          "kind": "note"
        }
      ]
    }
  ],
  "takeaways": [
    "The course's north star: <strong>accuracy = efficiency × resources</strong>; efficiency dominates at scale.",
    "Mechanics and mindset transfer down to small models; intuitions only partially — beware conclusions drawn at tiny scale.",
    "Openness has tiers: closed (API) → open-weight (no data) → open-source (with data).",
    "Tokenizers trade vocabulary size against sequence length; character, byte, and word schemes each break one side of that trade.",
    "BPE learns the vocab from corpus statistics by greedily merging the most frequent adjacent pair, starting from bytes.",
    "Training compute ≈ 6ND; inference ≈ 2N/token — the single most useful back-of-envelope in the course."
  ],
  "references": [
    {
      "label": "CS336 Lecture 1 trace (Percy Liang)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_01"
    },
    {
      "label": "Sennrich et al. 2016 — BPE for NMT",
      "url": "https://arxiv.org/abs/1508.07909"
    },
    {
      "label": "Kaplan et al. 2020 — Scaling laws (6ND)",
      "url": "https://arxiv.org/abs/2001.08361"
    },
    {
      "label": "Karpathy — Let's build the GPT tokenizer",
      "url": "https://www.youtube.com/watch?v=zduSFxRajkE"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Philosophy",
      "q": "The lecture's correct reading of “the bitter lesson” is:",
      "options": [
        "Algorithms that scale are what matter",
        "Scale is all that matters; algorithms are irrelevant",
        "Bigger models always beat smaller ones regardless of data",
        "Hand-engineered features win at scale"
      ],
      "answer": 0,
      "explain": "“Algorithms that scale is what matters.” Framed as accuracy = efficiency × resources."
    },
    {
      "id": 2,
      "section": "Philosophy",
      "q": "Under accuracy = efficiency × resources, as scale grows, efficiency:",
      "options": [
        "Matters less, since you have more compute to burn",
        "Matters more — you can't afford to be wasteful",
        "Stays equally important",
        "Becomes irrelevant next to raw resources"
      ],
      "answer": 1,
      "explain": "Efficiency matters more at larger scale; waste is unaffordable."
    },
    {
      "id": 3,
      "section": "Philosophy",
      "q": "Of mechanics, mindset, and intuitions, which transfer reliably to frontier scale?",
      "options": [
        "Only intuitions",
        "Only mechanics",
        "Mechanics and mindset",
        "All three equally"
      ],
      "answer": 2,
      "explain": "Mechanics + mindset transfer; intuitions only partially."
    },
    {
      "id": 4,
      "section": "Philosophy",
      "q": "Which is cited as evidence small models may mislead?",
      "options": [
        "Tokenizer vocab shrinks with scale",
        "Learning rate is scale-invariant",
        "Batch size stops mattering at scale",
        "The fraction of FLOPs in attention vs. MLP shifts with scale (and capabilities emerge)"
      ],
      "answer": 3,
      "explain": "“More is different”: attention/MLP FLOP split changes with scale; emergence (Wei et al.)."
    },
    {
      "id": 5,
      "section": "Landscape",
      "q": "An open-weight model (e.g., DeepSeek) gives you:",
      "options": [
        "Weights + architecture/some training details, but no data details",
        "API access only",
        "Weights + full training data + all rationale",
        "A paper only, no weights"
      ],
      "answer": 0,
      "explain": "Open-weight = weights + arch/some training detail, no data. Open-source (OLMo) adds data."
    },
    {
      "id": 6,
      "section": "Landscape",
      "q": "Match contribution to model:",
      "options": [
        "GPT-3 → compute-optimal scaling; Chinchilla → in-context learning",
        "GPT-3 → in-context learning; Chinchilla → compute-optimal scaling laws",
        "T5 → staged release; BERT → text-to-text",
        "GPT-2 → 175B scale; PaLM → first zero-shot"
      ],
      "answer": 1,
      "explain": "GPT-3 = in-context learning; Chinchilla = compute-optimal scaling."
    },
    {
      "id": 7,
      "section": "Course shape",
      "q": "Inference's two phases: which is memory-bound?",
      "options": [
        "Prefill — all prompt tokens at once",
        "Both are compute-bound",
        "Decode — one token at a time",
        "Prefill — due to KV-cache reads"
      ],
      "answer": 2,
      "explain": "Decode generates one token at a time (memory-bound); prefill is compute-bound."
    },
    {
      "id": 8,
      "section": "Course shape",
      "q": "Globally, which compute is larger?",
      "options": [
        "Training always dominates",
        "Training ≈ inference",
        "Inference is negligible",
        "Inference (every use) exceeds training (one-time)"
      ],
      "answer": 3,
      "explain": "Aggregate inference compute exceeds the one-time training cost."
    },
    {
      "id": 9,
      "section": "Course shape",
      "q": "Speculative decoding speeds decoding by:",
      "options": [
        "A cheap draft model proposes tokens; the full model verifies in parallel — exact decoding",
        "Approximating the output distribution (trades accuracy)",
        "Skipping low-probability tokens",
        "Precomputing all continuations"
      ],
      "answer": 0,
      "explain": "Draft proposes, full model verifies in parallel; output is exact."
    },
    {
      "id": 10,
      "section": "Course shape",
      "q": "The Chinchilla rule of thumb quoted is:",
      "options": [
        "D* = 2 N*",
        "D* = 20 N* (1.4B model → ~28B tokens)",
        "N* = 20 D*",
        "D* = N*²"
      ],
      "answer": 1,
      "explain": "Compute-optimal D* ≈ 20 N*."
    },
    {
      "id": 11,
      "section": "Tokenization",
      "q": "A tokenizer is best described as:",
      "options": [
        "A next-word predictor",
        "A weight-compression scheme",
        "A reversible map between strings and integer-token sequences",
        "A stop-word remover"
      ],
      "answer": 2,
      "explain": "Strings ↔ integer tokens via encode()/decode()."
    },
    {
      "id": 12,
      "section": "Tokenization",
      "q": "The main problem with character-based tokenization:",
      "options": [
        "Sequences are far too long",
        "Unseen tokens become UNK",
        "It can't round-trip",
        "Huge vocab (~150K) with many rare, wasted characters"
      ],
      "answer": 3,
      "explain": "~150K Unicode chars → huge vocab. (Too-long sequences is the byte problem.)"
    },
    {
      "id": 13,
      "section": "Tokenization",
      "q": "Byte-level (UTF-8) has vocab 256 and compression ratio = 1. Why is that bad?",
      "options": [
        "Sequences become too long — attention is quadratic in length",
        "It wastes vocabulary",
        "It loses information",
        "It can't decode emoji"
      ],
      "answer": 0,
      "explain": "1 byte/token → very long sequences; attention cost is quadratic."
    },
    {
      "id": 14,
      "section": "Tokenization",
      "q": "A key drawback of word-based tokenization:",
      "options": [
        "Vocab fixed at 256",
        "Unseen words → UNK, which is ugly and corrupts perplexity",
        "Compression ratio is 1",
        "It can't represent spaces"
      ],
      "answer": 1,
      "explain": "OOV → UNK; also unbounded vocab."
    },
    {
      "id": 15,
      "section": "Tokenization",
      "q": "The core training step of BPE is:",
      "options": [
        "Split into words, assign random integers",
        "Merge the least frequent pairs to save vocab",
        "Start from bytes; repeatedly merge the most frequent adjacent pair",
        "Cluster characters by embedding similarity"
      ],
      "answer": 2,
      "explain": "Greedy most-frequent-adjacent-pair merges, starting from bytes."
    },
    {
      "id": 16,
      "section": "Tokenization",
      "q": "BPE's lineage:",
      "options": [
        "Speech recognition (1994) → BERT",
        "Machine translation → T5",
        "Image coding → GPT-3",
        "Data compression (Gage 1994) → NMT (Sennrich 2016) → GPT-2"
      ],
      "answer": 3,
      "explain": "Gage 1994 (compression) → Sennrich 2016 (NMT) → GPT-2."
    },
    {
      "id": 17,
      "section": "Tokenization",
      "q": "compression_ratio = bytes / tokens. A higher ratio means:",
      "options": [
        "Fewer tokens per unit text — shorter sequences, more efficient",
        "Longer sequences (worse)",
        "A bigger vocabulary",
        "More UNK tokens"
      ],
      "answer": 0,
      "explain": "Higher bytes/token → each token covers more text → shorter sequences."
    },
    {
      "id": 18,
      "section": "Tokenization",
      "q": "Which is an observed GPT-2 tokenizer behavior?",
      "options": [
        "Each character is its own token",
        "A leading space is bundled into the following word's token",
        "Numbers are always one token",
        "Whitespace is discarded"
      ],
      "answer": 1,
      "explain": "GPT-2 regex pre-tokenization bundles the leading space with the word."
    },
    {
      "id": 19,
      "section": "Resource accounting",
      "q": "Total training FLOPs for N params over D tokens ≈",
      "options": [
        "2ND",
        "4ND",
        "6ND",
        "3ND"
      ],
      "answer": 2,
      "explain": "6ND = forward (2ND) + backward (4ND). Inference ≈ 2N/token."
    },
    {
      "id": 20,
      "section": "Resource accounting",
      "q": "The backward pass is ~2× the forward FLOPs because:",
      "options": [
        "It recomputes activations",
        "The optimizer runs twice",
        "Gradients use higher precision",
        "Each weight computes both its own gradient and the gradient relayed to the previous layer"
      ],
      "answer": 3,
      "explain": "Two grad matmuls per weight: ∂L/∂w (update) + ∂L/∂input (relay)."
    }
  ]
});
