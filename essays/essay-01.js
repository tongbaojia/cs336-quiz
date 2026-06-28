/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(1, {
  "read": 2,
  "blocks": [
    {
      "p": "Strip the mystique and a language model is a bet about how to spend money. You have a compute budget and a data budget; accuracy is what you buy with them. The course's whole equation is <strong>accuracy = efficiency × resources</strong> — and everything downstream, from the tokenizer to the one-and-only training epoch, is someone refusing to waste a FLOP."
    },
    {
      "p": "Efficiency feels optional at toy scale and turns existential at the frontier: a 2× inefficiency on a $100M run is $50M set on fire. That is the honest reading of the bitter lesson — not <em>scale is all that matters</em>, but <em>algorithms that scale are what matter</em>."
    },
    {
      "p": "Then, before the model sees a single thing, you must choose its alphabet — and every option is a trap. <strong>Characters</strong>: a 150K-symbol vocabulary, most of it rare junk. <strong>Bytes</strong>: elegant and universal, but a compression ratio of exactly 1, so sequences explode — and attention cost grows with the <em>square</em> of length. <strong>Words</strong>: an unbounded vocabulary and an <code>UNK</code> token that quietly poisons your perplexity."
    },
    {
      "p": "<strong>BPE</strong> refuses to decide up front. Start from raw bytes; repeatedly glue the most frequent adjacent pair into a new symbol. The alphabet is <em>learned</em> from the corpus — common strings collapse to one token, rare ones stay shattered. It is, frankly, a hack. It is also in every frontier model shipped this decade."
    },
    {
      "callout": "The tokenizer is the one component everyone wishes they could delete, and no one has. It is the seam where elegance lost to efficiency — and the rest of the course is that same fight, run again at every layer of the stack.",
      "kind": "insight"
    }
  ]
});
