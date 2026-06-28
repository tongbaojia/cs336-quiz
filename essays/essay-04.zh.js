/* "The Why" essay — 简体中文 (Lecture 4). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(4, {
  "read": 2,
  "blocks": [
    {
      "p": "在 dense transformer 中，每一个参数，都是每个 token 都得为之买单的参数。Mixture-of-Experts 撕毁了这纸合约：把那唯一的 feedforward block 换成 \\(N\\) 个 expert，再配一个只为每个 token 触发 top \\(k\\) 个的微型 router——于是容量随 \\(N\\) 扩展，每个 token 的 FLOPs 却只随 \\(k\\) 扩展。Mixtral 存着 47B 参数，每个 token 却只为其中 13B 结账——大致是 Llama-2-70B 的质量，激活算力却仅为五分之一。"
    },
    {
      "p": "这场赌注很简单：<strong>容量便宜，算力昂贵</strong>。参数耗的是显存，而显存是论机架买的；FLOPs 耗的是每一次 forward pass 关键路径上实打实的时间。MoE 花掉便宜的那种资源，去省下昂贵的那种——这些知识，token 用得着时尽可查阅，却不必让每个 token 都掏钱把它跑一遍。"
    },
    {
      "p": "天下没有免费的午餐。top-\\(k\\) 这个选择不可微；一旦放任不管，router 就会坍缩到少数几个偏爱的 expert 身上，其余的则被活活饿死。于是你硬塞进一个启发式：一个 auxiliary loss，把每个 expert 的硬负载乘上它的软概率，再把那些被过度选中的压下去。RL 才是原理上干净的解法，可 gradient variance 葬送了它。前沿就靠一个 load-balancing 的 hack 在运转——一如它靠一个 tokenizer 的 hack 在运转。"
    },
    {
      "p": "而这些 expert 散落在一张张 GPU 上。如今每一层都要把每个 token 发往它那位 expert 所在的设备，再把输出收集回来——两次 all-to-all collective，受带宽制约，只要有一个 expert 过载，就会当场卡死。显存也从不缩水：全部 \\(N\\) 个 expert 都常驻其中，所以一个「47B」的 MoE 依旧要吞下 47B 份量的 HBM。你省下的是 FLOPs，从来不是显存占用。"
    },
    {
      "callout": "MoE 是一顿免费的午餐，却附着一张系统账单。你不再支付的那些 FLOPs，会以通信、显存、以及一个为求均衡而与你的 loss 较劲的训练目标的形式，悉数回到账上。前沿实验室照付不误——DeepSeek-V3 扛着 671B 参数，算起来却像 37B。最便宜的参数，就是那个你永远不必运行的参数。",
      "kind": "insight"
    }
  ]
});
