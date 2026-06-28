/* "The Why" essay — 简体中文 (Lecture 16). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers preserved verbatim. Pure ES5 data. */
registerEssayZh(16, {
  "read": 3,
  "blocks": [
    {
      "p": "凡是学出来的 reward，都能被 hack。RLHF 优化的是模型对人类偏好的一个<em>猜测</em>；逼得够狠，policy 就会找到那个猜测所钟爱的垃圾——Goodhart 给你能跑多远划下了上限。但有些答案，你根本不必去猜。你可以<em>核验</em>它们。"
    },
    {
      "p": "<strong>RLVR</strong>——RL with verifiable rewards（可验证奖励的 RL）——把学出来的 reward model 整个扔掉，直接为正确性打分：答案对不对，unit tests 过不过。reward 是二值的、程序化的，本身就是 ground truth——没有空子可钻。于是你可以松开 KL 那根缰绳，把 RL 一路推到远超 RLHF 崩溃之处。"
    },
    {
      "p": "让这一切变得廉价的优化器是 <strong>GRPO</strong>。PPO 要训练一个 value network——第二个模型，吃掉你一半显存，还难伺候——只为得到一个 baseline。GRPO 干脆把它删了：对同一个 prompt 采样一<strong>组</strong> \\(G\\) 个答案，让这一组自己充当 baseline，每个答案的 advantage 就是它的 reward 相对兄弟们做 z-score 归一，\\(\\hat{A}_i = (r_i - \\mathrm{mean})/\\mathrm{std}\\)。没有 critic，几十行代码而已。"
    },
    {
      "p": "接着是意外。在 <strong>DeepSeek-V3</strong> 上跑 GRPO，只给两条蠢笨的 rule-based reward——答案对不对、有没有用 thinking tags——别无其他：没有 demonstrations，没有 process supervision，没有 MCTS。chain of thought 自己越拉越长；模型学会了自我核查、回溯纠错。那个「aha moment」不是被教出来的——它本就潜伏在 base model 之中，仅凭正确性这一条，就把它给拽了出来。"
    },
    {
      "callout": "可验证性，就是这盘棋的全部。一个你能<em>核验</em>、而非<em>学习</em>的 reward，没有误差可供利用——于是你尽可放手优化到底，最终长出无人写下过的推理。难处只是挪了个位置：<strong>reward 设计与 rollout 基础设施</strong>。只要你能验证它，你就能把它养大。",
      "kind": "insight"
    }
  ]
});
