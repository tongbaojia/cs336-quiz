/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(9, {
  "read": 2,
  "blocks": [
    {
      "p": "Loss falls as a <strong>power law</strong> in compute — a straight line on a log–log plot. That single empirical fact is worth more than it looks, because a straight line is something you can <em>extrapolate</em>. Fit it on a handful of cheap small runs and you can predict the loss of a model you have not trained, and cannot afford to train twice."
    },
    {
      "p": "The honest form keeps a floor: \\(L(X) = L_{\\infty} + (X_0/X)^{\\alpha}\\), where \\(L_{\\infty}\\) is the irreducible loss — the entropy the model can never beat. Omit it and you read a too-optimistic slope off the high-resource tail. The exponent \\(\\alpha\\) is small (slopes like \\(-0.05\\)), far gentler than the \\(1/n\\) rate of a textbook estimator; it likely tracks the data's intrinsic dimension."
    },
    {
      "p": "Now spend the curve. The identity \\(C \\approx 6ND\\) ties compute to parameters and tokens, so a fixed budget forces a choice: one big undertrained model, or a smaller one fed more data? Kaplan said pour compute into size. Chinchilla refit — after fixing a learning-rate-schedule bug that had quietly handicapped the short runs — and found you must grow both together."
    },
    {
      "p": "The result is the most-quoted number in the field: with \\(N^{*}\\) and \\(D^{*}\\) both scaling as \\(C^{0.5}\\), the optimal tokens-per-parameter ratio is <em>scale-invariant</em> — about 20, across three orders of magnitude. Hence <strong>\\(D^{*} \\approx 20\\,N^{*}\\)</strong>: balance the model and the data, don't starve either one."
    },
    {
      "callout": "The deeper move is economic. Scaling laws don't make the big run cheaper — they make it <em>predictable</em>, converting an irreversible one-shot bet into a regression you derisk for the price of a few small runs. You buy the prediction before you spend the money — just don't trust the line past where you measured it.",
      "kind": "insight"
    }
  ]
});
