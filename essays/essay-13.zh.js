/* "The Why" essay — 简体中文 (Lecture 13, data curation). 信达雅: technical terms kept in English;
   math \(..\), <code>/<strong>/<em>, numbers and $amounts preserved verbatim. Pure ES5 data. */
registerEssayZh(13, {
  "read": 2,
  "blocks": [
    {
      "p": "数据不会从天而降。语言模型的世界观，不过是某人抓取下来的一堆 HTML，而其中每一个 token 都是人力的产物：一个在线服务先变成原始 crawl，再变成抽取后的文本，再变成精心整理的语料——每一个箭头背后都是活儿。架构，靠一个更巧妙的 kernel 就能改进；数据，却是一场只随投入而扩展的长尾苦工。"
    },
    {
      "p": "那根喷涌的消防水管，就是 Common Crawl——一家非营利组织，大约每月爬一遍网络，自 2008 年以来累计约 100 份 dump。把模型直接对准它的原始版本，你得到的是一片<strong>荒原</strong>：导航栏、cookie 横幅、广告、SEO 垃圾、模板化的样板文字。真正的自然语言，只占其中字节的少数。没有哪个 pretraining 语料不是这样：它的绝大部分，都是你还没来得及删掉的垃圾。"
    },
    {
      "p": "更糟的是，把一个网页变成文本，这事既有损、又悬而未决。Common Crawl 同时提供 WARC（原始 HTML）与 WET（预先抽取好的纯文本视图）。WET 方便，却也糟糕：DCLM 的结论是，<em>单单是抽取器本身</em>就足以撬动下游 benchmark 的准确率，所以 RefinedWeb、Pile-CC 和 FineWeb 索性弃用 WET，转而从 WARC 重新抽取。请把 HTML-to-text 当成一个 hyperparameter，而不是不值一提的管道杂活。"
    },
    {
      "p": "接下来是任何 kernel 都修不好的那部分：法律。互联网上的绝大多数内容，都以低到近乎可笑的门槛自动享有版权，于是合法的训练要么需要一纸 license，要么需要一套 fair-use（合理使用）的论证——而 Terms of Service（服务条款）还要再叠加在这之上。Books3 和 BooksCorpus 双双被下架；Project Gutenberg 之所以幸存，是因为它的版权已被厘清，而不是因为它干净。这也正是为什么：Llama 3 把架构讲得事无巨细，一谈到数据却几乎噤声。"
    },
    {
      "callout": "语料就是模型的世界观，而它由你来撰写——而且大半是靠「决定扔掉什么」写就的。质量从来不是一个旋钮，而是一道逐级收紧的过滤器<strong>级联</strong>：起点是海量较低质量的网页，一路收窄，直到末端那一小撮高质量数据。寻源、抽取、法律风险，才是这份工作的大头；transformer 反倒是最轻松的部分。数据不会从天而降——是你把它一点一点拖出来的。",
      "kind": "key"
    }
  ]
});
