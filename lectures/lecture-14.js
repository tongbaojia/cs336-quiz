/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 14,
  "estMinutes": 21,
  "topics": [
    "filtering",
    "deduplication",
    "MinHash / LSH",
    "Bloom filters",
    "data mixing"
  ],
  "overview": "Lecture 13 surveyed <em>where</em> data comes from; this one is the mechanics of turning a raw web dump into training tokens. Two workhorses: <strong>filtering</strong> (language, quality, toxicity — all the same 'find the subset of raw data that looks like a reference corpus' problem) and <strong>deduplication</strong> (exact and near-dup, made linear-time by hashing). We close on data <strong>mixing</strong> — how much of each domain to actually train on.",
  "sections": [
    {
      "id": "filtering-framework",
      "title": "Filtering is one problem in three disguises",
      "blocks": [
        {
          "p": "Almost every filter is the same task: given a small <strong>target</strong> set \\(T\\) (what you want — say, Wikipedia-like text) and a huge <strong>raw</strong> set \\(R\\), find the subset \\(T' \\subseteq R\\) that looks like \\(T\\). Two desiderata pull against each other:"
        },
        {
          "list": [
            "<strong>Generalize</strong> from \\(T\\): you want $T'$ broader than \\(T\\), not a memorized copy of it.",
            "<strong>Be extremely fast</strong>: the scorer runs over all of \\(R\\), which is enormous — so it must be a cheap proxy, not a transformer."
          ]
        },
        {
          "p": "The three classic implementations (KenLM, fastText, DSIR) differ <em>only</em> in the scoring function and the keep rule:"
        },
        {
          "table": {
            "head": [
              "Method",
              "Type",
              "Score(x)",
              "Keep rule"
            ],
            "rows": [
              [
                "KenLM",
                "generative model of \\(T\\)",
                "\\(p_T(x)\\)",
                "score ≥ threshold (stochastic)"
              ],
              [
                "fastText",
                "discriminative classifier",
                "\\(p(T \\mid x)\\)",
                "score ≥ threshold (stochastic)"
              ],
              [
                "DSIR",
                "importance resampling",
                "\\(p_T(x)/p_R(x)\\)",
                "resample ∝ score"
              ]
            ]
          }
        },
        {
          "math": "\\text{score}_{\\mathrm{DSIR}}(x) = \\frac{p_T(x)}{p_R(x)}"
        },
        {
          "callout": "The filter need not be a good language model — it must be a fast, cheap proxy that <em>separates</em> \\(T\\) from \\(R\\). That is exactly why a linear fastText or a 5-gram KenLM, not a 7B transformer, does the heavy lifting at web scale. Quality is bought with throughput here, not parameters.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "classifiers",
      "title": "The algorithmic building blocks",
      "blocks": [
        {
          "p": "Three reusable scorers underlie every filtering application below."
        },
        {
          "h": "KenLM: n-gram model + Kneser-Ney"
        },
        {
          "p": "Maximum-likelihood n-gram probabilities are just normalized counts; the problem is sparsity (most long n-grams have count 0), which Kneser-Ney smoothing fixes by backing off to lower orders. It is crude but blazing fast — count and normalize. Documents are scored by <strong>perplexity</strong>, normalized by length so short documents aren't favored."
        },
        {
          "math": "p(\\text{in} \\mid \\text{the cat}) = \\frac{\\mathrm{count}(\\text{the cat in})}{\\mathrm{count}(\\text{the cat})}"
        },
        {
          "math": "\\mathrm{perplexity}(x) = \\exp\\!\\left(-\\frac{\\log p(x)}{N_{\\text{tok}}}\\right)"
        },
        {
          "code": "import math, kenlm\nmodel = kenlm.Model('en.arpa.bin')   # 5-gram KenLM trained on Wikipedia\n\ndef perplexity(content):\n    content = '<s> ' + content.replace(',', ' ,').replace('.', ' .') + ' </s>'\n    score = model.score(content)                  # log p(content)\n    n = len(list(model.full_scores(content)))     # normalize by num tokens\n    return math.exp(-score / n)\n\n# Fluent Wikipedia-like text -> low perplexity; 'asdf asdf asdf' -> high",
          "lang": "python"
        },
        {
          "p": "<strong>CCNet</strong> applies exactly this: split documents into paragraphs, sort by perplexity under a Wikipedia-trained KenLM, and keep the <strong>lowest-perplexity third</strong>. This filter fed LLaMA."
        },
        {
          "h": "fastText: bag of word embeddings"
        },
        {
          "p": "fastText is a linear classifier over <em>averaged word embeddings</em>. The trick is to embed-then-average: parameters are \\(H(V{+}K)\\) instead of the \\(V\\cdot K\\) of a bag-of-words softmax. For quality filtering there are just \\(K{=}2\\) classes (good vs bad). n-gram features would blow up the vocabulary, so each n-gram is hashed into one of ~10M fixed bins."
        },
        {
          "code": "# fastText = bag of word *embeddings* (not bag of words):\nV, H, K = 8192, 16, 2               # vocab, hidden, classes (good vs bad)\nW = nn.Embedding(V, H)              # V x H  (embeddings shared across classes)\nU = nn.Linear(H, K)                 # H x K\n# y = softmax(U(W(x).mean(dim=0)))  -> only H*(V + K) params, not V*K\n\n# n-gram features are unbounded -> hash them into a fixed number of bins:\nnum_bins = 10_000_000\nhashed = [mmh3.hash(ngram) % num_bins for ngram in ngrams]",
          "lang": "python"
        },
        {
          "h": "DSIR: importance resampling"
        },
        {
          "p": "DSIR models <em>both</em> the target and raw distributions (as hashed-n-gram models) and resamples raw data with weight \\(p_T/p_R\\) — sampling from the proposal \\(q\\), reweighting by \\(p/q\\), then resampling. It is slightly better than fastText on GLUE at similar compute, and is more principled about preserving diversity."
        },
        {
          "code": "# DSIR: importance resampling toward target p using proposal q\nvocabulary, p, q, n = [0, 1, 2, 3], [.1, .2, .3, .4], [.4, .3, .2, .1], 100\n\nsamples = np.random.choice(vocabulary, p=q, size=n)   # 1. sample from q\nw = [p[x] / q[x] for x in samples]                    # 2. weight by p/q\nw = [wi / sum(w) for wi in w]                          #    normalize\nsamples = np.random.choice(samples, p=w, size=n)      # 3. resample -> ~ p",
          "lang": "python"
        },
        {
          "callout": "All three fit one template — estimate a model from \\(T\\) (and maybe \\(R\\)), derive a score, keep by score. Generative (\\(p_T\\)), discriminative (\\(p(T\\mid x)\\)), and ratio (\\(p_T/p_R\\)) are the same idea at different angles; you can swap fastText for BERT or Llama if you can afford the FLOPs.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "filtering-applications",
      "title": "Three jobs, one machine: language, quality, toxicity",
      "blocks": [
        {
          "p": "The same scorers drive three distinct filtering tasks."
        },
        {
          "table": {
            "head": [
              "Application",
              "Tool",
              "Target / positives",
              "Decision"
            ],
            "rows": [
              [
                "Language ID",
                "fastText lid.176 (176 langs)",
                "Wikipedia / Tatoeba / SETimes",
                "keep p(English) ≥ 0.5 (Dolma)"
              ],
              [
                "Quality (GPT-3)",
                "linear classifier",
                "Wikipedia, WebText2, Books1/2",
                "stochastic (Pareto) keep"
              ],
              [
                "Quality (LLaMA)",
                "fastText",
                "pages <em>referenced</em> by Wikipedia",
                "keep positive class"
              ],
              [
                "Quality (DCLM)",
                "fastText",
                "OpenHermes-2.5 + ELI5",
                "top-scoring fraction"
              ],
              [
                "Toxicity (Dolma)",
                "fastText",
                "Jigsaw toxic-comment labels",
                "drop hate / NSFW"
              ]
            ]
          }
        },
        {
          "h": "Language identification"
        },
        {
          "p": "fastText's off-the-shelf <code>lid.176</code> covers 176 languages. The multilinguality tradeoff is real: English was only 30% of BLOOM's data and English performance suffered, whereas frontier models go heavily multilingual because they have enough compute to train every language sufficiently."
        },
        {
          "list": [
            "Hard for <strong>short sequences</strong> and low-resource languages.",
            "Can wrongly drop <strong>dialects</strong> of English.",
            "Confuses similar languages (Malay vs Indonesian).",
            "Ill-defined under <strong>code-switching</strong> (Spanish + English in one line)."
          ]
        },
        {
          "h": "Quality filtering: model-based or not"
        },
        {
          "p": "Two camps. Some corpora deliberately <em>avoid</em> model-based filtering (C4, Gopher, RefinedWeb, FineWeb, Dolma) and use hand-written <strong>heuristic rules</strong> — e.g. C4 keeps only lines ending in punctuation with ≥ 5 words and drops pages with bad words or a '<code>{</code>'; Gopher requires ~80% of words to contain an alphabetic character and bounds mean word length, symbol-to-word ratio, and bullet/ellipsis fractions. Others embrace classifiers (GPT-3, LLaMA, DCLM — now the norm). GPT-3 keeps documents <strong>stochastically</strong> rather than thresholding, to avoid collapsing diversity:"
        },
        {
          "code": "# GPT-3 quality filter: keep stochastically (not a hard threshold) to keep diversity\ndef keep_document(score):          # score = classifier P(high-quality | doc)\n    return np.random.pareto(9) > 1 - score",
          "lang": "python"
        },
        {
          "callout": "A 'quality' classifier has no intrinsic notion of quality — it is trained to make raw data <em>look like a chosen reference</em> (Wikipedia, OpenWebText, instruction data). 'Quality' is therefore a <strong>policy choice</strong> baked into the positive set, and it silently imports that set's biases and blind spots.",
          "kind": "insight"
        },
        {
          "callout": "<strong>Over-filtering is a real failure mode.</strong> Nemotron-CC found FineWeb-Edu/DCLM discard ~90% of tokens, and GPT-3 keeps documents stochastically precisely to avoid annihilating diversity. Aggressive quality filters trade coverage for polish and can erase whole dialects or domains — tune the threshold, don't max it.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "why-dedup",
      "title": "Deduplication: why, and the design space",
      "blocks": [
        {
          "p": "Deduplication makes language models strictly better (Lee et al. 2021) for three reasons, none of which is optional at scale:"
        },
        {
          "list": [
            "<strong>Train/test leakage</strong>: duplicated benchmark text contaminates evaluation.",
            "<strong>Memorization</strong>: repeated strings get regurgitated verbatim — a copyright and privacy hazard.",
            "<strong>Wasted compute</strong>: you pay FLOPs to relearn the same tokens; fewer tokens trains faster."
          ]
        },
        {
          "callout": "Scale of the problem: a single product description appears <strong>61,036 times</strong> in C4. Near-duplicates are everywhere too — terms-of-service text, the MIT license, and templated/auto-generated pages that differ by a few tokens.",
          "kind": "key"
        },
        {
          "h": "The design space"
        },
        {
          "p": "Every dedup method is three independent choices:"
        },
        {
          "list": [
            "<strong>What is an item?</strong> a sentence, a paragraph, or a whole document.",
            "<strong>How to match?</strong> exact match, sharing some sub-item, or sharing a fraction of sub-items.",
            "<strong>What action?</strong> remove all copies, or remove all but one."
          ],
          "ordered": true
        },
        {
          "p": "The hard constraint: dedup compares every item against every other item — naively quadratic. Everything below is a trick to make it <strong>linear via hashing</strong>."
        },
        {
          "table": {
            "head": [
              "Method",
              "Granularity",
              "Matches",
              "Error",
              "Scales via"
            ],
            "rows": [
              [
                "Exact hashing",
                "any item",
                "exact",
                "none (modulo collisions)",
                "group-by hash (MapReduce)"
              ],
              [
                "Bloom filter",
                "any item",
                "exact membership",
                "one-sided false positives",
                "bit array + k hashes"
              ],
              [
                "Suffix array",
                "substrings",
                "exact long substrings",
                "none",
                "linear-time substring search"
              ],
              [
                "MinHash + LSH",
                "set of n-grams",
                "Jaccard ≥ threshold",
                "two-sided (approximate)",
                "banded MinHash signatures"
              ]
            ]
          }
        }
      ]
    },
    {
      "id": "exact-and-bloom",
      "title": "Exact dedup and Bloom filters",
      "blocks": [
        {
          "p": "Exact dedup is the simplest: hash every item, group by hash value, keep one representative per group. MurmurHash (fast, not collision-resistant) is fine here — and the whole thing is embarrassingly parallel / MapReduce-shaped."
        },
        {
          "code": "items = ['Hello!', 'hello', 'hello there', 'hello', 'hi', 'bye']\n# group by hash, keep one representative per group (MapReduce-friendly)\ngroups = itertools.groupby(sorted(items, key=mmh3.hash), key=mmh3.hash)\ndeduped = [next(g) for _, g in groups]   # -> one item per distinct hash",
          "lang": "python"
        },
        {
          "p": "C4 applies exact dedup at <strong>3-sentence-span</strong> granularity, removing all but one copy of each span."
        },
        {
          "callout": "<strong>Granularity is a quality knob, not a detail.</strong> Excising a 3-sentence span from the <em>middle</em> of a document can leave the document incoherent. Too coarse (whole-document) misses pervasive near-dups; too fine (per-sentence) shreds prose. There is no free granularity — pick it deliberately.",
          "kind": "pitfall"
        },
        {
          "h": "Bloom filters: approximate set membership"
        },
        {
          "p": "A Bloom filter is a bit array plus \\(k\\) hash functions: to insert, set the \\(k\\) bits; to query, AND the \\(k\\) bits. The error is <strong>one-sided</strong> — a 'no' is definite, a 'yes' may be a false positive — and you can insert but never delete. It is dramatically more memory-efficient than storing every item."
        },
        {
          "code": "def build_table(items, m, k):              # m bins, k hash functions\n    table = bitarray(m); table.setall(0)\n    for item in items:\n        for seed in range(k):\n            table[mmh3.hash(item, seed) % m] = 1\n    return table\n\ndef query(table, item, m, k):              # 'yes' iff all k bits are set\n    return all(table[mmh3.hash(item, seed) % m] for seed in range(k))",
          "lang": "python"
        },
        {
          "p": "Insert \\(n\\) items into \\(m\\) bins with \\(k\\) hashes; the false-positive rate (assuming independence) is"
        },
        {
          "math": "f = \\left(1 - \\left(1 - \\frac{1}{m}\\right)^{kn}\\right)^{k}"
        },
        {
          "p": "Minimizing over \\(k\\) for a fixed memory ratio \\(m/n\\) gives the optimum"
        },
        {
          "math": "k^{\\star} = \\frac{m}{n}\\,\\ln 2 \\qquad\\Longrightarrow\\qquad f = \\left(\\tfrac{1}{2}\\right)^{k^{\\star}}"
        },
        {
          "callout": "More hash functions is <em>not</em> monotonically better: past \\(k^{\\star}\\) you saturate the bit array and the false-positive rate climbs again. Bloom's one-sided error is exactly what dedup wants — a false 'yes' merely drops a unique doc (a tiny, tolerable loss), and there is no false 'no'. Dolma sets \\(f = 10^{-15}\\) on paragraphs.",
          "kind": "note"
        }
      ]
    },
    {
      "id": "minhash-lsh",
      "title": "Near-duplicates: Jaccard, MinHash, LSH",
      "blocks": [
        {
          "p": "Near-dup detection needs a similarity measure. Represent each document as its set of n-grams and use <strong>Jaccard similarity</strong>; two documents are near-duplicates if their Jaccard exceeds a threshold."
        },
        {
          "math": "J(A, B) = \\frac{|A \\cap B|}{|A \\cup B|}"
        },
        {
          "code": "A = {'1', '2', '3', '4'}\nB = {'1', '2', '3', '5'}\njaccard = len(A & B) / len(A | B)        # 3 / 5 = 0.6",
          "lang": "python"
        },
        {
          "h": "MinHash: collisions that encode similarity"
        },
        {
          "p": "A <strong>MinHash</strong> is a random hash \\(h\\) whose collision probability <em>equals</em> the Jaccard similarity. A random hash induces a permutation of all items; \\(h(S)\\) is the minimum hash over \\(S\\), so the minima agree exactly when the globally-first item falls in \\(A \\cap B\\). Unusually, you <em>want</em> informative collisions, not to avoid them — and averaging many MinHashes gives an unbiased Jaccard estimate."
        },
        {
          "math": "\\Pr[\\,h(A) = h(B)\\,] = J(A, B)"
        },
        {
          "code": "def minhash(S, seed):                     # Pr[minhash(A)=minhash(B)] = Jaccard(A,B)\n    return min(mmh3.hash(x, seed) for x in S)\n\nmatches = [minhash(A, s) == minhash(B, s) for s in range(100)]\nestimate = sum(matches) / len(matches)    # Monte-Carlo Jaccard ~ 0.6",
          "lang": "python"
        },
        {
          "h": "LSH: sharpening a probability into a threshold"
        },
        {
          "p": "One MinHash is far too noisy. Use \\(n = b \\cdot r\\) hashes arranged as \\(b\\) bands of \\(r\\) rows each; \\(A\\) and \\(B\\) collide if <em>some</em> band matches on <em>all</em> \\(r\\) of its hashes — an AND within a band, OR across bands. That AND-OR structure turns the soft probability into a near-step at a threshold."
        },
        {
          "math": "P_{\\text{collide}}(s) = 1 - (1 - s^{r})^{b}"
        },
        {
          "code": "def prob_collision(sim, b, r):           # n = b*r MinHashes, b bands of r rows\n    prob_band = sim ** r                  # all r rows of one band agree\n    return 1 - (1 - prob_band) ** b       # some band agrees (OR over bands)\n\n# example (Lee+ 2021): n = 9000, b = 20, r = 450\nthreshold = (1 / 20) ** (1 / 450)         # ~ phase-transition similarity",
          "lang": "python"
        },
        {
          "p": "Tuning: increasing \\(r\\) <strong>sharpens</strong> the curve and shifts the threshold right (stricter — harder to match); increasing \\(b\\) shifts it left (looser). The threshold sits near"
        },
        {
          "math": "s^{\\star} \\approx \\left(\\tfrac{1}{b}\\right)^{1/r}"
        },
        {
          "callout": "Suffix arrays are the complementary tool from the same Lee et al. 2021 paper: build one suffix array over the whole corpus to find <em>exact</em> repeated substrings (≥ ~50 tokens) in linear time. MinHash/LSH catches fuzzy <em>document-level</em> near-dups; suffix arrays catch long <em>verbatim</em> substrings — pipelines use both.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "mixing",
      "title": "Data mixing and domain reweighting",
      "blocks": [
        {
          "p": "Filtering decides which documents survive; <strong>mixing</strong> decides how much of each surviving <em>domain</em> (web, code, books, arXiv) the model actually trains on. Sampling proportional to raw size badly over-weights the web and starves high-value domains."
        },
        {
          "list": [
            "Domains differ in both <strong>quality</strong> and <strong>quantity</strong> — token count is a poor proxy for value.",
            "Small domains (code, math) can punch far above their token weight, especially for reasoning.",
            "High-quality domains (Wikipedia, books) are often <strong>upsampled</strong> for extra epochs in mid-training."
          ]
        },
        {
          "p": "<strong>DoReMi</strong> (Xie et al. 2023) tunes the mixture automatically. Train a small reference model; then train a small <em>proxy</em> with Group DRO that adjusts domain weights \\(\\alpha\\) to maximize worst-case <strong>excess loss</strong> (proxy minus reference); finally train the large model with those weights."
        },
        {
          "math": "\\min_{\\theta}\\; \\max_{\\alpha \\in \\Delta}\\; \\sum_{i} \\alpha_i \\left(\\ell_i(\\theta) - \\ell_i(\\theta_{\\mathrm{ref}})\\right)"
        },
        {
          "p": "On The Pile, DoReMi improved perplexity across <em>all</em> 22 domains (even ones whose weight dropped) and reached the baseline's downstream accuracy ~2.6× faster — and the weights, tuned on a 280M proxy, transferred to an 8B model."
        },
        {
          "callout": "Mixing is leverage you get almost for free: no new data, just reweighting. But the optimal mixture is <strong>reference-dependent</strong> — it is defined relative to the eval/reference distribution, so changing what you optimize for moves the weights. Mid-training upsampling of high-quality domains is the same lever applied by hand.",
          "kind": "insight"
        }
      ]
    }
  ],
  "takeaways": [
    "Language/quality/toxicity filtering are one problem: given a small target T and huge raw R, find the subset of R that looks like T — fast and generalizing, via a cheap proxy (KenLM, fastText, or DSIR).",
    "The three scorers are the same idea at different angles: generative p_T(x) (KenLM), discriminative p(T|x) (fastText), and the importance ratio p_T(x)/p_R(x) (DSIR).",
    "A 'quality' classifier only learns to mimic its positive set (Wikipedia, OpenWebText, instruction data), so 'quality' is a policy choice — and over-filtering (DCLM/FineWeb-Edu drop ~90%) can erase whole domains.",
    "Deduplicate to stop train/test leakage, reduce memorization (copyright/privacy), and save compute — duplication is rampant (a C4 string repeats 61,036 times).",
    "Make dedup linear with hashing: exact group-by, Bloom filters (one-sided error, f = (1-(1-1/m)^(kn))^k, optimal k = (m/n)ln2), suffix arrays for verbatim substrings.",
    "Near-dup math: Jaccard = |A∩B|/|A∪B|; MinHash gives Pr[h(A)=h(B)] = Jaccard; LSH with b bands of r rows yields P=1-(1-s^r)^b, threshold ≈ (1/b)^(1/r) — r sharpens, b loosens.",
    "Mixing/domain reweighting (DoReMi) optimizes worst-case excess loss with a small proxy model; weights transfer to large models but are reference-dependent."
  ],
  "references": [
    {
      "label": "CS336 Lecture 14 trace (Percy Liang)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_14"
    },
    {
      "label": "Wenzek et al. 2020 — CCNet",
      "url": "https://arxiv.org/abs/1911.00359"
    },
    {
      "label": "Joulin et al. 2017 — fastText (bag of tricks)",
      "url": "https://arxiv.org/abs/1607.01759"
    },
    {
      "label": "Xie et al. 2023 — DSIR (importance resampling)",
      "url": "https://arxiv.org/abs/2302.03169"
    },
    {
      "label": "Lee et al. 2022 — Deduplicating Training Data Makes LMs Better",
      "url": "https://arxiv.org/abs/2107.06499"
    },
    {
      "label": "Xie et al. 2023 — DoReMi (domain reweighting)",
      "url": "https://arxiv.org/abs/2305.10429"
    },
    {
      "label": "Leskovec, Rajaraman, Ullman — MMDS Ch.3 (MinHash/LSH)",
      "url": "http://infolab.stanford.edu/~ullman/mmds/ch3n.pdf"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Framework",
      "q": "Liang frames almost every data filter as one problem. What is it?",
      "options": [
        "Given a small target set T and a huge raw set R, find the subset of R that looks like T",
        "Train a transformer to score each document's fluency",
        "Remove every document containing any duplicated sentence",
        "Cluster R into domains and sample uniformly"
      ],
      "answer": 0,
      "explain": "Filtering = given small target T and huge raw R, select the subset T' of R resembling T — fast (runs on all of R) and generalizing beyond T."
    },
    {
      "id": 2,
      "section": "Framework",
      "q": "KenLM, fastText, and DSIR differ mainly in their scoring function. Which mapping is correct?",
      "options": [
        "KenLM: p(T|x); fastText: p_T(x); DSIR: p_T(x)/p_R(x)",
        "KenLM: p_T(x); fastText: p(T|x); DSIR: p_T(x)/p_R(x)",
        "KenLM: p_T(x)/p_R(x); fastText: p_T(x); DSIR: p(T|x)",
        "All three use p(T|x), differing only in classifier architecture"
      ],
      "answer": 1,
      "explain": "Generative KenLM scores p_T(x); discriminative fastText scores p(T|x); DSIR resamples by the importance ratio p_T(x)/p_R(x)."
    },
    {
      "id": 3,
      "section": "Classifiers",
      "q": "CCNet's KenLM quality filter (later used by LLaMA) keeps documents by:",
      "options": [
        "Keeping the highest-perplexity third under a Wikipedia model",
        "Removing any paragraph whose perplexity exceeds the corpus mean",
        "Sorting paragraphs by perplexity under a Wikipedia-trained KenLM and keeping the lowest-perplexity third",
        "Keeping paragraphs that a fastText classifier labels English"
      ],
      "answer": 2,
      "explain": "CCNet sorts paragraphs by perplexity under a Wikipedia KenLM and keeps the lowest-perplexity third (most Wikipedia-like)."
    },
    {
      "id": 4,
      "section": "Classifiers",
      "q": "fastText uses \\(H(V+K)\\) parameters instead of a bag-of-words classifier's \\(V \\cdot K\\). Why?",
      "options": [
        "It hashes the vocabulary down to H bins",
        "It uses 16-bit floats instead of 32-bit",
        "It keeps only the top-H most frequent words",
        "It embeds each word into an H-dim vector and averages, then applies an H×K head — embeddings are shared across classes"
      ],
      "answer": 3,
      "explain": "fastText is a bag of word *embeddings*: a V×H embedding (shared across classes) plus an H×K head gives H(V+K) params, far fewer than V·K."
    },
    {
      "id": 5,
      "section": "Classifiers",
      "q": "fastText applies a 'hashing trick' to n-gram features in order to:",
      "options": [
        "Bound the otherwise unbounded n-gram vocabulary to a fixed number of bins (e.g., 10M)",
        "Make the classifier collision-resistant",
        "Encrypt the training data",
        "Deduplicate the training documents"
      ],
      "answer": 0,
      "explain": "The number of distinct n-grams is unbounded; hashing each into a fixed number of bins keeps the parameter/feature count finite."
    },
    {
      "id": 6,
      "section": "Classifiers",
      "q": "How does DSIR (importance resampling) differ from a fastText quality classifier?",
      "options": [
        "DSIR needs far more compute and a transformer backbone",
        "DSIR models both p_T and p_R as distributions and resamples with weight p_T/p_R — more principled about diversity, at similar compute",
        "DSIR works only for language identification",
        "DSIR requires labeled toxic examples"
      ],
      "answer": 1,
      "explain": "DSIR is generative-ratio based: fit p_T and p_R (hashed n-grams), resample by p_T/p_R. It captures diversity more principledly at comparable cost, slightly beating fastText on GLUE."
    },
    {
      "id": 7,
      "section": "Language ID",
      "q": "Which is a documented caveat of fastText language identification?",
      "options": [
        "It cannot detect English at all",
        "It requires a GPU to run at web scale",
        "It struggles on short sequences and code-switching, and may wrongly drop English dialects",
        "It only supports five languages"
      ],
      "answer": 2,
      "explain": "lid.176 covers 176 languages but is unreliable on short text, code-switching, similar languages (Malay/Indonesian), and non-standard dialects."
    },
    {
      "id": 8,
      "section": "Quality",
      "q": "When GPT-3/LLaMA/DCLM train a 'quality' classifier, what plays the role of the positive class?",
      "options": [
        "Toxic comments from the Jigsaw dataset",
        "Randomly sampled Common Crawl documents",
        "Documents that fail the Gopher heuristic rules",
        "A chosen high-quality reference corpus (Wikipedia/WebText/Books, or instruction data); raw web is the negative"
      ],
      "answer": 3,
      "explain": "Quality classifiers learn to mimic a reference set: GPT-3 used Wikipedia/WebText/Books as positives, DCLM used OpenHermes+ELI5, with raw CommonCrawl as negatives."
    },
    {
      "id": 9,
      "section": "Quality",
      "q": "GPT-3 keeps a document when np.random.pareto(9) > 1 - score rather than thresholding on score. The point of the stochastic rule is to:",
      "options": [
        "Preserve diversity — keep some lower-scoring documents instead of collapsing onto the reference distribution",
        "Run the classifier faster",
        "Guarantee exactly half the corpus is kept",
        "Make the filter deterministic and reproducible"
      ],
      "answer": 0,
      "explain": "Hard thresholding would over-concentrate on reference-like text; the stochastic Pareto rule keeps some lower-scoring docs to retain diversity."
    },
    {
      "id": 10,
      "section": "Quality",
      "q": "Which group of corpora deliberately AVOIDED model-based quality filtering?",
      "options": [
        "GPT-3, LLaMA, DCLM",
        "C4, Gopher, RefinedWeb, FineWeb, Dolma",
        "phi-1, DCLM, Nemotron-CC",
        "All major corpora use model-based filtering"
      ],
      "answer": 1,
      "explain": "C4, Gopher, RefinedWeb, FineWeb, and Dolma rely on heuristic rules; GPT-3, LLaMA, and DCLM are the model-based-filtering camp (now becoming the norm)."
    },
    {
      "id": 11,
      "section": "Dedup",
      "q": "Which is NOT one of the three motivations for deduplication given in the lecture?",
      "options": [
        "Reduce memorization (mitigating copyright/privacy risk)",
        "Prevent train/test leakage",
        "Increase the tokenizer's vocabulary size",
        "Train more efficiently (fewer tokens for the same content)"
      ],
      "answer": 2,
      "explain": "Dedup helps with leakage, memorization, and compute efficiency. It has nothing to do with growing the tokenizer vocabulary."
    },
    {
      "id": 12,
      "section": "Dedup",
      "q": "C4 deduplicates exact 3-sentence spans and removes all but one. The lecture's warning is:",
      "options": [
        "3-sentence spans are too long to hash efficiently",
        "Exact match misses no duplicates, so it over-removes",
        "It requires a Bloom filter to run at all",
        "Excising a span from the middle of a document can leave it incoherent — granularity is a real quality knob"
      ],
      "answer": 3,
      "explain": "Removing a mid-document span can break coherence. Granularity (sentence vs paragraph vs document) trades near-dup recall against document integrity."
    },
    {
      "id": 13,
      "section": "Bloom filters",
      "q": "A Bloom filter's error is one-sided. Which statement is correct?",
      "options": [
        "A 'no' is definite; a 'yes' may be a false positive — and you cannot delete items",
        "A 'yes' is definite; a 'no' may be wrong",
        "Both 'yes' and 'no' may be wrong with equal probability",
        "It never makes mistakes but uses a lot of memory"
      ],
      "answer": 0,
      "explain": "If any of the k bits is 0 the item is definitely absent ('no' is certain); all-ones can occur by chance, so 'yes' may be a false positive. Bloom filters also can't delete."
    },
    {
      "id": 14,
      "section": "Bloom filters",
      "q": "For fixed m/n, the optimal number of hash functions is \\(k = (m/n)\\ln 2\\), giving \\(f = (1/2)^k\\). A consequence is:",
      "options": [
        "More hash functions always lower the false-positive rate",
        "Past the optimum, adding hash functions saturates the bit array and raises the false-positive rate",
        "k should equal the number of items n",
        "The false-positive rate is independent of the memory m"
      ],
      "answer": 1,
      "explain": "f(k) is U-shaped: too few hashes underuses bits, too many saturates them. The minimum is at k* = (m/n)ln2, where f = 0.5^k*."
    },
    {
      "id": 15,
      "section": "MinHash",
      "q": "What is the defining property of a MinHash function h?",
      "options": [
        "h(A) = h(B) only if A and B are byte-identical",
        "h minimizes collisions between all distinct sets",
        "Pr[h(A) = h(B)] = Jaccard(A, B) — collision probability equals set similarity",
        "h(A) returns the Jaccard similarity directly"
      ],
      "answer": 2,
      "explain": "A random permutation makes the per-set minimum collide exactly with probability equal to the Jaccard similarity; averaging many seeds estimates Jaccard."
    },
    {
      "id": 16,
      "section": "LSH",
      "q": "In MinHash-LSH with b bands of r rows, P[collide] = 1 - (1 - s^r)^b. How do b and r shape the threshold?",
      "options": [
        "Increasing r moves the threshold left (looser); increasing b moves it right (stricter)",
        "b and r only affect speed, not the threshold",
        "The threshold is always 0.5 regardless of b and r",
        "Increasing r sharpens and moves the threshold right (stricter); increasing b moves it left (looser); threshold ≈ (1/b)^(1/r)"
      ],
      "answer": 3,
      "explain": "AND within a band (r) makes matching harder → sharper, rightward threshold; OR across bands (b) makes it easier → leftward. The phase transition sits near (1/b)^(1/r)."
    }
  ]
});
