/* CS336 Companion lecture data (math: \(..\)/\[..\]; $ is literal). */
registerLecture({
  "id": 13,
  "estMinutes": 19,
  "topics": [
    "data curation",
    "Common Crawl",
    "corpora",
    "copyright"
  ],
  "overview": "Lectures 13–14 pivot from <em>how</em> to train to <strong>what to train on</strong>. Liang's thesis: data is the highest-leverage and least-disclosed ingredient of a language model — open-weight reports tell you the architecture and almost nothing about the data. This lecture follows the pipeline from a live web page to a curated pre-training corpus, plus the legal and editorial choices that shape it.",
  "sections": [
    {
      "id": "data-doesnt-fall",
      "title": "Data doesn't fall from the sky",
      "blocks": [
        {
          "p": "Earlier lectures trained a model <em>given</em> data; the next two ask <em>what</em> data. Liang's hot take: data is the most important thing to get right — and the part labs guard most fiercely. Llama 3's report is detailed on architecture and training procedure but nearly silent on data, for two reasons: <strong>competitive dynamics</strong> and <strong>copyright liability</strong>."
        },
        {
          "callout": "<strong>Data doesn't fall from the sky.</strong> A live service (Reddit, GitHub) → a raw snapshot (crawl, API dump) → processed text (extraction, filtering, dedup) → an aggregated dataset (Dolma, The Pile). Every arrow is human labor. Data is a <em>long-tail</em> problem that scales with effort — unlike architecture or systems, you can't just write a cleverer kernel.",
          "kind": "key"
        },
        {
          "h": "Quantity to quality"
        },
        {
          "p": "Training proceeds through stages, and the value gradient runs from <strong>large amounts of lower-quality data</strong> toward <strong>small amounts of high-quality data</strong>:"
        },
        {
          "list": [
            "<strong>Pre-training</strong>: raw text, e.g. web documents — most of the tokens.",
            "<strong>Mid-training</strong>: more high-quality data to boost specific capabilities (math, code, long context).",
            "<strong>Post-training</strong>: instruction-following / chat data, or RLHF — small but decisive."
          ],
          "ordered": true
        },
        {
          "p": "Terminology: a <strong>base model</strong> is what you get after pre- + mid-training; an <strong>instruct/chat model</strong> after post-training. The lines are blurry and labs add more stages every year."
        },
        {
          "callout": "Because the gradient runs from quantity to quality, the <em>same</em> document can be 'good enough' for pre-training and 'too noisy' for mid-training. Curation isn't one filter but a <strong>cascade</strong> of progressively stricter ones — keep this in mind when you see a single 'quality' knob.",
          "kind": "insight"
        }
      ]
    },
    {
      "id": "sources",
      "title": "Where text actually comes from",
      "blocks": [
        {
          "p": "A useful taxonomy by <em>data object</em> (live service → raw snapshot → processed text → aggregated dataset) crosses with a small number of <em>source</em> wells. Pretraining corpora draw from roughly six:"
        },
        {
          "table": {
            "head": [
              "Source",
              "Canonical dataset(s)",
              "Note"
            ],
            "rows": [
              [
                "Web pages",
                "Common Crawl, WebText",
                "the firehose; mostly boilerplate"
              ],
              [
                "Encyclopedia",
                "Wikipedia dumps",
                "clean, but periodic dumps are attackable"
              ],
              [
                "Books",
                "BooksCorpus, Project Gutenberg / PG-19, Books3",
                "copyright minefield"
              ],
              [
                "Code",
                "GitHub → The Stack, GH Archive",
                "helps coding <em>and</em> reasoning (folklore)"
              ],
              [
                "Academic",
                "arXiv, PubMed Central, PeS2o",
                "LaTeX source; mandated-open papers"
              ],
              [
                "Q&amp;A / forums",
                "StackExchange, Reddit (Pushshift)",
                "Q&amp;A shape ≈ instruction tuning"
              ]
            ]
          }
        },
        {
          "h": "Quality signals are often social"
        },
        {
          "p": "WebText (GPT-2) used a cheap proxy for quality: pages that are <strong>outbound links from Reddit posts with ≥ 3 karma</strong> (8M pages, 40 GB). OpenWebText replicates it (fastText language ID + near-duplicate removal). StackExchange ships votes/badges; GitHub ships stars and licenses — metadata you can filter on for free."
        },
        {
          "callout": "Even gold-standard sources aren't automatically safe. Wikipedia publishes <em>periodic</em> dumps, so a data-poisoning attacker can inject malicious edits timed just before a dump and after the revert window — enough to teach a model to attach negative sentiment to a trigger phrase. High quality ≠ trustworthy.",
          "kind": "pitfall"
        },
        {
          "h": "Code at scale: The Stack"
        },
        {
          "p": "The Stack took repo names from GH Archive (2015–2022), git-cloned <strong>137M repositories / 51B files</strong> — but only ~<strong>5B were unique</strong>. It kept permissively licensed code (MIT/Apache) via <code>go-license-detector</code> and removed near-duplicates with MinHash + Jaccard, yielding 3.1 TB. Note the two recurring moves — <strong>license filtering</strong> and <strong>dedup</strong> — both central to Lecture 14."
        },
        {
          "callout": "Books expose the copyright tension directly: BooksCorpus scraped free Smashwords e-books and was taken down for a ToS violation; Books3 was 196K books from the shadow library Bibliotik and was taken down amid lawsuits. Project Gutenberg (~75K public-domain books) is the safe one — because it is copyright-cleared, not because it is clean.",
          "kind": "connection"
        }
      ]
    },
    {
      "id": "common-crawl",
      "title": "Common Crawl: WARC, WET, and a wasteland",
      "blocks": [
        {
          "p": "Common Crawl is a non-profit (founded 2007) that runs a web crawl roughly monthly; there have been ~100 crawls from 2008–2025 (a 2016 crawl took 10–12 days on 100 machines). It runs Apache Nutch: seed with hundreds of millions of URLs, download from a queue, enqueue the hyperlinks you find."
        },
        {
          "list": [
            "<strong>Selection policy</strong>: which pages are worth downloading?",
            "<strong>Politeness policy</strong>: respect <code>robots.txt</code>, don't overload servers.",
            "<strong>Re-visit policy</strong>: how often to recheck a page for changes?"
          ]
        },
        {
          "p": "A core headache: URLs are dynamic and many distinct URLs resolve to essentially the same content — duplication is baked in from the start."
        },
        {
          "h": "Two formats: WARC vs WET"
        },
        {
          "table": {
            "head": [
              "Format",
              "Contents",
              "Why it matters"
            ],
            "rows": [
              [
                "WARC",
                "raw HTTP response (headers + original HTML)",
                "lets you re-extract text yourself"
              ],
              [
                "WET",
                "pre-extracted plain text (lossy)",
                "convenient but low-quality / boilerplate-laden"
              ]
            ]
          }
        },
        {
          "p": "Turning HTML into text uses tools like <a href='https://trafilatura.readthedocs.io/'>trafilatura</a>, <a href='https://resiliparse.chatnoir.eu/'>resiliparse</a>, or jusText. The DCLM paper showed the extractor choice <strong>alone</strong> moves downstream task accuracy — so strong corpora (RefinedWeb, Pile-CC, FineWeb) ignore WET and re-extract from WARC:"
        },
        {
          "code": "# Common Crawl ships two formats per page:\n#   WARC = raw HTTP response (headers + HTML)\n#   WET  = pre-extracted plain text (lossy, boilerplate-heavy)\n# Strong corpora re-extract main content from WARC instead of trusting WET:\nfrom warcio.archiveiterator import ArchiveIterator\nimport trafilatura                       # or resiliparse / jusText\n\nfor record in ArchiveIterator(open('cc.warc.gz', 'rb')):\n    if record.rec_type != 'response':\n        continue\n    html = record.content_stream().read()\n    text = trafilatura.extract(html)     # strip nav / ads / boilerplate, keep body\n    # next: language ID, quality filter, dedup  (Lecture 14)",
          "lang": "python"
        },
        {
          "callout": "<strong>It's a wasteland.</strong> Most of raw Common Crawl is not useful natural language — nav bars, cookie banners, ads, SEO spam, templated boilerplate. Naively taking WET text (or a blind HTML strip) drags in boilerplate and discards document structure, and the DCLM result is that <em>extraction quality alone</em> changes benchmark numbers. HTML→text is lossy and not a solved problem; treat the extractor as a hyperparameter.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "legal",
      "title": "Copyright, fair use, and licensing",
      "blocks": [
        {
          "p": "Generative AI has triggered a wave of copyright suits, and the uncomfortable baseline is: <strong>most things on the Internet are copyrighted.</strong> Protection is automatic on <em>fixation</em> (no registration needed), the threshold is trivially low (your website counts), and it lasts ~75 years before entering the public domain."
        },
        {
          "p": "Crucially, copyright protects <strong>expression, not ideas</strong>. You may reimplement quicksort (the idea); you may not copy someone's code (the expression). Mere collections (a phone directory) aren't protected unless there is creativity in selection or arrangement."
        },
        {
          "h": "Two lawful paths: license or fair use"
        },
        {
          "p": "A license is, in effect, <em>'a promise not to sue'</em>. Creative Commons enables free redistribution (Wikipedia, Khan Academy, large Flickr/MusicBrainz sets). Increasingly, labs simply <strong>license data</strong>: Google–Reddit, OpenAI–Shutterstock, OpenAI–StackExchange."
        },
        {
          "table": {
            "head": [
              "Fair-use factor (§107)",
              "Favors the user when…"
            ],
            "rows": [
              [
                "1. Purpose &amp; character",
                "educational / <strong>transformative</strong>, not commercial / reproductive"
              ],
              [
                "2. Nature of the work",
                "factual rather than creative"
              ],
              [
                "3. Amount used",
                "a snippet rather than the whole work"
              ],
              [
                "4. Effect on the market",
                "the use does <strong>not</strong> substitute for the original"
              ]
            ]
          }
        },
        {
          "callout": "Training is plausibly <em>transformative</em> — the model wants the idea of a stop sign, not one photographer's exact image — which helps factor 1, and copying for training is already a 'copy' even before any output. But factor 4 is the landmine: even with no verbatim output, an LM can displace the market for writers and artists. Copyright is ultimately about <strong>semantics and economics</strong>, not just memorization.",
          "kind": "insight"
        },
        {
          "callout": "Terms of service stack <em>on top of</em> copyright. A video can be Creative-Commons licensed and still be off-limits because YouTube's ToS forbids downloading it. Clearing copyright (via license or fair use) does not clear ToS — check both.",
          "kind": "pitfall"
        }
      ]
    },
    {
      "id": "corpora",
      "title": "The open-corpus lineage",
      "blocks": [
        {
          "p": "The history of open pretraining data is a story of progressively smarter filtering of (mostly) Common Crawl. Remember each landmark by its <em>one distinguishing move</em>:"
        },
        {
          "table": {
            "head": [
              "Corpus",
              "Year",
              "Base",
              "Key processing",
              "Tokens",
              "Distinguishing move"
            ],
            "rows": [
              [
                "C4",
                "2019",
                "1 CC snapshot",
                "manual heuristic rules",
                "156B",
                "rule-cleaned CC; released the data, trained T5"
              ],
              [
                "The Pile",
                "2021",
                "22 curated domains",
                "per-domain curation; jusText on Pile-CC",
                "~275B",
                "diversity of high-quality domains (EleutherAI)"
              ],
              [
                "RefinedWeb",
                "2023",
                "CC only (WARC+trafilatura)",
                "Gopher rules + MinHash; no ML filter",
                "600B of 5T",
                "'web alone rivals curated'; trained Falcon"
              ],
              [
                "Dolma",
                "2024",
                "many sources",
                "fastText langID, Gopher/C4 rules, Jigsaw toxicity, Bloom dedup",
                "3T",
                "fully open data + toolkit (OLMo)"
              ],
              [
                "FineWeb",
                "2024",
                "95 CC dumps",
                "langID, Gopher/C4/manual rules, MinHash, PII",
                "15T",
                "ablation-driven; largest careful open web corpus"
              ]
            ]
          }
        },
        {
          "p": "<strong>C4</strong> cleaned a single April-2019 snapshot with hand rules: keep lines ending in punctuation with ≥ 5 words, drop pages with &lt; 3 sentences, drop any page containing a 'bad word' or a '<code>{</code>' (no code) or 'lorem ipsum', and keep only langdetect-English at p ≥ 0.99 → 806 GB. <strong>The Pile</strong> instead bet on curated diversity (PubMed, arXiv, Enron emails, StackExchange, GitHub) and re-extracted Pile-CC with jusText."
        },
        {
          "p": "<strong>RefinedWeb</strong> argued web data alone is enough: CommonCrawl-only via trafilatura on WARC, Gopher rules, fuzzy MinHash over 5-grams, and <em>deliberately no</em> ML-based filtering to avoid importing classifier bias. <strong>Dolma</strong> and <strong>FineWeb</strong> are the fully-documented modern web corpora — Dolma leans on Bloom-filter dedup and toxicity filtering; FineWeb scales to 15T tokens with ablation-tested heuristics and MinHash."
        },
        {
          "callout": "The bridge to Lecture 14 is the swing back toward <strong>model-based filtering</strong>. DCLM-baseline trains a fastText classifier (positives = OpenHermes-2.5 + ELI5, negatives = RefinedWeb) and beats heuristic pipelines; Nemotron-CC counters that FineWeb-Edu/DCLM over-filter (~90% dropped) and recovers tokens via classifier ensembling + LLM rephrasing (6.3T). Filtering and dedup are <em>algorithms</em> — that's next lecture.",
          "kind": "connection"
        }
      ]
    }
  ],
  "takeaways": [
    "Data doesn't fall from the sky: live service → raw snapshot → processed text → aggregated dataset, every arrow human labor — and it's the least-disclosed part of open-weight models (competition + copyright liability).",
    "Common Crawl ships WARC (raw HTML) and WET (pre-extracted, lossy text); strong corpora re-extract from WARC with trafilatura/resiliparse because DCLM showed extractor choice alone moves downstream accuracy.",
    "Raw Common Crawl is a 'wasteland' of boilerplate and SEO spam, so curation is a cascade of filters, not a single pass.",
    "Most web text is copyrighted (automatic, low threshold); lawful use needs a license or fair use — and Terms of Service can restrict even Creative-Commons content.",
    "Fair use turns on four factors; training is plausibly transformative (factor 1), but market displacement (factor 4) is the real exposure — copyright is about semantics and economics, not just verbatim copying.",
    "Know each open corpus by its move: C4 = rules, The Pile = curated domains, RefinedWeb = web-only/no-ML, Dolma = open + Bloom dedup, FineWeb = 15T ablation-driven; the trend is back toward model-based filtering (DCLM)."
  ],
  "references": [
    {
      "label": "CS336 Lecture 13 trace (Percy Liang)",
      "url": "https://cs336.stanford.edu/lectures/?trace=lecture_13"
    },
    {
      "label": "Raffel et al. 2020 — C4 / T5",
      "url": "https://arxiv.org/abs/1910.10683"
    },
    {
      "label": "Gao et al. 2020 — The Pile",
      "url": "https://arxiv.org/abs/2101.00027"
    },
    {
      "label": "Penedo et al. 2023 — RefinedWeb",
      "url": "https://arxiv.org/abs/2306.01116"
    },
    {
      "label": "Soldaini et al. 2024 — Dolma",
      "url": "https://arxiv.org/abs/2402.00159"
    },
    {
      "label": "Penedo et al. 2024 — FineWeb",
      "url": "https://arxiv.org/abs/2406.17557"
    },
    {
      "label": "Li et al. 2024 — DataComp-LM (DCLM)",
      "url": "https://arxiv.org/abs/2406.11794"
    },
    {
      "label": "Henderson et al. 2023 — Foundation Models and Fair Use",
      "url": "https://arxiv.org/abs/2303.15715"
    }
  ],
  "quiz": [
    {
      "id": 1,
      "section": "Sources",
      "q": "Common Crawl distributes each page in two formats. What distinguishes WARC from WET?",
      "options": [
        "WARC is the raw HTTP response (headers + HTML); WET is pre-extracted plain text",
        "WARC is the pre-extracted plain text; WET is the raw HTML",
        "WARC is English-only; WET is multilingual",
        "WARC is already deduplicated; WET is not"
      ],
      "answer": 0,
      "explain": "WARC = raw HTTP response (the original HTML). WET = a lossy pre-extracted plain-text view of that page."
    },
    {
      "id": 2,
      "section": "Extraction",
      "q": "Why do RefinedWeb, Pile-CC, and FineWeb re-extract text from WARC instead of using Common Crawl's WET files?",
      "options": [
        "WET files are not publicly available",
        "WET extraction is lossy/low-quality, and DCLM showed the extractor choice alone changes downstream task accuracy",
        "WARC is smaller and faster to download",
        "WET contains only non-English pages"
      ],
      "answer": 1,
      "explain": "WET text is boilerplate-laden and lossy; DCLM demonstrated that the HTML→text extractor by itself shifts benchmark accuracy, so good corpora re-extract from WARC."
    },
    {
      "id": 3,
      "section": "Common Crawl",
      "q": "In web-crawler terminology, the 'politeness policy' governs:",
      "options": [
        "Which pages are worth downloading",
        "How often to revisit a page to detect changes",
        "Respecting robots.txt and not overloading servers",
        "How to merge near-identical URLs"
      ],
      "answer": 2,
      "explain": "Politeness = obey robots.txt and avoid hammering a server. Selection = which pages; re-visit = how often to recheck."
    },
    {
      "id": 4,
      "section": "Common Crawl",
      "q": "Liang calls raw Common Crawl 'a wasteland.' The practical implication is:",
      "options": [
        "It is too small to train modern LMs",
        "It is entirely copyrighted and therefore unusable",
        "It contains only non-English text",
        "It is mostly boilerplate/SEO spam, so heavy filtering is mandatory rather than optional"
      ],
      "answer": 3,
      "explain": "Most pages are nav/ads/spam/boilerplate, so aggressive extraction + filtering is required to recover useful natural language."
    },
    {
      "id": 5,
      "section": "Sources",
      "q": "WebText (used to train GPT-2) used a cheap social signal as a quality proxy. What was it?",
      "options": [
        "Outbound links from Reddit posts with at least 3 karma",
        "Pages with the most inbound Google clicks",
        "Wikipedia 'featured article' status",
        "GitHub repositories with at least 100 stars"
      ],
      "answer": 0,
      "explain": "WebText kept pages linked from Reddit posts with ≥ 3 karma — a cheap human-curation surrogate (8M pages, 40 GB)."
    },
    {
      "id": 6,
      "section": "Sources",
      "q": "BooksCorpus and Books3 were both taken down, but The Pile's Project Gutenberg subset was not. Why is Gutenberg safer?",
      "options": [
        "It is much larger, so no single author can object",
        "Its books are public-domain / copyright-cleared, whereas Books3 came from the shadow library Bibliotik and BooksCorpus violated Smashwords' ToS",
        "Each Gutenberg book is licensed under Creative Commons by its author",
        "It contains only non-fiction, which is not copyrightable"
      ],
      "answer": 1,
      "explain": "Gutenberg only includes copyright-cleared/public-domain books; Books3 was scraped from a shadow library, and BooksCorpus breached Smashwords' terms of service."
    },
    {
      "id": 7,
      "section": "Sources",
      "q": "The Stack git-cloned 137M repositories (51B files) but kept only ~5B files. The two decisive processing steps were:",
      "options": [
        "Language ID and toxicity filtering",
        "Perplexity filtering and PII anonymization",
        "Permissive-license filtering (MIT/Apache) and near-duplicate removal via MinHash + Jaccard",
        "Star-count thresholding and manual review"
      ],
      "answer": 2,
      "explain": "The Stack kept only permissively licensed code and removed near-duplicates with MinHash/Jaccard — license filtering + dedup, the two recurring moves."
    },
    {
      "id": 8,
      "section": "Copyright",
      "q": "Which statement about copyright on web text is correct?",
      "options": [
        "Only registered works are copyrighted, so most web pages are free to use",
        "Copyright protects ideas, so reimplementing an algorithm is infringement",
        "Collections like phone directories are always copyrighted",
        "Protection is automatic upon fixation with a very low threshold — most things on the Internet are copyrighted"
      ],
      "answer": 3,
      "explain": "Copyright attaches automatically on fixation, with a trivially low bar. It protects expression, not ideas; bare collections need creative selection/arrangement to qualify."
    },
    {
      "id": 9,
      "section": "Copyright",
      "q": "There are two lawful ways to use a copyrighted work for training. They are:",
      "options": [
        "Obtain a license, or rely on the fair-use clause",
        "Register it, or wait 75 years",
        "Anonymize it, or deduplicate it",
        "Cite the author, or pay a flat fee"
      ],
      "answer": 0,
      "explain": "Either secure a license ('a promise not to sue') or argue fair use under §107. Citation and dedup do nothing for the copyright question."
    },
    {
      "id": 10,
      "section": "Fair use",
      "q": "Of the four fair-use factors, which poses the greatest legal exposure for LLMs even when no output is verbatim?",
      "options": [
        "Factor 1 — purpose/character (training is arguably transformative)",
        "Factor 4 — effect on the market for the original work",
        "Factor 2 — nature of the work",
        "Factor 3 — amount used"
      ],
      "answer": 1,
      "explain": "Factor 4 (market effect) is the landmine: an LM can displace the market for writers/artists regardless of verbatim copying. Factor 1 actually helps the model (transformative)."
    },
    {
      "id": 11,
      "section": "Licensing",
      "q": "A YouTube video is licensed under Creative Commons. Can you legally download it to train on?",
      "options": [
        "Yes — a CC license overrides everything else",
        "Yes, because training is always fair use",
        "Not necessarily — YouTube's Terms of Service forbid downloading, and ToS stacks on top of the license",
        "No — Creative Commons forbids all machine use"
      ],
      "answer": 2,
      "explain": "Terms of service are independent of copyright. Even a CC-licensed video can be off-limits because YouTube's ToS prohibits downloading it."
    },
    {
      "id": 12,
      "section": "Corpora",
      "q": "What primarily distinguishes C4 from the later web corpora?",
      "options": [
        "It used a model-based quality classifier",
        "It was built entirely from books and arXiv",
        "Its main contribution was MinHash near-duplicate removal",
        "It cleaned a single Common Crawl snapshot with manual heuristic rules — and released the data, not just the scripts"
      ],
      "answer": 3,
      "explain": "C4 = rule-based cleaning (punctuation, bad-words, no '{', langdetect ≥ 0.99) of one CC snapshot, with the dataset itself released."
    },
    {
      "id": 13,
      "section": "Corpora",
      "q": "RefinedWeb's central claim and a deliberate design choice were:",
      "options": [
        "Properly filtered web data alone can rival curated corpora; it deliberately avoided ML-based filtering to dodge classifier bias",
        "Curated domains beat web data; it used heavy model-based filtering",
        "Only non-English web data matters; it filtered out English",
        "WET files suffice; it skipped WARC re-extraction"
      ],
      "answer": 0,
      "explain": "RefinedWeb's thesis was 'web is all you need,' using Gopher rules + MinHash on WARC-extracted text and intentionally no ML filter to avoid bias."
    },
    {
      "id": 14,
      "section": "Corpora",
      "q": "Match each corpus to its notable dedup / curation mechanism:",
      "options": [
        "Dolma → MinHash; FineWeb → Bloom filters",
        "Dolma → Bloom filters; FineWeb → MinHash; The Pile → curated diverse domains",
        "FineWeb → exact 3-sentence spans; Dolma → suffix arrays",
        "RefinedWeb → no dedup; C4 → MinHash"
      ],
      "answer": 1,
      "explain": "Dolma uses Bloom-filter dedup; FineWeb/RefinedWeb use MinHash; The Pile's hallmark is its 22 curated high-quality domains."
    },
    {
      "id": 15,
      "section": "Corpora",
      "q": "FineWeb (2024) is notable for its scale and methodology. Which description is correct?",
      "options": [
        "~156B tokens, a single snapshot, model-based filtering",
        "~275B tokens from 22 curated domains",
        "~15T tokens from 95 Common Crawl dumps, ablation-driven heuristic filtering plus MinHash",
        "~600B tokens, web-only, with no deduplication"
      ],
      "answer": 2,
      "explain": "FineWeb scaled to ~15T tokens over 95 CC dumps using language ID, Gopher/C4/manual rules chosen by ablation, MinHash dedup, and PII anonymization."
    },
    {
      "id": 16,
      "section": "Curation",
      "q": "Why is data the least-disclosed component of open-weight models like Llama 3?",
      "options": [
        "It is too large to describe",
        "It is auto-generated and identical across labs",
        "Regulators forbid disclosing it",
        "Competitive dynamics and copyright liability"
      ],
      "answer": 3,
      "explain": "Labs withhold data details for two reasons: competitive advantage and exposure to copyright litigation."
    }
  ]
});
