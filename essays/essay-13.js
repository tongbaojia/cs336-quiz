/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(13, {
  "read": 2,
  "blocks": [
    {
      "p": "Data does not fall from the sky. A language model's worldview is a pile of HTML somebody scraped, and every token in it is human labor: a live service becomes a raw crawl becomes extracted text becomes a curated corpus, and every arrow is work. Architecture improves with a cleverer kernel. Data is a long-tail grind that only scales with effort."
    },
    {
      "p": "The firehose is Common Crawl — a non-profit crawling the web roughly monthly, ~100 dumps since 2008. Point a model at the raw version and you get a <strong>wasteland</strong>: nav bars, cookie banners, ads, SEO spam, templated boilerplate. Real natural language is a minority of the bytes. No pretraining corpus exists that isn't mostly garbage you haven't deleted yet."
    },
    {
      "p": "Worse, turning a page into text is lossy and unsolved. Common Crawl ships WARC (the raw HTML) and WET (a pre-extracted plain-text view). WET is convenient and bad: the DCLM result is that the <em>extractor alone</em> moves downstream benchmark accuracy, so RefinedWeb, Pile-CC, and FineWeb discard WET and re-extract from WARC. Treat HTML-to-text as a hyperparameter, not plumbing."
    },
    {
      "p": "Then the part no kernel fixes: law. Most of the Internet is copyrighted automatically, at a trivially low bar, so lawful training needs a license or a fair-use argument — and Terms of Service stack on top of that. Books3 and BooksCorpus were both pulled; Project Gutenberg survives because it's copyright-cleared, not because it's clean. Which is why Llama 3 details its architecture and goes nearly silent on data."
    },
    {
      "callout": "The corpus is the model's worldview, and you author it — mostly by deciding what to throw away. Quality is a <strong>cascade</strong> of progressively stricter filters, not one knob: lots of lower-quality web, narrowing toward a little high-quality data. Sourcing, extraction, and legal risk are most of the job; the transformer is the easy part. Data doesn't fall from the sky — you drag it out.",
      "kind": "key"
    }
  ]
});
