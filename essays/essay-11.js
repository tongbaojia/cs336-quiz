/* CS336 Companion essay (math: \(..\)/\[..\]; $ is literal). */
registerEssay(11, {
  "read": 2,
  "blocks": [
    {
      "p": "Chinchilla hands you the optimal parameter/token split, then walks out before the hard part: what width, what learning rate, what batch — and how to afford the sweep that answers them. It was the last fully public recipe (2022); everything since is the engineering layer the labs actually run."
    },
    {
      "p": "First, hyperparameters drift with scale, and you cannot tune at the target size. <strong>μP</strong> rescales init and per-layer LR so activations and their post-step changes both stay \\(\\Theta(1)\\) at every width — pinning the optimal learning rate in place. Tune on a narrow proxy, transfer it zero-shot to a far wider model. It only governs width, so RMSNorm gains and strong weight decay still break it; trust it as a prior, verify one size up."
    },
    {
      "p": "Second, Chinchilla assumes infinite fresh tokens; real corpora run dry. The data-constrained law says repetition is nearly free up to ~4 epochs, then decays fast and saturates by ~16. So past one epoch you stop counting raw tokens and feed <em>effective</em> data into the formula — otherwise your extrapolation is optimistic fiction."
    },
    {
      "p": "Third, the punch. Chinchilla minimizes <em>training</em> compute, but a shipped model's lifetime bill is <em>inference</em>. Add the serving term and the optimum slides to smaller \\(N\\), more tokens. Hence Llama-3 8B on 15T tokens — ~1875 per parameter against Chinchilla's 20, nearly 100× 'past optimal.' Wasteful to train; rational to serve a billion times."
    },
    {
      "callout": "20:1 was never a law — it is the training-compute optimum, full stop. Tune small and transfer, recycle data to a few epochs, over-train on purpose: every departure from textbook Chinchilla is a lab optimizing the cost it will actually pay. So state the objective before you call a model 'optimal.'",
      "kind": "insight"
    }
  ]
});
